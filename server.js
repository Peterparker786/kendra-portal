// server.js — Kendra Portal API + static frontend
// Flow: upload document → extract → preview → confirm → save → dashboard

import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeDocument, extractRawText } from './extract.js';
import { aiBuildResume, aiParseResume, aiText } from './ai.js';
import { buildResumePdf } from './resumepdf.js';
import { resizeDocument } from './resize.js';
import { makePassportSheet } from './passport.js';
import * as store from './db.js';
import { GOOGLE_SHEET_WEBHOOK_URL, GOOGLE_SHEET_URL } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4567;

app.use(express.json({ limit: '5mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function sendCsv(res, filename, header, rows) {
  const lines = [header.map(csvEscape).join(',')];
  for (const r of rows) lines.push(header.map((h) => csvEscape(r[h] ?? '')).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.send('\uFEFF' + lines.join('\n')); // BOM so Excel opens UTF-8 correctly
}

// ---- upload → preview (kuch save nahi hota) ----
app.post('/api/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const preview = await analyzeDocument(req.file.buffer, req.file.originalname);
    res.json(preview);
  } catch (err) {
    next(err);
  }
});

// ---- document resizer: PDF/image ka size kam karo ----
app.post('/api/resize', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const out = await resizeDocument(req.file.buffer, req.file.originalname);
    res.json(out);
  } catch (err) {
    next(err);
  }
});

// ---- passport-size photo sheet (A4) ----
app.post('/api/passport', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    let crop = null;
    if (req.body.cropX != null && req.body.cropY != null && req.body.cropW != null && req.body.cropH != null) {
      crop = { x: req.body.cropX, y: req.body.cropY, w: req.body.cropW, h: req.body.cropH };
    }
    const out = await makePassportSheet(req.file.buffer, {
      size: req.body.size || '2x2',
      count: req.body.count || 8,
      bg: req.body.bg || '',
      crop,
    });
    res.json(out);
  } catch (err) {
    next(err);
  }
});

// ---- confirm → save (client profile + document) ----
app.post('/api/records', (req, res, next) => {
  try {
    const body = req.body || {};
    // Agar user ne preview me existing customer chuna hai -> usi pe save karo
    // (naam/aadhaar alag ho tab bhi — saare docs ek saath profile me)
    let customer;
    if (body.customerId) {
      customer =
        store.updateCustomerFields(Number(body.customerId), body.customer || {}) ||
        store.findOrCreateCustomer(body.customer || {});
    } else {
      customer = store.findOrCreateCustomer(body.customer || {});
    }
    const id = store.addDocument({
      customerId: customer.id,
      docType: (body.document || {}).type,
      docNo: (body.document || {}).docNo,
      issueDate: (body.document || {}).issueDate,
      validTill: (body.document || {}).validTill,
      issuedBy: (body.document || {}).issuedBy,
      status: (body.document || {}).status,
      remarks: (body.document || {}).remarks,
      fields: (body.document || {}).fields,
      filename: body.filename || 'document',
    });

    // Google Sheet sync (agar config.js me URL diya hai) — best effort,
    // iske fail hone se portal ka save rukta nahi.
    if (GOOGLE_SHEET_WEBHOOK_URL) {
      fetch(GOOGLE_SHEET_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: body.customer || {},
          document: body.document || {},
          filename: body.filename || 'document',
        }),
      })
        .then(async (r) => {
          const text = await r.text();
          if (!r.ok) console.error('Google Sheet sync HTTP', r.status, text);
          else console.log('Google Sheet sync OK:', text.slice(0, 200));
        })
        .catch((err) => console.error('Google Sheet sync failed:', err.message));
    }

    res.json({ id, customerId: customer.id, customerName: customer.name });
  } catch (err) {
    next(err);
  }
});

