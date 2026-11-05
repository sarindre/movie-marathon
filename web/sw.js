// Caches the app shell so the planner works offline once installed.
const CACHE = "marathon-v6";
const SHELL = ["./", "index.html", "style.css", "ordering.js", "lookup.js", "bulk.js", "app.js", "install.js", "theme.js", "store.js", "share.js", "live.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Only handle our own files; never cache Wikidata lookups or the big installers.
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.includes("/downloads/")) return;
  // Network first so edits show up, falling back to cache when offline.
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
