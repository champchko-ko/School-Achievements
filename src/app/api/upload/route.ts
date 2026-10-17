import { NextResponse } from 'next/server';
import { logInfo, logWarn, logError, logRateLimitHit } from '../../../lib/logger';
import { checkRateLimit, getClientIp } from '../../../lib/rate-limit';
import { isValidOrigin } from '../../../lib/csrf';
import { createRollbackToken } from '../../../lib/admin-session';
import { signUploadParams } from '../../../lib/cloudinary';
import { verifyAppCheckToken } from '../../../lib/firebase-admin';

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

// Per-type file count limits (mirror of client-side FILE_LIMITS)
const FILE_COUNT_LIMITS = { image: 4, video: 1, application: 1 };

// Per-type size limits
const SIZE_LIMITS: Record<string, number> = {
  'image': 10 * 1024 * 1024,    // 10 MB for images
  'video': 100 * 1024 * 1024,   // 100 MB for videos
  'application': 20 * 1024 * 1024, // 20 MB for documents
  'text': 5 * 1024 * 1024,      // 5 MB for text files
};
const DEFAULT_MAX = 20 * 1024 * 1024; // 20 MB fallback

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false;

  // Images
  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  }
  if (mimeType === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  }
  if (mimeType === 'image/gif') {
    return buffer.subarray(0, 3).toString('ascii') === 'GIF';
  }
  if (mimeType === 'image/webp') {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
           buffer.length >= 12 &&
           buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }

  // Documents
  if (mimeType === 'application/pdf') {
    return buffer.subarray(0, 4).toString('ascii') === '%PDF';
  }
  if (mimeType === 'application/msword') {
    return buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0;
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mimeType === 'application/zip') {
    return buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
  }
  if (mimeType === 'application/x-rar-compressed') {
    return buffer.subarray(0, 4).toString('ascii') === 'Rar!';
  }
  if (mimeType === 'text/plain') {
    // Check first 1KB for null bytes (binary) or HTML/script injection
    const slice = buffer.subarray(0, Math.min(buffer.length, 1024));
    if (slice.includes(0x00)) return false;
    const text = slice.toString('utf-8').toLowerCase();
    if (text.includes('<script') || text.includes('<svg') || text.includes('<html') || text.includes('<?xml') || text.includes('<!doctype')) {
      return false;
    }
    return true;
  }

  // Video
  if (mimeType === 'video/mp4' || mimeType === 'video/quicktime') {
    if (buffer.length < 8) return false;
    const typeStr = buffer.subarray(4, 8).toString('ascii');
    return typeStr === 'ftyp' || typeStr === 'moov';
  }
  if (mimeType === 'video/webm') {
    return buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3;
  }

  return false;
}

export async function POST(request: Request) {
  try {
    // CSRF protection: uploads must originate from a trusted host (Finding #4)
    if (!isValidOrigin(request)) {
      logWarn('upload', 'Rejected upload with invalid origin', {}, request);
      return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    }

    // Firebase App Check enforcement (Finding #8). Enforced in production only when
    // App Check is configured via NEXT_PUBLIC_RECAPTCHA_SITE_KEY, preventing production
    // upload outages if reCAPTCHA credentials are not provisioned.
    const recaptchaKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
    const isAppCheckConfigured = Boolean(recaptchaKey && recaptchaKey !== 'your_site_key_here' && !recaptchaKey.startsWith('your_'));
    if (process.env.NODE_ENV === 'production' && isAppCheckConfigured) {
      const appCheckToken = request.headers.get('x-firebase-appcheck');
      const appCheckValid = await verifyAppCheckToken(appCheckToken);
      if (!appCheckValid) {
        logWarn('upload', 'Rejected upload: missing or invalid App Check token', {}, request);
        return NextResponse.json({ error: 'فشل التحقق من أمان التطبيق.' }, { status: 401 });
      }
    }

    // Rate limit: 10 uploads per 10 minutes per IP (leftmost client IP) (Finding #4)
    const ip = getClientIp(request);
    const { allowed, resetAt } = await checkRateLimit(`upload:${ip}`, { maxRequests: 10, windowMs: 600_000 });
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

    // Validate file magic bytes against declared MIME type (MUST-11)
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    if (!validateMagicBytes(fileBuffer, file.type)) {
      logWarn('upload', 'Rejected file due to magic byte mismatch', { fileName: file.name, fileType: file.type }, request);
      return NextResponse.json({
        error: 'محتوى الملف غير متطابق مع الامتداد المحدد أو يحتوي على بيانات غير آمنة.'
      }, { status: 400 });
    }

    // Forward to Cloudinary using server-side signed authentication (Finding #5).
    // The upload preset must be configured as a "Signed" preset in the Cloudinary
    // console; unsigned presets are rejected when a signature is provided.
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !uploadPreset || !apiKey || !apiSecret) {
      return NextResponse.json({ error: 'Cloudinary not configured' }, { status: 500 });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signUploadParams({ timestamp, upload_preset: uploadPreset }, apiSecret, 'sha256');

    const cloudFormData = new FormData();
    cloudFormData.append('file', new Blob([fileBuffer], { type: file.type }), file.name);
    cloudFormData.append('api_key', apiKey);
    cloudFormData.append('timestamp', String(timestamp));
    cloudFormData.append('upload_preset', uploadPreset);
    cloudFormData.append('signature', signature);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
      method: 'POST',
      body: cloudFormData,
    });

    const cloudData = await res.json();
    if (!res.ok) {
      throw new Error(cloudData.error?.message || 'Cloudinary upload failed');
    }

    logInfo('upload', 'File uploaded', { fileName: file.name, fileSize: file.size, fileType: file.type }, request);
    const rollbackToken = createRollbackToken(cloudData.secure_url);
    return NextResponse.json({ secure_url: cloudData.secure_url, rollback_token: rollbackToken });
  } catch (error: any) {
    logError('upload', 'Upload failed', { error: error?.message }, request);
    return NextResponse.json({ error: 'فشل رفع الملف' }, { status: 500 });
  }
}

