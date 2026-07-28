// src/app/reports/page.tsx
"use client";
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { FileSpreadsheet, Printer, Users, Trophy, Loader2, DownloadCloud } from 'lucide-react';

export default function ReportsPage() {
  const [isExporting, setIsExporting] = useState(false);
  const [schoolSettings, setSchoolSettings] = useState<{ schoolName?: string, logoUrl?: string } | null>(null);

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

  // Feature 1: Export to Excel (CSV)
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      // Fetch all APPROVED achievements
      const q = query(collection(db, "achievements"), where("score", "!=", null), orderBy("score", "desc"));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        alert("لا توجد بيانات معتمدة لتصديرها.");
        setIsExporting(false);
        return;
      }

      // Create CSV Headers
      let csvContent = "\uFEFF"; // BOM for Arabic support in Excel
      csvContent += "اسم المعلم,القسم,عنوان الإنجاز,التاريخ,التقييم (النقاط)\n";

      // Add Data Rows
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Wrap text in quotes to prevent issues with commas in descriptions
        const row = `"${data.teacherName}","${data.department}","${data.title}","${data.date}","${data.score}"`;
        csvContent += row + "\n";
      });

      // Trigger Download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `تقرير_الإنجازات_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (error) {
      console.error("Error exporting data:", error);
      alert("حدث خطأ أثناء تصدير البيانات.");
    } finally {
      setIsExporting(false);
    }
  };

  // Feature 2: Print Page
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      
      {/* Header */}
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
        <h2 className="text-3xl font-black text-[#4a154b] mb-2 flex justify-center items-center gap-3">
          <Printer className="text-[#0087ed]" size={36} />
          مركز التقارير والإحصائيات
        </h2>
        <p className="text-gray-500 font-bold">تصدير وطباعة تقارير الأداء المعتمدة للإدارة 📊</p>
      </div>

      {/* Report Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Excel Export Card */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-2xl p-8 border-2 border-green-200 shadow-sm flex flex-col items-center text-center group hover:-translate-y-1 transition-transform">
          <div className="bg-white p-4 rounded-full shadow-md mb-4 group-hover:scale-110 transition-transform">
            <FileSpreadsheet size={40} className="text-green-600" />
          </div>
          <h3 className="text-2xl font-black text-green-900 mb-2">السجل الشامل (Excel)</h3>
          <p className="text-green-700 font-bold text-sm mb-6">تحميل جميع الإنجازات المعتمدة كملف Excel لعمل الإحصائيات المتقدمة.</p>
          
          <button 
            onClick={handleExportExcel}
            disabled={isExporting}
            className="w-full mt-auto flex justify-center items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-bold border-b-4 border-green-800 active:border-b-0 active:translate-y-1 transition-all"
          >
            {isExporting ? <Loader2 className="animate-spin" size={20} /> : <><DownloadCloud size={20} /> تحميل الملف</>}
          </button>
        </div>

        {/* PDF / Print Card */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl p-8 border-2 border-blue-200 shadow-sm flex flex-col items-center text-center group hover:-translate-y-1 transition-transform">
          <div className="bg-white p-4 rounded-full shadow-md mb-4 group-hover:scale-110 transition-transform">
            <Printer size={40} className="text-blue-600" />
          </div>
          <h3 className="text-2xl font-black text-blue-900 mb-2">طباعة لوحة الشرف</h3>
          <p className="text-blue-700 font-bold text-sm mb-6">تجهيز نسخة قابلة للطباعة (PDF) لتعليقها في لوحة إعلانات المدرسة.</p>
          
          <button 
            onClick={handlePrint}
            className="w-full mt-auto flex justify-center items-center gap-2 bg-[#0087ed] hover:bg-[#0073cc] text-white px-6 py-3 rounded-xl font-bold border-b-4 border-[#005fa3] active:border-b-0 active:translate-y-1 transition-all"
          >
            <Printer size={20} /> طباعة التقرير
          </button>
        </div>

      </div>

      {/* Print-Only Section (Hidden on screen, visible only when printing) */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * { visibility: hidden; }
          .print-section, .print-section * { visibility: visible; }
          .print-section { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; direction: rtl; }
          .no-print { display: none; }
        }
      `}} />
      
      <div className="hidden print-section bg-white p-8">
        <div className="mb-8 border-b-2 border-gray-200 pb-6">
          <div className="flex items-center justify-start gap-4 w-full mb-6">
            {schoolSettings?.logoUrl && (
              <img src={schoolSettings.logoUrl} alt="School Logo" className="w-24 h-24 object-contain" />
            )}
            {schoolSettings?.schoolName && (
              <h2 className="text-4xl font-black text-gray-800">{schoolSettings.schoolName}</h2>
            )}
          </div>
          <h1 className="text-4xl font-black mb-2 text-[#4a154b] text-center">تقرير الإنجازات المعتمدة</h1>
          <p className="text-sm text-gray-400 mt-4 text-center">
            تاريخ الطباعة: {new Date().toLocaleDateString('ar-SA')} - الوقت: {new Date().toLocaleTimeString('ar-SA')}
          </p>
        </div>
        <p className="text-2xl text-center font-bold text-gray-500">تم إنشاء هذا التقرير عبر منصة إنجازات المعلمين.</p>
        {/* In the future, we can map the actual data rows into a printable table here! */}
      </div>

    </div>
  );
}