// server.js — Kendra Portal API + static frontend
// Flow: upload document → extract → preview → confirm → save → dashboard

import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeDocument } from './extract.js';
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
    const out = await makePassportSheet(req.file.buffer, {
      size: req.body.size || '2x2',
      count: req.body.count || 8,
      bg: req.body.bg || '',
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
  'Aadhaar Card',
  'Aadhaar Correction',
  'PAN Card',
  'Niwas Praman (Residence)',
  'Domicile Certificate',
  'Cast Certificate',
  'Income Certificate',
  'Birth Certificate',
  'Death Certificate',
  'Marriage Registration',
  'Voter ID',
  'Ration Card',
  'Student / University Registration',
  'Marksheet (BSc / BA / 12th)',
  'Scholarship Documents',
  'Other',
];

// ---- settings: frontend ke liye (jaise Google Sheet ka link) ----
app.get('/api/settings', (_req, res) => {
  res.json({ sheetUrl: GOOGLE_SHEET_URL || '' });
});

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
