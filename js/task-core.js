/* Task logic with no page code, shared by the browser and the tests (node --test tests/).
   Firestore tasks/{id} (schema 2):
     { title, description, status, priority, owner, assignee, projectId, tags[], startDate, due, time,
       estimate (minutes), spent (minutes), progressMode: auto|manual, progressManual, checklist[{ id, text, done }],
       parentId, dependsOn[ids], recurrence { freq: daily|weekly|monthly, interval, days[] } | null,
       attachments[{ id, kind: link|file, name, url?, fileId?, size? }], link, order, remindedFor,
       createdAt, updatedAt, doneAt, schema: 2 }
   Older tasks (title, notes, status todo|doing|done, priority normal|high) are read the same way through normalize(). */
(function (root){
  const SCHEMA = 2;
  const STATUSES = [
    { id: "todo", label: "لم تبدأ", color: "#8b93a7" },
    { id: "doing", label: "قيد التنفيذ", color: "#3b82f6" },
    { id: "review", label: "قيد المراجعة", color: "#d97706" },
    { id: "done", label: "مكتملة", color: "#16a34a" },
    { id: "deferred", label: "مؤجلة", color: "#7c8798" },
    { id: "cancelled", label: "ملغاة", color: "#dc2626" },
  ];
  const PRIORITIES = [
    { id: "low", label: "منخفضة", color: "#64748b" },
    { id: "medium", label: "متوسطة", color: "#3b82f6" },
    { id: "high", label: "عالية", color: "#ea580c" },
    { id: "urgent", label: "عاجلة", color: "#dc2626" },
  ];
  const FREQS = { daily: "يومية", weekly: "أسبوعية", monthly: "شهرية" };
  const ST = Object.fromEntries(STATUSES.map(s => [s.id, s])), PR = Object.fromEntries(PRIORITIES.map(p => [p.id, p]));
  const CLOSED = new Set(["done", "cancelled"]);
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const isDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const uid = () => Math.random().toString(36).slice(2, 10);

  /* ---------- reading any version of a task ---------- */
  function normalize(raw, id){
    const r = raw || {};
    const status = ST[r.status] ? r.status : "todo";
    const priority = PR[r.priority] ? r.priority : r.priority === "high" ? "high" : "medium";
    const list = v => Array.isArray(v) ? v : [];
    return {
      id: id ?? r.id ?? null,
      title: String(r.title || "").trim(),
      description: typeof r.description === "string" ? r.description : typeof r.notes === "string" ? r.notes : "",
      status, priority,
      owner: r.owner || r.createdBy || null,
      assignee: r.assignee || null,
      projectId: r.projectId || null,
      tags: list(r.tags).map(String).filter(Boolean),
      startDate: isDay(r.startDate) ? r.startDate : null,
      due: isDay(r.due) ? r.due : null,
      time: typeof r.time === "string" && /^\d{2}:\d{2}$/.test(r.time) ? r.time : null,
      estimate: Number.isFinite(+r.estimate) && +r.estimate > 0 ? Math.round(+r.estimate) : 0,
      spent: Number.isFinite(+r.spent) && +r.spent > 0 ? Math.round(+r.spent) : 0,
      progressMode: r.progressMode === "manual" ? "manual" : "auto",
      progressManual: clamp(+r.progressManual || 0),
      checklist: list(r.checklist).map(c => ({ id: c.id || uid(), text: String(c.text || ""), done: !!c.done })),
      parentId: r.parentId || null,
      dependsOn: list(r.dependsOn).filter(x => typeof x === "string"),
      recurrence: r.recurrence && FREQS[r.recurrence.freq] ? { freq: r.recurrence.freq, interval: Math.max(1, Math.round(+r.recurrence.interval || 1)), days: list(r.recurrence.days).filter(d => d >= 0 && d <= 6) } : null,
      attachments: list(r.attachments),
      link: r.link || null,
      order: Number.isFinite(+r.order) ? +r.order : 0,
      remindedFor: r.remindedFor || null,
      createdAt: r.createdAt || null, updatedAt: r.updatedAt || null, doneAt: r.doneAt || null,
      nextSpawned: !!r.nextSpawned,
      schema: SCHEMA,
    };
  }
  const clamp = n => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));
  // the fields written when an older task is brought to schema 2 (nothing is removed)
  function migrationPatch(raw, fallbackOwner){
    const t = normalize(raw);
    const p = { schema: SCHEMA, status: t.status, priority: t.priority, description: t.description, tags: t.tags, checklist: t.checklist,
      dependsOn: t.dependsOn, attachments: t.attachments, estimate: t.estimate, spent: t.spent, progressMode: t.progressMode,
      progressManual: t.progressManual, startDate: t.startDate, assignee: t.assignee, projectId: t.projectId, parentId: t.parentId, recurrence: t.recurrence };
    p.owner = t.owner || fallbackOwner || null;
    return p;
  }

  /* ---------- progress ---------- */
  // auto: every checklist item counts one, every subtask counts one at its own progress; with neither, the status decides
  function progress(task, children = []){
    const t = task;
    if (t.status === "done") return 100;
    if (t.progressMode === "manual") return clamp(t.progressManual);
    const kids = children.filter(c => c.status !== "cancelled");
    const units = t.checklist.length + kids.length;
    if (!units) return t.status === "review" ? 90 : 0;
    const sum = t.checklist.filter(c => c.done).length + kids.reduce((s, c) => s + progress(c, []) / 100, 0);
    return clamp(sum / units * 100);
  }
  // a group (project, everything): the average of its top-level tasks, cancelled ones left out
  function groupProgress(tasks, childrenOf = () => []){
    const top = tasks.filter(t => !t.parentId && t.status !== "cancelled");
    if (!top.length) return null;
    return clamp(top.reduce((s, t) => s + progress(t, childrenOf(t.id)), 0) / top.length);
  }
  // due state against today: "late" | "today" | "soon" (≤ 2 days) | "ok" | "none"
  function dueState(task, today = ymd(new Date())){
    if (!task.due || CLOSED.has(task.status)) return "none";
    const d = Math.round((new Date(task.due + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
    return d < 0 ? "late" : d === 0 ? "today" : d <= 2 ? "soon" : "ok";
  }
  // colour of a progress bar: green when done, red when late and unfinished, amber when close, otherwise by how far along
  function progressTone(pct, state){
    if (pct >= 100) return "done";
    if (state === "late") return "late";
    if (state === "today" || state === "soon") return pct >= 70 ? "good" : "warn";
    return pct >= 70 ? "good" : pct >= 30 ? "mid" : "low";
  }

  /* ---------- dependencies ---------- */
  // the tasks this one waits for that are still open
  function blockers(task, byId){
    return task.dependsOn.map(id => byId.get(id)).filter(d => d && !CLOSED.has(d.status));
  }
  // would "task depends on dep" close a loop?
  function makesCycle(taskId, depId, byId){
    if (taskId === depId) return true;
    const seen = new Set(), stack = [depId];
    while (stack.length){
      const id = stack.pop(); if (id === taskId) return true;
      if (seen.has(id)) continue; seen.add(id);
      const t = byId.get(id); if (t) stack.push(...t.dependsOn);
    }
    return false;
  }
  // a task waiting on open tasks can't start or finish
  const canMoveTo = (task, status, byId) => !["doing", "review", "done"].includes(status) || blockers(task, byId).length === 0;

  /* ---------- recurrence ---------- */
  function addMonths(d, n){
    const day = d.getDate(), x = new Date(d.getFullYear(), d.getMonth() + n, 1);
    x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); return x;
  }
  // the next date after `from` for this rule; weekly with days picks the next listed weekday
  function nextDate(from, rec){
    if (!rec || !isDay(from)) return null;
    const d = new Date(from + "T12:00:00"), n = Math.max(1, rec.interval || 1);
    if (rec.freq === "daily"){ d.setDate(d.getDate() + n); return ymd(d); }
    if (rec.freq === "monthly") return ymd(addMonths(d, n));
    if (rec.freq === "weekly"){
      const days = (rec.days || []).slice().sort((a, b) => a - b);
      if (!days.length){ d.setDate(d.getDate() + 7 * n); return ymd(d); }
      const later = days.find(x => x > d.getDay());
      if (later !== undefined){ d.setDate(d.getDate() + (later - d.getDay())); return ymd(d); }
      d.setDate(d.getDate() + (7 - d.getDay()) + 7 * (n - 1) + days[0]); return ymd(d);
    }
    return null;
  }
  // the copy made when a recurring task is completed: same work, next date, nothing ticked
  function nextOccurrence(task, today = ymd(new Date())){
    if (!task.recurrence) return null;
    const base = task.due || today;
    let due = nextDate(base, task.recurrence);
    while (due && due < today) due = nextDate(due, task.recurrence); // a late finish does not create a task already overdue
    if (!due) return null;
    const shift = task.startDate && task.due ? Math.round((new Date(task.due) - new Date(task.startDate)) / 86400000) : null;
    const start = shift !== null ? ymd(new Date(new Date(due + "T12:00:00").getTime() - shift * 86400000)) : null;
    return { ...task, id: null, status: "todo", due, startDate: start, spent: 0, doneAt: null, remindedFor: null, nextSpawned: false,
      checklist: task.checklist.map(c => ({ ...c, id: uid(), done: false })), progressManual: 0 };
  }
  function recurrenceLabel(rec){
    if (!rec) return "";
    const n = rec.interval || 1, unit = { daily: ["يوم", "يومين", "أيام"], weekly: ["أسبوع", "أسبوعين", "أسابيع"], monthly: ["شهر", "شهرين", "أشهر"] }[rec.freq];
    const every = n === 1 ? FREQS[rec.freq] : n === 2 ? `كل ${unit[1]}` : `كل ${n} ${unit[2]}`;
    const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    return rec.freq === "weekly" && rec.days && rec.days.length ? `${every}: ${rec.days.map(d => DAYS[d]).join("، ")}` : every;
  }

  /* ---------- checking input (the database rules check the same limits) ---------- */
  function validate(t){
    const e = [];
    if (!t.title) e.push("اكتب عنوان المهمة");
    if (t.title.length > 300) e.push("العنوان أطول من 300 حرف");
    if (t.description.length > 20000) e.push("الوصف طويل جداً");
    if (t.startDate && t.due && t.startDate > t.due) e.push("تاريخ البدء بعد تاريخ الاستحقاق");
    if (t.tags.length > 20) e.push("الوسوم أكثر من 20");
    if (t.checklist.length > 100) e.push("قائمة التحقق أكثر من 100 بند");
    if (t.estimate > 100000 || t.spent > 1000000) e.push("الوقت غير منطقي");
    if (t.time && !t.due) e.push("حدد التاريخ مع الوقت");
    return e;
  }

  /* ---------- what changed, for the activity log ---------- */
  const LABELS = { title: "العنوان", description: "الوصف", status: "الحالة", priority: "الأولوية", assignee: "المسؤول", projectId: "المشروع", tags: "الوسوم",
    startDate: "تاريخ البدء", due: "تاريخ الاستحقاق", time: "الوقت", estimate: "الوقت المقدّر", spent: "الوقت الفعلي", progressMode: "طريقة حساب النسبة",
    progressManual: "النسبة اليدوية", dependsOn: "الاعتماديات", recurrence: "التكرار", checklist: "قائمة التحقق", attachments: "المرفقات", parentId: "المهمة الأم" };
  function changes(before, after){
    const out = [];
    Object.keys(LABELS).forEach(k => {
      const a = JSON.stringify(before[k] ?? null), b = JSON.stringify(after[k] ?? null);
      if (a !== b) out.push({ field: k, label: LABELS[k], from: shortVal(k, before[k]), to: shortVal(k, after[k]) });
    });
    return out;
  }
  function shortVal(k, v){
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) return "—";
    if (k === "status") return (ST[v] || {}).label || v;
    if (k === "priority") return (PR[v] || {}).label || v;
    if (k === "recurrence") return recurrenceLabel(v);
    if (k === "checklist") return `${v.filter(c => c.done).length}/${v.length}`;
    if (k === "tags") return v.join("، ");
    if (k === "estimate" || k === "spent") return fmtMinutes(v);
    if (k === "progressManual") return v + "%";
    if (k === "progressMode") return v === "manual" ? "يدوية" : "تلقائية";
    if (Array.isArray(v)) return String(v.length);
    const s = String(v); return s.length > 60 ? s.slice(0, 60) + "…" : s;
  }
  function fmtMinutes(m){
    m = Math.round(+m || 0); if (!m) return "0د";
    const h = Math.floor(m / 60), r = m % 60;
    return h && r ? `${h}س ${r}د` : h ? `${h}س` : `${r}د`;
  }
  // "1.5" hours, "1:30", "90د", "2س" → minutes
  function parseMinutes(s){
    s = String(s || "").trim().replace(/[٠-٩]/g, c => "٠١٢٣٤٥٦٧٨٩".indexOf(c)); if (!s) return 0;
    let m = s.match(/^(\d+):(\d{1,2})$/); if (m) return +m[1] * 60 + +m[2];
    m = s.match(/^(\d+(?:\.\d+)?)\s*(س|h|ساعة|ساعات)?$/i); if (m) return Math.round(+m[1] * 60);
    m = s.match(/^(\d+)\s*(د|m|دقيقة|دقائق)$/i); if (m) return +m[1];
    m = s.match(/^(\d+)\s*(?:س|h)\s*(\d+)\s*(?:د|m)?$/i); if (m) return +m[1] * 60 + +m[2];
    return NaN;
  }

  root.TaskCore = { SCHEMA, STATUSES, PRIORITIES, FREQS, ST, PR, CLOSED, normalize, migrationPatch, progress, groupProgress, dueState, progressTone,
    blockers, makesCycle, canMoveTo, nextDate, nextOccurrence, recurrenceLabel, validate, changes, fmtMinutes, parseMinutes, uid, ymd };
})(typeof window !== "undefined" ? window : globalThis);
