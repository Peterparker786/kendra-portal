// Kendra Portal — frontend logic (vanilla JS, no build step)
// Upload → extract → preview → confirm → save → customer name pe click → data

const $ = (sel) => document.querySelector(sel);


const state = {
  preview: null, // { filename, customerName, docType, fields, text }
  customers: [],
  selectedId: null,
  profile: null,
  docTypes: [], // standard list + types already used
  search: '',
};

const DOC_ICONS = {
  Aadhaar: '🪪',
  Niwas: '🏠',
  Domicile: '🏠',
  Cast: '🧬',
  Income: '💰',
  Birth: '👶',
  Death: '🕊️',
  Marriage: '💍',
  Voter: '🗳️',
  Ration: '🛒',
  Scholarship: '🎓',
  Student: '🎓',
  Registration: '📋',
  Certificate: '📜',
};

function docIcon(type) {
  for (const k in DOC_ICONS) if (String(type || '').includes(k)) return DOC_ICONS[k];
  return '📄';
}

// ---- Jan Seva Kendra services: card pe click -> official website khulti hai
// (jahan ye documents BANTE hain). URLs state ke hisaab se badal sakte ho.
const SERVICES = [
  { type: 'Aadhaar Card', icon: '🪪', desc: 'Aadhaar naya / update / correction', url: 'https://myaadhaar.uidai.gov.in/' },
  { type: 'Aadhaar Correction', icon: '✏️', desc: 'Aadhaar me sudhar — naam, DOB, address', url: 'https://myaadhaar.uidai.gov.in/' },
  { type: 'PAN Card', icon: '🪪', desc: 'PAN naya / correction / reprint', url: 'https://www.proteantech.in/pan-india/index.html' },
  { type: 'Niwas Praman (Residence)', icon: '🏠', desc: 'Niwas praman patra', url: 'https://edistrict.up.gov.in/' },
  { type: 'Domicile Certificate', icon: '🏡', desc: 'Domicile certificate', url: 'https://edistrict.up.gov.in/' },
  { type: 'Cast Certificate', icon: '🧬', desc: 'Jati praman patra', url: 'https://edistrict.up.gov.in/' },
  { type: 'Income Certificate', icon: '💰', desc: 'Aay praman patra', url: 'https://edistrict.up.gov.in/' },
  { type: 'Birth Certificate', icon: '👶', desc: 'Janm praman patra', url: 'https://www.crsorgi.gov.in/' },
  { type: 'Death Certificate', icon: '🕊️', desc: 'Mrityu praman patra', url: 'https://www.crsorgi.gov.in/' },
  { type: 'Marriage Registration', icon: '💍', desc: 'Vivah panjikaran', url: 'https://marriage.up.gov.in/' },
  { type: 'Voter ID', icon: '🗳️', desc: 'Matdata pahchan patra', url: 'https://voters.eci.gov.in/' },
  { type: 'Ration Card', icon: '🛒', desc: 'Ration card naya / update', url: 'https://fcs.up.gov.in/' },
  { type: 'Student / University Registration', icon: '🎓', desc: 'Chhatra / university registration', url: 'https://edistrict.up.gov.in/' },
  { type: 'Scholarship Documents', icon: '📚', desc: 'Chhatravritti documents', url: 'https://scholarships.gov.in/' },
  { type: 'Other', icon: '📄', desc: 'Koi aur document / service', url: 'https://edistrict.up.gov.in/' },
];

function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';
}

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

let toastTimer = null;
function toast(msg, type = 'ok') {
  const el = $('#toast');
  const icon = type === 'err' ? '⚠️' : '✓';
  el.innerHTML = `<span>${icon}</span><span>${esc(msg)}</span>`;
  el.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3400);
}

// ---------------------------------------------------------------- upload

let upTimer = null;
let upStart = 0;

function startProgress() {
  const box = $('#uploadProgress');
  if (!box) return;
  box.hidden = false;
  upStart = Date.now();
  const fill = $('#upFill');
  const status = $('#upStatus');
  const timerEl = $('#upTimer');
  fill.style.width = '8%';
  status.textContent = 'File upload ho raha hai…';
  timerEl.textContent = '0s';
  setTimeout(() => {
    if (!upTimer) return;
    status.textContent = 'Data extract ho raha hai (AI/OCR)… 15–60 sec lag sakte hain';
  }, 700);
  let pct = 8;
  upTimer = setInterval(() => {
    timerEl.textContent = Math.floor((Date.now() - upStart) / 1000) + 's';
    if (pct < 92) {
      // shuru me tez, end me dheere — realistic feel
      pct = Math.min(92, pct + Math.max(0.35, (95 - pct) / 55));
      fill.style.width = pct + '%';
    }
  }, 150);
}

function finishProgress() {
  if (!upTimer) return;
  clearInterval(upTimer);
  upTimer = null;
  $('#upFill').style.width = '100%';
  $('#upStatus').textContent = 'Ho gaya! Preview me check karo ✅';
  $('#upTimer').textContent = Math.floor((Date.now() - upStart) / 1000) + 's';
  setTimeout(() => {
    const box = $('#uploadProgress');
    if (box) box.hidden = true;
  }, 900);
}

function stopProgress() {
  if (upTimer) {
    clearInterval(upTimer);
    upTimer = null;
  }
  const box = $('#uploadProgress');
  if (box) box.hidden = true;
}

function uploadFile(file) {
  if (!file) return;
  const okExt = /\.(pdf|txt|csv|jpe?g|png)$/i.test(file.name);
  if (!okExt) {
    toast('Sirf PDF, JPG, PNG, TXT ya CSV file upload karo', 'err');
    return;
  }
  const fd = new FormData();
  fd.append('file', file);
  startProgress();

  fetch('/api/upload', { method: 'POST', body: fd })
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return data;
    })
    .then((preview) => {
      finishProgress();
      state.preview = preview;
      renderPreview();
      $('#previewCard').hidden = false;
      $('#previewCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    })
    .catch((err) => {
      stopProgress();
      toast(err.message, 'err');
    });
}

function wireUpload() {
  $('#pickBtn').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', (e) => {
    uploadFile(e.target.files[0]);
    e.target.value = '';
  });
  const zone = $('#uploadZone');
  ['dragenter', 'dragover'].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add('drag');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.remove('drag');
    })
  );
  zone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) uploadFile(file);
  });
}

// ---------------------------------------------------------------- preview

function renderPreview() {
  const p = state.preview;
  $('#previewFile').textContent = p.filename;
  $('#customerNameInput').value = p.customerName || '';
  $('#rawText').textContent = p.text || '(no text extracted)';

  // ---- existing customer dropdown: agar same customer dobara extract ho raha
  // ho to select karo — saare documents usi profile me save honge ----
  const cSel = $('#customerSelect');
  cSel.innerHTML = '<option value="">— Naya customer banega (auto) —</option>';
  for (const c of state.customers) {
    cSel.innerHTML += `<option value="${c.id}">${esc(c.name)}${c.aadhaar ? ' · ' + esc(c.aadhaar) : ''}</option>`;
  }
  const aadhaarField = p.fields.find((f) => /aadhaar|aadhar/i.test(f.key));
  const aadhaarDigits = (aadhaarField ? String(aadhaarField.value) : '').replace(/\D/g, '');
  const nm = String(p.customerName || '').trim().toLowerCase();
  const aadhaarMatch = aadhaarDigits
    ? state.customers.find((c) => String(c.aadhaar || '').replace(/\D/g, '') === aadhaarDigits)
    : null;
  const nameMatches = nm ? state.customers.filter((c) => c.name.toLowerCase() === nm) : [];
  const matched = aadhaarMatch || (nameMatches.length === 1 ? nameMatches[0] : null);
  state.preview.selectedCustomerId = matched ? matched.id : null;
  cSel.value = matched ? matched.id : '';
  if (matched) {
    $('#customerNameInput').value = matched.name;
    toast(`Existing customer mila: "${matched.name}" — unki profile me save hoga`);
  }
  cSel.onchange = () => {
    const id = Number(cSel.value) || null;
    state.preview.selectedCustomerId = id;
    if (id) {
      const c = state.customers.find((x) => x.id === id);
      if (c) {
        $('#customerNameInput').value = c.name;
        toast(`"${c.name}" ki profile me save hoga`);
      }
    }
  };

  // doc type dropdown (standard + used types + Other)
  const dtSel = $('#docTypeSelect');
  let opts = '<option value="">- Select -</option>';
  for (const t of state.docTypes) {
    opts += `<option value="${esc(t)}">${esc(t)}</option>`;
  }
  opts += '<option value="__other__">Other (naya type likho)</option>';
  dtSel.innerHTML = opts;
  if (p.docType && state.docTypes.includes(p.docType)) {
    dtSel.value = p.docType;
  } else if (p.docType) {
    // extracted type standard list me nahi — Other + custom box me daalo
    dtSel.value = '__other__';
    $('#customTypeInput').value = p.docType;
    $('#customTypeBox').hidden = false;
  }
  dtSel.onchange = () => {
    $('#customTypeBox').hidden = dtSel.value !== '__other__';
  };


  $('#remarksInput').value = '';
  renderFieldsEditor();
}

