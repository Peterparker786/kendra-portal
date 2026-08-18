// face.js — lightweight face detection (picojs) for smart passport framing
// ---------------------------------------------------------------------------
// Center-crop head ka top kat deta hai (face photo me upar hota hai).
// Ye module face dhoondh kar crop window ko face ke hisaab se position karta hai.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pico from 'picojs';

let classify = null;

function getClassifier() {
  if (!classify) {
    const modelPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'models',
      'facefinder'
    );
    classify = pico.unpack_cascade(new Uint8Array(fs.readFileSync(modelPath)));
  }
  return classify;
}

/**
 * Photo me sabse bada/confident face dhundo.
 * @param {Buffer} buffer image bytes (JPEG/PNG/WebP)
 * @returns {Promise<{x:number,y:number,w:number,h:number}|null>} face bbox (original image coords)
 */
export async function detectFace(buffer) {
  try {
    const img = sharp(buffer);
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return null;

    // speed ke liye chhoti image pe detect karo, phir coords wapas scale karo
    const maxDim = 900;
    const scale = Math.min(1, maxDim / Math.max(meta.width, meta.height));
    const W = Math.round(meta.width * scale);
    const H = Math.round(meta.height * scale);

    const gray = await img
      .resize(W, H, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();

    const dets = pico.run_cascade(
      { pixels: gray, nrows: H, ncols: W, ldim: W },
      getClassifier(),
      {
        shiftfactor: 0.1,
        minsize: Math.round(Math.min(W, H) * 0.12),
        maxsize: Math.round(Math.min(W, H)),
        scalefactor: 1.1,
      }
    );
    const dets2 = pico.cluster_detections(dets, 0.2);
    if (!dets2.length) return null;

    let best = dets2[0];
    for (const d of dets2) if (d[3] > best[3]) best = d;
    const [r, c, s] = best; // pico: r=row(y), c=col(x), s=box size
    return {
      x: Math.round(c / scale),
      y: Math.round(r / scale),
      w: Math.round(s / scale),
      h: Math.round(s / scale),
    };
  } catch {
    return null; // koi bhi error -> face nahi mila (center crop fallback)
  }
}
