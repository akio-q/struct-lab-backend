import { describe, expect, it } from 'vitest';

import {
  assertDeploymentTarget,
  DEV_ENVIRONMENT,
} from '../lib/environments';

const DEV_PROCESS_ENV: NodeJS.ProcessEnv = {
  CDK_DEFAULT_ACCOUNT: '677339799150',
  CDK_DEFAULT_REGION: 'eu-north-1',
};

describe('dev environment configuration', () => {
  it('pins the intended account, region, stack name, and tags', () => {
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
