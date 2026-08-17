/***************************************************************
 * FILE: SheetSync.gs  (sirf Google Sheet me save karne wala receiver)
 * -------------------------------------------------------------
 * Yeh POORA portal NAHI hai. Sirf ek chhota web app hai jo
 * aapke local portal se data leta hai aur Google Sheet me likh
 * deta hai (Customers + Documents columns me).
 *
 * SETUP (ek baar, 2 minute):
 *   1. Apni "Customers data" wali spreadsheet kholo
 *   2. Extensions -> Apps Script  (spreadsheet se juda hua editor khulega)
 *   3. Jo code pehle hai use hatao, yeh file paste karo, Save (Ctrl+S)
 *   4. Deploy -> New deployment -> Web app
 *        - Execute as: Me
 *        - Who has access: Anyone
 *      -> Deploy -> URL copy karo (script.google.com/macros/s/.../exec)
 *   5. Us URL ko ek baar browser me kholo (authorize karo - zaroori hai)
 *   6. Woh URL mujhe bhejo, main config.js me daal dunga
 ***************************************************************/

// doGet: portal isse saara data read karta hai (restore + services links).
// Services tab (col A = Service Name, col B = URL) — portal ke service cards
// ke links yahan se aate hain. Sheet me badlo, portal me dikhega.
function doGet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var cust = ss.getSheetByName('Customers');
    var docs = ss.getSheetByName('Documents');
    var svc = ss.getSheetByName('Services');
    if (!svc) {
      svc = ss.insertSheet('Services');
      svc.appendRow(['Service Name', 'URL']);
      seedServices(svc);
    } else if (svc.getLastRow() === 0) {
      svc.appendRow(['Service Name', 'URL']);
      seedServices(svc);
    } else if (svc.getLastRow() === 1) {
      // sirf header hai -> saari services seed karo (links ke saath)
      seedServices(svc);
    }
    var out = { ok: true, customers: [], documents: [], services: [] };

    if (cust && cust.getLastRow() > 1) {
      var cv = cust.getRange(2, 1, cust.getLastRow() - 1, 10).getValues();
      for (var i = 0; i < cv.length; i++) {
        var r = cv[i];
        if (!String(r[1]).trim()) continue; // empty row skip
        out.customers.push({
          name: r[1], phone: r[2], aadhaar: r[3], dob: r[4], gender: r[5],
          address: r[6], father: r[7], regNo: r[8]
        });
      }
    }
    if (docs && docs.getLastRow() > 1) {
      var dv = docs.getRange(2, 1, docs.getLastRow() - 1, 10).getValues();
      for (var j = 0; j < dv.length; j++) {
        var d = dv[j];
        if (!String(d[0]).trim()) continue; // empty row skip
        out.documents.push({
          customer: d[0], type: d[1], docNo: d[2], issueDate: d[3], validTill: d[4],
          issuedBy: d[5], status: d[6], remarks: d[7], filename: d[8]
        });
      }
    }
    if (svc.getLastRow() > 1) {
      var sv = svc.getRange(2, 1, svc.getLastRow() - 1, 2).getValues();
      for (var k = 0; k < sv.length; k++) {
        if (!String(sv[k][0]).trim()) continue; // empty row skip
        out.services.push({
          name: String(sv[k][0]).trim(),
          url: String(sv[k][1] || '').trim()
        });
      }
    }
    return ContentService.createTextOutput(JSON.stringify(out))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var c = body.customer || {};
    var d = body.document || {};
    var filename = body.filename || '';

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var cust = getSheet(ss, 'Customers', ['Customer ID', 'Customer Name', 'Phone / Email', 'Aadhaar No', 'Date of Birth', 'Gender', 'Address', "Father's Name", 'University Reg No', 'Created On']);
    var docs = getSheet(ss, 'Documents', ['Customer Name', 'Document Type', 'Document No', 'Issue Date', 'Valid Till', 'Issued By', 'Status', 'Remarks', 'File Name', 'Entry Date']);

    var now = new Date();
    var custRow = findRow(cust, c.aadhaar || '', c.name || '');
    if (custRow > 0) {
      // client pehle se hai -> jo fields khali hain unhe bharo
      var row = cust.getRange(custRow, 1, 1, 10).getValues()[0];
      var vals = [
        row[0] || (cust.getLastRow()),
        c.name || row[1],
        row[2] || c.phone || '',
        row[3] || c.aadhaar || '',
        row[4] || c.dob || '',
        row[5] || c.gender || '',
        row[6] || c.address || '',
        row[7] || c.father || '',
        row[8] || c.regNo || '',
        row[9] || now
      ];
      cust.getRange(custRow, 1, 1, 10).setValues([vals]);
    } else {
      cust.appendRow([
        cust.getLastRow(), c.name || '', c.phone || '', c.aadhaar || '',
        c.dob || '', c.gender || '', c.address || '', c.father || '',
        c.regNo || '', now
      ]);
    }

    docs.appendRow([
      c.name || '', d.type || '', d.docNo || '', d.issueDate || '',
      d.validTill || '', d.issuedBy || '', d.status || 'Submitted',
      d.remarks || '', filename, now
    ]);

    return ContentService.createTextOutput(JSON.stringify({ ok: true, saved: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Services tab khali ho to saari services + current links bhar do.
// (User yahan links edit kar sakta hai — portal ~2 min me utha leta hai.)
function seedServices(sheet) {
  var rows = [
    ['Aadhaar Card', 'https://myaadhaar.uidai.gov.in/'],
    ['Aadhaar Correction', 'https://myaadhaar.uidai.gov.in/'],
    ['PAN Card', 'https://www.proteantech.in/pan-india/index.html'],
    ['Niwas Praman (Residence)', 'https://edistrict.up.gov.in/'],
    ['Domicile Certificate', 'https://edistrict.up.gov.in/'],
    ['Cast Certificate', 'https://edistrict.up.gov.in/'],
    ['Income Certificate', 'https://edistrict.up.gov.in/'],
    ['Birth Certificate', 'https://www.crsorgi.gov.in/'],
    ['Death Certificate', 'https://www.crsorgi.gov.in/'],
    ['Marriage Registration', 'https://marriage.up.gov.in/'],
    ['Voter ID', 'https://voters.eci.gov.in/'],
    ['Ration Card', 'https://fcs.up.gov.in/'],
    ['Student / University Registration', 'https://edistrict.up.gov.in/'],
    ['Scholarship Documents', 'https://scholarships.gov.in/'],
    ['Other', 'https://edistrict.up.gov.in/'],
  ];
  if (rows.length) sheet.getRange(2, 1, rows.length, 2).setValues(rows);
}

// Sheet mili to wahi, nahi mili to columns ke saath nayi banao
function getSheet(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
  } else if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
  }
  return sh;
}

// Pehle Aadhaar se dhoondo, nahi mila to naam se
function findRow(sheet, aadhaar, name) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var names = sheet.getRange(2, 2, last - 1, 1).getValues(); // col 2 = Customer Name
  var aadhaars = sheet.getRange(2, 4, last - 1, 1).getValues(); // col 4 = Aadhaar No
  for (var i = 0; i < last - 1; i++) {
    var a = String(aadhaars[i][0] || '').replace(/[^0-9]/g, '');
    var aa = String(aadhaar || '').replace(/[^0-9]/g, '');
    if (aa && a && a === aa) return i + 2;
  }
  for (var j = 0; j < last - 1; j++) {
    if (name && String(names[j][0]).toLowerCase() === String(name).toLowerCase()) return j + 2;
  }
  return -1;
}
