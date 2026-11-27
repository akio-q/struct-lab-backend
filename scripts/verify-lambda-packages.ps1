[CmdletBinding()]
param(
  [switch]$RequireNode22
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

$repoRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$lambdaRoot = [IO.Path]::GetFullPath(
  (Join-Path (Join-Path $repoRoot 'dist') 'lambda')
)

$repoPrefix = $repoRoot.TrimEnd([char[]]@('\', '/')) +
  [IO.Path]::DirectorySeparatorChar
if (-not $lambdaRoot.StartsWith(
  $repoPrefix,
  [StringComparison]::OrdinalIgnoreCase
)) {
  throw "Refusing to verify Lambda packages outside the repository: $lambdaRoot"
}
if (
  (Split-Path -Leaf $lambdaRoot) -ne 'lambda' -or
  (Split-Path -Leaf (Split-Path -Parent $lambdaRoot)) -ne 'dist'
) {
  throw "Refusing to verify an unexpected path: $lambdaRoot"
}
if (-not (Test-Path -LiteralPath $lambdaRoot -PathType Container)) {
  throw "Lambda output directory not found: $lambdaRoot. Run pnpm package:lambdas first."
}

function Get-NodeMajorVersion {
  param([Parameter(Mandatory = $true)][string]$NodePath)

  $version = (& $NodePath --version).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Node.js version check failed for $NodePath with exit code $LASTEXITCODE."
  }
  if ($version -notmatch '^v?(\d+)\.') {
    throw "Could not determine the Node.js major version from '$version'."
  }

  return [int]$Matches[1]
}

$currentNode = (Get-Command node -ErrorAction Stop).Source
$currentNodeMajor = Get-NodeMajorVersion -NodePath $currentNode

$node22Candidates = @()
if (-not [string]::IsNullOrWhiteSpace($env:NODE22_BINARY)) {
  $node22Candidates += $env:NODE22_BINARY
}
foreach ($commandName in @('node22', 'nodejs22')) {
  $command = Get-Command $commandName -ErrorAction SilentlyContinue
  if ($null -ne $command) {
    $node22Candidates += $command.Source
  }
}
$node22Candidates += @(
  'C:\Program Files\nodejs22\node.exe',
  'C:\Program Files\nodejs-22\node.exe'
)

$node22 = $null
foreach ($candidate in $node22Candidates) {
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    continue
  }
  if ((Get-NodeMajorVersion -NodePath $candidate) -eq 22) {
    $node22 = [IO.Path]::GetFullPath($candidate)
    break
  }
}

if ($RequireNode22 -and $null -eq $node22) {
  throw 'RequireNode22 was specified, but no local Node.js 22 binary was found.'
}

$runtimeNode = if ($null -ne $node22) { $node22 } else { $currentNode }
$runtimeMajor = Get-NodeMajorVersion -NodePath $runtimeNode

if ($null -eq $node22) {
  Write-Warning (
    "No local Node.js 22 binary was found. Smoke tests will run under " +
    "Node.js $(& $runtimeNode --version). Node.js 22 runtime compatibility " +
    'remains unverified.'
  )
}

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) (
  'structlab-lambda-verify-' + [Guid]::NewGuid().ToString('N')
)
$tempRoot = [IO.Path]::GetFullPath($tempRoot)
if ($tempRoot.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to create verification files inside the repository: $tempRoot"
}

$guardPath = Join-Path $tempRoot 'network-guard.cjs'
$runnerPath = Join-Path $tempRoot 'smoke-runner.cjs'
$previousTableName = $env:STUDENTS_TABLE_NAME

