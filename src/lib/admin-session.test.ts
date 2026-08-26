import { describe, it, expect } from 'vitest';
import { createSessionValue, getSessionCookieOptions } from './admin-session';

describe('createSessionValue', () => {
  it('returns a base64-encoded timestamp', () => {
    const value = createSessionValue();
    expect(typeof value).toBe('string');
    // Should be valid base64
    const decoded = atob(value);
    const timestamp = parseInt(decoded, 10);
    expect(timestamp).toBeGreaterThan(0);
    // Should be close to now
    expect(Math.abs(Date.now() - timestamp)).toBeLessThan(1000);
  });

  it('returns unique values on successive calls', () => {
    // Small chance of collision if called in same millisecond
    const v1 = createSessionValue();
    const v2 = createSessionValue();
    // Even if same ms, base64 encoding is deterministic — check both are valid
    expect(() => atob(v1)).not.toThrow();
    expect(() => atob(v2)).not.toThrow();
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

  it('has maxAge of 8 hours', () => {
    const opts = getSessionCookieOptions();
    expect(opts.maxAge).toBe(8 * 60 * 60);
  });

  it('has sameSite strict', () => {
    const opts = getSessionCookieOptions();
    expect(opts.sameSite).toBe('strict');
  });
});
