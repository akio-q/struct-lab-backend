import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handler as createStudentHandler } from '../src/handlers/create-student';
import { handler as listStudentsHandler } from '../src/handlers/list-students';
import { createApiEvent } from './helpers/events';

const ORIGINAL_TABLE_NAME = process.env.STUDENTS_TABLE_NAME;

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

  it('returns a generic 500 from the create handler without leaking internals', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const response = await createStudentHandler(
      createApiEvent({
        body: JSON.stringify({ fullName: 'Іван Петренко', group: 'ІП-21' }),
      }),
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

  it('returns a generic 500 from the list handler without leaking internals', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const response = await listStudentsHandler(createApiEvent());

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
