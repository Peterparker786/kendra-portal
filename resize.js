// resize.js — document resizer: PDF/image ka size kam karo (quality sahi rakhte hue)
// --------------------------------------------------------------------------------
// - JPG/PNG: sharp se max 1600px + JPEG quality 80
// - PDF: mupdf se har page ~150 dpi render karke JPEG me, phir pdf-lib se nayi PDF
//   -> scanned PDFs (photos wale) ka size bahut kam hota hai.
//   Chhota text-PDF (<300KB) render nahi karte — usse bada ho jata hai.
// - Agar output input se bada nikle to original hi wapas karo (pct 0).

import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import * as mupdf from 'mupdf';

/** PDF/image -> { sizeBefore, sizeAfter, pct, dataUrl, downloadName, mime } */
export async function resizeDocument(buffer, filename) {
  const lower = String(filename || '').toLowerCase();
  const sizeBefore = buffer.length;
  let out;
  let mime = 'application/octet-stream';
  let outName = (filename.replace(/\.[^.]+$/, '') || 'document') + '-resized';

  if (/\.(jpe?g|png)$/.test(lower)) {
    mime = 'image/jpeg';
    outName += '.jpg';
    out = await sharp(buffer)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } else if (lower.endsWith('.pdf')) {
    mime = 'application/pdf';
    outName += '.pdf';
    out = await shrinkPdf(buffer);
  } else {
    throw new Error('Sirf PDF, JPG ya PNG upload karo');
  }

  if (out.length >= sizeBefore) {
    return {
      sizeBefore,
      sizeAfter: sizeBefore,
      pct: 0,
      dataUrl: dataUrlFor(buffer, mime),
      downloadName: outName,
      mime,
      note: 'File pehle se chhota hai — koi badlav nahi hua',
    };
  }
  return {
    sizeBefore,
    sizeAfter: out.length,
    pct: Math.round((1 - out.length / sizeBefore) * 100),
    dataUrl: dataUrlFor(out, mime),
    downloadName: outName,
    mime,
  };
}

function dataUrlFor(buf, mime) {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** PDF pages ko JPEG me render karke chhoti PDF banao (mupdf) */
async function shrinkPdf(buffer) {
  if (buffer.length < 300 * 1024) return buffer; // text-based chhota PDF — render mat karo
  const mdoc = mupdf.Document.openDocument(buffer, 'application/pdf');
  const pageCount = mdoc.countPages();
  const matrix = mupdf.Matrix.scale(1.5, 1.5); // ~150 dpi — quality sahi, size chhota
  const colorspace = mupdf.ColorSpace.DeviceRGB;

  const outPdf = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = mdoc.loadPage(i);
    const pixmap = page.toPixmap(matrix, colorspace, false, true);
    const jpeg = await sharp(pixmap.asPNG()).jpeg({ quality: 80 }).toBuffer();
    const img = await outPdf.embedJpg(jpeg);
    const bounds = page.getBounds(); // [x0, y0, x1, y1] points me
    const w = bounds[2] - bounds[0];
    const h = bounds[3] - bounds[1];
    const p = outPdf.addPage([w, h]);
    p.drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
  return Buffer.from(await outPdf.save());
}
