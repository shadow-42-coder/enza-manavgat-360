// Minimal, deliberately conservative service worker: only exists so the
// site can be "added to home screen" as a real app and still show something
// if the visitor briefly loses signal. It always tries the network first
// and only falls back to a cached copy on failure - never cache-first - so
// it can never serve a visitor a stale tour after data.js/index.js/tiles
// get updated. Bump CACHE_NAME to force old caches to be dropped.
var CACHE_NAME = 'enza-shell-v1';
var SHELL_FILES = [
  './',
  'index.html',
  'style.css',
  'index.js',
  'data.js',
  'vendor/reset.min.css',
  'vendor/screenfull.min.js',
  'vendor/bowser.min.js',
  'vendor/marzipano.js',
  'img/logo.png',
  'img/favicon-64.png',
  'img/favicon-32.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(SHELL_FILES);
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(names.filter(function(n) { return n !== CACHE_NAME; }).map(function(n) { return caches.delete(n); }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
  var url = new URL(event.request.url);
  // Only ever handle this site's own requests. Anything cross-origin (product
  // links, CDN images, health-check probes the admin panel makes, etc.) must
  // pass through completely untouched - intercepting those and silently
  // substituting a cached response on failure would make failed requests
  // look like they succeeded, which is both wrong and actively broke the
  // admin panel's link/image health checkers.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request).then(function(response) {
      var copy = response.clone();
      caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, copy); });
      return response;
    }).catch(function() {
      return caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        // Only substitute the cached app shell for an actual page load, not
        // for a failed same-origin asset (e.g. a genuinely missing tile) -
        // returning HTML in place of an image would just break rendering.
        if (event.request.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      });
    })
  );
});
