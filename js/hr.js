/* الموارد البشرية ← الخطابات: letter templates with {{fields}}, an A4 preview, print / save as PDF,
   and a log of issued letters with an automatic outgoing number (001/1448, restarting each Hijri year).
   Firestore: hrTemplates/{id} { title, category, body, order }   hrLetters/{id} { ref, no, year, ... }   hrMeta/counter { year, last } */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const FIELD_RX = /\{\{\s*([^{}]+?)\s*\}\}/g;
  const ASSOC_FIELD = "اسم الجمعية";
  const CATS = ["التعريف والشهادات", "التوظيف", "الانضباط وانتهاء الخدمة", "أخرى"];

  const DEFAULT_TEMPLATES = [
    { order: 1, category: "التعريف والشهادات", title: "تعريف بالراتب", body:
`إلى: {{الجهة الموجه لها}}                                    المحترمين

السلام عليكم ورحمة الله وبركاته، وبعد:

تشهد {{اسم الجمعية}} بأن الموظف/ـة {{اسم الموظف}}، {{الجنسية}} الجنسية، ويحمل هوية رقم {{رقم الهوية}}، يعمل لديها بوظيفة {{المسمى الوظيفي}} منذ تاريخ {{تاريخ التعيين}}، ولا يزال على رأس العمل حتى تاريخه.

ويتقاضى راتباً شهرياً إجمالياً قدره {{إجمالي الراتب}} ريال، تفصيله: الراتب الأساسي {{الراتب الأساسي}} ريال، والبدلات {{البدلات}} ريال.

وقد أُعطي هذا التعريف بناءً على طلبه، دون أدنى مسؤولية على الجمعية.

وتقبلوا وافر التحية والتقدير،` },
    { order: 2, category: "التعريف والشهادات", title: "تعريف بدون راتب", body:
`إلى: {{الجهة الموجه لها}}                                    المحترمين

السلام عليكم ورحمة الله وبركاته، وبعد:

تشهد {{اسم الجمعية}} بأن الموظف/ـة {{اسم الموظف}}، {{الجنسية}} الجنسية، ويحمل هوية رقم {{رقم الهوية}}، يعمل لديها بوظيفة {{المسمى الوظيفي}} منذ تاريخ {{تاريخ التعيين}}، ولا يزال على رأس العمل حتى تاريخه.

وقد أُعطي هذا التعريف بناءً على طلبه، دون أدنى مسؤولية على الجمعية.

وتقبلوا وافر التحية والتقدير،` },
    { order: 3, category: "التعريف والشهادات", title: "شهادة خبرة", body:
`تشهد {{اسم الجمعية}} بأن {{اسم الموظف}}، {{الجنسية}} الجنسية، ويحمل هوية رقم {{رقم الهوية}}، قد عمل لديها بوظيفة {{المسمى الوظيفي}} خلال الفترة من {{تاريخ التعيين}} إلى {{تاريخ انتهاء الخدمة}}.

وكان خلال فترة عمله مثالاً للجد والانضباط وحسن التعامل، وقد أدّى المهام الموكلة إليه على الوجه المطلوب.

وقد أُعطيت له هذه الشهادة بناءً على طلبه دون أدنى مسؤولية على الجمعية، متمنين له دوام التوفيق والسداد.` },
    { order: 4, category: "التوظيف", title: "عرض وظيفي", body:
`المكرم/ {{اسم الموظف}}                                    المحترم

السلام عليكم ورحمة الله وبركاته، وبعد:

يسر {{اسم الجمعية}} أن تقدم لكم عرضها للعمل لديها بوظيفة {{المسمى الوظيفي}}، وفق الشروط التالية:

١. الراتب الأساسي: {{الراتب الأساسي}} ريال شهرياً.
٢. بدل السكن: {{بدل السكن}} ريال شهرياً.
٣. بدل النقل: {{بدل النقل}} ريال شهرياً.
٤. مدة العقد: {{مدة العقد}}، تبدأ من تاريخ المباشرة.
٥. فترة التجربة: تسعون يوماً وفق نظام العمل.
٦. تاريخ المباشرة المتوقع: {{تاريخ المباشرة}}.

نأمل إفادتنا بموافقتكم على هذا العرض في موعد أقصاه {{آخر موعد للرد}}، ويُعد العرض لاغياً بعد ذلك.

وتقبلوا وافر التحية والتقدير،` },
    { order: 5, category: "التوظيف", title: "قرار تعيين", body:
`إن {{صفة المعتمد}}، بناءً على الصلاحيات المخولة له، وعلى ما تقتضيه مصلحة العمل،

يقرر ما يلي:

أولاً: تعيين {{اسم الموظف}}، هوية رقم {{رقم الهوية}}، بوظيفة {{المسمى الوظيفي}}، براتب أساسي قدره {{الراتب الأساسي}} ريال شهرياً، اعتباراً من تاريخ {{تاريخ المباشرة}}.

ثانياً: يخضع الموظف لفترة تجربة مدتها تسعون يوماً وفق نظام العمل.

ثالثاً: يُبلّغ هذا القرار لمن يلزم لإنفاذه.` },
    { order: 6, category: "التوظيف", title: "مباشرة عمل", body:
`نفيد بأن الموظف/ـة {{اسم الموظف}}، هوية رقم {{رقم الهوية}}، قد باشر عمله لدى {{اسم الجمعية}} بوظيفة {{المسمى الوظيفي}} اعتباراً من تاريخ {{تاريخ المباشرة}}.

وعليه جرى التوقيع.` },
    { order: 7, category: "الانضباط وانتهاء الخدمة", title: "لفت نظر", body:
`المكرم/ {{اسم الموظف}}                                    المحترم
الوظيفة: {{المسمى الوظيفي}}

السلام عليكم ورحمة الله وبركاته، وبعد:

نود لفت نظركم إلى ما بدر منكم بتاريخ {{تاريخ المخالفة}}، وهو: {{وصف المخالفة}}، مما يتعارض مع لائحة تنظيم العمل المعتمدة في الجمعية.

ونأمل منكم الالتزام وعدم تكرار ذلك مستقبلاً، علماً بأن تكرار المخالفة يعرّضكم للجزاءات المنصوص عليها في اللائحة.

والله الموفق،` },
    { order: 8, category: "الانضباط وانتهاء الخدمة", title: "إنذار كتابي", body:
`المكرم/ {{اسم الموظف}}                                    المحترم
الوظيفة: {{المسمى الوظيفي}}

السلام عليكم ورحمة الله وبركاته، وبعد:

إشارة إلى ما بدر منكم بتاريخ {{تاريخ المخالفة}}، وهو: {{وصف المخالفة}}، وبعد الاطلاع على إفادتكم، فإن الجمعية توجه إليكم بموجب هذا الخطاب الإنذار الكتابي {{رقم الإنذار}}، وفق لائحة تنظيم العمل المعتمدة.

ونهيب بكم الالتزام التام بأنظمة العمل ولوائحه، علماً بأن تكرار المخالفة يعرّضكم لجزاء أشد.

والله الموفق،` },
    { order: 9, category: "الانضباط وانتهاء الخدمة", title: "قبول استقالة", body:
`المكرم/ {{اسم الموظف}}                                    المحترم

السلام عليكم ورحمة الله وبركاته، وبعد:

إشارة إلى استقالتكم المقدمة بتاريخ {{تاريخ تقديم الاستقالة}}، نفيدكم بقبولها، على أن يكون آخر يوم عمل لكم {{تاريخ انتهاء الخدمة}}، وستُصرف مستحقاتكم النظامية وفق نظام العمل بعد إخلاء طرفكم.

شاكرين لكم ما قدمتموه خلال فترة عملكم، ومتمنين لكم التوفيق.` },
    { order: 10, category: "الانضباط وانتهاء الخدمة", title: "إنهاء خدمة", body:
`المكرم/ {{اسم الموظف}}                                    المحترم
الوظيفة: {{المسمى الوظيفي}}

السلام عليكم ورحمة الله وبركاته، وبعد:

نشعركم بإنهاء خدمتكم لدى {{اسم الجمعية}} اعتباراً من تاريخ {{تاريخ انتهاء الخدمة}}، وذلك {{سبب الإنهاء}}، استناداً إلى المادة {{رقم المادة}} من نظام العمل.

وستُصرف مستحقاتكم النظامية بعد إخلاء طرفكم وتسليم ما بعهدتكم.

والله الموفق،` },
  ];

  let db = null, me = "", templates = [], letters = [], assocs = [], seeding = false;
  const SIGN_KEY = "app-hr-sign";
  let sign = { name: "", role: "" };
  try { sign = { ...sign, ...JSON.parse(localStorage.getItem(SIGN_KEY) || "{}") }; } catch {}
  const values = {};

  /* ---------- dates ---------- */
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDay = s => s ? new Date(s + "T12:00:00") : new Date();
  const hijri = d => new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d).replace(/\s*هـ$/, "");
  const greg = d => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  const hijriYear = d => +new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { year: "numeric" }).format(d).replace(/\D/g, "");
  const fmtDateField = s => { const d = new Date(s + "T12:00:00"); return isNaN(d) ? s : `${hijri(d)} هـ الموافق ${greg(d)} م`; };

  /* ---------- fields ---------- */
  function fieldsOf(body){ const out = []; for (const m of (body || "").matchAll(FIELD_RX)){ const f = m[1]; if (f !== ASSOC_FIELD && f !== "صفة المعتمد" && f !== "اسم المعتمد" && !out.includes(f)) out.push(f); } return out; }
  const kind = f => /تاريخ/.test(f) ? "date" : /راتب|بدل|مبلغ|البدلات/.test(f) ? "number" : /وصف|سبب/.test(f) ? "long" : "text";
  function fieldValue(f, vals){
    const v = (vals[f] ?? "").toString().trim();
    if (!v) return null;
    if (kind(f) === "date") return fmtDateField(v);
    if (kind(f) === "number" && !isNaN(+v)) return (+v).toLocaleString("en-US");
    return v;
  }

  /* ---------- render a letter (preview, print, reprint) ---------- */
  function letterHtml(L){
    const vals = { ...L.fields, [ASSOC_FIELD]: L.assoc, "صفة المعتمد": L.signRole, "اسم المعتمد": L.signName };
    const fill = text => esc(text).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, f) => {
      const raw = f.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
      const v = raw === ASSOC_FIELD || raw === "صفة المعتمد" || raw === "اسم المعتمد" ? (vals[raw] || "").trim() || null : fieldValue(raw, vals);
      return v ? `<span class="lt-v">${esc(v)}</span>` : `<span class="lt-blank">${esc(raw)}</span>`;
    });
    const body = (L.body || "").split(/\n\s*\n/).map(p => `<p>${fill(p).replace(/\n/g, "<br>")}</p>`).join("");
    const d = parseDay(L.date);
    return `<header class="lt-head"><div class="lt-org">${esc(L.assoc || "")}</div>
      <dl class="lt-meta"><div><dt>الرقم</dt><dd><bdi>${esc(L.ref || "يُعطى عند الحفظ")}</bdi></dd></div>
      <div><dt>التاريخ</dt><dd>${hijri(d)} هـ</dd></div><div><dt>الموافق</dt><dd>${greg(d)} م</dd></div></dl></header>
      <h2 class="lt-title">${esc(L.title || "")}</h2>
      <div class="lt-body">${body}</div>
      <footer class="lt-sign"><div class="lt-role">${esc(L.signRole || "")}</div><div class="lt-name">${esc(L.signName || "")}</div>
      <div class="lt-line">التوقيع: ...................................</div><div class="lt-stamp">الختم</div></footer>`;
  }

  /* ---------- new letter form ---------- */
  const curTpl = () => templates.find(t => t.id === $("hrTpl").value) || null;
  function draft(){
    const t = curTpl() || { title: "", body: "" };
    return { title: t.title, body: t.body, templateId: t.id || "", assoc: $("hrAssoc").value.trim(), date: $("hrDate").value || ymd(new Date()),
             fields: Object.fromEntries(fieldsOf(t.body).map(f => [f, values[f] || ""])), signName: $("hrSignName").value.trim(), signRole: $("hrSignRole").value.trim() };
  }
  function renderPreview(){ $("hrPaper").innerHTML = curTpl() ? letterHtml(draft()) : '<p class="lt-empty">اختر نوع الخطاب</p>'; }
  function renderFields(){
    const box = $("hrFields"); box.innerHTML = "";
    const t = curTpl(); if (!t) return;
    fieldsOf(t.body).forEach(f => {
      const row = document.createElement("div"); row.className = "s-row";
      const id = "hrf-" + Math.random().toString(36).slice(2, 8);
      const k = kind(f);
      row.innerHTML = `<label for="${id}"></label>` + (k === "long" ? `<textarea class="input" id="${id}" rows="2"></textarea>` : `<input class="input" id="${id}" type="${k === "date" ? "date" : k === "number" ? "number" : "text"}"${k === "number" ? ' inputmode="decimal" min="0" step="any"' : ""}>`);
      row.querySelector("label").textContent = f;
      const inp = row.querySelector("input,textarea"); inp.value = values[f] || "";
      inp.addEventListener("input", () => { values[f] = inp.value; renderPreview(); });
      box.append(row);
    });
  }
  function fillTplSelect(){
    const sel = $("hrTpl"); const keep = sel.value; sel.innerHTML = "";
    CATS.forEach(c => {
      const ts = templates.filter(t => (CATS.includes(t.category) ? t.category : "أخرى") === c); if (!ts.length) return;
      const g = document.createElement("optgroup"); g.label = c;
      ts.forEach(t => g.append(new Option(t.title, t.id))); sel.append(g);
    });
    if (templates.some(t => t.id === keep)) sel.value = keep;
    renderFields(); renderPreview();
  }
  function msg(t, k){ $("hrMsg").textContent = t || ""; $("hrMsg").className = "s-msg" + (k ? " " + k : ""); }

  /* ---------- print ---------- */
  function printLetter(L){
    const area = $("hrPrintArea");
    area.innerHTML = `<article class="hr-paper print">${letterHtml(L)}</article>`;
    document.body.classList.add("printing-hr");
    const done = () => { document.body.classList.remove("printing-hr"); area.innerHTML = ""; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    setTimeout(() => window.print(), 50);
  }
  async function saveAndPrint(){
    if (!db){ msg("سجّل الدخول لحفظ الخطاب", "err"); return; }
    const t = curTpl(); if (!t){ msg("اختر نوع الخطاب", "err"); return; }
    const L = draft();
    if (!L.assoc){ msg("اكتب اسم الجمعية", "err"); $("hrAssoc").focus(); return; }
    const btn = $("hrSave"); btn.disabled = true; msg("جارٍ الحفظ…");
    try {
      const year = hijriYear(parseDay(L.date));
      const counter = db.collection("hrMeta").doc("counter");
      const no = await db.runTransaction(async tx => {
        const d = await tx.get(counter);
        const last = d.exists && d.data().year === year ? d.data().last || 0 : 0;
        tx.set(counter, { year, last: last + 1 });
        return last + 1;
      });
      L.no = no; L.year = year; L.ref = `${String(no).padStart(3, "0")}/${year}`;
      L.employee = L.fields["اسم الموظف"] || "";
      L.createdAt = new Date().toISOString(); L.createdBy = me;
      await db.collection("hrLetters").add(L);
      msg(`حُفظ الخطاب برقم ${L.ref}`, "ok");
      printLetter(L);
    } catch (e){ console.error(e); msg("تعذّر حفظ الخطاب. حاول مرة أخرى", "err"); }
    finally { btn.disabled = false; }
  }

  /* ---------- log ---------- */
  function renderLog(){
    const body = $("hrLogList"); if (!body) return;
    const q = $("hrLogQ").value.trim();
    const rows = letters.filter(l => !q || [l.ref, l.employee, l.title, l.assoc].some(x => (x || "").includes(q)))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    body.innerHTML = "";
    $("hrLogEmpty").hidden = rows.length > 0;
    $("hrLogEmpty").textContent = letters.length ? "لا توجد نتائج" : "لم يصدر أي خطاب بعد";
    rows.forEach(l => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><bdi class="mono"></bdi></td><td></td><td></td><td></td><td></td><td class="u-act"><button class="btn small" type="button">طباعة</button> <button class="btn small ghost" type="button">حذف</button></td>`;
      const td = tr.querySelectorAll("td");
      td[0].querySelector("bdi").textContent = l.ref;
      td[1].textContent = `${hijri(parseDay(l.date))} هـ`;
      td[2].textContent = l.title; td[3].textContent = l.employee || "—"; td[4].textContent = l.assoc || "";
      const [pb, db2] = tr.querySelectorAll("button");
      pb.addEventListener("click", () => printLetter(l));
      db2.addEventListener("click", async () => { if (await UI.confirm(`حذف الخطاب ${l.ref} من السجل؟ لن يُعاد استخدام رقمه.`, { ok: "حذف", danger: true })) db.collection("hrLetters").doc(l.id).delete().then(() => UI.toast("حُذف الخطاب")).catch(() => UI.toast("تعذّر الحذف", "err")); });
      body.append(tr);
    });
  }

  /* ---------- templates ---------- */
  let editing = null;
  function renderTpls(){
    const ul = $("hrTplList"); if (!ul) return; ul.innerHTML = "";
    templates.forEach(t => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="f-meta"><span class="f-name"></span><span class="f-file"></span></span><button class="btn small" type="button">تعديل</button> <button class="btn small ghost" type="button">حذف</button>`;
      li.querySelector(".f-name").textContent = t.title;
      li.querySelector(".f-file").textContent = `${t.category} · ${fieldsOf(t.body).length} خانة`;
      const [eb, dbn] = li.querySelectorAll("button");
      eb.addEventListener("click", () => openEditor(t));
      dbn.addEventListener("click", async () => { if (!db){ UI.alert("سجّل الدخول لتعديل القوالب"); return; } if (await UI.confirm(`حذف قالب «${t.title}»؟ الخطابات الصادرة منه تبقى في السجل.`, { ok: "حذف", danger: true })) db.collection("hrTemplates").doc(t.id).delete().then(() => UI.toast("حُذف القالب")).catch(() => UI.toast("تعذّر الحذف", "err")); });
      ul.append(li);
    });
  }
  function openEditor(t){
    if (!db){ UI.alert("سجّل الدخول لتعديل القوالب"); return; }
    editing = t || null;
    $("hrEdTitle").value = t ? t.title : ""; $("hrEdCat").value = t && CATS.includes(t.category) ? t.category : "أخرى";
    $("hrEdBody").value = t ? t.body : "";
    $("hrEditor").hidden = false; $("hrEdHead").textContent = t ? "تعديل القالب" : "قالب جديد";
    $("hrEdTitle").focus();
  }
  async function saveTpl(e){
    e.preventDefault();
    const data = { title: $("hrEdTitle").value.trim(), category: $("hrEdCat").value, body: $("hrEdBody").value.replace(/\r/g, ""), updatedAt: new Date().toISOString() };
    if (!data.title || !data.body.trim()) return;
    try {
      if (editing) await db.collection("hrTemplates").doc(editing.id).update(data);
      else await db.collection("hrTemplates").add({ ...data, order: Date.now() });
      $("hrEditor").hidden = true; editing = null; UI.toast("حُفظ القالب");
    } catch (err){ console.error(err); UI.toast("تعذّر حفظ القالب", "err"); }
  }

  /* ---------- tabs and wiring ---------- */
  function setTab(t){
    document.querySelectorAll("[data-hrtab]").forEach(b => b.setAttribute("aria-selected", b.dataset.hrtab === t ? "true" : "false"));
    $("hrNew").hidden = t !== "new"; $("hrLog").hidden = t !== "log"; $("hrTpls").hidden = t !== "tpl";
  }
  document.querySelectorAll("[data-hrtab]").forEach(b => b.addEventListener("click", () => setTab(b.dataset.hrtab)));
  $("hrTpl").addEventListener("change", () => { renderFields(); renderPreview(); });
  ["hrAssoc", "hrDate"].forEach(id => $(id).addEventListener("input", renderPreview));
  ["hrSignName", "hrSignRole"].forEach(id => $(id).addEventListener("input", () => {
    sign = { name: $("hrSignName").value, role: $("hrSignRole").value };
    try { localStorage.setItem(SIGN_KEY, JSON.stringify(sign)); } catch {}
    renderPreview();
  }));
  $("hrSave").addEventListener("click", saveAndPrint);
  $("hrPrint").addEventListener("click", () => { if (curTpl()) printLetter(draft()); });
  $("hrClear").addEventListener("click", () => { Object.keys(values).forEach(k => delete values[k]); renderFields(); renderPreview(); msg(""); });
  $("hrLogQ").addEventListener("input", renderLog);
  $("hrNewTpl").addEventListener("click", () => openEditor(null));
  $("hrEdCancel").addEventListener("click", () => { $("hrEditor").hidden = true; editing = null; });
  $("hrEdForm").addEventListener("submit", saveTpl);
  CATS.forEach(c => $("hrEdCat").append(new Option(c, c)));
  $("hrDate").value = ymd(new Date());
  $("hrSignName").value = sign.name; $("hrSignRole").value = sign.role;
  try { const a = localStorage.getItem("assoc-policies-name"); if (a) $("hrAssoc").value = a; } catch {}

  function connect(d){
    if (db) return;
    db = d.db; me = ((d.user && d.user.email) || "").toLowerCase();
    $("hrSignin").hidden = true;
    db.collection("hrTemplates").onSnapshot(async snap => {
      templates = snap.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
      if (!templates.length && !seeding){ // first use: add the standard letters
        seeding = true;
        const batch = db.batch();
        DEFAULT_TEMPLATES.forEach(t => batch.set(db.collection("hrTemplates").doc(), { ...t, builtin: true, updatedAt: new Date().toISOString() }));
        await batch.commit().catch(console.error);
        return;
      }
      fillTplSelect(); renderTpls();
    }, e => console.error(e));
    db.collection("hrLetters").onSnapshot(snap => { letters = snap.docs.map(x => ({ id: x.id, ...x.data() })); renderLog(); }, e => console.error(e));
    db.collection("associations").onSnapshot(snap => {
      assocs = snap.docs.map(x => x.data().name).filter(Boolean);
      $("hrAssocList").innerHTML = ""; assocs.forEach(n => $("hrAssocList").append(new Option(n, n)));
    }, () => {});
  }
  // before sign-in the standard letters still preview, they just can't be saved
  templates = DEFAULT_TEMPLATES.map((t, i) => ({ id: "local" + i, ...t }));
  fillTplSelect(); renderTpls(); renderLog();
  if (window.appDb && window.appUser) connect({ db: window.appDb, user: window.appUser });
  window.addEventListener("app:db", e => connect(e.detail));
})();
