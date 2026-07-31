// src/app/settings/page.tsx
"use client";
import { useState, useEffect } from 'react';
import { Settings, Building, Phone, User, UploadCloud, Save, Loader2, Image as ImageIcon, Trash2, Users, BookOpen, ShieldCheck, Sparkles, Award } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAdmin } from '../../lib/useAdmin';

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

  const [activeTab, setActiveTab] = useState<'general' | 'leadership' | 'lists' | 'security'>('general');
  const [newDept, setNewDept] = useState('');
  const [newTeacher, setNewTeacher] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: string, message: string } | null>(null);
  
  const { isAdmin, loading: adminLoading } = useAdmin();
  const router = useRouter();

  useEffect(() => {
    if (!isAdmin && !adminLoading) {
      router.replace('/');
      return;
    }
  }, [isAdmin, adminLoading, router]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
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

      if (selectedFile) {
        const cloudData = new FormData();
        cloudData.append("file", selectedFile);
        const uploadRes = await fetch('/api/upload', { method: "POST", body: cloudData });
        const cloudResponseData = await uploadRes.json();
        
        if (cloudResponseData.secure_url) {
          finalLogoUrl = cloudResponseData.secure_url;
        } else {
          throw new Error("Failed to upload logo.");
        }
      }

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

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalData),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'فشل حفظ الإعدادات');
      }

      setNotification({ type: "success", message: "تم حفظ الإعدادات بنجاح! ✅" });
      setSelectedFile(null);
      setFormData(finalData);
    } catch (error) {
      console.error("Error saving settings:", error);
      setNotification({ type: "error", message: "حدث خطأ أثناء حفظ البيانات." });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-28">
        <Loader2 className="animate-spin mb-4 text-[#ffb800]" size={48} />
        <p className="font-black text-lg text-white">جاري التحميل...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-16 max-w-4xl mx-auto">
      
      {/* Notification Banner */}
      {notification && (
        <div className={`fixed top-4 right-4 left-4 md:left-auto md:right-4 md:w-96 z-[100] p-4 rounded-2xl shadow-2xl font-black text-white animate-in slide-in-from-top-2 duration-300 border-4 border-white/20 ${
          notification.type === "success" ? "bg-[#26890c]" : "bg-[#eb1f36]"
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-xl">{notification.type === "success" ? "🎉" : "⚠️"}</span>
            <span className="flex-1">{notification.message}</span>
            <button onClick={() => setNotification(null)} className="text-white/80 hover:text-white text-lg">✕</button>
          </div>
        </div>
      )}
      
      {/* Kahoot Header Card */}
      <div className="bg-gradient-to-r from-[#46178f] to-[#7b2cbf] text-white rounded-3xl p-8 shadow-xl border-b-8 border-[#321067] flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="bg-white/10 p-4 rounded-2xl border-2 border-white/20 backdrop-blur-md">
            <Settings className="text-[#ffb800] animate-spin-slow" size={38} />
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-wide">لوحة التحكم والإعدادات</h2>
            <p className="text-purple-200 font-bold mt-1 text-sm">تخصيص بيانات الهوية، الهيكلة الإدارية، وإعدادات النظام.</p>
          </div>
        </div>
        
        {/* Quick Save Header Button */}
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className={`w-full md:w-auto px-6 py-4 rounded-2xl font-black text-white flex items-center justify-center gap-3 transition-all transform hover:-translate-y-0.5 shadow-lg ${
            isSaving 
              ? "bg-gray-500 cursor-not-allowed" 
              : "bg-[#26890c] hover:bg-[#20730a] border-b-4 border-[#165406] active:border-b-0 active:translate-y-1"
          }`}
        >
          {isSaving ? <Loader2 className="animate-spin" size={22} /> : <><Save size={22} /> حفظ التغييرات</>}
        </button>
      </div>

      {/* Horizontal Tabs Navigation (Kahoot Style Pills) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white/80 backdrop-blur-md p-2.5 rounded-3xl shadow-md border-2 border-purple-100">
        <button
          onClick={() => setActiveTab('general')}
          className={`py-3 px-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 ${
            activeTab === 'general'
              ? 'bg-[#0087ed] text-white shadow-md scale-[1.02] border-b-4 border-[#005fa3]'
              : 'text-gray-600 hover:bg-purple-50'
          }`}
        >
          <Building size={18} /> الهوية العامة
        </button>
        <button
          onClick={() => setActiveTab('leadership')}
          className={`py-3 px-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 ${
            activeTab === 'leadership'
              ? 'bg-[#ffb800] text-gray-900 shadow-md scale-[1.02] border-b-4 border-[#cc9400]'
              : 'text-gray-600 hover:bg-purple-50'
          }`}
        >
          <User size={18} /> القيادة والرؤية
        </button>
        <button
          onClick={() => setActiveTab('lists')}
          className={`py-3 px-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 ${
            activeTab === 'lists'
              ? 'bg-[#26890c] text-white shadow-md scale-[1.02] border-b-4 border-[#1b6108]'
              : 'text-gray-600 hover:bg-purple-50'
          }`}
        >
          <Users size={18} /> الأقسام والمعلمات
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`py-3 px-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 ${
            activeTab === 'security'
              ? 'bg-[#eb1f36] text-white shadow-md scale-[1.02] border-b-4 border-[#b51427]'
              : 'text-gray-600 hover:bg-purple-50'
          }`}
        >
          <ShieldCheck size={18} /> رمز الأمان
        </button>
      </div>

      {/* Dynamic Content Panel */}
      <div className="bg-white rounded-3xl shadow-xl border-2 border-purple-100 p-8 transition-all">
        
        {/* Tab 1: General Info & Logo */}
        {activeTab === 'general' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className="border-b-2 border-purple-50 pb-6 flex items-center gap-3">
              <span className="p-3 bg-blue-50 text-[#0087ed] rounded-2xl"><Building size={24} /></span>
              <div>
                <h3 className="text-xl font-black text-gray-800">معلومات الهوية والشعار</h3>
                <p className="text-sm font-bold text-gray-400">اسم المدرسة، بيانات الاتصال، وشعار العرض الرسمي.</p>
              </div>
            </div>

            {/* Logo Section */}
            <div className="flex flex-col sm:flex-row gap-6 items-center bg-blue-50/40 p-6 rounded-2xl border-2 border-blue-100">
              <div className="w-32 h-32 rounded-2xl border-4 border-white shadow-md flex items-center justify-center bg-white overflow-hidden shrink-0 relative">
                {selectedFile ? (
                  <img src={URL.createObjectURL(selectedFile)} alt="Logo Preview" className="w-full h-full object-cover" />
                ) : formData.logoUrl ? (
                  <img src={formData.logoUrl} alt="School Logo" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon size={40} className="text-gray-300" />
                )}
              </div>
              <div className="flex-1 text-center sm:text-right">
                <h4 className="font-black text-gray-800 text-base mb-1">شعار المدرسة الرسمي</h4>
                <p className="text-xs text-gray-500 font-bold mb-4">يفضل استخدام صيغة PNG بخلفية شفافة.</p>
                <label className="inline-flex items-center gap-2 bg-[#0087ed] text-white hover:bg-[#0073cc] px-5 py-3 rounded-xl font-black cursor-pointer transition-all shadow-md">
                  <UploadCloud size={18} />
                  {selectedFile ? selectedFile.name : "اختر شعاراً جديداً"}
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                  />
                </label>
              </div>
            </div>

            {/* General Text Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-black text-gray-700 flex items-center gap-2">اسم المدرسة</label>
                <input 
                  type="text" 
                  value={formData.schoolName}
                  onChange={(e) => setFormData({...formData, schoolName: e.target.value})}
                  placeholder="مثال: مدرسة الأجيال" 
                  className="w-full bg-gray-50 border-2 border-purple-100 rounded-2xl p-4 font-bold focus:ring-4 focus:ring-purple-200 focus:border-[#46178f] outline-none transition-all" 
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-black text-gray-700 flex items-center gap-2">رقم الهاتف</label>
                <input 
                  type="text" 
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  placeholder="مثال: 05xxxxxxx" 
                  className="w-full bg-gray-50 border-2 border-purple-100 rounded-2xl p-4 font-bold focus:ring-4 focus:ring-purple-200 focus:border-[#46178f] outline-none transition-all" 
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-black text-gray-700 flex items-center gap-2">العنوان بالتفصيل</label>
                <input 
                  type="text" 
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  placeholder="المدينة، الحي، الشارع..." 
                  className="w-full bg-gray-50 border-2 border-purple-100 rounded-2xl p-4 font-bold focus:ring-4 focus:ring-purple-200 focus:border-[#46178f] outline-none transition-all" 
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Leadership & Vision */}
        {activeTab === 'leadership' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className="border-b-2 border-purple-50 pb-6 flex items-center gap-3">
              <span className="p-3 bg-amber-50 text-[#ffb800] rounded-2xl"><User size={24} /></span>
              <div>
                <h3 className="text-xl font-black text-gray-800">القيادة المدرسية والرؤية</h3>
                <p className="text-sm font-bold text-gray-400">أسماء القيادات الإدارية ورؤية ورسالة المدرسة.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-black text-gray-700">مديرة المدرسة</label>
                <input 
                  type="text" 
                  value={formData.managerName}
                  onChange={(e) => setFormData({...formData, managerName: e.target.value})}
                  placeholder="اسم المديرة" 
                  className="w-full bg-gray-50 border-2 border-purple-100 rounded-2xl p-4 font-bold focus:ring-4 focus:ring-purple-200 focus:border-[#46178f] outline-none transition-all" 
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-black text-gray-700">المديرة المساعدة ١</label>
                <input 
                  type="text" 
                  value={formData.viceManagerName}
                  onChange={(e) => setFormData({...formData, viceManagerName: e.target.value})}
                  placeholder="اسم المديرة المساعدة ١" 
                  className="w-full bg-gray-50 border-2 border-purple-100 rounded-2xl p-4 font-bold focus:ring-4 focus:ring-purple-200 focus:border-[#46178f] outline-none transition-all" 
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-black text-gray-700">المديرة المساعدة ٢</label>
                <input 
                  type="text" 
                  value={formData.assistantManager2}
                  onChange={(e) => setFormData({...formData, assistantManager2: e.target.value})}
                  placeholder="اسم المديرة المساعدة ٢" 
                  className="w-full bg-gray-50 border-2 border-purple-100 rounded-2xl p-4 font-bold focus:ring-4 focus:ring-purple-200 focus:border-[#46178f] outline-none transition-all" 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-black text-gray-700 flex items-center gap-2"><Sparkles size={16} className="text-[#ffb800]" /> رؤية المدرسة</label>
                <textarea 
                  rows={3}
                  value={formData.vision}
                  onChange={(e) => setFormData({...formData, vision: e.target.value})}
                  placeholder="اكتب رؤية المدرسة هنا..."
                  className="w-full bg-gray-50 border-2 border-purple-100 rounded-2xl p-4 font-bold focus:ring-4 focus:ring-purple-200 focus:border-[#46178f] outline-none transition-all resize-none" 
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-black text-gray-700 flex items-center gap-2"><Award size={16} className="text-[#26890c]" /> رسالة المدرسة</label>
                <textarea 
                  rows={3}
                  value={formData.message}
                  onChange={(e) => setFormData({...formData, message: e.target.value})}
                  placeholder="اكتب رسالة المدرسة هنا..."
                  className="w-full bg-gray-50 border-2 border-purple-100 rounded-2xl p-4 font-bold focus:ring-4 focus:ring-purple-200 focus:border-[#46178f] outline-none transition-all resize-none" 
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Departments & Teachers */}
        {activeTab === 'lists' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className="border-b-2 border-purple-50 pb-6 flex items-center gap-3">
              <span className="p-3 bg-emerald-50 text-[#26890c] rounded-2xl"><Users size={24} /></span>
              <div>
                <h3 className="text-xl font-black text-gray-800">إدارة الأقسام والمعلمات</h3>
                <p className="text-sm font-bold text-gray-400">إضافة أو حذف الأقسام الدراسية وقائمة المعلمات.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Departments Management */}
              <div className="bg-purple-50/30 p-6 rounded-3xl border-2 border-purple-100 min-w-0">
                <h4 className="font-black text-gray-800 mb-4 flex items-center gap-2"><BookOpen size={18} className="text-[#0087ed]" /> الأقسام الدراسية</h4>
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
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
                    className="w-full sm:flex-1 min-w-0 bg-white border-2 border-purple-100 rounded-2xl p-3 font-bold focus:ring-4 focus:ring-purple-200 focus:border-[#46178f] outline-none text-sm" 
                  />
                  <button type="button" onClick={() => { if(newDept.trim() && !formData.departments.includes(newDept.trim())) { setFormData({...formData, departments: [...formData.departments, newDept.trim()]}); setNewDept(''); } }} className="shrink-0 w-full sm:w-auto bg-[#0087ed] text-white px-5 py-2.5 rounded-2xl font-black hover:bg-[#0073cc] transition-all shadow-md">إضافة</button>
                </div>
                <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto p-2 border-2 border-dashed border-purple-200 rounded-2xl bg-white">
                  {formData.departments.map(dept => (
                    <span key={dept} className="bg-purple-50 border-2 border-purple-200 text-gray-700 text-sm font-black px-3 py-2 rounded-xl flex items-center gap-2 shadow-sm">
                      {dept}
                      <button type="button" onClick={() => setFormData({...formData, departments: formData.departments.filter(d => d !== dept)})} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
                    </span>
                  ))}
                  {formData.departments.length === 0 && <p className="text-xs text-gray-400 p-3 font-bold">لا توجد أقسام مضافة.</p>}
                </div>
              </div>

              {/* Teachers Management */}
              <div className="bg-purple-50/30 p-6 rounded-3xl border-2 border-purple-100 min-w-0">
                <h4 className="font-black text-gray-800 mb-4 flex items-center gap-2"><Users size={18} className="text-[#26890c]" /> قائمة المعلمات</h4>
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
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
                    className="w-full sm:flex-1 min-w-0 bg-white border-2 border-purple-100 rounded-2xl p-3 font-bold focus:ring-4 focus:ring-purple-200 focus:border-[#46178f] outline-none text-sm" 
                  />
                  <button type="button" onClick={() => { if(newTeacher.trim() && !formData.teachers.includes(newTeacher.trim())) { setFormData({...formData, teachers: [...formData.teachers, newTeacher.trim()]}); setNewTeacher(''); } }} className="shrink-0 w-full sm:w-auto bg-[#26890c] text-white px-5 py-2.5 rounded-2xl font-black hover:bg-[#20730a] transition-all shadow-md">إضافة</button>
                </div>
                <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto p-2 border-2 border-dashed border-purple-200 rounded-2xl bg-white">
                  {formData.teachers.map(teacher => (
                    <span key={teacher} className="bg-emerald-50 border-2 border-emerald-200 text-gray-700 text-sm font-black px-3 py-2 rounded-xl flex items-center gap-2 shadow-sm">
                      {teacher}
                      <button type="button" onClick={() => setFormData({...formData, teachers: formData.teachers.filter(t => t !== teacher)})} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
                    </span>
                  ))}
                  {formData.teachers.length === 0 && <p className="text-xs text-gray-400 p-3 font-bold">لا يوجد معلمون مضافون حالياً.</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Security PIN */}
        {activeTab === 'security' && (
          <div className="space-y-6 animate-in fade-in duration-300 max-w-lg">
            <div className="border-b-2 border-purple-50 pb-6 flex items-center gap-3">
              <span className="p-3 bg-red-50 text-[#eb1f36] rounded-2xl"><ShieldCheck size={24} /></span>
              <div>
                <h3 className="text-xl font-black text-gray-800">رمز الدخول الإداري</h3>
                <p className="text-sm font-bold text-gray-400">إعداد رمز PIN الخاص بلوحة الإدارة.</p>
              </div>
            </div>

            <div className="bg-red-50/40 p-6 rounded-3xl border-2 border-red-100 space-y-4">
              <label className="text-sm font-black text-gray-700">رمز PIN المكون من 4 أرقام</label>
              <input 
                type="password" 
                maxLength={4}
                value={formData.adminPin}
                onChange={(e) => setFormData({...formData, adminPin: e.target.value})}
                placeholder="****" 
                className="w-full bg-white border-2 border-red-200 rounded-2xl p-4 focus:ring-4 focus:ring-red-200 outline-none transition-all tracking-[1em] text-center font-mono font-black text-2xl" 
              />
              <p className="text-xs text-gray-500 font-bold leading-relaxed">
                ⚠️ احرص على حفظ هذا الرقم سراً، حيث يتم استخدامه لتأكيد صلاحية الدخول للوحة التحكم.
              </p>
            </div>
          </div>
        )}

        {/* Footer Bottom Save Bar */}
        <div className="border-t-2 border-purple-50 mt-10 pt-6 flex justify-end">
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className={`px-8 py-4 rounded-2xl font-black text-white flex items-center gap-3 transition-all shadow-lg ${
              isSaving 
                ? "bg-gray-400 cursor-not-allowed" 
                : "bg-[#26890c] hover:bg-[#20730a] border-b-4 border-[#165406] active:border-b-0 active:translate-y-1"
            }`}
          >
            {isSaving ? <Loader2 className="animate-spin" size={22} /> : <><Save size={22} /> حفظ التغييرات الآن</>}
          </button>
        </div>

      </div>
    </div>
  );
}
