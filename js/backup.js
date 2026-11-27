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
        let snap; try { snap = await db.collection(col).get(); } catch { out.skipped.push(col); continue; }
        const docs = {};
        for (const d of snap.docs){
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
  window.addEventListener("app:db", e => { db = e.detail.db; me = (e.detail.user && e.detail.user.email) || ""; });
  if (window.appDb){ db = window.appDb; me = (window.appUser && window.appUser.email) || ""; }
})();
