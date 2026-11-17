#!/usr/bin/env node
import { App } from 'aws-cdk-lib';

import {
  assertDeploymentTarget,
  assertValidCorsOrigins,
  DEV_ENVIRONMENT,
} from '../lib/environments';
import { StructLabStack } from '../lib/struct-lab-stack';

assertDeploymentTarget(DEV_ENVIRONMENT);
assertValidCorsOrigins(DEV_ENVIRONMENT.corsAllowedOrigins);

const app = new App();

new StructLabStack(app, 'StructLabBackendStack', {
  environment: DEV_ENVIRONMENT,
  description: 'StructLab backend (dev): HTTP API and Lambda functions',
});
