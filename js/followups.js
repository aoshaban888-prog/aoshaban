/* الشؤون الإدارية › المتابعات: everything waiting on someone else, in one place, from the records that already exist —
   tasks «بانتظار طرف آخر» (with the other party, the person, the next follow-up date and a note on the task itself)
   and the person's own requests waiting for approval. Nothing is copied: a follow-up is the task or the request.
   States: بانتظار الرد · بانتظار الاعتماد · يحتاج متابعة · تم الرد · مكتمل. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const T = () => window.Tasks;
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
  const add = n => { const d = new Date(today() + "T12:00:00"); d.setDate(d.getDate() + n); return d.toLocaleDateString("en-CA"); };
  const fmt = s => s ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short" }).format(new Date(String(s).slice(0, 10) + "T12:00:00")) : "—";
  const STATES = { wait: ["بانتظار الرد", "var(--info)"], approval: ["بانتظار الاعتماد", "var(--warn)"], due: ["يحتاج متابعة", "var(--danger)"], replied: ["تم الرد", "var(--ok)"], done: ["مكتمل", "var(--muted)"] };
  let mine = [], filter = "open", q = "";

  function rows(){
    const out = [], td = today(), list = T() && T().list ? T().list : [];
    list.filter(t => !t.parentId && !t.archived).forEach(t => {
      const since = t.waitingSince || t.updatedAt || t.createdAt, stale = since && Date.now() - Date.parse(since) > 7 * 864e5;
      let st = null;
      if (t.status === "waiting") st = (t.followUp && t.followUp <= td) || (!t.followUp && stale) ? "due" : "wait";
      else if (t.repliedAt && t.status !== "done" && t.status !== "cancelled") st = "replied";
      else if (t.status === "done" && (t.party || t.waitingSince) && t.doneAt && Date.now() - Date.parse(t.doneAt) < 30 * 864e5) st = "done";
      if (st) out.push({ kind: "task", id: t.id, title: t.title, party: t.party || "", contact: t.contact || (t.assignee ? T().personName(t.assignee) : ""), sent: since, updated: t.updatedAt, next: t.followUp || "", st, note: t.followNote || "", link: t.link ? t.link.label : "" });
    });
    mine.filter(r => r.status === "pending").forEach(r => { const stage = (r.stages || [])[r.stageIndex || 0];
      out.push({ kind: "request", id: r.id, title: r.title || "طلب", party: stage ? stage.name : "", contact: stage ? (stage.approvers || []).map(a => a.name || a.email).join("، ") : "", sent: r.submittedAt, updated: r.updatedAt, next: "", st: "approval", note: "", link: r.ref || "" }); });
    const rank = { due: 0, approval: 1, wait: 2, replied: 3, done: 4 };
    return out.filter(x => (filter === "all" || (filter === "open" ? x.st !== "done" : x.st === filter)) && (!q || [x.title, x.party, x.contact, x.note].join(" ").includes(q)))
      .sort((a, b) => rank[a.st] - rank[b.st] || String(a.next || "9").localeCompare(String(b.next || "9")));
  }
  function draw(){
    const box = $("fuList"); if (!box || $("fuList").closest(".view").hidden) return;
    const all = rows.call(null), counts = {};
    const base = (() => { const f = filter; filter = "all"; const r = rows(); filter = f; return r; })();
    base.forEach(x => { counts[x.st] = (counts[x.st] || 0) + 1; });
    $("fuTabs").innerHTML = [["open", "المفتوحة", base.filter(x => x.st !== "done").length], ...Object.entries(STATES).map(([k, [l]]) => [k, l, counts[k] || 0]), ["all", "الكل", base.length]]
      .map(([k, l, n]) => `<button type="button" data-f="${k}" aria-pressed="${filter === k}">${l} <i>${n}</i></button>`).join("");
    box.innerHTML = all.length ? `<table class="fu-t"><thead><tr><th>الموضوع</th><th>الجهة</th><th>المسؤول</th><th>أُرسل</th><th>آخر تحديث</th><th>المتابعة القادمة</th><th>الحالة</th><th></th></tr></thead><tbody>${all.map(x => `<tr data-kind="${x.kind}" data-id="${x.id}">
      <td><button type="button" class="fu-open">${esc(x.title)}</button>${x.note ? `<small>${esc(x.note)}</small>` : ""}${x.link ? `<small>🔗 ${esc(x.link)}</small>` : ""}</td><td>${esc(x.party || "—")}</td><td>${esc(x.contact || "—")}</td><td>${fmt(x.sent)}</td><td>${fmt(x.updated)}</td>
      <td>${x.kind === "task" && x.st !== "done" ? `<input type="date" class="input fu-date" value="${esc(x.next)}" aria-label="موعد المتابعة القادمة">` : fmt(x.next)}</td>
      <td><span class="fu-st" style="--c:${STATES[x.st][1]}">${STATES[x.st][0]}</span></td>
      <td class="fu-act">${x.kind === "task" && (x.st === "wait" || x.st === "due") ? '<button type="button" class="btn small" data-a="replied">تم الرد</button><button type="button" class="btn small ghost" data-a="snooze">+3 أيام</button>' : ""}${x.kind === "task" && x.st !== "done" ? '<button type="button" class="btn small ghost" data-a="done">مكتمل</button>' : ""}</td></tr>`).join("")}</tbody></table>`
      : `<p class="ig-empty">${filter === "open" ? "لا توجد متابعات مفتوحة. حين تجعل مهمةً «بانتظار طرف آخر» تظهر هنا." : "لا توجد عناصر في هذا التصنيف."}</p>`;
  }
  $("fuTabs") && $("fuTabs").addEventListener("click", e => { const b = e.target.closest("[data-f]"); if (b){ filter = b.dataset.f; draw(); } });
  $("fuQ") && $("fuQ").addEventListener("input", e => { q = e.target.value.trim(); draw(); });
  $("fuList") && $("fuList").addEventListener("click", async e => {
    const tr = e.target.closest("tr[data-id]"); if (!tr) return; const { kind, id } = tr.dataset;
    if (e.target.closest(".fu-open")){ if (kind === "task") TaskDetail.open(id); else { location.hash = "#/hr/requests"; setTimeout(() => { const b = document.querySelector('[data-rqtab="mine"]'); b && b.click(); }, 150); } return; }
    const a = e.target.closest("[data-a]"); if (!a) return;
    if (a.dataset.a === "replied"){ const v = await UI.prompt("ما خلاصة الرد؟ (اختياري)", { title: "تم الرد", ok: "حفظ", note: "", noteRequired: false, placeholder: "مثال: وافقوا وأرسلوا العقد" }); if (!v) return; await T().update(id, { status: "doing", repliedAt: new Date().toISOString(), followNote: v.note || "" }); UI.toast("سُجّل الرد، وعادت المهمة «قيد التنفيذ»"); }
    if (a.dataset.a === "snooze") await T().update(id, { followUp: add(3) });
    if (a.dataset.a === "done") await T().update(id, { status: "done" });
  });
  $("fuList") && $("fuList").addEventListener("change", e => { if (e.target.classList.contains("fu-date")){ const id = e.target.closest("tr").dataset.id; T().update(id, { followUp: e.target.value || null }); } });
  $("fuNew") && $("fuNew").addEventListener("click", async () => {
    if (!T() || !T().db) return;
    const back = document.createElement("div"); back.className = "ui-scrim";
    const box = document.createElement("div"); box.className = "ui-dialog lf-gform"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    box.innerHTML = `<h2>متابعة جديدة</h2><form><label class="ig-f"><span>الموضوع</span><input class="input" name="title" required placeholder="مثال: الرد على طلب تمويل البرنامج"></label>
      <div class="lf-row"><label class="ig-f"><span>الجهة</span><input class="input" name="party" placeholder="مثال: وزارة الموارد البشرية"></label><label class="ig-f"><span>الشخص المسؤول لديهم</span><input class="input" name="contact"></label></div>
      <div class="lf-row"><label class="ig-f"><span>موعد المتابعة القادمة</span><input class="input" type="date" name="followUp" value="${add(3)}"></label><label class="ig-f"><span>ملاحظة</span><input class="input" name="note"></label></div>
      <div class="ui-actions"><button class="btn primary" type="submit">حفظ</button><button class="btn" type="button" data-x>إلغاء</button></div></form>`;
    document.body.append(back, box); const f = box.querySelector("form"), close = () => { back.remove(); box.remove(); };
    box.querySelector("[data-x]").addEventListener("click", close); back.addEventListener("click", close); setTimeout(() => f.title.focus(), 30);
    f.addEventListener("submit", async ev => { ev.preventDefault(); if (!f.title.value.trim()) return;
      try { await T().create({ title: f.title.value.trim(), status: "waiting", party: f.party.value.trim(), contact: f.contact.value.trim(), followUp: f.followUp.value || null, followNote: f.note.value.trim(), waitingSince: new Date().toISOString(), scope: "work" }); close(); UI.toast("أُضيفت المتابعة"); } catch {} });
  });
  window.addEventListener("app:requests", e => { mine = e.detail.mine || []; draw(); });
  window.addEventListener("app:tasks", () => { clearTimeout(draw._t); draw._t = setTimeout(draw, 40); });
  window.addEventListener("app:view", e => { if (e.detail === "followups") setTimeout(draw, 30); });
})();
