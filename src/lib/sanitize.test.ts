import { describe, it, expect } from 'vitest';
import { stripHtml, preventExcelFormula, sanitizeText, sanitizeStringArray, sanitizeAchievementPayload, sanitizeSettingsPayload } from './sanitize';

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('removes script tags with content', () => {
    expect(stripHtml('Safe<script>alert("xss")</script> text')).toBe('Safealert("xss") text');
  });

  it('handles empty string', () => {
    expect(stripHtml('')).toBe('');
  });

  it('handles null/undefined', () => {
    expect(stripHtml(null as any)).toBe('');
    expect(stripHtml(undefined as any)).toBe('');
  });

  it('preserves text without tags', () => {
    expect(stripHtml('No tags here')).toBe('No tags here');
  });
});

describe('preventExcelFormula', () => {
  it('prefixes = with tab', () => {
    expect(preventExcelFormula('=SUM(A1)')).toBe('\t=SUM(A1)');
  });

  it('prefixes + with tab', () => {
    expect(preventExcelFormula('+CMD')).toBe('\t+CMD');
  });

  it('prefixes - with tab', () => {
    expect(preventExcelFormula('-RM')).toBe('\t-RM');
  });

  it('prefixes @ with tab', () => {
    expect(preventExcelFormula('@SYSTEM()')).toBe('\t@SYSTEM()');
  });

  it('does not prefix safe strings', () => {
    expect(preventExcelFormula('Hello world')).toBe('Hello world');
  });

  it('handles empty string', () => {
    expect(preventExcelFormula('')).toBe('');
  });
});

describe('sanitizeText', () => {
  it('strips HTML and prevents formula injection', () => {
    expect(sanitizeText('<b>=HACK</b>')).toBe('\t=HACK');
  });

  it('trims whitespace', () => {
    expect(sanitizeText('  hello  ')).toBe('hello');
  });

  it('truncates long text', () => {
    const long = 'a'.repeat(15000);
    expect(sanitizeText(long).length).toBe(10000);
  });

  it('handles empty input', () => {
    expect(sanitizeText('')).toBe('');
  });
});

describe('sanitizeStringArray', () => {
  it('sanitizes each item', () => {
    expect(sanitizeStringArray(['<b>A</b>', 'B'])).toEqual(['A', 'B']);
  });

  it('filters empty results', () => {
    expect(sanitizeStringArray(['', '  ', 'valid'])).toEqual(['valid']);
  });

  it('handles null/undefined', () => {
    expect(sanitizeStringArray(null as any)).toEqual([]);
  });
});

describe('sanitizeAchievementPayload', () => {
  it('sanitizes text fields', () => {
    const result = sanitizeAchievementPayload({
      teacherName: '<script>evil</script> Mrs. Smith',
      title: '=SUM(A1) My Title',
      desc: 'Clean description',
      department: '<b>Math</b>',
    });
    expect(result.teacherName).toBe('evil Mrs. Smith');
    expect(result.title).toBe('\t=SUM(A1) My Title');
    expect(result.department).toBe('Math');
  });

  it('filters non-Cloudinary URLs from attachmentUrls', () => {
    const result = sanitizeAchievementPayload({
      attachmentUrls: [
        'https://res.cloudinary.com/demo/file.pdf',
        'https://res.cloudinary.com/demo/img.jpg',
        'https://arbitrary-domain.com/evil.exe',
        'javascript:alert(1)',
        'not-a-url',
      ],
    });
    expect(result.attachmentUrls).toHaveLength(2);
  });

  it('limits attachmentUrls to MAX_ARRAY_LENGTH', () => {
    const urls = Array.from({ length: 150 }, (_, i) => `https://res.cloudinary.com/demo/${i}.pdf`);
    const result = sanitizeAchievementPayload({ attachmentUrls: urls });
    expect(result.attachmentUrls.length).toBeLessThanOrEqual(100);
  });
});

describe('sanitizeSettingsPayload', () => {
  it('normalizes legacy string teachers and object teachers', () => {
    const result = sanitizeSettingsPayload({
      teachers: [
        'أمل',
        { name: '<b>سارة</b>', department: '<i>الرياضيات</i>' },
        { name: '', department: 'العلوم' },
        '   ',
      ],
    });
    expect(result.teachers).toEqual([
      { name: 'أمل', department: '' },
      { name: 'سارة', department: 'الرياضيات' },
    ]);
  });

  it('allows more than 100 teachers up to 1000', () => {
    const teachersList = Array.from({ length: 250 }, (_, i) => ({
      name: `Teacher ${i}`,
      department: 'Dept',
    }));
    const result = sanitizeSettingsPayload({ teachers: teachersList });
    expect(result.teachers).toHaveLength(250);
  });

  it('sanitizes leadership fields including computer dept fields', () => {
    const result = sanitizeSettingsPayload({
      schoolName: '<b>مدرسة الأمل</b>',
      computerDeptTeacher: '<b>أمل</b>',
      computerDeptHead: '=SUM(1,2) رئيس القسم',
    });
    expect(result.schoolName).toBe('مدرسة الأمل');
    expect(result.computerDeptTeacher).toBe('أمل');
    expect(result.computerDeptHead).toBe('\t=SUM(1,2) رئيس القسم');
  });
});
