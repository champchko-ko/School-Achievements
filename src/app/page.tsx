"use client";
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Users, Star, Award, Loader2, X, Clock, Trophy, Medal, MapPin, Phone, BookOpen, Eye } from 'lucide-react';
import AddAchievementModal from '../components/AddAchievementModal';
import { collection, onSnapshot, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import ErrorBoundary from '../components/ErrorBoundary';
import { cleanText } from '../lib/clean-text';
import { header, panel, table } from '../lib/ui';

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
  const [schoolSettings, setSchoolSettings] = useState<{
    schoolName?: string;
    logoUrl?: string;
    address?: string;
    phone?: string;
    managerName?: string;
    viceManagerName?: string;
    assistantManager2?: string;
    vision?: string;
    message?: string;
  } | null>(null);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);

  // Score badge renderer for table
  const getBadge = (score: number | null) => {
    if (score === null) return <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-[10px] md:text-xs font-bold flex items-center gap-1 w-fit"><Clock size={12} /> قيد المراجعة</span>;
    if (score >= 90) return <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-[10px] md:text-xs font-bold flex items-center gap-1 w-fit"><Trophy size={12} /> {score} ذهبي</span>;
    if (score >= 75) return <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full text-[10px] md:text-xs font-bold flex items-center gap-1 w-fit"><Medal size={12} /> {score} فضي</span>;
    return <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-[10px] md:text-xs font-bold flex items-center gap-1 w-fit"><Award size={12} /> {score} برونزي</span>;
  };

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
        const achievementsData = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((a: any) => a.status === 'approved' || !a.status);
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

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: schoolSettings?.schoolName || 'المدرسة',
    description: 'منصة عرض إنجازات الطلاب والأنشطة المدرسية.',
    url: 'https://school-achievements-six.vercel.app',
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    <div className="space-y-6 md:space-y-8 pb-10 w-full max-w-full overflow-hidden">
      <Suspense fallback={null}>
        <SearchParamsWatcher onChange={handleParamsChange} />
      </Suspense>

      {/* Header card */}
      <div className={`${header} flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4 p-4 md:p-6 pr-14 sm:pr-3 md:pr-6`}>
        <div className="flex items-center gap-4">
          {schoolSettings?.logoUrl && (
            <img src={schoolSettings.logoUrl} alt="School Logo" className="w-16 h-16 md:w-20 md:h-20 object-contain rounded-xl bg-white/90 border border-white/20 shadow-sm p-1 max-w-full" />
          )}
          <div>
            <h2 className="text-xl md:text-2xl font-black text-white">مرحباً بك في منصة إنجازاتنا</h2>
            <p className="text-xs md:text-sm text-purple-100 font-bold">وثق ، شارك ، وكن جزءاً من النجاح</p>
          </div>
        </div>
      </div>

      {/* School Info Card - below header, above stats */}
      {schoolSettings && (schoolSettings.schoolName || schoolSettings.address || schoolSettings.phone || schoolSettings.managerName || schoolSettings.vision || schoolSettings.message) && (
        <div className={`${panel} p-4 md:p-6 pr-14 sm:pr-3 md:pr-6`}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {/* School name and logo */}
            <div className="flex items-center gap-3 md:col-span-2 lg:col-span-1">
              <div>
                {schoolSettings.schoolName && (
                  <h2 className="text-lg md:text-xl font-black text-[#46178f]">{schoolSettings.schoolName}</h2>
                )}
                {schoolSettings.managerName && (
                  <p className="text-xs md:text-sm text-gray-500 font-bold flex items-center gap-1 mt-1">
                    <Users size={14} className="text-[#0087ed]" />
                    مديرة المدرسة: {schoolSettings.managerName}
                  </p>
                )}
              </div>
            </div>

            {/* Contact info */}
            <div className="space-y-2">
              {schoolSettings.address && (
                <p className="text-xs md:text-sm text-gray-600 flex items-center gap-2">
                  <MapPin size={16} className="text-[#eb1f36] shrink-0" />
                  <span>{schoolSettings.address}</span>
                </p>
              )}
              {schoolSettings.phone && (
                <p className="text-xs md:text-sm text-gray-600 flex items-center gap-2">
                  <Phone size={16} className="text-[#26890c] shrink-0" />
                  <span dir="ltr">{schoolSettings.phone}</span>
                </p>
              )}
              {(schoolSettings.viceManagerName || schoolSettings.assistantManager2) && (
                <p className="text-xs md:text-sm text-gray-600 flex items-center gap-2">
                  <Users size={16} className="text-[#ffb000] shrink-0" />
                  <span>
                    {[schoolSettings.viceManagerName, schoolSettings.assistantManager2].filter(Boolean).join(' - ')}
                  </span>
                </p>
              )}
            </div>

            {/* Vision & Mission */}
            <div className="space-y-2">
              {schoolSettings.vision && (
                <p className="text-xs md:text-sm text-gray-600 flex items-start gap-2">
                  <Eye size={16} className="text-[#46178f] shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{schoolSettings.vision}</span>
                </p>
              )}
              {schoolSettings.message && (
                <p className="text-xs md:text-sm text-gray-600 flex items-start gap-2">
                  <BookOpen size={16} className="text-[#0087ed] shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{schoolSettings.message}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="flex gap-3 md:gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-none pb-2 -mx-3 px-3 md:mx-0 md:px-0">
        <div className="bg-white rounded-2xl p-3 shadow-lg border-2 border-purple-100 flex flex-col items-center gap-0.5 min-w-[120px] md:min-w-0 snap-center shrink-0">
          <div className="bg-blue-100 p-1.5 rounded-xl text-[#0087ed]"><Users size={18} /></div>
            <p className="text-[10px] md:text-xs text-gray-500 font-bold text-center leading-tight">المعلمات</p>
            <p className="text-xl md:text-2xl font-black text-gray-800">
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : new Set(achievements.map(a => a.teacherName).filter(Boolean)).size}
            </p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-lg border-2 border-purple-100 flex flex-col items-center gap-0.5 min-w-[120px] md:min-w-0 snap-center shrink-0">
          <div className="bg-green-100 p-1.5 rounded-xl text-[#26890c]"><Award size={18} /></div>
            <p className="text-[10px] md:text-xs text-gray-500 font-bold text-center leading-tight">إجمالي المشاركات</p>
            <p className="text-xl md:text-2xl font-black text-gray-800">
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : achievements.length}
            </p>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-lg border-2 border-purple-100 flex flex-col items-center gap-0.5 min-w-[120px] md:min-w-0 snap-center shrink-0">
          <div className="bg-yellow-100 p-1.5 rounded-xl text-[#ffb000]"><Star size={18} /></div>
            <p className="text-[10px] md:text-xs text-gray-500 font-bold text-center leading-tight">إنجازات مميزة</p>
            <p className="text-xl md:text-2xl font-black text-gray-800">
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : achievements.filter(a => a.score && a.score >= 90).length}
            </p>
        </div>
      </div>

      <div>
        <h3 className="text-xl md:text-2xl font-black text-white mb-6 flex items-center gap-3">
          <span className="bg-[#ffb800] w-2.5 h-7 rounded-full inline-block shadow-lg"></span>
          {teacherFilter ? `إنجازات المعلمة: ${teacherFilter}` : 'أحدث الإنجازات المعتمدة'}
        </h3>
        
        {teacherFilter && (
          <div className="mb-6 flex items-center gap-2">
            <button onClick={() => router.push('/')} className="bg-[#eb1f36] hover:bg-[#c9172c] text-white px-4 py-2 rounded-2xl text-sm font-black flex items-center gap-2 border-b-4 border-[#b51427] active:border-b-0 active:translate-y-1 transition-all shadow-lg">
              <X size={16} /> إلغاء التصفية
            </button>
          </div>
        )}
        
        <div className="overflow-x-auto rounded-3xl shadow-xl border-2 border-purple-100 bg-white">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-purple-200">
              <Loader2 className="animate-spin mb-4 text-yellow-400" size={40} />
              <p className="font-bold text-purple-200">جاري تحميل الإنجازات المباشرة...</p>
            </div>
          ) : firebaseError ? (
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-10 border-2 border-dashed border-red-200 text-center text-gray-400 shadow-lg">
              <p className="font-bold text-red-500">تعذر تحميل الإنجازات. تحقق من اتصال الإنترنت.</p>
            </div>
          ) : displayedAchievements.length === 0 ? (
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-10 border-2 border-dashed border-purple-200 text-center text-gray-400 shadow-lg">
              <p className="font-bold">{teacherFilter ? "لا توجد إنجازات لهذه المعلمة حالياً." : "لا توجد إنجازات حتى الآن. كن أول من يضيف إنجازاً! 🚀"}</p>
            </div>
          ) : (
            <table className="w-full text-right table-auto min-w-[600px]">
              <thead>
                <tr className={table.head}>
                  <th className="p-3 md:p-4 whitespace-nowrap text-xs md:text-sm font-bold">المعلمة</th>
                  <th className="p-3 md:p-4 whitespace-nowrap text-xs md:text-sm font-bold">القسم</th>
                  <th className="p-3 md:p-4 whitespace-nowrap text-xs md:text-sm font-bold">العنوان</th>
                  <th className="p-3 md:p-4 whitespace-nowrap text-xs md:text-sm font-bold hidden">التقييم</th>
                  <th className="p-3 md:p-4 whitespace-nowrap text-xs md:text-sm font-bold">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {displayedAchievements.map((achievement) => (
                  <tr 
                    key={achievement.id} 
                    onClick={() => router.push(`/achievement/${achievement.id}`)}
                    className={`${table.row} cursor-pointer`}
                  >
                    <td className="p-3 md:p-4 text-xs md:text-sm font-bold text-[#46178f]">{achievement.teacherName || ''}</td>
                    <td className="p-3 md:p-4 text-xs md:text-sm text-gray-500">{achievement.department || ''}</td>
                    <td className="p-3 md:p-4 text-xs md:text-sm font-bold text-gray-800 max-w-[200px] truncate" title={achievement.title}>{achievement.title || ''}</td>
                    <td className="p-3 md:p-4 hidden">{getBadge(achievement.score)}</td>
                    <td className="p-3 md:p-4 text-xs md:text-sm text-gray-400">{achievement.date || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <AddAchievementModal isOpen={isModalOpen} onClose={handleCloseModal} />
    </div>
    </>
  );
}

export default function Home() {
  return (
    <ErrorBoundary>
      <HomeContent />
    </ErrorBoundary>
  );
}
