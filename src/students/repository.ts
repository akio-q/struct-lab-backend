import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

import type { Student, StudentCursor } from './types';

export interface ListStudentsOptions {
  limit: number;
  exclusiveStartKey?: StudentCursor;
}

export interface ListStudentsResult {
  items: Student[];
  lastEvaluatedKey?: StudentCursor;
}

export interface StudentsRepository {
  createStudent(student: Student): Promise<void>;
  listStudents(options: ListStudentsOptions): Promise<ListStudentsResult>;
}

/**
 * DynamoDB implementation. It uses only PutItem for writes and Scan for reads;
 * the matching IAM permissions are defined in the CDK stack.
 */
export class DynamoDbStudentsRepository implements StudentsRepository {
  constructor(
    private readonly tableName: string,
    private readonly documentClient: DynamoDBDocumentClient,
  ) {}

  async createStudent(student: Student): Promise<void> {
    await this.documentClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: student,
      }),
    );
  }

  async listStudents(
    options: ListStudentsOptions,
  ): Promise<ListStudentsResult> {
    const result = await this.documentClient.send(
      new ScanCommand({
        TableName: this.tableName,
        Limit: options.limit,
        ...(options.exclusiveStartKey === undefined
          ? {}
          : { ExclusiveStartKey: options.exclusiveStartKey }),
      }),
    );

    const items = (result.Items ?? [])
      .map((item) => toStudent(item))
      .filter((student): student is Student => student !== undefined);

    const lastEvaluatedKey = toCursor(result.LastEvaluatedKey);

    return lastEvaluatedKey ? { items, lastEvaluatedKey } : { items };
  }
}

const toStudent = (item: Record<string, unknown>): Student | undefined => {
  const { studentId, fullName, group, createdAt } = item;

  if (
    typeof studentId !== 'string' ||
    typeof fullName !== 'string' ||
    typeof group !== 'string' ||
    typeof createdAt !== 'string'
  ) {
    return undefined;
  }

  return { studentId, fullName, group, createdAt };
};

const toCursor = (
  key: Record<string, unknown> | undefined,
): StudentCursor | undefined => {
  if (key === undefined || typeof key.studentId !== 'string') {
    return undefined;
  }

  return { studentId: key.studentId };
};

export const createDynamoDbStudentsRepository =
  (): StudentsRepository => {
    const tableName = process.env.STUDENTS_TABLE_NAME;

    if (!tableName) {
      throw new Error('STUDENTS_TABLE_NAME environment variable is not set');
    }

    const documentClient = DynamoDBDocumentClient.from(
      new DynamoDBClient({}),
    );

    return new DynamoDbStudentsRepository(tableName, documentClient);
  };
