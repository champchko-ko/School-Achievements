"use client";
import { useState } from 'react';
import { Trash2, ChevronDown, ChevronLeft } from 'lucide-react';

interface Teacher {
  name: string;
  department: string;
}

interface Props {
  teachers: Teacher[];
  departments: string[];
  onRemove: (index: number) => void;
}

export default function TeacherListByDept({ teachers, departments, onRemove }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Sort departments alphabetically
  const sortedDepts = [...departments].sort((a, b) => a.localeCompare(b, 'ar'));

  // Group and sort teachers by department
  const grouped: Record<string, Teacher[]> = {};
  for (const dept of sortedDepts) {
    grouped[dept] = teachers
      .filter(t => t.department === dept)
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }

  const totalCount = teachers.length;
  const deptCount = sortedDepts.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3 px-1">
        <p className="text-xs font-bold text-gray-400">
          {totalCount} معلمة في {deptCount} قسم
        </p>
        <button
          type="button"
          onClick={() => {
            const allExpanded = sortedDepts.every(d => !collapsed[d]);
            const newState: Record<string, boolean> = {};
            sortedDepts.forEach(d => { newState[d] = allExpanded; });
            setCollapsed(newState);
          }}
          className="text-[10px] font-bold text-[#46178f] hover:text-[#321067] transition-colors"
        >
          {sortedDepts.every(d => !collapsed[d]) ? 'طي الكل' : 'توسيع الكل'}
        </button>
      </div>

      <div className="max-h-[420px] overflow-y-auto space-y-1 pr-1 scrollbar-thin">
        {sortedDepts.map(dept => {
          const deptTeachers = grouped[dept];
          const isCollapsed = collapsed[dept];

          return (
            <div key={dept} className="border border-purple-100 rounded-2xl overflow-hidden bg-white">
              {/* Department Header */}
              <button
                type="button"
                onClick={() => setCollapsed(prev => ({ ...prev, [dept]: !prev[dept] }))}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-purple-50/80 hover:bg-purple-100/80 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-[#46178f]">{dept}</span>
                  <span className="text-[10px] bg-[#46178f] text-white px-1.5 py-0.5 rounded-full font-bold">
                    {deptTeachers.length}
                  </span>
                </div>
                {isCollapsed ? <ChevronLeft size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </button>

              {/* Teachers List */}
              {!isCollapsed && (
                <div className="px-3 py-2 flex flex-wrap gap-1.5">
                  {deptTeachers.length === 0 && (
                    <p className="text-[11px] text-gray-400 font-bold py-1">لا توجد معلمات في هذا القسم حالياً.</p>
                  )}
                  {deptTeachers.map((teacher) => {
                    const globalIdx = teachers.findIndex(
                      t => t.name === teacher.name && t.department === teacher.department
                    );
                    return (
                      <span
                        key={`${teacher.name}-${teacher.department}`}
                        className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-gray-700 text-xs font-bold px-2.5 py-1.5 rounded-xl"
                      >
                        {teacher.name}
                        <button
                          type="button"
                          onClick={() => onRemove(globalIdx)}
                          className="text-red-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {totalCount === 0 && (
          <p className="text-xs text-gray-400 p-4 font-bold text-center">لا توجد معلمات مضافة حالياً.</p>
        )}
      </div>
    </div>
  );
}
