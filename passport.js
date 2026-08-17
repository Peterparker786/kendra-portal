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
export async function makePassportSheet(buffer, opts = {}) {
  const { size = '2x2', count: countRaw = 8 } = opts;
  const preset = PRESETS[size] || PRESETS['2x2'];
  const { w, h } = preset;
  const count = Math.max(1, Math.min(100, parseInt(countRaw, 10) || 8));

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
  let working = await sharp(buffer).rotate().flatten({ background: '#ffffff' }).toBuffer();
  if (opts.bg && /^#[0-9a-f]{6}$/i.test(opts.bg)) {
    working = await replaceBackground(working, opts.bg);
  }
  const meta = await sharp(working).metadata();
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
  const photo = await sharp(working)
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
    bg: opts.bg || '',
    w,
    h,
  };
}

/** Photo ke background ko solid color se replace karo (edge flood-fill) */
async function replaceBackground(buffer, hex) {
  const target = [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const total = w * h;

  // background ka reference color = border pixels ka average
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let x = 0; x < w; x++) {
    sr += data[x * 3]; sg += data[x * 3 + 1]; sb += data[x * 3 + 2]; n++;
    const j = (h - 1) * w + x;
    sr += data[j * 3]; sg += data[j * 3 + 1]; sb += data[j * 3 + 2]; n++;
  }
  for (let y = 1; y < h - 1; y++) {
    const a = y * w, b2 = y * w + w - 1;
    sr += data[a * 3]; sg += data[a * 3 + 1]; sb += data[a * 3 + 2]; n++;
    sr += data[b2 * 3]; sg += data[b2 * 3 + 1]; sb += data[b2 * 3 + 2]; n++;
  }
  const br = sr / n, bgc = sg / n, bb = sb / n;
  const tol = 30;
  const isBg = (i) =>
    Math.abs(data[i * 3] - br) <= tol &&
    Math.abs(data[i * 3 + 1] - bgc) <= tol &&
    Math.abs(data[i * 3 + 2] - bb) <= tol;

  // edges se flood-fill karke background mask banao
  const visited = new Uint8Array(total);
  const stack = [];
  const tryPush = (i) => { if (!visited[i]) { visited[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { tryPush(x); tryPush((h - 1) * w + x); }
  for (let y = 1; y < h - 1; y++) { tryPush(y * w); tryPush(y * w + w - 1); }
  const mask = new Uint8Array(total);
  while (stack.length) {
    const i = stack.pop();
    if (!isBg(i)) continue;
    mask[i] = 1;
    const x = i % w;
    if (x > 0) tryPush(i - 1);
    if (x < w - 1) tryPush(i + 1);
    if (i >= w) tryPush(i - w);
    if (i < total - w) tryPush(i + w);
  }

  // apply: background -> target color, edges pe 1px feather (smooth transition)
  const out = Buffer.from(data);
  for (let i = 0; i < total; i++) {
    if (mask[i]) {
      out[i * 3] = target[0]; out[i * 3 + 1] = target[1]; out[i * 3 + 2] = target[2];
    }
  }
  for (let i = 0; i < total; i++) {
    if (!mask[i]) {
      const x = i % w;
      const touchesBg =
        (x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) ||
        (i >= w && mask[i - w]) || (i < total - w && mask[i + w]);
      if (touchesBg) {
        out[i * 3] = (data[i * 3] + target[0]) >> 1;
        out[i * 3 + 1] = (data[i * 3 + 1] + target[1]) >> 1;
        out[i * 3 + 2] = (data[i * 3 + 2] + target[2]) >> 1;
      }
    }
  }
  return sharp(out, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 92 })
    .toBuffer();
}

export { replaceBackground };
