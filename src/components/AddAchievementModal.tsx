"use client";
// src/components/AddAchievementModal.tsx
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CloudUpload, Loader2 } from 'lucide-react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function AddAchievementModal({ isOpen, onClose, initialData, docId }: { isOpen: boolean, onClose: () => void, initialData?: any, docId?: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [mounted, setMounted] = useState(false);
  const [departmentsList, setDepartmentsList] = useState<string[]>(['الرياضيات', 'العلوم', 'اللغة العربية', 'الحاسب الآلي', 'التربية البدنية']);
  const [teachersList, setTeachersList] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    teacherName: '',
    department: 'الرياضيات',
    title: '',
    desc: '',
    // pin removed - security
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

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
          // pin field removed for security
        });
      } else {
        setFormData({ teacherName: '', department: departmentsList[0] || 'الرياضيات', title: '', desc: '' });
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
              setTeachersList(data.teachers);
            }
          }
        } catch (error) {
          console.error("Error fetching dynamic lists:", error);
        }
      };
      fetchLists();
    }
  }, [isOpen, initialData]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles]);
      e.target.value = ''; // Reset input to allow selecting the same file again
    }
  };

  const handleSubmit = async () => {
    // Basic validation
    if (!formData.teacherName || !formData.title || !formData.desc) {
      setAlertMsg("يرجى ملء جميع الحقول المطلوبة.");
      return;
    }

    setIsSubmitting(true);
    try {
      let attachmentUrls: string[] = [];
      if (files.length > 0) {
        const uploadPromises = files.map(async (f) => {
          const formDataUpload = new FormData();
          formDataUpload.append('file', f);
          formDataUpload.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET as string);

          const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
          const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
            method: 'POST',
            body: formDataUpload,
          });
          
          const uploadData = await res.json();
          if (!res.ok) throw new Error(uploadData.error?.message || "Cloudinary upload failed");
          return uploadData.secure_url;
        });
        attachmentUrls = await Promise.all(uploadPromises);
      }

      // Send data to Firestore (Add or Update)
      if (docId) {
        const updatePayload: any = {
          teacherName: formData.teacherName,
          department: formData.department,
          title: formData.title,
          desc: formData.desc,
          // pin removed for security
        };
        if (attachmentUrls.length > 0) {
          updatePayload.attachmentUrls = initialData?.attachmentUrls 
            ? [...initialData.attachmentUrls, ...attachmentUrls] 
            : attachmentUrls;
        }
        await updateDoc(doc(db, "achievements", docId), updatePayload);
      } else {
        await addDoc(collection(db, "achievements"), {
          ...formData,
          attachmentUrls,
          score: null, // Default to unreviewed
          date: new Date().toISOString().split('T')[0],
          timestamp: serverTimestamp(),
        });
      }
      
      // Clear form and close modal
      setFormData({ teacherName: '', department: 'الرياضيات', title: '', desc: '' });
      setFiles([]);
      onClose();
    } catch (error) {
      console.error("Error saving to database: ", error);
      setAlertMsg("حدث خطأ. تحقق من أذونات Firebase.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
      
      {/* Modal Container */}
      <div className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300 mx-4 max-h-[90vh] overflow-y-auto">
        
        {/* Header - Kahoot Purple */}
        <div className="bg-[#4a154b] p-4 md:p-6 text-white flex justify-between items-center">
          <h2 className="text-lg md:text-xl font-bold flex items-center gap-2">{docId ? "✏️ تعديل الإنجاز" : "✨ إضافة إنجاز جديد"}</h2>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-4 md:p-6 space-y-4">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">الاسم</label>
              {teachersList.length > 0 ? (
                <select 
                  value={formData.teacherName}
                  onChange={(e) => setFormData({...formData, teacherName: e.target.value})}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-[#0087ed] outline-none transition-all cursor-pointer"
                >
                  <option value="" disabled>-- اختر المعلمة --</option>
                  {Array.from(new Set([...teachersList, formData.teacherName])).filter(Boolean).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              ) : (
                <input 
                  type="text" 
                  value={formData.teacherName}
                  onChange={(e) => setFormData({...formData, teacherName: e.target.value})}
                  placeholder="اسم المعلمة" 
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-[#0087ed] outline-none transition-all" 
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">القسم</label>
              <select 
                value={formData.department}
                onChange={(e) => setFormData({...formData, department: e.target.value})}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-[#0087ed] outline-none transition-all cursor-pointer"
              >
                {departmentsList.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">عنوان الإنجاز</label>
            <input 
              type="text" 
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              placeholder="مثال: تطوير أداة حسابية" 
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-[#0087ed] outline-none transition-all" 
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">الوصف</label>
            <textarea 
              rows={3} 
              value={formData.desc}
              onChange={(e) => setFormData({...formData, desc: e.target.value})}
              placeholder="اكتب تفاصيل الإنجاز هنا..." 
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-[#0087ed] outline-none transition-all resize-none"
            ></textarea>
          </div>

          {/* Drag & Drop Zone */}
          <div className="border-2 border-dashed border-[#46178f]/40 bg-purple-50/50 rounded-2xl p-4 md:p-6 text-center transition-colors">
            <input 
              type="file" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="*/*" 
              multiple
            />
            <CloudUpload size={32} className="text-[#46178f] mx-auto mb-2 cursor-pointer" onClick={() => fileInputRef.current?.click()} />
            
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
                  className="bg-[#1368ce] hover:bg-[#0f56b0] text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors inline-block shadow-sm"
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

          {/* PIN Code Field - removed for security */}

        </div>

        {/* Footer Buttons */}
        <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-200 transition-colors">
            إلغاء
          </button>
          {/* Kahoot style button with bottom border for depth */}
          <button 
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`px-8 py-3 rounded-xl font-bold text-white flex items-center gap-2 transition-all ${
              isSubmitting 
                ? "bg-gray-400 cursor-not-allowed" 
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