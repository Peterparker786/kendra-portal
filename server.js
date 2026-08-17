// server.js — Kendra Portal API + static frontend
// Flow: upload document → extract → preview → confirm → save → dashboard

import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeDocument } from './extract.js';
import * as store from './db.js';
import { GOOGLE_SHEET_WEBHOOK_URL } from './config.js';

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

// ---- confirm → save (client profile + document) ----
app.post('/api/records', (req, res, next) => {
  try {
    const body = req.body || {};
    const customer = store.findOrCreateCustomer(body.customer || {});
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
  'Scholarship Documents',
  'Other',
];

app.get('/api/doc-types', (_req, res, next) => {
  try {
    res.json(store.docTypeOptions(DOC_TYPES));
  } catch (err) {
    next(err);
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
});
