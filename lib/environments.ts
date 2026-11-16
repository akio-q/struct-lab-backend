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
