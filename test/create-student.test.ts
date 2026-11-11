import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildCreateStudentHandler } from '../src/handlers/create-student';
import type { StudentsRepository } from '../src/students/repository';
import type { Student } from '../src/students/types';
import { createApiEvent } from './helpers/events';

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

  it('supports a base64-encoded JSON body', async () => {
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

    const response = await handler(createApiEvent({ body }));

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
      createApiEvent({
        body: JSON.stringify({
          fullName: 'Іван Петренко',
          group: 'ІП-21',
        }),
      }),
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
});
