/* الموارد البشرية ← الخطابات
   - templates with {{fields}} build the letter; the letter itself is then editable on the A4 paper with a toolbar
     (fonts, sizes, colors, alignment, lists, tables, header and footer)
   - letterheads (الكليشات): an A4 background image, margins, header and footer text, and a date frame image
     whose day, dates and number are written inside it
   - print / save as PDF, and a log of issued letters with an outgoing number (001/1448, restarting each Hijri year)
   Firestore: hrTemplates, hrLetters, hrHeads, hrMeta/counter, hrMeta/templates */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clean = h => window.DOMPurify ? DOMPurify.sanitize(h || "", { ADD_ATTR: ["contenteditable"] }) : (h || "");
  const FIELD_RX = /\{\{\s*([^{}]+?)\s*\}\}/g;
  const ASSOC_FIELD = "اسم الجمعية", RECIP = "الجهة الموجه لها";
  const AUTO = new Set([ASSOC_FIELD, "صفة المعتمد", "اسم المعتمد"]);
  const CATS = ["التعريف والشهادات", "الدعم والمخاطبات", "التوظيف", "الانضباط وانتهاء الخدمة", "أخرى"];
  const PREFIXES = [["السادة", "المحترمين"], ["سعادة", "المحترم"], ["معالي", "المحترم"], ["فضيلة", "حفظه الله"], ["المكرم", "المحترم"], ["", ""]];
  const TPL_VERSION = 2;
  const HELLO = "السلام عليكم ورحمة الله وبركاته، وبعد:";
  const THANKS = "وتقبلوا وافر التحية والتقدير،";

  const DEFAULT_TEMPLATES = [
    { order: 1, category: "التعريف والشهادات", title: "تعريف بالراتب", body:
`{{الجهة الموجه لها}}

${HELLO}

تشهد {{اسم الجمعية}} بأن الموظف/ـة {{اسم الموظف}}، {{الجنسية}} الجنسية، ويحمل هوية رقم {{رقم الهوية}}، يعمل لديها بوظيفة {{المسمى الوظيفي}} منذ تاريخ {{تاريخ التعيين}}، ولا يزال على رأس العمل حتى تاريخه.

ويتقاضى راتباً شهرياً إجمالياً قدره {{إجمالي الراتب}} ريال، تفصيله: الراتب الأساسي {{الراتب الأساسي}} ريال، والبدلات {{البدلات}} ريال.

وقد أُعطي هذا التعريف بناءً على طلبه، دون أدنى مسؤولية على الجمعية.

${THANKS}` },
    { order: 2, category: "التعريف والشهادات", title: "تعريف بدون راتب", body:
`{{الجهة الموجه لها}}

${HELLO}

تشهد {{اسم الجمعية}} بأن الموظف/ـة {{اسم الموظف}}، {{الجنسية}} الجنسية، ويحمل هوية رقم {{رقم الهوية}}، يعمل لديها بوظيفة {{المسمى الوظيفي}} منذ تاريخ {{تاريخ التعيين}}، ولا يزال على رأس العمل حتى تاريخه.

وقد أُعطي هذا التعريف بناءً على طلبه، دون أدنى مسؤولية على الجمعية.

${THANKS}` },
    { order: 3, category: "التعريف والشهادات", title: "شهادة خبرة", body:
`تشهد {{اسم الجمعية}} بأن {{اسم الموظف}}، {{الجنسية}} الجنسية، ويحمل هوية رقم {{رقم الهوية}}، قد عمل لديها بوظيفة {{المسمى الوظيفي}} خلال الفترة من {{تاريخ التعيين}} إلى {{تاريخ انتهاء الخدمة}}.

وكان خلال فترة عمله مثالاً للجد والانضباط وحسن التعامل، وقد أدّى المهام الموكلة إليه على الوجه المطلوب.

وقد أُعطيت له هذه الشهادة بناءً على طلبه دون أدنى مسؤولية على الجمعية، متمنين له دوام التوفيق والسداد.` },
    { order: 4, since: 2, category: "التعريف والشهادات", title: "إلى من يهمه الأمر", body:
`إلى من يهمه الأمر

${HELLO}

تفيد {{اسم الجمعية}} بأن {{موضوع الإفادة}}.

وقد أُعطيت هذه الإفادة بناءً على طلب صاحب الشأن، دون أدنى مسؤولية على الجمعية.

${THANKS}` },
    { order: 5, since: 2, category: "الدعم والمخاطبات", title: "طلب دعم عيني", body:
`{{الجهة الموجه لها}}

${HELLO}

تتقدم {{اسم الجمعية}} بخالص الشكر والتقدير لكم على دعمكم المتواصل للعمل الخيري، ويسرها أن تتقدم إليكم بطلب دعم عيني يتمثل في: {{وصف الدعم العيني}}، بكمية {{الكمية}}، وذلك لصالح {{الفئة المستفيدة}}.

وتأمل الجمعية أن يحظى طلبها بموافقتكم الكريمة، علماً بأن الدعم سيُوجَّه وفق الأنظمة المعتمدة ويُوثَّق بما يحقق الشفافية.

شاكرين لكم حسن تعاونكم، وجعله الله في موازين حسناتكم.

${THANKS}` },
    { order: 6, since: 2, category: "الدعم والمخاطبات", title: "طلب دعم مشروع", body:
`{{الجهة الموجه لها}}

${HELLO}

يسر {{اسم الجمعية}} أن تتقدم إليكم بطلب دعم مشروع «{{اسم المشروع}}»، الذي يهدف إلى {{هدف المشروع}}، ويستفيد منه {{عدد المستفيدين}} مستفيداً، بتكلفة إجمالية قدرها {{تكلفة المشروع}} ريال، ومدة تنفيذ {{مدة التنفيذ}}.

ومرفق لكم ملف المشروع متضمناً تفاصيله وميزانيته ومؤشرات قياس أثره.

وتأمل الجمعية أن يحظى المشروع بدعمكم الكريم، شاكرين لكم حرصكم على دعم العمل الخيري.

${THANKS}` },
    { order: 7, category: "التوظيف", title: "عرض وظيفي", body:
`المكرم/ {{اسم الموظف}}                                    المحترم

${HELLO}

يسر {{اسم الجمعية}} أن تقدم لكم عرضها للعمل لديها بوظيفة {{المسمى الوظيفي}}، وفق الشروط التالية:

١. الراتب الأساسي: {{الراتب الأساسي}} ريال شهرياً.
٢. بدل السكن: {{بدل السكن}} ريال شهرياً.
٣. بدل النقل: {{بدل النقل}} ريال شهرياً.
٤. مدة العقد: {{مدة العقد}}، تبدأ من تاريخ المباشرة.
٥. فترة التجربة: تسعون يوماً وفق نظام العمل.
٦. تاريخ المباشرة المتوقع: {{تاريخ المباشرة}}.

نأمل إفادتنا بموافقتكم على هذا العرض في موعد أقصاه {{آخر موعد للرد}}، ويُعد العرض لاغياً بعد ذلك.

${THANKS}` },
    { order: 8, category: "التوظيف", title: "قرار تعيين", body:
`إن {{صفة المعتمد}}، بناءً على الصلاحيات المخولة له، وعلى ما تقتضيه مصلحة العمل،

يقرر ما يلي:

أولاً: تعيين {{اسم الموظف}}، هوية رقم {{رقم الهوية}}، بوظيفة {{المسمى الوظيفي}}، براتب أساسي قدره {{الراتب الأساسي}} ريال شهرياً، اعتباراً من تاريخ {{تاريخ المباشرة}}.

ثانياً: يخضع الموظف لفترة تجربة مدتها تسعون يوماً وفق نظام العمل.

ثالثاً: يُبلّغ هذا القرار لمن يلزم لإنفاذه.` },
    { order: 9, category: "التوظيف", title: "مباشرة عمل", body:
`نفيد بأن الموظف/ـة {{اسم الموظف}}، هوية رقم {{رقم الهوية}}، قد باشر عمله لدى {{اسم الجمعية}} بوظيفة {{المسمى الوظيفي}} اعتباراً من تاريخ {{تاريخ المباشرة}}.

وعليه جرى التوقيع.` },
    { order: 10, category: "الانضباط وانتهاء الخدمة", title: "لفت نظر", body:
`المكرم/ {{اسم الموظف}}                                    المحترم
الوظيفة: {{المسمى الوظيفي}}

${HELLO}

نود لفت نظركم إلى ما بدر منكم بتاريخ {{تاريخ المخالفة}}، وهو: {{وصف المخالفة}}، مما يتعارض مع لائحة تنظيم العمل المعتمدة في الجمعية.

ونأمل منكم الالتزام وعدم تكرار ذلك مستقبلاً، علماً بأن تكرار المخالفة يعرّضكم للجزاءات المنصوص عليها في اللائحة.

والله الموفق،` },
    { order: 11, category: "الانضباط وانتهاء الخدمة", title: "إنذار كتابي", body:
`المكرم/ {{اسم الموظف}}                                    المحترم
الوظيفة: {{المسمى الوظيفي}}

${HELLO}

إشارة إلى ما بدر منكم بتاريخ {{تاريخ المخالفة}}، وهو: {{وصف المخالفة}}، وبعد الاطلاع على إفادتكم، فإن الجمعية توجه إليكم بموجب هذا الخطاب الإنذار الكتابي {{رقم الإنذار}}، وفق لائحة تنظيم العمل المعتمدة.

ونهيب بكم الالتزام التام بأنظمة العمل ولوائحه، علماً بأن تكرار المخالفة يعرّضكم لجزاء أشد.

والله الموفق،` },
    { order: 12, category: "الانضباط وانتهاء الخدمة", title: "قبول استقالة", body:
`المكرم/ {{اسم الموظف}}                                    المحترم

${HELLO}

إشارة إلى استقالتكم المقدمة بتاريخ {{تاريخ تقديم الاستقالة}}، نفيدكم بقبولها، على أن يكون آخر يوم عمل لكم {{تاريخ انتهاء الخدمة}}، وستُصرف مستحقاتكم النظامية وفق نظام العمل بعد إخلاء طرفكم.

شاكرين لكم ما قدمتموه خلال فترة عملكم، ومتمنين لكم التوفيق.` },
    { order: 13, category: "الانضباط وانتهاء الخدمة", title: "إنهاء خدمة", body:
`المكرم/ {{اسم الموظف}}                                    المحترم
الوظيفة: {{المسمى الوظيفي}}

${HELLO}

نشعركم بإنهاء خدمتكم لدى {{اسم الجمعية}} اعتباراً من تاريخ {{تاريخ انتهاء الخدمة}}، وذلك {{سبب الإنهاء}}، استناداً إلى المادة {{رقم المادة}} من نظام العمل.

وستُصرف مستحقاتكم النظامية بعد إخلاء طرفكم وتسليم ما بعهدتكم.

والله الموفق،` },
  ];

  let db = null, me = "", templates = [], letters = [], heads = [], seeding = false, migrated = false;
  const SIGN_KEY = "app-hr-sign", HEAD_KEY = "app-hr-head";
  let sign = { name: "", role: "" };
  try { sign = { ...sign, ...JSON.parse(localStorage.getItem(SIGN_KEY) || "{}") }; } catch {}
  const values = {};
  let manual = false, showHdr = true, showFtr = true;
  // signature and stamp images, shared by all letters (Firestore hrMeta/seal)
  // positions are millimetres from the page's top-left corner
  // they follow the signer's name: the signature right under it, the stamp beside it;
  // moving them by hand stores only the offset from there (sigDX/sigDY, stampDX/stampDY in mm)
  let seal = { sig: "", stamp: "", sigH: 18, stampW: 32, sigDX: 0, sigDY: 0, stampDX: 0, stampDY: 0 };
  const PX_MM = 96 / 25.4;

  /* ---------- dates ---------- */
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDay = s => s ? new Date(s + "T12:00:00") : new Date();
  const hijri = d => new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d).replace(/\s*هـ$/, "");
  const greg = d => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  const weekday = d => new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(d);
  const hijriYear = d => +new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { year: "numeric" }).format(d).replace(/\D/g, "");
  const fmtDateField = s => { const d = new Date(s + "T12:00:00"); return isNaN(d) ? s : `${hijri(d)} هـ الموافق ${greg(d)} م`; };

  /* ---------- fields ---------- */
  function fieldsOf(body){ const out = []; for (const m of (body || "").matchAll(FIELD_RX)){ const f = m[1]; if (!AUTO.has(f) && !out.includes(f)) out.push(f); } return out; }
  const kind = f => f === RECIP ? "recip" : /تاريخ/.test(f) ? "date" : /راتب|بدل|مبلغ|البدلات|تكلفة|عدد/.test(f) ? "number" : /وصف|سبب|موضوع|هدف/.test(f) ? "long" : "text";
  function fieldValue(f, vals){
    const v = (vals[f] ?? "").toString().trim();
    if (!v) return null;
    if (kind(f) === "date") return fmtDateField(v);
    if (kind(f) === "number" && !isNaN(+v)) return (+v).toLocaleString("en-US");
    return v;
  }
  function recipHtml(vals){
    const name = (vals[RECIP] || "").trim(); const pre = vals[RECIP + "#p"] ?? "السادة";
    if (!name) return `<span class="lt-blank">${esc(RECIP)}</span>`;
    const suffix = (PREFIXES.find(p => p[0] === pre) || ["", ""])[1];
    return `<span class="lt-to"><span>${pre ? esc(pre) + "/ " : ""}<span class="lt-v">${esc(name)}</span></span>${suffix ? `<span>${esc(suffix)}</span>` : ""}</span>`;
  }

  /* ---------- letter parts ---------- */
  function genBody(body, vals){
    const fill = text => esc(text).replace(FIELD_RX, (_, f) => {
      const raw = f.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
      if (raw === RECIP) return recipHtml(vals);
      const v = AUTO.has(raw) ? (vals[raw] || "").trim() || null : fieldValue(raw, vals);
      return v ? `<span class="lt-v">${esc(v)}</span>` : `<span class="lt-blank">${esc(raw)}</span>`;
    });
    return (body || "").split(/\n\s*\n/).map(p => `<p>${fill(p).replace(/\n/g, "<br>")}</p>`).join("");
  }
  const sealOn = p => ({ sig: !!(p.showSig !== false && seal.sig), stamp: !!(p.showStamp !== false && seal.stamp) });
  const genSign = (L, p = {}) => { const o = sealOn(p);
    return `<div class="lt-role">${esc(L.signRole || "")}</div><div class="lt-name">${esc(L.signName || "")}</div>` +
      (o.sig || o.stamp ? `<div class="lt-sigspace"></div>` : `<div class="lt-line">التوقيع: ...................................</div><div class="lt-stamp">الختم</div>`); };
  // signature and stamp on a layer over the whole page; on the editable page they can be dragged
  function sealHtml(p, editable){
    const o = sealOn(p); if (!o.sig && !o.stamp) return "";
    const pos = p.sealPos, sz = p.sealSize || seal;
    const handles = editable ? '<i class="h nw"></i><i class="h ne"></i><i class="h sw"></i><i class="h se"></i>' : "";
    const at = k => pos && pos[k + "X"] != null && !isNaN(pos[k + "X"]) ? `left:${pos[k + "X"]}mm;top:${pos[k + "Y"]}mm;` : null;
    const box = (k, src, alt, size) => { const a = at(k);
      return `<div class="lt-sb ${k}${editable ? " drag" : ""}"${a ? "" : " data-auto"} data-k="${k}" style="${a || "left:0;top:0;visibility:hidden;"}${size}"><img src="${src}" alt="${alt}" draggable="false">${handles}</div>`; };
    return `<div class="lt-seal" contenteditable="false">` +
      (o.stamp ? box("stamp", seal.stamp, "الختم", `width:${sz.stampW}mm`) : "") +
      (o.sig ? box("sig", seal.sig, "التوقيع", `height:${sz.sigH}mm`) : "") + `</div>`;
  }
  // the point under the signer's name, in mm from the page's top-left corner
  function anchorOf(paper){
    const sign = paper.querySelector(".lt-sign"); if (!sign) return null;
    const pr = paper.getBoundingClientRect(); if (!pr.width) return null;
    const k = pr.width / paper.offsetWidth || 1;
    const sp = sign.querySelector(".lt-sigspace"), nm = sign.querySelector(".lt-name");
    const sr = sign.getBoundingClientRect();
    const y = sp ? sp.getBoundingClientRect().top : nm && nm.textContent.trim() ? nm.getBoundingClientRect().bottom : sr.bottom;
    return { x: ((sr.left + sr.right) / 2 - pr.left) / k / PX_MM, y: (y - pr.top) / k / PX_MM, k };
  }
  const baseOf = (key, w, h, A) => key === "sig" ? { x: A.x - w / 2, y: A.y + 1 } : { x: A.x - w * 1.05, y: A.y - h * 0.2 };
  function boxSize(b, A){ const r = b.getBoundingClientRect(); return { w: r.width / A.k / PX_MM, h: r.height / A.k / PX_MM }; }
  function placeSeal(paper){
    if (!paper) return;
    const A = anchorOf(paper); if (!A) return;
    paper.querySelectorAll(".lt-sb[data-auto]").forEach(b => {
      const key = b.dataset.k, img = b.querySelector("img");
      const place = () => {
        const { w, h } = boxSize(b, A), base = baseOf(key, w, h, A);
        b.style.left = (base.x + (+seal[key + "DX"] || 0)) + "mm"; b.style.top = (base.y + (+seal[key + "DY"] || 0)) + "mm";
        b.style.visibility = "";
      };
      if (img.complete && img.naturalWidth) place(); else img.addEventListener("load", place, { once: true });
    });
  }
  function metaHtml(L){
    const d = parseDay(L.date);
    return `<div class="lt-m"><span>اليوم:</span> ${weekday(d)}</div><div class="lt-m"><span>التاريخ:</span> ${hijri(d)} هـ</div><div class="lt-m"><span>الموافق:</span> ${greg(d)} م</div><div class="lt-m"><span>الرقم:</span> <bdi>${esc(L.ref || "يُعطى عند الحفظ")}</bdi></div>`;
  }
  // inside the date frame: the recipient, the outgoing number, then the day and the Gregorian date
  // measure text with a canvas so the size is the same on screen, in print and when reprinting
  const measureCtx = document.createElement("canvas").getContext("2d");
  function fitSize(text, base, widthMm){
    const fam = getComputedStyle(document.body).fontFamily;
    measureCtx.font = `600 ${base}px ${fam}`;
    const w = measureCtx.measureText(text).width, avail = widthMm * 96 / 25.4 * 0.96;
    return w > avail ? Math.max(6, Math.floor(base * avail / w * 10) / 10) : base;
  }
  function frameHtml(L, fr){
    const d = parseDay(L.date), f = L.fields || {};
    const name = (f[RECIP] || "").trim();
    const size = name && fr ? fitSize(name, fr.fontSize, fr.w - 2 * fr.padSide) : null;
    const to = name ? esc(name) : `<span class="lt-blank">${esc(RECIP)}</span>`;
    return `<div class="lt-m lt-fto"${size ? ` style="font-size:${size}px"` : ""}>${to}</div><div class="lt-m"><span>الرقم:</span> <bdi>${esc(L.ref || "يُعطى عند الحفظ")}</bdi></div><div class="lt-m">${weekday(d)} ${greg(d)} م</div>`;
  }
  /* the whole A4 page; parts = { title, body, sign, hdr, ftr } (HTML), editable puts contenteditable on them */
  function paperInner(L, head, parts, editable){
    const ce = editable ? ' contenteditable="true" spellcheck="false"' : "";
    const m = (head && head.margins) || { top: 22, bottom: 22, side: 20 };
    const fr = head && head.frame && head.frame.image ? head.frame : null;
    const hdr = parts.showHdr !== false && (parts.hdr || editable) ? `<div class="lt-hdr" style="top:6mm;inset-inline:${m.side}mm;min-height:${Math.max(8, m.top - 10)}mm"${ce} data-ph="ترويسة أعلى الصفحة">${parts.hdr || ""}</div>` : "";
    const ftr = parts.showFtr !== false && (parts.ftr || editable) ? `<div class="lt-ftr" style="bottom:6mm;inset-inline:${m.side}mm;min-height:${Math.max(8, m.bottom - 10)}mm"${ce} data-ph="تذييل أسفل الصفحة">${parts.ftr || ""}</div>` : "";
    const frame = fr ? `<div class="lt-frame" style="top:${fr.y}mm;left:${fr.x}mm;width:${fr.w}mm"><img src="${fr.image}" alt=""><div class="lt-frame-t" style="padding:${fr.padTop}mm ${fr.padSide}mm 0;font-size:${fr.fontSize}px">${frameHtml(L, fr)}</div></div>` : "";
    const plainHead = !fr ? `<header class="lt-head">${head && head.bg ? "<span></span>" : `<div class="lt-org">${esc(L.assoc || "")}</div>`}<div class="lt-meta">${metaHtml(L)}</div></header>` : "";
    return `${hdr}${frame}<div class="lt-content" style="padding:${m.top}mm ${m.side}mm ${m.bottom}mm">${plainHead}
      <h2 class="lt-title"${ce}>${parts.title}</h2><div class="lt-body"${ce}>${parts.body}</div><div class="lt-signbox"><footer class="lt-sign"${ce}>${parts.sign}</footer></div></div>${ftr}${sealHtml(parts, editable)}`;
  }
  const paperStyle = head => head && head.bg ? `background-image:url("${head.bg}")` : "";

  /* ---------- new letter: form + editable paper ---------- */
  const curTpl = () => templates.find(t => t.id === $("hrTpl").value) || null;
  const curHead = () => heads.find(h => h.id === $("hrHead").value) || null;
  function draft(){
    const t = curTpl() || { title: "", body: "" };
    const fields = Object.fromEntries(fieldsOf(t.body).flatMap(f => f === RECIP ? [[f, values[f] || ""], [f + "#p", values[f + "#p"] ?? "السادة"]] : [[f, values[f] || ""]]));
    return { title: t.title, body: t.body, templateId: t.id || "", headId: $("hrHead").value || "", assoc: $("hrAssoc").value.trim(), date: $("hrDate").value || ymd(new Date()),
             fields, signName: $("hrSignName").value.trim(), signRole: $("hrSignRole").value.trim(), showSig: $("hrShowSig").checked, showStamp: $("hrShowStamp").checked };
  }
  const vals = L => ({ ...L.fields, [ASSOC_FIELD]: L.assoc, "صفة المعتمد": L.signRole, "اسم المعتمد": L.signName });
  function headParts(head){ return { hdr: head ? head.hdr || "" : "", ftr: head ? head.ftr || "" : "" }; }
  function renderPaper(force){
    const paper = $("hrPaper"), t = curTpl(), head = curHead(), L = draft();
    if (!t){ paper.removeAttribute("style"); paper.innerHTML = '<p class="lt-empty">اختر نوع الخطاب</p>'; fit(); return; }
    if (manual && !force){ // keep the edited text, only refresh the date and number
      paper.querySelectorAll(".lt-meta").forEach(el => { el.innerHTML = metaHtml(L); });
      const fr = head && head.frame && head.frame.image ? head.frame : null;
      paper.querySelectorAll(".lt-frame-t").forEach(el => { el.innerHTML = frameHtml(L, fr); });
      return;
    }
    const keep = force === "head" || force === "sign" ? grab() : null;
    const sw = { showSig: L.showSig, showStamp: L.showStamp };
    if (keep && force === "sign") keep.sign = genSign(L, sw);
    const parts = keep ? { ...keep, ...headParts(head), showHdr, showFtr, ...sw, sealPos: null, sealSize: null } :
      { title: esc(t.title), body: genBody(t.body, vals(L)), sign: genSign(L, sw), ...headParts(head), showHdr, showFtr, ...sw };
    paper.setAttribute("style", paperStyle(head));
    paper.innerHTML = paperInner(L, head, parts, true);
    fit(); placeSeal(paper);
  }
  function grab(){
    const p = $("hrPaper"), g = sel => { const el = p.querySelector(sel); return el ? clean(el.innerHTML) : ""; };
    return { title: g(".lt-title"), body: g(".lt-body"), sign: g(".lt-sign"), hdr: g(".lt-hdr"), ftr: g(".lt-ftr"), showHdr, showFtr, showSig: $("hrShowSig").checked, showStamp: $("hrShowStamp").checked, sealPos: sealNow(), sealSize: sealSizeNow() };
  }
  function sealNow(){
    const p = $("hrPaper"), box = k => p.querySelector(`.lt-sb[data-k="${k}"]`);
    const r = {};
    ["sig", "stamp"].forEach(k => { const b = box(k); if (b){ r[k + "X"] = parseFloat(b.style.left); r[k + "Y"] = parseFloat(b.style.top); } });
    return Object.keys(r).length ? r : null;
  }
  function sealSizeNow(){ return { sigH: seal.sigH, stampW: seal.stampW }; }
  function setManual(on){ manual = on; $("hrManual").hidden = !on; }
  $("hrPaper").addEventListener("input", e => { if (!manual && e.target.closest(".lt-title,.lt-body,.lt-sign,.lt-hdr,.lt-ftr")) setManual(true); });

  // the page is drawn at its real size (210×297mm) and scaled to fit the preview column
  function fit(){
    document.querySelectorAll(".hr-paper-wrap").forEach(w => {
      const p = w.querySelector(".hr-paper"); if (!p) return;
      const k = Math.min(1, (w.clientWidth - 32) / p.offsetWidth);
      p.style.setProperty("--k", k);
      w.style.height = (p.offsetHeight * k + 32) + "px";
    });
  }
  new ResizeObserver(fit).observe($("hrNew"));
  window.addEventListener("app:view", e => { if (e.detail === "hr/letters") setTimeout(() => { fit(); placeSeal($("hrPaper")); }, 30); });

  function renderFields(){
    const box = $("hrFields"); box.innerHTML = "";
    const t = curTpl(); if (!t) return;
    fieldsOf(t.body).forEach(f => {
      const row = document.createElement("div"); row.className = "s-row";
      const id = "hrf-" + Math.random().toString(36).slice(2, 8);
      const k = kind(f);
      if (k === "recip"){
        row.innerHTML = `<label for="${id}"></label><div class="hr-recip"><select class="select" aria-label="الصفة"></select><input class="input" id="${id}" type="text"></div>`;
        const sel = row.querySelector("select");
        PREFIXES.forEach(([p]) => sel.append(new Option(p || "بدون", p)));
        sel.value = values[f + "#p"] ?? "السادة";
        sel.addEventListener("change", () => { values[f + "#p"] = sel.value; renderPaper(); });
      } else {
        row.innerHTML = `<label for="${id}"></label>` + (k === "long" ? `<textarea class="input" id="${id}" rows="2"></textarea>` : `<input class="input" id="${id}" type="${k === "date" ? "date" : k === "number" ? "number" : "text"}"${k === "number" ? ' inputmode="decimal" min="0" step="any"' : ""}>`);
      }
      row.querySelector("label").textContent = f;
      const inp = row.querySelector("input,textarea"); inp.value = values[f] || "";
      inp.addEventListener("input", () => { values[f] = inp.value; renderPaper(); });
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
    renderFields(); if (!manual) renderPaper();
  }
  function fillHeadSelect(){
    const sel = $("hrHead"); const keep = sel.value || (() => { try { return localStorage.getItem(HEAD_KEY) || ""; } catch { return ""; } })();
    sel.innerHTML = ""; sel.append(new Option("بدون كليشة", ""));
    heads.forEach(h => sel.append(new Option(h.name, h.id)));
    sel.value = heads.some(h => h.id === keep) ? keep : "";
    renderPaper("head");
  }
  function msg(t, k){ $("hrMsg").textContent = t || ""; $("hrMsg").className = "s-msg" + (k ? " " + k : ""); }

  /* ---------- toolbar (works on whatever editable part of the paper has the caret) ---------- */
  let range = null;
  const inPaper = n => n && $("hrPaper").contains(n.nodeType === 1 ? n : n.parentNode) && (n.nodeType === 1 ? n : n.parentNode).closest("[contenteditable=true]");
  document.addEventListener("selectionchange", () => {
    const s = getSelection(); if (s.rangeCount && inPaper(s.anchorNode)){ range = s.getRangeAt(0).cloneRange(); syncTools(); }
  });
  function restore(){ if (!range) return false; const s = getSelection(); s.removeAllRanges(); s.addRange(range); return true; }
  function exec(cmd, val){
    if (!restore()) return;
    document.execCommand("styleWithCSS", false, cmd !== "fontSize");
    document.execCommand(cmd, false, val ?? null);
    afterEdit();
  }
  function afterEdit(){
    const s = getSelection(); if (s.rangeCount && inPaper(s.anchorNode)) range = s.getRangeAt(0).cloneRange();
    if (!manual) setManual(true);
    syncTools();
  }
  function setSize(px){
    if (!restore()) return;
    document.execCommand("styleWithCSS", false, false);
    document.execCommand("fontSize", false, "7");
    $("hrPaper").querySelectorAll('font[size="7"]').forEach(f => { const s = document.createElement("span"); s.style.fontSize = px + "px"; s.innerHTML = f.innerHTML; f.replaceWith(s); });
    afterEdit();
  }
  function cellNow(){ const s = getSelection(); const n = s.rangeCount ? s.anchorNode : null; return n && inPaper(n) ? (n.nodeType === 1 ? n : n.parentNode).closest("td,th") : null; }
  function syncTools(){
    const td = cellNow();
    document.querySelectorAll("#hrTools [data-tbl]").forEach(b => { b.disabled = !td; });
    ["bold", "italic", "underline", "strikeThrough", "justifyRight", "justifyCenter", "justifyLeft", "justifyFull", "insertUnorderedList", "insertOrderedList"].forEach(c => {
      const b = document.querySelector(`#hrTools [data-cmd="${c}"]`); if (b) { let on = false; try { on = document.queryCommandState(c); } catch {} b.setAttribute("aria-pressed", on ? "true" : "false"); }
    });
  }
  function fontList(){
    const set = new Set(Object.keys((window.SiteSettings && SiteSettings.FONTS) || {}));
    (window.appFonts || []).forEach(f => set.add(f.group || f.family));
    ["Sakkal Majalla", "Traditional Arabic", "Arial", "Times New Roman"].forEach(f => set.add(f));
    const sel = $("hrFont"); const keep = sel.value; sel.innerHTML = ""; sel.append(new Option("الخط", ""));
    [...set].forEach(f => { const o = new Option(f, f); o.style.fontFamily = `"${f}"`; sel.append(o); });
    sel.value = keep;
  }
  window.addEventListener("app:fonts", fontList);
  document.querySelectorAll("#hrTools button[data-cmd]").forEach(b => {
    b.addEventListener("mousedown", e => e.preventDefault());
    b.addEventListener("click", () => exec(b.dataset.cmd, b.dataset.val));
  });
  $("hrFont").addEventListener("change", e => { const f = e.target.value; if (!f) return; if (window.SiteSettings) SiteSettings.loadFont(f); exec("fontName", f); e.target.value = ""; });
  $("hrSize").addEventListener("change", e => { const v = +e.target.value; if (v) setSize(v); e.target.value = ""; });
  $("hrBlock").addEventListener("change", e => { const v = e.target.value; if (v) exec("formatBlock", v); e.target.value = ""; });
  $("hrColor").addEventListener("input", e => exec("foreColor", e.target.value));
  $("hrHilite").addEventListener("input", e => exec("hiliteColor", e.target.value));
  // table: pick a size from a grid
  const grid = $("hrTblGrid");
  for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++){ const i = document.createElement("i"); i.dataset.r = r; i.dataset.c = c; grid.append(i); }
  grid.addEventListener("mouseover", e => {
    const i = e.target.closest("i"); if (!i) return;
    grid.querySelectorAll("i").forEach(x => x.classList.toggle("on", +x.dataset.r <= +i.dataset.r && +x.dataset.c <= +i.dataset.c));
    $("hrTblSize").textContent = `${i.dataset.c} × ${i.dataset.r}`;
  });
  grid.addEventListener("mousedown", e => e.preventDefault());
  grid.addEventListener("click", e => {
    const i = e.target.closest("i"); if (!i) return;
    const r = +i.dataset.r, c = +i.dataset.c;
    const row = `<tr>${"<td><br></td>".repeat(c)}</tr>`;
    exec("insertHTML", `<table class="lt-table"><tbody>${row.repeat(r)}</tbody></table><p><br></p>`);
    $("hrTblPop").hidden = true;
  });
  $("hrTblBtn").addEventListener("mousedown", e => e.preventDefault());
  $("hrTblBtn").addEventListener("click", () => { $("hrTblPop").hidden = !$("hrTblPop").hidden; });
  document.addEventListener("click", e => { if (!e.target.closest("#hrTblPop,#hrTblBtn")) $("hrTblPop").hidden = true; });
  document.querySelectorAll("#hrTools [data-tbl]").forEach(b => {
    b.addEventListener("mousedown", e => e.preventDefault());
    b.addEventListener("click", () => {
      const td = cellNow(); if (!td) return;
      const tr = td.parentNode, table = td.closest("table"), ci = [...tr.children].indexOf(td);
      const a = b.dataset.tbl;
      if (a === "row"){ const n = tr.cloneNode(true); n.querySelectorAll("td,th").forEach(x => { x.innerHTML = "<br>"; }); tr.after(n); }
      if (a === "col") table.querySelectorAll("tr").forEach(r => { const x = document.createElement("td"); x.innerHTML = "<br>"; (r.children[ci] || r.lastChild).after(x); });
      if (a === "delrow"){ if (table.rows.length > 1) tr.remove(); else table.remove(); }
      if (a === "delcol"){ if (tr.children.length > 1) table.querySelectorAll("tr").forEach(r => r.children[ci] && r.children[ci].remove()); else table.remove(); }
      if (a === "del") table.remove();
      if (a === "up"){ const prev = table.previousElementSibling; if (prev) prev.before(table); }
      if (a === "down"){ const next = table.nextElementSibling; if (next) next.after(table); }
      afterEdit();
    });
  });
  /* table borders: drag between two columns to change their widths, or under a row to change its height */
  const EDGE = 5;
  function tableEdge(e){
    const td = e.target.closest && e.target.closest(".lt-table td, .lt-table th");
    if (!td || !$("hrPaper").contains(td) || !td.closest("[contenteditable=true]")) return null;
    const r = td.getBoundingClientRect();
    // right to left: a cell's left edge borders the next cell in the row
    if (e.clientX - r.left <= EDGE && td.nextElementSibling) return { type: "col", td };
    if (r.right - e.clientX <= EDGE && td.previousElementSibling) return { type: "col", td: td.previousElementSibling };
    if (r.bottom - e.clientY <= EDGE) return { type: "row", td };
    return null;
  }
  function ensureCols(table){
    let cg = table.querySelector("colgroup");
    const first = table.rows[0]; if (!first) return [];
    const n = first.cells.length;
    if (!cg || cg.children.length !== n){
      if (cg) cg.remove();
      const tw = table.getBoundingClientRect().width;
      cg = document.createElement("colgroup");
      [...first.cells].forEach(c => { const col = document.createElement("col"); col.style.width = (c.getBoundingClientRect().width / tw * 100).toFixed(2) + "%"; cg.append(col); });
      table.prepend(cg);
    }
    table.style.tableLayout = "fixed";
    return [...cg.children];
  }
  $("hrPaper").addEventListener("mousemove", e => {
    if (e.buttons) return;
    const ed = tableEdge(e);
    $("hrPaper").classList.toggle("rs-col", !!ed && ed.type === "col");
    $("hrPaper").classList.toggle("rs-row", !!ed && ed.type === "row");
  });
  $("hrPaper").addEventListener("pointerdown", e => {
    const ed = tableEdge(e); if (!ed) return;
    e.preventDefault(); e.stopPropagation();
    const el = e.target; try { el.setPointerCapture(e.pointerId); } catch {}
    const k = parseFloat(getComputedStyle($("hrPaper")).getPropertyValue("--k")) || 1;
    const table = ed.td.closest("table"), sx = e.clientX, sy = e.clientY;
    let move;
    if (ed.type === "col"){
      const cols = ensureCols(table), i = [...ed.td.parentNode.children].indexOf(ed.td);
      const tw = table.getBoundingClientRect().width;
      const cells = [...table.rows[0].cells], w0 = cells[i].getBoundingClientRect().width, w1 = cells[i + 1].getBoundingClientRect().width;
      move = ev => {
        const d = Math.max(20 - w0, Math.min(w1 - 20, sx - ev.clientX)); // dragging left widens this column
        cols[i].style.width = ((w0 + d) / tw * 100).toFixed(2) + "%";
        cols[i + 1].style.width = ((w1 - d) / tw * 100).toFixed(2) + "%";
      };
    } else {
      const tr = ed.td.parentNode, h0 = tr.getBoundingClientRect().height;
      move = ev => { tr.style.height = Math.max(18, (h0 + ev.clientY - sy) / k) + "px"; };
    }
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); afterEdit(); };
    el.addEventListener("pointermove", move); el.addEventListener("pointerup", up);
  }, true);

  $("hrHdrBtn").addEventListener("click", () => { showHdr = !showHdr; $("hrHdrBtn").setAttribute("aria-pressed", showHdr ? "true" : "false"); renderPaper("head"); });
  $("hrFtrBtn").addEventListener("click", () => { showFtr = !showFtr; $("hrFtrBtn").setAttribute("aria-pressed", showFtr ? "true" : "false"); renderPaper("head"); });

  /* ---------- print ---------- */
  function printParts(L, head, parts){
    const area = $("hrPrintArea");
    area.innerHTML = `<article class="hr-paper print" style='${paperStyle(head)}'>${paperInner(L, head, parts, false)}</article>`;
    document.body.classList.add("printing-hr");
    const done = () => { document.body.classList.remove("printing-hr"); area.innerHTML = ""; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    setTimeout(() => window.print(), 80);
  }
  function printLetter(L){ // from the log: the saved page
    const head = heads.find(h => h.id === L.headId) || null;
    const parts = L.parts ? { ...L.parts, title: clean(L.parts.title), body: clean(L.parts.body), sign: clean(L.parts.sign), hdr: clean(L.parts.hdr), ftr: clean(L.parts.ftr) }
      : { title: esc(L.title), body: genBody(L.body, vals(L)), sign: genSign(L, L), ...headParts(head) };
    printParts(L, head, parts);
  }
  async function saveAndPrint(){
    if (!db){ msg("سجّل الدخول لحفظ الخطاب", "err"); return; }
    const t = curTpl(); if (!t){ msg("اختر نوع الخطاب", "err"); return; }
    const L = draft();
    if (!L.assoc && !curHead()){ msg("اكتب اسم الجمعية أو اختر كليشة", "err"); $("hrAssoc").focus(); return; }
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
      L.employee = L.fields["اسم الموظف"] || ""; L.parts = grab();
      L.createdAt = new Date().toISOString(); L.createdBy = me;
      await db.collection("hrLetters").add(L);
      renderPaper(); // show the number on the page
      msg(""); UI.toast(`حُفظ الخطاب برقم ${L.ref}`);
      printParts(L, curHead(), L.parts);
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
  // older saved templates: add the new standard letters once, and drop "إلى:" before the recipient
  async function migrate(){
    if (migrated) return; migrated = true;
    try {
      const ref = db.collection("hrMeta").doc("templates");
      const m = await ref.get(); const v = m.exists ? m.data().v || 1 : 1;
      if (v >= TPL_VERSION) return;
      const batch = db.batch(); const titles = new Set(templates.map(t => t.title));
      DEFAULT_TEMPLATES.filter(t => (t.since || 1) > v && !titles.has(t.title)).forEach(t => { const { since, ...rest } = t; batch.set(db.collection("hrTemplates").doc(), { ...rest, builtin: true, updatedAt: new Date().toISOString() }); });
      const OLD = /إلى:\s*\{\{\s*الجهة الموجه لها\s*\}\}[ \t]*(المحترمين)?/g;
      templates.forEach(t => { if (OLD.test(t.body)){ OLD.lastIndex = 0; batch.update(db.collection("hrTemplates").doc(t.id), { body: t.body.replace(OLD, "{{الجهة الموجه لها}}") }); } OLD.lastIndex = 0; });
      batch.set(ref, { v: TPL_VERSION });
      await batch.commit();
    } catch (e){ console.error("templates migrate", e); }
  }

  /* ---------- letterheads (الكليشات) ---------- */
  let hEdit = null, hDraft = null;
  const HDEF = () => ({ name: "", bg: "", hdr: "", ftr: "", margins: { top: 45, bottom: 30, side: 20 }, frame: { image: "", x: 15, y: 15, w: 60, padTop: 8, padSide: 6, fontSize: 12 } });
  function renderHeads(){
    const ul = $("hdList"); if (!ul) return; ul.innerHTML = "";
    $("hdEmpty").hidden = heads.length > 0 || !db;
    heads.forEach(h => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="hd-thumb"></span><span class="f-meta"><span class="f-name"></span><span class="f-file"></span></span><button class="btn small" type="button">تعديل</button> <button class="btn small ghost" type="button">حذف</button>`;
      if (h.bg) li.querySelector(".hd-thumb").style.backgroundImage = `url("${h.bg}")`;
      li.querySelector(".f-name").textContent = h.name;
      li.querySelector(".f-file").textContent = [h.bg ? "صورة كليشة" : "بدون صورة", h.frame && h.frame.image ? "إطار تاريخ" : ""].filter(Boolean).join(" · ");
      const [eb, dbn] = li.querySelectorAll("button");
      eb.addEventListener("click", () => openHead(h));
      dbn.addEventListener("click", async () => { if (await UI.confirm(`حذف كليشة «${h.name}»؟`, { ok: "حذف", danger: true })) db.collection("hrHeads").doc(h.id).delete().then(() => UI.toast("حُذفت الكليشة")).catch(() => UI.toast("تعذّر الحذف", "err")); });
      ul.append(li);
    });
  }
  function openHead(h){
    if (!db){ UI.alert("سجّل الدخول لإضافة الكليشات"); return; }
    hEdit = h || null;
    const d = HDEF(); hDraft = h ? { ...d, ...h, margins: { ...d.margins, ...(h.margins || {}) }, frame: { ...d.frame, ...(h.frame || {}) } } : d;
    $("hdHead").textContent = h ? "تعديل الكليشة" : "كليشة جديدة";
    $("hdName").value = hDraft.name; $("hdHdr").value = htmlToText(hDraft.hdr); $("hdFtr").value = htmlToText(hDraft.ftr);
    [["hdMt", "margins", "top"], ["hdMb", "margins", "bottom"], ["hdMs", "margins", "side"], ["hdFx", "frame", "x"], ["hdFy", "frame", "y"], ["hdFw", "frame", "w"], ["hdFpt", "frame", "padTop"], ["hdFps", "frame", "padSide"], ["hdFfs", "frame", "fontSize"]]
      .forEach(([id, g, k]) => { $(id).value = hDraft[g][k]; $(id + "v").textContent = hDraft[g][k] + (g === "frame" && k === "fontSize" ? "px" : "mm"); });
    $("hdEditor").hidden = false; $("hdName").focus(); renderHeadPreview();
  }
  const htmlToText = h => { const d = document.createElement("div"); d.innerHTML = (h || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div)>/gi, "\n"); return d.textContent.replace(/\n+$/, ""); };
  const textToHtml = t => esc(t || "").split("\n").map(l => l || "<br>").join("<br>");
  function renderHeadPreview(){
    if (!hDraft) return;
    const L = { assoc: "جمعية البر الخيرية", date: ymd(new Date()), ref: "001/1448", signRole: "المدير التنفيذي", signName: "" };
    const parts = { showSig: true, showStamp: true, title: "عنوان الخطاب", body: "<p>هذا نص تجريبي يوضح مكان المحتوى داخل الكليشة. عدّل الهوامش حتى يقع النص في المساحة الفارغة من التصميم، وحرّك إطار التاريخ حتى يطابق مكانه.</p><p>السلام عليكم ورحمة الله وبركاته، وبعد:</p>", sign: genSign(L), hdr: hDraft.hdr, ftr: hDraft.ftr };
    const p = $("hdPaper"); p.setAttribute("style", paperStyle(hDraft)); p.innerHTML = paperInner(L, hDraft, parts, false);
    fit(); placeSeal(p);
  }
  async function imgData(f, maxW, png){
    const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, maxW / img.width);
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext("2d"); if (!png){ g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); } g.drawImage(img, 0, 0, c.width, c.height);
    if (png){ const out = c.toDataURL("image/png"); if (out.length < 260000) return out; return c.toDataURL("image/webp", 0.9); }
    for (const q of [0.85, 0.75, 0.62]){ const out = c.toDataURL("image/jpeg", q); if (out.length < 640000) return out; }
    throw new Error("too_big");
  }
  $("hdBg").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try { hDraft.bg = await imgData(f, 1240, false); renderHeadPreview(); } catch { UI.toast("تعذّرت قراءة الصورة أو أنها كبيرة جداً", "err"); }
  });
  $("hdFrame").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try { hDraft.frame.image = await imgData(f, 700, true); renderHeadPreview(); } catch { UI.toast("تعذّرت قراءة الصورة", "err"); }
  });
  $("hdBgClear").addEventListener("click", () => { hDraft.bg = ""; renderHeadPreview(); });
  $("hdFrameClear").addEventListener("click", () => { hDraft.frame.image = ""; renderHeadPreview(); });
  $("hdName").addEventListener("input", e => { hDraft.name = e.target.value; });
  $("hdHdr").addEventListener("input", e => { hDraft.hdr = textToHtml(e.target.value); renderHeadPreview(); });
  $("hdFtr").addEventListener("input", e => { hDraft.ftr = textToHtml(e.target.value); renderHeadPreview(); });
  [["hdMt", "margins", "top"], ["hdMb", "margins", "bottom"], ["hdMs", "margins", "side"], ["hdFx", "frame", "x"], ["hdFy", "frame", "y"], ["hdFw", "frame", "w"], ["hdFpt", "frame", "padTop"], ["hdFps", "frame", "padSide"], ["hdFfs", "frame", "fontSize"]]
    .forEach(([id, g, k]) => $(id).addEventListener("input", e => { hDraft[g][k] = +e.target.value; $(id + "v").textContent = e.target.value + (g === "frame" && k === "fontSize" ? "px" : "mm"); renderHeadPreview(); }));
  $("hdForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (!hDraft.name.trim()){ UI.toast("اكتب اسم الكليشة", "err"); $("hdName").focus(); return; }
    const data = { name: hDraft.name.trim(), bg: hDraft.bg, hdr: hDraft.hdr, ftr: hDraft.ftr, margins: hDraft.margins, frame: hDraft.frame, updatedAt: new Date().toISOString() };
    if (JSON.stringify(data).length > 1000000){ UI.toast("الصور كبيرة جداً. استخدم صورة كليشة أصغر", "err"); return; }
    try {
      if (hEdit) await db.collection("hrHeads").doc(hEdit.id).set(data);
      else { const r = await db.collection("hrHeads").add(data); try { localStorage.setItem(HEAD_KEY, r.id); } catch {} }
      $("hdEditor").hidden = true; hEdit = null; hDraft = null; UI.toast("حُفظت الكليشة");
    } catch (err){ console.error(err); UI.toast("تعذّر حفظ الكليشة", "err"); }
  });
  $("hdCancel").addEventListener("click", () => { $("hdEditor").hidden = true; hEdit = null; hDraft = null; });
  $("hdNew").addEventListener("click", () => openHead(null));

  /* ---------- tabs and wiring ---------- */
  function setTab(t){
    document.querySelectorAll("[data-hrtab]").forEach(b => b.setAttribute("aria-selected", b.dataset.hrtab === t ? "true" : "false"));
    $("hrNew").hidden = t !== "new"; $("hrLog").hidden = t !== "log"; $("hrTpls").hidden = t !== "tpl"; $("hrHeads").hidden = t !== "heads";
    setTimeout(() => { fit(); placeSeal($("hrPaper")); placeSeal($("hdPaper")); }, 20);
  }
  document.querySelectorAll("[data-hrtab]").forEach(b => b.addEventListener("click", () => setTab(b.dataset.hrtab)));
  $("hrTpl").addEventListener("change", async () => {
    if (manual && !(await UI.confirm("تغيير نوع الخطاب يستبدل النص الذي عدّلته على الورقة. متابعة؟", { ok: "استبدال" }))) return;
    setManual(false); renderFields(); renderPaper();
  });
  $("hrHead").addEventListener("change", () => { try { localStorage.setItem(HEAD_KEY, $("hrHead").value); } catch {} renderPaper("head"); });
  ["hrAssoc", "hrDate"].forEach(id => $(id).addEventListener("input", () => renderPaper()));
  ["hrSignName", "hrSignRole"].forEach(id => $(id).addEventListener("input", () => {
    sign = { name: $("hrSignName").value, role: $("hrSignRole").value };
    try { localStorage.setItem(SIGN_KEY, JSON.stringify(sign)); } catch {}
    renderPaper();
  }));
  $("hrRegen").addEventListener("click", async () => { if (await UI.confirm("إعادة بناء الخطاب من القالب والخانات؟ تضيع تعديلاتك على الورقة.", { ok: "إعادة البناء" })){ setManual(false); renderPaper(true); } });
  function renderSealForm(){
    [["sig", "hrSigPrev", "hrSigClear"], ["stamp", "hrStampPrev", "hrStampClear"]].forEach(([k, prev, clr]) => {
      const p = $(prev); p.innerHTML = seal[k] ? `<img src="${seal[k]}" alt="">` : '<span class="muted-text">لا توجد صورة</span>'; $(clr).hidden = !seal[k];
    });
    $("hrSigH").value = seal.sigH; $("hrSigHv").textContent = seal.sigH + "mm";
    $("hrStampW").value = seal.stampW; $("hrStampWv").textContent = seal.stampW + "mm";
    $("hrSealSignin").hidden = !!db; $("hrSealBox").hidden = !db;
  }
  async function saveSeal(patch){
    seal = { ...seal, ...patch }; renderSealForm(); renderPaper("sign");
    if (!db) return;
    try { await db.collection("hrMeta").doc("seal").set(seal); } catch (e){ console.error(e); UI.toast("تعذّر حفظ الختم والتوقيع", "err"); }
  }
  [["hrSigFile", "sig"], ["hrStampFile", "stamp"]].forEach(([inp, k]) => $(inp).addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try { await saveSeal({ [k]: await imgData(f, 600, true) }); UI.toast(k === "sig" ? "حُفظ التوقيع" : "حُفظ الختم"); }
    catch { UI.toast("تعذّرت قراءة الصورة", "err"); }
  }));
  $("hrSigClear").addEventListener("click", () => saveSeal({ sig: "" }));
  $("hrStampClear").addEventListener("click", () => saveSeal({ stamp: "" }));
  let sizeT = null;
  [["hrSigH", "sigH"], ["hrStampW", "stampW"]].forEach(([id, k]) => $(id).addEventListener("input", e => {
    seal[k] = +e.target.value; $(id + "v").textContent = e.target.value + "mm"; renderPaper("sign");
    clearTimeout(sizeT); sizeT = setTimeout(() => saveSeal({}), 600);
  }));
  ["hrShowSig", "hrShowStamp"].forEach(id => $(id).addEventListener("change", () => renderPaper("sign")));
  $("hrSealReset").addEventListener("click", () => { saveSeal({ sigDX: 0, sigDY: 0, stampDX: 0, stampDY: 0 }); UI.toast("رجع الختم والتوقيع تحت اسم المعتمد"); });
  // drag the signature or stamp on the page; the page is scaled, so pixels are turned back into millimetres
  $("hrPaper").addEventListener("pointerdown", e => {
    const box = e.target.closest(".lt-sb.drag"); if (!box) return;
    e.preventDefault();
    const el = e.target; try { el.setPointerCapture(e.pointerId); } catch {}
    box.classList.add("moving");
    const k = parseFloat(getComputedStyle($("hrPaper")).getPropertyValue("--k")) || 1, mm = PX_MM * k;
    const key = box.dataset.k, sx = e.clientX, sy = e.clientY;
    const x0 = parseFloat(box.style.left), y0 = parseFloat(box.style.top);
    const r = box.getBoundingClientRect(), w0 = r.width / mm, h0 = r.height / mm, ratio = h0 / w0;
    const handle = e.target.classList.contains("h") ? [...e.target.classList].find(c => c.length === 2) : null;
    const snap = v => Math.round(v * 2) / 2;
    const move = ev => {
      const dx = (ev.clientX - sx) / mm, dy = (ev.clientY - sy) / mm;
      if (!handle){
        box.style.left = snap(Math.max(-20, Math.min(200, x0 + dx))) + "mm";
        box.style.top = snap(Math.max(-10, Math.min(290, y0 + dy))) + "mm";
        return;
      }
      const east = handle[1] === "e", north = handle[0] === "n";
      // the corner follows the pointer; size keeps the image's proportions
      const byX = east ? dx : -dx, byY = (north ? -dy : dy) / ratio;
      const w = Math.max(8, Math.min(120, w0 + (Math.abs(byX) > Math.abs(byY) ? byX : byY))), h = w * ratio;
      if (key === "stamp") box.style.width = snap(w) + "mm"; else box.style.height = snap(h) + "mm";
      box.style.left = snap(east ? x0 : x0 + (w0 - w)) + "mm";
      box.style.top = snap(north ? y0 + (h0 - h) : y0) + "mm";
    };
    const up = () => {
      el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); box.classList.remove("moving");
      const patch = {};
      if (handle){ if (key === "stamp") patch.stampW = parseFloat(box.style.width); else patch.sigH = parseFloat(box.style.height); }
      const A = anchorOf($("hrPaper"));
      if (A){ const { w, h } = boxSize(box, A), base = baseOf(key, w, h, A);
        patch[key + "DX"] = Math.round((parseFloat(box.style.left) - base.x) * 2) / 2; patch[key + "DY"] = Math.round((parseFloat(box.style.top) - base.y) * 2) / 2; }
      saveSeal(patch);
    };
    el.addEventListener("pointermove", move); el.addEventListener("pointerup", up);
  });

  $("hrSave").addEventListener("click", saveAndPrint);
  $("hrPrint").addEventListener("click", () => { if (curTpl()) printParts(draft(), curHead(), grab()); });
  $("hrClear").addEventListener("click", () => { Object.keys(values).forEach(k => delete values[k]); setManual(false); renderFields(); renderPaper(true); msg(""); });
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
    $("hrSignin").hidden = true; $("hdNew").hidden = false; $("hdSignin").hidden = true;
    db.collection("hrTemplates").onSnapshot(async snap => {
      const list = snap.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
      if (!list.length) { if (seeding) return; } else templates = list;
      if (!list.length && !seeding){ // first use: add the standard letters
        seeding = true;
        const batch = db.batch();
        DEFAULT_TEMPLATES.forEach(t => { const { since, ...rest } = t; batch.set(db.collection("hrTemplates").doc(), { ...rest, builtin: true, updatedAt: new Date().toISOString() }); });
        batch.set(db.collection("hrMeta").doc("templates"), { v: TPL_VERSION });
        await batch.commit().catch(console.error);
        return;
      }
      fillTplSelect(); renderTpls(); migrate();
    }, e => console.error(e));
    db.collection("hrLetters").onSnapshot(snap => { letters = snap.docs.map(x => ({ id: x.id, ...x.data() })); renderLog(); }, e => console.error(e));
    db.collection("hrMeta").doc("seal").onSnapshot(d => { if (d.exists){ seal = { ...seal, ...d.data() }; renderSealForm(); renderPaper("sign"); } }, () => {});
    renderSealForm();
    db.collection("hrHeads").onSnapshot(snap => { heads = snap.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => a.name.localeCompare(b.name)); fillHeadSelect(); renderHeads(); }, e => console.error(e));
    db.collection("associations").onSnapshot(snap => {
      $("hrAssocList").innerHTML = ""; snap.docs.map(x => x.data().name).filter(Boolean).forEach(n => $("hrAssocList").append(new Option(n, n)));
    }, () => {});
  }
  // before sign-in the standard letters still preview, they just can't be saved
  templates = DEFAULT_TEMPLATES.map((t, i) => ({ id: "local" + i, ...t }));
  fontList(); fillTplSelect(); renderTpls(); renderLog(); renderHeads(); fillHeadSelect(); renderSealForm();
  if (window.appDb && window.appUser) connect({ db: window.appDb, user: window.appUser });
  window.addEventListener("app:db", e => connect(e.detail));
})();
