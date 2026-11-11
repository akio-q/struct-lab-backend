import {
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';

import { DynamoDbStudentsRepository } from '../src/students/repository';
import type { Student } from '../src/students/types';

const TABLE_NAME = 'StudentsTable';
const STUDENT_ID = '3f1d2c9b-7a44-4e1c-9f2a-0d2c8e5b1a77';
const NEXT_STUDENT_ID = '8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d';

const student: Student = {
  studentId: STUDENT_ID,
  fullName: 'Іван Петренко',
  group: 'ІП-21',
  createdAt: '2026-11-11T18:00:00.000Z',
};

const createRepository = (): {
  repository: DynamoDbStudentsRepository;
  send: ReturnType<typeof vi.fn>;
} => {
  const send = vi.fn();
  const documentClient = { send } as unknown as DynamoDBDocumentClient;

  return {
    repository: new DynamoDbStudentsRepository(TABLE_NAME, documentClient),
    send,
  };
};

const getSentCommand = (send: ReturnType<typeof vi.fn>): unknown =>
  send.mock.calls[0]?.[0];

describe('DynamoDbStudentsRepository', () => {
  describe('createStudent', () => {
    it('sends a PutCommand with the table name and student item', async () => {
      const { repository, send } = createRepository();
      send.mockResolvedValueOnce({});

      await repository.createStudent(student);

      expect(send).toHaveBeenCalledTimes(1);

      const command = getSentCommand(send);
      expect(command).toBeInstanceOf(PutCommand);
      expect((command as PutCommand).input).toEqual({
        TableName: TABLE_NAME,
        Item: student,
      });
    });

    it('propagates DynamoDB errors to the caller', async () => {
      const { repository, send } = createRepository();
      send.mockRejectedValueOnce(new Error('DynamoDB unavailable'));

      await expect(repository.createStudent(student)).rejects.toThrow(
        'DynamoDB unavailable',
      );
    });
  });

  describe('listStudents', () => {
    it('sends a ScanCommand with Limit and ExclusiveStartKey', async () => {
      const { repository, send } = createRepository();
      send.mockResolvedValueOnce({ Items: [student] });

      await repository.listStudents({
        limit: 25,
        exclusiveStartKey: { studentId: STUDENT_ID },
      });

      expect(send).toHaveBeenCalledTimes(1);

      const command = getSentCommand(send);
      expect(command).toBeInstanceOf(ScanCommand);
      expect((command as ScanCommand).input).toEqual({
        TableName: TABLE_NAME,
        Limit: 25,
        ExclusiveStartKey: { studentId: STUDENT_ID },
      });
    });

    it('omits ExclusiveStartKey for the first page', async () => {
      const { repository, send } = createRepository();
      send.mockResolvedValueOnce({ Items: [] });

      await repository.listStudents({ limit: 20 });

      const command = getSentCommand(send);
      expect((command as ScanCommand).input).toEqual({
        TableName: TABLE_NAME,
        Limit: 20,
      });
      expect((command as ScanCommand).input).not.toHaveProperty(
        'ExclusiveStartKey',
      );
    });

    it('converts LastEvaluatedKey into a cursor', async () => {
      const { repository, send } = createRepository();
      send.mockResolvedValueOnce({
        Items: [student],
        LastEvaluatedKey: { studentId: NEXT_STUDENT_ID },
      });

      const result = await repository.listStudents({ limit: 20 });

      expect(result).toEqual({
        items: [student],
        lastEvaluatedKey: { studentId: NEXT_STUDENT_ID },
      });
    });

    it('returns an empty page when DynamoDB returns no items or key', async () => {
      const { repository, send } = createRepository();
      send.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

      await expect(repository.listStudents({ limit: 20 })).resolves.toEqual({
        items: [],
      });
    });

    it('returns an empty page when the scan result has no Items field', async () => {
      const { repository, send } = createRepository();
      send.mockResolvedValueOnce({});

      await expect(repository.listStudents({ limit: 20 })).resolves.toEqual({
        items: [],
      });
    });

    it('returns only known student fields and skips malformed items', async () => {
      const { repository, send } = createRepository();
      send.mockResolvedValueOnce({
        Items: [
          { ...student, extra: 'ignored' },
          { studentId: STUDENT_ID, fullName: 'Без групи' },
        ],
      });

      const result = await repository.listStudents({ limit: 20 });

      expect(result.items).toEqual([student]);
    });

    it('propagates DynamoDB errors to the caller', async () => {
      const { repository, send } = createRepository();
      send.mockRejectedValueOnce(new Error('DynamoDB unavailable'));

      await expect(repository.listStudents({ limit: 20 })).rejects.toThrow(
        'DynamoDB unavailable',
      );
    });
  });
});
