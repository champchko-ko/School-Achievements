"use client";
import { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { Trophy, Medal, Award, Loader2, Star, Users, Calendar } from 'lucide-react';
import { header, card } from '../../lib/ui';
import Link from 'next/link';

const LEVELS = ["gold", "silver", "bronze"] as const;
const LEVEL_META: Record<string, { label: string; icon: typeof Trophy; badge: string; border: string; section: string }> = {
  gold: {
    label: "ذهبي",
    icon: Trophy,
    badge: "bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-yellow-950",
    border: "border-yellow-400",
    section: "from-yellow-500/20 to-yellow-500/5 border-yellow-400/40",
  },
  silver: {
    label: "فضي",
    icon: Medal,
    badge: "bg-gradient-to-r from-slate-200 via-slate-300 to-slate-400 text-slate-900",
    border: "border-slate-300",
    section: "from-slate-300/20 to-slate-300/5 border-slate-300/40",
  },
  bronze: {
    label: "برونزي",
    icon: Award,
    badge: "bg-gradient-to-r from-amber-600 to-amber-800 text-white",
    border: "border-amber-600",
    section: "from-amber-600/20 to-amber-600/5 border-amber-600/40",
  },
};

function getMonthOptions(): { key: string; label: string }[] {
  const now = new Date();
  const options: { key: string; label: string }[] = [];
  const arMonths = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    options.push({ key, label: `${arMonths[d.getMonth()]} ${d.getFullYear()}` });
  }
  return options;
}

function ActiveMonthLabel({ monthKey }: { monthKey: string }) {
  const m = getMonthOptions().find(o => o.key === monthKey);
  return <>{m ? m.label : monthKey}</>;
}

