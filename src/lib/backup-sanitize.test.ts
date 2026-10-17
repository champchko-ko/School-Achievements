import { describe, it, expect } from 'vitest';
import { scrubSensitiveFields, SENSITIVE_BACKUP_FIELDS } from './backup-sanitize';

describe('backup-sanitize (Finding #17)', () => {
  it('removes every sensitive authentication field', () => {
    const doc = {
      id: 'abc',
      pinHash: 'deadbeef',
      tokenHash: 'cafebabe',
      adminPin: '1234',
      adminEmail: 'admin@school.edu',
      title: 'Science Award',
    };

    const scrubbed = scrubSensitiveFields(doc);

    for (const field of SENSITIVE_BACKUP_FIELDS) {
      expect(scrubbed).not.toHaveProperty(field);
    }
  });

  it('preserves all non-sensitive fields', () => {
    const doc = { id: 'abc', title: 'Math Award', score: 5, status: 'approved' };
    const scrubbed = scrubSensitiveFields(doc);

    expect(scrubbed).toEqual(doc);
  });

  it('does not mutate the input document', () => {
    const doc = { id: 'abc', pinHash: 'deadbeef', title: 'Award' };
    scrubSensitiveFields(doc);

    expect(doc.pinHash).toBe('deadbeef');
  });

  it('handles documents with no sensitive fields', () => {
    expect(scrubSensitiveFields({ id: 'x', value: 1 })).toEqual({ id: 'x', value: 1 });
  });

  it('handles empty documents', () => {
    expect(scrubSensitiveFields({})).toEqual({});
  });
});
