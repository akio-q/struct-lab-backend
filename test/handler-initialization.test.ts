import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handler as createStudentHandler } from '../src/handlers/create-student';
import { handler as listStudentsHandler } from '../src/handlers/list-students';
import {
  createApiEvent,
  createAuthenticatedApiEvent,
} from './helpers/events';

const ORIGINAL_TABLE_NAME = process.env.STUDENTS_TABLE_NAME;

const CREATE_BODY = JSON.stringify({
  fullName: 'Іван Петренко',
  group: 'ІП-21',
});

const restoreTableName = (): void => {
  if (ORIGINAL_TABLE_NAME === undefined) {
    delete process.env.STUDENTS_TABLE_NAME;
  } else {
    process.env.STUDENTS_TABLE_NAME = ORIGINAL_TABLE_NAME;
  }
};

describe('default Lambda handlers without STUDENTS_TABLE_NAME', () => {
  beforeEach(() => {
    delete process.env.STUDENTS_TABLE_NAME;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreTableName();
  });

  it('returns 401 from the create handler without attempting initialization', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const response = await createStudentHandler(
      createApiEvent({ body: CREATE_BODY }),
    );

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body ?? 'null')).toEqual({
      error: 'Unauthorized',
    });
    expect(response.body).not.toContain('STUDENTS_TABLE_NAME');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('returns 401 from the list handler without attempting initialization', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const response = await listStudentsHandler(createApiEvent());

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body ?? 'null')).toEqual({
      error: 'Unauthorized',
    });
    expect(response.body).not.toContain('STUDENTS_TABLE_NAME');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('returns a generic 500 from the create handler for authenticated requests without leaking internals', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const response = await createStudentHandler(
      createAuthenticatedApiEvent({ body: CREATE_BODY }),
    );

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body ?? 'null')).toEqual({
      error: 'Internal server error',
    });
    expect(response.body).not.toContain('STUDENTS_TABLE_NAME');
    expect(consoleSpy).toHaveBeenCalled();

    const loggedText = consoleSpy.mock.calls
      .flat()
      .map((value) => String(value))
      .join(' ');
    expect(loggedText).not.toContain('STUDENTS_TABLE_NAME');
    expect(loggedText).not.toContain('Іван Петренко');
  });

  it('returns a generic 500 from the list handler for authenticated requests without leaking internals', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const response = await listStudentsHandler(
      createAuthenticatedApiEvent(),
    );

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body ?? 'null')).toEqual({
      error: 'Internal server error',
    });
    expect(response.body).not.toContain('STUDENTS_TABLE_NAME');
    expect(consoleSpy).toHaveBeenCalled();

    const loggedText = consoleSpy.mock.calls
      .flat()
      .map((value) => String(value))
      .join(' ');
    expect(loggedText).not.toContain('STUDENTS_TABLE_NAME');
  });
});
