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
  GROQ_API_KEY,
  GROQ_MODEL,
} from './config.js';
import sharp from 'sharp';

// Gemini ke liye models try karne ka order: env me GEMINI_MODEL diya ho to wahi,
// warna gemini-2.5-flash pehle aur gemini-2.0-flash fallback.
// Speed priority: gemini-2.0-flash sabse fast hai (2-5 sec)
const MODELS = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : ['gemini-2.0-flash', 'gemini-2.5-flash'];

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
  '  "docType": "one of: Aadhaar Card, Aadhaar Correction, PAN Card, Voter ID, Passport, Driving License, ABHA (Ayushman Bharat), Ration Card, Niwas Praman (Residence), Domicile Certificate, Cast Certificate, Caste Validity, Income Certificate, Non-Creamy Layer, EWS Certificate, Minority Certificate, Character Certificate, Birth Certificate, Death Certificate, Marriage Registration, Student / University Registration, Marksheet (BSc / BA / 12th), Migration Certificate, Transfer Certificate, Provisional Certificate, Degree Certificate, Skill Certificate, Scholarship Documents, Property Document, Sale Deed, Gift Deed, Rent Agreement, Will / Testament, Affidavit, Power of Attorney, Bank Passbook, Insurance Policy, Pension Document, LPG Gas Connection, Electricity Bill, Water Bill, Trade License, GST Registration, MSME / Udyog Aadhaar, FSSAI License, Other",',
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
  'For Driving License: dlNo in docNo, vehicle classes in issuedBy, validity in validTill.',
  'For Passport: passportNo in docNo, fileNumber in rollNo, place of birth in address.',
  'For ABHA: 14-digit ABHA number in aadhaarNo, health ID in docNo.',
  'For Voter ID: EPIC number in docNo, polling station in address.',
  'For Rent Agreement: rent amount in result, landlord name in fatherName, tenant in customerName.',
  'For Property Document: property area in result, survey/plot number in docNo.',
  'For Bank Passbook: account number in docNo, IFSC in issuedBy, branch in address.',
  'For Electricity Bill: consumer number in docNo, units in rollNo, bill amount in result.',
  'For GST Registration: GSTIN in docNo (15 chars), trade name in customerName.',
  'For MSME: Udyam number in docNo, enterprise name in customerName.',
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
  
  // PDF -> sirf pehla page nikalke image banao (10x faster)
  if (mime === 'application/pdf') {
    try {
      const { PDFDocument } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.load(buffer);
      const pageCount = pdfDoc.getPageCount();
      if (pageCount > 0) {
        // Pehla page alag PDF me
        const newPdf = await PDFDocument.create();
        const [page] = await newPdf.copyPages(pdfDoc, [0]);
        newPdf.addPage(page);
        const singlePage = await newPdf.save();
        // PDF -> image via sharp (if possible) ya as-is
        return { mime: 'application/pdf', data: singlePage.toString('base64'), singlePage: true };
      }
    } catch {}
    // Fallback: full PDF as-is
    return { mime, data: buffer.toString('base64') };
  }
  
  // Image -> aggressively compress (1024px max, quality 75)
  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;
    const maxDim = Math.max(w, h);
    const TARGET = 800; // 800px = ~4x faster than original
    if (maxDim > TARGET) {
      const scale = TARGET / maxDim;
      const small = await sharp(buffer)
        .rotate()
        .resize(Math.round(w * scale), Math.round(h * scale))
        .jpeg({ quality: 75 }) // lower quality = smaller = faster
        .toBuffer();
      return { mime: 'image/jpeg', data: small.toString('base64') };
    }
    const clean = await sharp(buffer).rotate().jpeg({ quality: 80 }).toBuffer();
    return { mime: 'image/jpeg', data: clean.toString('base64') };
  } catch {
    return { mime, data: buffer.toString('base64') };
  }
}

/** Kya koi AI provider configured hai? (images ko seedha AI pe bhejna hai ya nahi) */
export function aiEnabled() {
  return Boolean(GEMINI_API_KEY || NARA_ROUTER_KEY || GROQ_API_KEY);
}

// ---- text-only AI call (resume maker jaisi cheezein) ----

function stripThinking(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/gm, '').trim();
}

async function openAiRequest(url, apiKey, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000); // 10s timeout
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  } catch (err) { clearTimeout(timer); throw err; }
}

