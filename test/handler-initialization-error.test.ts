import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as StudentsRepositoryModule from '../src/students/repository';

vi.mock('../src/students/repository', async (importOriginal) => {
  const actual =
    await importOriginal<typeof StudentsRepositoryModule>();

  return {
    ...actual,
    createDynamoDbStudentsRepository: vi.fn(() => {
      throw new Error('failed to create DynamoDB repository');
    }),
  };
});

import { handler as createStudentHandler } from '../src/handlers/create-student';
import { handler as listStudentsHandler } from '../src/handlers/list-students';
import { createDynamoDbStudentsRepository } from '../src/students/repository';
import {
  createApiEvent,
  createAuthenticatedApiEvent,
} from './helpers/events';

const CREATE_BODY = JSON.stringify({
  fullName: 'Іван Петренко',
  group: 'ІП-21',
});

describe('default Lambda handlers when repository creation fails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not initialize the repository for unauthenticated create requests', async () => {
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
    expect(createDynamoDbStudentsRepository).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('does not initialize the repository for unauthenticated list requests', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const response = await listStudentsHandler(createApiEvent());

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body ?? 'null')).toEqual({
      error: 'Unauthorized',
    });
    expect(createDynamoDbStudentsRepository).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('returns a generic 500 from the create handler for authenticated requests without leaking details', async () => {
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
    expect(response.body).not.toContain('failed to create');
    expect(createDynamoDbStudentsRepository).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();

    const loggedText = consoleSpy.mock.calls
      .flat()
      .map((value) => String(value))
      .join(' ');
    expect(loggedText).not.toContain('failed to create DynamoDB repository');
    expect(loggedText).not.toContain('Іван Петренко');
  });

  it('returns a generic 500 from the list handler for authenticated requests without leaking details', async () => {
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
    expect(response.body).not.toContain('failed to create');
    expect(createDynamoDbStudentsRepository).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();

    const loggedText = consoleSpy.mock.calls
      .flat()
      .map((value) => String(value))
      .join(' ');
    expect(loggedText).not.toContain('failed to create DynamoDB repository');
  });
});
