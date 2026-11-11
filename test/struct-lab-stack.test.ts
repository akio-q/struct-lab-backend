import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';

import { StructLabStack } from '../lib/struct-lab-stack';

describe('StructLabStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new StructLabStack(app, 'TestStack');

    template = Template.fromStack(stack);
  }, 30_000);

  it('creates exactly one Node.js Lambda function', () => {
    template.resourceCountIs('AWS::Lambda::Function', 1);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Handler: 'index.handler',
      MemorySize: 128,
      Timeout: 5,
    });
  });

  it('creates an HTTP API with the GET /health route', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      ProtocolType: 'HTTP',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /health',
    });
  });

  it('exposes the API URL as a stack output', () => {
    expect(template.findOutputs('*')).toHaveProperty('HttpApiUrl');
  });
});
