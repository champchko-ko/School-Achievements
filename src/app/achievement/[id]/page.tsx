"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { ArrowRight, Clock, Trophy, Medal, Award, Loader2, DownloadCloud, Image as ImageIcon, User, Building, Calendar, FileText, X, Printer, Video, PlayCircle, Trash2, Lock } from "lucide-react";
import { btn, card, toast } from "../../../lib/ui";
import { useAdmin } from "../../../lib/useAdmin";

const getScoreBadge = (score: number | null | undefined) => {
  if (score === null || score === undefined) return <span className="bg-gray-100 text-gray-500 px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 w-fit"><Clock size={16} /> قيد المراجعة</span>;
  if (score >= 90) return <span className="bg-yellow-100 text-yellow-700 px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 w-fit"><Trophy size={16} /> {score} ذهبي</span>;
  if (score >= 80) return <span className="bg-gray-200 text-gray-700 px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 w-fit"><Medal size={16} /> {score} فضي</span>;
  return <span className="bg-orange-100 text-orange-700 px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 w-fit"><Award size={16} /> {score} برونزي</span>;
};

const isImageField = (url: string) => {
  if (!url) return false;
  // Check standard extensions
  if (url.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp)/i)) return true;
  // Cloudinary specific check (if it's in the /image/upload path and NOT a pdf)
  if (url.includes('/image/upload/') && !url.toLowerCase().endsWith('.pdf')) return true;
  return false;
};

const isVideoField = (url: string) => {
  if (!url) return false;
  // Check for common video extensions
  if (url.match(/\.(mp4|webm|mov|ogg|avi|flv|mkv|m3u8)/i)) return true;
  // Cloudinary specific check for videos
  return url.includes('/video/upload/');
};

const getFileName = (url: string) => {
  try {
    const decoded = decodeURIComponent(url);
    const nameWithExt = decoded.split('/').pop()?.split('?')[0];
    return nameWithExt || "ملف_مرفق";
  } catch {
    return "ملف_مرفق";
  }
};

const getDownloadUrl = (url: string) => {
  // Adds 'fl_attachment' to Cloudinary URLs to force the browser to securely download the file 
  // instead of opening it inline, which prevents 401 Unauthorized preview errors.
  if (url.includes('cloudinary.com') && url.includes('/upload/')) {
    return url.replace('/upload/', '/upload/fl_attachment/');
  }
  return url;
};

