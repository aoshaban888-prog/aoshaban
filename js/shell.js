/* App shell: hash routing between views and the mobile navigation drawer. */
(() => {
  const ROUTES = {
    "home": "الرئيسية",
    "tasks": "المهام",
    "life/dashboard": "لوحة التحكم الشخصية", "life/goals": "التخطيط والأهداف", "life/career": "المجال المهني", "life/learning": "المجال التعليمي والمعرفي",
    "life/finance": "المجال المالي", "life/family": "المجال الشخصي والأسري", "life/faith": "المجال الروحاني والإيماني", "life/health": "المجال الصحي والبدني",
    "life/habits": "العادات اليومية", "life/notes": "الأفكار والملاحظات", "life/reviews": "المراجعات والتقييم",
    "life": "لوحة التحكم الشخصية",
    "calendar": "التقويم الموحد", "followups": "المتابعات",
    "governance/library": "اللوائح والسياسات",
    "hr/letters": "الخطابات",
    "hr/requests": "الطلبات",
    "projects/initiatives": "منشئ وثائق المبادرات",
    "projects/forms": "الاستبيانات", "projects/registry": "سجل المشاريع", "projects/reports": "مركز التقارير",
    "admin": "التمكين التقني",
    "admin/requests": "إدارة الطلبات الإدارية",
    "admin/permissions": "صلاحيات المستخدمين",
    "about": "عن النظام",
    "orgs/associations": "الجمعيات", "orgs/deadlines": "مركز الوثائق والاستحقاقات", "orgs/meetings": "الاجتماعات والقرارات",
  };
  const DEFAULT = () => (window.siteSettings && ROUTES[window.siteSettings.startPage]) ? window.siteSettings.startPage : "home";
  const app = document.querySelector(".app");
  let current = null;

  // older links that moved
  const MOVED = { "governance/hr": "hr/letters", "governance/associations": "orgs/associations", "admin/associations": "orgs/associations" };
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
    if (r === "life"){ r = "life/dashboard"; history.replaceState(null, "", "#/" + r); }
    document.querySelectorAll(".view").forEach(v => { v.hidden = v.dataset.view !== r && !(v.dataset.prefix && r.startsWith(v.dataset.prefix)); });
    // a group is current for its own routes and for any page linked inside it (المهام sits inside إدارة حياتي الشخصية)
    const inGroup = g => r === g.key || r.startsWith(g.key + "/") || !!g.sub.querySelector(`a[href="#/${r}"]`);
    groups.forEach(g => g.btn.classList.toggle("has-current", inGroup(g)));
    document.querySelectorAll(".nav a").forEach(a => {
      if (a.getAttribute("href") === "#/" + r) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    groups.forEach(g => { if (inGroup(g)) setGroup(g, true, false); });
    document.querySelector(".topbar .t").textContent = ROUTES[r];
    document.title = window.Brand ? Brand.title(ROUTES[r]) : ROUTES[r];
    app.classList.remove("nav-open");
    if (r !== current){ const first = current === null; current = r; window.scrollTo(0, 0); if (!first) loading(); window.dispatchEvent(new CustomEvent("app:view", { detail: r })); }
  }
  /* «جاري التحميل»: the logo inside two turning rings, shown briefly over the page when a section opens */
  const loader = document.createElement("div"); loader.className = "pg-load"; loader.hidden = true; loader.setAttribute("role", "status");
  loader.innerHTML = `<div class="pg-load-in"><div class="pg-ring"><svg class="pg-arcs" viewBox="0 0 120 120" aria-hidden="true"><circle class="pg-a1" cx="60" cy="60" r="54"/><circle class="pg-a2" cx="60" cy="60" r="46"/></svg><span class="pg-logo"></span></div><b>جاري التحميل…</b><small>يرجى الانتظار لحظات</small></div>`;
  document.querySelector(".main-col").append(loader);
  let loadT = 0;
  function loading(){
    const st = window.siteSettings || {}, dark = (root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) !== "light";
    const src = (dark && st.logoDark) || st.logo || "", box = loader.querySelector(".pg-logo");
    box.innerHTML = window.Brand ? Brand.icon("bx-anim") : (src ? `<img src="${src.replace(/"/g, "&quot;")}" alt="">` : "");
    clearTimeout(loadT); loader.hidden = false; loader.classList.remove("out"); void loader.offsetWidth; loader.classList.add("on");
    loadT = setTimeout(() => { loader.classList.add("out"); loadT = setTimeout(() => { loader.hidden = true; loader.classList.remove("on", "out"); }, 220); }, 700);
  }
  window.addEventListener("hashchange", route);
  document.querySelector(".menu-btn").addEventListener("click", () => { if (innerWidth <= 900) app.classList.add("nav-open"); else setPinned(app.classList.contains("side-mini"), true); });
  document.querySelector(".scrim").addEventListener("click", () => app.classList.remove("nav-open"));
  document.addEventListener("keydown", e => { if (e.key === "Escape") app.classList.remove("nav-open"); });
  route();

  /* pin or hide the sidebar on wide screens; hidden, it opens over the page from the menu button */
  const pinBtn = document.getElementById("pinBtn");
  function setPinned(on, save){
    app.classList.toggle("side-mini", !on); app.classList.remove("side-hidden");
    app.classList.remove("nav-open");
    pinBtn.setAttribute("aria-pressed", on ? "true" : "false");
    const label = on ? "طي القائمة إلى الأيقونات" : "توسعة القائمة";
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
  document.getElementById("acctPass").addEventListener("click", async () => {
    const u = window.appAuth && window.appAuth.user; if (!u || !window.firebase) return;
    if (!u.providerData.some(p => p.providerId === "password")){ UI.alert("تدخل بحساب قوقل، فكلمة المرور تُدار من حساب قوقل نفسه"); return; }
    try { await firebase.auth().sendPasswordResetEmail(u.email); UI.toast("أرسلنا رابط تغيير كلمة المرور إلى بريدك"); } catch (e){ UI.toast("تعذّر الإرسال", "err"); }
    setMenu(false);
  });
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
    document.getElementById("acctRole").textContent = roleText();
    document.getElementById("acctMail").textContent = u.email;
    const pic = document.getElementById("acctPic"); pic.innerHTML = "";
    if (u.photoURL){ const i = document.createElement("img"); i.src = u.photoURL; i.alt = ""; i.referrerPolicy = "no-referrer"; i.onerror = () => { i.remove(); pic.textContent = name.trim()[0] || "?"; }; pic.append(i); }
    else pic.textContent = name.trim()[0] || "?";
  }
  // the line under the name: the job title an admin set, else the role
  let meInfo = null;
  const roleText = () => (meInfo && meInfo.jobTitle) || (meInfo ? (meInfo.role === "admin" ? "مدير النظام" : "مستخدم") : "");
  window.addEventListener("app:me", e => { meInfo = e.detail; document.getElementById("acctRole").textContent = roleText(); });
  window.addEventListener("app:auth", renderAccount);
  window.addEventListener("app:auth", () => { document.getElementById("bell").hidden = !(window.appAuth && window.appAuth.allowed && window.appAuth.user); });

  // the bell is drawn by js/notif.js
  renderAccount();

  /* theme: light, dark or neon; with nothing chosen the page follows the system */
  const root = document.documentElement;
  const sysTheme = () => matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  // one button in the header: light → dark → neon → light
  const THEMES = { light: ["فاتح", "dark", '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'], dark: ["داكن", "neon", '<path d="m12 3 1.9 5.8L20 10l-5 3.8L16.5 20 12 16.5 7.5 20 9 13.8 4 10l6.1-1.2z"/>'], neon: ["نيون", "light", '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'] };
  const themeBtn = document.getElementById("themeBtn");
  function paintPick(){
    const cur = root.getAttribute("data-theme") || sysTheme(), t = THEMES[cur] || THEMES.light, next = THEMES[t[1]];
    themeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${t[2]}</svg>`;
    const label = `المظهر: ${t[0]} (اضغط للتبديل إلى ${next[0]})`; themeBtn.title = label; themeBtn.setAttribute("aria-label", label);
  }
  themeBtn.addEventListener("click", () => {
    const cur = root.getAttribute("data-theme") || sysTheme(), nx = (THEMES[cur] || THEMES.light)[1];
    root.setAttribute("data-theme", nx);
    try { localStorage.setItem("app-theme", nx); } catch {}
    paintPick();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintPick);
  window.addEventListener("app:settings", () => { paintPick(); if (current) document.title = window.Brand ? Brand.title(ROUTES[current]) : ROUTES[current]; });
  paintPick();
})();
