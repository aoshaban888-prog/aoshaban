/* Navigation helpers on top of the shell (js/shell.js):
   - the sidebar folded to icons (tooltips, and a small menu for a section's pages),
   - favourites pinned at the top of the sidebar (a star on each page; saved per account on this device),
   - breadcrumbs in the header,
   - the search palette (Ctrl+K / ⌘K): pages, recent pages and searches, and the person's own data the site already has
     loaded (tasks, goals, associations, policies, letters), so nothing beyond their permissions can show,
   - the quick-add menu (+) with the actions this account can use. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const app = document.querySelector(".app"), nav = document.querySelector(".nav");
  const me = () => ((window.appUser && window.appUser.email) || "guest").toLowerCase();
  const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(`app-${k}-${me()}`) || "null"); localStorage.setItem(`app-${k}-${me()}`, JSON.stringify(v)); } catch { return null; } };
  const label = a => (a.textContent || "").replace(/\s+/g, " ").trim();
  const visible = el => el && !el.classList.contains("sec-off") && !(el.closest(".nav-sub") || el).classList.contains("sec-off");

  /* ---------- every page of the site, read from the sidebar itself ---------- */
  function pages(){
    const out = [];
    nav.querySelectorAll("a[href^='#/']").forEach(a => {
      if (a.closest(".nav-fav")) return;
      const sub = a.closest(".nav-sub"), btn = sub && document.querySelector(`[aria-controls="${sub.id}"]`);
      if (!visible(a)) return;
      out.push({ href: a.getAttribute("href"), name: label(a), group: btn ? label(btn) : "", icon: (a.querySelector("svg") || {}).outerHTML || "" });
    });
    return out;
  }

  /* ---------- tooltips and the folded sidebar ---------- */
  function tips(){ nav.querySelectorAll("a, .nav-group").forEach(el => { el.dataset.tip = label(el); }); }
  let fly = null;
  const closeFly = () => { if (fly){ fly.remove(); fly = null; } };
  nav.addEventListener("click", e => {
    const g = e.target.closest(".nav-group"); if (!g || !app.classList.contains("side-mini") || innerWidth <= 900) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (fly && fly.dataset.for === g.id){ closeFly(); return; } closeFly();
    const sub = $(g.getAttribute("aria-controls")); if (!sub) return;
    fly = document.createElement("div"); fly.className = "nav-fly"; fly.dataset.for = g.id;
    fly.innerHTML = `<b>${esc(label(g))}</b>` + [...sub.querySelectorAll("a")].filter(visible).map(a => `<a href="${a.getAttribute("href")}">${(a.querySelector("svg") || {}).outerHTML || ""}${esc(label(a))}</a>`).join("");
    document.body.append(fly);
    const r = g.getBoundingClientRect(); fly.style.top = Math.min(r.top, innerHeight - fly.offsetHeight - 8) + "px"; fly.style.insetInlineStart = (r.right - r.left + 12 + (innerWidth - r.right)) + "px";
    fly.addEventListener("click", e2 => { if (e2.target.closest("a")) closeFly(); });
  }, true);
  document.addEventListener("pointerdown", e => { if (fly && !fly.contains(e.target) && !e.target.closest(".nav-group")) closeFly(); });
  window.addEventListener("hashchange", closeFly);

  /* ---------- favourites ---------- */
  const STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>';
  let favs = [];
  function drawFavs(){
    favs = store("favs") || [];
    let box = nav.querySelector(".nav-fav");
    const all = pages(), list = favs.map(h => all.find(p => p.href === h)).filter(Boolean);
    if (!list.length){ if (box) box.remove(); }
    else {
      if (!box){ box = document.createElement("div"); box.className = "nav-fav"; nav.querySelector("a[href='#/home']").after(box); }
      box.innerHTML = `<p class="nav-cap">المفضلة</p>` + list.map(p => `<a href="${p.href}" data-tip="${esc(p.name)}">${p.icon}${esc(p.name)}</a>`).join("");
    }
    nav.querySelectorAll("a[href^='#/']").forEach(a => {
      if (a.closest(".nav-fav") || a.getAttribute("href") === "#/home") return;
      let s = a.querySelector(".nav-star");
      if (!s){ s = document.createElement("button"); s.type = "button"; s.className = "nav-star"; s.innerHTML = STAR; a.append(s); }
      const on = favs.includes(a.getAttribute("href")); s.classList.toggle("on", on);
      s.setAttribute("aria-label", on ? "إزالة من المفضلة" : "إضافة إلى المفضلة"); s.title = s.getAttribute("aria-label");
    });
    markCurrent();
  }
  nav.addEventListener("click", e => {
    const s = e.target.closest(".nav-star"); if (!s) return;
    e.preventDefault(); e.stopPropagation();
    const h = s.closest("a").getAttribute("href"); favs = store("favs") || [];
    favs = favs.includes(h) ? favs.filter(x => x !== h) : [...favs, h].slice(-8); store("favs", favs); drawFavs();
    UI.toast(favs.includes(h) ? "أُضيفت إلى المفضلة" : "أُزيلت من المفضلة");
  });
  function markCurrent(){ const r = "#/" + location.hash.replace(/^#\/?/, ""); nav.querySelectorAll(".nav-fav a").forEach(a => { if (a.getAttribute("href") === r) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); }); }

  /* ---------- breadcrumbs and recent pages ---------- */
  function crumbs(){
    const r = location.hash.replace(/^#\/?/, "") || "home", box = $("crumbs"); if (!box) return;
    const p = pages().find(x => x.href === "#/" + r);
    const parts = [`<a href="#/home">الرئيسية</a>`];
    if (p && r !== "home"){ if (p.group) parts.push(`<span>${esc(p.group)}</span>`); parts.push(`<b aria-current="page">${esc(p.name)}</b>`); }
    box.innerHTML = parts.join('<i aria-hidden="true">/</i>');
    if (p && r !== "home"){ const rec = (store("recent") || []).filter(h => h !== p.href); rec.unshift(p.href); store("recent", rec.slice(0, 6)); }
    markCurrent();
  }
  window.addEventListener("hashchange", () => setTimeout(crumbs, 0));

  /* ---------- the search palette ---------- */
  const KINDS = { page: "الصفحات", recent: "زرتها مؤخراً", task: "المهام", goal: "الأهداف", assoc: "الجمعيات", policy: "اللوائح والسياسات", letter: "الخطابات" };
  const norm = s => String(s || "").toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[ًٌٍَُِّْـ]/g, "");
  let pal = null, items = [], sel = 0;
  function openPalette(){
    if (pal) return;
    pal = document.createElement("div"); pal.className = "pal-back";
    pal.innerHTML = `<div class="pal" role="dialog" aria-modal="true" aria-label="البحث"><div class="pal-in"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="palQ" placeholder="ابحث في الصفحات والمهام والأهداف والجمعيات واللوائح والخطابات…" autocomplete="off" aria-label="بحث"><kbd>Esc</kbd></div><div class="pal-res" id="palRes" role="listbox"></div><p class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> للتنقل</span><span><kbd>Enter</kbd> للفتح</span><span>تظهر فقط البيانات المتاحة لحسابك</span></p></div>`;
    document.body.append(pal);
    const q = $("palQ"); q.focus(); search("");
    q.addEventListener("input", () => search(q.value));
    q.addEventListener("keydown", e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % Math.max(1, items.length); paintSel(); }
      else if (e.key === "Enter"){ e.preventDefault(); if (items[sel]) go(items[sel], q.value); }
    });
    pal.addEventListener("pointerdown", e => { if (e.target === pal) closePalette(); });
    pal.addEventListener("click", e => { const b = e.target.closest("[data-i]"); if (b) go(items[+b.dataset.i], $("palQ").value); });
  }
  function closePalette(){ if (pal){ pal.remove(); pal = null; } }
  function search(text){
    const t = norm(text.trim()), all = pages(), has = s => norm(s).includes(t);
    items = [];
    if (!t){
      (store("recent") || []).map(h => all.find(p => p.href === h)).filter(Boolean).forEach(p => items.push({ kind: "recent", title: p.name, sub: p.group, href: p.href, icon: p.icon }));
      const rs = store("searches") || [];
      rs.forEach(s => items.push({ kind: "search", title: s, sub: "بحث سابق", again: s }));
      all.slice(0, 8).forEach(p => items.push({ kind: "page", title: p.name, sub: p.group, href: p.href, icon: p.icon }));
    } else {
      all.filter(p => has(p.name) || has(p.group)).forEach(p => items.push({ kind: "page", title: p.name, sub: p.group, href: p.href, icon: p.icon }));
      const T = window.Tasks;
      if (T && T.list) T.list.filter(x => !x.archived && (has(x.title) || has(x.description) || (x.tags || []).some(has))).slice(0, 8).forEach(x => items.push({ kind: "task", title: x.title, sub: [{ done: "مكتملة" }[x.status] || "", x.due || ""].filter(Boolean).join(" · "), task: x.id }));
      if (window.Life && Life.goals) Life.goals().filter(g => has(g.title)).slice(0, 5).forEach(g => items.push({ kind: "goal", title: g.title, sub: "هدف شخصي", href: "#/life/goals" }));
      const adminLink = document.querySelector('a[href="#/orgs/associations"]');
      if (window.Assocs && visible(adminLink)) Assocs.list().filter(a => has(a.name) || has(a.shortName) || has(a.city)).slice(0, 5).forEach(a => items.push({ kind: "assoc", title: a.name, sub: a.city || "", href: "#/orgs/associations" }));
      if (T && T.policies) T.policies.filter(p => has(p.title)).slice(0, 5).forEach(p => items.push({ kind: "policy", title: p.title, sub: "لائحة", policy: p.id }));
      if (T && T.letters) T.letters.filter(l => has(l.title) || has(l.ref) || has(l.employee) || has(l.assoc)).slice(0, 5).forEach(l => items.push({ kind: "letter", title: l.title || "خطاب", sub: [l.ref, l.employee].filter(Boolean).join(" · "), href: "#/hr/letters" }));
    }
    sel = 0; paint(text);
  }
  function paint(text){
    const box = $("palRes"); if (!box) return;
    if (!items.length){ box.innerHTML = `<p class="pal-none">لا نتائج لـ«${esc(text)}»</p>`; return; }
    let last = "", html = "";
    items.forEach((it, i) => {
      const k = it.kind === "search" ? "searches" : it.kind;
      if (k !== last){ html += `<p class="pal-h">${{ searches: "عمليات بحث سابقة", ...KINDS }[k]}</p>`; last = k; }
      html += `<button type="button" class="pal-i" role="option" data-i="${i}"><span class="pal-ic">${it.icon || { task: "☑", goal: "🎯", assoc: "🏛", policy: "📘", letter: "✉", search: "↺" }[it.kind] || "•"}</span><span class="pal-t">${esc(it.title)}</span><span class="pal-s">${esc(it.sub || "")}</span></button>`;
    });
    box.innerHTML = html; paintSel();
  }
  function paintSel(){ document.querySelectorAll(".pal-i").forEach(b => b.setAttribute("aria-selected", String(+b.dataset.i === sel))); const s = document.querySelector('.pal-i[aria-selected="true"]'); if (s) s.scrollIntoView({ block: "nearest" }); }
  function go(it, text){
    if (it.kind === "search"){ $("palQ").value = it.again; search(it.again); return; }
    if (text && text.trim()){ const rs = (store("searches") || []).filter(s => s !== text.trim()); rs.unshift(text.trim()); store("searches", rs.slice(0, 5)); }
    closePalette();
    if (it.task){ location.hash = "#/tasks"; setTimeout(() => window.TaskDetail && TaskDetail.open(it.task), 150); }
    else if (it.policy){ location.hash = "#/governance/library"; setTimeout(() => window.dispatchEvent(new CustomEvent("app:open-policy", { detail: it.policy })), 200); }
    else if (it.href) location.hash = it.href;
  }
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K" || e.code === "KeyK")){ e.preventDefault(); pal ? closePalette() : openPalette(); }
    else if (e.key === "Escape" && pal){ e.preventDefault(); closePalette(); }
  });

  /* ---------- quick add ---------- */
  const can = href => visible(document.querySelector(`.nav a[href="${href}"]`));
  function actions(){
    const out = [];
    if (can("#/tasks") && window.TaskDetail) out.push(["مهمة جديدة", "☑", () => { location.hash = "#/tasks"; setTimeout(() => TaskDetail.open(null), 120); }]);
    if (can("#/tasks") && window.TaskDetail) out.push(["تذكير أو موعد", "⏰", () => { location.hash = "#/tasks"; setTimeout(() => { const i = $("tkQuickIn"); if (i){ i.focus(); i.value = "ذكرني "; } }, 200); }]);
    if (window.Life && Life.newGoal) out.push(["هدف شخصي", "🎯", () => { location.hash = "#/life/goals"; setTimeout(() => Life.newGoal(), 200); }]);
    if (window.Life && Life.addNote) out.push(["ملاحظة أو فكرة", "💡", async () => { const v = await UI.prompt("اكتب الفكرة أو الملاحظة", { title: "ملاحظة سريعة", ok: "حفظ", note: "", noteRequired: true, placeholder: "فكرة…" }); if (v) Life.addNote(v.note); }]);
    if (can("#/hr/letters")) out.push(["خطاب أو طلب إداري", "✉", () => { location.hash = "#/hr/letters"; }]);
    if (can("#/projects/forms")) out.push(["استبيان", "📋", () => { location.hash = "#/projects/forms"; setTimeout(() => { const b = $("fmNew"); if (b) b.click(); }, 250); }]);
    if (can("#/projects/initiatives")) out.push(["وثيقة مبادرة", "📄", () => { location.hash = "#/projects/initiatives"; }]);
    return out;
  }
  let qa = null;
  const closeQa = () => { if (qa){ qa.remove(); qa = null; $("qaBtn").setAttribute("aria-expanded", "false"); } };
  $("qaBtn").addEventListener("click", e => {
    e.stopPropagation(); if (qa){ closeQa(); return; }
    const list = actions(); qa = document.createElement("div"); qa.className = "qa-menu"; qa.setAttribute("role", "menu");
    qa.innerHTML = `<p class="nav-cap">إضافة سريعة</p>` + (list.map(([l, ic], i) => `<button type="button" role="menuitem" data-q="${i}"><span>${ic}</span>${esc(l)}</button>`).join("") || '<p class="muted-text">لا إجراءات متاحة لحسابك</p>');
    $("qaBtn").parentElement.append(qa); $("qaBtn").setAttribute("aria-expanded", "true");
    qa.addEventListener("click", ev => { const b = ev.target.closest("[data-q]"); if (!b) return; closeQa(); list[+b.dataset.q][2](); });
  });
  document.addEventListener("pointerdown", e => { if (qa && !qa.contains(e.target) && e.target.id !== "qaBtn") closeQa(); });
  $("searchBtn").addEventListener("click", openPalette);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || ""); const k = $("searchKbd"); if (k) k.textContent = mac ? "⌘K" : "Ctrl K";

  /* ---------- favourites in the header ---------- */
  let fm = null;
  const closeFm = () => { if (fm){ fm.remove(); fm = null; $("favBtn").setAttribute("aria-expanded", "false"); } };
  $("favBtn").addEventListener("click", e => {
    e.stopPropagation(); if (fm){ closeFm(); return; }
    const all = pages(), list = (store("favs") || []).map(h => all.find(p => p.href === h)).filter(Boolean);
    fm = document.createElement("div"); fm.className = "qa-menu"; fm.setAttribute("role", "menu");
    fm.innerHTML = `<p class="nav-cap">الصفحات المفضلة</p>` + (list.map(p => `<a role="menuitem" href="${p.href}">${p.icon}<span>${esc(p.name)}</span></a>`).join("") || '<p class="muted-text fav-empty">لا توجد صفحات مفضلة بعد. مرّر على أي صفحة في القائمة الجانبية واضغط ☆ لتثبيتها.</p>');
    $("favBtn").parentElement.append(fm); $("favBtn").setAttribute("aria-expanded", "true");
    fm.addEventListener("click", ev => { if (ev.target.closest("a")) closeFm(); });
  });
  document.addEventListener("pointerdown", e => { if (fm && !fm.contains(e.target) && !e.target.closest("#favBtn")) closeFm(); });

  /* ---------- start ---------- */
  function refresh(){ tips(); drawFavs(); crumbs(); }
  window.addEventListener("app:auth", () => setTimeout(refresh, 50));
  window.addEventListener("app:me", () => setTimeout(refresh, 50));
  refresh();
  window.Nav = { openPalette, refresh };
})();
