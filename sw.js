/* ─────────────────────────────────────────
   MediCompanion — Service Worker (sw.js)
   - Caches all app files for offline use
   - Handles background push notifications
   - Notification action buttons (taken / snooze)
───────────────────────────────────────── */

const CACHE_NAME = 'medicompanion-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Fraunces:ital,wght@0,300;0,500;1,300&display=swap'
];

/* ── INSTALL: cache all app files ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache local assets reliably; external fonts best-effort
      return cache.addAll(['./index.html', './style.css', './script.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'])
        .then(() => cache.add('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Fraunces:ital,wght@0,300;0,500;1,300&display=swap').catch(() => {}));
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: clear old caches ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: serve from cache first, network as fallback ── */
self.addEventListener('fetch', e => {
  // Don't intercept Gemini API calls — they need live network
  if (e.request.url.includes('generativelanguage.googleapis.com')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Cache successful GET responses
        if (e.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

/* ── MESSAGE: schedule a notification after a delay ── */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SCHEDULE') {
    const { title, body, tag, delay, medId } = e.data;
    setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag,
        requireInteraction: true,
        data: { medId },
        actions: [
          { action: 'taken', title: '✓ Mark taken' },
          { action: 'snooze', title: '⏰ Snooze 10 min' }
        ]
      });
    }, delay);
  }
});

/* ── NOTIFICATION CLICK: handle action buttons ── */
self.addEventListener('notificationclick', e => {
  const { action, notification } = e;
  notification.close();

  if (action === 'snooze') {
    // Re-show notification after 10 minutes
    const { title, body, tag, data } = notification;
    e.waitUntil(
      new Promise(resolve => {
        setTimeout(() => {
          self.registration.showNotification(title, {
            body: '⏰ Snoozed reminder: ' + body,
            icon: './icons/icon-192.png',
            tag: tag + '-snoozed',
            requireInteraction: true,
            data,
            actions: [{ action: 'taken', title: '✓ Mark taken' }]
          });
          resolve();
        }, 10 * 60 * 1000);
      })
    );
    return;
  }

  // Open/focus app on any other click
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes('index.html'));
      if (existing) { existing.focus(); return; }
      return clients.openWindow('./index.html');
    })
  );
});
