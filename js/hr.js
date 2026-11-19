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
  const SUFFIXES = ["المحترمين", "المكرمين", "وفقهم الله", "حفظهم الله", "المحترم", "حفظه الله", ""];
  const PREFIXES = [["السادة", "المحترمين"], ["سعادة", "المحترم"], ["معالي", "المحترم"], ["فضيلة", "حفظه الله"], ["المكرم", "المحترم"], ["", ""]];
  const TPL_VERSION = 4;
  const HELLO = "السلام عليكم ورحمة الله وبركاته، وبعد:";
  // the closing line is a field with a list of phrases, like the recipient
  const CLOSING = "عبارة الختام";
  const CLOSINGS = ["وتقبلوا وافر التحية والتقدير،،", "نشكر تعاونكم معنا،،", "والله يحفظكم ويرعاكم،،", "شاكرين لكم،،", "شاكرين ومقدرين لكم تعاونكم، سائلين المولى أن يحفظكم ويرعاكم.", "هذا وللأهمية،،", ""];
  const THANKS = `{{${CLOSING}}}`;

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
    { order: 5, since: 2, category: "الدعم والمخاطبات", title: "طلب دعم عيني", v4: true, body:
`{{الجهة الموجه لها}}

${HELLO}

تهديكم {{اسم الجمعية}} أطيب التحيات، وتتقدم لكم بوافر الشكر والتقدير على دعمكم اللامحدود للقطاع غير الربحي، ودوركم المتميز والملموس في خدمة المجتمع.

وتفخر الجمعية بما حققته من إنجازات متتالية، إذ حصلت على:
{{إنجازات الجمعية|المركز الأول: في جائزة التنمية الشبابية على مستوى المملكة.
المركز الثاني: في جائزة الابتكار الشبابي على مستوى المملكة.
المركز الرابع: في جائزة العاملين مع الشباب على مستوى المملكة.}}

وتواصل الجمعية رسالتها في {{رسالة الجمعية|تنمية قدرات الشباب ومهاراتهم، من خلال برامج ومبادرات نوعية تخدم بها جميع الشباب}}.

ويأتي في مقدمتها برنامج «{{اسم البرنامج|رحلات مسارات}}»، وهو {{وصف البرنامج|مبادرة للشباب المتفوقين تهدف إلى إثرائهم معرفيًا ومهاريًا وقيميًا، عبر رحلات اجتماعية خارج جدة تتضمن برامج متنوعة}}. وضمن البرنامج تنظّم الجمعية {{النشاط|رحلة إلى المدينة المنورة}} من {{يوم وتاريخ البداية}} إلى {{يوم وتاريخ النهاية}}، بمشاركة {{عدد المستفيدين}} مستفيداً و{{عدد المشرفين}} مشرفين (بإجمالي {{إجمالي المشاركين}} مشاركاً).

نأمل من سعادتكم التكرّم بدعم {{الدعم المطلوب|المرفق (السكن) للمشاركين طوال أيام الرحلة}}.

{{عبارة الختام|شاكرين ومقدرين لكم تعاونكم، سائلين المولى أن يحفظكم ويرعاكم.}}` },
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
  // what this user may do here (js/requests.js → HRLetters.setPerms); all allowed until known
  let P = { submit: true, issue: true, editText: true, editIssued: true, viewLog: true, deleteLog: true, templates: true, heads: true, seal: true, pdf: true, printDraft: true, sign: true, admin: true };
  // the signer an admin sets for everyone (settings/letters); users without «sign» always use it
  let signShared = null, signSaveT = null;
  function useSharedSign(){
    if (!signShared || P.sign) return;
    $("hrSignRole").value = signShared.signRole || ""; $("hrSignName").value = signShared.signName || "";
    renderPaper();
  }
  let editingLetter = null; // an issued letter opened from the log: saving updates it and keeps its number
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
  const unmark = raw => raw.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const splitField = r => { const raw = unmark(r); const i = raw.indexOf("|"); return i < 0 ? { name: raw.trim(), def: null } : { name: raw.slice(0, i).trim(), def: raw.slice(i + 1).trim() }; };
  function fieldsOf(body){ const out = []; for (const m of (body || "").matchAll(FIELD_RX)){ const f = splitField(m[1]).name; if (!AUTO.has(f) && !out.includes(f)) out.push(f); } return out; }
  function defaultsOf(body){ const d = {}; for (const m of (body || "").matchAll(FIELD_RX)){ const { name, def } = splitField(m[1]); if (def != null && !(name in d)) d[name] = def; } return d; }
  const kind = f => f === RECIP ? "recip" : f === CLOSING ? "closing" : /إنجازات|قائمة|بنود|نقاط/.test(f) ? "list" : /تاريخ/.test(f) ? "date" : /راتب|بدل|مبلغ|البدلات|تكلفة|عدد|إجمالي/.test(f) ? "number" : /وصف|سبب|موضوع|هدف|رسالة/.test(f) ? "long" : "text";
  function fieldValue(f, vals){
    const v = (vals[f] ?? "").toString().trim();
    if (!v) return null;
    if (kind(f) === "date"){ if (/يوم/.test(f)){ const d = new Date(v + "T12:00:00"); return isNaN(d) ? v : `${weekday(d)} ${hijri(d)}هـ`; } return fmtDateField(v); }
    if (kind(f) === "number" && !isNaN(+v)) return (+v).toLocaleString("en-US");
    return v;
  }
  function recipHtml(vals){
    const name = (vals[RECIP] || "").trim(); const pre = vals[RECIP + "#p"] ?? "السادة";
    const chosen = vals[RECIP + "#s"];
    if (!name) return `<span class="lt-blank" data-f="${esc(RECIP)}">${esc(RECIP)}</span>`;
    const suffix = chosen != null ? chosen : (PREFIXES.find(p => p[0] === pre) || ["", ""])[1];
    return `<span class="lt-to" data-f="${esc(RECIP)}"><span>${pre ? esc(pre) + "/ " : ""}<span class="lt-v">${esc(name)}</span></span>${suffix ? `<span>${esc(suffix)}</span>` : ""}</span>`;
  }

  /* ---------- letter parts ---------- */
  // plain text values are edited right on the page and their box follows (see syncFromPaper);
  // formatted ones (dates, numbers, lists, recipient, closing) are one locked piece changed from their box
  const typable = f => AUTO.has(f) || kind(f) === "text" || kind(f) === "long";
  const atom = h => h.replace(/^<span /, '<span contenteditable="false" ');
  function fieldHtml(raw, vals){ const h = fieldHtml0(raw, vals); return typable(splitField(raw).name) ? h : atom(h); }
  function fieldHtml0(raw, vals){
    raw = splitField(raw).name;
    if (raw === RECIP) return recipHtml(vals);
    if (kind(raw) === "list"){ // one line per item, shown as bullets
      const lines = (vals[raw] || "").split("\n").map(l => l.trim()).filter(Boolean);
      return lines.length ? `<span class="lt-v lt-list lt-long" data-f="${esc(raw)}">${lines.map(l => "• " + esc(l.replace(/^[•\-*]\s*/, ""))).join("<br>")}</span>` : `<span class="lt-blank" data-f="${esc(raw)}">${esc(raw)}</span>`;
    }
    if (raw === CLOSING){ const v = vals[CLOSING] ?? CLOSINGS[0]; return `<span class="lt-v" data-f="${esc(CLOSING)}">${esc(v)}</span>`; }
    const v = AUTO.has(raw) ? (vals[raw] || "").trim() || null : fieldValue(raw, vals);
    // long values (descriptions, missions) read as normal text; short ones (names, numbers, dates) stand out
    return v ? `<span class="lt-v${kind(raw) === "long" ? " lt-long" : ""}" data-f="${esc(raw)}">${esc(v)}</span>` : `<span class="lt-blank" data-f="${esc(raw)}">${esc(raw)}</span>`;
  }
  // after hand edits, the values that came from fields still follow their fields
  function refreshFields(paper, vals){
    const s = getSelection(), at = s.rangeCount ? s.anchorNode : null;
    paper.querySelectorAll("[data-f]").forEach(el => {
      if (at && el.contains(at)) return;
      // formatting given to the value on the page (bold, size, colour…) stays when the value changes
      const st = el.getAttribute("style");
      let html = fieldHtml(el.dataset.f, vals);
      if (st) html = html.replace(/^<span /, `<span style="${st.replace(/"/g, "&quot;")}" `);
      if (el.outerHTML !== html){ const t = document.createElement("template"); t.innerHTML = html; el.replaceWith(t.content); }
    });
    paper.querySelectorAll(`[data-f="${CLOSING}"]`).forEach(el => { const p = el.closest("p"); if (p && p.textContent.trim() === el.textContent.trim()) p.classList.add("lt-close"); });
    island(paper);
  }
  // on the editable page each typable value is its own small editing area inside the letter:
  // the browser can't delete or split it while typing, so the link to its box never breaks
  function island(paper){
    if (paper.id !== "hrPaper" || !P.editText) return;
    paper.querySelectorAll(".lt-body [data-f]").forEach(el => {
      if (!typable(el.dataset.f) || el.querySelector(":scope > .lt-in")) return;
      const inn = document.createElement("span"); inn.className = "lt-in"; inn.contentEditable = "true"; inn.spellcheck = false;
      inn.append(...el.childNodes); el.append(inn); el.contentEditable = "false";
    });
  }
  function unisland(root){
    root.querySelectorAll(".lt-in").forEach(inn => { const el = inn.parentElement; inn.replaceWith(...inn.childNodes); if (el && el.dataset.f && typable(el.dataset.f)) el.removeAttribute("contenteditable"); });
    return root;
  }
  // recipient, greeting and closing paragraphs get their own look (bold; the closing centred)
  function clsOf(text){
    const t = text.trim();
    if (new RegExp(`^\\{\\{\\s*${RECIP}\\s*(\\|[^}]*)?\\}\\}$`).test(t)) return "lt-recip";
    if (new RegExp(`^\\{\\{\\s*${CLOSING}\\s*(\\|[^}]*)?\\}\\}$`, "s").test(t)) return "lt-close";
    if (/^السلام عليكم ورحمة الله وبركاته/.test(t)) return "lt-hello";
    return "";
  }
  function genBody(body, vals, isHtml){
    if (isHtml){
      const tpl = document.createElement("template"); tpl.innerHTML = clean(body);
      tpl.content.querySelectorAll("p,div,h3,h4").forEach(p => { const c = clsOf(p.textContent); if (c) p.classList.add(c); });
      return tpl.innerHTML.replace(FIELD_RX, (_, f) => fieldHtml(f, vals));
    }
    const fill = text => esc(text).replace(FIELD_RX, (_, f) => fieldHtml(f, vals));
    return (body || "").split(/\n\s*\n/).map(p => { const c = clsOf(p); return `<p${c ? ` class="${c}"` : ""}>${fill(p).replace(/\n/g, "<br>")}</p>`; }).join("");
  }
  const plainToHtml = text => (text || "").split(/\n\s*\n/).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("") || "<p><br></p>";
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
    return `<div class="lt-m"><span>اليوم:</span> ${weekday(d)}</div><div class="lt-m"><span>التاريخ:</span> ${hijri(d)} هـ</div><div class="lt-m"><span>الموافق:</span> ${greg(d)} م</div><div class="lt-m"><span>الرقم:</span> <bdi>${esc(L.ref ? String(L.ref).split("/")[0] : "يُعطى عند الحفظ")}</bdi></div>`;
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
  // three centred lines: the recipient (bold), the number, then the day and date; each stays on one line,
  // and the number and date lines always share one size so the block looks even
  function frameHtml(L, fr){
    const d = parseDay(L.date), f = L.fields || {};
    const name = (f[RECIP] || "").trim();
    // the frame shows the letter's number only (011), the year stays in the full reference (011/1448)
    const ref = L.ref ? String(L.ref).split("/")[0] : "يُعطى عند الحفظ";
    const line2 = ref, line3 = `${weekday(d)} ${greg(d)} م`;
    const base = fr ? fr.fontSize : 12, room = fr ? fr.w - 2 * fr.padSide : 60;
    const nameSize = name ? fitSize(name, base + 1, room) : base;
    const small = Math.min(fitSize(line2, base, room), fitSize(line3, base, room));
    const to = name ? esc(name) : `<span class="lt-blank">${esc(RECIP)}</span>`;
    return `<div class="lt-m lt-fto" style="font-size:${nameSize}px">${to}</div>` +
      `<div class="lt-m lt-fl" style="font-size:${small}px"><bdi>${esc(ref)}</bdi></div>` +
      `<div class="lt-m lt-fl" style="font-size:${small}px">${esc(line3)}</div>`;
  }
  /* the whole A4 page; parts = { title, body, sign, hdr, ftr } (HTML), editable puts contenteditable on them */
  function paperInner(L, head, parts, editable, sealEditable = editable){
    const ce = editable ? ' contenteditable="true" spellcheck="false"' : "";
    const m = (head && head.margins) || { top: 22, bottom: 22, side: 20 };
    const fr = head && head.frame && head.frame.image ? head.frame : null;
    const hdr = parts.showHdr !== false && (parts.hdr || editable) ? `<div class="lt-hdr" style="top:6mm;inset-inline:${m.side}mm;min-height:${Math.max(8, m.top - 10)}mm"${ce} data-ph="ترويسة أعلى الصفحة">${parts.hdr || ""}</div>` : "";
    const ftr = parts.showFtr !== false && (parts.ftr || editable) ? `<div class="lt-ftr" style="bottom:6mm;inset-inline:${m.side}mm;min-height:${Math.max(8, m.bottom - 10)}mm"${ce} data-ph="تذييل أسفل الصفحة">${parts.ftr || ""}</div>` : "";
    const frame = fr ? `<div class="lt-frame" style="top:${fr.y}mm;left:${fr.x}mm;width:${fr.w}mm"><img src="${fr.image}" alt=""><div class="lt-frame-t" style="padding:${fr.padTop}mm ${fr.padSide}mm 0;font-size:${fr.fontSize}px">${frameHtml(L, fr)}</div></div>` : "";
    const plainHead = !fr ? `<header class="lt-head">${head && head.bg ? "<span></span>" : `<div class="lt-org">${esc(L.assoc || "")}</div>`}<div class="lt-meta">${metaHtml(L)}</div></header>` : "";
    return `${hdr}${frame}<div class="lt-content" style="padding:${m.top}mm ${m.side}mm ${m.bottom}mm">${plainHead}
      <h2 class="lt-title"${ce}>${parts.title}</h2><div class="lt-body"${ce}>${parts.body}</div><div class="lt-signbox"><footer class="lt-sign"${ce}>${parts.sign}</footer></div></div>${ftr}${sealHtml(parts, sealEditable)}`;
  }
  const paperStyle = head => head && head.bg ? `background-image:url("${head.bg}")` : "";

  /* ---------- new letter: form + editable paper ---------- */
  const curTpl = () => templates.find(t => t.id === $("hrTpl").value) || null;
  const curHead = () => heads.find(h => h.id === $("hrHead").value) || null;
  function draft(){
    const t = curTpl() || { title: "", body: "" };
    const defs = defaultsOf(t.body);
    const fields = Object.fromEntries(fieldsOf(t.body).flatMap(f => f === RECIP ? [[f, values[f] || ""], [f + "#p", values[f + "#p"] ?? "السادة"], ...(values[f + "#s"] != null ? [[f + "#s", values[f + "#s"]]] : [])] : [[f, values[f] ?? defs[f] ?? (f === CLOSING ? CLOSINGS[0] : "")]]));
    return { ref: editingLetter && editingLetter.kind !== "request" ? editingLetter.ref : undefined, title: t.title, body: t.body, html: !!t.html, templateId: t.id || "", headId: $("hrHead").value || "", assoc: $("hrAssoc").value.trim(), date: $("hrDate").value || ymd(new Date()),
             fields, signName: $("hrSignName").value.trim(), signRole: $("hrSignRole").value.trim(), showSig: !pendSign() && $("hrShowSig").checked, showStamp: !pendSign() && $("hrShowStamp").checked };
  }
  const vals = L => ({ ...L.fields, [ASSOC_FIELD]: L.assoc, "صفة المعتمد": L.signRole, "اسم المعتمد": L.signName });
  function headParts(head){ return { hdr: head ? head.hdr || "" : "", ftr: head ? head.ftr || "" : "" }; }
  // users who can only submit: no signer, signature or stamp anywhere until the final approval
  const pendSign = () => !P.issue && !P.admin;
  const PENDING_SIGN = '<div class="lt-pend">الاعتماد والتوقيع والختم تظهر بعد الاعتماد النهائي</div>';
  function renderPaper(force){
    const paper = $("hrPaper"), t = curTpl(), head = curHead(), L = draft();
    if (!t){ paper.removeAttribute("style"); paper.innerHTML = '<p class="lt-empty">اختر نوع الخطاب</p>'; fit(); return; }
    if (manual && !force){ // keep the edited text, only refresh the date and number
      paper.querySelectorAll(".lt-meta").forEach(el => { el.innerHTML = metaHtml(L); });
      const fr = head && head.frame && head.frame.image ? head.frame : null;
      paper.querySelectorAll(".lt-frame-t").forEach(el => { el.innerHTML = frameHtml(L, fr); });
      relink(paper, L);
      refreshFields(paper, vals(L));
      lastVals = vals(L);
      return;
    }
    const keep = force === "head" || force === "sign" ? grab() : null;
    // users who can only submit see no signer, signature or stamp until the final approval
    const pend = pendSign();
    const sw = pend ? { showSig: false, showStamp: false } : { showSig: L.showSig, showStamp: L.showStamp };
    const signHtml = pend ? PENDING_SIGN : genSign(L, sw);
    if (keep && (force === "sign" || pend)) keep.sign = signHtml;
    const parts = keep ? { ...keep, ...headParts(head), showHdr, showFtr, ...sw, sealPos: null, sealSize: null } :
      { title: esc(t.title), body: genBody(t.body, vals(L), !!t.html), sign: signHtml, ...headParts(head), showHdr, showFtr, ...sw };
    paper.setAttribute("style", paperStyle(head));
    paper.innerHTML = paperInner(L, head, parts, P.editText, P.seal);
    island(paper);
    fit(); placeSeal(paper);
    lastVals = vals(L);
  }
  // letters edited before values were locked: a field whose piece is gone is found again by its old text
  let lastVals = null;
  function relink(paper, L){
    const body = paper.querySelector(".lt-body"); if (!body || !lastVals) return;
    const now = vals(L);
    fieldsOf(L.body).forEach(f => {
      if (kind(f) === "list" || f === RECIP || body.querySelector(`[data-f="${CSS.escape(f)}"]`)) return;
      const old = AUTO.has(f) ? (lastVals[f] || "").trim() : fieldValue(f, lastVals);
      if (!old || old === (AUTO.has(f) ? (now[f] || "").trim() : fieldValue(f, now))) return;
      const w = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());){
        const i = n.data.indexOf(old); if (i < 0 || n.parentElement.closest("[data-f]")) continue;
        const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + old.length);
        const t = document.createElement("template"); t.innerHTML = fieldHtml(f, lastVals);
        r.deleteContents(); r.insertNode(t.content); break;
      }
    });
  }
  // typing inside a value on the page updates its box, and the same value elsewhere in the letter
  const SRC = { [ASSOC_FIELD]: "hrAssoc", "اسم المعتمد": "hrSignName", "صفة المعتمد": "hrSignRole" };
  function syncFromPaper(){
    const s = getSelection(); if (!s.rangeCount) return;
    const n = s.anchorNode, el = n && (n.nodeType === 1 ? n : n.parentElement);
    const span = el && el.closest("#hrPaper [data-f]"); if (!span || !typable(span.dataset.f)) return;
    const f = span.dataset.f, text = span.textContent;
    span.classList.toggle("lt-blank", !text.trim()); span.classList.toggle("lt-v", !!text.trim());
    if (SRC[f]){ $(SRC[f]).value = text; if (f !== ASSOC_FIELD) sign = { name: $("hrSignName").value, role: $("hrSignRole").value }; }
    else {
      values[f] = text;
      const row = [...$("hrFields").querySelectorAll(".s-row")].find(r => r.dataset.f === f), inp = row && row.querySelector("input,textarea");
      if (inp) inp.value = text;
    }
    const v = vals(draft());
    $("hrPaper").querySelectorAll(`[data-f="${CSS.escape(f)}"]`).forEach(o => {
      if (o === span) return; const t = document.createElement("template"); t.innerHTML = fieldHtml(f, v); o.replaceWith(t.content);
    });
    island($("hrPaper"));
    lastVals = v;
  }
  $("hrPaper").addEventListener("input", syncFromPaper);
  $("hrPaper").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.closest && e.target.closest(".lt-in")) e.preventDefault(); });
  // clicking a value on the page opens its box in the form
  $("hrPaper").addEventListener("click", e => {
    const el = e.target.closest("[data-f]"); if (!el || !el.closest(".lt-body,.lt-frame-t")) return;
    if (typable(el.dataset.f) && el.querySelector(".lt-in")){ const row = [...$("hrFields").querySelectorAll(".s-row")].find(r => r.dataset.f === el.dataset.f); if (row){ row.classList.remove("hr-flash"); void row.offsetWidth; row.classList.add("hr-flash"); } return; }
    const row = [...$("hrFields").querySelectorAll(".s-row")].find(r => r.dataset.f === el.dataset.f); if (!row) return;
    const inp = row.querySelector("input,textarea,select"); if (!inp) return;
    row.scrollIntoView({ block: "center", behavior: "smooth" }); inp.focus({ preventScroll: true });
    row.classList.remove("hr-flash"); void row.offsetWidth; row.classList.add("hr-flash");
  });
  function grab(){
    const p = $("hrPaper"), g = sel => { const el = p.querySelector(sel); return el ? clean(unisland(el.cloneNode(true)).innerHTML) : ""; };
    return { title: g(".lt-title"), body: g(".lt-body"), sign: g(".lt-sign"), hdr: g(".lt-hdr"), ftr: g(".lt-ftr"), showHdr, showFtr, showSig: !pendSign() && $("hrShowSig").checked, showStamp: !pendSign() && $("hrShowStamp").checked, sealPos: sealNow(), sealSize: sealSizeNow() };
  }
  function sealNow(){
    const p = $("hrPaper"), box = k => p.querySelector(`.lt-sb[data-k="${k}"]`);
    const r = {};
    ["sig", "stamp"].forEach(k => { const b = box(k); if (b){ r[k + "X"] = parseFloat(b.style.left); r[k + "Y"] = parseFloat(b.style.top); } });
    return Object.keys(r).length ? r : null;
  }
  function sealSizeNow(){ return { sigH: seal.sigH, stampW: seal.stampW }; }
  // picking a closing phrase brings the closing line back if it was removed while editing the letter by hand
  function ensureClosing(){
    const body = $("hrPaper").querySelector(".lt-body"); if (!body || body.querySelector(`[data-f="${CLOSING}"]`)) return;
    const p = document.createElement("p"); p.className = "lt-close";
    p.innerHTML = fieldHtml(CLOSING, vals(draft()));
    body.append(p);
  }
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
      const row = document.createElement("div"); row.className = "s-row"; row.dataset.f = f;
      const id = "hrf-" + Math.random().toString(36).slice(2, 8);
      const k = kind(f);
      if (k === "recip"){
        row.innerHTML = `<label for="${id}"></label><div class="hr-recip"><select class="select" aria-label="الصفة"></select><select class="select" aria-label="اللقب الختامي"></select><input class="input" id="${id}" type="text" placeholder="اسم الجهة"></div>`;
        const [sel, suf] = row.querySelectorAll("select");
        PREFIXES.forEach(([p]) => sel.append(new Option(p || "بدون صفة", p)));
        SUFFIXES.forEach(x => suf.append(new Option(x || "بدون لقب", x)));
        const defSuf = () => (PREFIXES.find(p => p[0] === sel.value) || ["", ""])[1];
        sel.value = values[f + "#p"] ?? "السادة";
        suf.value = values[f + "#s"] ?? defSuf();
        // the closing title follows the prefix until it is picked by hand
        sel.addEventListener("change", () => { values[f + "#p"] = sel.value; if (values[f + "#s"] == null) suf.value = defSuf(); renderPaper(); });
        suf.addEventListener("change", () => { values[f + "#s"] = suf.value; renderPaper(); });
      } else if (k === "closing"){
        row.innerHTML = `<label for="${id}"></label><select class="select" id="${id}"></select>`;
        const sel = row.querySelector("select");
        const own = defaultsOf(t.body)[f];
        [...(own != null && !CLOSINGS.includes(own) ? [own] : []), ...CLOSINGS].forEach(x => sel.append(new Option(x ? x.replace(/،+$/, "") : "بدون", x)));
        sel.value = values[f] ?? own ?? CLOSINGS[0];
        sel.addEventListener("change", () => { values[f] = sel.value; renderPaper(); ensureClosing(); });
        row.querySelector("label").textContent = f; box.append(row); return;
      } else {
        row.innerHTML = `<label for="${id}"></label>` + (k === "list" ? `<textarea class="input" id="${id}" rows="4" placeholder="كل بند في سطر"></textarea>` : k === "long" ? `<textarea class="input" id="${id}" rows="3"></textarea>` : `<input class="input" id="${id}" type="${k === "date" ? "date" : k === "number" ? "number" : "text"}"${k === "number" ? ' inputmode="decimal" min="0" step="any"' : ""}>`);
      }
      row.querySelector("label").textContent = f;
      const inp = row.querySelector("input,textarea"); inp.value = values[f] ?? defaultsOf(t.body)[f] ?? "";
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
  const sharedHead = () => (signShared && signShared.defaultHead && heads.some(h => h.id === signShared.defaultHead)) ? signShared.defaultHead : "";
  function fillHeadSelect(){
    const sel = $("hrHead");
    let own = ""; try { own = localStorage.getItem(HEAD_KEY) || ""; } catch {}
    const keep = !P.heads ? sharedHead() : (sel.value || own || sharedHead());
    sel.innerHTML = ""; sel.append(new Option("بدون كليشة", ""));
    heads.forEach(h => sel.append(new Option(h.name, h.id)));
    sel.value = heads.some(h => h.id === keep) ? keep : "";
    sel.disabled = !P.heads && !P.admin;
    if (!editingLetter || editingLetter.kind === "request") renderPaper("head");
  }
  // shared letters settings (settings/letters): the admin's signer and letterhead are everyone's defaults
  function saveShared(patch){ if (P.admin && db) db.collection("settings").doc("letters").set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true }).catch(e => console.error(e)); }
  function msg(t, k){ $("hrMsg").textContent = t || ""; $("hrMsg").className = "s-msg" + (k ? " " + k : ""); }

  /* ---------- toolbars: one over the letter, one in the template editor; each works on the editable area with the caret ---------- */
  let range = null;
  const EDIT_ROOTS = () => [$("hrPaper"), $("hrEdBody")].filter(Boolean);
  const elOf = n => n && (n.nodeType === 1 ? n : n.parentNode);
  const inPaper = n => { const el = elOf(n); return !!el && EDIT_ROOTS().some(r => r.contains(el)) && !!el.closest("[contenteditable=true]"); };
  document.addEventListener("selectionchange", () => {
    const s = getSelection(); if (s.rangeCount && inPaper(s.anchorNode)){ range = s.getRangeAt(0).cloneRange(); syncTools(); }
  });
  function restore(){ if (!range) return false; const s = getSelection(); s.removeAllRanges(); s.addRange(range); return true; }
  function exec(cmd, val){
    if (!restore()) return;
    document.execCommand("styleWithCSS", false, cmd !== "fontSize");
    document.execCommand(cmd, false, val ?? null);
    styleFields(cmd, val);
    afterEdit();
  }
  // values that come from the fields are locked pieces the browser's commands skip, so the
  // formatting is put on the piece itself (the whole value), and kept when the value changes
  // Ctrl+B / I / U go through the same path, so they also reach the values from the fields
  EDIT_ROOTS().forEach(r => r.addEventListener("keydown", e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const cmd = { b: "bold", i: "italic", u: "underline" }[e.key.toLowerCase()] || { KeyB: "bold", KeyI: "italic", KeyU: "underline" }[e.code];
    if (!cmd) return;
    const s = getSelection(); if (s.rangeCount) range = s.getRangeAt(0).cloneRange();
    e.preventDefault(); exec(cmd);
  }));
  function fieldsInRange(){
    if (!range) return [];
    const inner = n => { const e = elOf(n); return e && e.closest(".lt-in"); };
    const a = inner(range.startContainer); if (a && a === inner(range.endContainer) && !range.collapsed) return []; // part of a typed value: the browser handles it
    return EDIT_ROOTS().flatMap(r => [...r.querySelectorAll("[data-f]")]).filter(el => !el.parentElement.closest("[data-f]") && range.intersectsNode(el));
  }
  function styleFields(cmd, val){
    const els = fieldsInRange(); if (!els.length) return;
    const cs = el => getComputedStyle(el.querySelector(".lt-v") || el);
    const deco = (el, line) => { const set = new Set((el.style.textDecorationLine || "").split(" ").filter(x => x && x !== "none")); const on = cs(el).textDecorationLine.includes(line); on ? set.delete(line) : set.add(line); el.style.textDecorationLine = [...set].join(" ") || "none"; };
    const allOn = test => els.every(el => test(cs(el)));
    const bold = allOn(c => parseInt(c.fontWeight, 10) >= 600), ital = allOn(c => c.fontStyle === "italic");
    els.forEach(el => {
      const parts = [el, ...el.querySelectorAll(".lt-v")];
      if (cmd === "bold") parts.forEach(x => { x.style.fontWeight = bold ? "400" : "700"; });
      else if (cmd === "italic") el.style.fontStyle = ital ? "normal" : "italic";
      else if (cmd === "underline") deco(el, "underline");
      else if (cmd === "strikeThrough") deco(el, "line-through");
      else if (cmd === "foreColor") el.style.color = val;
      else if (cmd === "hiliteColor") el.style.backgroundColor = val;
      else if (cmd === "fontName") el.style.fontFamily = `"${val}"`;
      else if (cmd === "size") el.style.fontSize = val + "px";
      else if (cmd === "removeFormat") parts.forEach(x => x.removeAttribute("style"));
    });
    if ($("hrPaper").contains(els[0]) && !manual) setManual(true);
  }
  function afterEdit(){
    const s = getSelection(); if (s.rangeCount && inPaper(s.anchorNode)) range = s.getRangeAt(0).cloneRange();
    if (range && $("hrPaper").contains(range.startContainer) && !manual) setManual(true);
    syncTools();
  }
  function setSize(px){
    if (!restore()) return;
    document.execCommand("styleWithCSS", false, false);
    document.execCommand("fontSize", false, "7");
    EDIT_ROOTS().forEach(r => r.querySelectorAll('font[size="7"]').forEach(f => { const s = document.createElement("span"); s.style.fontSize = px + "px"; s.innerHTML = f.innerHTML; f.replaceWith(s); }));
    styleFields("size", px);
    afterEdit();
  }
  // alignment set on the paragraphs themselves (the browser command does not override the page's own paragraph styles)
  const ALIGN = { justifyRight: "right", justifyCenter: "center", justifyLeft: "left", justifyFull: "justify" };
  const BLOCKS = "p,h3,h4,li,td,th,div";
  function curBlocks(){
    if (!range) return [];
    const host = elOf(range.startContainer) && elOf(range.startContainer).closest("[contenteditable=true]"); if (!host) return [];
    const own = n => { const b = elOf(n) && elOf(n).closest(BLOCKS); return b && host.contains(b) && b !== host ? b : null; };
    if (range.collapsed){ const b = own(range.startContainer); return b ? [b] : []; }
    const list = [...host.querySelectorAll(BLOCKS)].filter(b => range.intersectsNode(b) && !b.querySelector(BLOCKS.split(",").map(x => ":scope " + x).join(",")));
    return list.length ? list : [own(range.startContainer)].filter(Boolean);
  }
  function setAlign(v){
    if (!restore()) return;
    let blocks = curBlocks();
    if (!blocks.length){ document.execCommand("formatBlock", false, "p"); const s = getSelection(); if (s.rangeCount) range = s.getRangeAt(0).cloneRange(); blocks = curBlocks(); }
    blocks.forEach(b => { b.style.textAlign = v; });
    afterEdit();
  }
  function cellNow(){ const s = getSelection(); const n = s.rangeCount ? s.anchorNode : null; return n && inPaper(n) ? elOf(n).closest("td,th") : null; }
  function syncTools(){
    const td = cellNow();
    document.querySelectorAll(".hr-tools [data-tbl]").forEach(b => { b.disabled = !td; });
    const blk = curBlocks()[0], al = blk ? getComputedStyle(blk).textAlign : "";
    Object.entries(ALIGN).forEach(([c, v]) => document.querySelectorAll(`.hr-tools [data-cmd="${c}"]`).forEach(b => b.setAttribute("aria-pressed", blk && (al === v || (v === "right" && al === "start")) ? "true" : "false")));
    ["bold", "italic", "underline", "strikeThrough", "insertUnorderedList", "insertOrderedList"].forEach(c => {
      let on = false; try { on = document.queryCommandState(c); } catch {}
      document.querySelectorAll(`.hr-tools [data-cmd="${c}"]`).forEach(b => b.setAttribute("aria-pressed", on ? "true" : "false"));
    });
  }
  function fontList(){
    const set = new Set(Object.keys((window.SiteSettings && SiteSettings.FONTS) || {}));
    (window.appFonts || []).forEach(f => set.add(f.group || f.family));
    ["Sakkal Majalla", "Traditional Arabic", "Arial", "Times New Roman"].forEach(f => set.add(f));
    ["hrFont", "hrEdFont"].forEach(id => {
      const sel = $(id); if (!sel) return;
      const keep = sel.value; sel.innerHTML = ""; sel.append(new Option("الخط", ""));
      [...set].forEach(f => { const o = new Option(f, f); o.style.fontFamily = `"${f}"`; sel.append(o); });
      sel.value = keep;
    });
  }
  window.addEventListener("app:fonts", fontList);
  // the template editor gets a copy of the letter toolbar, without the header and footer buttons
  (function copyToolbar(){
    const src = $("hrTools"), host = $("hrEdTools"); if (!src || !host) return;
    host.innerHTML = src.innerHTML.replace(/id="hr/g, 'id="hrEd');
    host.querySelectorAll("#hrEdHdrBtn,#hrEdFtrBtn").forEach(b => b.remove());
  })();
  function bindToolbar(P){
    const T = $(P + "Tools"); if (!T) return;
    T.querySelectorAll("button[data-cmd]").forEach(b => {
      b.addEventListener("mousedown", e => e.preventDefault());
      b.addEventListener("click", () => ALIGN[b.dataset.cmd] ? setAlign(ALIGN[b.dataset.cmd]) : exec(b.dataset.cmd, b.dataset.val));
    });
    $(P + "Font").addEventListener("change", e => { const f = e.target.value; if (!f) return; if (window.SiteSettings) SiteSettings.loadFont(f); exec("fontName", f); e.target.value = ""; });
    $(P + "Size").addEventListener("change", e => { const v = +e.target.value; if (v) setSize(v); e.target.value = ""; });
    $(P + "Block").addEventListener("change", e => { const v = e.target.value; if (v) exec("formatBlock", v); e.target.value = ""; });
    $(P + "Color").addEventListener("input", e => exec("foreColor", e.target.value));
    $(P + "Hilite").addEventListener("input", e => exec("hiliteColor", e.target.value));
    // table: pick a size from a grid
    const grid = $(P + "TblGrid"), pop = $(P + "TblPop"), btn = $(P + "TblBtn");
    for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++){ const i = document.createElement("i"); i.dataset.r = r; i.dataset.c = c; grid.append(i); }
    grid.addEventListener("mouseover", e => {
      const i = e.target.closest("i"); if (!i) return;
      grid.querySelectorAll("i").forEach(x => x.classList.toggle("on", +x.dataset.r <= +i.dataset.r && +x.dataset.c <= +i.dataset.c));
      $(P + "TblSize").textContent = `${i.dataset.c} × ${i.dataset.r}`;
    });
    grid.addEventListener("mousedown", e => e.preventDefault());
    grid.addEventListener("click", e => {
      const i = e.target.closest("i"); if (!i) return;
      const row = `<tr>${"<td><br></td>".repeat(+i.dataset.c)}</tr>`;
      exec("insertHTML", `<table class="lt-table"><tbody>${row.repeat(+i.dataset.r)}</tbody></table><p><br></p>`);
      pop.hidden = true;
    });
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.addEventListener("click", () => { pop.hidden = !pop.hidden; });
    document.addEventListener("click", e => { if (!e.target.closest(`#${P}TblPop,#${P}TblBtn`)) pop.hidden = true; });
    T.querySelectorAll("[data-tbl]").forEach(b => {
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
  }
  bindToolbar("hr"); bindToolbar("hrEd");
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
  const PDF_LIBS = ["https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"];
  let pdfLibs = null;
  function loadPdfLibs(){
    if (window.html2canvas && window.jspdf) return Promise.resolve();
    return pdfLibs ||= Promise.all(PDF_LIBS.map(src => new Promise((res, rej) => {
      const el = document.createElement("script"); el.src = src; el.async = false; el.onload = res;
      el.onerror = () => { pdfLibs = null; rej(new Error("lib_load")); }; document.head.append(el);
    })));
  }
  const pdfName = L => {
    const to = ((L.fields || {})["الجهة الموجه لها"] || L.employee || "").trim();
    return `${L.ref ? String(L.ref).replace("/", "-") + " - " : ""}${L.title || "خطاب"}${to ? " - " + to : ""}`.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 120) + ".pdf";
  };
  async function savePdf(L, head, parts){
    UI.toast("جارٍ تجهيز ملف PDF…");
    try {
      await loadPdfLibs();
      const host = document.createElement("div"); host.className = "pdf-host";
      host.innerHTML = `<article class="hr-paper" style='${paperStyle(head)}'>${paperInner(L, head, parts, false)}</article>`;
      document.body.append(host);
      const paper = host.firstElementChild;
      placeSeal(paper);
      await document.fonts.ready;
      await Promise.all([...paper.querySelectorAll("img")].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
      await new Promise(r => setTimeout(r, 120));
      const canvas = await html2canvas(paper, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
      const pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297);
      pdf.save(pdfName(L));
      host.remove();
      UI.toast("حُفظ ملف PDF");
    } catch (e){ console.error(e); document.querySelectorAll(".pdf-host").forEach(x => x.remove()); UI.toast(e && e.message === "lib_load" ? "تعذّر تحميل أداة PDF. تأكد من الإنترنت" : "تعذّر إنشاء ملف PDF", "err"); }
  }
  /* ---------- preview: the page at full size, zoomable, with print and PDF ---------- */
  const PAGE_W = 210 * 96 / 25.4, PAGE_H = 297 * 96 / 25.4;
  let pv = null, pvZoom = "fit";
  function preview(L, head, parts, opts = {}){
    pv = { L, head, parts };
    $("pvTitle").textContent = opts.title || L.title || "معاينة الخطاب";
    const paper = $("pvPaper");
    paper.setAttribute("style", paperStyle(head)); paper.innerHTML = paperInner(L, head, parts, false);
    $("pvPrint").hidden = opts.print === false; $("pvPdf").hidden = opts.pdf === false || !P.pdf;
    $("pv").hidden = false; document.body.classList.add("pv-open");
    pvZoom = "fit"; zoomTo(); placeSeal(paper);
    setTimeout(() => $("pvClose").focus(), 30);
  }
  function zoomTo(){
    const st = $("pvStage");
    const k = pvZoom === "fit" ? Math.min((st.clientWidth - 48) / PAGE_W, (st.clientHeight - 48) / PAGE_H) : pvZoom;
    $("pvPaper").style.setProperty("--k", k);
    $("pvSizer").style.width = PAGE_W * k + "px"; $("pvSizer").style.height = PAGE_H * k + "px";
    $("pvPct").textContent = Math.round(k * 100) + "%";
    $("pvFit").setAttribute("aria-pressed", pvZoom === "fit" ? "true" : "false");
  }
  function closePreview(){ $("pv").hidden = true; document.body.classList.remove("pv-open"); pv = null; }
  $("pvClose").addEventListener("click", closePreview);
  $("pv").addEventListener("click", e => { if (e.target === $("pvStage")) closePreview(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("pv").hidden) closePreview(); });
  const curK = () => parseFloat($("pvPaper").style.getPropertyValue("--k")) || 1;
  $("pvIn").addEventListener("click", () => { pvZoom = Math.min(2, Math.round((curK() + 0.1) * 10) / 10); zoomTo(); });
  $("pvOut").addEventListener("click", () => { pvZoom = Math.max(0.3, Math.round((curK() - 0.1) * 10) / 10); zoomTo(); });
  $("pvFit").addEventListener("click", () => { pvZoom = "fit"; zoomTo(); });
  $("pv100").addEventListener("click", () => { pvZoom = 1; zoomTo(); });
  window.addEventListener("resize", () => { if (!$("pv").hidden && pvZoom === "fit") zoomTo(); });
  $("pvPrint").addEventListener("click", () => { if (pv) printParts(pv.L, pv.head, pv.parts); });
  $("pvPdf").addEventListener("click", () => { if (pv) savePdf(pv.L, pv.head, pv.parts); });
  // a template shown with its default values and today's date
  function previewTemplate(t){
    const head = curHead();
    const L = { title: t.title, body: t.body, html: !!t.html, date: ymd(new Date()), assoc: $("hrAssoc").value.trim(), fields: defaultsOf(t.body), signName: $("hrSignName").value.trim(), signRole: $("hrSignRole").value.trim() };
    preview(L, head, { title: esc(t.title), body: genBody(t.body, vals(L), !!t.html), sign: genSign(L, {}), ...headParts(head) }, { title: `قالب: ${t.title}`, print: false, pdf: false });
  }
  function previewHead(h){
    const L = { assoc: "جمعية البر الخيرية", date: ymd(new Date()), ref: "001/1448", signRole: "المدير التنفيذي", signName: "", fields: { "الجهة الموجه لها": "الجهة الموجه لها الخطاب" } };
    preview(L, h, { showSig: true, showStamp: true, title: "عنوان الخطاب", body: "<p>هذا نص تجريبي يوضح مكان المحتوى داخل الكليشة.</p><p>السلام عليكم ورحمة الله وبركاته، وبعد:</p>", sign: genSign(L, {}), hdr: h.hdr || "", ftr: h.ftr || "" }, { title: `كليشة: ${h.name}`, print: false, pdf: false });
  }
  function partsOf(L, head){
    return L.parts ? { ...L.parts, title: clean(L.parts.title), body: clean(L.parts.body), sign: clean(L.parts.sign), hdr: clean(L.parts.hdr), ftr: clean(L.parts.ftr) }
      : { title: esc(L.title), body: genBody(L.body, vals(L), !!L.html), sign: genSign(L, L), ...headParts(head) };
  }
  function printLetter(L){ // from the log: the saved page
    const head = heads.find(h => h.id === L.headId) || null;
    printParts(L, head, partsOf(L, head));
  }
  async function saveAndPrint(){
    if (!db){ msg("سجّل الدخول لحفظ الخطاب", "err"); return; }
    if (editingLetter && editingLetter.kind === "request"){
      const btn = $("hrSave"); btn.disabled = true;
      try { await editingLetter.onSave(window.HRLetters.snapshot()); } catch (e){ console.error(e); UI.toast("تعذّر الحفظ", "err"); }
      finally { btn.disabled = false; }
      return;
    }
    if (!canIssue){ UI.alert("صلاحيتك رفع الخطاب للاعتماد. استخدم «رفع للاعتماد»."); return; }
    const t = curTpl(); if (!t){ msg("اختر نوع الخطاب", "err"); return; }
    const L = draft();
    if (!L.assoc && !curHead()){ msg("اكتب اسم الجمعية أو اختر كليشة", "err"); $("hrAssoc").focus(); return; }
    const btn = $("hrSave"); btn.disabled = true; msg("جارٍ الحفظ…");
    try {
      L.employee = L.fields["اسم الموظف"] || ""; L.parts = grab();
      if (editingLetter){
        const E = editingLetter;
        const now = new Date().toISOString();
        // what the letter carried from its approval stays with it
        const keep = {}; ["requestId", "approvedBy", "approvals", "status", "cancelReason", "cancelNote", "cancelledBy", "cancelledAt"].forEach(k => { if (E[k] !== undefined) keep[k] = E[k]; });
        Object.assign(L, keep, { no: E.no, year: E.year, ref: E.ref, createdAt: E.createdAt, createdBy: E.createdBy || "", updatedAt: now, updatedBy: me, edits: (E.edits || 0) + 1 });
        // the wording before this edit is kept as a version
        const prev = { ...E }; delete prev.id; delete prev.kind;
        const ref = db.collection("hrLetters").doc(E.id), b = db.batch();
        b.set(ref.collection("versions").doc(), { ...prev, versionAt: now, versionBy: me });
        b.set(ref, L);
        await b.commit();
        editingLetter = { ...L, id: E.id };
        msg(""); UI.toast(`حُفظ تعديل الخطاب ${L.ref}`);
      } else {
        const year = hijriYear(parseDay(L.date));
        const counter = db.collection("hrMeta").doc("counter");
        const no = await db.runTransaction(async tx => {
          const d = await tx.get(counter);
          const last = d.exists && d.data().year === year ? d.data().last || 0 : 0;
          tx.set(counter, { year, last: last + 1 });
          return last + 1;
        });
        L.no = no; L.year = year; L.ref = `${String(no).padStart(3, "0")}/${year}`;
        L.createdAt = new Date().toISOString(); L.createdBy = me;
        const r = await db.collection("hrLetters").add(L);
        // later changes to this letter keep its number
        if (P.editIssued) setEditing({ ...L, id: r.id });
        msg(""); UI.toast(`حُفظ الخطاب برقم ${L.ref}`);
      }
      renderPaper(); // show the number on the page
      printParts(L, curHead(), L.parts);
    } catch (e){ console.error(e); msg("تعذّر حفظ الخطاب. حاول مرة أخرى", "err"); }
    finally { btn.disabled = false; }
  }

  /* ---------- editing an issued letter ---------- */
  function setEditing(l){
    editingLetter = l;
    const req = !!(l && l.kind === "request");
    $("hrEditing").hidden = !l;
    if (l) $("hrEditingText").textContent = req ? `تعديل الطلب: ${l.label}` : `تعديل الخطاب ${l.ref} · يُحفظ بنفس الرقم`;
    $("hrSave").textContent = req ? (l.saveText || "حفظ") : l ? "حفظ التعديل وطباعة" : "حفظ وطباعة";
    $("hrSave").hidden = !req && !canIssue;
    $("hrPrint").hidden = !P.printDraft;
    $("hrSubmit").hidden = req || !submitOn;
  }
  async function openLetter(l, opts){
    if (manual && !editingLetter && !(opts && opts.force) && !(await UI.confirm("فتح الخطاب للتعديل يستبدل الخطاب المفتوح الآن. متابعة؟", { ok: "فتح" }))) return;
    // its template, or a stand-in made from the letter itself when the template was deleted
    let t = templates.find(x => x.id === l.templateId);
    if (!t){ t = { id: "letter-" + l.id, title: l.title, body: l.body || "", html: !!l.html, category: "أخرى", order: 1e15 }; templates = templates.filter(x => !String(x.id).startsWith("letter-")).concat(t); fillTplSelect(); }
    $("hrTpl").value = t.id;
    if ([...$("hrHead").options].some(o => o.value === (l.headId || ""))) $("hrHead").value = l.headId || "";
    $("hrAssoc").value = l.assoc || ""; $("hrDate").value = l.date || ymd(new Date());
    if (l.signRole != null) $("hrSignRole").value = l.signRole; if (l.signName != null) $("hrSignName").value = l.signName;
    $("hrShowSig").checked = l.showSig !== false; $("hrShowStamp").checked = l.showStamp !== false;
    Object.keys(values).forEach(k => delete values[k]); Object.assign(values, l.fields || {});
    if (l.parts){ showHdr = l.parts.showHdr !== false; showFtr = l.parts.showFtr !== false; }
    setEditing(opts && opts.request ? { kind: "request", label: opts.label, saveText: opts.saveText, onSave: opts.onSave } : l); setTab("new"); renderFields();
    if (l.parts){
      // the page exactly as it was saved; field values keep following their fields
      const head = curHead(), paper = $("hrPaper");
      paper.setAttribute("style", paperStyle(head));
      paper.innerHTML = paperInner(draft(), head, { ...l.parts, title: clean(l.parts.title), body: clean(l.parts.body), sign: clean(l.parts.sign), hdr: clean(l.parts.hdr), ftr: clean(l.parts.ftr), sealPos: null, sealSize: null }, P.editText, P.seal);
      setManual(true); fit(); placeSeal(paper);
    } else { setManual(false); renderPaper(true); }
    msg(""); window.scrollTo(0, 0);
  }

  // without «view all», only this user's letters are asked for (the database rules refuse the whole log)
  let lettersUnsub = null, lettersAll = null;
  function subLetters(){
    if (!db || lettersAll === !!P.viewLog) return;
    lettersAll = !!P.viewLog;
    if (lettersUnsub) lettersUnsub();
    const q = lettersAll ? db.collection("hrLetters") : db.collection("hrLetters").where("createdBy", "==", me);
    lettersUnsub = q.onSnapshot(snap => { letters = snap.docs.map(x => ({ id: x.id, ...x.data() })); renderLog(); }, e => console.error(e));
  }
  function applyPerms(){
    // tabs and tools the user may not use disappear
    document.querySelector('[data-hrtab="tpl"]').hidden = !P.templates;
    document.querySelector('[data-hrtab="heads"]').hidden = !P.heads;
    const on = document.querySelector("[data-hrtab][aria-selected=true]");
    if (on && on.hidden) setTab("new");
    $("hrTools").hidden = !P.editText;
    $("hrPdf").hidden = !P.pdf;
    fillHeadSelect();
    $("hrSignFields").hidden = !P.sign;
    $("hrSignDetails").hidden = !P.sign && !P.seal;
    $("hrSignNote").textContent = P.admin ? "ما تكتبه هنا يصير صفة واسم المعتمد في خطابات كل المستخدمين" : "تعديلك هنا يخص خطاباتك في هذا المتصفح";
    useSharedSign();
    $("hrSealBox").hidden = !db || !P.seal; $("hrSealSignin").hidden = !!db || !P.seal;
    $("hrSealSection").hidden = !P.seal;
    $("hrBulkDel").hidden = !P.deleteLog; $("hrSelAll").closest("label").hidden = !P.deleteLog;
    if (!P.deleteLog) picked.clear();
    setEditing(editingLetter);
    if (curTpl()) renderPaper("head");
    renderLog();
    try { subLetters(); } catch (e){ console.error(e); }
  }
  /* ---------- API for js/requests.js ---------- */
  let canIssue = true, submitOn = false;
  window.HRLetters = {
    snapshot(){ const L = draft(); L.employee = L.fields["اسم الموظف"] || ""; L.parts = grab(); return L; },
    clear(){ setEditing(null); Object.keys(values).forEach(k => delete values[k]); setManual(false); renderFields(); renderPaper(true); msg(""); },
    open: (l, opts) => openLetter(l, { force: true, ...(opts || {}) }),
    paper(L){ const head = heads.find(h => h.id === L.headId) || null; return { style: paperStyle(head), html: paperInner(L, head, partsOf(L, head), false) }; },
    print: L => printLetter(L),
    // approved=false (a request still under review): no signature or stamp yet
    finalize(L0, approved = true){
      const L = JSON.parse(JSON.stringify(L0 || {}));
      const sh = signShared || {};
      if (!(L.signName || "").trim() && !(L.signRole || "").trim() && (sh.signName || sh.signRole)){ L.signName = sh.signName || ""; L.signRole = sh.signRole || ""; }
      if (!L.headId && sh.defaultHead && heads.some(h => h.id === sh.defaultHead)) L.headId = sh.defaultHead;
      L.showSig = approved; L.showStamp = approved;
      if (L.parts){ L.parts.showSig = approved; L.parts.showStamp = approved; L.parts.sealPos = null; L.parts.sign = genSign(L, L); }
      return L;
    },
    preview: (L, opts) => { const head = heads.find(h => h.id === L.headId) || null; preview(L, head, partsOf(L, head), opts); },
    pdf: L => { const head = heads.find(h => h.id === L.headId) || null; return savePdf(L, head, partsOf(L, head)); },
    fit: () => fit(), place: el => placeSeal(el),
    setCanIssue(v){ canIssue = !!v; setEditing(editingLetter); },
    setPerms(p){ P = { ...P, ...p }; canIssue = !!P.issue; submitOn = !!P.submit; applyPerms(); },
    enableSubmit(v){ submitOn = !!v; setEditing(editingLetter); },
    templates: () => templates.filter(t => !String(t.id).startsWith("local") && !String(t.id).startsWith("letter-")),
  };
  $("hrSubmit").addEventListener("click", () => { if (window.Requests && db) window.Requests.submit(window.HRLetters.snapshot()); else UI.alert("سجّل الدخول لرفع الطلب"); });

  /* ---------- log ---------- */
  const picked = new Set();
  function fillLogFilters(){
    const fill = (id, vals) => { const sel = $(id), keep = sel.value, first = sel.options[0].cloneNode(true); sel.innerHTML = ""; sel.append(first);
      [...new Set(vals.filter(Boolean))].sort((x, y) => x.localeCompare(y)).forEach(v => sel.append(new Option(v, v))); sel.value = keep; };
    fill("hrFTitle", letters.map(l => l.title)); fill("hrFAssoc", letters.map(l => l.assoc));
  }
  function inDate(l, f){
    if (!f) return true;
    const d = parseDay(l.date), now = new Date(), day = 86400000;
    if (f === "today") return ymd(d) === ymd(now);
    if (f === "week") return now - d <= 7 * day && d <= now;
    if (f === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    if (f === "year") return hijriYear(d) === hijriYear(now);
    return true;
  }
  function filteredLetters(){
    const q = $("hrLogQ").value.trim(), fr = $("hrFRef").value.trim(), fe = $("hrFEmp").value.trim();
    const ft = $("hrFTitle").value, fa = $("hrFAssoc").value, fd = $("hrFDate").value;
    return letters.filter(l => (P.viewLog || l.createdBy === me) && (!q || [l.ref, l.employee, l.title, l.assoc].some(x => (x || "").includes(q)))
      && (!fr || (l.ref || "").includes(fr)) && (!fe || (l.employee || "").includes(fe))
      && (!ft || l.title === ft) && (!fa || l.assoc === fa) && inDate(l, fd))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  function syncBulk(rows){
    [...picked].forEach(id => { if (!letters.some(l => l.id === id)) picked.delete(id); });
    const vis = rows.filter(l => picked.has(l.id)).length;
    $("hrBulk").hidden = picked.size === 0;
    $("hrBulkN").textContent = `محدد ${picked.size}`;
    const all = $("hrSelAll"); all.checked = rows.length > 0 && vis === rows.length; all.indeterminate = vis > 0 && vis < rows.length;
  }
  // earlier wordings of an edited letter, newest first, each one can be previewed
  async function showVersions(l){
    try {
      const s = await db.collection("hrLetters").doc(l.id).collection("versions").get();
      const vs = s.docs.map(d => d.data()).sort((a, b) => String(b.versionAt).localeCompare(String(a.versionAt)));
      if (!vs.length) return UI.alert("لا توجد نسخ سابقة محفوظة لهذا الخطاب");
      const back = document.createElement("div"); back.className = "ui-scrim";
      const box = document.createElement("div"); box.className = "ui-dialog hr-vers"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
      box.innerHTML = `<h2></h2><ul class="hr-vlist"></ul><div class="ui-actions"><button class="btn" type="button">إغلاق</button></div>`;
      box.querySelector("h2").textContent = `النسخ السابقة للخطاب ${l.ref}`;
      const ul = box.querySelector("ul");
      const fmtAt = iso => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
      vs.forEach((v, i) => {
        const li = document.createElement("li");
        li.innerHTML = `<span><b></b><small></small></span><button class="btn small" type="button">معاينة</button>`;
        li.querySelector("b").textContent = i === vs.length - 1 ? "النص الأصلي" : `قبل التعديل ${vs.length - i}`;
        li.querySelector("small").textContent = `حتى ${fmtAt(v.versionAt)}`;
        li.querySelector("button").addEventListener("click", () => { const head = heads.find(h => h.id === v.headId) || null; close(); preview(v, head, partsOf(v, head), { title: `${l.ref} · ${li.querySelector("b").textContent}` }); });
        ul.append(li);
      });
      const close = () => { back.remove(); box.remove(); };
      back.addEventListener("click", close); box.querySelector(".ui-actions button").addEventListener("click", close);
      document.body.append(back, box); box.querySelector(".ui-actions button").focus();
    } catch (e){ console.error(e); UI.toast("تعذّر فتح النسخ السابقة", "err"); }
  }
  const CANCEL_REASONS = ["صدر بالخطأ", "خطأ في البيانات وأُعيد إصداره", "طُلب إلغاؤه", "أخرى"];
  async function cancelLetters(ids){
    if (!ids.length || !db) return;
    const v = await UI.prompt(ids.length === 1 ? "إلغاء الخطاب؟ يبقى رقمه في السجل وعليه «ملغى»، ولا يُعاد استخدامه." : `إلغاء ${ids.length} خطابات؟ تبقى أرقامها في السجل وعليها «ملغى».`,
      { title: "إلغاء خطاب", ok: "إلغاء الخطاب", danger: true, choices: CANCEL_REASONS, noteRequired: false, placeholder: "تفاصيل (اختياري)" });
    if (!v) return;
    const now = new Date().toISOString();
    try {
      for (let i = 0; i < ids.length; i += 400){ const b = db.batch(); ids.slice(i, i + 400).forEach(id => b.update(db.collection("hrLetters").doc(id), { status: "cancelled", cancelReason: v.choice, cancelNote: v.note, cancelledBy: me, cancelledAt: now })); await b.commit(); }
      picked.clear(); UI.toast(ids.length === 1 ? "أُلغي الخطاب" : `أُلغي ${ids.length} خطابات`);
    } catch (e){ console.error(e); UI.toast("تعذّر الإلغاء", "err"); }
  }
  function renderLog(){
    const body = $("hrLogList"); if (!body) return;
    fillLogFilters();
    const rows = filteredLetters();
    body.innerHTML = "";
    $("hrLogEmpty").hidden = rows.length > 0;
    $("hrLogEmpty").textContent = letters.length ? "لا توجد نتائج" : "لم يصدر أي خطاب بعد";
    rows.forEach(l => {
      const tr = document.createElement("tr"); if (picked.has(l.id)) tr.classList.add("sel");
      tr.innerHTML = `<td><bdi class="mono"></bdi></td><td></td><td></td><td></td><td></td><td class="u-act"><input type="checkbox" class="hr-pick" aria-label="تحديد"> <button class="btn small hr-pv" type="button">معاينة</button> <button class="btn small hr-ed" type="button">تعديل</button> <button class="btn small" type="button">طباعة</button> <button class="btn small hr-pdf" type="button">PDF</button> <button class="btn small ghost hr-del" type="button">إلغاء</button></td>`;
      const td = tr.querySelectorAll("td");
      const cbx = tr.querySelector(".hr-pick");
      if (!P.deleteLog){ cbx.remove(); tr.querySelector(".hr-del").remove(); }
      const off = l.status === "cancelled";
      if (!P.editIssued || off) tr.querySelector(".hr-ed").remove();
      if (off){
        tr.classList.add("hr-off"); const cx = tr.querySelector(".hr-del"); if (cx) cx.remove();
        if (P.admin){ const del = document.createElement("button"); del.type = "button"; del.className = "btn small ghost danger-text"; del.textContent = "حذف نهائي";
          del.addEventListener("click", async () => { if (await UI.confirm(`حذف الخطاب الملغى ${l.ref} نهائياً من السجل؟`, { ok: "حذف", danger: true })) db.collection("hrLetters").doc(l.id).delete().then(() => UI.toast("حُذف الخطاب")).catch(() => UI.toast("تعذّر الحذف", "err")); });
          tr.querySelector(".u-act").append(del); }
      }
      tr.querySelector(".hr-pv").addEventListener("click", () => { const head = heads.find(h => h.id === l.headId) || null; preview(l, head, partsOf(l, head), { title: `${l.ref} · ${l.title}` }); });
      const pdfBtn = tr.querySelector(".hr-pdf");
      if (!P.pdf) pdfBtn.remove(); else pdfBtn.addEventListener("click", () => { const head = heads.find(h => h.id === l.headId) || null; savePdf(l, head, partsOf(l, head)); });
      td[0].querySelector("bdi").textContent = l.ref;
      if (l.edits && P.viewLog){ const v = document.createElement("button"); v.type = "button"; v.className = "hr-verchip"; v.textContent = l.edits === 1 ? "معدّل" : `معدّل ${l.edits}`; v.title = "النسخ السابقة";
        v.addEventListener("click", () => showVersions(l)); td[0].append(" ", v); }
      if (off){ const c = document.createElement("span"); c.className = "hr-offchip"; c.textContent = "ملغى"; c.title = [l.cancelReason, l.cancelNote].filter(Boolean).join(" · "); td[0].append(" ", c); }
      td[1].textContent = `${hijri(parseDay(l.date))} هـ`;
      td[2].textContent = l.title; td[3].textContent = l.employee || "—"; td[4].textContent = l.assoc || "";
      const cb = tr.querySelector(".hr-pick"); if (cb) cb.checked = picked.has(l.id);
      if (cb) cb.addEventListener("change", () => { if (cb.checked) picked.add(l.id); else picked.delete(l.id); tr.classList.toggle("sel", cb.checked); syncBulk(rows); });
      const bl = [...tr.querySelectorAll("button")];
      const eb = bl.find(b => b.textContent === "تعديل"), pb = bl.find(b => b.textContent === "طباعة"), db2 = bl.find(b => b.textContent === "إلغاء");
      if (eb && eb.textContent === "تعديل") eb.addEventListener("click", () => openLetter(l));
      pb.addEventListener("click", () => printLetter(l));
      if (off){ pb.hidden = true; const pf = tr.querySelector(".hr-pdf"); if (pf) pf.hidden = true; }
      if (db2) db2.addEventListener("click", () => cancelLetters([l.id]));
      body.append(tr);
    });
    syncBulk(rows);
  }
  ["hrFRef", "hrFEmp"].forEach(id => $(id).addEventListener("input", renderLog));
  ["hrFTitle", "hrFAssoc", "hrFDate"].forEach(id => $(id).addEventListener("change", renderLog));
  $("hrFReset").addEventListener("click", () => { ["hrFRef", "hrFEmp", "hrFTitle", "hrFAssoc", "hrFDate", "hrLogQ"].forEach(id => { $(id).value = ""; }); renderLog(); });
  $("hrSelAll").addEventListener("change", e => { filteredLetters().forEach(l => { if (e.target.checked) picked.add(l.id); else picked.delete(l.id); }); renderLog(); });
  $("hrBulkClear").addEventListener("click", () => { picked.clear(); renderLog(); });
  $("hrBulkDel").addEventListener("click", () => cancelLetters([...picked].filter(id => (letters.find(l => l.id === id) || {}).status !== "cancelled")));

  /* ---------- templates ---------- */
  let editing = null;
  function renderTpls(){
    const ul = $("hrTplList"); if (!ul) return; ul.innerHTML = "";
    templates.forEach(t => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="f-meta"><span class="f-name"></span><span class="f-file"></span></span><button class="btn small ghost hr-pvt" type="button">معاينة</button> <button class="btn small" type="button">تعديل</button> <button class="btn small ghost" type="button">حذف</button>`;
      li.querySelector(".f-name").textContent = t.title;
      li.querySelector(".f-file").textContent = `${t.category} · ${fieldsOf(t.body).length} خانة`;
      const [pvb, eb, dbn] = li.querySelectorAll("button");
      pvb.addEventListener("click", () => previewTemplate(t));
      eb.addEventListener("click", () => openEditor(t));
      dbn.addEventListener("click", async () => { if (!db){ UI.alert("سجّل الدخول لتعديل القوالب"); return; } if (await UI.confirm(`حذف قالب «${t.title}»؟ الخطابات الصادرة منه تبقى في السجل.`, { ok: "حذف", danger: true })) db.collection("hrTemplates").doc(t.id).delete().then(() => UI.toast("حُذف القالب")).catch(() => UI.toast("تعذّر الحذف", "err")); });
      ul.append(li);
    });
  }
  function openEditor(t){
    if (!db){ UI.alert("سجّل الدخول لتعديل القوالب"); return; }
    editing = t || null;
    $("hrEdTitle").value = t ? t.title : ""; $("hrEdCat").value = t && CATS.includes(t.category) ? t.category : "أخرى";
    $("hrEdBody").innerHTML = t ? (t.html ? clean(t.body) : plainToHtml(t.body)) : "<p><br></p>";
    fillFieldMenu();
    $("hrEditor").hidden = false; $("hrEdHead").textContent = t ? "تعديل القالب" : "قالب جديد";
    $("hrEdTitle").focus();
  }
  async function saveTpl(e){
    e.preventDefault();
    const ed = $("hrEdBody");
    ed.querySelectorAll('font[size="7"]').forEach(f => f.removeAttribute("size"));
    const data = { title: $("hrEdTitle").value.trim(), category: $("hrEdCat").value, body: clean(ed.innerHTML), html: true, updatedAt: new Date().toISOString() };
    if (!data.title){ UI.toast("اكتب عنوان الخطاب", "err"); return; }
    if (!ed.textContent.trim()){ UI.toast("اكتب نص الخطاب", "err"); return; }
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
      DEFAULT_TEMPLATES.filter(t => (t.since || 1) > v && !titles.has(t.title)).forEach(t => { const { since, v4, ...rest } = t; batch.set(db.collection("hrTemplates").doc(), { ...rest, builtin: true, updatedAt: new Date().toISOString() }); });
      const OLD = /إلى:\s*\{\{\s*الجهة الموجه لها\s*\}\}[ \t]*(المحترمين)?/g;
      const CL = /^[ \t]*وتقبلوا وافر التحية والتقدير[،,]*[ \t]*$/m;
      templates.forEach(t => {
        let b = t.body.replace(OLD, "{{الجهة الموجه لها}}");
        if (v < 3) b = b.replace(CL, THANKS);
        if (v < 4 && t.builtin && t.title === "طلب دعم عيني"){ const d = DEFAULT_TEMPLATES.find(x => x.v4); if (d) b = d.body; }
        if (b !== t.body) batch.update(db.collection("hrTemplates").doc(t.id), { body: b });
      });
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
      li.innerHTML = `<span class="hd-thumb"></span><span class="f-meta"><span class="f-name"></span><span class="f-file"></span></span><button class="btn small ghost" type="button">معاينة</button> <button class="btn small" type="button">تعديل</button> <button class="btn small ghost" type="button">حذف</button>`;
      if (h.bg) li.querySelector(".hd-thumb").style.backgroundImage = `url("${h.bg}")`;
      li.querySelector(".f-name").textContent = h.name;
      li.querySelector(".f-file").textContent = [h.bg ? "صورة كليشة" : "بدون صورة", h.frame && h.frame.image ? "إطار تاريخ" : ""].filter(Boolean).join(" · ");
      const [pvb, eb, dbn] = li.querySelectorAll("button");
      pvb.addEventListener("click", () => previewHead(h));
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
    setManual(false); setEditing(null); renderFields(); renderPaper();
  });
  $("hrHead").addEventListener("change", () => { try { localStorage.setItem(HEAD_KEY, $("hrHead").value); } catch {} saveShared({ defaultHead: $("hrHead").value }); renderPaper("head"); });
  ["hrAssoc", "hrDate"].forEach(id => $(id).addEventListener("input", () => renderPaper()));
  ["hrSignName", "hrSignRole"].forEach(id => $(id).addEventListener("input", () => {
    sign = { name: $("hrSignName").value, role: $("hrSignRole").value };
    try { localStorage.setItem(SIGN_KEY, JSON.stringify(sign)); } catch {}
    renderPaper();
    // an admin's entry becomes the signer for everyone
    if (P.admin){ clearTimeout(signSaveT); signSaveT = setTimeout(() => saveShared({ signName: sign.name.trim(), signRole: sign.role.trim() }), 700); }
  }));
  $("hrRegen").addEventListener("click", async () => { if (await UI.confirm("إعادة بناء الخطاب من القالب والخانات؟ تضيع تعديلاتك على الورقة.", { ok: "إعادة البناء" })){ setManual(false); renderPaper(true); } });
  function renderSealForm(){
    [["sig", "hrSigPrev", "hrSigClear"], ["stamp", "hrStampPrev", "hrStampClear"]].forEach(([k, prev, clr]) => {
      const p = $(prev); p.innerHTML = seal[k] ? `<img src="${seal[k]}" alt="">` : '<span class="muted-text">لا توجد صورة</span>'; $(clr).hidden = !seal[k];
    });
    $("hrSigH").value = seal.sigH; $("hrSigHv").textContent = seal.sigH + "mm";
    $("hrStampW").value = seal.stampW; $("hrStampWv").textContent = seal.stampW + "mm";
    $("hrSealSignin").hidden = !!db || !P.seal; $("hrSealBox").hidden = !db || !P.seal;
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
  $("hrPdf").addEventListener("click", () => { if (curTpl()) savePdf(draft(), curHead(), grab()); });
  $("hrPreview").addEventListener("click", () => { if (curTpl()) preview(draft(), curHead(), grab(), { print: P.printDraft || P.issue }); });
  $("hrPrint").addEventListener("click", () => { if (curTpl()) printParts(draft(), curHead(), grab()); });
  $("hrEditEnd").addEventListener("click", () => { setEditing(null); Object.keys(values).forEach(k => delete values[k]); setManual(false); renderFields(); renderPaper(true); msg(""); });
  $("hrClear").addEventListener("click", () => { setEditing(null); Object.keys(values).forEach(k => delete values[k]); setManual(false); renderFields(); renderPaper(true); msg(""); });
  $("hrLogQ").addEventListener("input", renderLog);
  $("hrNewTpl").addEventListener("click", () => openEditor(null));
  $("hrEdCancel").addEventListener("click", () => { $("hrEditor").hidden = true; editing = null; });
  $("hrEdForm").addEventListener("submit", saveTpl);
  // insert a field ({{...}}) where the caret is in the template editor
  const COMMON_FIELDS = [RECIP, CLOSING, ASSOC_FIELD, "اسم الموظف", "رقم الهوية", "الجنسية", "المسمى الوظيفي", "تاريخ التعيين", "تاريخ انتهاء الخدمة", "الراتب الأساسي", "البدلات", "إجمالي الراتب", "صفة المعتمد", "اسم المعتمد"];
  function fillFieldMenu(){
    const sel = $("hrEdField"); sel.innerHTML = ""; sel.append(new Option("+ إدراج خانة", ""));
    const own = fieldsOf($("hrEdBody").innerHTML);
    [...new Set([...COMMON_FIELDS, ...own])].forEach(f => sel.append(new Option(f, f)));
  }
  function insertField(name){
    name = (name || "").trim(); if (!name) return;
    const ed = $("hrEdBody");
    if (!(range && ed.contains(range.startContainer))){ ed.focus(); const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); range = r; }
    restore(); document.execCommand("insertText", false, `{{${name}}}`); afterEdit(); fillFieldMenu();
  }
  $("hrEdField").addEventListener("mousedown", () => { const s = getSelection(); if (s.rangeCount && $("hrEdBody").contains(s.anchorNode)) range = s.getRangeAt(0).cloneRange(); });
  $("hrEdField").addEventListener("change", e => { insertField(e.target.value); e.target.value = ""; });
  $("hrEdNewBtn").addEventListener("mousedown", e => e.preventDefault());
  $("hrEdNewBtn").addEventListener("click", () => { insertField($("hrEdNew").value); $("hrEdNew").value = ""; });
  $("hrEdNew").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); insertField($("hrEdNew").value); $("hrEdNew").value = ""; } });
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
        DEFAULT_TEMPLATES.forEach(t => { const { since, v4, ...rest } = t; batch.set(db.collection("hrTemplates").doc(), { ...rest, builtin: true, updatedAt: new Date().toISOString() }); });
        batch.set(db.collection("hrMeta").doc("templates"), { v: TPL_VERSION });
        await batch.commit().catch(console.error);
        return;
      }
      fillTplSelect(); renderTpls(); migrate();
    }, e => console.error(e));
    subLetters();
    db.collection("settings").doc("letters").onSnapshot(d => {
      signShared = d.exists ? d.data() : null;
      // fill the signer from the shared one when this browser has none yet
      if (signShared && P.sign && !$("hrSignName").value && !$("hrSignRole").value){ $("hrSignRole").value = signShared.signRole || ""; $("hrSignName").value = signShared.signName || ""; renderPaper(); }
      useSharedSign();
      // an admin's own signer and letterhead fill the shared settings the first time
      if (P.admin){
        const miss = {};
        if (!(signShared && (signShared.signName || signShared.signRole)) && ($("hrSignName").value || $("hrSignRole").value)){ miss.signName = $("hrSignName").value.trim(); miss.signRole = $("hrSignRole").value.trim(); }
        if (!(signShared && "defaultHead" in signShared) && $("hrHead").value) miss.defaultHead = $("hrHead").value;
        if (Object.keys(miss).length) saveShared(miss);
      }
      fillHeadSelect();
    }, () => {});
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