function renderFieldsEditor() {
  const p = state.preview;
  const box = $('#fieldsEditor');
  box.innerHTML = '';
  if (!p.fields.length) {
    const div = document.createElement('div');
    div.className = 'empty';
    div.textContent = 'Koi field extract nahi hui — upar "Customer Name" aur "Document Type" bharo, ya + Add field se manually add karo.';
    box.appendChild(div);
    return;
  }
  p.fields.forEach((f, i) => {
    const row = document.createElement('div');
    row.className = 'fields-row';
    row.innerHTML = `
      <input class="input cell cell-key" value="${esc(f.key)}" placeholder="Field" data-f="${i}" data-part="key" />
      <input class="input cell cell-value" value="${esc(f.value)}" placeholder="Value" data-f="${i}" data-part="value" />
      <button class="rm" title="Remove field" data-rm="${i}">✕</button>
    `;
    box.appendChild(row);
  });
  box.querySelectorAll('input').forEach((inp) =>
    inp.addEventListener('input', () => {
      const f = p.fields[Number(inp.dataset.f)];
      f[inp.dataset.part] = inp.value;
    })
  );
  box.querySelectorAll('.rm').forEach((btn) =>
    btn.addEventListener('click', () => {
      p.fields.splice(Number(btn.dataset.rm), 1);
      renderFieldsEditor();
    })
  );
}

function wirePreview() {
  $('#addFieldBtn').addEventListener('click', () => {
    state.preview.fields.push({ key: '', value: '' });
    renderFieldsEditor();
  });
  $('#cancelPreviewBtn').addEventListener('click', () => {
    state.preview = null;
    $('#previewCard').hidden = true;
  });
  $('#saveBtn').addEventListener('click', savePreview);
}

function buildPayload() {
  const p = state.preview;
  const customer = { name: $('#customerNameInput').value.trim() };
  const typeSel = $('#docTypeSelect').value;
  let type = typeSel;
  if (typeSel === '__other__') {
    type = $('#customTypeInput').value.trim();
  }
  const document = {
    type,
    status: 'Submitted',
    remarks: $('#remarksInput').value.trim(),
    fields: p.fields
      .filter((f) => (f.key || '').trim() && (f.value || '').trim())
      .map((f) => ({ key: f.key.trim(), value: f.value.trim() })),
  };
  const extra = [];
  for (const f of p.fields) {
    const k = f.key.trim().toLowerCase();
    const v = f.value.trim();
    if (!k) continue;
    if (k === 'customer name' || k === 'applicant name' || k === 'client name') {
      if (!customer.name) customer.name = v;
    } else if (k === "father's name" || k === 'father / husband name' || k === 'father name' || k === 'husband name') {
      customer.father = v;
    } else if (/phone|mobile|email|contact/.test(k)) {
      customer.phone = v;
    } else if (/aadhaar|aadhar/.test(k)) {
      customer.aadhaar = v;
    } else if (/date\s*of\s*birth|dob/.test(k)) {
      customer.dob = v;
    } else if (/^gender$/.test(k)) {
      customer.gender = v;
    } else if (/address/.test(k)) {
      customer.address = v;
    } else if (/university|reg\s*no|enroll/.test(k)) {
      customer.regNo = v;
    } else if (/document\s*no|doc\s*no|reg(istration)?\s*no|certificate\s*no/.test(k)) {
      document.docNo = v;
    } else if (/issue\s*date|issued/.test(k)) {
      document.issueDate = v;
    } else if (/valid\s*till|validity|valid\s*upto/.test(k)) {
      document.validTill = v;
    } else if (/issued\s*by|authority/.test(k)) {
      document.issuedBy = v;
    } else if (/document\s*type|doc\s*type/.test(k)) {
      if (!document.type) document.type = v;
    } else {
      extra.push(`${f.key.trim()}: ${v}`);
    }
  }
  if (extra.length) {
    document.remarks = (document.remarks ? document.remarks + ' | ' : '') + extra.join(' | ');
  }
  const payload = { customer, document, filename: p.filename };
  if (state.preview.selectedCustomerId) payload.customerId = state.preview.selectedCustomerId;
  return payload;
}

function savePreview() {
  const p = state.preview;
  if (!p) return;
  const payload = buildPayload();
  if (!payload.customer.name) {
    toast('Customer Name zaroori hai', 'err');
    $('#customerNameInput').focus();
    return;
  }
  if (!payload.document.type) {
    toast('Document Type chuno', 'err');
    return;
  }
  $('#saveBtn').disabled = true;
  fetch('/api/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      return data;
    })
    .then((data) => {
      state.preview = null;
      $('#previewCard').hidden = true;
      toast(`Saved — "${data.customerName}" ki profile me add ho gaya`);
      return loadCustomers().then(() => selectCustomer(data.customerId));
    })
    .catch((err) => toast(err.message, 'err'))
    .finally(() => {
      $('#saveBtn').disabled = false;
    });
}

// ---------------------------------------------------------------- dashboard

function updateStats() {
  $('#statCustomers').textContent = state.customers.length;
  const docs = state.customers.reduce((sum, c) => sum + (c.doc_count || 0), 0);
  $('#statDocs').textContent = docs;
  loadStats(); // services / month / recent activity / donut bhi refresh
}

// ---------------------------------------------------------------- dashboard extras

const DONUT_COLORS = ['#818cf8', '#38bdf8', '#34d399', '#fb923c', '#f472b6', '#a78bfa', '#facc15', '#94a3b8'];

function loadStats() {
  fetch('/api/stats')
    .then((r) => r.json())
    .then((d) => {
      if (!d) return;
      $('#statCustomers').textContent = d.customers;
      $('#statDocs').textContent = d.documents;
      $('#statServices').textContent = d.services;
      $('#statMonth').textContent = d.monthDocs;
      renderRecent(d.activity || []);
      renderDonut(d.byType || [], d.documents);
    })
    .catch(() => {});
}

function renderRecent(activity) {
  const box = $('#recentActivity');
  if (!box) return;
  if (!activity.length) {
    box.innerHTML = '<p class="empty">Abhi koi activity nahi.</p>';
    return;
  }
  const icons = ['ri-green', 'ri-blue', 'ri-orange', 'ri-purple'];
  const emojis = ['📤', '📄', '🖨️', '🔍'];
  box.innerHTML = activity
    .map((a, i) => {
      const title = `${a.customer || 'Customer'} — ${a.type || 'Document'}`;
      return `<div class="recent-item">
        <div class="recent-icon ${icons[i % icons.length]}">${emojis[i % emojis.length]}</div>
        <div class="recent-body">
          <div class="recent-title">${escapeHtml(title)}</div>
          <div class="recent-meta">${escapeHtml(a.filename || '')}</div>
        </div>
        <div class="recent-time">${escapeHtml(timeAgo(a.uploaded_at))}</div>
      </div>`;
    })
    .join('');
}

