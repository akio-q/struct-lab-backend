import { randomUUID } from 'node:crypto';

import { getErrorName } from '../lib/errors';
import { jsonResponse } from '../lib/http';
import type { HttpHandler } from '../lib/http';
import { createDynamoDbStudentsRepository } from '../students/repository';
import type { StudentsRepository } from '../students/repository';
import type { Student } from '../students/types';
import { parseCreateStudentInput } from '../students/validation';

/**
 * Factory with dependency injection: tests pass a fake repository, while the
 * deployed Lambda uses the default DynamoDB repository below.
 */
export const buildCreateStudentHandler = (
  repository: StudentsRepository,
): HttpHandler => {
  return async (event) => {
    const rawBody =
      event.isBase64Encoded && event.body
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body;

    const parsed = parseCreateStudentInput(rawBody);
    if (!parsed.ok) {
      return jsonResponse(400, { error: parsed.error });
    }

    const student: Student = {
      studentId: randomUUID(),
      fullName: parsed.value.fullName,
      group: parsed.value.group,
      createdAt: new Date().toISOString(),
    };

    try {
      await repository.createStudent(student);
    } catch (error) {
      // Never log the request body or the student record: it contains PII.
      console.error('Failed to create student', getErrorName(error));
      return jsonResponse(500, { error: 'Internal server error' });
    }

    return jsonResponse(201, student);
  };
};

const repositoryInitializationErrorHandler: HttpHandler = async () =>
  jsonResponse(500, { error: 'Internal server error' });

let defaultHandler: HttpHandler | undefined;

/**
 * Lazily creates the production handler. Initialization errors (for example a
 * missing STUDENTS_TABLE_NAME) must never reach the client or include
 * internal details in the response.
 */
const getDefaultHandler = (): HttpHandler => {
  if (defaultHandler !== undefined) {
    return defaultHandler;
  }

  try {
    defaultHandler = buildCreateStudentHandler(
      createDynamoDbStudentsRepository(),
    );

    return defaultHandler;
  } catch (error) {
    console.error(
      'Failed to initialize students repository',
      getErrorName(error),
    );

    return repositoryInitializationErrorHandler;
  }
};

export const handler: HttpHandler = (event) => getDefaultHandler()(event);
