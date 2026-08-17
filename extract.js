// extract.js — PDF/text → client document fields
// Jan Seva Kendra structure: sirf clients ke documents (Aadhaar, Niwas Praman,
// Registration, certificates...). Koi items/printer/paper table nahi.

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ocrImage } from './ocr.js';
import { aiExtract, aiEnabled } from './ai.js';

const require = createRequire(import.meta.url);
// pdfjs wants standard font data for metric lookups; serve the real files from
// the package. Node 24 on Windows can't fs.readFile(file:// URLs), so read by path.
const standardFontsDir = path.join(
  path.dirname(require.resolve('pdfjs-dist/package.json')),
  'standard_fonts'
);
class NodeStandardFontDataFactory {
  constructor({ baseUrl }) {
    this.baseUrl = baseUrl;
  }
  async fetch({ filename }) {
    const data = await readFile(path.join(this.baseUrl, filename));
    return new Uint8Array(data);
  }
}

// ---------------------------------------------------------------- text layer

async function extractPdfText(buffer) {
  const doc = await getDocument({
    data: new Uint8Array(buffer),
    StandardFontDataFactory: NodeStandardFontDataFactory,
    standardFontDataUrl: standardFontsDir,
  }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items.filter((it) => it.str && it.str.trim());

    // group items into visual lines by y coordinate
    const lineMap = [];
    for (const it of items) {
      const x = it.transform[4];
      const y = it.transform[5];
      let line = lineMap.find((l) => Math.abs(l.y - y) < 3);
      if (!line) {
        line = { y, cells: [] };
        lineMap.push(line);
      }
      line.cells.push({ x, text: it.str });
    }

    // PDF origin is bottom-left: larger y = higher on page → reading order is descending
    lineMap.sort((a, b) => b.y - a.y);
    for (const line of lineMap) {
      line.cells.sort((a, b) => a.x - b.x);
      line.text = line.cells.map((c) => c.text).join(' ');
      out.push(line);
    }
  }
  return out;
}

function textLinesFromBuffer(buffer, filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.txt') || lower.endsWith('.csv')) {
    return buffer
      .toString('utf8')
      .split('\n')
      .map((t) => t.trimEnd())
      .filter((t) => t.trim().length > 0)
      .map((text, i) => ({ y: 1000 - i, cells: [{ x: 0, text }], text }));
  }
  return null;
}

// JPEG/PNG -> OCR se text nikal ke lines me convert
async function textLinesFromImage(buffer) {
  const ocr = await ocrImage(buffer);
  return {
    confidence: ocr.confidence,
    lines: ocr.text
      .split('\n')
      .map((t) => t.trimEnd())
      .filter((t) => t.trim().length > 0)
      .map((t, i) => ({ y: 1000 - i, cells: [{ x: 0, text: t }], text: t })),
  };
}

// ---------------------------------------------------------------- field rules

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isLabelLike(s) {
  const t = String(s).trim().toLowerCase();
  return /^(name|gender|address|date\s*of\s*birth|dob|father|aadhaar|phone|mobile|email|registration|issue)/.test(t);
}

/**
 * Aadhaar letter me aksar label ek line pe, value agli line pe:
 *   Name
 *   Ramesh Kumar
 * Dono style handle hote hain: "Label : Value" aur "Label\nValue".
 */
