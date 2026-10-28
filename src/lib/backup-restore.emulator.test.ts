// src/lib/backup-restore.emulator.test.ts
// End-to-end restore round-trip against the Firestore Emulator, using the Firebase
// CLIENT SDK (connectFirestoreEmulator — the Admin SDK's credential path hangs when
// ADC is unavailable). SKIPPED unless the emulator is running:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8090 npx vitest run src/lib/backup-restore.emulator.test.ts
// (start it:  npx firebase emulators:start --only firestore  — on a machine-local
//  permissive-rules config; the emulator is a throwaway project, never production).
//
// The test seeds a realistic mini-dataset (including Firestore Timestamps), runs the
// production export → encrypt → decrypt → validate → restore pipeline, and verifies
// counts, field fidelity, Timestamp restoration, secret preservation, and tamper rejection.
import { describe, it, expect, beforeAll } from 'vitest';
import {
  buildPayload,
  serializePayload,
  encryptBuffer,
  parseAndVerify,
  validatePayload,
} from './backup-format.mjs';
import { exportCollectionsForBackup } from './backup-export';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  Timestamp,
} from 'firebase/firestore';

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const d = EMULATOR ? describe : describe.skip;

const KEY = 'c'.repeat(64);
const PEPPER = 'emulator-pepper';
const PROJECT_ID = 'school-achievements-backup-test';

d('backup pipeline round-trip (Firestore Emulator)', () => {
  let fsdb: any;
  // Adapter so exportCollectionsForBackup (admin-style shape) can read via the client SDK.
  const dbLike: any = {
    collection: (col: string) => ({
      get: async () => {
        const snap = await getDocs(collection(fsdb, col));
        return {
          size: snap.size,
          docs: snap.docs.map((x: any) => ({ id: x.id, data: () => x.data() })),
        };
      },
    }),
  };

  beforeAll(() => {
    const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'emulator-demo-key' });
    fsdb = getFirestore(app);
    const [host, portStr] = EMULATOR!.split(':');
    connectFirestoreEmulator(fsdb, host, Number(portStr || 8080));
  });

  it('seeds, exports, encrypts, decrypts, restores, and verifies the round trip', async () => {
    // ── Seed a realistic mini-dataset ──
    await setDoc(doc(fsdb, 'achievements', 'seed-a1'), {
      teacherName: 'معلمة تجريبية',
      title: 'إنجاز تجريبي',
      status: 'approved',
      score: 95,
      timestamp: Timestamp.fromDate(new Date('2026-10-01T10:00:00Z')),
    });
    await setDoc(doc(fsdb, 'achievements', 'seed-a2'), {
      teacherName: 'معلمة تجريبية ٢',
      title: 'إنجاز ٢',
      status: 'pending',
      score: null,
    });
    await setDoc(doc(fsdb, 'settings', 'global_info'), { schoolName: 'مدرسة الاختبار', departments: ['علوم'] });
    await setDoc(doc(fsdb, 'admin', 'pinConfig'), {
      pinHash: 'a'.repeat(128),
      adminEmail: 'bayanschool2026@gmail.com',
      tokenHash: 't'.repeat(64),
    });
    await setDoc(doc(fsdb, 'admin_achievementSecrets', 'seed-a1'), { pinHash: 'b'.repeat(128) });

    // ── Production export → payload → encrypt ──
    const { data, startedAt, endedAt, totalDocuments } = await exportCollectionsForBackup(dbLike);
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
    for (const [col, docs] of Object.entries(decoded.data as Record<string, any[]>)) {
      for (const entry of docs) {
        const { id, ...docData } = entry;
        const hydrated: Record<string, unknown> = { ...docData };
        for (const k of Object.keys(hydrated)) {
          const val = hydrated[k];
          if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
            hydrated[k] = Timestamp.fromDate(new Date(val));
          }
        }
        await setDoc(doc(fsdb, `restore_check_${col}`, id as string), hydrated, { merge: true });
      }
    }

    // ── Verify: counts, field fidelity, Timestamp restoration, secret preservation ──
    const restoredAch = await getDocs(collection(fsdb, 'restore_check_achievements'));
    expect(restoredAch.size).toBe(2);
    const restoredA1 = await getDoc(doc(fsdb, 'restore_check_achievements', 'seed-a1'));
    expect(restoredA1.data()?.title).toBe('إنجاز تجريبي');
    expect((restoredA1.data()?.timestamp as any)?.toDate?.()).toEqual(new Date('2026-10-01T10:00:00Z'));

    const restoredPinConfig = await getDoc(doc(fsdb, 'restore_check_admin', 'pinConfig'));
    expect(restoredPinConfig.data()?.pinHash).toBe('a'.repeat(128)); // auth state preserved
    expect(restoredPinConfig.data()?.tokenHash).toBeUndefined(); // scrubbed pre-encryption
    expect(restoredPinConfig.data()?.adminEmail).toBe('bayanschool2026@gmail.com');

    const restoredSecrets = await getDocs(collection(fsdb, 'restore_check_admin_achievementSecrets'));
    expect(restoredSecrets.size).toBe(1);
    expect(restoredSecrets.docs[0].data()?.pinHash).toBe('b'.repeat(128)); // teacher PIN preserved

    const restoredSettings = await getDoc(doc(fsdb, 'restore_check_settings', 'global_info'));
    expect(restoredSettings.data()?.departments).toEqual(['علوم']);
  }, 120_000);

  it('rejects a tampered backup file', () => {
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
