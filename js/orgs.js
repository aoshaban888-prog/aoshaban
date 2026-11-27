/* إدارة الجمعيات (المرحلة الرابعة): everything about an association around the directory record in "associations".
   - ملف الجمعية: one page per association (overview, documents, meetings and decisions, policies, linked tasks).
   - مركز الوثائق والاستحقاقات (orgs/deadlines): documents with expiry dates ("assocDocs"), board terms and policy reviews,
     sorted by days left, in bands of 90/60/30/15/7 days; the bell alerts once per band.
   - الاجتماعات والقرارات (orgs/meetings): minutes in "meetings"; each decision can become a task (linked both ways).
   - دورة حياة اللوائح: a stage per policy per association in associations.policyStages, read together with the
     approval data the policy library already keeps (approvals[pid].date / review).
   Only people with the governance section read or write these (see firestore.rules).
   Other pages: window.Orgs.deadlines(), .docs(), .meetings(), .openProfile(id), and the "app:orgs" event. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
  const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
  const days = d => Math.round((Date.parse(String(d).slice(0, 10) + "T12:00:00") - Date.parse(today() + "T12:00:00")) / 864e5);
  const addDays = (d, n) => { const x = new Date(String(d).slice(0, 10) + "T12:00:00"); x.setDate(x.getDate() + n); return x.toLocaleDateString("en-CA"); };
  const fmtG = d => isDay(d) ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d + "T12:00:00")) : "—";
  const fmtH = d => { try { return isDay(d) ? new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d + "T12:00:00")) : ""; } catch { return ""; } };
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const A = () => window.Assocs ? Assocs.list() : [];
  const assocName = id => { const a = window.Assocs && Assocs.byId(id); return a ? a.name : "—"; };
  const T = () => window.Tasks;

  const DOC_KINDS = ["ترخيص الجمعية", "شهادة التسجيل", "اللائحة الأساسية", "شهادة الزكاة والدخل", "شهادة الضريبة", "شهادة التأمينات الاجتماعية", "شهادة السعودة", "عقد أو اتفاقية", "وثيقة تأمين", "التقرير السنوي", "القوائم المالية المدققة", "أخرى"];
  const MEET_TYPES = ["اجتماع مجلس الإدارة", "جمعية عمومية عادية", "جمعية عمومية غير عادية", "اجتماع لجنة", "اجتماع آخر"];
  const MEET_ST = { planned: ["مجدول", "var(--info)"], held: ["منعقد", "var(--warn)"], approved: ["محضر معتمد", "var(--ok)"] };
  const BANDS = [7, 15, 30, 60, 90];
  const band = d => d < 0 ? "late" : (BANDS.find(b => d <= b) || "later");
  const BAND_L = { late: ["منتهية / فات موعدها", "var(--danger)"], 7: ["خلال 7 أيام", "var(--danger)"], 15: ["خلال 15 يوماً", "#ea580c"], 30: ["خلال 30 يوماً", "var(--warn)"], 60: ["خلال 60 يوماً", "#ca8a04"], 90: ["خلال 90 يوماً", "var(--info)"], later: ["بعد 90 يوماً", "var(--ok)"] };
  const left = d => d < 0 ? `منذ ${-d} ${-d === 1 ? "يوم" : "يوماً"}` : d === 0 ? "اليوم" : `بعد ${d} ${d === 1 ? "يوم" : "يوماً"}`;
  const STAGES = { none: ["غير معتمدة", "var(--muted)"], draft: ["مسودة", "var(--info)"], review: ["قيد المراجعة", "var(--warn)"], approved: ["معتمدة", "var(--ok)"], due: ["تقترب المراجعة", "#ca8a04"], late: ["فات موعد المراجعة", "var(--danger)"], cancelled: ["ملغاة", "var(--muted)"] };

  let db = null, me = "", can = false, docs = [], meets = [], unsubs = [];
  let pid = null, ptab = "overview", polAll = false;

  /* ---------- derived data ---------- */
  function polStage(a, p){
    const ap = (a.approvals || {})[p] || {}, st = (a.policyStages || {})[p] || {};
    if (st.stage === "cancelled") return "cancelled";
    const approvedAfter = ap.date && (!st.at || ap.date >= String(st.at).slice(0, 10));
    if ((st.stage === "draft" || st.stage === "review") && !approvedAfter) return st.stage;
    if (ap.date){ if (isDay(ap.review)){ const d = days(ap.review); if (d < 0) return "late"; if (d <= 60) return "due"; } return "approved"; }
    return st.stage === "draft" || st.stage === "review" ? st.stage : "none";
  }
  const policyTitle = p => { const x = T() && T().policies ? T().policies.find(y => y.id === p) : null; return x ? x.title : "لائحة"; };
  function deadlines(){
    if (!can) return [];
    const out = [];
    docs.forEach(x => { if (isDay(x.expires)) out.push({ key: "d:" + x.id, kind: "doc", kindLabel: x.kind || "وثيقة", title: x.title || x.kind || "وثيقة", assocId: x.assocId, date: x.expires, doc: x.id }); });
    A().forEach(a => {
      if (isDay(a.boardEnd)) out.push({ key: "b:" + a.id, kind: "board", kindLabel: "دورة المجلس", title: "نهاية دورة مجلس الإدارة", assocId: a.id, date: a.boardEnd });
      Object.entries(a.approvals || {}).forEach(([p, ap]) => { if (ap && isDay(ap.review) && polStage(a, p) !== "cancelled") out.push({ key: `r:${a.id}:${p}`, kind: "review", kindLabel: "مراجعة لائحة", title: "مراجعة " + policyTitle(p), assocId: a.id, date: ap.review, policy: p }); });
    });
    meets.forEach(m => (m.decisions || []).forEach(d => { if (isDay(d.due) && !decisionDone(d)) out.push({ key: `q:${m.id}:${d.id}`, kind: "decision", kindLabel: "قرار", title: d.text, assocId: m.assocId, date: d.due, meeting: m.id }); }));
    return out.map(x => ({ ...x, assoc: assocName(x.assocId), days: days(x.date), band: band(days(x.date)) })).sort((a, b) => a.date.localeCompare(b.date));
  }
  const taskOf = d => d.taskId && T() && T().byId ? T().byId.get(d.taskId) : null;
  const decisionDone = d => { const t = taskOf(d); return d.done || (t && t.status === "done"); };
  function decisionState(d){
    const t = taskOf(d);
    if (decisionDone(d)) return ["منفّذ", "var(--ok)"];
    if (d.taskId && !t) return ["مهمة غير متاحة", "var(--muted)"];
    if (isDay(d.due) && days(d.due) < 0) return ["متأخر", "var(--danger)"];
    if (t) return [t.status === "doing" ? "قيد التنفيذ" : t.status === "waiting" ? "بانتظار طرف آخر" : "مفتوح", "var(--info)"];
    return ["بدون مهمة", "var(--warn)"];
  }
  const emit = () => window.dispatchEvent(new CustomEvent("app:orgs"));

  /* ---------- small UI helpers ---------- */
  const pill = (l, c) => `<span class="og-pill" style="--c:${c}">${esc(l)}</span>`;
  const assocOpts = sel => `<option value="">— اختر الجمعية —</option>` + A().slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar")).map(a => `<option value="${esc(a.id)}"${a.id === sel ? " selected" : ""}>${esc(a.name)}</option>`).join("");
  function dialog(title, body, { wide } = {}){
    return new Promise(res => {
      const back = document.createElement("div"); back.className = "ui-scrim";
      const box = document.createElement("div"); box.className = "ui-dialog og-dlg" + (wide ? " wide" : ""); box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
      box.innerHTML = `<h2>${esc(title)}</h2><form novalidate>${body}<div class="ui-actions"><button class="btn primary" type="submit">حفظ</button><button class="btn" type="button" data-x>إلغاء</button></div></form>`;
      document.body.append(back, box);
      const f = box.querySelector("form"), close = v => { back.remove(); box.remove(); document.removeEventListener("keydown", esc_); res(v); };
      const esc_ = e => { if (e.key === "Escape") close(null); };
      document.addEventListener("keydown", esc_);
      box.querySelector("[data-x]").addEventListener("click", () => close(null)); back.addEventListener("click", () => close(null));
      f.addEventListener("submit", e => { e.preventDefault(); const bad = [...f.querySelectorAll("[required]")].find(i => !i.value.trim()); if (bad){ bad.focus(); UI.toast("أكمل الخانات المطلوبة", "err"); return; } close({ f, box }); });
      setTimeout(() => { const i = f.querySelector("input,select,textarea"); i && i.focus(); }, 30);
      box._form = f;
    });
  }
  async function upload(f){
    if (!f) return null;
    if (!(window.Cloud && Cloud.ready())){ UI.alert("إرفاق الملفات يحتاج ربط Cloudinary من التمكين التقني › الربط."); return null; }
    try { const up = await Cloud.upload(f, { folder: "associations" }); return { url: up.url, name: f.name.slice(0, 200) }; }
    catch (e){ console.error(e); UI.alert(Cloud.errText(e)); return null; }
  }

  /* ---------- documents ---------- */
  async function editDoc(id, preset = {}, renew = false){
    if (!db || !can) return;
    const x = id ? docs.find(d => d.id === id) : null; const v = x ? { ...x } : { assocId: pid || "", ...preset };
    if (renew){ v.issued = today(); v.expires = isDay(x.expires) ? addDays(x.expires, 365) : ""; }
    const r = await dialog(renew ? "تجديد الوثيقة" : x ? "تعديل الوثيقة" : "وثيقة جديدة", `
      <label class="ig-f"><span>الجمعية <b class="req">*</b></span><select class="select" name="assocId" required ${renew ? "disabled" : ""}>${assocOpts(v.assocId)}</select></label>
      <div class="lf-row"><label class="ig-f"><span>نوع الوثيقة</span><select class="select" name="kind">${DOC_KINDS.map(k => `<option${k === v.kind ? " selected" : ""}>${k}</option>`).join("")}</select></label>
        <label class="ig-f"><span>اسم الوثيقة <i>(اختياري)</i></span><input class="input" name="title" value="${esc(v.title || "")}" placeholder="يُستخدم النوع إن تُرك فارغاً"></label></div>
      <div class="lf-row"><label class="ig-f"><span>الرقم</span><input class="input" name="number" dir="ltr" value="${esc(v.number || "")}"></label>
        <label class="ig-f"><span>جهة الإصدار</span><input class="input" name="issuer" value="${esc(v.issuer || "")}"></label></div>
      <div class="lf-row"><label class="ig-f"><span>تاريخ الإصدار</span><input class="input" type="date" name="issued" value="${esc(v.issued || "")}"></label>
        <label class="ig-f"><span>تاريخ الانتهاء</span><input class="input" type="date" name="expires" value="${esc(v.expires || "")}"></label></div>
      <label class="ig-f"><span>${renew ? "الوثيقة بعد التجديد" : "الملف"} <i>(اختياري)</i></span><input class="input" type="file" name="file"></label>
      ${v.file && !renew ? `<p class="muted-text">الملف الحالي: <a href="${esc(v.file.url)}" target="_blank" rel="noopener">${esc(v.file.name)}</a></p>` : ""}
      <label class="ig-f"><span>ملاحظات</span><textarea class="input" name="notes" rows="2">${esc(renew ? "" : v.notes || "")}</textarea></label>`);
    if (!r) return;
    const f = r.f, file = f.file.files[0] ? await upload(f.file.files[0]) : null;
    if (f.issued.value && f.expires.value && f.expires.value < f.issued.value){ UI.toast("تاريخ الانتهاء قبل تاريخ الإصدار", "err"); return; }
    const now = new Date().toISOString();
    const data = { assocId: renew ? x.assocId : f.assocId.value, kind: f.kind.value, title: f.title.value.trim(), number: f.number.value.trim(), issuer: f.issuer.value.trim(),
      issued: f.issued.value || null, expires: f.expires.value || null, notes: f.notes.value.trim(), updatedAt: now, updatedBy: me };
    if (file) data.file = file; else if (!x) data.file = null;
    if (renew) data.history = [...(x.history || []), { issued: x.issued || null, expires: x.expires || null, number: x.number || "", file: x.file || null, at: now }];
    try {
      if (x) await db.collection("assocDocs").doc(x.id).set(data, { merge: true });
      else await db.collection("assocDocs").doc(uid("d")).set({ ...data, createdAt: now, createdBy: me });
      UI.toast(renew ? "جُدّدت الوثيقة" : "حُفظت الوثيقة");
    } catch (e){ console.error(e); UI.toast("تعذّر الحفظ", "err"); }
  }
  async function removeDoc(id){
    const x = docs.find(d => d.id === id); if (!x) return;
    if (!(await UI.confirm(`حذف «${x.title || x.kind}» من وثائق ${assocName(x.assocId)}؟`, { ok: "حذف", danger: true }))) return;
    try { await db.collection("assocDocs").doc(id).delete(); UI.toast("حُذفت الوثيقة"); } catch { UI.toast("تعذّر الحذف", "err"); }
  }
  function docsTable(list, showAssoc){
    if (!list.length) return `<p class="ig-empty">لا توجد وثائق مسجّلة بعد.${can ? " أضف الترخيص وشهادة التسجيل وغيرها لتصلك تنبيهات قبل انتهائها." : ""}</p>`;
    return `<div class="og-tw"><table class="og-t"><thead><tr><th>الوثيقة</th>${showAssoc ? "<th>الجمعية</th>" : ""}<th>الرقم</th><th>الإصدار</th><th>الانتهاء</th><th>المتبقي</th><th></th></tr></thead><tbody>${list.map(x => {
      const d = isDay(x.expires) ? days(x.expires) : null, b = d === null ? null : BAND_L[band(d)];
      return `<tr data-doc="${esc(x.id)}"><td><b>${esc(x.title || x.kind)}</b>${x.title ? `<small>${esc(x.kind)}</small>` : ""}${x.file ? `<small><a href="${esc(x.file.url)}" target="_blank" rel="noopener">📎 ${esc(x.file.name)}</a></small>` : ""}</td>
        ${showAssoc ? `<td>${esc(assocName(x.assocId))}</td>` : ""}<td dir="ltr" class="og-num">${esc(x.number || "—")}</td><td>${fmtG(x.issued)}</td><td>${fmtG(x.expires)}<small>${fmtH(x.expires)}</small></td>
        <td>${b ? pill(left(d), b[1]) : '<span class="muted-text">بلا انتهاء</span>'}</td>
        <td class="og-act">${can ? `<button type="button" class="btn small" data-a="renew">تجديد</button><button type="button" class="btn small ghost" data-a="edit">تعديل</button><button type="button" class="btn small ghost danger-text" data-a="del" aria-label="حذف">حذف</button>` : ""}</td></tr>`; }).join("")}</tbody></table></div>`;
  }

  /* ---------- meetings and decisions ---------- */
  let mt = null; // the meeting being edited: { id|null, data }
  function openMeeting(id, preset = {}){
    const m = id ? meets.find(x => x.id === id) : null; if (id && !m) return;
    mt = { id: m ? m.id : null, data: m ? JSON.parse(JSON.stringify(m)) : { assocId: pid || "", type: MEET_TYPES[0], status: "planned", date: today(), decisions: [], ...preset }, dirty: false };
    if (location.hash !== "#/orgs/meetings") location.hash = "#/orgs/meetings"; else drawMeetings();
  }
  function meetingForm(){
    const m = mt.data, ro = can ? "" : "disabled", people = T() && T().people ? T().people : [];
    return `<header class="ig-rbar"><button class="btn small ghost" type="button" data-m="back"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>الاجتماعات</button>
      <div class="ig-rt"><h1>${esc(m.type || "اجتماع")}${m.number ? " رقم " + esc(m.number) : ""}</h1><span class="muted-text" id="mtState">${mt.dirty ? "تغييرات غير محفوظة" : ""}</span></div>
      <div class="actions">${mt.id ? '<button class="btn small ghost" type="button" data-m="print">طباعة المحضر</button>' : ""}${mt.id && can ? '<button class="btn small ghost danger-text" type="button" data-m="del">حذف</button>' : ""}${can ? '<button class="btn small primary" type="button" data-m="save">حفظ</button>' : ""}</div></header>
      <fieldset class="og-mform" ${ro}>
      <div class="card og-sec"><div class="as-grid">
        <label class="ig-f"><span>الجمعية <b class="req">*</b></span><select class="select" data-k="assocId">${assocOpts(m.assocId)}</select></label>
        <label class="ig-f"><span>نوع الاجتماع</span><select class="select" data-k="type">${MEET_TYPES.map(t => `<option${t === m.type ? " selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="ig-f"><span>رقم الاجتماع</span><input class="input" data-k="number" value="${esc(m.number || "")}" placeholder="مثال: 3/2026"></label>
        <label class="ig-f"><span>الحالة</span><select class="select" data-k="status">${Object.entries(MEET_ST).map(([k, [l]]) => `<option value="${k}"${k === m.status ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="ig-f"><span>التاريخ</span><input class="input" type="date" data-k="date" value="${esc(m.date || "")}"></label>
        <label class="ig-f"><span>الوقت</span><input class="input" type="time" data-k="time" value="${esc(m.time || "")}"></label>
        <label class="ig-f as-wide"><span>المكان أو رابط الاجتماع</span><input class="input" data-k="place" value="${esc(m.place || "")}"></label>
      </div></div>
      <div class="card og-sec"><div class="as-grid og-g2">
        <label class="ig-f"><span>الحضور <i>(اسم في كل سطر)</i></span><textarea class="input" rows="4" data-k="attendees">${esc(m.attendees || "")}</textarea></label>
        <label class="ig-f"><span>المعتذرون أو الغائبون</span><textarea class="input" rows="4" data-k="absent">${esc(m.absent || "")}</textarea></label>
        <label class="ig-f as-wide"><span>جدول الأعمال <i>(بند في كل سطر)</i></span><textarea class="input" rows="4" data-k="agenda">${esc(m.agenda || "")}</textarea></label>
        <label class="ig-f as-wide"><span>المحضر والمناقشات</span><textarea class="input" rows="6" data-k="minutes">${esc(m.minutes || "")}</textarea></label>
      </div>
      <div class="og-file">${m.file ? `<a href="${esc(m.file.url)}" target="_blank" rel="noopener">📎 ${esc(m.file.name)}</a> <button type="button" class="linkbtn danger-text" data-m="unfile">إزالة</button>` : '<span class="muted-text">لا يوجد ملف محضر موقّع</span>'} <label class="btn small">إرفاق المحضر الموقّع<input type="file" id="mtFile" hidden></label></div></div>
      <div class="card og-sec"><div class="card-h"><h2>القرارات</h2><span class="muted-text">حوّل كل قرار إلى مهمة لها مسؤول وموعد، وتتحدث حالته من المهمة.</span></div>
        <datalist id="mtPeople">${people.map(p => `<option value="${esc(p.email)}">${esc(p.name || "")}</option>`).join("")}</datalist>
        <div class="og-decs">${(m.decisions || []).map((d, i) => { const [sl, sc] = decisionState(d); return `<div class="og-dec" data-i="${i}">
          <span class="og-dn">${i + 1}</span>
          <textarea class="input" rows="2" data-d="text" placeholder="نص القرار">${esc(d.text || "")}</textarea>
          <input class="input" data-d="owner" list="mtPeople" placeholder="المسؤول" value="${esc(d.owner || "")}">
          <input class="input" type="date" data-d="due" value="${esc(d.due || "")}" aria-label="موعد التنفيذ">
          <div class="og-ds">${pill(sl, sc)}${d.taskId ? `<button type="button" class="linkbtn" data-m="task" data-i="${i}">فتح المهمة</button>` : can ? `<button type="button" class="btn small" data-m="totask" data-i="${i}">تحويل إلى مهمة</button>` : ""}</div>
          ${can ? `<button type="button" class="as-rm" data-m="rmdec" data-i="${i}" aria-label="حذف القرار">✕</button>` : ""}</div>`; }).join("") || '<p class="muted-text">لا توجد قرارات بعد.</p>'}</div>
        ${can ? '<button type="button" class="ini-add" data-m="adddec">+ إضافة قرار</button>' : ""}</div>
      </fieldset>`;
  }
  const markM = () => { mt.dirty = true; const s = $("mtState"); if (s) s.textContent = "تغييرات غير محفوظة"; };
  async function saveMeeting(quiet){
    if (!db || !can || !mt) return false;
    const m = mt.data;
    if (!m.assocId){ UI.toast("اختر الجمعية", "err"); return false; }
    const now = new Date().toISOString();
    const data = { assocId: m.assocId, type: m.type || MEET_TYPES[0], number: (m.number || "").trim(), status: MEET_ST[m.status] ? m.status : "planned", date: m.date || null, time: m.time || "", place: (m.place || "").trim(),
      attendees: m.attendees || "", absent: m.absent || "", agenda: m.agenda || "", minutes: m.minutes || "", file: m.file || null,
      decisions: (m.decisions || []).filter(d => (d.text || "").trim() || d.taskId).map(d => ({ id: d.id || uid("q"), text: (d.text || "").trim(), owner: (d.owner || "").trim(), due: d.due || null, taskId: d.taskId || null, done: !!d.done })),
      updatedAt: now, updatedBy: me };
    try {
      if (mt.id) await db.collection("meetings").doc(mt.id).set(data, { merge: true });
      else { mt.id = uid("m"); await db.collection("meetings").doc(mt.id).set({ ...data, createdAt: now, createdBy: me }); }
      mt.data = { ...m, ...data }; mt.dirty = false; if (!quiet) UI.toast("حُفظ الاجتماع"); drawMeetings(); return true;
    } catch (e){ console.error(e); UI.toast("تعذّر الحفظ", "err"); return false; }
  }
  async function decisionToTask(i){
    const d = mt.data.decisions[i]; if (!d || !(d.text || "").trim()){ UI.toast("اكتب نص القرار أولاً", "err"); return; }
    if (!T() || !T().db){ UI.toast("المهام غير متاحة الآن", "err"); return; }
    d.id ||= uid("q");
    if (!(await saveMeeting(true))) return;
    const people = T().people || [], o = (d.owner || "").trim(), p = people.find(x => x.email === o || x.name === o);
    const m = mt.data, label = `قرار ${m.type}${m.number ? " " + m.number : ""} · ${assocName(m.assocId)}`;
    try {
      const tid = await T().create({ title: d.text.slice(0, 200), description: `قرار من ${label}${m.date ? " بتاريخ " + fmtG(m.date) : ""}.${o && !p ? "\nالمسؤول: " + o : ""}`, due: d.due || null, priority: "high", scope: "work",
        assignee: p ? p.email : null, link: { type: "meeting", id: mt.id, decision: d.id, assocId: m.assocId, label } }, { logText: "أنشأ المهمة من قرار اجتماع" });
      const dec = mt.data.decisions.find(x => x.id === d.id); if (dec) dec.taskId = tid;
      await saveMeeting(true); UI.toast("أُنشئت مهمة للقرار");
    } catch (e){ console.error(e); }
  }
  function printMeeting(){
    const m = mt.data, a = window.Assocs && Assocs.byId(m.assocId), lines = s => String(s || "").split("\n").map(x => x.trim()).filter(Boolean);
    const w = window.open("", "_blank"); if (!w){ UI.alert("اسمح بالنوافذ المنبثقة لطباعة المحضر."); return; }
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>محضر ${esc(m.type)}</title><style>
      body{font-family:"IBM Plex Sans Arabic",Tahoma,sans-serif;max-width:760px;margin:32px auto;padding:0 24px;color:#111;line-height:1.9}
      header{display:flex;align-items:center;gap:14px;border-bottom:2px solid #333;padding-bottom:10px;margin-bottom:18px}header img{height:64px}
      h1{font-size:20px;margin:0}h2{font-size:15px;margin:20px 0 6px;border-bottom:1px solid #ccc}table{width:100%;border-collapse:collapse;font-size:13.5px}
      td,th{border:1px solid #bbb;padding:6px 8px;text-align:right;vertical-align:top}.meta{font-size:13.5px;color:#333}.sig{display:flex;justify-content:space-between;margin-top:60px}
      @media print{body{margin:0}}</style></head><body>
      <header>${a && a.logo && a.logo.url ? `<img src="${esc(a.logo.url)}" alt="">` : ""}<div><h1>${esc(a ? a.name : "")}</h1><div class="meta">محضر ${esc(m.type)}${m.number ? " رقم " + esc(m.number) : ""}</div></div></header>
      <p class="meta">التاريخ: ${fmtH(m.date)} هـ الموافق ${fmtG(m.date)} م${m.time ? " · الساعة " + esc(m.time) : ""}${m.place ? " · المكان: " + esc(m.place) : ""}</p>
      ${lines(m.attendees).length ? `<h2>الحضور</h2><ol>${lines(m.attendees).map(x => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}
      ${lines(m.absent).length ? `<h2>المعتذرون</h2><ol>${lines(m.absent).map(x => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}
      ${lines(m.agenda).length ? `<h2>جدول الأعمال</h2><ol>${lines(m.agenda).map(x => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}
      ${(m.minutes || "").trim() ? `<h2>المحضر</h2><p>${esc(m.minutes).replace(/\n/g, "<br>")}</p>` : ""}
      ${(m.decisions || []).length ? `<h2>القرارات</h2><table><thead><tr><th>#</th><th>القرار</th><th>المسؤول</th><th>الموعد</th></tr></thead><tbody>${m.decisions.map((d, i) => `<tr><td>${i + 1}</td><td>${esc(d.text)}</td><td>${esc(d.owner && T() ? T().personName(d.owner) : d.owner || "")}</td><td>${fmtG(d.due)}</td></tr>`).join("")}</tbody></table>` : ""}
      <div class="sig"><span>رئيس الاجتماع: ....................</span><span>أمين السر: ....................</span></div>
      <script>setTimeout(()=>print(),300)<\/script></body></html>`);
    w.document.close();
  }
  let mtab = "list", mAssoc = "";
  function drawMeetings(){
    const box = $("mtView"); if (!box || box.closest(".view").hidden) return;
    $("mtNew").hidden = !can || !!mt;
    if (!db){ box.innerHTML = '<p class="muted-text">سجّل الدخول لعرض الاجتماعات</p>'; return; }
    if (mt){ box.innerHTML = meetingForm(); return; }
    const list = meets.filter(m => !mAssoc || m.assocId === mAssoc).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    const decs = list.flatMap(m => (m.decisions || []).map(d => ({ m, d })));
    const open = decs.filter(x => !decisionDone(x.d)).length;
    box.innerHTML = `<div class="rq-filters"><select class="select" id="mtAssoc" aria-label="الجمعية"><option value="">كل الجمعيات</option>${A().map(a => `<option value="${esc(a.id)}"${a.id === mAssoc ? " selected" : ""}>${esc(a.name)}</option>`).join("")}</select>
      <div class="fu-tabs og-tabs"><button type="button" data-mt="list" aria-pressed="${mtab === "list"}">الاجتماعات <i>${list.length}</i></button><button type="button" data-mt="dec" aria-pressed="${mtab === "dec"}">سجل القرارات <i>${open}</i></button></div></div>
      ${mtab === "list" ? meetingsList(list, !mAssoc) : decisionsLog(decs)}`;
  }
  function meetingsList(list, showAssoc){
    if (!list.length) return `<p class="ig-empty">لا توجد اجتماعات مسجّلة.${can ? " ابدأ بزر «اجتماع جديد»." : ""}</p>`;
    return `<div class="og-meets">${list.map(m => { const decs = m.decisions || [], done = decs.filter(decisionDone).length, st = MEET_ST[m.status] || MEET_ST.planned;
      return `<button type="button" class="og-meet card" data-meet="${esc(m.id)}"><span class="og-md"><b>${isDay(m.date) ? new Date(m.date + "T12:00:00").getDate() : "—"}</b><small>${isDay(m.date) ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { month: "short", year: "numeric" }).format(new Date(m.date + "T12:00:00")) : ""}</small></span>
        <span class="og-mt"><b>${esc(m.type)}${m.number ? " رقم " + esc(m.number) : ""}</b><small>${showAssoc ? esc(assocName(m.assocId)) + " · " : ""}${fmtH(m.date)}${m.place ? " · " + esc(m.place) : ""}</small></span>
        <span class="og-mq">${decs.length ? `${done}/${decs.length} قرار منفّذ` : "بدون قرارات"}</span>${pill(st[0], st[1])}</button>`; }).join("")}</div>`;
  }
  function decisionsLog(decs){
    if (!decs.length) return '<p class="ig-empty">لا توجد قرارات مسجّلة.</p>';
    const rank = x => decisionDone(x.d) ? 2 : isDay(x.d.due) && days(x.d.due) < 0 ? 0 : 1;
    return `<div class="og-tw"><table class="og-t"><thead><tr><th>القرار</th><th>الجمعية</th><th>الاجتماع</th><th>المسؤول</th><th>الموعد</th><th>الحالة</th><th></th></tr></thead><tbody>${decs.sort((a, b) => rank(a) - rank(b) || String(a.d.due || "9").localeCompare(String(b.d.due || "9"))).map(({ m, d }) => { const [sl, sc] = decisionState(d);
      return `<tr data-meet="${esc(m.id)}" data-dec="${esc(d.id)}"><td><b>${esc(d.text)}</b></td><td>${esc(assocName(m.assocId))}</td><td><button type="button" class="linkbtn" data-a="meet">${esc(m.type)}${m.number ? " " + esc(m.number) : ""}</button><small>${fmtG(m.date)}</small></td>
        <td>${esc(d.owner && T() ? T().personName(d.owner) : d.owner || "—")}</td><td>${fmtG(d.due)}</td><td>${pill(sl, sc)}</td>
        <td class="og-act">${d.taskId && taskOf(d) ? '<button type="button" class="btn small ghost" data-a="task">المهمة</button>' : ""}</td></tr>`; }).join("")}</tbody></table></div>`;
  }

  /* ---------- deadlines center ---------- */
  let dAssoc = "", dKind = "", dBand = "soon";
  function drawDeadlines(){
    const box = $("dlView"); if (!box || box.closest(".view").hidden) return;
    $("dlNew").hidden = !can;
    if (!db){ box.innerHTML = '<p class="muted-text">سجّل الدخول لعرض الاستحقاقات</p>'; return; }
    const all = deadlines().filter(x => (!dAssoc || x.assocId === dAssoc) && (!dKind || x.kind === dKind));
    const cnt = {}; all.forEach(x => { cnt[x.band] = (cnt[x.band] || 0) + 1; });
    const soon = all.filter(x => x.band !== "later");
    const list = dBand === "all" ? all : dBand === "soon" ? soon : all.filter(x => String(x.band) === dBand);
    const KIND = { doc: "الوثائق", board: "دورات المجالس", review: "مراجعات اللوائح", decision: "قرارات الاجتماعات" };
    box.innerHTML = `<div class="og-bands">${["late", 7, 15, 30, 60, 90].map(b => `<button type="button" class="og-band" data-band="${b}" aria-pressed="${dBand === String(b)}" style="--c:${BAND_L[b][1]}"><b>${cnt[b] || 0}</b><span>${BAND_L[b][0]}</span></button>`).join("")}</div>
      <div class="rq-filters"><select class="select" id="dlAssoc" aria-label="الجمعية"><option value="">كل الجمعيات</option>${A().map(a => `<option value="${esc(a.id)}"${a.id === dAssoc ? " selected" : ""}>${esc(a.name)}</option>`).join("")}</select>
        <select class="select" id="dlKind" aria-label="النوع"><option value="">كل الأنواع</option>${Object.entries(KIND).map(([k, l]) => `<option value="${k}"${k === dKind ? " selected" : ""}>${l}</option>`).join("")}</select>
        <div class="fu-tabs og-tabs"><button type="button" data-band="soon" aria-pressed="${dBand === "soon"}">خلال 90 يوماً <i>${soon.length}</i></button><button type="button" data-band="later" aria-pressed="${dBand === "later"}">لاحقاً <i>${cnt.later || 0}</i></button><button type="button" data-band="all" aria-pressed="${dBand === "all"}">الكل <i>${all.length}</i></button></div></div>
      ${list.length ? `<div class="og-tw"><table class="og-t"><thead><tr><th>الاستحقاق</th><th>الجمعية</th><th>النوع</th><th>التاريخ</th><th>المتبقي</th><th></th></tr></thead><tbody>${list.map(x => `<tr data-key="${esc(x.key)}">
        <td><b>${esc(x.title)}</b></td><td><button type="button" class="linkbtn" data-a="assoc" data-id="${esc(x.assocId)}">${esc(x.assoc)}</button></td><td>${esc(x.kindLabel)}</td>
        <td>${fmtG(x.date)}<small>${fmtH(x.date)}</small></td><td>${pill(left(x.days), BAND_L[x.band][1])}</td>
        <td class="og-act">${x.kind === "doc" && can ? '<button type="button" class="btn small" data-a="renew">تجديد</button>' : ""}${x.kind === "decision" ? '<button type="button" class="btn small ghost" data-a="meet">الاجتماع</button>' : ""}${x.kind !== "decision" ? '<button type="button" class="btn small ghost" data-a="task">+ مهمة</button>' : ""}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="ig-empty">${all.length ? "لا توجد استحقاقات في هذا التصنيف." : "لا توجد استحقاقات بعد. أضف وثائق الجمعيات بتواريخ انتهائها، أو حدّد نهاية دورة المجلس في بيانات الجمعية."}</p>`}`;
  }
  async function deadlineTask(x){
    if (!T() || !T().db) return;
    const due = x.days > 14 ? addDays(x.date, -14) : today();
    try { await T().create({ title: `${x.kind === "doc" ? "تجديد" : x.kind === "board" ? "التجهيز لانتخاب مجلس جديد" : "متابعة"}: ${x.title} · ${x.assoc}`.slice(0, 200), due, priority: x.days <= 30 ? "high" : "medium", scope: "work",
      description: `الاستحقاق في ${fmtG(x.date)} (${fmtH(x.date)}).` }, { logText: "أنشأ المهمة من مركز الاستحقاقات" }); UI.toast("أُنشئت مهمة بموعد قبل الاستحقاق بأسبوعين"); } catch {}
  }

  /* ---------- policy lifecycle ---------- */
  async function setStage(a, p, stage){
    try { await db.collection("associations").doc(a.id).set({ policyStages: { [p]: stage ? { stage, at: new Date().toISOString(), by: me } : null } }, { merge: true }); UI.toast(stage ? "تغيّرت حالة اللائحة" : "أُلغيت الحالة اليدوية"); }
    catch (e){ console.error(e); UI.toast("تعذّر الحفظ", "err"); }
  }
  function policiesTab(a){
    const pol = T() && T().policies ? T().policies : [];
    const rows = pol.map(p => ({ p, st: polStage(a, p.id), ap: (a.approvals || {})[p.id] || {} }));
    const counts = {}; rows.forEach(r => { counts[r.st] = (counts[r.st] || 0) + 1; });
    const shown = polAll ? rows : rows.filter(r => r.st !== "none");
    const order = { late: 0, due: 1, review: 2, draft: 3, approved: 4, none: 5, cancelled: 6 };
    return `<div class="og-life"><span>مسودة</span><i>←</i><span>قيد المراجعة</span><i>←</i><span>معتمدة</span><i>←</i><span>مراجعة دورية</span></div>
      <div class="og-chips">${Object.entries(STAGES).filter(([k]) => counts[k]).map(([k, [l, c]]) => pill(`${l}: ${counts[k]}`, c)).join(" ")}</div>
      <label class="s-check og-all"><input type="checkbox" id="ogPolAll"${polAll ? " checked" : ""}> <span>عرض كل لوائح المكتبة (${pol.length})</span></label>
      ${shown.length ? `<div class="og-tw"><table class="og-t"><thead><tr><th>اللائحة</th><th>الحالة</th><th>الإصدار</th><th>الاعتماد</th><th>المراجعة القادمة</th><th></th></tr></thead><tbody>${shown.sort((x, y) => order[x.st] - order[y.st]).map(({ p, st, ap }) => `<tr data-pol="${esc(p.id)}">
        <td><b>${esc(p.title)}</b>${ap.resolution ? `<small>قرار ${esc(ap.resolution)}</small>` : ""}</td><td>${pill(STAGES[st][0], STAGES[st][1])}</td><td>${esc(ap.version || "—")}</td><td>${fmtG(ap.date)}</td>
        <td>${fmtG(ap.review)}${isDay(ap.review) ? `<small>${left(days(ap.review))}</small>` : ""}</td>
        <td class="og-act">${can ? `<select class="select og-stage" aria-label="تغيير الحالة"><option value="">تغيير الحالة…</option><option value="draft">مسودة</option><option value="review">بدء المراجعة</option><option value="cancelled">ملغاة</option><option value="-">إلغاء الحالة اليدوية</option></select>` : ""}<button type="button" class="btn small ghost" data-a="lib">المكتبة</button>${can && (st === "due" || st === "late" || st === "review") ? '<button type="button" class="btn small ghost" data-a="ptask">+ مهمة</button>' : ""}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="ig-empty">لا توجد لوائح معتمدة أو قيد العمل لهذه الجمعية. بيانات الاعتماد تُدخل من «اللوائح والسياسات › بيانات الاعتماد»${pol.length ? "، أو اعرض كل لوائح المكتبة لتبدأ مسودة" : ""}.</p>`}
      <p class="muted-text og-note">«معتمدة» و«المراجعة القادمة» من بيانات الاعتماد في مكتبة اللوائح. الحالة اليدوية (مسودة أو قيد المراجعة) تنتهي تلقائياً حين يُسجَّل اعتماد أحدث منها.</p>`;
  }

  /* ---------- the association profile ---------- */
  function openProfile(id){ pid = id; ptab = "overview"; if (location.hash !== "#/orgs/associations") location.hash = "#/orgs/associations"; drawProfile(); window.scrollTo(0, 0); }
  function closeProfile(){ pid = null; drawProfile(); window.Assocs && Assocs.refresh && Assocs.refresh(); }
  function drawProfile(){
    const box = $("asProfile"); if (!box) return;
    const a = pid && window.Assocs ? Assocs.byId(pid) : null;
    const editing = window.Assocs && Assocs.editing && Assocs.editing();
    box.hidden = !a || editing;
    if ($("asHome")) $("asHome").hidden = !db || !!a || editing;
    if (!a || editing) return;
    const myDocs = docs.filter(x => x.assocId === a.id), myMeets = meets.filter(m => m.assocId === a.id), dl = deadlines().filter(x => x.assocId === a.id);
    const tasks = T() && T().list ? T().list.filter(t => !t.parentId && !t.archived && ((t.link && t.link.assocId === a.id) || (a.name && (t.title || "").includes(a.name)))) : [];
    const TABS = [["overview", "نظرة عامة"], ["docs", `الوثائق والاستحقاقات <i>${myDocs.length}</i>`], ["meetings", `الاجتماعات والقرارات <i>${myMeets.length}</i>`], ["policies", "اللوائح والسياسات"], ["tasks", `المهام المرتبطة <i>${tasks.filter(t => t.status !== "done" && t.status !== "cancelled").length}</i>`]];
    const logo = a.logo && a.logo.url;
    box.innerHTML = `<header class="ig-rbar"><button class="btn small ghost" type="button" data-p="back"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>الجمعيات</button></header>
      <section class="og-hero card"><span class="as-logo big">${logo ? `<img src="${esc(logo)}" alt="">` : `<b>${esc((a.shortName || a.name || "؟").trim()[0])}</b>`}</span>
        <div class="og-hn"><h1>${esc(a.name)}</h1><p>${esc([a.field, a.city || a.region, a.license ? "ترخيص " + a.license : ""].filter(Boolean).join(" · ") || "—")}</p></div>
        <div class="actions"><button class="btn small" type="button" data-p="edit">${can ? "تعديل البيانات" : "عرض كل البيانات"}</button>${can ? '<button class="btn small" type="button" data-p="doc">+ وثيقة</button><button class="btn small primary" type="button" data-p="meet">+ اجتماع</button>' : ""}</div></section>
      <div class="fu-tabs og-ptabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-pt="${k}" aria-pressed="${ptab === k}">${l}</button>`).join("")}</div>
      <div class="og-pbody">${ptab === "overview" ? overview(a, myDocs, myMeets, dl) : ptab === "docs" ? docsTable(myDocs.sort((x, y) => String(x.expires || "9").localeCompare(String(y.expires || "9"))), false)
        : ptab === "meetings" ? meetingsList(myMeets.sort((x, y) => String(y.date || "").localeCompare(String(x.date || ""))), false) : ptab === "policies" ? policiesTab(a) : tasksTab(tasks)}</div>`;
  }
  function overview(a, myDocs, myMeets, dl){
    const yr = today().slice(0, 4), decs = myMeets.flatMap(m => m.decisions || []), openDecs = decs.filter(d => !decisionDone(d)).length;
    const valid = myDocs.filter(x => !isDay(x.expires) || days(x.expires) >= 0).length, expired = myDocs.length - valid, soon = myDocs.filter(x => isDay(x.expires) && days(x.expires) >= 0 && days(x.expires) <= 90).length;
    const pol = T() && T().policies ? T().policies : [], stg = pol.map(p => polStage(a, p.id));
    const board = isDay(a.boardEnd) ? days(a.boardEnd) : null;
    const info = [["رقم الترخيص", a.license], ["الرقم الموحد", a.unifiedNo], ["تاريخ التأسيس", a.founded ? fmtG(a.founded) : ""], ["جهة الإشراف", a.supervisor], ["رئيس مجلس الإدارة", a.chairman], ["المدير التنفيذي", a.ceo], ["المشرف المالي", a.treasurer],
      ["دورة المجلس", a.boardStart || a.boardEnd ? `${fmtG(a.boardStart)} ← ${fmtG(a.boardEnd)}` : ""], ["الهاتف", a.phone || a.mobile], ["البريد", a.email]].filter(x => x[1]);
    return `<div class="og-kpis">
        <div><b>${valid}</b><span>وثائق سارية</span>${soon ? `<small style="color:var(--warn)">${soon} تنتهي خلال 90 يوماً</small>` : ""}${expired ? `<small style="color:var(--danger)">${expired} منتهية</small>` : ""}</div>
        <div><b>${myMeets.filter(m => String(m.date || "").startsWith(yr)).length}</b><span>اجتماعات ${yr}</span></div>
        <div class="${openDecs ? "warn" : ""}"><b>${openDecs}</b><span>قرارات لم تُنفّذ</span><small>من ${decs.length}</small></div>
        <div><b>${stg.filter(s => s === "approved" || s === "due").length}</b><span>لوائح معتمدة</span>${stg.filter(s => s === "late").length ? `<small style="color:var(--danger)">${stg.filter(s => s === "late").length} فات موعد مراجعتها</small>` : ""}</div>
        <div class="${board !== null && board <= 90 ? "warn" : ""}"><b>${board === null ? "—" : board < 0 ? "انتهت" : board}</b><span>${board === null ? "دورة المجلس غير محددة" : board < 0 ? "دورة المجلس" : "يوماً على نهاية دورة المجلس"}</span></div>
      </div>
      <div class="og-two">
        <section class="card"><div class="card-h"><h2>الاستحقاقات القادمة</h2><a class="link" href="#/orgs/deadlines">مركز الاستحقاقات</a></div>
          ${dl.filter(x => x.days <= 365).slice(0, 7).map(x => `<div class="og-dl"><span>${esc(x.title)}<small>${esc(x.kindLabel)} · ${fmtG(x.date)}</small></span>${pill(left(x.days), BAND_L[x.band][1])}</div>`).join("") || '<p class="muted-text">لا توجد استحقاقات خلال سنة.</p>'}</section>
        <section class="card"><div class="card-h"><h2>بيانات أساسية</h2></div><dl class="og-info">${info.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("") || '<p class="muted-text">لم تُستكمل بيانات الجمعية بعد.</p>'}</dl>
          ${(a.board || []).length ? `<h3 class="og-h3">أعضاء مجلس الإدارة</h3><ul class="og-board">${a.board.map(b => `<li><b>${esc(b.name || "")}</b><small>${esc(b.role || "")}</small></li>`).join("")}</ul>` : ""}</section>
      </div>
      ${a.vision || a.mission ? `<section class="card og-vm">${a.vision ? `<div><h3 class="og-h3">الرؤية</h3><p>${esc(a.vision)}</p></div>` : ""}${a.mission ? `<div><h3 class="og-h3">الرسالة</h3><p>${esc(a.mission)}</p></div>` : ""}</section>` : ""}`;
  }
  function tasksTab(tasks){
    if (!tasks.length) return '<p class="ig-empty">لا توجد مهام مرتبطة بهذه الجمعية. المهام التي تُنشأ من قرارات اجتماعاتها، أو يرد اسمها في عنوانها، تظهر هنا.</p>';
    const S = window.TaskCore ? TaskCore.ST : {};
    return `<div class="og-tw"><table class="og-t"><thead><tr><th>المهمة</th><th>الحالة</th><th>المسؤول</th><th>الموعد</th></tr></thead><tbody>${tasks.sort((x, y) => String(x.due || "9").localeCompare(String(y.due || "9"))).map(t => `<tr data-task="${esc(t.id)}">
      <td><button type="button" class="linkbtn" data-a="task">${esc(t.title)}</button>${t.link && t.link.label ? `<small>${esc(t.link.label)}</small>` : ""}</td><td>${esc((S[t.status] && (S[t.status].label || S[t.status])) || t.status)}</td><td>${esc(T().personName(t.assignee || t.owner))}</td><td>${fmtG(t.due)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  /* ---------- events ---------- */
  document.addEventListener("click", async e => {
    const prof = e.target.closest("#asProfile"), mv = e.target.closest("#mtView"), dv = e.target.closest("#dlView");
    if (!prof && !mv && !dv) return;
    const a = pid && window.Assocs ? Assocs.byId(pid) : null;
    const pb = e.target.closest("[data-p]");
    if (prof && pb){ const k = pb.dataset.p;
      if (k === "back") closeProfile(); if (k === "edit") Assocs.edit(pid); if (k === "doc") editDoc(null); if (k === "meet") openMeeting(null, { assocId: pid }); return; }
    const pt = e.target.closest("[data-pt]"); if (pt){ ptab = pt.dataset.pt; drawProfile(); return; }
    const meetBtn = e.target.closest("[data-meet]");
    if (meetBtn && meetBtn.classList.contains("og-meet")){ openMeeting(meetBtn.dataset.meet); return; }
    const act = e.target.closest("[data-a]");
    if (act){
      const k = act.dataset.a, tr = act.closest("tr");
      if (tr && tr.dataset.doc){ if (k === "renew") editDoc(tr.dataset.doc, {}, true); if (k === "edit") editDoc(tr.dataset.doc); if (k === "del") removeDoc(tr.dataset.doc); return; }
      if (k === "task" && tr && tr.dataset.task){ TaskDetail.open(tr.dataset.task); return; }
      if (tr && tr.dataset.dec){ const m = meets.find(x => x.id === tr.dataset.meet), d = m && (m.decisions || []).find(x => x.id === tr.dataset.dec);
        if (k === "meet") openMeeting(m.id); if (k === "task" && d && d.taskId) TaskDetail.open(d.taskId); return; }
      if (tr && tr.dataset.key){ const x = deadlines().find(y => y.key === tr.dataset.key); if (!x) return;
        if (k === "assoc") openProfile(x.assocId); if (k === "renew") editDoc(x.doc, {}, true); if (k === "task") deadlineTask(x); if (k === "meet") openMeeting(x.meeting); return; }
      if (tr && tr.dataset.pol && a){ const p = tr.dataset.pol;
        if (k === "lib"){ location.hash = "#/governance/library"; setTimeout(() => window.dispatchEvent(new CustomEvent("app:open-policy", { detail: p })), 120); }
        if (k === "ptask" && T()){ const ap = (a.approvals || {})[p] || {}; try { await T().create({ title: `مراجعة ${policyTitle(p)} · ${a.name}`.slice(0, 200), due: isDay(ap.review) && days(ap.review) > 0 ? ap.review : addDays(today(), 14), priority: "medium", scope: "work", link: { type: "policy", id: p, assocId: a.id, label: policyTitle(p) } }); UI.toast("أُنشئت مهمة المراجعة"); } catch {} }
        return; }
    }
    const db_ = e.target.closest("[data-band]"); if (db_ && dv){ dBand = db_.dataset.band; drawDeadlines(); return; }
    const mtb = e.target.closest("[data-mt]"); if (mtb){ mtab = mtb.dataset.mt; drawMeetings(); return; }
    const mb = e.target.closest("[data-m]");
    if (mb && mt){ const k = mb.dataset.m, i = +mb.dataset.i;
      if (k === "back"){ if (mt.dirty && can && !(await UI.confirm("في تغييرات غير محفوظة. الخروج بدون حفظ؟", { ok: "خروج بدون حفظ", danger: true }))) return; const back = mt.data.assocId; mt = null; if (pid && pid === back){ location.hash = "#/orgs/associations"; ptab = "meetings"; } else drawMeetings(); }
      if (k === "save") saveMeeting();
      if (k === "print") printMeeting();
      if (k === "adddec"){ (mt.data.decisions ||= []).push({ id: uid("q"), text: "", owner: "", due: "" }); markM(); drawMeetings(); setTimeout(() => { const t = [...document.querySelectorAll('#mtView [data-d="text"]')].pop(); t && t.focus(); }, 20); }
      if (k === "rmdec"){ const d = mt.data.decisions[i]; if (d && d.taskId && !(await UI.confirm("القرار مرتبط بمهمة. حذف القرار لا يحذف المهمة. متابعة؟", { ok: "حذف القرار" }))) return; mt.data.decisions.splice(i, 1); markM(); drawMeetings(); }
      if (k === "totask") decisionToTask(i);
      if (k === "task"){ const d = mt.data.decisions[i]; if (d && d.taskId){ if (taskOf(d)) TaskDetail.open(d.taskId); else UI.toast("المهمة غير متاحة لك", "err"); } }
      if (k === "unfile"){ mt.data.file = null; markM(); drawMeetings(); }
      if (k === "del"){ if (!(await UI.confirm("حذف الاجتماع ومحضره نهائياً؟ المهام التي أُنشئت من قراراته تبقى.", { ok: "حذف", danger: true }))) return; try { await db.collection("meetings").doc(mt.id).delete(); mt = null; UI.toast("حُذف الاجتماع"); drawMeetings(); } catch { UI.toast("تعذّر الحذف", "err"); } }
    }
  });
  document.addEventListener("input", e => {
    if (!mt || !e.target.closest("#mtView")) return;
    const k = e.target.dataset.k, dk = e.target.dataset.d;
    if (k){ mt.data[k] = e.target.value; markM(); }
    if (dk){ const i = +e.target.closest(".og-dec").dataset.i; mt.data.decisions[i][dk] = e.target.value; markM(); }
  });
  document.addEventListener("change", async e => {
    const t = e.target;
    if (t.id === "mtAssoc"){ mAssoc = t.value; drawMeetings(); }
    if (t.id === "dlAssoc"){ dAssoc = t.value; drawDeadlines(); }
    if (t.id === "dlKind"){ dKind = t.value; drawDeadlines(); }
    if (t.id === "ogPolAll"){ polAll = t.checked; drawProfile(); }
    if (t.id === "mtFile" && mt){ const f = await upload(t.files[0]); if (f){ mt.data.file = f; markM(); drawMeetings(); } }
    if (t.classList.contains("og-stage")){ const a = Assocs.byId(pid), p = t.closest("tr").dataset.pol; if (a && t.value) setStage(a, p, t.value === "-" ? null : t.value); t.value = ""; }
    if (mt && t.closest("#mtView") && (t.dataset.k || t.dataset.d) && t.tagName === "SELECT"){ /* handled by input */ }
  });
  $("mtNew") && $("mtNew").addEventListener("click", () => openMeeting(null, { assocId: mAssoc }));
  $("dlNew") && $("dlNew").addEventListener("click", () => editDoc(null, { assocId: dAssoc }));
  window.addEventListener("beforeunload", e => { if (mt && mt.dirty) e.preventDefault(); });

  function redraw(){ drawProfile(); drawMeetings(); drawDeadlines(); }
  function connect({ db: d, user }){
    unsubs.forEach(u => u()); unsubs = [];
    db = d; me = user ? user.email : ""; docs = []; meets = []; can = false; mt = null;
    if (!db){ redraw(); return; }
    db.collection("allowed").doc(me).get().then(s => {
      const p = s.exists ? s.data() : {}; can = p.role === "admin" || !p.sections || p.sections.includes("governance");
      if (!can){ redraw(); emit(); return; }
      unsubs.push(db.collection("assocDocs").onSnapshot(s => { docs = s.docs.map(x => ({ id: x.id, ...x.data() })); redraw(); emit(); }, e => console.warn("assocDocs", e.code || e)));
      unsubs.push(db.collection("meetings").onSnapshot(s => { meets = s.docs.map(x => ({ id: x.id, ...x.data() }));
        if (mt && mt.id && !mt.dirty){ const m = meets.find(x => x.id === mt.id); if (m) mt.data = JSON.parse(JSON.stringify(m)); else mt = null; }
        redraw(); emit(); }, e => console.warn("meetings", e.code || e)));
      redraw();
    }).catch(() => {});
    redraw();
  }
  window.Orgs = { deadlines, docs: () => docs.slice(), meetings: () => meets.slice(), openProfile, openMeeting, profileId: () => pid, redraw: drawProfile };
  window.addEventListener("app:db", e => connect(e.detail));
  window.addEventListener("app:assocs", () => { drawProfile(); drawDeadlines(); emit(); });
  window.addEventListener("app:tasks", () => { clearTimeout(redraw._t); redraw._t = setTimeout(() => { drawProfile(); if (!mt || !mt.dirty) drawMeetings(); drawDeadlines(); }, 80); });
  window.addEventListener("app:view", e => {
    if (e.detail === "orgs/meetings") setTimeout(drawMeetings, 20);
    if (e.detail === "orgs/deadlines") setTimeout(drawDeadlines, 20);
    if (e.detail === "orgs/associations") setTimeout(drawProfile, 20);
  });
  if (window.appDb) connect({ db: window.appDb, user: window.appUser });
})();
