// make-sample-pdf.js — sample client documents (Aadhaar letter, Niwas Praman)

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleDir = path.join(__dirname, '..', 'sample');
mkdirSync(sampleDir, { recursive: true });

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// lines: [{ x, y, text, size }] — y = PDF coords (bottom-left origin, A4 = 595 x 842)
function makePdf(lines) {
  const stream = lines
    .map((l) => `BT /F1 ${l.size || 10} Tf 1 0 0 1 ${l.x} ${l.y} Tm (${esc(l.text)}) Tj ET`)
    .join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

function writeSample(file, lines) {
  writeFileSync(path.join(sampleDir, file), makePdf(lines));
  console.log('wrote', path.join(sampleDir, file));
}

// ---- Aadhaar letter (label ek line pe, value agli line pe) ----
writeSample('aadhaar-ramesh.pdf', [
  { x: 60, y: 800, text: 'Government of India', size: 14 },
  { x: 60, y: 784, text: 'Unique Identification Authority of India', size: 10 },
  { x: 60, y: 740, text: 'Name', size: 10 },
  { x: 60, y: 726, text: 'Ramesh Kumar', size: 12 },
  { x: 60, y: 700, text: 'Father / Husband Name', size: 10 },
  { x: 60, y: 686, text: 'Suresh Kumar', size: 12 },
  { x: 60, y: 660, text: 'Date of Birth', size: 10 },
  { x: 60, y: 646, text: '12/03/1990', size: 12 },
  { x: 60, y: 620, text: 'Gender', size: 10 },
  { x: 60, y: 606, text: 'Male', size: 12 },
  { x: 60, y: 580, text: 'Aadhaar Number', size: 10 },
  { x: 60, y: 566, text: '1234 5678 9012', size: 14 },
  { x: 60, y: 540, text: 'Address', size: 10 },
  { x: 60, y: 526, text: '14 MG Road, Pune, Maharashtra - 411001', size: 11 },
]);

// ---- Niwas Praman (label: value same line) ----
writeSample('niwas-praman-priya.pdf', [
  { x: 60, y: 800, text: 'Zila Panchayat, Pune', size: 14 },
  { x: 60, y: 784, text: 'Niwas Praman Patra', size: 12 },
  { x: 60, y: 750, text: 'Applicant Name: Priya Sharma', size: 11 },
  { x: 60, y: 736, text: 'Father Name: Mahesh Sharma', size: 11 },
  { x: 60, y: 722, text: 'Address: 22 Lake View Rd, Nagpur', size: 11 },
  { x: 60, y: 708, text: 'Phone: 9123456780', size: 11 },
  { x: 60, y: 694, text: 'Registration No: NP-2024-5512', size: 11 },
  { x: 60, y: 680, text: 'Issue Date: 18/03/2024', size: 11 },
  { x: 60, y: 666, text: 'Valid Till: 17/03/2029', size: 11 },
  { x: 60, y: 652, text: 'Issued By: Tehsildar Office', size: 11 },
]);