try {
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

  $guardScript = @'
'use strict';

const path = require('node:path');

// Child-process environment only: never expose the real AWS profile or
// credentials to the bundle. The parent PowerShell environment is untouched.
for (const name of Object.keys(process.env)) {
  if (name.toUpperCase().startsWith('AWS_')) {
    delete process.env[name];
  }
}
process.env.AWS_SHARED_CREDENTIALS_FILE = path.join(
  __dirname,
  'no-shared-credentials',
);
process.env.AWS_CONFIG_FILE = path.join(__dirname, 'no-aws-config');
process.env.AWS_EC2_METADATA_DISABLED = 'true';

const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');

const block = (operation) => {
  throw new Error('NETWORK_BLOCKED: ' + operation + ' is not allowed');
};

net.Socket.prototype.connect = function () {
  block('net.Socket.connect');
};
net.connect = function () {
  block('net.connect');
};
net.createConnection = function () {
  block('net.createConnection');
};

for (const method of ['lookup', 'resolve', 'resolve4', 'resolve6']) {
  if (typeof dns[method] === 'function') {
    dns[method] = function () {
      block('dns.' + method);
    };
  }
  if (dns.promises && typeof dns.promises[method] === 'function') {
    dns.promises[method] = function () {
      block('dns.promises.' + method);
    };
  }
}

http.request = function () {
  block('http.request');
};
http.get = function () {
  block('http.get');
};
https.request = function () {
  block('https.request');
};
https.get = function () {
  block('https.get');
};
tls.connect = function () {
  block('tls.connect');
};

if (typeof globalThis.fetch === 'function') {
  globalThis.fetch = function () {
    block('fetch');
  };
}
if (typeof globalThis.WebSocket === 'function') {
  globalThis.WebSocket = function () {
    block('WebSocket');
  };
}
'@
  Set-Content -LiteralPath $guardPath -Value $guardScript -Encoding ascii

  $runnerScript = @'
'use strict';

const bundlePath = process.argv[2];
const testName = process.argv[3];

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const createEvent = (overrides = {}) => ({
  body: undefined,
  isBase64Encoded: false,
  headers: { 'content-type': 'application/json' },
  queryStringParameters: undefined,
  ...overrides,
});

const createAuthorizedEvent = (claims) => {
  const event = createEvent();

  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: {
        jwt: {
          claims,
          scopes: [],
        },
      },
    },
  };
};

const parseBody = (response) => {
  assert(typeof response.body === 'string', 'response body is not a string');

  return JSON.parse(response.body);
};

const run = async () => {
  assert(typeof bundlePath === 'string' && bundlePath.length > 0, 'bundle path is missing');
  assert(typeof testName === 'string' && testName.length > 0, 'test name is missing');

  if (testName === 'guard') {
    let blocked = false;
    try {
      require('node:net').connect(80, '192.0.2.1');
    } catch (error) {
      blocked =
        typeof error.message === 'string' &&
        error.message.includes('NETWORK_BLOCKED');
    }
    assert(blocked, 'network guard did not block an outbound connection');

    const allowedAwsKeys = new Set([
      'AWS_CONFIG_FILE',
      'AWS_EC2_METADATA_DISABLED',
      'AWS_SHARED_CREDENTIALS_FILE',
    ]);
    const remainingAwsKeys = Object.keys(process.env).filter((name) =>
      name.toUpperCase().startsWith('AWS_'),
    );
    assert(
      remainingAwsKeys.every((name) => allowedAwsKeys.has(name)),
      'AWS credential environment variables were not sanitized',
    );

    return { test: testName, blocked: true, awsEnvSanitized: true };
  }

  const bundle = require(bundlePath);
  assert(
    typeof bundle.handler === 'function',
    'bundle does not export a function named handler',
  );

  if (testName === 'exports') {
    return { test: testName, handler: 'function' };
  }

  let response;

  if (testName === 'health') {
    response = await bundle.handler();
    assert(response.statusCode === 200, 'health status must be 200');

    const body = parseBody(response);
    assert(body.status === 'ok', 'health status field must be ok');
    assert(
      body.service === 'struct-lab-backend',
      'health service must be struct-lab-backend',
    );
  } else if (testName === 'create-student-unsupported-content-type') {
    assert(
      typeof process.env.STUDENTS_TABLE_NAME === 'string' &&
        process.env.STUDENTS_TABLE_NAME.length > 0,
      'STUDENTS_TABLE_NAME must be set for the create-student smoke test',
    );

    response = await bundle.handler(
      createEvent({
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify({ fullName: 'Verification Student', group: 'VERIFY-01' }),
      }),
    );
    assert(
      response.statusCode === 415,
      'create-student status must be 415 for an unsupported content type',
    );
  } else if (testName === 'list-students-unauthenticated') {
    response = await bundle.handler(createEvent());
    assert(
      response.statusCode === 401,
      'list-students status must be 401 without authorization',
    );
    assert(
      parseBody(response).error === 'Unauthorized',
      'list-students 401 body must be Unauthorized',
    );
  } else if (testName === 'list-students-non-teacher') {
    response = await bundle.handler(
      createAuthorizedEvent({
        token_use: 'access',
        'cognito:groups': ['students'],
      }),
    );
    assert(
      response.statusCode === 403,
      'list-students status must be 403 without the teachers group',
    );
    assert(
      parseBody(response).error === 'Forbidden',
      'list-students 403 body must be Forbidden',
    );
  } else {
    throw new Error('Unknown smoke test: ' + testName);
  }

  return {
    test: testName,
    statusCode: response.statusCode,
    body: parseBody(response),
  };
};

