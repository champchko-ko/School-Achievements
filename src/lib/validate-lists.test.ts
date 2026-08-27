import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase-admin', () => {
  let settingsData: any = null;
  return {
    getAdminDb: vi.fn(() => ({})),
    doc: vi.fn(() => ({})),
    getDoc: vi.fn(async () => ({
      exists: () => !!settingsData,
      data: () => settingsData,
    })),
    __setSettings: (data: any) => { settingsData = data; },
  };
});

// @ts-ignore
import { __setSettings } from './firebase-admin';
import { validateDepartmentAndTeacher } from './validate-lists';

const run = (data: any) => {
  __setSettings(data);
  return validateDepartmentAndTeacher.bind(null);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('validateDepartmentAndTeacher', () => {
  it('allows any value when no lists configured (first-run)', async () => {
    __setSettings(null);
    const res = await validateDepartmentAndTeacher('الرياضيات', 'أمل');
    expect(res.ok).toBe(true);
    expect(res.department).toBe('الرياضيات');
    expect(res.teacherName).toBe('أمل');
  });

  it('accepts a valid department and teacher from settings', async () => {
    __setSettings({
      departments: ['الرياضيات', 'العلوم'],
      teachers: [
        { name: 'أمل', department: 'الرياضيات' },
        { name: 'سارة', department: 'العلوم' },
      ],
    });
    const res = await validateDepartmentAndTeacher('الرياضيات', 'أمل');
    expect(res.ok).toBe(true);
    expect(res.department).toBe('الرياضيات');
    expect(res.teacherName).toBe('أمل');
  });

  it('rejects a department not in the settings list', async () => {
    __setSettings({
      departments: ['الرياضيات', 'العلوم'],
      teachers: [{ name: 'أمل', department: 'الرياضيات' }],
    });
    const res = await validateDepartmentAndTeacher('التاريخ', 'أمل');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('غير موجود');
  });

  it('rejects a teacher not in the settings list for the department', async () => {
    __setSettings({
      departments: ['الرياضيات', 'العلوم'],
      teachers: [{ name: 'أمل', department: 'الرياضيات' }],
    });
    const res = await validateDepartmentAndTeacher('الرياضيات', 'دخيل');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('غير موجودة');
  });

  it('accepts case/whitespace-tolerant matches', async () => {
    __setSettings({
      departments: ['الرياضيات', 'العلوم'],
      teachers: [{ name: 'أمل', department: 'الرياضيات' }],
    });
    const res = await validateDepartmentAndTeacher('  الرياضيات ', 'أمل');
    expect(res.ok).toBe(true);
  });
});
