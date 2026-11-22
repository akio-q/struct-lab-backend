import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';

import { DEV_ENVIRONMENT } from '../lib/environments';
import { StructLabStack } from '../lib/struct-lab-stack';

interface LambdaResource {
  Properties?: {
    Description?: string;
    FunctionName?: string;
    Runtime?: string;
    Handler?: string;
    MemorySize?: number;
    ReservedConcurrentExecutions?: number;
    Environment?: {
      Variables?: Record<string, unknown>;
    };
    LoggingConfig?: {
      LogGroup?: string;
    };
    Role?: {
      'Fn::GetAtt'?: [string, string];
    };
  };
}

interface LogGroupResource {
  DeletionPolicy?: string;
  Properties?: {
    LogGroupName?: string;
    RetentionInDays?: number;
  };
}

interface AlarmResource {
  Properties?: {
    AlarmActions?: unknown[];
    OKActions?: unknown[];
    InsufficientDataActions?: unknown[];
    MetricName?: string;
    Namespace?: string;
    Dimensions?: Array<{
      Name?: string;
      Value?: unknown;
    }>;
    Statistic?: string;
    Period?: number;
    EvaluationPeriods?: number;
    Threshold?: number;
    ComparisonOperator?: string;
    TreatMissingData?: string;
  };
}

interface PolicyStatementResource {
  Action?: string | string[];
  Effect?: string;
  Resource?: unknown;
}

interface IamPolicyResource {
  Properties?: {
    Roles?: Array<{ Ref?: string }>;
    PolicyDocument?: {
      Statement?: PolicyStatementResource[];
    };
  };
}

interface RouteResource {
  Properties?: {
    RouteKey?: string;
    AuthorizationType?: string;
    AuthorizerId?: { Ref?: string };
  };
}

interface UserPoolResource {
  DeletionPolicy?: string;
  UpdateReplacePolicy?: string;
  Properties?: {
    UserPoolTier?: string;
    DeletionProtection?: string;
    AdminCreateUserConfig?: {
      AllowAdminCreateUserOnly?: boolean;
    };
    AccountRecoverySetting?: {
      RecoveryMechanisms?: Array<{
        Name?: string;
        Priority?: number;
      }>;
    };
    MfaConfiguration?: string;
    LambdaConfig?: unknown;
    Policies?: {
      PasswordPolicy?: {
        MinimumLength?: number;
        RequireLowercase?: boolean;
        RequireUppercase?: boolean;
        RequireNumbers?: boolean;
        RequireSymbols?: boolean;
        PasswordHistorySize?: number;
        TemporaryPasswordValidityDays?: number;
      };
    };
  };
}

interface UserPoolClientResource {
  DeletionPolicy?: string;
  UpdateReplacePolicy?: string;
  Properties?: {
    GenerateSecret?: boolean;
    UserPoolId?: unknown;
    ExplicitAuthFlows?: string[];
    PreventUserExistenceErrors?: string;
    AccessTokenValidity?: number;
    IdTokenValidity?: number;
    RefreshTokenValidity?: number;
    EnableTokenRevocation?: boolean;
    RefreshTokenRotation?: {
      RefreshTokenRotationType?: string;
      Feature?: string;
    };
    TokenValidityUnits?: {
      AccessToken?: string;
      IdToken?: string;
      RefreshToken?: string;
    };
    AllowedOAuthFlowsUserPoolClient?: boolean;
    AllowedOAuthFlows?: string[];
    AllowedOAuthScopes?: string[];
    CallbackURLs?: string[];
    LogoutURLs?: string[];
    SupportedIdentityProviders?: string[];
  };
}

interface UserPoolGroupResource {
  DeletionPolicy?: string;
  UpdateReplacePolicy?: string;
  Properties?: {
    GroupName?: string;
    UserPoolId?: unknown;
  };
}

interface AuthorizerResource {
  Properties?: {
    AuthorizerType?: string;
    IdentitySource?: string[];
    JwtConfiguration?: {
      Audience?: unknown[];
      Issuer?: unknown;
    };
  };
}

