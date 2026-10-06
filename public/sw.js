/* AutoList 서비스워커 — 정적 셸 캐시(오프라인), API는 캐시 제외, 웹푸시 */
const CACHE = 'autolist-v2';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.json', '/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// 웹 푸시 수신 → 알림 표시
self.addEventListener('push', (e) => {
  let d = { title: 'AutoList', body: '새 알림', url: '/' };
  try { if (e.data) d = Object.assign(d, e.data.json()); } catch (_) { if (e.data) d.body = e.data.text(); }
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: d.url || '/' } }));
});
// 알림 클릭 → 앱 열기/포커스
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;                 // 변경 요청은 그대로 통과
  if (url.pathname.startsWith('/api/')) return;      // API는 캐시하지 않음(항상 네트워크)
  // 네비게이션: 네트워크 우선, 실패 시 캐시된 셸
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }
  // 정적: 캐시 우선, 없으면 네트워크 후 캐시에 저장
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.status === 200 && url.origin === location.origin) {
        const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
