/* Site settings (التمكين التقني): defaults, the font list, and applying a settings object to the page.
   Loaded in <head> so the saved look is in place before the page paints. The saved copy lives in Firestore
   (settings/site); the last one seen is cached in localStorage so it also applies before sign-in. */
(() => {
  const DEFAULTS = {
    siteName: "مكتب الحوكمة", showName: true, logo: "", logoDark: "", logoSize: 32,
    a1: "#7c3aed", a2: "#c026d3",
    font: "IBM Plex Sans Arabic", fontSize: 15, radius: "medium",
    theme: "system", startPage: "home",
    home: { prayer: true, tasks: true },
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

  function merge(s){
    const o = { ...DEFAULTS, ...(s || {}) };
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
    st.setProperty("--a1", s.a1); st.setProperty("--a2", s.a2);
    if (FONTS[s.font]) loadFont(s.font);
    st.setProperty("--font-ui", `"${s.font}",system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif`);
    st.setProperty("--fs", s.fontSize + "px");
    const [r, rs, rc] = RADIUS[s.radius];
    st.setProperty("--r", r + "px"); st.setProperty("--r-sm", rs + "px"); st.setProperty("--r-card", rc + "px");
    let chosen = null; try { chosen = localStorage.getItem("app-theme") || localStorage.getItem("assoc-policies-theme"); } catch {}
    const theme = chosen || (s.theme !== "system" ? s.theme : null);
    if (theme) document.documentElement.setAttribute("data-theme", theme); else document.documentElement.removeAttribute("data-theme");
    window.siteSettings = s;
    window.dispatchEvent(new CustomEvent("app:settings", { detail: s }));
    return s;
  }
  function cache(s){ try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
  let cached = null; try { cached = JSON.parse(localStorage.getItem(KEY) || "null"); } catch {}
  window.SiteSettings = { DEFAULTS, FONTS, RADIUS, merge, apply, cache };
  apply(cached);
})();
