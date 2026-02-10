// Self-destructing service worker — unregisters itself and clears all caches
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => {
  self.registration.unregister();
  caches.keys().then((keys) => {
    keys.forEach((key) => caches.delete(key));
  });
});
