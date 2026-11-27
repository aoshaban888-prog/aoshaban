/* Cloudinary: files attached in the site go to the admin's Cloudinary account with an unsigned upload preset.
   The account name, preset and folder live in Firestore settings/cloudinary (admins set them under التمكين التقني › الربط).
   window.Cloud.ready()                                   → true once an account is set
   window.Cloud.upload(file, { folder, onProgress })      → Promise<{ url, publicId, name, size, type, format }>
   Unsigned uploads cannot delete: removing an attachment only removes its link in the site.
   Every upload is listed in Firestore "uploads" (name, link, area, who, when), shown under التمكين التقني › الربط.
   Files picked anywhere else in the site (logos, slider images, letterheads, policy files, backups) are also copied there,
   except the signature and stamp images and font files, which stay inside the site. */
(() => {
  const $ = id => document.getElementById(id);
  const MAX = 10 * 1024 * 1024; // the free plan's limit for images and documents
  let cfg = { cloudName: "", preset: "", folder: "" }, db = null, me = "", admin = false, unsub = null, unsubUp = null, uploads = [];
  const AREAS = { associations: "الجمعيات", tasks: "المهام", initiatives: "وثائق المبادرات", branding: "الشعار", slider: "السلايدر", letterheads: "الكليشات", policies: "اللوائح والسياسات", backups: "النسخ الاحتياطية", test: "تجربة", other: "أخرى" };
  // which area a file input belongs to; inputs not listed here are copied as «other»
  const INPUT_AREA = { bkFile: "backups", lhFile: "letterheads", hdBg: "letterheads", hdFrame: "letterheads", sLogoFile: "branding", sLogoDarkFile: "branding", slImg: "slider", pfFiles: "policies" };
  // handled by their own pages (tdFile, anPick) or kept inside the site on purpose (signature, stamp, licensed fonts)
  const SKIP = new Set(["tdFile", "anPick", "hrSigFile", "hrStampFile", "fFiles", "asLogoFile", "asLhFile", "asAttFile"]);

  const ready = () => !!(cfg.cloudName && cfg.preset);
  window.addEventListener("app:db", () => { signedOff = /^(localhost|127\.)/.test(location.hostname) || location.protocol === "file:"; });
  // signed uploads: the server signs each upload (api/cloud-sign) once its keys are set in Vercel; until then the unsigned preset
  let signedOff = /^(localhost|127\.)/.test(location.hostname) || location.protocol === "file:";
  async function signFor(dir){
    if (signedOff || !window.appUser || !window.appUser.getIdToken) return null;
    try {
      const r = await fetch("/api/cloud-sign", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + await window.appUser.getIdToken() }, body: JSON.stringify({ folder: dir }) });
      if (r.status === 501 || r.status === 404){ signedOff = true; return null; }
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }
  // the kinds of files the site accepts (anything else is refused before it leaves the device)
  const BLOCKED = /\.(exe|bat|cmd|com|msi|scr|js|vbs|ps1|sh|jar|apk|dll|html?|svgz?)$/i;
  function upload(file, { folder = "", onProgress } = {}){
    return new Promise(async (resolve, reject) => {
      if (!ready()) return reject(new Error("not_configured"));
      if (file.size > MAX) return reject(new Error("too_big"));
      if (BLOCKED.test(file.name || "")) return reject(new Error("bad_type"));
      const fd = new FormData();
      const dir = [cfg.folder, folder].filter(Boolean).join("/");
      const sig = await signFor(dir);
      fd.append("file", file);
      if (sig){ fd.append("api_key", sig.apiKey); fd.append("timestamp", sig.timestamp); fd.append("signature", sig.signature); if (sig.folder) fd.append("folder", sig.folder); }
      else { fd.append("upload_preset", cfg.preset); if (dir) fd.append("folder", dir); }
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `https://api.cloudinary.com/v1_1/${encodeURIComponent(sig ? sig.cloudName : cfg.cloudName)}/auto/upload`);
      xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)); };
      xhr.onload = () => {
        let j = {}; try { j = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status >= 200 && xhr.status < 300 && j.secure_url){
          const r = { url: j.secure_url, publicId: j.public_id, name: file.name, size: j.bytes || file.size, type: file.type || "", format: j.format || "" };
          if (db && me) db.collection("uploads").add({ name: String(file.name || "ملف").slice(0, 200), url: r.url, publicId: r.publicId || "", size: r.size || 0, type: r.type, area: folder || "other", by: me, at: new Date().toISOString() }).catch(e => console.error(e));
          resolve(r);
        }
        else reject(new Error((j.error && j.error.message) || "upload_failed"));
      };
      xhr.onerror = () => reject(new Error("network"));
      xhr.send(fd);
    });
  }
  const errText = e => ({ not_configured: "رفع الملفات غير مفعّل: اضبط حساب Cloudinary من التمكين التقني › الربط.", too_big: "حجم الملف أكبر من 10 ميجابايت.", bad_type: "نوع الملف غير مسموح لأسباب أمنية (ملفات التشغيل والسكربتات وصفحات الويب).", network: "انقطع الاتصال أثناء الرفع." })[e && e.message] || ("تعذّر رفع الملف: " + ((e && e.message) || ""));
  // what a public page needs to upload (the survey page copies it into the form)
  const config = () => ready() ? { cloudName: cfg.cloudName, preset: cfg.preset, folder: cfg.folder || "" } : null;
  window.Cloud = { ready, upload, errText, MAX, config };

  /* ---------- a copy of every other file picked in the site ---------- */
  function keep(files, area){
    if (!ready() || !db) return;
    [...files].filter(f => f && f.size && f.size <= MAX).forEach(f => upload(f, { folder: area }).catch(e => console.error("cloud copy", e)));
  }
  document.addEventListener("change", e => {
    const el = e.target; if (!(el instanceof HTMLInputElement) || el.type !== "file" || !el.files || !el.files.length || SKIP.has(el.id)) return;
    keep(el.files, INPUT_AREA[el.id] || "other");
  }, true);
  document.addEventListener("drop", e => {
    const files = e.dataTransfer && e.dataTransfer.files; if (!files || !files.length) return;
    const zone = e.target.closest && e.target.closest("label,.f-drop,.drop,[class*=drop],section,form");
    const inp = zone && zone.querySelector('input[type="file"]');
    if (!inp || SKIP.has(inp.id)) return;
    keep(files, INPUT_AREA[inp.id] || "other");
  }, true);

  /* ---------- the list of uploaded files (التمكين التقني › الربط) ---------- */
  const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + " م.ب" : Math.max(1, Math.round(n / 1024)) + " ك.ب";
  function renderUploads(){
    const box = $("cdFiles"); if (!box) return;
    const q = ($("cdQ").value || "").trim(), area = $("cdArea").value;
    const list = uploads.filter(u => (!area || u.area === area) && (!q || (u.name || "").includes(q))).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    $("cdCount").textContent = `${list.length} ملف`;
    box.innerHTML = list.length ? "" : '<p class="muted-text">لا توجد ملفات مرفوعة بعد</p>';
    list.slice(0, 300).forEach(u => {
      const row = document.createElement("div"); row.className = "cd-row";
      row.innerHTML = `<a target="_blank" rel="noopener"></a><span class="cd-area"></span><span class="muted-text cd-meta"></span><button type="button" class="linkbtn">نسخ الرابط</button>`;
      const a = row.querySelector("a"); a.href = u.url; a.textContent = u.name || "ملف";
      row.querySelector(".cd-area").textContent = AREAS[u.area] || u.area || "";
      row.querySelector(".cd-meta").textContent = [u.size ? kb(u.size) : "", (u.by || "").split("@")[0], u.at ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", year: "numeric" }).format(new Date(u.at)) : ""].filter(Boolean).join(" · ");
      row.querySelector("button").addEventListener("click", async () => { try { await navigator.clipboard.writeText(u.url); UI.toast("نُسخ الرابط"); } catch { UI.alert(u.url); } });
      box.append(row);
    });
  }
  $("cdQ") && $("cdQ").addEventListener("input", renderUploads);
  $("cdArea") && $("cdArea").addEventListener("change", renderUploads);
  if ($("cdArea")) Object.entries(AREAS).forEach(([k, label]) => $("cdArea").append(new Option(label, k)));

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
    if (unsub){ unsub(); unsub = null; } if (unsubUp){ unsubUp(); unsubUp = null; }
    db = d; admin = false; me = user ? user.email : ""; uploads = [];
    if (!db){ fill(); return; }
    db.collection("allowed").doc(user.email).get().then(a => {
      admin = a.exists && a.data().role === "admin"; fill();
      if (admin && !unsubUp) unsubUp = db.collection("uploads").onSnapshot(s => { uploads = s.docs.map(x => ({ id: x.id, ...x.data() })); renderUploads(); }, () => {});
    }).catch(() => {});
    unsub = db.collection("settings").doc("cloudinary").onSnapshot(s => { cfg = { cloudName: "", preset: "", folder: "", ...(s.exists ? s.data() : {}) }; fill(); }, () => {});
  }
  window.addEventListener("app:db", e => connect(e.detail));
  if (window.appDb) connect({ db: window.appDb, user: window.appUser });
  fill();
})();