// ---- document types: standard list + jo types pehle use ho chuke ----
const DOC_TYPES = [
  // ---- Government ID ----
  'Aadhaar Card',
  'Aadhaar Correction',
  'PAN Card',
  'Voter ID',
  'Passport',
  'Driving License',
  'ABHA (Ayushman Bharat)',
  'Ration Card',
  // ---- Certificates ----
  'Niwas Praman (Residence)',
  'Domicile Certificate',
  'Cast Certificate',
  'Caste Validity',
  'Income Certificate',
  'Non-Creamy Layer',
  'EWS Certificate',
  'Minority Certificate',
  'Character Certificate',
  'Birth Certificate',
  'Death Certificate',
  'Marriage Registration',
  // ---- Education ----
  'Student / University Registration',
  'Marksheet (BSc / BA / 12th)',
  'Migration Certificate',
  'Transfer Certificate',
  'Provisional Certificate',
  'Degree Certificate',
  'Skill Certificate',
  'Scholarship Documents',
  // ---- Property / Legal ----
  'Property Document',
  'Sale Deed',
  'Gift Deed',
  'Rent Agreement',
  'Will / Testament',
  'Affidavit',
  'Power of Attorney',
  // ---- Business / Utility ----
  'Bank Passbook',
  'Insurance Policy',
  'Pension Document',
  'LPG Gas Connection',
  'Electricity Bill',
  'Water Bill',
  'Trade License',
  'GST Registration',
  'MSME / Udyog Aadhaar',
  'FSSAI License',
  // ---- Other ----
  'Other',
];

// ---- settings: frontend ke liye (jaise Google Sheet ka link) ----
app.get('/api/settings', (_req, res) => {
  res.json({ sheetUrl: GOOGLE_SHEET_URL || '' });
});

// ---- Chutki AI Chat ----
app.post('/api/chutki-chat', async (req, res, next) => {
  try {
    const { message, customerData, screenContent } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Message required' });
    let ctx = 'You are Chutki, AI assistant for Jan Seva Kendra. Respond in Hinglish. Be concise.';
    if (customerData) ctx += '\nCustomer: ' + JSON.stringify(customerData);
    if (screenContent) ctx += '\nScreen: ' + String(screenContent).slice(0, 3000);
    ctx += '\nUser: ' + message;
    const reply = await aiText(ctx);
    res.json({ reply: reply || 'Chutki abhi kuch samajh nahi paayi. AI key check karo.' });
  } catch (err) { next(err); }
});

// ---- resume maker: AI se professional resume (template fallback ke saath) ----
app.post('/api/resume', async (req, res, next) => {
  try {
    const d = req.body || {};
    const md = await aiBuildResume(d);
    res.json(md ? { ok: true, markdown: md, usedAI: true } : { ok: true, markdown: resumeTemplate(d), usedAI: false });
  } catch (err) {
    next(err);
  }
});

