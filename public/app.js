// Kendra Portal — frontend logic (vanilla JS, no build step)
// Upload → extract → preview → confirm → save → customer name pe click → data

const $ = (sel) => document.querySelector(sel);

const STATUSES = ['Submitted', 'Pending', 'Approved', 'Rejected', 'Issued'];

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

function uploadFile(file) {
  if (!file) return;
  const okExt = /\.(pdf|txt|csv|jpe?g|png)$/i.test(file.name);
  if (!okExt) {
    toast('Sirf PDF, JPG, PNG, TXT ya CSV file upload karo', 'err');
    return;
  }
  const fd = new FormData();
  fd.append('file', file);
  toast('Document se data extract ho raha hai…');

  fetch('/api/upload', { method: 'POST', body: fd })
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return data;
    })
    .then((preview) => {
      state.preview = preview;
      renderPreview();
      $('#previewCard').hidden = false;
      $('#previewCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    })
    .catch((err) => toast(err.message, 'err'));
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

  // status dropdown
  const stSel = $('#statusSelect');
  stSel.innerHTML = STATUSES.map((s) => `<option value="${s}"${s === 'Submitted' ? ' selected' : ''}>${s}</option>`).join('');

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
    status: $('#statusSelect').value,
    remarks: $('#remarksInput').value.trim(),
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
    list.appendChild(row);
  });

  list.querySelectorAll('[data-del]').forEach((btn) =>
    btn.addEventListener('click', () => {
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

// ---------------------------------------------------------------- boot

wireUpload();
wirePreview();
wireDashboard();
renderServices();
loadDocTypes();
loadServices();
loadCustomers();
