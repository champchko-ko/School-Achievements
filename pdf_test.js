const pdfMake = require('pdfmake/build/pdfmake');
const fs = require('fs');

const regular = fs.readFileSync('public/fonts/Tajawal-Regular.ttf').toString('base64');
const bold = fs.readFileSync('public/fonts/Tajawal-Bold.ttf').toString('base64');
pdfMake.addFontContainer({
  vfs: { 'Tajawal-Regular.ttf': regular, 'Tajawal-Bold.ttf': bold },
  fonts: { Tajawal: { normal: 'Tajawal-Regular.ttf', bold: 'Tajawal-Bold.ttf', italics: 'Tajawal-Regular.ttf', bolditalics: 'Tajawal-Bold.ttf' } },
});

const docDefinition = {
  pageSize: 'A4',
  pageMargins: [36, 36, 36, 36],
  defaultStyle: { font: 'Tajawal', fontSize: 9, alignment: 'right' },
  styles: { sectionTitle: { fontSize: 11, bold: true, color: '#0087ed' }, tableHeader: { bold: true, fontSize: 9, color: '#ffffff', fillColor: '#46178f' } },
  content: [
    { text: 'القسم: اللغة العربية', style: 'sectionTitle' },
    {
      table: {
        headerRows: 1,
        widths: ['*', 60, 60, 100],
        body: [
          ['الإنجاز', 'التاريخ', 'التقييم', 'المرفقات'].map(h => ({ text: h, style: 'tableHeader', alignment: 'center' })),
          [
            'إذاعة مدرسية متميزة',
            '2026-07-20',
            '95 - ذهبي',
            { stack: [
                { image: 'data:image/jpeg;base64,' + fs.readFileSync('/tmp/thumb.jpg').toString('base64'), width: 40, height: 26, link: 'https://school-achievements-six.vercel.app/achievement/abc123' },
                { text: 'مستند 1: mm0yehfjcxzjcmsjq8xn.pdf', link: 'https://school-achievements-six.vercel.app/achievement/abc123', color: '#0087ed', decoration: 'underline', fontSize: 8 }
              ] }
          ],
        ],
      },
      layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#dddddd', vLineColor: () => '#dddddd', paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4 },
    },
  ],
};

(async () => {
  const buffer = await pdfMake.createPdf(docDefinition).getBuffer();
  fs.writeFileSync('/tmp/test-thumb.pdf', buffer);
  console.log('PDF with video thumbnail written:', buffer.length, 'bytes');
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
