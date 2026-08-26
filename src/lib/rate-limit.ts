// src/lib/rate-limit.ts
// Simple in-memory rate limiter for API routes
// Note: In serverless environments, each instance has its own memory,
// so this still allows some bypass. For production, use a Redis-based limiter.

const requestCounts = new Map<string, { count: number; resetAt: number }>();

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of requestCounts.entries()) {
    if (now > value.resetAt) {
      requestCounts.delete(key);
    }
  }
}, 60_000);

export interface RateLimitOptions {
  maxRequests: number;  // Maximum requests allowed
  windowMs: number;     // Time window in milliseconds
}

export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = { maxRequests: 10, windowMs: 60_000 }
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = requestCounts.get(identifier);

  if (!entry || now > entry.resetAt) {
    // First request or window expired - reset
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
