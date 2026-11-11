import { TEACHERS_GROUP_NAME } from '../constants';

/**
 * Why teacher authorization was denied.
 *
 * - `invalid-authorizer-context`: the event has no usable JWT authorizer
 *   context, so the request is treated as unauthenticated.
 * - `invalid-token-use`: the token is missing `token_use` or is not an access
 *   token (for example a Cognito ID token).
 * - `missing-teachers-group`: the access token is valid but does not contain
 *   the exact teachers group.
 */
export type AuthorizationDenialReason =
  | 'invalid-authorizer-context'
  | 'invalid-token-use'
  | 'missing-teachers-group';

/** Discriminated result of a teacher authorization decision. */
export type TeacherAuthorizationResult =
  | { readonly authorized: true }
  | {
      readonly authorized: false;
      readonly statusCode: 401 | 403;
      readonly reason: AuthorizationDenialReason;
    };

const BRACKETED_GROUPS_PATTERN = /^\s*\[(.*)\]\s*$/;
/**
 * API Gateway serializes group arrays as whitespace-separated names inside
 * brackets. Commas are valid inside a Cognito group name, so they must not be
 * treated as separators.
 */
const GROUP_SEPARATOR_PATTERN = /\s+/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Extracts JWT claims from an HTTP API v2 event without trusting the event
 * type. Anything unexpected yields `undefined`, which the caller treats as an
 * unauthenticated request.
 */
const extractJwtClaims = (
  event: unknown,
): Record<string, unknown> | undefined => {
  if (!isRecord(event)) {
    return undefined;
  }

  const requestContext = event['requestContext'];
  if (!isRecord(requestContext)) {
    return undefined;
  }

  const authorizer = requestContext['authorizer'];
  if (!isRecord(authorizer)) {
    return undefined;
  }

  const jwt = authorizer['jwt'];
  if (!isRecord(jwt)) {
    return undefined;
  }

  const claims = jwt['claims'];
  return isRecord(claims) ? claims : undefined;
};

/**
 * Normalizes the `cognito:groups` claim.
 *
 * Accepts the canonical `string[]` shape and the bracketed whitespace-separated
 * string form that API Gateway may produce for array claims, for example
 * `"[teachers admins]"`. Commas are part of a group name, never separators, so
 * `"[admins,teachers]"` is a single group named `admins,teachers`.
 * Unsupported or malformed values yield an empty list so authorization fails
 * closed.
 */
const parseGroupsClaim = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    const groups: string[] = [];
    for (const group of value) {
      if (typeof group !== 'string') {
        return [];
      }
      groups.push(group);
    }
    return groups;
  }

  if (typeof value !== 'string') {
    return [];
  }

  const match = BRACKETED_GROUPS_PATTERN.exec(value);
  if (match === null) {
    return [];
  }

  const inner = match[1] ?? '';
  return inner
    .split(GROUP_SEPARATOR_PATTERN)
    .filter((group) => group.length > 0);
};

/**
 * Pure authorization check for teacher-only operations.
 *
 * API Gateway validates the JWT signature, issuer and audience before the
 * Lambda runs, but it accepts both Cognito ID and access tokens, and it does
 * not authorize by group. This function therefore requires an access token
 * (`token_use === 'access'`) and exact membership in the teachers group.
 *
 * The event is typed as `unknown` on purpose: claims must be validated at
 * runtime instead of being trusted through a cast. The function never logs or
 * returns token contents.
 */
export const authorizeTeacherAccess = (
  event: unknown,
): TeacherAuthorizationResult => {
  const claims = extractJwtClaims(event);
  if (claims === undefined) {
    return {
      authorized: false,
      statusCode: 401,
      reason: 'invalid-authorizer-context',
    };
  }

  if (claims['token_use'] !== 'access') {
    return {
      authorized: false,
      statusCode: 401,
      reason: 'invalid-token-use',
    };
  }

  const groups = parseGroupsClaim(claims['cognito:groups']);
  if (!groups.includes(TEACHERS_GROUP_NAME)) {
    return {
      authorized: false,
      statusCode: 403,
      reason: 'missing-teachers-group',
    };
  }

  return { authorized: true };
};
