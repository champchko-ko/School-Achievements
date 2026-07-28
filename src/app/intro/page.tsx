"use client";
import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useRouter } from 'next/navigation';
import { Loader2, ChevronDown, Sparkles, GraduationCap, Eye } from 'lucide-react';

export default function IntroPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, "settings", "global_info");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setSettings(docSnap.data());
        }
      } catch (error) {
        console.error("Error loading settings:", error);
      } finally {
        setLoading(false);
        setTimeout(() => setShowContent(true), 300);
        setTimeout(() => setFadeIn(true), 600);
      }
    };
    fetchSettings();
  }, []);

  const handleEnter = () => {
    sessionStorage.setItem('introSeen', 'true');
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#4a154b] via-[#6b1d6d] to-[#8e2490] flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-purple-200 font-bold text-lg animate-pulse">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  const schoolName = settings?.schoolName || 'منصة إنجازاتنا';
  const logoUrl = settings?.logoUrl;
  const vision = settings?.vision || 'التميز في التعليم وبناء جيل مبدع';
  const message = settings?.message || 'توفير بيئة تعليمية محفزة للإبداع والابتكار';
  const managerName = settings?.managerName;
  const viceManager = settings?.viceManagerName;
  const assistant2 = settings?.assistantManager2;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#4a154b] via-[#6b1d6d] to-[#8e2490] flex flex-col relative overflow-hidden">
      
      {/* Animated Background Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 bg-white/10 rounded-full animate-ping"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${3 + Math.random() * 4}s`,
              width: `${4 + Math.random() * 8}px`,
              height: `${4 + Math.random() * 8}px`,
            }}
          />
        ))}
      </div>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col items-center justify-center px-6 py-12 relative z-10 transition-all duration-1000 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        
        {/* Logo */}
        <div className={`transition-all duration-1000 delay-200 ${fadeIn ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
          {logoUrl ? (
            <div className="relative group mb-8">
              <div className="absolute inset-0 bg-yellow-400/30 rounded-full blur-2xl animate-pulse"></div>
              <img 
                src={logoUrl} 
                alt="School Logo" 
                className="w-28 h-28 md:w-36 md:h-36 object-contain relative z-10 drop-shadow-2xl animate-bounce-slow" 
              />
            </div>
          ) : (
            <div className="w-28 h-28 md:w-36 md:h-36 bg-white/10 rounded-full flex items-center justify-center mb-8 border-4 border-yellow-400/50">
              <GraduationCap size={64} className="text-yellow-400" />
            </div>
          )}
        </div>

        {/* School Name */}
        <h1 className={`text-3xl md:text-5xl font-black text-yellow-400 text-center mb-4 drop-shadow-lg transition-all duration-1000 delay-400 ${fadeIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
          {schoolName}
        </h1>

        {/* Decorative Line */}
        <div className={`w-24 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent rounded-full mb-8 transition-all duration-1000 delay-500 ${fadeIn ? 'opacity-100 w-48' : 'opacity-0 w-24'}`}></div>

        {/* Vision */}
        <div className={`max-w-2xl text-center mb-4 transition-all duration-1000 delay-600 ${fadeIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
          <p className="text-purple-200/80 text-sm font-bold mb-2 tracking-wider">— رؤيتنا —</p>
          <p className="text-white text-lg md:text-xl font-bold leading-relaxed">{vision}</p>
        </div>

        {/* Message */}
        <div className={`max-w-2xl text-center mb-10 transition-all duration-1000 delay-700 ${fadeIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
          <p className="text-purple-200/80 text-sm font-bold mb-2 tracking-wider">— رسالتنا —</p>
          <p className="text-white/90 text-base md:text-lg leading-relaxed">{message}</p>
        </div>

        {/* Leadership Team */}
        <div className={`flex flex-wrap justify-center gap-6 md:gap-10 mb-12 transition-all duration-1000 delay-800 ${fadeIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
          {managerName && (
            <div className="text-center">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-yellow-400/20 rounded-full flex items-center justify-center mx-auto mb-2 border-2 border-yellow-400/50">
                <Eye size={28} className="text-yellow-400" />
              </div>
              <p className="text-yellow-400 font-bold text-sm">مدير المدرسة</p>
              <p className="text-white font-bold">{managerName}</p>
            </div>
          )}
          {viceManager && (
            <div className="text-center">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-purple-400/20 rounded-full flex items-center justify-center mx-auto mb-2 border-2 border-purple-400/50">
                <Eye size={28} className="text-purple-300" />
              </div>
              <p className="text-purple-300 font-bold text-sm">النائب</p>
              <p className="text-white font-bold">{viceManager}</p>
            </div>
          )}
          {assistant2 && (
            <div className="text-center">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-purple-400/20 rounded-full flex items-center justify-center mx-auto mb-2 border-2 border-purple-400/50">
                <Eye size={28} className="text-purple-300" />
              </div>
              <p className="text-purple-300 font-bold text-sm">النائب الثاني</p>
              <p className="text-white font-bold">{assistant2}</p>
            </div>
          )}
        </div>

        {/* Enter Button */}
        <button
          onClick={handleEnter}
          className={`group px-10 py-4 bg-gradient-to-l from-yellow-500 to-yellow-400 hover:from-yellow-400 hover:to-yellow-300 text-[#4a154b] rounded-2xl font-black text-lg shadow-2xl shadow-yellow-500/30 transition-all duration-300 hover:scale-105 active:scale-95 flex items-center gap-3 transition-all duration-1000 delay-900 ${fadeIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}
        >
          <Sparkles size={22} className="group-hover:rotate-12 transition-transform" />
          دخول
          <ChevronDown size={22} className="group-hover:translate-y-1 transition-transform" />
        </button>
      </div>

      {/* Footer */}
      <div className="text-center pb-4 relative z-10">
        <p className="text-purple-300/40 text-xs font-bold">منصة إنجازات المدرسة الرقمية</p>
      </div>

      <style jsx>{`
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        .animate-bounce-slow {
          animation: bounce-slow 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
