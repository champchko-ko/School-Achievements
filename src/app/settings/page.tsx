// src/app/settings/page.tsx
"use client";
import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Settings, Building, Phone, User, UploadCloud, Save, Loader2, Image as ImageIcon, Trash2, Users, BookOpen, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const [formData, setFormData] = useState<{
    schoolName: string;
    managerName: string;
    viceManagerName: string;
    assistantManager2: string;
    vision: string;
    message: string;
    address: string;
    phone: string;
    logoUrl: string;
    departments: string[];
    teachers: string[];
    adminPin: string;
  }>({
    schoolName: '',
    managerName: '',
    viceManagerName: '',
    assistantManager2: '',
    vision: '',
    message: '',
    address: '',
    phone: '',
    logoUrl: '',
    departments: ['الرياضيات', 'العلوم', 'اللغة العربية', 'الحاسب الآلي', 'التربية البدنية'],
    teachers: [],
    adminPin: ""
  });

  const [newDept, setNewDept] = useState('');
  const [newTeacher, setNewTeacher] = useState('');
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: string, message: string } | null>(null);
  const router = useRouter();

  // Auto-dismiss notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Load existing settings on page load
  useEffect(() => {
    if (localStorage.getItem('isAdmin') !== 'true') {
      router.replace('/');
      return;
    }

    const fetchSettings = async () => {
      try {
        const docRef = doc(db, "settings", "global_info");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setFormData(prev => ({
            ...prev,
            ...data,
            departments: data.departments || prev.departments,
            teachers: data.teachers || prev.teachers
          }));
        }
      } catch (error) {
        console.error("Error loading settings:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let finalLogoUrl = formData.logoUrl;

      // 1. Upload new logo to Cloudinary if a new file was selected
      if (selectedFile) {
        const cloudData = new FormData();
        cloudData.append("file", selectedFile);
        cloudData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET as string);

        const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
        const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
          method: "POST",
          body: cloudData,
        });

        const cloudResponseData = await uploadRes.json();
        
        if (cloudResponseData.secure_url) {
          finalLogoUrl = cloudResponseData.secure_url;
        } else {
          throw new Error("Failed to upload logo.");
        }
      }

      // Automatically capture anything left typed in the inputs if they forgot to click 'Add'
      const finalDepartments = [...formData.departments];
      if (newDept.trim() && !finalDepartments.includes(newDept.trim())) {
        finalDepartments.push(newDept.trim());
        setNewDept('');
      }

      const finalTeachers = [...formData.teachers];
      if (newTeacher.trim() && !finalTeachers.includes(newTeacher.trim())) {
        finalTeachers.push(newTeacher.trim());
        setNewTeacher('');
      }

      const finalData = {
        ...formData,
        departments: finalDepartments,
        teachers: finalTeachers,
        logoUrl: finalLogoUrl
      };

      // 2. Save all data to the single Firestore document
      const docRef = doc(db, "settings", "global_info");
      await setDoc(docRef, finalData, { merge: true }); // Merge ensures we don't accidentally delete fields we didn't update

      setNotification({ type: "success", message: "تم حفظ الإعدادات بنجاح! ✅" });
      setSelectedFile(null); // Clear the file input
      setFormData(finalData); // Update UI with new logo and flush the lists
      
    } catch (error) {
      console.error("Error saving settings:", error);
      setNotification({ type: "error", message: "حدث خطأ أثناء حفظ البيانات." });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-purple-200">
        <Loader2 className="animate-spin mb-4 text-yellow-400" size={40} />
        <p className="font-bold text-purple-200">جاري تحميل إعدادات المدرسة...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10 max-w-4xl mx-auto">
      
      {/* Success/Error Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 left-4 md:left-auto md:right-4 md:w-96 z-[100] p-4 rounded-2xl shadow-2xl font-bold text-white animate-in slide-in-from-top-2 duration-300 ${
          notification.type === "success" ? "bg-[#26890c]" : "bg-red-500"
        }`}>
          <div className="flex items-center gap-3">
            <span>{notification.type === "success" ? "✅" : "❌"}</span>
            <span>{notification.message}</span>
            <button onClick={() => setNotification(null)} className="mr-auto text-white/70 hover:text-white">✕</button>
          </div>
        </div>
      )}
      
      {/* Header */}
      <div className="bg-white rounded-2xl p-8 shadow-lg border border-purple-100/50 flex items-center gap-4">
        <div className="bg-gray-100 p-4 rounded-xl">
          <Settings className="text-gray-700" size={32} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-[#46178f]">إعدادات المدرسة</h2>
          <p className="text-gray-500 font-bold mt-1">تحديث البيانات الأساسية والشعار الرسمي.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-purple-100/50 p-8 space-y-8">
        
        {/* Logo Upload Section */}
        <div className="flex flex-col md:flex-row gap-8 items-center border-b border-gray-100 pb-8">
          <div className="w-32 h-32 rounded-2xl border-4 border-gray-100 flex items-center justify-center bg-gray-50 overflow-hidden shrink-0 relative group">
            {selectedFile ? (
              <img src={URL.createObjectURL(selectedFile)} alt="New Logo Preview" className="w-full h-full object-cover" />
            ) : formData.logoUrl ? (
              <img src={formData.logoUrl} alt="School Logo" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon size={40} className="text-gray-300" />
            )}
          </div>
          
          <div className="flex-1 text-center md:text-right">
            <h3 className="text-lg font-black text-gray-800 mb-2">شعار المدرسة (Logo)</h3>
            <p className="text-sm text-gray-500 font-bold mb-4">يفضل أن تكون الصورة بخلفية شفافة (PNG) وبأبعاد متساوية.</p>
            <label className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 px-6 py-3 rounded-xl font-bold cursor-pointer transition-colors border border-blue-200">
              <UploadCloud size={20} />
              {selectedFile ? selectedFile.name : "تغيير الشعار"}
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
              />
            </label>
          </div>
        </div>

        {/* Text Fields Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-2"><Building size={16}/> اسم المدرسة</label>
            <input 
              type="text" 
              value={formData.schoolName}
              onChange={(e) => setFormData({...formData, schoolName: e.target.value})}
              placeholder="مثال: مدرسة الأجيال الأهلية" 
              className="w-full bg-gray-50 border border-purple-100 rounded-xl p-3 focus:ring-2 focus:ring-[#46178f] outline-none transition-all" 
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-2"><Phone size={16}/> رقم الهاتف المحمول / الأرضي</label>
            <input 
              type="text" 
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
              placeholder="مثال: 05xxxxxxx" 
              className="w-full bg-gray-50 border border-purple-100 rounded-xl p-3 focus:ring-2 focus:ring-[#46178f] outline-none transition-all" 
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-2"><User size={16}/> مديرة المدرسة</label>
            <input 
              type="text" 
              value={formData.managerName}
              onChange={(e) => setFormData({...formData, managerName: e.target.value})}
              placeholder="اسم المديرة" 
              className="w-full bg-gray-50 border border-purple-100 rounded-xl p-3 focus:ring-2 focus:ring-[#46178f] outline-none transition-all" 
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-2"><User size={16}/> المديرة المساعدة ١</label>
            <input 
              type="text" 
              value={formData.viceManagerName}
              onChange={(e) => setFormData({...formData, viceManagerName: e.target.value})}
              placeholder="اسم المديرة المساعدة ١" 
              className="w-full bg-gray-50 border border-purple-100 rounded-xl p-3 focus:ring-2 focus:ring-[#46178f] outline-none transition-all" 
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-2"><User size={16}/> المديرة المساعدة ٢</label>
            <input 
              type="text" 
              value={formData.assistantManager2}
              onChange={(e) => setFormData({...formData, assistantManager2: e.target.value})}
              placeholder="اسم المديرة المساعدة ٢" 
              className="w-full bg-gray-50 border border-purple-100 rounded-xl p-3 focus:ring-2 focus:ring-[#46178f] outline-none transition-all" 
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-2"><BookOpen size={16}/> رؤية المدرسة</label>
            <textarea 
              rows={3}
              value={formData.vision}
              onChange={(e) => setFormData({...formData, vision: e.target.value})}
              placeholder="اكتب رؤية المدرسة هنا..."
              className="w-full bg-gray-50 border border-purple-100 rounded-xl p-3 focus:ring-2 focus:ring-[#46178f] outline-none transition-all resize-none" 
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-2"><BookOpen size={16}/> رسالة المدرسة</label>
            <textarea 
              rows={3}
              value={formData.message}
              onChange={(e) => setFormData({...formData, message: e.target.value})}
              placeholder="اكتب رسالة المدرسة هنا..."
              className="w-full bg-gray-50 border border-purple-100 rounded-xl p-3 focus:ring-2 focus:ring-[#46178f] outline-none transition-all resize-none" 
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-bold text-gray-700">العنوان بالتفصيل</label>
            <input 
              type="text" 
              value={formData.address}
              onChange={(e) => setFormData({...formData, address: e.target.value})}
              placeholder="المدينة، الحي، الشارع..." 
              className="w-full bg-gray-50 border border-purple-100 rounded-xl p-3 focus:ring-2 focus:ring-[#46178f] outline-none transition-all" 
            />
          </div>
        </div>

        {/* Admin PIN */}
        <div className="border-t border-gray-100 pt-8 mt-8">
          <div className="max-w-sm">
            <h3 className="text-lg font-black text-gray-800 mb-4 flex items-center gap-2"><ShieldCheck size={20} className="text-[#ff6b00]" /> رمز الدخول الإداري</h3>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">رمز PIN المكون من 4 أرقام</label>
              <input 
                type="password" 
                maxLength={4}
                value={formData.adminPin}
                onChange={(e) => setFormData({...formData, adminPin: e.target.value})}
                placeholder="****" 
                className="w-full bg-gray-50 border border-purple-100 rounded-xl p-3 focus:ring-2 focus:ring-[#46178f] outline-none transition-all tracking-[1em] text-center font-mono font-bold text-xl" 
              />
              <p className="text-xs text-gray-400 font-bold">استخدم هذا الرقم عند النقر على "دخول الإدارة" من القائمة الجانبية.</p>
            </div>
          </div>
        </div>

        {/* Dynamic Lists Management */}
        <div className="border-t border-gray-100 pt-8 mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Departments */}
          <div>
            <h3 className="text-lg font-black text-gray-800 mb-4 flex items-center gap-2"><BookOpen size={20} className="text-[#0087ed]" /> إدارة الأقسام</h3>
            <div className="flex gap-2 mb-4">
              <input 
                type="text" 
                value={newDept} 
                onChange={e => setNewDept(e.target.value)} 
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (newDept.trim() && !formData.departments.includes(newDept.trim())) {
                      setFormData(prev => ({...prev, departments: [...prev.departments, newDept.trim()]}));
                      setNewDept('');
                    }
                  }
                }}
                placeholder="اسم القسم الجديد" 
                className="flex-1 bg-gray-50 border border-purple-100 rounded-xl p-3 focus:ring-2 focus:ring-[#46178f] outline-none transition-all text-sm" 
              />
              <button type="button" onClick={() => { if(newDept.trim() && !formData.departments.includes(newDept.trim())) { setFormData({...formData, departments: [...formData.departments, newDept.trim()]}); setNewDept(''); } }} className="bg-[#0087ed] text-white px-4 py-2 rounded-xl font-bold hover:bg-[#0073cc] transition-colors whitespace-nowrap">إضافة</button>
            </div>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 border border-purple-100 rounded-xl bg-purple-50/50">
              {formData.departments.map(dept => (
                <span key={dept} className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-sm">
                  {dept}
                  <button type="button" onClick={() => setFormData({...formData, departments: formData.departments.filter(d => d !== dept)})} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
                </span>
              ))}
              {formData.departments.length === 0 && <p className="text-xs text-gray-400 p-2">لا توجد أقسام مضافة.</p>}
            </div>
          </div>

          {/* Teachers */}
          <div>
            <h3 className="text-lg font-black text-gray-800 mb-4 flex items-center gap-2"><Users size={20} className="text-[#26890c]" /> إدارة المعلمات</h3>
            <div className="flex gap-2 mb-4">
              <input 
                type="text" 
                value={newTeacher} 
                onChange={e => setNewTeacher(e.target.value)} 
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (newTeacher.trim() && !formData.teachers.includes(newTeacher.trim())) {
                      setFormData(prev => ({...prev, teachers: [...prev.teachers, newTeacher.trim()]}));
                      setNewTeacher('');
                    }
                  }
                }}
                placeholder="اسم المعلمة الجديدة" 
                className="flex-1 bg-gray-50 border border-purple-100 rounded-xl p-3 focus:ring-2 focus:ring-[#46178f] outline-none transition-all text-sm" 
              />
              <button type="button" onClick={() => { if(newTeacher.trim() && !formData.teachers.includes(newTeacher.trim())) { setFormData({...formData, teachers: [...formData.teachers, newTeacher.trim()]}); setNewTeacher(''); } }} className="bg-[#26890c] text-white px-4 py-2 rounded-xl font-bold hover:bg-[#20730a] transition-colors whitespace-nowrap">إضافة</button>
            </div>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 border border-purple-100 rounded-xl bg-purple-50/50">
              {formData.teachers.map(teacher => (
                <span key={teacher} className="bg-white border border-gray-200 text-gray-700 text-sm font-bold px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-sm">
                  {teacher}
                  <button type="button" onClick={() => setFormData({...formData, teachers: formData.teachers.filter(t => t !== teacher)})} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
                </span>
              ))}
              {formData.teachers.length === 0 && <p className="text-xs text-gray-400 p-2">لا يوجد معلمون مضافون. سيتم استخدام الإدخال اليدوي في إضافة إنجاز.</p>}
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-4 flex justify-end">
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className={`px-8 py-3 rounded-xl font-bold text-white flex items-center gap-2 transition-all ${
              isSaving 
                ? "bg-gray-400 cursor-not-allowed" 
                : "bg-[#26890c] hover:bg-[#20730a] border-b-4 border-[#165406] active:border-b-0 active:translate-y-1"
            }`}
          >
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <><Save size={20} /> حفظ الإعدادات</>}
          </button>
        </div>

      </div>
    </div>
  );
}