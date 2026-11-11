import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

import { SERVICE_NAME } from '../constants';

/**
 * Handler for GET /health.
 *
 * Returns a small JSON payload that can be used by monitoring tools or the
 * frontend to check that the API and Lambda are up and running.
 */
export const handler = async (): Promise<APIGatewayProxyStructuredResultV2> => {
  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      status: 'ok',
      service: SERVICE_NAME,
    }),
  };
};
