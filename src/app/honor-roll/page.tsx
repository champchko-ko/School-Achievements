"use client";
import { useState, useEffect } from 'react';
import { Trophy, Medal, Award, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export default function HonorRoll() {
  const [podiumData, setPodiumData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'achievements'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const teacherStats: Record<string, any> = {};

      // 1. Group achievements by teacherName
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const name = data.teacherName;
        if (!name) return;

        if (!teacherStats[name]) {
          teacherStats[name] = { name, dept: data.department || 'غير محدد', points: 0 };
        }
        // Award 10 points per achievement (you can change this scoring logic later)
        teacherStats[name].points += 10;
      });

      // 2. Sort teachers by points (Descending)
      const sorted = Object.values(teacherStats).sort((a, b) => b.points - a.points);

      // 3. Construct Podium Array: [Silver(2), Gold(1), Bronze(3)]
      const constructedPodium = [];
      if (sorted[1]) constructedPodium.push({ id: 2, ...sorted[1], rank: 2, height: "h-32", color: "bg-[#C0C0C0]", textColor: "text-gray-700", icon: <Medal size={32} className="text-[#C0C0C0]" /> });
      if (sorted[0]) constructedPodium.push({ id: 1, ...sorted[0], rank: 1, height: "h-44", color: "bg-[#FFD700]", textColor: "text-yellow-900", icon: <Trophy size={40} className="text-[#FFD700]" /> });
      if (sorted[2]) constructedPodium.push({ id: 3, ...sorted[2], rank: 3, height: "h-24", color: "bg-[#CD7F32]", textColor: "text-white", icon: <Award size={28} className="text-[#CD7F32]" /> });

      setPodiumData(constructedPodium);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      
      {/* Header */}
      <div className="bg-white rounded-2xl p-8 shadow-lg border border-purple-100/50 text-center">
        <h2 className="text-3xl font-black text-[#4a154b] mb-2 flex justify-center items-center gap-3">
          <Trophy className="text-[#ffb000]" size={36} />
          لوحة الشرف
          <Trophy className="text-[#ffb000]" size={36} />
        </h2>
        <p className="text-gray-500 font-bold">أكثر المعلمات تميزاً وإنجازاً هذا الشهر 🌟</p>
      </div>

      {/* Kahoot-Style Podium */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center pt-20 text-purple-200">
          <Loader2 className="animate-spin mb-4 text-[#ffb000]" size={40} />
          <p className="font-bold">جاري تحميل لوحة الشرف المباشرة...</p>
        </div>
      ) : podiumData.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 border-2 border-dashed border-purple-200 text-center text-gray-400 mt-10 shadow-lg">
          <p className="font-bold">لا توجد إنجازات حتى الآن. بادر بإضافة الإنجاز الأول!</p>
        </div>
      ) : (
        <div className="flex justify-center items-end gap-2 md:gap-6 pt-10">
          {podiumData.map((teacher) => (
          <Link href={`/?teacher=${encodeURIComponent(teacher.name)}`} key={teacher.id} className="flex flex-col items-center group w-28 md:w-40 cursor-pointer">
            
            {/* Floating Info Card */}
            <div className="bg-white w-full p-3 md:p-4 rounded-xl shadow-lg border border-purple-100/50 mb-4 text-center transform transition-all duration-300 group-hover:-translate-y-3 hover:shadow-xl hover:border-orange-200 relative z-10">
               <div className="flex justify-center mb-2">{teacher.icon}</div>
               <div className="font-black text-[#4a154b] text-sm md:text-base leading-tight mb-1">{teacher.name}</div>
               <div className="text-xs text-gray-500 font-bold">{teacher.dept}</div>
               
               {/* Points Badge */}
               <div className="absolute -top-3 -right-3 md:-right-4 bg-[#e21b3c] text-white text-xs md:text-sm font-black px-3 py-1 rounded-full shadow-lg border-2 border-white">
                 {teacher.points} pt
               </div>
            </div>

            {/* Solid Podium Block */}
            <div className={`w-full rounded-t-lg ${teacher.color} flex justify-center items-start pt-4 shadow-inner relative overflow-hidden transition-all duration-500 ${teacher.height}`}>
               <div className="absolute inset-0 bg-white/20 w-1/2"></div> {/* Shine effect */}
               <span className={`text-4xl font-black opacity-60 ${teacher.textColor}`}>{teacher.rank}</span>
            </div>

          </Link>
        ))}
        </div>
      )}

    </div>
  );
}