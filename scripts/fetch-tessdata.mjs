// scripts/fetch-tessdata.mjs — OCR language data download (build time)
// --------------------------------------------------------------------
// tessdata/ gitignored hai, isliye nayi machine (ya Render) pe khali hoti hai.
// Ye script `npm run build` ke waqt chalta hai aur tesseract.js ke liye
// eng + hin .traineddata.gz download karta hai (jsdelivr CDN se).
// Agar file pehle se hai (sahi size ki) to skip — idempotent.

import { mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tessdataDir = path.join(__dirname, '..', 'tessdata');

const LANGS = [
  ['eng', 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'],
  ['hin', 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/hin/4.0.0_best_int/hin.traineddata.gz'],
];

mkdirSync(tessdataDir, { recursive: true });

let ok = true;
for (const [lang, url] of LANGS) {
  const dest = path.join(tessdataDir, `${lang}.traineddata.gz`);
  try {
    if (existsSync(dest) && statSync(dest).size > 100 * 1024) {
      console.log(`[tessdata] ${lang} already present, skip`);
      continue;
    }
  } catch {
    // fallthrough -> download
  }
  console.log(`[tessdata] downloading ${lang} ...`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`[tessdata] ${lang} download failed HTTP ${res.status}`);
    ok = false;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  console.log(`[tessdata] ${lang} -> ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
}

if (!ok) process.exit(1);
console.log('[tessdata] done');
