import type { APIGatewayProxyEventV2 } from 'aws-lambda';

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
