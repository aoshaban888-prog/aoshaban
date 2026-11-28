/* Site settings (التمكين التقني): defaults, the font list, and applying a settings object to the page.
   Loaded in <head> so the saved look is in place before the page paints. The saved copy lives in Firestore
   (settings/site); the last one seen is cached in localStorage so it also applies before sign-in. */
(() => {
  const DEFAULTS = {
    // الهوية: نَسَق | NASAQ — the one source for the system's name, logo, description and colors
    brand: "nasaq", siteName: "نَسَق", siteNameEn: "NASAQ", tagline: "منصة التنظيم والإدارة المتكاملة", slogan: "تنظيم أفضل، إنجاز أكبر", credit: "أحمد شعبان",
    showName: true, logo: "", logoDark: "", logoSize: 56,
    a1: "#9333EA", a2: "#542580", a3: "#7C3AED",
    cLight: "#F3E8FF", cBgDark: "#191919", cBgLight: "#F8F9FC", cSurface: "#FFFFFF", cInk: "#1E293B", cMuted: "#64748B", cLine: "#E2E8F0",
    font: "IBM Plex Sans Arabic", fontSize: 15, radius: "medium",
    theme: "system", startPage: "home", sliderSeconds: 6,
    home: { prayer: true, tasks: true, slider: true },
  };
  // Google Fonts families drawn for Arabic, with the weights each one has
  const FONTS = {
    "IBM Plex Sans Arabic": "400;500;600",
    "Noto Sans Arabic": "400;500;600",
    "Noto Kufi Arabic": "400;500;600",
    "Readex Pro": "400;500;600",
    "Alexandria": "400;500;600",
    "Tajawal": "400;500;700",
    "Cairo": "400;500;600",
    "Almarai": "400;700",
    "Rubik": "400;500;600",
    "Noto Naskh Arabic": "400;500;600",
  };
  const RADIUS = { small: [6, 4, 8], medium: [8, 6, 12], large: [12, 8, 18] };
  const KEY = "app-settings";

  // settings saved before the NASAQ identity: the old name, colors and logo give way to the new brand (once, then saved by an admin)
  const OLD_NAMES = ["نظام أحمد التفاعلي", "نظام أحمد", ""];
  function upgrade(s){
    if (!s || s.brand === "nasaq") return s;
    const o = { ...s, brand: "nasaq", a1: DEFAULTS.a1, a2: DEFAULTS.a2, logo: "", logoDark: "", showName: true };
    if (OLD_NAMES.includes(String(s.siteName || "").trim())) o.siteName = DEFAULTS.siteName;
    return o;
  }
  function merge(s){
    s = upgrade(s);
    const o = { ...DEFAULTS, ...(s || {}) };
    ["a1", "a2", "a3", "cLight", "cBgDark", "cBgLight", "cSurface", "cInk", "cMuted", "cLine"].forEach(k => { if (!/^#[0-9a-f]{6}$/i.test(String(o[k] || ""))) o[k] = DEFAULTS[k]; });
    ["siteName", "siteNameEn", "tagline", "slogan", "credit"].forEach(k => { if (typeof o[k] !== "string") o[k] = DEFAULTS[k]; });
    if (!String(o.siteName).trim()) o.siteName = DEFAULTS.siteName;
    o.home = { ...DEFAULTS.home, ...((s && s.home) || {}) };
    if (!o.font) o.font = DEFAULTS.font;
    if (!RADIUS[o.radius]) o.radius = DEFAULTS.radius;
    if (o.startPage === "governance/hr") o.startPage = "hr/letters";
    return o;
  }
  function loadFont(name){
    const id = "font-" + name.replace(/\W+/g, "-");
    if (document.getElementById(id)) return;
    const l = document.createElement("link"); l.rel = "stylesheet"; l.id = id;
    l.href = `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, "+")}:wght@${FONTS[name]}&display=swap`;
    document.head.append(l);
  }
  function apply(raw){
    const s = merge(raw);
    const st = document.documentElement.style;
    st.setProperty("--a1", s.a1); st.setProperty("--a2", s.a2); st.setProperty("--a3", s.a3 || s.a1);
    [["cLight", "--c-light"], ["cBgDark", "--c-bg-dark"], ["cBgLight", "--c-bg-light"], ["cSurface", "--c-surface"], ["cInk", "--c-ink"], ["cMuted", "--c-muted"], ["cLine", "--c-line"]].forEach(([k, v]) => st.setProperty(v, s[k]));
    const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.content = s.a1;
    if (FONTS[s.font]) loadFont(s.font);
    st.setProperty("--font-ui", `"${s.font}",system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif`);
    st.setProperty("--fs", s.fontSize + "px");
    const [r, rs, rc] = RADIUS[s.radius];
    st.setProperty("--r", r + "px"); st.setProperty("--r-sm", rs + "px"); st.setProperty("--r-card", rc + "px");
    let chosen = null; try { chosen = localStorage.getItem("app-theme") || localStorage.getItem("assoc-policies-theme"); } catch {}
    const theme = chosen || (s.theme !== "system" ? s.theme : null);
    if (theme) document.documentElement.setAttribute("data-theme", theme); else document.documentElement.removeAttribute("data-theme");
    window.siteSettings = s;
    if (document.readyState !== "loading") Brand.render();
    window.dispatchEvent(new CustomEvent("app:settings", { detail: s }));
    return s;
  }
  function cache(s){ try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
  let cached = null; try { cached = JSON.parse(localStorage.getItem(KEY) || "null"); } catch {}
  if (/^https?:/.test(location.protocol)) document.documentElement.classList.add("gate-wait");
  /* ---------- the logo, as reusable pieces: any element with data-brand="icon|compact|horizontal|vertical|loader|footer|name" ----------
     The icon is drawn inline (transparent) from the brand colors, so it follows the settings and the light/dark theme.
     An admin's uploaded logo (settings › الهوية) takes the icon's place. */
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const Brand = {
    s: () => window.siteSettings || merge(null),
    // the Arabic name with its kashida in the logo (نَــسَــق); stored plainly (نَسَق)
    display(n){ n = String(n ?? Brand.s().siteName).trim(); return /^نَ?سَ?ق$/.test(n) ? "نَــسَــق" : n; },
    plain(n){ return String(n ?? Brand.s().siteName).replace(/ـ/g, "").trim(); },
    full(){ const s = Brand.s(); return s.siteNameEn ? `${Brand.plain()} | ${s.siteNameEn}` : Brand.plain(); },
    title(page){ return page ? `${page} · ${Brand.plain()}` : `${Brand.full()} — ${Brand.s().tagline}`; },
    icon(extra = ""){
      const s = Brand.s(), dark = isDark(), src = (dark && s.logoDark) || s.logo;
      if (src) return `<img class="bx-ic bx-img ${extra}" src="${esc(src)}" alt="">`;
      return `<svg class="bx-ic ${extra}" viewBox="0 0 62 62" aria-hidden="true" focusable="false"><rect class="q1" x="0" y="0" width="28" height="28" rx="8"/><rect class="q2" x="34" y="0" width="28" height="28" rx="8"/><rect class="q3" x="0" y="34" width="28" height="28" rx="8"/><rect class="q4" x="34" y="34" width="28" height="28" rx="8"/><path class="ck" d="M42 47 L47 52 L55 41"/></svg>`;
    },
    html(kind){
      const s = Brand.s(), ar = `<span class="bx-ar">${esc(Brand.display())}</span>`, en = s.siteNameEn ? `<span class="bx-en" dir="ltr">${esc(s.siteNameEn)}</span>` : "";
      if (kind === "icon") return Brand.icon();
      if (kind === "name") return esc(Brand.display());
      if (kind === "compact") return `<span class="bx bx-c">${Brand.icon()}${ar}</span>`;
      if (kind === "horizontal") return `<span class="bx bx-h">${Brand.icon()}<span class="bx-t">${ar}${en}</span></span>`;
      if (kind === "vertical") return `<span class="bx bx-v">${Brand.icon()}${ar}${en}${s.tagline ? `<span class="bx-tag">${esc(s.tagline)}</span>` : ""}${s.slogan ? `<span class="bx-slo">${esc(s.slogan)}</span>` : ""}</span>`;
      if (kind === "loader") return `<span class="bx bx-load">${Brand.icon("bx-anim")}${ar}</span>`;
      if (kind === "footer") return `<div class="sf-b">${Brand.icon()}<b>${esc(Brand.plain())}${s.siteNameEn ? ` <span>|</span> <span dir="ltr">${esc(s.siteNameEn)}</span>` : ""}</b></div>${s.tagline ? `<p class="sf-t">${esc(s.tagline)}</p>` : ""}<p class="sf-c">${s.credit ? `تطوير وإدارة ${esc(s.credit)} · ` : ""}جميع الحقوق محفوظة © ${new Date().getFullYear()}</p>`;
      return "";
    },
    render(root = document){
      root.querySelectorAll("[data-brand]").forEach(el => { const h = Brand.html(el.dataset.brand); if (el._bx !== h){ el.innerHTML = h; el._bx = h; } });
      const s = Brand.s();
      document.querySelectorAll("[data-brand-label]").forEach(el => el.setAttribute("aria-label", Brand.plain()));
      const an = document.querySelector('meta[name="application-name"]'); if (an) an.content = Brand.full();
      const at = document.querySelector('meta[name="apple-mobile-web-app-title"]'); if (at) at.content = Brand.plain();
      // the tab icon: the admin's logo, otherwise the NASAQ icon files
      const ic = document.querySelector('link[rel="icon"][type="image/svg+xml"]'); if (ic) ic.href = s.logo || "/img/brand/nasaq-icon.svg";
    },
  };
  function isDark(){ const t = document.documentElement.getAttribute("data-theme"); return t ? t !== "light" : matchMedia("(prefers-color-scheme: dark)").matches; }
  window.Brand = Brand;
  document.addEventListener("DOMContentLoaded", () => Brand.render());
  new MutationObserver(() => { if (document.readyState !== "loading") Brand.render(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.SiteSettings = { DEFAULTS, FONTS, RADIUS, merge, apply, cache, loadFont: n => { if (FONTS[n]) loadFont(n); } };
  apply(cached);
})();
