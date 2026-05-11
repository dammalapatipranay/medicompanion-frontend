/* ─────────────────────────────────────────
   MediCompanion — script.js
   - Tab navigation (home / reminders / symptom)
   - Dark / Light theme toggle (persisted)
   - Medicine CRUD + LocalStorage
   - Timeline view
   - Guided symptom checker
   - Offline disease DB first, then Gemini AI
   - PWA install prompt
   - Remembers last tab
───────────────────────────────────────── */

/* ══════════════════════════════════════
   BACKEND CONFIG
   Change this to your Railway URL after deploying
══════════════════════════════════════ */
const API_URL = 'https://medicompanion-backend.vercel.app';

/* ══════════════════════════════════════
   STATE
══════════════════════════════════════ */
let medicines     = JSON.parse(localStorage.getItem('mr_meds')   || '[]');
let takenToday    = JSON.parse(localStorage.getItem('mr_taken_'  + todayKey()) || '[]');
let selectedColor = 'green';
let symptomStep   = 0;
let symptomAnswers = [];
let currentMode   = 'guided';
let aiSearchCache = {};

/* ══════════════════════════════════════
   GEMINI KEYS — moved to backend
   Frontend calls /api/search instead
   Keys are safe on the server
══════════════════════════════════════ */

/* ══════════════════════════════════════
   UTILITIES
══════════════════════════════════════ */
function todayKey() { return new Date().toISOString().slice(0, 10); }
function saveMeds()  { localStorage.setItem('mr_meds',  JSON.stringify(medicines)); }
function saveTaken() { localStorage.setItem('mr_taken_' + todayKey(), JSON.stringify(takenToday)); }
function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}
function escapeHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function colorHex(c) {
  return { green:'#1a9e72', blue:'#3b82f6', amber:'#f0a500', red:'#e24b4a', purple:'#8b5cf6' }[c] || '#1a9e72';
}
function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
function fullDateLabel() {
  return new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

/* ══════════════════════════════════════
   THEME TOGGLE (dark / light)
   Persisted in localStorage
══════════════════════════════════════ */
function initTheme() {
  const saved = localStorage.getItem('mr_theme') || 'dark';
  applyTheme(saved);
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('mr_theme', theme);
  document.getElementById('theme-icon').textContent = theme === 'dark' ? '☀️' : '🌙';
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/* ══════════════════════════════════════
   TAB NAVIGATION
   Remembers last tab across page reloads
══════════════════════════════════════ */
function showTab(tab) {
  // Hide all tabs
  document.querySelectorAll('.tab-page').forEach(p => p.classList.add('hidden'));

  // Deactivate all nav buttons (top + bottom)
  document.querySelectorAll('.nav-btn, .bnav-btn').forEach(b => b.classList.remove('active'));

  // Show selected tab
  document.getElementById('tab-' + tab).classList.remove('hidden');

  // Activate correct nav buttons
  const topBtn    = document.getElementById('nav-' + tab);
  const bottomBtn = document.getElementById('bnav-' + tab);
  if (topBtn)    topBtn.classList.add('active');
  if (bottomBtn) bottomBtn.classList.add('active');

  // Remember last tab
  localStorage.setItem('mr_last_tab', tab);

  // Tab-specific init
  if (tab === 'home')      renderHome();
  if (tab === 'reminders') renderMedicines();
  if (tab === 'symptom')   { initSymptom(); switchMode(currentMode); }
}

/* ══════════════════════════════════════
   HOME TAB RENDER
══════════════════════════════════════ */
function renderHome() {
  // Greeting
  const helloEl = document.getElementById('home-hello');
  if (helloEl) helloEl.textContent = greet();

  // Stats
  const taken   = medicines.filter(m => takenToday.includes(m.id)).length;
  const pending = medicines.length - taken;
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('hstat-total',   medicines.length);
  setEl('hstat-taken',   taken);
  setEl('hstat-pending', pending);

  // Next medicine card
  const nextEl = document.getElementById('home-next');
  if (!nextEl) return;

  const now    = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const upcoming = medicines
    .filter(m => !takenToday.includes(m.id))
    .map(m => {
      const [h, mh] = m.time.split(':').map(Number);
      return { ...m, mins: h * 60 + mh };
    })
    .filter(m => m.mins >= nowMin)
    .sort((a, b) => a.mins - b.mins);

  if (upcoming.length === 0) {
    if (medicines.length === 0) {
      nextEl.innerHTML = `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px 22px;display:flex;align-items:center;gap:14px;">
          <span style="font-size:28px">💊</span>
          <div>
            <p style="font-size:14px;font-weight:500;color:var(--text-1);">No medicines yet</p>
            <p style="font-size:12px;color:var(--text-3);">Add your first medicine reminder</p>
          </div>
          <button onclick="showTab('reminders');openModal()" style="margin-left:auto;background:var(--green);color:#fff;border:none;padding:8px 14px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;">+ Add</button>
        </div>`;
    } else {
      nextEl.innerHTML = `
        <div style="background:var(--green-l);border:1px solid rgba(26,158,114,0.2);border-radius:14px;padding:18px 22px;display:flex;align-items:center;gap:12px;">
          <span style="font-size:26px">🎉</span>
          <div>
            <p style="font-size:14px;font-weight:600;color:var(--green);">All done for today!</p>
            <p style="font-size:12px;color:var(--text-3);">You've taken all your medicines. Great job!</p>
          </div>
        </div>`;
    }
    return;
  }

  const next = upcoming[0];
  nextEl.innerHTML = `
    <div class="next-card">
      <div class="next-card-icon">💊</div>
      <div>
        <p class="next-card-label">Up next</p>
        <p class="next-card-name">${escapeHtml(next.name)}</p>
        <p class="next-card-time">${formatTime(next.time)}${next.dose ? ' · ' + escapeHtml(next.dose) : ''}</p>
      </div>
      <button class="next-card-btn" onclick="showTab('reminders')">View all →</button>
    </div>`;
}

/* ══════════════════════════════════════
   MEDICINE CRUD
══════════════════════════════════════ */
function openModal() {
  selectedColor = 'green';
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
  const greenDot = document.querySelector('.color-dot[data-color="green"]');
  if (greenDot) greenDot.classList.add('selected');
  document.getElementById('modal-overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('med-name').focus(), 100);
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  ['med-name','med-dose','med-time'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('med-freq').value = 'Daily';
}
function closeModalOnBg(e) { if (e.target.id === 'modal-overlay') closeModal(); }
function pickColor(color, btn) {
  selectedColor = color;
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
  btn.classList.add('selected');
}
function addMedicine() {
  const name = document.getElementById('med-name').value.trim();
  const dose = document.getElementById('med-dose').value.trim();
  const time = document.getElementById('med-time').value;
  const freq = document.getElementById('med-freq').value;
  if (!name) { highlight('med-name'); return; }
  if (!time) { highlight('med-time'); return; }
  const med = { id: Date.now().toString(), name, dose, time, freq, color: selectedColor, createdAt: new Date().toISOString() };
  medicines.push(med);
  saveMeds();
  scheduleNotification(med);
  closeModal();
  renderMedicines();
  renderHome();
  showToast('✅ ' + name + ' added!');
}
function highlight(id) {
  const el = document.getElementById(id);
  el.style.borderColor = '#e24b4a';
  el.focus();
  setTimeout(() => el.style.borderColor = '', 1500);
}
function deleteMedicine(id) {
  medicines  = medicines.filter(m => m.id !== id);
  takenToday = takenToday.filter(t => t !== id);
  saveMeds(); saveTaken();
  renderMedicines(); renderHome();
  showToast('🗑 Removed');
}
function toggleTaken(id) {
  if (takenToday.includes(id)) takenToday = takenToday.filter(t => t !== id);
  else takenToday.push(id);
  saveTaken();
  renderMedicines(); renderHome();
}

/* ══════════════════════════════════════
   RENDER MEDICINES + TIMELINE
══════════════════════════════════════ */
function renderMedicines() {
  const dateEl = document.getElementById('date-label');
  if (dateEl) dateEl.textContent = fullDateLabel();

  const list   = document.getElementById('medicine-list');
  const empty  = document.getElementById('empty-state');
  const tlSec  = document.getElementById('timeline-section');
  const lHead  = document.getElementById('list-heading');
  if (!list) return;

  const taken  = medicines.filter(m => takenToday.includes(m.id)).length;
  const setEl  = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('stat-total',   medicines.length);
  setEl('stat-taken',   taken);
  setEl('stat-pending', medicines.length - taken);

  if (medicines.length === 0) {
    list.innerHTML = '';
    if (empty)  empty.style.display  = 'block';
    if (tlSec)  tlSec.style.display  = 'none';
    if (lHead)  lHead.style.display  = 'none';
    return;
  }
  if (empty)  empty.style.display  = 'none';
  if (tlSec)  tlSec.style.display  = 'block';
  if (lHead)  lHead.style.display  = 'block';

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const sorted = [...medicines].sort((a, b) => a.time.localeCompare(b.time));

  // Timeline
  const tlEl = document.getElementById('timeline');
  if (tlEl) {
    tlEl.innerHTML = sorted.map(med => {
      const [h, m]    = med.time.split(':').map(Number);
      const medMin    = h * 60 + m;
      const isTaken   = takenToday.includes(med.id);
      const isOverdue = !isTaken && medMin < nowMin;
      const isSoon    = !isTaken && medMin >= nowMin && medMin - nowMin <= 60;
      const dotCls    = isTaken ? 'taken' : isOverdue ? 'overdue' : '';
      const badgeCls  = isTaken ? 'taken' : isOverdue ? 'overdue' : isSoon ? 'upcoming' : 'pending';
      const badgeTxt  = isTaken ? '✓ Taken' : isOverdue ? 'Missed' : isSoon ? 'Soon' : 'Pending';
      const dotStyle  = isTaken ? `background:${colorHex(med.color||'green')};box-shadow:0 0 0 1.5px ${colorHex(med.color||'green')}` : isOverdue ? 'background:#e24b4a;box-shadow:0 0 0 1.5px #e24b4a' : '';
      return `
      <div class="tl-item">
        <div class="tl-dot ${dotCls}" style="${dotStyle}"></div>
        <span class="tl-time">${formatTime(med.time)}</span>
        <div><p class="tl-name">${escapeHtml(med.name)}</p>${med.dose?`<p class="tl-dose">${escapeHtml(med.dose)}</p>`:''}</div>
        <span class="tl-badge ${badgeCls}">${badgeTxt}</span>
      </div>`;
    }).join('');
  }

  // Medicine cards
  list.innerHTML = sorted.map((med, i) => {
    const isTaken = takenToday.includes(med.id);
    const color   = med.color || 'green';
    return `
    <div class="med-item color-${color} ${isTaken?'taken':''}" style="animation-delay:${i*0.04}s">
      <div class="med-dot-wrap" style="background:${colorHex(color)}22">
        <div class="med-color-circle" style="background:${colorHex(color)}"></div>
      </div>
      <div class="med-info">
        <p class="med-name">${escapeHtml(med.name)}</p>
        <div class="med-meta">
          <span class="med-time-badge">⏰ ${formatTime(med.time)}</span>
          <span>${escapeHtml(med.freq)}</span>
          ${med.dose?`<span>${escapeHtml(med.dose)}</span>`:''}
        </div>
      </div>
      <div class="med-actions">
        <button class="btn-check ${isTaken?'checked':''}" onclick="toggleTaken('${med.id}')" title="${isTaken?'Unmark':'Mark as taken'}">${isTaken?'✓':''}</button>
        <button class="btn-del" onclick="deleteMedicine('${med.id}')" title="Delete">🗑</button>
      </div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════
   NOTIFICATIONS
══════════════════════════════════════ */
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    window._swReg = await navigator.serviceWorker.register('./sw.js');
  } catch(e) { console.warn('SW:', e.message); }
}
function checkNotifPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    const b = document.getElementById('notif-banner');
    if (b) b.style.display = 'flex';
  }
}
async function requestNotifPermission() {
  const perm = await Notification.requestPermission();
  const b = document.getElementById('notif-banner');
  if (b) b.style.display = 'none';
  if (perm === 'granted') {
    await registerServiceWorker();
    showToast('🔔 Notifications enabled!');
    medicines.forEach(scheduleNotification);
  } else {
    showToast('Notifications blocked — enable in browser settings.');
  }
}
function scheduleNotification(med) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const [h, m] = med.time.split(':').map(Number);
  const now    = new Date();
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const delay = target - now;
  const title = '💊 Time for ' + med.name;
  const body  = med.dose || 'Tap to mark as taken';
  if (window._swReg?.active) {
    window._swReg.active.postMessage({ type:'SCHEDULE', title, body, tag:'med-'+med.id, delay });
  } else {
    setTimeout(() => {
      new Notification(title, { body, icon:'./icons/icon-192.png', requireInteraction: true });
    }, delay);
  }
}

/* ══════════════════════════════════════
   TOAST
══════════════════════════════════════ */
function showToast(msg) {
  const old = document.getElementById('mr-toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.id = 'mr-toast';
  Object.assign(t.style, {
    position:'fixed', bottom:'84px', left:'50%', transform:'translateX(-50%)',
    background:'var(--bg2)', color:'var(--text-1)',
    border:'1px solid var(--border2)',
    padding:'10px 22px', borderRadius:'12px', fontSize:'13px',
    zIndex:'9999', boxShadow:'var(--shadow-lg)',
    whiteSpace:'nowrap', animation:'fadeUp 0.25s ease',
    fontFamily:'var(--font-sans)'
  });
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

/* ══════════════════════════════════════
   GUIDED SYMPTOM CHECKER
══════════════════════════════════════ */
const questions = [
  { q:'What is your main symptom right now?',
    options:['Fever / high temperature','Headache or body ache','Cough or cold','Stomach pain or nausea','Chest pain or difficulty breathing'] },
  { q:'How long have you had this symptom?',
    options:['Less than 24 hours','1–3 days','4–7 days','More than a week'] },
  { q:'How severe is it?',
    options:['Mild — I can go about my day','Moderate — it is affecting my day','Severe — I can barely function'] },
  { q:'Any additional symptoms?',
    options:['None of the below','High fever above 103°F','Shortness of breath or chest tightness','Confusion or difficulty staying awake'] },
  { q:'Any pre-existing conditions?',
    options:['No, I am generally healthy','Yes — diabetes, heart disease, or asthma','Yes — pregnant or elderly (65+)','Not sure'] }
];
function getGuidedResult(answers) {
  let score = 0;
  if (answers[0]===4) score+=3; else if (answers[0]===0) score+=1;
  if (answers[1]===3) score+=2; else if (answers[1]===2) score+=1;
  score += (answers[2]||0);
  if (answers[3]===3) score+=4; else if (answers[3]===2) score+=3; else if (answers[3]===1) score+=2;
  if (answers[4]===2) score+=2; else if (answers[4]===1) score+=2;
  if (score>=6) return { level:'high', icon:'🏥', label:'Seek medical attention', title:'Please see a doctor soon',
    desc:'Based on your symptoms, consult a healthcare professional as soon as possible.',
    tips:'• Call your doctor or visit a clinic today\n• Do not self-medicate\n• Chest pain / breathing difficulty → go to emergency\n• Keep someone with you if worsening' };
  if (score>=3) return { level:'mid', icon:'🌡️', label:'Monitor closely', title:'Rest and monitor your symptoms',
    desc:'Your symptoms may not be an emergency, but keep a close eye for the next 24–48 hours.',
    tips:'• Rest and stay hydrated (water, ORS)\n• Paracetamol for fever or pain\n• Avoid strenuous activity\n• See a doctor if symptoms worsen or no improvement in 2 days' };
  return { level:'low', icon:'😊', label:'Manageable at home', title:'You can manage this at home',
    desc:'Based on your answers, your symptoms seem mild and manageable with rest and basic care.',
    tips:'• Get plenty of rest\n• Stay hydrated\n• Eat light meals\n• Consult a doctor if no improvement in 3 days' };
}
function initSymptom() {
  symptomStep = 0; symptomAnswers = [];
  const rc = document.getElementById('result-card');
  const sc = document.getElementById('symptom-card');
  const bn = document.getElementById('btn-next');
  const br = document.getElementById('btn-restart');
  const bb = document.getElementById('btn-back');
  if (rc) rc.classList.add('hidden');
  if (sc) sc.classList.remove('hidden');
  if (bn) bn.classList.remove('hidden');
  if (br) br.classList.add('hidden');
  if (bb) bb.style.display = 'none';
  renderQuestion();
}
function renderQuestion() {
  const q   = questions[symptomStep];
  const sel = symptomAnswers[symptomStep];
  document.querySelectorAll('.step-dot').forEach((dot, i) => {
    dot.classList.remove('active','done');
    if (i < symptomStep) dot.classList.add('done');
    if (i === symptomStep) dot.classList.add('active');
  });
  const sc = document.getElementById('symptom-card');
  if (sc) sc.innerHTML = `
    <p class="symptom-q">${q.q}</p>
    <div class="symptom-options">
      ${q.options.map((opt,i) => `
        <button class="opt-btn ${sel===i?'selected':''}" onclick="selectOption(${i})">
          <span class="opt-check">${sel===i?'✓':''}</span>${escapeHtml(opt)}
        </button>`).join('')}
    </div>`;
  const bb = document.getElementById('btn-back');
  if (bb) bb.style.display = symptomStep > 0 ? 'block' : 'none';
}
function selectOption(i) { symptomAnswers[symptomStep] = i; renderQuestion(); }
function symptomNext() {
  if (symptomAnswers[symptomStep] === undefined) { showToast('Please select an option'); return; }
  if (symptomStep < questions.length - 1) { symptomStep++; renderQuestion(); }
  else showGuidedResult();
}
function symptomBack() { if (symptomStep > 0) { symptomStep--; renderQuestion(); } }
function showGuidedResult() {
  const result = getGuidedResult(symptomAnswers);
  const sc = document.getElementById('symptom-card');
  const bn = document.getElementById('btn-next');
  const br = document.getElementById('btn-restart');
  const bb = document.getElementById('btn-back');
  const rc = document.getElementById('result-card');
  if (sc) sc.classList.add('hidden');
  if (bn) bn.classList.add('hidden');
  if (bb) bb.style.display = 'none';
  if (br) br.classList.remove('hidden');
  document.querySelectorAll('.step-dot').forEach(d => { d.classList.remove('active'); d.classList.add('done'); });
  if (rc) {
    rc.className = `result-card result-${result.level}`;
    rc.innerHTML = `
      <div class="result-icon">${result.icon}</div>
      <p class="result-level">${result.label}</p>
      <h3 class="result-title">${result.title}</h3>
      <p class="result-desc">${result.desc}</p>
      <div class="result-tips"><p>${result.tips.replace(/\n/g,'<br>')}</p></div>
      <p style="font-size:11px;color:var(--text-3);margin-top:14px;">⚠ Not a medical diagnosis. Always consult a qualified doctor.</p>`;
    rc.classList.remove('hidden');
  }
}
function restartSymptom() { initSymptom(); }

/* ══════════════════════════════════════
   MODE SWITCHER
══════════════════════════════════════ */
function switchMode(mode) {
  currentMode = mode;
  const gm = document.getElementById('guided-mode');
  const sm = document.getElementById('search-mode');
  const gb = document.getElementById('mode-guided-btn');
  const sb = document.getElementById('mode-search-btn');
  if (gm) gm.classList.toggle('hidden', mode !== 'guided');
  if (sm) sm.classList.toggle('hidden', mode !== 'search');
  if (gb) gb.classList.toggle('active', mode === 'guided');
  if (sb) sb.classList.toggle('active', mode === 'search');
  if (mode === 'guided') initSymptom();
}

/* ══════════════════════════════════════
   DISEASE SEARCH
   Offline DB first → Gemini AI fallback
══════════════════════════════════════ */
let searchTimeout = null;
function onSymptomSearch(val) {
  const clr = document.getElementById('search-clear');
  if (clr) clr.style.display = val ? 'flex' : 'none';
  clearTimeout(searchTimeout);
  if (!val.trim()) { const a = document.getElementById('search-result-area'); if (a) a.innerHTML = ''; return; }
  searchTimeout = setTimeout(() => askAI(val.trim()), 500);
}
function searchFor(term) {
  const inp = document.getElementById('symptom-search-input');
  const clr = document.getElementById('search-clear');
  if (inp) inp.value = term;
  if (clr) clr.style.display = 'flex';
  askAI(term);
}
function clearSearch() {
  const inp = document.getElementById('symptom-search-input');
  const clr = document.getElementById('search-clear');
  const a   = document.getElementById('search-result-area');
  if (inp) inp.value = '';
  if (clr) clr.style.display = 'none';
  if (a)   a.innerHTML = '';
}

async function askAI(query) {
  const area = document.getElementById('search-result-area');
  if (!area) return;

  // 1. Offline DB (instant)
  const offline = searchOfflineDB(query);
  if (offline) { aiSearchCache[query.toLowerCase()] = offline; renderAICard(offline, area, false); return; }

  // 2. Cache
  if (aiSearchCache[query.toLowerCase()]) { renderAICard(aiSearchCache[query.toLowerCase()], area, true); return; }

  // 3. No internet
  if (!navigator.onLine) {
    area.innerHTML = `<div class="no-result-box">
      <p style="font-size:26px;margin-bottom:10px">📡</p>
      <p><strong>No internet connection</strong></p>
      <p style="margin-top:6px">"${escapeHtml(query)}" not found offline. Connect to internet to search more conditions.</p>
    </div>`; return;
  }

  // 4. Loading
  area.innerHTML = `<div class="ai-loading"><div class="ai-spinner"></div><p>Searching for <strong>"${escapeHtml(query)}"</strong>…</p></div>`;

  try {
    // Calls our backend — Gemini key stays on the server, never in browser
    const resp = await fetch(`${API_URL}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });

    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    const data = await resp.json();

    // Backend says not a health topic
    if (data.result === null) {
      area.innerHTML = `<div class="no-result-box"><p style="font-size:26px;margin-bottom:10px">🩺</p><p><strong>Not a health topic</strong></p><p style="margin-top:6px">${escapeHtml(data.message || 'Please search for a health-related topic.')}</p></div>`;
      return;
    }

    const parsed = data.result;
    aiSearchCache[query.toLowerCase()] = parsed;
    renderAICard(parsed, area, data.source === 'ai');

  } catch(err) {
    console.error('Search error:', err.message);
    area.innerHTML = `<div class="no-result-box">
      <p style="font-size:26px;margin-bottom:10px">⚠️</p>
      <p><strong>Search unavailable</strong></p>
      <p style="margin-top:6px;color:var(--text-3)">Check your connection and try again.</p>
      <button onclick="askAI('${escapeHtml(query)}')" style="margin-top:14px;padding:7px 16px;border-radius:9px;border:1px solid var(--border2);background:none;cursor:pointer;font-size:13px;color:var(--text-1);font-family:var(--font-sans);">🔄 Retry</button>
    </div>`;
  }
}

function renderAICard(d, area, isAI=false) {
  const typeLabel = { common:'Common condition',chronic:'Chronic disease',infectious:'Infectious disease',lifestyle:'Lifestyle condition',mental:'Mental health',emergency:'Emergency' }[d.type]||d.type;
  const urg = { low:{cls:'urgency-low',icon:'✅',text:'Low urgency — manageable at home'}, medium:{cls:'urgency-medium',icon:'⚠️',text:'Moderate urgency — monitor closely'}, high:{cls:'urgency-high',icon:'🏥',text:'High urgency — see a doctor soon'} }[d.urgency]||{cls:'urgency-medium',icon:'⚠️',text:'Monitor and consult if worsening'};
  area.innerHTML = `
    <div class="disease-card">
      <div class="disease-header">
        <span class="disease-emoji">${d.emoji||'🩺'}</span>
        <div>
          <p class="disease-name">${escapeHtml(d.name)}</p>
          <span class="disease-type type-${d.type}">${typeLabel}</span>
          ${isAI?'<span class="ai-badge">✨ AI</span>':'<span class="offline-badge">📦 Offline</span>'}
        </div>
      </div>
      <div class="disease-body">
        <p class="disease-desc">${escapeHtml(d.description)}</p>
        <p class="disease-section-title">Symptoms</p>
        <div class="tag-list">${(d.symptoms||[]).map(s=>`<span class="tag">${escapeHtml(s)}</span>`).join('')}</div>
        <p class="disease-section-title">Causes</p>
        <div class="tag-list">${(d.causes||[]).map(c=>`<span class="tag">${escapeHtml(c)}</span>`).join('')}</div>
        <p class="disease-section-title">Home care</p>
        <p class="disease-desc">${(d.homecare||[]).map(h=>'• '+h).join('<br>')}</p>
        <p class="disease-section-title">When to see a doctor</p>
        <p class="disease-desc">${escapeHtml(d.whenToSeeDoctor)}</p>
        <div class="urgency-box ${urg.cls}">${urg.icon} ${urg.text}</div>
        <p style="font-size:11px;color:var(--text-3);margin-top:12px;text-align:center;">⚠ ${escapeHtml(d.disclaimer||'General info only — not a substitute for medical advice.')}</p>
      </div>
    </div>`;
}

/* ══════════════════════════════════════
   PWA INSTALL
══════════════════════════════════════ */
let _deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); _deferredInstall = e;
  const bar = document.getElementById('pwa-install-bar');
  if (bar) bar.classList.remove('hidden');
});
function installPWA() {
  if (!_deferredInstall) return;
  _deferredInstall.prompt();
  _deferredInstall.userChoice.then(choice => {
    const bar = document.getElementById('pwa-install-bar');
    if (bar) bar.classList.add('hidden');
    _deferredInstall = null;
    if (choice.outcome === 'accepted') showToast('✅ MediCompanion installed!');
  });
}
window.addEventListener('appinstalled', () => {
  const bar = document.getElementById('pwa-install-bar');
  if (bar) bar.classList.add('hidden');
  showToast('✅ App installed!');
});

/* ══════════════════════════════════════
   KEYBOARD
══════════════════════════════════════ */
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  // Apply saved theme
  initTheme();

  // Restore last tab (default: home)
  const lastTab = localStorage.getItem('mr_last_tab') || 'home';
  showTab(lastTab);

  // Set date
  const dl = document.getElementById('date-label');
  if (dl) dl.textContent = fullDateLabel();

  // Notifications
  checkNotifPermission();

  // Service worker
  if ('serviceWorker' in navigator && Notification.permission === 'granted') {
    await registerServiceWorker();
    medicines.forEach(scheduleNotification);
  }
});
