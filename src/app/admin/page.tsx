// src/app/admin/page.tsx
"use client";
import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { ShieldCheck, Trophy, Medal, Award, ExternalLink, Loader2, CheckCircle2, TrendingUp, Files, UserX, Clock } from 'lucide-react';
import { useAdmin } from '../../lib/useAdmin';
import { useRouter } from 'next/navigation';
import { header, panel, toast } from '../../lib/ui';

export default function AdminDashboard() {
  const [allAchievements, setAllAchievements] = useState<any[]>([]);
  const [allTeachers, setAllTeachers] = useState<string[]>([]);
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: string, message: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    if (!isAdmin && !adminLoading) {
      router.replace('/');
      return;
    }

    const fetchSettings = async () => {
      try {
        const docRef = doc(db, "settings", "global_info");
        const snap = await getDoc(docRef);
        if (snap.exists() && snap.data().teachers) {
          setAllTeachers(snap.data().teachers);
        }
      } catch (error) {
        console.error("Error fetching teachers:", error);
      }
    };
    fetchSettings();

    const q = query(collection(db, "achievements"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllAchievements(data);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  // --- Analytics Derived Stats ---
  
  // 1. Pending Queue
  const pendingAchievements = allAchievements.filter(a => a.score === null);

  // 2. Most Active Department this Month (device-local month, not UTC)
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentMonthAchievements = allAchievements.filter(a => a.date && a.date.startsWith(currentMonth));
  const deptCounts: Record<string, number> = {};
  currentMonthAchievements.forEach(a => {
    const d = a.department || 'غير محدد';
    deptCounts[d] = (deptCounts[d] || 0) + 1;
  });
  let mostActiveDept = "لا يوجد";
  let maxCount = 0;
  for (const [dept, count] of Object.entries(deptCounts)) {
    if (count > maxCount) { maxCount = count; mostActiveDept = dept; }
  }

  // 3. Total Files Stored
  let totalFiles = 0;
  allAchievements.forEach(a => {
    if (a.attachmentUrls) totalFiles += a.attachmentUrls.length;
    if (a.attachmentUrl) totalFiles += 1;
  });

  // 4. Teachers without Submissions
  const activeTeacherNames = new Set(allAchievements.map(a => a.teacherName).filter(Boolean));
  const inactiveTeachers = allTeachers.filter(t => !activeTeacherNames.has(t));

  // Handle Scoring
  const handleScore = async (id: string, score: number) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/achievements/${id}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'فشل التقييم');
      }
      // The onSnapshot listener will automatically remove it from this list!
    } catch (error: any) {
      console.error("Error updating score:", error);
      setNotification({ type: "error", message: error.message || "حدث خطأ أثناء تقييم الإنجاز." });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      
      {/* Notification Toast */}
      {notification && (
        <div className={`${toast} z-[200]`} style={{ background: notification.type === "success" ? "#26890c" : "#eb1f36" }}>
          <div className="flex items-center gap-3">
            <span>{notification.type === "success" ? "✅" : "❌"}</span>
            <span>{notification.message}</span>
            <button onClick={() => setNotification(null)} className="mr-auto text-white/70 hover:text-white">✕</button>
          </div>
        </div>
      )}
      
      {/* Admin Header */}
      <div className={`${header} p-8 text-center relative overflow-hidden`}>
        <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full -translate-y-16 translate-x-16"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white opacity-5 rounded-full translate-y-8 -translate-x-8"></div>
        
        <h2 className="text-3xl font-black mb-2 flex justify-center items-center gap-3 relative z-10">
          <ShieldCheck className="text-green-400" size={36} />
          لوحة تحكم الإدارة
        </h2>
        <p className="text-purple-200 font-bold relative z-10">مركز الاعتماد وتقييم إنجازات المعلمات</p>
      </div>

      {/* Analytics Overview */}
      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-8">
          <div className={`${panel} p-6 flex items-center gap-4 hover:shadow-lg transition-shadow`}>
            <div className="bg-purple-100 p-3 rounded-2xl text-purple-600"><TrendingUp size={28} /></div>
            <div>
              <p className="text-gray-500 text-sm font-bold">القسم الأنشط هذا الشهر</p>
              <p className="text-2xl font-black text-gray-800">{mostActiveDept}</p>
            </div>
          </div>
          <div className={`${panel} p-6 flex items-center gap-4 hover:shadow-lg transition-shadow`}>
            <div className="bg-blue-100 p-3 rounded-2xl text-blue-600"><Files size={28} /></div>
            <div>
              <p className="text-gray-500 text-sm font-bold">إجمالي الملفات المرفوعة</p>
              <p className="text-3xl font-black text-gray-800">{totalFiles}</p>
            </div>
          </div>
          <div className={`${panel} p-6 flex items-center gap-4 min-w-0 hover:shadow-lg transition-shadow`}>
            <div className="bg-red-100 p-3 rounded-2xl text-red-600 shrink-0"><UserX size={28} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-gray-500 text-sm font-bold">معلمون بلا إنجازات</p>
              <p className="text-3xl font-black text-gray-800">{inactiveTeachers.length}</p>
              {inactiveTeachers.length > 0 && (
                <p className="text-xs text-red-500 truncate mt-1" title={inactiveTeachers.join('، ')}>
                  {inactiveTeachers.join('، ')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pending Queue */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <span className="p-3 bg-red-50 text-[#eb1f36] rounded-2xl"><Clock size={22} /></span>
          <h3 className="text-xl md:text-2xl font-black text-white">في انتظار المراجعة والتقييم</h3>
          <span className="bg-[#eb1f36] text-white px-3 py-1 rounded-full text-sm font-black">{pendingAchievements.length}</span>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-purple-200">
            <Loader2 className="animate-spin mb-4 text-yellow-400" size={40} />
            <p className="font-bold">جاري تحميل السجلات...</p>
          </div>
        ) : pendingAchievements.length === 0 ? (
          <div className="bg-green-50 rounded-3xl p-10 border-2 border-green-200 text-center text-green-700">
            <CheckCircle2 size={48} className="mx-auto mb-3 text-green-500" />
            <p className="font-bold text-lg">عمل رائع! لا توجد إنجازات معلقة.</p>
            <p className="text-sm mt-1 opacity-80">تمت مراجعة جميع الإنجازات المرفوعة.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {pendingAchievements.map((item) => (
              <div key={item.id} className={`${panel} p-5 md:p-6 flex flex-col md:flex-row gap-6 items-start md:items-center`}>
                
                {/* Details */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <h4 className="text-lg font-black text-[#46178f]">{item.title}</h4>
                    <span className="bg-purple-50 text-[#46178f] px-3 py-1 rounded-full text-xs font-bold">{item.department}</span>
                  </div>
                  <p className="text-gray-600 text-sm font-medium leading-relaxed">{item.desc}</p>
                  
                  <div className="flex items-center gap-4 text-xs font-bold pt-2">
                    <span className="text-gray-500 flex items-center gap-1">👤 {item.teacherName}</span>
                    <span className="text-gray-500 flex items-center gap-1">📅 {item.date}</span>
                    {item.fileUrl && (
                      <a href={item.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[#0087ed] hover:underline flex items-center gap-1 bg-blue-50 px-3 py-1 rounded-full">
                        <ExternalLink size={14} /> عرض المرفق
                      </a>
                    )}
                  </div>
                </div>

                {/* Scoring Buttons */}
                <div className="w-full md:w-auto flex md:flex-col gap-2 shrink-0">
                  <button 
                    onClick={() => handleScore(item.id, 95)}
                    disabled={processingId === item.id}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#ffb000] hover:bg-[#e69f00] text-yellow-900 px-4 py-2 rounded-2xl font-black border-b-4 border-[#cc8d00] active:border-b-0 active:translate-y-1 transition-all"
                  >
                    {processingId === item.id ? <Loader2 className="animate-spin" size={18} /> : <><Trophy size={18} /> ذهبي</>}
                  </button>
                  <button 
                    onClick={() => handleScore(item.id, 85)}
                    disabled={processingId === item.id}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#e5e7eb] hover:bg-[#d1d5db] text-gray-800 px-4 py-2 rounded-2xl font-black border-b-4 border-[#9ca3af] active:border-b-0 active:translate-y-1 transition-all"
                  >
                    {processingId === item.id ? <Loader2 className="animate-spin" size={18} /> : <><Medal size={18} /> فضي</>}
                  </button>
                  <button 
                    onClick={() => handleScore(item.id, 75)}
                    disabled={processingId === item.id}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#f97316] hover:bg-[#ea580c] text-white px-4 py-2 rounded-2xl font-black border-b-4 border-[#c2410c] active:border-b-0 active:translate-y-1 transition-all"
                  >
                    {processingId === item.id ? <Loader2 className="animate-spin" size={18} /> : <><Award size={18} /> برونزي</>}
                  </button>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
