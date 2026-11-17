/* Uploaded fonts (التمكين التقني ← الخطوط): font files stored in Firestore in base64 chunks, so licensed fonts stay
   private to signed-in, allowed users and never sit in the public repo.
   fonts/{id}: { family, weight, style, fileName, size, n, createdAt }   fontChunks/{id}_{i}: { font, i, data }
   Once loaded, each font is registered with the page (so the interface can use it) and handed to the library
   through the "app:fonts" event (preview, Word embedding, and the document font picker). */
(() => {
  const $ = id => document.getElementById(id);
  const CHUNK = 700000;
  const MAX = 4 * 1024 * 1024;
  let db = null, metas = [], loaded = new Map(); // id -> { ...meta, buf }

  /* ---------- read family and weight from the font's own tables ---------- */
  function fontInfo(buf, fileName){
    const base = fileName.replace(/\.[^.]+$/, "");
    const guessW = /thin|hairline/i.test(base) ? 100 : /ultra ?light|extra ?light/i.test(base) ? 200 : /light/i.test(base) ? 300
      : /medium/i.test(base) ? 500 : /semi ?bold|demi/i.test(base) ? 600 : /extra ?bold|heavy/i.test(base) ? 800 : /black/i.test(base) ? 900 : /bold/i.test(base) ? 700 : 400;
    const out = { family: base.replace(/[-_](thin|light|ultralight|extralight|regular|medium|semibold|bold|extrabold|heavy|black|italic)$/i, ""), weight: guessW };
    try {
      const v = new DataView(buf);
      const tag = String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3));
      if (tag === "wOFF" || tag === "wOF2") return out; // compressed web fonts: keep the guess from the file name
      const n = v.getUint16(4); let nameOff = 0, os2Off = 0;
      for (let i = 0; i < n; i++){
        const r = 12 + i * 16;
        const t = String.fromCharCode(v.getUint8(r), v.getUint8(r + 1), v.getUint8(r + 2), v.getUint8(r + 3));
        if (t === "name") nameOff = v.getUint32(r + 8);
        if (t === "OS/2") os2Off = v.getUint32(r + 8);
      }
      if (os2Off){ const w = v.getUint16(os2Off + 4); if (w >= 100 && w <= 950) out.weight = Math.round(w / 50) * 50; }
      if (nameOff){
        const count = v.getUint16(nameOff + 2), strOff = nameOff + v.getUint16(nameOff + 4);
        const names = {};
        for (let i = 0; i < count; i++){
          const r = nameOff + 6 + i * 12;
          const plat = v.getUint16(r), lang = v.getUint16(r + 4), id = v.getUint16(r + 6), len = v.getUint16(r + 8), off = v.getUint16(r + 10);
          if (plat !== 3 || (id !== 1 && id !== 16)) continue;
          if (names[id] && lang !== 0x409) continue;
          let s = ""; for (let k = 0; k < len; k += 2) s += String.fromCharCode(v.getUint16(strOff + off + k));
          names[id] = s;
        }
        // name ID 1 is the family Word lists (e.g. "DIN Next LT Arabic Medium"); 16 is the typographic family
        if (names[1]) out.family = names[1]; else if (names[16]) out.family = names[16];
      }
    } catch (e){ console.warn("font info", e); }
    return out;
  }

  /* ---------- base64 in and out ---------- */
  function toB64(buf){
    const b = new Uint8Array(buf); let s = "";
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromB64(s){ const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b.buffer; }

  /* ---------- load into the page ---------- */
  async function loadOne(m){
    let b64 = "";
    for (let i = 0; i < m.n; i++){
      const c = await db.collection("fontChunks").doc(`${m.id}_${i}`).get();
      if (!c.exists) throw new Error("missing chunk");
      b64 += c.data().data;
    }
    const buf = fromB64(b64);
    try { const ff = new FontFace(m.family, buf, { weight: String(m.weight), style: m.style || "normal" }); await ff.load(); document.fonts.add(ff); }
    catch (e){ console.warn("font face", m.fileName, e); }
    loaded.set(m.id, { ...m, buf });
  }
  async function sync(){
    const want = new Set(metas.map(m => m.id));
    const todo = metas.filter(m => !loaded.has(m.id));
    for (const m of todo){ try { await loadOne(m); } catch (e){ console.error("font load", m.fileName, e); } }
    for (const id of [...loaded.keys()]) if (!want.has(id)) loaded.delete(id);
    const list = [...loaded.values()];
    window.appFonts = list;
    window.dispatchEvent(new CustomEvent("app:fonts", { detail: list }));
    renderAdmin(); fillFontSelect();
  }

  /* ---------- التمكين التقني: list, upload, delete ---------- */
  const W = { 100: "رفيع", 200: "خفيف جداً", 300: "خفيف", 400: "عادي", 500: "متوسط", 600: "شبه غامق", 700: "غامق", 800: "غامق جداً", 900: "أسود" };
  const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB";
  function msg(t, kind){ const el = $("fMsg"); if (!el) return; el.textContent = t || ""; el.className = "s-msg" + (kind ? " " + kind : ""); }
  function renderAdmin(){
    const list = $("fList"); if (!list) return;
    list.innerHTML = "";
    $("fUpload").hidden = !db; $("fSignin").hidden = !!db;
    const rows = metas.slice().sort((a, b) => a.family.localeCompare(b.family) || a.weight - b.weight);
    $("fEmpty").hidden = !db || rows.length > 0;
    rows.forEach(m => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="f-sample"></span><span class="f-meta"><span class="f-name"></span><bdi class="f-file mono"></bdi></span><span class="f-state"></span><button class="btn small ghost" type="button">حذف</button>`;
      const ready = loaded.has(m.id);
      li.querySelector(".f-sample").textContent = "أبجد";
      li.querySelector(".f-sample").style.cssText = `font-family:"${m.family}";font-weight:${m.weight}`;
      li.querySelector(".f-name").textContent = `${m.family} · ${W[m.weight] || m.weight}`;
      li.querySelector(".f-file").textContent = `${m.fileName} · ${kb(m.size)}`;
      li.querySelector(".f-state").textContent = ready ? "" : "جارٍ التحميل…";
      li.querySelector("button").addEventListener("click", () => remove(m));
      list.append(li);
    });
  }
  function fillFontSelect(){
    const sel = $("sFont"); if (!sel) return;
    let g = sel.querySelector("optgroup[data-up]");
    const fams = [...new Set(metas.map(m => m.family))].sort();
    if (!fams.length){ if (g) g.remove(); return; }
    if (!g){ g = document.createElement("optgroup"); g.label = "خطوط مرفوعة"; g.dataset.up = "1"; sel.append(g); }
    g.innerHTML = "";
    fams.forEach(f => g.append(new Option(f, f)));
    if (window.siteSettings) sel.value = window.siteSettings.font;
  }
  async function upload(files){
    if (!db) return;
    for (const f of files){
      if (!/\.(ttf|otf|woff2?)$/i.test(f.name)){ msg(`«${f.name}» ليس ملف خط (ttf أو otf أو woff)`, "err"); continue; }
      if (f.size > MAX){ msg(`«${f.name}» أكبر من 4MB`, "err"); continue; }
      msg(`جارٍ رفع ${f.name}…`);
      try {
        const buf = await f.arrayBuffer();
        const info = fontInfo(buf, f.name);
        const old = metas.find(m => m.fileName === f.name);
        const id = old ? old.id : "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const b64 = toB64(buf); const n = Math.ceil(b64.length / CHUNK);
        for (let i = 0; i < n; i++) await db.collection("fontChunks").doc(`${id}_${i}`).set({ font: id, i, data: b64.slice(i * CHUNK, (i + 1) * CHUNK) });
        if (old) for (let i = n; i < old.n; i++) await db.collection("fontChunks").doc(`${id}_${i}`).delete().catch(() => {});
        loaded.delete(id);
        await db.collection("fonts").doc(id).set({ family: info.family, weight: info.weight, style: "normal", fileName: f.name, size: f.size, n, createdAt: new Date().toISOString() });
        msg(`أُضيف «${info.family}» (${W[info.weight] || info.weight})`, "ok");
      } catch (e){ console.error(e); msg(`تعذّر رفع «${f.name}»`, "err"); }
    }
  }
  async function remove(m){
    if (!confirm(`حذف الخط «${m.family}» (${m.fileName})؟`)) return;
    try {
      await db.collection("fonts").doc(m.id).delete();
      for (let i = 0; i < m.n; i++) await db.collection("fontChunks").doc(`${m.id}_${i}`).delete().catch(() => {});
      msg("حُذف الخط", "ok");
    } catch (e){ console.error(e); msg("تعذّر الحذف", "err"); }
  }
  const inp = $("fFiles");
  if (inp) inp.addEventListener("change", e => { const fs = [...e.target.files]; e.target.value = ""; upload(fs); });
  const drop = $("fUpload");
  if (drop){
    drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); upload([...e.dataTransfer.files]); });
  }

  function connect(d){
    if (db) return;
    db = d;
    db.collection("fonts").onSnapshot(snap => { metas = snap.docs.map(x => ({ id: x.id, ...x.data() })); renderAdmin(); sync(); },
      e => { console.error(e); msg("تعذّر تحميل قائمة الخطوط", "err"); });
    renderAdmin();
  }
  renderAdmin();
  if (window.appDb) connect(window.appDb);
  window.addEventListener("app:db", e => connect(e.detail.db));
})();
