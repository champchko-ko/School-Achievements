// Server-side Firebase Admin SDK — privileged access, no security rules
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

let adminDb: any = null;

function getDb() {
  if (adminDb) return adminDb;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccount) {
    try {
      const parsed = JSON.parse(serviceAccount);
      const app = getApps().length > 0 ? getApps()[0] : initializeApp({ credential: cert(parsed) });
      adminDb = getFirestore(app);
    } catch {
      const decoded = JSON.parse(Buffer.from(serviceAccount, 'base64').toString());
      const app = getApps().length > 0 ? getApps()[0] : initializeApp({ credential: cert(decoded) });
      adminDb = getFirestore(app);
    }
  } else {
    const app = getApps().length > 0 ? getApps()[0] : initializeApp();
    adminDb = getFirestore(app);
  }

  return adminDb;
}

// Compatibility wrappers: mirror client SDK function signatures
// so API routes need zero logic changes.

export function getAdminDb() { return getDb(); }

export function doc(db: any, ...pathSegments: string[]) {
  return getDb().doc(pathSegments.join('/'));
}

export function collection(db: any, path: string) {
  return getDb().collection(path);
}

export async function getDoc(ref: any) {
  const snap = await ref.get();
  // Wrap to match client SDK: exists() as a method, data() returns the data
  return {
    exists: () => snap.exists,
    data: () => snap.data(),
    id: snap.id,
    ref: snap.ref,
    _raw: snap,
  };
}

export async function getDocs(ref: any) {
  const snap = await ref.get();
  const docs = snap.docs.map((d: any) => ({
    id: d.id,
    data: () => d.data(),
    ref: d.ref,
  }));
  return { docs, size: snap.size, empty: snap.empty, forEach: (cb: any) => docs.forEach(cb) };
}

export async function setDoc(ref: any, data: any) {
  return ref.set(data, { merge: true });
}

export async function addDoc(ref: any, data: any) {
  return ref.add(data);
}

export async function updateDoc(ref: any, data: any) {
  return ref.update(data);
}

export async function deleteDoc(ref: any) {
  return ref.delete();
}

export function deleteField() {
  return FieldValue.delete();
}

export function serverTimestamp() {
  return FieldValue.serverTimestamp();
}
