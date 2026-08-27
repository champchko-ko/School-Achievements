// src/app/admin/page.tsx
"use client";
import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { ShieldCheck, Trophy, Medal, Award, Loader2, CheckCircle2, TrendingUp, Files, UserX, Clock, ThumbsUp, ThumbsDown, ShieldAlert, RefreshCw, ChevronLeft, X, Paperclip, Calendar, User, Download } from 'lucide-react';
import Link from 'next/link';
import { useAdmin } from '../../lib/useAdmin';
import { useRouter } from 'next/navigation';
import { header, panel, toast } from '../../lib/ui';

const isImageField = (url: string) => {
  if (!url) return false;
  if (url.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp)/i)) return true;
  if (url.includes('/image/upload/') && !url.toLowerCase().endsWith('.pdf')) return true;
  return false;
};

const isVideoField = (url: string) => {
  if (!url) return false;
  if (url.match(/\.(mp4|webm|mov|ogg|avi|flv|mkv|m3u8)/i)) return true;
  return url.includes('/video/upload/');
};

const getAllAttachments = (item: any): string[] => {
  const urls: string[] = [];
  if (Array.isArray(item?.attachmentUrls)) urls.push(...item.attachmentUrls);
  if (item?.fileUrl && !urls.includes(item.fileUrl)) urls.push(item.fileUrl);
  if (item?.attachmentUrl && !urls.includes(item.attachmentUrl)) urls.push(item.attachmentUrl);
  return urls.filter(Boolean);
};

