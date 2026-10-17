import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  checkRateLimit,
  checkLockout,
  recordFailedAttempt,
  resetLockout,
  resetAchievementLockouts,
  sleep,
  getClientIp,
  isDistributedRateLimitEnabled,
  _resetRateLimitStore,
} from './rate-limit';

describe('rate-limit and lockout', () => {
  beforeEach(() => {
    _resetRateLimitStore();
    vi.restoreAllMocks();
  });

  describe('distributed limiter detection', () => {
    it('reports disabled when Upstash credentials are absent (falls back to in-memory)', () => {
      // No UPSTASH_* env vars are set in the unit-test environment.
      expect(isDistributedRateLimitEnabled()).toBe(false);
    });
  });

  describe('checkRateLimit', () => {
    it('allows first request', async () => {
      const result = await checkRateLimit('test-key-1', { maxRequests: 3, windowMs: 60_000 });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('allows requests up to max', async () => {
      const key = 'test-key-2';
      const opts = { maxRequests: 3, windowMs: 60_000 };

      await checkRateLimit(key, opts); // 1st
      await checkRateLimit(key, opts); // 2nd
      const third = await checkRateLimit(key, opts); // 3rd

      expect(third.allowed).toBe(true);
      expect(third.remaining).toBe(0);
    });

    it('blocks requests over max', async () => {
      const key = 'test-key-3';
      const opts = { maxRequests: 2, windowMs: 60_000 };

      await checkRateLimit(key, opts); // 1st
      await checkRateLimit(key, opts); // 2nd
      const third = await checkRateLimit(key, opts); // 3rd — should be blocked

      expect(third.allowed).toBe(false);
      expect(third.remaining).toBe(0);
    });

    it('different keys are independent', async () => {
      const opts = { maxRequests: 1, windowMs: 60_000 };

      await checkRateLimit('key-a', opts);
      const result = await checkRateLimit('key-b', opts);

      expect(result.allowed).toBe(true);
    });

    it('returns resetAt timestamp', async () => {
      const result = await checkRateLimit('test-key-reset', { maxRequests: 5, windowMs: 30_000 });
      expect(result.resetAt).toBeGreaterThan(Date.now());
      expect(result.resetAt).toBeLessThanOrEqual(Date.now() + 30_000);
    });

    it('uses default options when none provided', async () => {
      const result = await checkRateLimit('test-key-default');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9); // default maxRequests=10
    });
  });

  describe('lockout and exponential backoff', () => {
    it('returns not locked initially', async () => {
      const status = await checkLockout('test-lock-1');
      expect(status.locked).toBe(false);
      expect(status.resetAt).toBe(0);
      expect(status.remainingTimeMs).toBe(0);
    });

    it('accumulates failed attempts and applies exponential backoff', async () => {
      const key = 'admin:global';

      const a1 = await recordFailedAttempt(key);
      expect(a1.locked).toBe(false);
      expect(a1.attempts).toBe(1);
      expect(a1.backoffMs).toBe(250);

      const a2 = await recordFailedAttempt(key);
      expect(a2.locked).toBe(false);
      expect(a2.attempts).toBe(2);
      expect(a2.backoffMs).toBe(500);

      const a3 = await recordFailedAttempt(key);
      expect(a3.locked).toBe(false);
      expect(a3.attempts).toBe(3);
      expect(a3.backoffMs).toBe(750);

      const a4 = await recordFailedAttempt(key);
      expect(a4.locked).toBe(false);
      expect(a4.attempts).toBe(4);
      expect(a4.backoffMs).toBe(1000);

      // 5th failed attempt triggers lockout for 15 minutes
      const a5 = await recordFailedAttempt(key);
      expect(a5.locked).toBe(true);
      expect(a5.attempts).toBe(5);
      expect(a5.backoffMs).toBe(1250);
      expect(a5.resetAt).toBeGreaterThan(Date.now());

      // Subsequent checkLockout confirms locked state
      const status = await checkLockout(key);
      expect(status.locked).toBe(true);
      expect(status.remainingTimeMs).toBeGreaterThan(0);
      expect(status.resetAt).toBe(a5.resetAt);
    });

    it('resetLockout clears lockout state completely', async () => {
      const key = 'admin:global';
      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt(key);
      }
      expect((await checkLockout(key)).locked).toBe(true);

      await resetLockout(key);

      expect((await checkLockout(key)).locked).toBe(false);
    });

    it('resetAchievementLockouts clears locks across multiple IPs for that achievement', async () => {
      const achId = 'achievement-123';
      const key1 = `pin-lockout:${achId}:192.168.1.1`;
      const key2 = `pin-lockout:${achId}:10.0.0.1`;
      const otherKey = `pin-lockout:achievement-999:192.168.1.1`;

      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt(key1);
        await recordFailedAttempt(key2);
        await recordFailedAttempt(otherKey);
      }

      expect((await checkLockout(key1)).locked).toBe(true);
      expect((await checkLockout(key2)).locked).toBe(true);
      expect((await checkLockout(otherKey)).locked).toBe(true);

      // Reset achievement-123 only
      await resetAchievementLockouts(achId);

      expect((await checkLockout(key1)).locked).toBe(false);
      expect((await checkLockout(key2)).locked).toBe(false);
      expect((await checkLockout(otherKey)).locked).toBe(true);
    });

    it('expires lockout after duration passes', async () => {
      const key = 'test-expire';
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt(key, { maxAttempts: 5, lockoutDurationMs: 60_000 });
      }
      expect((await checkLockout(key)).locked).toBe(true);

      // Fast-forward past 60s
      vi.spyOn(Date, 'now').mockReturnValue(now + 60_001);

      expect((await checkLockout(key)).locked).toBe(false);
    });

    it('sleep resolves correctly after delay', async () => {
      const start = Date.now();
      await sleep(15);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(10);
    });
  });

  describe('getClientIp', () => {
    it('extracts leftmost IP from x-forwarded-for', () => {
      const req = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178' },
      });
      expect(getClientIp(req)).toBe('203.0.113.195');
    });

    it('falls back to x-real-ip if x-forwarded-for is missing', () => {
      const req = new Request('http://localhost', {
        headers: { 'x-real-ip': '198.51.100.22' },
      });
      expect(getClientIp(req)).toBe('198.51.100.22');
    });

    it('returns unknown if neither header is present', () => {
      const req = new Request('http://localhost');
      expect(getClientIp(req)).toBe('unknown');
    });
  });
});