export default function MonthlyAwardsPage() {
  const [achievements, setAchievements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => getMonthOptions()[0].key);

  useEffect(() => {
    const q = query(collection(db, "achievements"));
    const unsub = onSnapshot(q, (snap) => {
      setAchievements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setIsLoading(false);
    });
    return () => unsub();
  }, []);

  const monthAchievements = useMemo(() => {
    return achievements.filter(a => {
      const approved = a.status === "approved" || (!a.status && a.status !== "pending");
      return approved && a.date && a.date.startsWith(selectedMonth);
    });
  }, [achievements, selectedMonth]);

  const awarded = useMemo(() => {
    const result: Record<string, any[]> = { gold: [], silver: [], bronze: [] };
    monthAchievements.forEach(a => {
      const lv = a.awards?.[selectedMonth];
      if (lv && (lv === "gold" || lv === "silver" || lv === "bronze")) result[lv].push(a);
    });
    (Object.keys(result) as (keyof typeof result)[]).forEach(k => result[k].sort((x, y) => (y.date || "").localeCompare(x.date || "")));
    return result;
  }, [monthAchievements, selectedMonth]);

  const top10 = useMemo(() => {
    const counts: Record<string, { name: string; dept: string; count: number }> = {};
    monthAchievements.forEach(a => {
      const name = a.teacherName;
      if (!name) return;
      if (!counts[name]) counts[name] = { name, dept: a.department || "غير محدد", count: 0 };
      counts[name].count += 1;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [monthAchievements]);

  const hasAnyAwards = awarded.gold.length + awarded.silver.length + awarded.bronze.length > 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div className={`${header} p-8 text-center`}>
        <h2 className="text-3xl font-black text-white mb-2 flex justify-center items-center gap-3">
          <Trophy className="text-[#ffb800]" size={36} />
          أفضل إنجازات الشهر
          <Trophy className="text-[#ffb800]" size={36} />
        </h2>
        <p className="text-purple-100 font-bold">إنجازات ذهبية وفضية وبرونزية 🌟</p>
      </div>

      {/* Month filter */}
      <div className="bg-white rounded-3xl p-5 shadow-xl border-2 border-purple-100 flex flex-col md:flex-row md:items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-black text-gray-600"><Calendar size={16} className="text-[#0087ed]" /> اختر الشهر:</label>
        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-gray-50 border-2 border-purple-100 rounded-2xl p-3 font-bold focus:ring-4 focus:ring-purple-200 focus:border-[#46178f] outline-none transition-all text-sm flex-1 md:max-w-xs">
          {getMonthOptions().map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center pt-20 text-purple-200">
          <Loader2 className="animate-spin mb-4 text-[#ffb800]" size={40} />
          <p className="font-bold">جاري التحميل...</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Award sections */}
          {!hasAnyAwards && top10.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 border-2 border-dashed border-purple-200 text-center text-gray-400 shadow-xl">
              <Star size={40} className="mx-auto mb-3 text-purple-200" />
              <p className="font-bold">لا توجد إنجازات منشورة في هذا الشهر بعد</p>
            </div>
          ) : (
            <>
              {LEVELS.map(lv => {
                const meta = LEVEL_META[lv];
                const Icon = meta.icon;
                const items = awarded[lv];
                if (items.length === 0) return null;
                return (
                  <div key={lv} className={`rounded-3xl border-2 bg-gradient-to-br p-6 md:p-8 ${meta.section}`}>
                    {/* Large cup medallion */}
                    <div className="flex flex-col items-center mb-6">
                      <div className={`relative w-24 h-24 md:w-32 md:h-32 rounded-full flex items-center justify-center shadow-2xl ${meta.badge}`}>
                        <Icon size={48} className="md:w-16 md:h-16" />
                        <span className="absolute -top-2 -right-2 bg-white text-sm font-black px-3 py-1 rounded-full shadow-lg border border-gray-100 text-gray-800">
                          {items.length}
                        </span>
                      </div>
                      <h3 className="text-2xl md:text-3xl font-black mt-3 text-center">{meta.label}</h3>
                      <p className="text-sm font-bold text-gray-500 mt-1">{items.length} {items.length === 1 ? "إنجاز" : "إنجازات"}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {items.map(a => (
                        <Link key={a.id} href={`/achievement/${a.id}`} className={`${card} p-4 rounded-2xl border-2 ${meta.border} hover:shadow-xl hover:-translate-y-1 transition-all group`}>
                          <div className="font-black text-[#46178f] text-sm leading-tight mb-1 line-clamp-2 group-hover:text-[#7b2cbf]">{a.title}</div>
                          <div className="text-xs text-gray-500 font-bold">{a.teacherName || "غير محدد"}</div>
                          <div className="flex items-center justify-between mt-2 text-xs font-bold text-gray-400">
                            <span>{a.department || "غير محدد"}</span>
                            <span>{a.date}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Top 10 — always visible */}
              <div className="bg-white rounded-3xl border-2 border-purple-100 shadow-xl overflow-hidden">
                <div className="bg-gradient-to-l from-[#46178f] to-[#7b2cbf] text-white p-6 flex items-center gap-3">
                  <Users size={24} className="text-yellow-300" />
                  <h3 className="font-black text-lg">أكثر المعلمات إنجازاً — <ActiveMonthLabel monthKey={selectedMonth} /></h3>
                </div>
                {top10.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 font-bold">لا توجد إنجازات منشورة في هذا الشهر</div>
                ) : (
                  <ol className="divide-y divide-purple-50">
                    {top10.map((t, i) => (
                      <li key={t.name} className="flex items-center gap-4 p-4 hover:bg-purple-50/50 transition-colors">
                        <span className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-full font-black text-sm ${i < 3 ? "bg-yellow-400 text-yellow-900" : "bg-purple-100 text-[#46178f]"}`}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-black text-gray-800 truncate">{t.name}</div>
                          <div className="text-xs font-bold text-gray-400">{t.dept}</div>
                        </div>
                        <span className="shrink-0 bg-[#eb1f36] text-white text-xs font-black px-3 py-1 rounded-full shadow">{t.count} إنجاز</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
