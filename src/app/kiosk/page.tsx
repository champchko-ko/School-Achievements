"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { collection, onSnapshot, query, orderBy, doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Trophy, Medal, Sparkles, User, Building, Loader2, Star, Maximize, Calendar, Paperclip, Image as ImageIcon, Play, Pause, SkipBack, SkipForward, MonitorPlay, Hand } from "lucide-react";

const isImageField = (url: string) => {
  if (!url) return false;
  if (url.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp)/i)) return true;
  if (url.includes('/image/upload/') && !url.toLowerCase().endsWith('.pdf')) return true;
  return false;
};

const isVideoField = (url: string) => {
  if (!url) return false;
  if (url.match(/\.(mp4|webm|mov|ogg|avi|flv|mkv|m3u8)/i)) return true;
  return url.includes('/video/upload/');
};

const collectAttachments = (a: any): string[] => {
  const urls: string[] = [];
  if (Array.isArray(a?.attachmentUrls)) urls.push(...a.attachmentUrls);
  if (a?.fileUrl && !urls.includes(a.fileUrl)) urls.push(a.fileUrl);
  if (a?.attachmentUrl && !urls.includes(a.attachmentUrl)) urls.push(a.attachmentUrl);
  return urls.filter(Boolean);
};

type Slide = {
  id: string;
  type: 'image' | 'video' | 'cover';
  url?: string;
  achievement: any;
};

type DisplayMode = 'automatic' | 'manual';
const AUTO_ADVANCE_MS = 8000;

