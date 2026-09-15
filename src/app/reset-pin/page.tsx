"use client";
import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { ShieldCheck, Loader2, CheckCircle, AlertCircle, KeyRound } from 'lucide-react';

function ResetPinContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#46178f] via-[#380e6e] to-[#2a0a54] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
          <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
          <h1 className="text-xl font-black text-gray-800 mb-2">رابط غير صالح</h1>
          <p className="text-gray-500 font-bold text-sm">الرابط فارغ أو منتهي الصلاحية. يرجى طلب رابط جديد.</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (pin !== confirmPin) {
      setResult({ type: 'error', message: 'الرمزان غير متطابقين' });
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setResult({ type: 'error', message: 'الرمز يجب أن يكون 4 أرقام' });
      return;
    }
    setIsSubmitting(true);
    setResult(null);
    try {
      const res = await fetch('/api/pin/reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ type: 'success', message: 'تم تغيير الرمز بنجاح! يمكنك تسجيل الدخول الآن.' });
        setTimeout(() => router.push('/'), 2500);
      } else {
        setResult({ type: 'error', message: data.error || 'حدث خطأ' });
      }
    } catch {
      setResult({ type: 'error', message: 'حدث خطأ في الاتصال بالخادم' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#46178f] via-[#380e6e] to-[#2a0a54] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center">
        <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <KeyRound className="text-[#46178f]" size={32} />
        </div>
        <h1 className="text-xl font-black text-gray-800 mb-2">إعادة تعيين رمز الدخول</h1>
        <p className="text-gray-500 font-bold text-sm mb-6">أدخل الرمز الجديد المكون من 4 أرقام</p>

        <div className="space-y-3">
          <input
            type="password"
            maxLength={4}
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="الرمز الجديد"
            className="w-full text-center tracking-[1em] font-mono font-black text-2xl bg-gray-50 border-2 border-purple-100 rounded-2xl p-4 outline-none focus:border-[#46178f] focus:ring-4 focus:ring-purple-200 transition-all"
          />
          <input
            type="password"
            maxLength={4}
            value={confirmPin}
            onChange={e => setConfirmPin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="تأكيد الرمز"
            className="w-full text-center tracking-[1em] font-mono font-black text-2xl bg-gray-50 border-2 border-purple-100 rounded-2xl p-4 outline-none focus:border-[#46178f] focus:ring-4 focus:ring-purple-200 transition-all"
          />
        </div>

        {result && (
          <div className={`mt-4 p-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 ${result.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {result.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            {result.message}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !pin || !confirmPin}
          className="w-full mt-6 py-4 rounded-2xl font-black text-white bg-[#46178f] hover:bg-[#380e6e] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3"
        >
          {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <ShieldCheck size={20} />}
          تغيير الرمز
        </button>
      </div>
    </div>
  );
}

export default function ResetPinPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-[#46178f] via-[#380e6e] to-[#2a0a54] flex items-center justify-center"><Loader2 className="animate-spin text-[#ffb800]" size={40} /></div>}>
      <ResetPinContent />
    </Suspense>
  );
}
