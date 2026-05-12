/* ─────────────────────────────────────────
   MediCompanion — script.js  (Full version)
   Auth + Backend medicines sync + Offline fallback
───────────────────────────────────────── */

/* ══════════════════════════════════════
   CONFIG
══════════════════════════════════════ */
const API_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : 'https://medicompanion-backend.vercel.app';

/* ══════════════════════════════════════
   STATE
══════════════════════════════════════ */
let medicines    = JSON.parse(localStorage.getItem('mr_meds')    || '[]');
let takenToday   = JSON.parse(localStorage.getItem('mr_taken_'  + todayKey()) || '[]');
let currentUser  = JSON.parse(localStorage.getItem('mr_user')   || 'null');
let authToken    = localStorage.getItem('mr_token') || null;
let selectedColor = 'green';
let symptomStep   = 0;
let symptomAnswers = [];
let currentMode   = 'guided';
let aiSearchCache = {};
let userMenuOpen  = false;

/* ══════════════════════════════════════
   UTILS
══════════════════════════════════════ */
function todayKey() { return new Date().toISOString().slice(0, 10); }
function saveMedsLocal()  { localStorage.setItem('mr_meds',  JSON.stringify(medicines)); }
function saveTakenLocal() { localStorage.setItem('mr_taken_' + todayKey(), JSON.stringify(takenToday)); }
function saveUser(user, token) {
  currentUser = user; authToken = token;
  localStorage.setItem('mr_user',  JSON.stringify(user));
  localStorage.setItem('mr_token', token || '');
}
function clearUser() {
  currentUser = null; authToken = null;
  localStorage.removeItem('mr_user');
  localStorage.removeItem('mr_token');
}
function isLoggedIn() { return !!authToken && !!currentUser; }
function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` };
}
function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}
function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
function initials(name) {
  if (!name) return '?';
  return name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/* ══════════════════════════════════════
   THEME
══════════════════════════════════════ */
function initTheme() {
  applyTheme(localStorage.getItem('mr_theme') || 'dark');
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('mr_theme', theme);
  const label = document.getElementById('theme-label');
  if (label) label.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
}
function toggleTheme() {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

/* ══════════════════════════════════════
   TAB NAVIGATION
══════════════════════════════════════ */
function showTab(tab) {
  document.querySelectorAll('.tab-page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-btn, .bnav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.remove('hidden');
  const topBtn = document.getElementById('nav-' + tab);
  const botBtn = document.getElementById('bnav-' + tab);
  if (topBtn) topBtn.classList.add('active');
  if (botBtn) botBtn.classList.add('active');
  localStorage.setItem('mr_last_tab', tab);
  closeUserMenu();
  if (tab === 'home')      renderHome();
  if (tab === 'reminders') renderMedicines();
  if (tab === 'symptom')   { initSymptom(); switchMode(currentMode); }
}

/* ══════════════════════════════════════
   USER MENU
══════════════════════════════════════ */
function updateUserUI() {
  const avatar  = document.getElementById('user-avatar');
  const btn     = document.getElementById('user-btn');
  const name    = document.getElementById('user-menu-name');
  const email   = document.getElementById('user-menu-email');
  const authBtn = document.getElementById('user-menu-auth-btn');
  const syncDiv = document.getElementById('user-menu-sync-div');
  const syncBtn = document.getElementById('user-menu-sync');

  if (isLoggedIn()) {
    if (avatar)  { avatar.textContent = initials(currentUser.name); }
    if (btn)     btn.classList.add('logged-in');
    if (name)    name.textContent  = currentUser.name  || 'User';
    if (email)   email.textContent = currentUser.email || '';
    if (authBtn) { authBtn.textContent = 'Sign out'; authBtn.classList.add('signout'); }
    if (syncDiv) syncDiv.style.display = 'block';
    if (syncBtn) syncBtn.style.display = 'block';
  } else {
    if (avatar)  avatar.textContent = '?';
    if (btn)     btn.classList.remove('logged-in');
    if (name)    name.textContent  = 'Guest';
    if (email)   email.textContent = 'Not signed in';
    if (authBtn) { authBtn.textContent = 'Sign in / Create account'; authBtn.classList.remove('signout'); }
    if (syncDiv) syncDiv.style.display = 'none';
    if (syncBtn) syncBtn.style.display = 'none';
  }
}

function toggleUserMenu() {
  const menu = document.getElementById('user-menu');
  if (!menu) return;
  userMenuOpen = !userMenuOpen;
  menu.classList.toggle('hidden', !userMenuOpen);
}
function closeUserMenu() {
  userMenuOpen = false;
  const menu = document.getElementById('user-menu');
  if (menu) menu.classList.add('hidden');
}
function handleAuthMenuClick() {
  closeUserMenu();
  if (isLoggedIn()) doLogout();
  else openAuthModal('login');
}

document.addEventListener('click', e => {
  if (userMenuOpen && !e.target.closest('#user-btn') && !e.target.closest('#user-menu')) {
    closeUserMenu();
  }
});

/* ══════════════════════════════════════
   AUTH MODAL
══════════════════════════════════════ */
function openAuthModal(tab = 'login') {
  document.getElementById('auth-modal').classList.remove('hidden');
  switchAuthTab(tab);
  setTimeout(() => {
    const el = tab === 'login'
      ? document.getElementById('auth-email')
      : document.getElementById('auth-name');
    if (el) el.focus();
  }, 100);
}
function closeAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
  clearAuthErrors();
}
function closeAuthOnBg(e) {
  if (e.target.id === 'auth-modal') closeAuthModal();
}
function switchAuthTab(tab) {
  document.getElementById('auth-login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('auth-signup-form').classList.toggle('hidden', tab !== 'signup');
  document.getElementById('auth-tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('auth-tab-signup').classList.toggle('active', tab === 'signup');
  clearAuthErrors();
}
function clearAuthErrors() {
  ['auth-login-error','auth-signup-error'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.classList.add('hidden'); }
  });
}
function showAuthError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}
function setAuthLoading(form, loading) {
  const btn  = document.getElementById(`auth-${form}-btn`);
  const text = document.getElementById(`auth-${form}-text`);
  const spin = document.getElementById(`auth-${form}-spin`);
  if (btn)  btn.disabled = loading;
  if (text) text.style.opacity = loading ? '0.5' : '1';
  if (spin) spin.classList.toggle('hidden', !loading);
}
function togglePw(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

/* ── LOGIN ── */
async function doLogin() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) { showAuthError('auth-login-error','Please fill in all fields.'); return; }

  setAuthLoading('login', true);
  try {
    const resp = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await resp.json();
    if (!resp.ok) { showAuthError('auth-login-error', data.error || 'Login failed.'); return; }

    saveUser(data.user, data.session?.access_token);
    closeAuthModal();
    updateUserUI();
    showToast(`👋 Welcome back, ${data.user.name || 'there'}!`);
    // Load medicines from backend after login
    await loadMedicinesFromBackend();
    renderHome(); renderMedicines();
  } catch(err) {
    showAuthError('auth-login-error', 'Connection error. Check your internet.');
  } finally {
    setAuthLoading('login', false);
  }
}

/* ── SIGNUP ── */
async function doSignup() {
  const name     = document.getElementById('auth-name').value.trim();
  const email    = document.getElementById('auth-signup-email').value.trim();
  const password = document.getElementById('auth-signup-password').value;
  if (!name || !email || !password) { showAuthError('auth-signup-error','Please fill in all fields.'); return; }
  if (password.length < 6) { showAuthError('auth-signup-error','Password must be at least 6 characters.'); return; }

  setAuthLoading('signup', true);
  try {
    const resp = await fetch(`${API_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await resp.json();
    if (!resp.ok) { showAuthError('auth-signup-error', data.error || 'Signup failed.'); return; }

    saveUser(data.user, data.session?.access_token);
    closeAuthModal();
    updateUserUI();
    showToast(`🎉 Welcome to MediCompanion, ${data.user.name}!`);
    // Push any local medicines to backend
    await pushLocalMedicines();
    renderHome(); renderMedicines();
  } catch(err) {
    showAuthError('auth-signup-error', 'Connection error. Check your internet.');
  } finally {
    setAuthLoading('signup', false);
  }
}

