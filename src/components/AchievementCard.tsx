"use client";
// src/components/AchievementCard.tsx
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Paperclip, Pencil, Clock, Trophy, Medal, Award, Trash2, Video } from 'lucide-react';
import { doc, deleteDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { db } from '../lib/firebase';
import AddAchievementModal from './AddAchievementModal';


const isVideoUrl = (url: string) => {
  if (!url) return false;
  if (url.match(/\.(mp4|webm|mov|ogg|avi|flv|mkv)/i)) return true;
  return url.includes('/video/upload/');
};

const getBadge = (score: number | null) => {
  if (score === null) return { icon: <Clock size={20} className="text-gray-400" />, text: "Pending", style: "bg-gray-100 text-gray-500 border-gray-200" };
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    setIsAdmin(localStorage.getItem('isAdmin') === 'true');
  }, []);

  const handlePinSubmit = () => {
    if (pinInput === data.pin) {
      setShowPinPrompt(false);
      setShowEditModal(true);
      setPinInput('');
      setPinError('');
    } else {
      setPinError('رمز الحماية غير صحيح!');
    }
  };

  const handleDeleteClick = async (id: string) => {
    if (confirm("هل أنت متأكد من حذف هذا الإنجاز بشكل نهائي؟ لا يمكن التراجع عن هذه الخطوة.")) {
      try {
        await deleteDoc(doc(db, "achievements", id));
        alert("تم حذف الإنجاز بنجاح! 🗑️");
      } catch (error) {
        console.error("Error deleting document:", error);
        alert("حدث خطأ أثناء الحذف.");
      }
    }
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
          {showPinPrompt && (
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
          <AddAchievementModal 
            isOpen={showEditModal} 
            onClose={() => setShowEditModal(false)} 
            initialData={data} 
            docId={data.id} 
          />
        </>,
        document.body
      )}
    </div>
  );
}