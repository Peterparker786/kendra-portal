// ocr.js — image (JPEG/PNG) -> text via Tesseract (offline, local tessdata)
// Worker ek baar banta hai aur reuse hota hai (har request pe naya nahi).
//
// Powerup (v2):
//  - EXIF auto-orient: phone ki ulti/tedi photo seedha ho jati hai (.rotate())
//  - sharpen: dhundhli photo ka text thoda crisp hota hai
//  - rotateAuto: Tesseract khud angle detect karke ghoomi hui photo seedhi karta hai
//  - fallback: pehla result kharab ho to single-block (psm 6) se dobara try

import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tessdataDir = path.join(__dirname, 'tessdata');

let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng+hin', 1, {
      langPath: tessdataDir,
      logger: () => {},
    }).catch((err) => {
      // worker crash -> agli baar naya bana
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/**
 * OCR quality ke liye image preprocess:
 *  - EXIF se auto-orient (phone photos jo ulti stored hain)
 *  - grayscale + contrast normalize
 *  - chhoti image (mobile photo/scanned) ko upscale karo
 *  - bade image ko cap karo (tesseract ko speed ke liye)
 *  - sharpen (dhundhli text ke liye)
 */
async function preprocess(buffer) {
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    return null; // not an image
  }
  const width = meta.width || 0;
  const height = meta.height || 0;

  let pipeline = sharp(buffer).rotate().grayscale().normalize();
  const maxDim = Math.max(width, height);

  if (maxDim > 0 && maxDim < 1000) {
    // chhoti image ko 2x tak upscale
    const scale = Math.min(2, 1600 / maxDim);
    pipeline = pipeline.resize(Math.round(width * scale), Math.round(height * scale));
  } else if (maxDim > 2600) {
    pipeline = pipeline.resize(Math.round((width / maxDim) * 2600), Math.round((height / maxDim) * 2600));
  }

  return pipeline.sharpen({ sigma: 1.2 }).png().toBuffer();
}

/**
 * Image buffer -> { text, confidence }
 * Pehla pass: rotateAuto (Tesseract khud angle nikalta hai).
 * Agar result kharab ho (kam confidence / chhota text) -> psm 6 single-block se
 * dobara try karke jo behtar ho use chuno.
 */
export async function ocrImage(buffer) {
  const processed = await preprocess(buffer);
  if (!processed) throw new Error('Yeh file image nahi hai (JPEG/PNG chahiye)');
  const worker = await getWorker();

  let best = { text: '', confidence: 0 };
  try {
    const r1 = await worker.recognize(processed, { rotateAuto: true });
    best = r1.data || best;
  } catch (err) {
    console.error('OCR pass 1 failed:', err.message);
  }

  const textLen = (best.text || '').trim().length;
  if (textLen < 40 || (best.confidence || 0) < 50) {
    try {
      const r2 = await worker.recognize(processed, { psm: 6, rotateAuto: false });
      if (r2.data && (r2.data.confidence || 0) > (best.confidence || 0)) best = r2.data;
    } catch (err) {
      console.error('OCR pass 2 failed:', err.message);
    }
  }

  return { text: best.text || '', confidence: best.confidence || 0 };
}
