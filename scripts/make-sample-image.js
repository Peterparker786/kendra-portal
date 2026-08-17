// make-sample-image.js — sample Aadhaar-style document as JPEG + PNG (OCR test ke liye)
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleDir = path.join(__dirname, '..', 'sample');
mkdirSync(sampleDir, { recursive: true });

const svg = `<svg width="1000" height="900" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="white"/>
  <rect x="30" y="30" width="940" height="840" fill="none" stroke="#cccccc" stroke-width="2"/>
  <text x="60" y="100" font-family="Arial" font-size="38" font-weight="bold">Government of India</text>
  <text x="60" y="145" font-family="Arial" font-size="22">Unique Identification Authority of India</text>
  <text x="60" y="230" font-family="Arial" font-size="24" fill="#555555">Name</text>
  <text x="60" y="275" font-family="Arial" font-size="34" font-weight="bold">Sunita Devi</text>
  <text x="60" y="350" font-family="Arial" font-size="24" fill="#555555">Father / Husband Name</text>
  <text x="60" y="395" font-family="Arial" font-size="34" font-weight="bold">Rajendra Prasad</text>
  <text x="60" y="470" font-family="Arial" font-size="24" fill="#555555">Date of Birth</text>
  <text x="60" y="515" font-family="Arial" font-size="34" font-weight="bold">05/11/1987</text>
  <text x="60" y="590" font-family="Arial" font-size="24" fill="#555555">Gender</text>
  <text x="60" y="635" font-family="Arial" font-size="34" font-weight="bold">Female</text>
  <text x="60" y="710" font-family="Arial" font-size="24" fill="#555555">Aadhaar Number</text>
  <text x="60" y="760" font-family="Arial" font-size="38" font-weight="bold">9876 5432 1098</text>
  <text x="60" y="830" font-family="Arial" font-size="24" fill="#555555">Address</text>
  <text x="60" y="870" font-family="Arial" font-size="28">Village Kheri, Distt Jhansi, Uttar Pradesh - 284001</text>
</svg>`;

const buf = Buffer.from(svg);
await sharp(buf).jpeg({ quality: 90 }).toFile(path.join(sampleDir, 'aadhaar-sunita.jpg'));
await sharp(buf).png().toFile(path.join(sampleDir, 'aadhaar-sunita.png'));
console.log('wrote sample/aadhaar-sunita.jpg + .png');
