'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled application error:', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-3xl p-8 border-2 border-purple-100 shadow-xl text-center space-y-6">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
          <AlertTriangle size={32} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-[#46178f] mb-2">عذراً، حدث خطأ غير متوقع</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            حدث خطأ أثناء معالجة طلبك. يمكنك محاولة إعادة تحميل الصفحة أو العودة إلى الصفحة الرئيسية.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            onClick={() => reset()}
            className="flex items-center justify-center gap-2 bg-[#46178f] hover:bg-[#380e6e] text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md"
          >
            <RefreshCw size={16} />
            إعادة المحاولة
          </button>
          <Link
            href="/"
            className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-bold text-sm transition-all"
          >
            <Home size={16} />
            الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

