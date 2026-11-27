/* Calendar: a month / week / day grid with Gregorian and Hijri dates (Asia/Riyadh), used by the tasks page («التقويم» view)
   and by the unified calendar page (إدارة حياتي الشخصية › التقويم), which gathers dates from every section this person may read:
   tasks, goals, policy reviews, board terms, survey closing dates. A task can be dragged to another day to move its date.
   Calendar.render(box, { events, view, anchor, onMove(id, date), onOpen(ev), onState(state) }) */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
  const D = s => new Date(s + "T12:00:00");
  const add = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return ymd(d); };
  const hDay = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "numeric" });
  const hMonth = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { month: "long", year: "numeric" });
  const gMonth = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { month: "long", year: "numeric" });
  const gDay = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const WD = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const timeL = t => t && window.SmartTask ? SmartTask.timeLabel(t) : t || "";

  function render(box, o){
    const st = box._cal || (box._cal = { view: o.view || "month", anchor: o.anchor || today() });
    if (o.view) st.view = o.view;
    const evs = (o.events || []).slice().sort((a, b) => String(a.time || "99").localeCompare(String(b.time || "99")));
    const byDay = new Map(); evs.forEach(e => { if (!byDay.has(e.date)) byDay.set(e.date, []); byDay.get(e.date).push(e); });
    const chip = e => `<button type="button" class="cal-e${e.done ? " done" : ""}" style="--c:${esc(e.color || "var(--accent)")}" data-ev="${esc(e.key)}"${e.drag ? ' draggable="true"' : ""} title="${esc(e.title)}${e.kind ? " · " + esc(e.kindLabel || e.kind) : ""}">${e.time ? `<i>${esc(timeL(e.time))}</i>` : ""}${esc(e.title)}</button>`;
    let head = "", body = "";
    if (st.view === "month"){
      const a = D(st.anchor), first = new Date(a.getFullYear(), a.getMonth(), 1, 12), start = add(ymd(first), -first.getDay());
      const cells = [...Array(42)].map((_, i) => add(start, i)), month = a.getMonth();
      head = `${gMonth.format(a)} <small>${hMonth.format(first)} – ${hMonth.format(new Date(a.getFullYear(), month + 1, 0, 12))}</small>`;
      body = `<div class="cal-wd">${WD.map(w => `<span>${w}</span>`).join("")}</div><div class="cal-grid">${cells.map(c => { const list = byDay.get(c) || [], dd = D(c);
        return `<div class="cal-c${dd.getMonth() !== month ? " out" : ""}${c === today() ? " now" : ""}" data-day="${c}"><div class="cal-n"><b>${dd.getDate()}</b><small>${hDay.format(dd)}</small></div>${list.slice(0, 3).map(chip).join("")}${list.length > 3 ? `<button type="button" class="cal-more" data-dayopen="${c}">+${list.length - 3} أخرى</button>` : ""}</div>`; }).join("")}</div>`;
    } else if (st.view === "week"){
      const a = D(st.anchor), start = add(st.anchor, -a.getDay()), days = [...Array(7)].map((_, i) => add(start, i));
      head = `${gDay.format(D(days[0])).replace(/^[^،]+،\s*/, "")} – ${gDay.format(D(days[6])).replace(/^[^،]+،\s*/, "")}`;
      body = `<div class="cal-week">${days.map(c => { const dd = D(c), list = byDay.get(c) || [];
        return `<div class="cal-wc${c === today() ? " now" : ""}" data-day="${c}"><div class="cal-wh"><b>${WD[dd.getDay()]} ${dd.getDate()}</b><small>${hDay.format(dd)} ${new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { month: "short" }).format(dd)}</small></div>${list.map(chip).join("") || '<p class="cal-empty">—</p>'}</div>`; }).join("")}</div>`;
    } else {
      const dd = D(st.anchor), list = byDay.get(st.anchor) || [];
      head = `${gDay.format(dd)} <small>${new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(dd)} هـ</small>`;
      body = `<div class="cal-day" data-day="${st.anchor}">${list.map(e => `<div class="cal-dr"><span class="cal-dt">${esc(timeL(e.time) || "طوال اليوم")}</span>${chip(e)}<span class="cal-dk">${esc(e.kindLabel || "")}</span></div>`).join("") || '<p class="cal-empty">لا مواعيد في هذا اليوم.</p>'}</div>`;
    }
    box.innerHTML = `<div class="cal-bar"><div class="cal-nav"><button type="button" class="tk-ib" data-step="-1" aria-label="السابق">›</button><button type="button" class="btn small" data-today>اليوم</button><button type="button" class="tk-ib" data-step="1" aria-label="التالي">‹</button></div>
      <h3 class="cal-title">${head}</h3><div class="fm-seg" role="radiogroup">${[["month", "شهر"], ["week", "أسبوع"], ["day", "يوم"]].map(([v, l]) => `<button type="button" role="radio" data-view="${v}" aria-checked="${st.view === v}">${l}</button>`).join("")}</div></div><div class="cal-body cal-${st.view}">${body}</div>`;
    const map = new Map(evs.map(e => [e.key, e]));
    box.onclick = e => {
      const s = e.target.closest("[data-step]"); if (s){ const n = +s.dataset.step, a = D(st.anchor); if (st.view === "month") a.setMonth(a.getMonth() + n, 1); else a.setDate(a.getDate() + (st.view === "week" ? 7 : 1) * n); st.anchor = ymd(a); render(box, { ...o, view: st.view }); o.onState && o.onState(st); return; }
      if (e.target.closest("[data-today]")){ st.anchor = today(); render(box, { ...o, view: st.view }); return; }
      const v = e.target.closest("[data-view]"); if (v){ st.view = v.dataset.view; render(box, { ...o, view: st.view }); o.onState && o.onState(st); return; }
      const m = e.target.closest("[data-dayopen]"); if (m){ st.view = "day"; st.anchor = m.dataset.dayopen; render(box, { ...o, view: "day" }); return; }
      const c = e.target.closest("[data-ev]"); if (c && o.onOpen){ o.onOpen(map.get(c.dataset.ev)); return; }
      const cell = e.target.closest("[data-day]"); if (cell && st.view === "month" && e.detail === 2){ st.view = "day"; st.anchor = cell.dataset.day; render(box, { ...o, view: "day" }); }
    };
    // drag a task to another day
    let dragKey = null;
    box.ondragstart = e => { const c = e.target.closest("[data-ev]"); if (c){ dragKey = c.dataset.ev; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragKey); } };
    box.ondragover = e => { if (dragKey && e.target.closest("[data-day]")){ e.preventDefault(); box.querySelectorAll(".cal-drop").forEach(x => x.classList.remove("cal-drop")); e.target.closest("[data-day]").classList.add("cal-drop"); } };
    box.ondragleave = e => { const c = e.target.closest("[data-day]"); if (c && !c.contains(e.relatedTarget)) c.classList.remove("cal-drop"); };
    box.ondrop = e => { const c = e.target.closest("[data-day]"); if (!c || !dragKey) return; e.preventDefault(); c.classList.remove("cal-drop"); const ev = map.get(dragKey); dragKey = null; if (ev && ev.drag && ev.date !== c.dataset.day && o.onMove) o.onMove(ev, c.dataset.day); };
  }

  /* ---------- the unified calendar page ---------- */
  const KINDS = { task: ["المهام", "#7c3aed"], goal: ["الأهداف", "#16a34a"], review: ["مراجعات اللوائح", "#b45309"], board: ["دورات المجالس", "#0f766e"], form: ["الاستبيانات", "#2563eb"] };
  let filt = { kinds: Object.keys(KINDS), assoc: "" };
  try { const s = JSON.parse(localStorage.getItem("app-cal-filt") || "null"); if (s) filt = { ...filt, ...s }; } catch {}
  function events(){
    const out = [], T = window.Tasks;
    if (T && T.list) T.list.filter(t => !t.parentId && !t.archived && t.due && t.status !== "cancelled").forEach(t => out.push({ key: "t:" + t.id, date: t.due, time: t.time, title: t.title, kind: "task", kindLabel: "مهمة", color: window.TaskCore ? TaskCore.PR[t.priority].color : KINDS.task[1], drag: T.canEdit(t) && t.status !== "done", done: t.status === "done", task: t.id }));
    if (window.Life) Life.goals().filter(g => g.due).forEach(g => out.push({ key: "g:" + g.id, date: g.due, title: "🎯 " + g.title, kind: "goal", kindLabel: "موعد هدف", color: KINDS.goal[1], href: "#/life/goals" }));
    (window.Assocs ? Assocs.list() : []).forEach(a => {
      Object.entries(a.approvals || {}).forEach(([pid, ap]) => { if (ap && ap.review) out.push({ key: `r:${a.id}:${pid}`, date: ap.review, title: `مراجعة لائحة · ${a.name}`, kind: "review", kindLabel: "مراجعة لائحة", color: KINDS.review[1], assoc: a.name, href: "#/governance/library" }); });
      if (a.boardEnd) out.push({ key: "b:" + a.id, date: a.boardEnd, title: `نهاية دورة المجلس · ${a.name}`, kind: "board", kindLabel: "دورة مجلس", color: KINDS.board[1], assoc: a.name, href: "#/orgs/associations" });
    });
    (window.FormsList ? FormsList() : []).filter(f => f.settings && f.settings.closeAt).forEach(f => out.push({ key: "f:" + f.id, date: f.settings.closeAt, title: `إغلاق استبيان: ${f.title}`, kind: "form", kindLabel: "استبيان", color: KINDS.form[1], href: "#/projects/forms" }));
    return out.filter(e => filt.kinds.includes(e.kind) && (!filt.assoc || e.assoc === filt.assoc));
  }
  function page(){
    const box = $("calPage"); if (!box || $("calView").closest(".view").hidden) return;
    const assocs = [...new Set((window.Assocs ? Assocs.list() : []).map(a => a.name).filter(Boolean))];
    $("calFilters").innerHTML = Object.entries(KINDS).map(([k, [l, c]]) => `<label class="cal-f" style="--c:${c}"><input type="checkbox" data-kind="${k}"${filt.kinds.includes(k) ? " checked" : ""}> <span>${l}</span></label>`).join("") +
      (assocs.length ? `<select class="select" id="calAssoc" aria-label="الجمعية"><option value="">كل الجمعيات</option>${assocs.map(n => `<option${n === filt.assoc ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>` : "");
    render(box, { events: events(), onMove: moveTask, onOpen: openEv });
  }
  async function moveTask(ev, date){ if (!ev.task || !window.Tasks) return; const ok = await Tasks.update(ev.task, { due: date }); if (ok) UI.toast(`نُقلت إلى ${gDay.format(D(date))}`); }
  function openEv(ev){ if (!ev) return; if (ev.task){ window.TaskDetail && TaskDetail.open(ev.task); return; } if (ev.href) location.hash = ev.href; }
  const save = () => { try { localStorage.setItem("app-cal-filt", JSON.stringify(filt)); } catch {} };
  $("calFilters") && $("calFilters").addEventListener("change", e => {
    if (e.target.dataset.kind){ const k = e.target.dataset.kind; filt.kinds = e.target.checked ? [...filt.kinds, k] : filt.kinds.filter(x => x !== k); }
    if (e.target.id === "calAssoc") filt.assoc = e.target.value;
    save(); page();
  });
  $("calAdd") && $("calAdd").addEventListener("click", () => { location.hash = "#/tasks"; setTimeout(() => { const i = $("tkQuickIn"); if (i){ i.focus(); i.value = "موعد "; } }, 200); });
  ["app:tasks", "app:life", "app:assocs", "app:forms"].forEach(ev => window.addEventListener(ev, () => { clearTimeout(page._t); page._t = setTimeout(page, 60); }));
  window.addEventListener("app:view", e => { if (e.detail === "calendar") setTimeout(page, 30); });

  window.Calendar = { render, today };
})();