interface HttpApiResource {
  Properties?: {
    CorsConfiguration?: {
      AllowCredentials?: boolean;
      AllowHeaders?: string[];
      AllowMethods?: string[];
      AllowOrigins?: string[];
      MaxAge?: number;
    };
  };
}

interface StageResource {
  Properties?: {
    StageName?: string;
    AutoDeploy?: boolean;
    DefaultRouteSettings?: {
      ThrottlingBurstLimit?: number;
      ThrottlingRateLimit?: number;
    };
    RouteSettings?: unknown;
  };
}

interface DynamoTableResource {
  DeletionPolicy?: string;
  UpdateReplacePolicy?: string;
  Properties?: {
    BillingMode?: string;
    DeletionProtectionEnabled?: boolean;
    OnDemandThroughput?: {
      MaxReadRequestUnits?: number;
      MaxWriteRequestUnits?: number;
    };
    KeySchema?: Array<{
      AttributeName?: string;
      KeyType?: string;
    }>;
    AttributeDefinitions?: Array<{
      AttributeName?: string;
      AttributeType?: string;
    }>;
    SSESpecification?: {
      SSEEnabled?: boolean;
      SSEType?: string;
      KMSMasterKeyId?: unknown;
    };
    PointInTimeRecoverySpecification?: unknown;
    StreamSpecification?: unknown;
    TimeToLiveSpecification?: unknown;
    GlobalSecondaryIndexes?: unknown;
    Replicas?: unknown;
    ProvisionedThroughput?: unknown;
    WarmThroughput?: unknown;
  };
}

interface TagPair {
  Key?: string;
  Value?: string;
}

interface TaggableResource {
  Properties?: {
    Tags?: TagPair[] | Record<string, string>;
    UserPoolTags?: Record<string, string>;
  };
}

const HEALTH_DESCRIPTION = 'Health check handler for the StructLab backend';
const CREATE_DESCRIPTION = 'Creates a student in DynamoDB';
const LIST_DESCRIPTION =
  'Lists students with cursor-based pagination (teacher-only)';

