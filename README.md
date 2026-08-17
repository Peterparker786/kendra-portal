# Kendra Portal — Client Documents (Jan Seva Kendra)

Customer ka document upload karo → data apne aap extract ho ke **preview** me aata hai →
jo galat ho usse theek karo → **Confirm & Save** → data save ho jata hai. Dashboard me
customer ke **naam pe click** karke uske saare documents dekho, aur Excel (CSV) me export karo.

Sirf **clients ke documents** (Aadhaar, Niwas Praman, Registration, Cast/Income
Certificate, Birth/Death/Marriage, Voter ID, Ration Card, Scholarship...) — printer/paper/
items wala koi structure nahi.

## Chalane ke liye

```bash
npm install     # pehli baar
npm start       # portal chalu karo
```

Browser me kholo: **http://localhost:4567**

- Rokne ke liye: jahan chala hai us terminal me `Ctrl + C`
- Sample documents banane ke liye: `npm run make-sample` (sample/ me Aadhaar + Niwas Praman PDFs)
- Data `data/portal.db` (SQLite) me save hota hai. Is file ko delete karke fresh start kar sakte ho.

## Kaise kaam karta hai

1. **Upload** — customer ka document drop karo (Aadhaar letter, Niwas Praman, Registration...):
   **PDF**, **JPG/JPEG**, **PNG** (photo ya scan bhi — image me text khud nikalta hai OCR se),
   ya **TXT/CSV**
2. **Extract** — server document ka text padhta hai (PDF → text, image → OCR) aur fields
   nikalta hai: Customer Name, Father's Name, Date of Birth, Gender, Aadhaar No, Address,
   Phone, Document No, Issue Date, Valid Till, Issued By + Document Type khud detect hota hai
   (Aadhaar letter ka "label ek line, value agli line" wala format bhi handle hota hai)
3. **Preview & Confirm** — sab fields editable; galat ho to theek karo, status chuno, Save dabao
4. **Save** — customer pehle **Aadhaar number** se dhoonda jata hai (nahi mila to naam se),
   isliye wahi customer dobara aaye to naya document uski **usi profile** me judta hai
5. **Dashboard** — customers ki list; naam pe click → uske saare documents + details
6. **Export** — "Export Excel (CSV)" har customer ke documents nikalta hai (Excel me khulta hai)

## Files

| File | Kaam |
|---|---|
| `server.js` | API + frontend serve |
| `extract.js` | PDF/text/image → fields (extraction rules yahan hain) |
| `ocr.js` | JPEG/PNG → text (Tesseract OCR, offline) |
| `db.js` | SQLite storage (customers + documents) |
| `public/` | Dashboard UI (koi build step nahi) |
| `scripts/make-sample-pdf.js` | Sample PDF documents banata hai |
| `scripts/make-sample-image.js` | Sample Aadhaar image (JPEG+PNG) banata hai |
| `scripts/fetch-tessdata.mjs` | Build time OCR data download (nayi machine/Render ke liye) |
| `render.yaml` | Render pe free deploy karne ka blueprint |

## GitHub + Render pe deploy (permanent link ke liye)

Repo: **https://github.com/Peterparker786/kendra-portal**

**Render pe free deploy (24x7 link):**

1. **render.com** pe signup karo — "Sign up with GitHub" se (repo connect ho jayegi)
2. Dashboard me **New + → Blueprint** → `Peterparker786/kendra-portal` repo chuno
3. Render `render.yaml` ko padh kar service bana degi. Deploy ke waqt **NARA_ROUTER_KEY**
   maangegi — wahan apni key daalo (`sk-nry-...` wali, router.bynara.id se)
4. Deploy hone ke baad jo URL mile (`https://kendra-portal.onrender.com`) wahi aapka
   **permanent link** hai — kisi ko bhi bhejo

**Zaroori baatein (free tier):**

- **Data reset hota hai!** Render free tier me disk ephemeral hai — `data/portal.db` har
  restart/deploy pe saaf ho jata hai. **Real data ke liye** (a) Google Sheet sync on karo
  (`GSCRIPT_URL` env me web app URL daalo — SheetSync.gs deploy karke) taaki copy sheet me
  bhi save ho, ya (b) paid disk (Render ~$7/mo). Demo/test ke liye bina kisi ke bhi chalta hai.
- Free tier **15 min idle ke baad so jata hai** — pehli request pe 30-60 sec lagte hain
  (wake up), phir fast.
