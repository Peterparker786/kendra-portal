/****************************************************************
 * FILE: Code.gs   VERSION: 3.4   (pure ASCII - copy-paste safe)
 *   3.4 = File Name column Documents me + getCustomerDocs/getSheetUrl
 *         (dashboard table + Open Google Sheet button ke liye)
 *   3.3 = getSS() add kiya: standalone project me bhi setupPortal chalega
 *         (aapki sheet ID se openById hota hai - "Service Spreadsheets
 *         failed" wala error ab nahi aayega)
 *   3.2 = getDocTypes ab sheet se bhi padhta hai (naya type ek baar use
 *         hone ke baad dropdown me khud aa jata hai)
 *
 * JAN SEVA KENDRA - CLIENT DOCUMENT PORTAL (Google Apps Script)
 * ---------------------------------------------------------------
 * Isme sirf clients ke documents handle hote hain:
 * Aadhaar Card, Niwas Praman, Registration, Cast/Income Certificate,
 * Birth/Death/Marriage, Voter ID, Ration Card, Scholarship, etc.
 * (Printer / paper / items wala koi structure nahi hai.)
 *
 * SETUP (aapke Google Sheet me):
 *   1. Google Sheet kholo -> Extensions -> Apps Script
 *   2. Code.gs me yeh file paste karo (jo pehle se hai hata do)
 *   3. "+" (Add file) -> HTML -> naam "Index" rakho -> Index.html ka
 *      code usme paste karo
 *   4. "setupPortal" function Run karo (ek baar, permission Allow karo)
 *      -> 4 sheets banengi: Customers, Documents, DocTypes, Dashboard
 *   5. Deploy -> New deployment -> type: Web app
 *      -> Execute as: Me | Who has access: Anyone with the link
 *
 * NOTE: Apps Script PDF/image se text automatically extract NAHI
 * kar sakta. Form me document ka text paste karna hota hai (PDF khol
 * kar copy-paste) ya fields manually bharni hoti hain. Scanned docs
 * ke liye OCR (Cloud Vision) chahiye - wo baad me laga sakte hain.
 ****************************************************************/

const CUSTOMER_SHEET = 'Customers';
const DOCUMENT_SHEET = 'Documents';
const DOCTYPE_SHEET = 'DocTypes';
const DASHBOARD_SHEET = 'Dashboard';

// ---- Client (Customer) master columns ----
const CUSTOMER_COLUMNS = [
  'Customer ID', 'Customer Name', 'Phone / Email', 'Aadhaar No',
  'Date of Birth', 'Gender', 'Address', "Father's Name",
  'University Reg No', 'Created On'
];

// ---- Document records columns (har row = ek document) ----
const DOCUMENT_COLUMNS = [
  'Customer Name', 'Document Type', 'Document No', 'Issue Date',
  'Valid Till', 'Issued By', 'Status', 'Remarks', 'File Name', 'Entry Date'
];

// ---- Jan Seva Kendra me aane wale common documents ----
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
  'Scholarship Documents',
  'Other'
];

const DOC_STATUSES = ['Submitted', 'Pending', 'Approved', 'Rejected', 'Issued'];

// ---- sheet access: standalone project me bhi kaam kare ----
// Apni spreadsheet ka ID yahan daalo (URL me /spreadsheets/d/.../ wala hissa).
// Note: repo me placeholder hai — apna asli ID daalna mat bhoolna.
const PORTAL_SHEET_ID = 'PASTE_YOUR_SHEET_ID_HERE';

