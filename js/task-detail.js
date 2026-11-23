/* The task panel: opens beside the page for a new task or an existing one.
   Existing tasks save each change as it is made (and log it); a new task is created with «إنشاء المهمة».
   Holds the description (Markdown), status, priority, people, project, tags, dates, time, progress, recurrence,
   dependencies, checklist, subtasks, attachments (links and small files), comments and the activity log. */
(() => {
  const $ = id => document.getElementById(id);
  const C = window.TaskCore, T = () => window.Tasks;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const FILE_MAX = 700 * 1024;
  let id = null, draft = null, unsubs = [], comments = [], activity = [], saveT = null, lastFocus = null;

  /* ---------- Markdown, a small safe subset ---------- */
  function md(src){
    const inline = s => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*]+)\*/g, "$1<i>$2</i>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    const out = []; let list = null;
    (src || "").split("\n").forEach(line => {
      const ul = line.match(/^\s*[-*•]\s+(.*)/), ol = line.match(/^\s*\d+[.)]\s+(.*)/), h = line.match(/^(#{1,3})\s+(.*)/);
      const kind = ul ? "ul" : ol ? "ol" : null;
      if (list && list !== kind){ out.push(`</${list}>`); list = null; }
      if (kind){ if (!list){ out.push(`<${kind}>`); list = kind; } out.push(`<li>${inline((ul || ol)[1])}</li>`); return; }
      if (h){ out.push(`<h4>${inline(h[2])}</h4>`); return; }
      out.push(line.trim() ? `<p>${inline(line)}</p>` : "");
    });
    if (list) out.push(`</${list}>`);
    const html = out.join("");
    return window.DOMPurify ? DOMPurify.sanitize(html, { ADD_ATTR: ["target"] }) : html;
  }

  /* ---------- the panel ---------- */
  const panel = document.createElement("aside"); panel.className = "td"; panel.id = "tdPanel"; panel.hidden = true;
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.setAttribute("aria-labelledby", "tdTitle");
  const scrim = document.createElement("div"); scrim.className = "td-scrim"; scrim.hidden = true;
  const OPT = (list) => list.map(x => `<option value="${x.id}">${x.label}</option>`).join("");
  const DAYS = ["ح", "ن", "ث", "ر", "خ", "ج", "س"], DAYN = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  panel.innerHTML = `
  <header class="td-h">
    <select class="select td-status" id="tdStatus" aria-label="الحالة">${OPT(C.STATUSES)}</select>
    <span class="td-saved" id="tdSaved" aria-live="polite"></span>
    <button class="btn small ghost danger-text" type="button" id="tdDelete">حذف</button>
    <button class="td-x" type="button" id="tdClose" aria-label="إغلاق">✕</button>
  </header>
  <div class="td-body">
    <p class="td-parent" id="tdParent" hidden></p>
    <textarea class="td-title" id="tdTitle" rows="1" maxlength="300" placeholder="عنوان المهمة، أو اكتب بكلامك: ذكرني الخميس 9 الصبح بإعداد محضر اجتماع" aria-label="عنوان المهمة"></textarea>
    <p class="smart-hint" id="tdSmart" hidden></p>
    <p class="td-block" id="tdBlocked" hidden></p>
    <div class="td-prog"><span id="tdRing"></span><div class="td-pctl"><div class="td-pmode"><label class="s-check"><input type="checkbox" id="tdManual"> نسبة يدوية</label><span class="muted-text" id="tdAuto">تُحسب من قائمة التحقق والمهام الفرعية</span></div><input type="range" id="tdPct" min="0" max="100" step="5" aria-label="نسبة الإنجاز" hidden></div></div>
    <div class="td-grid">
      <label>الأولوية<select class="select" id="tdPriority">${OPT(C.PRIORITIES)}</select></label>
      <label>المسؤول<select class="select" id="tdAssignee"></select></label>
      <label>المشروع<select class="select" id="tdProject"></select></label>
      <label>تاريخ البدء<input class="input" type="date" id="tdStart"></label>
      <label>الاستحقاق<span class="td-when"><input class="input" type="date" id="tdDue"><input class="input" type="time" id="tdTime" aria-label="الوقت"></span></label>
      <label>التكرار<select class="select" id="tdRec"><option value="">بدون</option><option value="daily">يومية</option><option value="weekly">أسبوعية</option><option value="monthly">شهرية</option></select></label>
      <div class="td-recx" id="tdRecX" hidden><label>كل<input class="input" type="number" id="tdRecN" min="1" max="99" value="1"></label><span class="td-recu" id="tdRecU"></span><span class="td-days" id="tdDays">${DAYS.map((d, i) => `<label title="${DAYN[i]}"><input type="checkbox" value="${i}"><span>${d}</span></label>`).join("")}</span></div>
      <label>الوقت المقدّر<input class="input" id="tdEst" placeholder="مثل 1.5 أو 90د" inputmode="decimal"></label>
      <label>الوقت الفعلي<input class="input" id="tdSpent" placeholder="مثل 45د" inputmode="decimal"></label>
      <label class="td-wide">الوسوم<span class="td-tags" id="tdTags"><input class="td-tagin" id="tdTagIn" placeholder="اكتب وسماً واضغط Enter" list="tdTagList"></span><datalist id="tdTagList"></datalist></label>
      <label class="td-wide">مرتبطة بـ<select class="select" id="tdLink"></select></label>
    </div>
    <section class="td-sec"><div class="td-sh"><h3>الوصف</h3><button class="linkbtn" type="button" id="tdMdT">معاينة</button></div>
      <textarea class="input td-desc" id="tdDesc" rows="4" placeholder="تفاصيل المهمة. يدعم **غامق** و*مائل* والقوائم بـ - والروابط"></textarea><div class="td-md" id="tdMd" hidden></div></section>
    <section class="td-sec"><div class="td-sh"><h3>قائمة التحقق</h3><span class="tk-count" id="tdCkN"></span></div><ul class="td-ck" id="tdCk"></ul>
      <form class="td-addrow" id="tdCkAdd"><input class="input" placeholder="بند جديد" aria-label="بند جديد" maxlength="200"><button class="btn small" type="submit">إضافة</button></form></section>
    <section class="td-sec" id="tdSubSec"><div class="td-sh"><h3>المهام الفرعية</h3><span class="tk-count" id="tdSubN"></span></div><ul class="td-sub" id="tdSub"></ul>
      <form class="td-addrow" id="tdSubAdd"><input class="input" placeholder="مهمة فرعية جديدة" aria-label="مهمة فرعية جديدة" maxlength="300"><button class="btn small" type="submit">إضافة</button></form></section>
    <section class="td-sec"><div class="td-sh"><h3>الاعتماديات</h3><span class="muted-text">لا تبدأ هذه المهمة حتى تكتمل:</span></div><ul class="td-deps" id="tdDeps"></ul>
      <div class="td-addrow"><input class="input" id="tdDepIn" list="tdDepList" placeholder="ابحث عن مهمة" aria-label="إضافة اعتمادية"><datalist id="tdDepList"></datalist><button class="btn small" type="button" id="tdDepAdd">إضافة</button></div></section>
    <section class="td-sec"><div class="td-sh"><h3>المرفقات</h3></div><ul class="td-files" id="tdFiles"></ul>
      <div class="td-addrow"><input class="input" id="tdUrl" dir="ltr" placeholder="https://… رابط ملف أو مستند"><button class="btn small" type="button" id="tdUrlAdd">إضافة رابط</button><label class="btn small">ملف<input type="file" id="tdFile" hidden></label></div>
      <p class="muted-text td-note" id="tdFileNote">الملفات حتى 700 كيلوبايت. للأكبر أضف رابطاً من Google Drive أو OneDrive</p></section>
    <section class="td-sec" id="tdTalk"><div class="td-sh"><h3>التعليقات</h3></div><ul class="td-cm" id="tdCm"></ul>
      <form class="td-addrow" id="tdCmAdd"><textarea class="input" rows="2" placeholder="اكتب تعليقاً" aria-label="تعليق" maxlength="4000"></textarea><button class="btn small primary" type="submit">إرسال</button></form></section>
    <details class="td-sec td-log" id="tdLogBox"><summary>سجل النشاط <span class="tk-count" id="tdLogN"></span></summary><ol class="td-act" id="tdAct"></ol></details>
  </div>
  <footer class="td-f" id="tdNewBar" hidden><button class="btn primary" type="button" id="tdCreate">إنشاء المهمة</button><button class="btn" type="button" id="tdCancel">إلغاء</button></footer>`;
  document.body.append(scrim, panel);

  const isNew = () => !id;
  const cur = () => id ? T().byId.get(id) : draft;
  const fmtAt = iso => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

  /* ---------- open / close ---------- */
  function open(taskId, preset = {}){
    if (!T() || !T().db){ UI.alert("سجّل الدخول لإضافة المهام وتعديلها"); return; }
    lastFocus = document.activeElement;
    stopWatch(); id = taskId || null;
    draft = id ? null : C.normalize({ title: "", status: "todo", priority: "medium", ...preset });
    if (id && !T().byId.get(id)) return;
    panel.hidden = scrim.hidden = false; requestAnimationFrame(() => panel.classList.add("in"));
    $("tdNewBar").hidden = !isNew(); $("tdDelete").hidden = isNew();
    ["tdSubSec", "tdTalk", "tdLogBox"].forEach(x => { $(x).hidden = isNew(); });
    $("tdMd").hidden = true; $("tdDesc").hidden = false; $("tdMdT").textContent = "معاينة"; $("tdSmart").hidden = true; $("tdSaved").textContent = "";
    fill(); if (id) watch();
    setTimeout(() => { $("tdTitle").focus(); grow($("tdTitle")); }, 60);
  }
  function close(){
    flush(); stopWatch();
    panel.classList.remove("in"); setTimeout(() => { panel.hidden = scrim.hidden = true; }, 180);
    id = null; draft = null; if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function watch(){
    const ref = T().db.collection("tasks").doc(id);
    unsubs.push(ref.collection("comments").onSnapshot(s => { comments = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.at).localeCompare(String(b.at))); drawComments(); }, () => {}));
    unsubs.push(ref.collection("activity").onSnapshot(s => { activity = s.docs.map(d => d.data()).sort((a, b) => String(b.at).localeCompare(String(a.at))); drawActivity(); }, () => {}));
  }
  function stopWatch(){ unsubs.forEach(u => u && u()); unsubs = []; comments = []; activity = []; }

  /* ---------- filling the form from the task ---------- */
  function fill(){
    const t = cur(); if (!t) return;
    const editable = isNew() || T().canEdit(t);
    panel.classList.toggle("ro", !editable);
    $("tdStatus").value = t.status; $("tdStatus").style.setProperty("--sc", C.ST[t.status].color);
    if (document.activeElement !== $("tdTitle")){ $("tdTitle").value = t.title; requestAnimationFrame(() => grow($("tdTitle"))); }
    $("tdPriority").value = t.priority; $("tdPriority").style.setProperty("--sc", C.PR[t.priority].color);
    const pe = $("tdAssignee"); pe.innerHTML = `<option value="">بدون</option>`;
    const ppl = [...T().people]; if (!ppl.some(p => p.email === T().me)) ppl.unshift({ email: T().me, name: T().myName });
    if (t.assignee && !ppl.some(p => p.email === t.assignee)) ppl.push({ email: t.assignee, name: t.assignee });
    ppl.forEach(p => pe.append(new Option(p.email === T().me ? `${p.name || p.email} (أنا)` : p.name || p.email, p.email))); pe.value = t.assignee || "";
    const pj = $("tdProject"); pj.innerHTML = `<option value="">بدون مشروع</option>`; T().projects.forEach(p => pj.append(new Option(p.name, p.id))); pj.append(new Option("+ مشروع جديد…", "__new")); pj.value = t.projectId || "";
    $("tdStart").value = t.startDate || ""; $("tdDue").value = t.due || ""; $("tdTime").value = t.time || "";
    $("tdRec").value = t.recurrence ? t.recurrence.freq : ""; $("tdRecX").hidden = !t.recurrence;
    if (t.recurrence){ $("tdRecN").value = t.recurrence.interval; $("tdRecU").textContent = { daily: "يوم", weekly: "أسبوع", monthly: "شهر" }[t.recurrence.freq];
      $("tdDays").hidden = t.recurrence.freq !== "weekly"; $("tdDays").querySelectorAll("input").forEach(c => { c.checked = (t.recurrence.days || []).includes(+c.value); }); }
    if (document.activeElement !== $("tdEst")) $("tdEst").value = t.estimate ? C.fmtMinutes(t.estimate) : "";
    if (document.activeElement !== $("tdSpent")) $("tdSpent").value = t.spent ? C.fmtMinutes(t.spent) : "";
    if (document.activeElement !== $("tdDesc")) $("tdDesc").value = t.description;
    if (!$("tdMd").hidden) $("tdMd").innerHTML = md(t.description) || '<p class="muted-text">لا يوجد وصف</p>';
    const lk = $("tdLink"); lk.innerHTML = `<option value="">لا شيء</option>`;
    const gp = document.createElement("optgroup"); gp.label = "لائحة أو سياسة"; T().policies.forEach(p => gp.append(new Option(p.title, "policy:" + p.id)));
    const gl = document.createElement("optgroup"); gl.label = "خطاب صادر";
    T().letters.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50).forEach(l => gl.append(new Option(`${l.ref} · ${l.title}`, "letter:" + l.id)));
    if (gp.children.length) lk.append(gp); if (gl.children.length) lk.append(gl);
    const lv = t.link ? `${t.link.type}:${t.link.id}` : ""; lk.value = lv; if (lv && lk.value !== lv){ lk.append(new Option(t.link.label, lv)); lk.value = lv; }
    // parent, blockers, progress
    const par = t.parentId && T().byId.get(t.parentId);
    $("tdParent").hidden = !par; if (par){ $("tdParent").innerHTML = `مهمة فرعية من <button class="linkbtn" type="button"></button>`; const b = $("tdParent").querySelector("button"); b.textContent = par.title; b.onclick = () => open(par.id); }
    const bl = C.blockers(t, T().byId); $("tdBlocked").hidden = !bl.length; $("tdBlocked").textContent = bl.length ? `تنتظر اكتمال: ${bl.map(b => b.title).join("، ")}` : "";
    drawProgress(); drawTags(); drawChecklist(); drawSubs(); drawDeps(); drawFiles();
    $("tdTagList").innerHTML = ""; [...new Set(T().list.flatMap(x => x.tags))].sort().forEach(x => $("tdTagList").append(new Option(x)));
    panel.querySelectorAll("input,select,textarea,button").forEach(el => { if (!el.closest(".td-h") && !el.closest("#tdTalk") && el.id !== "tdCancel") el.disabled = !editable; });
  }
  function drawProgress(){
    const t = cur(), kids = id ? T().childrenOf(id) : [], p = C.progress(t, kids);
    $("tdRing").innerHTML = T().ring(p, C.progressTone(p, C.dueState(t)), 56);
    $("tdManual").checked = t.progressMode === "manual"; $("tdPct").hidden = t.progressMode !== "manual"; $("tdAuto").hidden = t.progressMode === "manual"; $("tdPct").value = t.progressManual;
  }
  function drawTags(){
    const box = $("tdTags"); box.querySelectorAll(".td-tag").forEach(x => x.remove());
    cur().tags.forEach(tag => {
      const s = document.createElement("span"); s.className = "td-tag"; s.innerHTML = `<span></span><button type="button" aria-label="إزالة الوسم">×</button>`;
      s.querySelector("span").textContent = "#" + tag; s.querySelector("button").addEventListener("click", () => set({ tags: cur().tags.filter(x => x !== tag) }));
      box.insertBefore(s, $("tdTagIn"));
    });
  }
  function drawChecklist(){
    const t = cur(), ul = $("tdCk"); ul.innerHTML = "";
    $("tdCkN").textContent = t.checklist.length ? `${t.checklist.filter(c => c.done).length}/${t.checklist.length}` : "";
    t.checklist.forEach((c, i) => {
      const li = document.createElement("li"); li.className = c.done ? "done" : "";
      li.innerHTML = `<input type="checkbox" aria-label="تم"><input class="td-ckt" aria-label="نص البند" maxlength="200"><span class="td-mv"><button type="button" aria-label="أعلى">▲</button><button type="button" aria-label="أسفل">▼</button></span><button type="button" class="td-del" aria-label="حذف البند">×</button>`;
      const [cb, tx] = li.querySelectorAll("input"); cb.checked = c.done; tx.value = c.text;
      const upd = fn => { const list = cur().checklist.map(x => ({ ...x })); fn(list); set({ checklist: list }); };
      cb.addEventListener("change", () => upd(l => { l[i].done = cb.checked; }));
      tx.addEventListener("change", () => upd(l => { l[i].text = tx.value.trim() || l[i].text; }));
      const [u, d] = li.querySelectorAll(".td-mv button"); u.disabled = i === 0; d.disabled = i === t.checklist.length - 1;
      u.addEventListener("click", () => upd(l => { [l[i - 1], l[i]] = [l[i], l[i - 1]]; }));
      d.addEventListener("click", () => upd(l => { [l[i + 1], l[i]] = [l[i], l[i + 1]]; }));
      li.querySelector(".td-del").addEventListener("click", () => upd(l => { l.splice(i, 1); }));
      ul.append(li);
    });
  }
  function drawSubs(){
    const ul = $("tdSub"); ul.innerHTML = ""; if (!id) return;
    const kids = T().childrenOf(id).slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    $("tdSubN").textContent = kids.length ? `${kids.filter(k => k.status === "done").length}/${kids.length}` : "";
    kids.forEach(k => {
      const li = document.createElement("li"); li.className = k.status === "done" ? "done" : "";
      li.innerHTML = `<input type="checkbox" aria-label="مكتملة"><button class="linkbtn td-subt" type="button"></button><span class="td-subm"></span>`;
      const cb = li.querySelector("input"); cb.checked = k.status === "done"; cb.disabled = !T().canEdit(k);
      cb.addEventListener("change", () => T().update(k.id, { status: cb.checked ? "done" : "todo" }));
      li.querySelector(".td-subt").textContent = k.title; li.querySelector(".td-subt").addEventListener("click", () => { flush(); open(k.id); });
      li.querySelector(".td-subm").textContent = [k.assignee ? T().personName(k.assignee) : "", k.due ? T().dueLabel(k.due) : ""].filter(Boolean).join(" · ");
      ul.append(li);
    });
  }
  function drawDeps(){
    const t = cur(), ul = $("tdDeps"); ul.innerHTML = "";
    t.dependsOn.forEach(d => {
      const x = T().byId.get(d); const li = document.createElement("li");
      li.innerHTML = `<span class="td-dst"></span><button class="linkbtn" type="button"></button><button type="button" class="td-del" aria-label="إزالة">×</button>`;
      li.querySelector(".td-dst").textContent = x ? C.ST[x.status].label : "محذوفة"; if (x) li.querySelector(".td-dst").style.color = C.ST[x.status].color;
      const b = li.querySelector(".linkbtn"); b.textContent = x ? x.title : d; if (x) b.addEventListener("click", () => { flush(); open(x.id); });
      li.querySelector(".td-del").addEventListener("click", () => set({ dependsOn: cur().dependsOn.filter(y => y !== d) }));
      ul.append(li);
    });
    const dl = $("tdDepList"); dl.innerHTML = "";
    T().list.filter(x => x.id !== id && !t.dependsOn.includes(x.id) && !C.CLOSED.has(x.status)).slice(0, 300).forEach(x => dl.append(new Option(x.title)));
  }
  function drawFiles(){
    const ul = $("tdFiles"); ul.innerHTML = "";
    $("tdFileNote").textContent = window.Cloud && Cloud.ready() ? "الملفات حتى 10 ميجابايت، وتُحفظ في Cloudinary." : "الملفات حتى 700 كيلوبايت. للأكبر أضف رابطاً من Google Drive أو OneDrive";
    cur().attachments.forEach(a => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="td-fic">${a.kind === "link" ? "🔗" : "📄"}</span><button class="linkbtn" type="button"></button><span class="muted-text"></span><button type="button" class="td-del" aria-label="إزالة المرفق">×</button>`;
      const b = li.querySelector(".linkbtn"); b.textContent = a.name || a.url;
      b.addEventListener("click", () => openFile(a));
      li.querySelector(".muted-text").textContent = a.size ? `${Math.max(1, Math.round(a.size / 1024))} ك.ب` : "";
      li.querySelector(".td-del").addEventListener("click", async () => {
        if (!(await UI.confirm(`إزالة «${a.name || a.url}»؟`, { ok: "إزالة", danger: true }))) return;
        set({ attachments: cur().attachments.filter(x => x.id !== a.id) });
        if (a.kind === "file" && a.fileId) T().db.collection("taskFiles").doc(a.fileId).delete().catch(() => {});
      });
      ul.append(li);
    });
  }
  async function openFile(a){
    if (a.kind === "link" || a.kind === "cloud"){ window.open(a.url, "_blank", "noopener"); return; }
    try {
      const d = await T().db.collection("taskFiles").doc(a.fileId).get(); if (!d.exists) return UI.toast("الملف غير موجود", "err");
      const f = d.data(), bin = atob(f.data), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([u8], { type: f.type || "application/octet-stream" }));
      const link = document.createElement("a"); link.href = url; link.download = f.name || "ملف"; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e){ console.error(e); UI.toast("تعذّر فتح الملف", "err"); }
  }
  function drawComments(){
    const ul = $("tdCm"); ul.innerHTML = "";
    if (!comments.length){ ul.innerHTML = `<li class="muted-text td-none">لا تعليقات بعد</li>`; return; }
    comments.forEach(c => {
      const li = document.createElement("li");
      li.innerHTML = `<div class="td-cmh"><b></b><span></span>${c.by === T().me || T().admin ? '<button type="button" class="td-del" aria-label="حذف التعليق">×</button>' : ""}</div><div class="td-cmb"></div>`;
      li.querySelector("b").textContent = c.name || c.by; li.querySelector(".td-cmh span").textContent = fmtAt(c.at); li.querySelector(".td-cmb").innerHTML = md(c.text);
      const del = li.querySelector(".td-del"); if (del) del.addEventListener("click", async () => { if (await UI.confirm("حذف التعليق؟", { ok: "حذف", danger: true })) T().db.collection("tasks").doc(id).collection("comments").doc(c.id).delete().catch(() => UI.toast("تعذّر الحذف", "err")); });
      ul.append(li);
    });
  }
  function drawActivity(){
    const ol = $("tdAct"); ol.innerHTML = ""; $("tdLogN").textContent = activity.length || "";
    activity.forEach(a => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="td-aw"></span><span class="td-at"></span>`;
      li.querySelector(".td-aw").textContent = fmtAt(a.at);
      li.querySelector(".td-at").textContent = a.action === "change" ? `${a.name || a.by} غيّر ${a.label}: ${a.from} ← ${a.to}` : `${a.name || a.by} ${a.text || a.action}`;
      ol.append(li);
    });
  }

  /* ---------- changes ---------- */
  // a new task keeps changes in the draft; an existing one saves them (text fields after a short pause)
  let pending = {};
  function set(patch, delay = 0){
    if (isNew()){ draft = C.normalize({ ...draft, ...patch }); fill(); return; }
    Object.assign(pending, patch);
    clearTimeout(saveT);
    if (delay){ $("tdSaved").textContent = "…"; saveT = setTimeout(flush, delay); } else flush();
  }
  async function flush(){
    clearTimeout(saveT); if (!id || !Object.keys(pending).length) return;
    const p = pending; pending = {};
    $("tdSaved").textContent = "جارٍ الحفظ…";
    const ok = await T().update(id, p);
    $("tdSaved").textContent = ok ? "حُفظ" : ""; if (!ok) fill();
  }
  const on = (el, ev, fn) => $(el).addEventListener(ev, fn);
  on("tdStatus", "change", () => set({ status: $("tdStatus").value }));
  on("tdPriority", "change", () => set({ priority: $("tdPriority").value }));
  on("tdAssignee", "change", () => set({ assignee: $("tdAssignee").value || null }));
  on("tdProject", "change", async () => {
    if ($("tdProject").value !== "__new") return set({ projectId: $("tdProject").value || null });
    const v = await UI.prompt("اسم المشروع أو التصنيف", { title: "مشروع جديد", ok: "إنشاء", placeholder: "مثل: برنامج مسارات" });
    if (!v || !v.note){ $("tdProject").value = cur().projectId || ""; return; }
    const COLORS = ["#7c3aed", "#0ea5e9", "#16a34a", "#ea580c", "#db2777", "#0d9488", "#ca8a04", "#4f46e5"];
    try { const ref = await T().db.collection("taskProjects").add({ name: v.note.slice(0, 80), color: COLORS[T().projects.length % COLORS.length], owner: T().me, createdAt: new Date().toISOString() }); set({ projectId: ref.id }); }
    catch (e){ console.error(e); UI.toast("تعذّر إنشاء المشروع", "err"); }
  });
  on("tdTitle", "input", () => { grow($("tdTitle")); set({ title: $("tdTitle").value }, 700); hint(); });
  on("tdDesc", "input", () => set({ description: $("tdDesc").value }, 900));
  on("tdMdT", "click", () => { const showing = !$("tdMd").hidden; $("tdMd").hidden = showing; $("tdDesc").hidden = !showing; $("tdMdT").textContent = showing ? "معاينة" : "تحرير"; if (!showing) $("tdMd").innerHTML = md($("tdDesc").value) || '<p class="muted-text">لا يوجد وصف</p>'; });
  on("tdStart", "change", () => set({ startDate: $("tdStart").value || null }));
  on("tdDue", "change", () => set({ due: $("tdDue").value || null, ...($("tdDue").value ? {} : { time: null }), remindedFor: null }));
  on("tdTime", "change", () => { if ($("tdTime").value && !$("tdDue").value) $("tdDue").value = C.ymd(new Date()); set({ due: $("tdDue").value || null, time: $("tdTime").value || null, remindedFor: null }); if ($("tdTime").value && window.Reminders) Reminders.ask(); });
  const recNow = () => { const f = $("tdRec").value; if (!f) return null; return { freq: f, interval: Math.max(1, +$("tdRecN").value || 1), days: f === "weekly" ? [...$("tdDays").querySelectorAll("input:checked")].map(c => +c.value) : [] }; };
  on("tdRec", "change", () => set({ recurrence: recNow() }));
  on("tdRecN", "change", () => set({ recurrence: recNow() }));
  $("tdDays").addEventListener("change", () => set({ recurrence: recNow() }));
  const timeField = (el, k) => on(el, "change", () => { const v = C.parseMinutes($(el).value); if (Number.isNaN(v)){ UI.toast("اكتب الوقت مثل 1.5 أو 1:30 أو 45د", "err"); return; } set({ [k]: v }); });
  timeField("tdEst", "estimate"); timeField("tdSpent", "spent");
  on("tdManual", "change", () => set({ progressMode: $("tdManual").checked ? "manual" : "auto", progressManual: $("tdManual").checked ? C.progress(cur(), id ? T().childrenOf(id) : []) : cur().progressManual }));
  on("tdPct", "input", () => set({ progressManual: +$("tdPct").value }, 400));
  on("tdLink", "change", () => {
    const lv = $("tdLink").value; if (!lv) return set({ link: null });
    const type = lv.slice(0, lv.indexOf(":")), lid = lv.slice(lv.indexOf(":") + 1), label = $("tdLink").selectedOptions[0].textContent;
    set({ link: { type, id: lid, label: type === "letter" ? label.split(" · ").slice(0, 2).join(" · ") : label } });
  });
  on("tdTagIn", "keydown", e => {
    if (e.key !== "Enter" && e.key !== ",") return; e.preventDefault();
    const v = $("tdTagIn").value.trim().replace(/^#/, "").replace(/\s+/g, "_").slice(0, 30); $("tdTagIn").value = "";
    if (v && !cur().tags.includes(v)) set({ tags: [...cur().tags, v] });
  });
  on("tdCkAdd", "submit", e => { e.preventDefault(); const inp = e.target.querySelector("input"), v = inp.value.trim(); if (!v) return; inp.value = ""; set({ checklist: [...cur().checklist, { id: C.uid(), text: v, done: false }] }); inp.focus(); });
  on("tdSubAdd", "submit", async e => {
    e.preventDefault(); const inp = e.target.querySelector("input"), v = inp.value.trim(); if (!v || !id) return; inp.value = "";
    const p = cur();
    try { await T().create({ title: v, parentId: id, projectId: p.projectId, assignee: p.assignee, status: "todo", priority: p.priority }, { logText: `أضاف مهمة فرعية لـ«${p.title}»` }); T().log(id, [{ action: "sub", text: `أضاف مهمة فرعية «${v}»` }]); }
    catch (err){ console.error(err); }
    inp.focus();
  });
  on("tdDepAdd", "click", () => {
    const v = $("tdDepIn").value.trim(); if (!v) return;
    const x = T().list.find(t => t.title === v && t.id !== id); if (!x) return UI.toast("اختر مهمة من القائمة", "err");
    if (id && C.makesCycle(id, x.id, T().byId)) return UI.toast("هذه المهمة تعتمد أصلاً على المهمة الحالية، فالربط يصنع حلقة", "err");
    $("tdDepIn").value = ""; set({ dependsOn: [...cur().dependsOn, x.id] });
  });
  on("tdUrlAdd", "click", () => {
    const u = $("tdUrl").value.trim(); if (!/^https?:\/\/\S+$/i.test(u)) return UI.toast("اكتب رابطاً يبدأ بـ https://", "err");
    let name = u; try { const x = new URL(u); name = decodeURIComponent(x.pathname.split("/").filter(Boolean).pop() || x.hostname); } catch {}
    $("tdUrl").value = ""; set({ attachments: [...cur().attachments, { id: C.uid(), kind: "link", url: u, name }] });
  });
  on("tdFile", "change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    // with Cloudinary set, the file goes there (up to 10 MB) and the task keeps its link
    if (window.Cloud && Cloud.ready()){
      if (isNew()) return UI.toast("أنشئ المهمة أولاً ثم أرفق الملفات", "err");
      const note = $("tdFileNote"), keep = note.textContent;
      try {
        const up = await Cloud.upload(f, { folder: "tasks", onProgress: p => { note.textContent = `جارٍ رفع «${f.name}»… ${p}%`; } });
        set({ attachments: [...cur().attachments, { id: C.uid(), kind: "cloud", url: up.url, name: f.name.slice(0, 200), size: up.size }] });
      } catch (err){ console.error(err); UI.alert(Cloud.errText(err)); }
      note.textContent = keep; return;
    }
    if (f.size > FILE_MAX) return UI.alert(`الملف ${Math.round(f.size / 1024)} ك.ب، والحد 700. ارفعه على Google Drive أو OneDrive وأضف رابطه.`);
    if (isNew()) return UI.toast("أنشئ المهمة أولاً ثم أرفق الملفات", "err");
    try {
      const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(f); });
      const ref = await T().db.collection("taskFiles").add({ taskId: id, name: f.name.slice(0, 200), type: f.type || "", size: f.size, data, owner: T().me, at: new Date().toISOString() });
      set({ attachments: [...cur().attachments, { id: C.uid(), kind: "file", fileId: ref.id, name: f.name.slice(0, 200), size: f.size }] });
    } catch (err){ console.error(err); UI.toast("تعذّر رفع الملف", "err"); }
  });
  on("tdCmAdd", "submit", async e => {
    e.preventDefault(); const ta = e.target.querySelector("textarea"), v = ta.value.trim(); if (!v || !id) return;
    ta.value = "";
    try { await T().db.collection("tasks").doc(id).collection("comments").add({ text: v.slice(0, 4000), by: T().me, name: T().myName, at: new Date().toISOString() }); }
    catch (err){ console.error(err); ta.value = v; UI.toast("تعذّر إرسال التعليق", "err"); }
  });
  on("tdDelete", "click", async () => {
    const t = cur(); if (!t) return; const n = T().childrenOf(t.id).length;
    if (!(await UI.confirm(`حذف «${t.title}»${n ? ` ومهامها الفرعية (${n})` : ""}؟`, { ok: "حذف", danger: true }))) return;
    const x = id; pending = {}; close(); T().remove(x);
  });
  on("tdCreate", "click", async () => {
    let d = { ...draft, title: $("tdTitle").value.trim(), description: $("tdDesc").value };
    // written in plain words: take the date, time, wording, tags and priority from the text
    if (window.SmartTask && !d.due && d.title){
      const r = await SmartTask.parse(d.title);
      if (r.date || r.time || (r.tags && r.tags.length) || r.priority !== "medium"){ d = { ...d, title: r.title || d.title, due: r.date || d.due, time: r.time || d.time, tags: [...new Set([...(d.tags || []), ...(r.tags || [])])], priority: r.priority && r.priority !== "normal" && r.priority !== "medium" ? r.priority : d.priority }; }
    }
    $("tdCreate").disabled = true;
    try {
      const newId = await T().create(d);
      if (d.time && window.Reminders) Reminders.ask();
      UI.toast(d.due && window.SmartTask ? `أُضيفت «${d.title}» · ${SmartTask.describe({ date: d.due, time: d.time })}` : "أُضيفت المهمة");
      id = newId; draft = null; close();
    } catch {} finally { $("tdCreate").disabled = false; }
  });
  on("tdCancel", "click", close); on("tdClose", "click", close); scrim.addEventListener("click", close);
  panel.addEventListener("keydown", e => {
    if (e.key === "Escape"){ e.preventDefault(); close(); }
    if (e.key === "Tab"){ // focus stays in the panel
      const f = [...panel.querySelectorAll("button,input,select,textarea,summary,[tabindex]")].filter(x => !x.disabled && x.offsetParent !== null);
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0){ e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1){ e.preventDefault(); f[0].focus(); }
    }
  });
  function grow(el){ if (!el.offsetParent) return; el.style.height = "auto"; el.style.height = Math.max(44, el.scrollHeight) + "px"; }
  let hintT = null;
  function hint(){
    if (!isNew() || !window.SmartTask) return;
    clearTimeout(hintT); hintT = setTimeout(() => {
      const v = $("tdTitle").value.trim(), r = v ? SmartTask.local(v) : null;
      const useful = r && (r.date || r.time || (r.tags && r.tags.length) || r.priority !== "medium");
      $("tdSmart").hidden = !useful; if (!useful) return;
      $("tdSmart").innerHTML = `<span class="sh-k">فهمت:</span> <b></b> <span class="sh-w"></span>`;
      $("tdSmart").querySelector("b").textContent = r.title;
      $("tdSmart").querySelector(".sh-w").textContent = [SmartTask.describe(r), ...(r.tags || []).map(x => "#" + x), r.priority !== "medium" ? C.PR[r.priority].label : ""].filter(Boolean).join(" · ");
    }, 200);
  }

  window.TaskDetail = { open, close, isOpen: () => !panel.hidden, refresh(){ if (!panel.hidden && (isNew() || T().byId.get(id))) fill(); else if (!panel.hidden && id && !T().byId.get(id)) close(); }, md };
})();
