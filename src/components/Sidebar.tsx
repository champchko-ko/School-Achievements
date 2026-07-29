"use client";
import { Suspense, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, PlusCircle, BookOpen, Printer, Trophy, ShieldCheck, LogOut, Settings, MonitorPlay, Menu, X } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

function SidebarLinks({ isAdmin, onClose }: { isAdmin: boolean; onClose?: () => void }) {
  const pathname = usePathname();

  const linkClass = (path: string) =>
    `flex items-center gap-3 p-3 rounded-xl transition-colors ${pathname === path ? 'bg-white/10 hover:bg-white/20' : 'hover:bg-white/10'}`;

  return (
    <nav className="flex-1 p-3 sm:p-4 space-y-1 sm:space-y-2 mt-2 sm:mt-4">
      <Link href="/" onClick={onClose} className={linkClass('/')}>
        <Home size={20} />
        <span className="font-bold">الرئيسية</span>
      </Link>
      <Link href="/?add=true" onClick={onClose} className="flex items-center gap-3 p-3 rounded-xl transition-all hover:bg-white/10">
        <PlusCircle size={20} className="text-green-400" />
        <span className="font-bold">إضافة إنجاز</span>
      </Link>
      <Link href="/full-record" onClick={onClose} className={linkClass('/full-record')}>
        <BookOpen size={20} className="text-orange-300" />
        <span className="font-bold">السجل الكامل</span>
      </Link>
      <Link href="/honor-roll" onClick={onClose} className={linkClass('/honor-roll')}>
        <Trophy size={20} />
        <span className="font-bold">لوحة الشرف</span>
      </Link>
      {isAdmin && (
        <>
          <Link href="/reports" onClick={onClose} className={linkClass('/reports')}>
            <Printer size={20} className="text-pink-300" />
            <span className="font-bold">طباعة التقارير</span>
          </Link>
          <Link href="/settings" onClick={onClose} className={linkClass('/settings')}>
            <Settings size={20} className="text-slate-300" />
            <span className="font-bold">إعدادات المدرسة</span>
          </Link>
          <Link href="/kiosk" target="_blank" onClick={onClose} className="flex items-center gap-3 p-3 rounded-xl transition-all hover:bg-white/10">
            <MonitorPlay size={20} className="text-indigo-300" />
            <span className="font-bold">وضع العرض (Kiosk)</span>
          </Link>
        </>
      )}
    </nav>
  );
}

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [showAdminPrompt, setShowAdminPrompt] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [mounted, setMounted] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [schoolSettings, setSchoolSettings] = useState<{ schoolName?: string; logoUrl?: string } | null>(null);

  useEffect(() => {
    setMounted(true);
    setIsAdmin(localStorage.getItem('isAdmin') === 'true');

    const fetchSettings = async () => {
      try {
        const docRef = doc(db, "settings", "global_info");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setSchoolSettings(docSnap.data() as any);
        }
      } catch (error) {
        console.error("Error loading settings:", error);
      }
    };
    fetchSettings();
  }, []);

  const handleAdminSubmit = () => {
    if (pinInput === '9999') {
      setShowAdminPrompt(false);
      setPinInput('');
      setPinError('');
      localStorage.setItem('isAdmin', 'true');
      setIsAdmin(true);
      router.push('/admin');
    } else {
      setPinError('رمز المرور غير صحيح!');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('isAdmin');
    setIsAdmin(false);
    router.push('/');
  };

  const closeMobile = () => setMobileOpen(false);

  if (pathname === '/kiosk') return null;

  // The sidebar content (shared between desktop and mobile)
  const sidebarContent = (
    <aside className={`h-full bg-[#380e6e] text-white flex flex-col shadow-2xl print:hidden ${mobileOpen ? '' : ''}`}>
      <div className="p-4 sm:p-6 text-center border-b border-purple-700/30 flex flex-col items-center relative">
        {/* Mobile close button */}
        <button onClick={closeMobile} className="absolute top-2 left-2 sm:hidden p-1 rounded-lg hover:bg-white/10">
          <X size={20} />
        </button>

        {schoolSettings?.logoUrl && (
          <img src={schoolSettings.logoUrl} alt="School Logo" className="w-14 h-14 sm:w-20 sm:h-20 object-contain bg-white rounded-2xl mb-2 sm:mb-3 shadow-md p-1" />
        )}
        <h1 className="text-lg sm:text-2xl font-black text-yellow-400 drop-shadow-md leading-tight break-words">
          {schoolSettings?.schoolName || 'إنجازاتنا 🌟'}
        </h1>
        <p className="text-xs sm:text-sm mt-1 sm:mt-3 text-purple-200">المنصة الرقمية للتميز</p>
      </div>

      <Suspense fallback={<nav className="flex-1 p-4 space-y-2 mt-4"></nav>}>
        <SidebarLinks isAdmin={isAdmin} onClose={closeMobile} />
      </Suspense>

      <div className="p-3 sm:p-4 border-t border-purple-700/30">
        {!isAdmin ? (
          <button onClick={() => { setShowAdminPrompt(true); closeMobile(); }}
            className="flex w-full items-center gap-3 p-2 sm:p-3 rounded-xl bg-[#5b1fa8]/50 hover:bg-[#5b1fa8] transition-all text-xs sm:text-sm font-bold text-purple-200"
          >
            <ShieldCheck size={16} className="sm:size-[18px]" /> دخول الإدارة
          </button>
        ) : (
          <div className="flex flex-col gap-1 sm:gap-2">
            <Link href="/admin" onClick={closeMobile}
              className="flex w-full items-center gap-3 p-2 sm:p-3 rounded-xl bg-green-900/50 hover:bg-green-800 transition-all text-xs sm:text-sm font-bold text-green-400"
            >
              <ShieldCheck size={16} className="sm:size-[18px]" /> لوحة الإدارة
            </Link>
            <button onClick={() => { handleLogout(); closeMobile(); }}
              className="flex w-full items-center gap-3 p-2 sm:p-3 rounded-xl bg-red-900/50 hover:bg-red-800 transition-all text-xs sm:text-sm font-bold text-red-400"
            >
              <LogOut size={16} className="sm:size-[18px]" /> تسجيل الخروج
            </button>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 right-3 z-30 sm:hidden bg-[#380e6e] text-white p-2.5 rounded-xl shadow-lg"
      >
        <Menu size={22} />
      </button>

      {/* Mobile overlay sidebar */}
      {mounted && mobileOpen && createPortal(
        <div className="fixed inset-0 z-50 sm:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={closeMobile} />
          {/* Sidebar panel */}
          <div className="absolute inset-y-0 right-0 w-64 max-w-[75vw] animate-in slide-in-from-left duration-200 overflow-y-auto">
            {sidebarContent}
          </div>
        </div>,
        document.body
      )}

      {/* Desktop sidebar: hidden on mobile, visible on sm+ */}
      <div className="hidden sm:flex sm:flex-col sm:w-64 flex-shrink-0 h-full overflow-y-auto">
        {sidebarContent}

      {/* Admin PIN prompt modal */}
      {mounted && showAdminPrompt && createPortal(
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] animate-in fade-in duration-200">
          <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full mx-4 text-center animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-black text-[#46178f] mb-2">دخول الإدارة 🔐</h3>
            <p className="text-sm text-gray-500 mb-6">الرجاء إدخال رمز الدخول المكون من 4 أرقام</p>
            
            <input 
              type="password" 
              maxLength={4} 
              value={pinInput} 
              onChange={e => setPinInput(e.target.value)} 
              onKeyDown={e => e.key === "Enter" && handleAdminSubmit()} 
              placeholder="****" 
              className={`w-full text-center tracking-[1em] font-mono font-bold text-2xl bg-gray-50 border-2 rounded-xl p-3 outline-none transition-all ${pinError ? "border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-100" : "border-gray-200 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"}`} 
            />
            {pinError && <p className="text-red-500 font-bold text-sm mt-3 animate-in slide-in-from-top-1">{pinError}</p>}
            
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowAdminPrompt(false); setPinError(""); setPinInput(""); }} className="flex-1 py-3 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">إلغاء</button>
              <button onClick={handleAdminSubmit} className="flex-1 py-3 rounded-xl font-bold text-white bg-orange-500 hover:bg-orange-600 border-b-4 border-orange-700 active:border-b-0 active:translate-y-1 transition-all">تأكيد</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      </div>
    </>
  );
}
