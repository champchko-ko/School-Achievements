"use client";
import { useRouter } from 'next/navigation';
import { ChevronDown, Sparkles, GraduationCap, User, Users } from 'lucide-react';

const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  left: `${(i * 37) % 100}%`,
  top: `${(i * 53) % 100}%`,
  animationDelay: `${(i * 0.25) % 5}s`,
  animationDuration: `${3 + ((i * 0.5) % 4)}s`,
  size: `${4 + (i % 8)}px`,
}));

export interface IntroSettings {
  schoolName?: string | null;
  logoUrl?: string | null;
  vision?: string | null;
  message?: string | null;
  managerName?: string | null;
  viceManagerName?: string | null;
  assistantManager2?: string | null;
  computerDeptTeacher?: string | null;
  computerDeptHead?: string | null;
}

export default function IntroClient({ settings }: { settings: IntroSettings }) {
  const router = useRouter();

  const handleEnter = () => {
    sessionStorage.setItem('introSeen', 'true');
    document.cookie = 'introSeen=true; path=/; max-age=86400';
    router.push('/');
  };

  const schoolName = settings.schoolName?.trim() || null;
  const logoUrl = settings.logoUrl;
  const vision = settings.vision?.trim() || null;
  const message = settings.message?.trim() || null;
  const managerName = settings.managerName;
  const viceManager = settings.viceManagerName;
  const assistant2 = settings.assistantManager2;
  const computerDeptTeacher = settings.computerDeptTeacher;
  const computerDeptHead = settings.computerDeptHead;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#46178f] via-[#380e6e] to-[#2a0a54] flex flex-col relative overflow-hidden">

      {/* Animated Background Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {PARTICLES.map((p) => (
          <div
            key={p.id}
            className="absolute bg-white/10 rounded-full animate-ping"
            style={{
              left: p.left,
              top: p.top,
              animationDelay: p.animationDelay,
              animationDuration: p.animationDuration,
              width: p.size,
              height: p.size,
            }}
          />
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative z-10">

        {/* Logo */}
        <div>
          {logoUrl ? (
            <div className="relative group mb-8">
              <div className="absolute inset-0 bg-yellow-400/30 rounded-full blur-2xl animate-pulse"></div>
              <img
                src={logoUrl}
                alt="School Logo"
                width={144}
                height={144}
                fetchPriority="high"
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
        {schoolName && (
        <h1 className="text-3xl md:text-5xl font-black text-yellow-400 text-center mb-4 drop-shadow-lg">
          {schoolName}
        </h1>
        )}

        {/* Decorative Line - only show if school name is shown */}
        {schoolName && (
        <div className="w-48 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent rounded-full mb-8"></div>
        )}

        {/* Vision */}
        {vision && (
        <div className="max-w-2xl text-center mb-4">
          <p className="text-purple-200/80 text-sm font-bold mb-2 tracking-wider">— رؤيتنا —</p>
          <p className="text-white text-lg md:text-xl font-bold leading-relaxed">{vision}</p>
        </div>
        )}

        {/* Message */}
        {message && (
        <div className="max-w-2xl text-center mb-10">
          <p className="text-purple-200/80 text-sm font-bold mb-2 tracking-wider">— رسالتنا —</p>
          <p className="text-white/90 text-base md:text-lg leading-relaxed">{message}</p>
        </div>
        )}

        {/* Leadership Team */}
        <div className="flex flex-col items-center gap-6 mb-12">
          {/* Manager - alone on its own line */}
          {managerName && (
            <div className="text-center">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-yellow-400/20 rounded-full flex items-center justify-center mx-auto mb-2 border-2 border-yellow-400/50">
                <User size={28} className="text-yellow-400" />
              </div>
              <p className="text-yellow-400 font-bold text-sm">المديرة</p>
              <p className="text-white font-bold">{managerName}</p>
            </div>
          )}
          {/* Assistants - side by side on one line */}
          {(viceManager || assistant2) && (
          <div className="flex flex-wrap justify-center gap-6 md:gap-10">
            {viceManager && (
              <div className="text-center">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-purple-400/20 rounded-full flex items-center justify-center mx-auto mb-2 border-2 border-purple-400/50">
                  <Users size={28} className="text-purple-300" />
                </div>
                <p className="text-purple-300 font-bold text-sm">المديرة المساعدة ١</p>
                <p className="text-white font-bold">{viceManager}</p>
              </div>
            )}
            {assistant2 && (
              <div className="text-center">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-purple-400/20 rounded-full flex items-center justify-center mx-auto mb-2 border-2 border-purple-400/50">
                  <Users size={28} className="text-purple-300" />
                </div>
                <p className="text-purple-300 font-bold text-sm">المديرة المساعدة ٢</p>
                <p className="text-white font-bold">{assistant2}</p>
              </div>
            )}
          </div>
          )}
          {/* Computer Department */}
          {(computerDeptTeacher || computerDeptHead) && (
          <div className="flex flex-wrap justify-center gap-6 md:gap-10 mt-4">
            {computerDeptTeacher && (
              <div className="text-center">
                <p className="text-blue-300 font-bold text-sm">معلمة الحاسوب</p>
                <p className="text-white font-bold">{computerDeptTeacher}</p>
              </div>
            )}
            {computerDeptHead && (
              <div className="text-center">
                <p className="text-blue-300 font-bold text-sm">رئيسة قسم الحاسوب</p>
                <p className="text-white font-bold">{computerDeptHead}</p>
              </div>
            )}
          </div>
          )}
        </div>

        {/* Enter Button */}
        <button
          onClick={handleEnter}
          className="group px-10 py-4 bg-[#ffb800] hover:bg-[#f0a800] text-gray-900 rounded-2xl font-black text-lg border-b-4 border-[#cc9400] active:border-b-0 active:translate-y-1 shadow-2xl shadow-yellow-500/30 transition-all duration-300 hover:scale-105 active:scale-95 flex items-center gap-3"
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
