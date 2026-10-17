// src/lib/rate-limit.ts
// Rate limiting & lockout mechanism for API routes.
//
// Primary engine: Upstash Redis (@upstash/ratelimit) — distributed, so limits
// are shared across all serverless instances.
// Fallback: per-instance in-memory Map. Used in local/dev and whenever Upstash
// credentials are absent. In production the absence of credentials raises a
// high-severity alert (operations must be aware that defenses are weakened).

import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

export interface RateLimitOptions {
  maxRequests: number;  // Maximum requests allowed
  windowMs: number;     // Time window in milliseconds
}

export interface LockoutOptions {
  maxAttempts?: number;        // Maximum failed attempts before lockout (default: 5)
  lockoutDurationMs?: number;  // Duration of lockout in ms (default: 15 minutes = 900,000 ms)
  windowMs?: number;           // Window in ms within which consecutive failures accumulate (default: 15 minutes)
}

export interface LockoutEntry {
  failures: number;
  lockedUntil: number;
  lastFailureAt: number;
}

// ── Upstash client ──
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const HAS_UPSTASH = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

const redis: Redis | null = HAS_UPSTASH
  ? new Redis({ url: UPSTASH_URL as string, token: UPSTASH_TOKEN as string })
  : null;

const LOCKOUT_PREFIX = 'lockout:';
const RATELIMIT_PREFIX = 'ratelimit:';

// Cache one Ratelimit instance per (maxRequests, windowMs) pair.
const limiterCache = new Map<string, Ratelimit>();
function getLimiter(maxRequests: number, windowMs: number): Ratelimit {
  const key = `${maxRequests}:${windowMs}`;
  let limiter = limiterCache.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: redis as Redis,
      limiter: Ratelimit.slidingWindow(maxRequests, `${windowMs} ms`),
      prefix: RATELIMIT_PREFIX,
      analytics: false,
    });
    limiterCache.set(key, limiter);
  }
  return limiter;
}

// Raise a one-time high-severity alert when running in production without the
// distributed limiter. Dynamically imports the logger so this module stays
// dependency-free for unit tests.
let missingCredsAlerted = false;
function alertMissingCredentials(reason: string) {
  if (HAS_UPSTASH || process.env.NODE_ENV !== 'production' || missingCredsAlerted) return;
  missingCredsAlerted = true;
  console.error(
    '[SECURITY][rate-limit] Distributed rate limiter unavailable —',
    reason,
    'Falling back to per-instance in-memory limiting (weaker in serverless).'
  );
  import('./logger')
    .then(({ logError }) =>
      logError('security', 'Distributed rate limiter unavailable; using in-memory fallback', {
        reason,
        distributed: false,
      })
    )
    .catch(() => { /* best effort */ });
}

// ── In-memory fallback stores ──
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const lockoutEntries = new Map<string, LockoutEntry>();

// Clean up old entries periodically without preventing process exit
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of requestCounts.entries()) {
    if (now > value.resetAt) {
      requestCounts.delete(key);
    }
  }
  for (const [key, value] of lockoutEntries.entries()) {
    if (now > value.lockedUntil && (now - value.lastFailureAt) > 15 * 60 * 1000) {
      lockoutEntries.delete(key);
    }
  }
}, 60_000);
if (cleanupTimer && typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

/**
 * Extract the trusted leftmost client IP from request headers (MUST-14).
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const leftmost = forwarded.split(',')[0].trim();
    if (leftmost) return leftmost;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

/**
 * Check sliding-window rate limit for a given identifier.
 * Uses Upstash Redis when configured, otherwise the in-memory fallback.
 */
export async function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = { maxRequests: 10, windowMs: 60_000 }
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  if (redis) {
    try {
      const { success, remaining, reset } = await getLimiter(
        options.maxRequests,
        options.windowMs
      ).limit(identifier);
      return { allowed: success, remaining, resetAt: reset };
    } catch (err) {
      alertMissingCredentials('Upstash request failed');
      console.error('[rate-limit] Upstash checkRateLimit failed, using fallback:', err);
    }
  } else {
    alertMissingCredentials('credentials not configured');
  }

  return inMemoryCheckRateLimit(identifier, options);
}