/* ── LOGOUT ── */
async function doLogout() {
  if (authToken) {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST', headers: authHeaders()
      });
    } catch(e) {}
  }
  clearUser();
  // Keep local medicines so app still works offline
  updateUserUI();
  showToast('Signed out. Your data is still saved locally.');
  renderHome(); renderMedicines();
}

/* ══════════════════════════════════════
   BACKEND MEDICINE SYNC
══════════════════════════════════════ */

/* Load all medicines from backend (replaces local) */
async function loadMedicinesFromBackend() {
  if (!isLoggedIn()) return;
  try {
    const [medsResp, takenResp] = await Promise.all([
      fetch(`${API_URL}/api/medicines`, { headers: authHeaders() }),
      fetch(`${API_URL}/api/medicines/taken`, { headers: authHeaders() })
    ]);
    if (!medsResp.ok) return;
    const medsData  = await medsResp.json();
    const takenData = takenResp.ok ? await takenResp.json() : { taken: [] };
    medicines  = medsData.medicines || [];
    takenToday = takenData.taken    || [];
    saveMedsLocal(); saveTakenLocal();
  } catch(e) {
    console.warn('Could not load from backend:', e.message);
  }
}

/* Push locally-stored medicines to backend (called after signup) */
async function pushLocalMedicines() {
  if (!isLoggedIn() || medicines.length === 0) return;
  try {
    for (const med of medicines) {
      await fetch(`${API_URL}/api/medicines`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name: med.name, dose: med.dose, time: med.time, freq: med.freq, color: med.color })
      });
    }
    // Reload from backend to get proper UUIDs
    await loadMedicinesFromBackend();
    showToast(`☁️ ${medicines.length} medicine${medicines.length > 1 ? 's' : ''} synced to your account!`);
  } catch(e) {
    console.warn('Push local medicines failed:', e.message);
  }
}

