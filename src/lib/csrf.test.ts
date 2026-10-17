import { describe, it, expect, vi, afterEach } from 'vitest';
import { isValidOrigin } from './csrf';

describe('isValidOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows matching origin host', () => {
    const req = new Request('http://example.com/api/test', {
      method: 'POST',
      headers: {
        host: 'example.com',
        origin: 'http://example.com'
      }
    });
    expect(isValidOrigin(req)).toBe(true);
  });

  it('rejects origin substring attack (e.g. attacker domain containing target host)', () => {
    const req = new Request('http://example.com/api/test', {
      method: 'POST',
      headers: {
        host: 'example.com',
        origin: 'https://example.com.attacker.com'
      }
    });
    expect(isValidOrigin(req)).toBe(false);
  });

  it('allows matching referer when origin is absent', () => {
    const req = new Request('http://example.com/api/test', {
      method: 'POST',
      headers: {
        host: 'example.com',
        referer: 'http://example.com/some/page'
      }
    });
    expect(isValidOrigin(req)).toBe(true);
  });

  it('rejects mismatching referer', () => {
    const req = new Request('http://example.com/api/test', {
      method: 'POST',
      headers: {
        host: 'example.com',
        referer: 'http://evil.com/some/page'
      }
    });
    expect(isValidOrigin(req)).toBe(false);
  });

  it('rejects malformed origin URL', () => {
    const req = new Request('http://example.com/api/test', {
      method: 'POST',
      headers: {
        host: 'example.com',
        origin: 'not-a-valid-url'
      }
    });
    expect(isValidOrigin(req)).toBe(false);
  });

  it('rejects state-changing request with no Origin and no Referer (Finding #14)', () => {
    const req = new Request('http://example.com/api/test', {
      method: 'POST',
      headers: { host: 'example.com' }
    });
    expect(isValidOrigin(req)).toBe(false);
  });

  it('rejects state-changing request with no trusted host at all', () => {
    const req = new Request('http://example.com/api/test', {
      method: 'POST',
      headers: { origin: 'http://example.com' }
    });
    expect(isValidOrigin(req)).toBe(false);
  });

  it("rejects the literal 'null' origin", () => {
    const req = new Request('http://example.com/api/test', {
      method: 'POST',
      headers: { host: 'example.com', origin: 'null' }
    });
    expect(isValidOrigin(req)).toBe(false);
  });

  it('allows origin that matches the NEXT_PUBLIC_APP_URL allowlist', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com');
    const req = new Request('http://internal.local/api/test', {
      method: 'POST',
      headers: { host: 'internal.local', origin: 'https://app.example.com' }
    });
    expect(isValidOrigin(req)).toBe(true);
  });

  it('does not enforce CSRF on safe GET requests', () => {
    const req = new Request('http://example.com/api/test', {
      method: 'GET',
      headers: { host: 'example.com' }
    });
    expect(isValidOrigin(req)).toBe(true);
  });
});
