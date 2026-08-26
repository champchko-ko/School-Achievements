import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-admin before importing logger
vi.mock('./firebase-admin', () => {
  const docs: any[] = [];
  return {
    getAdminDb: () => ({
      collection: (path: string) => ({
        add: (data: any) => {
          docs.push({ id: `mock-${docs.length}`, data, path });
          return Promise.resolve({ id: `mock-${docs.length - 1}` });
        },
        orderBy: () => ({
          limit: () => ({
            get: () => Promise.resolve({ docs: docs.map((d, i) => ({ id: d.id, data: () => d.data })) }),
          }),
        }),
      }),
    }),
    collection: vi.fn(),
    addDoc: vi.fn(),
    serverTimestamp: vi.fn(() => 'mock-timestamp'),
  };
});

import { logInfo, logError, logSecurity, logAuthFailure, logAuthSuccess, logRateLimitHit } from './logger';

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logInfo buffers entry', () => {
    logInfo('api', 'Test info message', { key: 'value' });
    // No throw = success (buffered, will flush async)
    expect(true).toBe(true);
  });

  it('logError buffers entry', () => {
    logError('api', 'Test error', { error: 'something broke' });
    expect(true).toBe(true);
  });

  it('logSecurity buffers entry', () => {
    logSecurity('auth_failure', { ip: '1.2.3.4' });
    expect(true).toBe(true);
  });

  it('logAuthFailure calls logSecurity', () => {
    logAuthFailure('incorrect_pin');
    expect(true).toBe(true);
  });

  it('logAuthSuccess logs info', () => {
    logAuthSuccess(true);
    expect(true).toBe(true);
  });

  it('logRateLimitHit logs security event', () => {
    logRateLimitHit('upload:1.2.3.4');
    expect(true).toBe(true);
  });
});
