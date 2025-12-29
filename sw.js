const CACHE_NAME = 'expense-tracker-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.webmanifest',
  // Note: Add paths to icon files here once they exist
  // '/icons/icon-192x192.png',
  // '/icons/icon-512x512.png'
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

// フェッチイベントを処理して、キャッシュまたはネットワークからリソースを提供する
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュに存在する場合はそれを返す
        if (response) {
          return response;
        }

        // キャッシュにない場合はネットワークからフェッチする
        return fetch(event.request);
      }
    )
  );
});

// 古いキャッシュをクリーンアップする
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
