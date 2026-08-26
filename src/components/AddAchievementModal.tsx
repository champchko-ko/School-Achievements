"use client";
// src/components/AddAchievementModal.tsx
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CloudUpload, Lock, Loader2, ChevronDown, FileImage, Trash2 } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

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

type TeacherEntry = string | { name: string; department: string };

function normalizeTeachers(raw: TeacherEntry[]): { name: string; department: string }[] {
  return (raw || []).map(t =>
    typeof t === 'string'
      ? { name: t, department: '' }
      : { name: t.name, department: t.department || '' }
  );
}

const allowedFileTypes = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'video/mp4', 'video/webm', 'video/quicktime',
  'application/zip', 'application/x-rar-compressed', 'text/plain',
];

const SIZE_LIMITS: Record<string, number> = {
  image: 10 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  application: 20 * 1024 * 1024,
  text: 5 * 1024 * 1024,
};

const FILE_LIMITS = { images: 4, documents: 1, videos: 1 };

function isImage(f: File) { return f.type.startsWith('image/'); }
function isVideo(f: File) { return f.type.startsWith('video/'); }
function isDocument(f: File) { return f.type === 'application/pdf' || f.type === 'application/msword' || f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; }

function validateFiles(fileList: File[], existingFiles: File[]): { accepted: File[]; rejected: string[] } {
  const accepted: File[] = [];
  const rejected: string[] = [];

  // Count existing files by type
  let imgCount = existingFiles.filter(isImage).length;
  let docCount = existingFiles.filter(isDocument).length;
  let vidCount = existingFiles.filter(isVideo).length;

  for (const f of fileList) {
    if (!allowedFileTypes.includes(f.type)) {
      rejected.push(`❌ ${f.name} — نوع الملف غير مدعوم`);
      continue;
    }
    const category = f.type.split('/')[0] || '';
    const max = SIZE_LIMITS[category] || 20 * 1024 * 1024;
    if (f.size > max) {
      const fileMB = (f.size / (1024 * 1024)).toFixed(1);
      const maxMB = (max / (1024 * 1024)).toFixed(0);
      rejected.push(`❌ ${f.name} — الحجم ${fileMB} MB يتجاوز الحد الأقصى ${maxMB} MB`);
      continue;
    }
    // Per-type limits
    if (isImage(f)) {
      if (imgCount >= FILE_LIMITS.images) {
        rejected.push(`❌ ${f.name} — تم الوصول للحد الأقصى من الصور (${FILE_LIMITS.images})`);
        continue;
      }
      imgCount++;
    } else if (isDocument(f)) {
      if (docCount >= FILE_LIMITS.documents) {
        rejected.push(`❌ ${f.name} — تم الوصول للحد الأقصى من المستندات (${FILE_LIMITS.documents})`);
        continue;
      }
      docCount++;
    } else if (isVideo(f)) {
      if (vidCount >= FILE_LIMITS.videos) {
        rejected.push(`❌ ${f.name} — تم الوصول للحد الأقصى من الفيديوهات (${FILE_LIMITS.videos})`);
        continue;
      }
      vidCount++;
    }
    accepted.push(f);
  }
  return { accepted, rejected };
}