function getSS() {
  if (PORTAL_SHEET_ID) {
    try {
      return SpreadsheetApp.openById(PORTAL_SHEET_ID);
    } catch (e) {
      // openById fail (permission/nahi mili) -> active sheet pe gir jao
    }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Kendra Portal')
    .addItem('Setup portal (create sheets & columns)', 'setupPortal')
    .addItem('Open entry form', 'openForm')
    .addToUi();
}

/* ============================ SETUP ============================ */

function setupPortal() {
  const ss = getSS();
  const ui = SpreadsheetApp.getUi();
  const yes = ui.alert(
    'Setup Portal',
    'Isse purani sheets hat kar 4 nayi sheets banengi:\n' +
      '1) Customers - clients ke details (aapke columns)\n' +
      '2) Documents - har client ke documents, ek row = ek document\n' +
      '3) DocTypes - document types ki list (dropdown ke liye)\n' +
      '4) Dashboard - client dropdown + documents + checklist\n\n' +
      'Continue karein?',
    ui.ButtonSet.YES_NO
  );
  if (yes !== ui.Button.YES) return;

  ss.getSheets().forEach((sh) => {
    const n = sh.getName();
    if (['Customers data', CUSTOMER_SHEET, DOCUMENT_SHEET, DOCTYPE_SHEET, DASHBOARD_SHEET].includes(n)) {
      ss.deleteSheet(sh);
    }
  });

  const cust = ss.insertSheet(CUSTOMER_SHEET);
  const doc = ss.insertSheet(DOCUMENT_SHEET);
  const types = ss.insertSheet(DOCTYPE_SHEET);
  const dash = ss.insertSheet(DASHBOARD_SHEET);
  ss.setActiveSheet(dash);

  // ---- Customers ----
  cust.getRange(1, 1, 1, CUSTOMER_COLUMNS.length)
    .setValues([CUSTOMER_COLUMNS])
    .setFontWeight('bold')
    .setBackground('#eef0ff')
    .setFontSize(10);
  cust.setFrozenRows(1);
  cust.autoResizeColumns(1, CUSTOMER_COLUMNS.length);

  // ---- Documents ----
  doc.getRange(1, 1, 1, DOCUMENT_COLUMNS.length)
    .setValues([DOCUMENT_COLUMNS])
    .setFontWeight('bold')
    .setBackground('#eef0ff')
    .setFontSize(10);
  doc.setFrozenRows(1);
  doc.autoResizeColumns(1, DOCUMENT_COLUMNS.length);

  // ---- DocTypes (list + validations) ----
  types.getRange('A1').setValue('Document Type').setFontWeight('bold');
  if (DOC_TYPES.length) {
    types.getRange(2, 1, DOC_TYPES.length, 1).setValues(DOC_TYPES.map((t) => [t]));
  }
  types.getRange(2, 1, DOC_TYPES.length, 1).setFontSize(10);

  const typeDv = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss.getRange('DocTypes!A2:A' + (DOC_TYPES.length + 1)))
    .setAllowInvalid(false)
    .build();
  doc.getRange('B2:B1000').setDataValidation(typeDv);

  const statusDv = SpreadsheetApp.newDataValidation()
    .requireValueInList(DOC_STATUSES, true)
    .build();
  doc.getRange('G2:G1000').setDataValidation(statusDv);

  // ---- Dashboard ----
  dash.getRange('A1').setValue('SELECT CLIENT').setFontWeight('bold').setFontSize(11);
  dash.getRange('B1').setValue('');
  const custDv = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss.getRange('Customers!B2:B1000'))
    .setAllowInvalid(true)
    .build();
  dash.getRange('B1').setDataValidation(custDv);

  dash.getRange('A3').setValue('Documents of selected client:').setFontWeight('bold');
  dash.getRange('A4').setFormula('=IF(B1="","",IFERROR(FILTER(Documents!A2:I, Documents!A2:A=B1), "No documents yet")))');
  dash.getRange('A4').setWrap(true);

  // ---- Document checklist (kaunsa document submit hua, kaunsa pending) ----
  dash.getRange('D1').setValue('DOCUMENT CHECKLIST').setFontWeight('bold').setFontSize(11);
  dash.getRange('D2').setValue('Document Type').setFontWeight('bold').setBackground('#f7f8fc');
  dash.getRange('E2').setValue('Status').setFontWeight('bold').setBackground('#f7f8fc');
  DOC_TYPES.forEach((t, i) => {
    const r = i + 3; // row 3 onward
    dash.getRange('D' + r).setValue(t).setFontSize(10);
    dash.getRange('E' + r)
      .setFormula('=IF($B$1="","",IF(COUNTIFS(Documents!A:A,$B$1,Documents!B:B,$D' + r + ')>0,"[OK]","Pending"))')
      .setFontSize(10);
  });

  // ---- Stats ----
  dash.getRange('A10').setValue('Total clients:').setFontWeight('bold');
  dash.getRange('B10').setFormula('=COUNTA(Customers!B2:B)');
  dash.getRange('A11').setValue('Total documents:').setFontWeight('bold');
  dash.getRange('B11').setFormula('=COUNTA(Documents!A2:A)');
  dash.getRange('A13')
    .setValue('Naya entry: menu me Kendra Portal -> Open entry form, ya Deploy kiya hua Web app.')
    .setFontColor('#6b7280')
    .setFontSize(10);

  SpreadsheetApp.flush();
  ui.alert('Done!', '4 sheets ban gayi. Ab menu me Kendra Portal -> Open entry form try karo.', ui.ButtonSet.OK);
}

/* ========================= WEB APP ============================ */