- Agar `NARA_ROUTER_KEY` nahi daloge to AI fallback band rahega (Tesseract OCR chalta rahega).
| `sample/` | Sample documents (PDF + images) |
| `tessdata/` | OCR language files (eng + hin) — pehli baar me hi aate hain |

## Extraction rules customize karna

`extract.js` me `LABELS` array hai — apne documents ke label/format ke hisaab se
name patterns add/remove karo (jaise "Applicant Name", "Father Name", "UIDAI No"...).
Document types `detectDocType()` me hain.

## Google Sheet se jodna (data sheet me bhi save ho)

Portal me confirm hote hi data aapki Google Sheet me bhi save ho sakta hai —
Apps Script ke through (koi Google Cloud setup nahi):

1. Google Sheet → **Extensions → Apps Script** → Code.gs me yeh function add karo
   (jo `doGet` ke baad ho):

   ```javascript
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
   ```

2. **Deploy → New deployment → Web app** → Execute as: Me → Who has access: Anyone
   → **Deploy** → URL copy karo (script.google.com/macros/s/... wala)
3. `config.js` me yeh URL daalo:
   ```javascript
   export const GOOGLE_SHEET_WEBHOOK_URL = 'https://script.google.com/macros/s/XXXX/exec';
   ```
4. Portal restart karo (`npm start`) — ab har confirm pe data sheet me bhi save hoga.

Note: Sheet me pehle `setupPortal` chala ke Customers + Documents sheets bani honi chahiye.
Portal ke save par iska asar nahi padta — Google Sheet fail ho jaye tab bhi portal apne
ap me save karta hai (error sirf server log me aata hai).

## Google Sheet / Apps Script wala version

`appsscript/` folder me Google Apps Script version hai (agar data seedha Google Sheet me
chahiye). **Code.gs VERSION 3.4 + Index.html VERSION 4.1**:

- `getSS()` helper sheet ID se `openById` karta hai — standalone "Untitled project" me bhi
  `setupPortal` chal jata hai ("Service Spreadsheets failed" error nahi aayega)
- **Index.html v4 me file upload (PDF/JPG/PNG/TXT/CSV) + browser-side extraction** hai —
  pdf.js aur tesseract.js CDN se load hote hain, data browser me hi nikalta hai,
  phir `saveRecord` sheet me save karta hai
- Dashboard: client dropdown + documents table + "Open Google Sheet" button

Note: Apps Script web app me browser-side extraction ke liye **internet chahiye** (CDN
libraries) aur pehli baar OCR thoda slow hota hai (traineddata download). Scanned PDF me
text select nahi hota — wahan image (JPG/PNG) upload karo ya text paste karo (fallback
box hamesha available hai).

## OCR ke bare me (images)

- Images ka text **Tesseract OCR** se nikalta hai — free, offline, koi API key nahi
- Pehle upload me thoda time lag sakta hai (worker load hota hai); uske baad fast
- Hindi (Devanagari) text ke liye bhi `hin` traineddata aata hai
- Chhoti/phone wali images ko OCR se pehle upscale kiya jata hai — quality behtar
- Photo ki EXIF orientation khud fix hoti hai, rotateAuto se tedi photo seedhi ho jati hai
- OCR 100% perfect nahi hota — jo typo aaye wo **preview me edit** karke save karo
  (yahi portal ka flow hai)

## AI Vision (Gemini) — dhundhli/photo/handwritten documents ke liye

Jab Tesseract se koi field na nikle (dhundhli, tedi, handwritten, ya Hindi document),
to photo/PDF **Google Gemini** ko bheji jati hai jo usse padh leta hai. Yeh ek
**optional fallback** hai — bina key ke portal waise hi chalta hai.

**FREE API key (2 minute):**

1. https://aistudio.google.com/apikey kholo (Google account se login)
2. "Create API key" -> copy karo
3. `config.js` me daalo: `export const GEMINI_API_KEY = 'AIza...';`
   (ya environment variable `GEMINI_API_KEY`)
4. Portal restart karo (`npm start`)

Kaise chalta hai: Tesseract se `Customer Name` na mile ya confidence kam ho, ya PDF
scanned ho (text layer khali), tab Gemini ko image/PDF bheji jati hai. Gemini ke
fields tesseract ke upar merge hote hain (AI wale jeet te hain). Model change karna
ho to `GEMINI_MODEL` env variable (default `gemini-2.5-flash`).
