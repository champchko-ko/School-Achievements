"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy, doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Trophy, Medal, Sparkles, User, Building, Loader2, Star, Maximize } from "lucide-react";

const isImageField = (url: string) => {
  if (!url) return false;
  if (url.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp)/i)) return true;
  if (url.includes('/image/upload/') && !url.toLowerCase().endsWith('.pdf')) return true;
  return false;
};

export default function KioskModePage() {
  const [achievements, setAchievements] = useState<any[]>([]);
  const [schoolName, setSchoolName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // 1. Fetch Data
  useEffect(() => {
    // Fetch Global Settings
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

    // Fetch live achievements
    const q = query(collection(db, "achievements"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Record<string, any>));
      // Filter only Gold/Silver (score >= 80)
      const topAchievements = data.filter(a => a.score !== null && a.score >= 80);
      setAchievements(topAchievements);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Auto-Scrolling Carousel Logic
  useEffect(() => {
    if (achievements.length <= 1) return; // No need to scroll if 0 or 1 item
    
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % achievements.length);
    }, 8000); // 8 seconds per slide

    return () => clearInterval(interval);
  }, [achievements.length]);

  // Loading State
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[100] h-screen w-screen m-0 p-4 overflow-y-auto bg-gradient-to-br from-[#46178f] via-[#380e6e] to-[#2a0a54] flex flex-col items-center justify-center text-white">
        <Loader2 className="animate-spin mb-4 text-[#ffb800]" size={40} />
        <p className="text-lg md:text-2xl font-bold animate-pulse text-center px-4">جاري تحميل الإنجازات المتميزة...</p>
      </div>
    );
  }

  // Empty State
  if (achievements.length === 0) {
    return (
      <div className="fixed inset-0 z-[100] h-screen w-screen m-0 p-4 overflow-y-auto bg-gradient-to-br from-[#46178f] via-[#380e6e] to-[#2a0a54] flex flex-col items-center justify-center text-white">
        <Star className="mb-4 text-yellow-400 opacity-50" size={40} />
        <p className="text-xl md:text-3xl font-black text-gray-400 text-center px-4">لا توجد إنجازات متميزة للعرض حالياً</p>
      </div>
    );
  }

  const current = achievements[currentIndex];

  // Safely extract the first image attachment
  const attachmentUrls: string[] = [];
  if (current.attachmentUrls && Array.isArray(current.attachmentUrls)) attachmentUrls.push(...current.attachmentUrls);
  if (current.fileUrl) attachmentUrls.push(current.fileUrl);
  if (current.attachmentUrl) attachmentUrls.push(current.attachmentUrl);
  
  const imageUrl = attachmentUrls.find(isImageField);
  const isGold = current.score >= 90;

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

      {/* Kiosk Header */}
      <header className="px-4 md:px-12 py-3 md:py-8 flex items-center justify-between z-10 border-b border-white/20 bg-white/10 backdrop-blur-md shadow-lg">
        <div className="flex items-center gap-6">
          {logoUrl && <img src={logoUrl} alt="School Logo" className="w-10 h-10 md:w-24 md:h-24 object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" />}
          <div>
            {schoolName && (
              <h1 className="text-base md:text-4xl font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-yellow-200 drop-shadow-sm">
                {schoolName}
              </h1>
            )}
            <p className="text-purple-200 font-bold text-xs md:text-xl mt-0 md:mt-2 flex items-center gap-2">
              <Sparkles size={24} className="text-yellow-400 animate-pulse" />
              لوحة الشرف والإنجازات المتميزة
            </p>
          </div>
        </div>
      </header>

      {/* Carousel Body */}
      <main className="flex-1 flex items-center justify-center p-4 md:p-8 lg:p-12 relative z-10 w-full">
        {/* The key prop forces React to re-mount the div, triggering the animate-in classes automatically */}
        <div key={current.id + currentIndex} className="w-full max-w-[98vw] md:max-w-[95vw] animate-in fade-in zoom-in-95 slide-in-from-bottom-8 duration-1000 flex flex-col lg:flex-row gap-4 md:gap-12 items-center justify-center relative">
          
          {/* Content Left (Info Card Alone) */}
          <div className="flex-1 w-full max-w-4xl bg-white rounded-3xl border-2 border-purple-100 p-4 md:p-12 shadow-[0_0_50px_rgba(0,0,0,0.5)] space-y-3 md:space-y-8 z-10 relative overflow-hidden">
            {/* Subtle shine effect on the card */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-white/40 to-transparent"></div>

            <div className={`inline-flex items-center gap-2 md:gap-3 px-4 md:px-8 py-2 md:py-4 rounded-full text-sm md:text-2xl font-black shadow-xl border border-white/20 ${isGold ? 'bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-yellow-950' : 'bg-gradient-to-r from-slate-200 via-slate-300 to-slate-400 text-slate-900'}`}>
              {isGold ? <Trophy size={18} className="md:size-[32px]" /> : <Medal size={18} className="md:size-[32px]" />}
              {isGold ? "إنجاز ذهبي متميز" : "إنجاز فضي متميز"}
            </div>

            <h2 className="text-xl md:text-5xl lg:text-7xl font-black leading-tight text-transparent bg-clip-text bg-gradient-to-br from-yellow-500 to-yellow-700 drop-shadow-sm pb-0 md:pb-2">
              {current.title}
            </h2>
            
            <p className="text-sm md:text-3xl text-yellow-900 leading-relaxed font-bold line-clamp-4 md:line-clamp-6">
              {current.desc || current.description}
            </p>

            <div className="flex flex-wrap items-center gap-2 md:gap-6 pt-3 md:pt-8 border-t-2 border-purple-100 text-sm md:text-2xl font-bold text-slate-800">
              <div className="flex items-center gap-1 md:gap-3 bg-purple-50 backdrop-blur-sm px-3 md:px-8 py-2 md:py-4 rounded-2xl border-2 border-purple-100 shadow-inner">
                <User size={16} className="md:size-[28px] text-pink-600" /> 
                {current.teacherName}
              </div>
              <div className="flex items-center gap-1 md:gap-3 bg-purple-50 backdrop-blur-sm px-3 md:px-8 py-2 md:py-4 rounded-2xl border-2 border-purple-100 shadow-inner">
                <Building size={16} className="md:size-[28px] text-blue-600" /> 
                {current.department}
              </div>
            </div>
          </div>

          {/* Image Right (if exists) */}
          {imageUrl && (
            <div className="flex-1 w-full flex justify-center items-center z-10">
              <div className="relative group flex justify-center items-center w-full">
                <div className="absolute inset-0 bg-white/10 blur-3xl rounded-full scale-110"></div>
                <img src={imageUrl} alt="Achievement" className="relative max-h-[70vh] max-w-full object-contain rounded-3xl shadow-2xl border-4 border-white/20 rotate-2 hover:rotate-0 transition-transform duration-700" />
              </div>
            </div>
          )}

        </div>
      </main>
      
      {/* Progress Bar indicator at the bottom */}
      <div className="h-2 w-full bg-black/50 relative overflow-hidden z-10">
        <div key={`progress-${currentIndex}`} className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-500 animate-[progress_8s_linear]" />
      </div>

      {/* Full Screen Toggle Button */}
      <button onClick={toggleFullScreen} className="absolute bottom-6 right-6 z-50 text-white/60 hover:text-white transition-colors p-3 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-md border-2 border-white/20" title="ملء الشاشة">
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
