import { randomUUID } from 'node:crypto';

import { getErrorName } from '../lib/errors';
import {
  getHeader,
  isJsonContentType,
  jsonResponse,
  readRequestBody,
} from '../lib/http';
import type { HttpHandler } from '../lib/http';
import { createDynamoDbStudentsRepository } from '../students/repository';
import type { StudentsRepository } from '../students/repository';
import type { Student } from '../students/types';
import {
  MAX_CREATE_STUDENT_BODY_BYTES,
  parseCreateStudentInput,
} from '../students/validation';

/**
 * Public student registration. The handler validates the request, creates a
 * student record, and persists it; it does not require an authorizer context.
 */
const buildRepositoryHandler = (
  repository: StudentsRepository,
): HttpHandler => {
  return async (event) => {
    const contentType = getHeader(event.headers, 'content-type');
    if (!isJsonContentType(contentType)) {
      return jsonResponse(415, {
        error: 'Content-Type must be application/json',
      });
    }

    const requestBody = readRequestBody(event);
    if (requestBody.byteLength > MAX_CREATE_STUDENT_BODY_BYTES) {
      return jsonResponse(413, {
        error: `Request body must be at most ${MAX_CREATE_STUDENT_BODY_BYTES} bytes`,
      });
    }

    const parsed = parseCreateStudentInput(requestBody.text);
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

/**
 * Factory with dependency injection: tests pass a fake repository, while the
 * deployed Lambda uses the default DynamoDB repository below. Registration is
 * public, so no authorization runs before validation or persistence.
 */
export const buildCreateStudentHandler = (
  repository: StudentsRepository,
): HttpHandler => buildRepositoryHandler(repository);

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
    defaultHandler = buildRepositoryHandler(
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
