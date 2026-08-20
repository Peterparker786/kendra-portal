// passport.js — passport-size photo sheet maker
// ---------------------------------------------------------------------------
// Photo upload karo -> passport size (2x2 inch ya 35x45mm) me crop
// -> A4 sheet pe utni photos ki grid (jaisi count di ho) -> PDF + preview.

import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import * as mupdf from 'mupdf';
import { detectFace } from './face.js';

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
  // User-defined crop (percentages of image): { x, y, w, h } each 0-100
  const userCrop = opts.crop ? {
    x: parseFloat(opts.crop.x) || 0,
    y: parseFloat(opts.crop.y) || 0,
    w: parseFloat(opts.crop.w) || 100,
    h: parseFloat(opts.crop.h) || 100,
  } : null;

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
  const face = await detectFace(working);
  let cw, ch, left, top;
  if (face && face.w > 0 && face.h > 0) {
    // ---- face-aware crop ----
    // pico ka box eyes-to-chin hota hai — hair/forehead ke liye upar expand karo,
    // warna head ka top crop ke bahar chala jata hai (yehi pehle ho raha tha).
    const headTop = face.y - face.h * 0.28;
    const headBot = face.y + face.h * 1.05;
    const headH = headBot - headTop;
    const headCx = face.x + face.w / 2;

    // composition: (expanded) head height ~55% of crop, head ke upar 12% headroom
    const FACE_RATIO = 0.55;
    const HEADROOM = 0.12;

    let fc = headH / FACE_RATIO;
    let fw = fc * ar;
    // zoom cap: crop ko itna chhota mat karo ki blur aaye ya head kate
    const minCh = Math.max(0.45 * meta.height, (0.5 * meta.width) / ar);
    if (fc < minCh) fc = minCh;
    if (fc > meta.height) fc = meta.height;
    fw = fc * ar;
    if (fw > meta.width) { fw = meta.width; fc = fw / ar; }

    let l = headCx - fw / 2;  // horizontally head pe center
    let t = headTop - HEADROOM * fc; // head ke upar thodi jagah
    if (l < 0) l = 0;
    if (l + fw > meta.width) l = meta.width - fw;
    if (t < 0) t = 0;
    if (t + fc > meta.height) t = meta.height - fc;
    cw = Math.round(fw); ch = Math.round(fc);
    left = Math.round(l); top = Math.round(t);
  } else {
    // ---- fallback: face nahi mila — upar-biased crop (face upar hota hai) ----
    const imgAr = meta.width / meta.height;
    if (imgAr > ar) {
      ch = meta.height;
      cw = Math.round(meta.height * ar);
    } else {
      cw = meta.width;
      ch = Math.round(meta.width / ar);
    }
    left = Math.round((meta.width - cw) / 2);
    top = Math.round((meta.height - ch) * 0.35); // center nahi, thoda upar
  }
  // ---- user-defined crop ya auto face-detect crop ----
  if (userCrop) {
    const uw = Math.round((userCrop.w / 100) * meta.width);
    const uh = Math.round((userCrop.h / 100) * meta.height);
    const ul = Math.round((userCrop.x / 100) * meta.width);
    const ut = Math.round((userCrop.y / 100) * meta.height);
    left = Math.max(0, Math.min(ul, meta.width - 1));
    top = Math.max(0, Math.min(ut, meta.height - 1));
    cw = Math.min(uw, meta.width - left);
    ch = Math.min(uh, meta.height - top);
  }
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

/** Photo ke background ko solid color se replace karo.
 *  Robust version: corner-patch sampling + gradient-tolerant flood fill + retry.
 *  Real photos (uneven wall lighting, subject touching edges) pe bhi kaam karta hai. */
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

  // ---- reference background color: 4 corners me se sabse uniform patch ----
  // (subject ke kandhe/baal edge tak touch karein to bhi ref sahi milta hai)
  const patch = Math.max(8, Math.round(Math.min(w, h) * 0.05));
  const corners = [];
  for (const [cx, cy] of [[0, 0], [w - patch, 0], [0, h - patch], [w - patch, h - patch]]) {
    let r = 0, g = 0, b = 0, n = 0;
    const vals = [];
    for (let y = cy; y < cy + patch; y++) {
      for (let x = cx; x < cx + patch; x++) {
        const i = (y * w + x) * 3;
        r += data[i]; g += data[i + 1]; b += data[i + 2];
        vals.push(data[i], data[i + 1], data[i + 2]);
        n++;
      }
    }
    const mr = r / n, mg = g / n, mb = b / n;
    let v = 0;
    for (let k = 0; k < vals.length; k += 3) {
      v += (vals[k] - mr) ** 2 + (vals[k + 1] - mg) ** 2 + (vals[k + 2] - mb) ** 2;
    }
    corners.push({ r: mr, g: mg, b: mb, std: Math.sqrt(v / (n * 3)) });
  }
  corners.sort((a, b) => a.std - b.std);
  const ref = corners[0];

  // brightness-relative tolerance (dark wall pe kam, bright pe zyada)
  const lum = 0.299 * ref.r + 0.587 * ref.g + 0.114 * ref.b;
  const tol = Math.max(28, Math.min(64, lum * 0.22));

  const dist = (i, rr, gg, bb) =>
    Math.abs(data[i * 3] - rr) + Math.abs(data[i * 3 + 1] - gg) + Math.abs(data[i * 3 + 2] - bb);

  // ---- flood fill: parent-chain comparison se gradient wall bhi cover hoti hai ----
  // (har pixel ko ref se + apne parent se check karte hain, total drift bounded)
  function floodFill(t, tStep, tMax) {
    const mask = new Uint8Array(total);
    const parent = new Int32Array(total).fill(-1);
    const queue = [];
    const push = (i, p) => { if (parent[i] === -1) { parent[i] = p; queue.push(i); } };
    for (let x = 0; x < w; x++) { push(x, -1); push((h - 1) * w + x, -1); }
    for (let y = 1; y < h - 1; y++) { push(y * w, -1); push(y * w + w - 1, -1); }
    while (queue.length) {
      const i = queue.pop();
      const p = parent[i];
      if (p === -1) {
        if (dist(i, ref.r, ref.g, ref.b) > t * 1.4) continue; // seed filter
      } else {
        const dRef = dist(i, ref.r, ref.g, ref.b);
        const dPar = dist(i, data[p * 3], data[p * 3 + 1], data[p * 3 + 2]);
        if (dRef > tMax || dPar > tStep) continue;
      }
      mask[i] = 1;
      const x = i % w;
      if (x > 0) push(i - 1, i);
      if (x < w - 1) push(i + 1, i);
      if (i >= w) push(i - w, i);
      if (i < total - w) push(i + w, i);
    }
    return mask;
  }

  let mask = floodFill(tol, tol * 0.6, tol * 3);
  let filled = 0;
  for (let i = 0; i < total; i++) filled += mask[i];
  let coverage = filled / total;

  // kam coverage -> looser parameters ke saath retry
  if (coverage < 0.18) {
    mask = floodFill(tol * 1.55, tol * 1.0, tol * 4.2);
    filled = 0;
    for (let i = 0; i < total; i++) filled += mask[i];
    coverage = filled / total;
  }

  // abhi bhi detect nahi hua -> original photo hi return (subject kharab na ho)
  if (coverage < 0.06) return buffer;

  // ---- apply: background -> target color, edges pe 1px feather ----
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
