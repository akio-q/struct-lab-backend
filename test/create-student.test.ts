import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildCreateStudentHandler } from '../src/handlers/create-student';
import type { StudentsRepository } from '../src/students/repository';
import type { Student } from '../src/students/types';
import { MAX_CREATE_STUDENT_BODY_BYTES } from '../src/students/validation';
import {
  createApiEvent,
  createAuthenticatedApiEvent,
} from './helpers/events';

const VALID_BODY = JSON.stringify({
  fullName: 'Іван Петренко',
  group: 'ІП-21',
});

/**
 * Builds a valid request body with an ignored padding field so tests can
 * exercise exact byte boundaries without changing student field validation.
 */
const buildBodyOfSize = (byteLength: number): string => {
  const base = JSON.stringify({
    fullName: 'Іван Петренко',
    group: 'ІП-21',
    padding: '',
  });
  const paddingLength = byteLength - Buffer.byteLength(base, 'utf8');

  if (paddingLength < 0) {
    throw new Error(`Requested body size is too small: ${byteLength}`);
  }

  return JSON.stringify({
    fullName: 'Іван Петренко',
    group: 'ІП-21',
    padding: 'x'.repeat(paddingLength),
  });
};

const buildRepository = (): {
  repository: StudentsRepository;
  createStudent: ReturnType<typeof vi.fn>;
} => {
  const createStudent = vi.fn(async (): Promise<void> => undefined);
  const repository: StudentsRepository = {
    createStudent,
    listStudents: vi.fn(async () => ({ items: [] })),
  };

  return { repository, createStudent };
};

