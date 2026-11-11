import { describe, expect, it } from 'vitest';

import {
  MAX_FULL_NAME_LENGTH,
  MAX_GROUP_LENGTH,
  MAX_PAGE_LIMIT,
  parseCreateStudentInput,
  parsePaginationQuery,
} from '../src/students/validation';

describe('parseCreateStudentInput', () => {
  it('trims valid fields and keeps extra fields out of the result', () => {
    const result = parseCreateStudentInput(
      JSON.stringify({
        fullName: '  Іван Петренко  ',
        group: '  ІП-21  ',
        ignored: 'value',
      }),
    );

    expect(result).toEqual({
      ok: true,
      value: { fullName: 'Іван Петренко', group: 'ІП-21' },
    });
  });

  it('accepts values at the maximum length', () => {
    const result = parseCreateStudentInput(
      JSON.stringify({
        fullName: 'a'.repeat(MAX_FULL_NAME_LENGTH),
        group: 'b'.repeat(MAX_GROUP_LENGTH),
      }),
    );

    expect(result.ok).toBe(true);
  });

  it.each([
    ['missing body', undefined],
    ['empty body', ''],
    ['whitespace-only body', '   '],
    ['malformed JSON', '{"fullName":'],
    ['JSON array', '[]'],
    ['JSON null', 'null'],
    ['JSON string', '"student"'],
    ['missing fullName', JSON.stringify({ group: 'ІП-21' })],
    ['non-string fullName', JSON.stringify({ fullName: 42, group: 'ІП-21' })],
    ['whitespace fullName', JSON.stringify({ fullName: '   ', group: 'ІП-21' })],
    [
      'too long fullName',
      JSON.stringify({
        fullName: 'a'.repeat(MAX_FULL_NAME_LENGTH + 1),
        group: 'ІП-21',
      }),
    ],
    ['missing group', JSON.stringify({ fullName: 'Іван Петренко' })],
    [
      'non-string group',
      JSON.stringify({ fullName: 'Іван Петренко', group: 21 }),
    ],
    [
      'whitespace group',
      JSON.stringify({ fullName: 'Іван Петренко', group: '   ' }),
    ],
    [
      'too long group',
      JSON.stringify({
        fullName: 'Іван Петренко',
        group: 'b'.repeat(MAX_GROUP_LENGTH + 1),
      }),
    ],
  ])('rejects %s', (_caseName, body) => {
    const result = parseCreateStudentInput(body);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual(expect.any(String));
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});

describe('parsePaginationQuery', () => {
  it('uses the default limit when query parameters are missing', () => {
    expect(parsePaginationQuery(undefined)).toEqual({
      ok: true,
      value: { limit: 20 },
    });
    expect(parsePaginationQuery(null)).toEqual({
      ok: true,
      value: { limit: 20 },
    });
    expect(parsePaginationQuery({})).toEqual({
      ok: true,
      value: { limit: 20 },
    });
  });

  it('accepts the minimum and maximum limits', () => {
    expect(parsePaginationQuery({ limit: '1' })).toEqual({
      ok: true,
      value: { limit: 1 },
    });
    expect(parsePaginationQuery({ limit: String(MAX_PAGE_LIMIT) })).toEqual({
      ok: true,
      value: { limit: MAX_PAGE_LIMIT },
    });
  });

  it('keeps a provided cursor for the handler to decode', () => {
    expect(parsePaginationQuery({ limit: '50', cursor: 'opaque-cursor' })).toEqual(
      {
        ok: true,
        value: { limit: 50, cursor: 'opaque-cursor' },
      },
    );
  });

  it.each(['0', '101', 'abc', '1.5', '-1', ''])(
    'rejects invalid limit %j',
    (limit) => {
      const result = parsePaginationQuery({ limit });

      expect(result.ok).toBe(false);
    },
  );

  it('rejects an empty cursor', () => {
    const result = parsePaginationQuery({ cursor: '' });

    expect(result.ok).toBe(false);
  });
});