function inMemoryCheckRateLimit(
  identifier: string,
  options: RateLimitOptions
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = requestCounts.get(identifier);

  if (!entry || now > entry.resetAt) {
    requestCounts.set(identifier, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.maxRequests - 1, resetAt: now + options.windowMs };
  }

  entry.count++;
  if (entry.count > options.maxRequests) {
    /* Rate limit hit — caller should log via logRateLimitHit */
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: options.maxRequests - entry.count, resetAt: entry.resetAt };
}

/**
 * Check if a given identifier is currently locked out.
 */
export async function checkLockout(identifier: string): Promise<{
  locked: boolean;
  resetAt: number;
  remainingTimeMs: number;
}> {
  if (redis) {
    try {
      const entry = await redis.get<LockoutEntry>(LOCKOUT_PREFIX + identifier);
      return evaluateLockout(entry);
    } catch (err) {
      alertMissingCredentials('Upstash request failed');
      console.error('[rate-limit] Upstash checkLockout failed, using fallback:', err);
    }
  } else {
    alertMissingCredentials('credentials not configured');
  }

  return inMemoryCheckLockout(identifier);
}

function inMemoryCheckLockout(identifier: string): {
  locked: boolean;
  resetAt: number;
  remainingTimeMs: number;
} {
  const entry = lockoutEntries.get(identifier);
  if (!entry) {
    return { locked: false, resetAt: 0, remainingTimeMs: 0 };
  }

  const now = Date.now();
  if (entry.lockedUntil > now) {
    return {
      locked: true,
      resetAt: entry.lockedUntil,
      remainingTimeMs: entry.lockedUntil - now,
    };
  }

  // Lockout has expired
  if (entry.lockedUntil > 0 && now >= entry.lockedUntil) {
    lockoutEntries.delete(identifier);
  }

  return { locked: false, resetAt: 0, remainingTimeMs: 0 };
}

function evaluateLockout(entry: LockoutEntry | null): {
  locked: boolean;
  resetAt: number;
  remainingTimeMs: number;
} {
  if (!entry) {
    return { locked: false, resetAt: 0, remainingTimeMs: 0 };
  }
  const now = Date.now();
  if (entry.lockedUntil > now) {
    return { locked: true, resetAt: entry.lockedUntil, remainingTimeMs: entry.lockedUntil - now };
  }
  return { locked: false, resetAt: 0, remainingTimeMs: 0 };
}

/**
 * Record a failed attempt for an identifier and apply lockout if maxAttempts reached.
 * Returns lockout status, number of attempts, resetAt timestamp, and recommended backoffMs.
 */
export async function recordFailedAttempt(
  identifier: string,
  options: LockoutOptions = {}
): Promise<{
  locked: boolean;
  attempts: number;
  resetAt: number;
  backoffMs: number;
}> {
  if (redis) {
    try {
      return await redisRecordFailedAttempt(identifier, options);
    } catch (err) {
      alertMissingCredentials('Upstash request failed');
      console.error('[rate-limit] Upstash recordFailedAttempt failed, using fallback:', err);
    }
  } else {
    alertMissingCredentials('credentials not configured');
  }

  return inMemoryRecordFailedAttempt(identifier, options);
}

function computeNextLockoutEntry(
  existing: LockoutEntry | null,
  now: number,
  maxAttempts: number,
  lockoutDurationMs: number,
  windowMs: number
): { entry: LockoutEntry; alreadyLocked: boolean } {
  let entry = existing;
  if (!entry || (entry.lockedUntil <= now && (now - entry.lastFailureAt) > windowMs)) {
    entry = { failures: 1, lockedUntil: 0, lastFailureAt: now };
  } else if (entry.lockedUntil > now) {
    return { entry, alreadyLocked: true };
  } else {
    entry.failures += 1;
    entry.lastFailureAt = now;
  }
  if (entry.failures >= maxAttempts) {
    entry.lockedUntil = now + lockoutDurationMs;
  }
  return { entry, alreadyLocked: false };
}

