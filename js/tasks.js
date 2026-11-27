/* المهام: the task store (Firestore, the person's own and assigned tasks; an admin sees all), the board and the list,
   and the progress summary. The task panel (open, edit, subtasks, checklist, comments, activity) is js/task-detail.js;
   the logic (progress, recurrence, dependencies, checks) is js/task-core.js.
   Other pages read tasks from the "app:tasks" event and change them through window.Tasks. */
(() => {
  const $ = id => document.getElementById(id);
  const C = window.TaskCore;
  const DONE_SHOWN = 30;
  let db = null, me = "", myName = "", admin = null, unsubs = [];
  let sources = {}, tasks = [], byId = new Map(), kids = new Map(), projects = [], people = [], policies = [], letters = [];
  let view = "board", dragId = null, loaded = false, hidden = new Set();
  try { const v = localStorage.getItem("app-tasks-view"); view = ["list", "board", "table", "cal", "matrix", "reports"].includes(v) ? v : "board"; } catch {}

  const today = () => C.ymd(new Date());
  const dayDiff = s => s ? Math.round((new Date(s + "T00:00:00") - new Date(today() + "T00:00:00")) / 86400000) : null;
  const fmtShort = s => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short" }).format(new Date(s + "T00:00:00"));
  function dueLabel(s){
    const d = dayDiff(s); if (d === null) return "";
    if (d < 0) return d === -1 ? "متأخرة يوماً" : d === -2 ? "متأخرة يومين" : `متأخرة ${-d} أيام`;
    if (d === 0) return "اليوم"; if (d === 1) return "غداً";
    return fmtShort(s);
  }
  const q = () => ($("tkQ").value || "").trim();
  const areaName = id => { const a = (window.LifeAreas || []).find(x => x.id === id); return a ? a.name : ""; };
  const textOf = t => [t.title, t.description, ...(t.tags || []), t.link && t.link.label, areaName(t.area), (projectOf(t.projectId) || {}).name].join(" ");
  /* the smart lists: worked out from each task's own fields, so a task is never stored twice */
  let list = "all", filt = { priority: "", area: "", project: "", status: "" }, sortBy = "smart", statsHidden = false;
  try { const s = JSON.parse(localStorage.getItem("app-tasks-ui") || "{}"); list = s.list || "all"; filt = { ...filt, ...(s.filt || {}) }; sortBy = s.sortBy || "smart"; statsHidden = !!s.statsHidden; } catch {}
  const saveUi = () => { try { localStorage.setItem("app-tasks-ui", JSON.stringify({ list, filt, sortBy, statsHidden })); } catch {} };
  const isOpen = t => !C.CLOSED.has(t.status);
  const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return C.ymd(d); };
  const LISTS = [
    ["all", "كل المهام", t => !t.archived && isOpen(t), '<path d="M4 6h16M4 12h16M4 18h16"/>'],
    ["inbox", "صندوق الوارد", t => !t.archived && isOpen(t) && !t.due && !t.area && !t.projectId && !t.goalId, '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>'],
    ["today", "اليوم", t => !t.archived && isOpen(t) && t.due === today(), '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'],
    ["tomorrow", "الغد", t => !t.archived && isOpen(t) && t.due === addDays(1), '<path d="M17 18a5 5 0 1 0-10 0"/><path d="M12 2v7M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M8 6l4-4 4 4"/>'],
    ["week", "هذا الأسبوع", t => !t.archived && isOpen(t) && t.due && t.due >= today() && t.due <= addDays(6), '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'],
    ["upcoming", "القادمة", t => !t.archived && isOpen(t) && t.due && t.due > today(), '<path d="M5 12h14M13 6l6 6-6 6"/>'],
    ["overdue", "المتأخرة", t => !t.archived && isOpen(t) && t.due && t.due < today(), '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
    ["doing", "قيد التنفيذ", t => !t.archived && t.status === "doing", '<path d="M5 3l14 9-14 9z"/>'],
    ["waiting", "بانتظار طرف آخر", t => !t.archived && t.status === "waiting", '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5"/><circle cx="17" cy="16" r="4"/><path d="M17 14v2l1 1"/>'],
    ["recurring", "المتكررة", t => !t.archived && isOpen(t) && !!t.recurrence, '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>'],
    ["nodate", "دون موعد", t => !t.archived && isOpen(t) && !t.due, '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M9 15l6 4M15 15l-6 4"/>'],
    ["done", "المكتملة", t => !t.archived && t.status === "done", '<path d="M20 6 9 17l-5-5"/>'],
    ["archived", "المؤرشفة", t => t.archived, '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>'],
  ];
  const LIST = Object.fromEntries(LISTS.map(l => [l[0], l]));
  const inList = t => (LIST[list] || LIST.all)[2](t);
  const passFilters = t => (!filt.priority || t.priority === filt.priority) && (!filt.area || (filt.area === "_none" ? !t.area : t.area === filt.area))
    && (!filt.project || (filt.project === "_none" ? !t.projectId : t.projectId === filt.project)) && (!filt.status || t.status === filt.status);
  const matches = t => inList(t) && passFilters(t) && (!q() || textOf(t).includes(q()));
  const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt));
  const childrenOf = id => kids.get(id) || [];
  const pct = t => C.progress(t, childrenOf(t.id));
  const personName = e => { if (!e) return ""; const p = people.find(x => x.email === e); return (p && p.name) || e.split("@")[0]; };
  const projectOf = id => projects.find(p => p.id === id) || null;
  const canEdit = t => admin || t.owner === me || t.assignee === me || !t.owner;

  /* ---------- reading: an admin reads everything, others their own and what is assigned to them ---------- */
  function rebuild(){
    const all = new Map(); Object.values(sources).forEach(m => m.forEach((v, k) => all.set(k, v)));
    tasks = [...all.entries()].filter(([id]) => !hidden.has(id)).map(([id, d]) => C.normalize(d, id));
    byId = new Map(tasks.map(t => [t.id, t]));
    kids = new Map(); tasks.forEach(t => { if (t.parentId){ if (!kids.has(t.parentId)) kids.set(t.parentId, []); kids.get(t.parentId).push(t); } });
    loaded = true; render();
    window.dispatchEvent(new CustomEvent("app:tasks", { detail: { tasks, byId, me, admin } }));
    if (admin) migrate(all);
    markScope(all);
  }
  function listen(name, ref){
    unsubs.push(ref.onSnapshot(s => { sources[name] = new Map(s.docs.map(d => [d.id, d.data()])); rebuild(); },
      e => { console.error(e); if (e && e.code !== "permission-denied") UI.toast("تعذّر تحميل البيانات. أعد المحاولة.", "err"); }));
  }
  function subscribe(){
    unsubs.forEach(u => u && u()); unsubs = []; sources = {};
    const col = db.collection("tasks");
    if (admin){ listen("own", col.where("owner", "==", me)); listen("assigned", col.where("assignee", "==", me)); listen("work", col.where("scope", "==", "work")); }
    else { listen("own", col.where("owner", "==", me)); listen("assigned", col.where("assignee", "==", me)); }
  }

  /* ---------- bringing older tasks to schema 2 (once, by an admin, after a backup file) ---------- */
  let migrating = false;
  async function migrate(all){
    const old = [...all.entries()].filter(([, d]) => d.schema !== C.SCHEMA);
    if (!old.length || migrating) return; migrating = true;
    try {
      const backup = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), tasks: Object.fromEntries(old) }, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(backup); a.download = `tasks-backup-${today()}.json`; document.body.append(a); a.click(); a.remove();
      for (let i = 0; i < old.length; i += 400){
        const b = db.batch(); old.slice(i, i + 400).forEach(([id, d]) => b.update(db.collection("tasks").doc(id), C.migrationPatch(d, me))); await b.commit();
      }
      UI.toast(`حُدّثت ${old.length} مهمة للنظام الجديد، ونزلت نسخة احتياطية منها`);
    } catch (e){ console.error(e); UI.toast("تعذّر تحديث المهام القديمة", "err"); }
    finally { migrating = false; }
  }

  // once, by an admin: every older task gets scope "work" so the privacy rule can be switched on without hiding anything
  let scoping = false;
  async function markScope(all){
    const old = [...all.entries()].filter(([, d]) => !d.scope && (admin || d.owner === me));
    if (!old.length || scoping) return; scoping = true;
    try { for (let i = 0; i < old.length; i += 400){ const b = db.batch(); old.slice(i, i + 400).forEach(([id]) => b.update(db.collection("tasks").doc(id), { scope: "work" })); await b.commit(); } console.info(`scope: ${old.length} tasks marked work`); }
    catch (e){ console.error(e); }
    finally { scoping = false; }
  }

  /* ---------- writing ---------- */
  const actRef = id => db.collection("tasks").doc(id).collection("activity");
  function log(id, entries){
    const at = new Date().toISOString();
    entries.forEach(x => actRef(id).add({ at, by: me, name: myName, ...x }).catch(() => {}));
  }
  async function create(data, opts = {}){
    if (!db) throw new Error("signed_out");
    const t = C.normalize({ ...data, owner: me, title: (data.title || "").trim(), scope: data.scope || (data.area ? "personal" : "work") });
    const errs = C.validate(t); if (errs.length){ UI.toast(errs[0], "err"); throw new Error(errs[0]); }
    if (t.dependsOn.some(d => !byId.has(d))) t.dependsOn = t.dependsOn.filter(d => byId.has(d));
    const now = new Date().toISOString();
    const col = tasks.filter(x => x.status === t.status && !x.parentId);
    const doc = { ...t, id: undefined, owner: me, order: (col.length ? Math.max(...col.map(x => x.order)) : 0) + 1000, createdAt: now, updatedAt: now, doneAt: t.status === "done" ? now : null, schema: C.SCHEMA };
    delete doc.id;
    const ref = await db.collection("tasks").add(doc);
    if (opts.log !== false) log(ref.id, [{ action: "create", text: opts.logText || "أنشأ المهمة" }]);
    return ref.id;
  }
  // patch: only the changed fields; checks run on the whole task; the change goes to the activity log
  async function update(id, patch, opts = {}){
    const before = byId.get(id); if (!before || !db) return false;
    const prev = JSON.parse(JSON.stringify(before));
    const after = C.normalize({ ...before, ...patch }, id);
    const errs = C.validate(after); if (errs.length){ UI.toast(errs[0], "err"); return false; }
    if (patch.status && patch.status !== prev.status && !C.canMoveTo(after, patch.status, byId)){
      UI.toast(`المهمة تنتظر: ${C.blockers(after, byId).map(b => "«" + b.title + "»").join("، ")}`, "err"); return false;
    }
    const now = new Date().toISOString(), write = { ...patch, updatedAt: now };
    if (patch.status === "done" && prev.status !== "done") write.doneAt = now;
    if (patch.status && patch.status !== "done") write.doneAt = null;
    if (patch.status === "waiting" && prev.status !== "waiting" && !patch.waitingSince) write.waitingSince = now;
    if (prev.schema !== C.SCHEMA || !prev.owner) Object.assign(write, C.migrationPatch({ ...prev, ...patch }, prev.owner || me), { ...patch, updatedAt: now });
    // optimistic: the page changes now, Firestore confirms (or the change is rolled back with a message)
    Object.assign(before, after); render();
    try { await db.collection("tasks").doc(id).update(write); }
    catch (e){ console.error(e); UI.toast(e && e.code === "permission-denied" ? "لا تملك صلاحية تعديل هذه المهمة" : "تعذّر حفظ التغيير. أعد المحاولة.", "err"); rebuild(); return false; }
    if (opts.log !== false){ const ch = C.changes(prev, after); if (ch.length) log(id, ch.map(c => ({ action: "change", ...c }))); }
    if (patch.status === "done" && prev.status !== "done"){ if (after.recurrence && !prev.nextSpawned) spawnNext(after); celebrate(); }
    return true;
  }
  async function spawnNext(t){
    const n = C.nextOccurrence(t); if (!n) return;
    try {
      await db.collection("tasks").doc(t.id).update({ nextSpawned: true });
      const id = await create({ ...n, owner: t.owner }, { logText: `تكرار من مهمة ${C.ymd(new Date(t.doneAt || Date.now()))}` });
      UI.toast(`المهمة متكررة: أُضيفت التالية بتاريخ ${fmtShort(n.due)}`);
      return id;
    } catch (e){ console.error(e); }
  }
  // deleting waits a few seconds so it can be undone; subtasks, comments and the log go with it
  function remove(id){
    const t = byId.get(id); if (!t) return;
    const ids = [id, ...childrenOf(id).map(c => c.id)];
    ids.forEach(x => hidden.add(x)); rebuild();
    let undone = false;
    undoBar(ids.length > 1 ? `حُذفت المهمة و${ids.length - 1} فرعية` : "حُذفت المهمة", () => { undone = true; ids.forEach(x => hidden.delete(x)); rebuild(); });
    setTimeout(async () => {
      if (undone) return;
      try {
        for (const x of ids){
          const b = db.batch();
          for (const sub of ["activity", "comments"]){ const s = await db.collection("tasks").doc(x).collection(sub).get(); s.docs.forEach(d => b.delete(d.ref)); }
          b.delete(db.collection("tasks").doc(x)); await b.commit();
        }
        (t.attachments || []).filter(a => a.kind === "file" && a.fileId).forEach(a => db.collection("taskFiles").doc(a.fileId).delete().catch(() => {}));
      } catch (e){ console.error(e); UI.toast("تعذّر حذف المهمة", "err"); }
      finally { ids.forEach(x => hidden.delete(x)); }
    }, 6000);
  }
  function undoBar(text, onUndo){
    document.querySelectorAll(".undo-bar").forEach(x => x.remove());
    const bar = document.createElement("div"); bar.className = "undo-bar"; bar.setAttribute("role", "status");
    bar.innerHTML = `<span></span><button type="button" class="linkbtn">تراجع</button>`;
    bar.querySelector("span").textContent = text;
    bar.querySelector("button").addEventListener("click", () => { onUndo(); bar.remove(); });
    document.body.append(bar); setTimeout(() => bar.remove(), 6000);
  }
  // a small burst of colour when a task is finished (skipped for people who ask for less motion)
  function celebrate(){
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = document.createElement("div"); box.className = "confetti"; box.setAttribute("aria-hidden", "true");
    const cols = ["var(--a1)", "var(--a2)", "#16a34a", "#f59e0b", "#3b82f6"];
    for (let i = 0; i < 28; i++){ const p = document.createElement("i"); p.style.cssText = `--x:${(Math.random() * 2 - 1) * 180}px;--y:${-80 - Math.random() * 160}px;--r:${Math.random() * 720}deg;background:${cols[i % cols.length]};animation-delay:${Math.random() * 80}ms`; box.append(p); }
    document.body.append(box); setTimeout(() => box.remove(), 1400);
  }

  /* ---------- pieces used by the views and the panel ---------- */
  function ring(p, tone, size = 40){
    const r = (size - 6) / 2, c = 2 * Math.PI * r;
    return `<svg class="pring ${tone}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${p}%"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="pr-bg"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="pr-fg" style="stroke-dasharray:${c};stroke-dashoffset:${c * (1 - p / 100)}"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle">${p}</text></svg>`;
  }
  const bar = (p, tone) => `<span class="pbar ${tone}" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p}%"></i></span>`;

  /* ---------- the summary: overall progress and each project ---------- */
  function renderSummary(){
    const box = $("tkSum"); if (!box) return;
    const top = tasks.filter(t => !t.parentId && matches(t));
    const all = C.groupProgress(top, childrenOf);
    box.hidden = !loaded || !top.length; if (box.hidden) return;
    const open = top.filter(t => !C.CLOSED.has(t.status)), late = open.filter(t => C.dueState(t) === "late").length;
    const groups = [...projects.map(p => [p, top.filter(t => t.projectId === p.id)]), [{ id: "", name: "بدون مشروع", color: "var(--muted)" }, top.filter(t => !t.projectId || !projectOf(t.projectId))]].filter(([, ts]) => ts.length);
    box.innerHTML = `<div class="ts-all">${ring(all ?? 0, all >= 100 ? "done" : late ? "warn" : "good", 64)}<div><b>الإنجاز الكلي</b><span>${top.filter(t => t.status === "done").length} من ${top.filter(t => t.status !== "cancelled").length} مكتملة${late ? ` · <em>${late} متأخرة</em>` : ""}</span></div></div><div class="ts-projects"></div>`;
    const pl = box.querySelector(".ts-projects");
    groups.forEach(([p, ts]) => {
      const v = C.groupProgress(ts, childrenOf) ?? 0, lateN = ts.filter(t => C.dueState(t) === "late").length;
      const el = document.createElement("div"); el.className = "ts-p";
      el.innerHTML = `<span class="ts-dot"></span><span class="ts-n"></span><span class="ts-v">${v}%</span>${bar(v, C.progressTone(v, lateN ? "late" : "ok"))}`;
      el.querySelector(".ts-dot").style.background = p.color; el.querySelector(".ts-n").textContent = p.name;
      pl.append(el);
    });
  }

  /* ---------- card ---------- */
  function card(t){
    const el = document.createElement("article");
    const st = C.dueState(t), p = pct(t), blocked = C.blockers(t, byId).length > 0;
    el.className = "tk-card" + (t.status === "done" ? " done" : "") + (st === "late" ? " late" : "") + (blocked ? " blocked" : "");
    el.style.setProperty("--pc", C.PR[t.priority].color);
    el.draggable = !!db && canEdit(t); el.dataset.id = t.id; el.tabIndex = 0;
    el.setAttribute("aria-label", `${t.title}، ${C.ST[t.status].label}، أولوية ${C.PR[t.priority].label}`);
    const sub = childrenOf(t.id), ck = t.checklist;
    el.innerHTML = `<div class="tk-top"><h3></h3>${blocked ? '<span class="tk-ic" title="تنتظر مهمة أخرى">⛓</span>' : ""}${t.recurrence ? '<span class="tk-ic" title="متكررة">↻</span>' : ""}</div>
      <div class="tk-tags"></div>${p > 0 || sub.length || ck.length ? `<div class="tk-prog">${bar(p, C.progressTone(p, st))}<span>${p}%</span></div>` : ""}
      <div class="tk-meta"><span class="tk-due"></span>${sub.length ? `<span class="tk-mini" title="مهام فرعية">◫ ${sub.filter(x => x.status === "done").length}/${sub.length}</span>` : ""}${ck.length ? `<span class="tk-mini" title="قائمة التحقق">☑ ${ck.filter(x => x.done).length}/${ck.length}</span>` : ""}<span class="tk-who" hidden></span><button class="tk-link" type="button" hidden></button></div>`;
    el.querySelector("h3").textContent = t.title;
    const tags = el.querySelector(".tk-tags"); const pj = projectOf(t.projectId);
    if (pj){ const s = document.createElement("span"); s.className = "tk-proj"; s.textContent = pj.name; s.style.setProperty("--c", pj.color); tags.append(s); }
    t.tags.slice(0, 4).forEach(x => { const s = document.createElement("span"); s.className = "tk-tag"; s.textContent = "#" + x; tags.append(s); });
    if (!tags.children.length) tags.remove();
    el.querySelector(".tk-due").textContent = t.status === "done" ? (t.doneAt ? "أُنجزت " + fmtShort(t.doneAt.slice(0, 10)) : "") : dueLabel(t.due) + (t.due && t.time && window.SmartTask ? " · " + SmartTask.timeLabel(t.time) : "");
    if (t.assignee && t.assignee !== me){ const w = el.querySelector(".tk-who"); w.hidden = false; w.textContent = personName(t.assignee); w.title = "المسؤول"; }
    if (t.link){ const b = el.querySelector(".tk-link"); b.hidden = false; b.textContent = t.link.label; b.title = t.link.type === "policy" ? "فتح اللائحة" : "فتح سجل الخطابات";
      b.addEventListener("click", e => { e.stopPropagation(); openLink(t.link); }); }
    if (db && canEdit(t)){ const mb = document.createElement("button"); mb.type = "button"; mb.className = "tk-kebab"; mb.setAttribute("aria-label", "خيارات المهمة"); mb.textContent = "⋯"; mb.addEventListener("click", e => { e.stopPropagation(); actionMenu(mb, t); }); el.querySelector(".tk-top").append(mb); }
    if (t.mit === today()) el.classList.add("is-mit");
    el.addEventListener("click", () => TaskDetail.open(t.id));
    el.addEventListener("keydown", e => { if (e.key === "Enter") TaskDetail.open(t.id); });
    el.addEventListener("dragstart", e => { dragId = t.id; el.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); });
    el.addEventListener("dragend", () => { dragId = null; el.classList.remove("dragging"); document.querySelectorAll(".tk-drop").forEach(x => x.classList.remove("tk-drop")); });
    return el;
  }
  function openLink(l){
    if (l.type === "policy"){ location.hash = "#/governance/library"; window.dispatchEvent(new CustomEvent("app:open-policy", { detail: l.id })); }
    else location.hash = "#/hr/letters";
  }

  /* ---------- board ---------- */
  const BOARD = ["todo", "doing", "waiting", "done"];
  function renderBoard(){
    const board = $("tkBoard"); board.innerHTML = "";
    const top = tasks.filter(t => !t.parentId && matches(t));
    BOARD.forEach(st => {
      let items = top.filter(t => t.status === st || (st === "todo" && t.status === "new"));
      items = st === "done" ? items.sort((a, b) => String(b.doneAt || b.updatedAt).localeCompare(String(a.doneAt || a.updatedAt))) : items.sort(byOrder);
      const col = document.createElement("section"); col.className = "tk-col"; col.dataset.status = st;
      col.innerHTML = `<header><span class="tk-sdot"></span><h2></h2><span class="tk-count"></span></header><div class="tk-cards"></div>`;
      col.querySelector(".tk-sdot").style.background = C.ST[st].color;
      col.querySelector("h2").textContent = C.ST[st].label; col.querySelector(".tk-count").textContent = items.length;
      const list = col.querySelector(".tk-cards");
      (st === "done" ? items.slice(0, DONE_SHOWN) : items).forEach(t => list.append(card(t)));
      if (st === "done" && items.length > DONE_SHOWN){ const more = document.createElement("p"); more.className = "tk-more"; more.textContent = `و${items.length - DONE_SHOWN} مكتملة أقدم في عرض القائمة`; list.append(more); }
      if (!items.length){ const e = document.createElement("p"); e.className = "tk-empty"; e.textContent = { todo: "لا مهام لم تبدأ", doing: "اسحب مهمة هنا لتبدأ بها", waiting: "لا شيء بانتظار طرف آخر", done: "لا مهام مكتملة" }[st]; list.append(e); }
      if (st === "todo" && db){
        const add = document.createElement("button"); add.type = "button"; add.className = "tk-add"; add.textContent = "+ مهمة";
        add.addEventListener("click", () => TaskDetail.open(null, { status: st })); col.append(add);
      }
      list.addEventListener("dragover", e => {
        if (!dragId) return; e.preventDefault();
        list.querySelectorAll(".tk-drop").forEach(x => x.classList.remove("tk-drop"));
        const after = cardAt(list, e.clientY); if (after) after.classList.add("tk-drop"); else list.classList.add("tk-drop");
      });
      list.addEventListener("dragleave", e => { if (!list.contains(e.relatedTarget)){ list.classList.remove("tk-drop"); list.querySelectorAll(".tk-drop").forEach(x => x.classList.remove("tk-drop")); } });
      list.addEventListener("drop", e => { e.preventDefault(); const before = cardAt(list, e.clientY); list.classList.remove("tk-drop"); move(dragId || e.dataTransfer.getData("text/plain"), st, before && before.dataset.id); });
      board.append(col);
    });
    // deferred and cancelled stay out of the way, one click to see them
    const parked = top.filter(t => t.status === "deferred" || t.status === "cancelled");
    if (parked.length){
      const d = document.createElement("details"); d.className = "tk-parked";
      d.innerHTML = `<summary>مؤجلة وملغاة <span class="tk-count">${parked.length}</span></summary><div class="tk-cards"></div>`;
      parked.forEach(t => d.querySelector(".tk-cards").append(card(t))); board.append(d);
    }
  }
  function cardAt(list, y){ return [...list.querySelectorAll(".tk-card:not(.dragging)")].find(c => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; }) || null; }
  async function move(id, status, beforeId){
    const t = byId.get(id); if (!t || !db) return;
    const col = tasks.filter(x => x.status === status && x.id !== id && !x.parentId).sort(byOrder);
    let order; const i = beforeId ? col.findIndex(x => x.id === beforeId) : -1;
    if (i === -1) order = (col.length ? col[col.length - 1].order : 0) + 1000;
    else { const prev = col[i - 1], next = col[i]; order = prev ? (prev.order + next.order) / 2 : next.order - 1000; }
    if (status === t.status){ return update(id, { order }, { log: false }); }
    return update(id, { status, order });
  }

  /* ---------- list ---------- */
  const RANK = { urgent: 0, high: 1, medium: 2, low: 3 };
  function sorted(items){
    const by = { due: (a, b) => (a.due || "9").localeCompare(b.due || "9") || RANK[a.priority] - RANK[b.priority],
      priority: (a, b) => RANK[a.priority] - RANK[b.priority] || (a.due || "9").localeCompare(b.due || "9"),
      created: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)), manual: byOrder,
      smart: (a, b) => (a.due || "9").localeCompare(b.due || "9") || RANK[a.priority] - RANK[b.priority] }[sortBy] || byOrder;
    return items.slice().sort(by);
  }
  function renderList(){
    const box = $("tkList"); box.innerHTML = "";
    const top = tasks.filter(t => !t.parentId && matches(t));
    if (list !== "all" || sortBy !== "smart"){
      if (!top.length){ const p = document.createElement("div"); p.className = "tk-blank"; p.innerHTML = q() ? "<b>لا نتائج</b><span>جرّب كلمة أخرى</span>" : `<b>لا مهام في «${LIST[list][1]}»</b><span>${list === "inbox" ? "صندوق الوارد فارغ." : "اختر تصنيفاً آخر أو أضف مهمة"}</span>`; box.append(p); return; }
      const items = list === "done" || list === "archived" ? top.slice().sort((a, b) => String(b.doneAt || b.updatedAt || "").localeCompare(String(a.doneAt || a.updatedAt || ""))) : sorted(top);
      box.append(group(LIST[list][1], items, list === "overdue")); return;
    }
    const open = top.filter(t => !C.CLOSED.has(t.status) && t.status !== "deferred");
    const groups = [
      ["متأخرة", open.filter(t => (dayDiff(t.due) ?? 1) < 0)],
      ["اليوم", open.filter(t => dayDiff(t.due) === 0)],
      ["خلال 7 أيام", open.filter(t => { const d = dayDiff(t.due); return d !== null && d > 0 && d <= 7; })],
      ["لاحقاً", open.filter(t => (dayDiff(t.due) ?? -1) > 7)],
      ["بدون تاريخ", open.filter(t => !t.due)],
    ];
    let any = false;
    const rank = { urgent: 0, high: 1, medium: 2, low: 3 };
    groups.forEach(([label, items]) => {
      if (!items.length) return; any = true;
      items.sort((a, b) => (a.due || "9").localeCompare(b.due || "9") || rank[a.priority] - rank[b.priority]);
      box.append(group(label, items, label === "متأخرة"));
    });
    const parked = top.filter(t => t.status === "deferred");
    if (parked.length){ any = true; box.append(group("مؤجلة", parked, false, true)); }
    const done = top.filter(t => C.CLOSED.has(t.status)).sort((a, b) => String(b.doneAt || b.updatedAt || "").localeCompare(String(a.doneAt || a.updatedAt || "")));
    if (done.length){ any = true; box.append(group("مكتملة وملغاة", done, false, true)); }
    if (!any){ const p = document.createElement("div"); p.className = "tk-blank"; p.innerHTML = q() ? "<b>لا نتائج</b><span>جرّب كلمة أخرى</span>" : "<b>لا توجد مهام بعد</b><span>اضغط «مهمة جديدة» أو حرف N</span>"; box.append(p); }
  }
  function group(label, items, late, collapsed){
    const sec = document.createElement(collapsed ? "details" : "section"); sec.className = "tk-group" + (late ? " late" : "");
    sec.innerHTML = collapsed ? `<summary><span></span><span class="tk-count"></span></summary><ul></ul>` : `<h2><span></span><span class="tk-count"></span></h2><ul></ul>`;
    sec.querySelector("span").textContent = label; sec.querySelector(".tk-count").textContent = items.length;
    const ul = sec.querySelector("ul");
    items.forEach(t => {
      const p = pct(t), st = C.dueState(t);
      const li = document.createElement("li"); li.className = "tk-row" + (C.CLOSED.has(t.status) ? " done" : "");
      li.style.setProperty("--pc", C.PR[t.priority].color);
      li.innerHTML = `<input type="checkbox" aria-label="مكتملة"><span class="tk-pdot" title="${C.PR[t.priority].label}"></span><button class="tk-title" type="button"></button><button class="tk-link" type="button" hidden></button><button class="tk-rp" type="button" title="تغيير مرحلة التقدم">${bar(p, C.progressTone(p, st))}<b>${p}%</b></button><button class="tk-st" type="button" title="تغيير الحالة"></button><span class="tk-due"></span>`;
      const cb = li.querySelector("input"); cb.checked = t.status === "done"; cb.disabled = !db || !canEdit(t);
      cb.addEventListener("change", () => update(t.id, { status: cb.checked ? "done" : "todo" }).then(ok => { if (!ok) cb.checked = !cb.checked; }));
      li.querySelector(".tk-title").textContent = t.title;
      li.querySelector(".tk-title").addEventListener("click", () => TaskDetail.open(t.id));
      if (t.link){ const b = li.querySelector(".tk-link"); b.hidden = false; b.textContent = t.link.label; b.addEventListener("click", () => openLink(t.link)); }
      const s = li.querySelector(".tk-st"); s.textContent = C.ST[t.status].label; s.style.color = C.ST[t.status].color;
      const rp = li.querySelector(".tk-rp"), editable = !!db && canEdit(t);
      rp.disabled = s.disabled = !editable;
      rp.addEventListener("click", () => stepMenu(rp, t)); s.addEventListener("click", () => stepMenu(s, t));
      li.querySelector(".tk-due").textContent = t.status === "done" ? "" : dueLabel(t.due) + (t.due && t.time && window.SmartTask ? " · " + SmartTask.timeLabel(t.time) : "");
      if (t.mit === today()){ const m = document.createElement("span"); m.className = "tk-mitb"; m.title = "من أهم مهام اليوم"; m.textContent = "★"; li.querySelector(".tk-title").before(m); }
      if (t.area){ const a = (window.LifeAreas || []).find(x => x.id === t.area); if (a){ const s = document.createElement("span"); s.className = "tk-area"; s.style.setProperty("--c", a.color); s.textContent = a.short; li.querySelector(".tk-st").before(s); } }
      const mb = document.createElement("button"); mb.type = "button"; mb.className = "tk-kebab"; mb.setAttribute("aria-label", "خيارات المهمة"); mb.textContent = "⋯"; mb.disabled = !db || !canEdit(t);
      mb.addEventListener("click", e => { e.stopPropagation(); actionMenu(mb, t); }); li.append(mb);
      ul.append(li);
    });
    return sec;
  }

  /* ---------- quick progress: one tap sets the stage, its percent and the matching status ---------- */
  const STEPS = [
    { p: 0, label: "لم تبدأ", status: "todo" },
    { p: 25, label: "بدأت", status: "doing" },
    { p: 50, label: "في المنتصف", status: "doing" },
    { p: 75, label: "قاربت على الانتهاء", status: "doing" },
    { p: 90, label: "بانتظار طرف آخر", status: "waiting" },
    { p: 100, label: "مكتملة", status: "done" },
  ];
  let menuEl = null;
  function closeMenu(){ if (menuEl){ menuEl.remove(); menuEl = null; document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", escKey, true); } }
  const outside = e => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); };
  const escKey = e => { if (e.key === "Escape") closeMenu(); };
  function stepMenu(anchorEl, t){
    if (menuEl){ const same = menuEl.dataset.id === t.id; closeMenu(); if (same) return; }
    const cur = pct(t), auto = t.progressMode !== "manual", hasParts = t.checklist.length || childrenOf(t.id).length;
    const m = document.createElement("div"); m.className = "tk-steps"; m.dataset.id = t.id; m.setAttribute("role", "menu");
    m.innerHTML = `<p class="tk-steps-h">مرحلة التقدم</p>` + STEPS.map(x => `<button type="button" role="menuitemradio" data-p="${x.p}" aria-checked="${t.status === x.status && (x.status === "done" || cur === x.p) ? "true" : "false"}"><span class="pbar ${x.p >= 100 ? "done" : x.p >= 50 ? "good" : "mid"}"><i style="width:${x.p}%"></i></span><b>${x.p}%</b><span>${x.label}</span></button>`).join("") +
      (hasParts ? `<button type="button" class="tk-steps-auto" data-auto="1" aria-checked="${auto}">تلقائي من قائمة التحقق والمهام الفرعية</button>` : "") +
      `<div class="tk-steps-more"><button type="button" data-st="deferred">مؤجلة</button><button type="button" data-st="cancelled">ملغاة</button></div>`;
    m.addEventListener("click", async e => {
      const b = e.target.closest("button"); if (!b) return; closeMenu();
      if (b.dataset.auto){ await update(t.id, { progressMode: "auto" }); return; }
      if (b.dataset.st){ await update(t.id, { status: b.dataset.st }); return; }
      const x = STEPS.find(y => y.p === +b.dataset.p);
      const patch = { status: x.status };
      if (x.p > 0 && x.p < 100 && x.status !== "waiting") Object.assign(patch, { progressMode: "manual", progressManual: x.p });
      else if (x.status === "waiting") Object.assign(patch, { progressMode: "manual", progressManual: 90 });
      else Object.assign(patch, { progressMode: hasParts ? t.progressMode : "manual", progressManual: x.p });
      await update(t.id, patch);
    });
    document.body.append(m); menuEl = m;
    const r = anchorEl.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    let left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
    let top = r.bottom + 6; if (top + h > innerHeight - 8) top = r.top - h - 6 >= 8 ? r.top - h - 6 : Math.max(8, innerHeight - h - 8);
    m.style.left = left + "px"; m.style.top = top + "px";
    (m.querySelector('[aria-checked="true"]') || m.querySelector("button")).focus();
    setTimeout(() => { document.addEventListener("pointerdown", outside, true); document.addEventListener("keydown", escKey, true); });
  }
  window.addEventListener("hashchange", closeMenu);

  /* ---------- the table view: columns with inline editing ---------- */
  let tSort = { k: "due", dir: 1 };
  function renderTable(){
    const box = $("tkTable"), top = tasks.filter(t => !t.parentId && matches(t));
    const val = { title: t => t.title, area: t => areaName(t.area), project: t => (projectOf(t.projectId) || {}).name || "", status: t => C.ST[t.status].label, priority: t => RANK[t.priority], due: t => t.due || "9999", pct: t => pct(t) };
    const items = top.slice().sort((a, b) => { const x = val[tSort.k](a), y = val[tSort.k](b); return (x > y ? 1 : x < y ? -1 : 0) * tSort.dir; });
    const th = (k, l) => `<th><button type="button" data-sort="${k}" aria-sort="${tSort.k === k ? (tSort.dir > 0 ? "ascending" : "descending") : "none"}">${l}${tSort.k === k ? (tSort.dir > 0 ? " ↑" : " ↓") : ""}</button></th>`;
    const opt = (list, v) => list.map(([k, l]) => `<option value="${k}"${k === v ? " selected" : ""}>${escH(l)}</option>`).join("");
    box.innerHTML = items.length ? `<div class="tt-wrap"><table class="tt"><thead><tr>${th("title", "المهمة")}${th("area", "المجال")}${th("project", "المشروع")}${th("status", "الحالة")}${th("priority", "الأولوية")}${th("due", "الاستحقاق")}${th("pct", "الإنجاز")}<th></th></tr></thead><tbody>${items.map(t => { const ed = db && canEdit(t) ? "" : " disabled", late = t.due && t.due < today() && isOpen(t);
      return `<tr data-id="${t.id}"${t.status === "done" ? ' class="done"' : ""}><td><button type="button" class="tt-title" data-open="${t.id}">${escH(t.title)}</button></td>
        <td><select class="tt-in" data-f="area"${ed}><option value="">—</option>${opt((window.LifeAreas || []).map(a => [a.id, a.short]), t.area)}</select></td>
        <td><select class="tt-in" data-f="projectId"${ed}><option value="">—</option>${opt(projects.map(p => [p.id, p.name]), t.projectId)}</select></td>
        <td><select class="tt-in" data-f="status"${ed} style="color:${C.ST[t.status].color}">${opt(C.STATUSES.map(s => [s.id, s.label]), t.status)}</select></td>
        <td><select class="tt-in" data-f="priority"${ed} style="color:${C.PR[t.priority].color}">${opt(C.PRIORITIES.slice().reverse().map(p => [p.id, p.label]), t.priority)}</select></td>
        <td><input type="date" class="tt-in${late ? " late" : ""}" data-f="due" value="${t.due || ""}"${ed}></td>
        <td>${childrenOf(t.id).length || t.checklist.length || t.progressMode === "manual" ? `<span class="tt-pct">${bar(pct(t), C.progressTone(pct(t), C.dueState(t)))}<i>${pct(t)}%</i></span>` : "—"}</td>
        <td><button type="button" class="tk-kebab" data-menu="${t.id}" aria-label="خيارات المهمة"${ed}>⋯</button></td></tr>`; }).join("")}</tbody></table></div>` : `<div class="tk-blank"><b>لا مهام في «${LIST[list][1]}»</b></div>`;
  }
  $("tkTable").addEventListener("click", e => {
    const s = e.target.closest("[data-sort]"); if (s){ tSort = { k: s.dataset.sort, dir: tSort.k === s.dataset.sort ? -tSort.dir : 1 }; renderTable(); return; }
    const o = e.target.closest("[data-open]"); if (o){ TaskDetail.open(o.dataset.open); return; }
    const m = e.target.closest("[data-menu]"); if (m){ actionMenu(m, byId.get(m.dataset.menu)); }
  });
  $("tkTable").addEventListener("change", e => { const f = e.target.dataset.f; if (!f) return; const id = e.target.closest("tr").dataset.id; update(id, { [f]: e.target.value || null }); });

  /* ---------- the calendar view (tasks only; the unified calendar has every section) ---------- */
  function renderCal(){
    const evs = tasks.filter(t => !t.parentId && matches(t) && t.due).map(t => ({ key: "t:" + t.id, date: t.due, time: t.time, title: t.title, color: C.PR[t.priority].color, drag: db && canEdit(t) && t.status !== "done", done: t.status === "done", task: t.id }));
    window.Calendar.render($("tkCal"), { events: evs, onMove: (ev, date) => update(ev.task, { due: date }), onOpen: ev => TaskDetail.open(ev.task) });
  }

  /* ---------- the Eisenhower matrix: important (high or urgent priority) × urgent (due within two days); a move is remembered ---------- */
  const QUADS = [["do", "مهم وعاجل", "نفّذ الآن", "#dc2626"], ["plan", "مهم وغير عاجل", "خطّط له", "#2563eb"], ["delegate", "عاجل وغير مهم", "فوّضه عند الإمكان", "#d97706"], ["drop", "غير عاجل وغير مهم", "راجع ضرورته", "#64748b"]];
  const quadOf = t => { if (t.eisen) return t.eisen; const imp = t.priority === "high" || t.priority === "urgent", urg = !!t.due && t.due <= (() => { const d = new Date(); d.setDate(d.getDate() + 2); return C.ymd(d); })(); return imp && urg ? "do" : imp ? "plan" : urg ? "delegate" : "drop"; };
  function renderMatrix(){
    const box = $("tkMatrix"), open = tasks.filter(t => !t.parentId && matches(t) && isOpen(t));
    box.innerHTML = QUADS.map(([k, l, hint, c]) => { const items = sorted(open.filter(t => quadOf(t) === k));
      return `<section class="mx-q" data-q="${k}" style="--c:${c}"><header><b>${l}</b><span>${hint}</span><i>${items.length}</i></header><ul>${items.map(t => `<li draggable="${db && canEdit(t)}" data-id="${t.id}"><span class="tk-pdot" style="--pc:${C.PR[t.priority].color}"></span><button type="button" data-open="${t.id}">${escH(t.title)}</button><small>${t.due ? dueLabel(t.due) : ""}</small></li>`).join("") || '<li class="mx-empty">اسحب مهمة إلى هنا</li>'}</ul></section>`; }).join("");
  }
  let mxDrag = null;
  $("tkMatrix").addEventListener("click", e => { const o = e.target.closest("[data-open]"); if (o) TaskDetail.open(o.dataset.open); });
  $("tkMatrix").addEventListener("dragstart", e => { const li = e.target.closest("li[data-id]"); if (li){ mxDrag = li.dataset.id; e.dataTransfer.effectAllowed = "move"; } });
  $("tkMatrix").addEventListener("dragover", e => { if (mxDrag && e.target.closest(".mx-q")) e.preventDefault(); });
  $("tkMatrix").addEventListener("drop", e => { const q = e.target.closest(".mx-q"); if (!q || !mxDrag) return; e.preventDefault(); const id = mxDrag; mxDrag = null; const t = byId.get(id); const patch = { eisen: q.dataset.q };
    if ((q.dataset.q === "do" || q.dataset.q === "plan") && !(t.priority === "high" || t.priority === "urgent")) patch.priority = "high";
    update(id, patch); });

  /* ---------- reports: honest numbers, with a note when there is too little data ---------- */
  let rp = { days: 30 };
  function renderReports(){
    const box = $("tkReports"), since = Date.now() - rp.days * 864e5, top = tasks.filter(t => !t.parentId && (!filt.area || t.area === filt.area));
    const done = top.filter(t => t.status === "done" && t.doneAt && Date.parse(t.doneAt) >= since);
    const dueIn = top.filter(t => t.due && Date.parse(t.due + "T12:00:00") >= since && t.due <= today() && t.status !== "cancelled");
    const dueDone = dueIn.filter(t => t.status === "done"), onTime = dueDone.filter(t => t.doneAt && t.doneAt.slice(0, 10) <= t.due);
    const lateNow = top.filter(t => isOpen(t) && t.due && t.due < today());
    const durs = done.filter(t => t.createdAt).map(t => (Date.parse(t.doneAt) - Date.parse(t.createdAt)) / 864e5).filter(x => x >= 0);
    const est = done.filter(t => t.estimate && t.spent), estSum = est.reduce((s, t) => s + t.estimate, 0), spentSum = est.reduce((s, t) => s + t.spent, 0);
    const pctOf = (a, b) => b ? Math.round(a / b * 100) + "%" : "—";
    const few = n => n < 3 ? '<small class="rp-few">بيانات غير كافية</small>' : "";
    const weeks = [...Array(8)].map((_, i) => { const end = Date.now() - i * 7 * 864e5, start = end - 7 * 864e5; return { label: i === 0 ? "هذا الأسبوع" : `قبل ${i}`, n: top.filter(t => t.status === "done" && t.doneAt && Date.parse(t.doneAt) >= start && Date.parse(t.doneAt) < end).length }; }).reverse();
    const maxW = Math.max(1, ...weeks.map(w => w.n));
    const byArea = (window.LifeAreas || []).map(a => ({ a, n: done.filter(t => t.area === a.id).length })).filter(x => x.n).concat([{ a: { short: "بدون مجال", color: "var(--muted)" }, n: done.filter(t => !t.area).length }]).filter(x => x.n);
    const focusMin = top.reduce((s, t) => s + (t.spent || 0), 0);
    box.innerHTML = `<div class="rp-bar"><div class="fm-seg" role="radiogroup">${[[7, "7 أيام"], [30, "30 يوماً"], [90, "90 يوماً"], [365, "سنة"]].map(([d, l]) => `<button type="button" role="radio" data-days="${d}" aria-checked="${rp.days === d}">${l}</button>`).join("")}</div><span class="muted-text">المجال يتبع تصفية الصفحة</span></div>
      <div class="rp-kpis">
        <div><b>${done.length}</b><span>مهمة أُنجزت</span></div>
        <div><b>${pctOf(dueDone.length, dueIn.length)}</b><span>معدل إكمال المستحق</span>${few(dueIn.length)}</div>
        <div><b>${pctOf(onTime.length, dueDone.length)}</b><span>أُنجزت في موعدها</span>${few(dueDone.length)}</div>
        <div class="${lateNow.length ? "warn" : ""}"><b>${lateNow.length}</b><span>متأخرة الآن</span></div>
        <div><b>${durs.length ? (durs.reduce((s, x) => s + x, 0) / durs.length).toFixed(1) : "—"}</b><span>متوسط أيام الإنجاز</span>${few(durs.length)}</div>
        <div><b>${est.length ? `${C.fmtMinutes(spentSum)} / ${C.fmtMinutes(estSum)}` : "—"}</b><span>الفعلي مقابل المخطط</span>${few(est.length)}</div>
      </div>
      <div class="rp-two"><section class="card"><h3>الإنجاز الأسبوعي (آخر 8 أسابيع)</h3><div class="rp-weeks">${weeks.map(w => `<div><i style="height:${Math.round(w.n / maxW * 100)}%" title="${w.n}"></i><b>${w.n}</b><small>${w.label}</small></div>`).join("")}</div></section>
        <section class="card"><h3>توزيع المنجز حسب المجال</h3>${byArea.length ? `<ul class="rp-areas">${byArea.map(x => `<li><span style="background:${x.a.color}"></span>${escH(x.a.short)}<em>${bar(Math.round(x.n / done.length * 100), "good")}</em><b>${x.n}</b></li>`).join("")}</ul>` : '<p class="muted-text">لا مهام منجزة في الفترة.</p>'}
          <p class="muted-text rp-note">إجمالي الوقت المسجّل على المهام (منه جلسات التركيز): <b>${C.fmtMinutes(focusMin) || "0د"}</b>. أسباب التأجيل لا تُسجَّل حالياً، فلا تقرير لها.</p></section></div>
      <section class="card"><h3>سجل الإنجازات</h3><ul class="rp-log">${done.slice().sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt))).slice(0, 15).map(t => `<li><span>✓</span><button type="button" data-open="${t.id}">${escH(t.title)}</button><small>${fmtShort(t.doneAt.slice(0, 10))}</small></li>`).join("") || '<li class="muted-text">لا إنجازات في الفترة.</li>'}</ul></section>`;
  }
  $("tkReports").addEventListener("click", e => { const d = e.target.closest("[data-days]"); if (d){ rp.days = +d.dataset.days; renderReports(); return; } const o = e.target.closest("[data-open]"); if (o) TaskDetail.open(o.dataset.open); });

  /* ---------- wiring ---------- */
  function setView(v){
    view = v; try { localStorage.setItem("app-tasks-view", v); } catch {}
    document.querySelectorAll("[data-tkview]").forEach(b => b.setAttribute("aria-selected", b.dataset.tkview === v ? "true" : "false"));
    render();
  }
  let raf = 0;
  // several changes in a row draw once (a timer, so it also runs while the tab is in the background)
  function render(){ clearTimeout(raf); raf = setTimeout(draw, 0); }
  function draw(){
    ["board", "list", "table", "cal", "matrix", "reports"].forEach(v => { const el = $("tk" + { board: "Board", list: "List", table: "Table", cal: "Cal", matrix: "Matrix", reports: "Reports" }[v]); if (el) el.hidden = view !== v; });
    const loading = (!db || !loaded) && !(window.appAuth && window.appAuth.user === null);
    $("tkSkel").hidden = !loading; $("tkSignin").hidden = !!db || loading;
    $("tkLayout").hidden = !db || !loaded; $("tkStats").hidden = !db || !loaded || statsHidden; $("tkQuick").hidden = !db;
    if (!db || !loaded){ ["tkBoard", "tkList", "tkTable", "tkCal", "tkMatrix", "tkReports", "tkSum"].forEach(i => { if ($(i)) $(i).hidden = true; }); return; }
    renderStats(); renderLists(); renderCtx(); renderMit();
    ({ board: renderBoard, list: renderList, table: renderTable, cal: renderCal, matrix: renderMatrix, reports: renderReports }[view] || renderList)();
    $("tkMit").hidden = $("tkMit").hidden || view === "reports";
    if (window.TaskDetail) TaskDetail.refresh();
  }
  document.querySelectorAll("[data-tkview]").forEach(b => b.addEventListener("click", () => setView(b.dataset.tkview)));
  $("tkQ").addEventListener("input", render);
  /* ---------- the header date (Gregorian and Hijri) ---------- */
  (() => { const d = new Date(), g = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d), hj = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(d); $("tkDate").textContent = `${g} · ${hj}`; })();

  /* ---------- the metric cards: each one opens its list ---------- */
  const STAT = [["all", "إجمالي المهام"], ["today", "مهام اليوم"], ["upcoming", "القادمة"], ["doing", "قيد التنفيذ"], ["overdue", "المتأخرة"], ["done", "المكتملة"]];
  const countOf = id => tasks.filter(t => !t.parentId && LIST[id][2](t)).length;
  function renderStats(){
    const box = $("tkStats"); if (statsHidden){ box.hidden = true; return; }
    box.innerHTML = STAT.map(([id, label]) => `<button type="button" class="tk-stat${list === id ? " on" : ""}${id === "overdue" && countOf(id) ? " warn" : ""}" data-list="${id}"><b>${countOf(id)}</b><span>${label}</span></button>`).join("");
  }
  /* ---------- the smart lists with their counts ---------- */
  function renderLists(){
    $("tkLists").innerHTML = LISTS.map(([id, label, , icon]) => { const n = countOf(id);
      return `<button type="button" class="tk-li${list === id ? " on" : ""}${id === "overdue" && n ? " warn" : ""}" data-list="${id}" aria-current="${list === id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg><span>${label}</span><i>${n || ""}</i></button>`; }).join("");
  }
  function renderCtx(){
    const parts = [];
    if (filt.priority) parts.push(["priority", "الأولوية: " + C.PR[filt.priority].label]);
    if (filt.area) parts.push(["area", "المجال: " + (filt.area === "_none" ? "بدون" : areaName(filt.area))]);
    if (filt.project) parts.push(["project", "المشروع: " + (filt.project === "_none" ? "بدون" : (projectOf(filt.project) || {}).name || "")]);
    if (filt.status) parts.push(["status", "الحالة: " + C.ST[filt.status].label]);
    $("tkFDot").hidden = !parts.length;
    $("tkCtx").innerHTML = `<h2>${LIST[list][1]}</h2><span class="tk-cn">${tasks.filter(t => !t.parentId && matches(t)).length} مهمة</span>` + parts.map(([k, l]) => `<button type="button" class="tk-chipf" data-unfilt="${k}">${l} ×</button>`).join("") + (parts.length ? '<button type="button" class="linkbtn" data-unfilt="*">مسح الكل</button>' : "");
  }
  /* ---------- the day's three most important tasks ---------- */
  function renderMit(){
    const box = $("tkMit"), mits = tasks.filter(t => t.mit === today() && !t.archived);
    const open = mits.filter(isOpen);
    box.hidden = !mits.length;
    if (box.hidden) return;
    box.innerHTML = `<header><b>★ أهم مهام اليوم</b><span>${mits.length - open.length} من ${mits.length} أُنجزت</span></header><ul>${mits.map(t => `<li class="${isOpen(t) ? "" : "done"}"><input type="checkbox" data-mitdone="${t.id}"${isOpen(t) ? "" : " checked"} aria-label="مكتملة"><button type="button" data-openid="${t.id}">${escH(t.title)}</button><span class="tk-pdot" style="--pc:${C.PR[t.priority].color}"></span><button type="button" class="tk-x" data-unmit="${t.id}" aria-label="إزالة من أهم المهام">×</button></li>`).join("")}</ul>`;
  }
  const escH = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const setList = id => { list = LIST[id] ? id : "all"; saveUi(); render(); };
  ["tkStats", "tkLists"].forEach(id => $(id).addEventListener("click", e => { const b = e.target.closest("[data-list]"); if (b) setList(b.dataset.list); }));
  $("tkCtx").addEventListener("click", e => { const b = e.target.closest("[data-unfilt]"); if (!b) return; if (b.dataset.unfilt === "*") filt = { priority: "", area: "", project: "", status: "" }; else filt[b.dataset.unfilt] = ""; saveUi(); render(); });
  $("tkMit").addEventListener("click", e => {
    const o = e.target.closest("[data-openid]"); if (o) return TaskDetail.open(o.dataset.openid);
    const u = e.target.closest("[data-unmit]"); if (u) update(u.dataset.unmit, { mit: null }, { log: false });
  });
  $("tkMit").addEventListener("change", e => { const id = e.target.dataset.mitdone; if (id) update(id, { status: e.target.checked ? "done" : "todo" }); });

  /* ---------- search, filters, more ---------- */
  $("tkSearchBtn").addEventListener("click", () => { const s = $("tkSearch"); s.hidden = !s.hidden; if (!s.hidden) $("tkQ").focus(); else if ($("tkQ").value){ $("tkQ").value = ""; render(); } });
  $("tkQ").addEventListener("keydown", e => { if (e.key === "Escape"){ $("tkQ").value = ""; $("tkSearch").hidden = true; render(); } });
  function popToggle(btn, pop, fill){
    const open = pop.hidden; document.querySelectorAll(".tk-pop").forEach(p => { p.hidden = true; }); document.querySelectorAll("[aria-expanded].tk-ib").forEach(b => b.setAttribute("aria-expanded", "false"));
    if (!open) return; if (fill) fill(); pop.hidden = false; btn.setAttribute("aria-expanded", "true");
  }
  document.addEventListener("pointerdown", e => { if (!e.target.closest(".tk-pop, .tk-ib")) document.querySelectorAll(".tk-pop").forEach(p => { p.hidden = true; }); });
  function fillFilters(){
    const sel = (k, label, opts) => `<label class="ig-f"><span>${label}</span><select class="select" data-filt="${k}"><option value="">الكل</option>${opts.map(([v, l]) => `<option value="${v}"${filt[k] === v ? " selected" : ""}>${escH(l)}</option>`).join("")}</select></label>`;
    $("tkFilters").innerHTML = `<div class="tk-fgrid">${sel("priority", "الأولوية", C.PRIORITIES.slice().reverse().map(p => [p.id, p.label]))}${sel("status", "الحالة", C.STATUSES.map(s => [s.id, s.label]))}
      ${sel("area", "المجال", [["_none", "بدون مجال"], ...(window.LifeAreas || []).map(a => [a.id, a.name])])}${sel("project", "المشروع", [["_none", "بدون مشروع"], ...projects.map(p => [p.id, p.name])])}
      <label class="ig-f"><span>الترتيب</span><select class="select" data-sort>${[["smart", "حسب الموعد ثم الأولوية"], ["priority", "حسب الأولوية"], ["due", "حسب تاريخ الاستحقاق"], ["created", "الأحدث إنشاءً"], ["manual", "يدوي"]].map(([v, l]) => `<option value="${v}"${sortBy === v ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>
      <div class="tk-factions"><button type="button" class="linkbtn" data-clearf>مسح التصفية</button></div>`;
  }
  $("tkFilterBtn").addEventListener("click", () => popToggle($("tkFilterBtn"), $("tkFilters"), fillFilters));
  $("tkFilters").addEventListener("change", e => { const k = e.target.dataset.filt; if (k){ filt[k] = e.target.value; } if (e.target.dataset.sort !== undefined) sortBy = e.target.value; saveUi(); render(); });
  $("tkFilters").addEventListener("click", e => { if (e.target.closest("[data-clearf]")){ filt = { priority: "", area: "", project: "", status: "" }; sortBy = "smart"; saveUi(); fillFilters(); render(); } });
  $("tkMoreBtn").addEventListener("click", () => popToggle($("tkMoreBtn"), $("tkMoreMenu"), () => { $("tkToggleStats").textContent = statsHidden ? "إظهار المؤشرات" : "إخفاء المؤشرات"; }));
  $("tkToggleStats").addEventListener("click", () => { statsHidden = !statsHidden; saveUi(); $("tkMoreMenu").hidden = true; render(); });

  /* ---------- quick add: the text is read on this device (and refined by Claude when it is set up), shown before saving ---------- */
  // Arabic words have no \b boundary in JS regexes, so a space or the text's edge marks them
  const REC = [[/(^|\s)(يوميا|يومياً|كل يوم)(?=\s|$)/, { freq: "daily", interval: 1 }], [/(^|\s)(اسبوعيا|أسبوعياً|اسبوعياً|أسبوعيا|كل اسبوع|كل أسبوع)(?=\s|$)/, { freq: "weekly", interval: 1 }], [/(^|\s)((في )?(أول|اول) يوم من كل شهر|شهريا|شهرياً|كل شهر)(?=\s|$)/, { freq: "monthly", interval: 1 }]];
  const DAYS = { "الأحد": 0, "الاحد": 0, "الاثنين": 1, "الإثنين": 1, "الثلاثاء": 2, "الأربعاء": 3, "الاربعاء": 3, "الخميس": 4, "الجمعة": 5, "السبت": 6 };
  function recurrenceOf(text){
    let rec = null, rest = text;
    for (const [re, r] of REC){ if (re.test(rest)){ rec = { ...r, days: [] }; rest = rest.replace(re, " "); break; } }
    const m = /كل (يوم )?(الأحد|الاحد|الاثنين|الإثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة|السبت)/.exec(rest);
    if (m){ rec = { freq: "weekly", interval: 1, days: [DAYS[m[2]]] }; rest = rest.replace(m[0], " "); }
    const firstOfMonth = /(أول|اول) يوم من كل شهر/.test(text);
    return { rec, rest: rest.replace(/\s+/g, " ").trim(), firstOfMonth };
  }
  let qParsed = null, qTimer = 0, qSeq = 0;
  async function readQuick(){
    const v = $("tkQuickIn").value.trim(), box = $("tkQPrev");
    if (!v){ qParsed = null; box.hidden = true; return; }
    const seq = ++qSeq, r = recurrenceOf(v);
    let p = window.SmartTask ? SmartTask.local(r.rest) : { title: r.rest, date: null, time: null, priority: "medium", tags: [] };
    show();
    if (window.SmartTask && SmartTask.aiOn && p.mentionedDate){ try { const a = await SmartTask.parse(r.rest); if (seq === qSeq && a){ p = a; show(); } } catch {} }
    function show(){
      let date = p.date;
      if (r.firstOfMonth && !date){ const d = new Date(); d.setMonth(d.getMonth() + 1, 1); date = C.ymd(d); }
      if (r.rec && !date) date = today();
      qParsed = { title: p.title || v, due: date || null, time: p.time || null, priority: p.priority || "medium", tags: p.tags || [], recurrence: r.rec };
      const chip = (icon, t, cls = "") => `<span class="tk-qc ${cls}">${icon} ${escH(t)}</span>`;
      box.innerHTML = `<span class="tk-ql">ستُضاف:</span>${chip("✎", qParsed.title, "t")}${qParsed.due ? chip("📅", window.SmartTask ? SmartTask.dayLabel(qParsed.due) : qParsed.due) : ""}${qParsed.time ? chip("⏰", window.SmartTask ? SmartTask.timeLabel(qParsed.time) : qParsed.time) : ""}
        ${qParsed.recurrence ? chip("↻", { daily: "يومياً", weekly: qParsed.recurrence.days.length ? "أسبوعياً" : "أسبوعياً", monthly: r.firstOfMonth ? "أول كل شهر" : "شهرياً" }[qParsed.recurrence.freq]) : ""}${qParsed.priority !== "medium" ? chip("⚑", C.PR[qParsed.priority].label, "p-" + qParsed.priority) : ""}${qParsed.tags.map(tg => chip("#", tg)).join("")}
        ${qParsed.time && !p.date && !r.rec ? '<span class="tk-qw">لم تذكر يوماً، فاخترنا أقرب موعد قادم لهذا الوقت. عدّله إن لزم.</span>' : ""}<span class="tk-qh">Enter للإضافة · Esc للمسح</span>`;
      box.hidden = false;
    }
  }
  $("tkQuickIn").addEventListener("input", () => { clearTimeout(qTimer); qTimer = setTimeout(readQuick, 180); });
  $("tkQuickIn").addEventListener("keydown", e => { if (e.key === "Escape"){ $("tkQuickIn").value = ""; readQuick(); } });
  $("tkQuick").addEventListener("submit", async e => {
    e.preventDefault(); clearTimeout(qTimer); await readQuick(); if (!qParsed || !db) return;
    const data = { ...qParsed, status: "new", ...(list === "today" && !qParsed.due ? { due: today() } : {}), ...(filt.area ? { area: filt.area === "_none" ? null : filt.area } : {}) };
    try { await create(data); $("tkQuickIn").value = ""; readQuick(); UI.toast("أُضيفت المهمة"); } catch {}
  });

  /* ---------- one menu with every quick action of a task ---------- */
  let actEl = null;
  const closeAct = () => { if (actEl){ actEl.remove(); actEl = null; } };
  document.addEventListener("pointerdown", e => { if (actEl && !actEl.contains(e.target) && !e.target.closest(".tk-kebab")) closeAct(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeAct(); });
  window.addEventListener("hashchange", closeAct);
  function actionMenu(anchor, t){
    if (actEl && actEl.dataset.id === t.id){ closeAct(); return; } closeAct();
    const mitN = tasks.filter(x => x.mit === today() && x.id !== t.id && !x.archived).length;
    const m = document.createElement("div"); m.className = "tk-act"; m.dataset.id = t.id; m.setAttribute("role", "menu");
    const it = (a, label, extra = "") => `<button type="button" role="menuitem" data-a="${a}" ${extra}>${label}</button>`;
    m.innerHTML = it("edit", "✎ تعديل المهمة") + (isOpen(t) ? it("done", "✓ إكمال المهمة") : it("reopen", "↺ إعادة فتحها")) +
      `<div class="tk-actg"><span>تأجيل</span>${it("snooze1", "غداً")}${it("snooze7", "الأسبوع القادم")}${it("date", "تاريخ آخر…")}</div>` +
      `<div class="tk-actg"><span>الأولوية</span>${C.PRIORITIES.slice().reverse().map(p => `<button type="button" data-pri="${p.id}" class="tk-prib${t.priority === p.id ? " on" : ""}" style="--pc:${p.color}" title="${p.label}" aria-label="${p.label}"></button>`).join("")}</div>` +
      `<div class="tk-actg"><span>المجال</span><select class="select" data-area><option value="">بدون</option>${(window.LifeAreas || []).map(a => `<option value="${a.id}"${t.area === a.id ? " selected" : ""}>${escH(a.name)}</option>`).join("")}</select></div>` +
      (t.mit === today() ? it("unmit", "☆ إزالة من أهم مهام اليوم") : it("mit", "★ تثبيت من أهم مهام اليوم", mitN >= 3 ? 'disabled title="ثلاث مهام كحد أعلى"' : "")) +
      (isOpen(t) ? it("focus", "◎ وضع التركيز") : "") + it("sub", "+ إضافة مهمة فرعية") + it("dup", "⧉ نسخ المهمة") + (t.archived ? it("unarchive", "⤴ إخراج من الأرشيف") : it("archive", "▣ أرشفة")) + it("del", "🗑 حذف", 'class="danger"');
    document.body.append(m); actEl = m;
    const r = anchor.getBoundingClientRect(), w = m.offsetWidth, hgt = m.offsetHeight;
    m.style.left = Math.min(Math.max(8, r.left), innerWidth - w - 8) + "px";
    m.style.top = (r.bottom + 4 + hgt > innerHeight - 8 ? Math.max(8, r.top - hgt - 4) : r.bottom + 4) + "px";
    m.addEventListener("change", e => { if (e.target.dataset.area !== undefined){ update(t.id, { area: e.target.value || null }); closeAct(); } });
    m.addEventListener("click", async e => {
      const pb = e.target.closest("[data-pri]"); if (pb){ closeAct(); update(t.id, { priority: pb.dataset.pri }); return; }
      const b = e.target.closest("[data-a]"); if (!b) return; closeAct();
      const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return C.ymd(d); };
      switch (b.dataset.a){
        case "edit": TaskDetail.open(t.id); break;
        case "done": update(t.id, { status: "done" }); break;
        case "reopen": update(t.id, { status: "todo" }); break;
        case "snooze1": update(t.id, { due: day(1) }).then(ok => ok && UI.toast("أُجّلت إلى الغد")); break;
        case "snooze7": update(t.id, { due: day(7) }).then(ok => ok && UI.toast("أُجّلت أسبوعاً")); break;
        case "date": { const v = await UI.prompt("الموعد الجديد للمهمة (YYYY-MM-DD)", { title: "تغيير الموعد", ok: "حفظ", note: t.due || today(), noteRequired: true, placeholder: "2026-12-01" }); if (v && /^\d{4}-\d{2}-\d{2}$/.test(v.note.trim())) update(t.id, { due: v.note.trim() }); else if (v) UI.toast("اكتب التاريخ بصيغة YYYY-MM-DD", "err"); break; }
        case "mit": update(t.id, { mit: today() }, { log: false }); break;
        case "unmit": update(t.id, { mit: null }, { log: false }); break;
        case "focus": window.Focus && Focus.open(t.id); break;
        case "sub": TaskDetail.open(t.id); setTimeout(() => { const i = document.querySelector("#tdSubAdd input"); if (i) i.focus(); }, 300); break;
        case "dup": { const c = JSON.parse(JSON.stringify(t)); ["id", "doneAt", "nextSpawned", "remindedFor", "mit"].forEach(k => delete c[k]); c.title = t.title + " (نسخة)"; c.status = "todo"; c.archived = false; try { await create(c); UI.toast("نُسخت المهمة"); } catch {} break; }
        case "archive": update(t.id, { archived: true }).then(ok => ok && undoBar("أُرشفت المهمة", () => update(t.id, { archived: false }))); break;
        case "unarchive": update(t.id, { archived: false }); break;
        case "del": remove(t.id); break;
      }
    });
  }
  $("tkNew").addEventListener("click", () => TaskDetail.open(null));
  // a backup of every task this person can see, exactly as stored, with comments and the activity log
  $("tkExport").addEventListener("click", async () => {
    if (!db || !loaded) return UI.toast("سجّل الدخول أولاً", "err");
    const btn = $("tkExport"); btn.disabled = true;
    try {
      const all = new Map(); Object.values(sources).forEach(m => m.forEach((v, k) => all.set(k, v)));
      const out = {};
      for (const [tid, d] of all){
        const extra = {};
        for (const sub of ["comments", "activity"]){ try { const s = await db.collection("tasks").doc(tid).collection(sub).get(); extra[sub] = s.docs.map(x => ({ id: x.id, ...x.data() })); } catch { extra[sub] = []; } }
        out[tid] = { ...d, ...extra };
      }
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), by: me, count: all.size, projects, tasks: out }, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `tasks-backup-${today()}.json`; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      UI.toast(`نزلت نسخة من ${all.size} مهمة`);
    } catch (e){ console.error(e); UI.toast("تعذّر التصدير", "err"); }
    finally { btn.disabled = false; }
  });
  document.addEventListener("keydown", e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if (e.key === "n" && location.hash === "#/tasks" && !typing && !TaskDetail.isOpen() && !e.ctrlKey && !e.metaKey){ e.preventDefault(); TaskDetail.open(null); }
  });
  window.addEventListener("app:auth", render);

  function connect(d){
    if (db) return;
    db = d.db; me = ((d.user && d.user.email) || (window.appUser && window.appUser.email) || "").toLowerCase();
    myName = (d.user && d.user.displayName) || me.split("@")[0];
    db.collection("allowed").doc(me).onSnapshot(a => {
      const isA = !!(a.exists && a.data().role === "admin");
      if (isA !== admin){ admin = isA; subscribe(); }
    }, () => { if (admin === null){ admin = false; subscribe(); } });
    db.collection("taskProjects").onSnapshot(s => { projects = s.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name))); render(); }, () => {});
    db.collection("settings").doc("directory").onSnapshot(s => { people = (s.exists && s.data().people) || []; render(); }, () => {});
    db.collection("policies").onSnapshot(snap => { policies = snap.docs.map(x => ({ id: x.id, title: x.data().title || "" })); }, () => {});
    db.collection("hrLetters").onSnapshot(snap => { letters = snap.docs.map(x => ({ id: x.id, ...x.data() })); }, () => {});
    render();
  }
  setView(view);
  window.Tasks = {
    get list(){ return tasks; }, get byId(){ return byId; }, get projects(){ return projects; }, get people(){ return people; },
    get policies(){ return policies; }, get letters(){ return letters; }, get me(){ return me; }, get myName(){ return myName; }, get admin(){ return !!admin; },
    get db(){ return db; }, childrenOf, pct, canEdit, personName, projectOf, ring, bar, dueLabel, showList: l => { list = LIST[l] ? l : "all"; saveUi(); render(); }, actionMenu: (anchor, t) => actionMenu(anchor, t),
    create, update, remove, log, openLink,
  };
  if (window.appDb) connect({ db: window.appDb, user: window.appUser });
  window.addEventListener("app:db", e => connect(e.detail));
})();