export default function AdminDashboard() {
  const [allAchievements, setAllAchievements] = useState<any[]>([]);
  const [allTeachers, setAllTeachers] = useState<(string | { name: string; department: string })[]>([]);
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: string, message: string } | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [reviewItem, setReviewItem] = useState<any | null>(null);
  const [reviewScoring, setReviewScoring] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    if (!isAdmin && !adminLoading) {
      router.replace('/');
      return;
    }

    const fetchSettings = async () => {
      try {
        const docRef = doc(db, "settings", "global_info");
        const snap = await getDoc(docRef);
        if (snap.exists() && snap.data().teachers) {
          setAllTeachers(snap.data().teachers);
        }
      } catch (error) {
        console.error("Error fetching teachers:", error);
      }
    };
    fetchSettings();

    const q = query(collection(db, "achievements"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllAchievements(data);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  // --- Derived Data ---
  const pendingAchievements = allAchievements.filter(a => a.status === 'pending');
  const totalApproved = allAchievements.filter(a => a.status === 'approved' || (!a.status && a.status !== 'pending'));
  const approvedAchievements = totalApproved.filter(a => a.score === null);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentMonthAchievements = allAchievements.filter(a => a.date && a.date.startsWith(currentMonth));
  const deptCounts: Record<string, number> = {};
  currentMonthAchievements.forEach(a => {
    const d = a.department || 'غير محدد';
    deptCounts[d] = (deptCounts[d] || 0) + 1;
  });
  let mostActiveDept = "لا يوجد";
  let maxCount = 0;
  for (const [dept, count] of Object.entries(deptCounts)) {
    if (count > maxCount) { maxCount = count; mostActiveDept = dept; }
  }

  let totalFiles = 0;
  allAchievements.forEach(a => {
    if (a.attachmentUrls) totalFiles += a.attachmentUrls.length;
    if (a.attachmentUrl) totalFiles += 1;
  });

  const activeTeacherNames = new Set(allAchievements.map(a => a.teacherName).filter(Boolean));
  const allTeacherNames = allTeachers.map(t => typeof t === 'string' ? t : t.name || '');
  const inactiveTeachers = allTeacherNames.filter(t => !activeTeacherNames.has(t));

  // Handle Approve / Reject
  const handleStatusChange = async (id: string, status: 'approved' | 'rejected') => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/achievements/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'فشل تحديث الحالة');
      }
      setNotification({
        type: 'success',
        message: status === 'approved' ? 'تمت الموافقة على الإنجاز ✓' : 'تم رفض الإنجاز'
      });
    } catch (error: any) {
      console.error("Error updating status:", error);
      setNotification({ type: "error", message: error.message || "حدث خطأ أثناء تحديث الحالة." });
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Scoring (for approved achievements)
  const handleScore = async (id: string, score: number) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/achievements/${id}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'فشل التقييم');
      }
      setNotification({ type: 'success', message: 'تم التقييم بنجاح ✓' });
    } catch (error: any) {
      console.error("Error updating score:", error);
      setNotification({ type: "error", message: error.message || "حدث خطأ أثناء تقييم الإنجاز." });
    } finally {
      setProcessingId(null);
    }
  };

  // Review flow — approve, then optional scoring
  const openReview = (item: any) => {
    setReviewItem(item);
    setReviewScoring(false);
  };

  const closeReview = () => {
    setReviewItem(null);
    setReviewScoring(false);
  };

  const handleReviewApprove = async () => {
    if (!reviewItem) return;
    const id = reviewItem.id;
    setProcessingId(id);
    try {
      const res = await fetch(`/api/achievements/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'فشل التحديث');
      }
      setReviewScoring(true);
      setNotification({ type: 'success', message: 'تمت الموافقة على الإنجاز ✓' });
    } catch (error: any) {
      console.error('Error approving:', error);
      setNotification({ type: 'error', message: error.message || 'حدث خطأ أثناء الموافقة.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReviewReject = async () => {
    if (!reviewItem) return;
    const id = reviewItem.id;
    setProcessingId(id);
    try {
      const res = await fetch(`/api/achievements/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'فشل التحديث');
      }
      setNotification({ type: 'success', message: 'تم رفض الإنجاز' });
      closeReview();
    } catch (error: any) {
      console.error('Error rejecting:', error);
      setNotification({ type: 'error', message: error.message || 'حدث خطأ أثناء الرفض.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReviewScore = async (score: number) => {
    if (!reviewItem) return;
    const id = reviewItem.id;
    setProcessingId(id);
    try {
      const res = await fetch(`/api/achievements/${id}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'فشل التقييم');
      }
      setNotification({ type: 'success', message: 'تم التقييم بنجاح ✓' });
      closeReview();
    } catch (error: any) {
      console.error('Error scoring:', error);
      setNotification({ type: 'error', message: error.message || 'حدث خطأ أثناء تقييم الإنجاز.' });
    } finally {
      setProcessingId(null);
    }
  };

  // Download database backup
  const handleBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await fetch('/api/backup', { method: 'POST' });
      if (!res.ok) throw new Error('Backup failed');
      const data = await res.json();
      // Trigger download as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `school-achievements-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setNotification({ type: 'success', message: `تم التحميل بنجاح! ${data.totalDocuments} مستند` });
    } catch (error: any) {
      setNotification({ type: 'error', message: error.message || 'فشل في إنشاء النسخة الاحتياطية' });
    } finally {
      setBackupLoading(false);
    }
  };

  // Fetch security logs via API (Firestore rules block client reads on logs)
  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/logs');
      if (!res.ok) throw new Error('Failed to fetch logs');
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLogsLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      
      {/* Notification Toast */}
      {notification && (
        <div className={`${toast} z-[200]`} style={{ background: notification.type === "success" ? "#26890c" : "#eb1f36" }}>
          <div className="flex items-center gap-3">
            <span>{notification.type === "success" ? "✅" : "❌"}</span>
            <span>{notification.message}</span>
            <button onClick={() => setNotification(null)} className="mr-auto text-white/70 hover:text-white">✕</button>
          </div>
        </div>
      )}
      
      {/* Admin Header */}
      <div className={`${header} p-8 text-center relative overflow-hidden`}>
        <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full -translate-y-16 translate-x-16"></div>
        <ShieldCheck size={40} className="mx-auto mb-3 text-white" />
        <h1 className="text-2xl md:text-3xl font-black text-white mb-2">لوحة تحكم الإدارة</h1>
        <p className="text-purple-200 font-bold text-sm">مراقبة الإنجازات والتقييم</p>
      </div>

      {/* Stats */}
      <div className="overflow-x-auto pb-2 -mx-1 px-1">
        <div className="flex gap-3 md:gap-4 min-w-max snap-x snap-mandatory">
          <div className="bg-white rounded-2xl p-3 shadow-lg border-2 border-purple-100 flex flex-col items-center gap-0.5 min-w-[120px] md:min-w-0 snap-center shrink-0">
            <div className="bg-purple-100 p-1.5 rounded-xl text-[#46178f]"><TrendingUp size={18} /></div>
            <p className="text-[10px] md:text-xs text-gray-500 font-bold text-center leading-tight">إجمالي الإنجازات</p>
            <p className="text-xl md:text-2xl font-black text-gray-800">{allAchievements.length}</p>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-lg border-2 border-purple-100 flex flex-col items-center gap-0.5 min-w-[120px] md:min-w-0 snap-center shrink-0">
            <div className="bg-yellow-100 p-1.5 rounded-xl text-[#ffb000]"><Clock size={18} /></div>
            <p className="text-[10px] md:text-xs text-gray-500 font-bold text-center leading-tight">بانتظار المراجعة</p>
            <p className="text-xl md:text-2xl font-black text-[#eb1f36]">{pendingAchievements.length}</p>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-lg border-2 border-purple-100 flex flex-col items-center gap-0.5 min-w-[120px] md:min-w-0 snap-center shrink-0">
            <div className="bg-green-100 p-1.5 rounded-xl text-[#26890c]"><CheckCircle2 size={18} /></div>
            <p className="text-[10px] md:text-xs text-gray-500 font-bold text-center leading-tight">معتمدة</p>
            <p className="text-xl md:text-2xl font-black text-[#26890c]">{approvedAchievements.length}</p>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-lg border-2 border-purple-100 flex flex-col items-center gap-0.5 min-w-[120px] md:min-w-0 snap-center shrink-0">
            <div className="bg-blue-100 p-1.5 rounded-xl text-[#0087ed]"><Files size={18} /></div>
            <p className="text-[10px] md:text-xs text-gray-500 font-bold text-center leading-tight">الملفات المخزنة</p>
            <p className="text-xl md:text-2xl font-black text-gray-800">{totalFiles}</p>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-lg border-2 border-purple-100 flex flex-col items-center gap-0.5 min-w-[120px] md:min-w-0 snap-center shrink-0">
            <div className="bg-green-50 p-1.5 rounded-xl text-[#26890c]"><Award size={18} /></div>
            <p className="text-[10px] md:text-xs text-gray-500 font-bold text-center leading-tight">القسم الأنشط هذا الشهر</p>
            <p className="text-lg md:text-xl font-black text-gray-800 text-center">{mostActiveDept}</p>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-lg border-2 border-purple-100 flex flex-col items-center gap-0.5 min-w-[120px] md:min-w-0 snap-center shrink-0">
            <div className="bg-red-50 p-1.5 rounded-xl text-[#eb1f36]"><UserX size={18} /></div>
            <p className="text-[10px] md:text-xs text-gray-500 font-bold text-center leading-tight">معلمون بلا إنجازات</p>
            <p className="text-xl md:text-2xl font-black text-gray-800">{inactiveTeachers.length}</p>
          </div>
        </div>
      </div>

      {/* Pending Queue — review flow */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <span className="p-3 bg-red-50 text-[#eb1f36] rounded-2xl"><Clock size={22} /></span>
          <h3 className="text-xl md:text-2xl font-black text-white">إنجازات بانتظار المراجعة</h3>
          <span className="bg-[#eb1f36] text-white px-3 py-1 rounded-full text-sm font-black">{pendingAchievements.length}</span>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-purple-200">
            <Loader2 className="animate-spin mb-4 text-yellow-400" size={40} />
            <p className="font-bold">جاري تحميل السجلات...</p>
          </div>
        ) : pendingAchievements.length === 0 ? (
          <div className="bg-green-50 rounded-3xl p-10 border-2 border-green-200 text-center text-green-700">
            <CheckCircle2 size={48} className="mx-auto mb-3 text-green-500" />
            <p className="font-bold text-lg">عمل رائع! لا توجد إنجازات بانتظار المراجعة.</p>
            <p className="text-sm mt-1 opacity-80">تمت مراجعة جميع الإنجازات المرفوعة.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {pendingAchievements.map((item) => (
              <button
                key={item.id}
                onClick={() => openReview(item)}
                className={`${panel} p-4 md:p-5 w-full text-right flex items-center gap-4 hover:shadow-2xl hover:border-purple-300 transition-all cursor-pointer group`}
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-base md:text-lg font-black text-[#46178f] truncate">{item.title}</h4>
                    <span className="bg-purple-50 text-[#46178f] px-2.5 py-0.5 rounded-full text-xs font-bold">{item.department}</span>
                    <span className="bg-yellow-100 text-yellow-700 px-2.5 py-0.5 rounded-full text-xs font-bold">⏳ بانتظار المراجعة</span>
                  </div>
                  <p className="text-gray-600 text-sm font-medium leading-relaxed line-clamp-2">{item.desc}</p>
                  <div className="flex items-center gap-4 text-xs font-bold pt-1 flex-wrap">
                    <span className="text-gray-500 flex items-center gap-1"><User size={13} /> {item.teacherName}</span>
                    <span className="text-gray-500 flex items-center gap-1"><Calendar size={13} /> {item.date}</span>
                    {getAllAttachments(item).length > 0 && (
                      <span className="text-gray-500 flex items-center gap-1"><Paperclip size={13} /> {getAllAttachments(item).length} مرفق</span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-[#46178f]/50 group-hover:text-[#46178f] transition-colors"><ChevronLeft size={22} /></span>
              </button>
            ))}
          </div>
        )}
      </div>

{/* Approved Achievements — score later */}
      {approvedAchievements.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="p-3 bg-green-50 text-[#26890c] rounded-2xl"><CheckCircle2 size={22} /></span>
            <h3 className="text-xl md:text-2xl font-black text-white">إنجازات معتمدة بانتظار التقييم</h3>
            <span className="bg-[#26890c] text-white px-3 py-1 rounded-full text-sm font-black">{approvedAchievements.length}</span>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {approvedAchievements.map((item) => (
              <button
                key={item.id}
                onClick={() => { setReviewItem(item); setReviewScoring(true); }}
                className={`${panel} p-4 md:p-5 w-full text-right flex items-center gap-4 hover:shadow-2xl hover:border-purple-300 transition-all cursor-pointer group`}
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-base md:text-lg font-black text-[#46178f] truncate">{item.title}</h4>
                    <span className="bg-purple-50 text-[#46178f] px-2.5 py-0.5 rounded-full text-xs font-bold">{item.department}</span>
                    <span className="bg-green-100 text-[#26890c] px-2.5 py-0.5 rounded-full text-xs font-bold">✓ معتمد بانتظار التقييم</span>
                  </div>
                  <p className="text-gray-600 text-sm font-medium leading-relaxed line-clamp-2">{item.desc}</p>
                  <div className="flex items-center gap-4 text-xs font-bold pt-1 flex-wrap">
                    <span className="text-gray-500 flex items-center gap-1"><User size={13} /> {item.teacherName}</span>
                    <span className="text-gray-500 flex items-center gap-1"><Calendar size={13} /> {item.date}</span>
                    {getAllAttachments(item).length > 0 && (
                      <span className="text-gray-500 flex items-center gap-1"><Paperclip size={13} /> {getAllAttachments(item).length} مرفق</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  <Medal size={18} className="text-gray-400" />
                  <span className="text-[#46178f]/50 group-hover:text-[#46178f] transition-colors"><ChevronLeft size={22} /></span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

{/* ── Security Logs ── */}
      <div>
        <button
          onClick={() => { setShowLogs(!showLogs); if (!showLogs) fetchLogs(); }}
          className="flex items-center gap-3 mb-4 w-full text-left group"
        >
          <span className="p-3 bg-orange-50 text-orange-600 rounded-2xl group-hover:bg-orange-100 transition-colors"><ShieldAlert size={22} /></span>
          <h3 className="text-xl md:text-2xl font-black text-white flex-1">سجل الأحداث الأمنية</h3>
          <RefreshCw size={18} className={`text-white/60 transition-transform ${logsLoading ? 'animate-spin' : ''}`} />
          <span className="text-white/40 text-sm font-bold">{showLogs ? '▲' : '▼'}</span>
        </button>

        {showLogs && (
          <div className={`${panel} p-4 md:p-6`}>
            {logsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-yellow-400" size={24} />
                <span className="mr-3 font-bold text-gray-400">جاري تحميل السجلات...</span>
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-8 text-gray-400 font-bold">لا توجد أحداث مسجلة بعد.</div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {logs.map((log: any) => (
                  <div key={log.id} className={`flex items-start gap-3 p-3 rounded-xl text-sm ${
                    log.level === 'security' ? 'bg-red-50 border border-red-100' :
                    log.level === 'error' ? 'bg-red-50/50 border border-red-50' :
                    log.level === 'warn' ? 'bg-yellow-50 border border-yellow-100' :
                    'bg-gray-50 border border-gray-100'
                  }`}>
                    <span className={`shrink-0 w-2 h-2 rounded-full mt-1.5 ${
                      log.level === 'security' ? 'bg-red-500' :
                      log.level === 'error' ? 'bg-red-400' :
                      log.level === 'warn' ? 'bg-yellow-400' :
                      'bg-green-400'
                    }`}></span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-black text-xs px-2 py-0.5 rounded-full ${
                          log.level === 'security' ? 'bg-red-100 text-red-700' :
                          log.level === 'error' ? 'bg-red-100 text-red-600' :
                          log.level === 'warn' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>{log.level?.toUpperCase()}</span>
                        <span className="font-bold text-xs text-gray-400">{log.category}</span>
                        {log.ip && <span className="text-xs text-gray-400">🌐 {log.ip}</span>}
                        {log.method && log.endpoint && (
                          <span className="text-xs text-gray-400">{log.method} {String(log.endpoint).replace(/^https?:\/\/[^/]+/, '')}</span>
                        )}
                      </div>
                      <p className="font-bold text-gray-700 mt-1">{log.message}</p>
                      {log.details && (
                        <pre className="text-xs text-gray-400 mt-1 whitespace-pre-wrap break-all">{JSON.stringify(log.details, null, 2)}</pre>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-300 shrink-0">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString('ar-SA') : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Database Backup ── */}
      <div className="${panel} p-5 md:p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><Download size={22} /></span>
          <div className="flex-1">
            <h3 className="text-lg font-black text-white">نسخة احتياطية</h3>
            <p className="text-xs text-gray-400 font-bold">تحميل جميع البيانات كملف JSON</p>
          </div>
          <button
            onClick={handleBackup}
            disabled={backupLoading}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-sm transition-all ${
              backupLoading
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white border-b-4 border-blue-800 active:border-b-0 active:translate-y-1'
            }`}
          >
            {backupLoading ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
            {backupLoading ? 'جاري التحميل...' : 'تحميل النسخة الاحتياطية'}
          </button>
        </div>
      </div>

      {/* ── Review Sheet (bottom sheet / modal) ── */}
      {reviewItem && (
        <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label={reviewItem.title || 'مراجعة الإنجاز'}>
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={closeReview}
          ></div>

          {/* Sheet */}
          <div className="relative w-full md:max-w-2xl max-h-[92vh] md:max-h-[80vh] bg-white rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="shrink-0 px-5 md:px-7 py-4 md:py-5 bg-gradient-to-l from-[#46178f] to-[#7b2cbf] text-white flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <h3 className="text-lg md:text-xl font-black truncate">{reviewItem.title}</h3>
                  <span className="bg-white/20 px-2.5 py-0.5 rounded-full text-[11px] font-bold">{reviewItem.department}</span>
                </div>
                <div className="flex items-center gap-4 text-xs font-bold text-purple-100 flex-wrap">
                  <span className="flex items-center gap-1"><User size={13} /> {reviewItem.teacherName || 'غير محدد'}</span>
                  <span className="flex items-center gap-1"><Calendar size={13} /> {reviewItem.date || '—'}</span>
                  {getAllAttachments(reviewItem).length > 0 && (
                    <span className="flex items-center gap-1"><Paperclip size={13} /> {getAllAttachments(reviewItem).length} مرفق</span>
                  )}
                </div>
              </div>
              <button
                onClick={closeReview}
                aria-label="إغلاق"
                className="shrink-0 p-2 rounded-full bg-white/15 hover:bg-white/30 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-5 md:p-7 space-y-5">
              {(() => {
                const attachments = getAllAttachments(reviewItem);
                const images = attachments.filter(isImageField);
                const docs = attachments.filter(url => !isImageField(url) && !isVideoField(url));
                const videos = attachments.filter(isVideoField);
                return (
                  <>
                    {images.length > 0 && (
                      <div className={`grid gap-3 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3'}`}>
                        {images.slice(0, 4).map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={url}
                              alt={`${reviewItem.title} ${i + 1}`}
                              className={`w-full object-cover rounded-2xl border-2 border-purple-100 shadow-sm ${images.length === 1 ? 'max-h-72 md:max-h-96' : 'aspect-square'}`}
                            />
                          </a>
                        ))}
                      </div>
                    )}
                    <div className="space-y-2">
                      <h4 className="text-sm font-black text-[#46178f]">الوصف</h4>
                      <p className="text-gray-700 text-sm md:text-base font-medium leading-relaxed whitespace-pre-wrap">
                        {reviewItem.desc || reviewItem.description || 'لا يوجد وصف'}
                      </p>
                    </div>
                    {(videos.length > 0 || docs.length > 0) && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-black text-[#46178f]">المرفقات</h4>
                        <div className="flex flex-wrap gap-2">
                          {videos.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-xl bg-purple-50 text-[#46178f] text-xs font-black hover:bg-purple-100 transition-colors flex items-center gap-1.5">
                              🎬 فيديو {i + 1}
                            </a>
                          ))}
                          {docs.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-black hover:bg-gray-200 transition-colors flex items-center gap-1.5">
                              📄 مستند {i + 1}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Sticky footer — action hub */}
            <div className="shrink-0 border-t border-gray-100 p-4 md:p-5 bg-white">
              {reviewScoring ? (
                <div className="text-center">
                  <p className="text-xs font-black text-gray-400 mb-3">🎖 اختر التقييم</p>
                  <div className="flex items-center justify-center gap-4 md:gap-6">
                    <button
                      onClick={() => handleReviewScore(95)}
                      disabled={processingId === reviewItem.id}
                      className="flex flex-col items-center gap-1.5 group"
                    >
                      <span className="w-16 md:w-20 h-16 md:h-20 rounded-full bg-[#ffb000] border-b-4 border-[#cc8d00] text-white flex items-center justify-center shadow-lg group-hover:scale-105 active:scale-95 transition-all group-hover:shadow-xl">
                        {processingId === reviewItem.id ? <Loader2 className="animate-spin" size={24} /> : <Trophy size={28} />}
                      </span>
                      <span className="text-xs font-black text-gray-600">ذهبي</span>
                    </button>
                    <button
                      onClick={() => handleReviewScore(85)}
                      disabled={processingId === reviewItem.id}
                      className="flex flex-col items-center gap-1.5 group"
                    >
                      <span className="w-16 md:w-20 h-16 md:h-20 rounded-full bg-[#e5e7eb] border-b-4 border-[#9ca3af] text-gray-700 flex items-center justify-center shadow-lg group-hover:scale-105 active:scale-95 transition-all group-hover:shadow-xl">
                        {processingId === reviewItem.id ? <Loader2 className="animate-spin" size={24} /> : <Medal size={28} />}
                      </span>
                      <span className="text-xs font-black text-gray-600">فضي</span>
                    </button>
                    <button
                      onClick={() => handleReviewScore(75)}
                      disabled={processingId === reviewItem.id}
                      className="flex flex-col items-center gap-1.5 group"
                    >
                      <span className="w-16 md:w-20 h-16 md:h-20 rounded-full bg-[#f97316] border-b-4 border-[#c2410c] text-white flex items-center justify-center shadow-lg group-hover:scale-105 active:scale-95 transition-all group-hover:shadow-xl">
                        {processingId === reviewItem.id ? <Loader2 className="animate-spin" size={24} /> : <Award size={28} />}
                      </span>
                      <span className="text-xs font-black text-gray-600">برونزي</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={handleReviewApprove}
                    disabled={processingId === reviewItem.id}
                    className="flex-1 flex items-center justify-center gap-2 bg-[#26890c] hover:bg-[#20730a] text-white px-4 py-3.5 rounded-2xl font-black border-b-4 border-[#1c5e08] active:border-b-0 active:translate-y-1 transition-all text-sm md:text-base"
                  >
                    {processingId === reviewItem.id ? <Loader2 className="animate-spin" size={20} /> : <ThumbsUp size={20} />} موافقة
                  </button>
                  <button
                    onClick={handleReviewReject}
                    disabled={processingId === reviewItem.id}
                    className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-red-50 text-[#eb1f36] border-2 border-red-200 px-4 py-3.5 rounded-2xl font-black transition-all text-sm md:text-base"
                  >
                    {processingId === reviewItem.id ? <Loader2 className="animate-spin" size={20} /> : <ThumbsDown size={20} />} رفض
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
