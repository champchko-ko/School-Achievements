"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { GraduationCap, Wrench, Phone, Loader2 } from "lucide-react";

export default function MaintenancePage() {
  const [schoolName, setSchoolName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, "settings", "global_info");
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data?.schoolName) setSchoolName(data.schoolName);
          if (data?.logoUrl) setLogoUrl(data.logoUrl);
          if (data?.phone) setPhone(data.phone);
        }
      } catch (error) {
        console.error("Error loading settings:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#46178f] via-[#380e6e] to-[#2a0a54] flex flex-col relative overflow-hidden">
      {/* Dotted pattern (Kahoot theme) */}
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(#ffffff_1.5px,transparent_1.5px)] [background-size:24px_24px]"></div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative z-10 text-center">
        {loading ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-yellow-400" size={48} />
            <p className="text-purple-200 font-bold">جاري التحميل...</p>
          </div>
        ) : (
          <>
            {/* Logo */}
            {logoUrl ? (
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-yellow-400/30 rounded-full blur-2xl animate-pulse"></div>
                <img src={logoUrl} alt="School Logo" className="w-28 h-28 md:w-36 md:h-36 object-contain relative z-10 drop-shadow-2xl" />
              </div>
            ) : (
              <div className="w-28 h-28 md:w-36 md:h-36 bg-white/10 rounded-full flex items-center justify-center mb-8 border-4 border-yellow-400/50">
                <GraduationCap size={64} className="text-yellow-400" />
              </div>
            )}

            {/* School name */}
            {schoolName && (
              <h1 className="text-3xl md:text-4xl font-black text-yellow-400 mb-2 drop-shadow-lg">
                {schoolName}
              </h1>
            )}

            <div className="w-24 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent rounded-full mb-8"></div>

            {/* Maintenance icon + title */}
            <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center mb-6 border-2 border-yellow-400/40">
              <Wrench size={40} className="text-yellow-400 animate-pulse" />
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white mb-4">
              المنصة في صيانة مؤقتة 🔧
            </h2>
            <p className="text-purple-200 text-base md:text-lg font-bold leading-relaxed max-w-xl mb-2">
              نعمل حالياً على تحسين المنصة وتحديثها لتقديم تجربة أفضل لكم.
            </p>
            <p className="text-purple-200/80 text-sm md:text-base font-bold max-w-md">
              يرجى المحاولة مرة أخرى لاحقاً. شكراً لتفهمكم وتعاونكم.
            </p>

            {/* Phone */}
            {phone && (
              <div className="mt-8 flex items-center gap-2 bg-white/10 px-5 py-3 rounded-2xl border border-white/10">
                <Phone size={18} className="text-yellow-400" />
                <span className="text-white font-bold text-sm md:text-base" dir="ltr">{phone}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