export default function AddAchievementModal({
  isOpen, onClose, initialData, docId, verifiedPin,
}: {
  isOpen: boolean; onClose: () => void; initialData?: any; docId?: string; verifiedPin?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [departmentsList, setDepartmentsList] = useState<string[]>([]);
  const [teachersRaw, setTeachersRaw] = useState<TeacherEntry[]>([]);
  const [formData, setFormData] = useState({
    department: '',
    teacherName: '',
    title: '',
    desc: '',
    date: todayLocal(),
    pin: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const teachers = normalizeTeachers(teachersRaw);

  const filteredTeachers = formData.department
    ? teachers.filter(t => t.department === formData.department)
    : teachers;

  const uniqueFilteredNames = [...new Set(filteredTeachers.map(t => t.name).filter(Boolean))];

  const noTeachersForDept = formData.department && uniqueFilteredNames.length === 0;

  useEffect(() => { setMounted(true); }, []);

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
          department: initialData.department || '',
          title: initialData.title || '',
          desc: initialData.desc || '',
          date: initialData.date || todayLocal(),
          pin: initialData.pin || '',
        });
        const merged = [
          ...(initialData.attachmentUrls || []),
          initialData.fileUrl,
          initialData.attachmentUrl,
        ].filter(Boolean) as string[];
        setExistingAttachments(Array.from(new Set(merged)));
      } else {
        setFormData({ department: '', teacherName: '', title: '', desc: '', date: todayLocal(), pin: '' });
        setExistingAttachments([]);
      }
      setFiles([]);

      const fetchLists = async () => {
        try {
          const snap = await getDoc(doc(db, 'settings', 'global_info'));
          if (snap.exists()) {
            const data = snap.data();
            if (data.departments?.length > 0) setDepartmentsList(data.departments);
            if (data.teachers?.length > 0) setTeachersRaw(data.teachers);
          }
        } catch (e) {
          console.error('Error fetching lists:', e);
        }
      };
      fetchLists();
    }
  }, [isOpen, initialData]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const newFiles = Array.from(e.target.files);
    const { accepted, rejected } = validateFiles(newFiles, files);
    if (accepted.length > 0) setFiles(prev => [...prev, ...accepted]);
    if (rejected.length > 0) setAlertMsg(rejected.join('\n'));
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!e.dataTransfer.files.length) return;
    const dropped = Array.from(e.dataTransfer.files);
    const { accepted, rejected } = validateFiles(dropped, files);
    if (accepted.length > 0) setFiles(prev => [...prev, ...accepted]);
    if (rejected.length > 0) setAlertMsg(rejected.join('\n'));
  };

  const handleSubmit = async () => {
    if (!formData.teacherName || !formData.title || !formData.desc || !formData.date || (!docId && !formData.pin)) {
      setAlertMsg('الرجاء ملء جميع الحقول المطلوبة');
      return;
    }
    setIsSubmitting(true);
    try {
      // Step 1: Upload files to Cloudinary (if any)
      let attachmentUrls: string[] = [];
      if (files.length > 0) {
        const uploadPromises = files.map(async (f) => {
          const fd = new FormData();
          fd.append('file', f);
          const res = await fetch('/api/upload', { method: 'POST', body: fd });
          const data = await res.json();
          if (!res.ok) { if (res.status === 429) throw new Error(data.error || 'تم تجاوز الحد المسموح. حاول مرة أخرى لاحقاً.'); throw new Error(data.error || 'فشل رفع الملف'); }
          return data.secure_url;
        });
        attachmentUrls = await Promise.all(uploadPromises);
      }

      // Step 2: Create or update achievement via JSON API
      if (docId) {
        const updatePayload: any = {
          teacherName: formData.teacherName,
          department: formData.department,
          title: formData.title,
          desc: formData.desc,
          date: formData.date,
          attachmentUrls: [...existingAttachments, ...attachmentUrls],
        };
        if (verifiedPin) updatePayload.pin = verifiedPin;
        const res = await fetch(`/api/achievements/${docId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'فشل تحديث الإنجاز');
        }
      } else {
        const createPayload: any = {
          teacherName: formData.teacherName,
          department: formData.department,
          title: formData.title,
          desc: formData.desc,
          date: formData.date,
          attachmentUrls,
        };
        if (formData.pin) createPayload.pin = formData.pin;
        const res = await fetch('/api/achievements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createPayload),
        });
        if (!res.ok) {
          const errData = await res.json();
          if (res.status === 429) {
            throw new Error(errData.error || 'تم تجاوز الحد المسموح. حاول مرة أخرى لاحقاً.');
          }
          throw new Error(errData.error || 'فشل حفظ الإنجاز');
        }
      }
      // Show success message for new achievements
      if (!docId) {
        setSuccessMsg('تم إرسال إنجازك بنجاح! سيتم مراجعته من قبل الإدارة قبل ظهوره في الصفحة العامة.');
        setTimeout(() => { setSuccessMsg(null); onClose(); }, 3000);
      } else {
        onClose();
      }
    } catch (err: any) {
      setAlertMsg(err.message || 'حدث خطأ في الاتصال بالخادم');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  /* ─── Reusable select wrapper ─── */
  const FieldLabel = ({ children, hint }: { children: React.ReactNode; hint?: string }) => (
    <label className="block text-sm font-extrabold text-gray-800 mb-1.5 flex items-center gap-1.5">
      {children}
      {hint && <span className="text-[10px] font-bold text-purple-400 bg-purple-50 px-1.5 py-0.5 rounded-md">{hint}</span>}
    </label>
  );

  const selectClass =
    'w-full appearance-none bg-white border-2 border-purple-100 rounded-xl p-3 pr-10 font-bold text-sm text-gray-800 focus:ring-4 focus:ring-purple-200 focus:border-[#46178f] outline-none transition-all';

  const inputClass =
    'w-full bg-white border-2 border-purple-100 rounded-xl p-3 font-bold text-sm text-gray-800 focus:ring-4 focus:ring-purple-200 focus:border-[#46178f] outline-none transition-all';

  const SelectIcon = () => (
    <ChevronDown size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-300 pointer-events-none" />
  );

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-[100] p-3 sm:p-6 pt-[5vh] sm:pt-[8vh] animate-in fade-in duration-200 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg relative animate-in zoom-in-95 duration-300 mb-8"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-md px-6 py-4 border-b border-purple-100 flex items-center justify-between z-10 rounded-t-3xl">
          <div className="flex items-center gap-3">
            <span className="bg-[#46178f] text-white w-10 h-10 rounded-2xl flex items-center justify-center font-black text-lg shadow-md">
              {docId ? '✏️' : '🏆'}
            </span>
            <div>
              <h2 className="font-extrabold text-gray-900 text-lg">{docId ? 'تعديل الإنجاز' : 'إنجاز جديد'}</h2>
              <p className="text-xs text-gray-400 font-bold">{docId ? 'تحديث بيانات الإنجاز' : 'أضف إنجازاً جديداً للعرض'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-purple-50 rounded-xl transition-colors text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="p-5 sm:p-6 space-y-5">

          {/* STEP 1: Department — the gateway field */}
          <section className="bg-gradient-to-br from-[#46178f]/5 to-purple-50 border-2 border-[#46178f]/15 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-[#46178f] text-white w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black">١</span>
              <span className="font-extrabold text-sm text-[#46178f]">القسم الدراسي</span>
            </div>
            <div className="relative">
              <FieldLabel>اختر القسم *</FieldLabel>
              <select
                value={formData.department}
                onChange={e => setFormData(prev => ({ ...prev, department: e.target.value, teacherName: '' }))}
                className={selectClass}
              >
                <option value="">— حدد القسم أولاً —</option>
                {departmentsList.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <SelectIcon />
            </div>
          </section>

          {/* STEP 2: Teacher — disabled until department chosen */}
          <section className={`rounded-2xl p-4 sm:p-5 border-2 transition-all ${
            formData.department
              ? 'bg-gradient-to-br from-[#26890c]/5 to-emerald-50 border-[#26890c]/15'
              : 'bg-gray-50 border-gray-100 opacity-50'
          }`}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black ${formData.department ? 'bg-[#26890c] text-white' : 'bg-gray-200 text-gray-400'}`}>٢</span>
              <span className={`font-extrabold text-sm ${formData.department ? 'text-[#26890c]' : 'text-gray-400'}`}>المعلمة / المعلم</span>
            </div>
            <div className="relative">
              <FieldLabel hint={formData.department ? undefined : 'اختر القسم أولاً'}>اختر المعلمة *</FieldLabel>
              <select
                value={formData.teacherName}
                onChange={e => setFormData(prev => ({ ...prev, teacherName: e.target.value }))}
                disabled={!formData.department}
                className={selectClass + (formData.department ? '' : ' cursor-not-allowed')}
              >
                <option value="">
                  {!formData.department ? '— حدد القسم أولاً —' : '— حدد المعلمة —'}
                </option>
                {uniqueFilteredNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <SelectIcon />
            </div>
            {noTeachersForDept && (
              <p className="text-xs text-amber-600 font-bold mt-2 bg-amber-50 px-3 py-1.5 rounded-lg">
                ⚠️ لا توجد معلمات مسجلين في قسم "{formData.department}". أضف المعلمات من صفحة الإعدادات أولاً.
              </p>
            )}
          </section>

          {/* STEP 3: Achievement details */}
          <section className="bg-gradient-to-br from-[#0087ed]/5 to-blue-50 border-2 border-[#0087ed]/15 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-[#0087ed] text-white w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black">٣</span>
              <span className="font-extrabold text-sm text-[#0087ed]">تفاصيل الإنجاز</span>
            </div>
            <div className="space-y-3">
              <div>
                <FieldLabel>عنوان الإنجاز *</FieldLabel>
                <input
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="مثال: فوز بالمركز الأول في مسابقة الرياضيات"
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel>وصف الإنجاز *</FieldLabel>
                <textarea
                  value={formData.desc}
                  onChange={e => setFormData(prev => ({ ...prev, desc: e.target.value }))}
                  placeholder="اكتب وصفاً تفصيلياً للإنجاز..."
                  rows={3}
                  className={inputClass + ' resize-y min-h-[80px]'}
                />
              </div>
              <div>
                <FieldLabel>تاريخ الإنجاز *</FieldLabel>
                <input
                  type="date"
                  value={formData.date}
                  onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          {/* STEP 4: Attachments */}
          <section className="bg-gradient-to-br from-[#eb1f36]/5 to-rose-50 border-2 border-[#eb1f36]/10 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-[#eb1f36] text-white w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black">٤</span>
              <span className="font-extrabold text-sm text-[#eb1f36]">المرفقات</span>
              <span className="text-[10px] font-bold text-gray-400">اختياري</span>
            </div>

            {/* Existing attachments (edit mode) */}
            {existingAttachments.length > 0 && (
              <div className="mb-3 space-y-1.5">
                <p className="text-xs font-bold text-gray-500">المرفقات الحالية:</p>
                <div className="flex flex-wrap gap-1.5">
                  {existingAttachments.map((url, i) => (
                    <span key={i} className="bg-white text-xs font-bold px-2.5 py-1.5 rounded-lg border border-purple-200 flex items-center gap-1.5 shadow-sm">
                      <FileImage size={12} className="text-[#46178f]" />
                      <span className="truncate max-w-[130px]">{fileNameFromUrl(url)}</span>
                      <button
                        type="button"
                        onClick={() => setExistingAttachments(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-red-400 hover:text-red-600 ml-0.5"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                dragOver
                  ? 'border-[#eb1f36] bg-rose-50 scale-[1.01]'
                  : 'border-purple-200 hover:border-[#eb1f36]/50 hover:bg-rose-50/30'
              }`}
            >
              <CloudUpload size={28} className={`mx-auto mb-1.5 ${dragOver ? 'text-[#eb1f36]' : 'text-purple-300'}`} />
              <p className="text-sm font-bold text-gray-600">اسحب الملفات هنا أو اضغط للاختيار</p>
              <div className="mt-2 flex flex-wrap justify-center gap-1.5 text-[10px] font-bold">
                <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md">🖼️ صور: حد أقصى 4 (≤ 10 MB)</span>
                <span className="bg-purple-50 text-purple-600 px-2 py-0.5 rounded-md">📄 مستندات: حد أقصى 1 (≤ 20 MB)</span>
                <span className="bg-rose-50 text-rose-600 px-2 py-0.5 rounded-md">🎬 فيديو: حد أقصى 1 (≤ 100 MB)</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">JPG, PNG, WebP, GIF • PDF, DOC, DOCX • MP4, WebM, MOV • ZIP, RAR</p>

            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.mp4,.webm,.mov,.zip,.rar,.txt"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Selected files list */}
            {files.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-bold text-gray-500">{files.length} ملفات جديدة:</p>
                <div className="flex flex-wrap gap-1.5">
                  {files.map((f, i) => (
                    <span key={i} className="bg-white text-xs font-bold px-2.5 py-1.5 rounded-lg border border-purple-200 flex items-center gap-1.5 shadow-sm">
                      <FileImage size={12} className="text-[#eb1f36]" />
                      <span className="truncate max-w-[130px]" title={f.name}>{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-red-400 hover:text-red-600 ml-0.5"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-bold text-[#0087ed] hover:underline mt-1"
                >
                  + إضافة المزيد
                </button>
              </div>
            )}
          </section>

          {/* STEP 5: PIN — only for new achievements */}
          {!docId && (
            <section className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200/50 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="bg-amber-500 text-white w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black">٥</span>
                <span className="font-extrabold text-sm text-amber-700">رمز الحماية</span>
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <Lock size={20} className="text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-amber-700 mb-1.5">أدخل 4 أرقام كرمز سري للإنجاز (يُطلب عند التعديل لاحقاً)</p>
                  <input
                    type="password"
                    maxLength={4}
                    value={formData.pin}
                    onChange={e => setFormData(prev => ({ ...prev, pin: e.target.value }))}
                    placeholder="••••"
                    className="w-28 text-center tracking-[0.5em] font-mono font-bold text-lg bg-white border-2 border-amber-200 rounded-xl p-2.5 focus:ring-4 focus:ring-amber-100 outline-none transition-all"
                  />
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Rate limit hint */}
        {!docId && (
          <p className="text-[10px] text-amber-500 font-bold text-center">⚠️ الحد الأقصى: 10 إنجازات في الساعة</p>
        )}

        {/* ── Footer ── */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-purple-100 px-5 py-4 flex items-center justify-between gap-3 rounded-b-3xl">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-black text-sm text-gray-500 hover:bg-gray-100 transition-all">
            إلغاء
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`px-6 py-2.5 rounded-xl font-black text-sm text-white flex items-center gap-2 transition-all ${
              isSubmitting
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-[#26890c] hover:bg-[#20730a] shadow-md shadow-[#26890c]/25 active:scale-[0.97]'
            }`}
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : null}
            {docId ? 'حفظ التعديلات' : 'نشر الإنجاز'}
          </button>
        </div>
      </div>

      {/* ── Success toast ── */}
      {successMsg && (
        <div className="fixed bottom-6 right-4 left-4 md:left-auto md:right-4 md:w-[28rem] z-[200] p-4 rounded-2xl shadow-2xl font-bold text-white bg-[#26890c] border-4 border-white/20 animate-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start gap-3">
            <span className="text-lg mt-0.5">✅</span>
            <div className="flex-1">
              <p className="font-black text-sm mb-1">تم الإرسال</p>
              <p className="text-xs whitespace-pre-line leading-relaxed opacity-95">{successMsg}</p>
            </div>
            <button onClick={() => { setSuccessMsg(null); onClose(); }} className="text-white/70 hover:text-white mt-0.5">✕</button>
          </div>
        </div>
      )}

      {/* ── Alert toast ── */}
      {alertMsg && (
        <div className="fixed bottom-6 right-4 left-4 md:left-auto md:right-4 md:w-[28rem] z-[200] p-4 rounded-2xl shadow-2xl font-bold text-white bg-[#eb1f36] border-4 border-white/20 animate-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start gap-3">
            <span className="text-lg mt-0.5">⚠️</span>
            <div className="flex-1">
              <p className="font-black text-sm mb-1">تنبيه</p>
              <p className="text-xs whitespace-pre-line leading-relaxed opacity-95">{alertMsg}</p>
            </div>
            <button onClick={() => setAlertMsg(null)} className="text-white/70 hover:text-white mt-0.5">✕</button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
