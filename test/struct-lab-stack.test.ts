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
  };
}

const CREATE_DESCRIPTION = 'Creates a student in DynamoDB';
const LIST_DESCRIPTION =
  'Lists students with cursor-based pagination (not publicly routed)';

describe('StructLabStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new StructLabStack(app, 'TestStack');

    template = Template.fromStack(stack);
  }, 60_000);

  const getResources = <T>(type: string): Record<string, T> =>
    template.findResources(type) as Record<string, T>;

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

  it('creates three Node.js Lambda functions', () => {
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
    const createVariables = findLambda(CREATE_DESCRIPTION).Properties
      ?.Environment?.Variables;
    const listVariables = findLambda(LIST_DESCRIPTION).Properties?.Environment
      ?.Variables;

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

  it('exposes only GET /health and POST /students', () => {
    expect(getRouteKeys()).toEqual(['GET /health', 'POST /students']);
  });

  it('does not expose GET /admin/students before Cognito is added', () => {
    expect(getRouteKeys()).not.toContain('GET /admin/students');
  });

  it('exposes the API URL as a stack output', () => {
    expect(template.findOutputs('*')).toHaveProperty('HttpApiUrl');
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
