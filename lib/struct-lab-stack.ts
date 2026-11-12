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
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
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

import { TEACHERS_GROUP_NAME } from '../src/constants';

const lambdaBundling = {
  minify: true,
  sourceMap: true,
  target: 'node22',
  bundleAwsSDK: true,
} as const;

/**
 * Core infrastructure for StructLab:
 * - DynamoDB table for students;
 * - Cognito user pool with a single public app client and the teachers group;
 * - Lambda for GET /health (public);
 * - Lambda for POST /students (public student registration);
 * - Lambda for GET /admin/students (teacher-only JWT);
 * - JWT authorizer protecting the admin student route.
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

    const teachersUserPool = new UserPool(this, 'TeachersUserPool', {
      selfSignUpEnabled: false,
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      // Teacher accounts and group membership must survive a stack removal.
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Exactly one public client (no secret). OAuth/Hosted UI is disabled
    // because this phase defines no callback URLs or domain.
    const teachersAppClient = teachersUserPool.addClient('TeachersAppClient', {
      generateSecret: false,
      disableOAuth: true,
      authFlows: {
        userSrp: true,
      },
      accessTokenValidity: Duration.minutes(30),
    });

    teachersUserPool.addGroup('TeachersGroup', {
      groupName: TEACHERS_GROUP_NAME,
    });

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
          'Lists students with cursor-based pagination (teacher-only)',
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

    const teachersAuthorizer = new HttpUserPoolAuthorizer(
      'TeachersJwtAuthorizer',
      teachersUserPool,
      {
        userPoolClients: [teachersAppClient],
        identitySource: ['$request.header.Authorization'],
      },
    );

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

    httpApi.addRoutes({
      path: '/admin/students',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration(
        'ListStudentsIntegration',
        listStudentsFunction,
      ),
      authorizer: teachersAuthorizer,
    });

    new CfnOutput(this, 'HttpApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'Base URL of the StructLab HTTP API',
    });

    new CfnOutput(this, 'UserPoolId', {
      value: teachersUserPool.userPoolId,
      description: 'Cognito user pool used for teacher authentication',
    });

    new CfnOutput(this, 'UserPoolClientId', {
      value: teachersAppClient.userPoolClientId,
      description: 'Public Cognito app client used by the frontend',
    });
  }
}
