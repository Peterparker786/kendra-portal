// db.js — SQLite storage (built-in node:sqlite, zero native deps)
// Kendra structure: Customers (client master) + Documents (ek row = ek document)

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'portal.db'));

// migration: purane schema (records wala) ho to drop karke naya banao
const custCols = db.prepare('PRAGMA table_info(customers)').all();
if (custCols.length && !custCols.some((c) => c.name === 'phone')) {
  db.exec('DROP TABLE IF EXISTS records; DROP TABLE IF EXISTS customers;');
}
db.exec('DROP TABLE IF EXISTS records;');

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    aadhaar TEXT DEFAULT '',
    dob TEXT DEFAULT '',
    gender TEXT DEFAULT '',
    address TEXT DEFAULT '',
    father TEXT DEFAULT '',
    reg_no TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    doc_type TEXT DEFAULT '',
    doc_no TEXT DEFAULT '',
    issue_date TEXT DEFAULT '',
    valid_till TEXT DEFAULT '',
    issued_by TEXT DEFAULT '',
    status TEXT DEFAULT 'Submitted',
    remarks TEXT DEFAULT '',
    filename TEXT NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_docs_customer ON documents(customer_id);
  CREATE INDEX IF NOT EXISTS idx_cust_aadhaar ON customers(aadhaar);
  CREATE INDEX IF NOT EXISTS idx_cust_name ON customers(name);
`);

// migration: documents me extracted-fields (JSON) column add karo (purani DBs ke liye)
const docCols = db.prepare('PRAGMA table_info(documents)').all();
if (docCols.length && !docCols.some((c) => c.name === 'fields_json')) {
  db.exec("ALTER TABLE documents ADD COLUMN fields_json TEXT DEFAULT ''");
}

function digits(s) {
  return String(s || '').replace(/\D/g, '');
}

/**
 * Client ko pehle Aadhaar se dhoondo, nahi mila to naam se.
 * Naya client → insert; purana → jo fields khali hain unhe bharo.
 */
export function findOrCreateCustomer({ name, phone, aadhaar, dob, gender, address, father, regNo }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Customer name is required');

  let row = null;
  const aadhaarDigits = digits(aadhaar);
  if (aadhaarDigits) {
    const hits = db
      .prepare("SELECT * FROM customers WHERE aadhaar != '' AND ? IN (aadhaar, replace(aadhaar,' ',''))")
      .all(aadhaarDigits);
    row = hits.find((r) => digits(r.aadhaar) === aadhaarDigits) || null;
  }
  if (!row) {
    row =
      db
        .prepare('SELECT * FROM customers WHERE lower(name) = lower(?) ORDER BY id LIMIT 1')
        .get(cleanName) || null;
  }

  if (!row) {
    const info = db
      .prepare(
        `INSERT INTO customers (name, phone, aadhaar, dob, gender, address, father, reg_no)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        cleanName,
        phone || '',
        aadhaarDigits || aadhaar || '',
        dob || '',
        gender || '',
        address || '',
        father || '',
        regNo || ''
      );
    return db.prepare('SELECT * FROM customers WHERE id = ?').get(Number(info.lastInsertRowid));
  }

  const updated = {
    phone: row.phone || phone || '',
    aadhaar: digits(row.aadhaar) || aadhaarDigits || '',
    dob: row.dob || dob || '',
    gender: row.gender || gender || '',
    address: row.address || address || '',
    father: row.father || father || '',
    reg_no: row.reg_no || regNo || '',
  };
  db.prepare(
    `UPDATE customers SET phone=?, aadhaar=?, dob=?, gender=?, address=?, father=?, reg_no=? WHERE id=?`
  ).run(updated.phone, updated.aadhaar, updated.dob, updated.gender, updated.address, updated.father, updated.reg_no, row.id);
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(row.id);
}

