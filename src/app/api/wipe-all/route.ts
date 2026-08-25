import { NextResponse } from 'next/server';
import { isAdminSession } from '../../../lib/admin-session';

export async function POST() {
  try {
    const isAdmin = await isAdminSession();
    if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { initializeApp, getApps, getApp } = await import('firebase/app');
    const { getFirestore, collection, getDocs, doc, deleteDoc } = await import('firebase/firestore');

    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };
    const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    const db = getFirestore(app);

    const results: any = { cloudinary: { deleted: 0 }, firestore: {} };

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (cloudName && apiKey && apiSecret) {
      const auth = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
      for (const rt of ['image', 'video', 'raw']) {
        let cursor: string | undefined;
        while (true) {
          let url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/${rt}?max_results=500`;
          if (cursor) url += `&next_cursor=${encodeURIComponent(cursor)}`;
          const res = await fetch(url, { headers: { Authorization: auth } });
          if (!res.ok) break;
          const data = await res.json();
          for (const r of data?.resources || []) {
            const delRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${rt}/destroy`, {
              method: 'POST',
              headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ public_id: r.public_id }).toString(),
            });
            const delData = await delRes.json();
            if (delData.result === 'ok') results.cloudinary.deleted++;
          }
          cursor = data?.next_cursor;
          if (!cursor) break;
        }
      }
    }

    for (const col of ['achievements', 'settings']) {
      const snap = await getDocs(collection(db, col));
      let count = 0;
      for (const d of snap.docs) {
        await deleteDoc(doc(db, col, d.id));
        count++;
      }
      results.firestore[col] = count;
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
}
