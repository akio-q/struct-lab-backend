/**
 * Deployment environments for StructLab.
 *
 * The dev environment is intentionally pinned here. `bin/app.ts` passes this
 * configuration to the stack, and `StructLabStack` derives its CloudFormation
 * environment from it. Change this file only together with an explicit
 * deployment decision; do not read account/region from ad-hoc shell variables.
 */
export type EnvironmentName = 'dev';

export interface StructLabEnvironment {
  readonly name: EnvironmentName;
  readonly account: string;
  readonly region: string;
  readonly stackName: string;
  readonly tags: Readonly<Record<string, string>>;
  /**
   * Exact browser origins allowed to call the HTTP API. No wildcards. Local
   * Next.js development uses plain HTTP on localhost; deployed frontends must
   * use HTTPS. Validated by `assertValidCorsOrigins` before synthesis.
   */
  readonly corsAllowedOrigins: readonly string[];
}

export const DEV_ENVIRONMENT: StructLabEnvironment = {
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
};

const ALLOWED_CORS_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Validates the CORS origin allowlist before synthesis.
 *
 * API Gateway matches origins exactly, so the allowlist must contain canonical
 * browser origins: no wildcards, trailing slashes, paths, query strings,
 * fragments, or embedded credentials. HTTPS is required for every host except
 * local development on `localhost`.
 *
 * Validation errors intentionally omit the rejected value so embedded
 * credentials or other sensitive URL contents never reach logs.
 */
export const assertValidCorsOrigins = (
  origins: readonly string[],
): void => {
  if (origins.length === 0) {
    throw new Error('CORS allowed origins must not be empty.');
  }

  const seen = new Set<string>();

  for (const origin of origins) {
    if (origin.includes('*')) {
      throw new Error('CORS origin must not contain a wildcard.');
    }

    if (origin === '' || origin.trim() !== origin) {
      throw new Error('CORS origin must not be blank or padded.');
    }

    if (origin.endsWith('/')) {
      throw new Error('CORS origin must not end with a trailing slash.');
    }

    let parsed: URL;

    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('CORS origin must be a valid absolute URL.');
    }

    if (!ALLOWED_CORS_PROTOCOLS.has(parsed.protocol)) {
      throw new Error('CORS origin must use http or https.');
    }

    if (parsed.protocol === 'http:' && parsed.hostname !== 'localhost') {
      throw new Error('CORS origin must use https unless it is localhost.');
    }

    if (parsed.username !== '' || parsed.password !== '') {
      throw new Error('CORS origin must not contain credentials.');
    }

    if (parsed.pathname !== '/') {
      throw new Error('CORS origin must not contain a path.');
    }

    if (parsed.search !== '') {
      throw new Error('CORS origin must not contain a query string.');
    }

    if (parsed.hash !== '') {
      throw new Error('CORS origin must not contain a fragment.');
    }

    if (parsed.origin !== origin) {
      throw new Error('CORS origin must use its canonical lowercase form.');
    }

    const normalized = origin.toLowerCase();

    if (seen.has(normalized)) {
      throw new Error('CORS origin is duplicated.');
    }

    seen.add(normalized);
  }
};

const normalize = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
};

/**
 * Fails before synthesis when the CDK CLI has resolved credentials for a
 * different account or region.
 *
 * CDK sets `CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION` from the active
 * credentials/profile. Without credentials, `CDK_DEFAULT_ACCOUNT` is absent and
 * local synthesis must remain possible, so the check is only enforced after an
 * account has been resolved. `AWS_REGION`/`AWS_DEFAULT_REGION` are used as a
 * region fallback because they also influence the AWS CLI target.
 */
export const assertDeploymentTarget = (
  environment: StructLabEnvironment,
  env: NodeJS.ProcessEnv = process.env,
): void => {
  const resolvedAccount = normalize(env.CDK_DEFAULT_ACCOUNT);

  // Credential-free `cdk synth` does not resolve an account. The stack still
  // pins the target via its explicit `env`, so local synthesis is safe.
  if (resolvedAccount === undefined) {
    return;
  }

  if (resolvedAccount !== environment.account) {
    throw new Error(
      `Refusing to synthesize StructLab ${environment.name} for AWS account ` +
        `${resolvedAccount}; expected ${environment.account}. ` +
        'Use the structlab-dev profile or matching credentials.',
    );
  }

  const resolvedRegion =
    normalize(env.CDK_DEFAULT_REGION) ??
    normalize(env.AWS_REGION) ??
    normalize(env.AWS_DEFAULT_REGION);

  if (resolvedRegion !== undefined && resolvedRegion !== environment.region) {
    throw new Error(
      `Refusing to synthesize StructLab ${environment.name} for AWS region ` +
        `${resolvedRegion}; expected ${environment.region}. ` +
        'Use the structlab-dev profile or matching credentials.',
    );
  }
};
