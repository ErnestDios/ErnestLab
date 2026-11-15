/* Ernest Lab offline support. Versions move together: run `python3 tools/bump_version.py X.Y.Z` (APP_VERSION in
   js/00-config.js, CACHE here, ?v= on every css/js in index.html and ASSETS below).
   The page, its scripts and styles: network first (a new release shows up as soon as you're online, never a mix of
   old and new files), cache when offline.
   Icons and manifest: cache first. The RAW decoder (./raw/, ~1.5 MB) is cached the first time a RAW file is opened (the EXR decoder, ./exr/, likewise),
   so RAW works offline after that. Images you open never pass through here: they're read locally. */
const CACHE = "ernestlab-1.5.0";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"];   /* + SHELL from index.html */
const SHELL = ["./css/fonts.css?v=1.5.0", "./css/app.css?v=1.5.0", "./js/00-config.js?v=1.5.0", "./js/01-development.js?v=1.5.0", "./js/02-profiles.js?v=1.5.0", "./js/03-measured.js?v=1.5.0", "./js/03-stocks.js?v=1.5.0", "./js/03-params.js?v=1.5.0", "./js/04-panel.js?v=1.5.0", "./js/05-gl.js?v=1.5.0", "./js/06-images.js?v=1.5.0", "./js/07-raw.js?v=1.5.0", "./js/07-exr.js?v=1.5.0", "./js/07-dpx.js?v=1.5.0", "./js/08-output.js?v=1.5.0", "./js/08-formats.js?v=1.5.0", "./js/09-view.js?v=1.5.0", "./js/10-boot.js?v=1.5.0", "./js/11-curve-editor.js?v=1.5.0", "./js/12-video.js?v=1.5.0", "./js/12-vdec.js?v=1.5.0", "./js/12-seq.js?v=1.5.0", "./js/13-help.js?v=1.5.0", "./js/14-report.js?v=1.5.0", "./js/15-phone.js?v=1.5.0"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll([...ASSETS, ...SHELL].map(u => new Request(u, {cache: "reload"})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => (k.startsWith("ernestlab-") || k.startsWith("filmlab-")) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
/* v1.2: cross-origin isolation for the page (COOP + COEP), which GitHub Pages can't set as headers. It lets the ProRes
   decoder share memory between its threads (much faster). Everything Ernest Lab loads is its own, so nothing is blocked. */
function isolate(res) {
  if (!res || res.type === "opaque" || !res.ok) return res;
  const h = new Headers(res.headers); h.set("Cross-Origin-Opener-Policy", "same-origin"); h.set("Cross-Origin-Embedder-Policy", "require-corp");
  return new Response(res.body, {status: res.status, statusText: res.statusText, headers: h});
}
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
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put("./index.html", copy)); return isolate(res); })
      .catch(() => caches.match("./index.html").then(r => r && isolate(r))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok && (url.pathname.includes("/raw/")||url.pathname.includes("/exr/")||url.pathname.includes("/video/")||url.pathname.includes("/dpx/")||url.pathname.includes("/stocks/"))) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
