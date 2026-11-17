/* التمكين التقني: edit the site's identity, colors, fonts and layout, and manage who can sign in.
   Settings: Firestore settings/site (any allowed user). People: Firestore allowed/{email} (admins only, see firestore.rules). */
(() => {
  const $ = id => document.getElementById(id);
  const S = window.SiteSettings;
  const PRESETS = [
    ["بنفسجي نيون", "#7c3aed", "#c026d3"],
    ["أزرق ليلي", "#2563eb", "#7c3aed"],
    ["أخضر رسمي", "#0f766e", "#15803d"],
    ["فيروزي", "#0891b2", "#0d9488"],
    ["برتقالي", "#ea580c", "#db2777"],
    ["عنابي", "#9f1239", "#be185d"],
    ["رمادي فحمي", "#334155", "#0f172a"],
  ];
  let db = null, saved = S.merge(window.siteSettings), draft = S.merge(saved), dirty = false, myEmail = "";

  /* ---------- brand, title and home cards follow the settings everywhere ---------- */
  function isDarkish(){
    const t = document.documentElement.getAttribute("data-theme");
    return t ? t !== "light" : matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function renderBrand(s){
    const img = document.querySelector(".brand .logo-img"), name = document.querySelector(".brand .brand-name");
    if (!img || !name) return;
    const src = (isDarkish() && s.logoDark) || s.logo || "";
    img.hidden = !src; if (src) img.src = src;
    img.style.height = s.logoSize + "px";
    name.textContent = s.siteName;
    name.hidden = !!src && !s.showName;
    document.querySelectorAll(".prayer-card").forEach(c => { c.hidden = !s.home.prayer; });
    document.querySelectorAll(".tasks-card").forEach(c => { c.hidden = !s.home.tasks; });
  }
  window.addEventListener("app:settings", e => renderBrand(e.detail));
  new MutationObserver(() => renderBrand(window.siteSettings)).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  renderBrand(window.siteSettings);

  /* ---------- form ---------- */
  function fill(){
    const s = draft;
    $("sName").value = s.siteName; $("sShowName").checked = s.showName;
    $("sLogoSize").value = s.logoSize; $("sLogoSizeV").textContent = s.logoSize + "px";
    showLogo("sLogoPrev", s.logo); showLogo("sLogoDarkPrev", s.logoDark);
    $("sA1").value = s.a1; $("sA2").value = s.a2;
    $("sA1v").textContent = s.a1; $("sA2v").textContent = s.a2;
    document.querySelectorAll("#sPresets button").forEach(b => b.setAttribute("aria-pressed", b.dataset.a1 === s.a1 && b.dataset.a2 === s.a2 ? "true" : "false"));
    $("sFont").value = s.font; $("sFontSize").value = String(s.fontSize);
    document.querySelectorAll("input[name=sRadius]").forEach(r => { r.checked = r.value === s.radius; });
    $("sTheme").value = s.theme; $("sStart").value = s.startPage; if (!$("sStart").value) $("sStart").value = "home";
    $("sHomePrayer").checked = s.home.prayer; $("sHomeTasks").checked = s.home.tasks;
    $("sState").textContent = dirty ? "تغييرات غير محفوظة" : "";
    $("sSave").disabled = !dirty || !db;
  }
  function showLogo(id, src){
    const box = $(id); box.innerHTML = "";
    if (src){ const i = document.createElement("img"); i.src = src; i.alt = ""; box.append(i); }
    else box.innerHTML = '<span class="muted-text">بدون شعار</span>';
    box.nextElementSibling.querySelector("[data-clear]").hidden = !src;
  }
  function change(patch){
    draft = S.merge({ ...draft, ...patch, home: { ...draft.home, ...(patch.home || {}) } });
    dirty = JSON.stringify(draft) !== JSON.stringify(saved);
    if ("theme" in patch){ try { localStorage.removeItem("app-theme"); localStorage.removeItem("assoc-policies-theme"); } catch {} }
    S.apply(draft); fill();
  }
  function build(){
    $("sPresets").innerHTML = "";
    PRESETS.forEach(([label, a1, a2]) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "preset"; b.dataset.a1 = a1; b.dataset.a2 = a2;
      b.innerHTML = `<span class="sw" style="background:linear-gradient(135deg,${a1},${a2})"></span><span></span>`;
      b.lastChild.textContent = label;
      b.addEventListener("click", () => change({ a1, a2 }));
      $("sPresets").append(b);
    });
    Object.keys(S.FONTS).forEach(f => $("sFont").append(new Option(f, f)));
    $("sName").addEventListener("input", e => change({ siteName: e.target.value.trim() || S.DEFAULTS.siteName }));
    $("sShowName").addEventListener("change", e => change({ showName: e.target.checked }));
    $("sLogoSize").addEventListener("input", e => change({ logoSize: +e.target.value }));
    $("sA1").addEventListener("input", e => change({ a1: e.target.value }));
    $("sA2").addEventListener("input", e => change({ a2: e.target.value }));
    $("sFont").addEventListener("change", e => change({ font: e.target.value }));
    $("sFontSize").addEventListener("change", e => change({ fontSize: +e.target.value }));
    document.querySelectorAll("input[name=sRadius]").forEach(r => r.addEventListener("change", () => change({ radius: r.value })));
    $("sTheme").addEventListener("change", e => change({ theme: e.target.value }));
    $("sStart").addEventListener("change", e => change({ startPage: e.target.value }));
    $("sHomePrayer").addEventListener("change", e => change({ home: { prayer: e.target.checked } }));
    $("sHomeTasks").addEventListener("change", e => change({ home: { tasks: e.target.checked } }));
    [["sLogoFile", "logo"], ["sLogoDarkFile", "logoDark"]].forEach(([inp, key]) => {
      $(inp).addEventListener("change", async e => {
        const f = e.target.files[0]; e.target.value = ""; if (!f) return;
        try { change({ [key]: await logoData(f) }); setMsg(""); }
        catch (err){ setMsg(err.message === "too_big" ? "الشعار كبير. استخدم ملفاً أصغر من 300KB أو صورة PNG أصغر" : "تعذّرت قراءة الصورة", "err"); }
      });
    });
    document.querySelectorAll("[data-clear]").forEach(b => b.addEventListener("click", () => change({ [b.dataset.clear]: "" })));
    $("sSave").addEventListener("click", save);
    $("sUndo").addEventListener("click", () => { draft = S.merge(saved); dirty = false; S.apply(draft); fill(); });
    $("sReset").addEventListener("click", () => { if (confirm("إرجاع الهوية والألوان والخطوط والواجهة إلى الإعدادات الأصلية؟ لن يُحفظ شيء حتى تضغط «حفظ التغييرات».")) change({ ...S.DEFAULTS }); });
    $("uAdd").addEventListener("submit", addUser);
  }
  function setMsg(t, kind){ $("sMsg").textContent = t || ""; $("sMsg").className = "s-msg" + (kind ? " " + kind : ""); }

  /* logos: SVG kept as is; other images scaled to at most 512px and stored as PNG */
  function readAs(f, how){ return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r[how](f); }); }
  async function logoData(f){
    if (f.type === "image/svg+xml"){
      if (f.size > 300000) throw new Error("too_big");
      const txt = await readAs(f, "readAsText");
      const clean = window.DOMPurify ? DOMPurify.sanitize(txt, { USE_PROFILES: { svg: true, svgFilters: true } }) : txt;
      return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(clean)));
    }
    const url = await readAs(f, "readAsDataURL");
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 512 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL("image/png");
    if (out.length > 400000) throw new Error("too_big");
    return out;
  }

  async function save(){
    if (!db) return;
    const btn = $("sSave"); btn.disabled = true; setMsg("جارٍ الحفظ…");
    try {
      await db.collection("settings").doc("site").set({ ...draft, updatedAt: new Date().toISOString(), updatedBy: myEmail });
      saved = S.merge(draft); dirty = false; S.cache(saved); setMsg("حُفظت الإعدادات وطُبّقت على الموقع", "ok");
    } catch (e){ console.error(e); setMsg(e && e.code === "permission-denied" ? "لا تملك صلاحية حفظ الإعدادات" : "تعذّر الحفظ. حاول مرة أخرى", "err"); }
    fill();
  }

  /* ---------- people and roles ---------- */
  let people = [];
  function renderPeople(){
    const body = $("uList"); body.innerHTML = "";
    people.sort((a, b) => (b.role === "admin") - (a.role === "admin") || a.id.localeCompare(b.id));
    people.forEach(p => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><bdi class="u-mail"></bdi><span class="u-name"></span></td><td><select class="select u-role" aria-label="الدور"><option value="admin">مدير</option><option value="member">مستخدم</option></select></td><td class="u-act"><button class="btn small ghost" type="button">إزالة</button></td>`;
      tr.querySelector(".u-mail").textContent = p.id;
      tr.querySelector(".u-name").textContent = p.name || "";
      const sel = tr.querySelector("select"); sel.value = p.role === "admin" ? "admin" : "member";
      const me = p.id === myEmail;
      sel.disabled = me; tr.querySelector("button").disabled = me;
      if (me) tr.querySelector(".u-act").innerHTML = '<span class="muted-text">أنت</span>';
      sel.addEventListener("change", () => db.collection("allowed").doc(p.id).update({ role: sel.value }).catch(err => { console.error(err); uMsg("تعذّر تغيير الدور", "err"); }));
      const rm = tr.querySelector("button");
      if (rm && !me) rm.addEventListener("click", () => {
        if (!confirm(`إزالة ${p.id}؟ لن يتمكن من فتح الموقع بعدها.`)) return;
        db.collection("allowed").doc(p.id).delete().catch(err => { console.error(err); uMsg("تعذّرت الإزالة", "err"); });
      });
      body.append(tr);
    });
  }
  function uMsg(t, kind){ $("uMsg").textContent = t || ""; $("uMsg").className = "s-msg" + (kind ? " " + kind : ""); }
  async function addUser(e){
    e.preventDefault();
    const email = $("uEmail").value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ uMsg("اكتب بريداً صحيحاً", "err"); return; }
    try {
      await db.collection("allowed").doc(email).set({ name: $("uName").value.trim(), role: $("uRole").value, addedAt: new Date().toISOString(), addedBy: myEmail });
      $("uEmail").value = ""; $("uName").value = ""; uMsg("أُضيف. يقدر يسجّل الدخول الآن بحساب قوقل هذا", "ok");
    } catch (err){ console.error(err); uMsg(err && err.code === "permission-denied" ? "تحتاج صلاحية مدير لإضافة أشخاص" : "تعذّرت الإضافة", "err"); }
  }
  function watchPeople(){
    db.collection("allowed").onSnapshot(snap => {
      people = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      $("uNoAdmin").hidden = true; $("uBox").hidden = false; renderPeople();
    }, err => {
      console.error(err);
      $("uBox").hidden = true; $("uNoAdmin").hidden = false;
    });
  }

  /* ---------- connect ---------- */
  function connect(detail){
    if (db) return;
    db = detail.db; myEmail = ((detail.user && detail.user.email) || "").toLowerCase();
    $("sSignin").hidden = true; $("uSignin").hidden = true;
    db.collection("settings").doc("site").onSnapshot(d => {
      if (!d.exists) return;
      const s = S.merge(d.data()); S.cache(s);
      saved = s;
      if (!dirty){ draft = S.merge(s); S.apply(draft); }
      fill();
    }, e => console.error(e));
    watchPeople();
    fill();
  }
  build(); fill();
  if (window.appDb && window.appUser) connect({ db: window.appDb, user: window.appUser });
  window.addEventListener("app:db", e => connect(e.detail));
})();
