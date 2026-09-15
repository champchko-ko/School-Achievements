"use client";
import { useState, useEffect, useMemo } from 'react';
import { db } from '../../../lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { Trophy, Medal, Award, Loader2, Star, ArrowRight, X } from 'lucide-react';
import { useAdmin } from '../../../lib/useAdmin';
import { useRouter } from 'next/navigation';
import { header } from '../../../lib/ui';
import Link from 'next/link';

const LEVELS = ["gold", "silver", "bronze"] as const;
const LEVEL_LABEL: Record<string, string> = { gold: "ذهبي", silver: "فضي", bronze: "برونزي" };
const LEVEL_ICON: Record<string, typeof Trophy> = { gold: Trophy, silver: Medal, bronze: Award };
const LEVEL_COLOR: Record<string, string> = {
  gold: "bg-yellow-400 text-yellow-900",
  silver: "bg-slate-300 text-slate-800",
  bronze: "bg-amber-600 text-white",
};
const LEVEL_BORDER: Record<string, string> = {
  gold: "border-yellow-400 bg-yellow-50",
  silver: "border-slate-300 bg-slate-50",
  bronze: "border-amber-600 bg-amber-50",
};

function getMonthOptions(): { key: string; label: string }[] {
  const now = new Date();
  const options: { key: string; label: string }[] = [];
  const arMonths = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${arMonths[d.getMonth()]} ${d.getFullYear()}`;
    options.push({ key, label });
  }
  return options;
}

export default function MonthlyAwardsAdmin() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const router = useRouter();
  const [achievements, setAchievements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => getMonthOptions()[0].key);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: string; message: string } | null>(null);

  useEffect(() => {
    if (!isAdmin && !adminLoading) { router.replace("/"); return; }
  }, [isAdmin, adminLoading, router]);

  useEffect(() => {
    if (notification) { const t = setTimeout(() => setNotification(null), 3000); return () => clearTimeout(t); }
  }, [notification]);

  useEffect(() => {
    const q = query(collection(db, "achievements"));
    const unsub = onSnapshot(q, (snap) => {
      setAchievements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setIsLoading(false);
    });
    return () => unsub();
  }, []);

  const eligibleAchievements = useMemo(() => {
    return achievements.filter(a => {
      const approved = a.status === "approved" || (!a.status && a.status !== "pending");
      const inMonth = a.date && a.date.startsWith(selectedMonth);
      return approved && inMonth;
    }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [achievements, selectedMonth]);

  const handleSetAward = async (achievementId: string, level: string | null) => {
    setSavingId(achievementId);
    try {
      const res = await fetch(`/api/achievements/${achievementId}/award`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthKey: selectedMonth, level }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setNotification({ type: "success", message: level ? `تم تعيين ${LEVEL_LABEL[level]}` : "تم إزالة التقييم" });
    } catch (e: any) {
      setNotification({ type: "error", message: e.message || "حدث خطأ" });
    } finally {
      setSavingId(null);
    }
  };

  if (adminLoading || (!isAdmin && !adminLoading)) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-10">
      {notification && (
        <div className={`fixed top-4 right-4 left-4 md:left-auto md:right-4 md:w-96 p-4 rounded-2xl shadow-2xl font-black text-white z-[80] border-4 border-white/20 ${notification.type === "success" ? "bg-[#26890c]" : "bg-[#eb1f36]"}`}>
          {notification.message}
        </div>
      )}

      <div className={`${header} p-6 md:p-8 flex items-center gap-4`}>
        <Link href="/admin" className="text-white/70 hover:text-white transition-colors"><ArrowRight size={24} /></Link>
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-white flex items-center gap-3"><Trophy className="text-[#ffb800]" size={28} /> تقييم إنجازات الشهر</h2>
          <p className="text-purple-100 font-bold text-sm mt-1">تعيين ذهبي / فضي / برونزي للإنجازات المعتمدة</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-xl border-2 border-purple-100">
        <label className="text-sm font-black text-gray-600 mb-2 block">اختر الشهر</label>
        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-gray-50 border-2 border-purple-100 rounded-2xl p-3 font-bold focus:ring-4 focus:ring-purple-200 focus:border-[#46178f] outline-none transition-all text-sm w-full md:w-auto">
          {getMonthOptions().map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-purple-200">
          <Loader2 className="animate-spin mb-4 text-[#ffb800]" size={40} />
          <p className="font-bold">جاري التحميل...</p>
        </div>
      ) : eligibleAchievements.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 border-2 border-dashed border-purple-200 text-center text-gray-400 shadow-xl">
          <Star size={40} className="mx-auto mb-3 text-purple-200" />
          <p className="font-bold">لا توجد إنجازات معتمدة في هذا الشهر</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-black text-gray-500 px-2">{eligibleAchievements.length} إنجاز معتمد</p>
          {eligibleAchievements.map(a => {
            const currentAward = a.awards?.[selectedMonth] ?? null;
            const saving = savingId === a.id;
            return (
              <div key={a.id} className={`bg-white rounded-2xl p-4 md:p-5 border-2 transition-all ${currentAward ? LEVEL_BORDER[currentAward] : "border-purple-100"} shadow-sm hover:shadow-md`}>
                <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-gray-800 text-base truncate">{a.title}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs font-bold text-gray-500">
                      <span className="bg-purple-50 px-2 py-0.5 rounded-lg">{a.teacherName || "غير محدد"}</span>
                      <span className="bg-blue-50 px-2 py-0.5 rounded-lg text-blue-700">{a.department || "غير محدد"}</span>
                      <span className="text-gray-400">{a.date}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {currentAward && (
                      <button onClick={() => handleSetAward(a.id, null)} disabled={saving} className="p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-all border border-red-200" title="إزالة التقييم">
                        <X size={16} />
                      </button>
                    )}
                    {LEVELS.map(lv => {
                      const Icon = LEVEL_ICON[lv];
                      const isActive = currentAward === lv;
                      return (
                        <button key={lv} onClick={() => handleSetAward(a.id, isActive ? null : lv)} disabled={saving}
                          className={`p-2 rounded-xl font-black text-xs transition-all border-2 ${isActive ? LEVEL_COLOR[lv] + " border-current" : "bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300 hover:bg-gray-100"}`}
                          title={LEVEL_LABEL[lv]}>
                          <Icon size={18} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