run()
  .then((result) => {
    console.log(
      'SMOKE_OK ' +
        JSON.stringify(result, (_key, value) =>
          typeof value === 'string' && value.length > 200
            ? value.slice(0, 200) + '...'
            : value,
        ),
    );
  })
  .catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
'@
  Set-Content -LiteralPath $runnerPath -Value $runnerScript -Encoding ascii

  $env:STUDENTS_TABLE_NAME = 'structlab-verification-local-table'

  $packages = @(
    [pscustomobject]@{
      Name = 'health'
      Tests = @('health')
    },
    [pscustomobject]@{
      Name = 'create-student'
      Tests = @('create-student-unsupported-content-type')
    },
    [pscustomobject]@{
      Name = 'list-students'
      Tests = @('list-students-unauthenticated', 'list-students-non-teacher')
    }
  )

  Write-Host "Runtime Node.js: $(& $runtimeNode --version) ($runtimeNode)"
  Write-Host 'Network access is blocked for all smoke-test processes.'
  Write-Host 'AWS credential and profile environment variables are removed from smoke-test processes.'

  & $runtimeNode --require $guardPath $runnerPath 'unused' 'guard'
  if ($LASTEXITCODE -ne 0) {
    throw "Network guard self-check failed with exit code $LASTEXITCODE."
  }
  Write-Host 'Network guard self-check: PASS'
  Write-Host ''

  $smokeResults = @()

  foreach ($package in $packages) {
    $zipPath = [IO.Path]::GetFullPath(
      (Join-Path $lambdaRoot ($package.Name + '.zip'))
    )
    if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf)) {
      throw "Archive not found: $zipPath"
    }

    $zipItem = Get-Item -LiteralPath $zipPath
    if ($zipItem.Length -le 0) {
      throw "Archive is empty: $zipPath"
    }

    $archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
      $entries = @($archive.Entries)
      if ($entries.Count -ne 1) {
        throw "Archive $zipPath must contain exactly one entry; found $($entries.Count)."
      }

      $entry = $entries[0]
      if ($entry.FullName -ne 'index.js') {
        throw "Archive $zipPath must contain index.js at its root; found '$($entry.FullName)'."
      }
      if (
        $entry.Name -ne 'index.js' -or
        $entry.FullName.Contains('/') -or
        $entry.FullName.Contains('\') -or
        $entry.Length -le 0
      ) {
        throw "Archive $zipPath contains an unexpected or empty entry."
      }

      $extractDirectory = Join-Path $tempRoot $package.Name
      New-Item -ItemType Directory -Path $extractDirectory -Force | Out-Null
      $extractedPath = Join-Path $extractDirectory 'index.js'
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile(
        $entry,
        $extractedPath,
        $false
      )
    }
    finally {
      $archive.Dispose()
    }

    $extracted = Get-Item -LiteralPath $extractedPath
    if ($extracted.Length -le 0) {
      throw "Extracted bundle is empty: $extractedPath"
    }

    Write-Host ("Archive {0}: {1} bytes, entries: index.js" -f $package.Name, $zipItem.Length)

    & $runtimeNode --require $guardPath $runnerPath $extractedPath 'exports'
    if ($LASTEXITCODE -ne 0) {
      throw "Handler export verification failed for $($package.Name) with exit code $LASTEXITCODE."
    }
    Write-Host ("  handler export: PASS")

    foreach ($testName in $package.Tests) {
      & $runtimeNode --require $guardPath $runnerPath $extractedPath $testName
      if ($LASTEXITCODE -ne 0) {
        throw "Smoke test '$testName' failed for $($package.Name) with exit code $LASTEXITCODE."
      }

      $smokeResults += [pscustomobject]@{
        Package = $package.Name
        Test = $testName
      }
    }
  }

  Write-Host ''
  Write-Host ("All {0} smoke tests passed under Node.js {1}." -f $smokeResults.Count, $runtimeMajor)
  Write-Host ("Node.js 22 binary used: {0}" -f ($null -ne $node22))
}
finally {
  if ($null -eq $previousTableName) {
    Remove-Item Env:\STUDENTS_TABLE_NAME -ErrorAction SilentlyContinue
  }
  else {
    $env:STUDENTS_TABLE_NAME = $previousTableName
  }

  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
