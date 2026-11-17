/* App shell: hash routing between views and the mobile navigation drawer. */
(() => {
  const ROUTES = {
    "home": "الرئيسية",
    "tasks": "المهام",
    "governance/library": "اللوائح والسياسات",
    "hr/letters": "الخطابات",
    "admin": "التمكين التقني",
  };
  const DEFAULT = () => (window.siteSettings && ROUTES[window.siteSettings.startPage]) ? window.siteSettings.startPage : "home";
  const app = document.querySelector(".app");
  let current = null;

  // older links that moved
  const MOVED = { "governance/hr": "hr/letters" };
  /* collapsible groups in the sidebar (الحوكمة، الموارد البشرية): open by click, remembered, and opened for their own pages */
  const groups = [...document.querySelectorAll(".nav-group[data-group]")].map(btn => ({ btn, sub: document.getElementById(btn.getAttribute("aria-controls")), key: btn.dataset.group }));
  function setGroup(g, open, save){
    g.btn.setAttribute("aria-expanded", open ? "true" : "false"); g.sub.hidden = !open;
    if (save){ try { localStorage.setItem("app-nav-" + g.key, open ? "1" : "0"); } catch {} }
  }
  groups.forEach(g => {
    let saved = null; try { saved = localStorage.getItem("app-nav-" + g.key) ?? localStorage.getItem(g.key === "governance" ? "app-nav-gov" : "-"); } catch {}
    setGroup(g, saved === "1", false);
    g.btn.addEventListener("click", () => setGroup(g, g.sub.hidden, true));
  });

  function route(){
    let r = location.hash.replace(/^#\/?/, "");
    if (MOVED[r]){ r = MOVED[r]; history.replaceState(null, "", "#/" + r); }
    if (!ROUTES[r]) r = DEFAULT();
    document.querySelectorAll(".view").forEach(v => { v.hidden = v.dataset.view !== r; });
    groups.forEach(g => g.btn.classList.toggle("has-current", r.startsWith(g.key + "/")));
    document.querySelectorAll(".nav a").forEach(a => {
      if (a.getAttribute("href") === "#/" + r) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    groups.forEach(g => { if (r.startsWith(g.key + "/")) setGroup(g, true, false); });
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

  /* account at the foot of the sidebar: photo and name; the menu holds the email, settings and sign-out */
  const acct = document.getElementById("account"), acctBtn = document.getElementById("acctBtn"), acctMenu = document.getElementById("acctMenu");
  function setMenu(open){ acctMenu.hidden = !open; acctBtn.setAttribute("aria-expanded", open ? "true" : "false"); }
  acctBtn.addEventListener("click", e => { e.stopPropagation(); setMenu(acctMenu.hidden); });
  document.addEventListener("click", e => { if (!acct.contains(e.target)) setMenu(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") setMenu(false); });
  acctMenu.addEventListener("click", e => { if (e.target.closest("a")) setMenu(false); });
  document.getElementById("acctOut").addEventListener("click", () => {
    const a = window.appAuth; if (a && a.signOut) a.signOut(); else location.reload();
  });
  function renderAccount(){
    const a = window.appAuth, u = a && a.allowed && a.user;
    acct.hidden = !u;
    document.querySelector(".side-foot").classList.toggle("signed", !!u);
    if (!u) return;
    const name = u.displayName || u.email.split("@")[0];
    document.getElementById("acctName").textContent = name;
    document.getElementById("acctMail").textContent = u.email;
    const pic = document.getElementById("acctPic"); pic.innerHTML = "";
    if (u.photoURL){ const i = document.createElement("img"); i.src = u.photoURL; i.alt = ""; i.referrerPolicy = "no-referrer"; i.onerror = () => { i.remove(); pic.textContent = name.trim()[0] || "?"; }; pic.append(i); }
    else pic.textContent = name.trim()[0] || "?";
  }
  window.addEventListener("app:auth", renderAccount);
  renderAccount();

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
