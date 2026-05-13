/* ─────────────────────────────────────────
   MediCompanion — sw.js
   Service Worker v3
   - Offline caching
   - Medicine reminders
   - Missed pill reminders (fires if not taken after 10 min)
   - Mark taken + Snooze actions (fully working)
───────────────────────────────────────── */

const CACHE_NAME = 'medicompanion-v3';

/* ── INSTALL ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll([
        './index.html', './style.css', './script.js',
        './diseases.js', './manifest.json',
        './icons/icon-192.png', './icons/icon-512.png'
      ]).then(() =>
        cache.add('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Fraunces:ital,wght@0,300;0,500;1,300&display=swap')
          .catch(() => {})
      )
    ).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ── FETCH: cache-first ── */
self.addEventListener('fetch', e => {
  if (e.request.url.includes('generativelanguage.googleapis.com') ||
      e.request.url.includes('supabase.co') ||
      e.request.url.includes('vercel.app')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (e.request.method === 'GET' && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        if (e.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});

/* ── SCHEDULE HELPERS ── */

// Store scheduled timer IDs so we can cancel snooze if taken
const timers = {};

function showReminder({ title, body, tag, medId, actions }) {
  return self.registration.showNotification(title, {
    body,
    icon:             './icons/icon-192.png',
    badge:            './icons/icon-192.png',
    tag,
    requireInteraction: true,
    data:             { medId },
    actions:          actions || [
      { action: 'taken', title: '✓ Mark taken' },
      { action: 'snooze', title: '⏰ Snooze 10 min' }
    ]
  });
}

async function isMedicineTaken(medId) {
  // Ask any open page via MessageChannel
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (clientList.length === 0) return false;
  try {
    return await new Promise((resolve, reject) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = ev => resolve(ev.data?.taken === true);
      clientList[0].postMessage({ type: 'CHECK_TAKEN', medId }, [ch.port2]);
      setTimeout(() => reject(), 2000);
    });
  } catch (_) {
    return false; // assume not taken if no response
  }
}

async function markMedicineTaken(medId) {
  // Tell the page to mark this medicine as taken
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (clientList.length > 0) {
    clientList[0].postMessage({ type: 'MARK_TAKEN', medId });
  } else {
    // Page not open — write directly to localStorage via IndexedDB workaround
    // We store a pending action the page will process on next open
    const db = await openPendingDB();
    await addPending(db, { action: 'MARK_TAKEN', medId, date: new Date().toISOString().slice(0,10) });
  }
}

// Simple IndexedDB for offline pending actions
function openPendingDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('mc_pending', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('actions', { autoIncrement: true });
    req.onsuccess  = e => resolve(e.target.result);
    req.onerror    = () => reject();
  });
}
function addPending(db, data) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('actions', 'readwrite');
    const req = tx.objectStore('actions').add(data);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject();
  });
}

/* ── MESSAGE: schedule reminders from page ── */
self.addEventListener('message', e => {
  if (!e.data) return;

  /* Regular reminder */
  if (e.data.type === 'SCHEDULE') {
    const { title, body, tag, delay, medId } = e.data;

    // Main reminder timer
    timers[tag] = setTimeout(() => {
      showReminder({ title, body, tag, medId });
    }, delay);

    // Missed reminder — 10 min after main reminder
    const missedDelay = delay + (10 * 60 * 1000);
    timers['missed-' + medId] = setTimeout(async () => {
      const taken = await isMedicineTaken(medId);
      if (!taken) {
        showReminder({
          title:   '⚠️ Missed: ' + title.replace('💊 Time for ', ''),
          body:    'You missed this medicine. Please take it as soon as possible.',
          tag:     'missed-' + tag,
          medId,
          actions: [{ action: 'taken', title: '✓ Take now' }]
        });
      }
    }, missedDelay);
  }
});

/* ── NOTIFICATION CLICK: action buttons ── */
self.addEventListener('notificationclick', e => {
  const { action, notification } = e;
  const medId = notification.data?.medId;
  notification.close();

  /* ── MARK TAKEN button ── */
  if (action === 'taken') {
    e.waitUntil((async () => {
      // Cancel any pending missed reminder for this medicine
      if (timers['missed-' + medId]) {
        clearTimeout(timers['missed-' + medId]);
        delete timers['missed-' + medId];
      }
      // Mark medicine as taken in the app
      await markMedicineTaken(medId);
      // Close the missed reminder notification too if it exists
      const regs = await self.registration.getNotifications({ tag: 'missed-med-' + medId });
      regs.forEach(n => n.close());
      // Focus or open app
      const clientList = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
      if (clientList.length > 0) { clientList[0].focus(); }
      else { self.clients.openWindow('./index.html'); }
    })());
    return;
  }

  /* ── SNOOZE button ── */
  if (action === 'snooze') {
    e.waitUntil((async () => {
      const { title, body, data } = notification;
      // Show again after exactly 10 minutes
      setTimeout(() => {
        showReminder({
          title: '⏰ ' + title,
          body,
          tag:   notification.tag + '-snz-' + Date.now(),
          medId,
          actions: [
            { action: 'taken', title: '✓ Mark taken' },
            { action: 'snooze', title: '⏰ Snooze again' }
          ]
        });
      }, 10 * 60 * 1000);
    })());
    return;
  }

  /* ── TAP notification body (not a button) — open app ── */
  e.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    const existing   = clientList.find(c => c.url.includes('medicompanion'));
    if (existing) { existing.focus(); }
    else { self.clients.openWindow('./index.html'); }
  })());
});