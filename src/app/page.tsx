"use client";
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Users, Star, Award, Loader2, X } from 'lucide-react';
import AchievementCard from '../components/AchievementCard';
import AddAchievementModal from '../components/AddAchievementModal';
import { collection, onSnapshot, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [schoolSettings, setSchoolSettings] = useState<{ schoolName?: string, logoUrl?: string } | null>(null);

  const teacherFilter = searchParams.get('teacher');

  const displayedAchievements = teacherFilter 
    ? achievements.filter(a => a.teacherName === teacherFilter) 
    : achievements;

  useEffect(() => {
    setIsModalOpen(searchParams.get('add') === 'true');
  }, [searchParams]);

  const handleCloseModal = () => {
    if (searchParams.has('add')) {
      router.push('/', { scroll: false });
    } else {
      setIsModalOpen(false);
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'achievements'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const achievementsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAchievements(achievementsData);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
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

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-10 w-full max-w-full overflow-hidden">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4 bg-white p-3 md:p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-4">
          {schoolSettings?.logoUrl && (
            <img src={schoolSettings.logoUrl} alt="School Logo" className="w-16 h-16 md:w-20 md:h-20 object-contain rounded-xl border border-gray-100 shadow-sm p-1 max-w-full" />
          )}
          <div>
            <h2 className="text-xl md:text-2xl font-black text-[#4a154b] break-words">{schoolSettings?.schoolName || "مرحباً بك في منصة إنجازاتنا 👋"}</h2>
            <p className="text-gray-500 font-bold mt-1 text-xs md:text-sm">وثّق، شارك، واحتفل بالتميز المدرسي</p>
          </div>
        </div>
        
        <button 
          onClick={() => router.push('/?add=true', { scroll: false })}
          className="w-full md:w-auto flex bg-[#0087ed] hover:bg-[#0073cc] text-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold shadow-md transition-transform hover:scale-105 text-sm md:text-base justify-center"
        >
          + إنجاز جديد
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border-t-4 border-[#0087ed] flex items-center gap-3 md:gap-4 min-w-0">
          <div className="bg-blue-100 p-3 md:p-4 rounded-xl text-[#0087ed] shrink-0"><Award size={24} className="md:size-[32px]" /></div>
          <div>
            <p className="text-gray-500 text-xs md:text-sm font-bold truncate">إجمالي الإنجازات</p>
            <p className="text-3xl font-black text-gray-800">
              {isLoading ? <Loader2 size={24} className="animate-spin mt-1" /> : displayedAchievements.length}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border-t-4 border-[#26890c] flex items-center gap-3 md:gap-4 min-w-0">
          <div className="bg-green-100 p-3 md:p-4 rounded-xl text-[#26890c] shrink-0"><Users size={24} className="md:size-[32px]" /></div>
          <div>
            <p className="text-gray-500 text-xs md:text-sm font-bold truncate">المعلمون المشاركون</p>
            <p className="text-3xl font-black text-gray-800">
              {isLoading ? <Loader2 size={24} className="animate-spin mt-1" /> : new Set(achievements.map(a => a.teacherName).filter(Boolean)).size}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border-t-4 border-[#ffb000] flex items-center gap-3 md:gap-4 min-w-0">
          <div className="bg-yellow-100 p-3 md:p-4 rounded-xl text-[#ffb000] shrink-0"><Star size={24} className="md:size-[32px]" /></div>
          <div>
            <p className="text-gray-500 text-xs md:text-sm font-bold truncate">إنجازات مميزة</p>
            <p className="text-3xl font-black text-gray-800">
              {isLoading ? <Loader2 size={24} className="animate-spin mt-1" /> : achievements.filter(a => a.score && a.score >= 90).length}
            </p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-bold text-gray-700 mb-6 flex items-center gap-2">
          <span className="bg-[#e21b3c] w-2 h-6 rounded-full inline-block"></span>
          {teacherFilter ? `إنجازات المعلم: ${teacherFilter}` : 'أحدث الإنجازات المعتمدة'}
        </h3>
        
        {teacherFilter && (
          <div className="mb-6 flex items-center gap-2">
            <button onClick={() => router.push('/')} className="bg-red-100 hover:bg-red-200 text-red-600 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors">
              <X size={16} /> إلغاء التصفية
            </button>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
          {isLoading ? (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-gray-400">
              <Loader2 className="animate-spin mb-4 text-[#0087ed]" size={40} />
              <p className="font-bold">جاري تحميل الإنجازات المباشرة...</p>
            </div>
          ) : displayedAchievements.length === 0 ? (
            <div className="col-span-full bg-white rounded-2xl p-10 border border-dashed border-gray-300 text-center text-gray-400">
              <p className="font-bold">{teacherFilter ? "لا توجد إنجازات لهذا المعلم حالياً." : "لا توجد إنجازات حتى الآن. كن أول من يضيف إنجازاً! 🚀"}</p>
            </div>
          ) : (
            displayedAchievements.map((achievement) => (
              <AchievementCard key={achievement.id} data={achievement} />
            ))
          )}
        </div>
      </div>
      <AddAchievementModal isOpen={isModalOpen} onClose={handleCloseModal} />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex justify-center p-10"><Loader2 className="animate-spin" size={32} /></div>}>
      <HomeContent />
    </Suspense>
  );
}