export default function KioskModePage() {
  const [achievements, setAchievements] = useState<any[]>([]);
  const [schoolName, setSchoolName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<DisplayMode>('automatic');
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const slides: Slide[] = [];
  achievements.forEach((a) => {
    const attachments = collectAttachments(a);
    const images = attachments.filter(isImageField);
    const videos = attachments.filter(isVideoField);
    images.forEach((url, i) => slides.push({ id: `${a.id}-img-${i}`, type: 'image', url, achievement: a }));
    videos.forEach((url, i) => slides.push({ id: `${a.id}-vid-${i}`, type: 'video', url, achievement: a }));
    if (images.length === 0 && videos.length === 0) {
      slides.push({ id: `${a.id}-cover`, type: 'cover', achievement: a });
    }
  });

  // 1. Fetch Data
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, "settings", "global_info");
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.schoolName) setSchoolName(data.schoolName);
          if (data.logoUrl) setLogoUrl(data.logoUrl);
        }
      } catch (e) {
        console.error("Error loading settings:", e);
      }
    };
    fetchSettings();

    // Fetch live achievements — all approved, score is irrelevant
    const q = query(collection(db, "achievements"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Record<string, any>));
      const approved = data.filter(a => a.status === 'approved' || !a.status);
      setAchievements(approved);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Reset index when the slides list changes (e.g. new uploads)
  useEffect(() => {
    if (currentIndex >= slides.length) setCurrentIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length]);

  const next = useCallback(() => {
    setCurrentIndex((prev) => (slides.length <= 1 ? 0 : (prev + 1) % slides.length));
  }, [slides.length]);

  const prev = useCallback(() => {
    setCurrentIndex((prev) => (slides.length <= 1 ? 0 : (prev - 1 + slides.length) % slides.length));
  }, [slides.length]);

  const startAutoPlay = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const stopAutoPlay = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === 'automatic' ? 'manual' : 'automatic'));
  }, []);

  // Auto-advance timer — only active in automatic mode AND isPlaying
  useEffect(() => {
    // Clear any existing timer first
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const current = slides[currentIndex];
    if (!current) return;

    // Only auto-advance for IMAGE/COVER slides in automatic mode when playing
    if (mode === 'automatic' && isPlaying && current.type !== 'video') {
      timerRef.current = setInterval(next, AUTO_ADVANCE_MS);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentIndex, slides.length, slides, next, mode, isPlaying]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // Always ensure the video element replays from start on slide change
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  }, [currentIndex]);

  // Video onEnded: only advance in automatic mode
  const handleVideoEnded = useCallback(() => {
    if (mode === 'automatic' && isPlaying) {
      next();
    }
  }, [mode, isPlaying, next]);

  // Loading State
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[100] h-screen w-screen m-0 p-4 overflow-y-auto bg-gradient-to-br from-[#46178f] via-[#380e6e] to-[#2a0a54] flex flex-col items-center justify-center text-white">
        <Loader2 className="animate-spin mb-4 text-[#ffb800]" size={40} />
        <p className="text-lg md:text-2xl font-bold animate-pulse text-center px-4">جاري تحميل الإنجازات...</p>
      </div>
    );
  }

  // Empty State
  if (slides.length === 0) {
    return (
      <div className="fixed inset-0 z-[100] h-screen w-screen m-0 p-4 overflow-y-auto bg-gradient-to-br from-[#46178f] via-[#380e6e] to-[#2a0a54] flex flex-col items-center justify-center text-white">
        <Star className="mb-4 text-yellow-400 opacity-50" size={40} />
        <p className="text-xl md:text-3xl font-black text-gray-400 text-center px-4">لا توجد إنجازات معتمدة للعرض حالياً</p>
      </div>
    );
  }

  const current = slides[Math.min(currentIndex, slides.length - 1)];
  const ach = current.achievement;
  const score = typeof ach.score === 'number' ? ach.score : null;
  const isGold = score !== null && score >= 90;
  const isSilver = score !== null && score >= 80 && score < 90;

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.error("Error enabling full-screen mode:", err));
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] h-screen w-screen m-0 p-0 overflow-y-auto bg-gradient-to-br from-[#46178f] via-[#380e6e] to-[#2a0a54] text-white flex flex-col">
      {/* Decorative background glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none" />

      {/* Kiosk Header (fixed school identity) */}
      <header className="px-4 md:px-12 py-2 md:py-5 flex items-center justify-between z-10 border-b border-white/20 bg-white/10 backdrop-blur-md shadow-lg shrink-0">
        <div className="flex items-center gap-4 md:gap-6">
          {logoUrl && <img src={logoUrl} alt="School Logo" className="w-10 h-10 md:w-16 md:h-16 object-contain drop-shadow-lg" />}
          <div>
            {schoolName && (
              <h1 className="text-lg md:text-3xl font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-yellow-200 drop-shadow-sm">
                {schoolName}
              </h1>
            )}
            <p className="text-purple-200 font-bold text-xs md:text-lg mt-0 md:mt-1 flex items-center gap-2">
              <Sparkles size={18} className="text-yellow-400 animate-pulse" />
              إنجازات مدرستنا
            </p>
          </div>
        </div>
      </header>

      {/* Mother stage — media dominant, info panel beside it */}
      <main className="flex-1 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 px-4 md:px-12 py-4 min-h-0">
        {/* Media stage */}
        <div className="flex-1 flex items-center justify-center w-full min-h-[30vh] md:min-h-0 relative">
          {current.type === 'image' && (
            <img
              key={current.id}
              src={current.url}
              alt={ach.title}
              className="max-h-[85vh] max-w-full object-contain rounded-2xl shadow-2xl animate-in fade-in duration-700"
            />
          )}
          {current.type === 'video' && (
            <video
              ref={videoRef}
              key={current.id}
              src={current.url}
              className="max-h-[85vh] max-w-full object-contain rounded-2xl shadow-2xl animate-in fade-in duration-700"
              controls
              autoPlay
              muted
              playsInline
              onEnded={handleVideoEnded}
            />
          )}
          {current.type === 'cover' && (
            <div className="flex flex-col items-center justify-center text-center px-8 animate-in fade-in duration-700">
              {logoUrl && <img src={logoUrl} alt="School Logo" className="w-40 md:w-72 object-contain mb-4 opacity-90" />}
              <ImageIcon size={64} className="text-white/40 mb-2" />
              <p className="text-white/40 font-bold text-xl">إنجاز بدون مرفقات</p>
            </div>
          )}
        </div>

        {/* Info panel (left, compact) */}
        <aside className="flex w-full md:w-[32%] lg:w-[26%] shrink-0 flex-col justify-center gap-2 lg:gap-4 bg-white/5 backdrop-blur-sm border border-white/15 p-4 lg:p-8 rounded-3xl overflow-hidden">
          <div className={`inline-flex items-center gap-2 w-fit px-4 py-1.5 rounded-full text-sm lg:text-lg font-black shadow-xl border border-white/20 ${isGold ? 'bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-yellow-950' : isSilver ? 'bg-gradient-to-r from-slate-200 via-slate-300 to-slate-400 text-slate-900' : 'bg-gradient-to-r from-purple-400 to-purple-600 text-white'}`}>
            {isGold ? <Trophy size={16} /> : isSilver ? <Medal size={16} /> : <Star size={16} />}
            {isGold ? 'ذهب' : isSilver ? 'فضة' : score !== null ? 'مشاركة مميزة' : 'إنجاز'}
            {score !== null && <span className="opacity-80">· {score}</span>}
          </div>

          <h2 className="text-3xl lg:text-5xl font-black leading-tight text-transparent bg-clip-text bg-gradient-to-br from-yellow-300 to-orange-400 py-1">
            {ach.title}
          </h2>

          <p className="text-white/85 text-sm lg:text-lg leading-relaxed font-medium line-clamp-3">
            {ach.desc || ach.description || ''}
          </p>

          <div className="flex flex-wrap items-center gap-2 lg:gap-3 pt-2 mt-1 border-t border-white/15 text-sm lg:text-lg font-bold text-white/90">
            <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl">
              <User size={16} className="text-pink-400" /> {ach.teacherName || 'غير محدد'}
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl">
              <Building size={16} className="text-blue-400" /> {ach.department || 'غير محدد'}
            </div>
            {ach.date && (
              <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl">
                <Calendar size={16} className="text-emerald-400" /> {ach.date}
              </div>
            )}
            {(() => { const n = collectAttachments(ach).length; return n > 0 ? (
              <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl">
                <Paperclip size={16} className="text-amber-400" /> {n} مرفق
              </div>
            ) : null; })()}
          </div>
        </aside>
      </main>

      {/* Bottom bar: controls + progress + slide counter */}
      <div className="shrink-0 flex flex-col gap-1 px-4 md:px-8 py-2 bg-black/40 border-t border-white/10 z-10">
        {/* Controls row */}
        <div className="flex items-center justify-between gap-2">
          {/* Mode switcher */}
          <button
            onClick={toggleMode}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs md:text-sm font-black transition-all border-2 shrink-0"
            style={{
              borderColor: mode === 'automatic' ? '#ffb800' : 'rgba(255,255,255,0.3)',
              background: mode === 'automatic' ? 'rgba(255,184,0,0.15)' : 'rgba(255,255,255,0.05)',
              color: mode === 'automatic' ? '#ffb800' : 'rgba(255,255,255,0.7)',
            }}
          >
            {mode === 'automatic' ? <MonitorPlay size={16} /> : <Hand size={16} />}
            {mode === 'automatic' ? 'تلقائي' : 'يدوي'}
          </button>

          {/* Playback controls */}
          <div className="flex items-center gap-1 md:gap-2">
            {/* Previous */}
            <button
              onClick={prev}
              className="p-2 md:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-all text-white/70 hover:text-white border border-white/15"
              title="السابق"
            >
              <SkipBack size={18} />
            </button>

            {/* Stop / Start */}
            {mode === 'automatic' && (
              isPlaying ? (
                <button
                  onClick={stopAutoPlay}
                  className="p-2 md:p-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 transition-all text-red-400 hover:text-red-300 border border-red-500/30"
                  title="إيقاف"
                >
                  <Pause size={18} />
                </button>
              ) : (
                <button
                  onClick={startAutoPlay}
                  className="p-2 md:p-2.5 rounded-xl bg-green-500/20 hover:bg-green-500/30 transition-all text-green-400 hover:text-green-300 border border-green-500/30"
                  title="تشغيل"
                >
                  <Play size={18} />
                </button>
              )
            )}

            {/* Next */}
            <button
              onClick={next}
              className="p-2 md:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-all text-white/70 hover:text-white border border-white/15"
              title="التالي"
            >
              <SkipForward size={18} />
            </button>
          </div>

          {/* Slide counter */}
          <span className="text-white/70 font-black text-xs md:text-sm shrink-0 whitespace-nowrap">{currentIndex + 1} / {slides.length}</span>
        </div>

        {/* Progress bar — only animates in automatic mode when playing */}
        <div className="h-1.5 w-full bg-white/15 relative overflow-hidden rounded-full">
          {current.type !== 'video' && mode === 'automatic' && isPlaying ? (
            <div key={`progress-${currentIndex}-${mode}-${isPlaying}`} className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-500 animate-[progress_8s_linear] rounded-full" />
          ) : current.type === 'video' && mode === 'automatic' && isPlaying ? (
            <div className="absolute top-0 bottom-0 left-0 w-full bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-500 rounded-full" />
          ) : (
            <div className="absolute top-0 bottom-0 left-0 bg-white/20 rounded-full" style={{ width: `${((currentIndex + 1) / slides.length) * 100}%` }} />
          )}
        </div>
      </div>

      {/* Full Screen Toggle Button */}
      <button onClick={toggleFullScreen} className="absolute bottom-10 right-4 md:right-8 z-50 text-white/60 hover:text-white transition-colors p-3 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-md border-2 border-white/20" title="ملء الشاشة">
        <Maximize size={28} />
      </button>

      {/* Setup the keyframe for the progress bar */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes progress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}} />
    </div>
  );
}
