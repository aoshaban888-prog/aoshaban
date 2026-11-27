/* Focus mode: one task on the screen, its description and checklist, a Pomodoro (work / break, lengths of your choosing)
   or a plain stopwatch, pause and resume, break, complete, and next task. When a session ends its minutes are added to
   the task's actual time (spent) and written to the task's activity log («جلسة تركيز»), so the reports can count them.
   Focus.open(taskId) — from the task menu, the task panel or the tasks page. */
(() => {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const T = () => window.Tasks;
  let el = null, id = null, timer = 0, mode = "work", running = false, left = 0, elapsed = 0, sessionStart = 0, workedMs = 0, kind = "pomo";
  let cfg = { work: 25, rest: 5 };
  try { cfg = { ...cfg, ...JSON.parse(localStorage.getItem("app-focus") || "{}") }; } catch {}
  const mmss = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  function open(taskId){
    const t = T() && T().byId.get(taskId); if (!t) return;
    close(true); id = taskId; mode = "work"; kind = localStorage.getItem("app-focus-kind") || "pomo"; running = false; left = cfg.work * 60; elapsed = 0; workedMs = 0;
    el = document.createElement("div"); el.className = "fx"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "وضع التركيز");
    document.body.append(el); document.body.classList.add("fx-on"); paint();
    document.addEventListener("keydown", key, true);
  }
  function paint(){
    const t = T().byId.get(id); if (!t || !el) return;
    const ck = t.checklist || [], subs = T().childrenOf(id);
    const shown = kind === "pomo" ? left : elapsed;
    el.innerHTML = `<div class="fx-in">
      <div class="fx-top"><span class="fx-badge">${mode === "work" ? "وقت التركيز" : "استراحة"}</span><button type="button" class="fx-x" data-a="close" aria-label="الخروج من وضع التركيز">×</button></div>
      <h1>${esc(t.title)}</h1>${t.description ? `<p class="fx-d">${esc(t.description).slice(0, 600).replace(/\n/g, "<br>")}</p>` : ""}
      <div class="fx-clock${mode === "rest" ? " rest" : ""}" aria-live="polite">${mmss(shown)}</div>
      <div class="fx-kind fm-seg" role="radiogroup"><button type="button" role="radio" data-kind="pomo" aria-checked="${kind === "pomo"}">بومودورو ${cfg.work}/${cfg.rest}</button><button type="button" role="radio" data-kind="watch" aria-checked="${kind === "watch"}">مؤقّت مفتوح</button></div>
      <div class="fx-ctl">${running ? '<button type="button" class="btn" data-a="pause">إيقاف مؤقت</button>' : `<button type="button" class="btn primary" data-a="start">${elapsed || left < cfg.work * 60 ? "استئناف" : "ابدأ"}</button>`}
        ${kind === "pomo" ? `<button type="button" class="btn ghost" data-a="${mode === "work" ? "rest" : "work"}">${mode === "work" ? "خذ استراحة" : "العودة للعمل"}</button>` : ""}
        <button type="button" class="btn ghost" data-a="done">✓ إكمال المهمة</button><button type="button" class="btn ghost" data-a="next">المهمة التالية ‹</button></div>
      ${ck.length || subs.length ? `<ul class="fx-ck">${ck.map(c => `<li><label><input type="checkbox" data-ck="${c.id}"${c.done ? " checked" : ""}> <span>${esc(c.text)}</span></label></li>`).join("")}${subs.map(s => `<li><label><input type="checkbox" data-sub="${s.id}"${s.status === "done" ? " checked" : ""}> <span>${esc(s.title)}</span></label></li>`).join("")}</ul>` : ""}
      <p class="fx-foot">الوقت المسجّل على المهمة: <b>${T().pct ? (window.TaskCore ? TaskCore.fmtMinutes((t.spent || 0) + Math.round(workedNow() / 60000)) || "0د" : "") : ""}</b>
        <span class="fx-set">طول التركيز <input type="number" min="5" max="120" step="5" value="${cfg.work}" data-cfg="work"> د · الاستراحة <input type="number" min="1" max="60" value="${cfg.rest}" data-cfg="rest"> د</span></p>
    </div>`;
  }
  const workedNow = () => workedMs + (running && mode === "work" ? Date.now() - sessionStart : 0);
  function tick(){
    if (kind === "pomo"){ left = Math.max(0, left - 1); if (!left){ beep(); if (mode === "work"){ stop(); mode = "rest"; left = cfg.rest * 60; UI.toast("انتهى وقت التركيز، خذ استراحة"); } else { stop(); mode = "work"; left = cfg.work * 60; UI.toast("انتهت الاستراحة"); } } }
    else elapsed++;
    const c = el && el.querySelector(".fx-clock"); if (c) c.textContent = mmss(kind === "pomo" ? left : elapsed);
    if (!left && kind === "pomo") paint();
  }
  function start(){ if (running) return; running = true; sessionStart = Date.now(); clearInterval(timer); timer = setInterval(tick, 1000); paint(); }
  function stop(){ if (!running) return; if (mode === "work") workedMs += Date.now() - sessionStart; running = false; clearInterval(timer); paint(); }
  function beep(){ try { const C = window.AudioContext || window.webkitAudioContext; const ac = new C(), o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; g.gain.value = .15; o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + .4); setTimeout(() => ac.close(), 800); } catch {} }
  // the minutes worked go to the task (spent) and its log, once per session
  async function record(){
    stop(); const min = Math.round(workedMs / 60000); workedMs = 0;
    if (min < 1 || !id) return;
    const t = T().byId.get(id); if (!t) return;
    await T().update(id, { spent: (t.spent || 0) + min }, { log: false });
    T().log(id, [{ action: "focus", text: `جلسة تركيز ${min} دقيقة`, minutes: min }]);
    UI.toast(`سُجّلت ${min} دقيقة على المهمة`);
  }
  async function close(silent){
    if (!el) return; await record();
    clearInterval(timer); el.remove(); el = null; id = null; document.body.classList.remove("fx-on"); document.removeEventListener("keydown", key, true);
  }
  function nextTask(){
    const td = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
    const RANK = { urgent: 0, high: 1, medium: 2, low: 3 };
    const list = T().list.filter(t => !t.parentId && !t.archived && t.id !== id && !["done", "cancelled", "deferred"].includes(t.status))
      .sort((a, b) => (b.mit === td) - (a.mit === td) || (a.due || "9").localeCompare(b.due || "9") || RANK[a.priority] - RANK[b.priority]);
    return list[0];
  }
  const key = e => { if (e.key === "Escape"){ e.stopPropagation(); close(); } else if (e.key === " " && e.target === document.body){ e.preventDefault(); running ? stop() : start(); } };
  document.addEventListener("click", async e => {
    if (!el || !el.contains(e.target)) return;
    const b = e.target.closest("[data-a],[data-kind]"); if (!b) return;
    if (b.dataset.kind){ stop(); kind = b.dataset.kind; try { localStorage.setItem("app-focus-kind", kind); } catch {} paint(); return; }
    const a = b.dataset.a;
    if (a === "start") start(); else if (a === "pause") stop();
    else if (a === "rest"){ stop(); mode = "rest"; left = cfg.rest * 60; start(); }
    else if (a === "work"){ stop(); mode = "work"; left = cfg.work * 60; paint(); }
    else if (a === "close") close();
    else if (a === "done"){ await record(); await T().update(id, { status: "done" }); const n = nextTask(); if (n && await UI.confirm(`أُنجزت المهمة. ننتقل إلى «${n.title}»؟`, { ok: "انتقال" })) open(n.id); else close(); }
    else if (a === "next"){ const n = nextTask(); if (!n){ UI.toast("لا توجد مهمة تالية"); return; } await record(); open(n.id); }
  });
  document.addEventListener("change", e => {
    if (!el || !el.contains(e.target)) return;
    const t = T().byId.get(id);
    if (e.target.dataset.ck){ T().update(id, { checklist: t.checklist.map(c => c.id === e.target.dataset.ck ? { ...c, done: e.target.checked } : c) }, { log: false }); }
    if (e.target.dataset.sub) T().update(e.target.dataset.sub, { status: e.target.checked ? "done" : "todo" });
    if (e.target.dataset.cfg){ cfg[e.target.dataset.cfg] = Math.max(1, Math.min(120, +e.target.value || cfg[e.target.dataset.cfg])); try { localStorage.setItem("app-focus", JSON.stringify(cfg)); } catch {} if (!running && mode === "work") left = cfg.work * 60; paint(); }
  });
  window.addEventListener("beforeunload", () => { if (el && running) record(); });
  window.Focus = { open, get active(){ return id; } };
})();
