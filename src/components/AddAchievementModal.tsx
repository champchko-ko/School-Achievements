"use client";
// src/components/AddAchievementModal.tsx
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CloudUpload, Lock, Loader2 } from 'lucide-react';
import { collection, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { compact, input } from '../lib/ui';

// Local (device) date in YYYY-MM-DD, used as the default achievement date
const todayLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const fileNameFromUrl = (url: string) => {
  try {
    const decoded = decodeURIComponent(url);
    return decoded.split('/').pop()?.split('?')[0] || 'ملف مرفق';
  } catch {
    return 'ملف مرفق';
  }
};

// Teacher type: supports both old string[] and new {name,department}[]
type TeacherEntry = string | { name: string; department: string };

function normalizeTeachers(raw: TeacherEntry[]): { name: string; department: string }[] {
  return (raw || []).map(t =>
    typeof t === 'string'
      ? { name: t, department: '' }
      : { name: t.name, department: t.department || '' }
  );
}

export default function AddAchievementModal({ isOpen, onClose, initialData, docId, verifiedPin }: { isOpen: boolean, onClose: () => void, initialData?: any, docId?: string, verifiedPin?: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [departmentsList, setDepartmentsList] = useState<string[]>(['الرياضيات', 'العلوم', 'اللغة العربية', 'الحاسب الآلي', 'التربية البدنية']);
  const [teachersRaw, setTeachersRaw] = useState<TeacherEntry[]>([]);
  const [formData, setFormData] = useState({
    teacherName: '',
    department: 'الرياضيات',
    title: '',
    desc: '',
    date: todayLocal(),
    pin: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  const teachers = normalizeTeachers(teachersRaw);

  // Teachers filtered by selected department (show all if department is empty / unassigned)
  const filteredTeachers = formData.department
    ? teachers.filter(t => t.department === formData.department)
    : teachers;

  const uniqueFilteredNames = [...new Set(filteredTeachers.map(t => t.name).filter(Boolean))];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (alertMsg) {
      const timer = setTimeout(() => setAlertMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [alertMsg]);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          teacherName: initialData.teacherName || '',
          department: initialData.department || departmentsList[0] || 'الرياضيات',
          title: initialData.title || '',
          desc: initialData.desc || '',
          date: initialData.date || todayLocal(),
          pin: initialData.pin || ''
        });
        const merged = [
          ...(initialData.attachmentUrls || []),
          initialData.fileUrl,
          initialData.attachmentUrl,
        ].filter(Boolean) as string[];
        setExistingAttachments(Array.from(new Set(merged)));
      } else {
        setFormData({ teacherName: '', department: departmentsList[0] || 'الرياضيات', title: '', desc: '', date: todayLocal(), pin: '' });
        setExistingAttachments([]);
      }
      setFiles([]);

      const fetchLists = async () => {
        try {
          const docRef = doc(db, "settings", "global_info");
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const data = snap.data();
            if (data.departments && data.departments.length > 0) {
              setDepartmentsList(data.departments);
              if (!initialData) {
                setFormData(prev => ({ ...prev, department: data.departments[0] }));
              }
            }
            if (data.teachers && data.teachers.length > 0) {
              setTeachersRaw(data.teachers);
            }
          }
        } catch (error) {
          console.error("Error fetching dynamic lists:", error);
        }
      };
      fetchLists();
    }
  }, [isOpen, initialData]);

  const allowedFileTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'video/mp4', 'video/webm', 'video/quicktime',
    'application/zip', 'application/x-rar-compressed',
    'text/plain',
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      const invalidFiles = newFiles.filter(f => !allowedFileTypes.includes(f.type));
      if (invalidFiles.length > 0) {
        setAlertMsg('نوع الملف غير مدعوم: ' + invalidFiles.map(f => f.name).join(', '));
        return;
      }
      setFiles((prev) => [...prev, ...newFiles]);
      e.target.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!formData.teacherName || !formData.title || !formData.desc || !formData.date || (!docId && !formData.pin)) {
      setAlertMsg("الرجاء ملء جميع الحقول المطلوبة (اسم المعلمة، القسم، العنوان، الوصف، التاريخ، والرمز السري)");
      return;
    }

    setIsSubmitting(true);
    try {
      const formDataObj = new FormData();
      if (docId) formDataObj.append('docId', docId);
      if (verifiedPin) formDataObj.append('verifiedPin', verifiedPin);
      formDataObj.append('teacherName', formData.teacherName);
      formDataObj.append('department', formData.department);
      formDataObj.append('title', formData.title);
      formDataObj.append('desc', formData.desc);
      formDataObj.append('date', formData.date);
      if (!docId) formDataObj.append('pin', formData.pin);

      // Existing attachments to keep
      existingAttachments.forEach(url => {
        formDataObj.append('existingAttachments', url);
      });

      // New files
      files.forEach(file => {
        formDataObj.append('files', file);
      });

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formDataObj,
      });

      const data = await res.json();

      if (res.ok) {
        onClose();
      } else {
        setAlertMsg(data.error || 'حدث خطأ أثناء حفظ الإنجاز. تحقق من حجم ونوع الملفات.');
      }
    } catch (error) {
      console.error('Submit error:', error);
      setAlertMsg('حدث خطأ في الاتصال بالخادم. تحقق من اتصالك بالإنترنت.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-2 sm:p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="bg-gradient-to-br from-white via-white to-purple-50/50 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto relative animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white/90 backdrop-blur-md px-6 py-4 border-b border-purple-100 flex items-center justify-between z-10 rounded-t-3xl">
          <h2 className="text-xl font-black text-[#46178f]">{docId ? "تعديل الإنجاز ✏️" : "إضافة إنجاز جديد 🏆"}</h2>
          <button onClick={onClose} className="p-2 hover:bg-purple-100 rounded-xl transition-colors text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Teacher & Department Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className={input}>
              <label className={input.label}>اسم المعلمة / المعلم *</label>
              <select
                value={formData.teacherName}
                onChange={(e) => setFormData({ ...formData, teacherName: e.target.value })}
                className={input.field}
              >
                <option value="">— اختر المعلمة —</option>
                {uniqueFilteredNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              {formData.department && uniqueFilteredNames.length === 0 && (
                <p className="text-xs text-orange-500 font-bold mt-1">لا توجد معلمات مسجلات في هذا القسم. أضفهن من صفحة الإعدادات.</p>
              )}
            </div>
            <div className={input}>
              <label className={input.label}>القسم *</label>
              <select
                value={formData.department}
                onChange={(e) => {
                  const newDept = e.target.value;
                  setFormData({ ...formData, department: newDept, teacherName: '' });
                }}
                className={input.field}
              >
                {departmentsList.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Title */}
          <div className={input.group}>
            <label className={input.label}>عنوان الإنجاز *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="مثال: بطولة المنطقة في العلوم"
              className={input.field}
            />
          </div>

          {/* Description */}
          <div className={input.group}>
            <label className={input.label}>وصف الإنجاز *</label>
            <textarea
              value={formData.desc}
              onChange={(e) => setFormData({ ...formData, desc: e.target.value })}
              placeholder="اشرح تفاصيل الإنجاز..."
              rows={3}
              className={input.field}
            />
          </div>

          {/* Date */}
          <div className={input.group}>
            <label className={input.label}>تاريخ الإنجاز *</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className={input.field}
            />
          </div>

          {/* File Upload */}
          <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,video/*,.zip,.rar,.txt"
            />
            
            {existingAttachments.length > 0 && (
              <div className="mb-3">
                <p className="text-sm font-bold text-[#46178f] mb-2">الملفات الحالية:</p>
                <div className="flex flex-wrap gap-2">
                  {existingAttachments.map((url, i) => (
                    <span key={i} className="bg-white text-xs font-bold px-2 py-1 rounded-md border border-purple-200 flex items-center gap-2 shadow-sm">
                      <span className="truncate max-w-[120px]" title={fileNameFromUrl(url)}>
                        {fileNameFromUrl(url)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExistingAttachments(prev => prev.filter((_, index) => index !== i));
                        }}
                        className="text-red-500 hover:bg-red-50 rounded-full p-0.5 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {files.length > 0 ? (
              <div className="space-y-3 mt-2">
                <p className="text-sm font-bold text-[#46178f]">{files.length} ملفات تم اختيارها</p>
                <div className="flex flex-wrap gap-2 justify-center max-h-24 overflow-y-auto px-2">
                  {files.map((f, i) => (
                    <span key={i} className="bg-white text-xs font-bold px-2 py-1 rounded-md border border-purple-200 flex items-center gap-2 shadow-sm">
                      <span className="truncate max-w-[120px]" title={f.name}>{f.name}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFiles(files.filter((_, index) => index !== i));
                        }}
                        className="text-red-500 hover:bg-red-50 rounded-full p-0.5 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className={`${compact.blue} text-sm inline-block`}
                >
                  + إضافة المزيد من الملفات
                </button>
              </div>
            ) : (
              <div className="cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <p className="text-sm font-bold text-[#46178f]">أرفق الصور أو المستندات</p>
                <p className="text-xs text-purple-600/70 mt-1">اضغط هنا أو اسحب الملفات</p>
              </div>
            )}
          </div>

          {/* PIN Code Field */}
          <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <div className="bg-[#46178f]/10 p-3 rounded-xl text-[#46178f]"><Lock size={20} /></div>
            <div className="flex-1">
              <label className="block text-sm font-bold text-[#46178f] mb-1">{docId ? "رمز الحماية (غير قابل للتغيير)" : "رمز الحماية السري (PIN) * مطلوب"}</label>
              <p className="text-xs text-[#46178f] mb-2">{docId ? "رمز الحماية لا يمكن تغييره بعد إنشاء الإنجاز" : "مطلوب: يجب إدخال 4 أرقام لتتمكن من تعديل الإنجاز لاحقاً"}</p>
              <input 
                type="password" 
                maxLength={4} 
                value={formData.pin}
                onChange={(e) => setFormData({...formData, pin: e.target.value})}
                placeholder="****" 
                disabled={!!docId}
                className="w-24 text-center tracking-[0.5em] font-mono font-bold text-lg bg-white border-2 border-purple-200 rounded-2xl p-2 focus:ring-4 focus:ring-red-100 outline-none transition-all disabled:opacity-50" 
              />
            </div>
          </div>
        </div>

        {/* Alert Message */}
        {alertMsg && (
          <div className="fixed bottom-6 right-4 left-4 md:left-auto md:right-4 md:w-96 z-[200] p-4 rounded-2xl shadow-2xl font-black text-white bg-[#eb1f36] border-4 border-white/20 animate-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-3">
              <span>❌</span>
              <span>{alertMsg}</span>
              <button onClick={() => setAlertMsg(null)} className="mr-auto text-white/70 hover:text-white">✕</button>
            </div>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="p-6 bg-purple-50/50 border-t border-purple-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-3 rounded-2xl font-black text-gray-600 hover:bg-purple-100 transition-all">
            إلغاء
          </button>
          <button 
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`px-8 py-3 rounded-2xl font-black text-white flex items-center gap-2 transition-all ${
              isSubmitting 
                ? "bg-gray-500 cursor-not-allowed" 
                : "bg-[#26890c] hover:bg-[#20730a] border-b-4 border-[#165406] active:border-b-0 active:translate-y-1"
            }`}
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : (docId ? "حفظ التعديلات 💾" : "نشر الإنجاز 🚀")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
