/* إدارة المشاريع › الاستبيانات: build forms like Google Forms (sections, questions of many types, required answers),
   share a public link (form.html?id=…, answered without signing in), and read the answers (summary with charts,
   one response at a time, CSV for Excel). Firestore: forms/{id} and forms/{id}/responses/{rid}.
   Everyone with the «projects» section sees all forms and their answers; the owner or an admin edits and deletes. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const TYPES = [
    ["short", "إجابة قصيرة"], ["long", "فقرة"], ["radio", "اختيار من متعدد"], ["check", "مربعات اختيار"], ["select", "قائمة منسدلة"],
    ["scale", "مقياس خطي"], ["rating", "تقييم بالنجوم"], ["number", "رقم"], ["email", "بريد إلكتروني"], ["phone", "رقم جوال"],
    ["date", "تاريخ"], ["time", "وقت"], ["file", "رفع ملف"], ["text", "عنوان ووصف (بدون إجابة)"],
  ];
  const TN = Object.fromEntries(TYPES);
  const CHOICE = new Set(["radio", "check", "select"]);
  const newQ = (type = "radio") => ({ id: uid(), type, title: "", desc: "", required: false, options: CHOICE.has(type) ? ["الخيار 1"] : [], other: false, min: 1, max: 5, minLabel: "", maxLabel: "", stars: 5 });
  const newSection = () => ({ id: uid(), title: "", desc: "", questions: [newQ()] });
  const blank = () => ({ title: "استبيان بدون عنوان", description: "", active: false, sections: [{ id: uid(), title: "", desc: "", questions: [newQ()] }],
    settings: { confirm: "شكراً لك، تم استلام إجابتك.", oneResponse: false, showProgress: true, closeAt: "" }, color: "#7c3aed" });

  let db = null, me = "", myName = "", admin = false, canUse = false, forms = [], counts = {}, loaded = false, unsub = null;
  let cur = null, curId = null, tab = "q", saveT = 0, saving = false, dirty = false, view = "grid";
  let responses = [], unsubR = null, rIndex = 0;
  try { view = localStorage.getItem("app-forms-view") === "list" ? "list" : "grid"; } catch {}
  const canEdit = f => !!f && (admin || f.owner === me);
  const link = id => `${location.origin}${location.pathname.replace(/[^/]*$/, "")}form.html?id=${encodeURIComponent(id)}`;
  const day = iso => iso ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "";
  const allQ = f => (f.sections || []).flatMap(s => s.questions || []).filter(q => q.type !== "text");

  /* ---------- the list ---------- */
  function renderList(){
    const box = $("fmList"); if (!box) return;
    $("fmSignin").hidden = !!db; $("fmHome").hidden = !db || !!cur; $("fmEditor").hidden = !cur;
    if (!db || cur) return;
    document.querySelectorAll("[data-fmview]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.fmview === view)));
    box.className = "fm-list " + view;
    const q = ($("fmQ").value || "").trim(), st = $("fmFStatus").value;
    const list = forms.filter(f => (!q || (f.title || "").includes(q)) && (!st || (st === "on") === !!f.active)).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    $("fmEmpty").hidden = !loaded || list.length > 0;
    $("fmEmpty").textContent = forms.length ? "لا توجد استبيانات تطابق البحث" : "لا توجد استبيانات بعد. أنشئ أول استبيان.";
    box.innerHTML = "";
    list.forEach(f => {
      const el = document.createElement("article"); el.className = "fm-card";
      el.innerHTML = `<div class="fm-ch"><h3></h3><span class="fm-st ${f.active ? "on" : ""}">${f.active ? "فعّال" : "غير فعّال"}</span></div>
        <p class="fm-meta"></p>
        <div class="fm-stats"><div><b>${counts[f.id] ?? "…"}</b><span>ردود</span></div><div><b>${allQ(f).length}</b><span>أسئلة</span></div>
          <button type="button" class="fm-tog ${f.active ? "off" : "on"}" ${canEdit(f) ? "" : "disabled"}>${f.active ? "تعطيل الرابط" : "تفعيل الرابط"}</button></div>
        <div class="fm-acts"><button type="button" class="btn small" data-a="edit">تعديل</button><button type="button" class="btn small" data-a="results">النتائج</button>
          <button type="button" class="fm-ic" data-a="copy" title="نسخ الرابط" aria-label="نسخ الرابط"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg></button>
          <button type="button" class="fm-ic" data-a="dup" title="نسخ الاستبيان" aria-label="نسخ الاستبيان"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg></button>
          ${canEdit(f) ? `<button type="button" class="fm-ic danger" data-a="del" title="حذف" aria-label="حذف"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg></button>` : ""}</div>`;
      el.querySelector("h3").textContent = f.title || "بدون عنوان";
      el.querySelector(".fm-meta").textContent = `أُنشئ ${day(f.createdAt)} · ${f.ownerName || (f.owner || "").split("@")[0]}`;
      el.querySelector(".fm-tog").addEventListener("click", () => setActive(f, !f.active));
      el.querySelector(".fm-acts").addEventListener("click", e => {
        const a = e.target.closest("[data-a]"); if (!a) return;
        ({ edit: () => open(f.id, "q"), results: () => open(f.id, "r"), copy: () => copyLink(f), dup: () => duplicate(f), del: () => remove(f) })[a.dataset.a]();
      });
      box.append(el);
    });
  }
  async function loadCounts(){
    await Promise.all(forms.map(async f => { try { const s = await db.collection("forms").doc(f.id).collection("responses").get(); counts[f.id] = s.docs.length; } catch { counts[f.id] = 0; } }));
    renderList();
  }
  async function setActive(f, on){
    if (on && !allQ(f).length){ UI.alert("أضف سؤالاً واحداً على الأقل قبل تفعيل الرابط."); return; }
    try { await db.collection("forms").doc(f.id).update({ active: on, updatedAt: new Date().toISOString() }); if (cur && curId === f.id){ cur.active = on; paintBar(); } UI.toast(on ? "فُعّل الرابط، والاستبيان يستقبل الردود" : "عُطّل الرابط"); }
    catch (e){ console.error(e); UI.toast("تعذّر التغيير", "err"); }
  }
  async function copyLink(f){
    if (!f.active && !(await UI.confirm("الرابط غير مفعّل، ولن يستقبل ردوداً حتى تفعّله. نسخ الرابط مع ذلك؟", { ok: "نسخ" }))) return;
    try { await navigator.clipboard.writeText(link(f.id)); UI.toast("نُسخ رابط الاستبيان"); } catch { UI.alert(link(f.id), { title: "رابط الاستبيان" }); }
  }
  async function create(){
    if (!db) return;
    const now = new Date().toISOString(), data = { ...blank(), owner: me, ownerName: myName, createdAt: now, updatedAt: now, upload: cloudCfg(), brand: brand() };
    try { const ref = await db.collection("forms").add(data); forms.push({ id: ref.id, ...data }); counts[ref.id] = 0; open(ref.id, "q"); setTimeout(() => { const t = $("fmBody").querySelector('[data-p="title"]'); if (t){ t.focus(); t.select(); } }, 60); }
    catch (e){ console.error(e); UI.toast("تعذّر الإنشاء", "err"); }
  }
  async function duplicate(f){
    const now = new Date().toISOString(), copy = JSON.parse(JSON.stringify(f)); delete copy.id;
    Object.assign(copy, { title: (f.title || "استبيان") + " (نسخة)", active: false, owner: me, ownerName: myName, createdAt: now, updatedAt: now });
    try { await db.collection("forms").add(copy); UI.toast("نُسخ الاستبيان (بدون الردود)"); } catch (e){ console.error(e); UI.toast("تعذّر النسخ", "err"); }
  }
  async function remove(f){
    if (!(await UI.confirm(`حذف «${f.title}» وكل ردوده نهائياً؟`, { ok: "حذف", danger: true }))) return;
    try {
      const rs = await db.collection("forms").doc(f.id).collection("responses").get();
      for (let i = 0; i < rs.docs.length; i += 400){ const b = db.batch(); rs.docs.slice(i, i + 400).forEach(d => b.delete(d.ref)); await b.commit(); }
      await db.collection("forms").doc(f.id).delete(); if (curId === f.id) close(); UI.toast("حُذف الاستبيان");
    } catch (e){ console.error(e); UI.toast("تعذّر الحذف", "err"); }
  }
  const cloudCfg = () => window.Cloud && Cloud.config ? Cloud.config() : null;
  // the site's identity (name, logo, colours, font) is copied into the form, since the public page cannot read the settings
  const brand = () => { const st = window.siteSettings || {}; return { siteName: st.siteName || "", logo: st.logo || "", a1: st.a1 || "#7c3aed", a2: st.a2 || "#c026d3", font: st.font || "IBM Plex Sans Arabic" }; };

  /* ---------- the editor ---------- */
  function open(id, t = "q"){
    const f = forms.find(x => x.id === id); if (!f) return;
    cur = JSON.parse(JSON.stringify(f)); delete cur.id; curId = id; dirty = false;
    cur.settings = { ...blank().settings, ...(cur.settings || {}) };
    renderList(); setTab(t); paintBar(); watchResponses(); window.scrollTo(0, 0);
  }
  function close(){ if (dirty) save(); if (unsubR){ unsubR(); unsubR = null; } cur = null; curId = null; responses = []; renderList(); }
  function paintBar(){
    $("fmTitle").textContent = cur.title || "بدون عنوان";
    $("fmActive").checked = !!cur.active; $("fmActive").disabled = !canEdit(cur);
    $("fmActiveL").textContent = cur.active ? "يستقبل الردود" : "لا يستقبل الردود";
    $("fmRN").textContent = responses.length;
    $("fmRO").hidden = canEdit(cur);
  }
  function setTab(t){
    tab = t;
    document.querySelectorAll("[data-fmtab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.fmtab === t)));
    $("fmBody").hidden = t !== "q"; $("fmResults").hidden = t !== "r"; $("fmSettings").hidden = t !== "s"; $("fmLook").hidden = t !== "a";
    if (t === "q") renderBuilder(); if (t === "r") renderResults(); if (t === "s") renderSettings(); if (t === "a") renderLook();
  }
  document.querySelectorAll("[data-fmtab]").forEach(b => b.addEventListener("click", () => setTab(b.dataset.fmtab)));

  function qHtml(q, si, qi, n){
    const p = `sections.${si}.questions.${qi}`;
    const typeSel = `<select class="select fm-type" data-type="${p}">${TYPES.map(([k, l]) => `<option value="${k}"${k === q.type ? " selected" : ""}>${l}</option>`).join("")}</select>`;
    let body = "";
    if (CHOICE.has(q.type)){
      const mark = q.type === "radio" ? "fm-o-r" : q.type === "check" ? "fm-o-c" : "fm-o-n";
      body = `<div class="fm-opts">${q.options.map((o, oi) => `<div class="fm-opt"><span class="${mark}">${q.type === "select" ? oi + 1 + "." : ""}</span><input class="fm-line" data-p="${p}.options.${oi}" value="${esc(o)}" placeholder="الخيار ${oi + 1}"><button type="button" class="fm-x" data-delopt="${p}.${oi}" aria-label="حذف الخيار">×</button></div>`).join("")}
        ${q.other ? `<div class="fm-opt"><span class="${mark}"></span><span class="fm-other">أخرى…</span><button type="button" class="fm-x" data-other="${p}" aria-label="إزالة أخرى">×</button></div>` : ""}
        <div class="fm-opt add"><span class="${mark}"></span><button type="button" class="linkbtn" data-addopt="${p}">إضافة خيار</button>${q.type !== "select" && !q.other ? ` أو <button type="button" class="linkbtn" data-other="${p}">إضافة «أخرى»</button>` : ""}</div></div>`;
    } else if (q.type === "scale"){
      body = `<div class="fm-scale"><select class="select" data-num="${p}.min">${[0, 1].map(v => `<option${v === +q.min ? " selected" : ""}>${v}</option>`).join("")}</select><span>إلى</span><select class="select" data-num="${p}.max">${[2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => `<option${v === +q.max ? " selected" : ""}>${v}</option>`).join("")}</select></div>
        <div class="fm-scl"><label>${esc(q.min)} <input class="fm-line" data-p="${p}.minLabel" value="${esc(q.minLabel)}" placeholder="تسمية (اختياري)"></label><label>${esc(q.max)} <input class="fm-line" data-p="${p}.maxLabel" value="${esc(q.maxLabel)}" placeholder="تسمية (اختياري)"></label></div>`;
    } else if (q.type === "rating"){
      body = `<div class="fm-scale"><span>عدد النجوم</span><select class="select" data-num="${p}.stars">${[3, 4, 5, 7, 10].map(v => `<option${v === +q.stars ? " selected" : ""}>${v}</option>`).join("")}</select><span class="fm-stars">${"★".repeat(+q.stars || 5)}</span></div>`;
    } else if (q.type !== "text"){
      const ph = { short: "نص الإجابة القصيرة", long: "نص الإجابة الطويلة", number: "رقم", email: "name@example.com", phone: "05xxxxxxxx", date: "يوم / شهر / سنة", time: "ساعة : دقيقة", file: "يرفع المجيب ملفاً (حتى 10 ميجابايت)" }[q.type];
      body = `<p class="fm-fake">${esc(ph)}</p>${q.type === "file" && !cloudCfg() ? '<p class="fm-warn">سؤال رفع الملف يحتاج ربط Cloudinary (التمكين التقني › الربط).</p>' : ""}`;
    }
    return `<div class="fm-q${q.type === "text" ? " fm-txt" : ""}" data-q="${p}">
      <div class="fm-qh"><span class="fm-qn">${q.type === "text" ? "" : n}</span><input class="fm-qt" data-p="${p}.title" value="${esc(q.title)}" placeholder="${q.type === "text" ? "عنوان" : "السؤال"}">${typeSel}</div>
      <input class="fm-line fm-qd" data-p="${p}.desc" value="${esc(q.desc)}" placeholder="وصف (اختياري)">
      ${body}
      <div class="fm-qf"><button type="button" class="fm-ic" data-mv="${p}.-1" title="تحريك للأعلى" aria-label="تحريك للأعلى">↑</button><button type="button" class="fm-ic" data-mv="${p}.1" title="تحريك للأسفل" aria-label="تحريك للأسفل">↓</button>
        <button type="button" class="fm-ic" data-dupq="${p}" title="تكرار" aria-label="تكرار السؤال"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg></button>
        <button type="button" class="fm-ic danger" data-delq="${p}" title="حذف" aria-label="حذف السؤال"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg></button>
        ${q.type === "text" ? "" : `<span class="fm-sep"></span><label class="fm-req"><span>إجباري</span><input type="checkbox" role="switch" data-req="${p}"${q.required ? " checked" : ""}></label>`}</div></div>`;
  }
  function renderBuilder(){
    const ro = !canEdit(cur); let n = 0;
    $("fmBody").innerHTML = `<fieldset class="fm-build" ${ro ? "disabled" : ""}>
      <div class="fm-head"><input class="fm-ft" data-p="title" value="${esc(cur.title)}" placeholder="عنوان الاستبيان"><textarea class="fm-fd" data-p="description" rows="2" placeholder="النص الترحيبي (المقدمة)">${esc(cur.description)}</textarea></div>
      ${cur.sections.map((s, si) => `${si > 0 || cur.sections.length > 1 ? `<div class="fm-sec"><div class="fm-sech"><span>القسم ${si + 1} من ${cur.sections.length}</span>${cur.sections.length > 1 ? `<button type="button" class="linkbtn danger-text" data-delsec="${si}">حذف القسم</button>` : ""}</div>
          <input class="fm-qt" data-p="sections.${si}.title" value="${esc(s.title)}" placeholder="عنوان القسم"><input class="fm-line fm-qd" data-p="sections.${si}.desc" value="${esc(s.desc)}" placeholder="وصف القسم (اختياري)"></div>` : ""}
        ${s.questions.map((q, qi) => qHtml(q, si, qi, q.type === "text" ? 0 : ++n)).join("")}
        <div class="fm-adds"><button type="button" class="btn small" data-addq="${si}">+ سؤال</button><button type="button" class="btn small ghost" data-addt="${si}">+ عنوان ووصف</button>${si === cur.sections.length - 1 ? '<button type="button" class="btn small ghost" data-addsec>+ قسم جديد (صفحة)</button>' : ""}</div>`).join("")}
    </fieldset>`;
  }
  const at = p => p.split(".").reduce((o, k) => o == null ? o : o[/^\d+$/.test(k) ? +k : k], cur);
  function setAt(p, v){ const ks = p.split("."), last = ks.pop(); const o = at(ks.join(".")) ?? cur; o[/^\d+$/.test(last) ? +last : last] = v; }
  const qOf = p => at(p);
  $("fmBody").addEventListener("input", e => { const p = e.target.dataset.p; if (!p) return; setAt(p, e.target.value); if (p === "title") $("fmTitle").textContent = e.target.value || "بدون عنوان"; changed(); });
  $("fmBody").addEventListener("change", e => {
    const t = e.target;
    if (t.dataset.type){ const q = qOf(t.dataset.type), nt = t.value; q.type = nt; if (CHOICE.has(nt) && !q.options.length) q.options = ["الخيار 1"]; if (nt === "select") q.other = false; if (nt === "text") q.required = false; renderBuilder(); changed(); }
    if (t.dataset.num){ setAt(t.dataset.num, +t.value); renderBuilder(); changed(); }
    if (t.dataset.req){ qOf(t.dataset.req).required = t.checked; changed(); }
  });
  $("fmBody").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return; const d = b.dataset;
    const split = s => { const parts = s.split("."); return { sp: parts.slice(0, 4).join("."), si: +parts[1], qi: +parts[3], rest: parts.slice(4) }; };
    if (d.addopt){ const q = qOf(d.addopt); q.options.push(`الخيار ${q.options.length + 1}`); focusOpt(d.addopt, q.options.length - 1); }
    else if (d.delopt){ const { sp, rest } = split(d.delopt); const q = qOf(sp); if (q.options.length > 1) q.options.splice(+rest[0], 1); }
    else if (d.other){ const q = qOf(d.other); q.other = !q.other; }
    else if (d.addq !== undefined){ cur.sections[+d.addq].questions.push(newQ()); }
    else if (d.addt !== undefined){ cur.sections[+d.addt].questions.push({ ...newQ("text"), options: [] }); }
    else if (d.addsec !== undefined){ cur.sections.push(newSection()); }
    else if (d.delsec !== undefined){ cur.sections.splice(+d.delsec, 1); }
    else if (d.delq){ const { si, qi } = split(d.delq); cur.sections[si].questions.splice(qi, 1); }
    else if (d.dupq){ const { si, qi } = split(d.dupq); const c = JSON.parse(JSON.stringify(cur.sections[si].questions[qi])); c.id = uid(); cur.sections[si].questions.splice(qi + 1, 0, c); }
    else if (d.mv){ const parts = d.mv.split("."), dir = +parts.pop(), { si, qi } = split(parts.join(".")), qs = cur.sections[si].questions, j = qi + dir;
      if (j >= 0 && j < qs.length) [qs[qi], qs[j]] = [qs[j], qs[qi]];
      else if (j < 0 && si > 0) cur.sections[si - 1].questions.push(qs.splice(qi, 1)[0]);
      else if (j >= qs.length && si < cur.sections.length - 1) cur.sections[si + 1].questions.unshift(qs.splice(qi, 1)[0]);
      else return; }
    else return;
    renderBuilder(); changed();
  });
  /* options behave like Google Forms: Enter goes to the next option (a new one after the last),
     Backspace in an empty option removes it, and a default «الخيار n» is selected on focus so typing replaces it */
  const optPath = el => { const m = /^(sections\.\d+\.questions\.\d+)\.options\.(\d+)$/.exec(el.dataset.p || ""); return m ? { qp: m[1], i: +m[2] } : null; };
  const focusOpt = (qp, i) => setTimeout(() => { const el = $("fmBody").querySelector(`[data-p="${qp}.options.${i}"]`); if (el){ el.focus(); el.select(); } }, 0);
  $("fmBody").addEventListener("keydown", e => {
    const o = optPath(e.target); if (!o || e.isComposing) return;
    const q = qOf(o.qp);
    if (e.key === "Enter"){
      e.preventDefault();
      if (o.i === q.options.length - 1){ q.options.push(`الخيار ${q.options.length + 1}`); renderBuilder(); changed(); }
      focusOpt(o.qp, o.i + 1);
    } else if (e.key === "Backspace" && !e.target.value && q.options.length > 1){
      e.preventDefault(); q.options.splice(o.i, 1); renderBuilder(); changed(); focusOpt(o.qp, Math.max(0, o.i - 1));
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp"){
      const j = o.i + (e.key === "ArrowDown" ? 1 : -1); if (j >= 0 && j < q.options.length){ e.preventDefault(); focusOpt(o.qp, j); }
    }
  });
  $("fmBody").addEventListener("focusin", e => { if (optPath(e.target) && /^الخيار \d+$/.test(e.target.value)) e.target.select(); });
  function changed(){ dirty = true; $("fmState").textContent = "جارٍ الحفظ…"; clearTimeout(saveT); saveT = setTimeout(save, 900); }
  async function save(){
    if (!cur || !curId || !canEdit(cur) || saving) return;
    saving = true; clearTimeout(saveT);
    const data = JSON.parse(JSON.stringify({ ...cur, title: (cur.title || "").trim() || "استبيان بدون عنوان", updatedAt: new Date().toISOString(), upload: cloudCfg() || cur.upload || null, brand: brand() }));
    try { await db.collection("forms").doc(curId).set(data); dirty = false; $("fmState").textContent = "حُفظ"; }
    catch (e){ console.error(e); $("fmState").textContent = "تعذّر الحفظ"; }
    finally { saving = false; if (dirty) saveT = setTimeout(save, 900); }
  }

  /* ---------- settings ---------- */
  const COLORS = ["#7c3aed", "#0f766e", "#2563eb", "#b45309", "#be123c", "#334155"];
  function renderSettings(){
    const s = cur.settings, ro = !canEdit(cur);
    $("fmSettings").innerHTML = `<fieldset class="fm-set" ${ro ? "disabled" : ""}>
      <div class="fm-card-s"><h3>رابط الاستبيان</h3><div class="fm-link"><input class="input" readonly dir="ltr" value="${esc(link(curId))}"><button type="button" class="btn small" id="fmCopy2">نسخ</button><a class="btn small" href="${esc(link(curId))}&preview=1" target="_blank" rel="noopener">معاينة</a></div>
        <p class="muted-text">يفتحه أي شخص بدون تسجيل دخول، ويستقبل الردود فقط وهو مفعّل.</p></div>
      <div class="fm-card-s"><h3>الردود</h3>
        <label class="s-check"><input type="checkbox" data-s="oneResponse"${s.oneResponse ? " checked" : ""}> <span>رد واحد لكل جهاز</span></label>
        <label class="s-check"><input type="checkbox" data-s="showProgress"${s.showProgress ? " checked" : ""}> <span>إظهار شريط التقدم بين الأقسام</span></label>
        <label class="ig-f"><span>إغلاق تلقائي في تاريخ <i>(اختياري)</i></span><input class="input" type="date" data-s="closeAt" value="${esc(s.closeAt)}"></label>
        <label class="ig-f"><span>رسالة الشكر بعد الإرسال</span><textarea class="input" rows="2" data-s="confirm">${esc(s.confirm)}</textarea></label></div>
    </fieldset>`;
    $("fmCopy2").addEventListener("click", () => copyLink({ ...cur, id: curId }));
  }
  $("fmSettings").addEventListener("change", e => { const k = e.target.dataset.s; if (!k) return; cur.settings[k] = e.target.type === "checkbox" ? e.target.checked : e.target.value; changed(); });
  $("fmSettings").addEventListener("input", e => { const k = e.target.dataset.s; if (!k || e.target.type === "checkbox") return; cur.settings[k] = e.target.value; changed(); });
  $("fmSettings").addEventListener("click", e => { const c = e.target.closest("[data-color]"); if (!c) return; cur.color = c.dataset.color; renderSettings(); changed(); });

  /* ---------- the look (المظهر): the site's identity by default, everything adjustable, with a live preview ---------- */
  const PALETTES = [["#7c3aed", "#c026d3"], ["#0f766e", "#14b8a6"], ["#1d4ed8", "#0ea5e9"], ["#b45309", "#f59e0b"], ["#be123c", "#f43f5e"], ["#334155", "#64748b"], ["#166534", "#65a30d"], ["#1e1b4b", "#6d28d9"]];
  const seg = (k, val, opts) => `<div class="fm-seg" role="radiogroup">${opts.map(([v, l]) => `<button type="button" role="radio" data-lk="${k}" data-v="${v}" aria-checked="${v === val}">${l}</button>`).join("")}</div>`;
  function look(){ const b = brand(), l = cur.look || {}; return { a1: l.a1 || b.a1, a2: l.a2 || b.a2, font: l.font || b.font, bgStyle: l.bgStyle || "soft", bg: l.bg || "#f4f2f8", radius: l.radius || "medium",
    headerStyle: l.headerStyle || "gradient", headerImage: l.headerImage || "", headerHeight: l.headerHeight || "m", overlay: l.overlay !== false,
    logoMode: l.logoMode || "site", logo: l.logo || "", logoSize: l.logoSize || 40, showOrg: l.showOrg !== false, orgName: l.orgName || "",
    align: l.align || "right", numbering: l.numbering !== false, chips: l.chips !== false, width: l.width || "normal", submitText: l.submitText || "", nextText: l.nextText || "", footer: l.footer || "" }; }
  // the preview frame is built once per form; the controls redraw on their own so the frame never reloads
  function renderLook(){
    const fr = $("lkFrame");
    if (!fr || fr.dataset.id !== curId){
      $("fmLook").innerHTML = `<div id="lkCtl"></div><div class="fm-lkp"><div class="fm-lkbar"><span>معاينة حية</span><div class="fm-seg"><button type="button" data-dev="d" aria-checked="true">حاسب</button><button type="button" data-dev="m" aria-checked="false">جوال</button></div></div>
        <div class="fm-frame"><iframe id="lkFrame" data-id="${esc(curId)}" title="معاينة الاستبيان" src="${esc(link(curId))}&preview=1&embed=1"></iframe></div></div>`;
      $("lkFrame").addEventListener("load", () => setTimeout(pushLook, 400));
    } else pushLook();
    renderControls();
  }
  function renderControls(){
    const L = look(), ro = !canEdit(cur), b = brand(), fonts = Object.keys((window.SiteSettings && SiteSettings.FONTS) || { [b.font]: 1 });
    $("lkCtl").innerHTML = `<fieldset class="fm-lk" ${ro ? "disabled" : ""}>
      <div class="fm-card-s fm-lkh"><div><h3>المظهر</h3><p class="muted-text">يبدأ بهوية الموقع، وكل ما تغيّره هنا يخص هذا الاستبيان فقط.</p></div><button type="button" class="btn small" id="lkReset">استعادة هوية الموقع</button></div>
      <div class="fm-card-s"><h3>الشعار واسم الجهة</h3>
        ${seg("logoMode", L.logoMode, [["site", "شعار الموقع"], ["custom", "شعار مخصص"], ["none", "بدون شعار"]])}
        ${L.logoMode === "custom" ? `<div class="fm-up">${L.logo ? `<img src="${esc(L.logo)}" alt="">` : '<span class="muted-text">لم يُرفع شعار</span>'}<label class="btn small">رفع شعار<input type="file" accept="image/*" data-img="logo" hidden></label></div>` : ""}
        ${L.logoMode !== "none" ? `<label class="fm-rng"><span>حجم الشعار</span><input type="range" min="24" max="96" step="4" data-lk="logoSize" value="${L.logoSize}"><b>${L.logoSize}px</b></label>` : ""}
        <label class="s-check"><input type="checkbox" data-lkc="showOrg"${L.showOrg ? " checked" : ""}> <span>إظهار اسم الجهة بجانب الشعار</span></label>
        ${L.showOrg ? `<input class="input" data-lk="orgName" value="${esc(L.orgName)}" placeholder="${esc(b.siteName || "اسم الجهة")}">` : ""}</div>
      <div class="fm-card-s"><h3>رأس الاستبيان</h3>
        ${seg("headerStyle", L.headerStyle, [["gradient", "تدرّج"], ["solid", "لون واحد"], ["image", "صورة"], ["light", "فاتح"]])}
        ${L.headerStyle === "image" ? `<div class="fm-up wide">${L.headerImage ? `<img src="${esc(L.headerImage)}" alt="">` : '<span class="muted-text">ارفع صورة عريضة (1600×500 تقريباً)</span>'}<label class="btn small">${L.headerImage ? "تغيير الصورة" : "رفع صورة"}<input type="file" accept="image/*" data-img="headerImage" hidden></label></div>
          <div class="fm-row2"><span class="fm-lbl">الارتفاع</span>${seg("headerHeight", L.headerHeight, [["s", "صغير"], ["m", "متوسط"], ["l", "كبير"]])}</div>
          <label class="s-check"><input type="checkbox" data-lkc="overlay"${L.overlay ? " checked" : ""}> <span>تظليل الصورة لوضوح العنوان</span></label>` : ""}
        <div class="fm-row2"><span class="fm-lbl">محاذاة العنوان</span>${seg("align", L.align, [["right", "يمين"], ["center", "وسط"]])}</div>
        <label class="s-check"><input type="checkbox" data-lkc="chips"${L.chips ? " checked" : ""}> <span>إظهار عدد الأسئلة والوقت المتوقع</span></label></div>
      <div class="fm-card-s"><h3>الألوان</h3>
        <div class="fm-pal">${PALETTES.map(([x, y]) => `<button type="button" data-pal="${x},${y}" style="background:linear-gradient(135deg,${x},${y})" aria-pressed="${x === L.a1 && y === L.a2}" aria-label="لوحة ألوان"></button>`).join("")}</div>
        <div class="fm-row2"><label class="fm-color"><span>اللون الأساسي</span><input type="color" data-lk="a1" value="${esc(L.a1)}"></label><label class="fm-color"><span>اللون الثاني</span><input type="color" data-lk="a2" value="${esc(L.a2)}"></label></div>
        <div class="fm-row2"><span class="fm-lbl">الخلفية</span>${seg("bgStyle", L.bgStyle, [["soft", "ناعمة"], ["plain", "سادة"], ["color", "لون مخصص"]])}${L.bgStyle === "color" ? `<input type="color" data-lk="bg" value="${esc(L.bg)}">` : ""}</div></div>
      <div class="fm-card-s"><h3>الخط والشكل</h3>
        <label class="ig-f"><span>الخط</span><select class="select" data-lk="font">${fonts.map(f => `<option${f === L.font ? " selected" : ""}>${esc(f)}</option>`).join("")}</select></label>
        <div class="fm-row2"><span class="fm-lbl">الزوايا</span>${seg("radius", L.radius, [["sharp", "حادة"], ["medium", "متوسطة"], ["round", "دائرية"]])}</div>
        <div class="fm-row2"><span class="fm-lbl">العرض</span>${seg("width", L.width, [["normal", "عادي"], ["wide", "عريض"]])}</div>
        <label class="s-check"><input type="checkbox" data-lkc="numbering"${L.numbering ? " checked" : ""}> <span>ترقيم الأسئلة</span></label></div>
      <div class="fm-card-s"><h3>النصوص</h3>
        <div class="fm-row2"><label class="ig-f"><span>زر الإرسال</span><input class="input" data-lk="submitText" value="${esc(L.submitText)}" placeholder="إرسال"></label><label class="ig-f"><span>زر التالي</span><input class="input" data-lk="nextText" value="${esc(L.nextText)}" placeholder="التالي"></label></div>
        <label class="ig-f"><span>نص التذييل <i>(اختياري)</i></span><input class="input" data-lk="footer" value="${esc(L.footer)}" placeholder="مثال: جميع الإجابات سرية وتُستخدم لأغراض التطوير فقط"></label></div>
    </fieldset>`;
    $("lkReset").addEventListener("click", async () => { if (!(await UI.confirm("استعادة هوية الموقع وإلغاء كل تخصيصات المظهر لهذا الاستبيان؟", { ok: "استعادة" }))) return; cur.look = {}; changed(); pushLook(); renderControls(); });
  }
  function pushLook(){ const fr = $("lkFrame"); if (fr && fr.contentWindow) fr.contentWindow.postMessage({ type: "fp-look", look: cur.look || {}, brand: brand(), title: cur.title, description: cur.description }, location.origin); }
  function setLook(k, v, redraw){ cur.look = { ...(cur.look || {}), [k]: v }; changed(); pushLook(); if (redraw) renderControls(); }
  $("fmLook").addEventListener("input", e => { const k = e.target.dataset.lk; if (!k) return; const v = e.target.type === "range" ? +e.target.value : e.target.value; if (e.target.type === "range") e.target.nextElementSibling.textContent = v + "px"; setLook(k, v); });
  $("fmLook").addEventListener("change", e => {
    const t = e.target;
    if (t.dataset.lkc){ setLook(t.dataset.lkc, t.checked, ["showOrg", "overlay"].includes(t.dataset.lkc)); return; }
    if (t.tagName === "SELECT" && t.dataset.lk){ setLook(t.dataset.lk, t.value); return; }
    if (t.dataset.img){ const f = t.files[0]; if (f) pickImage(t.dataset.img, f); }
  });
  $("fmLook").addEventListener("click", e => {
    const s = e.target.closest("[data-lk][data-v]"); if (s){ setLook(s.dataset.lk, s.dataset.v, true); return; }
    const p = e.target.closest("[data-pal]"); if (p){ const [a1, a2] = p.dataset.pal.split(","); cur.look = { ...(cur.look || {}), a1, a2 }; changed(); pushLook(); renderLookKeepFrame(); return; }
    const d = e.target.closest("[data-dev]"); if (d){ document.querySelectorAll("[data-dev]").forEach(x => x.setAttribute("aria-checked", String(x === d))); $("fmLook").querySelector(".fm-frame").classList.toggle("mobile", d.dataset.dev === "m"); }
  });
  const renderLookKeepFrame = () => renderControls();
  async function pickImage(key, f){
    try {
      $("fmState").textContent = "جارٍ رفع الصورة…";
      let url;
      if (window.Cloud && Cloud.ready()) url = (await Cloud.upload(f, { folder: "forms" })).url;
      else url = await shrinkImage(f, key === "logo" ? 400 : 1600, key === "logo" ? "image/png" : "image/jpeg");
      cur.look = { ...(cur.look || {}), [key]: url }; changed(); pushLook(); renderLookKeepFrame();
    } catch (e){ console.error(e); UI.alert(e.message === "too_big" ? "الصورة كبيرة، اختر صورة أصغر." : "تعذّر رفع الصورة"); $("fmState").textContent = ""; }
  }
  function shrinkImage(f, maxW, type){
    return new Promise((res, rej) => { const r = new FileReader(); r.onerror = rej; r.onload = () => { const img = new Image(); img.onerror = rej; img.onload = () => {
      const k = Math.min(1, maxW / img.width), c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const u = c.toDataURL(type, .82); u.length <= 600000 ? res(u) : rej(new Error("too_big")); }; img.src = r.result; }; r.readAsDataURL(f); });
  }

  /* ---------- results ---------- */
  function watchResponses(){
    if (unsubR) unsubR();
    responses = []; rIndex = 0;
    unsubR = db.collection("forms").doc(curId).collection("responses").onSnapshot(s => {
      responses = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => tsOf(a) - tsOf(b));
      counts[curId] = responses.length; paintBar(); if (tab === "r") renderResults();
    }, e => console.error(e));
  }
  const tsOf = r => r.at && r.at.toMillis ? r.at.toMillis() : r.at && r.at.seconds ? r.at.seconds * 1000 : Date.parse(r.at || 0) || 0;
  const fmtTs = r => { const t = tsOf(r); return t ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t)) : ""; };
  let rMode = "sum";
  function answerText(q, v){
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) return "";
    if (q.type === "file") return v && v.url ? v.name || "ملف" : "";
    if (Array.isArray(v)) return v.join("، ");
    return String(v);
  }
  function renderResults(){
    const qs = allQ(cur), box = $("fmResults");
    if (!responses.length){ box.innerHTML = `<div class="fm-card-s fm-none"><b>لا توجد ردود بعد</b><p class="muted-text">${cur.active ? "شارك رابط الاستبيان لتبدأ الردود بالوصول." : "فعّل الرابط وشاركه لتبدأ الردود بالوصول."}</p></div>`; return; }
    box.innerHTML = `<div class="fm-card-s fm-rhead"><b>${responses.length} رد</b><div class="seg-tabs"><button type="button" data-rm="sum" aria-selected="${rMode === "sum"}">ملخص</button><button type="button" data-rm="one" aria-selected="${rMode === "one"}">فردي</button></div>
      <div class="actions"><button type="button" class="btn small" id="fmCsv">تنزيل Excel (CSV)</button>${canEdit(cur) ? '<button type="button" class="btn small ghost danger-text" id="fmClear">حذف كل الردود</button>' : ""}</div></div><div id="fmRBody"></div>`;
    box.querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", () => { rMode = b.dataset.rm; renderResults(); }));
    $("fmCsv").addEventListener("click", csv);
    $("fmClear") && $("fmClear").addEventListener("click", clearAll);
    const body = $("fmRBody");
    if (rMode === "sum") body.innerHTML = qs.map(q => summary(q)).join("");
    else {
      rIndex = Math.min(Math.max(0, rIndex), responses.length - 1);
      const r = responses[rIndex];
      body.innerHTML = `<div class="fm-card-s fm-nav"><button type="button" class="btn small" data-step="-1" ${rIndex === 0 ? "disabled" : ""}>السابق</button><span>${rIndex + 1} من ${responses.length} · ${esc(fmtTs(r))}</span><button type="button" class="btn small" data-step="1" ${rIndex === responses.length - 1 ? "disabled" : ""}>التالي</button>${canEdit(cur) ? '<button type="button" class="linkbtn danger-text" id="fmDelR">حذف هذا الرد</button>' : ""}</div>` +
        qs.map(q => { const v = (r.answers || {})[q.id], t = answerText(q, v); return `<div class="fm-card-s"><b class="fm-rq">${esc(q.title || "سؤال بدون عنوان")}</b>${q.type === "file" && v && v.url ? `<a href="${esc(v.url)}" target="_blank" rel="noopener">📎 ${esc(v.name || "ملف")}</a>` : `<p class="${t ? "" : "muted-text"}">${t ? esc(t).replace(/\n/g, "<br>") : "لم يُجب"}</p>`}</div>`; }).join("");
      body.querySelectorAll("[data-step]").forEach(b => b.addEventListener("click", () => { rIndex += +b.dataset.step; renderResults(); }));
      $("fmDelR") && $("fmDelR").addEventListener("click", async () => { if (!(await UI.confirm("حذف هذا الرد نهائياً؟", { ok: "حذف", danger: true }))) return; try { await db.collection("forms").doc(curId).collection("responses").doc(r.id).delete(); } catch (e){ console.error(e); UI.toast("تعذّر الحذف", "err"); } });
    }
  }
  function summary(q){
    const vals = responses.map(r => (r.answers || {})[q.id]).filter(v => v != null && v !== "" && !(Array.isArray(v) && !v.length));
    const head = `<b class="fm-rq">${esc(q.title || "سؤال بدون عنوان")}</b><span class="muted-text fm-rc">${vals.length} إجابة</span>`;
    const bars = (rows, total) => `<div class="fm-bars">${rows.map(([label, n]) => { const p = total ? Math.round(n / total * 100) : 0; return `<div class="fm-bar"><span class="fm-bl">${esc(label)}</span><span class="fm-bt"><i style="width:${p}%"></i></span><span class="fm-bn">${n} (${p}%)</span></div>`; }).join("")}</div>`;
    if (CHOICE.has(q.type)){
      const c = new Map(q.options.map(o => [o, 0])); let other = 0;
      vals.forEach(v => (Array.isArray(v) ? v : [v]).forEach(x => { if (c.has(x)) c.set(x, c.get(x) + 1); else other++; }));
      const rows = [...c]; if (q.other || other) rows.push(["أخرى", other]);
      return `<div class="fm-card-s">${head}${bars(rows, q.type === "check" ? responses.length : vals.length)}</div>`;
    }
    if (q.type === "scale" || q.type === "rating" || q.type === "number"){
      const nums = vals.map(Number).filter(x => !isNaN(x)), avg = nums.length ? (nums.reduce((s, x) => s + x, 0) / nums.length) : 0;
      if (q.type === "number") return `<div class="fm-card-s">${head}<p class="fm-avg">المتوسط <b>${avg.toFixed(1)}</b> · الأقل ${nums.length ? Math.min(...nums) : "—"} · الأعلى ${nums.length ? Math.max(...nums) : "—"}</p></div>`;
      const lo = q.type === "rating" ? 1 : +q.min, hi = q.type === "rating" ? +q.stars : +q.max, rows = [];
      for (let i = lo; i <= hi; i++) rows.push([q.type === "rating" ? "★".repeat(i) : String(i), nums.filter(x => x === i).length]);
      return `<div class="fm-card-s">${head}<p class="fm-avg">المتوسط <b>${avg.toFixed(1)}</b> من ${hi}</p>${bars(rows, nums.length)}</div>`;
    }
    if (q.type === "file") return `<div class="fm-card-s">${head}<ul class="fm-texts">${vals.slice(-50).reverse().map(v => `<li><a href="${esc(v.url)}" target="_blank" rel="noopener">📎 ${esc(v.name || "ملف")}</a></li>`).join("")}</ul></div>`;
    return `<div class="fm-card-s">${head}<ul class="fm-texts">${vals.slice(-50).reverse().map(v => `<li>${esc(answerText(q, v))}</li>`).join("")}</ul>${vals.length > 50 ? '<p class="muted-text">آخر 50 إجابة. نزّل ملف Excel لرؤية الكل.</p>' : ""}</div>`;
  }
  function csv(){
    const qs = allQ(cur), cell = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const rows = [["وقت الإرسال", ...qs.map(q => q.title || "سؤال")].map(cell).join(",")].concat(responses.map(r => [fmtTs(r), ...qs.map(q => { const v = (r.answers || {})[q.id]; return q.type === "file" && v && v.url ? v.url : answerText(q, v); })].map(cell).join(",")));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = (cur.title || "استبيان").replace(/[\\/:*?"<>|]+/g, " ").slice(0, 100) + " - الردود.csv"; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  async function clearAll(){
    if (!(await UI.confirm(`حذف كل الردود (${responses.length}) نهائياً؟`, { ok: "حذف الكل", danger: true }))) return;
    try { const ids = responses.map(r => r.id); for (let i = 0; i < ids.length; i += 400){ const b = db.batch(); ids.slice(i, i + 400).forEach(id => b.delete(db.collection("forms").doc(curId).collection("responses").doc(id))); await b.commit(); } UI.toast("حُذفت الردود"); }
    catch (e){ console.error(e); UI.toast("تعذّر الحذف", "err"); }
  }

  /* ---------- print: the questions as a paper form ---------- */
  function print(){
    let n = 0;
    const qp = q => { if (q.type === "text") return `<div class="fp-t"><h3>${esc(q.title)}</h3>${q.desc ? `<p>${esc(q.desc)}</p>` : ""}</div>`;
      n++; let a = "";
      if (CHOICE.has(q.type)) a = `<ul class="fp-o ${q.type === "check" ? "sq" : ""}">${q.options.concat(q.other ? ["أخرى: ................"] : []).map(o => `<li>${esc(o)}</li>`).join("")}</ul>`;
      else if (q.type === "scale"){ let s = ""; for (let i = +q.min; i <= +q.max; i++) s += `<span>○ ${i}</span>`; a = `<div class="fp-s">${q.minLabel ? `<em>${esc(q.minLabel)}</em>` : ""}${s}${q.maxLabel ? `<em>${esc(q.maxLabel)}</em>` : ""}</div>`; }
      else if (q.type === "rating") a = `<div class="fp-s">${"☆ ".repeat(+q.stars || 5)}</div>`;
      else a = `<div class="fp-l${q.type === "long" ? " tall" : ""}"></div>`;
      return `<div class="fp-q"><b>${n}. ${esc(q.title || "")}${q.required ? " *" : ""}</b>${q.desc ? `<p>${esc(q.desc)}</p>` : ""}${a}</div>`; };
    $("iniPrint").innerHTML = `<article class="fp-doc"><h1>${esc(cur.title)}</h1>${cur.description ? `<p class="fp-d">${esc(cur.description).replace(/\n/g, "<br>")}</p>` : ""}${cur.sections.map((s, i) => `${s.title ? `<h2>${esc(s.title)}</h2>` : i ? "<hr>" : ""}${s.desc ? `<p>${esc(s.desc)}</p>` : ""}${s.questions.map(qp).join("")}`).join("")}</article>`;
    document.body.classList.add("printing-ini");
    const done = () => { document.body.classList.remove("printing-ini"); $("iniPrint").innerHTML = ""; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done); setTimeout(() => window.print(), 80);
  }

  /* ---------- wiring ---------- */
  $("fmNew").addEventListener("click", create);
  $("fmBack").addEventListener("click", close);
  $("fmQ").addEventListener("input", renderList);
  $("fmFStatus").addEventListener("change", renderList);
  document.querySelectorAll("[data-fmview]").forEach(b => b.addEventListener("click", () => { view = b.dataset.fmview; try { localStorage.setItem("app-forms-view", view); } catch {} renderList(); }));
  $("fmActive").addEventListener("change", () => setActive({ ...cur, id: curId }, $("fmActive").checked).then(() => paintBar()));
  $("fmCopy").addEventListener("click", () => copyLink({ ...cur, id: curId }));
  $("fmPreview").addEventListener("click", () => { save(); window.open(link(curId) + "&preview=1", "_blank", "noopener"); });
  $("fmPrint").addEventListener("click", print);
  window.addEventListener("app:view", e => { if (e.detail !== "projects/forms" && cur && dirty) save(); });
  window.addEventListener("beforeunload", () => { if (dirty) save(); });

  function connect({ db: d, user }){
    if (unsub){ unsub(); unsub = null; }
    db = d; me = user ? user.email : ""; myName = (user && user.displayName) || (me || "").split("@")[0]; forms = []; loaded = false;
    if (!db){ cur = null; renderList(); return; }
    db.collection("allowed").doc(me).get().then(a => { const p = a.exists ? a.data() : {}; admin = p.role === "admin"; canUse = admin || !p.sections || p.sections.includes("projects"); renderList(); }).catch(() => {});
    let first = true;
    unsub = db.collection("forms").onSnapshot(s => {
      forms = s.docs.map(x => ({ id: x.id, ...x.data() })); loaded = true;
      if (cur && !forms.some(f => f.id === curId)){ cur = null; curId = null; }
      renderList(); if (first){ first = false; loadCounts(); }
    }, e => { console.error(e); loaded = true; renderList(); });
    renderList();
  }
  window.addEventListener("app:view", e => { if (e.detail === "projects/forms" && db && !cur) loadCounts(); });
  window.addEventListener("app:db", e => connect(e.detail));
  if (window.appDb) connect({ db: window.appDb, user: window.appUser });
  renderList();
})();