function timeAgo(iso) {
  const s = String(iso || '').replace(' ', 'T') + 'Z';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'abhi'; // <1 min
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' hr';
  return Math.floor(h / 24) + ' d';
}

function renderDonut(byType, total) {
  const donut = $('#donut');
  const legend = $('#donutLegend');
  if (!donut || !legend) return;
  $('#donutTotal').textContent = total;
  if (!byType.length) {
    donut.style.background = 'conic-gradient(#e5e9f2 0% 100%)';
    legend.innerHTML = '<p class="empty">Koi document nahi.</p>';
    return;
  }
  let acc = 0;
  const segs = [];
  const rows = [];
  byType.slice(0, 8).forEach((b, i) => {
    const pct = total ? (b.count / total) * 100 : 0;
    const from = acc;
    acc += pct;
    const color = DONUT_COLORS[i % DONUT_COLORS.length];
    segs.push(`${color} ${from}% ${acc}%`);
    rows.push(
      `<div class="legend-row"><span class="legend-dot" style="background:${color}"></span><span class="legend-name">${escapeHtml(b.type)}</span><span class="legend-val">${b.count} (${pct.toFixed(1)}%)</span></div>`
    );
  });
  donut.style.background = `conic-gradient(${segs.join(', ')})`;
  legend.innerHTML = rows.join('');
}

// ---------------------------------------------------------------- resume maker

let resumeMarkdown = '';
let resumePhoto = ''; // optional photo (dataURL) — premium templates me dikhti hai

// ---- live resume preview (har keystroke pe update) ----

function updateResumeScore() {
  const fields = {
    rsTitle: 10, rsName: 15, rsPhone: 10, rsEmail: 10, rsAddress: 5, rsDob: 5,
    rsFather: 5, rsObjective: 15, rsEducation: 15, rsSkills: 10, rsExperience: 5,
  };
  let got = 0;
  for (const [id, w] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el && el.value.trim()) got += w;
  }
  const el = document.getElementById('rsScoreVal');
  const fill = document.getElementById('rsScoreFill');
  if (el) el.textContent = got + '%';
  if (fill) {
    fill.style.width = got + '%';
    fill.style.background = got >= 70 ? 'linear-gradient(90deg,#16a34a,#22c55e)' : got >= 40 ? 'linear-gradient(90deg,#d97706,#f59e0b)' : 'linear-gradient(90deg,#dc2626,#ef4444)';
  }
}

function liveResumePreview() {
  const pv = document.getElementById('resumePreview');
  if (!pv) return;
  const t = selectedTemplate;
  if (['split', 'band', 'student', 'classic'].includes(t.layout)) {
    renderPremium(t);
    return;
  }
  const g = (id) => document.getElementById(id).value.trim();
  const name = g('rsName') || 'Customer Name';
  const title = g('rsTitle');
  const email = g('rsEmail');
  const phone = g('rsPhone');
  const addr = g('rsAddress');
  const objective = g('rsObjective');
  const education = g('rsEducation');
  const skills = g('rsSkills');
  const experience = g('rsExperience');

  let contact = [];
  if (email) contact.push(`<span>✉ ${esc(email)}</span>`);
  if (addr) contact.push(`<span>📍 ${esc(addr)}</span>`);
  if (phone) contact.push(`<span>📞 ${esc(phone)}</span>`);

  const sec = (heading, body) =>
    body ? `<div class="lp-sec"><h2>${esc(heading)}</h2><div class="lp-sec-body">${body}</div></div>` : '';
  const lines = (txt) =>
    txt.split('\n').filter((l) => l.trim()).map((l) => `<div class="lp-line">${esc(l.trim())}</div>`).join('');

  let head =
    `<div class="lp-banner" style="background:${t.accent}">
      <div class="lp-name">${esc(name)}</div>
      ${title ? `<div class="lp-title">${esc(title.toUpperCase())}</div>` : ''}
    </div>` +
    (contact.length ? `<div class="lp-contact">${contact.join('<span class="dot">•</span>')}</div>` : '');

  if (t.layout === 'minimal') {
    head = `<div class="lp-min-head"><div class="lp-name">${esc(name)}</div>${title ? `<div class="lp-title">${esc(title)}</div>` : ''}</div>` +
      (contact.length ? `<div class="lp-contact center">${contact.join('<span class="dot">•</span>')}</div>` : '');
  }
  if (t.layout === 'serif') pv.style.fontFamily = "Georgia, 'Times New Roman', serif";
  else pv.style.fontFamily = '';

  const body =
    sec('Objective', objective ? `<p>${esc(objective)}</p>` : '') +
    sec('Education', lines(education)) +
    sec('Skills', skills ? `<div class="lp-chips">${skills.split(',').filter((s) => s.trim()).map((s) => `<span class="lp-chip">${esc(s.trim())}</span>`).join('')}</div>` : '') +
    sec('Experience', lines(experience));

  const inner = head + `<div class="lp-body">${body || '<p class="lp-empty">Details bharo — yahan preview turant dikhega ✨</p>'}</div>`;

  pv.className = `resume-preview tpl-${t.id}`;
  if (t.layout === 'sidebar') {
    pv.innerHTML = `<div class="tpl-side" style="background:${t.accent}"></div><div class="tpl-body">${inner}</div>`;
  } else {
    pv.innerHTML = inner;
  }
  updateResumeScore();
}

// ---- premium (trending) templates — photo + colored sidebar + structured sections ----

function renderPremium(t) {
  const pv = document.getElementById('resumePreview');
  if (!pv) return;
  const g = (id) => document.getElementById(id).value.trim();
  const name = g('rsName') || 'Customer Name';
  const title = g('rsTitle');
  const email = g('rsEmail');
  const phone = g('rsPhone');
  const addr = g('rsAddress');
  const objective = g('rsObjective');
  const education = g('rsEducation');
  const skills = g('rsSkills');
  const experience = g('rsExperience');

  const photo = resumePhoto
    ? `style="background-image:url('${resumePhoto}')"`
    : '';
  const photoCircle = `<div class="lp2-photo-wrap"><div class="lp2-photo" ${photo}><span>👤</span></div></div>`;
  const lines = (txt) => txt.split('\n').filter((l) => l.trim()).map((l) => `<div class="lp2-line">${esc(l.trim())}</div>`).join('');
  const chips = skills ? skills.split(',').filter((s) => s.trim()).map((s) => `<span class="lp2-chip">${esc(s.trim())}</span>`).join('') : '';
  const contactLines = [email && `✉ ${esc(email)}`, phone && `✆ ${esc(phone)}`, addr && `📍 ${esc(addr)}`].filter(Boolean).join('\n');
  const whiteSec = (h, body) => (body ? `<div class="lp2-sec"><h3>${esc(h)}</h3><div class="lp2-sec-body">${body}</div></div>` : '');
  const mainSec = (h, body) => (body ? `<div class="lp2-sec"><h2>${esc(h)}</h2><div class="lp2-sec-body">${body}</div></div>` : '');

  pv.className = `resume-preview tpl-${t.id}`;

  if (t.layout === 'band') {
    const band = `<div class="lp-band-top" style="background:${t.accent}">
        <div class="lp2-photo-wrap band"><div class="lp2-photo" ${photo}><span>👤</span></div></div>
        <div class="lp-band-name">${esc(name)}${title ? `<span>${esc(title)}</span>` : ''}</div>
      </div>`;
    pv.innerHTML = `<div class="lp-band">${band}<div class="lp-band-cols">
        <div class="lp-band-left">${whiteSec('Contact', lines(contactLines))}${whiteSec('Skills', chips)}${whiteSec('Education', lines(education))}</div>
        <div class="lp-band-right">${mainSec('Profile', objective ? `<p>${esc(objective)}</p>` : '')}${mainSec('Experience', lines(experience))}${mainSec('Education', lines(education))}</div>
      </div></div>`;
    updateResumeScore();
    return;
  }

  if (t.layout === 'student') {
    pv.innerHTML = `<div class="lp2">
      <div class="lp2-side" style="background:${t.accent}">
        ${photoCircle}
        <div class="lp2-stu-name">${esc(name)}</div>
        ${whiteSec('Contact', lines(contactLines))}
      </div>
      <div class="lp2-main">
        ${mainSec('🎓 Education', lines(education))}
        ${mainSec('🏆 Achievements', objective ? `<p>${esc(objective)}</p>` : '')}
        ${mainSec('🛠 Soft Skills', chips)}
        ${mainSec('💼 Experience', lines(experience))}
      </div>
    </div>`;
    updateResumeScore();
    return;
  }

  // split / classic — sidebar + main
  const sideBody = whiteSec('Contact', lines(contactLines)) + whiteSec('Skills', chips) + whiteSec('Education', lines(education));
  const mainHead = `<div class="lp2-head"><div class="lp2-name">${esc(name)}</div>${title ? `<div class="lp2-title">${esc(title)}</div>` : ''}</div>`;
  const mainBody = mainSec('Profile', objective ? `<p>${esc(objective)}</p>` : '') + mainSec('Experience', lines(experience)) + mainSec('Education', lines(education));
  pv.innerHTML = `<div class="lp2${t.layout === 'classic' ? ' classic' : ''}">
      <div class="lp2-side" style="background:${t.accent}">${t.layout === 'split' ? photoCircle : ''}${sideBody}</div>
      <div class="lp2-main">${mainHead}${mainBody}</div>
    </div>`;
  updateResumeScore();
}

