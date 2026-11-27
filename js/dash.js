/* The home page as an executive dashboard. Every number comes from data the site already reads for this person
   (window.Tasks, the requests event, window.Assocs, window.Life), so nothing beyond their permissions shows and nothing
   is stored twice. Modules: the day's summary, KPI cards, the tasks module, upcoming dates (agenda), «تحتاج إلى انتباهك»,
   projects, the personal-life summary and recent activity. A privacy switch blurs personal numbers. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const I = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const tz = "Asia/Riyadh";
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const addDays = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return d.toLocaleDateString("en-CA"); };
  const diff = s => s ? Math.round((new Date(s + "T12:00:00") - new Date(today() + "T12:00:00")) / 864e5) : null;
  const dayName = s => { const d = diff(s); return d === 0 ? "اليوم" : d === 1 ? "غداً" : d === -1 ? "أمس" : new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "short" }).format(new Date(s + "T12:00:00")); };
  const ago = iso => { const m = Math.round((Date.now() - Date.parse(iso)) / 6e4); if (!(m >= 0)) return ""; if (m < 60) return m <= 1 ? "الآن" : `قبل ${m} دقيقة`; const h = Math.round(m / 60); if (h < 24) return h === 1 ? "قبل ساعة" : `قبل ${h} ساعات`; const d = Math.round(h / 24); return d === 1 ? "أمس" : `قبل ${d} أيام`; };
  const can = href => { const a = document.querySelector(`.nav a[href="${href}"]`); return !!a && !a.classList.contains("sec-off") && !(a.closest(".nav-sub") || a).classList.contains("sec-off"); };
  const T = () => window.Tasks;
  const C = () => window.TaskCore;
  let requests = { inbox: [], mine: [] }, tab = "today";
  try { tab = localStorage.getItem("app-dash-tab") || "today"; } catch {}
  let privacy = false; try { privacy = localStorage.getItem("app-privacy") === "1"; } catch {}

  /* ---------- the person's layout (UserPrefs "dash"): mode, visible and ordered cards, KPIs, density ---------- */
  const CARDS = { slider: ["السلايدر", "top"], kpis: ["مؤشرات الأداء", "top"], tasks: ["مهامي", "main"], agenda: ["المواعيد والاستحقاقات", "main"], work: ["متابعة المشاريع والطلبات", "main"],
    attention: ["تحتاج إلى انتباهك", "side"], quick: ["إجراءات سريعة", "side"], life: ["ملخص حياتي الشخصية", "side"], prayer: ["أوقات الصلاة", "side"], activity: ["النشاطات الأخيرة", "side"] };
  const DEFAULT = { mode: "all", order: Object.keys(CARDS), hidden: [], kpis: ["today", "late", "doing", "inbox", "letters", "projects", "goals", "upcoming"], density: "comfortable" };
  // what each mode leaves out (a view of the same data, not separate data)
  const MODE = { all: { cards: [], kpis: [] }, work: { cards: ["life"], kpis: ["goals"] }, personal: { cards: ["work"], kpis: ["inbox", "letters", "projects"] } };
  const pref = () => ({ ...DEFAULT, ...(window.UserPrefs ? UserPrefs.get("dash", {}) : {}) });
  const savePref = p => window.UserPrefs && UserPrefs.set("dash", p);
  // personal: tasks of a life area or marked private; work: the rest
  const inMode = t => { const m = pref().mode, personal = t.scope === "personal" || !!t.area; return m === "work" ? !personal : m === "personal" ? personal : true; };
  function layout(){
    const p = pref(), off = new Set([...p.hidden, ...MODE[p.mode].cards]);
    document.querySelectorAll(".view.home [data-card]").forEach(el => el.classList.toggle("dc-off", off.has(el.dataset.card)));
    const main = document.querySelector(".dh-main"), side = document.querySelector(".dh-side");
    const order = [...p.order, ...Object.keys(CARDS).filter(k => !p.order.includes(k))];
    order.forEach(k => { const el = document.querySelector(`.view.home [data-card="${k}"]`); if (!el) return; const col = CARDS[k][1]; if (col === "main" && main) main.append(el); else if (col === "side" && side) side.append(el); });
    document.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.mode === p.mode)));
    document.documentElement.classList.toggle("density-compact", p.density === "compact");
  }
  document.querySelector(".dh-modes").addEventListener("click", e => { const b = e.target.closest("[data-mode]"); if (!b) return; savePref({ ...pref(), mode: b.dataset.mode }); });
  window.addEventListener("app:prefs", () => { layout(); draw(); });

  function customize(){
    let p = pref();
    const back = document.createElement("div"); back.className = "ui-scrim";
    const box = document.createElement("div"); box.className = "ui-dialog dc-dialog"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "تخصيص لوحة التحكم");
    const item = k => `<li draggable="true" data-k="${k}"><span class="dc-grip" aria-hidden="true">⋮⋮</span><label class="s-check"><input type="checkbox" data-show="${k}"${p.hidden.includes(k) ? "" : " checked"}> <span>${CARDS[k][0]}</span></label><span class="dc-mv"><button type="button" data-up="${k}" aria-label="تحريك ${CARDS[k][0]} للأعلى">↑</button><button type="button" data-down="${k}" aria-label="تحريك ${CARDS[k][0]} للأسفل">↓</button></span></li>`;
    const col = c => p.order.filter(k => CARDS[k] && CARDS[k][1] === c);
    const paint = () => {
      box.innerHTML = `<h2>تخصيص لوحة التحكم</h2><p class="muted-text">تُحفظ لحسابك ولا تؤثر على غيرك. اسحب البطاقة أو استخدم الأسهم لترتيبها.</p>
        <div class="dc-grid"><div><h3>أعلى الصفحة</h3><ul class="dc-list" data-col="top">${col("top").map(item).join("")}</ul><h3>العمود الرئيسي</h3><ul class="dc-list" data-col="main">${col("main").map(item).join("")}</ul></div>
          <div><h3>العمود الجانبي</h3><ul class="dc-list" data-col="side">${col("side").map(item).join("")}</ul>
            <h3>المؤشرات الظاهرة</h3><div class="dc-kpis">${KPI.map(([k, l]) => `<label class="s-check"><input type="checkbox" data-kpi-pick="${k}"${p.kpis.includes(k) ? " checked" : ""}> <span>${l}</span></label>`).join("")}</div>
            <h3>كثافة العرض</h3><div class="fm-seg" role="radiogroup"><button type="button" role="radio" data-density="comfortable" aria-checked="${p.density !== "compact"}">مريح</button><button type="button" role="radio" data-density="compact" aria-checked="${p.density === "compact"}">مضغوط</button></div></div></div>
        <div class="ui-actions"><button type="button" class="btn primary" data-x>تم</button><button type="button" class="btn ghost" data-reset>استعادة التخطيط الافتراضي</button></div>`;
    };
    const commit = () => { savePref(p); };
    const move = (k, d) => { const o = p.order.slice(), sameCol = o.filter(x => CARDS[x][1] === CARDS[k][1]), i = sameCol.indexOf(k), j = i + d; if (j < 0 || j >= sameCol.length) return; const a = o.indexOf(k), b = o.indexOf(sameCol[j]); [o[a], o[b]] = [o[b], o[a]]; p = { ...p, order: o }; commit(); paint(); const f = box.querySelector(`[data-${d < 0 ? "up" : "down"}="${k}"]`); if (f) f.focus(); };
    paint(); document.body.append(back, box);
    const close = () => { back.remove(); box.remove(); document.removeEventListener("keydown", esc, true); };
    const esc = e => { if (e.key === "Escape"){ e.stopPropagation(); close(); } };
    document.addEventListener("keydown", esc, true); back.addEventListener("click", close);
    box.addEventListener("change", e => {
      const s = e.target.dataset.show; if (s){ p = { ...p, hidden: e.target.checked ? p.hidden.filter(x => x !== s) : [...p.hidden, s] }; commit(); }
      const k = e.target.dataset.kpiPick; if (k){ p = { ...p, kpis: e.target.checked ? [...p.kpis, k] : p.kpis.filter(x => x !== k) }; commit(); }
    });
    box.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.up) move(b.dataset.up, -1); else if (b.dataset.down) move(b.dataset.down, 1);
      else if (b.dataset.density){ p = { ...p, density: b.dataset.density }; commit(); paint(); }
      else if (b.dataset.reset !== undefined){ p = { ...DEFAULT, mode: p.mode }; commit(); paint(); UI.toast("استُعيد التخطيط الافتراضي"); }
      else if (b.dataset.x !== undefined) close();
    });
    let dragK = null;
    box.addEventListener("dragstart", e => { const li = e.target.closest("[data-k]"); if (li){ dragK = li.dataset.k; e.dataTransfer.effectAllowed = "move"; } });
    box.addEventListener("dragover", e => { const li = e.target.closest("[data-k]"); if (li && dragK && CARDS[li.dataset.k][1] === CARDS[dragK][1]) e.preventDefault(); });
    box.addEventListener("drop", e => { const li = e.target.closest("[data-k]"); if (!li || !dragK || li.dataset.k === dragK) return; e.preventDefault(); const o = p.order.filter(x => x !== dragK); o.splice(o.indexOf(li.dataset.k), 0, dragK); p = { ...p, order: o }; dragK = null; commit(); paint(); });
    box.querySelector("[data-x]").focus();
  }
  document.getElementById("dhCustomize").addEventListener("click", customize);

  /* ---------- the data, read from what is already loaded ---------- */
  function data(){
    const all = (T() && T().list || []).filter(t => !t.parentId && !t.archived && inMode(t)), open = all.filter(t => !C().CLOSED.has(t.status) && t.status !== "deferred"), td = today();
    const dueToday = open.filter(t => t.due === td), late = open.filter(t => t.due && t.due < td), doing = open.filter(t => t.status === "doing"), waiting = open.filter(t => t.status === "waiting");
    const doneToday = all.filter(t => t.status === "done" && (t.due === td || (t.doneAt && t.doneAt.slice(0, 10) === td)));
    const week = open.filter(t => t.due && t.due > td && t.due <= addDays(td, 7));
    const letters = (T() && T().letters || []).filter(l => l.status !== "cancelled");
    const ym = td.slice(0, 7), prevD = new Date(td + "T12:00:00"); prevD.setMonth(prevD.getMonth() - 1); const pym = prevD.toLocaleDateString("en-CA").slice(0, 7);
    const reviews = []; (window.Assocs ? Assocs.list() : []).forEach(a => Object.entries(a.approvals || {}).forEach(([pid, ap]) => { if (ap && ap.review) reviews.push({ date: ap.review, assoc: a.name, pid }); }));
    const goals = window.Life ? Life.goals().filter(g => g.status !== "done" && g.status !== "paused") : [];
    const projects = (T() && T().projects || []).map(p => ({ ...p, open: open.filter(t => t.projectId === p.id).length, all: all.filter(t => t.projectId === p.id) })).filter(p => p.all.length);
    return { all, open, dueToday, late, doing, waiting, doneToday, week, letters, lThis: letters.filter(l => String(l.createdAt || "").startsWith(ym)).length, lPrev: letters.filter(l => String(l.createdAt || "").startsWith(pym)).length, reviews, goals, projects, td };
  }
  const goalPct = g => {
    const tasks = (T() && T().list || []).filter(t => t.goalId === g.id && t.status !== "cancelled"), done = tasks.filter(t => t.status === "done");
    if (g.measure === "number"){ const cur = (+g.start || 0) + done.reduce((s, t) => s + (+t.goalValue || 0), 0); return +g.target ? Math.min(100, Math.round(cur / g.target * 100)) : 0; }
    return tasks.length ? Math.round(done.length / tasks.length * 100) : 0;
  };

  /* ---------- the day's summary in the welcome bar ---------- */
  function summary(d){
    const parts = [];
    if (d.dueToday.length) parts.push(`${d.dueToday.length} ${d.dueToday.length === 1 ? "مهمة" : "مهام"} اليوم`);
    if (d.late.length) parts.push(`${d.late.length} متأخرة`);
    if (requests.inbox.length && pref().mode !== "personal") parts.push(`${requests.inbox.length} ${requests.inbox.length === 1 ? "طلب" : "طلبات"} بانتظار اعتمادك`);
    $("dhSummary").innerHTML = parts.length ? `لديك ${parts.map(p => `<b>${esc(p)}</b>`).join("، و")}.` : "يومك هادئ: لا مهام مستحقة ولا طلبات بانتظارك.";
  }

  /* ---------- KPI cards ---------- */
  const KPI = [
    ["today", "مهام اليوم", '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 15l2 2 4-4"/>', "#/tasks"],
    ["late", "المهام المتأخرة", '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', "#/tasks"],
    ["doing", "قيد التنفيذ", '<path d="M5 3l14 9-14 9z"/>', "#/tasks"],
    ["inbox", "بانتظار اعتمادك", '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>', "#/hr/requests"],
    ["letters", "خطابات هذا الشهر", '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>', "#/hr/letters"],
    ["projects", "مشاريع نشطة", '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', "#/tasks"],
    ["goals", "أهداف شخصية نشطة", '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', "#/life/goals"],
    ["upcoming", "استحقاقات 7 أيام", '<path d="M5 12h14M13 6l6 6-6 6"/>', "#/tasks"],
  ];
  function kpis(d){
    const box = $("dhKpis"); if (!box) return;
    const rev7 = d.reviews.filter(r => { const x = diff(r.date); return x !== null && x >= 0 && x <= 7; }).length;
    const val = {
      today: [d.dueToday.length, `${d.doneToday.length} أُنجزت اليوم`],
      late: [d.late.length, d.late.length ? "تحتاج متابعة" : "لا شيء متأخر", d.late.length > 0],
      doing: [d.doing.length, `${d.waiting.length} بانتظار طرف آخر`],
      inbox: [requests.inbox.length, requests.inbox.length ? "اعتمدها من صفحة الطلبات" : "لا توجد عناصر بانتظارك", requests.inbox.length > 0],
      letters: [d.lThis, d.lPrev || d.lThis ? `الشهر الماضي ${d.lPrev}` : ""],
      projects: [d.projects.filter(p => p.open).length, `${d.projects.length} مشروع بمهام`],
      goals: [d.goals.length, d.goals.length ? `متوسط التقدّم ${Math.round(d.goals.reduce((s, g) => s + goalPct(g), 0) / d.goals.length)}%` : "أضف هدفك الأول", false, true],
      upcoming: [d.week.length + rev7, rev7 ? `منها ${rev7} مراجعة لائحة` : "مهام مستحقة قريباً"],
    };
    const p = pref(), drop = new Set(MODE[p.mode].kpis);
    const shown = KPI.filter(([k, , , href]) => p.kpis.includes(k) && !drop.has(k) && ((k === "inbox" || k === "letters") ? can(k === "inbox" ? "#/hr/requests" : "#/hr/letters") : k === "goals" ? !!window.Life : can(href)));
    box.classList.toggle("dc-off", !shown.length || p.hidden.includes("kpis"));
    box.innerHTML = shown.map(([k, label, icon]) => { const [n, sub, warn, sens] = val[k];
      return `<button type="button" class="dh-kpi${warn ? " warn" : ""}" data-kpi="${k}"><span class="dh-ki">${I(icon)}</span><span class="dh-kt">${label}</span><b class="${sens ? "sensitive" : ""}">${n}</b><small>${esc(sub || "")}</small></button>`; }).join("");
  }
  $("dhKpis").addEventListener("click", e => {
    const b = e.target.closest("[data-kpi]"); if (!b) return; const k = b.dataset.kpi;
    const list = { today: "today", late: "overdue", doing: "doing", upcoming: "upcoming", projects: "all" }[k];
    if (list){ location.hash = "#/tasks"; setTimeout(() => T() && T().showList && T().showList(list), 60); return; }
    location.hash = (KPI.find(x => x[0] === k) || [])[3] || "#/home";
    if (k === "inbox") setTimeout(() => { const t = document.querySelector('[data-rqtab="inbox"]'); t && t.click(); }, 150);
  });

  /* ---------- the tasks module ---------- */
  const TABS = [["today", "اليوم"], ["late", "المتأخرة"], ["week", "القادمة"], ["waiting", "بانتظار طرف آخر"]];
  function tasksModule(d){
    const box = $("dhTaskBody"); if (!box) return;
    const total = d.dueToday.length + d.doneToday.filter(t => t.due === d.td).length, done = d.doneToday.filter(t => t.due === d.td).length, pct = total ? Math.round(done / total * 100) : 0;
    $("dhTaskRing").innerHTML = total ? `${T().ring(pct, pct >= 100 ? "done" : "good", 44)}<span>${done} من ${total} مهام اليوم</span>` : "";
    const mits = d.all.filter(t => t.mit === d.td);
    const lists = { today: d.dueToday, late: d.late, week: d.week, waiting: d.waiting };
    const RANK = { urgent: 0, high: 1, medium: 2, low: 3 };
    const items = (lists[tab] || []).slice().sort((a, b) => (a.due || "9").localeCompare(b.due || "9") || RANK[a.priority] - RANK[b.priority]).slice(0, 7);
    const row = t => { const pr = C().PR[t.priority], late = t.due && t.due < d.td;
      return `<li class="dh-t${t.status === "done" ? " done" : ""}"><input type="checkbox" data-done="${t.id}"${t.status === "done" ? " checked" : ""} aria-label="مكتملة"><span class="dh-pd" style="--pc:${pr.color}" title="أولوية ${pr.label}"></span><button type="button" class="dh-tt" data-open="${t.id}">${esc(t.title)}</button><span class="dh-due${late ? " late" : ""}">${t.due ? (late ? "متأخرة · " : "") + dayName(t.due) : ""}${t.time && window.SmartTask ? " " + SmartTask.timeLabel(t.time) : ""}</span><button type="button" class="tk-kebab" data-menu="${t.id}" aria-label="خيارات المهمة">⋯</button></li>`; };
    box.innerHTML = (mits.length ? `<div class="dh-mit"><b>★ أهم مهام اليوم</b><ul>${mits.map(row).join("")}</ul></div>` : "") +
      `<div class="dh-tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}<i>${lists[k].length}</i></button>`).join("")}</div>
       <ul class="dh-tl">${items.map(row).join("") || `<li class="dh-calm">${{ today: "لا مهام مستحقة اليوم", late: "لا مهام متأخرة 👏", week: "لا مهام خلال الأيام السبعة القادمة", waiting: "لا مهام بانتظار طرف آخر" }[tab]}</li>`}</ul>
       ${lists[tab].length > 7 ? `<a class="link dh-more" href="#/tasks" data-list="${{ today: "today", late: "overdue", week: "upcoming", waiting: "waiting" }[tab]}">عرض كل ${lists[tab].length} مهمة</a>` : ""}`;
  }
  $("dhTasks").addEventListener("click", e => {
    const tb = e.target.closest("[data-tab]"); if (tb){ tab = tb.dataset.tab; try { localStorage.setItem("app-dash-tab", tab); } catch {} draw(); return; }
    const o = e.target.closest("[data-open]"); if (o){ TaskDetail.open(o.dataset.open); return; }
    const m = e.target.closest("[data-menu]"); if (m){ const t = T().byId.get(m.dataset.menu); if (t && T().actionMenu) T().actionMenu(m, t); return; }
    const more = e.target.closest("[data-list]"); if (more) setTimeout(() => T().showList(more.dataset.list), 60);
  });
  $("dhTasks").addEventListener("change", e => { const id = e.target.dataset.done; if (id) T().update(id, { status: e.target.checked ? "done" : "todo" }); });

  /* ---------- upcoming dates ---------- */
  function agenda(d){
    const box = $("dhAgenda"); if (!box) return;
    const end = addDays(d.td, 14), ev = [];
    d.open.filter(t => t.due && t.due >= d.td && t.due <= end).forEach(t => ev.push({ date: t.due, time: t.time, title: t.title, kind: t.time ? "موعد" : "مهمة", cls: "task", open: t.id }));
    d.reviews.filter(r => r.date >= d.td && r.date <= end).forEach(r => ev.push({ date: r.date, title: `مراجعة لائحة · ${r.assoc}`, kind: "مراجعة لائحة", cls: "rev", href: "#/governance/library" }));
    d.goals.filter(g => g.due && g.due >= d.td && g.due <= end).forEach(g => ev.push({ date: g.due, title: g.title, kind: "موعد هدف", cls: "goal", href: "#/life/goals" }));
    ev.sort((a, b) => a.date.localeCompare(b.date) || String(a.time || "99").localeCompare(String(b.time || "99")));
    let last = "", html = "";
    ev.slice(0, 9).forEach(x => { if (x.date !== last){ html += `<li class="dh-ad">${dayName(x.date)}</li>`; last = x.date; }
      html += `<li class="dh-ae ${x.cls}"><span class="dh-at">${x.time && window.SmartTask ? SmartTask.timeLabel(x.time) : "—"}</span><button type="button" ${x.open ? `data-open="${x.open}"` : `data-href="${x.href}"`}>${esc(x.title)}</button><span class="dh-ak">${x.kind}</span></li>`; });
    box.innerHTML = html || '<li class="dh-calm">لا مواعيد أو استحقاقات خلال الأسبوعين القادمين</li>';
  }
  $("dhAgendaCard").addEventListener("click", e => {
    const o = e.target.closest("[data-open]"); if (o){ TaskDetail.open(o.dataset.open); return; }
    const h = e.target.closest("[data-href]"); if (h){ location.hash = h.dataset.href; return; }
    if (e.target.closest("#dhAddEvent")){ const i = $("tTitle"); if (i){ i.focus(); i.value = "موعد "; } }
  });

  /* ---------- needs your attention ---------- */
  function attention(d){
    const box = $("dhAttn"); if (!box) return;
    const items = [];
    d.late.slice().sort((a, b) => a.due.localeCompare(b.due)).slice(0, 3).forEach(t => items.push({ w: 0, icon: "⏰", t: t.title, s: `متأخرة منذ ${dayName(t.due)}`, open: t.id }));
    if (d.late.length > 3) items.push({ w: 0, icon: "⏰", t: `و${d.late.length - 3} مهام متأخرة أخرى`, s: "", list: "overdue" });
    if (pref().mode !== "personal") requests.inbox.slice(0, 3).forEach(r => items.push({ w: 1, icon: "✉", t: r.title || "طلب", s: `بانتظار اعتمادك · من ${r.submitterName || r.submittedBy || ""}`, href: "#/hr/requests" }));
    (pref().mode === "personal" ? [] : d.reviews).filter(r => { const x = diff(r.date); return x !== null && x <= 7; }).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3).forEach(r => items.push({ w: diff(r.date) < 0 ? 0 : 2, icon: "📘", t: `مراجعة لائحة · ${r.assoc}`, s: diff(r.date) < 0 ? "فات موعدها" : `موعدها ${dayName(r.date)}`, href: "#/governance/library" }));
    d.waiting.filter(t => t.updatedAt && Date.now() - Date.parse(t.updatedAt) > 7 * 864e5).slice(0, 2).forEach(t => items.push({ w: 2, icon: "↻", t: t.title, s: "بانتظار طرف آخر منذ أكثر من أسبوع: تابِعها", open: t.id }));
    d.goals.filter(g => g.due && diff(g.due) !== null && diff(g.due) <= 14 && goalPct(g) < 50).slice(0, 2).forEach(g => items.push({ w: 2, icon: "🎯", t: g.title, s: `الموعد ${dayName(g.due)} والتقدّم ${goalPct(g)}%`, href: "#/life/goals", sens: true }));
    items.sort((a, b) => a.w - b.w);
    $("dhAttnCard").classList.toggle("calm", !items.length);
    $("dhAttnN").textContent = items.length || "";
    box.innerHTML = items.map(x => `<li class="dh-ai w${x.w}"><span>${x.icon}</span><button type="button" ${x.open ? `data-open="${x.open}"` : x.list ? `data-list="${x.list}"` : `data-href="${x.href}"`}><b class="${x.sens ? "sensitive" : ""}">${esc(x.t)}</b><small>${esc(x.s)}</small></button></li>`).join("") || '<li class="dh-calm">✓ كل شيء تحت السيطرة، لا شيء يحتاج تدخلك الآن.</li>';
  }
  $("dhAttnCard").addEventListener("click", e => {
    const o = e.target.closest("[data-open]"); if (o){ TaskDetail.open(o.dataset.open); return; }
    const l = e.target.closest("[data-list]"); if (l){ location.hash = "#/tasks"; setTimeout(() => T().showList(l.dataset.list), 60); return; }
    const h = e.target.closest("[data-href]"); if (h){ location.hash = h.dataset.href; if (h.dataset.href === "#/hr/requests") setTimeout(() => { const t = document.querySelector('[data-rqtab="inbox"]'); t && t.click(); }, 150); }
  });

  /* ---------- projects ---------- */
  function projects(d){
    const box = $("dhProjects"); if (!box) return;
    const list = d.projects.slice().sort((a, b) => b.open - a.open).slice(0, 5);
    $("dhProjCard").hidden = !list.length;
    box.innerHTML = list.map(p => { const pct = C().groupProgress(p.all, T().childrenOf) ?? 0, late = p.all.filter(t => t.due && t.due < d.td && !C().CLOSED.has(t.status)).length;
      return `<li><span class="dh-pdot" style="background:${esc(p.color || "var(--accent)")}"></span><span class="dh-pn">${esc(p.name)}</span>${T().bar(pct, C().progressTone(pct, late ? "late" : "ok"))}<span class="dh-pv">${pct}%</span>${late ? `<span class="dh-pl">${late} متأخرة</span>` : ""}</li>`; }).join("");
  }

  /* ---------- the personal-life summary ---------- */
  function personal(d){
    const box = $("dhPersonal"); if (!box) return;
    $("dhLifeCard").hidden = !window.Life;
    if (!window.Life) return;
    const areas = (window.LifeAreas || []).map(a => { const gs = d.goals.filter(g => g.area === a.id); return { a, n: gs.length, pct: gs.length ? Math.round(gs.reduce((s, g) => s + goalPct(g), 0) / gs.length) : null }; }).filter(x => x.n);
    const habits = Life.habits ? Life.habits() : [], hDone = habits.filter(h => (h.log || {})[d.td]).length;
    const pri = d.open.filter(t => t.area).sort((a, b) => ({ urgent: 0, high: 1, medium: 2, low: 3 }[a.priority] - { urgent: 0, high: 1, medium: 2, low: 3 }[b.priority]) || (a.due || "9").localeCompare(b.due || "9")).slice(0, 3);
    box.innerHTML = `<div class="dh-lifestats sensitive"><div><b>${d.goals.length}</b><span>أهداف نشطة</span></div><div><b>${hDone}/${habits.length}</b><span>عادات اليوم</span></div></div>
      ${areas.length ? `<ul class="dh-areas sensitive">${areas.map(x => `<li><a href="#/life/${x.a.id}"><span class="dh-adot" style="background:${x.a.color}"></span>${esc(x.a.short)}</a>${T() ? T().bar(x.pct, "good") : ""}<span>${x.pct}%</span></li>`).join("")}</ul>` : '<p class="muted-text">لا أهداف بعد. <a class="link" href="#/life/goals">أضف هدفاً</a></p>'}
      ${pri.length ? `<p class="dh-sub">أهم الأولويات الشخصية</p><ul class="dh-tl sensitive">${pri.map(t => `<li class="dh-t"><span class="dh-pd" style="--pc:${C().PR[t.priority].color}"></span><button type="button" class="dh-tt" data-open="${t.id}">${esc(t.title)}</button></li>`).join("")}</ul>` : ""}`;
  }
  $("dhLifeCard").addEventListener("click", e => { const o = e.target.closest("[data-open]"); if (o) TaskDetail.open(o.dataset.open); });

  /* ---------- recent activity ---------- */
  function activity(d){
    const box = $("dhActivity"); if (!box) return;
    const ev = [];
    d.all.forEach(t => { if (t.doneAt && t.status === "done") ev.push({ at: t.doneAt, t: `أنجزت «${t.title}»`, icon: "✓", open: t.id }); else if (t.createdAt) ev.push({ at: t.createdAt, t: `أضفت مهمة «${t.title}»`, icon: "+", open: t.id }); });
    d.letters.forEach(l => { if (l.createdAt) ev.push({ at: l.createdAt, t: `خطاب ${l.title || ""}${l.ref ? " · " + l.ref : ""}`, icon: "✉", href: "#/hr/letters" }); });
    [...requests.inbox, ...requests.mine].forEach(r => { if (r.updatedAt) ev.push({ at: r.updatedAt, t: `طلب «${r.title || ""}»`, icon: "⇄", href: "#/hr/requests" }); });
    const seen = new Set(), list = ev.filter(x => x.at && Date.parse(x.at)).sort((a, b) => String(b.at).localeCompare(String(a.at))).filter(x => { const k = x.t; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
    box.innerHTML = list.map(x => `<li><span class="dh-ic">${x.icon}</span><button type="button" ${x.open ? `data-open="${x.open}"` : `data-href="${x.href}"`}>${esc(x.t)}</button><small>${ago(x.at)}</small></li>`).join("") || '<li class="dh-calm">لا نشاط بعد</li>';
  }
  $("dhActCard").addEventListener("click", e => { const o = e.target.closest("[data-open]"); if (o){ TaskDetail.open(o.dataset.open); return; } const h = e.target.closest("[data-href]"); if (h) location.hash = h.dataset.href; });

  /* ---------- privacy: blur personal numbers (sharing the screen, a public place) ---------- */
  function paintPrivacy(){ document.documentElement.classList.toggle("privacy", privacy); const b = $("privBtn"); b.setAttribute("aria-pressed", String(privacy)); b.title = privacy ? "إظهار المعلومات الشخصية" : "إخفاء المعلومات الشخصية"; b.setAttribute("aria-label", b.title); }
  $("privBtn").addEventListener("click", () => { privacy = !privacy; try { localStorage.setItem("app-privacy", privacy ? "1" : "0"); } catch {} paintPrivacy(); });
  paintPrivacy();

  /* ---------- drawing ---------- */
  let timer = 0;
  function draw(){
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!T() || !C()) return;
      const signed = !!(T().db);
      document.querySelector(".view.home").classList.toggle("signed", signed);
      if (!signed) return;
      layout(); const d = data(); summary(d); kpis(d); tasksModule(d); agenda(d); attention(d); projects(d); personal(d); activity(d);
    }, 30);
  }
  window.addEventListener("app:requests", e => { requests = { inbox: e.detail.inbox || [], mine: e.detail.mine || [] }; draw(); });
  ["app:tasks", "app:assocs", "app:life", "app:auth", "app:db"].forEach(ev => window.addEventListener(ev, draw));
  window.addEventListener("app:view", e => { if (e.detail === "home") draw(); });
  setInterval(() => { if (!document.hidden) draw(); }, 5 * 60 * 1000);
  draw();
})();