/* Manual sync from menu */
async function syncAll() {
  closeUserMenu();
  showToast('🔄 Syncing...');
  await loadMedicinesFromBackend();
  renderMedicines(); renderHome();
  showToast('✅ Synced!');
}

/* ══════════════════════════════════════
   HOME TAB
══════════════════════════════════════ */
function renderHome() {
  const helloEl = document.getElementById('home-hello');
  if (helloEl) helloEl.textContent = greet() + (currentUser ? `, ${currentUser.name.split(' ')[0]}` : '');

  const taken   = medicines.filter(m => takenToday.includes(m.id)).length;
  const pending = medicines.length - taken;
  const setEl   = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('hstat-total',   medicines.length);
  setEl('hstat-taken',   taken);
  setEl('hstat-pending', pending);

  // Feature cards — first visit only
  const featGrid  = document.getElementById('home-feat-grid');
  const featLabel = document.getElementById('home-feat-label');
  const dismissEl = document.getElementById('onboard-dismiss');
  const isOnboarded = localStorage.getItem('mr_onboarded');
  if (!isOnboarded) {
    if (featGrid)  featGrid.style.display  = 'grid';
    if (featLabel) featLabel.style.display = 'block';
    if (dismissEl) dismissEl.style.display = 'flex';
  } else {
    if (featGrid)  featGrid.style.display  = 'none';
    if (featLabel) featLabel.style.display = 'none';
    if (dismissEl) dismissEl.style.display = 'none';
  }
  if (medicines.length > 0 && !isOnboarded) localStorage.setItem('mr_onboarded','1');

  // Next medicine
  const nextEl = document.getElementById('home-next');
  if (!nextEl) return;
  const nowMin  = new Date().getHours() * 60 + new Date().getMinutes();
  const upcoming = medicines
    .filter(m => !takenToday.includes(m.id))
    .map(m => { const [h,mn] = m.time.split(':').map(Number); return {...m, mins: h*60+mn}; })
    .filter(m => m.mins >= nowMin)
    .sort((a,b) => a.mins - b.mins);

  if (upcoming.length === 0) {
    if (medicines.length === 0) {
      nextEl.innerHTML = `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px 22px;display:flex;align-items:center;gap:14px;">
          <span style="font-size:28px">💊</span>
          <div><p style="font-size:14px;font-weight:500;color:var(--text-1);">No medicines yet</p>
          <p style="font-size:12px;color:var(--text-3);">Add your first medicine reminder</p></div>
          <button onclick="showTab('reminders');openModal()" style="margin-left:auto;background:var(--green);color:#fff;border:none;padding:8px 14px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;">+ Add</button>
        </div>`;
    } else {
      nextEl.innerHTML = `
        <div style="background:var(--green-l);border:1px solid rgba(26,158,114,0.2);border-radius:14px;padding:18px 22px;display:flex;align-items:center;gap:12px;">
          <span style="font-size:26px">🎉</span>
          <div><p style="font-size:14px;font-weight:600;color:var(--green);">All done for today!</p>
          <p style="font-size:12px;color:var(--text-3);">You've taken all your medicines. Great job!</p></div>
        </div>`;
    }
    return;
  }
  const next = upcoming[0];
  nextEl.innerHTML = `
    <div class="next-card">
      <div class="next-card-icon">💊</div>
      <div><p class="next-card-label">Up next</p>
        <p class="next-card-name">${escapeHtml(next.name)}</p>
        <p class="next-card-time">${formatTime(next.time)}${next.dose ? ' · ' + escapeHtml(next.dose) : ''}</p>
      </div>
      <button class="next-card-btn" onclick="showTab('reminders')">View all →</button>
    </div>`;
}

