import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

/** Common shape for API Gateway HTTP API Lambda handlers. */
export type HttpHandler = (
  event: APIGatewayProxyEventV2,
) => Promise<APIGatewayProxyStructuredResultV2>;

export const jsonResponse = (
  statusCode: number,
  body: unknown,
): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: {
    'content-type': 'application/json',
    // JSON responses can contain student PII; never allow caching.
    'cache-control': 'no-store',
  },
  body: JSON.stringify(body),
});

export interface RequestBody {
  readonly text: string | undefined;
  readonly byteLength: number;
}

/**
 * Reads a header value case-insensitively.
 * API Gateway HTTP API payload format 2.0 lowercases header names,
 * but this helper also supports mixed-case headers in other contexts.
 */
export const getHeader = (
  headers: Record<string, string | undefined> | undefined,
  name: string,
): string | undefined => {
  const normalizedName = name.toLowerCase();

  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === normalizedName) {
      return value;
    }
  }

  return undefined;
};

/** Accepts application/json with optional parameters, such as charset. */
export const isJsonContentType = (
  contentType: string | undefined,
): boolean => {
  const mediaType = contentType?.split(';')[0]?.trim().toLowerCase();

  return mediaType === 'application/json';
};

/**
 * Decodes a request body and measures its exact byte length. Base64 bodies
 * must be decoded before both the size check and UTF-8 conversion.
 */
export const readRequestBody = (
  event: Pick<APIGatewayProxyEventV2, 'body' | 'isBase64Encoded'>,
): RequestBody => {
  if (event.body === undefined) {
    return { text: undefined, byteLength: 0 };
  }

  const bytes = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64')
    : Buffer.from(event.body, 'utf8');

  return {
    text: bytes.toString('utf8'),
    byteLength: bytes.byteLength,
  };
};
