/* Cloudinary: files attached in the site go to the admin's Cloudinary account with an unsigned upload preset.
   The account name, preset and folder live in Firestore settings/cloudinary (admins set them under التمكين التقني › الربط).
   window.Cloud.ready()                                   → true once an account is set
   window.Cloud.upload(file, { folder, onProgress })      → Promise<{ url, publicId, name, size, type, format }>
   Unsigned uploads cannot delete: removing an attachment only removes its link in the site. */
(() => {
  const $ = id => document.getElementById(id);
  const MAX = 10 * 1024 * 1024; // the free plan's limit for images and documents
  let cfg = { cloudName: "", preset: "", folder: "" }, db = null, admin = false, unsub = null;

  const ready = () => !!(cfg.cloudName && cfg.preset);
  function upload(file, { folder = "", onProgress } = {}){
    return new Promise((resolve, reject) => {
      if (!ready()) return reject(new Error("not_configured"));
      if (file.size > MAX) return reject(new Error("too_big"));
      const fd = new FormData();
      fd.append("file", file); fd.append("upload_preset", cfg.preset);
      const dir = [cfg.folder, folder].filter(Boolean).join("/"); if (dir) fd.append("folder", dir);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/auto/upload`);
      xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)); };
      xhr.onload = () => {
        let j = {}; try { j = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status >= 200 && xhr.status < 300 && j.secure_url) resolve({ url: j.secure_url, publicId: j.public_id, name: file.name, size: j.bytes || file.size, type: file.type || "", format: j.format || "" });
        else reject(new Error((j.error && j.error.message) || "upload_failed"));
      };
      xhr.onerror = () => reject(new Error("network"));
      xhr.send(fd);
    });
  }
  const errText = e => ({ not_configured: "رفع الملفات غير مفعّل: اضبط حساب Cloudinary من التمكين التقني › الربط.", too_big: "حجم الملف أكبر من 10 ميجابايت.", network: "انقطع الاتصال أثناء الرفع." })[e && e.message] || ("تعذّر رفع الملف: " + ((e && e.message) || ""));
  window.Cloud = { ready, upload, errText, MAX };

  /* ---------- the admin's form (التمكين التقني › الربط) ---------- */
  function fill(){
    if (!$("cdName")) return;
    if (document.activeElement !== $("cdName")) $("cdName").value = cfg.cloudName || "";
    if (document.activeElement !== $("cdPreset")) $("cdPreset").value = cfg.preset || "";
    if (document.activeElement !== $("cdFolder")) $("cdFolder").value = cfg.folder || "";
    $("cdState").textContent = ready() ? "مفعّل: الملفات المرفقة تُرفع إلى Cloudinary." : "غير مفعّل: مرفقات المهام محدودة بـ700 ك.ب، وملفات PDF للتحليل بـ3 ميجابايت.";
    $("cdState").className = "cd-state " + (ready() ? "on" : "");
    $("cdSave").disabled = $("cdTest").disabled = !db || !admin;
  }
  $("cdSave") && $("cdSave").addEventListener("click", async () => {
    const v = { cloudName: $("cdName").value.trim(), preset: $("cdPreset").value.trim(), folder: $("cdFolder").value.trim().replace(/^\/+|\/+$/g, "") };
    if ((v.cloudName && !/^[a-z0-9_-]+$/i.test(v.cloudName)) || (v.preset && !/^[\w-]+$/.test(v.preset))){ UI.alert("اسم الحساب واسم الـpreset يكونان بحروف إنجليزية وأرقام فقط."); return; }
    try { await db.collection("settings").doc("cloudinary").set({ ...v, updatedAt: new Date().toISOString() }); UI.toast("حُفظ ربط Cloudinary"); }
    catch (e){ console.error(e); UI.toast("تعذّر الحفظ", "err"); }
  });
  $("cdTest") && $("cdTest").addEventListener("click", async () => {
    const keep = cfg; cfg = { cloudName: $("cdName").value.trim(), preset: $("cdPreset").value.trim(), folder: $("cdFolder").value.trim() };
    $("cdTest").disabled = true; $("cdState").textContent = "جارٍ تجربة الرفع…";
    try { const r = await upload(new File(["اختبار ربط الموقع مع Cloudinary"], "test.txt", { type: "text/plain" }), { folder: "test" }); cfg = keep; fill(); UI.alert(`نجح الرفع. رابط الملف التجريبي:\n${r.url}`, { title: "الربط يعمل" }); }
    catch (e){ cfg = keep; fill(); UI.alert(errText(e) + "\nتأكد من اسم الحساب، ومن أن الـpreset من نوع Unsigned.", { title: "تعذّر الرفع" }); }
  });

  function connect({ db: d, user }){
    if (unsub){ unsub(); unsub = null; }
    db = d; admin = false;
    if (!db){ fill(); return; }
    db.collection("allowed").doc(user.email).get().then(a => { admin = a.exists && a.data().role === "admin"; fill(); }).catch(() => {});
    unsub = db.collection("settings").doc("cloudinary").onSnapshot(s => { cfg = { cloudName: "", preset: "", folder: "", ...(s.exists ? s.data() : {}) }; fill(); }, () => {});
  }
  window.addEventListener("app:db", e => connect(e.detail));
  if (window.appDb) connect({ db: window.appDb, user: window.appUser });
  fill();
})();
