import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

describe('proxy middleware CSP (Finding #7)', () => {
  it('generates a nonce-based Content-Security-Policy on response headers', async () => {
    const req = new NextRequest('http://localhost:3000/kiosk', {
      headers: { cookie: 'introSeen=true' },
    });
    const res = await proxy(req);

    const csp = res.headers.get('content-security-policy');
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=]+'/);
  });

  it('generates unique nonces for each request', async () => {
    const req1 = new NextRequest('http://localhost:3000/kiosk', {
      headers: { cookie: 'introSeen=true' },
    });
    const req2 = new NextRequest('http://localhost:3000/kiosk', {
      headers: { cookie: 'introSeen=true' },
    });

    const res1 = await proxy(req1);
    const res2 = await proxy(req2);

    const csp1 = res1.headers.get('content-security-policy')!;
    const csp2 = res2.headers.get('content-security-policy')!;

    const match1 = csp1.match(/'nonce-([^']+)'/);
    const match2 = csp2.match(/'nonce-([^']+)'/);

    expect(match1).not.toBeNull();
    expect(match2).not.toBeNull();
    expect(match1![1]).not.toBe(match2![1]);
  });

  it('drops unsafe-eval in production mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = 'production';
      const req = new NextRequest('http://localhost:3000/kiosk', {
        headers: { cookie: 'introSeen=true' },
      });
      const res = await proxy(req);
      const csp = res.headers.get('content-security-policy')!;
      expect(csp).not.toContain("'unsafe-eval'");
    } finally {
      (process.env as any).NODE_ENV = originalEnv;
    }
  });

  it('attaches CSP header to redirects', async () => {
    const req = new NextRequest('http://localhost:3000/');
    const res = await proxy(req);

    expect(res.status).toBe(307);
    const csp = res.headers.get('content-security-policy');
    expect(csp).toBeTruthy();
    expect(csp).toContain("'strict-dynamic'");
  });
});
