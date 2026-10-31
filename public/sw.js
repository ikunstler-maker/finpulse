/*
 * FinPulse service worker: застосунок відкривається без інтернету.
 * Сторінки — спершу мережа (щоб оновлення приходили), файли збірки з хешем — спершу кеш.
 * Запити до Google, НБУ та біржі не кешуються: дані користувача тут не зберігаються.
 */
const CACHE = 'finpulse-shell-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png'];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k.startsWith('finpulse-') && k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim()),
    );
});

const isFont = url => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    const sameOrigin = url.origin === self.location.origin;
    if (!sameOrigin && !isFont(url)) return;

    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req)
                .then(res => {
                    const copy = res.clone();
                    caches.open(CACHE).then(c => c.put(req, copy));
                    return res;
                })
                .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))),
        );
        return;
    }

    event.respondWith(
        caches.match(req).then(hit => hit || fetch(req).then(res => {
            if (res.ok || res.type === 'opaque') {
                const copy = res.clone();
                caches.open(CACHE).then(c => c.put(req, copy));
            }
            return res;
        })),
    );
});

// Натискання на сповіщення про платежі відкриває застосунок (або переводить на нього фокус).
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            const open = list.find(c => c.url.startsWith(self.registration.scope));
            return open ? open.focus() : self.clients.openWindow(self.registration.scope);
        }),
    );
});
