import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildCreateStudentHandler } from '../src/handlers/create-student';
import type { StudentsRepository } from '../src/students/repository';
import type { Student } from '../src/students/types';
import {
  createApiEvent,
  createAuthenticatedApiEvent,
} from './helpers/events';

const VALID_BODY = JSON.stringify({
  fullName: 'Іван Петренко',
  group: 'ІП-21',
});

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

  it('creates a student and returns 201 with the stored record', async () => {
    const { repository, createStudent } = buildRepository();
    const handler = buildCreateStudentHandler(repository);

    const response = await handler(
      createAuthenticatedApiEvent({
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

  it('supports a base64-encoded JSON body', async () => {
    const { repository, createStudent } = buildRepository();
    const handler = buildCreateStudentHandler(repository);
    const body = Buffer.from(
      JSON.stringify({ fullName: 'Марія Коваль', group: 'ІП-22' }),
      'utf8',
    ).toString('base64');

    const response = await handler(
      createAuthenticatedApiEvent({ body, isBase64Encoded: true }),
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
  ])('returns 400 for %s', async (_caseName, body) => {
    const { repository, createStudent } = buildRepository();
    const handler = buildCreateStudentHandler(repository);

    const response = await handler(createAuthenticatedApiEvent({ body }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body ?? 'null')).toHaveProperty('error');
    expect(createStudent).not.toHaveBeenCalled();
  });

  it('returns a generic 500 and does not log PII when DynamoDB fails', async () => {
    const { repository, createStudent } = buildRepository();
    createStudent.mockRejectedValueOnce(new Error('DynamoDB unavailable'));
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const handler = buildCreateStudentHandler(repository);

    const response = await handler(
      createAuthenticatedApiEvent({ body: VALID_BODY }),
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
  });

  describe('authorization', () => {
    it('returns 401 and does not call the repository without an authorizer context', async () => {
      const { repository, createStudent } = buildRepository();
      const handler = buildCreateStudentHandler(repository);

      const response = await handler(createApiEvent({ body: VALID_BODY }));

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body ?? 'null')).toEqual({
        error: 'Unauthorized',
      });
      expect(createStudent).not.toHaveBeenCalled();
    });

    it('returns 401 and does not call the repository for an ID token', async () => {
      const { repository, createStudent } = buildRepository();
      const handler = buildCreateStudentHandler(repository);

      const response = await handler(
        createAuthenticatedApiEvent(
          { body: VALID_BODY },
          { token_use: 'id', 'cognito:groups': ['teachers'] },
        ),
      );

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body ?? 'null')).toEqual({
        error: 'Unauthorized',
      });
      expect(createStudent).not.toHaveBeenCalled();
    });

    it('returns 403 and does not call the repository without the teachers group', async () => {
      const { repository, createStudent } = buildRepository();
      const handler = buildCreateStudentHandler(repository);

      const response = await handler(
        createAuthenticatedApiEvent(
          { body: VALID_BODY },
          { token_use: 'access', 'cognito:groups': ['students'] },
        ),
      );

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body ?? 'null')).toEqual({
        error: 'Forbidden',
      });
      expect(createStudent).not.toHaveBeenCalled();
    });

    it('returns 401 before body validation when unauthenticated', async () => {
      const { repository, createStudent } = buildRepository();
      const handler = buildCreateStudentHandler(repository);

      const response = await handler(
        createApiEvent({ body: '{"fullName":' }),
      );

      expect(response.statusCode).toBe(401);
      expect(createStudent).not.toHaveBeenCalled();
    });

    it('returns 403 before body validation without the teachers group', async () => {
      const { repository, createStudent } = buildRepository();
      const handler = buildCreateStudentHandler(repository);

      const response = await handler(
        createAuthenticatedApiEvent(
          { body: '{"fullName":' },
          { token_use: 'access', 'cognito:groups': [] },
        ),
      );

      expect(response.statusCode).toBe(403);
      expect(createStudent).not.toHaveBeenCalled();
    });

    it('does not log tokens, claims, or PII when denying access', async () => {
      const { repository, createStudent } = buildRepository();
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const handler = buildCreateStudentHandler(repository);

      const response = await handler(
        createAuthenticatedApiEvent(
          { body: VALID_BODY },
          {
            token_use: 'id',
            'cognito:groups': ['teachers'],
            email: 'teacher@example.com',
            token: 'secret-token-value',
            fullName: 'Іван Петренко',
          },
        ),
      );

      expect(response.statusCode).toBe(401);
      expect(createStudent).not.toHaveBeenCalled();
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });
});
