// src/app/full-record/page.tsx
"use client";
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, Filter, DownloadCloud, FileText, Trophy, Clock, Medal, Award, Loader2, Pencil, Trash2, Eye } from 'lucide-react';
import { isImageUrl, isVideoUrl } from '../../lib/pdf';
import { useAdmin } from '../../lib/useAdmin';
import Link from 'next/link';
import { collection, onSnapshot, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import AddAchievementModal from '../../components/AddAchievementModal';
import { sanitizeText } from '../../lib/sanitize';
import { btn, header, icon, input, inputSmall, panel, toast, table } from '../../lib/ui';

const getScoreBadge = (score: number | null) => {
  if (score === null) return <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Clock size={14} /> مراجعة</span>;
  if (score >= 90) return <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Trophy size={14} /> {score} ذهبي</span>;
  if (score >= 80) return <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Medal size={14} /> {score} فضي</span>;
  return <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Award size={14} /> {score} برونزي</span>;
};

const getStatusBadge = (status: string | undefined) => {
  if (status === 'pending') return <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit">⏳ بانتظار المراجعة</span>;
  if (status === 'rejected') return <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit">❌ مرفوض</span>;
  return null;
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
  const [isExporting, setIsExporting] = useState(false);
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
  const [verifiedPin, setVerifiedPin] = useState('');
  const [deletePinMode, setDeletePinMode] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [schoolSettings, setSchoolSettings] = useState<{ schoolName?: string, logoUrl?: string, departments?: string[] } | null>(null);

  useEffect(() => {
    setMounted(true);
    const q = query(collection(db, 'achievements'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const achievementsData = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((a: any) => {
          // Non-admins only see approved achievements
          if (!isAdmin && a.status !== 'approved' && a.status !== undefined) return false;
          return true;
        });
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

  const getScoreCategory = (score: number | null | undefined) => {
    if (score === null || score === undefined) return 'قيد المراجعة';
    if (score >= 90) return `${score} - ذهبي`;
    if (score >= 80) return `${score} - فضي`;
    return `${score} - برونزي`;
  };

  const getAttachmentLabel = (url: string, index: number) => {
    if (isImageUrl(url)) return `صورة ${index}`;
    if (isVideoUrl(url)) return `فيديو ${index}`;
    return `مستند ${index}`;
  };

  const collectAttachments = (row: any) => {
    const attachments: string[] = [];
    if (row.attachmentUrls) attachments.push(...row.attachmentUrls);
    if (row.fileUrl && !attachments.includes(row.fileUrl)) attachments.push(row.fileUrl);
    if (row.attachmentUrl && !attachments.includes(row.attachmentUrl)) attachments.push(row.attachmentUrl);
    return attachments;
  };

  const handlePdfExport = async () => {
    setIsExporting(true);
    try {
      // Group achievements by department, then by teacher
      const groups = new Map<string, Map<string, any[]>>();
      for (const row of filteredData) {
        const dept = row.department || 'غير محدد';
        const teacher = row.teacherName || 'غير محدد';
        if (!groups.has(dept)) groups.set(dept, new Map());
        const teacherMap = groups.get(dept)!;
        if (!teacherMap.has(teacher)) teacherMap.set(teacher, []);
        teacherMap.get(teacher)!.push(row);
      }

      const { printReport, buildPrintAttachments } = await import('../../lib/printPdf');

      const sections: any[] = [];
      const sortedDepts = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, 'ar'));
      for (const dept of sortedDepts) {
        const teacherMap = groups.get(dept)!;
        const sortedTeachers = Array.from(teacherMap.keys()).sort((a, b) => a.localeCompare(b, 'ar'));
        for (const teacher of sortedTeachers) {
          const rows = teacherMap.get(teacher)!;
          const sectionRows: any[][] = [];
          for (const row of rows) {
            const appUrl = `${window.location.origin}/achievement/${row.id}`;
            sectionRows.push([
              {
                type: 'achievement',
                title: row.title || '',
                items: buildPrintAttachments(collectAttachments(row), appUrl),
              },
              { type: 'text', text: row.date || '' },
            ]);
          }
          sections.push({
            title: `القسم: ${dept}`,
            subtitle: `المعلمة: ${teacher}  (${rows.length} إنجاز${rows.length === 1 ? '' : 'ات'})`,
            columns: ['الإنجاز', 'التاريخ'],
            widths: [78, 22],
            rows: sectionRows,
          });
        }
      }

      printReport({
        documentTitle: 'full-record',
        logoUrl: schoolSettings?.logoUrl,
        schoolName: schoolSettings?.schoolName,
        title: 'منصة إنجازات المدرسة',
        subtitle: 'السجل الكامل للإنجازات',
        sections,
      });
    } catch (error) {
      console.error('PDF export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const exportToExcel = async () => {
    setIsExporting(true);
    try {
      const XLSX = await import('xlsx');
      const sortedData = [...filteredData].sort((a, b) => {
        const deptCompare = (a.department || '').localeCompare(b.department || '', 'ar');
        if (deptCompare !== 0) return deptCompare;
        return (a.teacherName || '').localeCompare(b.teacherName || '', 'ar');
      });
      const rows = sortedData.map(row => {
        const attachmentsText = collectAttachments(row)
          .map((url, i) => `${getAttachmentLabel(url, i + 1)}: ${url}`)
          .join('\n');
        return {
          'المعلمة': row.teacherName || '',
          'القسم': row.department || '',
          'الإنجاز': row.title || '',
          'التاريخ': row.date || '',
          'التقييم': getScoreCategory(row.score),
          'المرفقات': attachmentsText,
        };
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 40 }, { wch: 12 }, { wch: 14 }, { wch: 60 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'الإنجازات');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'full-record.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setNotification({ type: "success", message: "تم تصدير ملف Excel بنجاح! 📊" });
    } catch (error) {
      console.error('Excel export error:', error);
      setNotification({ type: "error", message: "حدث خطأ أثناء تصدير ملف Excel، حاول مرة أخرى." });
    } finally {
      setIsExporting(false);
    }
  };

  const handleActionClick = (doc: any, mode: 'edit' | 'delete' = 'edit') => {
    setSelectedDoc(doc);
    setDeletePinMode(mode === 'delete');
    setShowPinPrompt(true);
  };

  const handlePinSubmit = async () => {
    try {
      const res = await fetch('/api/pin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ achievementId: selectedDoc.id, pin: pinInput }),
      });
      const result = await res.json();
      
      if (result.valid) {
        setVerifiedPin(pinInput);
        setShowPinPrompt(false);
        
        if (deletePinMode) {
          // Delete mode: confirm then delete with PIN
          setDeletePinMode(false);
          setPendingDeleteId(selectedDoc.id);
          setShowConfirm(true);
        } else {
          // Edit mode: open edit modal
          setShowEditModal(true);
        }
        setPinInput('');
        setPinError('');
      } else {
        setPinError('رمز الحماية غير صحيح!');
      }
    } catch (error) {
      console.error('PIN verification error:', error);
      setPinError('حدث خطأ في التحقق من الرمز');
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
      const deleteBody = !isAdmin && verifiedPin ? JSON.stringify({ pin: verifiedPin }) : undefined;
      const res = await fetch(`/api/achievements/${pendingDeleteId}`, {
        method: 'DELETE',
        ...(deleteBody ? { headers: { 'Content-Type': 'application/json' }, body: deleteBody } : {}),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'فشل الحذف');
      }
      setNotification({ type: "success", message: "تم حذف الإنجاز بنجاح! 🗑️" });
    } catch (error: any) {
      console.error("Error deleting document:", error);
      setNotification({ type: "error", message: error.message || "حدث خطأ أثناء الحذف." });
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
      <div className={`${header} flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-6 md:p-8 pr-14 sm:pr-0 print:hidden`}>
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-white flex items-center justify-center md:justify-start gap-2">
            <FileText className="text-[#ffb800]" size={28} />
              السجل الكامل  
          </h2>
          <p className="text-purple-100 font-bold mt-1 text-center md:text-right">إدارة وتصدير جميع الإنجازات الموثقة.</p>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={handlePdfExport}
            disabled={isExporting}
            className={`${btn.blue} flex-1 md:flex-none px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isExporting ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />} {isExporting ? 'جارٍ التصدير...' : 'PDF'}
          </button>
          <button 
            onClick={exportToExcel}
            disabled={isExporting}
            className={`${btn.green} flex-1 md:flex-none px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isExporting ? <Loader2 size={18} className="animate-spin" /> : <DownloadCloud size={18} />} {isExporting ? 'جارٍ التصدير...' : 'Excel'}
          </button>
        </div>
      </div>

      {/* Search & Filters Control Panel */}
      <div className={`${panel} p-4 md:p-6 flex flex-col gap-4 print:hidden`}>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input 
              type="text" 
              placeholder="ابحث بالاسم، الإنجاز، أو القسم..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`${input} pr-10 pl-4 text-sm`}
            />
          </div>
          
          <button 
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`flex items-center justify-center gap-2 border-2 px-6 py-3 rounded-2xl font-black transition-all whitespace-nowrap shadow-sm ${showAdvancedFilters ? 'bg-[#0087ed] border-[#0087ed] text-white' : 'bg-purple-50 border-purple-100 text-gray-600 hover:bg-purple-100'}`}
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
                className={`${inputSmall} w-full cursor-pointer`}
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
                className={`${inputSmall} w-full`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">إلى تاريخ</label>
              <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
                className={`${inputSmall} w-full`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">التقييم</label>
              <select value={filterScore} onChange={(e) => setFilterScore(e.target.value)}
                className={`${inputSmall} w-full cursor-pointer`}
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
      <div className={`${panel} print:shadow-none print:border-none print:w-full w-full overflow-hidden`}>
        <div className="w-full max-w-full overflow-x-auto block">
          <table className="w-full min-w-max text-right border-collapse">
            <thead>
              <tr className="bg-purple-50 border-b-2 border-purple-200 text-[#46178f] text-sm print:bg-white print:text-black print:border-b-2 print:border-black">
                <th className="p-4 font-bold whitespace-nowrap">المعلمة</th>
                <th className="p-4 font-bold whitespace-nowrap">القسم</th>
                <th className="p-4 font-bold min-w-[200px]">الإنجاز</th>
                <th className="p-4 font-bold whitespace-nowrap hidden sm:table-cell">التاريخ</th>
                <th className="p-4 font-bold whitespace-nowrap">الحالة</th>
                {/* تم إخفاء عمود التقييم على الشاشات الصغيرة لتوفير المساحة */}
                <th className="p-4 font-bold whitespace-nowrap hidden lg:table-cell">التقييم</th>
                <th className="p-4 font-bold text-center print:hidden whitespace-nowrap">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-gray-400">
                    <Loader2 className="animate-spin mx-auto mb-3 text-yellow-400" size={32} />
                    <p className="font-bold">جاري تحميل السجل...</p>
                  </td>
                </tr>
              ) : filteredData.map((row) => (
                <tr key={row.id} className={`${table.row} group`}>
                  <td className="p-4 font-bold text-[#46178f] whitespace-nowrap">{row.teacherName}</td>
                  <td className="p-4 whitespace-nowrap"><span className="bg-purple-50 text-[#46178f] px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap">{row.department}</span></td>
                  <td className="p-4 text-sm font-bold text-gray-700 min-w-[200px] whitespace-normal">
                    <Link href={`/achievement/${row.id}`} className="hover:text-[#0087ed] hover:underline transition-colors block">
                      {row.title}
                    </Link>
                  </td>
                  <td className="p-4 text-sm text-gray-500 whitespace-nowrap hidden sm:table-cell">{row.date}</td>
                  <td className="p-4 whitespace-nowrap">{getStatusBadge(row.status)}</td>
                  
                  {/* إخفاء محتوى التقييم على الشاشات الصغيرة */}
                  <td className="p-4 whitespace-nowrap hidden lg:table-cell">{getScoreBadge(row.score)}</td>
                  
                  <td className="p-4 text-center print:hidden whitespace-nowrap">
                    {isAdmin ? (
                      <div className="flex items-center justify-center gap-2">
                        <Link 
                          href={`/achievement/${row.id}`} 
                          className={icon.blue} 
                          title="عرض التفاصيل"
                        >
                          <Eye size={18} />
                        </Link>
                        
                        <button 
                          onClick={() => { setSelectedDoc(row); setShowEditModal(true); }} 
                          className={icon.green} 
                          title="تعديل"
                        >
                          <Pencil size={18} />
                        </button>
                        
                        <button 
                          onClick={() => handleDeleteClick(row.id)} 
                          className={icon.red} 
                          title="حذف"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <Link 
                          href={`/achievement/${row.id}`} 
                          className={icon.blue} 
                          title="عرض التفاصيل"
                        >
                          <Eye size={18} />
                        </Link>
                        
                        <button 
                          onClick={() => handleActionClick(row, 'edit')} 
                          className={icon.purple} 
                          title="تعديل الإنجاز (يتطلب رمز الحماية)"
                        >
                          <Pencil size={18} />
                        </button>
                        
                        <button 
                          onClick={() => handleActionClick(row, 'delete')} 
                          className={icon.red} 
                          title="حذف"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!isLoading && filteredData.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400 font-bold">لا توجد نتائج مطابقة للبحث.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Secure Edit Modal & Prompt Portals */}
      {mounted && createPortal(
        <>
          {showPinPrompt && !isAdmin && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] animate-in fade-in duration-200 p-4">
              <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-black text-[#46178f] mb-2">{deletePinMode ? 'حذف الإنجاز 🗑️' : 'تعديل الإنجاز ✏️'}</h3>
                <p className="text-sm text-gray-500 mb-6">{deletePinMode ? 'الرجاء إدخال رمز الحماية (PIN) الخاص بهذا الإنجاز لتتمكن من حذفه.' : 'الرجاء إدخال رمز الحماية (PIN) الخاص بهذا الإنجاز لتتمكن من تعديله.'}</p>
                
                <input 
                  type="password" 
                  maxLength={4} 
                  value={pinInput} 
                  onChange={e => setPinInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
                  placeholder="****"
                  className={`w-full text-center tracking-[1em] font-mono font-black text-2xl bg-white border-2 rounded-2xl p-4 outline-none transition-all ${pinError ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-100' : 'border-red-200 focus:border-[#eb1f36] focus:ring-4 focus:ring-red-200'}`}
                />
                {pinError && <p className="text-red-500 font-bold text-sm mt-3 animate-in slide-in-from-top-1">{pinError}</p>}
                
                <div className="flex gap-3 mt-6">
                  <button onClick={() => { setShowPinPrompt(false); setPinError(''); setPinInput(''); setDeletePinMode(false); }} className="flex-1 py-3 rounded-2xl font-black text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all">
                    إلغاء
                  </button>
                  <button onClick={handlePinSubmit} className="flex-1 py-3 rounded-2xl font-black text-white bg-[#0087ed] hover:bg-[#0073cc] border-b-4 border-[#005fa3] active:border-b-0 active:translate-y-1 transition-all shadow-lg">
                    تأكيد
                  </button>
                </div>
              </div>
            </div>
          )}

          
          {notification && (
            <div className={`${toast} z-[200]`} style={{ background: notification.type === "success" ? "#26890c" : "#eb1f36" }}>
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
                <h3 className="text-xl font-black text-[#46178f] mb-2">تأكيد الحذف</h3>
                <p className="text-gray-500 font-bold mb-6">هل أنت متأكد من حذف هذا الإنجاز بشكل نهائي؟ لا يمكن التراجع عن هذه الخطوة.</p>
                <div className="flex gap-3">
                  <button onClick={() => { setShowConfirm(false); setPendingDeleteId(null); }} className="flex-1 py-3 rounded-2xl font-black text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all">إلغاء</button>
                  <button onClick={handleConfirmDelete} className="flex-1 py-3 rounded-2xl font-black text-white bg-[#eb1f36] hover:bg-[#c9172c] border-b-4 border-[#b51427] active:border-b-0 active:translate-y-1 transition-all shadow-lg">حذف</button>
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
              verifiedPin={verifiedPin}
              initialData={selectedDoc} docId={selectedDoc.id}
            />
          )}
        </>,
        document.body
      )}
    </div>
  );
}
