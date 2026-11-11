import { describe, expect, it } from 'vitest';

import { handler } from '../src/handlers/health';

describe('GET /health handler', () => {
  it('returns 200 with the expected JSON payload', async () => {
    const response = await handler();

    expect(response.statusCode).toBe(200);
    expect(response.headers).toMatchObject({
      'content-type': 'application/json',
    });
    expect(JSON.parse(response.body ?? 'null')).toEqual({
      status: 'ok',
      service: 'struct-lab-backend',
    });
  });
});
