import { describe, expect, it } from 'vitest';

import {
  assertDeploymentTarget,
  assertValidCorsOrigins,
  DEV_ENVIRONMENT,
} from '../lib/environments';

const DEV_PROCESS_ENV: NodeJS.ProcessEnv = {
  CDK_DEFAULT_ACCOUNT: '677339799150',
  CDK_DEFAULT_REGION: 'eu-north-1',
};

describe('dev environment configuration', () => {
  it('pins the intended account, region, stack name, tags, and CORS allowlist', () => {
    expect(DEV_ENVIRONMENT).toEqual({
      name: 'dev',
      account: '677339799150',
      region: 'eu-north-1',
      stackName: 'StructLabBackendStack-dev',
      tags: {
        Project: 'StructLab',
        Service: 'struct-lab-backend',
        Environment: 'dev',
        ManagedBy: 'AWS CDK',
      },
      corsAllowedOrigins: ['http://localhost:3000'],
    });
  });

  it('accepts a matching resolved AWS target', () => {
    expect(() =>
      assertDeploymentTarget(DEV_ENVIRONMENT, DEV_PROCESS_ENV),
    ).not.toThrow();
  });

  it('allows credential-free local synthesis', () => {
    expect(() => assertDeploymentTarget(DEV_ENVIRONMENT, {})).not.toThrow();
  });

  it('rejects a resolved account that differs from the pinned dev account', () => {
    expect(() =>
      assertDeploymentTarget(DEV_ENVIRONMENT, {
        CDK_DEFAULT_ACCOUNT: '123456789012',
        CDK_DEFAULT_REGION: 'eu-north-1',
      }),
    ).toThrow(/expected 677339799150/);
  });

  it('rejects a resolved region that differs from the pinned dev region', () => {
    expect(() =>
      assertDeploymentTarget(DEV_ENVIRONMENT, {
        CDK_DEFAULT_ACCOUNT: '677339799150',
        CDK_DEFAULT_REGION: 'us-east-1',
      }),
    ).toThrow(/expected eu-north-1/);
  });

  it('uses AWS_REGION as a region fallback after an account is resolved', () => {
    expect(() =>
      assertDeploymentTarget(DEV_ENVIRONMENT, {
        CDK_DEFAULT_ACCOUNT: '677339799150',
        AWS_REGION: 'us-east-1',
      }),
    ).toThrow(/expected eu-north-1/);
  });

  it('does not reject a default region when no account was resolved', () => {
    expect(() =>
      assertDeploymentTarget(DEV_ENVIRONMENT, {
        CDK_DEFAULT_REGION: 'us-east-1',
      }),
    ).not.toThrow();
  });
});

describe('CORS origin validation', () => {
  it('accepts the approved Next.js localhost origin', () => {
    expect(DEV_ENVIRONMENT.corsAllowedOrigins).toEqual([
      'http://localhost:3000',
    ]);
    expect(() =>
      assertValidCorsOrigins(DEV_ENVIRONMENT.corsAllowedOrigins),
    ).not.toThrow();
  });

  it('accepts HTTPS origins and HTTP localhost origins', () => {
    expect(() =>
      assertValidCorsOrigins([
        'https://struct-lab.example.com',
        'https://app.example.com:8443',
        'http://localhost:5173',
      ]),
    ).not.toThrow();
  });

  it('rejects an empty allowlist', () => {
    expect(() => assertValidCorsOrigins([])).toThrow(
      /CORS allowed origins must not be empty/,
    );
  });

  it('rejects duplicate origins', () => {
    expect(() =>
      assertValidCorsOrigins([
        'http://localhost:3000',
        'http://localhost:3000',
      ]),
    ).toThrow(/CORS origin is duplicated/);
  });

  it.each(['*', 'https://*.example.com'])(
    'rejects wildcard origin %j',
    (origin) => {
      expect(() => assertValidCorsOrigins([origin])).toThrow(
        /must not contain a wildcard/,
      );
    },
  );

  it.each([
    ['trailing slash', 'https://struct-lab.example.com/'],
    ['path', 'https://struct-lab.example.com/app'],
    ['query string', 'https://struct-lab.example.com?tenant=1'],
    ['fragment', 'https://struct-lab.example.com#app'],
    ['credentials', 'https://teacher:secret@struct-lab.example.com'],
  ])('rejects an origin with %s', (_caseName, origin) => {
    expect(() => assertValidCorsOrigins([origin])).toThrow();
  });

  it('does not expose embedded credentials in validation errors', () => {
    const username = 'cors-user-sentinel';
    const password = 'cors-pass-sentinel';
    const origin = `https://${username}:${password}@struct-lab.example.com`;
    let message = '';

    try {
      assertValidCorsOrigins([origin]);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('must not contain credentials');
    for (const sensitiveValue of [username, password, origin]) {
      expect(message).not.toContain(sensitiveValue);
    }
  });

  it('rejects plain HTTP for non-localhost hosts', () => {
    expect(() =>
      assertValidCorsOrigins(['http://struct-lab.example.com']),
    ).toThrow(/must use https unless it is localhost/);
  });

  it.each([
    'ftp://struct-lab.example.com',
    'ws://localhost:3000',
    'localhost:3000',
  ])('rejects unsupported origin %j', (origin) => {
    expect(() => assertValidCorsOrigins([origin])).toThrow();
  });

  it('rejects non-canonical origins such as default ports and uppercase hosts', () => {
    expect(() =>
      assertValidCorsOrigins(['https://struct-lab.example.com:443']),
    ).toThrow(/canonical lowercase form/);
    expect(() =>
      assertValidCorsOrigins(['HTTPS://STRUCT-LAB.EXAMPLE.COM']),
    ).toThrow(/canonical lowercase form/);
  });
});
