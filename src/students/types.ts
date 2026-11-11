/** Student record stored in DynamoDB and returned by the API. */
export interface Student {
  studentId: string;
  fullName: string;
  group: string;
  createdAt: string;
}

/** Validated input for creating a student. */
export interface CreateStudentInput {
  fullName: string;
  group: string;
}

/** DynamoDB key used for cursor-based pagination. */
export interface StudentCursor {
  studentId: string;
}
