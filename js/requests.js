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
  const STATUS = { pending: "قيد الاعتماد", returned: "أُعيد للتعديل", rejected: "مرفوض", approved: "معتمد", cancelled: "مسحوب" };
  const ACTION = { submit: "رفع الطلب", resubmit: "أعاد رفع الطلب", approve: "اعتمد", final: "اعتمد نهائياً وأصدر الخطاب", return: "أعاد الطلب للتعديل", reject: "رفض الطلب", cancel: "سحب الطلب", edit: "عدّل الخطاب" };
  let db = null, me = "", myName = "", my = { role: "member", canIssue: false, sections: null };
  let workflows = [], opts = { approverEdit: true, noteRequired: true }, requests = [], users = [], templates = [];
  let tab = "inbox", current = null;
  const isAdmin = () => my.role === "admin";
  const fmt = iso => { if (!iso) return ""; const d = new Date(iso); return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(d); };
  const stageOf = r => (r.stages || [])[r.stageIndex || 0];
  const amApprover = r => r.status === "pending" && !!stageOf(r) && (stageOf(r).approvers || []).some(a => a.email === me);

  /* ---------- access: sections and admin pages follow the user's permissions ---------- */
  function applyAccess(){
    const sec = isAdmin() || !my.sections ? null : new Set(my.sections);
    document.querySelectorAll("[data-sec]").forEach(el => {
      const k = el.dataset.sec;
      const hide = k === "admin" ? !isAdmin() : !!sec && !sec.has(k);
      el.classList.toggle("sec-off", hide);
      if (el.classList.contains("nav-sub") && hide) el.hidden = true;
    });
    window.HRLetters && HRLetters.setCanIssue(isAdmin() || !!my.canIssue);
    window.HRLetters && HRLetters.enableSubmit(true);
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
    const path = w.stages.map(s => s.name).join(" ← ");
    if (!(await UI.confirm(`رفع «${L.title}» للاعتماد عبر مسار «${w.name}»: مقدّم الطلب ← ${path}`, { ok: "رفع الطلب" }))) return;
    const now = new Date().toISOString();
    try {
      await db.collection("requests").add({
        type: "letter", status: "pending", workflowId: w.id, workflowName: w.name,
        stages: w.stages.map(s => ({ name: s.name, approvers: s.approvers || [] })), stageIndex: 0,
        submittedBy: me, submitterName: myName, submittedAt: now, updatedAt: now,
        title: L.title, assoc: L.assoc || "", employee: L.employee || "", letter: L,
        history: [{ at: now, by: me, name: myName, action: "submit" }],
      });
      UI.toast("رُفع الطلب للاعتماد");
      HRLetters.clear();
      location.hash = "#/hr/requests"; setTab("mine");
    } catch (e){ console.error(e); UI.toast("تعذّر رفع الطلب", "err"); }
  }

  /* ---------- requests page ---------- */
  function setTab(t){
    tab = t;
    document.querySelectorAll("[data-rqtab]").forEach(b => b.setAttribute("aria-selected", b.dataset.rqtab === t ? "true" : "false"));
    renderList();
  }
  document.querySelectorAll("[data-rqtab]").forEach(b => b.addEventListener("click", () => setTab(b.dataset.rqtab)));
  function visible(){
    const list = tab === "inbox" ? requests.filter(amApprover) : tab === "mine" ? requests.filter(r => r.submittedBy === me) : isAdmin() ? requests : [];
    return list.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  function badge(){
    const n = requests.filter(amApprover).length;
    $("rqInboxN").textContent = n ? String(n) : ""; $("rqBadge").textContent = n ? String(n) : ""; $("rqBadge").hidden = !n;
  }
  function renderList(){
    badge();
    const ul = $("rqList"); if (!ul) return;
    $("rqSignin").hidden = !!db; $("rqLayout").hidden = !db;
    const list = visible(); ul.innerHTML = "";
    $("rqEmpty").hidden = list.length > 0;
    $("rqEmpty").textContent = tab === "inbox" ? "لا توجد طلبات بانتظار اعتمادك" : tab === "mine" ? "لم ترفع أي طلب بعد" : "لا توجد طلبات";
    list.forEach(r => {
      const li = document.createElement("li"); li.className = "rq-item" + (current && current.id === r.id ? " on" : "");
      li.tabIndex = 0;
      const st = r.status === "pending" && stageOf(r) ? `عند: ${stageOf(r).name}` : STATUS[r.status] || r.status;
      li.innerHTML = `<div class="rq-top"><span class="rq-t"></span><span class="rq-chip ${r.status}"></span></div><div class="rq-sub"><span></span><span class="rq-when"></span></div>`;
      li.querySelector(".rq-t").textContent = r.title + (r.employee ? ` · ${r.employee}` : "");
      li.querySelector(".rq-chip").textContent = st;
      li.querySelector(".rq-sub span").textContent = `${r.submitterName || r.submittedBy}${r.assoc ? " · " + r.assoc : ""}${r.ref ? " · " + r.ref : ""}`;
      li.querySelector(".rq-when").textContent = fmt(r.updatedAt);
      li.addEventListener("click", () => show(r.id));
      li.addEventListener("keydown", e => { if (e.key === "Enter") show(r.id); });
      ul.append(li);
    });
    if (current){ const fresh = requests.find(r => r.id === current.id); if (fresh) show(fresh.id, true); else { current = null; $("rqDetail").hidden = true; } }
  }
  function show(id, quiet){
    const r = requests.find(x => x.id === id); if (!r) return;
    current = r; $("rqDetail").hidden = false;
    if (!quiet) document.querySelectorAll(".rq-item").forEach(li => li.classList.remove("on"));
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
      li.querySelector(".rq-ha").textContent = `${x.name || x.by} ${ACTION[x.action] || x.action}${x.stage ? ` (${x.stage})` : ""}`;
      li.querySelector(".rq-hn").textContent = x.note || "";
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
    if (r.submittedBy === me && r.status === "returned") add("تعديل وإعادة الرفع", "primary", () => editAs(r, "submitter"));
    if (r.submittedBy === me && (r.status === "pending" || r.status === "returned")) add("سحب الطلب", "ghost", () => act(r, "cancel"));
    if (r.status === "approved") add("طباعة الخطاب", "primary", () => HRLetters.print({ ...r.letter, ref: r.ref }));
    $("rqNoteWrap").hidden = !amApprover(r);
    // preview
    const pv = HRLetters.paper({ ...r.letter, ref: r.ref });
    const paper = $("rqPaper"); paper.setAttribute("style", pv.style); paper.innerHTML = pv.html;
    setTimeout(() => { HRLetters.fit(); HRLetters.place(paper); }, 30);
  }

  async function act(r, action){
    const note = $("rqNote").value.trim();
    if ((action === "return" || action === "reject") && opts.noteRequired && !note){ UI.toast("اكتب سبب الإرجاع أو الرفض في الملاحظة", "err"); $("rqNote").focus(); return; }
    const words = { approve: ["اعتماد الطلب؟", "اعتماد"], return: ["إرجاع الطلب لمقدّمه للتعديل؟", "إرجاع"], reject: ["رفض الطلب نهائياً؟", "رفض"], cancel: ["سحب طلبك؟", "سحب"] }[action];
    const last = (r.stageIndex || 0) === (r.stages || []).length - 1;
    if (action === "approve" && last) words[0] = "اعتماد نهائي؟ يأخذ الخطاب رقمه الصادر ويُضاف إلى السجل.";
    if (!(await UI.confirm(words[0], { ok: words[1], danger: action === "reject" }))) return;
    const now = new Date().toISOString(), stage = stageOf(r) ? stageOf(r).name : "";
    const entry = { at: now, by: me, name: myName, action: action === "approve" && last ? "final" : action, stage, note };
    const ref = db.collection("requests").doc(r.id);
    try {
      if (action === "approve" && last){
        // the outgoing number, the letter in the log, and the request closed
        const L = r.letter || {};
        const year = +new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { year: "numeric" }).format(new Date((L.date || now.slice(0, 10)) + "T12:00:00")).replace(/\D/g, "");
        const no = await db.runTransaction(async tx => {
          const c = db.collection("hrMeta").doc("counter"); const d = await tx.get(c);
          const lastNo = d.exists && d.data().year === year ? d.data().last || 0 : 0;
          tx.set(c, { year, last: lastNo + 1 }); return lastNo + 1;
        });
        const refNo = `${String(no).padStart(3, "0")}/${year}`;
        const letter = await db.collection("hrLetters").add({ ...L, no, year, ref: refNo, createdAt: now, createdBy: r.submittedBy, requestId: r.id, approvedBy: me, approvals: [...(r.history || []), entry] });
        await ref.update({ status: "approved", ref: refNo, letterId: letter.id, updatedAt: now, history: [...(r.history || []), entry] });
        UI.toast(`اعتُمد الطلب وصدر الخطاب برقم ${refNo}`);
      } else if (action === "approve"){
        await ref.update({ stageIndex: (r.stageIndex || 0) + 1, updatedAt: now, history: [...(r.history || []), entry] });
        UI.toast("اعتُمد وانتقل الطلب للمرحلة التالية");
      } else {
        await ref.update({ status: action === "return" ? "returned" : action === "reject" ? "rejected" : "cancelled", updatedAt: now, history: [...(r.history || []), entry] });
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
        if (who === "submitter") Object.assign(patch, { status: "pending", stageIndex: 0 });
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
    // permissions
    const body = $("raPerms"); body.innerHTML = "";
    users.slice().sort((a, b) => (b.role === "admin") - (a.role === "admin") || a.id.localeCompare(b.id)).forEach(u => {
      const tr = document.createElement("tr"); const adm = u.role === "admin";
      tr.innerHTML = `<td><bdi class="u-mail"></bdi><span class="u-name"></span></td><td>${adm ? "مدير" : "مستخدم"}</td><td><label class="s-check"><input type="checkbox" data-k="canIssue"> يصدر مباشرة</label></td><td class="ra-secs"></td>`;
      tr.querySelector(".u-mail").textContent = u.id; tr.querySelector(".u-name").textContent = u.name || "";
      const ci = tr.querySelector('[data-k="canIssue"]'); ci.checked = adm || !!u.canIssue; ci.disabled = adm;
      ci.addEventListener("change", () => setPerm(u.id, { canIssue: ci.checked }));
      const secs = u.sections || SECTIONS.map(s => s[0]);
      SECTIONS.forEach(([k, label]) => {
        const l = document.createElement("label"); l.className = "s-check"; l.innerHTML = `<input type="checkbox"> ${label}`;
        const cb = l.querySelector("input"); cb.checked = adm || secs.includes(k); cb.disabled = adm;
        cb.addEventListener("change", () => { const cur = new Set(u.sections || SECTIONS.map(s => s[0])); cb.checked ? cur.add(k) : cur.delete(k); setPerm(u.id, { sections: [...cur] }); });
        tr.querySelector(".ra-secs").append(l);
      });
      body.append(tr);
    });
    $("raOptEdit").checked = opts.approverEdit !== false; $("raOptNote").checked = opts.noteRequired !== false;
  }
  async function setPerm(email, patch){
    try { await db.collection("allowed").doc(email).update(patch); UI.toast("حُفظت الصلاحية"); }
    catch (e){ console.error(e); UI.toast("تعذّر حفظ الصلاحية (تحتاج دور مدير)", "err"); }
  }
  async function saveWorkflows(list, done){
    try { await db.collection("settings").doc("workflows").set({ list, updatedAt: new Date().toISOString() }); if (done) UI.toast(done); }
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
    try { await db.collection("settings").doc("requests").set({ approverEdit: $("raOptEdit").checked, noteRequired: $("raOptNote").checked }); UI.toast("حُفظت الخيارات"); }
    catch (e){ UI.toast("تعذّر الحفظ", "err"); }
  }));

  /* ---------- connect ---------- */
  async function connect(d){
    if (db) return;
    db = d.db; me = ((d.user && d.user.email) || "").toLowerCase(); myName = (d.user && d.user.displayName) || me.split("@")[0];
    try { const a = await db.collection("allowed").doc(me).get(); if (a.exists) my = { ...my, ...a.data() }; } catch (e){ console.error(e); }
    applyAccess();
    db.collection("allowed").doc(me).onSnapshot(a => { if (a.exists){ my = { role: "member", canIssue: false, sections: null, ...a.data() }; applyAccess(); renderAdmin(); renderList(); } }, () => {});
    db.collection("settings").doc("workflows").onSnapshot(x => { workflows = (x.exists && x.data().list) || []; renderAdmin(); }, () => {});
    db.collection("settings").doc("requests").onSnapshot(x => { if (x.exists) opts = { ...opts, ...x.data() }; renderAdmin(); if (current) show(current.id, true); }, () => {});
    db.collection("requests").onSnapshot(s => { requests = s.docs.map(x => ({ id: x.id, ...x.data() })); renderList(); }, e => console.error(e));
    db.collection("hrTemplates").onSnapshot(s => { templates = s.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)); renderAdmin(); }, () => {});
    if (isAdmin()) db.collection("allowed").onSnapshot(s => { users = s.docs.map(x => ({ id: x.id, ...x.data() })); renderAdmin(); }, () => {});
    renderAdmin(); renderList();
  }
  window.Requests = { submit };
  renderAdmin(); renderList();
  if (window.appDb && window.appUser) connect({ db: window.appDb, user: window.appUser });
  window.addEventListener("app:db", e => connect(e.detail));
})();
