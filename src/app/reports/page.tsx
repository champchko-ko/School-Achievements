"use client";
import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Printer, BarChart3, Medal, UserSquare, FileSpreadsheet, Loader2 } from 'lucide-react';

import { useRouter } from 'next/navigation';
import { useAdmin } from '../../lib/useAdmin';

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState('department');
  const [achievements, setAchievements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState('all');
  const [schoolSettings, setSchoolSettings] = useState<{ schoolName?: string, logoUrl?: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [notification, setNotification] = useState<{ type: string, message: string } | null>(null);
  const { isAdmin, loading: adminLoading } = useAdmin();
  const router = useRouter();

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) {
      router.replace('/');
      return;
    }
    setMounted(true);
    const q = query(collection(db, 'achievements'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAchievements(data);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [isAdmin, adminLoading, router]);

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

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const computeDepartmentStats = () => {
    const deptStats: Record<string, { count: number; totalScore: number; scoredCount: number }> = {};
    achievements.forEach(ach => {
      const dept = ach.department || 'غير محدد';
      if (!deptStats[dept]) {
        deptStats[dept] = { count: 0, totalScore: 0, scoredCount: 0 };
      }
      deptStats[dept].count += 1;
      if (ach.score !== null && ach.score !== undefined) {
        deptStats[dept].totalScore += ach.score;
        deptStats[dept].scoredCount += 1;
      }
    });
    return Object.keys(deptStats).map(dept => ({
      department: dept,
      count: deptStats[dept].count,
      averageScore: deptStats[dept].scoredCount > 0
        ? Math.round(deptStats[dept].totalScore / deptStats[dept].scoredCount)
        : null
    })).sort((a, b) => b.count - a.count);
  };

  const computeHonorList = () => {
    const teacherStats: Record<string, { dept: string, count: number; totalScore: number; scoredCount: number }> = {};
    achievements.forEach(ach => {
      const name = ach.teacherName;
      if (!name) return;
      if (!teacherStats[name]) {
        teacherStats[name] = { dept: ach.department || 'غير محدد', count: 0, totalScore: 0, scoredCount: 0 };
      }
      teacherStats[name].count += 1;
      if (ach.score !== null && ach.score !== undefined) {
        teacherStats[name].totalScore += ach.score;
        teacherStats[name].scoredCount += 1;
      }
    });
    return Object.keys(teacherStats).map(name => ({
      name,
      department: teacherStats[name].dept,
      count: teacherStats[name].count,
    })).sort((a, b) => b.count - a.count).slice(0, 10);
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      const { printReport, buildPrintAttachments } = await import('../../lib/printPdf');

      if (activeReport === 'department') {
        const statsArray = computeDepartmentStats();
        printReport({
          documentTitle: 'department-report',
          logoUrl: schoolSettings?.logoUrl,
          schoolName: schoolSettings?.schoolName,
          title: 'تقرير أداء الأقسام',
          subtitle: 'مقارنة تفصيلية لعدد الإنجازات ومتوسط التقييم لكل قسم',
          sections: [{
            title: 'ملخص أداء الأقسام',
            columns: ['القسم', 'إجمالي الإنجازات', 'متوسط التقييم'],
            widths: [40, 30, 30],
            rows: statsArray.map(s => [
              { type: 'text', text: s.department, bold: true },
              { type: 'text', text: String(s.count), bold: true, color: '#0087ed' },
              { type: 'text', text: s.averageScore === null ? 'قيد المراجعة' : String(s.averageScore) },
            ]),
          }],
        });
      } else if (activeReport === 'honor') {
        const honorList = computeHonorList();
        printReport({
          documentTitle: 'honor-roll',
          logoUrl: schoolSettings?.logoUrl,
          schoolName: schoolSettings?.schoolName,
          title: 'قائمة الشرف للمتميزين',
          subtitle: 'أكثر المعلمات إنجازاً وتميزاً في الأداء',
          sections: [{
            title: 'قائمة الشرف',
            columns: ['الترتيب', 'المعلمة', 'القسم', 'إجمالي الإنجازات'],
            widths: [10, 40, 30, 20],
            rows: honorList.map((s, idx) => [
              { type: 'text', text: String(idx + 1), bold: true },
              { type: 'text', text: s.name, bold: true },
              { type: 'text', text: s.department },
              { type: 'text', text: String(s.count), bold: true, color: '#0087ed' },
            ]),
          }],
        });
      } else {
        // Individual teacher report
        if (selectedTeacher === 'all') {
          setNotification({ type: 'error', message: 'يرجى اختيار معلمة أولاً لتصدير سجلها.' });
          return;
        }
        const filteredData = achievements
          .filter(a => a.teacherName === selectedTeacher)
          .sort((a, b) => b.date.localeCompare(a.date));

        const groups = new Map<string, any[]>();
        for (const ach of filteredData) {
          const dept = ach.department || 'غير محدد';
          if (!groups.has(dept)) groups.set(dept, []);
          groups.get(dept)!.push(ach);
        }

        const sections: any[] = [];
        const sortedDepts = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, 'ar'));
        for (const dept of sortedDepts) {
          const deptRows: any[][] = [];
          for (const ach of groups.get(dept)!) {
            const attachments: string[] = [];
            if (ach.attachmentUrls) attachments.push(...ach.attachmentUrls);
            if (ach.fileUrl && !attachments.includes(ach.fileUrl)) attachments.push(ach.fileUrl);
            if (ach.attachmentUrl && !attachments.includes(ach.attachmentUrl)) attachments.push(ach.attachmentUrl);
            const appUrl = `${window.location.origin}/achievement/${ach.id}`;
            deptRows.push([
              buildPrintAttachments(attachments, appUrl),
              { type: 'text', text: ach.date || '' },
              { type: 'rich', title: ach.title || '', desc: ach.desc || '' },
            ]);
          }
          sections.push({
            title: `القسم: ${dept}`,
            subtitle: `${deptRows.length} إنجاز${deptRows.length === 1 ? '' : 'ات'}`,
            columns: ['المرفقات', 'التاريخ', 'الإنجاز'],
            widths: [21, 11, 68],
            rows: deptRows,
          });
        }

        printReport({
          documentTitle: 'teacher-report',
          logoUrl: schoolSettings?.logoUrl,
          schoolName: schoolSettings?.schoolName,
          title: 'السجل الفردي للإنجازات',
          subtitle: `المعلمة: ${selectedTeacher}`,
          sections,
        });
      }
    } catch (error) {
      console.error('PDF export error:', error);
      setNotification({ type: 'error', message: 'حدث خطأ أثناء إنشاء ملف PDF.' });
    } finally {
      setIsExporting(false);
    }
  };

  const renderDepartmentReport = () => {
    const statsArray = computeDepartmentStats();

    return (
      <div className="bg-white rounded-2xl shadow-lg border border-purple-100/50 p-8 print:shadow-none print:border-none print:p-0">
        <div className="text-center mb-8 pb-6 border-b-2 border-gray-200">
          <div className="hidden print:flex items-center justify-start gap-4 mb-6">
            {schoolSettings?.logoUrl && <img src={schoolSettings.logoUrl} alt="School Logo" className="w-24 h-24 object-contain" />}
            {schoolSettings?.schoolName && <h2 className="text-4xl font-black text-gray-800">{schoolSettings.schoolName}</h2>}
          </div>
          <h2 className="text-3xl font-black text-yellow-400 mb-2">تقرير أداء الأقسام</h2>
          <p className="text-gray-500">مقارنة تفصيلية لعدد الإنجازات ومتوسط التقييم لكل قسم</p>
          <p className="text-xs text-gray-400 mt-4 hidden print:block">
            {mounted && `تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')} - الوقت: ${new Date().toLocaleTimeString('ar-SA')}`}
          </p>
        </div>
        
        <div className="overflow-x-auto">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="bg-purple-50 border-b-2 border-purple-200 text-[#46178f] print:bg-white print:text-black">
              <th className="p-4 font-bold">القسم</th>
              <th className="p-4 font-bold text-center whitespace-nowrap">إجمالي الإنجازات</th>
              <th className="p-4 font-bold text-center whitespace-nowrap">متوسط التقييم</th>
            </tr>
          </thead>
          <tbody>
            {statsArray.map((stat, idx) => (
              <tr key={idx} className="border-b border-purple-100 hover:bg-purple-50/50 transition-colors print:border-b-2">
                <td className="p-4 font-bold text-gray-800">{stat.department}</td>
                <td className="p-4 text-center font-bold text-[#0087ed] text-lg">{stat.count}</td>
                <td className="p-4 text-center">
                  {stat.averageScore !== null ? (
                    <span className={`px-3 py-1 rounded-full text-sm font-bold print:border print:border-gray-400 ${
                      stat.averageScore >= 90 ? 'bg-yellow-100 text-yellow-700' :
                      stat.averageScore >= 80 ? 'bg-gray-200 text-gray-700' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {stat.averageScore}%
                    </span>
                  ) : (
                    <span className="text-gray-400 text-sm font-bold">قيد المراجعة</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    );
  };

  const renderHonorReport = () => {
    const honorList = computeHonorList();

    return (
      <div className="bg-white rounded-2xl shadow-lg border border-purple-100/50 p-8 print:shadow-none print:border-none print:p-0">
        <div className="text-center mb-8 pb-6 border-b-2 border-gray-200">
          <div className="hidden print:flex items-center justify-start gap-4 mb-6">
            {schoolSettings?.logoUrl && <img src={schoolSettings.logoUrl} alt="School Logo" className="w-24 h-24 object-contain" />}
            {schoolSettings?.schoolName && <h2 className="text-4xl font-black text-gray-800">{schoolSettings.schoolName}</h2>}
          </div>
          <h2 className="text-3xl font-black text-[#ffb000] mb-2">قائمة الشرف للمتميزين</h2>
          <p className="text-gray-500">أكثر المعلمات إنجازاً وتميزاً في الأداء</p>
          <p className="text-xs text-gray-400 mt-4 hidden print:block">
            {mounted && `تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')} - الوقت: ${new Date().toLocaleTimeString('ar-SA')}`}
          </p>
        </div>
        
        <div className="overflow-x-auto">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="bg-purple-50 border-b-2 border-purple-200 text-[#46178f] print:bg-white print:text-black">
              <th className="p-4 font-bold">الترتيب</th>
              <th className="p-4 font-bold">المعلمة</th>
              <th className="p-4 font-bold">القسم</th>
              <th className="p-4 font-bold text-center whitespace-nowrap">إجمالي الإنجازات</th>
            </tr>
          </thead>
          <tbody>
            {honorList.map((stat, idx) => (
              <tr key={idx} className="border-b border-purple-100 hover:bg-purple-50/50 transition-colors print:border-b-2">
                <td className="p-4 font-black text-gray-400">#{idx + 1}</td>
                <td className="p-4 font-bold text-gray-800"><div className="flex items-center gap-2 whitespace-nowrap">
                  {idx === 0 && <Medal className="text-yellow-500" size={20} />}
                  {idx === 1 && <Medal className="text-gray-400" size={20} />}
                  {idx === 2 && <Medal className="text-orange-500" size={20} />}
                  {stat.name}
                </div></td>
                <td className="p-4 text-gray-600 font-bold">{stat.department}</td>
                <td className="p-4 text-center font-bold text-[#0087ed] text-lg">{stat.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    );
  };

  const renderIndividualReport = () => {
    const teachers = Array.from(new Set(achievements.map(a => a.teacherName).filter(Boolean))) as string[];
    const filteredData = selectedTeacher === "all" ? [] : achievements.filter(a => a.teacherName === selectedTeacher).sort((a,b) => b.date.localeCompare(a.date));

    return (
      <div className="bg-white rounded-2xl shadow-lg border border-purple-100/50 p-8 print:shadow-none print:border-none print:p-0">
        <div className="print:hidden mb-8 bg-purple-50 p-6 rounded-xl border border-purple-100">
           <label className="block text-sm font-bold text-gray-700 mb-2">اختر المعلمة لعرض وطباعة السجل الفردي:</label>
           <select 
             value={selectedTeacher} 
             onChange={(e) => setSelectedTeacher(e.target.value)}
             className="w-full md:w-1/2 bg-white border border-gray-300 rounded-xl p-3 focus:ring-2 focus:ring-[#0087ed] outline-none cursor-pointer font-bold"
           >
             <option value="all">-- يرجى اختيار المعلمة --</option>
             {teachers.map(t => <option key={t} value={t}>{t}</option>)}
           </select>
        </div>

        {selectedTeacher !== "all" ? (
          <div className="animate-in fade-in duration-500">
            <div className="text-center mb-8 pb-6 border-b-2 border-gray-200">
              <div className="hidden print:flex items-center justify-start gap-4 mb-6">
                {schoolSettings?.logoUrl && <img src={schoolSettings.logoUrl} alt="School Logo" className="w-24 h-24 object-contain" />}
                {schoolSettings?.schoolName && <h2 className="text-4xl font-black text-gray-800">{schoolSettings.schoolName}</h2>}
              </div>
              <h2 className="text-3xl font-black text-[#26890c] mb-2">السجل الفردي للإنجازات</h2>
              <p className="text-xl font-bold text-gray-700">المعلمة: {selectedTeacher}</p>
              <p className="text-xs text-gray-400 mt-4 hidden print:block">
                {mounted && `تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')} - الوقت: ${new Date().toLocaleTimeString('ar-SA')}`}
              </p>
            </div>

            <div className="space-y-6">
              {filteredData.map((ach, idx) => (
                <div key={idx} className="p-6 bg-purple-50 rounded-2xl border border-purple-100 print:bg-white print:border-b-2 print:border-gray-300 print:rounded-none break-inside-avoid">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-lg font-bold text-gray-800">{ach.title}</h3>
                    <span className="text-sm font-bold text-gray-500 bg-white px-3 py-1 rounded-full border">{ach.date}</span>
                  </div>
                  <p className="text-gray-600 leading-relaxed mb-4">{ach.desc}</p>
                  <div className="flex gap-2">
                     {ach.score ? (
                       <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-blue-700">التقييم: {ach.score}%</span>
                     ) : (
                       <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-100 text-[#46178f]">قيد المراجعة</span>
                     )}
                     <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-100 text-purple-700">{ach.department}</span>
                  </div>
                </div>
              ))}
              {filteredData.length === 0 && <p className="text-center text-gray-500 font-bold p-10">لا توجد إنجازات مسجلة.</p>}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-purple-200 font-bold print:hidden">
            يرجى اختيار معلم من القائمة أعلاه لعرض وطباعة سجله.
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      
      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-4 right-4 left-4 md:left-auto md:right-4 md:w-96 z-[200] p-4 rounded-2xl shadow-2xl font-bold text-white animate-in slide-in-from-top-2 duration-300" style={{ background: notification.type === "success" ? "#26890c" : "#ef4444" }}>
          {notification.message}
        </div>
      )}

      {/* Header & Print Button */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
          <h2 className="text-2xl font-black text-yellow-400 flex items-center justify-center md:justify-start gap-2">
            <Printer className="text-pink-400" size={28} />
            طباعة التقارير
          </h2>
          <p className="text-gray-500 font-bold mt-1 text-center md:text-right">اختر التقرير المطلوب وقم بطباعته أو تصديره.</p>
        </div>
        
        <button 
          onClick={handleExportPdf}
          disabled={isExporting}
          className="flex items-center justify-center gap-2 bg-[#380e6e] hover:bg-[#2a0a54] text-white px-6 py-3 rounded-xl font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />} {isExporting ? 'جارٍ إنشاء PDF...' : 'تصدير التقرير PDF'}
        </button>
      </div>

      {/* Report Selection Tabs */}
      <div className="grid grid-cols-4 gap-2 md:gap-4 print:hidden">
        <button onClick={() => setActiveReport('department')} className={`flex flex-col items-center justify-center gap-1 p-2 md:p-4 rounded-2xl border-2 transition-all text-center ${activeReport === 'department' ? 'border-[#0087ed] bg-blue-50/50' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
          <BarChart3 size={16} className={`md:size-[24] ${activeReport === 'department' ? 'text-[#0087ed]' : 'text-gray-400'}`} />
          <h3 className={`text-[10px] md:text-sm font-bold leading-tight ${activeReport === 'department' ? 'text-[#0087ed]' : 'text-gray-700'}`}>أداء الأقسام</h3>
          <p className="hidden md:block text-xs text-gray-500">مقارنة الإنجازات والتقييمات</p>
        </button>
        <button onClick={() => setActiveReport('honor')} className={`flex flex-col items-center justify-center gap-1 p-2 md:p-4 rounded-2xl border-2 transition-all text-center ${activeReport === 'honor' ? 'border-[#ffb000] bg-yellow-50/50' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
          <Medal size={16} className={`md:size-[24] ${activeReport === 'honor' ? 'text-[#ffb000]' : 'text-gray-400'}`} />
          <h3 className={`text-[10px] md:text-sm font-bold leading-tight ${activeReport === 'honor' ? 'text-[#ffb000]' : 'text-gray-700'}`}>قائمة الشرف</h3>
          <p className="hidden md:block text-xs text-gray-500">المعلمات المتميزات</p>
        </button>
        <button onClick={() => setActiveReport('individual')} className={`flex flex-col items-center justify-center gap-1 p-2 md:p-4 rounded-2xl border-2 transition-all text-center ${activeReport === 'individual' ? 'border-[#26890c] bg-green-50/50' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
          <UserSquare size={16} className={`md:size-[24] ${activeReport === 'individual' ? 'text-[#26890c]' : 'text-gray-400'}`} />
          <h3 className={`text-[10px] md:text-sm font-bold leading-tight ${activeReport === 'individual' ? 'text-[#26890c]' : 'text-gray-700'}`}>سجل المعلمة</h3>
          <p className="hidden md:block text-xs text-gray-500">تقرير فردي مفصل</p>
        </button>
        <button onClick={() => setActiveReport('master')} className={`flex flex-col items-center justify-center gap-1 p-2 md:p-4 rounded-2xl border-2 transition-all text-center ${activeReport === 'master' ? 'border-[#1368ce] bg-blue-50/50' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
          <FileSpreadsheet size={16} className={`md:size-[24] ${activeReport === 'master' ? 'text-[#1368ce]' : 'text-gray-400'}`} />
          <h3 className={`text-[10px] md:text-sm font-bold leading-tight ${activeReport === 'master' ? 'text-[#1368ce]' : 'text-gray-700'}`}>السجل الشامل</h3>
          <p className="hidden md:block text-xs text-gray-500">تصدير البيانات الخام</p>
        </button>
      </div>

      {/* Report Content Area */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 className="animate-spin mb-4 text-yellow-400" size={40} />
          <p className="font-bold">جاري تجميع بيانات التقارير...</p>
        </div>
      ) : (
        <div className="mt-8">
          {activeReport === 'department' && renderDepartmentReport()}
          {activeReport === 'honor' && renderHonorReport()}
          {activeReport === 'individual' && renderIndividualReport()}
          {activeReport === 'master' && (
            <div className="bg-white rounded-2xl shadow-lg border border-purple-100/50 p-12 text-center print:hidden">
              <FileSpreadsheet className="mx-auto text-[#1368ce] mb-4" size={48} />
              <h2 className="text-2xl font-black text-gray-800 mb-2">السجل الشامل وتصدير البيانات</h2>
              <p className="text-gray-500 mb-6">للوصول إلى السجل الشامل مع خيارات الفلترة المتقدمة والتصدير إلى Excel و PDF، يرجى الانتقال إلى صفحة السجل الكامل.</p>
              <a href="/full-record" className="inline-block bg-[#1368ce] hover:bg-[#0f56b0] text-white px-6 py-3 rounded-xl font-bold transition-colors shadow-md">الانتقال إلى السجل الكامل</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
