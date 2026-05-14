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

// Supabase public config — used ONLY for Google OAuth redirect (anon key is safe here)
const SUPABASE_URL = 'https://cqsjcieczmwrxhxpznye.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxc2pjaWVjem13cnhoeHB6bnllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjA4NDcsImV4cCI6MjA5Mzk5Njg0N30.MZ82lg1Kg-CDqb_JQd-v3YcTsABIbwFpCxqEbvAZsig';
// NOTE: Replace SUPABASE_ANON_KEY with your real anon key from:
// Supabase Dashboard → Settings → API → anon/public key

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

/* ── GOOGLE SIGN-IN ─────────────────────────────────────────────────────── */
async function doGoogleSignIn() {
  const btn = document.getElementById('google-signin-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Redirecting to Google…'; }

  try {
    // Use Supabase JS SDK to trigger Google OAuth (redirects the page)
    const { supabase: sb } = window.supabase
      ? { supabase: window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) }
      : {};

    if (!sb) {
      // Fallback: Supabase SDK not loaded — call backend to get OAuth URL
      const resp = await fetch(`${API_URL}/api/auth/google`);
      const data = await resp.json();
      if (data.url) { window.location.href = data.url; return; }
      throw new Error('Could not start Google sign-in');
    }

    const redirectTo = window.location.origin + window.location.pathname;
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: { access_type: 'offline', prompt: 'consent' }
      }
    });
    if (error) throw error;
    // Supabase SDK handles the redirect automatically
  } catch (err) {
    console.error('Google sign-in error:', err);
    showAuthError('auth-login-error', 'Google sign-in failed. Please try email/password.');
    showAuthError('auth-signup-error', 'Google sign-in failed. Please try email/password.');
    if (btn) { btn.disabled = false; btn.innerHTML = `<svg class="google-icon" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>Continue with Google`; }
  }
}

