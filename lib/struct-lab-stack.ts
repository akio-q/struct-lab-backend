import { join } from 'node:path';

import {
  Annotations,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  Tags,
} from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import {
  CfnStage,
  CorsHttpMethod,
  HttpApi,
  HttpMethod,
} from 'aws-cdk-lib/aws-apigatewayv2';
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
import type { StructLabEnvironment } from './environments';

const lambdaBundling = {
  minify: true,
  sourceMap: true,
  target: 'node22',
  bundleAwsSDK: true,
} as const;

export interface StructLabStackProps extends StackProps {
  /**
   * Pinned deployment target. The stack always derives `env`, `stackName`, and
   * environment tags from this object.
   */
  readonly environment: StructLabEnvironment;
}

/**
 * Core infrastructure for StructLab:
 * - DynamoDB table for students;
 * - Cognito user pool with a single public app client and the teachers group;
 * - Lambda for GET /health (public);
 * - Lambda for POST /students (public student registration);
 * - Lambda for GET /admin/students (teacher-only JWT);
 * - JWT authorizer protecting the admin student route.
 *
 * The AWS account, region, stack name, and environment tags are pinned by the
 * supplied environment config. Conflicting values are rejected rather than
 * silently overridden.
 */
export class StructLabStack extends Stack {
  constructor(scope: Construct, id: string, props: StructLabStackProps) {
    const { environment, ...stackProps } = props;

    if (
      stackProps.env !== undefined &&
      (stackProps.env.account !== environment.account ||
        stackProps.env.region !== environment.region)
    ) {
      throw new Error(
        `StructLab ${environment.name} must target ` +
          `${environment.account}/${environment.region}; received ` +
          `env ${stackProps.env.account ?? '(unset)'}/` +
          `${stackProps.env.region ?? '(unset)'}.`,
      );
    }

    if (
      stackProps.stackName !== undefined &&
      stackProps.stackName !== environment.stackName
    ) {
      throw new Error(
        `StructLab ${environment.name} must use stack name ` +
          `${environment.stackName}; received ${stackProps.stackName}.`,
      );
    }

    super(scope, id, {
      ...stackProps,
      env: {
        account: environment.account,
        region: environment.region,
      },
      stackName: environment.stackName,
    });

    if (
      this.account !== environment.account ||
      this.region !== environment.region ||
      this.stackName !== environment.stackName
    ) {
      throw new Error(
        `StructLab ${environment.name} resolved to ` +
          `${this.account}/${this.region}/${this.stackName}; expected ` +
          `${environment.account}/${environment.region}/` +
          `${environment.stackName}.`,
      );
    }

    // Apply tags explicitly so they are visible on taggable resources in the
    // synthesized template as well as on the CloudFormation stack.
    for (const [key, value] of Object.entries({
      ...stackProps.tags,
      ...environment.tags,
    })) {
      Tags.of(this).add(key, value);
    }

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
      // Only the user pool is retained. The app client and teachers group are
      // not explicitly retained, so removing the stack deletes them. A later
      // deploy creates new Cognito resources and does not automatically reuse
      // this pool.
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
      // API Gateway answers preflight requests natively; no OPTIONS route or
      // Lambda-level CORS headers are needed. Origins are validated before
      // synthesis and matched exactly (never wildcarded).
      corsPreflight: {
        allowOrigins: [...environment.corsAllowedOrigins],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST],
        allowHeaders: ['content-type', 'authorization'],
        allowCredentials: false,
        maxAge: Duration.seconds(300),
      },
    });

    // Throttling belongs on the existing default stage. Use the L1 escape
    // hatch instead of creating a new stage so the construct identity and
    // CloudFormation logical ID stay unchanged.
    const defaultStage = httpApi.defaultStage;

    if (defaultStage === undefined) {
      throw new Error(
        'StructLab HTTP API default stage was not created; ' +
          'cannot apply throttling.',
      );
    }

    const cfnDefaultStage = defaultStage.node.defaultChild;

    if (!(cfnDefaultStage instanceof CfnStage)) {
      throw new Error(
        'StructLab HTTP API default stage is not an ' +
          'AWS::ApiGatewayV2::Stage; cannot apply throttling.',
      );
    }

    cfnDefaultStage.defaultRouteSettings = {
      throttlingRateLimit: environment.throttling.rateLimitPerSecond,
      throttlingBurstLimit: environment.throttling.burstLimit,
    };

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
