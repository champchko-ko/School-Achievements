"use client";
import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function Footer() {
  const [teacherName, setTeacherName] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, "settings", "global_info");
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.computerDeptTeacher) setTeacherName(data.computerDeptTeacher);
        }
      } catch {
        // silent
      }
    };
    fetchSettings();
  }, []);

  const year = new Date().getFullYear();

  return (
    <footer className="shrink-0 text-center py-3 px-4 border-t border-white/10 bg-black/20 text-purple-300/60 text-xs font-bold print:hidden">
      {teacherName && <span>{teacherName} — </span>}
      <span>حقوق الطبع والنشر © {year}</span>
    </footer>
  );
}
