/* إدارة المشاريع (المرحلة الخامسة)
   - سجل المشاريع (projects/registry): the projects people already use in المهام ("taskProjects"), promoted to the
     registry with reg:true and the project's details (association, manager, dates, budget, beneficiaries, KPIs).
     Progress comes from the project's own tasks, so nothing is entered twice.
   - صفحة المشروع: overview, tasks, KPIs, budget, linked surveys, and the initiative document it came from.
   - تحويل وثيقة مبادرة إلى مشروع: Projects.fromInitiative(doc) (a button on the initiative result).
   - مركز التقارير (projects/reports): projects, tasks, associations, surveys and requests, with CSV export and print.
   Other pages: window.Projects.list(), .byId(id), .open(id), and the "app:projects" event. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
  const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
  const days = d => Math.round((Date.parse(String(d).slice(0, 10) + "T12:00:00") - Date.parse(today() + "T12:00:00")) / 864e5);
  const fmtG = d => isDay(d) ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d + "T12:00:00")) : "—";
  const num = v => { const n = +String(v ?? "").replace(/[^\d.]/g, ""); return Number.isFinite(n) ? n : 0; };
  const money = n => n ? new Intl.NumberFormat("ar-SA-u-nu-latn").format(Math.round(n)) + " ر.س" : "—";
  const moneyZ = n => new Intl.NumberFormat("ar-SA-u-nu-latn").format(Math.round(n || 0)) + " ر.س";
  const nf = n => new Intl.NumberFormat("ar-SA-u-nu-latn").format(Math.round(n || 0));
  const clamp = n => Math.max(0, Math.min(100, Math.round(n || 0)));
  const T = () => window.Tasks;
  const A = () => window.Assocs ? Assocs.list() : [];
  const assocName = id => { const a = id && window.Assocs && Assocs.byId(id); return a ? a.name : ""; };
  const COLORS = ["#7c3aed", "#0f766e", "#2563eb", "#b45309", "#be123c", "#0891b2", "#4d7c0f", "#334155"];
  const STATUS = { idea: ["فكرة", "var(--muted)"], planning: ["تخطيط", "var(--info)"], active: ["قيد التنفيذ", "var(--accent)"], onhold: ["متوقف", "var(--warn)"], done: ["مكتمل", "var(--ok)"], cancelled: ["ملغى", "var(--muted)"] };
  const pill = (l, c) => `<span class="og-pill" style="--c:${c}">${esc(l)}</span>`;
  const bar = p => `<span class="pj-bar"><i style="width:${clamp(p)}%"></i></span><b class="pj-pct">${clamp(p)}%</b>`;

  let db = null, me = "", admin = false, all = [], loaded = false, unsub = null, reqs = [];
  let pid = null, ptab = "overview", fStatus = "", fAssoc = "", fQ = "";
  const projects = () => all.filter(p => p.reg);
  const byId = id => all.find(p => p.id === id) || null;
  const canEdit = p => admin || !p || p.owner === me;

  /* ---------- derived ---------- */
  const tasksOf = id => T() && T().list ? T().list.filter(t => t.projectId === id && !t.parentId && t.status !== "cancelled") : [];
  function progress(p){
    const ts = tasksOf(p.id);
    if (ts.length) return clamp(ts.reduce((s, t) => s + T().pct(t), 0) / ts.length);
    const k = (p.kpis || []).filter(x => num(x.target) > 0);
    if (k.length) return clamp(k.reduce((s, x) => s + Math.min(100, num(x.actual) / num(x.target) * 100), 0) / k.length);
    return p.status === "done" ? 100 : 0;
  }
  function health(p, prog){
    if (p.status === "done") return ["مكتمل", "var(--ok)"];
    if (p.status === "cancelled") return ["ملغى", "var(--muted)"];
    if (p.status === "onhold") return ["متوقف", "var(--warn)"];
    if (p.status === "idea" || p.status === "planning") return ["لم يبدأ", "var(--info)"];
    if (isDay(p.end) && days(p.end) < 0) return ["تجاوز الموعد", "var(--danger)"];
    if (isDay(p.start) && isDay(p.end)){
      const span = Math.max(1, days(p.end) - days(p.start)), el = Math.max(0, -days(p.start)), exp = clamp(el / span * 100);
      if (prog < exp - 20) return ["متأخر", "var(--danger)"];
      if (prog < exp - 8) return ["يحتاج انتباه", "var(--warn)"];
    }
    const late = tasksOf(p.id).filter(t => t.status !== "done" && t.due && t.due < today()).length;
    if (late >= 3) return ["يحتاج انتباه", "var(--warn)"];
    return ["على المسار", "var(--ok)"];
  }
  function budgetOf(p){
    const items = p.budgetItems || [];
    const planned = items.length ? items.reduce((s, x) => s + num(x.planned), 0) : num(p.budget);
    const spent = items.length ? items.reduce((s, x) => s + num(x.actual), 0) : num(p.spent);
    return { planned, spent, pct: planned ? Math.round(spent / planned * 100) : 0 };
  }
  const row = p => { const prog = progress(p), ts = tasksOf(p.id); return { p, prog, h: health(p, prog), b: budgetOf(p), tasks: ts.length, done: ts.filter(t => t.status === "done").length, late: ts.filter(t => t.status !== "done" && t.due && t.due < today()).length }; };

  /* ---------- the registry ---------- */
  function drawRegistry(){
    const box = $("pjView"); if (!box || box.closest(".view").hidden) return;
    $("pjNew").hidden = !db || !!pid; $("pjPromote").hidden = !db || !!pid || !all.some(p => !p.reg);
    if (!db){ box.innerHTML = '<p class="muted-text">سجّل الدخول لعرض المشاريع</p>'; return; }
    if (pid && byId(pid)){ box.innerHTML = projectPage(byId(pid)); return; }
    pid = null;
    const rows = projects().map(row);
    const list = rows.filter(r => (!fStatus || r.p.status === fStatus) && (!fAssoc || r.p.assocId === fAssoc) && (!fQ || [r.p.name, r.p.code, r.p.manager, assocName(r.p.assocId)].join(" ").includes(fQ)))
      .sort((a, b) => ({ active: 0, planning: 1, idea: 2, onhold: 3, done: 4, cancelled: 5 }[a.p.status] ?? 9) - ({ active: 0, planning: 1, idea: 2, onhold: 3, done: 4, cancelled: 5 }[b.p.status] ?? 9) || String(a.p.end || "9").localeCompare(String(b.p.end || "9")));
    const live = rows.filter(r => r.p.status !== "cancelled"), act = rows.filter(r => r.p.status === "active");
    const bud = live.reduce((s, r) => ({ planned: s.planned + r.b.planned, spent: s.spent + r.b.spent }), { planned: 0, spent: 0 });
    const ben = live.reduce((s, r) => ({ t: s.t + num(r.p.benefTarget), a: s.a + num(r.p.benefActual) }), { t: 0, a: 0 });
    const lateN = act.filter(r => r.h[1] === "var(--danger)").length;
    box.innerHTML = `<div class="og-kpis pj-dash">
        <div><b>${rows.length}</b><span>إجمالي المشاريع</span><small>${rows.filter(r => r.p.status === "done").length} مكتمل</small></div>
        <div><b>${act.length}</b><span>قيد التنفيذ</span></div>
        <div class="${lateN ? "warn" : ""}"><b>${lateN}</b><span>متأخرة أو تجاوزت موعدها</span></div>
        <div><b>${act.length ? clamp(act.reduce((s, r) => s + r.prog, 0) / act.length) : 0}%</b><span>متوسط إنجاز النشطة</span></div>
        <div><b>${bud.planned ? Math.round(bud.spent / bud.planned * 100) + "%" : "—"}</b><span>المصروف من الميزانية</span><small>${moneyZ(bud.spent)} من ${money(bud.planned)}</small></div>
        <div><b>${nf(ben.a)}</b><span>المستفيدون الفعليون</span><small>${ben.t ? "من " + nf(ben.t) + " مستهدف" : ""}</small></div>
      </div>
      <div class="rq-filters"><div class="rq-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="input" id="pjQ" type="search" value="${esc(fQ)}" placeholder="ابحث باسم المشروع أو رمزه أو مديره" aria-label="بحث في المشاريع"></div>
        <select class="select" id="pjFS" aria-label="الحالة"><option value="">كل الحالات</option>${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}"${k === fStatus ? " selected" : ""}>${l}</option>`).join("")}</select>
        <select class="select" id="pjFA" aria-label="الجمعية"><option value="">كل الجمعيات</option>${A().map(a => `<option value="${esc(a.id)}"${a.id === fAssoc ? " selected" : ""}>${esc(a.name)}</option>`).join("")}</select>
        <span class="rq-fn">${list.length} من ${rows.length}</span></div>
      ${list.length ? `<div class="og-tw"><table class="og-t pj-t"><thead><tr><th>المشروع</th><th>الجمعية</th><th>المدير</th><th>الحالة</th><th>الإنجاز</th><th>الوضع</th><th>النهاية</th><th>الميزانية</th></tr></thead><tbody>${list.map(r => `<tr data-pj="${esc(r.p.id)}" tabindex="0">
        <td><span class="pj-dot" style="--c:${esc(r.p.color || COLORS[0])}"></span><b>${esc(r.p.name)}</b>${r.p.code ? `<small dir="ltr">${esc(r.p.code)}</small>` : ""}</td><td>${esc(assocName(r.p.assocId) || "—")}</td><td>${esc(r.p.manager || "—")}</td>
        <td>${pill(...(STATUS[r.p.status] || STATUS.planning))}</td><td class="pj-pc">${bar(r.prog)}<small>${r.done}/${r.tasks} مهمة${r.late ? ` · ${r.late} متأخرة` : ""}</small></td><td>${pill(...r.h)}</td><td>${fmtG(r.p.end)}</td>
        <td>${r.b.planned ? `${moneyZ(r.b.spent)}<small>من ${money(r.b.planned)} (${r.b.pct}%)</small>` : "—"}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="ig-empty">${rows.length ? "لا توجد مشاريع تطابق التصفية." : "لا توجد مشاريع في السجل بعد. أنشئ مشروعاً، أو حوّل وثيقة مبادرة إلى مشروع، أو أضف مشروعاً تستخدمه في المهام."}</p>`}`;
  }

  /* ---------- the project page ---------- */
  function projectPage(p){
    const r = row(p), ts = tasksOf(p.id), ed = canEdit(p);
    const forms = (window.FormsList ? FormsList() : []).filter(f => f.settings && f.settings.projectId === p.id);
    const ini = p.initiativeId && window.Initiatives ? Initiatives.list().find(x => x.id === p.initiativeId) : null;
    const TABS = [["overview", "نظرة عامة"], ["tasks", `المهام <i>${ts.length}</i>`], ["kpis", `المؤشرات <i>${(p.kpis || []).length}</i>`], ["budget", "الميزانية"], ["forms", `الاستبيانات <i>${forms.length}</i>`], ["doc", "وثيقة المبادرة"]];
    const body = ptab === "tasks" ? tasksTab(p, ts) : ptab === "kpis" ? kpisTab(p, ed) : ptab === "budget" ? budgetTab(p, ed) : ptab === "forms" ? formsTab(forms) : ptab === "doc" ? docTab(p, ini) : overview(p, r, ts);
    return `<header class="ig-rbar"><button class="btn small ghost" type="button" data-pa="back"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>سجل المشاريع</button></header>
      <section class="og-hero card pj-hero" style="--c:${esc(p.color || COLORS[0])}"><span class="pj-ring" style="--p:${r.prog}"><b>${r.prog}%</b></span>
        <div class="og-hn"><h1>${esc(p.name)}</h1><p>${[p.code ? `<span dir="ltr">${esc(p.code)}</span>` : "", esc(assocName(p.assocId)), p.manager ? "المدير: " + esc(p.manager) : ""].filter(Boolean).join(" · ") || "—"}</p><div class="pj-pills">${pill(...(STATUS[p.status] || STATUS.planning))} ${pill(...r.h)}</div></div>
        <div class="actions">${ed ? '<button class="btn small" type="button" data-pa="edit">تعديل</button>' : ""}<button class="btn small primary" type="button" data-pa="task">+ مهمة</button>${ed ? '<button class="btn small ghost danger-text" type="button" data-pa="del">إزالة من السجل</button>' : ""}</div></section>
      <div class="fu-tabs og-ptabs">${TABS.map(([k, l]) => `<button type="button" data-ptab="${k}" aria-pressed="${ptab === k}">${l}</button>`).join("")}</div>
      <div class="og-pbody">${body}</div>`;
  }
  function overview(p, r, ts){
    const left = isDay(p.end) ? days(p.end) : null, lines = s => String(s || "").split("\n").map(x => x.trim()).filter(Boolean);
    const info = [["الجمعية", assocName(p.assocId)], ["مدير المشروع", p.manager], ["البداية", isDay(p.start) ? fmtG(p.start) : ""], ["النهاية", isDay(p.end) ? fmtG(p.end) : ""], ["الفئة المستهدفة", p.target], ["الرمز", p.code]].filter(x => x[1]);
    return `<div class="og-kpis">
        <div><b>${r.prog}%</b><span>نسبة الإنجاز</span><small>${ts.length ? "من مهام المشروع" : (p.kpis || []).length ? "من المؤشرات" : "لا توجد مهام بعد"}</small></div>
        <div class="${r.late ? "warn" : ""}"><b>${r.done}/${r.tasks}</b><span>مهام منجزة</span>${r.late ? `<small style="color:var(--danger)">${r.late} متأخرة</small>` : ""}</div>
        <div class="${left !== null && left < 0 && p.status !== "done" ? "warn" : ""}"><b>${left === null ? "—" : left < 0 ? -left : left}</b><span>${left === null ? "موعد النهاية غير محدد" : left < 0 ? "يوماً بعد موعد النهاية" : "يوماً متبقية"}</span></div>
        <div class="${r.b.pct > 100 ? "warn" : ""}"><b>${r.b.planned ? r.b.pct + "%" : "—"}</b><span>المصروف من الميزانية</span><small>${r.b.planned ? moneyZ(r.b.spent) + " من " + money(r.b.planned) : "الميزانية غير محددة"}</small></div>
        <div><b>${nf(num(p.benefActual))}</b><span>المستفيدون</span><small>${num(p.benefTarget) ? "من " + nf(num(p.benefTarget)) + " مستهدف" : ""}</small></div>
      </div>
      <div class="og-two">
        <section class="card"><div class="card-h"><h2>عن المشروع</h2></div>${p.description ? `<p class="pj-desc">${esc(p.description)}</p>` : '<p class="muted-text">لا يوجد وصف.</p>'}
          ${lines(p.goals).length ? `<h3 class="og-h3">الأهداف</h3><ol class="pj-goals">${lines(p.goals).map(g => `<li>${esc(g)}</li>`).join("")}</ol>` : ""}</section>
        <section class="card"><div class="card-h"><h2>البيانات</h2></div><dl class="og-info">${info.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("") || '<p class="muted-text">أكمل بيانات المشروع من «تعديل».</p>'}</dl>
          ${p.assocId && window.Orgs ? `<p><button type="button" class="linkbtn" data-pa="assoc">فتح ملف الجمعية</button></p>` : ""}
          <h3 class="og-h3">المهام القادمة</h3>${ts.filter(t => t.status !== "done").sort((a, b) => String(a.due || "9").localeCompare(String(b.due || "9"))).slice(0, 5).map(t => `<div class="og-dl"><button type="button" class="linkbtn" data-task="${esc(t.id)}">${esc(t.title)}</button><small>${t.due ? fmtG(t.due) : "بدون موعد"}</small></div>`).join("") || '<p class="muted-text">لا توجد مهام مفتوحة.</p>'}</section>
      </div>`;
  }
  function tasksTab(p, ts){
    if (!ts.length) return '<p class="ig-empty">لا توجد مهام في هذا المشروع. أضف مهمة بزر «+ مهمة»، أو اختر المشروع من لوحة أي مهمة.</p>';
    const S = window.TaskCore ? TaskCore.ST : {};
    return `<div class="og-tw"><table class="og-t"><thead><tr><th>المهمة</th><th>الحالة</th><th>المسؤول</th><th>الموعد</th><th>الإنجاز</th></tr></thead><tbody>${ts.sort((a, b) => (a.status === "done") - (b.status === "done") || String(a.due || "9").localeCompare(String(b.due || "9"))).map(t => `<tr>
      <td><button type="button" class="linkbtn" data-task="${esc(t.id)}">${esc(t.title)}</button></td><td>${esc(S[t.status] ? S[t.status].label : t.status)}</td><td>${esc(T().personName(t.assignee || t.owner))}</td>
      <td class="${t.status !== "done" && t.due && t.due < today() ? "pj-late" : ""}">${fmtG(t.due)}</td><td class="pj-pc">${bar(T().pct(t))}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function kpisTab(p, ed){
    const k = p.kpis || [];
    return `<div class="card og-sec"><div class="card-h"><h2>مؤشرات الأداء</h2><span class="muted-text">حدّث القيمة الفعلية دورياً، وتُحسب نسبة التحقق تلقائياً.</span></div>
      <fieldset class="pj-rows" ${ed ? "" : "disabled"} data-rows="kpis"><div class="pj-r pj-rh pj-k"><span>المؤشر</span><span>الوحدة</span><span>خط الأساس</span><span>المستهدف</span><span>الفعلي</span><span>التحقق</span><span></span></div>
      ${k.map((x, i) => { const pc = num(x.target) ? Math.round(num(x.actual) / num(x.target) * 100) : 0; return `<div class="pj-r pj-k" data-i="${i}"><input class="input" data-f="name" value="${esc(x.name || "")}" placeholder="اسم المؤشر"><input class="input" data-f="unit" value="${esc(x.unit || "")}" placeholder="مثال: مستفيد">
        <input class="input" data-f="base" value="${esc(x.base ?? "")}" inputmode="decimal"><input class="input" data-f="target" value="${esc(x.target ?? "")}" inputmode="decimal"><input class="input" data-f="actual" value="${esc(x.actual ?? "")}" inputmode="decimal">
        <span class="pj-pc">${num(x.target) ? bar(pc) : "—"}</span>${ed ? `<button type="button" class="as-rm" data-rm="${i}" aria-label="حذف">✕</button>` : "<span></span>"}</div>`; }).join("") || '<p class="muted-text">لا توجد مؤشرات بعد.</p>'}
      ${ed ? '<div class="pj-ra"><button type="button" class="ini-add" data-add="kpis">+ مؤشر</button><button type="button" class="btn small primary" data-save="kpis">حفظ المؤشرات</button></div>' : ""}</fieldset></div>`;
  }
  function budgetTab(p, ed){
    const it = p.budgetItems || [], b = budgetOf(p);
    return `<div class="card og-sec"><div class="card-h"><h2>الميزانية</h2><span class="muted-text">${b.planned ? `المصروف ${moneyZ(b.spent)} من ${money(b.planned)} (${b.pct}%)` : "أضف بنود الميزانية بالمخطط والفعلي."}</span></div>
      ${b.planned ? `<div class="pj-bbar"><span class="pj-bar big ${b.pct > 100 ? "over" : ""}"><i style="width:${Math.min(100, b.pct)}%"></i></span></div>` : ""}
      <fieldset class="pj-rows" ${ed ? "" : "disabled"} data-rows="budgetItems"><div class="pj-r pj-rh pj-b"><span>البند</span><span>المخطط (ر.س)</span><span>الفعلي (ر.س)</span><span>الفرق</span><span></span></div>
      ${it.map((x, i) => { const d = num(x.planned) - num(x.actual); return `<div class="pj-r pj-b" data-i="${i}"><input class="input" data-f="item" value="${esc(x.item || "")}" placeholder="مثال: أجور المدربين"><input class="input" data-f="planned" value="${esc(x.planned ?? "")}" inputmode="decimal"><input class="input" data-f="actual" value="${esc(x.actual ?? "")}" inputmode="decimal">
        <span class="${d < 0 ? "pj-late" : ""}">${num(x.planned) || num(x.actual) ? money(Math.abs(d)) + (d < 0 ? " تجاوز" : "") : "—"}</span>${ed ? `<button type="button" class="as-rm" data-rm="${i}" aria-label="حذف">✕</button>` : "<span></span>"}</div>`; }).join("") || '<p class="muted-text">لا توجد بنود.</p>'}
      ${it.length ? `<div class="pj-r pj-b pj-tot"><span>الإجمالي</span><span>${money(b.planned)}</span><span>${moneyZ(b.spent)}</span><span>${money(Math.abs(b.planned - b.spent))}</span><span></span></div>` : ""}
      ${ed ? '<div class="pj-ra"><button type="button" class="ini-add" data-add="budgetItems">+ بند</button><button type="button" class="btn small primary" data-save="budgetItems">حفظ الميزانية</button></div>' : ""}</fieldset></div>`;
  }
  function formsTab(forms){
    const counts = window.FormsCounts ? FormsCounts() : {};
    return `${forms.length ? `<div class="og-tw"><table class="og-t"><thead><tr><th>الاستبيان</th><th>الحالة</th><th>الردود</th><th>الإغلاق</th></tr></thead><tbody>${forms.map(f => `<tr><td><b>${esc(f.title)}</b></td><td>${f.active ? pill("مفعّل", "var(--ok)") : pill("متوقف", "var(--muted)")}</td><td>${counts[f.id] ?? "—"}</td><td>${fmtG(f.settings && f.settings.closeAt)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="ig-empty">لا توجد استبيانات مرتبطة بهذا المشروع.</p>'}
      <p class="muted-text og-note">اربط أي استبيان بالمشروع من «الاستبيانات › الإعدادات › الربط». <a class="link" href="#/projects/forms">فتح الاستبيانات</a></p>`;
  }
  function docTab(p, ini){
    if (!p.initiativeId) return '<p class="ig-empty">هذا المشروع لم يُنشأ من وثيقة مبادرة. يمكنك تحويل أي وثيقة من «منشئ وثائق المبادرات» إلى مشروع.</p>';
    if (!ini) return '<p class="ig-empty">الوثيقة غير متاحة لك، أو حُذفت من سجلّي.</p>';
    const text = String(ini.markdown || "").slice(0, 1500);
    return `<div class="card og-sec"><div class="card-h"><h2>${esc(ini.title)}</h2><button type="button" class="btn small" data-pa="ini">فتح الوثيقة كاملة</button></div><pre class="pj-md">${esc(text)}${(ini.markdown || "").length > 1500 ? "\n…" : ""}</pre></div>`;
  }

  /* ---------- create, edit, promote, remove ---------- */
  function form(p){
    return new Promise(res => {
      const v = p || { status: "planning", color: COLORS[projects().length % COLORS.length] };
      const back = document.createElement("div"); back.className = "ui-scrim";
      const box = document.createElement("div"); box.className = "ui-dialog og-dlg wide"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
      box.innerHTML = `<h2>${p ? "تعديل المشروع" : "مشروع جديد"}</h2><form novalidate>
        <div class="lf-row"><label class="ig-f"><span>اسم المشروع <b class="req">*</b></span><input class="input" name="name" required maxlength="80" value="${esc(v.name || "")}"></label><label class="ig-f"><span>الرمز</span><input class="input" name="code" dir="ltr" value="${esc(v.code || "")}" placeholder="PRJ-001"></label></div>
        <div class="lf-row"><label class="ig-f"><span>الجمعية</span><select class="select" name="assocId"><option value="">—</option>${A().map(a => `<option value="${esc(a.id)}"${a.id === v.assocId ? " selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>
          <label class="ig-f"><span>الحالة</span><select class="select" name="status">${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}"${k === v.status ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>
        <div class="lf-row"><label class="ig-f"><span>مدير المشروع</span><input class="input" name="manager" value="${esc(v.manager || "")}"></label><label class="ig-f"><span>الفئة المستهدفة</span><input class="input" name="target" value="${esc(v.target || "")}"></label></div>
        <div class="lf-row"><label class="ig-f"><span>البداية</span><input class="input" type="date" name="start" value="${esc(v.start || "")}"></label><label class="ig-f"><span>النهاية</span><input class="input" type="date" name="end" value="${esc(v.end || "")}"></label></div>
        <div class="lf-row"><label class="ig-f"><span>المستفيدون المستهدفون</span><input class="input" name="benefTarget" inputmode="numeric" value="${esc(v.benefTarget || "")}"></label><label class="ig-f"><span>المستفيدون الفعليون</span><input class="input" name="benefActual" inputmode="numeric" value="${esc(v.benefActual || "")}"></label></div>
        ${(v.budgetItems || []).length ? "" : `<div class="lf-row"><label class="ig-f"><span>الميزانية المعتمدة (ر.س)</span><input class="input" name="budget" inputmode="decimal" value="${esc(v.budget || "")}"></label><label class="ig-f"><span>المصروف (ر.س)</span><input class="input" name="spent" inputmode="decimal" value="${esc(v.spent || "")}"></label></div>`}
        <label class="ig-f"><span>الوصف</span><textarea class="input" name="description" rows="3">${esc(v.description || "")}</textarea></label>
        <label class="ig-f"><span>الأهداف <i>(هدف في كل سطر)</i></span><textarea class="input" name="goals" rows="3">${esc(v.goals || "")}</textarea></label>
        <div class="pj-colors">${COLORS.map(c => `<label><input type="radio" name="color" value="${c}"${c === v.color ? " checked" : ""}><span style="background:${c}"></span></label>`).join("")}</div>
        <div class="ui-actions"><button class="btn primary" type="submit">حفظ</button><button class="btn" type="button" data-x>إلغاء</button></div></form>`;
      document.body.append(back, box);
      const f = box.querySelector("form"), close = v => { back.remove(); box.remove(); res(v); };
      box.querySelector("[data-x]").addEventListener("click", () => close(null)); back.addEventListener("click", () => close(null));
      f.addEventListener("submit", e => { e.preventDefault(); if (!f.name.value.trim()){ f.name.focus(); return; }
        const o = {}; ["name", "code", "assocId", "status", "manager", "target", "start", "end", "description", "goals"].forEach(k => { o[k] = f[k].value.trim(); });
        ["benefTarget", "benefActual"].forEach(k => { o[k] = num(f[k].value); }); if (f.budget){ o.budget = num(f.budget.value); o.spent = num(f.spent.value); }
        o.color = (f.querySelector('[name="color"]:checked') || {}).value || COLORS[0]; o.start ||= null; o.end ||= null;
        if (o.start && o.end && o.end < o.start){ UI.toast("النهاية قبل البداية", "err"); return; }
        close(o); });
      setTimeout(() => f.name.focus(), 30);
    });
  }
  async function create(data, open = true){
    const now = new Date().toISOString();
    const ref = await db.collection("taskProjects").add({ kpis: [], budgetItems: [], ...data, name: String(data.name).slice(0, 80), reg: true, owner: me, createdAt: now, updatedAt: now });
    if (open) openProject(ref.id); return ref.id;
  }
  const save = (id, patch) => db.collection("taskProjects").doc(id).set({ ...patch, updatedAt: new Date().toISOString(), updatedBy: me }, { merge: true });
  async function newProject(){ if (!db) return; const o = await form(null); if (!o) return; try { await create(o); UI.toast("أُنشئ المشروع"); } catch (e){ console.error(e); UI.toast("تعذّر الإنشاء", "err"); } }
  async function editProject(p){ const o = await form(p); if (!o) return; try { await save(p.id, o); UI.toast("حُفظ المشروع"); } catch { UI.toast("تعذّر الحفظ", "err"); } }
  async function promote(){
    const cands = all.filter(p => !p.reg && canEdit(p)); if (!cands.length){ UI.toast("لا توجد مشاريع مهام يمكنك إضافتها"); return; }
    const v = await UI.prompt("اختر مشروعاً من مشاريع المهام لإضافته إلى السجل", { title: "إضافة من المهام", ok: "إضافة", note: "", noteRequired: true, placeholder: "اكتب الاسم كما هو: " + cands.map(p => p.name).join("، ") });
    if (!v) return; const p = cands.find(x => x.name.trim() === v.note.trim()); if (!p){ UI.toast("لم أجد مشروعاً بهذا الاسم", "err"); return; }
    try { await save(p.id, { reg: true, status: p.status || "active", kpis: p.kpis || [], budgetItems: p.budgetItems || [] }); openProject(p.id); UI.toast("أُضيف إلى سجل المشاريع"); } catch { UI.toast("تعذّر الحفظ", "err"); }
  }
  async function removeFromRegistry(p){
    if (!(await UI.confirm(`إزالة «${p.name}» من سجل المشاريع؟ يبقى المشروع ومهامه في صفحة المهام، وتبقى بياناته محفوظة إذا أعدته لاحقاً.`, { ok: "إزالة من السجل", danger: true }))) return;
    try { await save(p.id, { reg: false }); pid = null; drawRegistry(); UI.toast("أُزيل من السجل"); } catch { UI.toast("تعذّر الحفظ", "err"); }
  }
  function openProject(id){ pid = id; ptab = "overview"; if (location.hash !== "#/projects/registry") location.hash = "#/projects/registry"; else drawRegistry(); window.scrollTo(0, 0); }

  /* ---------- initiative document → project ---------- */
  function parseMd(md){
    const lines = String(md || "").split("\n"), sec = re => { const i = lines.findIndex(l => /^#{1,4}\s/.test(l) && re.test(l)); if (i < 0) return []; const out = []; for (let j = i + 1; j < lines.length && !/^#{1,4}\s/.test(lines[j]); j++) out.push(lines[j]); return out; };
    const kRows = sec(/مؤشر/).filter(l => /^\s*\|/.test(l)).map(l => l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim().replace(/\*\*/g, "")));
    let kpis = [];
    if (kRows.length > 2){ const h = kRows[0], ix = re => h.findIndex(c => re.test(c)), iN = Math.max(0, ix(/المؤشر|اسم/)), iT = ix(/المستهدف|القيمة المستهدفة/), iB = ix(/خط الأساس|الأساس/), iU = ix(/الوحدة|وحدة/);
      kpis = kRows.slice(1).filter(r => !r.every(c => /^:?-+:?$/.test(c))).slice(0, 15).map(r => ({ name: r[iN] || "", target: iT >= 0 ? r[iT] : "", base: iB >= 0 ? r[iB] : "", unit: iU >= 0 ? r[iU] : "", actual: "" })).filter(x => x.name); }
    const goals = sec(/الأهداف/).map(l => l.replace(/^\s*(?:[-*•]|\d+[.)-])\s*/, "").replace(/\*\*/g, "").trim()).filter((l, i, a) => l && !/^\|/.test(l) && a.indexOf(l) === i).slice(0, 10);
    return { kpis, goals: goals.join("\n") };
  }
  async function fromInitiative(d){
    if (!db || !d || !d.id){ UI.toast("احفظ الوثيقة في سجلّي أولاً", "err"); return; }
    const ex = all.find(p => p.initiativeId === d.id);
    if (ex){ if (!ex.reg && canEdit(ex)) await save(ex.id, { reg: true }); openProject(ex.id); UI.toast("هذه الوثيقة لها مشروع، فتحته لك"); return; }
    const inp = d.input || {}, a = window.Assocs && Assocs.byName(d.assocName || inp.inAssoc), parsed = parseMd(d.markdown);
    const name = String(inp.inName || d.title || "مشروع").replace(/^وثيقة\s+(مبادرة|برنامج)\s*/, "").slice(0, 80);
    if (!(await UI.confirm(`إنشاء مشروع «${name}» من هذه الوثيقة؟ تُنقل الفكرة والمدة والميزانية والمستفيدون${parsed.kpis.length ? ` و${parsed.kpis.length} مؤشراً` : ""}${parsed.goals ? " والأهداف" : ""}، ويمكنك تعديلها بعد ذلك.`, { ok: "إنشاء المشروع" }))) return;
    try {
      await create({ name, assocId: a ? a.id : "", status: "planning", initiativeId: d.id, description: String(inp.inIdea || "").slice(0, 3000), goals: parsed.goals, kpis: parsed.kpis,
        start: isDay(inp.inStart) ? inp.inStart : null, end: isDay(inp.inEnd) ? inp.inEnd : null, budget: inp.inBudgetOn === false ? 0 : num(inp.inBudget), spent: 0,
        benefTarget: num(inp.inBenef), benefActual: 0, target: inp.inTarget || "", color: COLORS[projects().length % COLORS.length] });
      UI.toast("أُنشئ المشروع من الوثيقة");
    } catch (e){ console.error(e); UI.toast("تعذّر إنشاء المشروع", "err"); }
  }

  /* ---------- reports center ---------- */
  let rtab = "projects", rPeriod = 90;
  const inPeriod = s => s && (rPeriod === 0 || Date.now() - Date.parse(s) <= rPeriod * 864e5);
  function reportData(){
    const td = today();
    if (rtab === "projects"){
      const rows = projects().map(row);
      return { title: "تقرير المشاريع", cols: ["المشروع", "الجمعية", "الحالة", "الوضع", "الإنجاز %", "المهام المنجزة", "المهام المتأخرة", "الميزانية", "المصروف", "المستفيدون", "المستهدف", "النهاية"],
        rows: rows.map(r => [r.p.name, assocName(r.p.assocId), STATUS[r.p.status] ? STATUS[r.p.status][0] : "", r.h[0], r.prog, `${r.done}/${r.tasks}`, r.late, Math.round(r.b.planned), Math.round(r.b.spent), num(r.p.benefActual), num(r.p.benefTarget), r.p.end || ""]),
        tiles: [["المشاريع", rows.length], ["قيد التنفيذ", rows.filter(r => r.p.status === "active").length], ["متأخرة", rows.filter(r => r.h[1] === "var(--danger)").length], ["مكتملة", rows.filter(r => r.p.status === "done").length]] };
    }
    if (rtab === "tasks"){
      const ts = T() && T().list ? T().list.filter(t => !t.parentId && !t.archived && t.scope !== "personal") : [], by = new Map();
      ts.forEach(t => { const k = t.assignee || t.owner || "—"; const o = by.get(k) || { open: 0, done: 0, late: 0, onTime: 0 }; if (t.status === "done"){ if (inPeriod(t.doneAt)){ o.done++; if (!t.due || String(t.doneAt).slice(0, 10) <= t.due) o.onTime++; } } else if (t.status !== "cancelled"){ o.open++; if (t.due && t.due < td) o.late++; } by.set(k, o); });
      const rows = [...by].map(([k, o]) => [T() ? T().personName(k) : k, o.open, o.late, o.done, o.done ? Math.round(o.onTime / o.done * 100) : "—"]).sort((a, b) => b[1] - a[1]);
      return { title: "تقرير المهام المؤسسية حسب المسؤول", note: "لا يشمل المهام الشخصية الخاصة.", cols: ["المسؤول", "مفتوحة", "متأخرة", "منجزة في الفترة", "في الموعد %"], rows,
        tiles: [["مفتوحة", rows.reduce((s, r) => s + r[1], 0)], ["متأخرة", rows.reduce((s, r) => s + r[2], 0)], ["منجزة في الفترة", rows.reduce((s, r) => s + r[3], 0)]], period: true };
    }
    if (rtab === "assocs"){
      if (!window.Orgs || !Orgs.docs) return { title: "تقرير الجمعيات", cols: [], rows: [], note: "يحتاج صلاحية قسم الحوكمة." };
      const docs = Orgs.docs(), meets = Orgs.meetings(), dl = Orgs.deadlines();
      const rows = A().map(a => { const d = docs.filter(x => x.assocId === a.id), m = meets.filter(x => x.assocId === a.id), decs = m.flatMap(x => x.decisions || []);
        const tk = id => T() && T().byId ? T().byId.get(id) : null, done = decs.filter(x => x.done || (x.taskId && tk(x.taskId) && tk(x.taskId).status === "done")).length;
        return [a.name, d.filter(x => !isDay(x.expires) || days(x.expires) >= 0).length, d.filter(x => isDay(x.expires) && days(x.expires) >= 0 && days(x.expires) <= 90).length, d.filter(x => isDay(x.expires) && days(x.expires) < 0).length,
          m.filter(x => inPeriod(x.date)).length, decs.length - done, done, dl.filter(x => x.assocId === a.id && x.kind === "review" && x.days < 0).length, a.boardEnd || ""]; });
      return { title: "تقرير الامتثال والحوكمة للجمعيات", cols: ["الجمعية", "وثائق سارية", "تنتهي خلال 90 يوماً", "منتهية", "اجتماعات في الفترة", "قرارات مفتوحة", "قرارات منفّذة", "لوائح فات موعد مراجعتها", "نهاية دورة المجلس"], rows,
        tiles: [["الجمعيات", rows.length], ["وثائق منتهية", rows.reduce((s, r) => s + r[3], 0)], ["قرارات مفتوحة", rows.reduce((s, r) => s + r[5], 0)]], period: true };
    }
    if (rtab === "forms"){
      const fs = window.FormsList ? FormsList() : [], c = window.FormsCounts ? FormsCounts() : {};
      const rows = fs.map(f => [f.title, (byId((f.settings || {}).projectId) || {}).name || "", assocName((f.settings || {}).assocId), f.active ? "مفعّل" : "متوقف", c[f.id] ?? "", (f.settings || {}).closeAt || ""]);
      return { title: "تقرير الاستبيانات", cols: ["الاستبيان", "المشروع", "الجمعية", "الحالة", "الردود", "الإغلاق"], rows, tiles: [["الاستبيانات", rows.length], ["مفعّلة", fs.filter(f => f.active).length], ["إجمالي الردود", rows.reduce((s, r) => s + (+r[4] || 0), 0)]] };
    }
    const ST = { pending: "قيد الاعتماد", approved: "معتمد", rejected: "مرفوض", returned: "معاد للتعديل", cancelled: "ملغى", draft: "مسودة" };
    const rs = reqs.filter(r => inPeriod(r.submittedAt || r.createdAt)), cnt = {};
    rs.forEach(r => { cnt[r.status] = (cnt[r.status] || 0) + 1; });
    return { title: "تقرير الطلبات الإدارية", note: "الطلبات التي تملك صلاحية الاطلاع عليها.", cols: ["الطلب", "المرجع", "مقدّم الطلب", "الحالة", "تاريخ التقديم", "آخر تحديث"],
      rows: rs.map(r => [r.title || "طلب", r.ref || "", r.submitterName || r.submittedBy || "", ST[r.status] || r.status || "", String(r.submittedAt || "").slice(0, 10), String(r.updatedAt || "").slice(0, 10)]),
      tiles: [["الطلبات", rs.length], ...Object.entries(cnt).map(([k, n]) => [ST[k] || k, n])], period: true };
  }
  function drawReports(){
    const box = $("rpView"); if (!box || box.closest(".view").hidden) return;
    if (!db){ box.innerHTML = '<p class="muted-text">سجّل الدخول لعرض التقارير</p>'; return; }
    const d = reportData(), TABS = [["projects", "المشاريع"], ["tasks", "المهام"], ["assocs", "الجمعيات"], ["forms", "الاستبيانات"], ["requests", "الطلبات"]];
    box.innerHTML = `<div class="rq-filters"><div class="fu-tabs og-tabs">${TABS.map(([k, l]) => `<button type="button" data-rt="${k}" aria-pressed="${rtab === k}">${l}</button>`).join("")}</div>
        ${d.period ? `<select class="select" id="rpPeriod" aria-label="الفترة">${[[30, "آخر 30 يوماً"], [90, "آخر 90 يوماً"], [365, "آخر سنة"], [0, "كل الفترات"]].map(([v, l]) => `<option value="${v}"${v === rPeriod ? " selected" : ""}>${l}</option>`).join("")}</select>` : ""}
        <span class="rp-sp"></span><button type="button" class="btn small" data-rx="csv"${d.rows.length ? "" : " disabled"}>تصدير Excel (CSV)</button><button type="button" class="btn small" data-rx="print"${d.rows.length ? "" : " disabled"}>طباعة</button></div>
      <h2 class="rp-title">${esc(d.title)}</h2>${d.note ? `<p class="muted-text og-note">${esc(d.note)}</p>` : ""}
      ${d.tiles ? `<div class="og-kpis">${d.tiles.map(([l, n]) => `<div><b>${nf(n)}</b><span>${esc(l)}</span></div>`).join("")}</div>` : ""}
      ${d.rows.length ? `<div class="og-tw"><table class="og-t"><thead><tr>${d.cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${d.rows.map(r => `<tr>${r.map((c, i) => `<td>${i === 0 ? `<b>${esc(c)}</b>` : esc(typeof c === "number" && c > 999 ? nf(c) : c === "" ? "—" : c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : '<p class="ig-empty">لا توجد بيانات لهذا التقرير بعد.</p>'}
      <p class="muted-text og-note">أُنشئ ${new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date())} · الأرقام من بيانات الموقع مباشرة.</p>`;
  }
  function exportCsv(){
    const d = reportData(), q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "﻿" + [d.cols, ...d.rows].map(r => r.map(q).join(",")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `${d.title} ${today()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function printReport(){
    const d = reportData(), w = window.open("", "_blank"); if (!w){ UI.alert("اسمح بالنوافذ المنبثقة للطباعة."); return; }
    const site = (window.siteSettings && window.siteSettings.siteName) || "";
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>body{font-family:"IBM Plex Sans Arabic",Tahoma,sans-serif;margin:28px;color:#111}h1{font-size:19px;margin:0 0 4px}p{color:#555;font-size:12.5px;margin:0 0 14px}
      table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #bbb;padding:5px 7px;text-align:right}th{background:#f1f1f4}@page{size:A4 landscape;margin:12mm}</style></head><body>
      <h1>${esc(d.title)}</h1><p>${esc(site)} · ${new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "long", timeZone: "Asia/Riyadh" }).format(new Date())}${d.note ? " · " + esc(d.note) : ""}</p>
      <table><thead><tr>${d.cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${d.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>
      <script>setTimeout(()=>print(),300)<\/script></body></html>`);
    w.document.close();
  }

  /* ---------- events ---------- */
  let rowsDraft = null;
  document.addEventListener("click", async e => {
    const v = e.target.closest("#pjView"), rv = e.target.closest("#rpView"); if (!v && !rv) return;
    const p = pid ? byId(pid) : null;
    const tr = e.target.closest("tr[data-pj]"); if (tr){ openProject(tr.dataset.pj); return; }
    const tk = e.target.closest("[data-task]"); if (tk){ TaskDetail.open(tk.dataset.task); return; }
    const pt = e.target.closest("[data-ptab]"); if (pt){ ptab = pt.dataset.ptab; rowsDraft = null; drawRegistry(); return; }
    const pa = e.target.closest("[data-pa]");
    if (pa){ const k = pa.dataset.pa;
      if (k === "back"){ pid = null; rowsDraft = null; drawRegistry(); }
      if (k === "edit" && p) editProject(p);
      if (k === "del" && p) removeFromRegistry(p);
      if (k === "assoc" && p && window.Orgs) Orgs.openProfile(p.assocId);
      if (k === "ini" && p && window.Initiatives){ location.hash = "#/projects/initiatives"; setTimeout(() => Initiatives.open(p.initiativeId), 150); }
      if (k === "task" && p && T()){ const r = await UI.prompt("عنوان المهمة", { title: "مهمة في " + p.name, ok: "إضافة", note: "", noteRequired: true }); if (r){ try { await T().create({ title: r.note, projectId: p.id, scope: "work" }); UI.toast("أُضيفت المهمة"); } catch {} } }
      return; }
    const add = e.target.closest("[data-add]"), rm = e.target.closest("[data-rm]"), sv = e.target.closest("[data-save]");
    if (p && (add || rm || sv)){
      const key = (add || sv || rm.closest("[data-rows]")).dataset.add || (sv && sv.dataset.save) || rm.closest("[data-rows]").dataset.rows;
      const cur = rowsDraft && rowsDraft.key === key ? rowsDraft.rows : JSON.parse(JSON.stringify(p[key] || []));
      if (add){ cur.push({}); rowsDraft = { key, rows: cur }; p[key] = cur; drawRegistry(); }
      if (rm){ cur.splice(+rm.dataset.rm, 1); rowsDraft = { key, rows: cur }; p[key] = cur; drawRegistry(); }
      if (sv){ const clean = cur.filter(x => Object.values(x).some(y => String(y ?? "").trim()));
        try { await save(p.id, key === "budgetItems" ? { budgetItems: clean, budget: clean.reduce((s, x) => s + num(x.planned), 0), spent: clean.reduce((s, x) => s + num(x.actual), 0) } : { kpis: clean }); rowsDraft = null; UI.toast("حُفظ"); } catch { UI.toast("تعذّر الحفظ", "err"); } }
      return; }
    const rt = e.target.closest("[data-rt]"); if (rt){ rtab = rt.dataset.rt; drawReports(); return; }
    const rx = e.target.closest("[data-rx]"); if (rx){ rx.dataset.rx === "csv" ? exportCsv() : printReport(); }
  });
  document.addEventListener("keydown", e => { const tr = e.key === "Enter" && e.target.closest && e.target.closest("tr[data-pj]"); if (tr) openProject(tr.dataset.pj); });
  document.addEventListener("input", e => {
    const t = e.target;
    if (t.id === "pjQ"){ fQ = t.value.trim(); clearTimeout(drawRegistry._t); drawRegistry._t = setTimeout(() => { drawRegistry(); const q = $("pjQ"); if (q){ q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 200); return; }
    const rows = t.closest && t.closest("#pjView [data-rows]"); if (!rows || !t.dataset.f) return;
    const p = byId(pid), key = rows.dataset.rows, i = +t.closest("[data-i]").dataset.i;
    if (!rowsDraft || rowsDraft.key !== key){ rowsDraft = { key, rows: JSON.parse(JSON.stringify(p[key] || [])) }; }
    rowsDraft.rows[i][t.dataset.f] = t.value; p[key] = rowsDraft.rows;
  });
  document.addEventListener("change", e => {
    const t = e.target;
    if (t.id === "pjFS"){ fStatus = t.value; drawRegistry(); }
    if (t.id === "pjFA"){ fAssoc = t.value; drawRegistry(); }
    if (t.id === "rpPeriod"){ rPeriod = +t.value; drawReports(); }
  });
  $("pjNew") && $("pjNew").addEventListener("click", newProject);
  $("pjPromote") && $("pjPromote").addEventListener("click", promote);

  function redraw(){ if (rowsDraft) return; drawRegistry(); drawReports(); }
  function connect({ db: d, user }){
    if (unsub){ unsub(); unsub = null; }
    db = d; me = user ? user.email : ""; all = []; loaded = false; pid = null;
    if (!db){ redraw(); return; }
    db.collection("allowed").doc(me).get().then(s => { admin = s.exists && s.data().role === "admin"; redraw(); }).catch(() => {});
    unsub = db.collection("taskProjects").onSnapshot(s => { all = s.docs.map(x => ({ id: x.id, ...x.data() })); loaded = true; if (rowsDraft && pid){ const p = byId(pid); if (p) p[rowsDraft.key] = rowsDraft.rows; } drawRegistry(); drawReports(); window.dispatchEvent(new CustomEvent("app:projects", { detail: projects() })); }, e => { console.warn("taskProjects", e.code || e); loaded = true; redraw(); });
    redraw();
  }
  window.Projects = { list: () => projects().slice(), byId, open: openProject, fromInitiative };
  window.addEventListener("app:db", e => connect(e.detail));
  window.addEventListener("app:requests", e => { reqs = e.detail.all || e.detail.mine || []; drawReports(); });
  ["app:tasks", "app:assocs", "app:forms", "app:orgs"].forEach(ev => window.addEventListener(ev, () => { clearTimeout(redraw._t); redraw._t = setTimeout(redraw, 80); }));
  window.addEventListener("app:view", e => { if (e.detail === "projects/registry") setTimeout(drawRegistry, 20); if (e.detail === "projects/reports") setTimeout(drawReports, 20); });
  if (window.appDb) connect({ db: window.appDb, user: window.appUser });
})();
