/* Home slider: slides managed from التمكين التقني ← السلايدر.
   Firestore slides/{id}: { title, text, image (data URL), link, linkLabel, order, active }
   Autoplays (interval from settings.sliderSeconds), pauses on hover, focus or a hidden tab, swipes on touch,
   and stays still for people who ask for reduced motion. */
(() => {
  const $ = id => document.getElementById(id);
  let db = null, slides = [], idx = 0, timer = null, paused = false, editing = null, pendingImage = null;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const seconds = () => Math.max(3, +(window.siteSettings && window.siteSettings.sliderSeconds) || 6);
  // built-in slides (original illustrations in img/slides) show until the admin adds their own
  const READY = [
    { image: "img/slides/governance.svg", title: "حوكمة واضحة، وقرارات أسرع", text: "اللوائح والسياسات في مكتبة وحدة، بإصداراتها ومواعيد مراجعتها.", link: "#/governance/library", linkLabel: "فتح المكتبة" },
    { image: "img/slides/letters.svg", title: "خطابات رسمية بخطوات أقل", text: "اختر القالب، عبّئ الخانات، والخطاب جاهز بالكليشة والرقم والختم.", link: "#/hr/letters", linkLabel: "خطاب جديد" },
    { image: "img/slides/approvals.svg", title: "مسار اعتماد واضح لكل طلب", text: "من مقدّم الطلب إلى المدير المباشر ثم الإدارة التنفيذية، وكل خطوة مسجّلة.", link: "#/hr/requests", linkLabel: "الطلبات" },
    { image: "img/slides/tasks.svg", title: "مهامك في مكان واحد", text: "لوحة وقائمة، بمواعيد استحقاق وتنبيه للمتأخر.", link: "#/tasks", linkLabel: "المهام" },
  ];
  const shown = () => { const own = slides.filter(s => s.active !== false); return own.length || slides.length ? own : READY; };

  /* ---------- home ---------- */
  // the person's own choice: paused, or hidden (a small button brings it back)
  let pref = {}; try { pref = JSON.parse(localStorage.getItem("app-slider-pref") || "{}"); } catch {}
  const savePref = () => { try { localStorage.setItem("app-slider-pref", JSON.stringify(pref)); } catch {} };
  function renderHome(){
    const box = $("slider"); if (!box) return;
    const list = shown();
    const enabled = !window.siteSettings || window.siteSettings.home.slider !== false;
    box.hidden = !enabled || !list.length || !!pref.hidden;
    if ($("slShow")) $("slShow").hidden = !(enabled && list.length && pref.hidden);
    if ($("slPause")){ $("slPause").textContent = pref.paused ? "▶" : "❚❚"; $("slPause").title = pref.paused ? "تشغيل التنقل التلقائي" : "إيقاف التنقل التلقائي"; $("slPause").setAttribute("aria-label", $("slPause").title); $("slPause").hidden = list.length < 2 || reduce.matches; }
    $("sliderEmpty").hidden = true;
    const track = $("slTrack"), dots = $("slDots");
    track.innerHTML = ""; dots.innerHTML = "";
    if (box.hidden) return stop();
    if (idx >= list.length) idx = 0;
    list.forEach((s, i) => {
      const el = document.createElement("div");
      el.className = "sl-slide"; el.setAttribute("role", "group"); el.setAttribute("aria-roledescription", "شريحة");
      el.setAttribute("aria-label", `${i + 1} من ${list.length}`);
      if (s.image) el.style.backgroundImage = `url("${s.image}")`;
      el.innerHTML = `<div class="sl-text"><h2></h2><p></p><a class="sl-btn" hidden></a></div>`;
      el.querySelector("h2").textContent = s.title || "";
      el.querySelector("p").textContent = s.text || "";
      el.querySelector("h2").hidden = !s.title; el.querySelector("p").hidden = !s.text;
      if (s.link){
        const a = el.querySelector(".sl-btn"); a.hidden = false; a.textContent = s.linkLabel || "التفاصيل"; a.href = s.link;
        if (/^https?:/i.test(s.link)){ a.target = "_blank"; a.rel = "noopener"; }
      }
      if (!s.title && !s.text && !s.link) el.querySelector(".sl-text").remove();
      track.append(el);
      const d = document.createElement("button"); d.type = "button"; d.className = "sl-dot"; d.setAttribute("aria-label", `الشريحة ${i + 1}`);
      d.addEventListener("click", () => { go(i); restart(); });
      dots.append(d);
    });
    $("slPrev").hidden = $("slNext").hidden = dots.hidden = list.length < 2;
    go(idx, true); restart();
  }
  function go(i, instant){
    const list = shown(); if (!list.length) return;
    idx = (i + list.length) % list.length;
    const track = $("slTrack");
    track.style.transition = instant || reduce.matches ? "none" : "";
    track.style.transform = `translateX(${idx * 100}%)`; // RTL: the next slide sits to the left
    [...track.children].forEach((el, k) => el.setAttribute("aria-hidden", k === idx ? "false" : "true"));
    [...$("slDots").children].forEach((d, k) => d.setAttribute("aria-current", k === idx ? "true" : "false"));
  }
  function stop(){ clearInterval(timer); timer = null; }
  function restart(){
    stop();
    if (reduce.matches || shown().length < 2 || pref.paused) return;
    timer = setInterval(() => { if (!paused && !document.hidden) go(idx + 1); }, seconds() * 1000);
  }
  $("slPrev").addEventListener("click", () => { go(idx - 1); restart(); });
  if ($("slPause")) $("slPause").addEventListener("click", () => { pref.paused = !pref.paused; savePref(); renderHome(); });
  if ($("slHide")) $("slHide").addEventListener("click", () => { pref.hidden = true; savePref(); renderHome(); UI.toast("أُخفي السلايدر. يمكنك إظهاره من زر «إظهار السلايدر»."); });
  if ($("slShow")) $("slShow").addEventListener("click", () => { pref.hidden = false; savePref(); renderHome(); });
  $("slNext").addEventListener("click", () => { go(idx + 1); restart(); });
  const box = $("slider");
  box.addEventListener("mouseenter", () => { paused = true; });
  box.addEventListener("mouseleave", () => { paused = false; });
  box.addEventListener("focusin", () => { paused = true; });
  box.addEventListener("focusout", () => { paused = false; });
  box.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft"){ go(idx + 1); restart(); }
    if (e.key === "ArrowRight"){ go(idx - 1); restart(); }
  });
  let x0 = null;
  box.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
  box.addEventListener("touchend", e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 40){ go(dx < 0 ? idx + 1 : idx - 1); restart(); }
  });
  window.addEventListener("app:settings", () => renderHome());

  /* ---------- التمكين التقني ← السلايدر ---------- */
  function msg(t, k){ $("slMsg").textContent = t || ""; $("slMsg").className = "s-msg" + (k ? " " + k : ""); }
  function renderAdmin(){
    const ul = $("slList"); if (!ul) return;
    ul.innerHTML = "";
    $("slAdminSignin").hidden = !!db; $("slAdd").hidden = !db;
    $("slAdminEmpty").hidden = !db || slides.length > 0;
    slides.forEach((s, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="sl-thumb"></span><span class="f-meta"><span class="f-name"></span><span class="f-file"></span></span>
        <label class="s-check sl-on"><input type="checkbox"> ظاهرة</label>
        <span class="sl-move"><button class="btn small ghost" type="button" aria-label="تقديم">▲</button><button class="btn small ghost" type="button" aria-label="تأخير">▼</button></span>
        <button class="btn small" type="button">تعديل</button><button class="btn small ghost" type="button">حذف</button>`;
      if (s.image) li.querySelector(".sl-thumb").style.backgroundImage = `url("${s.image}")`;
      li.querySelector(".f-name").textContent = s.title || "شريحة بلا عنوان";
      li.querySelector(".f-file").textContent = s.text || (s.link ? s.link : "");
      const cb = li.querySelector("input"); cb.checked = s.active !== false;
      cb.addEventListener("change", () => db.collection("slides").doc(s.id).update({ active: cb.checked }).catch(console.error));
      const [up, down, ed, del] = li.querySelectorAll("button");
      up.disabled = i === 0; down.disabled = i === slides.length - 1;
      up.addEventListener("click", () => swap(i, i - 1));
      down.addEventListener("click", () => swap(i, i + 1));
      ed.addEventListener("click", () => openEditor(s));
      del.addEventListener("click", async () => { if (await UI.confirm(`حذف الشريحة «${s.title || "بلا عنوان"}»؟`, { ok: "حذف", danger: true })) db.collection("slides").doc(s.id).delete().then(() => UI.toast("حُذفت الشريحة")).catch(() => UI.toast("تعذّر الحذف", "err")); });
      ul.append(li);
    });
  }
  async function swap(a, b){
    const A = slides[a], B = slides[b]; if (!A || !B) return;
    const batch = db.batch();
    batch.update(db.collection("slides").doc(A.id), { order: B.order ?? b });
    batch.update(db.collection("slides").doc(B.id), { order: A.order ?? a });
    await batch.commit().catch(console.error);
  }
  function openEditor(s){
    editing = s || null; pendingImage = null;
    $("slEdHead").textContent = s ? "تعديل الشريحة" : "شريحة جديدة";
    $("slTitle").value = s ? s.title || "" : ""; $("slText").value = s ? s.text || "" : "";
    $("slLink").value = s ? s.link || "" : ""; $("slLinkLabel").value = s ? s.linkLabel || "" : "";
    showImg(s && s.image);
    $("slEditor").hidden = false; $("slTitle").focus(); msg("");
  }
  function showImg(src){
    const p = $("slImgPrev"); p.style.backgroundImage = src ? `url("${src}")` : ""; p.classList.toggle("has", !!src);
  }
  // images are scaled to at most 1600×900 and stored as JPEG so a slide stays well under Firestore's 1MB limit
  async function imageData(f){
    const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 1600 / img.width, 900 / img.height);
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.7, 0.58]){ const out = c.toDataURL("image/jpeg", q); if (out.length < 700000) return out; }
    throw new Error("too_big");
  }
  $("slImg").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try { pendingImage = await imageData(f); showImg(pendingImage); msg(""); }
    catch (err){ msg("تعذّرت قراءة الصورة أو أنها كبيرة جداً", "err"); }
  });
  $("slEdForm").addEventListener("submit", async e => {
    e.preventDefault(); if (!db) return;
    const data = { title: $("slTitle").value.trim(), text: $("slText").value.trim(), link: $("slLink").value.trim(), linkLabel: $("slLinkLabel").value.trim(), updatedAt: new Date().toISOString() };
    if (pendingImage !== null) data.image = pendingImage;
    if (!editing && !data.image && !data.title){ msg("أضف صورة أو عنواناً على الأقل", "err"); return; }
    const btn = e.submitter || $("slEdForm").querySelector("[type=submit]"); btn.disabled = true;
    try {
      if (editing) await db.collection("slides").doc(editing.id).update(data);
      else await db.collection("slides").add({ ...data, image: data.image || "", active: true, order: Date.now() });
      $("slEditor").hidden = true; editing = null; pendingImage = null; msg(""); UI.toast("حُفظت الشريحة");
    } catch (err){ console.error(err); msg("تعذّر الحفظ", "err"); }
    finally { btn.disabled = false; }
  });
  $("slAdd").addEventListener("click", () => openEditor(null));
  READY.forEach(r => {
    const b = document.createElement("button"); b.type = "button"; b.className = "sl-ready-i"; b.style.backgroundImage = `url("${r.image}")`;
    b.setAttribute("aria-label", r.title); b.title = r.title;
    b.addEventListener("click", () => {
      pendingImage = r.image; showImg(r.image);
      if (!$("slTitle").value.trim()){ $("slTitle").value = r.title; $("slText").value = r.text; $("slLink").value = r.link; $("slLinkLabel").value = r.linkLabel; }
    });
    $("slReady").append(b);
  });
  $("slEdCancel").addEventListener("click", () => { $("slEditor").hidden = true; editing = null; pendingImage = null; });
  $("slClearImg").addEventListener("click", () => { pendingImage = ""; showImg(""); });

  function connect(d){
    if (db) return;
    db = d.db;
    db.collection("slides").onSnapshot(snap => {
      slides = snap.docs.map(x => ({ id: x.id, ...x.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
      renderHome(); renderAdmin();
    }, e => console.error(e));
    renderHome(); renderAdmin();
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) restart(); });
  renderHome(); renderAdmin();
  if (window.appDb) connect({ db: window.appDb });
  window.addEventListener("app:db", e => connect(e.detail));
})();