function wireLivePreview() {
  ['rsTitle', 'rsName', 'rsPhone', 'rsEmail', 'rsAddress', 'rsDob', 'rsFather', 'rsObjective', 'rsEducation', 'rsSkills', 'rsExperience'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', liveResumePreview);
  });
}

function collectResumeDetails() {
  return {
    title: $('#rsTitle').value.trim(),
    name: $('#rsName').value.trim(),
    phone: $('#rsPhone').value.trim(),
    email: $('#rsEmail').value.trim(),
    address: $('#rsAddress').value.trim(),
    dob: $('#rsDob').value.trim(),
    father: $('#rsFather').value.trim(),
    objective: $('#rsObjective').value.trim(),
    education: $('#rsEducation').value.trim(),
    skills: $('#rsSkills').value.trim(),
    experience: $('#rsExperience').value.trim(),
  };
}

function buildResume() {
  const d = collectResumeDetails();
  if (!d.name) {
    toast('Customer Name likho', 'err');
    return;
  }
  $('#resumeMakeBtn').disabled = true;
  const st = $('#resumeStatus');
  st.hidden = false;
  st.textContent = 'AI resume bana raha hai… (10-20 sec lag sakte hain)';
  fetch('/api/resume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(d),
  })
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Resume fail');
      return data;
    })
    .then((data) => {
      resumeMarkdown = data.markdown;
      const pv = $('#resumePreview');
      pv.className = `resume-preview tpl-${selectedTemplate.id}`;
      let body = mdToHtml(resumeMarkdown);
      if (selectedTemplate.layout === 'sidebar') {
        body = `<div class="tpl-side" style="background:${selectedTemplate.accent}"></div><div class="tpl-body">${body}</div>`;
      }
      pv.innerHTML = body;
      $('#resumeDownloadBtn').disabled = false;
      $('#resumePrintBtn').disabled = false;
      st.textContent = data.usedAI
        ? '✅ AI se resume ban gaya! Download ya Print karo.'
        : '⚠️ AI key configure nahi hai — template se banaya (AI lagne ke baad aur acha banega).';
      toast('Resume ban gaya!');
    })
    .catch((err) => {
      st.textContent = 'Error: ' + err.message;
      toast(err.message, 'err');
    })
    .finally(() => {
      $('#resumeMakeBtn').disabled = false;
    });
}

function resumePageHtml(name, md) {
  const body = mdToHtml(md);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(name)} — Resume</title>` +
    `<style>body{font-family:'Segoe UI',Arial,sans-serif;max-width:760px;margin:30px auto;padding:0 22px;color:#1e293b;line-height:1.5}` +
    `h1{font-size:26px;margin:0 0 2px}h2{font-size:16px;color:#4f46e5;border-bottom:2px solid #4f46e5;padding-bottom:4px;margin:22px 0 8px}` +
    `ul{margin:6px 0;padding-left:22px}@media print{body{margin:0;max-width:none}}</style></head><body>${body}</body></html>`;
}

async function downloadResume() {
  if (!resumeMarkdown) return;
  const name = ($('#rsName').value.trim() || 'resume').replace(/[^A-Za-z0-9 _-]/g, '');
  const btn = $('#resumeDownloadBtn');
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = '⏳ PDF bana raha hai…';
  try {
    const res = await fetch('/api/resume/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: resumeMarkdown, accent: selectedTemplate.accent, template: selectedTemplate.id, photo: resumePhoto || '' }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || 'PDF fail');
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `resume-${name}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('PDF download ho gaya! 📄');
  } catch (err) {
    console.error(err);
    toast('PDF bana me error: ' + err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = old;
  }
}

function printResume() {
  if (!resumeMarkdown) return;
  const name = ($('#rsName').value.trim() || 'resume').replace(/[^A-Za-z0-9 _-]/g, '');
  const w = window.open('', '_blank');
  if (!w) {
    toast('Popup blocker on hai — is site ko allow karo', 'err');
    return;
  }
  w.document.write(resumePageHtml(name, resumeMarkdown));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

function fillFromCustomer() {
  const id = state.selectedId;
  if (!id) {
    toast('Pehle kisi customer ko profile me kholo (naam pe click)', 'err');
    return;
  }
  fetch(`/api/customers/${id}`)
    .then((r) => r.json())
    .then((c) => {
      if (!c || !c.name) throw new Error('Customer nahi mila');
      $('#rsName').value = c.name || '';
      $('#rsPhone').value = c.phone || '';
      $('#rsAddress').value = c.address || '';
      $('#rsDob').value = c.dob || '';
      $('#rsFather').value = c.father || '';
      liveResumePreview();
      toast(`"${c.name}" ki details bhar di`);
    })
    .catch((err) => toast(err.message, 'err'));
}

function mdToHtml(md) {
  const escTxt = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lines = String(md).split('\n');
  let html = '';
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('```')) {
      if (inList) { html += '</ul>'; inList = false; }
      continue;
    }
    if (/^-{3,}$/.test(line)) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<hr />';
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) {
      if (inList) { html += '</ul>'; inList = false; }
      const lvl = Math.min(6, h[1].length + 1);
      html += `<h${lvl}>${escTxt(h[2])}</h${lvl}>`;
      continue;
    }
    const li = line.match(/^[-*]\s+(.*)/);
    if (li) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${escTxt(li[1])}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    html += `<p>${escTxt(line)}</p>`;
  }
  if (inList) html += '</ul>';
  return html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