/**
 * Portal (Node web app) se data yahan POST hota hai aur seedha sheet me
 * save ho jata hai. Deploy karke mila Web App URL portal ke config.js me
 * dalna hai.
 *
 * Body (JSON):
 *   {
 *     customer: { name, phone, aadhaar, dob, gender, address, father, regNo },
 *     document: { type, docNo, issueDate, validTill, issuedBy, status, remarks },
 *     filename: "aadhaar.pdf"
 *   }
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const result = saveRecord(body);
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Kendra Portal - Client Document Entry')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function openForm() {
  const html = HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Kendra Portal - Client Document Entry')
    .setWidth(760)
    .setHeight(680);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Form dropdown ke liye types: standard list + DocTypes sheet me jo add kiya
 * ho + Documents sheet me jo types pehle use ho chuke hain. Isse naya type
 * ek baar use karne ke baad agli baar dropdown me khud aa jata hai.
 */
function getDocTypes() {
  const out = [];
  const seen = {};
  DOC_TYPES.forEach((t) => {
    if (!seen[t]) {
      seen[t] = 1;
      out.push(t);
    }
  });
  try {
    const ss = getSS();
    const typesSheet = ss.getSheetByName(DOCTYPE_SHEET);
    if (typesSheet && typesSheet.getLastRow() > 1) {
      typesSheet
        .getRange(2, 1, typesSheet.getLastRow() - 1, 1)
        .getValues()
        .flat()
        .forEach((t) => {
          const v = String(t).trim();
          if (v && !seen[v]) {
            seen[v] = 1;
            out.push(v);
          }
        });
    }
    const docSheet = ss.getSheetByName(DOCUMENT_SHEET);
    if (docSheet && docSheet.getLastRow() > 1) {
      docSheet
        .getRange(2, 2, docSheet.getLastRow() - 1, 1)
        .getValues()
        .flat()
        .forEach((t) => {
          const v = String(t).trim();
          if (v && !seen[v]) {
            seen[v] = 1;
            out.push(v);
          }
        });
    }
  } catch (e) {
    // sheet setup nahi hua to sirf standard list
  }
  return out;
}

/* ========================= PARSING ============================ */

/**
 * Pasted text (Aadhaar / Niwas Praman / Registration...) se fields nikalo.
 * Aadhaar letter me aksar label ek line pe aur value agli line pe hoti hai:
 *   Name
 *   Ramesh Kumar
 *   Date of Birth
 *   12/03/1990
 * Dono style handle hote hain: "Label : Value" aur "Label\nValue".
 */
