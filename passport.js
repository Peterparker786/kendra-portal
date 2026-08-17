// passport.js — passport-size photo sheet maker
// ---------------------------------------------------------------------------
// Photo upload karo -> passport size (2x2 inch ya 35x45mm) me crop
// -> A4 sheet pe utni photos ki grid (jaisi count di ho) -> PDF + preview.

import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import * as mupdf from 'mupdf';

const MM = 72 / 25.4; // 1mm = 2.8346 pt (pdf-lib points me)

const PRESETS = {
  '2x2':    { w: 50.8, h: 50.8, label: '2×2 inch (51×51 mm) — Passport' },
  '35x45':  { w: 35,   h: 45,   label: '35×45 mm — Govt Forms' },
};

/**
 * @param {Buffer} buffer photo bytes
 * @param {{ size?: string, count?: number }} opts
 * @returns {Promise<{ dataUrl, preview, count, perSheet, pages, sizeLabel, w, h }>}
 */
export async function makePassportSheet(buffer, { size = '2x2', count = 8 } = {}) {
  const preset = PRESETS[size] || PRESETS['2x2'];
  const { w, h } = preset;
  count = Math.max(1, Math.min(100, parseInt(count, 10) || 8));

  // ---- A4 layout (mm) ----
  const pageW = 210, pageH = 297;
  const margin = 8, gap = 2;
  const usableW = pageW - 2 * margin;
  const usableH = pageH - 2 * margin;
  const cols = Math.max(1, Math.floor((usableW + gap) / (w + gap)));
  const rows = Math.max(1, Math.floor((usableH + gap) / (h + gap)));
  const perSheet = cols * rows;
  const pages = Math.ceil(count / perSheet);

  // ---- photo ko passport aspect me center-crop + print-quality resize ----
  const cellPxW = Math.round((w * 300) / 25.4); // 300 dpi
  const cellPxH = Math.round((h * 300) / 25.4);
  const meta = await sharp(buffer).rotate().metadata();
  const ar = w / h; // target aspect
  const imgAr = meta.width / meta.height;
  let cw, ch;
  if (imgAr > ar) {
    ch = meta.height;
    cw = Math.round(meta.height * ar);
  } else {
    cw = meta.width;
    ch = Math.round(meta.width / ar);
  }
  const left = Math.round((meta.width - cw) / 2);
  const top = Math.round((meta.height - ch) / 2);
  const photo = await sharp(buffer)
    .rotate()
    .extract({ left, top, width: cw, height: ch })
    .resize(cellPxW, cellPxH, { fit: 'fill' })
    .jpeg({ quality: 92 })
    .toBuffer();

  // ---- A4 PDF: grid me photos ----
  const doc = await PDFDocument.create();
  const img = await doc.embedJpg(photo);
  const imgW = w * MM, imgH = h * MM;
  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([pageW * MM, pageH * MM]);
    const start = p * perSheet;
    const n = Math.min(perSheet, count - start);
    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = margin * MM + col * (w + gap) * MM;
      const y = pageH * MM - margin * MM - (row + 1) * imgH - row * gap * MM;
      page.drawImage(img, { x, y, width: imgW, height: imgH });
    }
  }
  const pdfBuf = Buffer.from(await doc.save());

  // ---- preview: pehli sheet ko image me render (mupdf) ----
  let preview = null;
  try {
    const mdoc = mupdf.Document.openDocument(pdfBuf, 'application/pdf');
    const pg = mdoc.loadPage(0);
    const pix = pg.toPixmap(mupdf.Matrix.scale(1.0, 1.0), mupdf.ColorSpace.DeviceRGB, false, true);
    preview = 'data:image/png;base64,' + Buffer.from(pix.asPNG()).toString('base64');
  } catch {
    preview = null;
  }

  return {
    dataUrl: 'data:application/pdf;base64,' + pdfBuf.toString('base64'),
    preview,
    count,
    perSheet,
    pages,
    sizeLabel: preset.label,
    w,
    h,
  };
}
