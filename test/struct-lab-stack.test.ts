import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';

import { StructLabStack } from '../lib/struct-lab-stack';

interface LambdaResource {
  Properties?: {
    Description?: string;
    Runtime?: string;
    Handler?: string;
    MemorySize?: number;
    Environment?: {
      Variables?: Record<string, unknown>;
    };
    Role?: {
      'Fn::GetAtt'?: [string, string];
    };
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
    AdminCreateUserConfig?: {
      AllowAdminCreateUserOnly?: boolean;
    };
    Policies?: {
      PasswordPolicy?: {
        MinimumLength?: number;
        RequireLowercase?: boolean;
        RequireUppercase?: boolean;
        RequireNumbers?: boolean;
        RequireSymbols?: boolean;
      };
    };
  };
}

interface UserPoolClientResource {
  Properties?: {
    GenerateSecret?: boolean;
    UserPoolId?: unknown;
    ExplicitAuthFlows?: string[];
    AccessTokenValidity?: number;
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

const CREATE_DESCRIPTION = 'Creates a student in DynamoDB';
const LIST_DESCRIPTION =
  'Lists students with cursor-based pagination (teacher-only)';

describe('StructLabStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new StructLabStack(app, 'TestStack');

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

  it('creates the Students table with on-demand billing and encryption', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
    template.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
      Properties: {
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [{ AttributeName: 'studentId', KeyType: 'HASH' }],
        AttributeDefinitions: [
          { AttributeName: 'studentId', AttributeType: 'S' },
        ],
        SSESpecification: { SSEEnabled: true },
        DeletionProtectionEnabled: false,
      },
    });
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

    const [, userPool] = getSingleResource<UserPoolResource>(
      'AWS::Cognito::UserPool',
    );

    expect(userPool.DeletionPolicy).toBe('Retain');
    expect(userPool.UpdateReplacePolicy).toBe('Retain');
    expect(
      userPool.Properties?.AdminCreateUserConfig?.AllowAdminCreateUserOnly,
    ).toBe(true);
    expect(userPool.Properties?.Policies?.PasswordPolicy).toEqual({
      MinimumLength: 12,
      RequireLowercase: true,
      RequireUppercase: true,
      RequireNumbers: true,
      RequireSymbols: true,
    });
  });

  it('creates exactly one public app client with minimal auth flows', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    template.resourceCountIs('AWS::Cognito::UserPoolDomain', 0);

    const [poolLogicalId] = getSingleResource<UserPoolResource>(
      'AWS::Cognito::UserPool',
    );
    const [, client] = getSingleResource<UserPoolClientResource>(
      'AWS::Cognito::UserPoolClient',
    );

    expect(client.Properties?.GenerateSecret).toBe(false);
    expect(client.Properties?.UserPoolId).toEqual({ Ref: poolLogicalId });
    expect(client.Properties?.ExplicitAuthFlows).toEqual([
      'ALLOW_USER_SRP_AUTH',
      'ALLOW_REFRESH_TOKEN_AUTH',
    ]);
    expect(client.Properties?.AccessTokenValidity).toBe(30);
    expect(client.Properties?.TokenValidityUnits).toEqual({
      AccessToken: 'minutes',
    });
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
    const [, group] = getSingleResource<UserPoolGroupResource>(
      'AWS::Cognito::UserPoolGroup',
    );

    expect(group.Properties?.GroupName).toBe('teachers');
    expect(group.Properties?.UserPoolId).toEqual({ Ref: poolLogicalId });
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
          'https://cognito-idp.',
          { Ref: 'AWS::Region' },
          '.amazonaws.com/',
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
