/* Service worker: makes the site installable and fast on repeat visits.
   - Pages (index.html, form.html): network first, the cached copy only when offline, so a deploy shows at once.
   - The site's own css/js/img (versioned with ?v=) and the fixed CDN libraries: from the cache, fetched once.
     When a new ?v= of a file arrives, the older copies of that same file are dropped.
   - Never cached: /api/, Firebase and Google APIs (data and sign-in), Cloudinary uploads, and anything not GET. */
const VERSION = "v1";
const PAGES = "pages-" + VERSION, ASSETS = "assets-" + VERSION;
const CDN = ["cdnjs.cloudflare.com", "cdn.jsdelivr.net", "unpkg.com", "www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(PAGES).then(c => c.addAll(["/", "/img/icons/icon-192.png"])).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== PAGES && k !== ASSETS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function isAsset(url){
  if (url.origin === self.location.origin) return /^\/(css|js|img)\//.test(url.pathname) && !url.pathname.startsWith("/api/");
  // only the fixed-version library files (firebasejs/10.12.2, marked/12.0.2…) and the font files
  if (url.hostname === "www.gstatic.com") return url.pathname.startsWith("/firebasejs/");
  return CDN.includes(url.hostname);
}
async function fromCache(req, url){
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  // the site's files without ?v= (slider pictures…): the cached copy now, refreshed in the background
  if (hit && url.origin === self.location.origin && !url.search){ fetch(req).then(r => { if (r && r.ok) cache.put(req, r); }).catch(() => {}); return hit; }
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === "opaque")){
    cache.put(req, res.clone()).catch(() => {});
    // drop the other versions of this same file
    if (url.origin === self.location.origin && url.search) cache.keys().then(ks => ks.forEach(k => { const u = new URL(k.url); if (u.origin === url.origin && u.pathname === url.pathname && u.search !== url.search) cache.delete(k); }));
  }
  return res;
}
async function page(req){
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(new URL(req.url).pathname === "/index.html" ? "/" : req, res.clone()).catch(() => {});
    return res;
  } catch (err){
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match("/")) || new Response("<!doctype html><meta charset=utf-8><body dir=rtl style='font-family:sans-serif;padding:40px'>لا يوجد اتصال بالإنترنت. أعد المحاولة عند عودة الاتصال.", { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate"){ e.respondWith(page(req)); return; }
  if (isAsset(url)) e.respondWith(fromCache(req, url).catch(() => caches.match(req)));
});
self.addEventListener("message", e => { if (e.data === "skip") self.skipWaiting(); });
