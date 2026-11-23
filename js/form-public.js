/* The public answer page of a survey: form.html?id=… (open to anyone while the form is active; ?preview=1 lets a signed-in
   member see an inactive form without sending). One section per page, required answers checked before moving on,
   answers sent to forms/{id}/responses with the server's time. File questions upload to the site's Cloudinary account. */
(() => {
  const CONFIG = { apiKey: "AIzaSyBa4DhloyfrfAU_9RAe_Ac-qnTZhd-LdiA", authDomain: "aoshaban-87979.firebaseapp.com", projectId: "aoshaban-87979", storageBucket: "aoshaban-87979.firebasestorage.app", messagingSenderId: "681076685044", appId: "1:681076685044:web:99b1e1c9a202cfa43e46a1" };
  const root = document.getElementById("fp");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const qp = new URLSearchParams(location.search), id = qp.get("id"), preview = qp.get("preview") === "1";
  const CHOICE = new Set(["radio", "check", "select"]);
  let form = null, db = null, page = 0, answers = {}, uploading = 0;

  function message(title, text, icon = "!"){ root.innerHTML = `<section class="fp-card fp-msg"><span class="fp-mi">${icon}</span><h1>${esc(title)}</h1><p>${esc(text)}</p></section>`; }
  if (!id){ message("رابط غير صحيح", "تأكد من رابط الاستبيان."); return; }
  if (!window.firebase){ message("تعذّر التحميل", "تحقق من اتصالك بالإنترنت ثم أعد المحاولة."); return; }
  firebase.initializeApp(CONFIG); db = firebase.firestore();
  const done = () => { try { return !preview && localStorage.getItem("fp-done-" + id) === "1"; } catch { return false; } };

  // a signed-in member may preview an inactive form; everyone else reads it only while it is active
  let started = false;
  firebase.auth().onAuthStateChanged(() => { if (started) return; started = true; load(); });
  setTimeout(() => { if (!started){ started = true; load(); } }, 2500);
  async function load(){
    try {
      const d = await db.collection("forms").doc(id).get();
      if (!d.exists){ message("الاستبيان غير موجود", "ربما حُذف أو أن الرابط غير صحيح."); return; }
      form = d.data();
    } catch { message("الاستبيان غير متاح", "هذا الاستبيان لا يستقبل ردوداً حالياً."); return; }
    document.title = form.title || "استبيان";
    document.documentElement.style.setProperty("--fc", form.color || "#7c3aed");
    const s = form.settings || {};
    const closed = !form.active || (s.closeAt && new Date(s.closeAt + "T23:59:59") < new Date());
    if (closed && !preview){ message(form.title || "استبيان", "هذا الاستبيان مغلق ولا يستقبل ردوداً حالياً.", "⏸"); return; }
    if (s.oneResponse && done()){ message(form.title || "استبيان", "سبق أن أرسلت إجابتك على هذا الاستبيان. شكراً لك.", "✓"); return; }
    form.sections = (form.sections || []).filter(x => (x.questions || []).length);
    render();
  }

  /* ---------- drawing one section ---------- */
  function field(q){
    const v = answers[q.id], name = "q_" + q.id;
    if (q.type === "radio" || q.type === "check"){
      const t = q.type === "radio" ? "radio" : "checkbox", arr = Array.isArray(v) ? v : [v];
      const isOther = x => x != null && x !== "" && !q.options.includes(x);
      const otherVal = (q.type === "radio" ? (isOther(v) ? v : "") : (arr.find(isOther) || ""));
      return `<div class="fp-opts">${q.options.map(o => `<label class="fp-opt"><input type="${t}" name="${name}" value="${esc(o)}"${arr.includes(o) ? " checked" : ""}><span>${esc(o)}</span></label>`).join("")}
        ${q.other ? `<label class="fp-opt fp-oth"><input type="${t}" name="${name}" value="__other"${otherVal ? " checked" : ""}><span>أخرى:</span><input class="fp-in" data-other="${q.id}" value="${esc(otherVal)}"></label>` : ""}</div>`;
    }
    if (q.type === "select") return `<select class="fp-in fp-sel" name="${name}"><option value="">اختر</option>${q.options.map(o => `<option${o === v ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    if (q.type === "scale"){ let s = ""; for (let i = +q.min; i <= +q.max; i++) s += `<label class="fp-sc"><span>${i}</span><input type="radio" name="${name}" value="${i}"${String(v) === String(i) ? " checked" : ""}></label>`;
      return `<div class="fp-scale">${q.minLabel ? `<em>${esc(q.minLabel)}</em>` : ""}<div class="fp-scs">${s}</div>${q.maxLabel ? `<em>${esc(q.maxLabel)}</em>` : ""}</div>`; }
    if (q.type === "rating"){ let s = ""; for (let i = 1; i <= (+q.stars || 5); i++) s += `<button type="button" class="fp-star${+v >= i ? " on" : ""}" data-star="${q.id}" data-v="${i}" aria-label="${i} من ${q.stars}">★</button>`; return `<div class="fp-stars">${s}</div>`; }
    if (q.type === "long") return `<textarea class="fp-in" name="${name}" rows="4" placeholder="إجابتك">${esc(v || "")}</textarea>`;
    if (q.type === "file"){
      if (!form.upload || !form.upload.cloudName) return `<p class="fp-note">رفع الملفات غير متاح في هذا الاستبيان.</p>`;
      return `<div class="fp-file">${v && v.url ? `<a href="${esc(v.url)}" target="_blank" rel="noopener">📎 ${esc(v.name)}</a> <button type="button" class="fp-link" data-unfile="${q.id}">إزالة</button>` : `<label class="fp-btn2">اختر ملفاً<input type="file" data-file="${q.id}" hidden></label><small>حتى 10 ميجابايت</small>`}<span class="fp-up" id="up_${q.id}"></span></div>`;
    }
    const type = { number: "number", email: "email", phone: "tel", date: "date", time: "time" }[q.type] || "text";
    return `<input class="fp-in" type="${type}" name="${name}" value="${esc(v || "")}" placeholder="إجابتك"${q.type === "phone" || q.type === "email" ? ' dir="ltr"' : ""}${q.type === "number" ? ' inputmode="decimal"' : ""}>`;
  }
  function render(){
    const secs = form.sections, s = secs[page], last = page === secs.length - 1, showP = (form.settings || {}).showProgress !== false && secs.length > 1;
    root.innerHTML = `${page === 0 ? `<header class="fp-card fp-head"><h1>${esc(form.title)}</h1>${form.description ? `<p>${esc(form.description).replace(/\n/g, "<br>")}</p>` : ""}<small class="fp-reqn">* سؤال إجباري</small></header>` : `<header class="fp-card fp-head small"><h1>${esc(form.title)}</h1></header>`}
      ${preview ? '<p class="fp-pv">وضع المعاينة: الإجابات لا تُرسل.</p>' : ""}
      ${showP ? `<div class="fp-prog"><i style="width:${Math.round((page + 1) / secs.length * 100)}%"></i><span>${page + 1} من ${secs.length}</span></div>` : ""}
      <form id="fpForm" novalidate>
      ${s.title || s.desc ? `<section class="fp-card fp-sec"><h2>${esc(s.title)}</h2>${s.desc ? `<p>${esc(s.desc)}</p>` : ""}</section>` : ""}
      ${s.questions.map(q => q.type === "text" ? `<section class="fp-card fp-tb"><h2>${esc(q.title)}</h2>${q.desc ? `<p>${esc(q.desc)}</p>` : ""}</section>` :
        `<section class="fp-card fp-q" data-qid="${q.id}"><h3>${esc(q.title || "سؤال")}${q.required ? ' <b class="fp-r">*</b>' : ""}</h3>${q.desc ? `<p class="fp-d">${esc(q.desc)}</p>` : ""}${field(q)}<p class="fp-err" hidden></p></section>`).join("")}
      <div class="fp-nav">${page > 0 ? '<button type="button" class="fp-btn2" id="fpPrev">السابق</button>' : "<span></span>"}<button type="submit" class="fp-btn">${last ? "إرسال" : "التالي"}</button></div>
      </form><p class="fp-foot">لا تشارك كلمات المرور أو المعلومات الحساسة عبر هذا النموذج.</p>`;
    window.scrollTo(0, 0);
    const f = document.getElementById("fpForm");
    f.addEventListener("submit", e => { e.preventDefault(); collect(); if (!check()) return; if (last) send(); else { page++; render(); } });
    const prev = document.getElementById("fpPrev"); if (prev) prev.addEventListener("click", () => { collect(); page--; render(); });
    f.addEventListener("click", e => {
      const st = e.target.closest("[data-star]"); if (st){ answers[st.dataset.star] = +st.dataset.v; collect(); render(); return; }
      const un = e.target.closest("[data-unfile]"); if (un){ delete answers[un.dataset.unfile]; collect(); render(); }
    });
    f.addEventListener("change", e => { if (e.target.dataset.file) upload(e.target.dataset.file, e.target.files[0]); });
    f.addEventListener("input", e => { if (e.target.dataset.other){ const r = f.querySelector(`input[name="q_${e.target.dataset.other}"][value="__other"]`); if (r) r.checked = !!e.target.value; } });
  }
  function collect(){
    const s = form.sections[page], f = document.getElementById("fpForm"); if (!f) return;
    s.questions.forEach(q => {
      if (q.type === "text" || q.type === "rating" || q.type === "file") return;
      const els = [...f.querySelectorAll(`[name="q_${q.id}"]`)];
      const oth = f.querySelector(`[data-other="${q.id}"]`), ov = oth ? oth.value.trim() : "";
      if (q.type === "check"){ answers[q.id] = els.filter(x => x.checked).map(x => x.value === "__other" ? ov : x.value).filter(Boolean); return; }
      if (q.type === "radio" || q.type === "scale"){ const c = els.find(x => x.checked); answers[q.id] = c ? (c.value === "__other" ? ov : q.type === "scale" ? +c.value : c.value) : ""; return; }
      answers[q.id] = els[0] ? els[0].value.trim() : "";
    });
  }
  function check(){
    let ok = true, first = null;
    form.sections[page].questions.forEach(q => {
      if (q.type === "text") return;
      const box = document.querySelector(`[data-qid="${q.id}"]`), err = box.querySelector(".fp-err"), v = answers[q.id];
      const empty = v == null || v === "" || (Array.isArray(v) && !v.length);
      let m = "";
      if (q.required && empty) m = "هذا السؤال إجباري";
      else if (!empty && q.type === "email" && !/^\S+@\S+\.\S+$/.test(v)) m = "اكتب بريداً إلكترونياً صحيحاً";
      else if (!empty && q.type === "phone" && !/^[+\d\s-]{7,}$/.test(v)) m = "اكتب رقماً صحيحاً";
      else if (!empty && q.type === "number" && isNaN(Number(v))) m = "اكتب رقماً";
      err.hidden = !m; err.textContent = m; box.classList.toggle("bad", !!m);
      if (m){ ok = false; first = first || box; }
    });
    if (uploading){ ok = false; alert("انتظر حتى يكتمل رفع الملف"); }
    if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
    return ok;
  }
  function upload(qid, file){
    if (!file) return;
    if (file.size > 10 * 1024 * 1024){ alert("حجم الملف أكبر من 10 ميجابايت"); return; }
    const u = form.upload, fd = new FormData(); fd.append("file", file); fd.append("upload_preset", u.preset); fd.append("folder", [u.folder, "forms"].filter(Boolean).join("/"));
    const out = document.getElementById("up_" + qid), xhr = new XMLHttpRequest(); uploading++;
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${encodeURIComponent(u.cloudName)}/auto/upload`);
    xhr.upload.onprogress = e => { if (e.lengthComputable && out) out.textContent = ` جارٍ الرفع ${Math.round(e.loaded / e.total * 100)}%`; };
    xhr.onload = () => { uploading--; let j = {}; try { j = JSON.parse(xhr.responseText); } catch {}
      if (j.secure_url){ collect(); answers[qid] = { url: j.secure_url, name: file.name.slice(0, 200) }; render(); } else { if (out) out.textContent = " تعذّر الرفع"; } };
    xhr.onerror = () => { uploading--; if (out) out.textContent = " تعذّر الرفع"; };
    xhr.send(fd);
  }
  async function send(){
    const btn = document.querySelector(".fp-btn");
    if (preview){ message("انتهت المعاينة", "هذا ما يراه المجيب بعد الإرسال. لم تُرسل أي إجابة.", "✓"); return; }
    btn.disabled = true; btn.textContent = "جارٍ الإرسال…";
    const clean = {}; Object.entries(answers).forEach(([k, v]) => { if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) clean[k] = v; });
    try {
      await db.collection("forms").doc(id).collection("responses").add({ answers: clean, at: firebase.firestore.FieldValue.serverTimestamp() });
      try { localStorage.setItem("fp-done-" + id, "1"); } catch {}
      message(form.title || "استبيان", (form.settings || {}).confirm || "شكراً لك، تم استلام إجابتك.", "✓");
    } catch (e){ console.error(e); btn.disabled = false; btn.textContent = "إرسال"; alert("تعذّر الإرسال. ربما أُغلق الاستبيان، أو تحقق من اتصالك ثم أعد المحاولة."); }
  }
})();
