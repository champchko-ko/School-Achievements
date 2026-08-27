// src/lib/validate-lists.ts
// Server-side enforcement: department and teacher must come from the
// curated lists configured in settings (defense-in-depth on top of the
// client-side selects). Scalars are compared case-insensitively after
// trimming; matches tolerate surrounding whitespace.

import { getAdminDb, doc, getDoc } from './firebase-admin';

export type ListValidationResult = {
  ok: boolean;
  error?: string;
  department: string;
  teacherName: string;
};

const norm = (v: string): string => String(v || '').trim().toLowerCase();

export async function validateDepartmentAndTeacher(
  department: string,
  teacherName: string
): Promise<ListValidationResult> {
  const sDepartment = String(department || '').trim();
  const sTeacher = String(teacherName || '').trim();

  let settingsDepartments: string[] = [];
  let settingsTeachers: { name: string; department: string }[] = [];

  try {
    const db = getAdminDb();
    const snap = await getDoc(doc(db, 'settings', 'global_info'));
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.departments)) settingsDepartments = data.departments.map(String);
      if (Array.isArray(data.teachers)) {
        settingsTeachers = data.teachers.map((t: any) =>
          typeof t === 'string'
            ? { name: t, department: '' }
            : { name: String(t?.name || ''), department: String(t?.department || '') }
        );
      }
    }
  } catch (e) {
    // If settings can't be read, fail open (fall back to allowing) so the
    // app keeps working if the settings collection is missing.
  }

  // Only enforce when the school has configured a curated list. If no
  // departments/teachers are configured yet, skip validation so first-run
  // setups aren't blocked.
  if (settingsDepartments.length === 0 && settingsTeachers.length === 0) {
    return { ok: true, department: sDepartment, teacherName: sTeacher };
  }

  if (!sDepartment) {
    return { ok: false, error: 'اختر القسم من القائمة المضافة في الإعدادات', department: '', teacherName: sTeacher };
  }
  if (settingsDepartments.length > 0 && !settingsDepartments.map(norm).includes(norm(sDepartment))) {
    return { ok: false, error: 'القسم المحدد غير موجود في قائمة الأقسام المعتمدة. اختر من القائمة.', department: sDepartment, teacherName: sTeacher };
  }

  if (!sTeacher) {
    return { ok: false, error: 'اختر المعلمة من القائمة المضافة في الإعدادات', department: sDepartment, teacherName: '' };
  }
  const deptMatches = settingsTeachers.filter(t => !t.department || norm(t.department) === norm(sDepartment));
  const teacherOK = deptMatches.some(t => norm(t.name) === norm(sTeacher));
  if (!teacherOK) {
    return { ok: false, error: 'المعلمة المحددة غير موجودة ضمن قسم "' + sDepartment + '". اختر من القائمة.', department: sDepartment, teacherName: sTeacher };
  }

  return { ok: true, department: sDepartment, teacherName: sTeacher };
}
