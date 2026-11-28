/* The site as an app: registers the service worker (sw.js), offers «تثبيت التطبيق» in the account menu,
   explains the steps on iPhone/iPad (Safari has no install prompt), and tells the person when a newer version is ready. */
(() => {
  const btn = document.getElementById("acctInstall");
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let deferred = null;
  const show = on => { if (btn) btn.hidden = !on || standalone(); };
  show(ios);
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; show(true); });
  window.addEventListener("appinstalled", () => { deferred = null; show(false); window.UI && UI.toast("ثُبّت التطبيق، تجده في الشاشة الرئيسية"); });
  btn && btn.addEventListener("click", async () => {
    if (deferred){ deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null; if (!r || r.outcome !== "accepted") show(true); else show(false); return; }
    if (ios && window.UI) UI.alert("لتثبيت التطبيق على الآيفون أو الآيباد: افتح الموقع في Safari، واضغط زر المشاركة (المربع والسهم)، ثم اختر «إضافة إلى الشاشة الرئيسية».");
  });

  if (!("serviceWorker" in navigator) || location.protocol !== "https:") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(reg => {
      // a newer version finished installing while this page is open: offer to reload
      reg.addEventListener("updatefound", () => {
        const w = reg.installing; if (!w || !navigator.serviceWorker.controller) return;
        w.addEventListener("statechange", () => { if (w.state === "activated" && window.UI) UI.toast("نُشر تحديث جديد للموقع. أعد تحميل الصفحة لتراه."); });
      });
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(err => console.warn("sw", err));
  });
})();
