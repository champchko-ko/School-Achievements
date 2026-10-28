import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendPinResetEmail(to: string, resetUrl: string): Promise<void> {
  await transporter.sendMail({
    from: `"إنجازات المدرسة" <${process.env.SMTP_USER}>`,
    to,
    subject: 'إعادة تعيين رمز الدخول الإداري',
    html: `
      <div style="direction:rtl;text-align:center;font-family:sans-serif;max-width:600px;margin:0 auto;padding:30px;">
        <div style="background:#46178f;color:white;padding:20px;border-radius:16px 16px 0 0;">
          <h1 style="margin:0;font-size:22px;">🏫 إعادة تعيين رمز الدخول</h1>
        </div>
        <div style="background:#f8f5ff;padding:30px;border-radius:0 0 16px 16px;border:2px solid #e5d5ff;">
          <p style="font-size:16px;color:#333;">تم طلب إعادة تعيين رمز الدخول الإداري.</p>
          <p style="font-size:16px;color:#333;">اضغط على الزر أدناه لإنشاء رمز جديد:</p>
          <a href="${resetUrl}" style="display:inline-block;background:#46178f;color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:bold;font-size:18px;margin:20px 0;">إعادة تعيين الرمز</a>
          <p style="font-size:13px;color:#888;margin-top:20px;">هذا الرابط صالح لمدة 15 دقيقة فقط.</p>
          <p style="font-size:13px;color:#888;">إذا لم تطلب إعادة التعيين، تجاهل هذه الرسالة.</p>
        </div>
      </div>
    `,
  });
}

/**
 * Email an encrypted backup archive to the backup destinations.
 * Returns the SMTP envelope result: `accepted` are recipients the server accepted
 * (submission — NOT confirmed delivery), `rejected` are recipients refused by the server.
 */
export async function sendBackupEmail(
  to: string[],
  subject: string,
  filename: string,
  content: Buffer
): Promise<{ accepted: string[]; rejected: string[] }> {
  const info = await transporter.sendMail({
    from: `"إنجازات المدرسة" <${process.env.SMTP_USER}>`,
    to: to.join(', '),
    subject,
    text: 'نسخة احتياطية مشفّرة (AES-256-GCM) من نظام إنجازات المدرسة. لا يمكن فك تشفير المرفق إلا بمفتاح النسخ الاحتياطي الخاص بالمشرف.',
    attachments: [
      {
        filename,
        content,
        contentType: 'application/octet-stream',
      },
    ],
  });
  const toAddress = (a: string | { address: string }) => (typeof a === 'string' ? a : a.address);
  return {
    accepted: ((info as { accepted?: Array<string | { address: string }> }).accepted || []).map(toAddress),
    rejected: ((info as { rejected?: Array<string | { address: string }> }).rejected || []).map(toAddress),
  };
}
