import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildListStudentsHandler } from '../src/handlers/list-students';
import { encodeCursor, MAX_CURSOR_LENGTH } from '../src/students/cursor';
import type {
  ListStudentsResult,
  StudentsRepository,
} from '../src/students/repository';
import type { Student } from '../src/students/types';
import {
  createApiEvent,
  createAuthenticatedApiEvent,
} from './helpers/events';

const CURRENT_STUDENT_ID = '3f1d2c9b-7a44-4e1c-9f2a-0d2c8e5b1a77';
const NEXT_STUDENT_ID = '8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d';

const student: Student = {
  studentId: CURRENT_STUDENT_ID,
  fullName: 'Іван Петренко',
  group: 'ІП-21',
  createdAt: '2026-11-11T18:00:00.000Z',
};

const buildRepository = (): {
  repository: StudentsRepository;
  listStudents: ReturnType<typeof vi.fn>;
} => {
  const listStudents = vi.fn(
    async (): Promise<ListStudentsResult> => ({ items: [] }),
  );
  const repository: StudentsRepository = {
    createStudent: vi.fn(async () => undefined),
    listStudents,
  };

  return { repository, listStudents };
};

describe('GET /admin/students handler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the default limit and returns a page with nextCursor null', async () => {
    const { repository, listStudents } = buildRepository();
    listStudents.mockResolvedValueOnce({ items: [student] });
    const handler = buildListStudentsHandler(repository);

    const response = await handler(createAuthenticatedApiEvent());

    expect(response.statusCode).toBe(200);
    expect(listStudents).toHaveBeenCalledWith({ limit: 20 });
    expect(JSON.parse(response.body ?? 'null')).toEqual({
      items: [student],
      nextCursor: null,
    });
  });

  it('passes a valid limit to the repository', async () => {
    const { repository, listStudents } = buildRepository();
    const handler = buildListStudentsHandler(repository);

    const response = await handler(
      createAuthenticatedApiEvent({ queryStringParameters: { limit: '100' } }),
    );

    expect(response.statusCode).toBe(200);
    expect(listStudents).toHaveBeenCalledWith({ limit: 100 });
  });

  it('decodes the cursor and returns an opaque nextCursor', async () => {
    const { repository, listStudents } = buildRepository();
    listStudents.mockResolvedValueOnce({
      items: [student],
      lastEvaluatedKey: { studentId: NEXT_STUDENT_ID },
    });
    const handler = buildListStudentsHandler(repository);
    const cursor = encodeCursor({ studentId: CURRENT_STUDENT_ID });

    const response = await handler(
      createAuthenticatedApiEvent({
        queryStringParameters: { limit: '50', cursor },
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(listStudents).toHaveBeenCalledWith({
      limit: 50,
      exclusiveStartKey: { studentId: CURRENT_STUDENT_ID },
    });
    expect(JSON.parse(response.body ?? 'null')).toEqual({
      items: [student],
      nextCursor: encodeCursor({ studentId: NEXT_STUDENT_ID }),
    });
  });

  it.each(['0', '101', 'abc', '1.5', '-1', ''])(
    'returns 400 for invalid limit %j',
    async (limit) => {
      const { repository, listStudents } = buildRepository();
      const handler = buildListStudentsHandler(repository);

      const response = await handler(
        createAuthenticatedApiEvent({
          queryStringParameters: { limit },
        }),
      );

      expect(response.statusCode).toBe(400);
      expect(listStudents).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['malformed base64url', 'not-a-valid-cursor!'],
    ['oversized cursor', 'a'.repeat(MAX_CURSOR_LENGTH + 1)],
    [
      'JSON with a non-string id',
      Buffer.from(JSON.stringify({ studentId: 42 }), 'utf8').toString(
        'base64url',
      ),
    ],
    [
      'JSON with an unexpected key',
      Buffer.from(
        JSON.stringify({ other: CURRENT_STUDENT_ID }),
        'utf8',
      ).toString('base64url'),
    ],
    [
      'non-JSON payload',
      Buffer.from('not-json', 'utf8').toString('base64url'),
    ],
    [
      'student id that is not a UUID v4',
      Buffer.from(JSON.stringify({ studentId: 'student-1' }), 'utf8').toString(
        'base64url',
      ),
    ],
    [
      'UUID v1 student id',
      Buffer.from(
        JSON.stringify({
          studentId: '3f1d2c9b-7a44-1e1c-9f2a-0d2c8e5b1a77',
        }),
        'utf8',
      ).toString('base64url'),
    ],
  ])('returns 400 (not 500) for %s', async (_caseName, cursor) => {
    const { repository, listStudents } = buildRepository();
    const handler = buildListStudentsHandler(repository);

    const response = await handler(
      createAuthenticatedApiEvent({ queryStringParameters: { cursor } }),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body ?? 'null')).toHaveProperty('error');
    expect(listStudents).not.toHaveBeenCalled();
  });

  it('returns a generic 500 and does not log student data when DynamoDB fails', async () => {
    const { repository, listStudents } = buildRepository();
    listStudents.mockRejectedValueOnce(new Error('DynamoDB unavailable'));
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const handler = buildListStudentsHandler(repository);

    const response = await handler(createAuthenticatedApiEvent());

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
      const { repository, listStudents } = buildRepository();
      const handler = buildListStudentsHandler(repository);

      const response = await handler(createApiEvent());

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body ?? 'null')).toEqual({
        error: 'Unauthorized',
      });
      expect(listStudents).not.toHaveBeenCalled();
    });

    it('returns 401 and does not call the repository for an ID token', async () => {
      const { repository, listStudents } = buildRepository();
      const handler = buildListStudentsHandler(repository);

      const response = await handler(
        createAuthenticatedApiEvent(
          {},
          { token_use: 'id', 'cognito:groups': ['teachers'] },
        ),
      );

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body ?? 'null')).toEqual({
        error: 'Unauthorized',
      });
      expect(listStudents).not.toHaveBeenCalled();
    });

    it('returns 403 and does not call the repository without the teachers group', async () => {
      const { repository, listStudents } = buildRepository();
      const handler = buildListStudentsHandler(repository);

      const response = await handler(
        createAuthenticatedApiEvent(
          {},
          { token_use: 'access', 'cognito:groups': ['students'] },
        ),
      );

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body ?? 'null')).toEqual({
        error: 'Forbidden',
      });
      expect(listStudents).not.toHaveBeenCalled();
    });

    it('returns 401 before query validation when unauthenticated', async () => {
      const { repository, listStudents } = buildRepository();
      const handler = buildListStudentsHandler(repository);

      const response = await handler(
        createApiEvent({ queryStringParameters: { limit: 'abc' } }),
      );

      expect(response.statusCode).toBe(401);
      expect(listStudents).not.toHaveBeenCalled();
    });

    it('returns 403 before cursor validation without the teachers group', async () => {
      const { repository, listStudents } = buildRepository();
      const handler = buildListStudentsHandler(repository);

      const response = await handler(
        createAuthenticatedApiEvent(
          { queryStringParameters: { cursor: 'not-a-valid-cursor!' } },
          { token_use: 'access', 'cognito:groups': [] },
        ),
      );

      expect(response.statusCode).toBe(403);
      expect(listStudents).not.toHaveBeenCalled();
    });

    it('does not log tokens, claims, or PII when denying access', async () => {
      const { repository, listStudents } = buildRepository();
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const handler = buildListStudentsHandler(repository);

      const response = await handler(
        createAuthenticatedApiEvent(
          {},
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
      expect(listStudents).not.toHaveBeenCalled();
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });
});