const RESUME_TEMPLATES = [
  { id: 'monochrome', name: 'Monochrome', cat: 'Professional', accent: '#111827', layout: 'single' },
  { id: 'navy', name: 'Professional Navy', cat: 'Professional', accent: '#1e3a8a', layout: 'single' },
  { id: 'modern', name: 'Modern Blue', cat: 'Modern', accent: '#2563eb', layout: 'bars' },
  { id: 'gradient', name: 'Gradient', cat: 'Modern', accent: '#4f46e5', layout: 'gradient' },
  { id: 'green-side', name: 'Two-Column Green', cat: 'Two-column', accent: '#004d40', layout: 'sidebar' },
  { id: 'navy-side', name: 'Sidebar Navy', cat: 'Two-column', accent: '#1e293b', layout: 'sidebar' },
  { id: 'simple', name: 'Simple', cat: 'Simple', accent: '#64748b', layout: 'single' },
  { id: 'minimal', name: 'Minimal', cat: 'Simple', accent: '#9ca3af', layout: 'minimal' },
  { id: 'elegant', name: 'Elegant Gold', cat: 'Elegant', accent: '#b45309', layout: 'serif' },
  { id: 'confetti', name: 'Confetti', cat: 'Creative', accent: '#7c3aed', layout: 'confetti' },
  { id: 'splash', name: 'Color Splash', cat: 'Creative', accent: '#0891b2', layout: 'splash' },
  { id: 'rirekisho', name: 'Rirekisho', cat: 'Professional', accent: '#b45309', layout: 'serif' },
  { id: 'academic', name: 'Academic', cat: 'Professional', accent: '#475569', layout: 'bars' },
  { id: 'entry', name: 'Entry Level', cat: 'Simple', accent: '#0f766e', layout: 'single' },
  { id: 'executive', name: 'Executive', cat: 'Professional', accent: '#1e1b4b', layout: 'single' },
  { id: 'creative', name: 'Creative', cat: 'Modern', accent: '#db2777', layout: 'gradient' },
  { id: 'clean', name: 'Clean', cat: 'Simple', accent: '#334155', layout: 'minimal' },
  { id: 'gold', name: 'Gold Classic', cat: 'Elegant', accent: '#a16207', layout: 'serif' },
  { id: 'split-navy', name: 'Executive Split', cat: 'Two-column', accent: '#0f172a', layout: 'split' },
  { id: 'split-teal', name: 'Teal Split', cat: 'Two-column', accent: '#0f766e', layout: 'split' },
  { id: 'band-teal', name: 'Band Header', cat: 'Modern', accent: '#0d9488', layout: 'band' },
  { id: 'band-rose', name: 'Rose Band', cat: 'Modern', accent: '#be123c', layout: 'band' },
  { id: 'student', name: 'Student Card', cat: 'Creative', accent: '#5c1d3a', layout: 'student' },
  { id: 'classic', name: 'Classic Serif', cat: 'Elegant', accent: '#7b242b', layout: 'classic' },
];
const TEMPLATE_FILTERS = ['All templates', 'Simple', 'Professional', 'Two-column', 'Modern', 'Elegant', 'Creative'];
let selectedTemplate = RESUME_TEMPLATES[2]; // default: Modern Blue

function miniPreview(t) {
  const inner =
    `<div class="mini-name">Customer Name</div>
    <div class="mini-bar"></div>
    <div class="mini-line"></div>
    <div class="mini-line"></div>
    <div class="mini-line d"></div>
    <div class="mini-bar w"></div>
    <div class="mini-line"></div>
    <div class="mini-line d"></div>`;
  if (t.layout === 'sidebar') {
    return `<div class="tpl-mini side" style="--accent:${t.accent}"><div class="mini-side" style="background:${t.accent}"></div><div class="mini-body">${inner}</div></div>`;
  }
  return `<div class="tpl-mini" style="--accent:${t.accent}"><div class="mini-body">${inner}</div></div>`;
}

function renderTemplates(filter) {
  const grid = $('#tplGrid');
  const list = filter === 'All templates' ? RESUME_TEMPLATES : RESUME_TEMPLATES.filter((t) => t.cat === filter);
  grid.innerHTML = list
    .map(
      (t) => `<div class="tpl-card" data-id="${t.id}">
        ${miniPreview(t)}
        <div class="tpl-card-foot"><span class="tpl-name">${esc(t.name)}</span><span class="tpl-cat">${esc(t.cat)}</span></div>
        <button class="btn primary sm tpl-use" type="button">Use template</button>
      </div>`
    )
    .join('');
  grid.querySelectorAll('.tpl-card').forEach((card) => {
    card.addEventListener('click', () => {
      const t = RESUME_TEMPLATES.find((x) => x.id === card.dataset.id);
      if (t) selectTemplate(t);
    });
  });
}

function renderTplFilters() {
  const f = $('#tplFilters');
  f.innerHTML = TEMPLATE_FILTERS.map(
    (x) => `<button class="tpl-pill${x === 'All templates' ? ' active' : ''}" data-f="${esc(x)}" type="button">${esc(x)}</button>`
  ).join('');
  f.querySelectorAll('.tpl-pill').forEach((b) => {
    b.addEventListener('click', () => {
      f.querySelectorAll('.tpl-pill').forEach((p) => p.classList.remove('active'));
      b.classList.add('active');
      renderTemplates(b.dataset.f);
    });
  });
}

