/* الطلبات الإدارية: a prepared letter goes through an approval path before it gets its number.
   Settings (التمكين التقني ← إدارة الطلبات الإدارية):
     settings/workflows { list: [{ id, name, stages: [{ name, approvers: [{ email, name }] }], templates: [templateId], isDefault }] }
     settings/requests  { approverEdit: bool, noteRequired: bool }
     allowed/{email}    { role, canIssue, sections: ["tasks","governance","hr"] }   (admins edit these)
   Requests: requests/{id} { type: "letter", status: pending|returned|rejected|approved|cancelled, workflowId, workflowName,
     stages (snapshot), stageIndex, submittedBy, submitterName, submittedAt, updatedAt, title, assoc, employee, letter, history[], ref, letterId }
   The final approval takes the next outgoing number and adds the letter to the log (hrLetters). */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const SECTIONS = [["tasks", "المهام"], ["governance", "الحوكمة"], ["hr", "الموارد البشرية"]];
  // permissions inside the letters pages; members start with «submit» only
  const PERMS = [
    ["submit", "رفع الخطاب للاعتماد"], ["issue", "حفظ وطباعة (إصدار الخطاب برقم)"], ["printDraft", "طباعة بدون حفظ"], ["editText", "تعديل نص الخطاب وتنسيقه"],
    ["editIssued", "تعديل الخطابات الصادرة"], ["viewLog", "عرض سجل كل الخطابات"], ["deleteLog", "حذف الخطابات من السجل"],
    ["pdf", "حفظ الخطاب PDF"], ["sign", "الاعتماد والتوقيع (تعديل صفة واسم المعتمد)"],
  ];
  const SETUP = [["templates", "إدارة القوالب"], ["heads", "إدارة الكليشات"], ["seal", "إدارة الختم والتوقيع"]];
  const ALL_KEYS = [...PERMS, ...SETUP].map(x => x[0]);
  const PRESETS = [
    ["employee", "موظف: يرفع للاعتماد فقط", ["submit"]],
    ["issuer", "موظف بإصدار مباشر", ["submit", "issue", "printDraft", "editText", "pdf"]],
    ["officer", "مسؤول الخطابات: كل الصلاحيات", ALL_KEYS],
  ];
  // a user's permissions: admins have all; older records with canIssue keep it
  function permsOf(u){
    if (!u || u.role === "admin") return Object.fromEntries(ALL_KEYS.map(k => [k, true]));
    const base = { submit: true, issue: !!u.canIssue };
    return Object.fromEntries(ALL_KEYS.map(k => [k, !!({ ...base, ...(u.perms || {}) })[k]]));
  }
  const STATUS = { pending: "قيد الاعتماد", returned: "أُعيد للتعديل", rejected: "مرفوض", approved: "معتمد", cancelled: "مسحوب" };
  const ACTION = { submit: "رفع الطلب", resubmit: "أعاد رفع الطلب", approve: "اعتمد", final: "اعتمد نهائياً وأصدر الخطاب", return: "أعاد الطلب للتعديل", reject: "رفض الطلب", cancel: "سحب الطلب", edit: "عدّل الخطاب" };
  let db = null, me = "", myName = "", my = { role: "member", canIssue: false, sections: null };
  let workflows = [], opts = { approverEdit: true, noteRequired: true }, requests = [], users = [], templates = [];
  let tab = "inbox", current = null;
  const isAdmin = () => my.role === "admin";
  const fmt = iso => { if (!iso) return ""; const d = new Date(iso); if (isNaN(d)) return ""; return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(d); };
  const fmtDay = iso => { if (!iso) return ""; const d = new Date(iso); if (isNaN(d)) return ""; return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", year: "numeric" }).format(d); };
  const stageOf = r => (r.stages || [])[r.stageIndex || 0];
  // the home page shows what waits for me and where my own requests are
  function toHome(){
    window.dispatchEvent(new CustomEvent("app:requests", { detail: {
      inbox: requests.filter(amApprover),
      mine: requests.filter(r => r.submittedBy === me).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
      label: r => r.status === "pending" && stageOf(r) ? `عند: ${stageOf(r).name} · ${ageText(since(r))}` : STATUS[r.status] || r.status,
      late: isLate,
    } }));
  }
  // each stage carries its approvers' emails, which the database rules check
  const normStages = stages => (stages || []).map(s => ({ ...s, emails: (s.approvers || []).map(a => String(a.email || "").toLowerCase()).filter(Boolean) }));
  const needsEmails = stages => (stages || []).some(s => !Array.isArray(s.emails));
  const REASONS = ["نقص في البيانات أو المرفقات", "خطأ في الصياغة أو المحتوى", "بيانات غير صحيحة", "غير مستحق أو خارج الصلاحية", "أخرى"];
  // how long the request has waited at its current step
  const since = r => { const h = r.history || []; return h.length ? h[h.length - 1].at : r.updatedAt; };
  function ageText(iso){
    const ms = Date.now() - new Date(iso).getTime(); if (isNaN(ms)) return "";
    const hrs = Math.floor(ms / 3600e3), days = Math.floor(ms / 86400e3);
    if (hrs < 1) return "منذ أقل من ساعة"; if (hrs < 24) return hrs === 1 ? "منذ ساعة" : hrs === 2 ? "منذ ساعتين" : `منذ ${hrs} ساعات`;
    return days === 1 ? "منذ يوم" : days === 2 ? "منذ يومين" : days <= 10 ? `منذ ${days} أيام` : `منذ ${days} يوماً`;
  }
  const isLate = r => r.status === "pending" && Date.now() - new Date(since(r)).getTime() >= (+opts.slaDays || 2) * 86400e3;
  // admins bring older paths and requests up to date so the rules can check them
  let fixing = false;
  async function backfill(){
    if (!db || !isAdmin() || fixing) return; fixing = true;
    try {
      if (workflows.some(w => needsEmails(w.stages))) await db.collection("settings").doc("workflows").set({ list: workflows.map(w => ({ ...w, stages: normStages(w.stages) })), updatedAt: new Date().toISOString() });
      const old = requests.filter(r => needsEmails(r.stages) || !Array.isArray(r.currentApprovers));
      for (const r of old){
        const st = normStages(r.stages);
        await db.collection("requests").doc(r.id).update({ stages: st, currentApprovers: r.status === "pending" && st[r.stageIndex || 0] ? st[r.stageIndex || 0].emails : [] });
      }
    } catch (e){ console.error(e); }
    finally { fixing = false; }
  }
  // stand-ins: delegations/{approver} = { to, startMs, endMs }
  let delegs = {};
  const activeDeleg = e => { const d = delegs[e]; const t = Date.now(); return d && t >= d.startMs && t < d.endMs ? d : null; };
  // whose approval I give on this request: my own, or an approver I stand in for (null when neither)
  function actingFor(r){
    const list = Array.isArray(r.currentApprovers) ? r.currentApprovers : (stageOf(r) ? (stageOf(r).approvers || []).map(a => a.email) : []);
    if (list.includes(me)) return me;
    const e = list.slice(0, 3).find(x => { const d = activeDeleg(x); return d && d.to === me; });
    return e || null;
  }
  const nameOf = e => { for (const w of workflows) for (const s of w.stages || []) for (const a of s.approvers || []) if (a.email === e && a.name) return a.name; const u = users.find(x => x.id === e); return (u && u.name) || e; };
  // approvers never act on their own request (an admin still can)
  const amApprover = r => r.status === "pending" && !!stageOf(r) && !!actingFor(r) && (r.submittedBy !== me || isAdmin());

  /* ---------- access: sections and admin pages follow the user's permissions ---------- */
  function applyAccess(){
    const sec = isAdmin() || !my.sections ? null : new Set(my.sections);
    document.querySelectorAll("[data-sec]").forEach(el => {
      const k = el.dataset.sec;
      const hide = k === "admin" ? !isAdmin() : !!sec && !sec.has(k);
      el.classList.toggle("sec-off", hide);
      if (el.classList.contains("nav-sub") && hide) el.hidden = true;
    });
    window.HRLetters && HRLetters.setPerms({ ...permsOf(my), admin: isAdmin() });
    $("rqAllTab").hidden = !isAdmin();
    guard(location.hash.replace(/^#\/?/, ""));
  }
  function guard(r){
    if (!r) return;
    const top = r.split("/")[0];
    const sec = isAdmin() || !my.sections ? null : new Set(my.sections);
    const blocked = (top === "admin" && !isAdmin()) || (sec && ["tasks", "governance", "hr"].includes(top) && !sec.has(top));
    if (blocked && db){ UI.toast("لا تملك صلاحية فتح هذا القسم", "err"); location.hash = "#/home"; }
  }
  window.addEventListener("app:view", e => { guard(e.detail); if (e.detail === "hr/requests") renderList(); });

  /* ---------- submitting a letter ---------- */
  function workflowFor(L){
    return workflows.find(w => (w.templates || []).includes(L.templateId)) || workflows.find(w => w.isDefault) || null;
  }
  async function submit(L){
    if (!db) return UI.alert("سجّل الدخول لرفع الطلب");
    if (!L.templateId) return UI.alert("اختر نوع الخطاب أولاً");
    const w = workflowFor(L);
    if (!w || !(w.stages || []).length) return UI.alert("لم يُضبط مسار اعتماد لهذا النوع من الخطابات. يضبطه المدير من التمكين التقني ← إدارة الطلبات الإدارية.");
    if (needsEmails(w.stages)) return UI.alert("مسار الاعتماد يحتاج تحديثاً. يكفي أن يفتح المدير الموقع مرة ليتحدث تلقائياً، ثم أعد المحاولة.");
    const path = w.stages.map(s => s.name).join(" ← ");
    if (!(await UI.confirm(`رفع «${L.title}» للاعتماد عبر مسار «${w.name}»: مقدّم الطلب ← ${path}`, { ok: "رفع الطلب" }))) return;
    const now = new Date().toISOString();
    try {
      await db.collection("requests").add({
        type: "letter", status: "pending", workflowId: w.id, workflowName: w.name,
        stages: JSON.parse(JSON.stringify(w.stages)), stageIndex: 0, wfIndex: workflows.indexOf(w), currentApprovers: w.stages[0].emails,
        submittedBy: me, submitterName: myName, submittedAt: now, updatedAt: now,
        title: L.title, assoc: L.assoc || "", employee: L.employee || "", letter: L,
        history: [{ at: now, by: me, name: myName, action: "submit" }],
      });
      UI.toast("رُفع الطلب للاعتماد");
      HRLetters.clear();
      location.hash = "#/hr/requests"; setTab("mine");
    } catch (e){ console.error(e); UI.toast("تعذّر رفع الطلب", "err"); }
  }

  // names and emails of the people with access, readable by everyone (for choosing who a task is assigned to)
  let dirSent = "";
  function publishDirectory(){
    if (!isAdmin() || !users.length) return;
    const people = users.map(u => ({ email: u.id, name: u.name || u.id.split("@")[0] })).sort((a, b) => a.name.localeCompare(b.name));
    const key = JSON.stringify(people); if (key === dirSent) return; dirSent = key;
    db.collection("settings").doc("directory").set({ people, updatedAt: new Date().toISOString() }).catch(console.error);
  }

  /* ---------- delegation: an approver names a stand-in for a period ---------- */
  const isApproverAnywhere = () => workflows.some(w => (w.stages || []).some(s => (s.approvers || []).some(a => a.email === me)));
  function renderDeleg(){
    if (!db) return;
    $("rqDelegBtn").hidden = !(isApproverAnywhere() || isAdmin());
    const mine = delegs[me], act = activeDeleg(me), day = ms => new Date(ms).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long" });
    $("rqDelegNow").textContent = mine ? `${act ? "مفوَّض الآن" : mine.startMs > Date.now() ? "تفويض قادم" : "انتهى التفويض"}: ${mine.toName || mine.to} ينوب عنك من ${day(mine.startMs)} إلى ${day(mine.endMs - 1)}` : "لا يوجد تفويض. اختر من ينوب عنك في الاعتماد أثناء غيابك.";
    $("rqDelegEnd").hidden = !mine;
    const forMe = Object.entries(delegs).filter(([from, d]) => d.to === me && activeDeleg(from));
    $("rqDelegIn").hidden = !forMe.length;
    $("rqDelegIn").textContent = forMe.length ? "تنوب الآن عن: " + forMe.map(([from, d]) => d.fromName || from).join("، ") : "";
    $("rqDelegBtn").classList.toggle("on", !!act || forMe.length > 0);
    const dl = $("rqDelegList"); dl.innerHTML = "";
    const people = new Map(); workflows.forEach(w => (w.stages || []).forEach(s => (s.approvers || []).forEach(a => people.set(a.email, a.name || a.email)))); users.forEach(u => people.set(u.id, u.name || u.id));
    people.delete(me); people.forEach((n, e) => { const o = document.createElement("option"); o.value = e; o.label = n; dl.append(o); });
  }
  $("rqDelegBtn").addEventListener("click", () => {
    const p = $("rqDeleg"); p.hidden = !p.hidden; if (p.hidden) return;
    const ymd = d => d.toISOString().slice(0, 10), mine = delegs[me];
    $("rqDelegTo").value = mine ? mine.to : ""; $("rqDelegFrom").value = mine ? ymd(new Date(mine.startMs)) : ymd(new Date());
    $("rqDelegUntil").value = mine ? ymd(new Date(mine.endMs - 86400e3)) : ""; $("rqDelegTo").focus();
  });
  $("rqDelegForm").addEventListener("submit", async e => {
    e.preventDefault();
    const to = $("rqDelegTo").value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return UI.toast("اكتب بريداً صحيحاً", "err");
    if (to === me) return UI.toast("لا يمكن تفويض نفسك", "err");
    const startMs = new Date($("rqDelegFrom").value + "T00:00:00").getTime(), endMs = new Date($("rqDelegUntil").value + "T00:00:00").getTime() + 86400e3;
    if (!(endMs > startMs)) return UI.toast("تاريخ النهاية قبل البداية", "err");
    try {
      await db.collection("delegations").doc(me).set({ to, toName: nameOf(to), from: me, fromName: myName, startMs, endMs, at: new Date().toISOString() });
      $("rqDeleg").hidden = true; UI.toast(`فوّضت ${nameOf(to)} بالاعتماد عنك`);
    } catch (err){ console.error(err); UI.toast("تعذّر حفظ التفويض", "err"); }
  });
  $("rqDelegEnd").addEventListener("click", async () => {
    if (!(await UI.confirm("إنهاء التفويض؟ تعود الطلبات إليك فقط.", { ok: "إنهاء" }))) return;
    try { await db.collection("delegations").doc(me).delete(); $("rqDeleg").hidden = true; UI.toast("انتهى التفويض"); } catch (err){ console.error(err); UI.toast("تعذّر إنهاء التفويض", "err"); }
  });

  /* ---------- requests page ---------- */
  function setTab(t){
    tab = t;
    document.querySelectorAll("[data-rqtab]").forEach(b => b.setAttribute("aria-selected", b.dataset.rqtab === t ? "true" : "false"));
    renderList();
  }
  document.querySelectorAll("[data-rqtab]").forEach(b => b.addEventListener("click", () => setTab(b.dataset.rqtab)));
  const rqPicked = new Set();
  // requests I acted on as an approver (for myself or on someone's behalf)
  const didApprove = r => (r.history || []).some(x => x.by === me && (x.action === "approve" || x.action === "final"));
  const listOf = t => t === "inbox" ? requests.filter(amApprover) : t === "mine" ? requests.filter(r => r.submittedBy === me) : t === "done" ? requests.filter(didApprove) : isAdmin() ? requests : [];
  function inTab(){ return listOf(tab); }
  function fillFilters(){
    const fill = (id, pairs) => { const sel = $(id), keep = sel.value, first = sel.options[0].cloneNode(true); sel.innerHTML = ""; sel.append(first);
      pairs.forEach(([v, t]) => sel.append(new Option(t, v))); sel.value = [...sel.options].some(o => o.value === keep) ? keep : ""; };
    const base = inTab();
    fill("rqFTitle", [...new Set(base.map(r => r.title).filter(Boolean))].sort().map(t => [t, t]));
    const by = new Map(); base.forEach(r => by.set(r.submittedBy, r.submitterName || r.submittedBy));
    fill("rqFBy", [...by].sort((a, b) => a[1].localeCompare(b[1])));
  }
  function inDate(iso, f){
    if (!f) return true; const d = new Date(iso || 0), now = new Date();
    if (f === "today") return d.toDateString() === now.toDateString();
    if (f === "week") return now - d <= 7 * 86400000;
    if (f === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    return true;
  }
  function visible(){
    const q = $("rqQ").value.trim(), fs = $("rqFStatus").value, ft = $("rqFTitle").value, fb = $("rqFBy").value, fd = $("rqFDate").value;
    return inTab().filter(r => (!q || [r.title, r.employee, r.assoc, r.ref, r.submitterName, r.letter && r.letter.fields && r.letter.fields["الجهة الموجه لها"]].some(x => (x || "").includes(q)))
      && (!fs || r.status === fs) && (!ft || r.title === ft) && (!fb || r.submittedBy === fb) && inDate(r.submittedAt || r.updatedAt, fd))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  function syncRqBulk(list){
    [...rqPicked].forEach(id => { if (!requests.some(r => r.id === id)) rqPicked.delete(id); });
    $("rqBulk").hidden = !isAdmin() || !rqPicked.size; $("rqBulkN").textContent = `${rqPicked.size} محدد`;
    const vis = list.filter(r => rqPicked.has(r.id)).length;
    $("rqSelAll").checked = list.length > 0 && vis === list.length; $("rqSelAll").indeterminate = vis > 0 && vis < list.length;
    $("rqBulkDel").disabled = rqPicked.size === 0; $("rqBulkDel").textContent = rqPicked.size ? `حذف المحدد (${rqPicked.size})` : "حذف المحدد";
  }
  async function deleteRequests(ids){
    if (!ids.length || !isAdmin()) return;
    const approved = ids.filter(id => (requests.find(r => r.id === id) || {}).status === "approved").length;
    const txt = `حذف ${ids.length === 1 ? "الطلب" : ids.length + " طلبات"} نهائياً؟` + (approved ? " الخطابات الصادرة منها تبقى في سجل الخطابات." : "");
    if (!(await UI.confirm(txt, { ok: "حذف", danger: true }))) return;
    try {
      for (let i = 0; i < ids.length; i += 400){ const b = db.batch(); ids.slice(i, i + 400).forEach(id => b.delete(db.collection("requests").doc(id))); await b.commit(); }
      ids.forEach(id => rqPicked.delete(id));
      if (current && ids.includes(current.id)) closeDetail();
      UI.toast(ids.length === 1 ? "حُذف الطلب" : `حُذف ${ids.length} طلبات`);
    } catch (e){ console.error(e); UI.toast("تعذّر الحذف", "err"); }
  }
  ["rqQ"].forEach(id => $(id).addEventListener("input", () => renderList()));
  ["rqFStatus", "rqFTitle", "rqFBy", "rqFDate"].forEach(id => $(id).addEventListener("change", () => renderList()));
  $("rqFReset").addEventListener("click", () => { ["rqQ", "rqFStatus", "rqFTitle", "rqFBy", "rqFDate"].forEach(id => { $(id).value = ""; }); renderList(); });
  $("rqSelAll").addEventListener("change", e => { visible().forEach(r => { e.target.checked ? rqPicked.add(r.id) : rqPicked.delete(r.id); }); renderList(); });
  $("rqBulkDel").addEventListener("click", () => deleteRequests([...rqPicked]));
  function badge(){
    const n = requests.filter(amApprover).length;
    $("rqInboxN").textContent = String(n); $("rqMineN").textContent = String(listOf("mine").length); $("rqDoneN").textContent = String(listOf("done").length); $("rqAllN").textContent = String(requests.length); $("rqBadge").textContent = n ? String(n) : ""; $("rqBadge").hidden = !n;
  }
  function renderList(){
    badge();
    const ul = $("rqList"); if (!ul) return;
    $("rqSignin").hidden = !!db; $("rqLayout").hidden = !db;
    fillFilters();
    const list = visible(); ul.innerHTML = "";
    const all = inTab().length;
    $("rqCount").textContent = `${list.length} من ${all}`;
    const SUB = { inbox: "بانتظار اعتمادك", mine: "من طلباتك", done: "اعتمدتها", all: "من كل الطلبات" };
    $("rqSubH").textContent = `${all} ${SUB[tab] || ""}`;
    $("rqFReset").hidden = !["rqQ", "rqFStatus", "rqFTitle", "rqFBy", "rqFDate"].some(id => $(id).value);
    $("rqEmpty").hidden = list.length > 0;
    $("rqEmpty").textContent = all && !list.length ? "لا توجد طلبات تطابق البحث" : tab === "inbox" ? "لا توجد طلبات بانتظار اعتمادك" : tab === "mine" ? "لم ترفع أي طلب بعد" : tab === "done" ? "لم تعتمد أي طلب بعد" : "لا توجد طلبات";
    const tbl = document.querySelector(".rq-tbl"); tbl.hidden = !list.length; tbl.classList.toggle("picking", isAdmin());
    list.forEach(r => {
      const tr = document.createElement("tr"); tr.className = "rq-row" + (current && current.id === r.id ? " on" : "") + (isLate(r) ? " late" : "");
      tr.tabIndex = 0; tr.dataset.id = r.id;
      const stage = stageOf(r), n = (r.stages || []).length;
      const atName = r.status === "pending" && stage ? stage.name : r.status === "returned" ? "مقدّم الطلب" : "";
      const atWho = r.status === "pending" && stage ? (stage.approvers || []).map(a => a.name || a.email).join("، ") : r.status === "returned" ? (r.submitterName || r.submittedBy) : "";
      tr.innerHTML = `<td class="rq-c-pick"></td><td class="rq-c-title"><b></b><small></small></td><td class="rq-c-st"><span class="rq-chip ${r.status}"></span></td><td class="rq-c-assoc"></td>
        <td class="rq-c-by"><span class="rq-by"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg><span></span></span></td>
        <td class="rq-c-at"><span class="rq-at"></span><button type="button" class="rq-chain"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 8.5v3a4 4 0 0 0 4 4h5.5"/></svg>سلسلة الاعتماد</button></td>
        <td class="rq-c-when"></td><td class="rq-c-act"></td>`;
      tr.querySelector(".rq-c-title b").textContent = r.title || "طلب";
      tr.querySelector(".rq-c-title small").textContent = [r.employee, r.ref].filter(Boolean).join(" · ");
      tr.querySelector(".rq-chip").textContent = STATUS[r.status] || r.status;
      tr.querySelector(".rq-c-assoc").textContent = r.assoc || "—";
      tr.querySelector(".rq-by span").textContent = r.submittedBy === me ? "أنت" : (r.submitterName || r.submittedBy);
      const at = tr.querySelector(".rq-at");
      if (atName){ at.innerHTML = "<b></b><small></small>"; at.querySelector("b").textContent = atName + (r.status === "pending" && n > 1 ? ` (${(r.stageIndex || 0) + 1} من ${n})` : ""); at.querySelector("small").textContent = atWho; }
      else at.textContent = "—";
      tr.querySelector(".rq-chain").addEventListener("click", e => { e.stopPropagation(); show(r.id, false, "steps"); });
      const when = tr.querySelector(".rq-c-when");
      when.textContent = r.status === "pending" ? ageText(since(r)) : fmtDay(r.updatedAt || r.submittedAt);
      when.title = fmt(r.updatedAt || r.submittedAt);
      const acts = tr.querySelector(".rq-c-act");
      const btn = (label, cls, fn, icon) => { const b = document.createElement("button"); b.type = "button"; b.className = "rq-act " + cls; b.title = label; b.setAttribute("aria-label", label); b.innerHTML = icon; b.addEventListener("click", e => { e.stopPropagation(); fn(); }); acts.append(b); };
      if (amApprover(r)) btn((r.stageIndex || 0) === n - 1 ? "اعتماد نهائي وإصدار" : "اعتماد", "ok", () => act(r, "approve"), '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>');
      btn("عرض التفاصيل", "", () => show(r.id), '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>');
      if (isAdmin()){
        const cb = document.createElement("input"); cb.type = "checkbox"; cb.className = "rq-pick"; cb.setAttribute("aria-label", "تحديد الطلب"); cb.checked = rqPicked.has(r.id);
        cb.addEventListener("click", e => e.stopPropagation());
        cb.addEventListener("change", () => { cb.checked ? rqPicked.add(r.id) : rqPicked.delete(r.id); tr.classList.toggle("picked", cb.checked); syncRqBulk(list); });
        tr.querySelector(".rq-c-pick").append(cb); tr.classList.toggle("picked", cb.checked);
      }
      tr.addEventListener("click", () => show(r.id));
      tr.addEventListener("keydown", e => { if (e.key === "Enter" && e.target === tr) show(r.id); });
      ul.append(tr);
    });
    syncRqBulk(list);
    if (current){ const fresh = requests.find(r => r.id === current.id); if (fresh) show(fresh.id, true); else closeDetail(); }
  }
  // the details open in a side panel over the table
  function closeDetail(){
    current = null; $("rqDetail").hidden = true; $("rqScrim").hidden = true; document.body.classList.remove("rq-open");
    document.querySelectorAll(".rq-row.on").forEach(tr => tr.classList.remove("on"));
  }
  $("rqClose").addEventListener("click", closeDetail);
  $("rqScrim").addEventListener("click", closeDetail);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && current && !document.querySelector(".ui-dialog:not([hidden])")) closeDetail(); });
  window.addEventListener("hashchange", () => { if (current) closeDetail(); });
  function show(id, quiet, focus){
    const r = requests.find(x => x.id === id); if (!r) return;
    current = r; $("rqDetail").hidden = false; $("rqScrim").hidden = false; document.body.classList.add("rq-open");
    document.querySelectorAll(".rq-row").forEach(tr => tr.classList.toggle("on", tr.dataset.id === id));
    if (!quiet){ $("rqDetail").scrollTop = 0; if (focus === "steps") setTimeout(() => $("rqSteps").scrollIntoView({ block: "start", behavior: "smooth" }), 60); else $("rqClose").focus({ preventScroll: true }); }
    $("rqTitle").textContent = r.title;
    const chip = $("rqStatus"); chip.className = "rq-chip " + r.status; chip.textContent = STATUS[r.status] || r.status;
    $("rqMeta").innerHTML = "";
    [["مقدّم الطلب", r.submitterName || r.submittedBy], ["الجهة", r.letter && r.letter.fields ? r.letter.fields["الجهة الموجه لها"] : ""], ["الموظف", r.employee], ["الجمعية", r.assoc], ["المسار", r.workflowName], ["الرقم الصادر", r.ref]]
      .filter(x => x[1]).forEach(([k, v]) => { const d = document.createElement("div"); d.innerHTML = "<dt></dt><dd></dd>"; d.querySelector("dt").textContent = k; d.querySelector("dd").textContent = v; $("rqMeta").append(d); });
    // the path: submitter, then each stage
    const steps = $("rqSteps"); steps.innerHTML = "";
    const all = [{ name: "مقدّم الطلب", approvers: [{ name: r.submitterName || r.submittedBy }] }, ...(r.stages || [])];
    all.forEach((s, i) => {
      const li = document.createElement("li");
      const idx = i - 1, at = r.stageIndex || 0;
      const state = i === 0 ? "done" : r.status === "approved" ? "done" : r.status === "pending" ? (idx < at ? "done" : idx === at ? "now" : "next") : (idx < at ? "done" : idx === at && r.status !== "cancelled" ? r.status : "next");
      li.className = "rq-step " + state;
      li.innerHTML = `<span class="rq-dot" aria-hidden="true"></span><span class="rq-sn"></span><span class="rq-sa"></span>`;
      li.querySelector(".rq-sn").textContent = s.name;
      li.querySelector(".rq-sa").textContent = (s.approvers || []).map(a => a.name || a.email).join("، ");
      steps.append(li);
    });
    // history
    const h = $("rqHistory"); h.innerHTML = "";
    (r.history || []).slice().reverse().forEach(x => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="rq-hw"></span><span class="rq-ha"></span><span class="rq-hn"></span>`;
      li.querySelector(".rq-hw").textContent = fmt(x.at);
      li.querySelector(".rq-ha").textContent = `${x.name || x.by} ${ACTION[x.action] || x.action}${x.onBehalf ? ` نيابة عن ${x.onBehalfName || x.onBehalf}` : ""}${x.stage ? ` (${x.stage})` : ""}`;
      li.querySelector(".rq-hn").textContent = [x.reason, x.note].filter(Boolean).join(" · ");
      h.append(li);
    });
    // actions
    const box = $("rqActions"); box.innerHTML = "";
    const add = (label, cls, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "btn " + cls; b.textContent = label; b.addEventListener("click", fn); box.append(b); };
    const last = (r.stageIndex || 0) === (r.stages || []).length - 1;
    if (amApprover(r)){
      add(last ? "اعتماد نهائي وإصدار" : "اعتماد", "primary", () => act(r, "approve"));
      add("إرجاع للتعديل", "", () => act(r, "return"));
      add("رفض", "danger", () => act(r, "reject"));
      if (opts.approverEdit) add("تعديل الخطاب", "ghost", () => editAs(r, "approver"));
    }
    if (r.status === "pending" && r.submittedBy === me && !isAdmin() && Array.isArray(r.currentApprovers) && r.currentApprovers.includes(me)){
      const n = document.createElement("p"); n.className = "muted-text"; n.textContent = "أنت من معتمدي هذه المرحلة، لكن لا يعتمد أحد طلبه بنفسه. يعتمده معتمد آخر أو المدير."; box.append(n);
    }
    if (r.submittedBy === me && r.status === "returned") add("تعديل وإعادة الرفع", "primary", () => editAs(r, "submitter"));
    if (r.submittedBy === me && (r.status === "pending" || r.status === "returned")) add("سحب الطلب", "ghost", () => act(r, "cancel"));
    add("معاينة كاملة", "ghost", () => HRLetters.preview({ ...HRLetters.finalize(r.letter, r.status === "approved"), ref: r.ref }, { title: r.title, print: r.status === "approved", pdf: r.status === "approved" }));
    if (r.status === "approved") add("طباعة الخطاب", "primary", () => HRLetters.print({ ...HRLetters.finalize(r.letter, r.status === "approved"), ref: r.ref }));
    if (r.status === "approved" && permsOf(my).pdf) add("حفظ PDF", "", () => HRLetters.pdf({ ...HRLetters.finalize(r.letter, r.status === "approved"), ref: r.ref }));
    if (isAdmin()) add("حذف الطلب", "ghost danger-text", () => deleteRequests([r.id]));
    $("rqNoteWrap").hidden = !amApprover(r);
    // preview
    const pv = HRLetters.paper({ ...HRLetters.finalize(r.letter, r.status === "approved"), ref: r.ref });
    const paper = $("rqPaper"); paper.setAttribute("style", pv.style); paper.innerHTML = pv.html;
    setTimeout(() => { HRLetters.fit(); HRLetters.place(paper); }, 30);
  }

  async function act(r, action){
    let note = $("rqNote").value.trim(), reason = "";
    const words = { approve: ["اعتماد الطلب؟", "اعتماد"], return: ["إرجاع الطلب لمقدّمه للتعديل؟", "إرجاع"], reject: ["رفض الطلب نهائياً؟", "رفض"], cancel: ["سحب طلبك؟", "سحب"] }[action];
    const last = (r.stageIndex || 0) === (r.stages || []).length - 1;
    if (action === "approve" && last) words[0] = "اعتماد نهائي؟ يأخذ الخطاب رقمه الصادر ويُضاف إلى السجل.";
    if (action === "return" || action === "reject"){
      // the reason is always asked, so the causes of rework can be counted
      const v = await UI.prompt(words[0], { title: action === "return" ? "إرجاع للتعديل" : "رفض الطلب", ok: words[1], danger: action === "reject", choices: REASONS, note, noteRequired: opts.noteRequired !== false, placeholder: "التفاصيل: وش المطلوب تعديله؟" });
      if (!v) return; reason = v.choice; note = v.note;
    } else if (!(await UI.confirm(words[0], { ok: words[1], danger: false }))) return;
    const now = new Date().toISOString(), stage = stageOf(r) ? stageOf(r).name : "";
    const forWho = action !== "cancel" ? actingFor(r) : me;
    const entry = { at: now, by: me, name: myName, action: action === "approve" && last ? "final" : action, stage, note, ...(reason ? { reason } : {}), ...(forWho && forWho !== me ? { onBehalf: forWho, onBehalfName: nameOf(forWho) } : {}) };
    const ref = db.collection("requests").doc(r.id);
    try {
      if (action === "approve" && last){
        // the outgoing number, the letter in the log, and the request closed
        const L = HRLetters.finalize(r.letter || {});
        const year = +new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { year: "numeric" }).format(new Date((L.date || now.slice(0, 10)) + "T12:00:00")).replace(/\D/g, "");
        const no = await db.runTransaction(async tx => {
          const c = db.collection("hrMeta").doc("counter"); const d = await tx.get(c);
          const lastNo = d.exists && d.data().year === year ? d.data().last || 0 : 0;
          tx.set(c, { year, last: lastNo + 1 }); return lastNo + 1;
        });
        const refNo = `${String(no).padStart(3, "0")}/${year}`;
        // the letter and the closed request are written together
        const letter = db.collection("hrLetters").doc(), b = db.batch();
        b.set(letter, { ...L, no, year, ref: refNo, createdAt: now, createdBy: r.submittedBy, requestId: r.id, approvedBy: me, approvals: [...(r.history || []), entry] });
        b.update(ref, { status: "approved", ref: refNo, letterId: letter.id, currentApprovers: [], updatedAt: now, history: [...(r.history || []), entry] });
        await b.commit();
        UI.toast(`اعتُمد الطلب وصدر الخطاب برقم ${refNo}`);
      } else if (action === "approve"){
        await ref.update({ stageIndex: (r.stageIndex || 0) + 1, currentApprovers: r.stages[(r.stageIndex || 0) + 1].emails || [], updatedAt: now, history: [...(r.history || []), entry] });
        UI.toast("اعتُمد وانتقل الطلب للمرحلة التالية");
      } else {
        await ref.update({ status: action === "return" ? "returned" : action === "reject" ? "rejected" : "cancelled", currentApprovers: [], updatedAt: now, history: [...(r.history || []), entry] });
        UI.toast(action === "return" ? "أُعيد الطلب لمقدّمه" : action === "reject" ? "رُفض الطلب" : "سُحب الطلب");
      }
      $("rqNote").value = "";
    } catch (e){ console.error(e); UI.toast("تعذّر تنفيذ الإجراء", "err"); }
  }

  // open the request's letter in the letter editor; saving comes back here
  function editAs(r, who){
    location.hash = "#/hr/letters";
    setTimeout(() => HRLetters.open(r.letter, {
      request: true, label: `${r.title}${r.employee ? " · " + r.employee : ""}`,
      saveText: who === "submitter" ? "حفظ وإعادة الرفع" : "حفظ التعديل والعودة للطلب",
      onSave: async L => {
        const now = new Date().toISOString();
        const entry = { at: now, by: me, name: myName, action: who === "submitter" ? "resubmit" : "edit", stage: who === "submitter" ? "" : (stageOf(r) || {}).name || "" };
        const patch = { letter: L, title: L.title, assoc: L.assoc || "", employee: L.employee || "", updatedAt: now, history: [...(r.history || []), entry] };
        // after a return the request can carry on from the stage that returned it
        const at = who === "submitter" && r.status === "returned" && opts.resumeStage !== false ? (r.stageIndex || 0) : 0;
        if (who === "submitter") Object.assign(patch, { status: "pending", stageIndex: at, currentApprovers: (r.stages[at] || {}).emails || [] });
        else patch.currentApprovers = r.currentApprovers || [];
        await db.collection("requests").doc(r.id).update(patch);
        UI.toast(who === "submitter" ? "أُعيد رفع الطلب" : "حُفظ تعديل الخطاب");
        HRLetters.clear();
        location.hash = "#/hr/requests";
      },
    }), 60);
  }

  /* ---------- التمكين التقني ← إدارة الطلبات الإدارية ---------- */
  let wEdit = null, wDraft = null;
  const newId = () => "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  function renderAdmin(){
    if (!$("raBox")) return;
    $("raSignin").hidden = !!db; $("raNoAdmin").hidden = !db || isAdmin(); $("raBox").hidden = !db || !isAdmin();
    if (!isAdmin()) return;
    // workflows
    const ul = $("raWfList"); ul.innerHTML = "";
    $("raWfEmpty").hidden = workflows.length > 0;
    workflows.forEach(w => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="f-meta"><span class="f-name"></span><span class="f-file"></span></span><button class="btn small" type="button">تعديل</button> <button class="btn small ghost" type="button">حذف</button>`;
      li.querySelector(".f-name").textContent = w.name + (w.isDefault ? " · الافتراضي" : "");
      const tnames = (w.templates || []).map(id => (templates.find(t => t.id === id) || {}).title).filter(Boolean);
      li.querySelector(".f-file").textContent = "مقدّم الطلب ← " + (w.stages || []).map(s => s.name).join(" ← ") + (tnames.length ? ` · ${tnames.join("، ")}` : "");
      const [eb, db2] = li.querySelectorAll("button");
      eb.addEventListener("click", () => openWf(w));
      db2.addEventListener("click", async () => { if (await UI.confirm(`حذف مسار «${w.name}»؟ الطلبات الجارية تكمل على مسارها.`, { ok: "حذف", danger: true })) saveWorkflows(workflows.filter(x => x.id !== w.id), "حُذف المسار"); });
      ul.append(li);
    });
    $("raOptResume").checked = opts.resumeStage !== false;
    $("raOptEdit").checked = opts.approverEdit !== false; $("raOptNote").checked = opts.noteRequired !== false; $("raOptSla").value = +opts.slaDays || 2;
  }
  /* ---------- التمكين التقني ← صلاحيات المستخدمين ---------- */
  function renderPerms(){
    const list = $("pmList"); if (!list) return;
    $("pmSignin").hidden = !!db; $("pmNoAdmin").hidden = !db || isAdmin(); $("pmBox").hidden = !db || !isAdmin();
    if (!isAdmin()) return;
    list.innerHTML = "";
    users.slice().sort((a, b) => (b.role === "admin") - (a.role === "admin") || (a.name || a.id).localeCompare(b.name || b.id)).forEach(u => {
      const adm = u.role === "admin", P = permsOf(u), secs = u.sections || SECTIONS.map(x => x[0]);
      const card = document.createElement("article"); card.className = "card pm-card" + (adm ? " admin" : "");
      card.innerHTML = `<header class="pm-h"><div class="pm-who"><span class="pm-name"></span><bdi class="pm-mail"></bdi></div><span class="pm-role"></span><select class="select pm-preset" aria-label="قالب صلاحيات"></select></header>
        <div class="pm-groups"><fieldset><legend>الأقسام</legend><div class="pm-sec"></div></fieldset><fieldset><legend>الخطابات</legend><div class="pm-let"></div></fieldset><fieldset><legend>إعدادات الخطابات</legend><div class="pm-set"></div></fieldset></div>`;
      card.querySelector(".pm-name").textContent = u.name || u.id.split("@")[0];
      card.querySelector(".pm-mail").textContent = u.id;
      card.querySelector(".pm-role").textContent = adm ? "مدير · كل الصلاحيات" : "مستخدم";
      const sel = card.querySelector(".pm-preset");
      sel.append(new Option("قالب جاهز…", ""));
      PRESETS.forEach(([k, label]) => sel.append(new Option(label, k)));
      const match = PRESETS.find(([, , keys]) => ALL_KEYS.every(k => P[k] === keys.includes(k)));
      sel.value = match ? match[0] : "";
      sel.hidden = adm;
      sel.addEventListener("change", () => {
        const pr = PRESETS.find(x => x[0] === sel.value); if (!pr) return;
        setPerm(u.id, { perms: Object.fromEntries(ALL_KEYS.map(k => [k, pr[2].includes(k)])), canIssue: pr[2].includes("issue") });
      });
      const box = (host, key, label, checked, onChange) => {
        const l = document.createElement("label"); l.className = "s-check"; l.innerHTML = '<input type="checkbox"> <span></span>';
        l.querySelector("span").textContent = label;
        const cb = l.querySelector("input"); cb.checked = checked; cb.disabled = adm;
        cb.addEventListener("change", () => onChange(cb.checked));
        host.append(l);
      };
      SECTIONS.forEach(([k, label]) => box(card.querySelector(".pm-sec"), k, label, adm || secs.includes(k), on => {
        const cur = new Set(u.sections || SECTIONS.map(x => x[0])); on ? cur.add(k) : cur.delete(k); setPerm(u.id, { sections: [...cur] });
      }));
      const setOne = (k, on) => { const next = { ...permsOf(u), [k]: on }; setPerm(u.id, { perms: next, canIssue: !!next.issue }); };
      PERMS.forEach(([k, label]) => box(card.querySelector(".pm-let"), k, label, P[k], on => setOne(k, on)));
      SETUP.forEach(([k, label]) => box(card.querySelector(".pm-set"), k, label, P[k], on => setOne(k, on)));
      list.append(card);
    });
    $("pmEmpty").hidden = users.length > 0;
  }
  async function setPerm(email, patch){
    try { await db.collection("allowed").doc(email).update(patch); UI.toast("حُفظت الصلاحية"); }
    catch (e){ console.error(e); UI.toast("تعذّر حفظ الصلاحية (تحتاج دور مدير)", "err"); }
  }
  async function saveWorkflows(list, done){
    try { await db.collection("settings").doc("workflows").set({ list: list.map(w => ({ ...w, stages: normStages(w.stages) })), updatedAt: new Date().toISOString() }); if (done) UI.toast(done); }
    catch (e){ console.error(e); UI.toast("تعذّر الحفظ", "err"); }
  }
  function openWf(w){
    wEdit = w || null;
    wDraft = w ? JSON.parse(JSON.stringify(w)) : { id: newId(), name: "", stages: [{ name: "المدير المباشر", approvers: [] }, { name: "الإدارة التنفيذية", approvers: [] }], templates: [], isDefault: !workflows.some(x => x.isDefault) };
    $("raWfHead").textContent = w ? "تعديل المسار" : "مسار جديد";
    $("raWfName").value = wDraft.name; $("raWfDefault").checked = !!wDraft.isDefault;
    renderStages(); renderWfTpls();
    $("raWfEditor").hidden = false; $("raWfName").focus();
  }
  function renderStages(){
    const box = $("raStages"); box.innerHTML = "";
    const first = document.createElement("div"); first.className = "ra-stage fixed"; first.innerHTML = '<span class="ra-n">1</span><span>مقدّم الطلب</span><span class="muted-text">من يرفع الطلب</span>'; box.append(first);
    wDraft.stages.forEach((s, i) => {
      const d = document.createElement("div"); d.className = "ra-stage";
      d.innerHTML = `<span class="ra-n">${i + 2}</span><input class="input" aria-label="اسم المرحلة"><div class="ra-apps"></div>
        <span class="ra-btns"><button class="btn small ghost" type="button" aria-label="تقديم">▲</button><button class="btn small ghost" type="button" aria-label="تأخير">▼</button><button class="btn small ghost" type="button">حذف</button></span>`;
      const inp = d.querySelector("input"); inp.value = s.name; inp.addEventListener("input", () => { s.name = inp.value; });
      const apps = d.querySelector(".ra-apps");
      if (!users.length) apps.innerHTML = '<span class="muted-text">أضف المستخدمين أولاً من الإعدادات العامة ← المستخدمون</span>';
      users.forEach(u => {
        const l = document.createElement("label"); l.className = "s-check"; l.innerHTML = '<input type="checkbox"> <span></span>';
        l.querySelector("span").textContent = u.name || u.id;
        const cb = l.querySelector("input"); cb.checked = (s.approvers || []).some(a => a.email === u.id);
        cb.addEventListener("change", () => { s.approvers = (s.approvers || []).filter(a => a.email !== u.id); if (cb.checked) s.approvers.push({ email: u.id, name: u.name || u.id }); });
        apps.append(l);
      });
      const [up, down, del] = d.querySelectorAll(".ra-btns button");
      up.disabled = i === 0; down.disabled = i === wDraft.stages.length - 1;
      up.addEventListener("click", () => { [wDraft.stages[i - 1], wDraft.stages[i]] = [wDraft.stages[i], wDraft.stages[i - 1]]; renderStages(); });
      down.addEventListener("click", () => { [wDraft.stages[i + 1], wDraft.stages[i]] = [wDraft.stages[i], wDraft.stages[i + 1]]; renderStages(); });
      del.addEventListener("click", () => { wDraft.stages.splice(i, 1); renderStages(); });
      box.append(d);
    });
  }
  function renderWfTpls(){
    const box = $("raWfTpls"); box.innerHTML = "";
    const used = new Map(); workflows.filter(w => w.id !== wDraft.id).forEach(w => (w.templates || []).forEach(id => used.set(id, w.name)));
    if (!templates.length) box.innerHTML = '<span class="muted-text">لا توجد قوالب محفوظة بعد</span>';
    templates.forEach(t => {
      const l = document.createElement("label"); l.className = "s-check"; l.innerHTML = '<input type="checkbox"> <span></span>';
      l.querySelector("span").textContent = t.title + (used.has(t.id) ? ` (في مسار «${used.get(t.id)}»)` : "");
      const cb = l.querySelector("input"); cb.checked = (wDraft.templates || []).includes(t.id);
      cb.addEventListener("change", () => { wDraft.templates = (wDraft.templates || []).filter(x => x !== t.id); if (cb.checked) wDraft.templates.push(t.id); });
      box.append(l);
    });
  }
  $("raWfNew").addEventListener("click", () => openWf(null));
  $("raStageAdd").addEventListener("click", () => { wDraft.stages.push({ name: "مرحلة جديدة", approvers: [] }); renderStages(); });
  $("raWfCancel").addEventListener("click", () => { $("raWfEditor").hidden = true; wDraft = null; });
  $("raWfSave").addEventListener("click", async () => {
    wDraft.name = $("raWfName").value.trim(); wDraft.isDefault = $("raWfDefault").checked;
    if (!wDraft.name){ UI.toast("اكتب اسم المسار", "err"); return; }
    if (!wDraft.stages.length){ UI.toast("أضف مرحلة اعتماد واحدة على الأقل", "err"); return; }
    const empty = wDraft.stages.find(s => !s.name.trim() || !(s.approvers || []).length);
    if (empty){ UI.toast(`حدّد اسم ومعتمداً لكل مرحلة («${empty.name || "بدون اسم"}»)`, "err"); return; }
    let list = workflows.filter(w => w.id !== wDraft.id).map(w => ({ ...w, templates: (w.templates || []).filter(id => !wDraft.templates.includes(id)), isDefault: wDraft.isDefault ? false : w.isDefault }));
    const i = workflows.findIndex(w => w.id === wDraft.id);
    if (i >= 0) list.splice(i, 0, wDraft); else list.push(wDraft);
    await saveWorkflows(list, "حُفظ المسار");
    $("raWfEditor").hidden = true; wDraft = null;
  });
  ["raOptEdit", "raOptNote"].forEach(id => $(id).addEventListener("change", async () => {
    try { await db.collection("settings").doc("requests").set({ approverEdit: $("raOptEdit").checked, resumeStage: $("raOptResume").checked, noteRequired: $("raOptNote").checked, slaDays: Math.max(1, Math.min(30, +$("raOptSla").value || 2)) }); UI.toast("حُفظت الخيارات"); }
    catch (e){ UI.toast("تعذّر الحفظ", "err"); }
  }));

  /* ---------- connect ---------- */
  async function connect(d){
    if (db) return;
    db = d.db; me = ((d.user && d.user.email) || "").toLowerCase(); myName = (d.user && d.user.displayName) || me.split("@")[0];
    try { const a = await db.collection("allowed").doc(me).get(); if (a.exists) my = { ...my, ...a.data() }; } catch (e){ console.error(e); }
    applyAccess();
    db.collection("allowed").doc(me).onSnapshot(a => { if (a.exists){ my = { role: "member", canIssue: false, sections: null, ...a.data() }; applyAccess(); renderAdmin(); renderList(); renderPerms(); backfill(); } }, () => {});
    db.collection("settings").doc("workflows").onSnapshot(x => { workflows = (x.exists && x.data().list) || []; renderAdmin(); renderDeleg(); backfill(); }, () => {});
    db.collection("settings").doc("requests").onSnapshot(x => { if (x.exists) opts = { ...opts, ...x.data() }; renderAdmin(); if (current) show(current.id, true); }, () => {});
    db.collection("delegations").onSnapshot(s => { delegs = {}; s.docs.forEach(d => { delegs[d.id] = d.data(); }); renderDeleg(); renderList(); toHome(); }, () => {});
    db.collection("requests").onSnapshot(s => { requests = s.docs.map(x => ({ id: x.id, ...x.data() })); renderList(); toHome(); backfill(); }, e => console.error(e));
    db.collection("hrTemplates").onSnapshot(s => { templates = s.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)); renderAdmin(); }, () => {});
    if (isAdmin()) db.collection("allowed").onSnapshot(s => { users = s.docs.map(x => ({ id: x.id, ...x.data() })); renderAdmin(); renderPerms(); publishDirectory(); }, () => {});
    renderAdmin(); renderList(); renderPerms();
  }
  window.Requests = { submit };
  renderAdmin(); renderList(); renderPerms();
  if (window.appDb && window.appUser) connect({ db: window.appDb, user: window.appUser });
  window.addEventListener("app:db", e => connect(e.detail));
})();
