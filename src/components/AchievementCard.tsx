"use client";

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Paperclip, Pencil, Clock, Trophy, Medal, Award, Trash2, Video, CheckCircle2 } from 'lucide-react';
// Firebase imports removed — all writes go through API
import { useRouter } from 'next/navigation';
import { useAdmin } from '../lib/useAdmin';
import AddAchievementModal from './AddAchievementModal';


const isVideoUrl = (url: string) => {
  if (!url) return false;
  if (url.match(/\.(mp4|webm|mov|ogg|avi|flv|mkv)/i)) return true;
  return url.includes('/video/upload/');
};

const getBadge = (score: number | null) => {
  if (score === null) return { icon: <CheckCircle2 size={20} className="text-green-500" />, text: "معتمد", style: "bg-green-50 text-green-700 border-green-200" };
  if (score >= 90) return { icon: <Trophy size={20} className="text-yellow-500" />, text: "Gold", style: "bg-yellow-50 text-yellow-700 border-yellow-200" };
  if (score >= 75) return { icon: <Medal size={20} className="text-gray-400" />, text: "Silver", style: "bg-gray-50 text-gray-700 border-gray-300" };
  return { icon: <Award size={20} className="text-orange-400" />, text: "Bronze", style: "bg-orange-50 text-orange-700 border-orange-200" };
};

export default function AchievementCard({ data }: { data: any }) {
  const badge = getBadge(data.score);
  const [mounted, setMounted] = useState(false);
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifiedPin, setVerifiedPin] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const { isAdmin } = useAdmin();
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: string, message: string } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-dismiss notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handlePinSubmit = async () => {
    try {
      const res = await fetch('/api/pin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ achievementId: data.id, pin: pinInput }),
      });
      const result = await res.json();
      
      if (result.valid) {
        setVerifiedPin(pinInput);
        setShowPinPrompt(false);
        setShowEditModal(true);
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
      const res = await fetch(`/api/achievements/${pendingDeleteId}`, { method: 'DELETE' });
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
    <div 
      onClick={() => router.push(`/achievement/${data.id}`)}
      className="group bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg border border-purple-100/50 overflow-hidden relative cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-xl w-full max-w-full"
    >
      <div className={`h-2 w-full ${data.deptColor}`}></div>
      
      <div className="p-4 md:p-5">
        <div className="flex justify-between items-start mb-3 md:mb-4">
          <div>
            <h4 className="font-bold text-[#46178f] text-base md:text-lg">{data.teacherName}</h4>
            <span className="inline-block px-3 py-1 bg-purple-50 text-[#46178f] text-xs rounded-full mt-1 font-bold">
              {data.department}
            </span>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <button 
                onClick={(e) => { e.stopPropagation(); handleDeleteClick(data.id); }} 
                className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                title="حذف الإنجاز"
              >
                <Trash2 size={18} />
              </button>
            )}
            <button 
              onClick={(e) => { e.stopPropagation(); if (isAdmin) { setShowEditModal(true); } else { setShowPinPrompt(true); } }} 
              className="text-gray-400 hover:text-[#1368ce] opacity-0 group-hover:opacity-100 transition-opacity"
              title="تعديل الإنجاز"
            >
              <Pencil size={18} />
            </button>
          </div>
        </div>

        <div className="mb-6">
          <h5 className="font-bold text-gray-800 mb-2">{data.title}</h5>
          <p className="text-sm text-gray-500 leading-relaxed line-clamp-2">{data.desc}</p>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${badge.style}`}>
            {badge.icon}
            <span className="text-xs font-bold">{badge.text}</span>
          </div>
          <div className="flex items-center gap-3 text-gray-400">
            {data.attachmentUrls && data.attachmentUrls.length > 0 ? (
              data.attachmentUrls.map((url: string, index: number) => (
              <a key={index} href={url} onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer" className="text-[#1368ce] hover:text-[#46178f] transition-colors" title={`مرفق ${index + 1}`}>
                  {isVideoUrl(url) ? <Video size={18} /> : <Paperclip size={18} />}
                </a>
              ))
            ) : data.attachmentUrl ? (
            <a href={data.attachmentUrl} onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer" className="text-[#1368ce] hover:text-[#46178f] transition-colors">
                {isVideoUrl(data.attachmentUrl) ? <Video size={18} /> : <Paperclip size={18} />}
              </a>
            ) : (
            <button onClick={(e) => e.stopPropagation()} className="hover:text-[#46178f] transition-colors"><Paperclip size={18} /></button>
            )}
            <div className="flex items-center gap-1 text-xs"><Calendar size={14} /> {data.date}</div>
          </div>
        </div>
      </div>

      {mounted && createPortal(
        <>
          {showPinPrompt && !isAdmin && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] animate-in fade-in duration-200">
              <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full mx-4 text-center animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-black text-[#46178f] mb-2">تعديل الإنجاز ✏️</h3>
                <p className="text-sm text-gray-500 mb-6">الرجاء إدخال رمز الحماية (PIN) الخاص بهذا الإنجاز لتتمكن من تعديله.</p>
                
                <input 
                  type="password"
                  maxLength={4}
                  value={pinInput} 
                  onChange={e => setPinInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
                  placeholder="****"
                  className={`w-full text-center tracking-[1em] font-mono font-bold text-2xl bg-gray-50 border-2 rounded-xl p-3 outline-none transition-all ${pinError ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-100' : 'border-gray-200 focus:border-orange-400 focus:ring-4 focus:ring-orange-100'}`}
                />
                {pinError && <p className="text-red-500 font-bold text-sm mt-3 animate-in slide-in-from-top-1">{pinError}</p>}
                
                <div className="flex gap-3 mt-6">
                  <button onClick={() => { setShowPinPrompt(false); setPinError(''); setPinInput(''); }} className="flex-1 py-3 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">إلغاء</button>
                  <button onClick={handlePinSubmit} className="flex-1 py-3 rounded-xl font-bold text-white bg-orange-500 hover:bg-orange-600 border-b-4 border-orange-700 active:border-b-0 active:translate-y-1 transition-all">تأكيد</button>
                </div>
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
                  <button onClick={() => { setShowConfirm(false); setPendingDeleteId(null); }} className="flex-1 py-3 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">إلغاء</button>
                  <button onClick={handleConfirmDelete} className="flex-1 py-3 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 transition-colors">حذف</button>
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
          <AddAchievementModal 
            isOpen={showEditModal} 
            onClose={() => setShowEditModal(false)} 
            initialData={data} 
            docId={data.id} 
            verifiedPin={verifiedPin} 
          />
        </>,
        document.body
      )}
    </div>
  );
}
