const $ = (selector) => document.querySelector(selector);
const form = $('#resolve-form');
const input = $('#url-input');
const submit = $('#submit-btn');
const submitLabel = $('#submit-label');
const resultWrap = $('#results');
const good = $('#result-good');
const bad = $('#result-bad');
const traceList = $('#trace-list');
const recentList = $('#recent-list');
const SESSION_KEY = 'felixiority-shortlink-session-v1';
let controller = null;
let toastTimer;

function icon(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${id}`);
  svg.appendChild(use);
  return svg;
}
function say(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
}
function hostFrom(url) { try { return new URL(url).hostname; } catch { return 'unknown'; } }
function shortUrl(url, max = 72) { return url.length > max ? url.slice(0, max - 1) + '…' : url; }
function setLoading(value) {
  submit.disabled = value;
  submit.classList.toggle('loading', value);
  submitLabel.textContent = value ? 'Sedang menelusuri...' : 'Telusuri link sekarang';
}
function stored() {
  try {
    const entries = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]');
    return Array.isArray(entries) ? entries.slice(0, 5) : [];
  } catch { return []; }
}
function store(url, finalUrl, success) {
  const current = stored().filter(item => item.url !== url);
  current.unshift({ url, finalUrl, success, time: Date.now() });
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(current.slice(0, 5))); } catch { /* Private mode */ }
  renderHistory();
}
function renderHistory() {
  const recent = stored();
  recentList.replaceChildren();
  if (!recent.length) {
    const empty = document.createElement('p');
    empty.className = 'recent-empty';
    empty.textContent = 'Belum ada link yang ditelusuri.';
    recentList.appendChild(empty);
    return;
  }
  recent.forEach((item, index) => {
    const row = document.createElement('button');
    row.className = 'recent-item';
    row.type = 'button';
    row.title = `Gunakan ulang ${item.url}`;
    const n = document.createElement('span'); n.className = 'recent-index'; n.textContent = `0${index+1}`;
    const text = document.createElement('div');
    const domain = document.createElement('span'); domain.className = 'recent-host'; domain.textContent = hostFrom(item.url);
    const note = document.createElement('small'); note.className = 'recent-when'; note.textContent = `${item.success ? 'Terdeteksi' : 'Belum ditemukan'} · ${new Date(item.time).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' })}`;
    text.append(domain, note); row.append(n, text, icon('arrow'));
    row.addEventListener('click', () => {
      input.value = item.url; updateCount();
      document.querySelector('#resolver').scrollIntoView({ behavior: 'smooth' });
      input.focus();
      say('Link dimasukkan kembali. Tekan Telusuri untuk mencoba.');
    });
    recentList.appendChild(row);
  });
}
function updateCount() { $('#char-count').textContent = `${input.value.length} / 2048`; }
function addTrace(chain) {
  traceList.replaceChildren();
  $('#trace-count').textContent = `${(chain || []).length} TITIK`;
  for (const [i, hop] of (chain || []).entries()) {
    const li = document.createElement('li'); li.className = 'trace-item';
    const order = document.createElement('span'); order.className = 'trace-n'; order.textContent = String(i+1).padStart(2, '0');
    const details = document.createElement('div'); details.className = 'trace-details';
    const link = document.createElement('span'); link.className = 'trace-url'; link.textContent = shortUrl(hop.url, 130); link.title = hop.url;
    const method = document.createElement('span'); method.className = 'trace-via'; method.textContent = `${hop.via === 'input' ? 'Link awal' : hop.via}${hop.status ? ` · HTTP ${hop.status}` : ''}`;
    details.append(link, method); li.append(order, details); traceList.appendChild(li);
  }
}
function showResult(data) {
  resultWrap.hidden = false;
  resultWrap.classList.toggle('is-error', !data.ok);
  good.hidden = !data.ok;
  bad.hidden = !!data.ok;
  const stateIcon = $('#result-icon');
  stateIcon.replaceChildren(icon(data.ok ? 'check' : 'alert'));
  $('#result-title').textContent = data.ok ? 'Alamat tujuan ditemukan' : 'Belum berhasil ditelusuri';
  $('#result-subtitle').textContent = data.ok ? 'URL tersedia untuk dibuka atau disalin.' : 'Situs sumber mungkin membatasi pemeriksaan.';
  if (data.ok) {
    $('#destination').textContent = data.finalUrl;
    $('#open-result').href = data.finalUrl;
    $('#copy-result').onclick = async () => copyText(data.finalUrl);
  } else {
    $('#error-message').textContent = data.message || 'Gagal memproses URL.';
    $('#error-hint').textContent = data.hint || 'Periksa kembali link, lalu coba lagi.';
  }
  addTrace(data.chain);
  $('#result-meta').textContent = `DURASI: ${typeof data.elapsedMs === 'number' ? (data.elapsedMs/1000).toFixed(2) + ' DETIK' : '—'}  ·  METODE: ${(data.method || 'PEMERIKSAAN PUBLIK').toUpperCase()}`;
  resultWrap.scrollIntoView({ behavior:'smooth', block:'nearest' });
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); say('URL berhasil disalin.'); }
  catch { say('Gagal menyalin. Coba salin secara manual.'); }
}
$('#paste-btn').addEventListener('click', async () => {
  try {
    input.value = (await navigator.clipboard.readText()).trim();
    updateCount(); input.focus();
    say('Link berhasil ditempel.');
  } catch { input.focus(); say('Izinkan akses clipboard atau tempel link secara manual.'); }
});
input.addEventListener('input', updateCount);
$('#close-result').addEventListener('click', () => { resultWrap.hidden = true; });
$('#clear-history').addEventListener('click', () => { sessionStorage.removeItem(SESSION_KEY); renderHistory(); say('Riwayat sesi sudah dihapus.'); });
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = input.value.trim();
  if (!url) { input.focus(); say('Masukkan link terlebih dahulu.'); return; }
  if (url.length > 2048) { say('URL maksimal 2.048 karakter.'); return; }
  if (controller) controller.abort();
  controller = new AbortController();
  setLoading(true);
  resultWrap.hidden = true;
  try {
    const res = await fetch('/api/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal
    });
    const data = await res.json();
    showResult(data);
    if (data.inputUrl) store(data.inputUrl, data.finalUrl || '', Boolean(data.ok));
  } catch (e) {
    if (e.name === 'AbortError') return;
    showResult({ ok:false, message:'Tidak dapat terhubung ke server resolver.', hint:'Periksa koneksi internet atau status server website.', chain:[] });
  } finally { setLoading(false); controller = null; }
});
updateCount();
renderHistory();