/* ── PICKUP GOOGLE SESSION after OAuth redirect ──────────────────────────── */
async function pickupGoogleSession() {
  // After Google redirect, Supabase puts the token in the URL hash
  const hash = window.location.hash;
  if (!hash.includes('access_token')) return;

  try {
    const params = new URLSearchParams(hash.slice(1));
    const accessToken  = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken) return;

    // Clean the URL immediately so refreshing doesn't re-process the hash
    history.replaceState(null, '', window.location.pathname);

    // Get user info from our backend using the token
    const resp = await fetch(`${API_URL}/api/auth/me`, {
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` }
    });
    if (!resp.ok) throw new Error('Failed to get user info');
    const user = await resp.json();

    saveUser(user, accessToken);
    updateUserUI();
    showToast(`🎉 Welcome, ${user.name || user.email}!`);
    await loadMedicinesFromBackend();
    renderHome(); renderMedicines();
  } catch (err) {
    console.warn('Google session pickup failed:', err.message);
  }
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

  // Onboarding is handled separately — nothing to do here

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
   ONBOARDING
══════════════════════════════════════ */
function showOnboarding() {
  const scr = document.getElementById('onboarding-screen');
  if (scr) scr.classList.remove('hidden');
}

function finishOnboarding() {
  localStorage.setItem('mr_onboarded', '1');
  const scr = document.getElementById('onboarding-screen');
  if (!scr) return;
  // Animate out
  scr.classList.add('leaving');
  setTimeout(() => {
    scr.classList.add('hidden');
    scr.classList.remove('leaving');
    // Go to reminders tab so user can add first medicine
    showTab('reminders');
  }, 350);
}

// Keep old name as alias
function dismissOnboarding() { finishOnboarding(); }

/* ══════════════════════════════════════
   MEDICINE CRUD (backend + local fallback)
══════════════════════════════════════ */
/* ══════════════════════════════════════
   CUSTOM TIME PICKER
══════════════════════════════════════ */
let _ampm = 'AM';

function spinTime(field, dir) {
  const el = document.getElementById('med-' + field);
  if (!el) return;
  let val = parseInt(el.value) || 0;
  if (field === 'hour') {
    val += dir;
    if (val > 12) val = 1;
    if (val < 1)  val = 12;
  } else {
    val += dir;
    if (val > 59) val = 0;
    if (val < 0)  val = 59;
  }
  el.value = field === 'min' ? String(val).padStart(2,'0') : val;
  updateHiddenTime();
}

function setAmPm(val) {
  _ampm = val;
  document.getElementById('ampm-am').classList.toggle('active', val === 'AM');
  document.getElementById('ampm-pm').classList.toggle('active', val === 'PM');
  updateHiddenTime();
}

function updateHiddenTime() {
  const hourEl = document.getElementById('med-hour');
  const minEl  = document.getElementById('med-min');
  const hidden = document.getElementById('med-time');
  if (!hourEl || !minEl || !hidden) return;

  let h = parseInt(hourEl.value) || 12;
  const m = parseInt(minEl.value) || 0;

  // Convert 12h → 24h for storage
  if (_ampm === 'AM') {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }
  hidden.value = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function initTimePicker() {
  // Pre-fill with current time
  const now  = new Date();
  let h      = now.getHours();
  const m    = now.getMinutes();
  _ampm      = h >= 12 ? 'PM' : 'AM';
  h          = h % 12 || 12;

  const hourEl = document.getElementById('med-hour');
  const minEl  = document.getElementById('med-min');
  if (hourEl) hourEl.value = h;
  if (minEl)  minEl.value  = String(m).padStart(2,'0');
  setAmPm(_ampm);
  updateHiddenTime();

  // Allow mouse wheel scrolling on inputs
  ['med-hour','med-min'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('wheel', ev => {
      ev.preventDefault();
      spinTime(id === 'med-hour' ? 'hour' : 'min', ev.deltaY < 0 ? 1 : -1);
    }, { passive: false });
    el.addEventListener('input', updateHiddenTime);
    el.addEventListener('change', () => {
      const field = id === 'med-hour' ? 'hour' : 'min';
      let val = parseInt(el.value) || 0;
      if (field === 'hour') { if(val<1)val=1; if(val>12)val=12; }
      else                  { if(val<0)val=0; if(val>59)val=59; }
      el.value = field === 'min' ? String(val).padStart(2,'0') : val;
      updateHiddenTime();
    });
  });
}

function openModal() {
  selectedColor = 'green';
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
  const gd = document.querySelector('.color-dot[data-color="green"]');
  if (gd) gd.classList.add('selected');
  document.getElementById('modal-overlay').classList.remove('hidden');
  initTimePicker();
  setTimeout(() => document.getElementById('med-name').focus(), 100);
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  ['med-name','med-dose'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const hiddenTime = document.getElementById('med-time');
  if (hiddenTime) hiddenTime.value = '';
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

  const [h, m] = med.time.split(':').map(Number);
  const now    = new Date();
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);

  const delay      = target - now;
  const missDelay  = delay + (10 * 60 * 1000); // 10 minutes after reminder time

  const title      = '💊 Time for ' + med.name;
  const body       = med.dose ? med.dose : 'Tap to mark as taken';
  const missTitle  = '⚠️ Missed: ' + med.name;
  const missBody   = 'You missed your ' + med.name + '. Please take it as soon as possible.';

  if (window._swReg?.active) {
    // Main reminder
    window._swReg.active.postMessage({
      type: 'SCHEDULE', title, body,
      tag: 'med-' + med.id, delay
    });
    // Missed pill reminder — scheduled 10 min later
    window._swReg.active.postMessage({
      type: 'SCHEDULE_MISSED',
      title: missTitle, body: missBody,
      tag: 'missed-' + med.id,
      medId: med.id,
      delay: missDelay
    });
  } else {
    // Fallback: browser Notification API
    setTimeout(() => {
      new Notification(title, {
        body, icon: './icons/icon-192.png', requireInteraction: true
      });
    }, delay);

    // Missed pill fallback — fires 10 min later, checks if still not taken
    setTimeout(() => {
      // Re-read takenToday from localStorage at fire time (most up-to-date)
      const taken = JSON.parse(localStorage.getItem('mr_taken_' + new Date().toISOString().slice(0,10)) || '[]');
      if (!taken.includes(med.id)) {
        new Notification(missTitle, {
          body: missBody,
          icon: './icons/icon-192.png',
          requireInteraction: true,
          tag: 'missed-' + med.id
        });
      }
    }, missDelay);
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

/* ── Get similar disease names from offline DB for a partial query ── */
function getSimilarSuggestions(query) {
  const q = query.toLowerCase().trim();
  if (!q || q.length < 2) return [];

  const matches = [];
  for (const d of DISEASE_DB) {
    let matched = false;
    // Match disease name
    if (d.name.toLowerCase().includes(q)) {
      matches.push({ name: d.name, emoji: d.emoji }); matched = true;
    }
    // Match aliases
    if (!matched) {
      for (const alias of d.aliases) {
        if (alias.includes(q) || q.includes(alias.slice(0, Math.min(alias.length, q.length)))) {
          matches.push({ name: d.name, emoji: d.emoji }); break;
        }
      }
    }
    if (matches.length >= 5) break; // max 5 suggestions
  }
  return matches;
}

/* ── Update suggestion pills dynamically ── */
function updateSuggestions(val) {
  const defaultEl  = document.getElementById('sugg-default');
  const similarEl  = document.getElementById('sugg-similar');
  const labelEl    = document.getElementById('sugg-label');

  if (!val || val.trim().length < 2) {
    // Show default pills
    if (defaultEl)  defaultEl.style.display = '';
    if (similarEl)  similarEl.style.display = 'none';
    if (labelEl)    labelEl.textContent = 'Try:';
    return;
  }

  const suggestions = getSimilarSuggestions(val.trim());

  if (suggestions.length === 0) {
    // No matches — hide suggestions, keep label
    if (defaultEl) defaultEl.style.display = 'none';
    if (similarEl) similarEl.style.display = 'none';
    if (labelEl)   labelEl.textContent = 'No similar results in offline database';
    return;
  }

  // Show similar matches
  if (defaultEl) defaultEl.style.display = 'none';
  if (labelEl)   labelEl.textContent = 'Similar:';
  if (similarEl) {
    similarEl.style.display = '';
    similarEl.innerHTML = suggestions
      .map(s => `<button class="sugg-pill sugg-pill-similar" onclick="searchFor('${escapeHtml(s.name.toLowerCase())}')">${s.emoji} ${escapeHtml(s.name)}</button>`)
      .join('');
  }
}

function onSymptomSearch(val) {
  const clr = document.getElementById('search-clear');
  if (clr) clr.style.display = val ? 'flex' : 'none';

  // Update suggestions immediately (no delay — instant feedback)
  updateSuggestions(val);

  clearTimeout(searchTimeout);
  if (!val.trim()) {
    const a = document.getElementById('search-result-area');
    if (a) a.innerHTML = '';
    return;
  }
  searchTimeout = setTimeout(() => askAI(val.trim()), 600);
}
function searchFor(term){
  const inp=document.getElementById('symptom-search-input');const clr=document.getElementById('search-clear');
  if(inp)inp.value=term;if(clr)clr.style.display='flex';askAI(term);
}
function clearSearch(){
  const inp = document.getElementById('symptom-search-input');
  const clr = document.getElementById('search-clear');
  const a   = document.getElementById('search-result-area');
  if (inp) inp.value = '';
  if (clr) clr.style.display = 'none';
  if (a)   a.innerHTML = '';
  updateSuggestions(''); // Reset to default pills
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
   SERVICE WORKER MESSAGE LISTENER
   Handles CHECK_TAKEN and MARK_TAKEN
   messages from the service worker
══════════════════════════════════════ */
navigator.serviceWorker?.addEventListener('message', async e => {
  if (!e.data) return;

  /* SW asks: was this medicine taken today? */
  if (e.data.type === 'CHECK_TAKEN') {
    const today = todayKey();
    const taken = JSON.parse(localStorage.getItem('mr_taken_' + today) || '[]');
    e.ports?.[0]?.postMessage({ taken: taken.includes(e.data.medId) });
  }

  /* SW says: mark this medicine as taken (user tapped action button) */
  if (e.data.type === 'MARK_TAKEN') {
    const { medId } = e.data;
    if (!takenToday.includes(medId)) {
      takenToday.push(medId);
      saveTakenLocal();
      // Also sync to backend if logged in
      if (isLoggedIn()) {
        try {
          await fetch(`${API_URL}/api/medicines/taken/${medId}`, {
            method: 'POST', headers: authHeaders()
          });
        } catch(_) {}
      }
      renderMedicines();
      renderHome();
    }
  }
});

/* Process any pending offline actions stored by SW when app was closed */
async function processPendingActions() {
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('mc_pending', 1);
      req.onupgradeneeded = ev => ev.target.result.createObjectStore('actions', { autoIncrement: true });
      req.onsuccess  = ev => resolve(ev.target.result);
      req.onerror    = () => reject();
    });
    const tx      = db.transaction('actions', 'readwrite');
    const store   = tx.objectStore('actions');
    const allKeys = await new Promise(r => { const req = store.getAllKeys(); req.onsuccess = () => r(req.result); });
    const allVals = await new Promise(r => { const req = store.getAll();    req.onsuccess = () => r(req.result); });

    for (let i = 0; i < allVals.length; i++) {
      const { action, medId, date } = allVals[i];
      if (action === 'MARK_TAKEN' && date === todayKey()) {
        if (!takenToday.includes(medId)) {
          takenToday.push(medId);
          saveTakenLocal();
          if (isLoggedIn()) {
            try { await fetch(`${API_URL}/api/medicines/taken/${medId}`, { method:'POST', headers: authHeaders() }); } catch(_) {}
          }
        }
      }
      // Delete processed action
      store.delete(allKeys[i]);
    }
    if (allVals.length > 0) { renderMedicines(); renderHome(); }
  } catch(_) {}
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

  const dl = document.getElementById('date-label');
  if (dl) dl.textContent = fullDateLabel();

  // Pick up Google OAuth session if redirected back from Google
  await pickupGoogleSession();

  // First visit — show onboarding screen instead of app
  if (!localStorage.getItem('mr_onboarded')) {
    showOnboarding();
  } else {
    // Returning user — restore last tab
    showTab(localStorage.getItem('mr_last_tab') || 'home');
  }

  // If logged in, load medicines from backend
  if (isLoggedIn() && navigator.onLine) {
    await loadMedicinesFromBackend();
    renderMedicines(); renderHome();
  }

  processPendingActions();
  checkNotifPermission();

  if ('serviceWorker' in navigator && Notification.permission === 'granted') {
    await registerServiceWorker();
    medicines.forEach(scheduleNotification);
  }
});