// resume markdown -> PDF download (server-side pdf-lib)
app.post('/api/resume/pdf', async (req, res, next) => {
  try {
    const { markdown, accent, photo, template } = req.body || {};
    if (!markdown || !String(markdown).trim()) {
      return res.status(400).json({ error: 'Resume markdown missing' });
    }
    const buf = await buildResumePdf(markdown, accent, { photo: photo || '', template: template || '' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="resume.pdf"');
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

// resume raw text -> structured fields (purane resume se form prefill)
app.post('/api/resume/parse', async (req, res, next) => {
  try {
    const text = String((req.body || {}).text || '');
    const fields = await aiParseResume(text);
    res.json({ ok: true, fields: fields || {} });
  } catch (err) {
    next(err);
  }
});

// resume upload -> raw text (AI se polish karne ke liye)
app.post('/api/resume/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File chahiye' });
    const text = await extractRawText(req.file.buffer, req.file.originalname);
    res.json({ ok: true, text });
  } catch (err) {
    next(err);
  }
});

function resumeTemplate(d) {
  const L = [];
  const name = String(d.name || '').trim() || 'Customer Name';
  L.push(`# ${name}`);
  const contact = [d.phone, d.email, d.address].filter(Boolean).join(' | ');
  if (contact) L.push(contact);
  L.push('');
  if (d.objective) {
    L.push('## Summary');
    L.push(d.objective.trim());
    L.push('');
  }
  if (d.education) {
    L.push('## Education');
    String(d.education).split(/\n+/).map((s) => s.trim()).filter(Boolean)
      .forEach((s) => L.push(`- ${s}`));
    L.push('');
  }
  if (d.skills) {
    L.push('## Skills');
    L.push(String(d.skills).split(',').map((s) => s.trim()).filter(Boolean).join(', '));
    L.push('');
  }
  if (d.experience) {
    L.push('## Experience');
    String(d.experience).split(/\n+/).map((s) => s.trim()).filter(Boolean)
      .forEach((s) => L.push(`- ${s}`));
    L.push('');
  }
  const extra = [d.dob ? `Date of Birth: ${d.dob}` : '', d.father ? `Father's Name: ${d.father}` : ''].filter(Boolean);
  if (extra.length) {
    L.push('## Additional Info');
    extra.forEach((s) => L.push(`- ${s}`));
  }
  return L.join('\n').trim();
}

app.get('/api/stats', (_req, res, next) => {
  try {
    res.json(store.dashboardStats());
  } catch (err) {
    next(err);
  }
});

app.get('/api/doc-types', (_req, res, next) => {
  try {
    res.json(store.docTypeOptions(DOC_TYPES));
  } catch (err) {
    next(err);
  }
});

// ---- services: Google Sheet ke "Services" tab se links (TTL 2 min cache) ----
// Sheet me link badlo -> ~2 min me portal me naya link dikh jayega.
let servicesCache = { ts: 0, data: [] };
const SERVICES_TTL_MS = 2 * 60 * 1000;

app.get('/api/services', async (_req, res) => {
  try {
    const now = Date.now();
    if (now - servicesCache.ts > SERVICES_TTL_MS && GOOGLE_SHEET_WEBHOOK_URL) {
      const r = await fetch(GOOGLE_SHEET_WEBHOOK_URL, { method: 'GET' });
      if (r.ok) {
        const data = await r.json().catch(() => null);
        if (data && Array.isArray(data.services)) {
          servicesCache = { ts: now, data: data.services };
        }
      }
    }
    res.json({ services: servicesCache.data });
  } catch (err) {
    res.json({ services: servicesCache.data });
  }
});

app.delete('/api/documents/:id', (req, res, next) => {
  try {
    const ok = store.deleteDocument(Number(req.params.id));
    res.json({ deleted: ok });
  } catch (err) {
    next(err);
  }
});

// ---- dashboard ----
app.get('/api/customers', (_req, res, next) => {
  try {
    res.json(store.listCustomers());
  } catch (err) {
    next(err);
  }
});

app.get('/api/customers/:id', (req, res, next) => {
  try {
    const customer = store.getCustomer(Number(req.params.id));
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    next(err);
  }
});

// ---- export: ek customer ke saare documents, ya sab customers ----
app.get('/api/customers/:id/export', (req, res, next) => {
  try {
    const customer = store.getCustomer(Number(req.params.id));
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const { header, rows } = store.exportAllCsv();
    const mine = rows.filter((r) => r.customer === customer.name);
    const safe = customer.name.replace(/[^A-Za-z0-9 _-]/g, '');
    sendCsv(res, safe || 'customer', header, mine);
  } catch (err) {
    next(err);
  }
});

app.get('/api/export', (_req, res, next) => {
  try {
    const { header, rows } = store.exportAllCsv();
    sendCsv(res, 'all-customers', header, rows);
  } catch (err) {
    next(err);
  }
});

// ---- Phone se photo upload (QR / link) ----
const phoneSessions = new Map(); // sessionId → { files: [], created: Date, label: string }

function genId(len = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < len; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// Create upload session
app.post('/api/phone-session', (req, res) => {
  const label = req.body.label || '';
  const sessionId = genId();
  phoneSessions.set(sessionId, { files: [], created: new Date(), label });
  const host = req.headers.host || `localhost:${PORT}`;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const link = `${proto}://${host}/phone/${sessionId}`;
  res.json({ sessionId, link });
});

// Close session
app.delete('/api/phone-session/:id', (req, res) => {
  phoneSessions.delete(req.params.id);
  res.json({ ok: true });
});

// Poll for uploaded files
app.get('/api/phone-session/:id', (req, res) => {
  const session = phoneSessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ files: session.files, count: session.files.length });
});

