import Link from 'next/link';
import { FileQuestion, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-3xl p-8 border-2 border-purple-100 shadow-xl text-center space-y-6">
        <div className="w-16 h-16 bg-purple-100 text-[#46178f] rounded-2xl flex items-center justify-center mx-auto">
          <FileQuestion size={32} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-[#46178f] mb-2">الصفحة غير موجودة</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            الصفحة التي تبحث عنها قد تم نقلها أو حذفها أو أنها غير متوفرة حالياً.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 bg-[#46178f] hover:bg-[#380e6e] text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md"
          >
            <Home size={16} />
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

