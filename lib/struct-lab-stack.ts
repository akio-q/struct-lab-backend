import { join } from 'node:path';

import {
  Annotations,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
} from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import {
  AttributeType,
  BillingMode,
  Table,
  TableEncryption,
} from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Construct } from 'constructs';

const lambdaBundling = {
  minify: true,
  sourceMap: true,
  target: 'node22',
  bundleAwsSDK: true,
} as const;

/**
 * Core infrastructure for StructLab:
 * - DynamoDB table for students;
 * - Lambda for GET /health (public);
 * - Lambda for POST /students (public in Phase 2);
 * - Lambda for GET /admin/students (exists, but is intentionally not routed
 *   through API Gateway until Cognito is added in Phase 3).
 */
export class StructLabStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const studentsTable = new Table(this, 'StudentsTable', {
      partitionKey: {
        name: 'studentId',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      // Learning environment only: deletion protection is off and the table
      // is removed together with the stack. Never use this in production.
      deletionProtection: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    Annotations.of(studentsTable).addWarning(
      'LEARNING ENVIRONMENT ONLY: the Students table is deleted together ' +
        'with this stack, so all student data will be lost. For production, ' +
        'use RemovalPolicy.RETAIN, enable deletion protection, and configure ' +
        'backups.',
    );

    const healthFunction = new NodejsFunction(this, 'HealthFunction', {
      description: 'Health check handler for the StructLab backend',
      entry: join(__dirname, '..', 'src', 'handlers', 'health.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      memorySize: 128,
      timeout: Duration.seconds(5),
      bundling: lambdaBundling,
    });

    const createStudentFunction = new NodejsFunction(
      this,
      'CreateStudentFunction',
      {
        description: 'Creates a student in DynamoDB',
        entry: join(__dirname, '..', 'src', 'handlers', 'create-student.ts'),
        handler: 'handler',
        runtime: Runtime.NODEJS_22_X,
        memorySize: 128,
        timeout: Duration.seconds(10),
        environment: {
          STUDENTS_TABLE_NAME: studentsTable.tableName,
        },
        bundling: lambdaBundling,
      },
    );

    const listStudentsFunction = new NodejsFunction(
      this,
      'ListStudentsFunction',
      {
        description:
          'Lists students with cursor-based pagination (not publicly routed)',
        entry: join(__dirname, '..', 'src', 'handlers', 'list-students.ts'),
        handler: 'handler',
        runtime: Runtime.NODEJS_22_X,
        memorySize: 128,
        timeout: Duration.seconds(10),
        environment: {
          STUDENTS_TABLE_NAME: studentsTable.tableName,
        },
        bundling: lambdaBundling,
      },
    );

    // Least privilege: the create Lambda may only put an item, and the list
    // Lambda may only scan the table. Do not use grantReadWriteData() here.
    createStudentFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['dynamodb:PutItem'],
        resources: [studentsTable.tableArn],
      }),
    );

    listStudentsFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['dynamodb:Scan'],
        resources: [studentsTable.tableArn],
      }),
    );

    const httpApi = new HttpApi(this, 'HttpApi', {
      apiName: 'struct-lab-http-api',
      description: 'HTTP API for the StructLab backend',
    });

    httpApi.addRoutes({
      path: '/health',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'HealthIntegration',
        healthFunction,
      ),
    });

    httpApi.addRoutes({
      path: '/students',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'CreateStudentIntegration',
        createStudentFunction,
      ),
    });

    // Deliberately no GET /admin/students route. The list Lambda and its
    // least-privilege IAM role are prepared, but exposing students' personal
    // data publicly is forbidden until Cognito auth is implemented.

    new CfnOutput(this, 'HttpApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'Base URL of the StructLab HTTP API',
    });
  }
}