/** Existing customer pe hi save karo — jo fields khali hain unhe naye data se bharo */
export function updateCustomerFields(id, { phone, aadhaar, dob, gender, address, father, regNo }) {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!row) return null;
  db.prepare(
    `UPDATE customers SET phone=?, aadhaar=?, dob=?, gender=?, address=?, father=?, reg_no=? WHERE id=?`
  ).run(
    row.phone || phone || '',
    digits(row.aadhaar) || digits(aadhaar) || '',
    row.dob || dob || '',
    row.gender || gender || '',
    row.address || address || '',
    row.father || father || '',
    row.reg_no || regNo || '',
    id
  );
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
}

export function addDocument({ customerId, docType, docNo, issueDate, validTill, issuedBy, status, remarks, filename, fields }) {
  const info = db
    .prepare(
      `INSERT INTO documents
         (customer_id, doc_type, doc_no, issue_date, valid_till, issued_by, status, remarks, filename, fields_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      customerId,
      docType || '',
      docNo || '',
      issueDate || '',
      validTill || '',
      issuedBy || '',
      status || 'Submitted',
      remarks || '',
      filename || 'document',
      Array.isArray(fields) ? JSON.stringify(fields) : ''
    );
  return Number(info.lastInsertRowid);
}

export function listCustomers() {
  return db
    .prepare(
      `SELECT c.id, c.name, c.phone, c.aadhaar,
              COUNT(d.id) AS doc_count
       FROM customers c
       LEFT JOIN documents d ON d.customer_id = c.id
       GROUP BY c.id
       ORDER BY c.name COLLATE NOCASE`
    )
    .all()
    .map((c) => ({ ...c, doc_count: Number(c.doc_count) }));
}

export function getCustomer(id) {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!customer) return null;
  const documents = db
    .prepare(
      `SELECT * FROM documents WHERE customer_id = ? ORDER BY uploaded_at DESC, id DESC`
    )
    .all(id);
  return { ...customer, documents };
}

export function deleteDocument(id) {
  const info = db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  return Number(info.changes) > 0;
}

export function dashboardStats() {
  const customers = db.prepare('SELECT COUNT(*) AS n FROM customers').get().n;
  const documents = db.prepare('SELECT COUNT(*) AS n FROM documents').get().n;
  const services = db.prepare("SELECT COUNT(DISTINCT doc_type) AS n FROM documents WHERE doc_type != ''").get().n;
  const monthDocs = db
    .prepare("SELECT COUNT(*) AS n FROM documents WHERE uploaded_at >= datetime('now', 'start of month')")
    .get().n;
  const byType = db
    .prepare("SELECT doc_type AS type, COUNT(*) AS count FROM documents WHERE doc_type != '' GROUP BY doc_type ORDER BY count DESC")
    .all()
    .map((r) => ({ type: r.type, count: Number(r.count) }));
  const activity = db
    .prepare(
      `SELECT d.doc_type AS type, d.filename, d.uploaded_at, c.name AS customer
       FROM documents d JOIN customers c ON c.id = d.customer_id
       ORDER BY d.id DESC LIMIT 6`
    )
    .all();
  return { customers, documents, services, monthDocs, byType, activity };
}

export function docTypeOptions(base) {
  const used = db
    .prepare("SELECT DISTINCT doc_type FROM documents WHERE doc_type != '' ORDER BY doc_type")
    .all()
    .map((r) => r.doc_type);
  const seen = new Set();
  return [...base, ...used].filter((t) => {
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
}

export function exportAllCsv() {
  const rows = db
    .prepare(
      `SELECT c.name AS customer, d.doc_type, d.doc_no, d.issue_date, d.valid_till,
              d.issued_by, d.status, d.remarks, d.filename, d.uploaded_at
       FROM documents d JOIN customers c ON c.id = d.customer_id
       ORDER BY c.name COLLATE NOCASE, d.uploaded_at`
    )
    .all();
  const header = ['Customer Name', 'Document Type', 'Document No', 'Issue Date', 'Valid Till', 'Issued By', 'Status', 'Remarks', 'File', 'Uploaded'];
  return { header, rows };
}
