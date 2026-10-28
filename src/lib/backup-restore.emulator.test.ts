// src/lib/backup-restore.emulator.test.ts
// End-to-end restore round-trip against the Firestore Emulator.
// SKIPPED unless the emulator is running:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx vitest run src/lib/backup-restore.emulator.test.ts
// (start it first: npx firebase emulators:start --only firestore)
//
// The test seeds a realistic mini-dataset (including Firestore Timestamps), runs the
// production export → encrypt → decrypt → validate → restore pipeline, and verifies
// counts, field fidelity, Timestamp restoration, and tamper rejection. It writes only
// into the emulator's throwaway project — never any real database.
import { describe, it, expect, beforeAll } from 'vitest';
import {
  buildPayload,
  serializePayload,
  encryptBuffer,
  parseAndVerify,
  validatePayload,
} from './backup-format.mjs';
import { exportCollectionsForBackup } from './backup-export';

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const d = EMULATOR ? describe : describe.skip;

const KEY = 'c'.repeat(64);
const PEPPER = 'emulator-pepper';

d('backup pipeline round-trip (Firestore Emulator)', () => {
  let db: any;

  beforeAll(async () => {
    const { initializeApp } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    const app = initializeApp({ projectId: 'school-achievements-backup-test' });
    db = getFirestore(app);
  });

  it('seeds, exports, encrypts, decrypts, restores, and verifies the round trip', async () => {
    // ── Seed a realistic mini-dataset ──
    const ach = db.collection('achievements');
    const a1 = await ach.add({
      teacherName: 'معلمة تجريبية',
      title: 'إنجاز تجريبي',
      status: 'approved',
      score: 95,
      timestamp: new Date('2026-10-01T10:00:00Z'),
    });
    await ach.add({ teacherName: 'معلمة تجريبية ٢', title: 'إنجاز ٢', status: 'pending', score: null });
    await db.collection('settings').doc('global_info').set({ schoolName: 'مدرسة الاختبار', departments: ['علوم'] });
    await db.collection('admin').doc('pinConfig').set({ pinHash: 'a'.repeat(128), adminEmail: 'bayanschool2026@gmail.com', tokenHash: 't'.repeat(64) });
    await db.collection('admin_achievementSecrets').doc(a1.id).set({ pinHash: 'b'.repeat(128) });

    // ── Production export → payload → encrypt ──
    const { data, startedAt, endedAt, totalDocuments } = await exportCollectionsForBackup(db);
    expect(totalDocuments).toBe(5);
    const payload = buildPayload({ data, startedAt, endedAt, pinPepper: PEPPER });
    const enc = encryptBuffer(serializePayload(payload), KEY);

    // ── Restore side: decrypt → validate ──
    const { payload: decoded } = parseAndVerify(enc, KEY);
    const v = validatePayload(decoded);
    expect(v.ok).toBe(true);
    expect(v.counts).toEqual({
      achievements: 2,
      settings: 1,
      admin: 1, // pinConfig survives; nothing else in admin
      admin_achievementSecrets: 1,
    });

    // ── Restore into distinct collections (merge upsert + Timestamp hydration) ──
    const { Timestamp } = await import('firebase-admin/firestore');
    for (const [col, docs] of Object.entries(decoded.data as Record<string, any[]>)) {
      for (const doc of docs) {
        const { id, ...docData } = doc;
        const hydrated: Record<string, unknown> = { ...docData };
        for (const k of Object.keys(hydrated)) {
          const val = hydrated[k];
          if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
            hydrated[k] = Timestamp.fromDate(new Date(val));
          }
        }
        await db.collection(`restore_check_${col}`).doc(id as string).set(hydrated, { merge: true });
      }
    }

    // ── Verify: counts, field fidelity, Timestamp restoration, secret preservation ──
    const restoredAch = await db.collection('restore_check_achievements').get();
    expect(restoredAch.size).toBe(2);
    const restoredA1 = await db.collection('restore_check_achievements').doc(a1.id).get();
    expect(restoredA1.data()?.title).toBe('إنجاز تجريبي');
    expect(restoredA1.data()?.timestamp?.toDate?.()).toEqual(new Date('2026-10-01T10:00:00Z'));

    const restoredPinConfig = await db.collection('restore_check_admin').doc('pinConfig').get();
    expect(restoredPinConfig.data()?.pinHash).toBe('a'.repeat(128)); // auth state preserved
    expect(restoredPinConfig.data()?.tokenHash).toBeUndefined(); // scrubbed pre-encryption
    expect(restoredPinConfig.data()?.adminEmail).toBe('bayanschool2026@gmail.com');

    const restoredSecrets = await db.collection('restore_check_admin_achievementSecrets').get();
    expect(restoredSecrets.size).toBe(1);
    expect(restoredSecrets.docs[0].data()?.pinHash).toBe('b'.repeat(128)); // teacher PIN preserved

    const restoredSettings = await db.collection('restore_check_settings').doc('global_info').get();
    expect(restoredSettings.data()?.departments).toEqual(['علوم']);
  });

  it('rejects a tampered backup file', async () => {
    const payload = buildPayload({
      data: { achievements: [{ id: 'x', title: 't' }], settings: [], admin: [], admin_achievementSecrets: [] },
      startedAt: '2026-10-28T00:00:00.000Z',
      endedAt: '2026-10-28T00:00:01.000Z',
      pinPepper: PEPPER,
    });
    const enc = encryptBuffer(serializePayload(payload), KEY);
    const tampered = Buffer.from(enc);
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => parseAndVerify(tampered, KEY)).toThrow();
  });
});
