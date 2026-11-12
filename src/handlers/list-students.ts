import { withTeacherAuthorization } from '../lib/auth';
import { getErrorName } from '../lib/errors';
import { jsonResponse } from '../lib/http';
import type { HttpHandler } from '../lib/http';
import { decodeCursor, encodeCursor } from '../students/cursor';
import { createDynamoDbStudentsRepository } from '../students/repository';
import type { StudentsRepository } from '../students/repository';
import type { StudentCursor } from '../students/types';
import { parsePaginationQuery } from '../students/validation';

/**
 * Business logic factory kept free of authorization so the production handler
 * can authorize before lazy repository initialization.
 */
const buildRepositoryHandler = (
  repository: StudentsRepository,
): HttpHandler => {
  return async (event) => {
    const parsed = parsePaginationQuery(event.queryStringParameters);
    if (!parsed.ok) {
      return jsonResponse(400, { error: parsed.error });
    }

    let exclusiveStartKey: StudentCursor | undefined;
    if (parsed.value.cursor !== undefined) {
      exclusiveStartKey = decodeCursor(parsed.value.cursor);
      if (exclusiveStartKey === undefined) {
        return jsonResponse(400, { error: 'cursor is invalid' });
      }
    }

    try {
      const result = await repository.listStudents(
        exclusiveStartKey
          ? { limit: parsed.value.limit, exclusiveStartKey }
          : { limit: parsed.value.limit },
      );

      return jsonResponse(200, {
        items: result.items,
        nextCursor: result.lastEvaluatedKey
          ? encodeCursor(result.lastEvaluatedKey)
          : null,
      });
    } catch (error) {
      // Never log the result: it contains students' personal data.
      console.error('Failed to list students', getErrorName(error));
      return jsonResponse(500, { error: 'Internal server error' });
    }
  };
};

/**
 * Factory with dependency injection for tests. Authorization runs before query
 * validation and before any repository operation.
 */
export const buildListStudentsHandler = (
  repository: StudentsRepository,
): HttpHandler => withTeacherAuthorization(buildRepositoryHandler(repository));

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

export const handler: HttpHandler = withTeacherAuthorization((event) =>
  getDefaultHandler()(event),
);
