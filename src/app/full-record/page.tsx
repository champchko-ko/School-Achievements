// src/app/full-record/page.tsx
"use client";
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, Filter, DownloadCloud, FileText, Trophy, Clock, Medal, Award, Loader2, Pencil, Trash2, Eye } from 'lucide-react';
import Link from 'next/link';
import { collection, onSnapshot, query, orderBy, doc, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import AddAchievementModal from '../../components/AddAchievementModal';

const getScoreBadge = (score: number | null) => {
  if (score === null) return <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Clock size={14} /> مراجعة</span>;
  if (score >= 90) return <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Trophy size={14} /> {score} ذهبي</span>;
  if (score >= 80) return <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Medal size={14} /> {score} فضي</span>;
  return <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Award size={14} /> {score} برونزي</span>;
};

export default function FullRecordPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterScore, setFilterScore] = useState("all");
  const [filterDepartment, setFilterDepartment] = useState("all");
  const [achievements, setAchievements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [notification, setNotification] = useState<{ type: string, message: string } | null>(null);

  // Auto-dismiss notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // PIN and Edit Modal States
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [schoolSettings, setSchoolSettings] = useState<{ schoolName?: string, logoUrl?: string, departments?: string[] } | null>(null);

  useEffect(() => {
    setMounted(true);
    setIsAdmin(localStorage.getItem('isAdmin') === 'true');
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

  // Extract unique departments from both the settings and the fetched data
  const availableDepartments = Array.from(new Set([
    ...(schoolSettings?.departments || ['الرياضيات', 'العلوم', 'اللغة العربية', 'الحاسب الآلي', 'التربية البدنية']),
    ...achievements.map(a => a.department).filter(Boolean)
  ])) as string[];

  // Basic and Advanced filter logic
  const filteredData = achievements.filter(item => {
    const matchesSearch = (item.teacherName || "").includes(searchTerm) || 
                          (item.title || "").includes(searchTerm) || 
                          (item.department || "").includes(searchTerm);

    let matchesDate = true;
    if (filterDateFrom) matchesDate = matchesDate && item.date >= filterDateFrom;
    if (filterDateTo) matchesDate = matchesDate && item.date <= filterDateTo;

    let matchesScore = true;
    if (filterScore !== 'all') {
      if (filterScore === 'pending') {
        matchesScore = item.score === null;
      } else if (filterScore === 'gold') {
        matchesScore = item.score !== null && item.score >= 90;
      } else if (filterScore === 'silver') {
        matchesScore = item.score !== null && item.score >= 80 && item.score < 90;
      } else if (filterScore === 'bronze') {
        matchesScore = item.score !== null && item.score < 80;
      }
    }
    
    let matchesDepartment = true;
    if (filterDepartment !== 'all') matchesDepartment = item.department === filterDepartment;

    return matchesSearch && matchesDate && matchesScore && matchesDepartment;
  });

  const exportToExcel = () => {
    let tableHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <style>
          table { text-align: right; direction: rtl; border-collapse: collapse; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
          th, td { border: 1px solid #ddd; padding: 10px; }
          th { background-color: #f8f9fa; color: #333; font-weight: bold; }
          a { color: #0087ed; text-decoration: underline; }
        </style>
      </head>
      <body>
        <table>
          <thead>
            <tr><th>المعلمة</th><th>القسم</th><th>الإنجاز</th><th>التاريخ</th><th>التقييم</th><th>المرفقات</th></tr>
          </thead>
          <tbody>
            ${filteredData.map(row => {
              const links = [];
              if (row.attachmentUrls) links.push(...row.attachmentUrls);
              if (row.attachmentUrl) links.push(row.attachmentUrl);
              const attachmentsHtml = links.map((url, i) => `<a href="${url}">مرفق ${i + 1}</a>`).join("<br/>");
              return `<tr><td>${row.teacherName || ''}</td><td>${row.department || ''}</td><td>${row.title || ''}</td><td>${row.date || ''}</td><td>${row.score ?? 'قيد المراجعة'}</td><td>${attachmentsHtml}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(["\uFEFF" + tableHtml], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "السجل_الكامل.xls";
    link.click();
  };

  const handleActionClick = (doc: any) => {
    setSelectedDoc(doc);
    setShowPinPrompt(true);
  };

  const handlePinSubmit = () => {
    if (pinInput === selectedDoc.pin) {
      setShowPinPrompt(false);
      setShowEditModal(true);
      setPinInput('');
      setPinError('');
    } else {
      setPinError('رمز الحماية غير صحيح!');
    }
  };

  const handleDeleteClick = async (id: string) => {
    setPendingDeleteId(id);
    setShowConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return;
    setShowConfirm(false);
    try {
      await deleteDoc(doc(db, "achievements", pendingDeleteId));
      setNotification({ type: "success", message: "تم حذف الإنجاز بنجاح! 🗑️" });
    } catch (error) {
      console.error("Error deleting document:", error);
      setNotification({ type: "error", message: "حدث خطأ أثناء الحذف." });
    }
    setPendingDeleteId(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10 w-full max-w-full overflow-hidden">
      
      {/* Hides the browser's default date/title text */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { margin: 0; } /* Removes default browser headers */
          body { padding: 1.5cm; } /* Adds a clean margin around the paper */
        }
      `}} />

      {/* Print Only Header */}
      <div className="hidden print:block mb-8 border-b-2 border-gray-200 pb-6">
        <div className="flex justify-between items-start mb-6">
          
          {/* 1. Right Side: Logo and School Name */}
          <div className="flex flex-col items-center gap-2 w-1/3">
            {schoolSettings?.logoUrl && <img src={schoolSettings.logoUrl} alt="School Logo" className="w-24 h-24 object-contain" />}
            {schoolSettings?.schoolName && <h2 className="text-2xl text-center font-black text-gray-800">{schoolSettings.schoolName}</h2>}
          </div>
          
          {/* 2. Center: Main Titles */}
          <div className="flex flex-col items-center justify-center gap-2 pt-6 w-1/3">
            <h1 className="text-3xl font-black text-black text-center whitespace-nowrap">منصة إنجازات المدرسة</h1>
            <h2 className="text-xl font-bold text-gray-600 text-center whitespace-nowrap">السجل الكامل للإنجازات</h2>
          </div>

          {/* 3. Left Side: Empty spacer to ensure the titles stay perfectly centered */}
          <div className="w-1/3"></div>

        </div>
        
        {/* Custom Date/Time Stamp */}
        <p className="text-xs text-center text-gray-400 mt-4 hidden print:block">
          {mounted && `تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')} - الوقت: ${new Date().toLocaleTimeString('ar-SA')}`}
        </p>
      </div>

      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pr-14 sm:pr-0 print:hidden">
        <div>
          <h2 className="text-2xl font-black text-yellow-400 flex items-center justify-center md:justify-start gap-2">
            <FileText className="text-yellow-400" size={28} />
              السجل الكامل  
          </h2>
          <p className="text-gray-500 font-bold mt-1 text-center md:text-right">إدارة وتصدير جميع الإنجازات الموثقة.</p>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={() => window.print()}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white border-2 border-gray-200 hover:border-[#26890c] hover:text-[#26890c] text-gray-600 px-4 py-2 rounded-xl font-bold transition-colors"
          >
            <FileText size={18} /> PDF
          </button>
          <button 
            onClick={exportToExcel}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white border-2 border-gray-200 hover:border-[#26890c] hover:text-[#26890c] text-gray-600 px-4 py-2 rounded-xl font-bold transition-colors"
          >
            <DownloadCloud size={18} /> Excel
          </button>
        </div>
      </div>

      {/* Search & Filters Control Panel */}
      <div className="bg-white p-4 rounded-2xl shadow-lg border border-purple-100/50 flex flex-col gap-4 print:hidden">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input 
              type="text" 
              placeholder="ابحث بالاسم، الإنجاز، أو القسم..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pr-10 pl-4 focus:ring-2 focus:ring-[#46178f] outline-none transition-all font-bold text-sm"
            />
          </div>
          
          <button 
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`flex items-center justify-center gap-2 border px-6 py-3 rounded-xl font-bold transition-colors whitespace-nowrap ${showAdvancedFilters ? 'bg-[#1368ce] border-[#1368ce] text-white' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
          >
            <Filter size={18} /> تصفية متقدمة
          </button>
        </div>

        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <div className="pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in slide-in-from-top-2">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">القسم</label>
              <select value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2 focus:ring-2 focus:ring-[#46178f] outline-none transition-all text-sm cursor-pointer"
              >
                <option value="all">جميع الأقسام</option>
                {availableDepartments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">من تاريخ</label>
              <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2 focus:ring-2 focus:ring-[#46178f] outline-none transition-all text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">إلى تاريخ</label>
              <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2 focus:ring-2 focus:ring-[#46178f] outline-none transition-all text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">التقييم</label>
              <select value={filterScore} onChange={(e) => setFilterScore(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2 focus:ring-2 focus:ring-[#46178f] outline-none transition-all text-sm cursor-pointer"
              >
                <option value="all">الكل</option>
                <option value="gold">ذهبي (90+)</option>
                <option value="silver">فضي (80 - 89)</option>
                <option value="bronze">برونزي (أقل من 80)</option>
                <option value="pending">قيد المراجعة</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* The Data Table */}
      <div className="bg-white rounded-2xl shadow-lg border border-purple-100/50 print:shadow-none print:border-none print:w-full w-full overflow-hidden">
        <div className="w-full max-w-full overflow-x-auto block">
          <table className="w-full min-w-max text-right border-collapse">
            <thead>
              <tr className="bg-purple-50 border-b border-purple-100 text-gray-500 text-sm print:bg-white print:text-black print:border-b-2 print:border-black">
                <th className="p-4 font-bold whitespace-nowrap">المعلمة</th>
                <th className="p-4 font-bold whitespace-nowrap">القسم</th>
                <th className="p-4 font-bold min-w-[200px]">الإنجاز</th>
                <th className="p-4 font-bold whitespace-nowrap hidden sm:table-cell">التاريخ</th>
                {/* تم إخفاء عمود التقييم على الشاشات الصغيرة لتوفير المساحة */}
                <th className="p-4 font-bold whitespace-nowrap hidden lg:table-cell">التقييم</th>
                <th className="p-4 font-bold text-center print:hidden whitespace-nowrap">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-gray-400">
                    <Loader2 className="animate-spin mx-auto mb-3 text-yellow-400" size={32} />
                    <p className="font-bold">جاري تحميل السجل...</p>
                  </td>
                </tr>
              ) : filteredData.map((row) => (
                <tr key={row.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors group">
                  <td className="p-4 font-bold text-[#4a154b] whitespace-nowrap">{row.teacherName}</td>
                  <td className="p-4 whitespace-nowrap"><span className="bg-purple-50 text-[#46178f] px-2 py-1 rounded-md text-xs font-bold whitespace-nowrap">{row.department}</span></td>
                  <td className="p-4 text-sm font-bold text-gray-700 min-w-[200px] whitespace-normal">
                    <Link href={`/achievement/${row.id}`} className="hover:text-[#0087ed] hover:underline transition-colors block">
                      {row.title}
                    </Link>
                  </td>
                  <td className="p-4 text-sm text-gray-500 whitespace-nowrap hidden sm:table-cell">{row.date}</td>
                  
                  {/* إخفاء محتوى التقييم على الشاشات الصغيرة */}
                  <td className="p-4 whitespace-nowrap hidden lg:table-cell">{getScoreBadge(row.score)}</td>
                  
                  <td className="p-4 text-center print:hidden whitespace-nowrap">
                    {isAdmin ? (
                      <div className="flex items-center justify-center gap-2">
                        <Link 
                          href={`/achievement/${row.id}`} 
                          className="flex items-center justify-center text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-700 p-2.5 rounded-lg transition-colors" 
                          title="عرض التفاصيل"
                        >
                          <Eye size={18} />
                        </Link>
                        
                        <button 
                          onClick={() => { setSelectedDoc(row); setShowEditModal(true); }} 
                          className="flex items-center justify-center text-green-600 bg-green-50 hover:bg-green-100 hover:text-green-700 p-2.5 rounded-lg transition-colors" 
                          title="تعديل"
                        >
                          <Pencil size={18} />
                        </button>
                        
                        <button 
                          onClick={() => handleDeleteClick(row.id)} 
                          className="flex items-center justify-center text-red-600 bg-red-50 hover:bg-red-100 hover:text-red-700 p-2.5 rounded-lg transition-colors" 
                          title="حذف"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <Link 
                          href={`/achievement/${row.id}`} 
                          className="flex items-center justify-center text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-700 p-2.5 rounded-lg transition-colors" 
                          title="عرض التفاصيل"
                        >
                          <Eye size={18} />
                        </Link>
                        
                        <button 
                          onClick={() => handleActionClick(row)} 
                          className="flex items-center justify-center text-purple-600 bg-purple-50 hover:bg-purple-100 hover:text-purple-700 p-2.5 rounded-lg transition-colors" 
                          title="تعديل الإنجاز (يتطلب رمز الحماية)"
                        >
                          <Pencil size={18} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!isLoading && filteredData.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400 font-bold">لا توجد نتائج مطابقة للبحث.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Secure Edit Modal & Prompt Portals */}
      {mounted && createPortal(
        <>
          {showPinPrompt && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] animate-in fade-in duration-200 p-4">
              <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-black text-[#4a154b] mb-2">تعديل الإنجاز ✏️</h3>
                <p className="text-sm text-gray-500 mb-6">الرجاء إدخال رمز الحماية (PIN) الخاص بهذا الإنجاز لتتمكن من تعديله.</p>
                
                <input 
                  type="password" 
                  maxLength={4} 
                  value={pinInput} 
                  onChange={e => setPinInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
                  placeholder="****"
                  className={`w-full text-center tracking-[1em] font-mono font-bold text-2xl bg-gray-50 border-2 rounded-xl p-3 outline-none transition-all ${pinError ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-100' : 'border-gray-200 focus:border-[#e21b3c] focus:ring-4 focus:ring-red-100'}`}
                />
                {pinError && <p className="text-red-500 font-bold text-sm mt-3 animate-in slide-in-from-top-1">{pinError}</p>}
                
                <div className="flex gap-3 mt-6">
                  <button onClick={() => { setShowPinPrompt(false); setPinError(''); setPinInput(''); }} className="flex-1 py-3 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
                    إلغاء
                  </button>
                  <button onClick={handlePinSubmit} className="flex-1 py-3 rounded-xl font-bold text-white bg-[#4a154b] hover:bg-[#3a103a] transition-colors">
                    تأكيد
                  </button>
                </div>
              </div>
            </div>
          )}

          
          {notification && (
            <div className="fixed top-4 right-4 left-4 md:left-auto md:right-4 md:w-96 z-[200] p-4 rounded-2xl shadow-2xl font-bold text-white animate-in slide-in-from-top-2 duration-300" style={{ background: notification.type === "success" ? "#26890c" : "#ef4444" }}>
              <div className="flex items-center gap-3">
                <span>{notification.type === "success" ? "✅" : "❌"}</span>
                <span>{notification.message}</span>
                <button onClick={() => setNotification(null)} className="mr-auto text-white/70 hover:text-white">✕</button>
              </div>
            </div>
          )}
          {showConfirm && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[70] animate-in fade-in duration-200" onClick={() => { setShowConfirm(false); setPendingDeleteId(null); }}>
              <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full mx-4 text-center animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="text-red-500" size={32} />
                </div>
                <h3 className="text-xl font-black text-[#4a154b] mb-2">تأكيد الحذف</h3>
                <p className="text-gray-500 font-bold mb-6">هل أنت متأكد من حذف هذا الإنجاز بشكل نهائي؟ لا يمكن التراجع عن هذه الخطوة.</p>
                <div className="flex gap-3">
                  <button onClick={() => { setShowConfirm(false); setPendingDeleteId(null); }} className="flex-1 py-3 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">إلغاء</button>
                  <button onClick={handleConfirmDelete} className="flex-1 py-3 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 transition-colors">حذف</button>
                </div>
              </div>
            </div>
          )}
          {showEditModal && selectedDoc && (
            <AddAchievementModal
              isOpen={showEditModal}
              onClose={() => {
                setShowEditModal(false);
                setSelectedDoc(null);
              }}
              initialData={selectedDoc} docId={selectedDoc.id}
            />
          )}
        </>,
        document.body
      )}
    </div>
  );
}
