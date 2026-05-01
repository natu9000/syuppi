const CACHE_NAME = 'expense-tracker-cache-v6';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  // Note: Add paths to icon files here once they exist
  './icons/icon192x192.png',
  './icons/icon512x512.png'
];

// インストール時にキャッシュを追加する
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // ページ遷移（index.htmlを含む）だけ Network-first にする
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          // 成功したら最新を返す（必要ならここでHTMLだけ都度キャッシュしても良いが最小構成では省略）
          return res;
        })
        .catch(() => caches.match('./index.html') || caches.match('./'))
    );
    return;
  }

  // それ以外（CSS/JS/アイコン等）は従来通り Cache-first
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k === CACHE_NAME ? Promise.resolve() : caches.delete(k))))
    )
  );
});

