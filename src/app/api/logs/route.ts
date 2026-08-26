// GET: Fetch recent security logs (admin session required)
import { NextResponse } from 'next/server';
import { isAdminSession } from '../../../lib/admin-session';
import { getAdminDb } from '../../../lib/firebase-admin';

export async function GET(request: Request) {
  try {
    const isAdmin = await isAdminSession();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin required' }, { status: 401 });
    }

    const db = getAdminDb();
    const snap = await db.collection('logs').orderBy('timestamp', 'desc').limit(50).get();
    const logs = snap.docs.map((d: any) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        timestamp: data.timestamp?.toDate?.() || null,
      };
    });

    return NextResponse.json({ logs });
  } catch (error: any) {
    console.error('Logs fetch error:', error?.message || error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
