// resumepdf.js — AI markdown resume -> clean A4 PDF (pdf-lib)
// Koi browser render nahi — server-side, fast aur reliable.

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

export async function buildResumePdf(markdown, accent = '#2563eb') {
  const pdf = await PDFDocument.create();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.09, 0.11, 0.18);
  const muted = rgb(0.38, 0.42, 0.52);
  const acc = hexToRgb(accent);
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const accLight = rgb(clamp(acc.red * 0.85 + 0.9), clamp(acc.green * 0.85 + 0.9), clamp(acc.blue * 0.85 + 0.9));

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const ensure = (need) => {
    if (y - need < MARGIN) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const { name, subtitle, sections } = parseMarkdown(markdown);

  // ---- header: name + subtitle + accent rule ----
  const nameLines = wrap(name || 'Resume', helvB, 25, CONTENT_W);
  for (const l of nameLines) {
    ensure(30);
    page.drawText(l, { x: MARGIN, y, size: 25, font: helvB, color: acc });
    y -= 30;
  }
  if (subtitle) {
    const subLines = wrap(subtitle, helv, 10.5, CONTENT_W);
    for (const l of subLines) {
      ensure(14);
      page.drawText(l, { x: MARGIN, y, size: 10.5, font: helv, color: muted });
      y -= 14;
    }
  }
  ensure(10);
  y -= 6;
  page.drawRectangle({ x: MARGIN, y: y - 2, width: CONTENT_W, height: 2.2, color: acc });
  y -= 18;

  // ---- sections ----
  for (const sec of sections) {
    ensure(34);
    const headLines = wrap(sec.title.toUpperCase(), helvB, 12, CONTENT_W);
    for (const l of headLines) {
      page.drawText(l, { x: MARGIN, y, size: 12, font: helvB, color: acc });
      y -= 17;
    }
    page.drawRectangle({ x: MARGIN, y: y - 3, width: 26, height: 1.6, color: acc });
    page.drawRectangle({ x: MARGIN + 30, y: y - 3, width: CONTENT_W - 30, height: 0.6, color: accLight });
    y -= 14;

    for (const item of sec.lines) {
      const text = item.text || '';
      const lines = wrap(text, helv, 10.5, CONTENT_W - (item.type === 'bullet' ? 16 : 0));
      for (let i = 0; i < lines.length; i++) {
        ensure(16);
        if (item.type === 'bullet') {
          if (i === 0) page.drawText('•', { x: MARGIN, y, size: 10.5, font: helvB, color: acc });
          page.drawText(lines[i], { x: MARGIN + 14, y, size: 10.5, font: helv, color: ink });
        } else {
          page.drawText(lines[i], { x: MARGIN, y, size: 10.5, font: helv, color: ink });
        }
        y -= 15;
      }
      y -= 2;
    }
    y -= 6;
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
