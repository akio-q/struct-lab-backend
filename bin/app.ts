#!/usr/bin/env node
import { App } from 'aws-cdk-lib';

import { StructLabStack } from '../lib/struct-lab-stack';

const app = new App();

new StructLabStack(app, 'StructLabBackendStack', {
  description: 'StructLab backend: HTTP API and Lambda functions',
});