function parseDocumentText(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const fields = [];
  const seen = {};

  function add(key, value) {
    if (!value || seen[key]) return;
    fields.push({ key: key, value: String(value).trim() });
    seen[key] = true;
  }

  // "Label : Value" same line, ya "Label" ke turant baad wali line
  const LABELS = [
    { key: 'Customer Name', names: ['applicant name', 'client name', 'customer name', 'name'] },
    { key: "Father's Name", names: ["father's name", 'father / husband name', 'father name', 'husband name'] },
    { key: 'Date of Birth', names: ['date of birth', 'dob'] },
    { key: 'Gender', names: ['gender'] },
    { key: 'Aadhaar No', names: ['aadhaar number', 'aadhaar no', 'aadhar number', 'aadhar no', 'uidai no'] },
    { key: 'Address', names: ['address'] },
    { key: 'Phone / Email', names: ['phone', 'mobile', 'contact', 'email'] },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const lab of LABELS) {
      if (seen[lab.key]) continue;
      for (const nm of lab.names) {
        // same line: "Name : Ramesh Kumar"
        const inline = new RegExp('^' + escapeRe(nm) + '\\s*:?\\s*(.+)$', 'i').exec(line);
        if (inline && inline[1] && !isLabelLike(inline[1])) {
          add(lab.key, inline[1]);
          break;
        }
        // next line: line exactly equals the label
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

  // Aadhaar Number: 12 digits (4-4-4 bhi ho sakta hai), kisi bhi line me
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

  // Date of issue (agar dob me nahi mila)
  if (!seen['Issue Date']) {
    for (const l of lines) {
      const m = l.match(/(?:issue|issued|date)\s*(?:date)?\s*:?\s*([0-9]{1,2}[-\/][0-9]{1,2}[-\/][0-9]{2,4})/i);
      if (m) {
        add('Issue Date', m[1]);
        break;
      }
    }
  }

  const customer = {};
  const document = {};
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
  for (const f of fields) {
    const key = f.key;
    if (key === 'Customer Name') customer.name = f.value;
    else if (key === "Father's Name") customer.father = f.value;
    else if (key === 'Date of Birth') customer.dob = f.value;
    else if (key === 'Gender') customer.gender = f.value;
    else if (key === 'Aadhaar No') customer.aadhaar = f.value;
    else if (key === 'Address') customer.address = f.value;
    else if (key === 'Phone / Email') customer.phone = f.value;
    else if (key === 'Document No') document.docNo = f.value;
    else if (key === 'Issue Date') document.issueDate = f.value;
  }
  if (!document.type) {
    for (const [re, type] of TYPE_MAP) {
      if (re.test(String(text || '').toLowerCase())) {
        document.type = type;
        break;
      }
    }
  }

  return {
    customer: customer,
    document: document,
    fields: fields,
  };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isLabelLike(s) {
  const t = String(s).trim().toLowerCase();
  return /^(name|gender|address|date\s*of\s*birth|dob|father|aadhaar|phone|mobile|email|registration|issue)/.test(t);
}

/* ========================= SAVE ============================== */

function getCustomers() {
  const sh = getSS().getSheetByName(CUSTOMER_SHEET);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh
    .getRange(2, 2, last - 1, 1)
    .getValues()
    .flat()
    .filter((v) => String(v).trim());
}

/**
 * payload = {
 *   customer: { name, phone, aadhaar, dob, gender, address, father, regNo },
 *   document: { type, docNo, issueDate, validTill, issuedBy, status, remarks }
 * }
 * Client pehle Aadhaar se dhoonda jata hai, nahi mila to naam se.
 * Naya client aata hai to Customer ID khud ban jati hai.
 */
function saveRecord(payload) {
  const ss = getSS();
  const custSheet = ss.getSheetByName(CUSTOMER_SHEET);
  const docSheet = ss.getSheetByName(DOCUMENT_SHEET);
  const cust = (payload && payload.customer) || {};
  const doc = (payload && payload.document) || {};
  const filename = (payload && payload.filename) || '';
  const name = String(cust.name || '').trim();
  if (!name) throw new Error('Client ka naam zaroori hai');

  const aadhaarDigits = String(cust.aadhaar || '').replace(/\D/g, '');
  const custLast = custSheet.getLastRow();
  let custRow = -1;

  if (custLast >= 2) {
    const data = custSheet.getRange(2, 1, custLast - 1, CUSTOMER_COLUMNS.length).getValues();
    if (aadhaarDigits) {
      const idx = data.findIndex((r) => String(r[3] || '').replace(/\D/g, '') === aadhaarDigits);
      if (idx >= 0) custRow = idx + 2;
    }
    if (custRow < 0) {
      const idx = data.findIndex((r) => String(r[1]).trim().toLowerCase() === name.toLowerCase());
      if (idx >= 0) custRow = idx + 2;
    }
  }

  if (custRow < 0) {
    const id = 'CUST-' + String(custLast).padStart(3, '0');
    custSheet.appendRow([
      id, name, cust.phone || '', aadhaarDigits || cust.aadhaar || '',
      cust.dob || '', cust.gender || '', cust.address || '',
      cust.father || '', cust.regNo || '', new Date(),
    ]);
    custRow = custSheet.getLastRow();
  } else {
    // purana client: jo fields khali hain unhe bharein (matlab jo data pehle se hai wo nahi badlega)
    const row = custSheet.getRange(custRow, 1, 1, CUSTOMER_COLUMNS.length).getValues()[0];
    row[2] = row[2] || cust.phone || '';
    row[3] = row[3] || aadhaarDigits || '';
    row[4] = row[4] || cust.dob || '';
    row[5] = row[5] || cust.gender || '';
    row[6] = row[6] || cust.address || '';
    row[7] = row[7] || cust.father || '';
    row[8] = row[8] || cust.regNo || '';
    custSheet.getRange(custRow, 1, 1, CUSTOMER_COLUMNS.length).setValues([row]);
  }

  docSheet.appendRow([
    name, doc.type || '', doc.docNo || '', doc.issueDate || '',
    doc.validTill || '', doc.issuedBy || '', doc.status || 'Submitted',
    doc.remarks || '', filename, new Date(),
  ]);

  return { ok: true, customer: name };
}

/** Dashboard: ek customer ke saare documents (table ke liye) */
function getCustomerDocs(name) {
  const docSheet = getSS().getSheetByName(DOCUMENT_SHEET);
  const last = docSheet.getLastRow();
  if (last < 2) return [];
  const rows = docSheet.getRange(2, 1, last - 1, DOCUMENT_COLUMNS.length).getValues();
  const target = String(name || '').trim().toLowerCase();
  const out = [];
  for (const r of rows) {
    if (String(r[0]).trim().toLowerCase() !== target) continue;
    const obj = {};
    DOCUMENT_COLUMNS.forEach((c, i) => {
      obj[c] = r[i];
    });
    out.push(obj);
  }
  return out;
}

/** Dashboard: "Open Google Sheet" button ke liye */
function getSheetUrl() {
  try {
    return getSS().getUrl();
  } catch (e) {
    return '';
  }
}
