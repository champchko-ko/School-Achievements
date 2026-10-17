import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { signUploadParams } from './cloudinary';

describe('signUploadParams', () => {
  const secret = 'test-api-secret';

  it('is deterministic for identical params', () => {
    const a = signUploadParams({ timestamp: 1315060510, upload_preset: 'school_achievements' }, secret);
    const b = signUploadParams({ timestamp: 1315060510, upload_preset: 'school_achievements' }, secret);
    expect(a).toBe(b);
  });

  it('sorts parameters alphabetically regardless of insertion order', () => {
    const a = signUploadParams({ timestamp: 1, upload_preset: 'p' }, secret);
    const b = signUploadParams({ upload_preset: 'p', timestamp: 1 }, secret);
    expect(a).toBe(b);

    const expected = crypto
      .createHash('sha256')
      .update('timestamp=1&upload_preset=p' + secret)
      .digest('hex');
    expect(a).toBe(expected);
  });

  it('matches a known SHA-256 vector', () => {
    const signature = signUploadParams({ timestamp: 1315060510 }, 'abcd', 'sha256');
    const expected = crypto
      .createHash('sha256')
      .update('timestamp=1315060510abcd')
      .digest('hex');
    expect(signature).toBe(expected);
  });

  it('produces different output for sha1 vs sha256', () => {
    const params = { timestamp: 1315060510, upload_preset: 'p' };
    expect(signUploadParams(params, secret, 'sha1')).not.toBe(
      signUploadParams(params, secret, 'sha256')
    );
  });

  it('ignores empty, null and undefined params', () => {
    const withEmpties = signUploadParams(
      { timestamp: 1, upload_preset: 'p', folder: '', extra: undefined as unknown as string },
      secret
    );
    const clean = signUploadParams({ timestamp: 1, upload_preset: 'p' }, secret);
    expect(withEmpties).toBe(clean);
  });
});
