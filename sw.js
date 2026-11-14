/* Ernest Lab offline support. Versions move together: run `python3 tools/bump_version.py X.Y.Z` (APP_VERSION in
   js/00-config.js, CACHE here, ?v= on every css/js in index.html and ASSETS below).
   The page, its scripts and styles: network first (a new release shows up as soon as you're online, never a mix of
   old and new files), cache when offline.
   Icons and manifest: cache first. The RAW decoder (./raw/, ~1.5 MB) is cached the first time a RAW file is opened,
   so RAW works offline after that. Images you open never pass through here: they're read locally. */
const CACHE = "ernestlab-0.9.0";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"];   /* + SHELL from index.html */
const SHELL = ["./css/fonts.css?v=0.9.0", "./css/app.css?v=0.9.0", "./js/00-config.js?v=0.9.0", "./js/01-development.js?v=0.9.0", "./js/02-profiles.js?v=0.9.0", "./js/03-measured.js?v=0.9.0", "./js/03-params.js?v=0.9.0", "./js/04-panel.js?v=0.9.0", "./js/05-gl.js?v=0.9.0", "./js/06-images.js?v=0.9.0", "./js/07-raw.js?v=0.9.0", "./js/08-output.js?v=0.9.0", "./js/09-view.js?v=0.9.0", "./js/10-boot.js?v=0.9.0", "./js/11-curve-editor.js?v=0.9.0", "./js/12-video.js?v=0.9.0", "./js/13-help.js?v=0.9.0", "./js/14-report.js?v=0.9.0", "./js/15-phone.js?v=0.9.0"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll([...ASSETS, ...SHELL].map(u => new Request(u, {cache: "reload"})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => (k.startsWith("ernestlab-") || k.startsWith("filmlab-")) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  const shell = /\/(css|js)\/[^/]+\.(css|js)$/.test(url.pathname);
  if (shell) {   /* scripts and styles: network first, keep a copy for offline */
    e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req)));
    return;
  }
  if (req.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/")) {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put("./index.html", copy)); return res; })
      .catch(() => caches.match("./index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok && (url.pathname.includes("/raw/")||url.pathname.includes("/video/"))) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
