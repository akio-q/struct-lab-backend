import { describe, expect, it } from 'vitest';

import { authorizeTeacherAccess } from '../src/lib/auth';

const UNAUTHORIZED = {
  authorized: false,
  statusCode: 401,
  reason: 'invalid-authorizer-context',
} as const;

const INVALID_TOKEN_USE = {
  authorized: false,
  statusCode: 401,
  reason: 'invalid-token-use',
} as const;

const FORBIDDEN = {
  authorized: false,
  statusCode: 403,
  reason: 'missing-teachers-group',
} as const;

const createEvent = (claims: unknown): unknown => ({
  requestContext: {
    authorizer: {
      jwt: {
        claims,
        scopes: [],
      },
    },
  },
});

const createClaims = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  token_use: 'access',
  'cognito:groups': ['teachers'],
  ...overrides,
});

const createClaimsWithoutGroups = (): Record<string, unknown> => ({
  token_use: 'access',
});

describe('authorizeTeacherAccess', () => {
  describe('missing or malformed authorizer context', () => {
    const cases: Array<[string, unknown]> = [
      ['a null event', null],
      ['an undefined event', undefined],
      ['a non-object event', 'not-an-event'],
      ['an array event', []],
      ['an event without requestContext', {}],
      [
        'a requestContext without an authorizer',
        { requestContext: {} },
      ],
      [
        'an authorizer without a jwt object',
        { requestContext: { authorizer: {} } },
      ],
      [
        'a jwt object without claims',
        { requestContext: { authorizer: { jwt: {} } } },
      ],
      [
        'claims that are not an object',
        { requestContext: { authorizer: { jwt: { claims: 'not-claims' } } } },
      ],
      [
        'null claims',
        { requestContext: { authorizer: { jwt: { claims: null } } } },
      ],
      [
        'array claims',
        { requestContext: { authorizer: { jwt: { claims: [] } } } },
      ],
    ];

    for (const [description, event] of cases) {
      it(`returns 401 for ${description}`, () => {
        expect(authorizeTeacherAccess(event)).toEqual(UNAUTHORIZED);
      });
    }
  });

  describe('token type validation', () => {
    const cases: Array<[string, unknown]> = [
      ['a missing token_use', createClaims({ token_use: undefined })],
      ['an ID token', createClaims({ token_use: 'id' })],
      ['a refresh token', createClaims({ token_use: 'refresh' })],
      ['an empty token_use', createClaims({ token_use: '' })],
      ['a numeric token_use', createClaims({ token_use: 1 })],
      ['a boolean token_use', createClaims({ token_use: true })],
      ['a null token_use', createClaims({ token_use: null })],
    ];

    for (const [description, claims] of cases) {
      it(`returns 401 for ${description}`, () => {
        expect(authorizeTeacherAccess(createEvent(claims))).toEqual(
          INVALID_TOKEN_USE,
        );
      });
    }

    it('rejects an ID token even when it contains the teachers group', () => {
      const claims = createClaims({
        token_use: 'id',
        'cognito:groups': ['teachers'],
      });

      expect(authorizeTeacherAccess(createEvent(claims))).toEqual(
        INVALID_TOKEN_USE,
      );
    });
  });

  describe('teacher group membership', () => {
    it('authorizes an access token with the teachers group array', () => {
      expect(
        authorizeTeacherAccess(createEvent(createClaims())),
      ).toEqual({ authorized: true });
    });

    it('authorizes the teachers group among multiple groups', () => {
      const claims = createClaims({
        'cognito:groups': ['admins', 'teachers', 'students'],
      });

      expect(authorizeTeacherAccess(createEvent(claims))).toEqual({
        authorized: true,
      });
    });

    it('authorizes a bracketed serialized teachers group', () => {
      const claims = createClaims({ 'cognito:groups': '[teachers]' });

      expect(authorizeTeacherAccess(createEvent(claims))).toEqual({
        authorized: true,
      });
    });

    it('authorizes teachers among bracketed whitespace-separated groups', () => {
      const claims = createClaims({
        'cognito:groups': '[admins teachers students]',
      });

      expect(authorizeTeacherAccess(createEvent(claims))).toEqual({
        authorized: true,
      });
    });
  });

  describe('forbidden access tokens', () => {
    const cases: Array<[string, unknown]> = [
      ['a missing groups claim', createClaimsWithoutGroups()],
      ['an empty groups array', createClaims({ 'cognito:groups': [] })],
      ['an empty bracketed groups string', createClaims({ 'cognito:groups': '[]' })],
      ['only other groups in an array', createClaims({ 'cognito:groups': ['admins', 'students'] })],
      ['only other groups in a serialized string', createClaims({ 'cognito:groups': '[admins students]' })],
      ['a case-mismatched group', createClaims({ 'cognito:groups': ['Teachers'] })],
      ['an upper-case group', createClaims({ 'cognito:groups': ['TEACHERS'] })],
      ['a group named not-teachers', createClaims({ 'cognito:groups': ['not-teachers'] })],
      ['a group named teachers-extra', createClaims({ 'cognito:groups': ['teachers-extra'] })],
      ['a group named xteachers', createClaims({ 'cognito:groups': ['xteachers'] })],
      ['a comma-containing group', createClaims({ 'cognito:groups': ['admins,teachers'] })],
      ['a serialized comma-containing group', createClaims({ 'cognito:groups': '[admins,teachers]' })],
      ['a serialized not,teachers group', createClaims({ 'cognito:groups': '[not,teachers]' })],
      ['a serialized teachers,admins group', createClaims({ 'cognito:groups': '[teachers,admins]' })],
      ['a numeric groups claim', createClaims({ 'cognito:groups': 42 })],
      ['a boolean groups claim', createClaims({ 'cognito:groups': true })],
      ['an object groups claim', createClaims({ 'cognito:groups': { teachers: true } })],
      ['a null groups claim', createClaims({ 'cognito:groups': null })],
      ['an array with a non-string group', createClaims({ 'cognito:groups': ['teachers', 42] })],
      ['an unsupported plain groups string', createClaims({ 'cognito:groups': 'teachers' })],
    ];

    for (const [description, claims] of cases) {
      it(`returns 403 for ${description}`, () => {
        expect(authorizeTeacherAccess(createEvent(claims))).toEqual(FORBIDDEN);
      });
    }
  });
});
