/* Service worker: makes the site installable and fast on repeat visits.
   - Pages (index.html, form.html): network first, the cached copy only when offline, so a deploy shows at once.
   - The site's own css/js/img (versioned with ?v=) and the fixed CDN libraries: from the cache, fetched once.
     When a new ?v= of a file arrives, the older copies of that same file are dropped.
   - Never cached: /api/, Firebase and Google APIs (data and sign-in), Cloudinary uploads, and anything not GET. */
const VERSION = "v2";
const PAGES = "pages-" + VERSION, ASSETS = "assets-" + VERSION;
// shown when there is no connection and no saved copy of the page
const OFFLINE = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>نَسَق | لا يوجد اتصال</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:'IBM Plex Sans Arabic',Tahoma,sans-serif;background:#F8F9FC;color:#1E293B;text-align:center;padding:24px">
<div><svg width="64" height="64" viewBox="0 0 62 62"><rect width="28" height="28" rx="8" fill="#9333EA"/><rect x="34" width="28" height="28" rx="8" fill="#542580"/><rect y="34" width="28" height="28" rx="8" fill="#542580"/><rect x="34" y="34" width="28" height="28" rx="8" fill="#9333EA"/><path d="M42 47 L47 52 L55 41" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
<h1 style="font-size:22px;margin:14px 0 6px">لا يوجد اتصال بالإنترنت</h1><p style="color:#64748B;margin:0">أعد المحاولة عند عودة الاتصال · نَسَق | NASAQ</p></div></body></html>`;
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
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match("/")) || new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
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