/* ══════════════════════════════════════
   ONBOARDING DISMISS
══════════════════════════════════════ */
function dismissOnboarding() {
  localStorage.setItem('mr_onboarded','1');
  ['home-feat-grid','home-feat-label','onboard-dismiss'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  showToast('✅ Got it! Feature guide hidden.');
}

/* ══════════════════════════════════════
   MEDICINE CRUD (backend + local fallback)
══════════════════════════════════════ */
function openModal() {
  selectedColor = 'green';
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
  const gd = document.querySelector('.color-dot[data-color="green"]');
  if (gd) gd.classList.add('selected');
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

async function addMedicine() {
  const name = document.getElementById('med-name').value.trim();
  const dose = document.getElementById('med-dose').value.trim();
  const time = document.getElementById('med-time').value;
  const freq = document.getElementById('med-freq').value;
  if (!name) { highlight('med-name'); return; }
  if (!time) { highlight('med-time'); return; }

  const medData = { name, dose, time, freq, color: selectedColor };

  if (isLoggedIn()) {
    // Save to backend
    try {
      const resp = await fetch(`${API_URL}/api/medicines`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify(medData)
      });
      const data = await resp.json();
      if (!resp.ok) { showToast('❌ Failed to add: ' + (data.error || 'error')); return; }
      medicines.push(data.medicine);
      saveMedsLocal();
    } catch(e) {
      // Offline fallback
      const med = { id: Date.now().toString(), ...medData, createdAt: new Date().toISOString() };
      medicines.push(med); saveMedsLocal();
    }
  } else {
    // Not logged in — save locally only
    const med = { id: Date.now().toString(), ...medData, createdAt: new Date().toISOString() };
    medicines.push(med); saveMedsLocal();
  }

  scheduleNotification(medicines[medicines.length-1]);
  closeModal(); renderMedicines(); renderHome();
  showToast('✅ ' + name + ' added!');
}

function highlight(id) {
  const el = document.getElementById(id);
  el.style.borderColor = '#e24b4a'; el.focus();
  setTimeout(() => el.style.borderColor = '', 1500);
}

async function deleteMedicine(id) {
  if (isLoggedIn()) {
    try {
      await fetch(`${API_URL}/api/medicines/${id}`, { method:'DELETE', headers: authHeaders() });
    } catch(e) {}
  }
  medicines  = medicines.filter(m => m.id !== id);
  takenToday = takenToday.filter(t => t !== id);
  saveMedsLocal(); saveTakenLocal();
  renderMedicines(); renderHome();
  showToast('🗑 Removed');
}

async function toggleTaken(id) {
  const wasTaken = takenToday.includes(id);
  if (isLoggedIn()) {
    try {
      const method = wasTaken ? 'DELETE' : 'POST';
      await fetch(`${API_URL}/api/medicines/taken/${id}`, { method, headers: authHeaders() });
    } catch(e) {}
  }
  if (wasTaken) takenToday = takenToday.filter(t => t !== id);
  else takenToday.push(id);
  saveTakenLocal(); renderMedicines(); renderHome();
}

/* ══════════════════════════════════════
   RENDER MEDICINES + TIMELINE
══════════════════════════════════════ */
function renderMedicines() {
  const dateEl = document.getElementById('date-label');
  if (dateEl) dateEl.textContent = fullDateLabel();
  const list  = document.getElementById('medicine-list');
  const empty = document.getElementById('empty-state');
  const tlSec = document.getElementById('timeline-section');
  const lHead = document.getElementById('list-heading');
  if (!list) return;
  const taken = medicines.filter(m => takenToday.includes(m.id)).length;
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('stat-total',   medicines.length);
  setEl('stat-taken',   taken);
  setEl('stat-pending', medicines.length - taken);
  if (medicines.length === 0) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    if (tlSec) tlSec.style.display = 'none';
    if (lHead) lHead.style.display = 'none';
    return;
  }
  if (empty) empty.style.display = 'none';
  if (tlSec) tlSec.style.display = 'block';
  if (lHead) lHead.style.display = 'block';
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const sorted = [...medicines].sort((a,b) => a.time.localeCompare(b.time));
  const tlEl   = document.getElementById('timeline');
  if (tlEl) {
    tlEl.innerHTML = sorted.map(med => {
      const [h,m]    = med.time.split(':').map(Number);
      const medMin   = h*60+m;
      const isTaken  = takenToday.includes(med.id);
      const isOver   = !isTaken && medMin < nowMin;
      const isSoon   = !isTaken && medMin >= nowMin && medMin - nowMin <= 60;
      const dotCls   = isTaken ? 'taken' : isOver ? 'overdue' : '';
      const badgeCls = isTaken ? 'taken' : isOver ? 'overdue' : isSoon ? 'upcoming' : 'pending';
      const badgeTxt = isTaken ? '✓ Taken' : isOver ? 'Missed' : isSoon ? 'Soon' : 'Pending';
      const dotStyle = isTaken ? `background:${colorHex(med.color||'green')};box-shadow:0 0 0 1.5px ${colorHex(med.color||'green')}` : isOver ? 'background:#e24b4a;box-shadow:0 0 0 1.5px #e24b4a' : '';
      return `<div class="tl-item">
        <div class="tl-dot ${dotCls}" style="${dotStyle}"></div>
        <span class="tl-time">${formatTime(med.time)}</span>
        <div><p class="tl-name">${escapeHtml(med.name)}</p>${med.dose?`<p class="tl-dose">${escapeHtml(med.dose)}</p>`:''}</div>
        <span class="tl-badge ${badgeCls}">${badgeTxt}</span>
      </div>`;
    }).join('');
  }
  list.innerHTML = sorted.map((med,i) => {
    const isTaken = takenToday.includes(med.id);
    const color   = med.color || 'green';
    return `<div class="med-item color-${color} ${isTaken?'taken':''}" style="animation-delay:${i*0.04}s">
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
        <button class="btn-check ${isTaken?'checked':''}" onclick="toggleTaken('${med.id}')">${isTaken?'✓':''}</button>
        <button class="btn-del" onclick="deleteMedicine('${med.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════
   NOTIFICATIONS
══════════════════════════════════════ */
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try { window._swReg = await navigator.serviceWorker.register('./sw.js'); }
  catch(e) { console.warn('SW:', e.message); }
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
  const [h,m] = med.time.split(':').map(Number);
  const target = new Date(); target.setHours(h,m,0,0);
  if (target <= new Date()) target.setDate(target.getDate()+1);
  const delay = target - new Date();
  const title  = '💊 Time for ' + med.name;
  const body   = med.dose || 'Tap to mark as taken';
  if (window._swReg?.active) {
    window._swReg.active.postMessage({ type:'SCHEDULE', title, body, tag:'med-'+med.id, delay });
  } else {
    setTimeout(() => new Notification(title, { body, icon:'./icons/icon-192.png', requireInteraction:true }), delay);
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
    background:'var(--bg2)', color:'var(--text-1)', border:'1px solid var(--border2)',
    padding:'10px 22px', borderRadius:'12px', fontSize:'13px', zIndex:'9999',
    boxShadow:'var(--shadow-lg)', whiteSpace:'nowrap', fontFamily:'var(--font-sans)'
  });
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/* ══════════════════════════════════════
   GUIDED SYMPTOM CHECKER
══════════════════════════════════════ */
const questions = [
  { q:'What is your main symptom right now?', options:['Fever / high temperature','Headache or body ache','Cough or cold','Stomach pain or nausea','Chest pain or difficulty breathing'] },
  { q:'How long have you had this symptom?', options:['Less than 24 hours','1–3 days','4–7 days','More than a week'] },
  { q:'How severe is it?', options:['Mild — I can go about my day','Moderate — it is affecting my day','Severe — I can barely function'] },
  { q:'Any additional symptoms?', options:['None of the below','High fever above 103°F','Shortness of breath or chest tightness','Confusion or difficulty staying awake'] },
  { q:'Any pre-existing conditions?', options:['No, I am generally healthy','Yes — diabetes, heart disease, or asthma','Yes — pregnant or elderly (65+)','Not sure'] }
];
function getGuidedResult(a) {
  let s=0;
  if(a[0]===4)s+=3;else if(a[0]===0)s+=1;
  if(a[1]===3)s+=2;else if(a[1]===2)s+=1;
  s+=(a[2]||0);
  if(a[3]===3)s+=4;else if(a[3]===2)s+=3;else if(a[3]===1)s+=2;
  if(a[4]===2)s+=2;else if(a[4]===1)s+=2;
  if(s>=6) return {level:'high',icon:'🏥',label:'Seek medical attention',title:'Please see a doctor soon',desc:'Based on your symptoms, consult a healthcare professional as soon as possible.',tips:'• Call your doctor or visit a clinic today\n• Do not self-medicate\n• Chest pain / breathing difficulty → emergency\n• Keep someone with you if worsening'};
  if(s>=3) return {level:'mid',icon:'🌡️',label:'Monitor closely',title:'Rest and monitor your symptoms',desc:'Your symptoms may not be an emergency, but keep a close eye for 24–48 hours.',tips:'• Rest and stay hydrated (water, ORS)\n• Paracetamol for fever or pain\n• See a doctor if symptoms worsen or no improvement in 2 days'};
  return {level:'low',icon:'😊',label:'Manageable at home',title:'You can manage this at home',desc:'Based on your answers, symptoms seem mild and manageable with rest.',tips:'• Get plenty of rest\n• Stay hydrated\n• Eat light meals\n• Consult a doctor if no improvement in 3 days'};
}
function initSymptom() {
  symptomStep=0; symptomAnswers=[];
  ['result-card'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.add('hidden');});
  ['symptom-card','btn-next'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('hidden');});
  const br=document.getElementById('btn-restart');if(br)br.classList.add('hidden');
  const bb=document.getElementById('btn-back');if(bb)bb.style.display='none';
  renderQuestion();
}
function renderQuestion() {
  const q=questions[symptomStep]; const sel=symptomAnswers[symptomStep];
  document.querySelectorAll('.step-dot').forEach((d,i)=>{d.classList.remove('active','done');if(i<symptomStep)d.classList.add('done');if(i===symptomStep)d.classList.add('active');});
  const sc=document.getElementById('symptom-card');
  if(sc)sc.innerHTML=`<p class="symptom-q">${q.q}</p><div class="symptom-options">${q.options.map((opt,i)=>`<button class="opt-btn ${sel===i?'selected':''}" onclick="selectOption(${i})"><span class="opt-check">${sel===i?'✓':''}</span>${escapeHtml(opt)}</button>`).join('')}</div>`;
  const bb=document.getElementById('btn-back');if(bb)bb.style.display=symptomStep>0?'block':'none';
}
function selectOption(i){symptomAnswers[symptomStep]=i;renderQuestion();}
function symptomNext(){
  if(symptomAnswers[symptomStep]===undefined){showToast('Please select an option');return;}
  if(symptomStep<questions.length-1){symptomStep++;renderQuestion();}else showGuidedResult();
}
function symptomBack(){if(symptomStep>0){symptomStep--;renderQuestion();}}
function showGuidedResult(){
  const result=getGuidedResult(symptomAnswers);
  ['symptom-card','btn-next'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.add('hidden');});
  const bb=document.getElementById('btn-back');if(bb)bb.style.display='none';
  const br=document.getElementById('btn-restart');if(br)br.classList.remove('hidden');
  document.querySelectorAll('.step-dot').forEach(d=>{d.classList.remove('active');d.classList.add('done');});
  const rc=document.getElementById('result-card');
  if(rc){
    rc.className=`result-card result-${result.level}`;
    rc.innerHTML=`<div class="result-icon">${result.icon}</div><p class="result-level">${result.label}</p><h3 class="result-title">${result.title}</h3><p class="result-desc">${result.desc}</p><div class="result-tips"><p>${result.tips.replace(/\n/g,'<br>')}</p></div><p style="font-size:11px;color:var(--text-3);margin-top:14px;">⚠ Not a medical diagnosis. Always consult a qualified doctor.</p>`;
    rc.classList.remove('hidden');
  }
}
function restartSymptom(){initSymptom();}

/* ══════════════════════════════════════
   MODE SWITCHER
══════════════════════════════════════ */
function switchMode(mode) {
  currentMode=mode;
  ['guided','search'].forEach(m=>{
    const el=document.getElementById(m+'-mode');const btn=document.getElementById('mode-'+m+'-btn');
    if(el)el.classList.toggle('hidden',mode!==m);
    if(btn)btn.classList.toggle('active',mode===m);
  });
  if(mode==='guided')initSymptom();
}

/* ══════════════════════════════════════
   DISEASE SEARCH (offline DB → backend AI)
══════════════════════════════════════ */
let searchTimeout=null;
function onSymptomSearch(val) {
  const clr=document.getElementById('search-clear');
  if(clr)clr.style.display=val?'flex':'none';
  clearTimeout(searchTimeout);
  if(!val.trim()){const a=document.getElementById('search-result-area');if(a)a.innerHTML='';return;}
  searchTimeout=setTimeout(()=>askAI(val.trim()),500);
}
function searchFor(term){
  const inp=document.getElementById('symptom-search-input');const clr=document.getElementById('search-clear');
  if(inp)inp.value=term;if(clr)clr.style.display='flex';askAI(term);
}
function clearSearch(){
  const inp=document.getElementById('symptom-search-input');const clr=document.getElementById('search-clear');const a=document.getElementById('search-result-area');
  if(inp)inp.value='';if(clr)clr.style.display='none';if(a)a.innerHTML='';
}
async function askAI(query) {
  const area=document.getElementById('search-result-area');if(!area)return;
  // 1. Offline DB
  const offline=searchOfflineDB(query);
  if(offline){aiSearchCache[query.toLowerCase()]=offline;renderAICard(offline,area,false);return;}
  // 2. Cache
  if(aiSearchCache[query.toLowerCase()]){renderAICard(aiSearchCache[query.toLowerCase()],area,true);return;}
  // 3. No internet
  if(!navigator.onLine){area.innerHTML=`<div class="no-result-box"><p style="font-size:26px;margin-bottom:10px">📡</p><p><strong>No internet</strong></p><p style="margin-top:6px">"${escapeHtml(query)}" not in offline database. Connect to search more.</p></div>`;return;}
  // 4. Call backend AI proxy
  area.innerHTML=`<div class="ai-loading"><div class="ai-spinner"></div><p>Searching for <strong>"${escapeHtml(query)}"</strong>…</p></div>`;
  try {
    const resp=await fetch(`${API_URL}/api/search`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query})});
    if(!resp.ok)throw new Error('HTTP '+resp.status);
    const data=await resp.json();
    if(data.result===null){area.innerHTML=`<div class="no-result-box"><p style="font-size:26px;margin-bottom:10px">🩺</p><p><strong>Not a health topic</strong></p><p style="margin-top:6px">${escapeHtml(data.message||'Please search for a health-related topic.')}</p></div>`;return;}
    aiSearchCache[query.toLowerCase()]=data.result;
    renderAICard(data.result,area,data.source==='ai');
  } catch(err) {
    area.innerHTML=`<div class="no-result-box"><p style="font-size:26px;margin-bottom:10px">⚠️</p><p><strong>Search unavailable</strong></p><p style="margin-top:6px;color:var(--text-3)">Check your connection and try again.</p><button onclick="askAI('${escapeHtml(query)}')" style="margin-top:14px;padding:7px 16px;border-radius:9px;border:1px solid var(--border2);background:none;cursor:pointer;font-size:13px;color:var(--text-1);font-family:var(--font-sans);">🔄 Retry</button></div>`;
  }
}
function renderAICard(d,area,isAI=false){
  const typeLabel={common:'Common condition',chronic:'Chronic disease',infectious:'Infectious disease',lifestyle:'Lifestyle condition',mental:'Mental health',emergency:'Emergency'}[d.type]||d.type;
  const urg={low:{cls:'urgency-low',icon:'✅',text:'Low urgency — manageable at home'},medium:{cls:'urgency-medium',icon:'⚠️',text:'Moderate urgency — monitor closely'},high:{cls:'urgency-high',icon:'🏥',text:'High urgency — see a doctor soon'}}[d.urgency]||{cls:'urgency-medium',icon:'⚠️',text:'Monitor and consult if worsening'};
  area.innerHTML=`<div class="disease-card"><div class="disease-header"><span class="disease-emoji">${d.emoji||'🩺'}</span><div><p class="disease-name">${escapeHtml(d.name)}</p><span class="disease-type type-${d.type}">${typeLabel}</span>${isAI?'<span class="ai-badge">✨ AI</span>':'<span class="offline-badge">📦 Offline</span>'}</div></div><div class="disease-body"><p class="disease-desc">${escapeHtml(d.description)}</p><p class="disease-section-title">Symptoms</p><div class="tag-list">${(d.symptoms||[]).map(s=>`<span class="tag">${escapeHtml(s)}</span>`).join('')}</div><p class="disease-section-title">Causes</p><div class="tag-list">${(d.causes||[]).map(c=>`<span class="tag">${escapeHtml(c)}</span>`).join('')}</div><p class="disease-section-title">Home care</p><p class="disease-desc">${(d.homecare||[]).map(h=>'• '+h).join('<br>')}</p><p class="disease-section-title">When to see a doctor</p><p class="disease-desc">${escapeHtml(d.whenToSeeDoctor)}</p><div class="urgency-box ${urg.cls}">${urg.icon} ${urg.text}</div><p style="font-size:11px;color:var(--text-3);margin-top:12px;text-align:center;">⚠ ${escapeHtml(d.disclaimer||'General info only.')}</p></div></div>`;
}

/* ══════════════════════════════════════
   PWA INSTALL
══════════════════════════════════════ */
let _deferredInstall=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();_deferredInstall=e;const bar=document.getElementById('pwa-install-bar');if(bar)bar.classList.remove('hidden');});
function installPWA(){if(!_deferredInstall)return;_deferredInstall.prompt();_deferredInstall.userChoice.then(c=>{const bar=document.getElementById('pwa-install-bar');if(bar)bar.classList.add('hidden');_deferredInstall=null;if(c.outcome==='accepted')showToast('✅ MediCompanion installed!');});}
window.addEventListener('appinstalled',()=>{const bar=document.getElementById('pwa-install-bar');if(bar)bar.classList.add('hidden');showToast('✅ App installed!');});

/* ══════════════════════════════════════
   KEYBOARD
══════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeAuthModal(); closeUserMenu(); }
});

/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  updateUserUI();

  // Restore last tab
  showTab(localStorage.getItem('mr_last_tab') || 'home');

  const dl = document.getElementById('date-label');
  if (dl) dl.textContent = fullDateLabel();

  // If logged in, load medicines from backend
  if (isLoggedIn() && navigator.onLine) {
    await loadMedicinesFromBackend();
    renderMedicines(); renderHome();
  }

  checkNotifPermission();

  if ('serviceWorker' in navigator && Notification.permission === 'granted') {
    await registerServiceWorker();
    medicines.forEach(scheduleNotification);
  }
});