// Phone upload page (served as HTML)
app.get('/phone/:sessionId', (req, res) => {
  const session = phoneSessions.get(req.params.sessionId);
  if (!session) return res.status(404).send('<h2>Link expire ho gaya ya galat hai</h2><p>Naya link lelo portal se.</p>');
  res.send(`<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Photo Upload</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.card{background:#fff;border-radius:20px;padding:32px 24px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center}
.logo{font-size:48px;margin-bottom:8px}
h2{color:#1e293b;font-size:20px;margin-bottom:4px}
p.sub{color:#64748b;font-size:13px;margin-bottom:20px}
.upload-area{border:2px dashed #c7d2fe;border-radius:16px;padding:40px 20px;margin:16px 0;cursor:pointer;transition:all 0.2s}
.upload-area:hover,.upload-area.drag{border-color:#6366f1;background:#eef2ff}
.upload-area .icon{font-size:48px;margin-bottom:8px}
.upload-area p{color:#475569;font-size:14px}
.upload-area small{color:#94a3b8;font-size:12px}
input[type=file]{display:none}
.btn{display:inline-block;padding:14px 32px;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;transition:all 0.2s}
.btn-primary{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;box-shadow:0 4px 15px rgba(99,102,241,0.4)}
.btn-primary:active{transform:scale(0.97)}
.btn-primary:disabled{opacity:0.5;cursor:not-allowed}
.sent{display:none;text-align:center;padding:20px 0}
.sent .check{font-size:64px;margin-bottom:8px}
.sent h3{color:#16a34a;font-size:18px}
.sent p{color:#64748b;font-size:13px;margin-top:4px}
.sent .again{margin-top:16px;padding:10px 24px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;font-weight:600;color:#475569;cursor:pointer}
.progress{display:none;margin:12px 0}
.progress .track{height:6px;background:#e2e8f0;border-radius:999px;overflow:hidden}
.progress .fill{height:100%;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:999px;transition:width 0.3s}
.preview-img{max-width:100%;max-height:200px;border-radius:12px;margin:12px 0;border:2px solid #e2e8f0;display:none}
</style>
</head>
<body>
<div class="card">
  <div class="logo">📸</div>
  <h2>Photo Upload</h2>
  <p class="sub">Camera se photo khicho ya gallery se chuno</p>
  
  <div class="upload-area" id="dropZone">
    <div class="icon">📷</div>
    <p><b>Tap to open camera</b></p>
    <small>Ya photo drag & drop karo</small>
  </div>
  
  <input type="file" id="fileInput" accept="image/*" capture="environment" />
  <img class="preview-img" id="previewImg" />
  <div class="progress" id="progWrap">
    <div class="track"><div class="fill" id="progFill" style="width:0%"></div></div>
  </div>
  <button class="btn btn-primary" id="sendBtn" disabled>📤 Upload karo</button>
  
  <div class="sent" id="sentMsg">
    <div class="check">✅</div>
    <h3>Photo bhej di!</h3>
    <p>Portal pe aa gaya hai. Admin dekh lega.</p>
    <button class="again" onclick="reset()">Ek aur photo bhejo</button>
  </div>
</div>
<script>
const SID = '${req.params.sessionId}';
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const previewImg = document.getElementById('previewImg');
const sendBtn = document.getElementById('sendBtn');
const sentMsg = document.getElementById('sentMsg');
const progWrap = document.getElementById('progWrap');
const progFill = document.getElementById('progFill');
let selectedFile = null;

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('touchend', (e) => { e.preventDefault(); fileInput.click(); });
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault(); dropZone.classList.remove('drag');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });

function handleFile(f) {
  selectedFile = f;
  previewImg.src = URL.createObjectURL(f);
  previewImg.style.display = 'block';
  dropZone.style.display = 'none';
  sendBtn.disabled = false;
}

sendBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  sendBtn.disabled = true;
  progWrap.style.display = 'block';
  progFill.style.width = '10%';
  const fd = new FormData();
  fd.append('file', selectedFile);
  try {
    progFill.style.width = '40%';
    const r = await fetch('/phone/' + SID, { method: 'POST', body: fd });
    progFill.style.width = '80%';
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Upload failed');
    progFill.style.width = '100%';
    setTimeout(() => {
      document.querySelector('.upload-area').style.display = 'none';
      previewImg.style.display = 'none';
      progWrap.style.display = 'none';
      sentMsg.style.display = 'block';
      sendBtn.style.display = 'none';
    }, 400);
  } catch (err) {
    alert('Upload fail: ' + err.message);
    sendBtn.disabled = false;
    progWrap.style.display = 'none';
  }
});

function reset() {
  selectedFile = null;
  fileInput.value = '';
  previewImg.style.display = 'none';
  previewImg.src = '';
  dropZone.style.display = 'block';
  sendBtn.style.display = 'inline-block';
  sendBtn.disabled = true;
  sentMsg.style.display = 'none';
}
</script>
</body>
</html>`);
});

