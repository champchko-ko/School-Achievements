"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { ArrowRight, Clock, Trophy, Medal, Award, Loader2, DownloadCloud, Image as ImageIcon, User, Building, Calendar, FileText, X, Printer, Video, PlayCircle } from "lucide-react";

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

  useEffect(() => {
    const fetchAchievement = async () => {
      if (!id) return;
      try {
        const docRef = doc(db, "achievements", id as string);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setAchievement({ id: docSnap.id, ...docSnap.data() });
        } else {
          setError("لم يتم العثور على هذا الإنجاز.");
        }
      } catch (err) {
        console.error("Error fetching document:", err);
        setError("حدث خطأ أثناء تحميل البيانات.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAchievement();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
        <Loader2 className="animate-spin mb-4 text-[#1368ce]" size={48} />
        <p className="font-bold text-lg">جاري تحميل تفاصيل الإنجاز...</p>
      </div>
    );
  }

  if (error || !achievement) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <div className="bg-white p-8 rounded-3xl shadow-lg border border-purple-100/50 text-center max-w-md">
          <FileText className="mx-auto text-purple-400 mb-4" size={48} />
          <h2 className="text-2xl font-black mb-2 text-gray-800">عذراً</h2>
          <p className="font-bold mb-6">{error}</p>
          <button onClick={() => router.back()} className="bg-gray-100 hover:bg-gray-200 text-white bg-[#380e6e] hover:bg-[#2a0a54] px-6 py-3 rounded-xl font-bold transition-colors w-full">
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

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500 pb-16">
      
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page { margin: 0.5cm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}} />

      {/* Navigation / Actions */}
      <div className="flex justify-between items-center mb-2 print:hidden">
        <button 
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-500 hover:text-[#1368ce] font-bold transition-colors bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm w-fit hover:shadow-md"
        >
          <ArrowRight size={20} />
          العودة
        </button>

        <button 
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-[#380e6e] hover:bg-[#2a0a54] text-white px-4 py-2 rounded-xl font-bold transition-all shadow-sm hover:shadow-md active:scale-95"
        >
          <Printer size={20} />
          طباعة كملف PDF
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-lg border border-purple-100/50 overflow-hidden print:shadow-none print:border-none print:rounded-none">
        
        {/* Header Details */}
        <div className="p-8 border-b border-gray-50 bg-gray-50/50">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <h1 className="text-3xl font-black text-[#46178f] leading-tight flex-1">
              {achievement.title}
            </h1>
            <div>{getScoreBadge(achievement.score)}</div>
          </div>
          
          <div className="flex flex-wrap items-center gap-6 text-gray-600 font-bold text-sm">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-100">
              <User size={16} className="text-[#1368ce]" />
              {achievement.teacherName || "غير محدد"}
            </div>
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-100">
              <Building size={16} className="text-purple-500" />
              {achievement.department || "غير محدد"}
            </div>
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-100">
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
             <h3 className="text-lg font-black text-gray-800 mb-4 flex items-center gap-2">
              <ImageIcon size={20} className="text-gray-400" />
              المرفقات:
            </h3> 
            
            {/* Images Grid */}
            {images.length > 0 && (
              <div className={`grid gap-4 mb-6 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3'}`}>
                {images.map((imgUrl, idx) => (
                  <div 
                    key={idx} 
                    className={`cursor-pointer relative group bg-white rounded-2xl border-2 border-gray-200 overflow-hidden shadow-sm break-inside-avoid print:border-gray-300 print:shadow-none ${images.length === 1 ? '' : 'aspect-square'}`} 
                    onClick={() => setSelectedImage(imgUrl)}
                  >
                    <img src={imgUrl} alt={`Attachment ${idx + 1}`} className={`w-full transition-transform duration-500 group-hover:scale-105 ${images.length === 1 ? 'max-h-150 object-contain' : 'h-full object-cover'}`} />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 bg-white/95 text-black px-4 py-2 rounded-xl font-bold text-sm shadow-lg transition-all transform translate-y-2 group-hover:translate-y-0 print:hidden">
                        تكبير الصورة
                      </span>
                    </div>
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
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Documents List (PDFs, etc) */}
            {documents.length > 0 && (
              <div className="flex flex-col gap-6 mt-6">
                {documents.map((docUrl, idx) => (
                  <div key={idx} className="bg-white border-2 border-purple-100/50 rounded-2xl overflow-hidden shadow-sm flex flex-col break-inside-avoid print:border-gray-300 print:shadow-none">
                    <div className="bg-purple-50/50 px-6 py-4 border-b border-purple-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="flex items-center gap-3 overflow-hidden w-full">
                        <FileText size={24} className="text-[#1368ce] shrink-0" />
                        <span className="font-bold text-gray-700 truncate block" dir="ltr">{getFileName(docUrl)}</span>
                      </div>
                      <a href={getDownloadUrl(docUrl)} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center justify-center gap-2 bg-[#1368ce] hover:bg-[#0f56b0] text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-sm active:scale-95 w-full md:w-auto print:hidden">
                        <DownloadCloud size={18} />
                        تحميل المستند
                      </a>
                    </div>
                    {/* Google Docs Viewer Iframe for showing the actual document preview */}
                    <div className="w-full h-[60vh] bg-gray-50 relative print:hidden">
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 z-0">
                        <Loader2 className="animate-spin mb-2 text-[#1368ce]" size={32} />
                        <p className="font-bold text-sm">جاري تحميل عرض المستند...</p>
                      </div>
                      <iframe 
                        src={`https://docs.google.com/gview?url=${encodeURIComponent(docUrl)}&embedded=true`} 
                        className="w-full h-full relative z-10 border-none bg-transparent"
                        title={`Document Preview ${idx + 1}`}
                        loading="lazy"
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
    </div>
  );
}