import { describe, expect, it } from 'vitest';

import {
  getHeader,
  isJsonContentType,
  jsonResponse,
  readRequestBody,
} from '../src/lib/http';

describe('jsonResponse', () => {
  it('returns JSON with no-store cache protection', () => {
    const response = jsonResponse(200, { status: 'ok' });

    expect(response).toEqual({
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
      body: '{"status":"ok"}',
    });
  });

  it('preserves error status and body while applying no-store', () => {
    const response = jsonResponse(400, { error: 'Bad request' });

    expect(response.statusCode).toBe(400);
    expect(response.headers).toMatchObject({
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
    expect(JSON.parse(response.body ?? 'null')).toEqual({
      error: 'Bad request',
    });
  });
});

describe('getHeader', () => {
  it('looks up header names case-insensitively', () => {
    const headers = { 'Content-Type': 'application/json' };

    expect(getHeader(headers, 'content-type')).toBe('application/json');
    expect(getHeader(headers, 'CONTENT-TYPE')).toBe('application/json');
  });

  it('returns undefined for missing headers and undefined input', () => {
    expect(getHeader({ 'x-test': 'value' }, 'content-type')).toBeUndefined();
    expect(getHeader(undefined, 'content-type')).toBeUndefined();
  });
});

describe('isJsonContentType', () => {
  it.each([
    'application/json',
    'application/json; charset=utf-8',
    'Application/JSON; Charset=UTF-8',
    ' application/json ; charset=utf-8 ',
  ])('accepts %j', (contentType) => {
    expect(isJsonContentType(contentType)).toBe(true);
  });

  it.each([
    undefined,
    '',
    'text/plain',
    'application/json-patch+json',
    'application/json, text/plain',
  ])('rejects %j', (contentType) => {
    expect(isJsonContentType(contentType)).toBe(false);
  });
});

describe('readRequestBody', () => {
  it('returns undefined text for a missing body', () => {
    expect(readRequestBody({ body: undefined, isBase64Encoded: false })).toEqual(
      { text: undefined, byteLength: 0 },
    );
  });

  it('measures UTF-8 bytes instead of JavaScript string length', () => {
    const text = 'Іван';
    const result = readRequestBody({ body: text, isBase64Encoded: false });

    expect(result.text).toBe(text);
    expect(result.byteLength).toBe(Buffer.byteLength(text, 'utf8'));
    expect(result.byteLength).toBeGreaterThan(text.length);
  });

  it('decodes base64 bodies before measuring them', () => {
    const text = '{"fullName":"Іван Петренко"}';
    const encoded = Buffer.from(text, 'utf8').toString('base64');
    const result = readRequestBody({ body: encoded, isBase64Encoded: true });

    expect(result.text).toBe(text);
    expect(result.byteLength).toBe(Buffer.byteLength(text, 'utf8'));
  });

  it('handles empty plain and base64 bodies', () => {
    expect(readRequestBody({ body: '', isBase64Encoded: false })).toEqual({
      text: '',
      byteLength: 0,
    });
    expect(readRequestBody({ body: '', isBase64Encoded: true })).toEqual({
      text: '',
      byteLength: 0,
    });
  });
});