function showResumeForm() {
  $('#resumeHero').hidden = true;
  $('#resumeTemplates').hidden = true;
  $('#resumeFormWrap').hidden = false;
  $('#resumeFormWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function selectTemplate(t) {
  selectedTemplate = t;
  $('#tplSelectedBadge').textContent = `Template: ${t.name}`;
  $('#tplSelectedBadge').style.color = t.accent;
  liveResumePreview(); // naye template ke colors preview me turant dikhein
  // template chuna -> "How do you want to start?" (naya ya purana upload)
  $('#resumeStartModal').hidden = false;
}

// ---- customize panel (Edit | Customize tabs — resume.io jaisa) ----

function renderCustomizeGrid() {
  const grid = $('#resumeTplGrid');
  if (!grid) return;
  grid.innerHTML = RESUME_TEMPLATES.map((t) => {
    const sel = selectedTemplate.id === t.id ? ' selected' : '';
    const inner =
      `<div class="cust-name">Customer Name</div>
      <div class="cust-line" style="background:${t.accent}"></div>
      <div class="cust-row"></div><div class="cust-row"></div>
      <div class="cust-row d"></div>`;
    const thumb = t.layout === 'sidebar'
      ? `<div class="cust-thumb side"><div class="cust-side" style="background:${t.accent}"></div><div class="cust-body">${inner}</div></div>`
      : `<div class="cust-thumb">${inner}</div>`;
    return `<div class="cust-card${sel}" data-id="${t.id}" title="${esc(t.name)}">${thumb}<div class="cust-foot"><span class="tpl-name">${esc(t.name)}</span><span class="tpl-cat">${esc(t.cat)}</span></div></div>`;
  }).join('');
  grid.querySelectorAll('.cust-card').forEach((card) => {
    card.addEventListener('click', () => {
      const t = RESUME_TEMPLATES.find((x) => x.id === card.dataset.id);
      if (!t) return;
      selectedTemplate = t;
      $('#tplSelectedBadge').textContent = `Template: ${t.name}`;
      $('#tplSelectedBadge').style.color = t.accent;
      grid.querySelectorAll('.cust-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      liveResumePreview(); // turant preview update
    });
  });
}

function setBuilderTab(mode) {
  const edit = mode === 'edit';
  $('#resumeFormCol').hidden = !edit;
  $('#resumeTplCol').hidden = edit;
  $('#editTabBtn').classList.toggle('active', edit);
  $('#customizeTabBtn').classList.toggle('active', !edit);
  if (!edit) renderCustomizeGrid();
}

function openTemplatePage() {
  $('#resumeHero').hidden = true;
  $('#resumeTemplates').hidden = false;
  renderTplFilters();
  renderTemplates('All templates');
  $('#resumeTemplates').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let resumeCountDone = false;

function animateResumeCount() {
  if (resumeCountDone) return;
  resumeCountDone = true;
  const el = $('#resumeCount');
  const target = 212024;
  const start = Date.now();
  const dur = 1500;
  const tick = () => {
    const p = Math.min(1, (Date.now() - start) / dur);
    el.textContent = Math.floor(target * (1 - Math.pow(1 - p, 3))).toLocaleString('en-IN');
    if (p < 1) requestAnimationFrame(tick);
  };
  tick();
}

function openResumePage() {
  $('#resumePage').hidden = false;
  $('#resumePage').scrollIntoView({ behavior: 'smooth', block: 'start' });
  animateResumeCount();
}

function wireResume() {
  $('#resumeBtn').addEventListener('click', openResumePage);
  $('#rsCreateBtn').addEventListener('click', openTemplatePage);
  $('#rsCreateBtn2').addEventListener('click', () => selectTemplate(RESUME_TEMPLATES[2]));
  $('#rsUploadBtn2').addEventListener('click', () => $('#rsUploadInput').click());
  $('#tplBackBtn').addEventListener('click', () => {
    $('#resumeTemplates').hidden = true;
    $('#resumeHero').hidden = false;
    $('#resumeHero').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#rsUploadBtn').addEventListener('click', () => $('#rsUploadInput').click());
  $('#rsUploadInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const st = $('#resumeStatus');
    st.hidden = false;
    st.textContent = 'Resume padh raha hai… (scanned ho to thoda time)';
    try {
      const up = await fetch('/api/resume/upload', { method: 'POST', body: fd }).then((r) => r.json());
      if (!up.ok && !up.text) throw new Error(up.error || 'Upload fail');
      const text = up.text || '';
      if (!text.trim()) throw new Error('Resume se text nahi nikla');
      st.textContent = 'Info nikal raha hai (AI)… 10-20 sec';
      const parsed = await fetch('/api/resume/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).then((r) => r.json());
      const f = (parsed && parsed.fields) || {};
      $('#rsTitle').value = f.title || f.jobTitle || '';
      $('#rsName').value = f.name || '';
      $('#rsPhone').value = f.phone || '';
      $('#rsEmail').value = f.email || '';
      $('#rsAddress').value = f.address || '';
      $('#rsDob').value = f.dob || '';
      $('#rsFather').value = f.father || '';
      $('#rsObjective').value = f.objective || '';
      $('#rsEducation').value = f.education || '';
      $('#rsSkills').value = f.skills || '';
      $('#rsExperience').value = f.experience || text;
      showResumeForm();
      liveResumePreview();
      st.textContent = '✅ Purane resume ki info naye template me bhar di — update karke "AI se Resume banao" dabao, phir download karo.';
      toast('Purane resume se info bhar di!');
    } catch (err) {
      st.textContent = 'Error: ' + err.message;
      toast(err.message, 'err');
    }
  });
  $('#startCreate').addEventListener('click', () => {
    $('#resumeStartModal').hidden = true;
    showResumeForm();
  });
  $('#startUpload').addEventListener('click', () => {
    $('#resumeStartModal').hidden = true;
    $('#rsUploadInput').click();
  });
  $('#resumeStartClose').addEventListener('click', () => {
    $('#resumeStartModal').hidden = true;
  });
  $('#resumeStartModal').addEventListener('click', (e) => {
    if (e.target === $('#resumeStartModal')) $('#resumeStartModal').hidden = true;
  });
  $('#resumeMakeBtn').addEventListener('click', buildResume);
  $('#resumeDownloadBtn').addEventListener('click', downloadResume);
  $('#resumePrintBtn').addEventListener('click', printResume);
  $('#rsFillBtn').addEventListener('click', fillFromCustomer);
  $('#editTabBtn').addEventListener('click', () => setBuilderTab('edit'));
  $('#customizeTabBtn').addEventListener('click', () => setBuilderTab('customize'));
  // resume photo upload (premium templates ke liye)
  $('#rsPhotoBtn').addEventListener('click', () => $('#rsPhotoInput').click());
  $('#rsPhotoInput').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const max = 400;
      const s = Math.min(max / img.width, max / img.height, 1);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resumePhoto = c.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(url);
      $('#rsPhotoBox').style.backgroundImage = `url(${resumePhoto})`;
      $('#rsPhotoBox').classList.add('has-photo');
      $('#rsPhotoRemove').hidden = false;
      liveResumePreview();
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Photo load nahi hui', 'err'); };
    img.src = url;
  });
  $('#rsPhotoRemove').addEventListener('click', () => {
    resumePhoto = '';
    $('#rsPhotoBox').style.backgroundImage = '';
    $('#rsPhotoBox').classList.remove('has-photo');
    $('#rsPhotoRemove').hidden = true;
    liveResumePreview();
  });
  wireLivePreview();
  liveResumePreview();
}

// ---------------------------------------------------------------- document details modal

function openDocDetails(profile, d) {
  const modal = $('#docModal');
  if (!modal) return;
  $('#docModalType').textContent = d.doc_type || 'Document';
  const stClass = /pending/i.test(d.status) ? 'pending' : /issued|approved/i.test(d.status) ? 'issued' : /rejected/i.test(d.status) ? 'rejected' : '';
  const st = $('#docModalStatus');
  st.className = `status-badge ${stClass}`;
  st.textContent = d.status || 'Submitted';

  const dd = (label, value) =>
    value ? `<div class="dd-item"><span class="dd-label">${esc(label)}</span><span class="dd-value">${esc(value)}</span></div>` : '';

  $('#docModalDoc').innerHTML =
    dd('Document No', d.doc_no) +
    dd('Issue Date', d.issue_date) +
    dd('Valid Till', d.valid_till) +
    dd('Issued By', d.issued_by) +
    dd('Remarks', d.remarks) +
    dd('File', d.filename) +
    dd('Uploaded', d.uploaded_at) || '<p class="empty">Koi document details nahi.</p>';

  $('#docModalCust').innerHTML =
    dd('Customer Name', profile.name) +
    dd('Date of Birth', profile.dob) +
    dd('Gender', profile.gender) +
    dd('Phone / Email', profile.phone) +
    dd('Aadhaar No', profile.aadhaar) +
    dd('Address', profile.address) +
    dd("Father's Name", profile.father) +
    dd('University Reg No', profile.reg_no) || '<p class="empty">Koi customer details nahi.</p>';

  // extracted fields (jo upload ke waqt mili thi)
  let extracted = '';
  try {
    const f = JSON.parse(d.fields_json || '[]');
    if (Array.isArray(f) && f.length) {
      extracted = f
        .map((x) => (x && x.key && x.value ? dd(x.key, x.value) : ''))
        .join('');
    }
  } catch {
    extracted = '';
  }
  $('#docModalExtractedWrap').hidden = !extracted;
  $('#docModalExtracted').innerHTML = extracted || '';

  modal.hidden = false;
}

function wireDocModal() {
  $('#docModalClose').addEventListener('click', () => {
    $('#docModal').hidden = true;
  });
  $('#docModal').addEventListener('click', (e) => {
    if (e.target === $('#docModal')) $('#docModal').hidden = true;
  });
}

function wireNav() {
  const scrollTo = (el) => el && el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const setActive = (id) => {
    document.querySelectorAll('.side-item').forEach((i) => i.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  };
  const hideResume = () => { $('#resumePage').hidden = true; };
  $('#navDash').addEventListener('click', () => {
    hideResume();
    scrollTo(document.querySelector('.main-col .wrap'));
    setActive('navDash');
  });
  $('#navUpload').addEventListener('click', () => {
    hideResume();
    scrollTo($('#uploadZone'));
    setActive('navUpload');
  });
  $('#navReview').addEventListener('click', () => {
    hideResume();
    scrollTo($('#customerList'));
    setActive('navReview');
  });
  $('#navCustomers').addEventListener('click', () => {
    hideResume();
    scrollTo($('#customerList'));
    setActive('navCustomers');
  });
  $('#navDocs').addEventListener('click', () => {
    hideResume();
    scrollTo($('#customerList'));
    setActive('navDocs');
  });
  $('#qaUpload').addEventListener('click', () => scrollTo($('#uploadZone')));
  $('#qaReview').addEventListener('click', () => scrollTo($('#customerList')));
  $('#qaPassport').addEventListener('click', () => $('#passportBtn').click());
  $('#qaResizer').addEventListener('click', () => $('#resizerBtn').click());
  $('#qaServices').addEventListener('click', () => $('#servicesBtn').click());
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      $('#searchBox').focus();
    }
  });
}

function renderCustomers() {
  const list = $('#customerList');
  list.innerHTML = '';

  const q = state.search.trim().toLowerCase();
  const visible = q
    ? state.customers.filter((c) => c.name.toLowerCase().includes(q) || String(c.phone || '').includes(q) || String(c.aadhaar || '').includes(q))
    : state.customers;

  if (!state.customers.length) {
    const div = document.createElement('div');
    div.className = 'empty';
    div.textContent = 'Abhi koi customer nahi — upar document upload karo, customer khud ban jayega.';
    list.appendChild(div);
    $('#dashHint').textContent = 'Customer ke naam pe click karo — uske saare documents dikhenge.';
    return;
  }

  if (!visible.length) {
    const div = document.createElement('div');
    div.className = 'empty';
    div.textContent = `"${state.search}" se koi customer nahi mila.`;
    list.appendChild(div);
    $('#dashHint').textContent = `${state.customers.length} customers total.`;
    return;
  }

  for (const c of visible) {
    const item = document.createElement('div');
    item.className = 'cust-item' + (c.id === state.selectedId ? ' active' : '');
    const alt = 'alt' + ((c.name.length + c.id) % 4 + 1);
    item.innerHTML = `
      <div class="cust-left">
        <div class="avatar ${alt}">${esc(initials(c.name))}</div>
        <div style="min-width:0">
          <div class="cust-name">${esc(c.name)}</div>
          <div class="cust-meta">${c.phone ? '📞 ' + esc(c.phone) : '—'}${c.aadhaar ? ' · 🪪 ' + esc(c.aadhaar) : ''}</div>
        </div>
      </div>
      <div class="cust-right">
        <span class="count-badge">${c.doc_count} doc${c.doc_count === 1 ? '' : 's'}</span>
        <span class="chev">›</span>
      </div>
    `;
    item.addEventListener('click', () => selectCustomer(c.id));
    list.appendChild(item);
  }
  $('#dashHint').textContent = `${visible.length} of ${state.customers.length} customers. Naam pe click karke data dekho.`;
}

function loadCustomers() {
  return fetch('/api/customers')
    .then((r) => r.json())
    .then((list) => {
      state.customers = list;
      updateStats();
      renderCustomers();
    })
    .catch((err) => toast(err.message, 'err'));
}

function selectCustomer(id) {
  state.selectedId = id;
  renderCustomers();
  if (!id) {
    state.profile = null;
    $('#profileCard').hidden = true;
    return;
  }
  fetch(`/api/customers/${id}`)
    .then((r) => r.json())
    .then((profile) => {
      state.profile = profile;
      renderProfile();
      $('#profileCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    })
    .catch((err) => toast(err.message, 'err'));
}

function renderProfile() {
  const profile = state.profile;
  if (!profile) return;
  $('#profileName').textContent = profile.name;

  const details = $('#profileDetails');
  const chips = [
    ['Phone', profile.phone],
    ['Aadhaar', profile.aadhaar],
    ['DOB', profile.dob],
    ['Gender', profile.gender],
    ['Father', profile.father],
    ['Reg No', profile.reg_no],
    ['Address', profile.address],
  ].filter(([, v]) => v);
  details.innerHTML = chips
    .map(([k, v]) => `<span class="chip"><b>${esc(k)}</b>${esc(v)}</span>`)
    .join('');

  $('#profileMeta').textContent = `${profile.documents.length} document${profile.documents.length === 1 ? '' : 's'} total`;

  const list = $('#documentsList');
  list.innerHTML = '';

  if (!profile.documents.length) {
    const div = document.createElement('div');
    div.className = 'empty';
    div.textContent = 'Is customer ke paas abhi koi document nahi.';
    list.appendChild(div);
  }

  profile.documents.forEach((d) => {
    const row = document.createElement('div');
    row.className = 'record';
    const stClass = /pending/i.test(d.status) ? 'pending' : /issued|approved/i.test(d.status) ? 'issued' : /rejected/i.test(d.status) ? 'rejected' : '';
    row.innerHTML = `
      <div class="record-icon">${docIcon(d.doc_type)}</div>
      <div class="record-body">
        <div class="record-title">${esc(d.doc_type || '—')}
          <span class="status-badge ${stClass}">${esc(d.status)}</span>
        </div>
        <div class="record-meta">📎 ${esc(d.filename)} · ${esc(d.uploaded_at)}</div>
        <div class="record-chips">
          ${d.doc_no ? `<span class="mini-chip"><b>Doc No</b>${esc(d.doc_no)}</span>` : ''}
          ${d.issue_date ? `<span class="mini-chip"><b>Issue</b>${esc(d.issue_date)}</span>` : ''}
          ${d.valid_till ? `<span class="mini-chip"><b>Valid Till</b>${esc(d.valid_till)}</span>` : ''}
          ${d.issued_by ? `<span class="mini-chip"><b>Issued By</b>${esc(d.issued_by)}</span>` : ''}
          ${d.remarks ? `<span class="mini-chip"><b>Remarks</b>${esc(d.remarks)}</span>` : ''}
        </div>
      </div>
      <button class="btn danger sm" data-del="${d.id}">Delete</button>
    `;
    // poore card pe click -> saari details ka preview modal
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-del]')) return; // delete button click pe modal na khule
      openDocDetails(profile, d);
    });
    list.appendChild(row);
  });

  list.querySelectorAll('[data-del]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('Yeh document profile se delete kar dein?')) return;
      fetch(`/api/documents/${btn.dataset.del}`, { method: 'DELETE' })
        .then(() => selectCustomer(profile.id))
        .catch((err) => toast(err.message, 'err'));
    })
  );

  $('#profileCard').hidden = false;
}

