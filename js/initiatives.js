/* إدارة المشاريع › منشئ وثائق المبادرات: Claude writes an initiative document from the association's data and the idea
   (tab «إنشاء جديد»), or reviews an existing document against the standard outline (tab «تحليل نص وثيقة»).
   The text streams from /api/initiative, shows as a formatted page, can be edited (Markdown), printed or saved as PDF,
   downloaded for Word, and saved in «سجلّي» (Firestore "initiatives"; the owner or an admin edits and deletes).
   An admin can change both prompts from «إعدادات الأداة» (settings/initiativeTool). */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- the prompts ---------- */
  const CREATE_PROMPT = `أنت مستشار متخصص في تصميم المبادرات الشبابية والمجتمعية وتقييم أثرها في القطاع غير الربحي السعودي. مهمتك تحويل بيانات الجمعية وفكرة المبادرة أدناه إلى وثيقة مبادرة مختصرة ومقنعة للداعمين وأصحاب القرار، وقابلة للتنفيذ والمتابعة.

## المعلومات الأساسية
• اسم الجمعية: {{assocName}}
• رؤية الجمعية: {{vision}}
• رسالة الجمعية: {{mission}}
• الأهداف الاستراتيجية: {{strategicGoals}}
• مجال العمل: {{field}}
• المنطقة / المدينة: {{city}}
• اسم المبادرة: {{programName}}
• فكرة المبادرة: {{programIdea}}

{{additionalInfo}}

{{preferences}}

## قواعد عامة
١. صمّم المبادرة وفق رؤية الجمعية ورسالتها وأهدافها، واختم كل محور بفقرة قصيرة بعنوان «الارتباط برؤية الجمعية ورسالتها» تبيّن صلة المحور برؤية الجمعية أو رسالتها أو أحد أهدافها بعبارة محددة غير مكررة. ويُستثنى من ذلك محور «الارتباط الاستراتيجي» الذي يفصّل الارتباط بالاستراتيجية وحده، فلا يتكرر شرح كيفية الارتباط الاستراتيجي في غيره.
٢. استخدم لغة عربية مبسطة ومباشرة وعملية، بلا إنشاء أو مبالغة أو وعود غير مثبتة.
٣. اجعل الأرقام والمؤشرات واقعية ومتناسبة مع عدد المستفيدين والمدة والميزانية.
٤. لا تخترع إحصاءات أو دراسات أو شراكات أو موافقات أو أسعاراً. استند فقط إلى مصادر موثوقة تعرفها يقيناً (الهيئة العامة للإحصاء، وثائق رؤية السعودية ٢٠٣٠ وبرامجها، دراسات متخصصة)، واذكر مصدر كل رقم إحصائي.
٥. اذكر الارتباط برؤية ٢٠٣٠ فقط عندما يكون مباشراً ومبرراً، وحدّد الهدف أو البرنامج المرتبط.
٦. إذا نقصت معلومة (كالاحتياج، أو عدد المستفيدين، أو المدة، أو الجهة الداعمة) فابنِ عليها افتراضاً معقولاً متسقاً مع فكرة المبادرة، واكتبه بصياغة طبيعية ضمن النص دون أي تمييز لوني أو وسم، ودون الإشارة إلى أنه نقص أو افتراض. وصِف الأرقام غير الموثقة بأنها «تقديرية».
٧. استخدم الأرقام العربية الهندية (١، ٢، ٣) بنمط موحد في الوثيقة كلها، واكتب النسب (١٥٪) والمبالغ والأقواس بصورة صحيحة.
٨. لا تضع أسماء أشخاص أو تواريخ أو أسعاراً أو موافقات غير مقدمة. وإذا لم تُقدَّم تواريخ فعلية فاحسب المواعيد من «تاريخ الاعتماد».

## محاور الوثيقة (بالترتيب وحصراً)
١. **صفحة الغلاف:** اسم المبادرة واسم الجمعية فقط.
٢. **اسم المبادرة:** اسم جذّاب ومعبّر عن الفكرة، مع شعار قصير.
٣. **مقدمة:** نحو عشرة أسطر تعرّف بالجمعية وقضية المبادرة والحاجة إليها وأهمية تنفيذها.
٤. **فكرة المبادرة:** فقرة موضوعية واحدة لا تتجاوز أربعة أسطر (دون نقاط) توضّح ماهيتها ولمن تُقدَّم وكيف تعمل.
٥. **أهداف المبادرة:** هدف عام واحد، ثم من ٣ إلى ٥ أهداف تفصيلية قابلة للقياس، لكل منها رقم مستهدف وموعد.
٦. **مبررات المبادرة:** الاحتياج الفعلي مع شواهده ومصادره، والتوافق مع رؤية ٢٠٣٠، والمشكلات التي تعالجها، والفرص التي تتيحها، والبيانات الناقصة وكيف ستعالجها المبادرة (كالقياس القبلي)، ونقاط القوة التي تحفّز على دعمها.
٧. **الارتباط الاستراتيجي:** كيف ترتبط المبادرة باستراتيجية الجمعية وأهدافها.
٨. **الفئة المستهدفة:** الصفة، والعدد، والنطاق الجغرافي، ومعايير الأهلية والأولوية، وآلية التحقق، مع مراعاة العدالة والخصوصية.
٩. **نطاق المبادرة:** مكان التنفيذ ومدته.
١٠. **نموذج التغيير:** الترابط بين الموارد والأنشطة والمخرجات والنتائج القريبة والأثر المتوقع، ومنطق التغيير، والافتراضات التي يتوقف عليها الأثر.
١١. **تفاصيل المحتوى وأدوات التنفيذ:** ما يُقدَّم للمستفيدين بالتفصيل (برامج، ورش، خدمات، مواد) في جدول عند الحاجة، والأدوات والوسائل المستخدمة، ومعايير الجودة الأساسية.
١٢. **مراحل التنفيذ:** جدول (المرحلة — المدة — ما يحدث فيها — الناتج) من البداية حتى الإغلاق.
١٣. **الخطة التشغيلية (مخطط جانت):** جدول (المهمة — المدة — الأسابيع أو الأشهر)، وتُظلَّل خلايا التنفيذ بالرمز ■ وتُترك الخلايا الأخرى فارغة.
١٤. **المخرجات والنتائج والعوائد الإيجابية ومؤشرات قياسها:** المخرجات المتوقعة، والأثر الإيجابي على المستفيدين والجهات الشريكة والجمعية، ثم جدول (المؤشر — شرح المؤشر — المستهدف — أداة القياس — وسيلة التحقق — موعد القياس — المسؤول)، مع مؤشر تتبعي واحد على الأقل لاستمرار الأثر بعد الانتهاء، بما يتسق مع نموذج التغيير.
١٥. **خطة الاستدامة:** الأصول المعرفية، والكوادر الداخلية، والشراكات، والموارد الذاتية، والتطوير، مع تقدير ما توفّره الدورات اللاحقة من تكلفة.
١٦. **فريق العمل:** جدول (المنصب — الأدوار — الصلاحيات)، ويجوز إسناد أكثر من دور لشخص واحد.
١٧. **أصحاب المصلحة:** جدول (الجهة — ماذا تريد من المشروع — الدور المطلوب — ماذا ستقدّم لها الجمعية).
١٨. **المخاطر:** جدول (الخطر — الدرجة: منخفضة/متوسطة/مرتفعة — إجراءات الحد منه)، يشمل المخاطر التشغيلية والمالية والزمنية والسلامة والخصوصية.
١٩. **المتطلبات النظامية والخصوصية والسلامة:** فقرة مختصرة عن الموافقات اللازمة، والالتزام بنظام حماية البيانات الشخصية، وموافقات أولياء الأمور لمن هم دون ١٨ سنة، وموافقات التصوير والنشر، وحماية المستفيدين.
٢٠. **الميزانية التقديرية:** جدول (م — بند الصرف — التفاصيل — الكمية — سعر الوحدة — التكلفة)، ثم المجموع، ثم احتياطي الطوارئ (٥٪)، ثم ضريبة القيمة المضافة (١٥٪) على البنود الخاضعة فقط، ثم الإجمالي. احسب كل بند (الكمية × سعر الوحدة) وتحقق من المجموع، واذكر العملة (ريال سعودي)، وافصل التكاليف الإدارية وبيّن نسبتها، واحسب متوسط التكلفة لكل مستفيد.
{{budgetInstructions}}

{{directives}}

## صيغة الإخراج
اكتب الوثيقة كاملة بعناوين Markdown واضحة لكل محور بالترتيب، وجداول Markdown حيثما طُلب جدول. أخرج الوثيقة خالصة: بلا مقدمات أو ملاحظات أو توجيهات منك، وبلا أي شيء خارج المحاور أعلاه.

## مراجعة ذاتية قبل الإخراج (لا تُكتب في الوثيقة)
راجع ما يلي وعدّل الوثيقة على ضوئه:
١. هل يفهم قارئ لا يعرف المبادرة فكرتها وهدفها في دقيقة؟
٢. هل ارتباط كل محور برؤية الجمعية ورسالتها محدد لا عام؟
٣. هل الأهداف والأنشطة والمخرجات والمؤشرات مترابطة؟
٤. هل لكل مؤشر رقم مستهدف ووسيلة تحقق ومسؤول؟
٥. هل حسابات الميزانية صحيحة، والضريبة على البنود الخاضعة فقط؟
٦. هل الإحصاءات موثقة بمصادرها، والأرقام غير الموثقة موصوفة بأنها تقديرية؟
٧. هل الأرقام والنسب والأقواس مكتوبة بصورة موحدة وصحيحة؟


اكتب الوثيقة بالعربية الفصحى كاملةً، ولا تضع أي مصطلح إنجليزي ولا ترجمةً إنجليزية بين قوسين بجانب المصطلح العربي، في العناوين والجداول والنص.
مثال: اكتب «النتائج قصيرة المدى» لا «النتائج القريبة (Short-term Outcomes)»، و«المدخلات» لا «الموارد (Inputs)».
يُستثنى فقط ما لا اسم عربيَّ له: أسماء الجهات والبرامج والمنصات كما تُكتب رسمياً.`;

  const ANALYZE_PROMPT = `أنت مستشار متخصص في تصميم المبادرات الشبابية والمجتمعية وتقييم أثرها في القطاع غير الربحي السعودي، وتراجع وثائق المبادرات قبل عرضها على الداعمين وأصحاب القرار.

مهمتك: تحليل وثيقة المبادرة أدناه ومقارنتها بالهيكل المعياري لوثيقة المبادرة، ثم تقديم تقييم عملي يساعد كاتبها على تحسينها.

## الهيكل المعياري (عشرون محوراً بالترتيب)
١. صفحة الغلاف (اسم المبادرة واسم الجمعية) ٢. اسم المبادرة مع شعار قصير ٣. مقدمة ٤. فكرة المبادرة (فقرة لا تتجاوز أربعة أسطر) ٥. أهداف المبادرة (هدف عام، ثم ٣–٥ أهداف تفصيلية قابلة للقياس لكل منها رقم مستهدف وموعد) ٦. مبررات المبادرة (الاحتياج وشواهده ومصادره، التوافق مع رؤية ٢٠٣٠، المشكلات، الفرص، نقاط القوة) ٧. الارتباط الاستراتيجي ٨. الفئة المستهدفة (الصفة، العدد، النطاق، معايير الأهلية والأولوية، آلية التحقق) ٩. نطاق المبادرة (المكان والمدة) ١٠. نموذج التغيير (الموارد، الأنشطة، المخرجات، النتائج، الأثر، الافتراضات) ١١. تفاصيل المحتوى وأدوات التنفيذ ومعايير الجودة ١٢. مراحل التنفيذ (جدول) ١٣. الخطة التشغيلية (مخطط جانت) ١٤. المخرجات والنتائج ومؤشرات القياس (جدول: المؤشر، شرحه، المستهدف، أداة القياس، وسيلة التحقق، موعد القياس، المسؤول، مع مؤشر تتبعي بعد الانتهاء) ١٥. خطة الاستدامة ١٦. فريق العمل (جدول) ١٧. أصحاب المصلحة (جدول) ١٨. المخاطر (جدول بالدرجة وإجراءات الحد) ١٩. المتطلبات النظامية والخصوصية والسلامة ٢٠. الميزانية التقديرية (جدول بالكمية وسعر الوحدة والتكلفة، المجموع، احتياطي ٥٪، ضريبة ١٥٪ على البنود الخاضعة فقط، الإجمالي، نسبة التكاليف الإدارية، متوسط التكلفة لكل مستفيد).

## معايير التقييم
- اكتمال المحاور ووضوحها وترتيبها.
- ترابط الأهداف والأنشطة والمخرجات والمؤشرات ونموذج التغيير.
- قابلية الأهداف والمؤشرات للقياس: لكل مؤشر رقم مستهدف ووسيلة تحقق ومسؤول.
- واقعية الأرقام وتناسبها مع عدد المستفيدين والمدة والميزانية.
- توثيق الإحصاءات بمصادرها، ووصف الأرقام غير الموثقة بأنها تقديرية، وعدم وجود ادعاءات أو شراكات أو موافقات غير مثبتة.
- صحة حسابات الميزانية (الكمية × سعر الوحدة، المجموع، الاحتياطي، الضريبة على البنود الخاضعة فقط).
- وضوح الارتباط برؤية الجمعية ورسالتها وأهدافها، وبرؤية ٢٠٣٠ حيث يكون مباشراً ومبرراً.
- سلامة اللغة وبساطتها، وتوحيد كتابة الأرقام والنسب والأقواس، وخلوّها من المصطلحات الإنجليزية غير الضرورية.

## صيغة الإخراج (Markdown، بالعربية الفصحى)
١. **الخلاصة:** ثلاثة إلى خمسة أسطر عن مستوى الوثيقة وجاهزيتها، مع درجة كلية من ١٠٠.
٢. **تقييم المحاور:** جدول (المحور — الحالة: مكتمل/ناقص/ضعيف/غير موجود — الدرجة من ١٠ — الملاحظة) للمحاور العشرين بالترتيب.
٣. **نقاط القوة:** نقاط مختصرة.
٤. **أهم الفجوات مرتبة حسب الأولوية:** لكل فجوة سبب أهميتها وأثرها على قرار الداعم.
٥. **فحص الأرقام والميزانية:** الأخطاء الحسابية أو عدم الاتساق إن وُجدت، مع التصحيح.
٦. **توصيات التحسين:** توصيات محددة قابلة للتنفيذ، ومع كل توصية مهمة صياغة مقترحة جاهزة للنسخ.

لا تخترع معلومات عن المبادرة غير موجودة في النص، وإذا غابت معلومة فاذكر أنها غائبة. لا تكتب أي شيء خارج الأقسام الستة. ولا تضع مصطلحات إنجليزية.

## نص الوثيقة
{{documentText}}`;

  const AXES = ["نموذج التغيير", "الخطة التشغيلية (مخطط جانت)", "خطة الاستدامة", "فريق العمل", "أصحاب المصلحة", "المخاطر", "المتطلبات النظامية والخصوصية والسلامة"];
  const ERR = { not_configured: "أداة الذكاء الاصطناعي لم تُفعَّل بعد: أضف مفتاح Claude (ANTHROPIC_API_KEY) في إعدادات مشروع Vercel.", unauthorized: "انتهت جلستك، سجّل الدخول من جديد.", rate_limited: "الخدمة مشغولة الآن، جرّب بعد دقيقة.", refused: "اعتذرت الأداة عن كتابة هذا المحتوى، عدّل الوصف وجرّب.", too_long: "النص أطول من المسموح.", max_tokens: "توقفت الوثيقة قبل اكتمالها لطولها.", upstream: "تعذّر الاتصال بخدمة الذكاء الاصطناعي.", server: "حدث خطأ في الخادم.", empty: "لم يصل أي نص.", network: "انقطع الاتصال قبل اكتمال الوثيقة." };

  let db = null, me = "", myName = "", admin = false, items = [], assocs = [], unsub = null, loaded = false;
  let tool = { createPrompt: "", analyzePrompt: "" };
  let tab = "create", cur = null, curId = null, running = null, saveT = null;

  /* ---------- markdown ---------- */
  function md(text){
    const t = String(text || "").replace(/\n?\[\[ERROR:\w+\]\]\s*$/, "");
    if (window.marked && window.DOMPurify) return DOMPurify.sanitize(marked.parse(t, { gfm: true, breaks: false }));
    return `<pre style="white-space:pre-wrap;font:inherit">${esc(t)}</pre>`;
  }
  const titleOf = text => { const m = /^#{1,3}\s*(.+)$/m.exec(text || ""); return m ? m[1].replace(/[*_#]/g, "").replace(/^(صفحة الغلاف|اسم المبادرة)\s*[:：]?\s*/, "").trim().slice(0, 150) : ""; };

  /* ---------- building the prompt from the form ---------- */
  const v = id => ($(id).value || "").trim();
  const dash = s => s || "غير محدد";
  function createPrompt(){
    const extra = [["عدد المستفيدين", v("inBenef")], ["مدة المبادرة", v("inDur")], ["الفئة المستهدفة", v("inTarget")], ["تاريخ البداية", v("inStart")], ["تاريخ النهاية", v("inEnd")]].filter(x => x[1]);
    const excluded = [...document.querySelectorAll("#inAxes input:checked")].map(c => c.value);
    const len = $("inLen").value, tone = $("inTone").value;
    const pref = [
      len === "short" ? "• اجعل الوثيقة موجزة: فقرات قصيرة وجداول مركّزة، في حدود ست صفحات تقريباً." : len === "long" ? "• اجعل الوثيقة مفصّلة: توسّع في الشرح والجداول والأمثلة دون حشو." : "",
      tone === "donor" ? "• اكتب بأسلوب مقنع موجّه للداعمين يبرز القيمة والأثر والعائد من الدعم، مع الحفاظ على الدقة." : tone === "formal" ? "• اكتب بأسلوب رسمي إداري مناسب للعرض على مجلس الإدارة والجهات الحكومية." : "",
      excluded.length ? `• لا تكتب المحاور التالية ولا تذكرها، وأعد ترقيم بقية المحاور تبعاً لذلك: ${excluded.join("، ")}.` : "",
    ].filter(Boolean);
    let budget = "";
    if (!$("inBudgetOn").checked) budget = "تنبيه: لا تكتب محور «الميزانية التقديرية» ولا أي أرقام مالية في الوثيقة، واحذف ذكر التكاليف من بقية المحاور.";
    else {
      const total = v("inBudget").replace(/[^\d.]/g, "");
      budget = [total ? `التزم بإجمالي ميزانية قدره ${total} ريال سعودي تقريباً، ووزّع البنود بحيث يساوي الإجمالي النهائي هذا المبلغ.` : "",
        $("inReserve").checked ? "" : "لا تُضف بند احتياطي الطوارئ (٥٪) إلى الميزانية."].filter(Boolean).join("\n");
    }
    const fill = {
      assocName: dash(v("inAssoc")), vision: dash(v("inVision")), mission: dash(v("inMission")), strategicGoals: dash(v("inGoals")), field: dash(v("inField")), city: dash(v("inCity")),
      programName: v("inName") || "لم يُحدَّد، فابتكر اسماً إبداعياً معبّراً", programIdea: v("inIdea"),
      additionalInfo: extra.length ? "## معلومات إضافية\n" + extra.map(([k, x]) => `• ${k}: ${x}`).join("\n") : "",
      preferences: pref.length ? "## تفضيلات المحتوى\n" + pref.join("\n") : "",
      budgetInstructions: budget, directives: v("inDirect") ? "## توجيهات خاصة\n" + v("inDirect") : "",
    };
    return (tool.createPrompt || CREATE_PROMPT).replace(/\{\{(\w+)\}\}/g, (m, k) => fill[k] ?? "").replace(/\n{3,}/g, "\n\n");
  }
  const analyzePrompt = () => (tool.analyzePrompt || ANALYZE_PROMPT).replace("{{documentText}}", pdf && !v("anText") ? "الوثيقة مرفقة أعلاه كملف PDF بعنوان «" + pdf.name + "»." : (pdf ? "الوثيقة مرفقة أعلاه كملف PDF، وهذه ملاحظات أو نص إضافي منها:\n" : "") + v("anText"));
  const formInput = () => Object.fromEntries(["inAssoc", "inVision", "inMission", "inGoals", "inField", "inCity", "inName", "inIdea", "inBenef", "inDur", "inTarget", "inStart", "inEnd", "inLen", "inTone", "inBudget", "inDirect"].map(id => [id, $(id).value]).concat([["inBudgetOn", $("inBudgetOn").checked], ["inReserve", $("inReserve").checked], ["axes", [...document.querySelectorAll("#inAxes input:checked")].map(c => c.value)]]));
  function fillForm(inp){
    if (!inp) return;
    Object.entries(inp).forEach(([k, x]) => { const el = $(k); if (!el) return; if (el.type === "checkbox") el.checked = !!x; else el.value = x ?? ""; });
    document.querySelectorAll("#inAxes input").forEach(c => { c.checked = (inp.axes || []).includes(c.value); });
    syncBudget();
  }
  // the association's details come back from its latest document
  $("inAssoc").addEventListener("change", () => {
    const name = v("inAssoc"); if (!name) return;
    const a = window.Assocs && Assocs.byName(name);
    if (a){ [["inVision", "vision"], ["inMission", "mission"], ["inGoals", "goals"], ["inField", "field"], ["inCity", "city"]].forEach(([id, k]) => { if (!v(id) && a[k]) $(id).value = a[k]; }); }
    const last = items.filter(d => d.input && (d.input.inAssoc || "").trim() === name).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    if (!last) return;
    ["inVision", "inMission", "inGoals", "inField", "inCity"].forEach(id => { if (!v(id)) $(id).value = last.input[id] || ""; });
  });
  function syncBudget(){ $("inBudgetBox").hidden = !$("inBudgetOn").checked; }
  $("inBudgetOn").addEventListener("change", syncBudget);
  function syncAn(){ const n = $("anText").value.length; $("anCount").textContent = n.toLocaleString("en"); $("anGo").disabled = pdf ? n > 30000 : n < 200 || n > 30000; }
  $("anText").addEventListener("input", syncAn);

  /* ---------- uploading the document: a PDF goes to Claude as the file itself; Word and text become text in the box ---------- */
  const PDF_MAX = 3 * 1024 * 1024;
  let pdf = null; // { name, data (base64) } or, through Cloudinary, { name, url }
  const xmlText = xml => { const d = new DOMParser().parseFromString(xml, "application/xml"); return [...d.getElementsByTagName("w:p")].map(p => [...p.getElementsByTagName("w:t")].map(t => t.textContent).join("")).join("\n"); };
  async function readFile(f){
    const name = f.name || "ملف", ext = (name.split(".").pop() || "").toLowerCase();
    try {
      if (ext === "pdf" || f.type === "application/pdf"){
        if (window.Cloud && Cloud.ready()){
          if (f.size > Cloud.MAX){ UI.alert("حجم ملف PDF أكبر من 10 ميجابايت. صغّر الملف أو انسخ نصه والصقه هنا."); return; }
          showFile(name, true); $("anFileNote").textContent = "جارٍ رفع الملف… 0%"; $("anGo").disabled = true; pdf = null;
          try { const up = await Cloud.upload(f, { folder: "initiatives", onProgress: p => { $("anFileNote").textContent = `جارٍ رفع الملف… ${p}%`; } }); pdf = { name, url: up.url }; showFile(name, true); }
          catch (e){ clearFile(); UI.alert(Cloud.errText(e)); }
          syncAn(); return;
        }
        if (f.size > PDF_MAX){ UI.alert("حجم ملف PDF أكبر من 3 ميجابايت. صغّر الملف أو انسخ نصه والصقه هنا."); return; }
        const buf = new Uint8Array(await f.arrayBuffer()); let bin = ""; for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
        pdf = { name, data: btoa(bin) };
      } else if (ext === "docx"){
        if (!window.JSZip){ UI.alert("تعذّر قراءة ملف Word الآن، جرّب مرة ثانية."); return; }
        const zip = await JSZip.loadAsync(await f.arrayBuffer()), x = zip.file("word/document.xml");
        if (!x){ UI.alert("الملف لا يبدو ملف Word صالحاً."); return; }
        $("anText").value = xmlText(await x.async("string")).replace(/\n{3,}/g, "\n\n").trim(); pdf = null; keepSrc(f);
      } else if (["txt", "md", "markdown"].includes(ext) || f.type.startsWith("text/")){
        $("anText").value = (await f.text()).trim(); pdf = null; keepSrc(f);
      } else { UI.alert("الصيغ المدعومة: PDF أو Word (docx) أو ملف نصي."); return; }
      showFile(name, ext === "pdf" || f.type === "application/pdf");
    } catch (e){ console.error(e); UI.alert("تعذّر قراءة الملف."); }
    syncAn();
  }
  // with Cloudinary set, a Word or text file is also kept there so the analysis can link to it
  let src = null;
  function keepSrc(f){
    src = null; if (!(window.Cloud && Cloud.ready())) return;
    Cloud.upload(f, { folder: "initiatives" }).then(up => { src = { name: f.name, url: up.url }; }).catch(e => console.error(e));
  }
  function showFile(name, isPdf){
    $("anFile").hidden = false; $("anDrop").hidden = true; $("anFileName").textContent = name;
    $("anFileNote").textContent = isPdf ? "يُرسل الملف كما هو للتحليل. يمكنك إضافة ملاحظات في الخانة أدناه (اختياري)." : "استُخرج نص الملف في الخانة تحت، راجعه قبل التحليل.";
    $("anText").placeholder = isPdf ? "ملاحظات أو تعليمات إضافية عن الوثيقة (اختياري)…" : "الصق هنا نصّ الوثيقة الحالية…";
  }
  function clearFile(){ pdf = null; src = null; $("anFile").hidden = true; $("anDrop").hidden = false; $("anPick").value = ""; $("anText").placeholder = "الصق هنا نصّ الوثيقة الحالية…"; syncAn(); }
  $("anPick").addEventListener("change", e => { const f = e.target.files[0]; if (f) readFile(f); });
  $("anFileX").addEventListener("click", clearFile);
  const dz = $("anDrop");
  ["dragenter", "dragover"].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add("over"); }));
  ["dragleave", "drop"].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove("over"); }));
  dz.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) readFile(f); });

  /* ---------- generating ---------- */
  async function generate(mode){
    if (running) return;
    if (!db){ UI.alert("سجّل الدخول أولاً"); return; }
    if (mode === "create" && !v("inIdea")){ UI.toast("اكتب فكرة المبادرة", "err"); $("inIdea").focus(); return; }
    if (mode === "create" && !v("inAssoc")){ UI.toast("اكتب اسم الجمعية", "err"); $("inAssoc").focus(); return; }
    const prompt = mode === "create" ? createPrompt() : analyzePrompt();
    cur = { kind: mode === "create" ? "doc" : "analysis", markdown: "", input: mode === "create" ? formInput() : { anText: v("anText").slice(0, 30000), pdfName: pdf ? pdf.name : "", pdfUrl: pdf && pdf.url ? pdf.url : "", fileUrl: !pdf && src ? src.url : "", fileName: !pdf && src ? src.name : "" }, assocName: mode === "create" ? v("inAssoc") : "", title: "" };
    curId = null; showResult(); setRun(true, "جارٍ الكتابة…");
    const ctl = new AbortController(); running = ctl; const t0 = Date.now();
    const tick = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); $("resRun").textContent = `جارٍ الكتابة… ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} · ${cur.markdown.length.toLocaleString("en")} حرف`; }, 1000);
    let err = "";
    try {
      const token = window.appUser && window.appUser.getIdToken ? await window.appUser.getIdToken() : "";
      const r = await fetch("/api/initiative", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ mode, prompt, ...(mode === "analyze" && pdf ? (pdf.url ? { pdfUrl: pdf.url } : { pdf: pdf.data }) : {}) }), signal: ctl.signal });
      if (!r.ok){ let j = {}; try { j = await r.json(); } catch {} err = j.error || (r.status === 404 ? "not_configured" : "server"); }
      else {
        const rd = r.body.getReader(), dec = new TextDecoder(); let last = 0;
        for (;;){ const { done, value } = await rd.read(); if (done) break; cur.markdown += dec.decode(value, { stream: true }); if (Date.now() - last > 250){ last = Date.now(); paint(); } }
        const m = /\[\[ERROR:(\w+)\]\]\s*$/.exec(cur.markdown); if (m){ err = m[1]; cur.markdown = cur.markdown.replace(/\n?\[\[ERROR:\w+\]\]\s*$/, ""); }
      }
    } catch (e){ err = ctl.signal.aborted ? "stopped" : "network"; }
    clearInterval(tick); running = null;
    cur.title = cur.kind === "doc" ? (v("inName") || titleOf(cur.markdown) || "وثيقة مبادرة") : `تحليل: ${pdf && !v("anText") ? pdf.name.replace(/\.pdf$/i, "") : titleOf(v("anText")) || v("anText").slice(0, 60)}`;
    paint(); setRun(false);
    $("resName").textContent = cur.title;
    if (err === "stopped") UI.toast("أوقفت الكتابة");
    else if (err){ UI.alert(ERR[err] || ERR.server, { title: "تعذّر إكمال الوثيقة" }); if (!cur.markdown.trim()){ closeResult(); return; } }
    if (cur.markdown.trim()) save();
  }
  function setRun(on, text){
    $("resRun").hidden = !on; if (text) $("resRun").textContent = text;
    $("resStop").hidden = !on; ["resEdit", "resPrint", "resWord", "resSave", "resAgain"].forEach(id => { $(id).disabled = on; });
    $("resDoc").classList.toggle("writing", on);
  }
  function paint(){ $("resDoc").innerHTML = md(cur.markdown) || '<p class="muted-text">…</p>'; if (!$("resEditor").hidden && document.activeElement !== $("resText")) $("resText").value = cur.markdown; }

  /* ---------- result view ---------- */
  function showResult(){
    $("iniForms").hidden = true; $("iniResult").hidden = false;
    $("resName").textContent = cur.title || (cur.kind === "doc" ? "وثيقة جديدة" : "تحليل الوثيقة");
    $("resEditor").hidden = true; $("resEdit").setAttribute("aria-pressed", "false");
    $("resAgain").hidden = !cur.input || cur.legacy || (!!cur.input.pdfName && !cur.input.pdfUrl && (!pdf || pdf.name !== cur.input.pdfName));
    const orig = cur.input && (cur.input.pdfUrl || cur.input.fileUrl);
    $("resFile").hidden = !orig; if (orig) $("resFile").href = orig; $("resSaved").textContent = curId ? "محفوظة في سجلّي" : "";
    $("resSave").hidden = !canEdit(cur);
    paint(); window.scrollTo(0, 0);
  }
  function closeResult(){ if (running) running.abort(); cur = null; curId = null; $("iniResult").hidden = true; $("iniForms").hidden = false; render(); }
  $("resBack").addEventListener("click", closeResult);
  $("resStop").addEventListener("click", () => running && running.abort());
  $("resEdit").addEventListener("click", () => {
    const open = $("resEditor").hidden; $("resEditor").hidden = !open; $("resEdit").setAttribute("aria-pressed", String(open));
    if (open){ $("resText").value = cur.markdown; $("resText").focus(); }
  });
  $("resText").addEventListener("input", () => { cur.markdown = $("resText").value; $("resDoc").innerHTML = md(cur.markdown); clearTimeout(saveT); if (curId && canEdit(cur)) saveT = setTimeout(save, 1200); });
  $("resSave").addEventListener("click", () => save(true));
  $("resAgain").addEventListener("click", async () => {
    if (!(await UI.confirm("إعادة الكتابة من جديد بنفس المدخلات؟ تُنشأ وثيقة جديدة وتبقى هذه في سجلّي.", { ok: "إعادة الكتابة" }))) return;
    const inp = cur.input, kind = cur.kind; closeResult();
    if (kind === "doc"){ setTab("create"); fillForm(inp); generate("create"); } else { setTab("analyze"); $("anText").value = inp.anText || ""; if (inp.pdfUrl){ pdf = { name: inp.pdfName, url: inp.pdfUrl }; showFile(inp.pdfName, true); } syncAn(); generate("analyze"); }
  });

  /* ---------- saving (سجلّي) ---------- */
  const canEdit = d => !d || !d.owner || admin || d.owner === me;
  async function save(loud){
    if (!db || !cur || !cur.markdown.trim() || !canEdit(cur)) return;
    clearTimeout(saveT);
    const now = new Date().toISOString();
    const data = { kind: cur.kind, title: (cur.title || "وثيقة مبادرة").slice(0, 200), assocName: cur.assocName || "", markdown: cur.markdown, input: cur.input || null, updatedAt: now, updatedBy: me };
    try {
      if (curId) await db.collection("initiatives").doc(curId).update(data);
      else { Object.assign(data, { owner: me, ownerName: myName, createdAt: now }); const ref = await db.collection("initiatives").add(data); curId = ref.id; cur.owner = me; }
      $("resSaved").textContent = "حُفظت في سجلّي " + new Intl.DateTimeFormat("ar-SA-u-nu-latn", { hour: "numeric", minute: "2-digit" }).format(new Date());
      if (loud) UI.toast("حُفظت في سجلّي");
    } catch (e){ console.error(e); $("resSaved").textContent = "تعذّر الحفظ"; UI.toast("تعذّر الحفظ", "err"); }
  }
  // documents written with the earlier form (sections as fields) open as text
  function legacyMd(d){
    const L = a => (a || []).filter(x => String(x || "").trim());
    const T = (a, cols) => { const r = (a || []).filter(x => cols.some(([k]) => String((x || {})[k] ?? "").trim())); return r.length ? `| ${cols.map(c => c[1]).join(" | ")} |\n| ${cols.map(() => "---").join(" | ")} |\n` + r.map(x => `| ${cols.map(([k]) => String(x[k] ?? "").replace(/\|/g, "/")).join(" | ")} |`).join("\n") : ""; };
    const S = (h, b) => b && b.trim() ? `\n## ${h}\n${b}\n` : "";
    const meta = [["رمز المبادرة", d.code], ["البرنامج", d.program], ["الهدف الاستراتيجي", d.strategic], ["الجهة المالكة", d.unit], ["مدير المبادرة", d.manager], ["المدة", [d.start, d.end].filter(Boolean).join(" إلى ")]].filter(x => x[1]).map(([k, x]) => `- **${k}:** ${x}`).join("\n");
    return `# ${d.title || "وثيقة مبادرة"}\n\n${meta}\n` + S("الوصف", [d.description, d.problem, d.justification].filter(Boolean).join("\n\n")) + S("الأهداف", L(d.objectives).map((x, i) => `${i + 1}. ${x}`).join("\n")) +
      S("النطاق", L(d.inScope).map(x => "- " + x).join("\n")) + S("المخرجات", L(d.deliverables).map(x => "- " + x).join("\n")) + S("مؤشرات الأداء", T(d.kpis, [["name", "المؤشر"], ["base", "خط الأساس"], ["target", "المستهدف"], ["unit", "الوحدة"], ["freq", "الدورية"]])) +
      S("المراحل", T(d.phases, [["name", "المرحلة"], ["from", "من"], ["to", "إلى"], ["owner", "المسؤول"]])) + S("الميزانية", T(d.budget, [["item", "البند"], ["cost", "التكلفة"], ["note", "ملاحظة"]])) + S("المخاطر", T(d.risks, [["risk", "الخطر"], ["prob", "الاحتمال"], ["impact", "الأثر"], ["plan", "المعالجة"]]));
  }
  function openSaved(id){
    const d = items.find(x => x.id === id); if (!d) return;
    cur = { ...d, markdown: d.markdown ?? legacyMd(d), kind: d.kind || "doc", legacy: d.markdown == null }; curId = d.id;
    showResult();
  }
  async function remove(d){
    if (!(await UI.confirm(`حذف «${d.title}» من سجلّي نهائياً؟`, { ok: "حذف", danger: true }))) return;
    try { await db.collection("initiatives").doc(d.id).delete(); UI.toast("حُذفت"); } catch (e){ console.error(e); UI.toast("تعذّر الحذف", "err"); }
  }
  function renderLog(){
    const box = $("logList"); box.innerHTML = "";
    const list = items.filter(d => admin || d.owner === me).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    $("logEmpty").hidden = !loaded || list.length > 0;
    list.forEach(d => {
      const el = document.createElement("article"); el.className = "ig-item"; el.tabIndex = 0;
      const when = d.updatedAt ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d.updatedAt)) : "";
      el.innerHTML = `<span class="ig-kind ${d.kind === "analysis" ? "an" : ""}">${d.kind === "analysis" ? "تحليل" : "وثيقة"}</span><div class="ig-it"><b></b><small></small></div><div class="ig-ia"></div>`;
      el.querySelector("b").textContent = d.title || "بدون عنوان";
      el.querySelector("small").textContent = [d.assocName, when, admin && d.owner !== me ? d.ownerName || d.owner : ""].filter(Boolean).join(" · ");
      if (canEdit(d)){ const b = document.createElement("button"); b.type = "button"; b.className = "linkbtn danger-text"; b.textContent = "حذف"; b.addEventListener("click", e => { e.stopPropagation(); remove(d); }); el.querySelector(".ig-ia").append(b); }
      el.addEventListener("click", () => openSaved(d.id));
      el.addEventListener("keydown", e => { if (e.key === "Enter" && e.target === el) openSaved(d.id); });
      box.append(el);
    });
  }

  /* ---------- print / Word ---------- */
  const fileName = () => (cur.title || "وثيقة مبادرة").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 120);
  function print(){
    const area = $("iniPrint"); area.innerHTML = `<article class="ig-doc print">${md(cur.markdown)}</article>`;
    const t = document.title; document.title = fileName(); document.body.classList.add("printing-ini");
    const done = () => { document.body.classList.remove("printing-ini"); area.innerHTML = ""; document.title = t; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done); setTimeout(() => window.print(), 80);
  }
  function word(){
    const css = `body{font-family:"Sakkal Majalla","Traditional Arabic",Arial,sans-serif;direction:rtl;font-size:14pt;line-height:1.6}h1{font-size:22pt;text-align:center}h2{font-size:16pt;color:#1f4e46;border-bottom:1px solid #999;padding-bottom:3pt;margin-top:18pt}h3{font-size:14pt}
      table{border-collapse:collapse;width:100%;margin:6pt 0}th,td{border:1px solid #888;padding:4pt 6pt;text-align:right;vertical-align:top}th{background:#e8efed}`;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(fileName())}</title><style>${css}</style></head><body dir="rtl" lang="ar">${md(cur.markdown)}</body></html>`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + html], { type: "application/msword" })); a.download = fileName() + ".doc";
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  $("resPrint").addEventListener("click", print);
  $("resWord").addEventListener("click", word);

  /* ---------- tool settings (admins): the two prompts ---------- */
  $("igSetBtn").addEventListener("click", () => {
    $("igSet").hidden = !$("igSet").hidden; if ($("igSet").hidden) return;
    $("igSetCreate").value = tool.createPrompt || CREATE_PROMPT; $("igSetAnalyze").value = tool.analyzePrompt || ANALYZE_PROMPT;
  });
  $("igSetSave").addEventListener("click", async () => {
    const c = $("igSetCreate").value.trim(), a = $("igSetAnalyze").value.trim();
    if (!c.includes("{{programIdea}}") || !a.includes("{{documentText}}")){ UI.alert("برومت الإنشاء يجب أن يحتوي {{programIdea}}، وبرومت التحليل يجب أن يحتوي {{documentText}}."); return; }
    try { await db.collection("settings").doc("initiativeTool").set({ createPrompt: c === CREATE_PROMPT ? "" : c, analyzePrompt: a === ANALYZE_PROMPT ? "" : a, updatedAt: new Date().toISOString(), updatedBy: me }); UI.toast("حُفظت إعدادات الأداة"); $("igSet").hidden = true; }
    catch (e){ console.error(e); UI.toast("تعذّر الحفظ", "err"); }
  });
  $("igSetReset").addEventListener("click", () => { $("igSetCreate").value = CREATE_PROMPT; $("igSetAnalyze").value = ANALYZE_PROMPT; });
  $("igSetClose").addEventListener("click", () => { $("igSet").hidden = true; });

  /* ---------- tabs and wiring ---------- */
  function setTab(t){
    tab = t;
    document.querySelectorAll("[data-igtab]").forEach(b => b.setAttribute("aria-selected", b.dataset.igtab === t ? "true" : "false"));
    $("igCreate").hidden = t !== "create"; $("igAnalyze").hidden = t !== "analyze"; $("igLog").hidden = t !== "log";
    if (t === "log") renderLog();
  }
  document.querySelectorAll("[data-igtab]").forEach(b => b.addEventListener("click", () => setTab(b.dataset.igtab)));
  $("igCreate").addEventListener("submit", e => { e.preventDefault(); generate("create"); });
  $("igAnalyze").addEventListener("submit", e => { e.preventDefault(); generate("analyze"); });
  $("inAxes").innerHTML = AXES.map(a => `<label class="s-check"><input type="checkbox" value="${esc(a)}"> <span>${esc(a)}</span></label>`).join("");
  window.addEventListener("beforeunload", e => { if (running){ e.preventDefault(); } });

  function render(){
    $("iniSignin").hidden = !!db; $("iniHome").hidden = !db;
    $("igSetBtn").hidden = !admin;
    $("inAssocList").innerHTML = [...new Set([...assocs, ...items.map(d => d.assocName)].filter(Boolean))].map(n => `<option value="${esc(n)}">`).join("");
    if (tab === "log") renderLog();
  }
  function connect({ db: d, user }){
    if (unsub){ unsub.forEach(f => f()); unsub = null; }
    db = d; me = user ? user.email : ""; myName = (user && user.displayName) || (me || "").split("@")[0]; items = []; loaded = false;
    if (!db){ render(); return; }
    db.collection("allowed").doc(me).get().then(a => { admin = a.exists && a.data().role === "admin"; render(); }).catch(() => {});
    unsub = [
      db.collection("initiatives").onSnapshot(s => { items = s.docs.map(x => ({ id: x.id, ...x.data() })); loaded = true; render(); }, e => { console.error(e); loaded = true; render(); }),
      db.collection("associations").onSnapshot(s => { assocs = s.docs.map(x => x.data().name).filter(Boolean); render(); }, () => {}),
      db.collection("settings").doc("initiativeTool").onSnapshot(s => { tool = { createPrompt: "", analyzePrompt: "", ...(s.exists ? s.data() : {}) }; }, () => {}),
    ];
    render();
  }
  /* ---------- the notice shown every time the page opens ---------- */
  function notice(){
    if (document.querySelector(".ig-note")) return;
    const team = (window.siteSettings && window.siteSettings.siteName) || "الفريق";
    const I = d => `<span class="ig-note-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg></span>`;
    const back = document.createElement("div"); back.className = "ig-note-back";
    back.innerHTML = `<div class="ig-note" role="dialog" aria-modal="true" aria-labelledby="igNoteH">
      <header>${I('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4M12 16h.01"/>')}<h2 id="igNoteH">قبل أن تبدأ</h2><button type="button" class="ig-note-x" aria-label="إغلاق"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>
      <ul>
        <li>${I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.8.7 3 2.4 3 5.2"/>')}<p>استعمال هذه الأداة مقتصر على أعضاء فريق ${esc(team)} فقط.</p></li>
        <li>${I('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>')}<p>ما تنتجه الأداة مسودة أولى بمساعدة الذكاء الاصطناعي، ولا تغني عن مراجعة النص وتدقيقه والتأكد من صحة كل معلومة فيه قبل اعتماده أو إرساله.</p></li>
        <li>${I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="m5.6 5.6 3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/>')}<p>إن واجهت ما يحتاج تعديلاً أو تصحيحاً أو إضافة في الأداة، تواصل مع مدير النظام.</p></li>
      </ul>
      <button type="button" class="btn primary ig-note-ok">فهمت، متابعة</button>
    </div>`;
    const close = () => { back.remove(); document.removeEventListener("keydown", key, true); };
    const key = e => { if (e.key === "Escape"){ e.stopPropagation(); close(); } };
    back.querySelector(".ig-note-ok").addEventListener("click", close);
    back.querySelector(".ig-note-x").addEventListener("click", close);
    back.addEventListener("click", e => { if (e.target === back) close(); });
    document.addEventListener("keydown", key, true);
    document.body.append(back); back.querySelector(".ig-note-ok").focus();
  }
  // after the «جاري التحميل» screen has gone (it shows for about 0.9 s)
  let noteT = 0;
  window.addEventListener("app:view", e => {
    clearTimeout(noteT);
    if (e.detail === "projects/initiatives") noteT = setTimeout(() => { if (location.hash.replace(/^#\/?/, "") === "projects/initiatives") notice(); }, 950);
    else { const n = document.querySelector(".ig-note-back"); if (n) n.remove(); }
  });
  if (location.hash.replace(/^#\/?/, "") === "projects/initiatives") setTimeout(notice, 300);
  window.addEventListener("app:db", e => connect(e.detail));
  if (window.appDb) connect({ db: window.appDb, user: window.appUser });
  syncBudget(); render();
})();