async function redisRecordFailedAttempt(
  identifier: string,
  options: LockoutOptions
): Promise<{ locked: boolean; attempts: number; resetAt: number; backoffMs: number }> {
  const maxAttempts = options.maxAttempts ?? 5;
  const lockoutDurationMs = options.lockoutDurationMs ?? 15 * 60 * 1000;
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const now = Date.now();
  const key = LOCKOUT_PREFIX + identifier;

  const existing = await redis!.get<LockoutEntry>(key);
  const { entry, alreadyLocked } = computeNextLockoutEntry(
    existing,
    now,
    maxAttempts,
    lockoutDurationMs,
    windowMs
  );

  if (alreadyLocked) {
    return {
      locked: true,
      attempts: entry.failures,
      resetAt: entry.lockedUntil,
      backoffMs: Math.min(entry.failures * 250, 5000),
    };
  }

  const ttlSec = Math.max(
    Math.ceil((Math.max(entry.lockedUntil, entry.lastFailureAt + windowMs) - now) / 1000) + 60,
    60
  );
  await redis!.set(key, entry, { ex: ttlSec });

  return {
    locked: entry.failures >= maxAttempts,
    attempts: entry.failures,
    resetAt: entry.lockedUntil || 0,
    backoffMs: Math.min(entry.failures * 250, 5000),
  };
}

function inMemoryRecordFailedAttempt(
  identifier: string,
  options: LockoutOptions
): { locked: boolean; attempts: number; resetAt: number; backoffMs: number } {
  const maxAttempts = options.maxAttempts ?? 5;
  const lockoutDurationMs = options.lockoutDurationMs ?? 15 * 60 * 1000;
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const now = Date.now();

  const existing = lockoutEntries.get(identifier) ?? null;
  const { entry, alreadyLocked } = computeNextLockoutEntry(
    existing,
    now,
    maxAttempts,
    lockoutDurationMs,
    windowMs
  );

  if (alreadyLocked) {
    return {
      locked: true,
      attempts: entry.failures,
      resetAt: entry.lockedUntil,
      backoffMs: Math.min(entry.failures * 250, 5000),
    };
  }

  lockoutEntries.set(identifier, entry);

  return {
    locked: entry.failures >= maxAttempts,
    attempts: entry.failures,
    resetAt: entry.lockedUntil || 0,
    backoffMs: Math.min(entry.failures * 250, 5000),
  };
}

/**
 * Reset and clear lockout for a single identifier (e.g., upon successful authentication).
 */
export async function resetLockout(identifier: string): Promise<void> {
  lockoutEntries.delete(identifier);
  if (redis) {
    try {
      await redis.del(LOCKOUT_PREFIX + identifier);
    } catch (err) {
      console.error('[rate-limit] Upstash resetLockout failed:', err);
    }
  }
}

/**
 * Clear all lockout entries associated with a specific achievement ID across all IPs.
 * Allows a valid admin session or PIN reset to unlock an achievement.
 */
export async function resetAchievementLockouts(achievementId: string): Promise<void> {
  const prefix = `pin-lockout:${achievementId}:`;
  const exact = `pin-lockout:${achievementId}`;

  for (const key of Array.from(lockoutEntries.keys())) {
    if (key.startsWith(prefix) || key === exact) {
      lockoutEntries.delete(key);
    }
  }

  if (redis) {
    try {
      // Delete the exact key plus every per-IP key matching the prefix.
      await redis.del(LOCKOUT_PREFIX + exact);
      let cursor = 0;
      do {
        const [next, keys] = await redis.scan(cursor, {
          match: `${LOCKOUT_PREFIX}${prefix}*`,
          count: 100,
        });
        if (keys.length > 0) {
          await redis.del(...keys);
        }
        cursor = Number(next);
      } while (cursor !== 0);
    } catch (err) {
      console.error('[rate-limit] Upstash resetAchievementLockouts failed:', err);
    }
  }
}

/**
 * Exponential backoff sleep utility.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Test helper to clear in-memory stores.
 */
export function _resetRateLimitStore(): void {
  requestCounts.clear();
  lockoutEntries.clear();
}

/**
 * Expose whether the distributed limiter is active (for diagnostics/tests).
 */
export function isDistributedRateLimitEnabled(): boolean {
  return HAS_UPSTASH;
}