// Accept photo upload from phone
app.post('/phone/:sessionId', upload.single('file'), (req, res) => {
  const session = phoneSessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session expired' });
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const base64 = 'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64');
  session.files.push({
    id: genId(12),
    name: req.file.originalname,
    size: req.file.size,
    type: req.file.mimetype,
    dataUrl: base64,
    uploadedAt: new Date().toISOString(),
  });
  res.json({ ok: true, count: session.files.length });
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => {
  console.log(`Kendra Portal running → http://localhost:${PORT}`);
  importFromGoogleSheet();
});

// ---------------------------------------------------------------------------
// Google Sheet se restore — Render free tier pe disk har restart/deploy pe reset
// hoti hai, isliye portal har start pe sheet se data wapas load karta hai (agar
// local DB khali ho). Sheet hi ab permanent store hai.
// ---------------------------------------------------------------------------
async function importFromGoogleSheet() {
  if (!GOOGLE_SHEET_WEBHOOK_URL) {
    console.log('sheet restore: GSCRIPT_URL nahi hai, skip');
    return;
  }
  try {
    const res = await fetch(GOOGLE_SHEET_WEBHOOK_URL, { method: 'GET' });
    if (!res.ok) {
      console.error('sheet restore: HTTP', res.status);
      return;
    }
    const data = await res.json().catch(() => null);
    if (!data || !data.ok || !Array.isArray(data.customers)) {
      console.log('sheet restore: koi data nahi mila (SheetSync.gs ka doGet naya version hai?)');
      return;
    }
    if (store.listCustomers().length > 0) {
      console.log('sheet restore: local DB me pehle se data hai, skip');
      return;
    }
    let n = 0;
    for (const c of data.customers) {
      try {
        store.findOrCreateCustomer({
          name: c.name,
          phone: c.phone,
          aadhaar: c.aadhaar,
          dob: c.dob,
          gender: c.gender,
          address: c.address,
          father: c.father,
          regNo: c.regNo,
        });
        n++;
      } catch {
        // ek row kharab ho to aage badho
      }
    }
    for (const d of data.documents || []) {
      try {
        const cust = store.findOrCreateCustomer({ name: d.customer });
        store.addDocument({
          customerId: cust.id,
          docType: d.type,
          docNo: d.docNo,
          issueDate: d.issueDate,
          validTill: d.validTill,
          issuedBy: d.issuedBy,
          status: d.status,
          remarks: d.remarks,
          filename: d.filename || 'restored',
        });
      } catch {
        // ek row kharab ho to aage badho
      }
    }
    console.log(`sheet restore: ${n} customers + ${(data.documents || []).length} documents import ho gaye`);
  } catch (err) {
    console.error('sheet restore failed:', err.message);
  }
}
