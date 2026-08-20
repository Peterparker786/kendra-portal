// config.js — Google Sheet sync + AI Vision (optional)
//
// Secrets .env file me rakho (wo gitignored hai) — config.js repo me safe
// rehta hai. .env ka format:  KEY=VALUE  (har line pe ek)
// Ya seedha environment variables bhi chalti hain.

// Chhota sa .env loader (koi dependency nahi) — .env ho to use load karo
import { readFileSync } from 'node:fs';
try {
  const envFile = new URL('./.env', import.meta.url);
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
} catch {
  // .env nahi hai — environment variables use hongi
}

// ---------------------------------------------------------------
// 1) GOOGLE SHEET SYNC (optional)
//    Apna Google Apps Script Web App URL yahan daalo taaki document confirm
//    hote hi data aapki Google Sheet me bhi save ho jaye. Example:
//
//      export const GOOGLE_SHEET_WEBHOOK_URL = 'https://script.google.com/macros/s/XXXX/exec';
//
//    Khali chhodo ("") to sync band rahega (portal apne aap me save karta rahega).
//    GSCRIPT_URL environment variable bhi kaam karta hai (uski priority zyada hai).
export const GOOGLE_SHEET_WEBHOOK_URL = process.env.GSCRIPT_URL || '';

// ---------------------------------------------------------------
// 2) AI VISION — Google Gemini (optional)
//    Dhundhli / tedi / handwritten / Hindi documents ke liye. Jab Tesseract
//    (offline OCR) se kuch na nikle, tab photo/PDF seedha AI ko jata hai.
//
//    Gemini key: https://aistudio.google.com/apikey  ->  AIza... wali
//    .env me:  GEMINI_API_KEY=AIza...
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

// ---------------------------------------------------------------
// 3) AI ROUTER — NaraRouter (https://router.bynara.id) jaisi OpenAI-compatible
//    service bhi support hai. Dashboard me: API keys -> copy -> .env me daalo.
//    Model name bhi wahi jo dashboard me dikhe (jaise agnes-2.0-flash).
//    .env me:  NARA_ROUTER_KEY=sk-...   NARA_ROUTER_BASE=...   NARA_ROUTER_MODEL=...
export const NARA_ROUTER_KEY = process.env.NARA_ROUTER_KEY || '';
export const NARA_ROUTER_BASE = process.env.NARA_ROUTER_BASE || 'https://router.bynara.id/v1';
export const NARA_ROUTER_MODEL = process.env.NARA_ROUTER_MODEL || 'agnes-2.0-flash';

// Groq: fast + free (console.groq.com se key lo)
export const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
export const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.6-27b';

// ---------------------------------------------------------------
// 4) GOOGLE SHEET URL — topbar ka "Open Excel (Google Sheet)" button
//    ise kholta hai. Apni spreadsheet ka link yahan daalo.
//    .env me:  GOOGLE_SHEET_URL=https://docs.google.com/spreadsheets/d/.../edit
export const GOOGLE_SHEET_URL =
  process.env.GOOGLE_SHEET_URL ||
  'https://docs.google.com/spreadsheets/d/19Ob3O5bCtQuOSRsbpSdAOTOm3pv0O1gGt-1ek8cSzpI/edit';
