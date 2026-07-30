"use client";
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Users, Star, Award, Loader2, X } from 'lucide-react';
import AchievementCard from '../components/AchievementCard';
import AddAchievementModal from '../components/AddAchievementModal';
import { collection, onSnapshot, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import ErrorBoundary from '../components/ErrorBoundary';
import { cleanText } from '../lib/clean-text';

// Only this tiny component reads useSearchParams, so only it is subject to
// Next's client-side bailout/remount on refresh — the fallback is `null`,
// so nothing visible ever gets swapped out.
function SearchParamsWatcher({
  onChange,
}: {
  onChange: (params: { teacher: string | null; add: boolean }) => void;
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    onChange({
      teacher: searchParams.get('teacher'),
      add: searchParams.get('add') === 'true',
    });
  }, [searchParams, onChange]);

  return null;
}

function HomeContent() {
  const router = useRouter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [teacherFilter, setTeacherFilter] = useState<string | null>(null);
  const [hasAddParam, setHasAddParam] = useState(false);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [schoolSettings, setSchoolSettings] = useState<{ schoolName?: string, logoUrl?: string } | null>(null);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);

  const displayedAchievements = teacherFilter 
    ? achievements.filter(a => a.teacherName === teacherFilter) 
    : achievements;

  const handleParamsChange = useCallback((params: { teacher: string | null; add: boolean }) => {
    setTeacherFilter(params.teacher);
    setIsModalOpen(params.add);
    setHasAddParam(params.add);
  }, []);

  const handleCloseModal = () => {
    if (hasAddParam) {
      router.push('/', { scroll: false });
    } else {
      setIsModalOpen(false);
    }
  };

  useEffect(() => {
    let q;
    try {
      q = query(collection(db, 'achievements'), orderBy('timestamp', 'desc'));
    } catch (err) {
      console.error('Error creating query:', err);
      setFirebaseError('فشل في إنشاء الاستعلام');
      setIsLoading(false);
      return;
    }
    
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const achievementsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setAchievements(achievementsData);
        setIsLoading(false);
      },
      (error) => {
        console.error('Firestore onSnapshot error:', error);
        setFirebaseError('فشل في تحميل الإنجازات: ' + error.message);
        setIsLoading(false);
      }
    );

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
    <div className="space-y-6 md:space-y-8 pb-10 w-full max-w-full overflow-hidden">
      <Suspense fallback={null}>
        <SearchParamsWatcher onChange={handleParamsChange} />
      </Suspense>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4 bg-white/95 backdrop-blur-sm p-3 md:p-6 pr-14 sm:pr-3 md:pr-6 rounded-2xl shadow-lg border border-purple-100/50">
        <div className="flex items-center gap-4">
          {schoolSettings?.logoUrl && (
            <img src={schoolSettings.logoUrl} alt="School Logo" className="w-16 h-16 md:w-20 md:h-20 object-contain rounded-xl border border-gray-100 shadow-sm p-1 max-w-full" />
          )}
          <div>
            {schoolSettings?.schoolName && (
              <p className="text-base md:text-lg font-bold text-[#e21b3c]">{cleanText(schoolSettings?.schoolName)}</p>
            )}
            <p className="text-gray-500 font-bold mt-1 text-xs md:text-sm">وثّق، شارك، واحتفل بالتميز المدرسي</p>
          </div>
        </div>
        
        <button 
          onClick={() => router.push('/?add=true', { scroll: false })}
          className="w-full md:w-auto flex bg-[#e21b3c] hover:bg-[#c71734] text-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold shadow-lg border-b-4 border-[#a8132a] hover:border-b-2 transition-all active:border-b-0 active:translate-y-1 text-sm md:text-base justify-center"
        >
          + إنجاز جديد
        </button>
      </div>

      {firebaseError && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm font-bold text-center">
          {firebaseError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-lg border-t-4 border-[#0087ed] flex items-center gap-3 md:gap-4 min-w-0">
          <div className="bg-blue-100 p-3 md:p-4 rounded-xl text-[#0087ed] shrink-0"><Award size={24} className="md:size-[32px]" /></div>
          <div>
            <p className="text-gray-500 text-xs md:text-sm font-bold truncate">إجمالي الإنجازات</p>
            <p className="text-3xl font-black text-gray-800">
              {isLoading ? <Loader2 size={24} className="animate-spin mt-1" /> : displayedAchievements.length}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-lg border-t-4 border-[#26890c] flex items-center gap-3 md:gap-4 min-w-0">
          <div className="bg-green-100 p-3 md:p-4 rounded-xl text-[#26890c] shrink-0"><Users size={24} className="md:size-[32px]" /></div>
          <div>
            <p className="text-gray-500 text-xs md:text-sm font-bold truncate">المعلمات المشاركات</p>
            <p className="text-3xl font-black text-gray-800">
              {isLoading ? <Loader2 size={24} className="animate-spin mt-1" /> : new Set(achievements.map(a => a.teacherName).filter(Boolean)).size}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-lg border-t-4 border-[#ffb000] flex items-center gap-3 md:gap-4 min-w-0">
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
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <span className="bg-[#e21b3c] w-2 h-6 rounded-full inline-block"></span>
          {teacherFilter ? `إنجازات المعلمة: ${teacherFilter}` : 'أحدث الإنجازات المعتمدة'}
        </h3>
        
        {teacherFilter && (
          <div className="mb-6 flex items-center gap-2">
            <button onClick={() => router.push('/')} className="bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors">
              <X size={16} /> إلغاء التصفية
            </button>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
          {isLoading ? (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-purple-200">
              <Loader2 className="animate-spin mb-4 text-yellow-400" size={40} />
              <p className="font-bold text-purple-200">جاري تحميل الإنجازات المباشرة...</p>
            </div>
          ) : firebaseError ? (
            <div className="col-span-full bg-white/95 backdrop-blur-sm rounded-2xl p-10 border-2 border-dashed border-red-200 text-center text-gray-400 shadow-lg">
              <p className="font-bold text-red-500">تعذر تحميل الإنجازات. تحقق من اتصال الإنترنت.</p>
            </div>
          ) : displayedAchievements.length === 0 ? (
            <div className="col-span-full bg-white/95 backdrop-blur-sm rounded-2xl p-10 border-2 border-dashed border-purple-200 text-center text-gray-400 shadow-lg">
              <p className="font-bold">{teacherFilter ? "لا توجد إنجازات لهذه المعلمة حالياً." : "لا توجد إنجازات حتى الآن. كن أول من يضيف إنجازاً! 🚀"}</p>
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
    <ErrorBoundary>
      <HomeContent />
    </ErrorBoundary>
  );
}