describe('POST /students handler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a student from a public request without a JWT context', async () => {
    const { repository, createStudent } = buildRepository();
    const handler = buildCreateStudentHandler(repository);

    const response = await handler(
      createApiEvent({
        body: JSON.stringify({
          fullName: '  Іван Петренко  ',
          group: '  ІП-21  ',
        }),
      }),
    );

    expect(response.statusCode).toBe(201);
    expect(response.headers).toMatchObject({
      'content-type': 'application/json',
    });

    const student = JSON.parse(response.body ?? 'null') as Student;
    expect(student).toMatchObject({
      fullName: 'Іван Петренко',
      group: 'ІП-21',
    });
    expect(student.studentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(new Date(student.createdAt).toISOString()).toBe(student.createdAt);
    expect(createStudent).toHaveBeenCalledTimes(1);
    expect(createStudent).toHaveBeenCalledWith(student);
  });

  it('supports a base64-encoded JSON body from a public request', async () => {
    const { repository, createStudent } = buildRepository();
    const handler = buildCreateStudentHandler(repository);
    const body = Buffer.from(
      JSON.stringify({ fullName: 'Марія Коваль', group: 'ІП-22' }),
      'utf8',
    ).toString('base64');

    const response = await handler(
      createApiEvent({ body, isBase64Encoded: true }),
    );

    expect(response.statusCode).toBe(201);
    expect(createStudent).toHaveBeenCalledTimes(1);
  });

  it('does not require the teachers group to register a student', async () => {
    const { repository, createStudent } = buildRepository();
    const handler = buildCreateStudentHandler(repository);

    const response = await handler(
      createAuthenticatedApiEvent(
        { body: VALID_BODY },
        {
          token_use: 'access',
          'cognito:groups': ['students'],
          email: 'student@example.com',
          token: 'secret-token-value',
        },
      ),
    );

    expect(response.statusCode).toBe(201);
    expect(createStudent).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing body', undefined],
    ['malformed JSON', '{"fullName":'],
    ['missing fullName', JSON.stringify({ group: 'ІП-21' })],
    ['missing group', JSON.stringify({ fullName: 'Іван Петренко' })],
    [
      'too long fullName',
      JSON.stringify({ fullName: 'a'.repeat(201), group: 'ІП-21' }),
    ],
  ])('returns 400 for %s from a public request', async (_caseName, body) => {
    const { repository, createStudent } = buildRepository();
    const handler = buildCreateStudentHandler(repository);

    const response = await handler(createApiEvent({ body }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body ?? 'null')).toHaveProperty('error');
    expect(createStudent).not.toHaveBeenCalled();
  });

  it.each([
    ['missing header', undefined],
    ['empty headers', {}],
    ['text/plain', { 'content-type': 'text/plain' }],
    [
      'form-urlencoded',
      { 'content-type': 'application/x-www-form-urlencoded' },
    ],
    ['json-patch', { 'content-type': 'application/json-patch+json' }],
  ])('returns 415 for %s', async (_caseName, headers) => {
    const { repository, createStudent } = buildRepository();
    const handler = buildCreateStudentHandler(repository);

    const response = await handler(
      createApiEvent({ body: VALID_BODY, headers }),
    );

    expect(response.statusCode).toBe(415);
    expect(JSON.parse(response.body ?? 'null')).toEqual({
      error: 'Content-Type must be application/json',
    });
    expect(createStudent).not.toHaveBeenCalled();
  });

  it.each([
    ['header value casing', { 'content-type': 'Application/JSON' }],
    [
      'header name and charset casing',
      { 'Content-Type': 'Application/JSON; Charset=UTF-8' },
    ],
    ['lowercase charset', { 'content-type': 'application/json;charset=utf-8' }],
  ])('accepts JSON Content-Type with %s', async (_caseName, headers) => {
    const { repository, createStudent } = buildRepository();
    const handler = buildCreateStudentHandler(repository);

    const response = await handler(
      createApiEvent({ body: VALID_BODY, headers }),
    );

    expect(response.statusCode).toBe(201);
    expect(createStudent).toHaveBeenCalledTimes(1);
  });

  it.each([4095, 4096])(
    'accepts a body of exactly %i decoded bytes',
    async (byteLength) => {
      const { repository, createStudent } = buildRepository();
      const handler = buildCreateStudentHandler(repository);
      const body = buildBodyOfSize(byteLength);

      expect(Buffer.byteLength(body, 'utf8')).toBe(byteLength);

      const response = await handler(createApiEvent({ body }));

      expect(response.statusCode).toBe(201);
      expect(createStudent).toHaveBeenCalledTimes(1);
    },
  );

  it('returns 413 for a body one byte over the limit', async () => {
    const { repository, createStudent } = buildRepository();
    const handler = buildCreateStudentHandler(repository);
    const body = buildBodyOfSize(MAX_CREATE_STUDENT_BODY_BYTES + 1);

    expect(Buffer.byteLength(body, 'utf8')).toBe(
      MAX_CREATE_STUDENT_BODY_BYTES + 1,
    );

    const response = await handler(createApiEvent({ body }));

    expect(response.statusCode).toBe(413);
    expect(JSON.parse(response.body ?? 'null')).toEqual({
      error: `Request body must be at most ${MAX_CREATE_STUDENT_BODY_BYTES} bytes`,
    });
    expect(createStudent).not.toHaveBeenCalled();
  });

  it('measures multibyte UTF-8 bytes rather than string length', async () => {
    const { repository, createStudent } = buildRepository();
    const handler = buildCreateStudentHandler(repository);
    const body = JSON.stringify({
      fullName: 'Іван Петренко',
      group: 'ІП-21',
      padding: 'ї'.repeat(2100),
    });

    expect(body.length).toBeLessThan(MAX_CREATE_STUDENT_BODY_BYTES);
    expect(Buffer.byteLength(body, 'utf8')).toBeGreaterThan(
      MAX_CREATE_STUDENT_BODY_BYTES,
    );

    const response = await handler(createApiEvent({ body }));

    expect(response.statusCode).toBe(413);
    expect(createStudent).not.toHaveBeenCalled();
  });

  it('returns 413 for an oversized base64-encoded body', async () => {
    const { repository, createStudent } = buildRepository();
    const handler = buildCreateStudentHandler(repository);
    const body = Buffer.from(
      buildBodyOfSize(MAX_CREATE_STUDENT_BODY_BYTES + 1),
      'utf8',
    ).toString('base64');

    const response = await handler(
      createApiEvent({ body, isBase64Encoded: true }),
    );

    expect(response.statusCode).toBe(413);
    expect(createStudent).not.toHaveBeenCalled();
  });

  it('checks Content-Type before body size and JSON parsing', async () => {
    const { repository, createStudent } = buildRepository();
    const handler = buildCreateStudentHandler(repository);

    const response = await handler(
      createApiEvent({
        body: '{"fullName":',
        headers: { 'content-type': 'text/plain' },
      }),
    );

    expect(response.statusCode).toBe(415);
    expect(createStudent).not.toHaveBeenCalled();
  });

  it('checks body size before JSON parsing', async () => {
    const { repository, createStudent } = buildRepository();
    const handler = buildCreateStudentHandler(repository);

    const response = await handler(
      createApiEvent({ body: 'x'.repeat(MAX_CREATE_STUDENT_BODY_BYTES + 1) }),
    );

    expect(response.statusCode).toBe(413);
    expect(createStudent).not.toHaveBeenCalled();
  });

  it('does not log request bodies for rejected requests', async () => {
    const { repository } = buildRepository();
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const handler = buildCreateStudentHandler(repository);
    const sensitiveBody = JSON.stringify({
      fullName: 'Таємне Імʼя',
      group: 'СЕКРЕТНА ГРУПА',
      padding: 'x'.repeat(MAX_CREATE_STUDENT_BODY_BYTES),
    });

    const oversized = await handler(
      createApiEvent({ body: sensitiveBody }),
    );
    const unsupported = await handler(
      createApiEvent({
        body: sensitiveBody,
        headers: { 'content-type': 'text/plain' },
      }),
    );

    expect(oversized.statusCode).toBe(413);
    expect(unsupported.statusCode).toBe(415);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('returns a generic 500 and does not log PII or tokens when DynamoDB fails', async () => {
    const { repository, createStudent } = buildRepository();
    createStudent.mockRejectedValueOnce(new Error('DynamoDB unavailable'));
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const handler = buildCreateStudentHandler(repository);

    const response = await handler(
      createAuthenticatedApiEvent(
        { body: VALID_BODY },
        {
          token_use: 'access',
          'cognito:groups': ['teachers'],
          email: 'teacher@example.com',
          token: 'secret-token-value',
        },
      ),
    );

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body ?? 'null')).toEqual({
      error: 'Internal server error',
    });
    expect(consoleSpy).toHaveBeenCalled();

    const loggedText = consoleSpy.mock.calls
      .flat()
      .map((value) => String(value))
      .join(' ');
    expect(loggedText).not.toContain('Іван Петренко');
    expect(loggedText).not.toContain('ІП-21');
    expect(loggedText).not.toContain('teacher@example.com');
    expect(loggedText).not.toContain('secret-token-value');
  });
});
