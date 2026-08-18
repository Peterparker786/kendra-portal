// ai.js — AI Vision se photo/PDF me se data nikalna
// -------------------------------------------------------------
// Tesseract (offline OCR) jab kuch na nikale (dhundhli / tedi / handwritten /
// Hindi document), tab yeh AI fallback chalta hai.
//
// DO provider support hain (jo bhi key available ho wahi use hota hai):
//   1. Google Gemini — AIza... key (aistudio.google.com/apikey se)
//   2. NaraRouter    — OpenAI-compatible router (router.bynara.id), model
//                      dashboard me jo dikhe (jaise agnes-2.0-flash)
//
// Bina key ke yeh module chupchap null return karta hai — portal waise hi
// chalta hai, sirf AI fallback band rehta hai.

import {
  GEMINI_API_KEY,
  NARA_ROUTER_KEY,
  NARA_ROUTER_BASE,
  NARA_ROUTER_MODEL,
} from './config.js';
import sharp from 'sharp';

// Gemini ke liye models try karne ka order: env me GEMINI_MODEL diya ho to wahi,
// warna gemini-2.5-flash pehle aur gemini-2.0-flash fallback.
const MODELS = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : ['gemini-2.5-flash', 'gemini-2.0-flash'];

function mimeFor(filename) {
  const l = String(filename || '').toLowerCase();
  if (l.endsWith('.pdf')) return 'application/pdf';
  if (l.endsWith('.png')) return 'image/png';
  if (l.endsWith('.jpg') || l.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/jpeg';
}

const PROMPT = [
  'You are a data entry assistant for a Jan Seva Kendra (government service center) in India.',
  'Read the attached document image carefully. It may be Hindi, English, or mixed,',
  'printed or handwritten, and it may be slightly rotated, tilted, or blurry.',
  'Extract ONLY what is actually written in the document. Do NOT guess or invent values.',
  'If a value is unreadable, leave that field as an empty string.',
  'Return ONLY valid JSON with this exact structure:',
  '{',
  '  "text": "the full readable text of the document",',
  '  "docType": "one of: Aadhaar Card, Aadhaar Correction, PAN Card, Niwas Praman (Residence), Domicile Certificate, Cast Certificate, Income Certificate, Birth Certificate, Death Certificate, Marriage Registration, Voter ID, Ration Card, Student / University Registration, Marksheet (BSc / BA / 12th), Scholarship Documents, Other",',
  '  "fields": {',
  '    "customerName": "", "fatherName": "", "dob": "", "gender": "",',
  '    "aadhaarNo": "", "address": "", "phone": "", "docNo": "",',
  '    "panNo": "", "rollNo": "", "universityRegNo": "", "result": "",',
  '    "issueDate": "", "validTill": "", "issuedBy": ""',
  '  }',
  '}',
  'Rules: dates in DD/MM/YYYY format. aadhaarNo should contain all 12 digits (spaces allowed).',
  'For a PAN Card, the PAN number is exactly 10 characters: 5 letters + 4 digits + 1 letter',
  '(e.g. ABCDE1234F). Put it ONLY in panNo. NEVER put the PAN number in aadhaarNo.',
  'On a PAN card, the name shown on the card goes in customerName and the father name in fatherName.',
  'For a Marksheet (BSc/BA/12th), put the exam roll number in rollNo, the university',
  'enrollment/registration number in universityRegNo, and the overall result',
  '(Pass / First / Second / Third Division) in result. The university name goes in issuedBy.',
  'Output nothing except the JSON object.',
].join('\n');

/**
 * AI ko bhejne se pehle image ko chhota/clean karo:
 * - 1568px se bade ko downscale (Gemini ka sweet spot) -> fast + kam tokens
 * - EXIF orientation fix (ulti phone photo seedhi)
 * PDF ko as-is bhejo (text/page structure chahiye).
 */
async function shrinkForAI(buffer, filename) {
  const mime = mimeFor(filename);
  if (mime === 'application/pdf') {
    return { mime, data: buffer.toString('base64') };
  }
  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;
    const maxDim = Math.max(w, h);
    if (maxDim > 1568) {
      const scale = 1568 / maxDim;
      const small = await sharp(buffer)
        .rotate()
        .resize(Math.round(w * scale), Math.round(h * scale))
        .jpeg({ quality: 88 })
        .toBuffer();
      return { mime: 'image/jpeg', data: small.toString('base64') };
    }
    const clean = await sharp(buffer).rotate().jpeg({ quality: 90 }).toBuffer();
    return { mime: 'image/jpeg', data: clean.toString('base64') };
  } catch {
    return { mime, data: buffer.toString('base64') };
  }
}

/** Kya koi AI provider configured hai? (images ko seedha AI pe bhejna hai ya nahi) */
export function aiEnabled() {
  return Boolean(GEMINI_API_KEY || NARA_ROUTER_KEY);
}

// ---- text-only AI call (resume maker jaisi cheezein) ----

