/* The notification centre (the bell): items worked out from what this person may already read — requests waiting for
   their approval, their tasks due or late, policy reviews near, goals near their date — grouped by kind, with read
   state, «mark all read», and quiet hours for reminders. Read state and settings live in UserPrefs (the person's own). */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const bell = $("bell"), btn = $("bellBtn"), menu = $("bellMenu");
  const KINDS = { all: "الكل", tasks: "المهام والتذكيرات", requests: "الطلبات والاعتمادات", dues: "الاستحقاقات", system: "النظام" };
  let inbox = [], tasks = [], me = "", tab = "all";
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
  const days = s => Math.round((new Date(s + "T12:00:00") - new Date(today() + "T12:00:00")) / 864e5);
  const read = () => new Set(window.UserPrefs ? UserPrefs.get("notifRead", []) : []);

  function items(){
    const out = [], td = today();
    inbox.forEach(r => out.push({ key: `rq:${r.id}:${r.stageIndex || 0}`, kind: "requests", title: r.title || "طلب", sub: `بانتظار اعتمادك · من ${r.submitterName || r.submittedBy || ""}`, href: "#/hr/requests", tab: "inbox", warn: true }));
    tasks.filter(t => !t.parentId && !t.archived && t.due && t.due <= td && !["done", "cancelled", "deferred"].includes(t.status) && (t.assignee ? t.assignee === me : t.owner === me))
      .forEach(t => out.push({ key: `tk:${t.id}:${t.due}`, kind: "tasks", title: t.title, sub: t.due < td ? `متأخرة منذ ${-days(t.due)} ${-days(t.due) === 1 ? "يوم" : "أيام"}` : "مستحقة اليوم" + (t.time && window.SmartTask ? " · " + SmartTask.timeLabel(t.time) : ""), task: t.id, warn: t.due < td }));
    (window.Orgs ? Orgs.deadlines() : []).filter(x => x.band !== "later" && x.days >= -30).forEach(x => out.push({ key: `dl:${x.key}:${x.date}:${x.band}`, kind: "dues", title: `${x.title} · ${x.assoc}`,
      sub: `${x.kindLabel} · ${x.days < 0 ? `فات موعدها منذ ${-x.days} يوماً` : x.days === 0 ? "اليوم" : `بعد ${x.days} يوماً`}`, href: x.kind === "decision" ? "#/orgs/meetings" : "#/orgs/deadlines", warn: x.days <= 7 }));
    (window.Life ? Life.goals() : []).filter(g => g.due && g.status !== "done").forEach(g => { const d = days(g.due); if (d >= 0 && d <= 7) out.push({ key: `gl:${g.id}:${g.due}`, kind: "dues", title: `موعد هدف: ${g.title}`, sub: d === 0 ? "اليوم" : `بعد ${d} أيام`, href: "#/life/goals" }); });
    if ("Notification" in window && Notification.permission === "default" && tasks.some(t => t.time && t.due >= td)) out.push({ key: "sys:notif-permission", kind: "system", title: "فعّل تنبيهات المتصفح", sub: "لتصلك تذكيرات المهام في وقتها وأنت على صفحة أخرى", action: "perm" });
    return out;
  }
  function paint(){
    const all = items(), r = read(), unread = all.filter(x => !r.has(x.key));
    $("bellDot").hidden = !unread.length;
    btn.setAttribute("aria-label", unread.length ? `التنبيهات (${unread.length} غير مقروءة)` : "التنبيهات");
    if (menu.hidden) return;
    const list = all.filter(x => tab === "all" || x.kind === tab);
    const q = window.UserPrefs ? UserPrefs.get("quiet", { on: false, from: "22:00", to: "07:00" }) : { on: false };
    menu.innerHTML = `<div class="nt-h"><b>التنبيهات</b>${unread.length ? `<button type="button" class="linkbtn" data-allread>تحديد الكل كمقروء</button>` : ""}</div>
      <div class="nt-tabs">${Object.entries(KINDS).map(([k, l]) => { const n = k === "all" ? unread.length : unread.filter(x => x.kind === k).length; return `<button type="button" data-ntab="${k}" aria-pressed="${tab === k}">${l}${n ? ` <i>${n}</i>` : ""}</button>`; }).join("")}</div>
      <div class="nt-list">${list.map(x => `<button type="button" class="nt-i${r.has(x.key) ? "" : " unread"}${x.warn ? " warn" : ""}" data-key="${esc(x.key)}"><span class="nt-dot"></span><span class="nt-t"><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></span></button>`).join("") || '<p class="nt-none">لا توجد تنبيهات حالياً.</p>'}</div>
      <details class="nt-set"><summary>إعدادات التنبيهات</summary><label class="s-check"><input type="checkbox" data-quiet-on${q.on ? " checked" : ""}> <span>ساعات الهدوء: بلا صوت ولا إشعار للتذكيرات</span></label>
        <div class="nt-q"><label>من <input type="time" class="input" data-quiet-from value="${esc(q.from || "22:00")}"></label><label>إلى <input type="time" class="input" data-quiet-to value="${esc(q.to || "07:00")}"></label></div>
        <p class="muted-text">التذكيرات تعمل والموقع مفتوح في المتصفح. تنبيهات المتصفح: ${"Notification" in window ? { granted: "مفعّلة", denied: "محظورة من إعدادات المتصفح", default: "غير مفعّلة" }[Notification.permission] : "غير مدعومة"}.</p></details>`;
  }
  function markRead(keys){ if (!window.UserPrefs) return; const r = read(); keys.forEach(k => r.add(k)); UserPrefs.set("notifRead", [...r].slice(-400)); }
  menu.addEventListener("click", e => {
    const t = e.target.closest("[data-ntab]"); if (t){ tab = t.dataset.ntab; paint(); return; }
    if (e.target.closest("[data-allread]")){ markRead(items().map(x => x.key)); paint(); return; }
    const i = e.target.closest("[data-key]"); if (!i) return;
    const it = items().find(x => x.key === i.dataset.key); if (!it) return;
    markRead([it.key]); setOpen(false);
    if (it.action === "perm"){ if (window.Reminders && Reminders.ask) Reminders.ask(); else Notification.requestPermission(); return; }
    if (it.task){ location.hash = "#/tasks"; setTimeout(() => window.TaskDetail && TaskDetail.open(it.task), 150); return; }
    location.hash = it.href; if (it.tab) setTimeout(() => { const b = document.querySelector(`[data-rqtab="${it.tab}"]`); b && b.click(); }, 150);
  });
  menu.addEventListener("change", e => {
    if (!window.UserPrefs) return; const q = UserPrefs.get("quiet", { on: false, from: "22:00", to: "07:00" });
    if (e.target.matches("[data-quiet-on]")) q.on = e.target.checked;
    if (e.target.matches("[data-quiet-from]")) q.from = e.target.value;
    if (e.target.matches("[data-quiet-to]")) q.to = e.target.value;
    UserPrefs.set("quiet", q);
  });
  function setOpen(o){ menu.hidden = !o; btn.setAttribute("aria-expanded", String(o)); if (o) paint(); }
  btn.addEventListener("click", e => { e.stopPropagation(); setOpen(menu.hidden); });
  document.addEventListener("click", e => { if (!bell.contains(e.target)) setOpen(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") setOpen(false); });
  // quiet hours, for the reminders (js/reminders.js asks before it makes a sound or a notification)
  window.Notif = { quiet(){ const q = window.UserPrefs ? UserPrefs.get("quiet", null) : null; if (!q || !q.on) return false; const n = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Riyadh" }).format(new Date()); return q.from <= q.to ? n >= q.from && n < q.to : n >= q.from || n < q.to; } };
  window.addEventListener("app:requests", e => { inbox = e.detail.inbox || []; paint(); });
  window.addEventListener("app:tasks", e => { tasks = e.detail.tasks || []; me = e.detail.me || me; paint(); });
  ["app:prefs", "app:assocs", "app:life", "app:orgs"].forEach(ev => window.addEventListener(ev, paint));
  window.addEventListener("app:auth", () => { bell.hidden = !(window.appAuth && window.appAuth.allowed && window.appAuth.user); });
  paint();
})();
