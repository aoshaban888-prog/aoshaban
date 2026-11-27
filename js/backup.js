/* A full backup (التمكين التقني › النسخ الاحتياطي): every collection this account may read, with the sub-collections of
   letters, tasks and forms, in one JSON file. Read-only: it changes nothing. Personal collections (إدارة حياتي الشخصية)
   are read with owner == me, so a backup never holds another person's private data. Font files are left out. */
(() => {
  const $ = id => document.getElementById(id);
  let db = null, me = "";
  const SHARED = ["allowed", "settings", "slides", "prefs", "policies", "associations", "letterheads", "versions", "vindex",
    "hrTemplates", "hrHeads", "hrMeta", "hrLetters", "requests", "delegations", "tasks", "taskFiles", "taskProjects",
    "initiatives", "forms", "uploads"];
  const SUBS = { hrLetters: ["versions"], tasks: ["activity", "comments"], forms: ["responses"] };
  const PERSONAL = ["lifeGoals", "lifeHabits", "lifeNotes", "lifeReviews"];
  const plain = v => JSON.parse(JSON.stringify(v, (k, x) => x && typeof x.toDate === "function" ? x.toDate().toISOString() : x));

  async function run(){
    if (!db) return;
    const btn = $("bkAll"), st = $("bkAllState"); btn.disabled = true;
    const out = { app: (window.siteSettings && siteSettings.siteName) || "", exportedAt: new Date().toISOString(), by: me, collections: {}, skipped: [] };
    let n = 0;
    try {
      for (const col of SHARED){
        st.textContent = `جارٍ قراءة ${col}…`;
        let list = [];
        try {
          if (col === "tasks"){ // personal tasks of others are not readable, so the task queries are the allowed ones
            const c = db.collection("tasks"), seen = new Map();
            for (const q of [c.where("owner", "==", me), c.where("assignee", "==", me), c.where("scope", "==", "work")]){ try { (await q.get()).docs.forEach(d => seen.set(d.id, d)); } catch {} }
            list = [...seen.values()];
          } else list = (await db.collection(col).get()).docs;
        } catch { out.skipped.push(col); continue; }
        const docs = {};
        for (const d of list){
          docs[d.id] = plain(d.data()); n++;
          for (const sub of SUBS[col] || []){ try { const s = await db.collection(col).doc(d.id).collection(sub).get(); if (s.docs.length){ docs[d.id]["__" + sub] = Object.fromEntries(s.docs.map(x => [x.id, plain(x.data())])); n += s.docs.length; } } catch {} }
        }
        out.collections[col] = docs;
      }
      for (const col of PERSONAL){
        try { const s = await db.collection(col).where("owner", "==", me).get(); out.collections[col] = Object.fromEntries(s.docs.map(x => [x.id, plain(x.data())])); n += s.docs.length; } catch { out.skipped.push(col); }
      }
      out.count = n;
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }));
      a.download = `backup-${new Date().toLocaleDateString("en-CA")}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      st.textContent = `نزلت نسخة فيها ${n.toLocaleString("en")} سجلاً${out.skipped.length ? ` (لم تُقرأ: ${out.skipped.join("، ")})` : ""}.`;
    } catch (e){ console.error(e); st.textContent = "تعذّر إعداد النسخة الاحتياطية."; }
    finally { btn.disabled = false; }
  }
  $("bkAll") && $("bkAll").addEventListener("click", run);

  /* ---------- safe restore: read the file, show what is in it, then add only the records that are missing ---------- */
  let plan = null;
  $("bkFileAll") && $("bkFileAll").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f || !db) return;
    const st = $("bkCheck"), box = $("bkPlan"); box.hidden = true; plan = null;
    let j; try { j = JSON.parse(await f.text()); } catch { st.textContent = "الملف ليس JSON صالحاً."; return; }
    if (!j || typeof j.collections !== "object"){ st.textContent = "هذا ليس ملف نسخة احتياطية شاملة من الموقع."; return; }
    st.textContent = "جارٍ مقارنة الملف بالبيانات الحالية…";
    const rows = [];
    for (const [col, docs] of Object.entries(j.collections)){
      if (!SHARED.includes(col) && !PERSONAL.includes(col)) continue;
      const ids = Object.keys(docs || {}); let missing = [];
      for (const id of ids){
        if (PERSONAL.includes(col) && (docs[id] || {}).owner !== me) continue;
        try { const d = await db.collection(col).doc(id).get(); if (!d.exists) missing.push(id); } catch { /* not readable: left alone */ }
      }
      rows.push({ col, total: ids.length, missing });
    }
    plan = { j, rows };
    const n = rows.reduce((s, r) => s + r.missing.length, 0);
    st.textContent = `نسخة بتاريخ ${String(j.exportedAt || "").slice(0, 10)} · ${n} سجلاً مفقوداً يمكن إضافته.`;
    box.innerHTML = `<table class="bk-t"><thead><tr><th>المجموعة</th><th>في الملف</th><th>مفقود الآن</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.col}</td><td>${r.total}</td><td>${r.missing.length || "—"}</td></tr>`).join("")}</tbody></table>
      ${n ? `<div class="hr-actions"><button class="btn primary" type="button" id="bkGo">إضافة ${n} سجلاً مفقوداً</button></div>` : '<p class="muted-text">لا شيء مفقود: بياناتك الحالية تشمل كل ما في الملف.</p>'}`;
    box.hidden = false;
    const go = $("bkGo"); if (go) go.addEventListener("click", restore);
  });
  async function restore(){
    if (!plan) return;
    const n = plan.rows.reduce((s, r) => s + r.missing.length, 0);
    if (!(await UI.confirm(`إضافة ${n} سجلاً مفقوداً من النسخة؟ لن يُعدَّل أو يُحذف أي سجل موجود.`, { ok: "إضافة" }))) return;
    const st = $("bkCheck"); let ok = 0, failed = 0;
    for (const r of plan.rows){
      for (const id of r.missing){
        const raw = { ...plan.j.collections[r.col][id] }, subs = {};
        Object.keys(raw).filter(k => k.startsWith("__")).forEach(k => { subs[k.slice(2)] = raw[k]; delete raw[k]; });
        try {
          const ref = db.collection(r.col).doc(id);
          const again = await ref.get(); if (again.exists) continue;
          await ref.set(raw); ok++;
          for (const [sub, docs] of Object.entries(subs)) for (const [sid, sd] of Object.entries(docs || {})){ try { await ref.collection(sub).doc(sid).set(sd); } catch { failed++; } }
        } catch (e){ console.error(r.col, id, e); failed++; }
        st.textContent = `أُضيف ${ok}…`;
      }
    }
    st.textContent = `اكتملت الاستعادة: أُضيف ${ok} سجلاً${failed ? `، وتعذّر ${failed} (غالباً لا تسمح به الصلاحيات)` : ""}.`;
    $("bkPlan").hidden = true; plan = null; UI.toast("اكتملت الاستعادة");
  }
  window.addEventListener("app:db", e => { db = e.detail.db; me = (e.detail.user && e.detail.user.email) || ""; });
  if (window.appDb){ db = window.appDb; me = (window.appUser && window.appUser.email) || ""; }
})();