function extractFields(lines) {
  const fields = [];
  const seen = {};

  function add(key, value) {
    if (!value || seen[key]) return;
    fields.push({ key, value: String(value).trim() });
    seen[key] = true;
  }

  const LABELS = [
    { key: 'Customer Name', names: ['applicant name', 'client name', 'customer name', 'name'] },
    { key: "Father's Name", names: ["father's name", 'father / husband name', 'father name', 'husband name'] },
    { key: 'Date of Birth', names: ['date of birth', 'dob'] },
    { key: 'Gender', names: ['gender'] },
    { key: 'Aadhaar No', names: ['aadhaar number', 'aadhaar no', 'aadhar number', 'aadhar no', 'uidai no'] },
    { key: 'Address', names: ['address'] },
    { key: 'Phone / Email', names: ['phone', 'mobile', 'contact', 'email'] },
    { key: 'Issued By', names: ['issued by', 'issuing authority', 'issued from'] },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const lab of LABELS) {
      if (seen[lab.key]) continue;
      for (const nm of lab.names) {
        const inline = new RegExp('^' + escapeRe(nm) + '\\s*:?\\s*(.+)$', 'i').exec(line);
        if (inline && inline[1] && !isLabelLike(inline[1])) {
          add(lab.key, inline[1]);
          break;
        }
        if (line.toLowerCase() === nm.toLowerCase()) {
          const next = lines[i + 1];
          if (next && !isLabelLike(next)) {
            add(lab.key, next);
            break;
          }
        }
      }
    }
  }

  // Aadhaar Number: 12 digits (4-4-4 bhi), kisi bhi line me
  if (!seen['Aadhaar No']) {
    for (const l of lines) {
      if (/phone|mobile|contact/i.test(l)) continue;
      const m = l.match(/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/);
      if (m) {
        add('Aadhaar No', m[0]);
        break;
      }
    }
  }

  // Mobile number (10 digits, 6-9 se shuru)
  if (!seen['Phone / Email']) {
    for (const l of lines) {
      const m = l.match(/\b[6-9]\d{9}\b/);
      if (m) {
        add('Phone / Email', m[0]);
        break;
      }
    }
  }

  // Document no (Registration / Certificate no)
  if (!seen['Document No']) {
    for (const l of lines) {
      const m = l.match(/(?:registration|reg|certificate|cert|application)\s*(?:no|number|#)\s*:?\s*([A-Za-z0-9][A-Za-z0-9/._-]{3,25})/i);
      if (m) {
        add('Document No', m[1]);
        break;
      }
    }
  }

  // Issue date
  if (!seen['Issue Date']) {
    for (const l of lines) {
      const m = l.match(/(?:issue|issued|date)\s*(?:date)?\s*:?\s*([0-9]{1,2}[-\/][0-9]{1,2}[-\/][0-9]{2,4})/i);
      if (m) {
        add('Issue Date', m[1]);
        break;
      }
    }
  }

  // Valid till
  if (!seen['Valid Till']) {
    for (const l of lines) {
      const m = l.match(/valid(?:\s*(?:till|upto|up\s*to))?\s*:?\s*([0-9]{1,2}[-\/][0-9]{1,2}[-\/][0-9]{2,4})/i);
      if (m) {
        add('Valid Till', m[1]);
        break;
      }
    }
  }

  return fields;
}

function detectDocType(text) {
  const t = String(text || '').toLowerCase();
  const TYPE_MAP = [
    [/niwas|residen|rasid|mool/i, 'Niwas Praman (Residence)'],
    [/domicile/i, 'Domicile Certificate'],
    [/aadhaar|aadhar|uidai/i, 'Aadhaar Card'],
    [/cast|jati/i, 'Cast Certificate'],
    [/income|aay\b/i, 'Income Certificate'],
    [/birth|janm/i, 'Birth Certificate'],
    [/death|mrityu/i, 'Death Certificate'],
    [/marriage|shadi|vivaah/i, 'Marriage Registration'],
    [/voter|matdata/i, 'Voter ID'],
    [/ration|food\s*security/i, 'Ration Card'],
    [/scholarship|chhatravritti/i, 'Scholarship Documents'],
    [/student|university|enroll/i, 'Student / University Registration'],
  ];
  for (const [re, type] of TYPE_MAP) {
    if (re.test(t)) return type;
  }
  return '';
}

// AI (Gemini) ke JSON field names -> portal ke display names
const AI_KEY_MAP = {
  customerName: 'Customer Name',
  fatherName: "Father's Name",
  dob: 'Date of Birth',
  gender: 'Gender',
  aadhaarNo: 'Aadhaar No',
  address: 'Address',
  phone: 'Phone / Email',
  docNo: 'Document No',
  issueDate: 'Issue Date',
  validTill: 'Valid Till',
  issuedBy: 'Issued By',
};

// ---------------------------------------------------------------- entry point

export async function analyzeDocument(buffer, filename) {
  const lower = String(filename || '').toLowerCase();
  const isImage = /\.(jpe?g|png)$/.test(lower);

  // ---- AI-first: image + AI key available -> seedha AI pe (tedi/dhundhli/
  // handwritten/Hindi photos ke liye fast aur better). Tesseract skip.
  if (isImage && aiEnabled()) {
    try {
      const ai = await aiExtract(buffer, filename);
      if (ai && ai.fields && Object.values(ai.fields).some((v) => String(v || '').trim())) {
        const fields = [];
        for (const [k, display] of Object.entries(AI_KEY_MAP)) {
          const v = String(ai.fields[k] ?? '').trim();
          if (v) fields.push({ key: display, value: v });
        }
        const customerField = fields.find((f) => f.key === 'Customer Name');
        const customerName =
          (customerField && customerField.value) ||
          filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() ||
          'Unknown';
        return {
          filename,
          text: ai.text || '',
          customerName,
          docType: ai.docType || '',
          fields,
        };
      }
    } catch (err) {
      console.error('AI-first failed, tesseract pe gir raha hoon:', err.message);
    }
  }

  // ---- tesseract / pdfjs path (AI nahi hai ya fail hua) ----
  let lines = textLinesFromBuffer(buffer, filename);
  let confidence = 0;
  if (!lines && isImage) {
    const ocr = await textLinesFromImage(buffer);
    confidence = ocr.confidence;
    lines = ocr.lines;
  }
  if (!lines) lines = await extractPdfText(buffer);

  let text = lines.map((l) => l.text).join('\n');
  let fields = extractFields(lines.map((l) => l.text));
  let docType = detectDocType(text);

  // ---- AI Vision fallback ----
  // Image: tesseract se koi field nahi nikli (ya confidence bahut kam)
  // PDF: scanned hai (text layer khali) -> Gemini PDF khud padh leta hai
  const noCustomer = !fields.some((f) => f.key === 'Customer Name');
  const scannedPdf = lower.endsWith('.pdf') && text.trim().length < 40;
  const imageFailed = isImage && (fields.length === 0 || noCustomer || confidence < 45);
  if (imageFailed || scannedPdf) {
    try {
      const ai = await aiExtract(buffer, filename);
      if (ai) {
        if (ai.text) text = ai.text;
        if (ai.docType) docType = ai.docType;
        const f = ai.fields || {};
        for (const [k, display] of Object.entries(AI_KEY_MAP)) {
          const v = String(f[k] ?? '').trim();
          if (!v) continue;
          const existing = fields.find((x) => x.key === display);
          if (existing) existing.value = v;
          else fields.push({ key: display, value: v });
        }
      }
    } catch (err) {
      console.error('AI extraction failed:', err.message);
    }
  }

  const customerField = fields.find((f) => f.key === 'Customer Name');
  const customerName = customerField
    ? customerField.value
    : filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Unknown';

  return {
    filename,
    text,
    customerName,
    docType,
    fields,
  };
}
