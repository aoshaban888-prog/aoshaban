/* الحوكمة › الجمعيات: a directory of associations (data, not accounts). Firestore "associations" — the same records the
   policy library, the letters and the initiatives tool already read, so every page that picks an association finds them.
   Only the name is required; everything else is optional. The library keeps its own fields on the same record
   (letterhead chunks, page settings, approvals) and this page never touches them.
   Other pages: window.Assocs.list() / .byName(name) / .byId(id), and the "app:assocs" event with the list. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LOGO_MAX = 220 * 1024;

  /* ---------- the form: groups of fields ---------- */
  const GROUPS = [
    { key: "basic", title: "البيانات الأساسية", fields: [
      { k: "name", label: "اسم الجمعية", req: true, wide: true, ph: "الاسم الرسمي كما في الترخيص" },
      { k: "shortName", label: "الاسم المختصر", ph: "مثال: مسارات" },
      { k: "license", label: "رقم الترخيص", dir: "ltr" },
      { k: "founded", label: "تاريخ التأسيس", type: "date" },
      { k: "unifiedNo", label: "الرقم الموحد (700)", dir: "ltr" },
      { k: "supervisor", label: "جهة الإشراف الفني", ph: "مثال: وزارة الموارد البشرية" },
      { k: "field", label: "مجال العمل", ph: "مثال: تنمية الشباب" },
      { k: "category", label: "التصنيف", type: "select", options: ["جمعية أهلية", "مؤسسة أهلية", "جمعية تعاونية", "صندوق عائلي", "لجنة", "أخرى"] },
      { k: "region", label: "المنطقة", type: "select", options: ["الرياض", "مكة المكرمة", "المدينة المنورة", "القصيم", "المنطقة الشرقية", "عسير", "تبوك", "حائل", "الحدود الشمالية", "جازان", "نجران", "الباحة", "الجوف"] },
      { k: "city", label: "المدينة" },
      { k: "address", label: "العنوان الوطني", wide: true },
    ] },
    { key: "contact", title: "التواصل", fields: [
      { k: "phone", label: "الهاتف", dir: "ltr" }, { k: "mobile", label: "الجوال", dir: "ltr" },
      { k: "email", label: "البريد الإلكتروني", dir: "ltr", type: "email" }, { k: "website", label: "الموقع الإلكتروني", dir: "ltr", ph: "https://" },
      { k: "x", label: "حساب X", dir: "ltr", ph: "@" }, { k: "instagram", label: "حساب إنستقرام", dir: "ltr", ph: "@" },
      { k: "mapUrl", label: "رابط الموقع على الخريطة", dir: "ltr", wide: true, ph: "https://maps.google.com/…" },
    ] },
    { key: "strategy", title: "الهوية الاستراتيجية", fields: [
      { k: "vision", label: "الرؤية", type: "area", wide: true }, { k: "mission", label: "الرسالة", type: "area", wide: true },
      { k: "values", label: "القيم", type: "area", wide: true, ph: "قيمة في كل سطر" },
      { k: "goals", label: "الأهداف الاستراتيجية", type: "area", wide: true, rows: 4, ph: "هدف في كل سطر" },
    ] },
    { key: "governance", title: "الحوكمة والقيادة", fields: [
      { k: "chairman", label: "رئيس مجلس الإدارة" }, { k: "viceChairman", label: "نائب الرئيس" },
      { k: "ceo", label: "المدير التنفيذي" }, { k: "treasurer", label: "المشرف المالي" },
      { k: "boardStart", label: "بداية دورة المجلس", type: "date" }, { k: "boardEnd", label: "نهاية دورة المجلس", type: "date" },
      { k: "generalAssembly", label: "عدد أعضاء الجمعية العمومية", dir: "ltr" },
    ], table: { k: "board", title: "أعضاء مجلس الإدارة", cols: [{ k: "name", label: "الاسم", w: 2 }, { k: "role", label: "المنصب", w: 1.4 }, { k: "mobile", label: "الجوال", dir: "ltr" }, { k: "email", label: "البريد", dir: "ltr", w: 1.4 }] } },
    { key: "finance", title: "البيانات المالية", fields: [
      { k: "bank", label: "البنك" }, { k: "iban", label: "رقم الآيبان", dir: "ltr", ph: "SA…" },
      { k: "vatNo", label: "الرقم الضريبي", dir: "ltr" }, { k: "fiscalYear", label: "بداية السنة المالية", ph: "مثال: 1 يناير" },
    ] },
    { key: "files", title: "الشعار والكليشة والمرفقات" },
    { key: "notes", title: "ملاحظات", fields: [{ k: "notes", label: "ملاحظات", type: "area", wide: true, rows: 4 }] },
  ];
  const FIELD_KEYS = GROUPS.flatMap(g => (g.fields || []).map(f => f.k));

  let db = null, me = "", canWrite = false, items = [], loaded = false, unsub = null;
  let cur = null, curId = null, dirty = false;
  const byId = id => items.find(a => a.id === id) || null;
  const byName = n => { const t = String(n || "").trim(); return t ? items.find(a => (a.name || "").trim() === t || (a.shortName || "").trim() === t) || null : null; };
  window.Assocs = { list: () => items.slice(), byId, byName };

  /* ---------- the list ---------- */
  function renderList(){
    const box = $("asList"); if (!box) return;
    $("asSignin").hidden = !!db; $("asHome").hidden = !db || !!cur; $("asEditor").hidden = !cur;
    $("asNew").hidden = !canWrite;
    if (!db || cur) return;
    const q = ($("asQ").value || "").trim(), reg = $("asFRegion").value;
    const list = items.filter(a => (!reg || a.region === reg) && (!q || [a.name, a.shortName, a.city, a.license, a.chairman, a.ceo, a.field].some(x => (x || "").includes(q))))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
    $("asCount").textContent = `${list.length} من ${items.length}`;
    $("asEmpty").hidden = !loaded || list.length > 0;
    $("asEmpty").textContent = items.length ? "لا توجد جمعيات تطابق البحث" : "لم تُضف أي جمعية بعد." + (canWrite ? " ابدأ بزر «جمعية جديدة»." : "");
    box.innerHTML = "";
    list.forEach(a => {
      const el = document.createElement("article"); el.className = "as-card"; el.tabIndex = 0;
      const logo = a.logo && a.logo.url;
      const filled = FIELD_KEYS.filter(k => String(a[k] ?? "").trim()).length + ((a.board || []).length ? 1 : 0) + (logo ? 1 : 0) + (a.letterheadFile || a.lhChunks ? 1 : 0);
      const pct = Math.round(filled / (FIELD_KEYS.length + 3) * 100);
      el.innerHTML = `<div class="as-ch"><span class="as-logo">${logo ? `<img src="${esc(logo)}" alt="">` : `<b>${esc((a.shortName || a.name || "؟").trim()[0])}</b>`}</span><div><h3></h3><p></p></div></div>
        <dl class="as-dl"></dl><div class="as-cf"><span class="pbar ${pct >= 70 ? "good" : "mid"}" title="اكتمال البيانات"><i style="width:${pct}%"></i></span><span>${pct}%</span></div>`;
      el.querySelector("h3").textContent = a.name || "بدون اسم";
      el.querySelector("p").textContent = [a.field, a.city || a.region].filter(Boolean).join(" · ") || "—";
      const dl = el.querySelector(".as-dl");
      [["الترخيص", a.license], ["رئيس المجلس", a.chairman], ["المدير التنفيذي", a.ceo]].filter(x => x[1]).forEach(([k, v]) => { const d = document.createElement("div"); d.innerHTML = "<dt></dt><dd></dd>"; d.firstChild.textContent = k; d.lastChild.textContent = v; dl.append(d); });
      el.addEventListener("click", () => open(a.id));
      el.addEventListener("keydown", e => { if (e.key === "Enter" && e.target === el) open(a.id); });
      box.append(el);
    });
  }

  /* ---------- the editor ---------- */
  const input = (f, v, path) => {
    const ph = f.ph ? ` placeholder="${esc(f.ph)}"` : "", dir = f.dir ? ` dir="${f.dir}"` : "";
    if (f.type === "area") return `<textarea class="input" rows="${f.rows || 2}" data-p="${path}"${ph}>${esc(v)}</textarea>`;
    if (f.type === "select") return `<select class="select" data-p="${path}"><option value=""></option>${f.options.map(o => `<option${o === v ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    return `<input class="input" type="${f.type === "date" ? "date" : f.type === "email" ? "email" : "text"}" data-p="${path}" value="${esc(v)}"${ph}${dir}${f.req ? " required" : ""}>`;
  };
  const X = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  function filesHtml(){
    const lg = cur.logo, lh = cur.letterheadFile, cloud = window.Cloud && Cloud.ready();
    return `<div class="as-files">
      <div class="as-up"><span class="as-ul">شعار الجمعية</span><div class="as-logo big">${lg && lg.url ? `<img src="${esc(lg.url)}" alt="">` : "<small>بدون شعار</small>"}</div>
        <div class="as-ub"><label class="btn small">رفع شعار<input type="file" id="asLogoFile" accept="image/*" hidden></label>${lg && lg.url ? `<button type="button" class="linkbtn danger-text" data-clear="logo">إزالة</button>` : ""}</div></div>
      <div class="as-up"><span class="as-ul">كليشة الجمعية</span>
        ${lh && lh.url ? `<a class="as-file" href="${esc(lh.url)}" target="_blank" rel="noopener">📄 ${esc(lh.name || "الكليشة")}</a>` : cur.lhChunks ? `<p class="muted-text">محفوظة في مكتبة اللوائح (${esc(cur.lhName || "كليشة.docx")}).</p>` : "<p class=\"muted-text\">لا توجد كليشة مرفقة.</p>"}
        <div class="as-ub"><label class="btn small">${lh && lh.url ? "استبدال" : "إرفاق كليشة"}<input type="file" id="asLhFile" accept=".docx,.dotx,.pdf,image/*" hidden></label>${lh && lh.url ? `<button type="button" class="linkbtn danger-text" data-clear="letterheadFile">إزالة</button>` : ""}</div>
        ${cloud ? "" : '<p class="muted-text">إرفاق الكليشة والمرفقات يحتاج ربط Cloudinary (التمكين التقني › الربط).</p>'}</div>
    </div>
    <div class="as-att"><span class="as-ul">مرفقات أخرى <small class="muted-text">(الترخيص، شهادة التسجيل، اللائحة الأساسية…)</small></span>
      <ul>${(cur.files || []).map((f, i) => `<li><a href="${esc(f.url)}" target="_blank" rel="noopener">📎 ${esc(f.name)}</a><button type="button" class="as-rm" data-rmfile="${i}" aria-label="إزالة">${X}</button></li>`).join("")}</ul>
      <label class="btn small">إرفاق ملف<input type="file" id="asAttFile" multiple hidden></label></div>`;
  }
  function tableHtml(t){
    const rows = cur[t.k] || [], cols = t.cols.map(c => (c.w || 1) + "fr").join(" ") + " 32px";
    return `<div class="as-tbl"><span class="as-ul">${esc(t.title)}</span><div class="as-tr as-th" style="--cols:${cols}">${t.cols.map(c => `<span>${esc(c.label)}</span>`).join("")}<span></span></div>
      ${rows.map((r, i) => `<div class="as-tr" style="--cols:${cols}">${t.cols.map(c => `<label><span class="as-cl">${esc(c.label)}</span>${input(c, (r || {})[c.k] ?? "", `${t.k}.${i}.${c.k}`)}</label>`).join("")}<button type="button" class="as-rm" data-rmrow="${t.k}.${i}" aria-label="حذف">${X}</button></div>`).join("")}
      <button type="button" class="ini-add" data-addrow="${t.k}">+ إضافة عضو</button></div>`;
  }
  let openG = new Set(["basic"]);
  function renderForm(){
    const ro = !canWrite;
    $("asForm").innerHTML = GROUPS.map(g => `<details class="ig-acc as-g" data-g="${g.key}"${openG.has(g.key) ? " open" : ""}><summary>${esc(g.title)}</summary><fieldset class="ig-acc-b" ${ro ? "disabled" : ""}>
      ${g.fields ? `<div class="as-grid">${g.fields.map(f => `<label class="ig-f${f.wide ? " as-wide" : ""}"><span>${esc(f.label)}${f.req ? ' <b class="req">*</b>' : ""}</span>${input(f, cur[f.k] ?? "", f.k)}</label>`).join("")}</div>` : ""}
      ${g.table ? tableHtml(g.table) : ""}${g.key === "files" ? filesHtml() : ""}</fieldset></details>`).join("");
    $("asForm").querySelectorAll("details").forEach(d => d.addEventListener("toggle", () => { d.open ? openG.add(d.dataset.g) : openG.delete(d.dataset.g); }));
    $("asTitle").textContent = (cur.name || "").trim() || "جمعية جديدة";
    $("asDel").hidden = !curId || !canWrite; $("asSave").hidden = !canWrite;
    $("asRO").hidden = canWrite;
  }
  function setPath(p, v){ const ks = p.split("."); if (ks.length === 1){ cur[p] = v; return; } const arr = cur[ks[0]] || (cur[ks[0]] = []); (arr[+ks[1]] ||= {})[ks[2]] = v; }
  $("asForm").addEventListener("input", e => { const p = e.target.dataset.p; if (!p) return; setPath(p, e.target.value); if (p === "name") $("asTitle").textContent = e.target.value.trim() || "جمعية جديدة"; mark(); });
  $("asForm").addEventListener("change", e => {
    if (e.target.tagName === "SELECT" && e.target.dataset.p){ setPath(e.target.dataset.p, e.target.value); mark(); }
    if (e.target.id === "asLogoFile") pickLogo(e.target.files[0]);
    if (e.target.id === "asLhFile") pickLetterhead(e.target.files[0]);
    if (e.target.id === "asAttFile") pickFiles([...e.target.files]);
  });
  $("asForm").addEventListener("click", e => {
    const add = e.target.closest("[data-addrow]"), rm = e.target.closest("[data-rmrow]"), rf = e.target.closest("[data-rmfile]"), cl = e.target.closest("[data-clear]");
    if (add){ (cur[add.dataset.addrow] ||= []).push({}); renderForm(); mark(); }
    if (rm){ const [k, i] = rm.dataset.rmrow.split("."); cur[k].splice(+i, 1); renderForm(); mark(); }
    if (rf){ cur.files.splice(+rf.dataset.rmfile, 1); renderForm(); mark(); }
    if (cl){ cur[cl.dataset.clear] = null; renderForm(); mark(); }
  });
  function mark(){ dirty = true; $("asState").textContent = "تغييرات غير محفوظة"; }

  /* ---------- logo, letterhead and files ---------- */
  const busyNote = t => { $("asState").textContent = t; };
  async function pickLogo(f){
    if (!f) return;
    try {
      if (window.Cloud && Cloud.ready()){ busyNote("جارٍ رفع الشعار…"); const up = await Cloud.upload(f, { folder: "associations" }); cur.logo = { url: up.url, name: f.name }; }
      else cur.logo = { url: await shrink(f), name: f.name };
      renderForm(); mark();
    } catch (e){ console.error(e); UI.alert(e.message === "too_big" ? "الشعار كبير، استخدم صورة أصغر." : window.Cloud ? Cloud.errText(e) : "تعذّر رفع الشعار"); busyNote(""); }
  }
  // without Cloudinary the logo is kept inside the record, scaled down
  function shrink(f){
    return new Promise((res, rej) => {
      const r = new FileReader(); r.onerror = rej;
      r.onload = () => { if (f.type === "image/svg+xml"){ return String(r.result).length <= LOGO_MAX ? res(String(r.result)) : rej(new Error("too_big")); }
        const img = new Image(); img.onerror = rej; img.onload = () => { const k = Math.min(1, 400 / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); const u = c.toDataURL("image/png"); u.length <= LOGO_MAX ? res(u) : rej(new Error("too_big")); }; img.src = r.result; };
      r.readAsDataURL(f);
    });
  }
  async function pickLetterhead(f){
    if (!f) return;
    if (!(window.Cloud && Cloud.ready())){ UI.alert("إرفاق الكليشة يحتاج ربط Cloudinary من التمكين التقني › الربط."); return; }
    try { busyNote("جارٍ رفع الكليشة…"); const up = await Cloud.upload(f, { folder: "associations" }); cur.letterheadFile = { url: up.url, name: f.name }; renderForm(); mark(); }
    catch (e){ console.error(e); UI.alert(Cloud.errText(e)); busyNote(""); }
  }
  async function pickFiles(fs){
    if (!fs.length) return;
    if (!(window.Cloud && Cloud.ready())){ UI.alert("إرفاق الملفات يحتاج ربط Cloudinary من التمكين التقني › الربط."); return; }
    for (const f of fs){
      try { busyNote(`جارٍ رفع «${f.name}»…`); const up = await Cloud.upload(f, { folder: "associations" }); (cur.files ||= []).push({ name: f.name.slice(0, 200), url: up.url, size: up.size }); }
      catch (e){ console.error(e); UI.alert(Cloud.errText(e)); }
    }
    renderForm(); mark();
  }

  /* ---------- open, save, delete ---------- */
  function open(id){
    const a = id ? byId(id) : null; if (id && !a) return;
    cur = a ? JSON.parse(JSON.stringify(a)) : { name: "", board: [], files: [] }; curId = a ? a.id : null; dirty = false;
    openG = new Set(["basic"]); $("asState").textContent = "";
    renderList(); renderForm(); window.scrollTo(0, 0);
    if (!a) setTimeout(() => { const n = $("asForm").querySelector('[data-p="name"]'); if (n) n.focus(); }, 50);
  }
  async function close(){
    if (dirty && canWrite && !(await UI.confirm("في تغييرات غير محفوظة. الخروج بدون حفظ؟", { ok: "خروج بدون حفظ", danger: true }))) return;
    cur = null; curId = null; dirty = false; renderList();
  }
  const clean = s => typeof s === "string" ? s.trim() : s;
  async function save(){
    if (!db || !canWrite || !cur) return;
    const name = (cur.name || "").trim();
    if (!name){ UI.toast("اسم الجمعية مطلوب", "err"); openG.add("basic"); renderForm(); $("asForm").querySelector('[data-p="name"]').focus(); return; }
    if (items.some(a => a.id !== curId && (a.name || "").trim() === name)){ UI.alert(`توجد جمعية مسجّلة باسم «${name}».`); return; }
    const data = { updatedAt: new Date().toISOString(), updatedBy: me };
    FIELD_KEYS.forEach(k => { data[k] = clean(cur[k] ?? ""); });
    data.board = (cur.board || []).map(r => Object.fromEntries(Object.entries(r || {}).map(([k, v]) => [k, clean(v)]))).filter(r => Object.values(r).some(Boolean));
    data.files = cur.files || []; data.logo = cur.logo || null; data.letterheadFile = cur.letterheadFile || null;
    $("asSave").disabled = true; busyNote("جارٍ الحفظ…");
    try {
      if (curId) await db.collection("associations").doc(curId).set(data, { merge: true });
      else { data.createdAt = data.updatedAt; data.createdBy = me; const id = "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await db.collection("associations").doc(id).set(data); curId = id; }
      cur = { ...cur, ...data }; dirty = false; busyNote("حُفظت " + new Intl.DateTimeFormat("ar-SA-u-nu-latn", { hour: "numeric", minute: "2-digit" }).format(new Date())); renderForm(); UI.toast("حُفظت بيانات الجمعية");
    } catch (e){ console.error(e); busyNote("تعذّر الحفظ"); UI.toast("تعذّر الحفظ", "err"); }
    finally { $("asSave").disabled = false; }
  }
  async function remove(){
    const a = byId(curId); if (!a) return;
    if (!(await UI.confirm(`حذف «${a.name}» من قاعدة الجمعيات نهائياً؟ تُحذف معها كليشتها المحفوظة في مكتبة اللوائح. الخطابات والوثائق السابقة لا تتأثر.`, { ok: "حذف", danger: true }))) return;
    try {
      for (let i = 0; i < (a.lhChunks || 0); i++) await db.collection("letterheads").doc(`${a.id}_${i}`).delete().catch(() => {});
      await db.collection("associations").doc(a.id).delete();
      cur = null; curId = null; dirty = false; renderList(); UI.toast("حُذفت الجمعية");
    } catch (e){ console.error(e); UI.toast("تعذّر الحذف", "err"); }
  }
  $("asNew").addEventListener("click", () => open(null));
  $("asBack").addEventListener("click", close);
  $("asSave").addEventListener("click", save);
  $("asDel").addEventListener("click", remove);
  $("asQ").addEventListener("input", renderList);
  $("asFRegion").addEventListener("change", renderList);
  GROUPS[0].fields.find(f => f.k === "region").options.forEach(r => $("asFRegion").append(new Option(r, r)));
  window.addEventListener("beforeunload", e => { if (dirty) e.preventDefault(); });

  function connect({ db: d, user }){
    if (unsub){ unsub(); unsub = null; }
    db = d; me = user ? user.email : ""; items = []; loaded = false; canWrite = false;
    if (!db){ cur = null; renderList(); return; }
    db.collection("allowed").doc(me).get().then(a => {
      const p = a.exists ? a.data() : {}; canWrite = p.role === "admin" || !p.sections || p.sections.includes("governance");
      renderList(); if (cur) renderForm();
    }).catch(() => {});
    unsub = db.collection("associations").onSnapshot(s => {
      items = s.docs.map(x => ({ id: x.id, ...x.data() })); loaded = true; renderList();
      window.dispatchEvent(new CustomEvent("app:assocs", { detail: items }));
    }, e => { console.error(e); loaded = true; renderList(); });
    renderList();
  }
  window.addEventListener("app:db", e => connect(e.detail));
  if (window.appDb) connect({ db: window.appDb, user: window.appUser });
  renderList();
})();
