/* App shell: hash routing between views and the mobile navigation drawer. */
(() => {
  const ROUTES = {
    "home": "الرئيسية",
    "tasks": "المهام",
    "governance/library": "اللوائح والسياسات",
    "governance/associations": "الجمعيات",
    "governance/compliance": "متطلبات الامتثال",
    "admin": "التمكين التقني",
  };
  const DEFAULT = () => (window.siteSettings && ROUTES[window.siteSettings.startPage]) ? window.siteSettings.startPage : "home";
  const app = document.querySelector(".app");
  let current = null;

  function route(){
    let r = location.hash.replace(/^#\/?/, "");
    if (!ROUTES[r]) r = DEFAULT();
    document.querySelectorAll(".view").forEach(v => { v.hidden = v.dataset.view !== r; });
    document.querySelectorAll(".nav a").forEach(a => {
      if (a.getAttribute("href") === "#/" + r) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    document.querySelector(".topbar .t").textContent = ROUTES[r];
    document.title = ROUTES[r] + " · " + ((window.siteSettings && window.siteSettings.siteName) || "مكتب الحوكمة");
    app.classList.remove("nav-open");
    if (r !== current){ current = r; window.scrollTo(0, 0); window.dispatchEvent(new CustomEvent("app:view", { detail: r })); }
  }
  window.addEventListener("hashchange", route);
  document.querySelector(".menu-btn").addEventListener("click", () => app.classList.add("nav-open"));
  document.querySelector(".scrim").addEventListener("click", () => app.classList.remove("nav-open"));
  document.addEventListener("keydown", e => { if (e.key === "Escape") app.classList.remove("nav-open"); });
  route();

  /* pin or hide the sidebar on wide screens; hidden, it opens over the page from the menu button */
  const pinBtn = document.getElementById("pinBtn");
  function setPinned(on, save){
    app.classList.toggle("side-hidden", !on);
    app.classList.remove("nav-open");
    pinBtn.setAttribute("aria-pressed", on ? "true" : "false");
    const label = on ? "إخفاء القائمة" : "تثبيت القائمة";
    pinBtn.title = label; pinBtn.setAttribute("aria-label", label);
    if (save){ try { localStorage.setItem("app-side", on ? "pinned" : "hidden"); } catch {} }
    window.dispatchEvent(new Event("resize"));
  }
  let sideSaved = null; try { sideSaved = localStorage.getItem("app-side"); } catch {}
  setPinned(sideSaved !== "hidden", false);
  pinBtn.addEventListener("click", () => setPinned(app.classList.contains("side-hidden"), true));

  /* theme: light, dark or neon; with nothing chosen the page follows the system */
  const root = document.documentElement;
  const sysTheme = () => matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  function paintPick(){
    const cur = root.getAttribute("data-theme") || sysTheme();
    document.querySelectorAll("[data-theme-set]").forEach(b => b.setAttribute("aria-checked", b.dataset.themeSet === cur ? "true" : "false"));
  }
  document.querySelectorAll("[data-theme-set]").forEach(b => b.addEventListener("click", () => {
    root.setAttribute("data-theme", b.dataset.themeSet);
    try { localStorage.setItem("app-theme", b.dataset.themeSet); } catch {}
    paintPick();
  }));
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintPick);
  window.addEventListener("app:settings", () => { paintPick(); if (current) document.title = ROUTES[current] + " · " + window.siteSettings.siteName; });
  paintPick();
})();