function wireDashboard() {
  const goExport = (id) => {
    if (id) window.location = `/api/customers/${id}/export`;
  };
  $('#exportAllBtn').addEventListener('click', () => {
    window.location = '/api/export';
  });
  $('#profileExportBtn').addEventListener('click', () => {
    if (state.selectedId) goExport(state.selectedId);
  });
  $('#searchBox').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderCustomers();
  });
}

function loadDocTypes() {
  return fetch('/api/doc-types')
    .then((r) => r.json())
    .then((list) => {
      state.docTypes = list;
    })
    .catch(() => {
      state.docTypes = ['Aadhaar Card', 'Niwas Praman (Residence)', 'Other'];
    });
}

// ---------------------------------------------------------------- services

function wireServices() {
  const modal = $('#servicesModal');
  $('#servicesBtn').addEventListener('click', () => {
    modal.hidden = false;
  });
  $('#servicesClose').addEventListener('click', () => {
    modal.hidden = true;
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true; // bahar click -> band
  });
}

// Google Sheet ke "Services" tab se links (name + url). Sheet me link badlo ->
// ~2 min me portal me naya link dikh jayega. Sheet wala URL jeetta hai; nayi
// service row add karo to naya card bhi aa jayega.
let sheetServices = [];

async function loadServices() {
  try {
    const r = await fetch('/api/services');
    const d = await r.json();
    sheetServices = Array.isArray(d.services) ? d.services : [];
  } catch {
    sheetServices = [];
  }
  renderServices();
}

