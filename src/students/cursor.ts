import type { StudentCursor } from './types';

/**
 * The cursor is deliberately opaque to clients. It is a base64url-encoded
 * DynamoDB key, not an encrypted value, so its internal format may change.
 */
export const MAX_CURSOR_LENGTH = 512;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const encodeCursor = (cursor: StudentCursor): string =>
  Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');

/**
 * Returns undefined for any malformed or oversized cursor. Callers must turn
 * that into HTTP 400 instead of passing untrusted data to DynamoDB.
 */
export const decodeCursor = (value: string): StudentCursor | undefined => {
  if (
    value.length === 0 ||
    value.length > MAX_CURSOR_LENGTH ||
    !BASE64URL_PATTERN.test(value)
  ) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }

  const keys = Object.keys(parsed);
  const studentId = (parsed as Record<string, unknown>).studentId;

  if (
    keys.length !== 1 ||
    keys[0] !== 'studentId' ||
    typeof studentId !== 'string' ||
    !UUID_V4_PATTERN.test(studentId)
  ) {
    return undefined;
  }

  return { studentId };
};
