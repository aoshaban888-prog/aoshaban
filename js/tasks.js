/* المهام: a board (جديدة ← قيد التنفيذ ← مكتملة) with drag and drop, and a list grouped by due date.
   Firestore tasks/{id}: { title, notes, status: todo|doing|done, priority: normal|high, due: "YYYY-MM-DD"|null,
                           order, link: { type: policy|letter, id, label }|null, createdAt, updatedAt, doneAt } */
(() => {
  const $ = id => document.getElementById(id);
  const COLS = [["todo", "جديدة"], ["doing", "قيد التنفيذ"], ["done", "مكتملة"]];
  const DONE_SHOWN = 30;
  let db = null, tasks = [], policies = [], letters = [], view = "board", editing = null, dragId = null;
  try { view = localStorage.getItem("app-tasks-view") === "list" ? "list" : "board"; } catch {}

  const pad = n => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const dayDiff = s => s ? Math.round((new Date(s + "T00:00:00") - new Date(today() + "T00:00:00")) / 86400000) : null;
  const fmtShort = s => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short" }).format(new Date(s + "T00:00:00"));
  function dueLabel(s){
    const d = dayDiff(s); if (d === null) return "";
    if (d < 0) return d === -1 ? "متأخرة يوماً" : d === -2 ? "متأخرة يومين" : `متأخرة ${-d} أيام`;
    if (d === 0) return "اليوم"; if (d === 1) return "غداً";
    return fmtShort(s);
  }
  const q = () => ($("tkQ").value || "").trim();
  const matches = t => !q() || [t.title, t.notes, t.link && t.link.label].some(x => (x || "").includes(q()));
  const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt));

  /* ---------- card ---------- */
  function card(t){
    const el = document.createElement("article");
    const d = dayDiff(t.due);
    el.className = "tk-card" + (t.status === "done" ? " done" : "") + (t.status !== "done" && d !== null && d < 0 ? " late" : "");
    el.draggable = !!db; el.dataset.id = t.id; el.tabIndex = 0;
    el.innerHTML = `<div class="tk-top"><span class="tk-pri" hidden></span><h3></h3></div><p class="tk-notes" hidden></p>
      <div class="tk-meta"><span class="tk-due"></span><button class="tk-link" type="button" hidden></button></div>`;
    el.querySelector("h3").textContent = t.title;
    if (t.priority === "high"){ const p = el.querySelector(".tk-pri"); p.hidden = false; p.title = "أولوية عالية"; }
    if (t.notes){ const n = el.querySelector(".tk-notes"); n.hidden = false; n.textContent = t.notes; }
    el.querySelector(".tk-due").textContent = t.status === "done" ? (t.doneAt ? "أُنجزت " + fmtShort(t.doneAt.slice(0, 10)) : "") : dueLabel(t.due);
    if (t.link){ const b = el.querySelector(".tk-link"); b.hidden = false; b.textContent = t.link.label; b.title = t.link.type === "policy" ? "فتح اللائحة" : "فتح سجل الخطابات";
      b.addEventListener("click", e => { e.stopPropagation(); openLink(t.link); }); }
    el.addEventListener("click", () => openTask(t));
    el.addEventListener("keydown", e => { if (e.key === "Enter") openTask(t); });
    el.addEventListener("dragstart", e => { dragId = t.id; el.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); });
    el.addEventListener("dragend", () => { dragId = null; el.classList.remove("dragging"); document.querySelectorAll(".tk-drop").forEach(x => x.classList.remove("tk-drop")); });
    return el;
  }
  function openLink(l){
    if (l.type === "policy"){ location.hash = "#/governance/library"; window.dispatchEvent(new CustomEvent("app:open-policy", { detail: l.id })); }
    else location.hash = "#/hr/letters";
  }

  /* ---------- board ---------- */
  function renderBoard(){
    const board = $("tkBoard"); board.innerHTML = "";
    COLS.forEach(([st, label]) => {
      let items = tasks.filter(t => (t.status || "todo") === st && matches(t));
      items = st === "done" ? items.sort((a, b) => String(b.doneAt || b.updatedAt).localeCompare(String(a.doneAt || a.updatedAt))) : items.sort(byOrder);
      const col = document.createElement("section"); col.className = "tk-col"; col.dataset.status = st;
      col.innerHTML = `<header><h2></h2><span class="tk-count"></span></header><div class="tk-cards"></div>`;
      col.querySelector("h2").textContent = label;
      col.querySelector(".tk-count").textContent = items.length;
      const list = col.querySelector(".tk-cards");
      (st === "done" ? items.slice(0, DONE_SHOWN) : items).forEach(t => list.append(card(t)));
      if (st === "done" && items.length > DONE_SHOWN){ const more = document.createElement("p"); more.className = "tk-more"; more.textContent = `و${items.length - DONE_SHOWN} مكتملة أقدم في عرض القائمة`; list.append(more); }
      if (!items.length){ const e = document.createElement("p"); e.className = "tk-empty"; e.textContent = st === "todo" ? "لا مهام جديدة" : st === "doing" ? "اسحب مهمة هنا لتبدأ بها" : "لا مهام مكتملة"; list.append(e); }
      if (st === "todo" && db){
        const add = document.createElement("button"); add.type = "button"; add.className = "tk-add"; add.textContent = "+ مهمة";
        add.addEventListener("click", () => openTask(null, st)); col.append(add);
      }
      list.addEventListener("dragover", e => {
        if (!dragId) return; e.preventDefault();
        list.querySelectorAll(".tk-drop").forEach(x => x.classList.remove("tk-drop"));
        const after = cardAt(list, e.clientY); if (after) after.classList.add("tk-drop"); else list.classList.add("tk-drop");
      });
      list.addEventListener("dragleave", e => { if (!list.contains(e.relatedTarget)) { list.classList.remove("tk-drop"); list.querySelectorAll(".tk-drop").forEach(x => x.classList.remove("tk-drop")); } });
      list.addEventListener("drop", e => { e.preventDefault(); const before = cardAt(list, e.clientY); list.classList.remove("tk-drop"); move(dragId || e.dataTransfer.getData("text/plain"), st, before && before.dataset.id); });
      board.append(col);
    });
  }
  function cardAt(list, y){ return [...list.querySelectorAll(".tk-card:not(.dragging)")].find(c => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; }) || null; }
  async function move(id, status, beforeId){
    const t = tasks.find(x => x.id === id); if (!t || !db) return;
    const col = tasks.filter(x => (x.status || "todo") === status && x.id !== id).sort(byOrder);
    let order;
    const i = beforeId ? col.findIndex(x => x.id === beforeId) : -1;
    if (i === -1) order = (col.length ? (col[col.length - 1].order ?? 0) : 0) + 1000;
    else { const prev = col[i - 1], next = col[i]; order = prev ? ((prev.order ?? 0) + (next.order ?? 0)) / 2 : (next.order ?? 0) - 1000; }
    const patch = { status, order, updatedAt: new Date().toISOString() };
    if (status === "done" && t.status !== "done") patch.doneAt = new Date().toISOString();
    if (status !== "done") patch.doneAt = null;
    Object.assign(t, patch); render();
    await db.collection("tasks").doc(id).update(patch).catch(e => { console.error(e); UI.toast("تعذّر نقل المهمة", "err"); });
  }

  /* ---------- list ---------- */
  function renderList(){
    const box = $("tkList"); box.innerHTML = "";
    const open = tasks.filter(t => t.status !== "done" && matches(t));
    const groups = [
      ["متأخرة", open.filter(t => (dayDiff(t.due) ?? 1) < 0)],
      ["اليوم", open.filter(t => dayDiff(t.due) === 0)],
      ["خلال 7 أيام", open.filter(t => { const d = dayDiff(t.due); return d !== null && d > 0 && d <= 7; })],
      ["لاحقاً", open.filter(t => (dayDiff(t.due) ?? -1) > 7)],
      ["بدون تاريخ", open.filter(t => !t.due)],
    ];
    const done = tasks.filter(t => t.status === "done" && matches(t)).sort((a, b) => String(b.doneAt || "").localeCompare(String(a.doneAt || "")));
    let any = false;
    groups.forEach(([label, items]) => {
      if (!items.length) return; any = true;
      items.sort((a, b) => (a.due || "9").localeCompare(b.due || "9") || (b.priority === "high") - (a.priority === "high"));
      box.append(group(label, items, label === "متأخرة"));
    });
    if (done.length){ any = true; const g = group("مكتملة", done, false, true); box.append(g); }
    if (!any){ const p = document.createElement("p"); p.className = "tk-empty"; p.textContent = q() ? "لا نتائج" : "لا توجد مهام بعد"; box.append(p); }
  }
  function group(label, items, late, collapsed){
    const sec = document.createElement(collapsed ? "details" : "section"); sec.className = "tk-group" + (late ? " late" : "");
    sec.innerHTML = collapsed ? `<summary><span></span><span class="tk-count"></span></summary><ul></ul>` : `<h2><span></span><span class="tk-count"></span></h2><ul></ul>`;
    sec.querySelector("span").textContent = label; sec.querySelector(".tk-count").textContent = items.length;
    const ul = sec.querySelector("ul");
    items.forEach(t => {
      const li = document.createElement("li"); li.className = "tk-row" + (t.status === "done" ? " done" : "");
      li.innerHTML = `<input type="checkbox" aria-label="مكتملة"><button class="tk-title" type="button"></button><span class="tk-pri" hidden></span><button class="tk-link" type="button" hidden></button><span class="tk-st"></span><span class="tk-due"></span>`;
      const cb = li.querySelector("input"); cb.checked = t.status === "done"; cb.disabled = !db;
      cb.addEventListener("change", () => move(t.id, cb.checked ? "done" : "todo"));
      li.querySelector(".tk-title").textContent = t.title;
      li.querySelector(".tk-title").addEventListener("click", () => openTask(t));
      if (t.priority === "high") li.querySelector(".tk-pri").hidden = false;
      if (t.link){ const b = li.querySelector(".tk-link"); b.hidden = false; b.textContent = t.link.label; b.addEventListener("click", () => openLink(t.link)); }
      li.querySelector(".tk-st").textContent = t.status === "doing" ? "قيد التنفيذ" : "";
      li.querySelector(".tk-due").textContent = t.status === "done" ? "" : dueLabel(t.due);
      ul.append(li);
    });
    return sec;
  }

  /* ---------- task dialog ---------- */
  function fillLinks(sel){
    const s = $("tkLink"); s.innerHTML = ""; s.append(new Option("بدون", ""));
    const gp = document.createElement("optgroup"); gp.label = "لائحة أو سياسة";
    policies.slice().sort((a, b) => a.title.localeCompare(b.title)).forEach(p => gp.append(new Option(p.title, "policy:" + p.id)));
    const gl = document.createElement("optgroup"); gl.label = "خطاب صادر";
    letters.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50).forEach(l => gl.append(new Option(`${l.ref} · ${l.title}${l.employee ? " · " + l.employee : ""}`, "letter:" + l.id)));
    if (policies.length) s.append(gp); if (letters.length) s.append(gl);
    s.value = sel || "";
    if (sel && s.value !== sel && editing && editing.link){ s.append(new Option(editing.link.label, sel)); s.value = sel; }
  }
  function openTask(t, status){
    if (!db){ UI.alert("سجّل الدخول لإضافة المهام وتعديلها"); return; }
    editing = t || null;
    $("tkDlgTitle").textContent = t ? "تعديل المهمة" : "مهمة جديدة";
    $("tkTitle").value = t ? t.title : ""; $("tkNotes").value = t ? t.notes || "" : "";
    $("tkStatus").value = t ? t.status || "todo" : status || "todo";
    $("tkPriority").value = t && t.priority === "high" ? "high" : "normal";
    $("tkDue").value = t && t.due ? t.due : "";
    fillLinks(t && t.link ? `${t.link.type}:${t.link.id}` : "");
    $("tkDelete").hidden = !t;
    $("tkDlg").hidden = false; $("tkScrim").hidden = false;
    setTimeout(() => $("tkTitle").focus(), 30);
  }
  function closeTask(){ $("tkDlg").hidden = true; $("tkScrim").hidden = true; editing = null; }
  async function saveTask(e){
    e.preventDefault();
    const title = $("tkTitle").value.trim(); if (!title) return;
    const lv = $("tkLink").value; let link = null;
    if (lv){
      const [type, id] = [lv.slice(0, lv.indexOf(":")), lv.slice(lv.indexOf(":") + 1)];
      const label = $("tkLink").selectedOptions[0].textContent;
      link = { type, id, label: type === "letter" ? label.split(" · ").slice(0, 2).join(" · ") : label };
    }
    const now = new Date().toISOString();
    const status = $("tkStatus").value;
    const data = { title, notes: $("tkNotes").value.trim(), status, priority: $("tkPriority").value, due: $("tkDue").value || null, link, updatedAt: now };
    const btn = $("tkSave"); btn.disabled = true;
    try {
      if (editing){
        if (status === "done" && editing.status !== "done") data.doneAt = now;
        if (status !== "done") data.doneAt = null;
        await db.collection("tasks").doc(editing.id).update(data);
        UI.toast("حُفظت المهمة");
      } else {
        const col = tasks.filter(x => (x.status || "todo") === status);
        await db.collection("tasks").add({ ...data, order: (col.length ? Math.max(...col.map(x => x.order ?? 0)) : 0) + 1000, createdAt: now, doneAt: status === "done" ? now : null });
        UI.toast("أُضيفت المهمة");
      }
      closeTask();
    } catch (err){ console.error(err); UI.toast("تعذّر حفظ المهمة", "err"); }
    finally { btn.disabled = false; }
  }
  async function deleteTask(){
    if (!editing) return;
    const t = editing;
    if (!(await UI.confirm(`حذف المهمة «${t.title}»؟`, { ok: "حذف", danger: true }))) return;
    try { await db.collection("tasks").doc(t.id).delete(); closeTask(); UI.toast("حُذفت المهمة"); }
    catch (e){ console.error(e); UI.toast("تعذّر الحذف", "err"); }
  }

  /* ---------- wiring ---------- */
  function setView(v){
    view = v; try { localStorage.setItem("app-tasks-view", v); } catch {}
    document.querySelectorAll("[data-tkview]").forEach(b => b.setAttribute("aria-selected", b.dataset.tkview === v ? "true" : "false"));
    render();
  }
  function render(){
    $("tkBoard").hidden = view !== "board"; $("tkList").hidden = view !== "list";
    const loading = !db && !(window.appAuth && window.appAuth.user === null);
    $("tkSkel").hidden = !loading; $("tkSignin").hidden = !!db || loading;
    if (!db){ $("tkBoard").hidden = $("tkList").hidden = true; return; }
    if (view === "board") renderBoard(); else renderList();
  }
  document.querySelectorAll("[data-tkview]").forEach(b => b.addEventListener("click", () => setView(b.dataset.tkview)));
  $("tkQ").addEventListener("input", render);
  $("tkNew").addEventListener("click", () => openTask(null));
  $("tkForm").addEventListener("submit", saveTask);
  $("tkCancel").addEventListener("click", closeTask);
  $("tkScrim").addEventListener("click", closeTask);
  $("tkDelete").addEventListener("click", deleteTask);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("tkDlg").hidden){ closeTask(); }
    // n: new task while on the tasks page and not typing
    if (e.key === "n" && location.hash === "#/tasks" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && $("tkDlg").hidden && !e.ctrlKey && !e.metaKey) { e.preventDefault(); openTask(null); }
  });
  window.addEventListener("app:auth", render);

  function connect(d){
    if (db) return;
    db = d.db;
    db.collection("tasks").onSnapshot(snap => { tasks = snap.docs.map(x => ({ id: x.id, ...x.data() })); render(); }, e => { console.error(e); if (e && e.code !== "permission-denied") UI.toast("تعذّر تحميل المهام", "err"); });
    db.collection("policies").onSnapshot(snap => { policies = snap.docs.map(x => ({ id: x.id, title: x.data().title || "" })); }, () => {});
    db.collection("hrLetters").onSnapshot(snap => { letters = snap.docs.map(x => ({ id: x.id, ...x.data() })); }, () => {});
    render();
  }
  setView(view);
  if (window.appDb) connect({ db: window.appDb });
  window.addEventListener("app:db", e => connect(e.detail));
})();