function mergedServices() {
  const map = new Map(SERVICES.map((s) => [String(s.type).toLowerCase(), s]));
  for (const row of sheetServices) {
    const name = String(row.name || '').trim();
    if (!name) continue;
    const url = String(row.url || '').trim();
    const key = name.toLowerCase();
    const base = map.get(key);
    if (base) {
      if (url) base.url = url; // sheet ka URL jeetta hai
    } else {
      SERVICES.push({ type: name, icon: '📄', desc: '', url }); // nayi service
      map.set(key, SERVICES[SERVICES.length - 1]);
    }
  }
  return SERVICES;
}

function renderServices() {
  const grid = $('#servicesGrid');
  grid.innerHTML = '';
  for (const s of mergedServices()) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'service-card';
    card.innerHTML = `
      <span class="service-icon">${s.icon}</span>
      <span class="service-name">${esc(s.type)} <span class="ext-badge">↗</span></span>
      <span class="service-desc">${esc(s.desc)}</span>
    `;
    card.addEventListener('click', () => {
      if (!s.url) {
        toast(`"${s.type}" ka link abhi nahi hai — Google Sheet ke Services tab me add karo`, 'err');
        return;
      }
      window.open(s.url, '_blank', 'noopener');
      toast(`"${s.type}" ki official website khul rahi hai…`);
    });
    grid.appendChild(card);
  }
}

// ---------------------------------------------------------------- document resizer

let resizerResult = null;

function fmtSize(b) {
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
  if (b >= 1024) return Math.round(b / 1024) + ' KB';
  return b + ' B';
}

function wireResizer() {
  const modal = $('#resizerModal');
  $('#resizerBtn').addEventListener('click', () => {
    modal.hidden = false;
  });
  $('#resizerClose').addEventListener('click', () => {
    modal.hidden = true;
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });
  $('#resizerPickBtn').addEventListener('click', () => $('#resizerInput').click());
  $('#resizerInput').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) resizeDoc(f);
  });
  $('#resizerDownloadBtn').addEventListener('click', () => {
    if (!resizerResult) return;
    const a = document.createElement('a');
    a.href = resizerResult.dataUrl;
    a.download = resizerResult.downloadName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
}

function resizeDoc(file) {
  toast('Size kam kiya ja raha hai…');
  $('#resizerResult').hidden = true;
  const fd = new FormData();
  fd.append('file', file);
  fetch('/api/resize', { method: 'POST', body: fd })
    .then(async (r) => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Resize failed');
      return d;
    })
    .then((d) => {
      resizerResult = d;
      $('#resizerBefore').textContent = fmtSize(d.sizeBefore);
      $('#resizerAfter').textContent = fmtSize(d.sizeAfter);
      $('#resizerPct').textContent = d.pct > 0 ? `-${d.pct}%` : '—';
      $('#resizerNote').hidden = !d.note;
      $('#resizerNote').textContent = d.note || '';
      $('#resizerResult').hidden = false;
      $('#resizerResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      toast(d.pct > 0 ? 'Ho gaya! Download dabao' : 'Koi badlav nahi — file pehle se chhoti hai');
    })
    .catch((err) => toast(err.message, 'err'));
}

// ---------------------------------------------------------------- passport photo maker

let passportFile = null;
let passportPdfUrl = null;

function wirePassport() {
  const modal = $('#passportModal');
  const makeBtn = $('#passportMakeBtn');
  $('#passportBtn').addEventListener('click', () => {
    modal.hidden = false;
  });
  $('#passportClose').addEventListener('click', () => {
    modal.hidden = true;
  });
  const customColor = $('#customBgColor');
  const customSwatch = $('#customBgSwatch');
  customColor.addEventListener('input', () => {
    customSwatch.style.background = customColor.value;
  });
  document.querySelectorAll('input[name="pbg"]').forEach((r) => {
    r.addEventListener('change', () => {
      if (r.value === 'custom') customColor.click();
    });
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });
  $('#passportPickBtn').addEventListener('click', () => $('#passportInput').click());
  $('#passportInput').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    passportFile = f;
    $('#passportInner').innerHTML =
      `<div class="upload-icon">📷</div><p class="upload-title">${escapeHtml(f.name)}</p>` +
      `<p class="upload-sub">${fmtSize(f.size)} — size/count chuno aur Sheet banao dabao</p>`;
    makeBtn.disabled = false;
    $('#passportResult').hidden = true;
  });
  makeBtn.addEventListener('click', () => {
    if (!passportFile) return;
    const size = (document.querySelector('input[name="psize"]:checked') || {}).value || '2x2';
    const count = parseInt($('#passportCount').value, 10) || 8;
    makeBtn.disabled = true;
    toast('A4 sheet bana rahe hain…');
    const fd = new FormData();
    fd.append('file', passportFile);
    fd.append('size', size);
    fd.append('count', String(count));
    let bg = (document.querySelector('input[name="pbg"]:checked') || {}).value || '';
    if (bg === 'custom') bg = $('#customBgColor').value;
    fd.append('bg', bg);
    fetch('/api/passport', { method: 'POST', body: fd })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Failed');
        return d;
      })
      .then((d) => {
        passportPdfUrl = d.dataUrl;
        $('#passportPerSheet').textContent = d.perSheet;
        $('#passportPages').textContent = d.pages;
        $('#passportSizeLabel').textContent = d.sizeLabel;
        const img = $('#passportPreview');
        if (d.preview) {
          img.src = d.preview;
          $('#passportPreviewWrap').hidden = false;
        } else {
          $('#passportPreviewWrap').hidden = true;
        }
        $('#passportResult').hidden = false;
        $('#passportResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        toast(`Ho gaya! ${d.count} photos, ${d.pages} A4 page` + (d.pages > 1 ? 's' : ''));
      })
      .catch((err) => toast(err.message, 'err'))
      .finally(() => {
        makeBtn.disabled = false;
      });
  });
  $('#passportDownloadBtn').addEventListener('click', () => {
    if (!passportPdfUrl) return;
    const a = document.createElement('a');
    a.href = passportPdfUrl;
    a.download = 'passport-photos-a4.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
  $('#passportPrintBtn').addEventListener('click', () => {
    if (!passportPdfUrl) return;
    toast('Print window khol rahe hain…');
    printPdf(passportPdfUrl);
  });
}

// A4 PDF ko hidden iframe me load karke print dialog kholo.
// Agar browser print na kar paye (jaise mobile) to PDF naye tab me khul jayegi.
function printPdf(dataUrl) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  iframe.src = dataUrl;
  let openedFallback = false;
  const openFallback = () => {
    if (openedFallback) return;
    openedFallback = true;
    window.open(dataUrl, '_blank', 'noopener');
  };
  iframe.onload = () => {
    try {
      const w = iframe.contentWindow;
      let printed = false;
      w.addEventListener('beforeprint', () => { printed = true; });
      w.focus();
      w.print();
      // print() turant wapas aa gaya (dialog nahi khula) => PDF tab me kholo
      setTimeout(() => { if (!printed) openFallback(); }, 800);
    } catch {
      openFallback();
    }
  };
  // PDF 6 sec me load na ho to bhi fallback
  setTimeout(openFallback, 6000);
  document.body.appendChild(iframe);
  setTimeout(() => iframe.remove(), 120000);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ---------------------------------------------------------------- topbar sheet button

function wireSheetBtn() {
  const btn = $('#sheetBtn');
  fetch('/api/settings')
    .then((r) => r.json())
    .then((d) => {
      if (d && d.sheetUrl) {
        btn.hidden = false;
        btn.addEventListener('click', () => window.open(d.sheetUrl, '_blank', 'noopener'));
      }
    })
    .catch(() => {});
}

// ---------------------------------------------------------------- boot

wireUpload();
wirePreview();
wireDashboard();
wireSheetBtn();
wireServices();
wireResizer();
wirePassport();
wireResume();
wireDocModal();
wireNav();
renderServices();
loadDocTypes();
loadServices();
loadCustomers();
loadStats();
