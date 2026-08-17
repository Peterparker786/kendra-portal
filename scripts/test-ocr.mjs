// test-ocr.mjs — sharp se text wali PNG banao, tesseract se OCR karo
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svg = `<svg width="900" height="800" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="white"/>
  <text x="40" y="70" font-family="Arial" font-size="34">Government of India</text>
  <text x="40" y="120" font-family="Arial" font-size="22">Unique Identification Authority of India</text>
  <text x="40" y="210" font-family="Arial" font-size="24">Name</text>
  <text x="40" y="260" font-family="Arial" font-size="32" font-weight="bold">Ramesh Kumar</text>
  <text x="40" y="330" font-family="Arial" font-size="24">Father / Husband Name</text>
  <text x="40" y="380" font-family="Arial" font-size="32" font-weight="bold">Suresh Kumar</text>
  <text x="40" y="450" font-family="Arial" font-size="24">Date of Birth</text>
  <text x="40" y="500" font-family="Arial" font-size="32" font-weight="bold">12/03/1990</text>
  <text x="40" y="570" font-family="Arial" font-size="24">Gender</text>
  <text x="40" y="620" font-family="Arial" font-size="32" font-weight="bold">Male</text>
  <text x="40" y="690" font-family="Arial" font-size="24">Aadhaar Number</text>
  <text x="40" y="740" font-family="Arial" font-size="36" font-weight="bold">1234 5678 9012</text>
  <text x="40" y="810" font-family="Arial" font-size="24">Address</text>
  <text x="40" y="860" font-family="Arial" font-size="28">14 MG Road, Pune, Maharashtra - 411001</text>
</svg>`;

const png = await sharp(Buffer.from(svg)).png().toBuffer();
const worker = await createWorker('eng', 1, {
  langPath: path.join(__dirname, '..', 'tessdata'),
  logger: () => {},
});
const { data } = await worker.recognize(png);
console.log('--- OCR output ---');
console.log(data.text);
await worker.terminate();
