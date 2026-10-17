// src/app/api/cleanup/route.ts
// Admin-only maintenance API:
//  - action=scan    -> report broken references + orphaned Cloudinary files + storage usage
//  - action=clean   -> fix broken references and delete orphaned files
//  - action=assets  -> return type/size metadata for given attachment URLs

import { NextResponse } from 'next/server';
import { logInfo, logWarn, logError } from '../../../lib/logger';
import { isAdminSession, verifyRollbackToken } from '../../../lib/admin-session';
import { getAdminDb, collection, deleteField, doc, getDoc, getDocs, setDoc, updateDoc } from '../../../lib/firebase-admin';

import {
  cloudinaryConfig,
  collectAttachmentUrls,
  destroyByPublicId,
  destroyCloudinaryAsset,
  extractCloudinaryAsset,
  listCloudinaryAssets,
} from '../../../lib/cloudinary';

function formatBytes(n: number): string {
  if (!n) return '0 KB';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function fileNameFromUrl(url: string): string {
  try {
    return decodeURIComponent(url).split('/').pop()?.split('?')[0] || 'ملف مرفق';
  } catch {
    return 'ملف مرفق';
  }
}

// Uses Admin SDK via shared config

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body?.action || 'scan';

    // Support action: "rollback" with a list of URLs uploaded in the current session
    if (action === 'rollback') {
      const urls = Array.isArray(body.urls) ? (body.urls as string[]) : [];
      if (urls.length === 0) return NextResponse.json({ ok: true, deletedCount: 0 });

      // Security check (MUST-01): User must be admin OR provide valid signed rollback token for each URL
      const isAdmin = await isAdminSession();
      if (!isAdmin) {
        const tokens: Record<string, string> = body.tokens || {};
        const items: Array<{ url: string; token: string }> = Array.isArray(body.items) ? body.items : [];
        if (items.length > 0) {
          for (const item of items) {
            if (item?.url && item?.token) tokens[item.url] = item.token;
          }
        }

        const allValid = urls.length > 0 && urls.every((url) => verifyRollbackToken(url, tokens[url]));
        if (!allValid) {
          logWarn('security', 'Rejected unauthenticated rollback attempt with missing or invalid tokens', { urls }, request);
          return NextResponse.json({ error: 'غير مصرح بهذا الإجراء. رمز التراجع غير صالح أو منتهي الصلاحية.' }, { status: 401 });
        }

      }

      // Validate that all URLs are strings and belong to Cloudinary
      const validUrls = urls.filter((u: any) => typeof u === 'string' && u.includes('cloudinary.com'));
      const results = await Promise.allSettled(validUrls.map(destroyCloudinaryAsset));
      const deletedCount = results.filter(r => r.status === 'fulfilled' && (r.value as any)?.ok).length;
      return NextResponse.json({ ok: true, deletedCount });
    }


    const isAdmin = await isAdminSession();
    if (!isAdmin) {
      return NextResponse.json({ error: 'غير مصرح بهذا الإجراء. تسجيل الدخول كمدير مطلوب.' }, { status: 401 });
    }

    // Return metadata (type + size) for a list of URLs — used in delete confirmations
    if (action === 'assets') {
      const urls = Array.isArray(body.urls) ? (body.urls as string[]) : [];
      const assets = await listCloudinaryAssets();
      const results = urls.map((url) => {
        const asset = extractCloudinaryAsset(url);
        if (!asset) {
          return { url, name: fileNameFromUrl(url), type: 'document', bytes: 0, formatted: '' };
        }
        const info = assets.get(`${asset.resourceType}:${asset.publicId}`);
        const type =
          asset.resourceType === 'image' ? 'image' : asset.resourceType === 'video' ? 'video' : 'document';
        return {
          url,
          name: fileNameFromUrl(url),
          type,
          bytes: info?.bytes || 0,
          formatted: info ? formatBytes(info.bytes) : '',
        };
      });
      return NextResponse.json({ assets: results });
    }

    const db = getAdminDb();

    const snapshot = await getDocs(collection(db, 'achievements'));
    const achievementDocs = snapshot.docs.map((d: any) => ({ id: d.id, data: d.data() }));
    const cloudAssets = await listCloudinaryAssets();

    // Build reference map: `${resourceType}:${publicId}` -> first achievement referencing it
    const refs = new Map<string, { url: string; achievementId: string; title: string; resourceType: string; publicId: string }>();
    for (const { id, data } of achievementDocs) {
      const title = data?.title || '(بدون عنوان)';
      for (const url of collectAttachmentUrls(data)) {
        const asset = extractCloudinaryAsset(url);
        if (!asset) continue;
        const key = `${asset.resourceType}:${asset.publicId}`;
        if (!refs.has(key)) {
          refs.set(key, { url, achievementId: id, title, resourceType: asset.resourceType, publicId: asset.publicId });
        }
      }
    }

    // Build flat sets: auto/upload may store as different resourceType than URL shows
    const allCloudPublicIds = new Set(Array.from(cloudAssets.keys()).map(k => k.split(':')[1]));
    const broken = Array.from(refs.values()).filter((r) => !allCloudPublicIds.has(r.publicId));
    const refPublicIds = new Set(Array.from(refs.values()).map(r => r.publicId));
    const orphans = Array.from(cloudAssets.values()).filter(
      (a) => !refPublicIds.has(a.publicId) && a.publicId !== 'sample'
    );
    const storageBytes = Array.from(cloudAssets.values()).reduce((sum, a) => sum + a.bytes, 0);

    if (action === 'scan') {
      return NextResponse.json({
        storage: { count: cloudAssets.size, bytes: storageBytes, formatted: formatBytes(storageBytes) },
        broken: broken.map((b) => ({
          achievementId: b.achievementId,
          title: b.title,
          url: b.url,
          publicId: b.publicId,
          resourceType: b.resourceType,
        })),
        orphans: orphans.map((o) => ({
          publicId: o.publicId,
          resourceType: o.resourceType,
          bytes: o.bytes,
          formatted: formatBytes(o.bytes),
        })),
      });
    }

    if (action === 'clean') {
      // 1) Fix broken references: remove URLs that no longer exist in Cloudinary
      const brokenByAchievement = new Map<string, string[]>();
      for (const b of broken) {
        const list = brokenByAchievement.get(b.achievementId) || [];
        list.push(b.url);
        brokenByAchievement.set(b.achievementId, list);
      }
      let fixedReferences = 0;
      const achievementsFixed = brokenByAchievement.size;
      for (const [achievementId, brokenUrls] of brokenByAchievement) {
        const data = achievementDocs.find((d: any) => d.id === achievementId)?.data || {};
        const nextUrls = collectAttachmentUrls(data).filter((u) => !brokenUrls.includes(u));
        const update: any = { attachmentUrls: nextUrls };
        if (typeof data?.fileUrl === 'string' && brokenUrls.includes(data.fileUrl)) update.fileUrl = deleteField();
        if (typeof data?.attachmentUrl === 'string' && brokenUrls.includes(data.attachmentUrl)) update.attachmentUrl = deleteField();
        await updateDoc(doc(db, 'achievements', achievementId), update);
        fixedReferences += brokenUrls.length;
      }

      // 2) Delete orphaned Cloudinary files
      const errors: string[] = [];
      let orphansDeletedBytes = 0;
      let orphansDeleted = 0;
      for (const o of orphans) {
        const result = await destroyByPublicId(o.publicId, o.resourceType);
        if (result.ok) {
          orphansDeleted += 1;
          orphansDeletedBytes += o.bytes;
        } else {
          errors.push(`${o.publicId}: ${result.result}`);
        }
      }

      // 3) Migrate & scrub legacy secrets (MUST-03):
      // Move any legacy pinHash in achievements to admin/achievementSecrets/{id} and deleteField()
      let legacyPinsCleaned = 0;
      for (const { id, data } of achievementDocs) {
        if (data?.pinHash) {
          const secretRef = doc(db, 'admin', 'achievementSecrets', id);
          const secretSnap = await getDoc(secretRef);
          if (!secretSnap.exists()) {
            await setDoc(secretRef, { pinHash: data.pinHash });
          }
          await updateDoc(doc(db, 'achievements', id), { pinHash: deleteField() });
          legacyPinsCleaned++;
        }
      }

      // Scrub adminPin and adminEmail from settings/global_info if present
      let settingsCleaned = false;
      const settingsRef = doc(db, 'settings', 'global_info');
      const settingsSnap = await getDoc(settingsRef);
      if (settingsSnap.exists()) {
        const sData = settingsSnap.data();
        if (sData?.adminPin || sData?.adminEmail) {
          const pinConfigRef = doc(db, 'admin', 'pinConfig');
          const pinConfigSnap = await getDoc(pinConfigRef);
          const pinData = pinConfigSnap.exists() ? pinConfigSnap.data() : {};
          const updates: Record<string, any> = {};
          if (sData.adminEmail && !pinData.adminEmail) updates.adminEmail = sData.adminEmail;
          if (Object.keys(updates).length > 0) {
            await setDoc(pinConfigRef, { ...pinData, ...updates });
          }
          await updateDoc(settingsRef, {
            adminPin: deleteField(),
            adminEmail: deleteField(),
          });
          settingsCleaned = true;
        }
      }

      return NextResponse.json({
        fixedReferences,
        achievementsFixed,
        orphansDeleted,
        storageFreed: formatBytes(orphansDeletedBytes),
        legacyPinsCleaned,
        settingsCleaned,
        errors,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    logError('api', 'Cleanup error:', error?.message || error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

