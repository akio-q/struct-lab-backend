import type { CreateStudentInput } from './types';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;
export const MAX_FULL_NAME_LENGTH = 200;
export const MAX_GROUP_LENGTH = 50;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface PaginationQuery {
  limit: number;
  cursor?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Parses and validates the POST /students request body.
 * Whitespace around values is trimmed before length checks.
 */
export const parseCreateStudentInput = (
  rawBody: string | undefined,
): ValidationResult<CreateStudentInput> => {
  if (rawBody === undefined || rawBody.trim() === '') {
    return { ok: false, error: 'Request body is required' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, error: 'Request body must be valid JSON' };
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const fullName = typeof parsed.fullName === 'string' ? parsed.fullName.trim() : '';
  if (fullName.length === 0) {
    return { ok: false, error: 'fullName must be a non-empty string' };
  }
  if (fullName.length > MAX_FULL_NAME_LENGTH) {
    return {
      ok: false,
      error: `fullName must be at most ${MAX_FULL_NAME_LENGTH} characters`,
    };
  }

  const group = typeof parsed.group === 'string' ? parsed.group.trim() : '';
  if (group.length === 0) {
    return { ok: false, error: 'group must be a non-empty string' };
  }
  if (group.length > MAX_GROUP_LENGTH) {
    return {
      ok: false,
      error: `group must be at most ${MAX_GROUP_LENGTH} characters`,
    };
  }

  return { ok: true, value: { fullName, group } };
};

/**
 * Parses limit and cursor query parameters for GET /admin/students.
 * The cursor format itself is validated separately in cursor.ts.
 */
export const parsePaginationQuery = (
  query: Record<string, string | undefined> | null | undefined,
): ValidationResult<PaginationQuery> => {
  const rawLimit = query?.limit;
  let limit = DEFAULT_PAGE_LIMIT;

  if (rawLimit !== undefined) {
    if (!/^\d+$/.test(rawLimit)) {
      return {
        ok: false,
        error: `limit must be an integer between 1 and ${MAX_PAGE_LIMIT}`,
      };
    }

    limit = Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
      return {
        ok: false,
        error: `limit must be an integer between 1 and ${MAX_PAGE_LIMIT}`,
      };
    }
  }

  const cursor = query?.cursor;
  if (cursor !== undefined && cursor.length === 0) {
    return { ok: false, error: 'cursor must not be empty' };
  }

  return {
    ok: true,
    value: cursor === undefined ? { limit } : { limit, cursor },
  };
};
