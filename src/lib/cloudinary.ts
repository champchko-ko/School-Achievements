// src/lib/cloudinary.ts
// Server-side helpers for Cloudinary's Admin API (listing and deleting assets).

type CloudinaryConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

export type CloudinaryAsset = {
  publicId: string;
  resourceType: string;
  bytes: number;
  format: string;
};

export function cloudinaryConfig(): CloudinaryConfig | null {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}

function authHeader(cfg: CloudinaryConfig): string {
  return 'Basic ' + Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString('base64');
}

// Extracts { publicId, resourceType } from a Cloudinary URL like
// https://res.cloudinary.com/{cloud}/image/upload/v123/folder/name.jpg
export function extractCloudinaryAsset(url: string): { publicId: string; resourceType: string } | null {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('cloudinary.com')) return null;
    const segments = u.pathname.split('/').filter(Boolean);
    if (segments.length < 3) return null;
    const resourceType = segments[1];
    if (resourceType !== 'image' && resourceType !== 'video' && resourceType !== 'raw') return null;
    const uploadIdx = segments.indexOf('upload');
    if (uploadIdx === -1) return null;
    const rest = segments.slice(uploadIdx + 1);
    // Skip transformation segments (e.g. fl_attachment, f_auto) until the version segment (v123456)
    let start = 0;
    for (let i = 0; i < rest.length; i++) {
      if (/^v\d+$/.test(rest[i])) {
        start = i + 1;
        break;
      }
    }
    if (start >= rest.length) return null;
    const publicId = rest.slice(start).join('/').replace(/\.[^./]+$/, '');
    if (!publicId) return null;
    return { publicId, resourceType };
  } catch {
    return null;
  }
}

// Merges all attachment sources stored on an achievement document.
export function collectAttachmentUrls(docData: any): string[] {
  const urls: string[] = [];
  if (Array.isArray(docData?.attachmentUrls)) urls.push(...docData.attachmentUrls);
  if (typeof docData?.fileUrl === 'string') urls.push(docData.fileUrl);
  if (typeof docData?.attachmentUrl === 'string') urls.push(docData.attachmentUrl);
  return Array.from(new Set(urls.filter(Boolean)));
}

// Deletes a single asset from Cloudinary by URL (best-effort).
export async function destroyCloudinaryAsset(url: string): Promise<{ ok: boolean; result?: string }> {
  const asset = extractCloudinaryAsset(url);
  if (!asset) return { ok: true, result: 'skipped' };
  return destroyByPublicId(asset.publicId, asset.resourceType);
}

// Deletes a single asset from Cloudinary by public_id + resource type (best-effort).
export async function destroyByPublicId(publicId: string, resourceType: string): Promise<{ ok: boolean; result?: string }> {
  try {
    const cfg = cloudinaryConfig();
    if (!cfg) return { ok: false, result: 'not-configured' };
    const endpoint = `https://api.cloudinary.com/v1_1/${cfg.cloudName}/${resourceType}/destroy`;
    const body = new URLSearchParams({ public_id: publicId });
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: authHeader(cfg),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    const data = await res.json();
    return { ok: res.ok, result: data?.result || data?.error?.message || 'unknown' };
  } catch (error: any) {
    console.error('Cloudinary destroy error:', error?.message || error);
    return { ok: false, result: 'error' };
  }
}

// Lists every asset in the account, keyed by `${resourceType}:${publicId}`.
export async function listCloudinaryAssets(): Promise<Map<string, CloudinaryAsset>> {
  const map = new Map<string, CloudinaryAsset>();
  const cfg = cloudinaryConfig();
  if (!cfg) return map;
  for (const resourceType of ['image', 'video', 'raw']) {
    let cursor: string | undefined;
    while (true) {
      let url = `https://api.cloudinary.com/v1_1/${cfg.cloudName}/resources/${resourceType}?max_results=500`;
      if (cursor) url += `&next_cursor=${encodeURIComponent(cursor)}`;
      const res = await fetch(url, { headers: { Authorization: authHeader(cfg) } });
      if (!res.ok) break;
      const data = await res.json();
      for (const r of data?.resources || []) {
        map.set(`${resourceType}:${r.public_id}`, {
          publicId: r.public_id,
          resourceType,
          bytes: r.bytes || 0,
          format: r.format || '',
        });
      }
      cursor = data?.next_cursor;
      if (!cursor) break;
    }
  }
  return map;
}
