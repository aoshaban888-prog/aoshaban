/* إدارة المشاريع › منشئ وثائق المبادرات: write an initiative charter section by section, see the document as it will print,
   save it (Firestore "initiatives"), print it or save it as PDF, or download it for Word.
   Everyone with the «projects» section reads all initiatives; the owner (or an admin) edits and deletes. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LEVELS = ["منخفض", "متوسط", "مرتفع"];
  const STATUS = { draft: "مسودة", review: "قيد المراجعة", approved: "معتمدة", closed: "مغلقة" };
  const PRIORITY = ["منخفضة", "متوسطة", "عالية", "حرجة"];

  /* the charter: each part is fields, lists of lines, or a table */
  const PARTS = [
    { key: "basic", title: "البيانات الأساسية", fields: [
      { k: "title", label: "اسم المبادرة", wide: true, ph: "مثال: برنامج تأهيل القيادات الشابة" },
      { k: "code", label: "رمز المبادرة", ph: "INI-2026-01" },
      { k: "program", label: "البرنامج أو المشروع التابع له" },
      { k: "strategic", label: "الهدف الاستراتيجي المرتبط", wide: true },
      { k: "unit", label: "الجهة المالكة" },
      { k: "manager", label: "مدير المبادرة" },
      { k: "sponsor", label: "راعي المبادرة" },
      { k: "beneficiaries", label: "الفئة المستفيدة" },
      { k: "start", label: "تاريخ البدء", type: "date" },
      { k: "end", label: "تاريخ الانتهاء", type: "date" },
      { k: "priority", label: "الأولوية", type: "select", options: PRIORITY },
      { k: "status", label: "حالة الوثيقة", type: "select", options: Object.keys(STATUS), labels: STATUS },
    ] },
    { key: "desc", title: "الوصف والمبررات", fields: [
      { k: "description", label: "وصف المبادرة", type: "area", wide: true, ph: "ما المبادرة باختصار؟" },
      { k: "problem", label: "المشكلة أو الحاجة", type: "area", wide: true, ph: "ما الذي يدفع إلى هذه المبادرة؟" },
      { k: "justification", label: "المبررات والأثر المتوقع", type: "area", wide: true },
    ] },
    { key: "objectives", title: "الأهداف", lists: [{ k: "objectives", label: "الأهداف", ph: "هدف قابل للقياس" }] },
    { key: "scope", title: "النطاق", lists: [{ k: "inScope", label: "داخل النطاق", ph: "عمل يشمله النطاق" }, { k: "outScope", label: "خارج النطاق", ph: "عمل لا يشمله النطاق" }] },
    { key: "deliverables", title: "المخرجات", lists: [{ k: "deliverables", label: "المخرجات", ph: "مخرج يُسلَّم" }] },
    { key: "kpis", title: "مؤشرات الأداء", table: { k: "kpis", cols: [{ k: "name", label: "المؤشر", w: 3 }, { k: "base", label: "خط الأساس" }, { k: "target", label: "المستهدف" }, { k: "unit", label: "الوحدة" }, { k: "freq", label: "دورية القياس", type: "select", options: ["شهري", "ربع سنوي", "نصف سنوي", "سنوي", "عند الانتهاء"] }] } },
    { key: "phases", title: "المراحل والخطة الزمنية", table: { k: "phases", cols: [{ k: "name", label: "المرحلة أو النشاط", w: 3 }, { k: "from", label: "من", type: "date" }, { k: "to", label: "إلى", type: "date" }, { k: "owner", label: "المسؤول" }] } },
    { key: "budget", title: "الميزانية التقديرية", table: { k: "budget", total: "cost", cols: [{ k: "item", label: "البند", w: 3 }, { k: "cost", label: "التكلفة (ريال)", type: "number" }, { k: "note", label: "ملاحظة", w: 2 }] } },
    { key: "stakeholders", title: "أصحاب المصلحة", table: { k: "stakeholders", cols: [{ k: "name", label: "الجهة أو الشخص", w: 2 }, { k: "role", label: "الدور أو العلاقة", w: 2 }] } },
    { key: "team", title: "فريق العمل", table: { k: "team", cols: [{ k: "name", label: "الاسم", w: 2 }, { k: "role", label: "الدور", w: 2 }] } },
    { key: "risks", title: "المخاطر", table: { k: "risks", cols: [{ k: "risk", label: "الخطر", w: 3 }, { k: "prob", label: "الاحتمال", type: "select", options: LEVELS }, { k: "impact", label: "الأثر", type: "select", options: LEVELS }, { k: "plan", label: "خطة المعالجة", w: 3 }] } },
    { key: "assume", title: "الافتراضات والقيود", lists: [{ k: "assumptions", label: "الافتراضات", ph: "افتراض" }, { k: "constraints", label: "القيود", ph: "قيد" }] },
    { key: "approvals", title: "الاعتماد", table: { k: "approvals", cols: [{ k: "role", label: "الصفة", w: 2 }, { k: "name", label: "الاسم", w: 2 }] } },
  ];
  const blank = () => ({ title: "", status: "draft", priority: "متوسطة", objectives: [""], inScope: [""], outScope: [], deliverables: [""], kpis: [{}], phases: [{}], budget: [{}], stakeholders: [], team: [], risks: [{}], assumptions: [], constraints: [],
    approvals: [{ role: "إعداد", name: "" }, { role: "مراجعة", name: "" }, { role: "اعتماد", name: "" }] });

  let db = null, me = "", myName = "", admin = false, items = [], unsub = null, loaded = false;
  let cur = null, curId = null, saveT = null, dirty = false, saving = false;

  /* ---------- small helpers ---------- */
  const filled = v => Array.isArray(v) ? v.some(x => typeof x === "string" ? x.trim() : Object.values(x || {}).some(y => String(y ?? "").trim())) : String(v ?? "").trim() !== "";
  function partDone(p, d){
    if (p.fields) return p.fields.filter(f => f.k !== "status" && f.k !== "priority").every(f => filled(d[f.k]));
    if (p.lists) return p.lists.every(l => filled(d[l.k]));
    return filled(d[p.table.k]);
  }
  const completeness = d => Math.round(PARTS.filter(p => partDone(p, d)).length / PARTS.length * 100);
  const canEdit = d => !d || !d.owner || admin || d.owner === me;
  const money = n => new Intl.NumberFormat("ar-SA-u-nu-latn", { maximumFractionDigits: 2 }).format(n || 0);
  const day = s => s ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(new Date(s + "T12:00:00")) : "";
  const when = iso => iso ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "";
  const total = (rows, k) => (rows || []).reduce((s, r) => s + (+String((r || {})[k] ?? "").replace(/[^\d.]/g, "") || 0), 0);

  /* ---------- the document, as printed ---------- */
  function docHtml(d){
    const s = window.siteSettings || {}, logo = s.logo || "";
    const lines = a => (a || []).filter(x => String(x).trim());
    const rows = (a, cols) => (a || []).filter(r => cols.some(c => String((r || {})[c.k] ?? "").trim()));
    let n = 0;
    const sec = (title, body) => body ? `<section class="ini-s"><h2><span>${++n}</span>${esc(title)}</h2>${body}</section>` : "";
    const para = t => String(t || "").trim() ? `<p>${esc(t).replace(/\n/g, "<br>")}</p>` : "";
    const ul = (a, ordered) => lines(a).length ? `<${ordered ? "ol" : "ul"}>${lines(a).map(x => `<li>${esc(x)}</li>`).join("")}</${ordered ? "ol" : "ul"}>` : "";
    const table = (t, a) => { const r = rows(a, t.cols); if (!r.length) return "";
      const fmt = (c, v) => c.type === "date" ? day(v) : c.type === "number" && String(v ?? "").trim() ? money(+String(v).replace(/[^\d.]/g, "")) : esc(v);
      return `<table><thead><tr><th class="n">#</th>${t.cols.map(c => `<th>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${r.map((x, i) => `<tr><td class="n">${i + 1}</td>${t.cols.map(c => `<td>${fmt(c, x[c.k])}</td>`).join("")}</tr>`).join("")}</tbody>${t.total ? `<tfoot><tr><td></td><td>الإجمالي</td><td>${money(total(r, t.total))}</td>${t.cols.slice(2).map(() => "<td></td>").join("")}</tr></tfoot>` : ""}</table>`; };
    const sub = (label, html) => html ? `<h3>${esc(label)}</h3>${html}` : "";
    const meta = [["رمز المبادرة", d.code], ["البرنامج أو المشروع", d.program], ["الهدف الاستراتيجي", d.strategic], ["الجهة المالكة", d.unit], ["مدير المبادرة", d.manager], ["راعي المبادرة", d.sponsor], ["الفئة المستفيدة", d.beneficiaries],
      ["المدة", d.start || d.end ? `${day(d.start) || "—"} إلى ${day(d.end) || "—"}` : ""], ["الأولوية", d.priority], ["الميزانية التقديرية", total(d.budget, "cost") ? money(total(d.budget, "cost")) + " ريال" : ""]].filter(x => String(x[1] || "").trim());
    const T = Object.fromEntries(PARTS.filter(p => p.table).map(p => [p.key, p.table]));
    const appr = rows(d.approvals, T.approvals.cols);
    return `<header class="ini-hd">${logo ? `<img src="${esc(logo)}" alt="">` : ""}<div><b>${esc(s.siteName || "")}</b><span>وثيقة مبادرة${d.status ? " · " + esc(STATUS[d.status] || "") : ""}</span></div></header>
      <h1 class="ini-t">${esc(d.title || "اسم المبادرة")}</h1>
      ${meta.length ? `<dl class="ini-meta">${meta.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
      ${sec("الوصف والمبررات", sub("وصف المبادرة", para(d.description)) + sub("المشكلة أو الحاجة", para(d.problem)) + sub("المبررات والأثر المتوقع", para(d.justification)))}
      ${sec("الأهداف", ul(d.objectives, true))}
      ${sec("النطاق", sub("داخل النطاق", ul(d.inScope)) + sub("خارج النطاق", ul(d.outScope)))}
      ${sec("المخرجات", ul(d.deliverables, true))}
      ${sec("مؤشرات الأداء", table(T.kpis, d.kpis))}
      ${sec("المراحل والخطة الزمنية", table(T.phases, d.phases))}
      ${sec("الميزانية التقديرية", table(T.budget, d.budget))}
      ${sec("أصحاب المصلحة", table(T.stakeholders, d.stakeholders))}
      ${sec("فريق العمل", table(T.team, d.team))}
      ${sec("المخاطر", table(T.risks, d.risks))}
      ${sec("الافتراضات والقيود", sub("الافتراضات", ul(d.assumptions)) + sub("القيود", ul(d.constraints)))}
      ${appr.length ? `<section class="ini-s ini-sign"><h2><span>${++n}</span>الاعتماد</h2><div class="ini-signs">${appr.map(a => `<div><b>${esc(a.role)}</b><span>${esc(a.name) || "&nbsp;"}</span><i>التوقيع</i><i>التاريخ</i></div>`).join("")}</div></section>` : ""}`;
  }

  /* ---------- the editor ---------- */
  function inputHtml(f, v, path){
    const ph = f.ph ? ` placeholder="${esc(f.ph)}"` : "";
    if (f.type === "area") return `<textarea class="input" rows="3" data-p="${path}"${ph}>${esc(v)}</textarea>`;
    if (f.type === "select") return `<select class="select" data-p="${path}"><option value=""></option>${f.options.map(o => `<option value="${esc(o)}"${o === v ? " selected" : ""}>${esc(f.labels ? f.labels[o] : o)}</option>`).join("")}</select>`;
    return `<input class="input" type="${f.type === "date" ? "date" : "text"}"${f.type === "number" ? ' inputmode="decimal"' : ""} data-p="${path}" value="${esc(v)}"${ph}>`;
  }
  const RM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  function partBody(p, d){
    if (p.fields) return `<div class="ini-grid">${p.fields.map(f => `<label class="ini-f${f.wide ? " wide" : ""}"><span>${esc(f.label)}</span>${inputHtml(f, d[f.k] ?? "", f.k)}</label>`).join("")}</div>`;
    if (p.lists) return p.lists.map(l => `<div class="ini-list"><span class="ini-lh">${esc(l.label)}</span>${(d[l.k] || []).map((v, i) => `<div class="ini-li"><span class="ini-n">${i + 1}</span><input class="input" data-p="${l.k}.${i}" value="${esc(v)}" placeholder="${esc(l.ph)}"><button type="button" class="ini-rm" data-rm="${l.k}.${i}" aria-label="حذف">${RM}</button></div>`).join("")}<button type="button" class="ini-add" data-add="${l.k}">+ إضافة</button></div>`).join("");
    const t = p.table, a = d[t.k] || [];
    const tpl = t.cols.map(c => (c.w || 1) + "fr").join(" ") + " 32px";
    return `<div class="ini-tbl" style="--cols:${tpl}"><div class="ini-tr ini-th">${t.cols.map(c => `<span>${esc(c.label)}</span>`).join("")}<span></span></div>${a.map((r, i) => `<div class="ini-tr">${t.cols.map(c => `<label><span class="ini-cl">${esc(c.label)}</span>${inputHtml(c, (r || {})[c.k] ?? "", `${t.k}.${i}.${c.k}`)}</label>`).join("")}<button type="button" class="ini-rm" data-rm="${t.k}.${i}" aria-label="حذف الصف">${RM}</button></div>`).join("")}</div>
      ${t.total ? `<p class="ini-total">الإجمالي: <b data-total="${t.k}">${money(total(a, t.total))}</b> ريال</p>` : ""}<button type="button" class="ini-add" data-add="${t.k}">+ إضافة صف</button>`;
  }
  let openParts = new Set(["basic"]);
  function renderForm(){
    const box = $("iniForm"), ro = !canEdit(cur);
    box.innerHTML = PARTS.map((p, i) => `<details class="ini-part${partDone(p, cur) ? " done" : ""}" data-part="${p.key}"${openParts.has(p.key) ? " open" : ""}><summary><span class="ini-pn">${i + 1}</span><b>${esc(p.title)}</b><span class="ini-ok" aria-label="مكتمل"></span></summary><fieldset ${ro ? "disabled" : ""}>${partBody(p, cur)}</fieldset></details>`).join("");
    box.querySelectorAll("details").forEach(dt => dt.addEventListener("toggle", () => { dt.open ? openParts.add(dt.dataset.part) : openParts.delete(dt.dataset.part); }));
    $("iniRO").hidden = !ro;
    meter();
  }
  function meter(){
    const c = completeness(cur);
    $("iniPct").textContent = c + "%"; $("iniBar").style.width = c + "%";
    $("iniForm").querySelectorAll("details").forEach(dt => { const p = PARTS.find(x => x.key === dt.dataset.part); dt.classList.toggle("done", partDone(p, cur)); });
  }
  let pvT = 0;
  function renderPreview(){ clearTimeout(pvT); pvT = setTimeout(() => { $("iniDoc").innerHTML = docHtml(cur); }, 60); }
  function setPath(path, v){
    const ks = path.split("."); let o = cur;
    for (let i = 0; i < ks.length - 1; i++){ const k = /^\d+$/.test(ks[i]) ? +ks[i] : ks[i]; if (o[k] == null) o[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[k]; }
    o[/^\d+$/.test(ks.at(-1)) ? +ks.at(-1) : ks.at(-1)] = v;
  }
  $("iniForm").addEventListener("input", e => {
    const p = e.target.dataset.p; if (!p) return;
    setPath(p, e.target.value);
    const tk = p.split(".")[0], part = PARTS.find(x => x.table && x.table.k === tk && x.table.total);
    if (part){ const b = $("iniForm").querySelector(`[data-total="${tk}"]`); if (b) b.textContent = money(total(cur[tk], part.table.total)); }
    if (p === "title") $("iniName").textContent = e.target.value.trim() || "مبادرة جديدة";
    changed();
  });
  $("iniForm").addEventListener("change", e => { if (e.target.tagName === "SELECT" && e.target.dataset.p){ setPath(e.target.dataset.p, e.target.value); changed(); } });
  $("iniForm").addEventListener("click", e => {
    const add = e.target.closest("[data-add]"), rm = e.target.closest("[data-rm]");
    if (add){ const k = add.dataset.add, isList = PARTS.some(p => p.lists && p.lists.some(l => l.k === k)); (cur[k] ||= []).push(isList ? "" : {}); renderForm(); changed();
      const last = [...$("iniForm").querySelectorAll(`[data-p^="${k}.${cur[k].length - 1}"]`)][0]; if (last) last.focus(); }
    if (rm){ const [k, i] = rm.dataset.rm.split("."); cur[k].splice(+i, 1); renderForm(); changed(); }
  });
  function changed(){ dirty = true; meter(); renderPreview(); setSave("لم يُحفظ بعد"); clearTimeout(saveT); if (curId || (cur.title || "").trim()) saveT = setTimeout(save, 1200); }
  function setSave(t){ $("iniSaved").textContent = t; }

  /* ---------- saving ---------- */
  async function save(){
    if (!db || !cur || !canEdit(cur) || saving) return;
    if (!(cur.title || "").trim()){ setSave("اكتب اسم المبادرة ليُحفظ"); return; }
    saving = true; clearTimeout(saveT); setSave("جارٍ الحفظ…");
    const now = new Date().toISOString();
    const data = JSON.parse(JSON.stringify({ ...cur, updatedAt: now, updatedBy: me }));
    delete data.id;
    try {
      if (curId) await db.collection("initiatives").doc(curId).set(data);
      else { data.owner = me; data.ownerName = myName; data.createdAt = now; const ref = await db.collection("initiatives").add(data); curId = ref.id; cur.owner = me; cur.ownerName = myName; cur.createdAt = now; }
      dirty = false; setSave("حُفظ " + new Intl.DateTimeFormat("ar-SA-u-nu-latn", { hour: "numeric", minute: "2-digit" }).format(new Date()));
    } catch (e){ console.error(e); setSave("تعذّر الحفظ"); UI.toast("تعذّر حفظ الوثيقة", "err"); }
    finally { saving = false; if (dirty) saveT = setTimeout(save, 800); }
  }

  /* ---------- the list ---------- */
  function renderList(){
    const box = $("iniCards"); if (!box) return;
    $("iniSignin").hidden = !!db; $("iniHome").hidden = !db || !!cur; $("iniEditor").hidden = !cur;
    if (!db || cur) return;
    const q = $("iniQ").value.trim(), fs = $("iniFStatus").value;
    const list = items.filter(d => (!q || [d.title, d.code, d.manager, d.program, d.unit].some(x => (x || "").includes(q))) && (!fs || d.status === fs))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    $("iniCount").textContent = `${list.length} من ${items.length}`;
    $("iniEmpty").hidden = !loaded || list.length > 0;
    $("iniEmpty").textContent = items.length ? "لا توجد وثائق تطابق البحث" : "لا توجد وثائق مبادرات بعد. ابدأ بوثيقة جديدة.";
    box.innerHTML = "";
    list.forEach(d => {
      const c = completeness(d), el = document.createElement("article"); el.className = "ini-card"; el.tabIndex = 0;
      el.innerHTML = `<div class="ini-ch"><span class="ini-st ${esc(d.status || "draft")}">${esc(STATUS[d.status] || "مسودة")}</span>${d.code ? `<span class="ini-code">${esc(d.code)}</span>` : ""}</div>
        <h3>${esc(d.title)}</h3><p>${esc([d.manager, d.unit].filter(Boolean).join(" · ") || "—")}</p>
        <div class="ini-cp"><span class="pbar ${c >= 100 ? "done" : c >= 50 ? "good" : "mid"}"><i style="width:${c}%"></i></span><span>${c}%</span></div>
        <div class="ini-cf"><span>${d.start || d.end ? esc(`${day(d.start) || "—"} ← ${day(d.end) || "—"}`) : "حُدّثت " + esc(when(d.updatedAt))}</span><span class="ini-acts"></span></div>`;
      const acts = el.querySelector(".ini-acts");
      const btn = (label, fn, danger) => { const b = document.createElement("button"); b.type = "button"; b.className = "linkbtn" + (danger ? " danger-text" : ""); b.textContent = label; b.addEventListener("click", e => { e.stopPropagation(); fn(); }); acts.append(b); };
      btn("نسخ", () => duplicate(d));
      if (canEdit(d)) btn("حذف", () => remove(d), true);
      el.addEventListener("click", () => open(d.id));
      el.addEventListener("keydown", e => { if (e.key === "Enter" && e.target === el) open(d.id); });
      box.append(el);
    });
  }
  function open(id){
    const d = id ? items.find(x => x.id === id) : null;
    if (id && !d) return;
    cur = d ? { ...blank(), ...JSON.parse(JSON.stringify(d)) } : blank(); curId = d ? d.id : null; dirty = false;
    openParts = new Set(["basic"]);
    $("iniName").textContent = cur.title || "مبادرة جديدة";
    setSave(d ? "حُفظ" : "لم يُحفظ بعد");
    renderList(); renderForm(); $("iniDoc").innerHTML = docHtml(cur); window.scrollTo(0, 0);
    if (!d) setTimeout(() => { const t = $("iniForm").querySelector('[data-p="title"]'); if (t) t.focus(); }, 50);
  }
  async function close(){
    if (dirty && cur && canEdit(cur)){ if ((cur.title || "").trim()) await save(); else if (!(await UI.confirm("الوثيقة بدون اسم ولن تُحفظ. الخروج؟", { ok: "خروج" }))) return; }
    cur = null; curId = null; dirty = false; renderList();
  }
  async function duplicate(d){
    if (!db) return;
    const now = new Date().toISOString(), copy = JSON.parse(JSON.stringify(d)); delete copy.id;
    Object.assign(copy, { title: d.title + " (نسخة)", status: "draft", owner: me, ownerName: myName, createdAt: now, updatedAt: now, updatedBy: me });
    try { await db.collection("initiatives").add(copy); UI.toast("نُسخت الوثيقة"); } catch (e){ console.error(e); UI.toast("تعذّر النسخ", "err"); }
  }
  async function remove(d){
    if (!(await UI.confirm(`حذف وثيقة «${d.title}» نهائياً؟`, { ok: "حذف", danger: true }))) return;
    try { await db.collection("initiatives").doc(d.id).delete(); if (curId === d.id){ cur = null; curId = null; renderList(); } UI.toast("حُذفت الوثيقة"); } catch (e){ console.error(e); UI.toast("تعذّر الحذف", "err"); }
  }

  /* ---------- print / PDF / Word ---------- */
  const fileName = () => ((cur.code ? cur.code + " - " : "") + (cur.title || "وثيقة مبادرة")).replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 120);
  function print(){
    const area = $("iniPrint"); area.innerHTML = `<article class="ini-doc print">${docHtml(cur)}</article>`;
    const t = document.title; document.title = fileName();
    document.body.classList.add("printing-ini");
    const done = () => { document.body.classList.remove("printing-ini"); area.innerHTML = ""; document.title = t; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    setTimeout(() => window.print(), 80);
  }
  function word(){
    const css = `body{font-family:Arial,sans-serif;direction:rtl;font-size:12pt;line-height:1.6}h1{font-size:20pt}h2{font-size:14pt;border-bottom:1px solid #999;padding-bottom:4px;margin-top:18pt}h3{font-size:12pt}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4px 6px;text-align:right}th{background:#eee}dl div{margin:2px 0}dt{display:inline;font-weight:bold}dt:after{content:": "}dd{display:inline;margin:0}.ini-hd img{height:48px}.ini-signs div{display:inline-block;width:30%;vertical-align:top;margin-left:2%}.ini-signs b,.ini-signs span,.ini-signs i{display:block}`;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(fileName())}</title><style>${css}</style></head><body dir="rtl">${docHtml(cur)}</body></html>`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + html], { type: "application/msword" })); a.download = fileName() + ".doc";
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------- wiring ---------- */
  $("iniNew").addEventListener("click", () => open(null));
  $("iniBack").addEventListener("click", close);
  $("iniSave").addEventListener("click", save);
  $("iniPrintBtn").addEventListener("click", print);
  $("iniWord").addEventListener("click", word);
  $("iniQ").addEventListener("input", renderList);
  $("iniFStatus").addEventListener("change", renderList);
  $("iniTabs").addEventListener("click", e => { const b = e.target.closest("[data-initab]"); if (!b) return;
    document.querySelectorAll("[data-initab]").forEach(x => x.setAttribute("aria-selected", x === b ? "true" : "false"));
    $("iniEditor").dataset.pane = b.dataset.initab; });
  window.addEventListener("beforeunload", e => { if (dirty && cur && (cur.title || "").trim()){ save(); e.preventDefault(); } });
  window.addEventListener("app:view", e => { if (e.detail !== "projects/initiatives" && cur && dirty) save(); });
  window.addEventListener("app:settings", () => { if (cur) renderPreview(); });

  function connect({ db: d, user }){
    if (unsub){ unsub(); unsub = null; }
    db = d; me = user ? user.email : ""; myName = (user && user.displayName) || (me || "").split("@")[0]; items = []; loaded = false;
    if (!db){ cur = null; renderList(); return; }
    db.collection("allowed").doc(me).get().then(a => { admin = a.exists && a.data().role === "admin"; renderList(); }).catch(() => {});
    unsub = db.collection("initiatives").onSnapshot(s => {
      items = s.docs.map(x => ({ id: x.id, ...x.data() })); loaded = true; renderList();
    }, e => { console.error(e); loaded = true; renderList(); });
    renderList();
  }
  window.addEventListener("app:db", e => connect(e.detail));
  if (window.appDb) connect({ db: window.appDb, user: window.appUser });
  renderList();
})();
