import { getAdminDb } from '../../lib/firebase-admin';
import IntroClient, { type IntroSettings } from './IntroClient';

// Short-lived in-memory cache so repeat requests don't pay a Firestore round
// trip (and the admin-SDK cold start is amortized) on a dynamic route.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { data: IntroSettings; expires: number } | null = null;

// Fetch the intro content on the server so the full layout is present on the
// first paint — eliminates the loading→content layout shift (CLS) and improves
// LCP. Falls back to empty settings if Firestore is unavailable.
async function loadSettings(): Promise<IntroSettings> {
  if (cached && cached.expires > Date.now()) return cached.data;
  try {
    const db = getAdminDb();
    const snap = await db.collection('settings').doc('global_info').get();
    if (!snap.exists) return {};
    const d = (snap.data() || {}) as Record<string, unknown>;
    const data: IntroSettings = {
      schoolName: (d.schoolName as string) ?? null,
      logoUrl: (d.logoUrl as string) ?? null,
      vision: (d.vision as string) ?? null,
      message: (d.message as string) ?? null,
      managerName: (d.managerName as string) ?? null,
      viceManagerName: (d.viceManagerName as string) ?? null,
      assistantManager2: (d.assistantManager2 as string) ?? null,
      computerDeptTeacher: (d.computerDeptTeacher as string) ?? null,
      computerDeptHead: (d.computerDeptHead as string) ?? null,
    };
    cached = { data, expires: Date.now() + CACHE_TTL_MS };
    return data;
  } catch (err) {
    console.error('Failed to load intro settings:', err);
    return {};
  }
}

export default async function IntroPage() {
  const settings = await loadSettings();
  return <IntroClient settings={settings} />;
}
