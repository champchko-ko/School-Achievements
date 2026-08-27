// src/app/admin/page.tsx
"use client";
import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { ShieldCheck, Trophy, Medal, Award, ExternalLink, Loader2, CheckCircle2, XCircle, TrendingUp, Files, UserX, Clock, ThumbsUp, ThumbsDown, ShieldAlert, RefreshCw, Download, Eye } from 'lucide-react';
import Link from 'next/link';
import { useAdmin } from '../../lib/useAdmin';
import { useRouter } from 'next/navigation';
import { header, panel, toast } from '../../lib/ui';

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

      {/* Pending Queue — Approve / Reject / Score */}
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
              <div key={item.id} className={`${panel} p-5 md:p-6 flex flex-col md:flex-row gap-6 items-start md:items-center`}>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h4 className="text-lg font-black text-[#46178f]">{item.title}</h4>
                    <span className="bg-purple-50 text-[#46178f] px-3 py-1 rounded-full text-xs font-bold">{item.department}</span>
                    <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold">⏳ بانتظار المراجعة</span>
                  </div>
                  <p className="text-gray-600 text-sm font-medium leading-relaxed">{item.desc}</p>
                  <div className="flex items-center gap-4 text-xs font-bold pt-2 flex-wrap">
                    <span className="text-gray-500 flex items-center gap-1">👤 {item.teacherName}</span>
                    <span className="text-gray-500 flex items-center gap-1">📅 {item.date}</span>
                    {item.attachmentUrls && item.attachmentUrls.length > 0 && (
                      <span className="text-gray-500 flex items-center gap-1">📎 {item.attachmentUrls.length} مرفق</span>
                    )}
                  </div>
                </div>

                {/* View / Approve / Reject / Score — Compact layout */}
                <div className="w-full md:w-[300px] grid grid-cols-2 gap-2 shrink-0">
                  <Link 
                    href={`/achievement/${item.id}`}
                    target="_blank"
                    className="col-span-2 flex items-center justify-center gap-2 bg-[#0087ed] hover:bg-[#0073cc] text-white px-4 py-2.5 rounded-2xl font-black border-b-4 border-[#005fa3] active:border-b-0 active:translate-y-1 transition-all text-sm"
                  >
                    <Eye size={18} /> عرض الإنجاز
                  </Link>
                  <button 
                    onClick={() => handleStatusChange(item.id, 'approved')}
                    disabled={processingId === item.id}
                    className="flex items-center justify-center gap-2 bg-[#26890c] hover:bg-[#20730a] text-white px-4 py-2.5 rounded-2xl font-black border-b-4 border-[#1c5e08] active:border-b-0 active:translate-y-1 transition-all text-sm"
                  >
                    {processingId === item.id ? <Loader2 className="animate-spin" size={18} /> : <><ThumbsUp size={18} /> موافقة</>}
                  </button>
                  <button 
                    onClick={() => handleStatusChange(item.id, 'rejected')}
                    disabled={processingId === item.id}
                    className="flex items-center justify-center gap-2 bg-white hover:bg-red-50 text-[#eb1f36] border-2 border-red-200 px-4 py-2.5 rounded-2xl font-black transition-all text-sm"
                  >
                    {processingId === item.id ? <Loader2 className="animate-spin" size={18} /> : <><ThumbsDown size={18} /> رفض</>}
                  </button>
                  <select
                    defaultValue=""
                    disabled={processingId === item.id}
                    onChange={(e) => {
                      const score = Number(e.target.value);
                      if (score) {
                        handleScore(item.id, score);
                        e.target.value = '';
                      }
                    }}
                    className="col-span-2 w-full bg-white text-gray-700 border-2 border-amber-200 px-4 py-2.5 rounded-2xl font-black transition-all text-sm cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    <option value="" disabled>🎖 تقييم: ذهبي / فضي / برونزي</option>
                    <option value={95}>🏆 ذهبي (95)</option>
                    <option value={85}>🥈 فضي (85)</option>
                    <option value={75}>🥉 برونزي (75)</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Approved Achievements — Re-score */}
      {approvedAchievements.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="p-3 bg-green-50 text-[#26890c] rounded-2xl"><CheckCircle2 size={22} /></span>
            <h3 className="text-xl md:text-2xl font-black text-white">إنجازات معتمدة بانتظار التقييم</h3>
            <span className="bg-[#26890c] text-white px-3 py-1 rounded-full text-sm font-black">{approvedAchievements.length}</span>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {approvedAchievements.map((item) => (
              <div key={item.id} className={`${panel} p-5 md:p-6 flex flex-col md:flex-row gap-6 items-start md:items-center`}>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h4 className="text-lg font-black text-[#46178f]">{item.title}</h4>
                    <span className="bg-purple-50 text-[#46178f] px-3 py-1 rounded-full text-xs font-bold">{item.department}</span>
                    {item.score ? (
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${item.score >= 90 ? 'bg-yellow-100 text-yellow-700' : item.score >= 80 ? 'bg-gray-200 text-gray-700' : 'bg-orange-100 text-orange-700'}`}>
                        {item.score >= 90 ? '🏆 ذهبي' : item.score >= 80 ? '🥈 فضي' : '🥉 برونزي'} {item.score}
                      </span>
                    ) : (
                      <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-xs font-bold">بدون تقييم</span>
                    )}
                  </div>
                  <p className="text-gray-600 text-sm font-medium leading-relaxed line-clamp-2">{item.desc}</p>
                  <div className="flex items-center gap-4 text-xs font-bold pt-2 flex-wrap">
                    <span className="text-gray-500 flex items-center gap-1">👤 {item.teacherName}</span>
                    <span className="text-gray-500 flex items-center gap-1">📅 {item.date}</span>
                  </div>
                </div>
                <div className="w-full md:w-auto flex md:flex-col gap-2 shrink-0">
                  <button 
                    onClick={() => handleScore(item.id, 95)}
                    disabled={processingId === item.id}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#ffb000] hover:bg-[#e69f00] text-yellow-900 px-4 py-2 rounded-2xl font-black border-b-4 border-[#cc8d00] active:border-b-0 active:translate-y-1 transition-all"
                  >
                    {processingId === item.id ? <Loader2 className="animate-spin" size={18} /> : <><Trophy size={18} /> ذهبي</>}
                  </button>
                  <button 
                    onClick={() => handleScore(item.id, 85)}
                    disabled={processingId === item.id}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#e5e7eb] hover:bg-[#d1d5db] text-gray-800 px-4 py-2 rounded-2xl font-black border-b-4 border-[#9ca3af] active:border-b-0 active:translate-y-1 transition-all"
                  >
                    {processingId === item.id ? <Loader2 className="animate-spin" size={18} /> : <><Medal size={18} /> فضي</>}
                  </button>
                  <button 
                    onClick={() => handleScore(item.id, 75)}
                    disabled={processingId === item.id}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#f97316] hover:bg-[#ea580c] text-white px-4 py-2 rounded-2xl font-black border-b-4 border-[#c2410c] active:border-b-0 active:translate-y-1 transition-all"
                  >
                    {processingId === item.id ? <Loader2 className="animate-spin" size={18} /> : <><Award size={18} /> برونزي</>}
                  </button>
                </div>
              </div>
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

    </div>
  );
}