export default function AchievementDetailsPage() {
  const { id } = useParams();
  const router = useRouter();
  
  const [achievement, setAchievement] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [verifiedPin, setVerifiedPin] = useState('');
  const [pendingRemoveUrl, setPendingRemoveUrl] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ url: string; name: string; type: string; bytes: number; formatted: string } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [showRemoveAllConfirm, setShowRemoveAllConfirm] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [schoolSettings, setSchoolSettings] = useState<any>(null);

  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  const canManage = !adminLoading && (isAdmin || verifiedPin !== '');

  const openRemoveConfirm = async (url: string) => {
    const type = isImageField(url) ? 'image' : isVideoField(url) ? 'video' : 'document';
    let meta = { url, name: getFileName(url), type, bytes: 0, formatted: '' };
    if (isAdmin) {
      try {
        const res = await fetch('/api/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'assets', urls: [url] }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.assets?.[0]) meta = { ...meta, ...data.assets[0] };
        }
      } catch (error) {
        console.error('Asset metadata error:', error);
      }
    }
    setRemoveTarget(meta);
  };

  const handleRemoveClick = (url: string) => {
    if (isAdmin || verifiedPin) {
      openRemoveConfirm(url);
    } else {
      setPendingRemoveUrl(url);
      setShowPinPrompt(true);
    }
  };

  const handlePinSubmit = async () => {
    try {
      const res = await fetch('/api/pin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ achievementId: id, pin: pinInput }),
      });
      const result = await res.json();
      if (result.valid) {
        setVerifiedPin(pinInput);
        setShowPinPrompt(false);
        setPinInput('');
        setPinError('');
        if (pendingRemoveUrl) {
          openRemoveConfirm(pendingRemoveUrl);
          setPendingRemoveUrl(null);
        }
      } else {
        setPinError('رمز الحماية غير صحيح!');
      }
    } catch (error) {
      console.error('PIN verification error:', error);
      setPinError('حدث خطأ في التحقق من الرمز');
    }
  };

  const handleConfirmRemove = async () => {
    if (!removeTarget) return;
    setIsRemoving(true);
    try {
      const allUrls = Array.from(new Set([
        ...(achievement.attachmentUrls || []),
        achievement.fileUrl,
        achievement.attachmentUrl,
      ].filter(Boolean))) as string[];
      const remaining = allUrls.filter(u => u !== removeTarget.url);
      const payload: any = { attachmentUrls: remaining };
      if (verifiedPin) payload.pin = verifiedPin;
      const res = await fetch(`/api/achievements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'فشل حذف الملف');
      }
      setAchievement((prev: any) => ({ ...prev, attachmentUrls: remaining }));
      setRemoveTarget(null);
      setToastMsg('تم حذف الملف نهائياً من التخزين السحابي. ✅');
    } catch (error: any) {
      console.error('Remove media error:', error);
      setToastMsg('حدث خطأ أثناء حذف الملف.');
    } finally {
      setIsRemoving(false);
    }
  };

  const handleRemoveAll = async () => {
    setIsRemoving(true);
    try {
      const payload: any = { attachmentUrls: [] };
      if (verifiedPin) payload.pin = verifiedPin;
      const res = await fetch(`/api/achievements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'فشل حذف المرفقات');
      }
      setAchievement((prev: any) => ({ ...prev, attachmentUrls: [] }));
      setShowRemoveAllConfirm(false);
      setToastMsg('تم حذف جميع المرفقات نهائياً من التخزين السحابي. ✅');
    } catch (error: any) {
      console.error('Remove all media error:', error);
      setToastMsg('حدث خطأ أثناء حذف المرفقات.');
    } finally {
      setIsRemoving(false);
    }
  };

  useEffect(() => {
    if (!id) {
      setError("معرف الإنجاز غير صالح.");
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchAchievement = async () => {
      try {
        const docRef = doc(db, "achievements", id as string);
        const docSnap = await getDoc(docRef);
        
        if (cancelled) return;

        if (docSnap.exists()) {
          const data: any = { id: docSnap.id, ...docSnap.data() };
          // Non-admins cannot view non-approved achievements
          if (data.status && data.status !== 'approved') {
            setError("هذا الإنجاز بانتظار المراجعة ولا يمكن عرضه حالياً.");
          } else {
            setAchievement(data);
          }
        } else {
          setError("لم يتم العثور على هذا الإنجاز.");
        }
      } catch (err) {
        console.error("Error fetching document:", err);
        if (!cancelled) setError("حدث خطأ أثناء تحميل البيانات. تحقق من اتصالك بالإنترنت.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchAchievement();

    // Fetch school settings for PDF header
    getDoc(doc(db, 'settings', 'global_info')).then(snap => {
      if (snap.exists()) setSchoolSettings(snap.data());
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-purple-100">
        <Loader2 className="animate-spin mb-4 text-[#ffb800]" size={48} />
        <p className="font-black text-lg">جاري تحميل تفاصيل الإنجاز...</p>
      </div>
    );
  }

  if (error || !achievement) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <div className={`${card} rounded-3xl p-8 text-center max-w-md`}>
          <FileText className="mx-auto text-purple-400 mb-4" size={48} />
          <h2 className="text-2xl font-black mb-2 text-gray-800">عذراً</h2>
          <p className="font-bold mb-6">{error}</p>
          <button onClick={() => router.back()} className={`${btn.green} w-full px-6 py-3`}>
            العودة للسابق
          </button>
        </div>
      </div>
    );
  }

  // Gather all attachments from different versions/formats
  const attachmentUrls: string[] = [];
  if (achievement.attachmentUrls && Array.isArray(achievement.attachmentUrls)) {
    attachmentUrls.push(...achievement.attachmentUrls);
  }
  if (achievement.fileUrl && !attachmentUrls.includes(achievement.fileUrl)) {
    attachmentUrls.push(achievement.fileUrl);
  }
  if (achievement.attachmentUrl && !attachmentUrls.includes(achievement.attachmentUrl)) {
    attachmentUrls.push(achievement.attachmentUrl);
  }

  const images = attachmentUrls.filter(isImageField).filter(Boolean);
  const videos = attachmentUrls.filter(isVideoField).filter(Boolean);
  const documents = attachmentUrls.filter(url => !isImageField(url) && !isVideoField(url)).filter(Boolean);

  const handlePrint = async () => {
    try {
      const { printReport, buildPrintAttachments } = await import('../../../lib/printPdf');
      const appUrl = window.location.origin + '/achievement/' + id;
      const attachments = buildPrintAttachments(attachmentUrls, appUrl);
      const descCell = { type: 'text' as const, text: achievement.desc || achievement.description || 'لا يوجد وصف' };
      const attachSection = attachments.length > 0 ? [{
        title: 'المرفقات',
        columns: ['المرفقات'],
        rows: [[{ type: 'achievement' as const, title: achievement.title || '', desc: '', items: attachments }]],
      }] : [];
      printReport({
        documentTitle: achievement.title || 'achievement',
        logoUrl: schoolSettings?.logoUrl,
        schoolName: schoolSettings?.schoolName,
        title: achievement.title || '',
        subtitle: (achievement.teacherName || 'غير محدد') + ' — ' + (achievement.department || 'غير محدد') + ' — ' + (achievement.date || ''),
        sections: [{
          title: 'وصف الإنجاز',
          columns: ['الوصف'],
          rows: [[descCell]],
        }, ...attachSection],
      });
    } catch (err) {
      console.error('PDF generation failed:', err);
      setToastMsg('فشل إنشاء ملف PDF. حاول مرة أخرى.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500 pb-16">
      
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { margin: 0.5cm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\:hidden { display: none !important; }
          .print\:bg-white { background-color: white !important; }
          .print\:border-none { border: none !important; }
          .print\:shadow-none { box-shadow: none !important; }
        }
      `}} />

      {/* Navigation / Actions */}
      <div className="flex justify-between items-center mb-2 print:hidden">
        <button 
          onClick={() => router.back()}
          className={`${card} flex items-center gap-2 text-[#46178f] hover:bg-purple-50 px-4 py-2.5 rounded-2xl font-black w-fit`}
        >
          <ArrowRight size={20} />
          العودة
        </button>

        <button 
          onClick={handlePrint}
          className={`${btn.red} px-4 py-2.5`}
        >
          <Printer size={20} />
          طباعة كملف PDF
        </button>
      </div>

      <div id="printable-achievement" className={`${card} rounded-3xl overflow-hidden print:shadow-none print:border-none print:rounded-none`}>
        
        {/* Header Details */}
        <div className="p-8 border-b-2 border-purple-100 bg-purple-50/40">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <h1 className="text-3xl font-black text-[#46178f] leading-tight flex-1">
              {achievement.title}
            </h1>
            <div>{getScoreBadge(achievement.score)}</div>
          </div>
          
          <div className="flex flex-wrap items-center gap-6 text-gray-600 font-bold text-sm">
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border-2 border-purple-100">
              <User size={16} className="text-[#0087ed]" />
              {achievement.teacherName || "غير محدد"}
            </div>
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border-2 border-purple-100">
              <Building size={16} className="text-purple-500" />
              {achievement.department || "غير محدد"}
            </div>
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border-2 border-purple-100">
              <Calendar size={16} className="text-[#26890c]" />
              {achievement.date || "غير محدد"}
            </div>
          </div>
        </div>

        {/* Description Body */}
        <div className="p-8 break-inside-avoid">
          <h3 className="text-lg font-black text-gray-800 mb-4 flex items-center gap-2">
            <FileText size={20} className="text-gray-400" />
            وصف الإنجاز:
          </h3>
          <p className="text-gray-700 leading-loose whitespace-pre-wrap font-medium">
            {achievement.desc || achievement.description || "لا يوجد وصف مرفق لهذا الإنجاز."}
          </p>
        </div>

        {/* Media / Attachment Handling */}
        {(images.length > 0 || videos.length > 0 || documents.length > 0) && (
          <div className="p-8 bg-purple-50 border-t border-purple-100 print:bg-white print:border-t-2 print:border-gray-200">
             <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
               <h3 className="text-lg font-black text-gray-800 flex items-center gap-2">
                 <ImageIcon size={20} className="text-gray-400" />
                 المرفقات:
               </h3>
               {canManage && (
                 <button
                   onClick={() => setShowRemoveAllConfirm(true)}
                   className={`${btn.red} px-4 py-2 text-sm`}
                 >
                   <Trash2 size={16} />
                   حذف جميع المرفقات
                 </button>
               )}
             </div>
            
            {/* Images Grid */}
            {images.length > 0 && (
              <div className={`grid gap-4 mb-6 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3'}`}>
                {images.map((imgUrl, idx) => (
                  <div 
                    key={idx} 
                    className={`cursor-pointer relative group bg-white rounded-2xl border-2 border-purple-100 overflow-hidden shadow-sm break-inside-avoid print:border-gray-300 print:shadow-none ${images.length === 1 ? '' : 'aspect-square'}`} 
                    onClick={() => setSelectedImage(imgUrl)}
                  >
                    <img src={imgUrl} alt={`Attachment ${idx + 1}`} className={`w-full transition-transform duration-500 group-hover:scale-105 ${images.length === 1 ? 'max-h-150 object-contain' : 'h-full object-cover'}`} />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 bg-white/95 text-black px-4 py-2 rounded-xl font-bold text-sm shadow-lg transition-all transform translate-y-2 group-hover:translate-y-0 print:hidden">
                        تكبير الصورة
                      </span>
                    </div>
                    {canManage && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveClick(imgUrl); }}
                        title="حذف الملف"
                        className="absolute top-2 left-2 z-10 flex items-center justify-center bg-[#eb1f36] text-white hover:bg-[#c9172c] p-2.5 rounded-xl shadow-lg transition-all print:hidden"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Videos Grid */}
            {videos.length > 0 && (
              <div className="mt-6">
                <h4 className="text-md font-bold text-gray-600 mb-4 flex items-center gap-2">
                  <Video size={18} className="text-gray-400" />
                  مقاطع الفيديو ({videos.length})
                </h4>
                <div className={`grid gap-4 ${videos.length === 1 ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3'}`}>
                  {videos.map((videoUrl, idx) => (
                    <div 
                      key={idx} 
                      className="cursor-pointer relative group bg-black rounded-2xl border-2 border-gray-200 overflow-hidden shadow-sm aspect-video break-inside-avoid"
                      onClick={() => setSelectedVideo(videoUrl)}
                    >
                      <video src={`${videoUrl}#t=0.1`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" preload="metadata" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                        <PlayCircle className="text-white opacity-0 group-hover:opacity-100 drop-shadow-lg transition-opacity transform scale-150" size={48} />
                      </div>
                      {canManage && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveClick(videoUrl); }}
                          title="حذف الملف"
                          className="absolute top-2 left-2 z-10 flex items-center justify-center bg-[#eb1f36] text-white hover:bg-[#c9172c] p-2.5 rounded-xl shadow-lg transition-all print:hidden"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Documents List (PDFs, etc) */}
            {documents.length > 0 && (
              <div className="flex flex-col gap-6 mt-6">
                {documents.map((docUrl, idx) => (
                  <div key={idx} className="bg-white border-2 border-purple-100 rounded-2xl overflow-hidden shadow-sm flex flex-col break-inside-avoid print:border-gray-300 print:shadow-none">
                    <div className="bg-purple-50/50 px-6 py-4 border-b border-purple-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="flex items-center gap-3 overflow-hidden w-full">
                        <FileText size={24} className="text-[#0087ed] shrink-0" />
                        <span className="font-bold text-gray-700 truncate block" dir="ltr">{getFileName(docUrl)}</span>
                      </div>
                      <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto shrink-0">
                        {canManage && (
                          <button
                            onClick={() => handleRemoveClick(docUrl)}
                            className={`${btn.red} px-5 py-2.5 text-sm`}
                          >
                            <Trash2 size={18} />
                            حذف
                          </button>
                        )}
                        <a href={getDownloadUrl(docUrl)} target="_blank" rel="noopener noreferrer" className={`${btn.blue} shrink-0 px-5 py-2.5 w-full md:w-auto print:hidden`}>
                          <DownloadCloud size={18} />
                          تحميل المستند
                        </a>
                      </div>
                    </div>
                    {/* Google Docs Viewer Iframe for showing the actual document preview */}
                    <div className="w-full h-[60vh] bg-gray-50 print:hidden">
                      <iframe 
                        src={`https://docs.google.com/gview?url=${encodeURIComponent(docUrl)}&embedded=true`} 
                        className="w-full h-full border-none"
                        title={`Document Preview ${idx + 1}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fullscreen Lightbox Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-200 print:hidden" onClick={() => setSelectedImage(null)}>
          <button className="absolute top-6 right-6 md:top-10 md:right-10 text-white hover:bg-white/20 p-3 rounded-full transition-colors z-50" onClick={() => setSelectedImage(null)}>
            <X size={32} />
          </button>
          {canManage && (
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedImage(null); handleRemoveClick(selectedImage); }}
              className="absolute top-6 left-6 md:top-10 md:left-10 flex items-center gap-2 bg-[#eb1f36] text-white px-4 py-3 rounded-2xl font-black shadow-lg hover:bg-[#c9172c] transition-colors z-50"
            >
              <Trash2 size={20} />
              حذف الملف
            </button>
          )}
          <img src={selectedImage} alt="Enlarged Attachment" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* Fullscreen Video Player Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 print:hidden" onClick={() => setSelectedVideo(null)}>
          <button className="absolute top-6 right-6 md:top-10 md:right-10 text-white hover:bg-white/20 p-3 rounded-full transition-colors z-50" onClick={() => setSelectedVideo(null)}>
            <X size={32} />
          </button>
          <video src={selectedVideo} className="max-w-full max-h-[90vh] rounded-lg shadow-2xl animate-in zoom-in-95 duration-300" controls autoPlay onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* Media Delete Confirmation Modal */}
      {removeTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[70] animate-in fade-in duration-200 p-4" onClick={() => setRemoveTarget(null)}>
          <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full text-center animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="text-[#eb1f36]" size={32} />
            </div>
            <h3 className="text-xl font-black text-[#46178f] mb-4">حذف الملف</h3>
            {removeTarget.type === 'image' ? (
              <img src={removeTarget.url} alt="Attachment preview" className="max-h-48 mx-auto rounded-2xl object-contain border-2 border-purple-100 mb-4" />
            ) : removeTarget.type === 'video' ? (
              <video src={removeTarget.url} className="max-h-48 mx-auto rounded-2xl object-contain border-2 border-purple-100 mb-4" controls />
            ) : (
              <div className="flex items-center justify-center gap-3 bg-purple-50 rounded-2xl p-6 mb-4">
                <FileText size={32} className="text-[#0087ed] shrink-0" />
                <span className="font-black text-gray-700 truncate" dir="ltr">{removeTarget.name}</span>
              </div>
            )}
            <p className="text-sm text-gray-500 font-bold mb-1">
              النوع: {removeTarget.type === 'image' ? 'صورة' : removeTarget.type === 'video' ? 'فيديو' : 'مستند'}
              {removeTarget.formatted && <span className="text-gray-400"> · الحجم: {removeTarget.formatted}</span>}
            </p>
            <p className="text-sm font-black text-[#eb1f36] mb-6">سيتم حذف هذا الملف نهائياً من التخزين السحابي. لا يمكن التراجع عن هذه الخطوة.</p>
            <div className="flex gap-3">
              <button onClick={() => setRemoveTarget(null)} disabled={isRemoving} className="flex-1 py-3 rounded-2xl font-black text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all">
                إلغاء
              </button>
              <button onClick={handleConfirmRemove} disabled={isRemoving} className="flex-1 py-3 rounded-2xl font-black text-white bg-[#eb1f36] hover:bg-[#c9172c] border-b-4 border-[#b51427] active:border-b-0 active:translate-y-1 transition-all shadow-lg flex items-center justify-center gap-2">
                {isRemoving ? <Loader2 className="animate-spin" size={20} /> : <Trash2 size={20} />}
                {isRemoving ? 'جارٍ الحذف...' : 'حذف نهائي'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove All Attachments Confirmation Modal */}
      {showRemoveAllConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[70] animate-in fade-in duration-200 p-4" onClick={() => setShowRemoveAllConfirm(false)}>
          <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full text-center animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="text-[#eb1f36]" size={32} />
            </div>
            <h3 className="text-xl font-black text-[#46178f] mb-2">حذف جميع المرفقات</h3>
            <p className="text-gray-500 font-bold mb-2">
              سيتم حذف {images.length + videos.length + documents.length} ملف (صور، فيديوهات، مستندات) نهائياً من التخزين السحابي.
            </p>
            <p className="text-sm font-black text-[#eb1f36] mb-6">لا يمكن التراجع عن هذه الخطوة.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowRemoveAllConfirm(false)} disabled={isRemoving} className="flex-1 py-3 rounded-2xl font-black text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all">
                إلغاء
              </button>
              <button onClick={handleRemoveAll} disabled={isRemoving} className="flex-1 py-3 rounded-2xl font-black text-white bg-[#eb1f36] hover:bg-[#c9172c] border-b-4 border-[#b51427] active:border-b-0 active:translate-y-1 transition-all shadow-lg flex items-center justify-center gap-2">
                {isRemoving ? <Loader2 className="animate-spin" size={20} /> : <Trash2 size={20} />}
                {isRemoving ? 'جارٍ الحذف...' : 'حذف نهائي'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PIN Prompt Modal (non-admin) */}
      {showPinPrompt && !isAdmin && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] animate-in fade-in duration-200 p-4">
          <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full bg-[#0087ed]/10 flex items-center justify-center mx-auto mb-4">
              <Lock className="text-[#0087ed]" size={32} />
            </div>
            <h3 className="text-xl font-black text-[#46178f] mb-2">حذف الملف 🔒</h3>
            <p className="text-sm text-gray-500 mb-6">الرجاء إدخال رمز الحماية (PIN) الخاص بهذا الإنجاز لتتمكن من حذف الملف.</p>
            <input
              type="password"
              maxLength={4}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePinSubmit()}
              placeholder="****"
              className={`w-full text-center tracking-[1em] font-mono font-black text-2xl bg-white border-2 rounded-2xl p-4 outline-none transition-all ${pinError ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-100' : 'border-red-200 focus:border-[#eb1f36] focus:ring-4 focus:ring-red-200'}`}
            />
            {pinError && <p className="text-red-500 font-bold text-sm mt-3 animate-in slide-in-from-top-1">{pinError}</p>}
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowPinPrompt(false); setPinError(''); setPinInput(''); }} className="flex-1 py-3 rounded-2xl font-black text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all">
                إلغاء
              </button>
              <button onClick={handlePinSubmit} className="flex-1 py-3 rounded-2xl font-black text-white bg-[#0087ed] hover:bg-[#0073cc] border-b-4 border-[#005fa3] active:border-b-0 active:translate-y-1 transition-all shadow-lg">
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className={`${toast} z-[200]`} style={{ background: toastMsg.includes('خطأ') ? '#eb1f36' : '#26890c' }}>
          <div className="flex items-center gap-3">
            <span>{toastMsg.includes('خطأ') ? '❌' : '✅'}</span>
            <span>{toastMsg}</span>
            <button onClick={() => setToastMsg(null)} className="mr-auto text-white/70 hover:text-white">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
