import { describe, expect, it } from 'vitest';

import {
  decodeCursor,
  encodeCursor,
  MAX_CURSOR_LENGTH,
} from '../src/students/cursor';

const VALID_UUID_V4 = '3f1d2c9b-7a44-4e1c-9f2a-0d2c8e5b1a77';

const encodeJson = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

describe('student cursor', () => {
  it('round-trips a valid DynamoDB key with a UUID v4 student id', () => {
    const cursor = { studentId: VALID_UUID_V4 };

    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('accepts an uppercase UUID v4', () => {
    const cursor = { studentId: VALID_UUID_V4.toUpperCase() };

    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it.each([
    '3f1d2c9b-7a44-4e1c-8f2a-0d2c8e5b1a77',
    '3f1d2c9b-7a44-4e1c-9f2a-0d2c8e5b1a77',
    '3f1d2c9b-7a44-4e1c-af2a-0d2c8e5b1a77',
    '3f1d2c9b-7a44-4e1c-bf2a-0d2c8e5b1a77',
  ])('accepts UUID v4 with variant %s', (studentId) => {
    expect(decodeCursor(encodeCursor({ studentId }))).toEqual({ studentId });
  });

  it('produces a URL-safe string', () => {
    const encoded = encodeCursor({ studentId: VALID_UUID_V4 });

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['empty string', ''],
    ['invalid base64url characters', 'cursor=='],
    ['plain text', 'not-a-cursor'],
    ['oversized cursor', 'a'.repeat(MAX_CURSOR_LENGTH + 1)],
    ['invalid JSON', Buffer.from('not-json', 'utf8').toString('base64url')],
    ['JSON array', encodeJson([])],
    ['JSON string', encodeJson(VALID_UUID_V4)],
    ['empty object', encodeJson({})],
    ['wrong key', encodeJson({ other: VALID_UUID_V4 })],
    [
      'extra key',
      encodeJson({ studentId: VALID_UUID_V4, extra: true }),
    ],
    ['non-string id', encodeJson({ studentId: 42 })],
    ['empty id', encodeJson({ studentId: '' })],
    ['non-UUID id', encodeJson({ studentId: 'student-1' })],
    [
      'UUID v1',
      encodeJson({ studentId: '3f1d2c9b-7a44-1e1c-9f2a-0d2c8e5b1a77' }),
    ],
    [
      'UUID with invalid variant nibble',
      encodeJson({ studentId: '3f1d2c9b-7a44-4e1c-0f2a-0d2c8e5b1a77' }),
    ],
    [
      'UUID with wrong length',
      encodeJson({ studentId: '3f1d2c9b-7a44-4e1c-9f2a-0d2c8e5b1a7' }),
    ],
  ])('rejects %s', (_caseName, cursor) => {
    expect(decodeCursor(cursor)).toBeUndefined();
  });
});
