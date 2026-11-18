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
  try { view = localStorage.getItem("app-tasks-view") === "list" ? "list" : "board"; } catch {}

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
  const matches = t => !q() || [t.title, t.description, ...(t.tags || []), t.link && t.link.label].some(x => (x || "").includes(q()));
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
  }
  function listen(name, ref){
    unsubs.push(ref.onSnapshot(s => { sources[name] = new Map(s.docs.map(d => [d.id, d.data()])); rebuild(); },
      e => { console.error(e); if (e && e.code !== "permission-denied") UI.toast("تعذّر تحميل المهام", "err"); }));
  }
  function subscribe(){
    unsubs.forEach(u => u && u()); unsubs = []; sources = {};
    const col = db.collection("tasks");
    if (admin) listen("all", col);
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

  /* ---------- writing ---------- */
  const actRef = id => db.collection("tasks").doc(id).collection("activity");
  function log(id, entries){
    const at = new Date().toISOString();
    entries.forEach(x => actRef(id).add({ at, by: me, name: myName, ...x }).catch(() => {}));
  }
  async function create(data, opts = {}){
    if (!db) throw new Error("signed_out");
    const t = C.normalize({ ...data, owner: me, title: (data.title || "").trim() });
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
    if (prev.schema !== C.SCHEMA || !prev.owner) Object.assign(write, C.migrationPatch({ ...prev, ...patch }, prev.owner || me), { ...patch, updatedAt: now });
    // optimistic: the page changes now, Firestore confirms (or the change is rolled back with a message)
    Object.assign(before, after); render();
    try { await db.collection("tasks").doc(id).update(write); }
    catch (e){ console.error(e); UI.toast(e && e.code === "permission-denied" ? "لا تملك صلاحية تعديل هذه المهمة" : "تعذّر حفظ التغيير", "err"); rebuild(); return false; }
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
  const BOARD = ["todo", "doing", "review", "done"];
  function renderBoard(){
    const board = $("tkBoard"); board.innerHTML = "";
    const top = tasks.filter(t => !t.parentId && matches(t));
    BOARD.forEach(st => {
      let items = top.filter(t => t.status === st);
      items = st === "done" ? items.sort((a, b) => String(b.doneAt || b.updatedAt).localeCompare(String(a.doneAt || a.updatedAt))) : items.sort(byOrder);
      const col = document.createElement("section"); col.className = "tk-col"; col.dataset.status = st;
      col.innerHTML = `<header><span class="tk-sdot"></span><h2></h2><span class="tk-count"></span></header><div class="tk-cards"></div>`;
      col.querySelector(".tk-sdot").style.background = C.ST[st].color;
      col.querySelector("h2").textContent = C.ST[st].label; col.querySelector(".tk-count").textContent = items.length;
      const list = col.querySelector(".tk-cards");
      (st === "done" ? items.slice(0, DONE_SHOWN) : items).forEach(t => list.append(card(t)));
      if (st === "done" && items.length > DONE_SHOWN){ const more = document.createElement("p"); more.className = "tk-more"; more.textContent = `و${items.length - DONE_SHOWN} مكتملة أقدم في عرض القائمة`; list.append(more); }
      if (!items.length){ const e = document.createElement("p"); e.className = "tk-empty"; e.textContent = { todo: "لا مهام جديدة", doing: "اسحب مهمة هنا لتبدأ بها", review: "لا شيء بانتظار المراجعة", done: "لا مهام مكتملة" }[st]; list.append(e); }
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
  function renderList(){
    const box = $("tkList"); box.innerHTML = "";
    const top = tasks.filter(t => !t.parentId && matches(t));
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
      li.innerHTML = `<input type="checkbox" aria-label="مكتملة"><span class="tk-pdot" title="${C.PR[t.priority].label}"></span><button class="tk-title" type="button"></button><button class="tk-link" type="button" hidden></button><span class="tk-rp">${bar(p, C.progressTone(p, st))}</span><span class="tk-st"></span><span class="tk-due"></span>`;
      const cb = li.querySelector("input"); cb.checked = t.status === "done"; cb.disabled = !db || !canEdit(t);
      cb.addEventListener("change", () => update(t.id, { status: cb.checked ? "done" : "todo" }).then(ok => { if (!ok) cb.checked = !cb.checked; }));
      li.querySelector(".tk-title").textContent = t.title;
      li.querySelector(".tk-title").addEventListener("click", () => TaskDetail.open(t.id));
      if (t.link){ const b = li.querySelector(".tk-link"); b.hidden = false; b.textContent = t.link.label; b.addEventListener("click", () => openLink(t.link)); }
      const s = li.querySelector(".tk-st"); s.textContent = C.ST[t.status].label; s.style.color = C.ST[t.status].color;
      li.querySelector(".tk-due").textContent = t.status === "done" ? "" : dueLabel(t.due) + (t.due && t.time && window.SmartTask ? " · " + SmartTask.timeLabel(t.time) : "");
      ul.append(li);
    });
    return sec;
  }

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
    $("tkBoard").hidden = view !== "board"; $("tkList").hidden = view !== "list";
    const loading = (!db || !loaded) && !(window.appAuth && window.appAuth.user === null);
    $("tkSkel").hidden = !loading; $("tkSignin").hidden = !!db || loading;
    if (!db || !loaded){ $("tkBoard").hidden = $("tkList").hidden = true; $("tkSum").hidden = true; return; }
    renderSummary();
    if (view === "board") renderBoard(); else renderList();
    if (window.TaskDetail) TaskDetail.refresh();
  }
  document.querySelectorAll("[data-tkview]").forEach(b => b.addEventListener("click", () => setView(b.dataset.tkview)));
  $("tkQ").addEventListener("input", render);
  $("tkNew").addEventListener("click", () => TaskDetail.open(null));
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
    get db(){ return db; }, childrenOf, pct, canEdit, personName, projectOf, ring, bar, dueLabel,
    create, update, remove, log, openLink,
  };
  if (window.appDb) connect({ db: window.appDb, user: window.appUser });
  window.addEventListener("app:db", e => connect(e.detail));
})();
