// scripts/test-ai-extract.mjs
// AI (Gemini) path ka test — real API nahi, mock response se.
// 1) aiExtract image parsing (```json block style)
// 2) aiExtract PDF mime
// 3) analyzeDocument merge: blank image -> tesseract fail -> AI fields bharta hai

process.env.GEMINI_API_KEY = 'TEST-KEY-DO-NOT-USE'; // config.js import se pehle

const { readFile } = await import('node:fs/promises');
const sharp = (await import('sharp')).default;

let calls = 0;
global.fetch = async (url, opts) => {
  calls++;
  const body = JSON.parse(opts.body);
  const mime = body.contents[0].parts[0].inlineData.mimeType;
  console.log(`[mock] Gemini call ${calls} -> mime=${mime} | base64Len=${body.contents[0].parts[0].inlineData.data.length}`);
  const payload = {
    text: 'Mock AI extracted text from document',
    docType: 'Niwas Praman (Residence)',
    fields: {
      customerName: 'Ravi Kumar',
      fatherName: 'Mohan Lal',
      dob: '15/08/1992',
      gender: 'Male',
      aadhaarNo: '9999 8888 7777',
      address: 'Gram Panchayat Kheri, Jhansi',
      phone: '9876543210',
      docNo: 'NP/2024/12345',
      issueDate: '10/01/2024',
      validTill: '09/01/2029',
      issuedBy: 'Tehsildar Office',
    },
  };
  const text = '```json\n' + JSON.stringify(payload) + '\n```';
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
};

const { aiExtract } = await import('../ai.js');
const { analyzeDocument } = await import('../extract.js');

// 1) aiExtract: image
const jpg = await readFile(new URL('../sample/aadhaar-sunita.jpg', import.meta.url));
const ai1 = await aiExtract(jpg, 'photo.jpg');
console.log('1) aiExtract image ->', ai1 ? `${ai1.fields.customerName} / ${ai1.docType}` : 'NULL');

// 2) aiExtract: pdf
const pdf = await readFile(new URL('../sample/aadhaar-ramesh.pdf', import.meta.url));
const ai2 = await aiExtract(pdf, 'scan.pdf');
console.log('2) aiExtract pdf   ->', ai2 ? ai2.fields.customerName : 'NULL');

// 3) analyzeDocument merge (blank image -> tesseract fail -> AI fills)
const blank = await sharp({
  create: { width: 300, height: 150, channels: 3, background: { r: 255, g: 255, b: 255 } },
})
  .png()
  .toBuffer();
const merged = await analyzeDocument(blank, 'IMG_20230702_185607.jpg');
console.log('3) merge -> customer:', merged.customerName, '| docType:', merged.docType);
console.log('   fields:', merged.fields.map((f) => `${f.key}=${f.value}`).join(' | '));

const pass =
  ai1?.fields?.customerName === 'Ravi Kumar' &&
  ai1?.docType === 'Niwas Praman (Residence)' &&
  ai2?.fields?.customerName === 'Ravi Kumar' &&
  merged.customerName === 'Ravi Kumar' &&
  merged.fields.some((f) => f.key === 'Aadhaar No' && f.value === '9999 8888 7777') &&
  merged.fields.some((f) => f.key === 'Valid Till' && f.value === '09/01/2029');
console.log(pass ? 'ALL AI TESTS PASS' : 'AI TESTS FAILED');
process.exit(pass ? 0 : 1);