export async function aiText(prompt) {
  // Speed order: Groq (2-3s) → Gemini (5-8s) → NaraRouter
  // 1) Groq (fastest, free)
  if (GROQ_API_KEY) {
    try {
      const content = await openAiRequest('https://api.groq.com/openai/v1/chat/completions', GROQ_API_KEY,
        { model: GROQ_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 4096 });
      if (stripThinking(content)) return stripThinking(content);
    } catch (err) { console.error('Groq text failed:', err.message); }
  }

  // 2) Gemini
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
        if (!res.ok) { lastErr = `Gemini ${res.status}`; continue; }
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
        if (text.trim()) return text;
      } catch (err) { lastErr = err.message; }
    }
    if (lastErr) console.error('Gemini text failed:', lastErr);
  }

  // 3) NaraRouter
  const providers = [];
  if (NARA_ROUTER_KEY) providers.push({ name: 'NaraRouter', url: `${NARA_ROUTER_BASE}/chat/completions`, key: NARA_ROUTER_KEY, model: NARA_ROUTER_MODEL });
  for (const p of providers) {
    try {
      const content = await openAiRequest(p.url, p.key, { model: p.model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 4096 });
      if (stripThinking(content)) return stripThinking(content);
    } catch (err) { console.error(`${p.name} text failed:`, err.message); }
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
  '- Start with the person name as a heading, then a contact line (phone | email | address | LinkedIn | portfolio), including LinkedIn/portfolio only if provided.',
  '- Then sections in this order: Summary/Objective, Education, Skills, Languages, Hobbies, Experience, Additional Info.',
  '- Education: each entry as "- Degree, Institution, Year".',
  '- Skills: a single comma-separated line or short bullet list.',
  '- Languages: only if provided, as a comma-separated line under "## Languages".',
  '- Hobbies: only if provided, as a comma-separated line under "## Hobbies".',
  '- Experience: 2-4 bullet points per job, professional wording.',
  '- ATS-friendly, no tables, no fancy fonts.',
].join('\n');

/** Customer details -> professional resume (markdown). AI na ho to null. */
export async function aiBuildResume(details) {
  const prompt = RESUME_PROMPT.replace('{DETAILS}', JSON.stringify(details || {}));
  return aiText(prompt);
}

const PARSE_PROMPT = [
  'You are a resume parser. Extract structured information from the resume text below.',
  'Return ONLY valid JSON with this exact structure (empty string if not found):',
  '{',
  '  "name": "", "phone": "", "email": "", "address": "", "dob": "", "father": "",',
  '  "objective": "", "education": "", "skills": "", "experience": "",',
  '  "languages": "", "hobbies": "", "linkedin": "", "portfolio": ""',
  '}',
  'Rules:',
  '- The text may be a resume OR an academic document (marksheet, result card, certificate).',
  '- For marksheets/result cards: extract the student name, date of birth (dob), and education entries like "10th / Matriculation, School, Year, percentage", "12th / Intermediate, School, Year, percentage", "Degree, Institution, Year, result".',
  '- education: one entry per line as "Degree, Institution, Year (result/percentage if shown)".',
  '- skills: comma-separated list.',
  '- experience: original job entries, one per line (job title, company, dates). For experience certificates, put the role and company.',
  '- objective: the summary/objective paragraph, one line.',
  '- Do NOT invent anything. Output nothing except the JSON object.',
  '',
  'Resume text:',
  '{TEXT}',
].join('\n');

/** Purane resume ka raw text -> structured fields (form prefill ke liye) */
export async function aiParseResume(text) {
  const prompt = PARSE_PROMPT.replace('{TEXT}', String(text || '').slice(0, 8000));
  const raw = await aiText(prompt);
  if (!raw) return null;
  const parsed = parseJson(raw);
  if (!parsed) return null;
  return {
    name: String(parsed.name || '').trim(),
    phone: String(parsed.phone || '').trim(),
    email: String(parsed.email || '').trim(),
    address: String(parsed.address || '').trim(),
    dob: String(parsed.dob || '').trim(),
    father: String(parsed.father || '').trim(),
    objective: String(parsed.objective || '').trim(),
    education: String(parsed.education || '').trim(),
    skills: String(parsed.skills || '').trim(),
    experience: String(parsed.experience || '').trim(),
  };
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

  // Try all Gemini models in PARALLEL (8s timeout) — jo pehle aaye woh lelo
  const TIMEOUT_MS = 8000;
  const geminiResults = MODELS.map(async (MODEL) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      return text.trim() ? parseJson(text) : null;
    } catch { clearTimeout(timer); return null; }
  });
  // Jo pehle mile use lo
  const geminiResult = await Promise.any(geminiResults).catch(() => null);
  if (geminiResult) return geminiResult;

  console.error('Gemini extraction failed:', lastErr || 'sab models fail');
  return null;
}

// ---- provider 2: NaraRouter (OpenAI-compatible /chat/completions) ----
async function aiViaOpenAi(buffer, filename) {
  if (!NARA_ROUTER_KEY) return null;
  const img = await shrinkForAI(buffer, filename);
  if (img.mime === 'application/pdf') return null;
  try {
    const content = await openAiRequest(
      `${NARA_ROUTER_BASE}/chat/completions`, NARA_ROUTER_KEY,
      { model: NARA_ROUTER_MODEL, messages: [{ role: 'user', content: [
        { type: 'text', text: PROMPT },
        { type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data}` } },
      ] }], temperature: 0, max_tokens: 2048 }
    );
    return content ? parseJson(content) : null;
  } catch (err) { console.error('NaraRouter extraction failed:', err.message); return null; }
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
