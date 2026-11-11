/** Extracts only the error class name so logs never contain student data. */
export const getErrorName = (error: unknown): string =>
  error instanceof Error ? error.name : 'UnknownError';
