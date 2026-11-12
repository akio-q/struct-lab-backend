import type { APIGatewayProxyEventV2 } from 'aws-lambda';

/** Synthetic claims for a valid Cognito access token in the teachers group. */
export const TEACHER_ACCESS_CLAIMS: Record<string, unknown> = {
  token_use: 'access',
  'cognito:groups': ['teachers'],
};

/**
 * Creates a minimal API Gateway HTTP API event for handler tests. Only the
 * fields used by our handlers need to be meaningful; the rest are omitted.
 */
export const createApiEvent = (
  overrides: Partial<APIGatewayProxyEventV2> = {},
): APIGatewayProxyEventV2 =>
  ({
    body: undefined,
    isBase64Encoded: false,
    queryStringParameters: undefined,
    ...overrides,
  }) as APIGatewayProxyEventV2;

/**
 * Creates an API Gateway event with a synthetic JWT authorizer context.
 *
 * The default claims represent a valid teacher access token. Tests can pass
 * alternative claims to simulate ID tokens, missing groups, and malformed
 * authorizer data.
 */
export const createAuthenticatedApiEvent = (
  overrides: Partial<APIGatewayProxyEventV2> = {},
  claims: Record<string, unknown> = TEACHER_ACCESS_CLAIMS,
): APIGatewayProxyEventV2 => {
  const event = createApiEvent(overrides);

  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: {
        jwt: {
          claims,
          scopes: [],
        },
      },
    },
  } as unknown as APIGatewayProxyEventV2;
};
