"use client";
import { useState } from 'react';
import { Trash2, ChevronDown, ChevronLeft, AlertCircle } from 'lucide-react';

interface Teacher {
  name: string;
  department: string;
}

interface Props {
  teachers: (Teacher | string)[];
  departments: string[];
  onRemove: (index: number) => void;
}

export default function TeacherListByDept({ teachers, departments, onRemove }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Safely normalize all teacher records
  const normalizedTeachers: Teacher[] = (teachers || []).map(t =>
    typeof t === 'string'
      ? { name: t.trim(), department: '' }
      : { name: String(t?.name || '').trim(), department: String(t?.department || '').trim() }
  ).filter(t => Boolean(t.name));

  // Sort departments alphabetically
  const sortedDepts = [...departments].sort((a, b) => a.localeCompare(b, 'ar'));

  // Group and sort teachers by department
  const grouped: Record<string, Teacher[]> = {};
  for (const dept of sortedDepts) {
    grouped[dept] = normalizedTeachers
      .filter(t => t.department === dept)
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }

  // Teachers without a department or whose department was deleted/renamed
  const unassignedTeachers = normalizedTeachers
    .filter(t => !t.department || !sortedDepts.includes(t.department))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  const totalCount = normalizedTeachers.length;
  const deptCount = sortedDepts.length;

  const findGlobalIdx = (teacher: Teacher) => {
    return (teachers || []).findIndex(t => {
      const tName = (typeof t === 'string' ? t : t?.name || '').trim();
      const tDept = (typeof t === 'string' ? '' : t?.department || '').trim();
      return tName === teacher.name && tDept === teacher.department;
    });
  };

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
            newState['__unassigned__'] = allExpanded;
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
                    const globalIdx = findGlobalIdx(teacher);
                    return (
                      <span
                        key={`${teacher.name}-${teacher.department}`}
                        className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-gray-700 text-xs font-bold px-2.5 py-1.5 rounded-xl"
                      >
                        {teacher.name}
                        <button
                          type="button"
                          onClick={() => {
                            if (globalIdx !== -1) onRemove(globalIdx);
                          }}
                          className="text-red-300 hover:text-red-500 transition-colors"
                          title="حذف المعلمة"
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

        {/* Unassigned / Legacy Teachers (if any) */}
        {unassignedTeachers.length > 0 && (
          <div className="border border-amber-200 rounded-2xl overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => setCollapsed(prev => ({ ...prev, __unassigned__: !prev.__unassigned__ }))}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-amber-50 hover:bg-amber-100/80 transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertCircle size={14} className="text-amber-600" />
                <span className="text-xs font-black text-amber-800">معلمات بدون قسم محدد أو في قسم غير مدرج</span>
                <span className="text-[10px] bg-amber-600 text-white px-1.5 py-0.5 rounded-full font-bold">
                  {unassignedTeachers.length}
                </span>
              </div>
              {collapsed.__unassigned__ ? <ChevronLeft size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
            </button>

            {!collapsed.__unassigned__ && (
              <div className="px-3 py-2 flex flex-wrap gap-1.5">
                {unassignedTeachers.map((teacher) => {
                  const globalIdx = findGlobalIdx(teacher);
                  return (
                    <span
                      key={`unassigned-${teacher.name}-${teacher.department}`}
                      className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold px-2.5 py-1.5 rounded-xl"
                    >
                      {teacher.name} {teacher.department ? `(${teacher.department})` : ''}
                      <button
                        type="button"
                        onClick={() => {
                          if (globalIdx !== -1) onRemove(globalIdx);
                        }}
                        className="text-red-400 hover:text-red-600 transition-colors"
                        title="حذف المعلمة"
                      >
                        <Trash2 size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {totalCount === 0 && (
          <p className="text-xs text-gray-400 p-4 font-bold text-center">لا توجد معلمات مضافة حالياً.</p>
        )}
      </div>
    </div>
  );
}
