// src/app/api/upload/route.ts
// Server-side upload proxy: validates files before sending to Cloudinary

import { NextResponse } from 'next/server';

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

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'الملف مطلوب' }, { status: 400 });
    }

    // Validate file type server-side
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({
        error: `نوع الملف غير مدعوم: ${file.type}. الأنواع المسموحة: صور، فيديوهات، PDF، مستندات Word، ملفات نصية، أرشيفات ZIP/RAR`
      }, { status: 400 });
    }

    // Validate file size server-side
    if (file.size > MAX_FILE_SIZE) {
      const maxMB = MAX_FILE_SIZE / (1024 * 1024);
      return NextResponse.json({
        error: `حجم الملف كبير جداً (${(file.size / (1024 * 1024)).toFixed(1)} MB). الحد الأقصى هو ${maxMB} MB`
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

    return NextResponse.json({ secure_url: cloudData.secure_url });
  } catch (error: any) {
    console.error('Upload error:', error?.message || error);
    return NextResponse.json({ error: 'فشل رفع الملف' }, { status: 500 });
  }
}
