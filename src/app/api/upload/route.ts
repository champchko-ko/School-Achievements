// src/app/api/upload/route.ts
// Server-side upload proxy: validates files before sending to Cloudinary

import { NextResponse } from 'next/server';
import { logInfo, logWarn, logError } from '../../../lib/logger';
import { checkRateLimit } from '../../../lib/rate-limit';
import { logRateLimitHit } from '../../../lib/logger';

const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  // Documents
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  // Videos
  'video/mp4', 'video/webm', 'video/quicktime',
  // Archives
  'application/zip', 'application/x-rar-compressed',
];

// Per-type size limits
const SIZE_LIMITS: Record<string, number> = {
  'image': 10 * 1024 * 1024,    // 10 MB for images
  'video': 100 * 1024 * 1024,   // 100 MB for videos
  'application': 20 * 1024 * 1024, // 20 MB for documents
  'text': 5 * 1024 * 1024,      // 5 MB for text files
};
const DEFAULT_MAX = 20 * 1024 * 1024; // 20 MB fallback

export async function POST(request: Request) {
  try {
    // Rate limit: 20 uploads per hour per IP
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const { allowed, resetAt } = checkRateLimit(`upload:${ip}`, { maxRequests: 20, windowMs: 3_600_000 });
    if (!allowed) {
      logRateLimitHit(`upload:${ip}`, request);
      return NextResponse.json({
        error: 'تم تجاوز الحد المسموح برفع الملفات. الرجاء المحاولة لاحقاً.',
        resetAt
      }, { status: 429 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'الملف مطلوب' }, { status: 400 });
    }

    // Validate file type server-side
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      logWarn('upload', 'Rejected file type', { fileName: file.name, fileType: file.type }, request);
      return NextResponse.json({
        error: `نوع الملف غير مدعوم: ${file.type}. الأنواع المسموحة: صور، فيديوهات، PDF، مستندات Word، ملفات نصية، أرشيفات ZIP/RAR`
      }, { status: 400 });
    }

    // Validate file size server-side (per type)
    const category = file.type.split('/')[0] || '';
    const maxSize = SIZE_LIMITS[category] || DEFAULT_MAX;
    if (file.size > maxSize) {
      const fileMB = (file.size / (1024 * 1024)).toFixed(1);
      const maxMB = (maxSize / (1024 * 1024)).toFixed(0);
      logWarn('upload', 'Rejected oversized file', { fileName: file.name, fileSize: file.size, maxSize }, request);
      return NextResponse.json({
        error: `حجم الملف كبير جداً (${fileMB} MB). الحد الأقصى لهذا النوع هو ${maxMB} MB`
      }, { status: 400 });
    }

    // Forward to Cloudinary
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
      return NextResponse.json({ error: 'Cloudinary not configured' }, { status: 500 });
    }

    const cloudFormData = new FormData();
    cloudFormData.append('file', file);
    cloudFormData.append('upload_preset', uploadPreset);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
      method: 'POST',
      body: cloudFormData,
    });

    const cloudData = await res.json();
    if (!res.ok) {
      throw new Error(cloudData.error?.message || 'Cloudinary upload failed');
    }

    logInfo('upload', 'File uploaded', { fileName: file.name, fileSize: file.size, fileType: file.type }, request);
    return NextResponse.json({ secure_url: cloudData.secure_url });
  } catch (error: any) {
    logError('upload', 'Upload failed', { error: error?.message }, request);
    return NextResponse.json({ error: 'فشل رفع الملف' }, { status: 500 });
  }
}
