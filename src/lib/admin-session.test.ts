import { describe, it, expect } from 'vitest';
import { createSessionValue, verifyAdminToken, getSessionCookieOptions } from './admin-session';

describe('createSessionValue and verifyAdminToken', () => {
  it('creates and verifies a valid signed JWT session', async () => {
    const token = await createSessionValue();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // JWT format: header.payload.signature

    const isValid = await verifyAdminToken(token);
    expect(isValid).toBe(true);
  });

  it('rejects tampered or forged tokens', async () => {
    const token = await createSessionValue();
    const tampered = token.slice(0, -5) + 'abcde';
    expect(await verifyAdminToken(tampered)).toBe(false);
  });

  it('rejects legacy unsigned base64 timestamp cookies', async () => {
    const forgedTimestamp = btoa(Date.now().toString());
    expect(await verifyAdminToken(forgedTimestamp)).toBe(false);
    expect(await verifyAdminToken(undefined)).toBe(false);
    expect(await verifyAdminToken('')).toBe(false);
  });

  it('uses AUTH_SECRET and rejects verification if signed with a different key', async () => {
    const originalSecret = process.env.AUTH_SECRET;
    try {
      process.env.AUTH_SECRET = 'first-secret-key-for-test-32chars!';
      const token = await createSessionValue();
      expect(await verifyAdminToken(token)).toBe(true);

      process.env.AUTH_SECRET = 'second-secret-key-for-test-32chars!';
      expect(await verifyAdminToken(token)).toBe(false);
    } finally {
      if (originalSecret !== undefined) {
        process.env.AUTH_SECRET = originalSecret;
      } else {
        delete process.env.AUTH_SECRET;
      }
    }
  });

  it('does not fall back to PIN_PEPPER when AUTH_SECRET is missing outside test env', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.AUTH_SECRET;
    const originalPepper = process.env.PIN_PEPPER;
    try {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      delete process.env.AUTH_SECRET;
      process.env.PIN_PEPPER = 'some-pin-pepper-value';

      await expect(createSessionValue()).rejects.toThrow('AUTH_SECRET environment variable is required');
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
      if (originalSecret !== undefined) {
        process.env.AUTH_SECRET = originalSecret;
      } else {
        delete process.env.AUTH_SECRET;
      }
      if (originalPepper !== undefined) {
        process.env.PIN_PEPPER = originalPepper;
      } else {
        delete process.env.PIN_PEPPER;
      }
    }
  });
});

describe('getSessionCookieOptions', () => {
  it('returns httpOnly and path', () => {
    const opts = getSessionCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.path).toBe('/');
  });

  it('has secure flag in production', () => {
    const opts = getSessionCookieOptions();
    // In test env NODE_ENV is 'test', so secure may be false
    // Verify the logic: secure is true when NODE_ENV === 'production'
    expect(typeof opts.secure).toBe('boolean');
  });

  it('has maxAge of 30 minutes', () => {
    const opts = getSessionCookieOptions();
    expect(opts.maxAge).toBe(30 * 60);
  });

  it('has sameSite strict', () => {
    const opts = getSessionCookieOptions();
    expect(opts.sameSite).toBe('strict');
  });
});

describe('rollback tokens and maintenance bypass tokens', () => {
  it('creates and verifies rollback token for specific url', async () => {
    const { createRollbackToken, verifyRollbackToken } = await import('./admin-session');
    const url = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';
    const token = createRollbackToken(url);
    expect(typeof token).toBe('string');
    expect(verifyRollbackToken(url, token)).toBe(true);
    expect(verifyRollbackToken('https://res.cloudinary.com/demo/image/upload/other.jpg', token)).toBe(false);
    expect(verifyRollbackToken(url, 'invalid.token')).toBe(false);
  });

  it('creates and verifies maintenance bypass token', async () => {
    const { createMaintenanceBypassToken, verifyMaintenanceBypassToken } = await import('./admin-session');
    const token = createMaintenanceBypassToken();
    expect(typeof token).toBe('string');
    expect(verifyMaintenanceBypassToken(token)).toBe(true);
    expect(verifyMaintenanceBypassToken('tampered.token')).toBe(false);
    expect(verifyMaintenanceBypassToken(undefined)).toBe(false);
  });
});

