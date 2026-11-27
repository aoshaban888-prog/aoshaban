/* إدارة حياتي الشخصية (Personal Life OS): the personal dashboard, goals and the life areas.
   The site's task system stays the one engine: a task carries `area` (a life area) and `goalId` (a goal), and is created
   through window.Tasks, so it shows in «المهام», the home page and the reminders like any other task.
   Goals, habits, notes and reviews are personal: Firestore lifeGoals / lifeHabits / lifeNotes / lifeReviews,
   read and written only by their owner (not even an admin). A goal measures itself from its tasks:
     measure "tasks"  → done linked tasks ÷ all linked tasks
     measure "number" → (start value + the value of each done linked task) ÷ target   (e.g. savings, pages, sessions)
   All life pages share one view (data-view="life"), drawn by route. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const I = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const AREAS = [
    { id: "career", name: "المجال المهني", short: "مهني", color: "#2563eb", icon: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>', hint: "التطوّر الوظيفي، المشاريع، المهارات المهنية، العلاقات المهنية." },
    { id: "learning", name: "المجال التعليمي والمعرفي", short: "تعليمي", color: "#7c3aed", icon: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/>', hint: "الدورات، القراءة، الشهادات، اللغات." },
    { id: "finance", name: "المجال المالي", short: "مالي", color: "#0f766e", icon: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.8 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6.5V8M12 16v1.5"/>', hint: "الادخار، الاستحقاقات والفواتير، الاستثمار، الديون." },
    { id: "family", name: "المجال الشخصي والأسري", short: "أسري", color: "#db2777", icon: '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/>', hint: "الأسرة، صلة الرحم، المناسبات، الالتزامات الشخصية." },
    { id: "faith", name: "المجال الروحاني والإيماني", short: "إيماني", color: "#b45309", icon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', hint: "الصلاة، القرآن، الأذكار، الصدقة والتطوع." },
    { id: "health", name: "المجال الصحي والبدني", short: "صحي", color: "#16a34a", icon: '<path d="M3 12h4l2-5 4 10 2-5h6"/>', hint: "الرياضة، النوم، التغذية، الفحوصات الدورية." },
  ];
  const AR = Object.fromEntries(AREAS.map(a => [a.id, a]));
  window.LifeAreas = AREAS;
  const ROUTES = { "life/dashboard": "لوحة التحكم الشخصية", "life/goals": "التخطيط والأهداف", "life/habits": "العادات اليومية", "life/notes": "الأفكار والملاحظات", "life/reviews": "المراجعات والتقييم" };
  AREAS.forEach(a => { ROUTES["life/" + a.id] = a.name; });

  let db = null, me = "", goals = [], habits = [], notes = [], reviews = [], tasks = [], unsubs = [], route = "", loaded = false;
  const today = () => new Date().toLocaleDateString("en-CA");
  const T = () => window.Tasks;
  const myTasks = () => tasks.filter(t => !t.parentId && (t.owner === me || t.assignee === me));
  const open = t => !["done", "cancelled"].includes(t.status);
  const day = s => s ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short" }).format(new Date(s + "T12:00:00")) : "";

  /* ---------- a goal's progress, from its tasks ---------- */
  function goalProgress(g){
    const linked = tasks.filter(t => t.goalId === g.id && t.status !== "cancelled"), done = linked.filter(t => t.status === "done");
    if (g.measure === "number"){
      const cur = (+g.start || 0) + done.reduce((s, t) => s + (+t.goalValue || 0), 0), target = +g.target || 0;
      return { pct: target ? Math.min(100, Math.round(cur / target * 100)) : 0, label: `${fmtN(cur)} من ${fmtN(target)} ${esc(g.unit || "")}`, linked, done };
    }
    return { pct: linked.length ? Math.round(done.length / linked.length * 100) : 0, label: `${done.length} من ${linked.length} مهام`, linked, done };
  }
  const fmtN = n => new Intl.NumberFormat("ar-SA-u-nu-latn", { maximumFractionDigits: 1 }).format(+n || 0);
  const bar = (p, color) => `<span class="pbar"><i style="width:${p}%;background:${color || "var(--accent)"}"></i></span>`;

  /* ---------- drawing ---------- */
  function draw(){
    const box = $("lifeView"); if (!box || !route) return;
    if (!db){ box.innerHTML = '<p class="muted-text">سجّل الدخول لعرض بياناتك الشخصية</p>'; return; }
    const r = route.slice(5);
    if (r === "dashboard") box.innerHTML = dashboard();
    else if (r === "goals") box.innerHTML = goalsPage();
    else if (AR[r]) box.innerHTML = areaPage(AR[r]);
    else if (r === "habits") box.innerHTML = habitsPage();
    else if (r === "notes") box.innerHTML = notesPage();
    else if (r === "reviews") box.innerHTML = reviewsPage();
  }
  const head = (title, sub, actions = "") => `<header class="page-h"><div><p class="crumb">إدارة حياتي الشخصية</p><h1>${esc(title)}</h1>${sub ? `<p class="rq-subh">${esc(sub)}</p>` : ""}</div><div class="actions">${actions}</div></header>`;
  function taskRow(t){
    const late = t.due && t.due < today() && open(t), g = goals.find(x => x.id === t.goalId), a = AR[t.area];
    return `<li class="lf-t${t.status === "done" ? " done" : ""}"><input type="checkbox" data-done="${esc(t.id)}"${t.status === "done" ? " checked" : ""} aria-label="مكتملة"><button type="button" class="lf-tt" data-open="${esc(t.id)}">${esc(t.title)}</button>
      ${a ? `<span class="lf-chip" style="--c:${a.color}">${esc(a.short)}</span>` : ""}${g ? `<span class="lf-chip g">🎯 ${esc(g.title)}</span>` : ""}<span class="lf-due${late ? " late" : ""}">${t.due ? (late ? "متأخرة · " : "") + day(t.due) : ""}</span></li>`;
  }
  function goalCard(g){
    const a = AR[g.area], p = goalProgress(g);
    return `<article class="lf-goal" style="--c:${a ? a.color : "var(--accent)"}"><div class="lf-gh"><span class="lf-gi">${a ? I(a.icon) : "🎯"}</span><div><h3>${esc(g.title)}</h3><p>${a ? esc(a.name) : "بدون مجال"}${g.due ? " · حتى " + day(g.due) : ""}${g.status === "done" ? " · مكتمل" : g.status === "paused" ? " · متوقف" : ""}</p></div></div>
      <div class="lf-gp">${bar(p.pct, a && a.color)}<b>${p.pct}%</b></div><p class="lf-gl">${p.label}</p>
      <div class="lf-ga"><button type="button" class="btn small" data-addtask-goal="${esc(g.id)}">+ مهمة</button><button type="button" class="btn small ghost" data-editgoal="${esc(g.id)}">تعديل</button></div></article>`;
  }
  function quickAdd(area, goalId){
    return `<form class="lf-quick" data-area="${area || ""}" data-goal="${goalId || ""}"><input class="input" name="t" placeholder="أضف مهمة… مثال: مراجعة الميزانية الخميس 9 ص" autocomplete="off"><button class="btn primary small" type="submit">إضافة</button></form>`;
  }
  function dashboard(){
    const mt = myTasks(), op = mt.filter(open), td = today();
    const late = op.filter(t => t.due && t.due < td), dueToday = op.filter(t => t.due === td), activeGoals = goals.filter(g => g.status !== "done" && g.status !== "paused");
    const avg = activeGoals.length ? Math.round(activeGoals.reduce((s, g) => s + goalProgress(g).pct, 0) / activeGoals.length) : 0;
    const doneWeek = mt.filter(t => t.status === "done" && t.doneAt && Date.now() - Date.parse(t.doneAt) < 7 * 864e5).length;
    const habitToday = habits.filter(h => (h.log || {})[td]).length;
    return head("لوحة التحكم الشخصية", "صورة واحدة لحياتك: المهام والأهداف والعادات في كل المجالات.") +
      `<div class="lf-stats"><a href="#/tasks" class="lf-stat"><b>${dueToday.length}</b><span>مهام اليوم</span></a><a href="#/tasks" class="lf-stat${late.length ? " warn" : ""}"><b>${late.length}</b><span>متأخرة</span></a>
        <a href="#/life/goals" class="lf-stat"><b>${avg}%</b><span>متوسط تقدّم الأهداف</span></a><span class="lf-stat"><b>${doneWeek}</b><span>أُنجزت هذا الأسبوع</span></span><a href="#/life/habits" class="lf-stat"><b>${habitToday}/${habits.length}</b><span>عادات اليوم</span></a></div>
      <div class="lf-grid">${AREAS.map(a => { const at = op.filter(t => t.area === a.id), ag = goals.filter(g => g.area === a.id && g.status !== "done"), ap = ag.length ? Math.round(ag.reduce((s, g) => s + goalProgress(g).pct, 0) / ag.length) : null;
        return `<a class="lf-area" href="#/life/${a.id}" style="--c:${a.color}"><span class="lf-ai">${I(a.icon)}</span><b>${esc(a.name)}</b><span class="lf-am">${at.length} مهام مفتوحة · ${ag.length} أهداف</span>${ap === null ? '<span class="lf-am muted">لا أهداف بعد</span>' : `<span class="lf-ap">${bar(ap, a.color)}<i>${ap}%</i></span>`}</a>`; }).join("")}</div>
      <div class="lf-two"><section class="card"><div class="card-h"><h2>اليوم والمتأخر</h2><a class="link" href="#/tasks">كل المهام</a></div>${quickAdd("", "")}<ul class="lf-tl">${[...late, ...dueToday].slice(0, 12).map(taskRow).join("") || '<li class="muted-text lf-none">لا مهام لليوم. يومك خفيف 🌿</li>'}</ul></section>
        <section class="card"><div class="card-h"><h2>أهداف قيد التنفيذ</h2><a class="link" href="#/life/goals">كل الأهداف</a></div><div class="lf-gl2">${activeGoals.slice(0, 5).map(g => { const p = goalProgress(g), a = AR[g.area]; return `<div class="lf-gmini"><span>${esc(g.title)}</span>${bar(p.pct, a && a.color)}<b>${p.pct}%</b></div>`; }).join("") || '<p class="muted-text">لا أهداف بعد. <a class="link" href="#/life/goals">أضف هدفك الأول</a></p>'}</div></section></div>`;
  }
  function goalsPage(){
    const f = sessionStorage.getItem("lf-gf") || "";
    const list = goals.filter(g => !f || g.area === f).sort((a, b) => (a.status === "done") - (b.status === "done") || String(a.due || "9").localeCompare(String(b.due || "9")));
    return head("التخطيط والأهداف", "كل هدف يُقاس تلقائياً من المهام المرتبطة به.", '<button class="btn primary" type="button" data-newgoal="">+ هدف جديد</button>') +
      `<div class="lf-filter"><button type="button" data-gf="" aria-pressed="${!f}">الكل</button>${AREAS.map(a => `<button type="button" data-gf="${a.id}" aria-pressed="${f === a.id}" style="--c:${a.color}">${esc(a.short)}</button>`).join("")}</div>
      <div class="lf-goals">${list.map(goalCard).join("") || '<p class="ig-empty">لا أهداف بعد. اضغط «هدف جديد».</p>'}</div>`;
  }
  function areaPage(a){
    const ag = goals.filter(g => g.area === a.id), at = myTasks().filter(t => t.area === a.id), op = at.filter(open), done = at.filter(t => t.status === "done").slice(-5).reverse();
    return `<div class="lf-ahead" style="--c:${a.color}"><span class="lf-ai big">${I(a.icon)}</span><div><p class="crumb">إدارة حياتي الشخصية</p><h1>${esc(a.name)}</h1><p>${esc(a.hint)}</p></div><button class="btn primary" type="button" data-newgoal="${a.id}">+ هدف</button></div>
      <div class="lf-two"><section class="card"><div class="card-h"><h2>المهام</h2><span class="meta">${op.length} مفتوحة</span></div>${quickAdd(a.id, "")}<ul class="lf-tl">${op.map(taskRow).join("") || '<li class="muted-text lf-none">لا مهام مفتوحة في هذا المجال</li>'}</ul>
          ${done.length ? `<details class="lf-done"><summary>أُنجز مؤخراً (${done.length})</summary><ul class="lf-tl">${done.map(taskRow).join("")}</ul></details>` : ""}</section>
        <section class="card"><div class="card-h"><h2>الأهداف</h2><span class="meta">${ag.length}</span></div><div class="lf-goals one">${ag.map(goalCard).join("") || '<p class="muted-text">لا أهداف في هذا المجال بعد.</p>'}</div></section></div>`;
  }
  function habitsPage(){
    const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d.toLocaleDateString("en-CA"); });
    const wd = d => new Intl.DateTimeFormat("ar-SA", { weekday: "short" }).format(new Date(d + "T12:00:00"));
    const streak = h => { let n = 0; const d = new Date(); for (;;){ const k = d.toLocaleDateString("en-CA"); if ((h.log || {})[k]){ n++; d.setDate(d.getDate() - 1); } else break; } return n; };
    return head("العادات اليومية", "علّم العادة كل يوم تنجزها فيه، وتابع سلسلتك.") +
      `<form class="lf-quick" id="lfHabitAdd"><input class="input" name="t" placeholder="عادة جديدة… مثال: قراءة 10 صفحات" autocomplete="off"><select class="select" name="a"><option value="">بدون مجال</option>${AREAS.map(a => `<option value="${a.id}">${esc(a.short)}</option>`).join("")}</select><button class="btn primary small" type="submit">إضافة</button></form>
      <div class="card lf-habits"><div class="lf-hr lf-hh"><span></span>${days.map(d => `<span>${wd(d)}<small>${+d.slice(8)}</small></span>`).join("")}<span>السلسلة</span><span></span></div>
        ${habits.map(h => { const a = AR[h.area]; return `<div class="lf-hr"><span class="lf-hn">${a ? `<i style="background:${a.color}"></i>` : ""}${esc(h.title)}</span>${days.map(d => `<button type="button" class="lf-hc${(h.log || {})[d] ? " on" : ""}" data-habit="${esc(h.id)}" data-day="${d}" aria-label="${d}" style="--c:${a ? a.color : "var(--accent)"}">${(h.log || {})[d] ? "✓" : ""}</button>`).join("")}<b>${streak(h)} 🔥</b><button type="button" class="lf-x" data-delhabit="${esc(h.id)}" aria-label="حذف العادة">×</button></div>`; }).join("") || '<p class="muted-text lf-none">لا عادات بعد. أضف أول عادة من الأعلى.</p>'}</div>`;
  }
  function notesPage(){
    const q = (sessionStorage.getItem("lf-nq") || "").trim();
    const list = notes.filter(n => !q || (n.text || "").includes(q)).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.at).localeCompare(String(a.at)));
    return head("الأفكار والملاحظات", "التقط الفكرة قبل أن تطير، وحوّلها إلى مهمة متى شئت.") +
      `<form class="lf-note-add" id="lfNoteAdd"><textarea class="input" name="t" rows="3" placeholder="اكتب فكرة أو ملاحظة…"></textarea><div><select class="select" name="a"><option value="">بدون مجال</option>${AREAS.map(a => `<option value="${a.id}">${esc(a.short)}</option>`).join("")}</select><button class="btn primary small" type="submit">حفظ</button></div></form>
      <input class="input lf-nq" id="lfNq" type="search" placeholder="ابحث في ملاحظاتك" value="${esc(q)}">
      <div class="lf-notes">${list.map(n => { const a = AR[n.area]; return `<article class="lf-note${n.pinned ? " pin" : ""}" style="--c:${a ? a.color : "var(--line)"}"><p>${esc(n.text).replace(/\n/g, "<br>")}</p><footer>${a ? `<span class="lf-chip" style="--c:${a.color}">${esc(a.short)}</span>` : ""}<small>${day((n.at || "").slice(0, 10))}</small>
        <button type="button" class="linkbtn" data-pin="${esc(n.id)}">${n.pinned ? "إلغاء التثبيت" : "تثبيت"}</button><button type="button" class="linkbtn" data-note2task="${esc(n.id)}">← مهمة</button><button type="button" class="linkbtn danger-text" data-delnote="${esc(n.id)}">حذف</button></footer></article>`; }).join("") || '<p class="muted-text">لا ملاحظات.</p>'}</div>`;
  }
  const RQ = [["wins", "ما أبرز ما أنجزته؟"], ["lessons", "ماذا تعلّمت؟"], ["blocks", "ما الذي عطّلك؟"], ["next", "ما أهم ثلاث أولويات للفترة القادمة؟"]];
  function reviewsPage(){
    const list = reviews.slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const mt = myTasks(), wk = mt.filter(t => t.status === "done" && t.doneAt && Date.now() - Date.parse(t.doneAt) < 7 * 864e5);
    return head("المراجعات والتقييم", "وقفة أسبوعية أو شهرية: ما الذي تحقق، وما الذي يحتاج تعديلاً.") +
      `<form class="card lf-rev" id="lfRevAdd"><div class="card-h"><h2>مراجعة جديدة</h2><select class="select" name="kind"><option value="week">أسبوعية</option><option value="month">شهرية</option><option value="quarter">ربع سنوية</option></select></div>
        <p class="muted-text">أنجزت ${wk.length} مهمة خلال آخر 7 أيام${goals.length ? `، ومتوسط تقدّم أهدافك ${Math.round(goals.reduce((s, g) => s + goalProgress(g).pct, 0) / goals.length)}%` : ""}.</p>
        <div class="lf-rate"><span>تقييمك العام للفترة</span>${[1, 2, 3, 4, 5].map(i => `<label><input type="radio" name="score" value="${i}"${i === 3 ? " checked" : ""}><span>${i}</span></label>`).join("")}</div>
        ${RQ.map(([k, l]) => `<label class="ig-f"><span>${l}</span><textarea class="input" name="${k}" rows="2"></textarea></label>`).join("")}<button class="btn primary" type="submit">حفظ المراجعة</button></form>
      <div class="lf-revs">${list.map(r => `<details class="card lf-revi"><summary><b>${{ week: "أسبوعية", month: "شهرية", quarter: "ربع سنوية" }[r.kind] || "مراجعة"}</b><span>${day((r.at || "").slice(0, 10))}</span><span class="lf-score">${"★".repeat(+r.score || 0)}</span></summary>${RQ.filter(([k]) => r[k]).map(([k, l]) => `<h4>${l}</h4><p>${esc(r[k]).replace(/\n/g, "<br>")}</p>`).join("")}<button type="button" class="linkbtn danger-text" data-delrev="${esc(r.id)}">حذف</button></details>`).join("")}</div>`;
  }

  /* ---------- the goal form ---------- */
  async function goalForm(g, area){
    const v = g || { title: "", area: area || "", measure: "tasks", target: "", start: 0, unit: "", due: "", status: "active", why: "" };
    const back = document.createElement("div"); back.className = "ui-scrim";
    const box = document.createElement("div"); box.className = "ui-dialog lf-gform"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    box.innerHTML = `<h2>${g ? "تعديل الهدف" : "هدف جديد"}</h2><form>
      <label class="ig-f"><span>الهدف</span><input class="input" name="title" required value="${esc(v.title)}" placeholder="مثال: ادخار 20,000 ريال"></label>
      <div class="lf-row"><label class="ig-f"><span>المجال</span><select class="select" name="area"><option value="">بدون مجال</option>${AREAS.map(a => `<option value="${a.id}"${a.id === v.area ? " selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>
        <label class="ig-f"><span>الموعد المستهدف</span><input class="input" type="date" name="due" value="${esc(v.due)}"></label></div>
      <label class="ig-f"><span>طريقة القياس</span><select class="select" name="measure"><option value="tasks"${v.measure !== "number" ? " selected" : ""}>نسبة المهام المنجزة المرتبطة به</option><option value="number"${v.measure === "number" ? " selected" : ""}>رقم مستهدف (تضيف كل مهمة منجزة قيمتها)</option></select></label>
      <div class="lf-row lf-num"${v.measure === "number" ? "" : " hidden"}><label class="ig-f"><span>المستهدف</span><input class="input" name="target" inputmode="decimal" value="${esc(v.target)}"></label><label class="ig-f"><span>القيمة الحالية</span><input class="input" name="start" inputmode="decimal" value="${esc(v.start)}"></label><label class="ig-f"><span>الوحدة</span><input class="input" name="unit" value="${esc(v.unit)}" placeholder="ريال، صفحة، كم…"></label></div>
      <label class="ig-f"><span>لماذا هذا الهدف؟ <i>(اختياري)</i></span><textarea class="input" name="why" rows="2">${esc(v.why || "")}</textarea></label>
      ${g ? `<label class="ig-f"><span>الحالة</span><select class="select" name="status"><option value="active"${v.status === "active" ? " selected" : ""}>قيد التنفيذ</option><option value="paused"${v.status === "paused" ? " selected" : ""}>متوقف</option><option value="done"${v.status === "done" ? " selected" : ""}>مكتمل</option></select></label>` : ""}
      <div class="ui-actions"><button class="btn primary" type="submit">حفظ</button><button class="btn" type="button" data-x>إلغاء</button>${g ? '<button class="btn ghost danger-text" type="button" data-del>حذف الهدف</button>' : ""}</div></form>`;
    document.body.append(back, box);
    const f = box.querySelector("form"), close = () => { back.remove(); box.remove(); };
    f.measure.addEventListener("change", () => { box.querySelector(".lf-num").hidden = f.measure.value !== "number"; });
    box.querySelector("[data-x]").addEventListener("click", close); back.addEventListener("click", close);
    const del = box.querySelector("[data-del]");
    if (del) del.addEventListener("click", async () => { if (!(await UI.confirm("حذف الهدف؟ مهامه تبقى في قائمة المهام بدون ربط.", { ok: "حذف", danger: true }))) return; close(); await db.collection("lifeGoals").doc(g.id).delete().catch(e => { console.error(e); UI.toast("تعذّر الحذف", "err"); }); });
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const data = { title: f.title.value.trim(), area: f.area.value, due: f.due.value, measure: f.measure.value, target: +String(f.target.value).replace(/[^\d.]/g, "") || 0, start: +String(f.start.value).replace(/[^\d.]/g, "") || 0, unit: f.unit.value.trim(), why: f.why.value.trim(), status: f.status ? f.status.value : "active", updatedAt: new Date().toISOString() };
      if (!data.title) return;
      if (data.measure === "number" && !data.target){ UI.toast("اكتب الرقم المستهدف", "err"); return; }
      try { if (g) await db.collection("lifeGoals").doc(g.id).update(data); else await db.collection("lifeGoals").add({ ...data, owner: me, createdAt: data.updatedAt }); close(); UI.toast("حُفظ الهدف"); }
      catch (err){ console.error(err); UI.toast("تعذّر الحفظ", "err"); }
    });
    setTimeout(() => f.title.focus(), 30);
  }

  /* ---------- tasks made from a life page go to the one task system ---------- */
  async function addTask(title, area, goalId){
    if (!T() || !T().create){ UI.toast("قسم المهام غير متاح لحسابك", "err"); return; }
    let patch = { title };
    if (window.SmartTask){ try { const p = SmartTask.parse(title); if (p && p.title) patch = { title: p.title, due: p.date || null, time: p.time || null, ...(p.priority ? { priority: p.priority } : {}) }; } catch {} }
    const g = goals.find(x => x.id === goalId);
    if (g && !area) area = g.area || "";
    let goalValue = 0;
    if (g && g.measure === "number"){ const v = await UI.prompt(`كم تضيف هذه المهمة إلى «${g.title}» عند إنجازها؟ (${g.unit || "رقم"})`, { title: "قيمة المهمة في الهدف", ok: "إضافة", note: "", noteRequired: false, placeholder: "مثال: 500" }); if (!v) return; goalValue = +String(v.note).replace(/[^\d.]/g, "") || 0; }
    const id = await T().create({ ...patch, area: area || null, goalId: goalId || null, ...(goalValue ? { goalValue } : {}) });
    if (id) UI.toast("أُضيفت المهمة، وتظهر في قسم المهام");
  }

  /* ---------- events ---------- */
  const view = $("lifeView");
  view.addEventListener("submit", async e => {
    const f = e.target; e.preventDefault();
    if (f.classList.contains("lf-quick") && f.id !== "lfHabitAdd"){ const t = f.t.value.trim(); if (!t) return; f.t.value = ""; addTask(t, f.dataset.area, f.dataset.goal); return; }
    if (f.id === "lfHabitAdd"){ const t = f.t.value.trim(); if (!t) return; await db.collection("lifeHabits").add({ owner: me, title: t.slice(0, 120), area: f.a.value, log: {}, createdAt: new Date().toISOString() }).catch(err => { console.error(err); UI.toast("تعذّر الحفظ", "err"); }); return; }
    if (f.id === "lfNoteAdd"){ const t = f.t.value.trim(); if (!t) return; await db.collection("lifeNotes").add({ owner: me, text: t.slice(0, 5000), area: f.a.value, pinned: false, at: new Date().toISOString() }).catch(err => { console.error(err); UI.toast("تعذّر الحفظ", "err"); }); return; }
    if (f.id === "lfRevAdd"){ const d = { owner: me, kind: f.kind.value, score: +f.score.value, at: new Date().toISOString() }; RQ.forEach(([k]) => { d[k] = f[k].value.trim().slice(0, 3000); }); await db.collection("lifeReviews").add(d).then(() => UI.toast("حُفظت المراجعة")).catch(err => { console.error(err); UI.toast("تعذّر الحفظ", "err"); }); }
  });
  view.addEventListener("click", async e => {
    const b = e.target.closest("button, [data-open]"); if (!b) return; const d = b.dataset;
    if (d.open && window.TaskDetail) TaskDetail.open(d.open);
    else if (d.newgoal !== undefined) goalForm(null, d.newgoal);
    else if (d.editgoal) goalForm(goals.find(g => g.id === d.editgoal));
    else if (d.addtaskGoal){ const g = goals.find(x => x.id === d.addtaskGoal); const v = await UI.prompt(`مهمة جديدة لهدف «${g.title}»`, { title: "مهمة للهدف", ok: "متابعة", note: "", noteRequired: true, placeholder: "عنوان المهمة… مثال: تحويل 500 ريال للادخار الخميس" }); if (v && v.note.trim()) addTask(v.note.trim(), g.area, g.id); }
    else if (d.gf !== undefined){ sessionStorage.setItem("lf-gf", d.gf); draw(); }
    else if (d.habit){ const h = habits.find(x => x.id === d.habit), log = { ...(h.log || {}) }; if (log[d.day]) delete log[d.day]; else log[d.day] = true; db.collection("lifeHabits").doc(h.id).update({ log }).catch(err => console.error(err)); }
    else if (d.delhabit){ if (await UI.confirm("حذف العادة وسجلها؟", { ok: "حذف", danger: true })) db.collection("lifeHabits").doc(d.delhabit).delete(); }
    else if (d.pin){ const n = notes.find(x => x.id === d.pin); db.collection("lifeNotes").doc(n.id).update({ pinned: !n.pinned }); }
    else if (d.delnote){ if (await UI.confirm("حذف الملاحظة؟", { ok: "حذف", danger: true })) db.collection("lifeNotes").doc(d.delnote).delete(); }
    else if (d.note2task){ const n = notes.find(x => x.id === d.note2task); addTask(n.text.split("\n")[0].slice(0, 200), n.area, ""); }
    else if (d.delrev){ if (await UI.confirm("حذف المراجعة؟", { ok: "حذف", danger: true })) db.collection("lifeReviews").doc(d.delrev).delete(); }
  });
  view.addEventListener("change", e => { const id = e.target.dataset.done; if (id && T()) T().update(id, { status: e.target.checked ? "done" : "todo" }).then(ok => { if (!ok) e.target.checked = !e.target.checked; }); });
  view.addEventListener("input", e => { if (e.target.id === "lfNq"){ sessionStorage.setItem("lf-nq", e.target.value); clearTimeout(view._nq); view._nq = setTimeout(() => { draw(); const q = $("lfNq"); if (q){ q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 250); } });

  /* ---------- data ---------- */
  window.addEventListener("app:tasks", e => { tasks = e.detail.tasks || []; if (route) draw(); });
  window.addEventListener("app:view", e => { route = String(e.detail || "").startsWith("life/") ? e.detail : ""; if (route) draw(); });
  function connect({ db: d, user }){
    unsubs.forEach(f => f()); unsubs = []; db = d; me = user ? user.email : ""; goals = []; habits = []; notes = []; reviews = [];
    if (!db){ draw(); return; }
    const watch = (col, set) => unsubs.push(db.collection(col).where("owner", "==", me).onSnapshot(s => { set(s.docs.map(x => ({ id: x.id, ...x.data() }))); if (route) draw(); }, err => console.error(col, err)));
    watch("lifeGoals", v => { goals = v; }); watch("lifeHabits", v => { habits = v; }); watch("lifeNotes", v => { notes = v; }); watch("lifeReviews", v => { reviews = v; });
    if (window.Tasks && window.Tasks.list) tasks = window.Tasks.list;
    draw();
  }
  window.Life = { goals: () => goals.slice(), AREAS, ROUTES };
  window.addEventListener("app:db", e => connect(e.detail));
  if (window.appDb) connect({ db: window.appDb, user: window.appUser });
  const r0 = location.hash.replace(/^#\/?/, ""); if (r0.startsWith("life/")){ route = r0; draw(); }
})();
