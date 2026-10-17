// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  getToken,
  type AppCheck,
} from "firebase/app-check";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase only once to prevent Next.js hot-reloading errors
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Export the database and storage modules for use in our components
export const db = getFirestore(app);
export const storage = getStorage(app);

// ---- Firebase App Check (client) — Finding #8 ----
// Initialized only in the browser and only when a reCAPTCHA Enterprise site key
// is configured. Reuses an existing instance across hot reloads.
let appCheck: AppCheck | null = null;
const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
// "enterprise" → reCAPTCHA Enterprise / Google Cloud Fraud Defense (recommended).
// "v3" → legacy reCAPTCHA v3 (deprecated). Must match the provider chosen when
// registering the web app in Firebase Console → App Check.
const appCheckProvider = (process.env.NEXT_PUBLIC_APPCHECK_PROVIDER || "enterprise").toLowerCase();
if (
  typeof window !== "undefined" &&
  recaptchaSiteKey &&
  recaptchaSiteKey !== "your_site_key_here" &&
  !recaptchaSiteKey.startsWith("your_")
) {
  const g = globalThis as typeof globalThis & { __schoolAppCheck?: AppCheck };
  if (g.__schoolAppCheck) {
    appCheck = g.__schoolAppCheck;
  } else {
    try {
      const provider =
        appCheckProvider === "v3"
          ? new ReCaptchaV3Provider(recaptchaSiteKey)
          : new ReCaptchaEnterpriseProvider(recaptchaSiteKey);
      appCheck = initializeAppCheck(app, {
        provider,
        isTokenAutoRefreshEnabled: true,
      });
      g.__schoolAppCheck = appCheck;
    } catch (err) {
      console.error("[AppCheck] Failed to initialize:", err);
    }
  }
}

export { appCheck };

/**
 * Retrieve the current App Check token to attach to same-origin API calls
 * (e.g. the `X-Firebase-AppCheck` header on /api/upload). Returns null when
 * App Check is not configured on the client.
 */
export async function getAppCheckToken(): Promise<string | null> {
  if (!appCheck) return null;
  try {
    const { token } = await getToken(appCheck, false);
    return token;
  } catch (err) {
    console.error("[AppCheck] Failed to get token:", err);
    return null;
  }
}
