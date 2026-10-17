// src/lib/csrf.ts
// Secure CSRF validation using a trusted-host allowlist (MUST-06 / Finding #14)

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

/**
 * Build the set of hosts that are trusted for this request.
 * Includes the request's own Host (and proxy-forwarded host) plus the
 * configured canonical app URL (NEXT_PUBLIC_APP_URL).
 */
function getTrustedHosts(request: Request): Set<string> {
  const hosts = new Set<string>();

  const host = request.headers.get('host');
  if (host) hosts.add(host.toLowerCase());

  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) {
    for (const value of forwardedHost.split(',')) {
      const trimmed = value.trim().toLowerCase();
      if (trimmed) hosts.add(trimmed);
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      hosts.add(new URL(appUrl).host.toLowerCase());
    } catch {
      // Ignore malformed configuration rather than trusting it.
    }
  }

  return hosts;
}

function hostFromUrl(value: string): string | null {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Validate that a state-changing request originates from a trusted host.
 *
 * Fails closed: returns false when no trusted host is known, or when both the
 * Origin and Referer headers are omitted (or invalid). Safe methods
 * (GET/HEAD/OPTIONS) are not subject to CSRF validation.
 */
export function isValidOrigin(request: Request): boolean {
  const method = (request.method || 'GET').toUpperCase();
  if (!STATE_CHANGING_METHODS.has(method)) {
    return true;
  }

  const trustedHosts = getTrustedHosts(request);
  if (trustedHosts.size === 0) return false;

  const origin = request.headers.get('origin');
  if (origin && origin !== 'null') {
    const host = hostFromUrl(origin);
    return host !== null && trustedHosts.has(host);
  }

  const referer = request.headers.get('referer');
  if (referer) {
    const host = hostFromUrl(referer);
    return host !== null && trustedHosts.has(host);
  }

  // Both Origin and Referer omitted or invalid → reject.
  return false;
}
