import { join } from 'node:path';

import { CfnOutput, Duration, Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Construct } from 'constructs';

/**
 * Core infrastructure for StructLab:
 * - one Lambda function with the GET /health handler;
 * - one API Gateway HTTP API that exposes the function.
 *
 * DynamoDB and Cognito will be added in the next phase.
 */
export class StructLabStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const healthFunction = new NodejsFunction(this, 'HealthFunction', {
      description: 'Health check handler for the StructLab backend',
      entry: join(__dirname, '..', 'src', 'handlers', 'health.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      memorySize: 128,
      timeout: Duration.seconds(5),
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
      },
    });

    const httpApi = new HttpApi(this, 'HttpApi', {
      apiName: 'struct-lab-http-api',
      description: 'HTTP API for the StructLab backend',
    });

    httpApi.addRoutes({
      path: '/health',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('HealthIntegration', healthFunction),
    });

    new CfnOutput(this, 'HttpApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'Base URL of the StructLab HTTP API',
    });
  }
}