describe('StructLabStack', () => {
  let stack: StructLabStack;
  let template: Template;

  beforeAll(() => {
    const app = new App();
    stack = new StructLabStack(app, 'TestStack', {
      environment: DEV_ENVIRONMENT,
    });

    template = Template.fromStack(stack);
  }, 60_000);

  const getResources = <T>(type: string): Record<string, T> =>
    template.findResources(type) as Record<string, T>;

  const getSingleResource = <T>(type: string): [string, T] => {
    const entries = Object.entries(getResources<T>(type));
    const only = entries[0];

    if (entries.length !== 1 || only === undefined) {
      throw new Error(`Expected exactly one ${type}, found ${entries.length}`);
    }

    return only;
  };

  const findLambda = (description: string): LambdaResource => {
    const lambda = Object.values(
      getResources<LambdaResource>('AWS::Lambda::Function'),
    ).find((candidate) => candidate.Properties?.Description === description);

    if (!lambda) {
      throw new Error(`Lambda not found: ${description}`);
    }

    return lambda;
  };

  const findRoleId = (description: string): string => {
    const roleId =
      findLambda(description).Properties?.Role?.['Fn::GetAtt']?.[0];

    if (!roleId) {
      throw new Error(`IAM role not found for: ${description}`);
    }

    return roleId;
  };

  const findDynamoStatements = (
    description: string,
  ): PolicyStatementResource[] => {
    const roleId = findRoleId(description);

    return Object.values(getResources<IamPolicyResource>('AWS::IAM::Policy'))
      .filter((policy) =>
        (policy.Properties?.Roles ?? []).some((role) => role.Ref === roleId),
      )
      .flatMap((policy) => policy.Properties?.PolicyDocument?.Statement ?? [])
      .filter((statement) =>
        toActions(statement).some((action) => action.startsWith('dynamodb:')),
      );
  };

  const findRoute = (routeKey: string): RouteResource => {
    const route = Object.values(
      getResources<RouteResource>('AWS::ApiGatewayV2::Route'),
    ).find((candidate) => candidate.Properties?.RouteKey === routeKey);

    if (!route) {
      throw new Error(`Route not found: ${routeKey}`);
    }

    return route;
  };

  const getRouteKeys = (): string[] =>
    Object.values(getResources<RouteResource>('AWS::ApiGatewayV2::Route'))
      .map((route) => route.Properties?.RouteKey)
      .filter((routeKey): routeKey is string => typeof routeKey === 'string')
      .sort();

  const getTags = (resource: TaggableResource): Record<string, string> => {
    const tags = resource.Properties?.Tags;

    if (Array.isArray(tags)) {
      const result: Record<string, string> = {};

      for (const tag of tags) {
        if (tag.Key !== undefined) {
          result[tag.Key] = tag.Value ?? '';
        }
      }

      return result;
    }

    return tags ?? resource.Properties?.UserPoolTags ?? {};
  };

  it('pins the dev AWS account, region, and stack name', () => {
    expect(stack.account).toBe('677339799150');
    expect(stack.region).toBe('eu-north-1');
    expect(stack.stackName).toBe('StructLabBackendStack-dev');
  });

  it('applies dev environment tags to taggable resources', () => {
    for (const type of [
      'AWS::DynamoDB::Table',
      'AWS::Cognito::UserPool',
      'AWS::Lambda::Function',
      'AWS::ApiGatewayV2::Api',
      'AWS::ApiGatewayV2::Stage',
    ]) {
      const resources = Object.values(getResources<TaggableResource>(type));

      expect(resources.length).toBeGreaterThan(0);

      for (const resource of resources) {
        expect(getTags(resource)).toMatchObject(DEV_ENVIRONMENT.tags);
      }
    }
  });

  it('keeps the baseline synthesized resource inventory unchanged', () => {
    const resources = template.toJSON().Resources as Record<
      string,
      { Type: string }
    >;

    // `Template.fromStack` omits the `AWS::CDK::Metadata` resource that appears
    // in the synthesized `cdk.out` template, so this inventory has 31 entries
    // instead of the 32 resources reported by `cdk synth`.
    expect(Object.keys(resources)).toHaveLength(31);

    const counts: Record<string, number> = {};
    for (const resource of Object.values(resources)) {
      counts[resource.Type] = (counts[resource.Type] ?? 0) + 1;
    }

    expect(counts).toEqual({
      'AWS::ApiGatewayV2::Api': 1,
      'AWS::ApiGatewayV2::Authorizer': 1,
      'AWS::ApiGatewayV2::Integration': 3,
      'AWS::ApiGatewayV2::Route': 3,
      'AWS::ApiGatewayV2::Stage': 1,
      'AWS::CloudWatch::Alarm': 4,
      'AWS::Cognito::UserPool': 1,
      'AWS::Cognito::UserPoolClient': 1,
      'AWS::Cognito::UserPoolGroup': 1,
      'AWS::DynamoDB::Table': 1,
      'AWS::IAM::Policy': 2,
      'AWS::IAM::Role': 3,
      'AWS::Lambda::Function': 3,
      'AWS::Lambda::Permission': 3,
      'AWS::Logs::LogGroup': 3,
    });
  });

  it('rejects a conflicting explicit environment', () => {
    const app = new App();

    expect(
      () =>
        new StructLabStack(app, 'ConflictingEnvironmentStack', {
          environment: DEV_ENVIRONMENT,
          env: {
            account: '123456789012',
            region: 'us-east-1',
          },
        }),
    ).toThrow(/must target 677339799150\/eu-north-1/);
  });

  it('rejects a conflicting stack name', () => {
    const app = new App();

    expect(
      () =>
        new StructLabStack(app, 'ConflictingStackNameStack', {
          environment: DEV_ENVIRONMENT,
          stackName: 'SomeOtherStack',
        }),
    ).toThrow(/must use stack name StructLabBackendStack-dev/);
  });

  it('hardens the existing Students table without changing its identity', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 1);

    const [logicalId, table] = getSingleResource<DynamoTableResource>(
      'AWS::DynamoDB::Table',
    );

    expect(logicalId).toBe('StudentsTableDAB56938');
    expect(table.DeletionPolicy).toBe('Delete');
    expect(table.UpdateReplacePolicy).toBe('Delete');
    expect(table.Properties?.BillingMode).toBe('PAY_PER_REQUEST');
    expect(table.Properties?.DeletionProtectionEnabled).toBe(true);
    expect(table.Properties?.OnDemandThroughput).toEqual({
      MaxReadRequestUnits: 25,
      MaxWriteRequestUnits: 25,
    });
    expect(table.Properties?.KeySchema).toEqual([
      { AttributeName: 'studentId', KeyType: 'HASH' },
    ]);
    expect(table.Properties?.AttributeDefinitions).toEqual([
      { AttributeName: 'studentId', AttributeType: 'S' },
    ]);
    expect(table.Properties?.SSESpecification).toEqual({ SSEEnabled: true });
  });

  it('does not enable deferred DynamoDB features or add resources', () => {
    const [, table] = getSingleResource<DynamoTableResource>(
      'AWS::DynamoDB::Table',
    );

    expect(table.Properties?.PointInTimeRecoverySpecification).toBeUndefined();
    expect(table.Properties?.StreamSpecification).toBeUndefined();
    expect(table.Properties?.TimeToLiveSpecification).toBeUndefined();
    expect(table.Properties?.GlobalSecondaryIndexes).toBeUndefined();
    expect(table.Properties?.Replicas).toBeUndefined();
    expect(table.Properties?.ProvisionedThroughput).toBeUndefined();
    expect(table.Properties?.WarmThroughput).toBeUndefined();
    expect(table.Properties?.SSESpecification?.KMSMasterKeyId).toBeUndefined();

    for (const type of [
      'AWS::Backup::BackupPlan',
      'AWS::Backup::BackupVault',
      'AWS::DynamoDB::GlobalTable',
      'AWS::KMS::Key',
      'AWS::Lambda::EventSourceMapping',
    ]) {
      template.resourceCountIs(type, 0);
    }
  });

  it('creates exactly three Node.js Lambda functions', () => {
    template.resourceCountIs('AWS::Lambda::Function', 3);

    for (const description of [
      'Health check handler for the StructLab backend',
      CREATE_DESCRIPTION,
      LIST_DESCRIPTION,
    ]) {
      const lambda = findLambda(description);
      expect(lambda.Properties?.Runtime).toBe('nodejs22.x');
      expect(lambda.Properties?.Handler).toBe('index.handler');
      expect(lambda.Properties?.MemorySize).toBe(128);
    }
  });

  it('creates explicit 7-day log groups bound to each Lambda without fixed function names', () => {
    template.resourceCountIs('AWS::Logs::LogGroup', 3);

    const expected = [
      {
        description: HEALTH_DESCRIPTION,
        logGroupName: `/aws/lambda/${DEV_ENVIRONMENT.stackName}-health`,
      },
      {
        description: CREATE_DESCRIPTION,
        logGroupName: `/aws/lambda/${DEV_ENVIRONMENT.stackName}-create-student`,
      },
      {
        description: LIST_DESCRIPTION,
        logGroupName: `/aws/lambda/${DEV_ENVIRONMENT.stackName}-list-students`,
      },
    ];

    for (const { description, logGroupName } of expected) {
      const lambda = findLambda(description);
      const logGroupEntry = Object.entries(
        getResources<LogGroupResource>('AWS::Logs::LogGroup'),
      ).find(
        ([, candidate]) => candidate.Properties?.LogGroupName === logGroupName,
      );

      if (!logGroupEntry) {
        throw new Error(`Log group not found: ${logGroupName}`);
      }

      const [logGroupLogicalId, logGroup] = logGroupEntry;

      expect(lambda.Properties?.FunctionName).toBeUndefined();
      expect(lambda.Properties?.LoggingConfig?.LogGroup).toEqual({
        Ref: logGroupLogicalId,
      });
      expect(logGroup.Properties?.RetentionInDays).toBe(7);
      expect(logGroup.DeletionPolicy).toBe('Delete');
    }
  });

  it('creates four standard alarms without notification actions', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', 4);

    const alarms = Object.values(
      getResources<AlarmResource>('AWS::CloudWatch::Alarm'),
    );

    for (const alarm of alarms) {
      expect(alarm.Properties?.Period).toBe(300);
      expect(alarm.Properties?.EvaluationPeriods).toBe(1);
      expect(alarm.Properties?.Threshold).toBe(1);
      expect(alarm.Properties?.ComparisonOperator).toBe(
        'GreaterThanOrEqualToThreshold',
      );
      expect(alarm.Properties?.TreatMissingData).toBe('notBreaching');
      expect(alarm.Properties?.AlarmActions).toBeUndefined();
      expect(alarm.Properties?.OKActions).toBeUndefined();
      expect(alarm.Properties?.InsufficientDataActions).toBeUndefined();
    }

    const lambdaAlarms = alarms.filter(
      (alarm) => alarm.Properties?.Namespace === 'AWS/Lambda',
    );

    expect(lambdaAlarms).toHaveLength(3);

    for (const alarm of lambdaAlarms) {
      expect(alarm.Properties?.MetricName).toBe('Errors');
      expect(alarm.Properties?.Statistic).toBe('Sum');
      expect(alarm.Properties?.Dimensions).toEqual([
        { Name: 'FunctionName', Value: expect.anything() },
      ]);
    }

    const apiAlarm = alarms.find(
      (alarm) => alarm.Properties?.Namespace === 'AWS/ApiGateway',
    );
    const apiLogicalId = Object.keys(
      getResources<unknown>('AWS::ApiGatewayV2::Api'),
    )[0];

    expect(apiAlarm).toBeDefined();
    expect(apiAlarm?.Properties?.MetricName).toBe('5xx');
    expect(apiAlarm?.Properties?.Statistic).toBe('Sum');
    expect(
      Object.fromEntries(
        (apiAlarm?.Properties?.Dimensions ?? []).map((dimension) => [
          dimension.Name,
          dimension.Value,
        ]),
      ),
    ).toEqual({
      ApiId: { Ref: apiLogicalId },
      Stage: '$default',
    });
  });

  it('does not add notifications, budgets or dashboards', () => {
    for (const type of [
      'AWS::SNS::Topic',
      'AWS::Budgets::Budget',
      'AWS::CloudWatch::Dashboard',
    ]) {
      template.resourceCountIs(type, 0);
    }
  });

  it('passes the table name only to the student Lambdas', () => {
    const healthVariables = findLambda(
      'Health check handler for the StructLab backend',
    ).Properties?.Environment?.Variables;
    const createVariables = findLambda(CREATE_DESCRIPTION).Properties
      ?.Environment?.Variables;
    const listVariables = findLambda(LIST_DESCRIPTION).Properties?.Environment
      ?.Variables;

    expect(healthVariables).toBeUndefined();
    expect(createVariables).toHaveProperty('STUDENTS_TABLE_NAME');
    expect(listVariables).toHaveProperty('STUDENTS_TABLE_NAME');
  });

  it('grants only PutItem to the create Lambda and only Scan to the list Lambda', () => {
    const createStatements = findDynamoStatements(CREATE_DESCRIPTION);
    const listStatements = findDynamoStatements(LIST_DESCRIPTION);

    expect(createStatements.flatMap(toActions)).toEqual(['dynamodb:PutItem']);
    expect(listStatements.flatMap(toActions)).toEqual(['dynamodb:Scan']);
  });

  it('scopes DynamoDB permissions to the Students table ARN', () => {
    const [tableLogicalId] = Object.keys(
      getResources<unknown>('AWS::DynamoDB::Table'),
    );

    if (!tableLogicalId) {
      throw new Error('Students table not found');
    }

    const statements = [
      ...findDynamoStatements(CREATE_DESCRIPTION),
      ...findDynamoStatements(LIST_DESCRIPTION),
    ];

    for (const statement of statements) {
      expect(statement.Resource).toEqual({
        'Fn::GetAtt': [tableLogicalId, 'Arn'],
      });
    }
  });

  it('creates exactly one locked-down Cognito user pool', () => {
    template.resourceCountIs('AWS::Cognito::UserPool', 1);

    const [poolLogicalId, userPool] = getSingleResource<UserPoolResource>(
      'AWS::Cognito::UserPool',
    );

    expect(poolLogicalId).toBe('TeachersUserPoolA87A0CBA');
    expect(userPool.DeletionPolicy).toBe('Retain');
    expect(userPool.UpdateReplacePolicy).toBe('Retain');
    expect(userPool.Properties?.UserPoolTier).toBe('ESSENTIALS');
    expect(userPool.Properties?.DeletionProtection).toBe('ACTIVE');
    expect(
      userPool.Properties?.AdminCreateUserConfig?.AllowAdminCreateUserOnly,
    ).toBe(true);
    expect(userPool.Properties?.AccountRecoverySetting).toEqual({
      RecoveryMechanisms: [{ Name: 'admin_only', Priority: 1 }],
    });
    expect(userPool.Properties?.Policies?.PasswordPolicy).toEqual({
      MinimumLength: 12,
      RequireLowercase: true,
      RequireUppercase: true,
      RequireNumbers: true,
      RequireSymbols: true,
      PasswordHistorySize: 5,
      TemporaryPasswordValidityDays: 3,
    });
    expect(userPool.Properties?.MfaConfiguration).toBeUndefined();
    expect(userPool.Properties?.LambdaConfig).toBeUndefined();
  });

  it('creates exactly one public app client with minimal auth flows', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    template.resourceCountIs('AWS::Cognito::UserPoolDomain', 0);

    const [poolLogicalId] = getSingleResource<UserPoolResource>(
      'AWS::Cognito::UserPool',
    );
    const [clientLogicalId, client] = getSingleResource<UserPoolClientResource>(
      'AWS::Cognito::UserPoolClient',
    );

    expect(clientLogicalId).toBe('TeachersUserPoolTeachersAppClient7A8BA630');
    expect(client.DeletionPolicy).toBeUndefined();
    expect(client.UpdateReplacePolicy).toBeUndefined();
    expect(client.Properties?.GenerateSecret).toBe(false);
    expect(client.Properties?.UserPoolId).toEqual({ Ref: poolLogicalId });
    expect(client.Properties?.ExplicitAuthFlows).toEqual([
      'ALLOW_USER_SRP_AUTH',
      'ALLOW_REFRESH_TOKEN_AUTH',
    ]);
    expect(client.Properties?.PreventUserExistenceErrors).toBe('ENABLED');
    expect(client.Properties?.AccessTokenValidity).toBe(15);
    // CDK L2 normalizes refresh-token validity to minutes, so seven days is
    // synthesized as 10080 minutes rather than `7` with a `days` unit.
    expect(client.Properties?.RefreshTokenValidity).toBe(7 * 24 * 60);
    expect(client.Properties?.IdTokenValidity).toBeUndefined();
    expect(client.Properties?.TokenValidityUnits).toEqual({
      AccessToken: 'minutes',
      RefreshToken: 'minutes',
    });
    expect(client.Properties?.EnableTokenRevocation).toBe(true);
    expect(client.Properties?.RefreshTokenRotation).toBeUndefined();
    expect(client.Properties?.AllowedOAuthFlowsUserPoolClient).toBe(false);
    expect(client.Properties?.AllowedOAuthFlows).toBeUndefined();
    expect(client.Properties?.AllowedOAuthScopes).toBeUndefined();
    expect(client.Properties?.CallbackURLs).toBeUndefined();
    expect(client.Properties?.LogoutURLs).toBeUndefined();
    expect(client.Properties?.SupportedIdentityProviders).toEqual([
      'COGNITO',
    ]);
  });

  it('creates the teachers group in the user pool', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolGroup', 1);

    const [poolLogicalId] = getSingleResource<UserPoolResource>(
      'AWS::Cognito::UserPool',
    );
    const [groupLogicalId, group] = getSingleResource<UserPoolGroupResource>(
      'AWS::Cognito::UserPoolGroup',
    );

    expect(groupLogicalId).toBe('TeachersUserPoolTeachersGroupABBE489E');
    expect(group.DeletionPolicy).toBeUndefined();
    expect(group.UpdateReplacePolicy).toBeUndefined();
    expect(group.Properties?.GroupName).toBe('teachers');
    expect(group.Properties?.UserPoolId).toEqual({ Ref: poolLogicalId });
  });

  it('does not add deferred Cognito resources or integrations', () => {
    const [, userPool] = getSingleResource<UserPoolResource>(
      'AWS::Cognito::UserPool',
    );

    expect(userPool.Properties?.LambdaConfig).toBeUndefined();

    for (const type of [
      'AWS::Cognito::UserPoolDomain',
      'AWS::Cognito::UserPoolIdentityProvider',
      'AWS::Cognito::IdentityPool',
      'AWS::SNS::Topic',
      'AWS::SNS::Subscription',
      'AWS::SES::ConfigurationSet',
      'AWS::SES::EmailIdentity',
    ]) {
      template.resourceCountIs(type, 0);
    }
  });

  it('creates one JWT authorizer for the app client and user pool', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Authorizer', 1);

    const [poolLogicalId] = getSingleResource<UserPoolResource>(
      'AWS::Cognito::UserPool',
    );
    const [clientLogicalId] = getSingleResource<UserPoolClientResource>(
      'AWS::Cognito::UserPoolClient',
    );
    const [, authorizer] = getSingleResource<AuthorizerResource>(
      'AWS::ApiGatewayV2::Authorizer',
    );

    expect(authorizer.Properties?.AuthorizerType).toBe('JWT');
    expect(authorizer.Properties?.IdentitySource).toEqual([
      '$request.header.Authorization',
    ]);
    expect(authorizer.Properties?.JwtConfiguration?.Audience).toEqual([
      { Ref: clientLogicalId },
    ]);
    expect(authorizer.Properties?.JwtConfiguration?.Issuer).toEqual({
      'Fn::Join': [
        '',
        [
          'https://cognito-idp.eu-north-1.amazonaws.com/',
          { Ref: poolLogicalId },
        ],
      ],
    });
  });

  it('protects only the admin student route with the JWT authorizer', () => {
    const [authorizerLogicalId] = getSingleResource<AuthorizerResource>(
      'AWS::ApiGatewayV2::Authorizer',
    );
    const route = findRoute('GET /admin/students');

    expect(route.Properties?.AuthorizationType).toBe('JWT');
    expect(route.Properties?.AuthorizerId).toEqual({
      Ref: authorizerLogicalId,
    });
  });

  it('keeps GET /health and POST /students public', () => {
    expect(getRouteKeys()).toEqual([
      'GET /admin/students',
      'GET /health',
      'POST /students',
    ]);

    for (const routeKey of ['GET /health', 'POST /students']) {
      const route = findRoute(routeKey);

      expect(route.Properties?.AuthorizationType ?? 'NONE').toBe('NONE');
      expect(route.Properties?.AuthorizerId).toBeUndefined();
    }

    const publicRouteKeys = Object.values(
      getResources<RouteResource>('AWS::ApiGatewayV2::Route'),
    )
      .filter(
        (route) =>
          (route.Properties?.AuthorizationType ?? 'NONE') !== 'JWT',
      )
      .map((route) => route.Properties?.RouteKey)
      .filter((routeKey): routeKey is string => typeof routeKey === 'string')
      .sort();

    expect(publicRouteKeys).toEqual(['GET /health', 'POST /students']);
  });

  it('configures native CORS for the approved Next.js dev origin', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);

    const [, api] = getSingleResource<HttpApiResource>(
      'AWS::ApiGatewayV2::Api',
    );

    expect(api.Properties?.CorsConfiguration).toEqual({
      AllowCredentials: false,
      AllowHeaders: ['content-type', 'authorization'],
      AllowMethods: ['GET', 'POST'],
      AllowOrigins: ['http://localhost:3000'],
      MaxAge: 300,
    });
    expect(api.Properties?.CorsConfiguration?.AllowOrigins).toEqual([
      ...DEV_ENVIRONMENT.corsAllowedOrigins,
    ]);
  });

  it('does not add an explicit OPTIONS preflight route', () => {
    expect(
      getRouteKeys().filter((routeKey) => routeKey.startsWith('OPTIONS ')),
    ).toEqual([]);
  });

  it('applies throttling to the existing default stage', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Stage', 1);

    const [stageLogicalId, stage] = getSingleResource<StageResource>(
      'AWS::ApiGatewayV2::Stage',
    );

    expect(stageLogicalId).toBe('HttpApiDefaultStage3EEB07D6');
    expect(stage.Properties?.StageName).toBe('$default');
    expect(stage.Properties?.AutoDeploy).toBe(true);
    expect(stage.Properties?.DefaultRouteSettings).toEqual({
      ThrottlingBurstLimit: 20,
      ThrottlingRateLimit: 10,
    });
    expect(stage.Properties?.RouteSettings).toBeUndefined();
  });

  it('does not configure Lambda reserved concurrency', () => {
    const lambdas = Object.values(
      getResources<LambdaResource>('AWS::Lambda::Function'),
    );

    expect(lambdas).toHaveLength(3);

    for (const lambda of lambdas) {
      expect(lambda.Properties?.ReservedConcurrentExecutions).toBeUndefined();
    }
  });

  it('does not create Lambda versions or aliases for provisioned concurrency', () => {
    template.resourceCountIs('AWS::Lambda::Version', 0);
    template.resourceCountIs('AWS::Lambda::Alias', 0);
  });

  it('does not grant Cognito permissions to Lambda roles', () => {
    const actions = Object.values(
      getResources<IamPolicyResource>('AWS::IAM::Policy'),
    )
      .flatMap((policy) => policy.Properties?.PolicyDocument?.Statement ?? [])
      .flatMap(toActions);

    expect(actions.filter((action) => action.startsWith('cognito'))).toEqual(
      [],
    );
  });

  it('exposes the API URL, user pool ID, and app client ID as stack outputs', () => {
    const [poolLogicalId] = getSingleResource<UserPoolResource>(
      'AWS::Cognito::UserPool',
    );
    const [clientLogicalId] = getSingleResource<UserPoolClientResource>(
      'AWS::Cognito::UserPoolClient',
    );
    const outputs = template.findOutputs('*');

    expect(Object.keys(outputs).sort()).toEqual([
      'HttpApiUrl',
      'UserPoolClientId',
      'UserPoolId',
    ]);
    expect(outputs['UserPoolId']?.Value).toEqual({ Ref: poolLogicalId });
    expect(outputs['UserPoolClientId']?.Value).toEqual({
      Ref: clientLogicalId,
    });
  });
});

const toActions = (statement: PolicyStatementResource): string[] => {
  if (statement.Action === undefined) {
    return [];
  }

  return Array.isArray(statement.Action)
    ? statement.Action
    : [statement.Action];
};
