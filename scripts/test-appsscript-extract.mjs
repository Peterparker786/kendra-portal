// test-appsscript-extract.mjs
// Index.html me EXTRACTION START/END markers ke beech wala pure-JS code
// nikal kar Node me test karta hai (PDF path ke liye pdfjs-dist use hota hai).
import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const html = readFileSync(new URL('../appsscript/Index.html', import.meta.url), 'utf8');
const m = html.match(/\/\/ ---- EXTRACTION START ----([\s\S]*?)\/\/ ---- EXTRACTION END ----/);
if (!m) throw new Error('EXTRACTION markers nahi mile');
const src = m[1];
const extractFromText = new Function(src + '\n;return extractFromText;')();

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log('PASS', label); }
  else { fail++; console.log('FAIL', label, '->', detail); }
}

// ---- Test 1: Aadhaar-style (label ek line, value agli line) ----
const aadhaarText = [
  'Government of India', 'Unique Identification Authority of India',
  'Name', 'Ramesh Kumar',
  'Father / Husband Name', 'Suresh Kumar',
  'Date of Birth', '12/03/1990',
  'Gender', 'Male',
  'Aadhaar Number', '1234 5678 9012',
  'Address', '14 MG Road, Pune, Maharashtra - 411001',
].join('\n');
let r = extractFromText(aadhaarText);
check('Aadhaar: name', r.customer.name === 'Ramesh Kumar', r.customer.name);
check('Aadhaar: father', r.customer.father === 'Suresh Kumar', r.customer.father);
check('Aadhaar: dob', r.customer.dob === '12/03/1990', r.customer.dob);
check('Aadhaar: gender', r.customer.gender === 'Male', r.customer.gender);
check('Aadhaar: aadhaar', r.customer.aadhaar === '1234 5678 9012', r.customer.aadhaar);
check('Aadhaar: type', r.document.type === 'Aadhaar Card', r.document.type);

// ---- Test 2: Niwas Praman (Label: value same line) ----
const niwasText = [
  'Zila Panchayat, Pune', 'Niwas Praman Patra',
  'Applicant Name: Priya Sharma', 'Father Name: Mahesh Sharma',
  'Address: 22 Lake View Rd, Nagpur', 'Phone: 9123456780',
  'Registration No: NP-2024-5512', 'Issue Date: 18/03/2024',
  'Valid Till: 17/03/2029', 'Issued By: Tehsildar Office',
].join('\n');
r = extractFromText(niwasText);
check('Niwas: name', r.customer.name === 'Priya Sharma', r.customer.name);
check('Niwas: phone', r.customer.phone === '9123456780', r.customer.phone);
check('Niwas: docNo', r.document.docNo === 'NP-2024-5512', r.document.docNo);
check('Niwas: issue', r.document.issueDate === '18/03/2024', r.document.issueDate);
check('Niwas: validTill', r.document.validTill === '17/03/2029', r.document.validTill);
check('Niwas: issuedBy', r.document.issuedBy === 'Tehsildar Office', r.document.issuedBy);
check('Niwas: type', r.document.type === 'Niwas Praman (Residence)', r.document.type);

// ---- Test 3: PDF path (pdfjs-dist se text -> extractFromText) ----
async function pdfText(buffer) {
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    const map = {};
    c.items.forEach((it) => {
      if (!it.str || !it.str.trim()) return;
      const y = Math.round(it.transform[5]);
      if (!map[y]) map[y] = [];
      map[y].push({ x: it.transform[4], txt: it.str });
    });
    Object.keys(map).sort((a, b) => Number(b) - Number(a)).forEach((y) => {
      map[y].sort((a, b) => a.x - b.x);
      out.push(map[y].map((o) => o.txt).join(' '));
    });
  }
  return out.join('\n');
}
const pdfBuf = readFileSync(new URL('../sample/aadhaar-ramesh.pdf', import.meta.url));
const pdfTextStr = await pdfText(pdfBuf);
r = extractFromText(pdfTextStr);
check('PDF: name', r.customer.name === 'Ramesh Kumar', r.customer.name);
check('PDF: dob', r.customer.dob === '12/03/1990', r.customer.dob);
check('PDF: aadhaar', r.customer.aadhaar === '1234 5678 9012', r.customer.aadhaar);
check('PDF: type', r.document.type === 'Aadhaar Card', r.document.type);

// ---- Test 4: OCR-style text (image se aane wala raw text) ----
const ocrText = [
  'Government of India', 'Unique Identification Authority of India', 'Name',
  'Sunita Devi', 'Father / Husband Name', 'Rajendra Prasad', 'Date of Birth',
  '05/11/1987', 'Gender', 'Female', 'Aadhaar Number', '9876 5432 1098',
  'Address', 'Village Kheri, Distt Jhansi, Uttar Pradesh - 284001',
].join('\n');
r = extractFromText(ocrText);
check('OCR: name', r.customer.name === 'Sunita Devi', r.customer.name);
check('OCR: gender', r.customer.gender === 'Female', r.customer.gender);
check('OCR: aadhaar', r.customer.aadhaar === '9876 5432 1098', r.customer.aadhaar);
check('OCR: type', r.document.type === 'Aadhaar Card', r.document.type);

console.log('\nRESULT:', pass, 'pass,', fail, 'fail');
process.exit(fail ? 1 : 0);
