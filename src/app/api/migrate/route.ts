// GET: One-time migration — set all existing achievements to status: 'approved'
// Admin session required. Remove this file after migration.

import { NextResponse } from 'next/server';
import { isAdminSession } from '../../../lib/admin-session';
import { getAdminDb, collection, getDocs, doc, updateDoc } from '../../../lib/firebase-admin';

export async function GET() {
  try {
    const isAdmin = await isAdminSession();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin required' }, { status: 401 });
    }

    const db = getAdminDb();
    const snapshot = await getDocs(collection(db, 'achievements'));
    
    let updated = 0;
    let skipped = 0;

    for (const d of snapshot.docs) {
      const data = d.data();
      if (!data.status) {
        await updateDoc(doc(db, 'achievements', d.id), { status: 'approved' });
        updated++;
      } else {
        skipped++;
      }
    }

    return NextResponse.json({ success: true, updated, skipped, total: snapshot.size });
  } catch (error: any) {
    console.error('Migration error:', error?.message || error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
