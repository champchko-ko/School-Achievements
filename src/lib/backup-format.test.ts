// src/lib/backup-format.test.ts
// Unit tests for the backup payload format: canonicalization, checksums,
// AES-256-GCM round trip, tamper detection, wrong-key rejection, validation.
import { describe, it, expect } from 'vitest';
import {
  canonicalize,
  sha256Hex,
  buildPayload,
  serializePayload,
  encryptBuffer,
  decryptBuffer,
  validatePayload,
  parseAndVerify,
  MAGIC,
} from './backup-format.mjs';

const KEY = 'a'.repeat(64); // valid 32-byte hex key for tests

function sampleData() {
  return {
    achievements: [
      { id: 'a1', title: 'إنجاز 1', teacherName: 'معلمة', status: 'approved', score: 95 },
      { id: 'a2', title: 'إنجاز 2', teacherName: 'معلمة 2', status: 'pending', score: null },
    ],
    settings: [{ id: 'global_info', schoolName: 'مدرسة بيان', departments: ['لغة عربية'] }],
    admin: [
      { id: 'pinConfig', pinHash: 'deadbeef', adminEmail: 'bayanschool2026@gmail.com' },
      { id: 'other', x: 1 },
    ],
    admin_achievementSecrets: [{ id: 'a1', pinHash: 'cafe01' }],
  };
}

function samplePayload(overrides: Record<string, unknown> = {}) {
  return buildPayload({
    data: sampleData(),
    startedAt: '2026-10-28T00:00:00.000Z',
    endedAt: '2026-10-28T00:00:05.000Z',
    pinPepper: 'test-pepper',
    ...overrides,
  });
}

describe('backup-format: canonicalize', () => {
  it('sorts object keys recursively and is deterministic', () => {
    const a = canonicalize({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } });
    const b = canonicalize({ a: { c: [3, { y: 2, z: 1 }], d: 2 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}');
  });

  it('produces stable sha256 for identical logical objects', () => {
    expect(sha256Hex(canonicalize({ x: 1, y: [1, 2] }))).toBe(sha256Hex(canonicalize({ y: [1, 2], x: 1 })));
  });
});

describe('backup-format: buildPayload / validatePayload', () => {
  it('builds an envelope with matching counts and a data checksum', () => {
    const payload = samplePayload() as Record<string, any>;
    expect(payload.format).toBe('school-achievements-backup');
    expect(payload.counts).toEqual({
      achievements: 2,
      settings: 1,
      admin: 2,
      admin_achievementSecrets: 1,
    });
    expect(payload.checksum).toBe(sha256Hex(canonicalize(sampleData())));
  });

  it('validates a correct payload as ok', () => {
    const result = validatePayload(samplePayload());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a payload whose data was altered after checksumming', () => {
    const payload = samplePayload() as Record<string, any>;
    payload.data.achievements[0].title = 'معدّل';
    const result = validatePayload(payload);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('checksum mismatch'))).toBe(true);
  });

  it('rejects unknown format, newer schema version, and missing collections', () => {
    expect(validatePayload({ ...samplePayload(), format: 'other' }).ok).toBe(false);
    expect(validatePayload({ ...samplePayload(), schemaVersion: 99 }).ok).toBe(false);
    const p = samplePayload() as Record<string, any>;
    delete p.data.admin_achievementSecrets;
    const result = validatePayload({ ...p, counts: { ...p.counts, admin_achievementSecrets: undefined } });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('admin_achievementSecrets'))).toBe(true);
  });

  it('rejects missing pinPepper and docs without ids', () => {
    expect(validatePayload({ ...samplePayload(), pinPepper: '' }).ok).toBe(false);
    const p = samplePayload() as Record<string, any>;
    p.data.admin_achievementSecrets[0] = { pinHash: 'x' };
    expect(validatePayload(p).ok).toBe(false);
  });

  it('rejects a non-object payload', () => {
    expect(validatePayload(null).ok).toBe(false);
    expect(validatePayload('x').ok).toBe(false);
  });
});

describe('backup-format: encryption', () => {
  it('round-trips encrypt → decrypt to identical bytes', () => {
    const plain = serializePayload(samplePayload());
    const enc = encryptBuffer(plain, KEY, 3);
    const { keyVersion, plain: out } = decryptBuffer(enc, KEY);
    expect(keyVersion).toBe(3);
    expect(out.equals(plain)).toBe(true);
  });

  it('starts with the SABK1 magic header', () => {
    const enc = encryptBuffer(Buffer.from('x'), KEY);
    expect(enc.subarray(0, MAGIC.length).equals(MAGIC)).toBe(true);
  });

  it('uses a unique IV per encryption (ciphertexts differ for identical input)', () => {
    const plain = Buffer.from('same input');
    const e1 = encryptBuffer(plain, KEY);
    const e2 = encryptBuffer(plain, KEY);
    expect(e1.equals(e2)).toBe(false);
  });

  it('detects tampering: any ciphertext bit-flip fails authentication', () => {
    const enc = encryptBuffer(serializePayload(samplePayload()), KEY);
    const tampered = Buffer.from(enc);
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptBuffer(tampered, KEY)).toThrow();
  });

  it('rejects the wrong key', () => {
    const enc = encryptBuffer(Buffer.from('secret'), KEY);
    expect(() => decryptBuffer(enc, 'b'.repeat(64))).toThrow();
  });

  it('rejects malformed keys and non-backup buffers', () => {
    const plain = Buffer.from('x');
    expect(() => encryptBuffer(plain, 'not-hex')).toThrow(/64-character hex/);
    expect(() => encryptBuffer(plain, 'a'.repeat(63))).toThrow(/64-character hex/);
    expect(() => decryptBuffer(Buffer.from('not a backup at all'), KEY)).toThrow(/bad header/);
  });
});

describe('backup-format: parseAndVerify (end-to-end)', () => {
  it('decrypts, parses, and validates in one call', () => {
    const enc = encryptBuffer(serializePayload(samplePayload()), KEY);
    const { payload, keyVersion } = parseAndVerify(enc, KEY);
    expect(keyVersion).toBe(1);
    expect((payload as Record<string, any>).pinPepper).toBe('test-pepper');
    expect((payload as Record<string, any>).counts.achievements).toBe(2);
  });

  it('throws when the file was tampered with after encryption', () => {
    const enc = encryptBuffer(serializePayload(samplePayload()), KEY);
    const tampered = Buffer.from(enc);
    tampered[enc.length - 10] ^= 0x01;
    expect(() => parseAndVerify(tampered, KEY)).toThrow();
  });

  it('throws when decrypted payload fails structural validation', () => {
    const bad = serializePayload({ format: 'wrong' });
    const enc = encryptBuffer(bad, KEY);
    expect(() => parseAndVerify(enc, KEY)).toThrow(/validation failed/);
  });
});
