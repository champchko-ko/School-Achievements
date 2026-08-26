import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit } from './rate-limit';

describe('checkRateLimit', () => {
  beforeEach(() => {
    // Clear all entries by letting time pass
    // The rate limiter cleans up expired entries on each check
  });

  it('allows first request', () => {
    const result = checkRateLimit('test-key-1', { maxRequests: 3, windowMs: 60_000 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('allows requests up to max', () => {
    const key = 'test-key-2';
    const opts = { maxRequests: 3, windowMs: 60_000 };

    checkRateLimit(key, opts); // 1st
    checkRateLimit(key, opts); // 2nd
    const third = checkRateLimit(key, opts); // 3rd

    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it('blocks requests over max', () => {
    const key = 'test-key-3';
    const opts = { maxRequests: 2, windowMs: 60_000 };

    checkRateLimit(key, opts); // 1st
    checkRateLimit(key, opts); // 2nd
    const third = checkRateLimit(key, opts); // 3rd — should be blocked

    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it('different keys are independent', () => {
    const opts = { maxRequests: 1, windowMs: 60_000 };

    checkRateLimit('key-a', opts);
    const result = checkRateLimit('key-b', opts);

    expect(result.allowed).toBe(true);
  });

  it('returns resetAt timestamp', () => {
    const result = checkRateLimit('test-key-reset', { maxRequests: 5, windowMs: 30_000 });
    expect(result.resetAt).toBeGreaterThan(Date.now());
    expect(result.resetAt).toBeLessThanOrEqual(Date.now() + 30_000);
  });

  it('uses default options when none provided', () => {
    const result = checkRateLimit('test-key-default');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9); // default maxRequests=10
  });
});