async function aiText(prompt) {
  // 1) Google Gemini
  if (GEMINI_API_KEY) {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
    };
    let lastErr = '';
    for (const MODEL of MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          lastErr = `Gemini ${res.status}`;
          continue;
        }
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
        if (text.trim()) return text;
      } catch (err) {
        lastErr = err.message;
      }
    }
    if (lastErr) console.error('Gemini text failed:', lastErr);
  }

  // 2) NaraRouter / OpenAI-compatible
  if (NARA_ROUTER_KEY) {
    try {
      const res = await fetch(`${NARA_ROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${NARA_ROUTER_KEY}`,
        },
        body: JSON.stringify({
          model: NARA_ROUTER_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 4096,
        }),
      });
      if (!res.ok) {
        console.error(`NaraRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return null;
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content || '';
      if (String(content).trim()) return String(content);
    } catch (err) {
      console.error('NaraRouter text failed:', err.message);
    }
  }
  return null;
}

const RESUME_PROMPT = [
  'You are a professional resume writer for a computer center (Jan Seva Kendra) in India.',
  'Create a clean, professional, one-page resume for the person described below.',
  'Use ONLY the facts provided — do NOT invent experience, skills, or qualifications.',
  'If a field is missing or empty, simply omit that section entirely.',
  '',
  'Person details (JSON):',
  '{DETAILS}',
  '',
  'Format rules:',
  '- Return the resume as MARKDOWN text only (no code fences, no extra commentary).',
  '- Start with the person name as a heading, then a contact line (phone | email | address).',
  '- Then sections in this order: Summary/Objective, Education, Skills, Experience, Additional Info.',
  '- Education: each entry as "- Degree, Institution, Year".',
  '- Skills: a single comma-separated line or short bullet list.',
  '- Experience: 2-4 bullet points per job, professional wording.',
  '- ATS-friendly, no tables, no fancy fonts.',
].join('\n');

/** Customer details -> professional resume (markdown). AI na ho to null. */
export async function aiBuildResume(details) {
  const prompt = RESUME_PROMPT.replace('{DETAILS}', JSON.stringify(details || {}));
  return aiText(prompt);
}

/** Image/PDF buffer -> parsed JSON { text, docType, fields } | null (agar key nahi / fail) */
export async function aiExtract(buffer, filename) {
  // 1) Google Gemini (agar AIza key hai)
  if (GEMINI_API_KEY) {
    const r = await aiViaGemini(buffer, filename);
    if (r) return r;
  }
  // 2) NaraRouter / OpenAI-compatible (agar router key hai)
  if (NARA_ROUTER_KEY) {
    const r = await aiViaOpenAi(buffer, filename);
    if (r) return r;
  }
  return null;
}

// ---- provider 1: Google Gemini ----
async function aiViaGemini(buffer, filename) {
  const img = await shrinkForAI(buffer, filename);
  const body = {
    contents: [
      {
        parts: [
          { inlineData: { mimeType: img.mime, data: img.data } },
          { text: PROMPT },
        ],
      },
    ],
    generationConfig: { temperature: 0, maxOutputTokens: 2048 },
  };

  let lastErr = '';
  for (const MODEL of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      lastErr = err.message;
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      lastErr = `Gemini API ${res.status}: ${errText.slice(0, 200)}`;
      continue;
    }

    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    if (!text.trim()) continue;

    const parsed = parseJson(text);
    if (parsed) return parsed;
  }

  console.error('Gemini extraction failed:', lastErr || 'sab models fail');
  return null;
}

// ---- provider 2: NaraRouter (OpenAI-compatible /chat/completions) ----
async function aiViaOpenAi(buffer, filename) {
  const img = await shrinkForAI(buffer, filename);
  // OpenAI-compatible vision images leta hai, PDF nahi (wahan Gemini try karo)
  if (img.mime === 'application/pdf') return null;

  const body = {
    model: NARA_ROUTER_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          {
            type: 'image_url',
            image_url: { url: `data:${img.mime};base64,${img.data}` },
          },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 2048,
  };

  let res;
  try {
    res = await fetch(`${NARA_ROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${NARA_ROUTER_KEY}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('NaraRouter request failed:', err.message);
    return null;
  }

  if (!res.ok) {
    const errText = await res.text();
    console.error(`NaraRouter API ${res.status}: ${errText.slice(0, 300)}`);
    return null;
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  if (!String(content).trim()) return null;

  return parseJson(content);
}

/** Model kabhi kabhi ```json ... ``` block me deta hai — dono style handle karo */
function parseJson(text) {
  const m = String(text).match(/```(?:json)?\s*([\s\S]*?)```/);
  const clean = m ? m[1] : String(text);
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    console.error('AI response me JSON nahi mila:', String(text).slice(0, 200));
    return null;
  }
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch (err) {
    console.error('AI JSON parse failed:', err.message, String(text).slice(0, 200));
    return null;
  }
}
