// resumepdf.js — AI markdown resume -> clean A4 PDF (pdf-lib)
// Koi browser render nahi — server-side, fast aur reliable.
// Premium templates ke liye photo + sidebar/band layouts bhi support karta hai.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 52;
const CONTENT_W = PAGE_W - MARGIN * 2;

function hexToRgb(hex) {
  const h = String(hex || '#2563eb').replace('#', '');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return rgb(0.145, 0.388, 0.922);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function wrap(text, font, size, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (font.widthOfTextAtSize(t, size) > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/** markdown -> { name, subtitle, sections: [{title, lines:[{type:'bullet'|'para', text}]}] } */
function parseMarkdown(md) {
  const lines = String(md || '').split('\n').map((l) => l.trim()).filter((l) => l && !/^-{3,}$/.test(l));
  let name = '';
  let subtitle = [];
  const sections = [];
  let cur = null;

  const push = (type, text) => {
    if (!cur) return;
    cur.lines.push({ type, text });
  };

  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line)) {
      const title = line.replace(/^#+\s*/, '').trim();
      if (!name) { name = title; continue; }
      if (/^##\s/.test(line)) {
        cur = { title, lines: [] };
        sections.push(cur);
        continue;
      }
      if (!cur) { subtitle.push(title); continue; }
      push('para', title);
      continue;
    }
    if (/^\*\s+|- |• /.test(line)) {
      push('bullet', line.replace(/^\*\s+|- |• /, ''));
      continue;
    }
    if (!cur) { subtitle.push(line); continue; }
    if (cur.lines.length && cur.lines[cur.lines.length - 1].type === 'para') {
      cur.lines[cur.lines.length - 1].text += ' ' + line;
    } else {
      push('para', line);
    }
  }
  if (cur && !sections.includes(cur)) sections.push(cur);
  return { name, subtitle: subtitle.join(' | '), sections };
}

async function embedPhoto(pdf, photo) {
  if (!photo || !/^data:image\/(png|jpe?g);base64,/.test(photo)) return null;
  const m = photo.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
  const b64 = m[2].replace(/-/g, '+').replace(/_/g, '/');
  const buf = Buffer.from(b64, 'base64');
  try {
    if (m[1].toLowerCase() === 'png') return await pdf.embedPng(buf);
    return await pdf.embedJpg(buf);
  } catch {
    return null;
  }
}

export async function buildResumePdf(markdown, accent = '#2563eb', opts = {}) {
  const { photo, template } = opts;
  const pdf = await PDFDocument.create();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const times = await pdf.embedFont(StandardFonts.TimesRoman);
  const timesB = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const ink = rgb(0.09, 0.11, 0.18);
  const muted = rgb(0.38, 0.42, 0.52);
  const white = rgb(1, 1, 1);
  const acc = hexToRgb(accent);

  const layout = (template || '').includes('band') ? 'band'
    : ['split-navy', 'split-teal', 'student', 'classic'].includes(template || '') ? 'sidebar' : 'single';

  const img = await embedPhoto(pdf, photo);
  const photoD = img ? { w: img.width, h: img.height } : null;
  const drawPhoto = (pg, x, y, size) => {
    if (!img || !photoD) return;
    const scale = size / Math.max(photoD.w, photoD.h);
    const w = photoD.w * scale;
    const h = photoD.h * scale;
    pg.drawImage(img, { x: x + (size - w) / 2, y: y + (size - h) / 2, width: w, height: h });
    pg.drawCircle({ x: x + size / 2, y: y + size / 2, size: size / 2 + 1.5, borderColor: white, borderWidth: 2.5 });
  };

  const { name, subtitle, sections } = parseMarkdown(markdown);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const ensure = (need) => {
    if (y - need < MARGIN) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  // ---------------- sidebar layout (split / student / classic) ----------------
  if (layout === 'sidebar') {
    const SIDE_W = 175;
    page.drawRectangle({ x: 0, y: 0, width: SIDE_W, height: PAGE_H, color: acc });
    let sy = PAGE_H - MARGIN;
    if (img) { drawPhoto(page, MARGIN - 20, sy - 64, 96); sy -= 118; }
    const drawSide = (text, font, size, col = white, maxW = SIDE_W - 44) => {
      for (const l of wrap(text, font, size, maxW)) {
        if (sy - 15 < 60) { sy = PAGE_H - MARGIN; }
        page.drawText(l, { x: 30, y: sy, size, font, color: col });
        sy -= 15;
      }
    };
    drawSide((name || 'Resume').toUpperCase(), helvB, 16);
    if (subtitle) { drawSide(subtitle, helv, 9.5, rgb(0.92, 0.93, 0.96)); sy -= 6; }
    for (const sec of sections.slice(0, 3)) { // sidebar me pehle 3 sections (contact/skills/education)
      if (!sec.lines.length) continue;
      sy -= 8;
      drawSide(sec.title.toUpperCase(), helvB, 10.5, white);
      page.drawRectangle({ x: 30, y: sy + 1, width: SIDE_W - 60, height: 0.8, color: rgb(1, 1, 1) });
      sy -= 6;
      for (const item of sec.lines) {
        drawSide((item.type === 'bullet' ? '• ' : '') + item.text, helv, 9.5, rgb(0.94, 0.95, 0.98));
      }
    }
    // main area
    let mx = SIDE_W + 28;
    let my = PAGE_H - MARGIN;
    const mWrap = (text, font, size, maxW) => wrap(text, font, size, maxW);
    const mHead = (text, font, size, col = acc) => {
      for (const l of mWrap(text, font, size, PAGE_W - mx - 30)) {
        if (my - 18 < 60) { page = pdf.addPage([PAGE_W, PAGE_H]); my = PAGE_H - MARGIN; }
        page.drawText(l, { x: mx, y: my, size, font, color: col });
        my -= 18;
      }
      page.drawRectangle({ x: mx, y: my - 2, width: PAGE_W - mx - 30, height: 1.4, color: acc });
      my -= 14;
    };
    const mBody = (item) => {
      const t = (item.type === 'bullet' ? '• ' : '') + item.text;
      for (const l of mWrap(t, helv, 10.5, PAGE_W - mx - 30)) {
        if (my - 16 < 60) { page = pdf.addPage([PAGE_W, PAGE_H]); my = PAGE_H - MARGIN; }
        page.drawText(l, { x: mx, y: my, size: 10.5, font: helv, color: ink });
        my -= 16;
      }
      my -= 3;
    };
    mHead((name || 'Resume').toUpperCase(), helvB, 20);
    if (subtitle) { mHead(subtitle, helv, 10.5, muted); }
    for (const sec of sections.slice(3)) {
      mHead(sec.title.toUpperCase(), helvB, 11.5);
      for (const item of sec.lines) mBody(item);
      my -= 6;
    }
    if (sections.length <= 3) {
      for (const sec of sections) { mHead(sec.title.toUpperCase(), helvB, 11.5); for (const item of sec.lines) mBody(item); my -= 6; }
    }
    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }

  // ---------------- band layout ----------------
  if (layout === 'band') {
    const BAND_H = 130;
    page.drawRectangle({ x: 0, y: PAGE_H - BAND_H, width: PAGE_W, height: BAND_H, color: acc });
    let hx = MARGIN;
    if (img) { drawPhoto(page, hx, PAGE_H - BAND_H + 18, 94); hx += 116; }
    let hy = PAGE_H - BAND_H + 44;
    for (const l of wrap(name || 'Resume', helvB, 24, PAGE_W - hx - MARGIN)) {
      page.drawText(l, { x: hx, y: hy, size: 24, font: helvB, color: white });
      hy -= 28;
    }
    if (subtitle) {
      for (const l of wrap(subtitle, helv, 10.5, PAGE_W - hx - MARGIN)) {
        page.drawText(l, { x: hx, y: hy, size: 10.5, font: helv, color: rgb(0.92, 0.93, 0.96) });
        hy -= 14;
      }
    }
    y = PAGE_H - BAND_H - MARGIN;
    for (const sec of sections) {
      ensure(32);
      const headLines = wrap(sec.title.toUpperCase(), helvB, 12, CONTENT_W);
      for (const l of headLines) {
        page.drawText(l, { x: MARGIN, y, size: 12, font: helvB, color: acc });
        y -= 17;
      }
      page.drawRectangle({ x: MARGIN, y: y - 3, width: CONTENT_W, height: 1.4, color: acc });
      y -= 14;
      for (const item of sec.lines) {
        const t = (item.type === 'bullet' ? '• ' : '') + item.text;
        for (const l of wrap(t, helv, 10.5, CONTENT_W - 16)) {
          ensure(16);
          page.drawText(l, { x: MARGIN + (item.type === 'bullet' ? 14 : 0), y, size: 10.5, font: helv, color: ink });
          y -= 15;
        }
        y -= 2;
      }
      y -= 6;
    }
    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }

  // ---------------- single layout (photo right, accent header) ----------------
  let headX = MARGIN;
  if (img) {
    drawPhoto(page, PAGE_W - MARGIN - 92, PAGE_H - MARGIN - 92, 92);
    headX = MARGIN + 20;
  }
  const nameLines = wrap(name || 'Resume', helvB, 25, CONTENT_W - (img ? 120 : 0));
  for (const l of nameLines) {
    ensure(30);
    page.drawText(l, { x: headX, y, size: 25, font: helvB, color: acc });
    y -= 30;
  }
  if (subtitle) {
    const subLines = wrap(subtitle, helv, 10.5, CONTENT_W - (img ? 120 : 0));
    for (const l of subLines) {
      ensure(14);
      page.drawText(l, { x: headX, y, size: 10.5, font: helv, color: muted });
      y -= 14;
    }
  }
  ensure(10);
  y -= 6;
  page.drawRectangle({ x: MARGIN, y: y - 2, width: CONTENT_W, height: 2.2, color: acc });
  y -= 18;

  for (const sec of sections) {
    ensure(34);
    const headLines = wrap(sec.title.toUpperCase(), helvB, 12, CONTENT_W);
    for (const l of headLines) {
      page.drawText(l, { x: MARGIN, y, size: 12, font: helvB, color: acc });
      y -= 17;
    }
    page.drawRectangle({ x: MARGIN, y: y - 3, width: 26, height: 1.6, color: acc });
    y -= 14;
    for (const item of sec.lines) {
      const t = (item.type === 'bullet' ? '• ' : '') + item.text;
      for (const l of wrap(t, helv, 10.5, CONTENT_W - 16)) {
        ensure(16);
        page.drawText(l, { x: MARGIN + (item.type === 'bullet' ? 14 : 0), y, size: 10.5, font: helv, color: ink });
        y -= 15;
      }
      y -= 2;
    }
    y -= 6;
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
