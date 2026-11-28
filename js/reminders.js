/* Reminders: a task with a due date and a time rings at that time — a browser notification (when allowed),
   a sound, and a card on the page with "تم" and "أجّل". Works while the site is open in any tab; for a
   reminder on the phone when the site is closed, a task can be added to the device calendar (.ics with an alarm).
   tasks/{id} gets remindedFor: "YYYY-MM-DDTHH:MM" once it has rung, so it rings once per time. */
(() => {
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const keyOf = t => `${t.due}T${t.time}`;
  const LATE_MAX = 12 * 3600e3; // reminders missed by more than this (site closed) are not rung on opening
  let db = null, tasks = [], shown = new Set();

  /* ---------- the ring ---------- */
  function beep(){
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      const ac = new C(), t0 = ac.currentTime;
      [0, 0.22].forEach((d, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = i ? 1046 : 784;
        g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.25, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.35);
        o.connect(g).connect(ac.destination); o.start(t0 + d); o.stop(t0 + d + 0.4);
      });
      setTimeout(() => ac.close(), 1200);
    } catch {}
  }
  function notify(t){
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const n = new Notification("تذكير: " + t.title, { body: window.SmartTask ? SmartTask.describe({ date: t.due, time: t.time }) : t.time, tag: "task-" + t.id, requireInteraction: true, lang: "ar", dir: "rtl", icon: "/img/icons/icon-192.png", badge: "/img/icons/favicon-32.png" });
      n.onclick = () => { window.focus(); location.hash = "#/tasks"; n.close(); };
    } catch {}
  }
  function card(t){
    if (shown.has(t.id)) return; shown.add(t.id);
    const box = $("rmStack");
    const el = document.createElement("div"); el.className = "rm-card"; el.setAttribute("role", "alert");
    el.innerHTML = `<div class="rm-h"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg><span>تذكير</span><span class="rm-when"></span></div>
      <p class="rm-t"></p><div class="rm-acts"><button class="btn small primary" type="button" data-a="done">تم</button><button class="btn small" type="button" data-a="snooze">أجّل 10 دقائق</button><button class="btn small ghost" type="button" data-a="close">إغلاق</button></div>`;
    el.querySelector(".rm-t").textContent = t.title;
    el.querySelector(".rm-when").textContent = window.SmartTask ? SmartTask.timeLabel(t.time) : t.time;
    const close = () => { el.remove(); shown.delete(t.id); };
    el.addEventListener("click", async e => {
      const a = e.target.closest("[data-a]"); if (!a) return;
      const now = new Date();
      if (a.dataset.a === "done") await Tasks.update(t.id, { status: "done" });
      if (a.dataset.a === "snooze"){
        const x = new Date(now.getTime() + 10 * 60e3);
        await Tasks.update(t.id, { due: ymd(x), time: `${pad(x.getHours())}:${pad(x.getMinutes())}`, remindedFor: null }, { log: false });
        UI.toast("أجّلت التذكير 10 دقائق");
      }
      close();
    });
    box.append(el);
  }
  // during the person's quiet hours the card still shows, without a sound or a notification
  function ring(t){ card(t); if (window.Notif && Notif.quiet()) return; notify(t); beep(); }

  /* ---------- the clock ---------- */
  function check(){
    if (!db) return;
    const now = Date.now();
    tasks.forEach(t => {
      if (TaskCore.CLOSED.has(t.status) || t.status === "deferred" || !t.due || !t.time || t.remindedFor === keyOf(t)) return;
      const at = new Date(`${t.due}T${t.time}:00`).getTime(); if (isNaN(at) || at > now) return;
      // only the person responsible is reminded (or the owner when nobody is)
      if ((t.assignee || t.owner) && (t.assignee || t.owner) !== Tasks.me) return;
      if (now - at > LATE_MAX){ Tasks.update(t.id, { remindedFor: keyOf(t) }, { log: false }); return; }
      t.remindedFor = keyOf(t);
      Tasks.update(t.id, { remindedFor: keyOf(t) }, { log: false });
      ring(t);
    });
  }
  // ask once, from a click (browsers only allow it then), when the first timed task is saved
  function ask(){
    if (!("Notification" in window) || Notification.permission !== "default") return;
    try { Notification.requestPermission(); } catch {}
  }

  /* ---------- the device calendar ---------- */
  function ics(t){
    if (!t.due) return;
    const esc = s => String(s || "").replace(/[\\,;]/g, m => "\\" + m).replace(/\n/g, "\\n");
    const d = t.due.replace(/-/g, ""), tm = (t.time || "09:00").replace(":", "") + "00";
    const end = new Date(`${t.due}T${t.time || "09:00"}:00`); end.setMinutes(end.getMinutes() + 30);
    const e = `${ymd(end).replace(/-/g, "")}T${pad(end.getHours())}${pad(end.getMinutes())}00`;
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//governance-office//tasks//AR", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
      `UID:${t.id || stamp}@governance-office`, `DTSTAMP:${stamp}`, `DTSTART:${d}T${tm}`, `DTEND:${e}`, `SUMMARY:${esc(t.title)}`,
      ...(t.notes ? [`DESCRIPTION:${esc(t.notes)}`] : []),
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(t.title)}`, "TRIGGER:PT0M", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar;charset=utf-8" }));
    a.download = "تذكير.ics"; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function connect(d){
    if (db) return; db = d.db;
    window.addEventListener("app:tasks", e => { tasks = e.detail.tasks; check(); });
  }
  const stack = document.createElement("div"); stack.id = "rmStack"; stack.className = "rm-stack"; stack.setAttribute("aria-live", "assertive");
  document.body.append(stack);
  setInterval(check, 15000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  window.Reminders = { ask, ics, check };
  if (window.appDb) connect({ db: window.appDb });
  window.addEventListener("app:db", e => connect(e.detail));
})();
