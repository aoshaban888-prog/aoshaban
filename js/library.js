(() => {
const $ = id => document.getElementById(id);
const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const CATS = ["الامتثال والالتزام","الشفافية والإفصاح","السلامة المالية","اللوائح والسياسات","أخرى"];
const NAME_RX = /\{\{?\s*اسم[ _]الجمعية\s*\}?\}|\[\s*اسم الجمعية\s*\]|«\s*اسم الجمعية\s*»/g;
/* blanks left for the association name in imported policies: «جمعية ......» and «الجمعية (......)» */
const NAME_BLANK_RX = /جمعية\s*[.…_ـ]{3,}|الجمعية\s*\(\s*[.…_ـ\s]{3,}\)/g;
const blanksToPlaceholder = h => (h || "").replace(NAME_BLANK_RX, "{اسم الجمعية}");

/* heavy libraries are fetched the first time they are needed (Word import, PDF export) */
const LIBS = {
  mammoth: ["https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"],
  pdf: ["https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"],
};
const libLoads = {};
const loadScript = src => new Promise((res, rej) => {
  const el = document.createElement("script"); el.src = src; el.async = false;
  el.onload = res; el.onerror = () => { el.remove(); rej(Object.assign(new Error("lib_load"), { code: "lib_load" })); };
  document.head.append(el);
});
function needLib(k){ return libLoads[k] ||= Promise.all(LIBS[k].map(loadScript)).catch(e => { delete libLoads[k]; throw e; }); }

/* policy HTML is cleaned of scripts and event handlers before it reaches the page or the database */
const cleanHtml = h => window.DOMPurify ? DOMPurify.sanitize(h || "", { ADD_ATTR: ["contenteditable"] }) : (h || "");

/* Fonts the association supplied; published next to the page under fonts/.
   Each weight is its own Word family (`word`); `allBold` weights are a family's Bold face, so every run is set bold. */
const FAMILIES = [
  { name: "DIN Next LT Arabic", weights: [
    { w: 250, word: "DIN Next LT Arabic Ultra Light", file: "DINNextLTArabic-UltraLight.ttf", noEmbed: true },
    { w: 300, word: "DIN Next LT Arabic Light", file: "DINNextLTArabic-Light.ttf", noEmbed: true },
    { w: 400, word: "DIN Next LT Arabic", file: "DINNextLTArabic-Regular.ttf", bold: "DINNextLTArabic-Bold.ttf", noEmbed: true },
    { w: 500, word: "DIN Next LT Arabic Medium", file: "DINNextLTArabic-Medium.ttf", bold: "DINNextLTArabic-Heavy.ttf", noEmbed: true },
    { w: 700, word: "DIN Next LT Arabic", file: "DINNextLTArabic-Bold.ttf", allBold: true, noEmbed: true },
    { w: 800, word: "DIN Next LT Arabic Medium", file: "DINNextLTArabic-Heavy.ttf", allBold: true, noEmbed: true },
    { w: 900, word: "DIN Next LT Arabic Black", file: "DINNextLTArabic-Black.ttf", noEmbed: true },
  ]},
  { name: "HRSD", weights: [
    { w: 100, word: "HRSD Thin", file: "HRSD-Thin.ttf", noEmbed: true },
    { w: 300, word: "HRSD Light", file: "HRSD-Light.ttf", noEmbed: true },
    { w: 400, word: "HRSD", file: "HRSD-Regular.ttf", bold: "HRSD-Bold.ttf", noEmbed: true },
    { w: 500, word: "HRSD Medium", file: "HRSD-Medium.ttf", noEmbed: true },
    { w: 700, word: "HRSD", file: "HRSD-Bold.ttf", allBold: true, noEmbed: true },
    { w: 900, word: "HRSD Title", file: "HRSD-Title.ttf", noEmbed: true },
  ]},
  { name: "SF Mada", weights: [ { w: 400, word: "SF-Mada", file: "SF-Mada.ttf" } ]},
  { name: "thmanyah serif display", weights: [
    { w: 700, word: "thmanyah serif display", file: "Thmanyah-Bold.otf", allBold: true, noEmbed: true },
    { w: 900, word: "thmanyah serif display Black", file: "Thmanyah-Black.otf", noEmbed: true },
  ]},
];
const SYSTEM_FONTS = ["Sakkal Majalla", "Traditional Arabic", "Simplified Arabic", "Arial", "Calibri"];
SYSTEM_FONTS.forEach(n => FAMILIES.push({ name: n, system: true, weights: [{ w: 400, word: n, system: true }] }));
const WEIGHT_NAMES = { 100: "رفيع", 200: "خفيف جداً", 250: "خفيف جداً", 300: "خفيف", 400: "عادي", 500: "متوسط", 600: "شبه غامق", 700: "غامق", 800: "غامق جداً", 900: "أسود" };
FAMILIES.forEach(fam => fam.weights.forEach(v => { v.id = fam.name + "|" + v.w; v.family = fam; }));
const ALL_WEIGHTS = FAMILIES.flatMap(f => f.weights);
const weightById = id => ALL_WEIGHTS.find(v => v.id === id) || null;
const currentWeight = () => weightById($("font").value) || weightById("DIN Next LT Arabic|400");
/* the supplied font behind the current choice, or null for a font Word already has */
const fontDef = () => { const v = currentWeight(); return v && !v.system ? v : null; };
const cssFamily = v => v.system ? `"${v.word}", "Noto Naskh Arabic", serif` : `"${v.word}", "IBM Plex Sans Arabic", sans-serif`;
const cssWeight = v => v.allBold ? 700 : 400;

(function installFonts(){
  const face = (fam, file, w, st) => `@font-face{font-family:"${fam}";src:url("fonts/${file}");font-weight:${w};font-style:${st};font-display:swap}`;
  const seen = new Set(); let css = "";
  const add = (fam, file, w, st) => { const k = fam + w + st; if (seen.has(k)) return; seen.add(k); css += face(fam, file, w, st); };
  ALL_WEIGHTS.forEach(v => {
    if (v.system) return;
    if (v.allBold){ add(v.word, v.file, 700, "normal"); return; }
    add(v.word, v.file, 400, "normal");
    if (v.bold) add(v.word, v.bold, 700, "normal");
    if (v.italic) add(v.word, v.italic, 400, "italic");
    if (v.boldItalic) add(v.word, v.boldItalic, 700, "italic");
  });
  const st = document.createElement("style"); st.textContent = css; document.head.append(st);
  let saved = null; try { saved = localStorage.getItem("assoc-policies-font2"); } catch {}
  const legacy = saved && ALL_WEIGHTS.find(v => v.word === saved && !v.allBold);
  $("font").value = weightById(saved) ? saved : legacy ? legacy.id : "DIN Next LT Arabic|400";
})();

/* fonts uploaded from التمكين التقني (js/fonts.js): a file named like one of the families above fills that face;
   any other file becomes a new document font under "خطوط مرفوعة". Bytes also feed Word embedding (fontBytes). */
const upFaces = new Set();
function useUploadedFonts(list){
  const italic = f => f.style === "italic";
  list.slice().sort((x, y) => italic(x) - italic(y)).forEach(f => {
    fontCache[f.fileName] = f.buf;
    const known = ALL_WEIGHTS.filter(v => !v.system && (v.file === f.fileName || v.bold === f.fileName));
    const addFace = (fam, w, st) => {
      const k = fam + "|" + w + "|" + st + "|" + f.id; if (upFaces.has(k)) return; upFaces.add(k);
      try { const ff = new FontFace(fam, f.buf, { weight: String(w), style: st }); document.fonts.add(ff); ff.load().catch(() => {}); } catch {}
    };
    known.forEach(v => addFace(v.word, v.bold === f.fileName || v.allBold ? 700 : 400, "normal"));
    if (known.length) return;
    const group = f.group || f.family;
    let fam = FAMILIES.find(x => x.uploaded && x.name === group);
    if (italic(f)){ // an italic file is the italic face of the same weight
      const v = fam && fam.weights.find(x => x.w === f.weight);
      if (v){ v.italic = f.fileName; addFace(v.word, v.allBold ? 700 : 400, "italic"); }
      return;
    }
    if (!fam){ fam = { name: group, uploaded: true, weights: [] }; FAMILIES.splice(FAMILIES.findIndex(x => x.system), 0, fam); }
    if (fam.weights.some(v => v.file === f.fileName)) return;
    // each weight is its own Word family (its name ID 1); a bold that shares the family name is that family's Bold face
    const allBold = f.weight >= 700 && f.family === group;
    const w = fam.weights.some(v => v.w === f.weight) ? f.weight + 1 : f.weight;
    const v = { w, word: f.family, file: f.fileName, allBold, uploaded: true, family: fam };
    v.id = fam.name + "|" + w;
    fam.weights.push(v); fam.weights.sort((a, b) => a.w - b.w); ALL_WEIGHTS.push(v);
    addFace(v.word, allBold ? 700 : 400, "normal");
  });
  // a font chosen earlier that only exists as an upload comes back once it is loaded
  let saved = null; try { saved = localStorage.getItem("assoc-policies-font2"); } catch {}
  if (saved && weightById(saved) && $("font").value !== saved){ $("font").value = saved; renderFontButton(); $("font").dispatchEvent(new Event("change")); }
  else renderFontButton();
  if (fp.open) renderFontMenu();
  previewStale = true; if (pTab === "preview") schedulePreview(100);
}
window.addEventListener("app:fonts", e => useUploadedFonts(e.detail));

/* font picker: family list, each family opens its weights */
const fp = { open: false, famOpen: null };
function weightLabel(v){ return WEIGHT_NAMES[v.w] || String(v.w); }
function renderFontButton(){
  const v = currentWeight();
  const b = $("fpBtn"); b.innerHTML = "";
  const n = document.createElement("span"); n.className = "fp-name"; n.textContent = v.family.name;
  n.style.fontFamily = cssFamily(v); n.style.fontWeight = cssWeight(v);
  b.append(n);
  if (v.family.weights.length > 1){ const w = document.createElement("span"); w.className = "fp-w"; w.textContent = weightLabel(v); b.append(w); }
  b.insertAdjacentHTML("beforeend", '<svg class="fp-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>');
}
function weightList(fam){
  const box = document.createElement("div"); box.className = "fp-weights"; box.setAttribute("role", "group"); box.setAttribute("aria-label", "أوزان " + fam.name);
  fam.weights.forEach(v => {
    const o = document.createElement("button"); o.type = "button"; o.className = "fp-opt";
    o.setAttribute("aria-checked", v.id === $("font").value ? "true" : "false"); o.setAttribute("role", "menuitemradio");
    o.textContent = weightLabel(v); o.style.fontFamily = cssFamily(v); o.style.fontWeight = cssWeight(v);
    o.addEventListener("click", e => { e.stopPropagation(); chooseFont(v.id); });
    box.append(o);
  });
  return box;
}
const narrowPicker = () => window.innerWidth < 700;
function renderFontMenu(){
  const menu = $("fpMenu"); menu.innerHTML = "";
  const cur = currentWeight();
  [["خطوط الجمعية", FAMILIES.filter(f => !f.system && !f.uploaded)], ["خطوط مرفوعة", FAMILIES.filter(f => f.uploaded)], ["خطوط وورد الشائعة", FAMILIES.filter(f => f.system)]].forEach(([title, fams]) => {
    if (!fams.length) return;
    const h = document.createElement("div"); h.className = "fp-group"; h.textContent = title; menu.append(h);
    fams.forEach(fam => {
      const multi = fam.weights.length > 1;
      const reg = fam.weights.find(v => v.w === 400) || fam.weights[0];
      const row = document.createElement("button"); row.type = "button"; row.className = "fp-fam"; row.dataset.fam = fam.name;
      row.setAttribute("aria-checked", cur.family === fam ? "true" : "false");
      if (multi) row.setAttribute("aria-expanded", fp.famOpen === fam.name ? "true" : "false");
      const tick = document.createElement("span"); tick.className = "fp-tick"; tick.textContent = cur.family === fam ? "✓" : "";
      const nm = document.createElement("span"); nm.className = "fp-fname"; nm.textContent = fam.name; nm.style.fontFamily = cssFamily(reg); nm.style.fontWeight = cssWeight(reg);
      const sm = document.createElement("span"); sm.className = "fp-sample"; sm.textContent = "جمعية"; sm.style.fontFamily = nm.style.fontFamily; sm.style.fontWeight = nm.style.fontWeight;
      row.append(tick, nm, sm);
      if (multi){ const ar = document.createElement("span"); ar.className = "fp-arrow"; ar.setAttribute("aria-hidden", "true"); ar.textContent = "◂"; row.append(ar); }
      row.addEventListener("click", e => {
        e.stopPropagation();
        if (!multi){ chooseFont(reg.id); return; }
        if (narrowPicker()){ fp.famOpen = fp.famOpen === fam.name ? null : fam.name; renderFontMenu(); return; }
        chooseFont(cur.family === fam ? cur.id : reg.id);
      });
      if (multi){
        row.addEventListener("mouseenter", () => { if (!narrowPicker()) openFlyout(fam, row); });
        row.addEventListener("focus", () => { if (!narrowPicker()) openFlyout(fam, row); });
      } else {
        row.addEventListener("mouseenter", () => { if (!narrowPicker()) closeFlyout(); });
      }
      menu.append(row);
      if (multi && narrowPicker() && fp.famOpen === fam.name) menu.append(weightList(fam));
    });
  });
}
function openFlyout(fam, row){
  const fly = $("fpFly"); fly.innerHTML = ""; fly.append(weightList(fam)); fly.hidden = false;
  document.querySelectorAll("#fpMenu .fp-fam").forEach(r => r.classList.toggle("hover", r === row));
  const r = row.getBoundingClientRect(); const fw = fly.offsetWidth, fh = fly.offsetHeight;
  let left = r.left - fw - 4; if (left < 8) left = Math.min(r.right + 4, window.innerWidth - fw - 8);
  let top = r.top - 6; if (top + fh > window.innerHeight - 8) top = Math.max(8, window.innerHeight - fh - 8);
  fly.style.left = left + "px"; fly.style.top = top + "px";
}
function closeFlyout(){ $("fpFly").hidden = true; document.querySelectorAll("#fpMenu .fp-fam.hover").forEach(r => r.classList.remove("hover")); }
function openPicker(){
  fp.open = true; fp.famOpen = narrowPicker() ? currentWeight().family.name : null;
  renderFontMenu(); $("fpMenu").hidden = false; $("fpBtn").setAttribute("aria-expanded", "true");
  const sel = $("fpMenu").querySelector('.fp-fam[aria-checked="true"]'); if (sel) sel.scrollIntoView({ block: "nearest" });
}
function closePicker(){ fp.open = false; $("fpMenu").hidden = true; closeFlyout(); $("fpBtn").setAttribute("aria-expanded", "false"); }
function chooseFont(id){
  $("font").value = id; closePicker(); renderFontButton(); $("fpBtn").focus();
  $("font").dispatchEvent(new Event("change"));
}
$("fpBtn").addEventListener("click", e => { e.stopPropagation(); fp.open ? closePicker() : openPicker(); });
document.addEventListener("click", e => { if (fp.open && !e.target.closest("#fpMenu, #fpFly")) closePicker(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && fp.open){ closePicker(); $("fpBtn").focus(); } });
$("fpMenu").addEventListener("scroll", closeFlyout);
window.addEventListener("resize", () => { if (fp.open) closePicker(); });
renderFontButton();

function syncEmbedOption(){
  const f = fontDef();
  $("embedWrap").hidden = !f || !!f.noEmbed;
  $("fontNote").hidden = !f || !f.noEmbed;
}
syncEmbedOption();
$("font").addEventListener("change", () => { try { localStorage.setItem("assoc-policies-font2", $("font").value); } catch {} syncEmbedOption(); });

/* theme: handled by js/shell.js (light / dark / neon) */

const state = {
  policies: [], selectedId: null, dirty: false,
  letterhead: null, letterheadRaw: null, letterheadName: "", approvals: {}, assocs: [], assocId: null, lhSavedFor: null,
  db: null, col: null, downloads: null, mode: "loading", canWrite: true,
};

/* ---------- storage ---------- */
const LS_KEY = "assoc-policies-local-v1";
function lsRead(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch{ return d; } }
function lsWrite(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} }

function setStore(kind, text){
  const n = $("storeNote");
  n.innerHTML = "";
  const d = document.createElement("span"); d.className = "dot " + kind;
  const t = document.createElement("span"); t.textContent = text;
  n.append(d, t);
}

/* ---------- Firebase: Firestore storage behind Google sign-in ----------
   Access is controlled by Firestore rules (see firestore.rules): only emails listed in the "allowed" collection can read or write. */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBa4DhloyfrfAU_9RAe_Ac-qnTZhd-LdiA",
  authDomain: "aoshaban-87979.firebaseapp.com",
  projectId: "aoshaban-87979",
  storageBucket: "aoshaban-87979.firebasestorage.app",
  messagingSenderId: "681076685044",
  appId: "1:681076685044:web:99b1e1c9a202cfa43e46a1",
};
function storeButton(label, onClick){
  const b = document.createElement("button"); b.type = "button"; b.className = "btn small"; b.textContent = label;
  b.addEventListener("click", onClick); $("storeNote").append(b); return b;
}
function initFirebase(){
  if (!(window.firebase && firebase.initializeApp && firebase.auth && firebase.firestore)) return Promise.resolve(false);
  if (/^file:/.test(location.protocol)){ setStore("warn", "افتح الصفحة من رابط (http) لتسجيل الدخول، لا من ملف على الجهاز"); return Promise.resolve(false); }
  let app;
  try { app = firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG); } catch (e){ console.error(e); return Promise.resolve(false); }
  const auth = app.auth(); const db = app.firestore();
  try { db.settings({ ignoreUndefinedProperties: true, merge: true }); } catch {}
  const provider = new firebase.auth.GoogleAuthProvider(); provider.setCustomParameters({ prompt: "select_account" });
  const signIn = async () => {
    try { await auth.signInWithPopup(provider); }
    catch (e){
      if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) return auth.signInWithRedirect(provider);
      console.error("sign-in", e, location.href);
      if (e && e.code === "auth/unauthorized-domain") setStore("warn", `النطاق «${location.hostname || location.origin}» غير مضاف في «Authorized domains» في إعدادات Firebase`);
      else if (!(e && e.code === "auth/popup-closed-by-user")) setStore("warn", `تعذّر تسجيل الدخول (${(e && e.code) || "خطأ غير معروف"}). حاول مرة أخرى.`);
      storeButton("تسجيل الدخول بقوقل", signIn);
    }
  };
  const signOut = () => auth.signOut().then(() => location.reload());
  state.mode = "auth"; renderList();
  return new Promise(resolve => {
    auth.onAuthStateChanged(async user => {
      if (state.mode === "db") return;
      if (!user){
        setStore("warn", "سجّل الدخول بحساب قوقل لفتح المكتبة"); storeButton("تسجيل الدخول بقوقل", signIn);
        return;
      }
      setStore("", "جارٍ التحقق من الصلاحية…");
      let ok = false, err = null;
      try { ok = (await db.collection("allowed").doc(user.email).get()).exists; } catch (e){ console.error(e); err = e; }
      if (err && err.code !== "permission-denied"){
        setStore("warn", "تعذّر التحقق من الصلاحية. تأكد من الاتصال بالإنترنت ثم أعد المحاولة");
        storeButton("إعادة المحاولة", () => location.reload()); storeButton("خروج", signOut);
        return;
      }
      if (!ok){
        setStore("warn", `حساب ${user.email} غير مصرّح له بفتح المكتبة`); storeButton("تبديل الحساب", signOut);
        return;
      }
      state.db = db; state.col = db.collection("policies"); state.mode = "db"; state.canWrite = true;
      window.appDb = db; window.appUser = user; window.dispatchEvent(new CustomEvent("app:db", { detail: { db, user } }));
      setStore("ok", `المكتبة محفوظة في Firebase · ${user.email}`); storeButton("خروج", signOut);
      state.col.onSnapshot(snap => {
        state.policies = snap.docs.map(policyRow);
        renderList(); renderChosen();
        if (state.onPolicies) state.onPolicies();
      }, e => { console.error(e); setStore("warn", "تعذّر الاتصال بالمكتبة. أعد تحميل الصفحة."); });
      resolve(true);
    });
  });
}

async function initStore(){
  if (await initFirebase()) return;
  const use = window.claude && window.claude.use ? window.claude.use.bind(window.claude) : null;
  if (use){
    use("downloads").then(d => { state.downloads = d; }).catch(() => {});
    use("user").then(async u => {
      if (!u) return;
      try { const c = await u.can("data.write"); if (c === false){ state.canWrite = false; renderList(); renderChosen(); } } catch {}
    }).catch(() => {});
    let db = null;
    try { db = await use("db"); } catch {}
    if (db){
      state.db = db; state.col = db.collection("policies"); state.mode = "db";
      setStore("ok", "المكتبة محفوظة ومتاحة في كل مرة تفتح الصفحة");
      state.col.onSnapshot(snap => {
        state.policies = snap.docs.map(policyRow);
        renderList(); renderChosen();
        if (state.onPolicies) state.onPolicies();
      }, () => { setStore("warn", "تعذّر الاتصال بالمكتبة. أعد تحميل الصفحة."); });
      return;
    }
  }
  state.mode = "local";
  setStore("warn", "المكتبة محفوظة في هذا المتصفح فقط");
  state.policies = lsRead(LS_KEY, []).map(p => ({ ...p, html: cleanHtml(p.html) }));
  renderList();
}

function policyRow(d){ const x = d.data(); return { id: d.id, ...x, html: cleanHtml(x.html) }; }
function newId(){ return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

async function savePolicy(p){
  const body = { title: p.title, category: p.category || "أخرى", code: p.code || "", html: cleanHtml(p.html), sample: !!p.sample,
                 createdAt: p.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  if (new Blob([JSON.stringify(body)]).size > 250000) throw new Error("too_big");
  const old = state.policies.find(x => x.id === p.id);
  const changed = !old || old.html !== body.html || old.title !== body.title;
  if (state.mode === "db"){
    await state.col.doc(p.id).set(body);
  } else {
    const i = state.policies.findIndex(x => x.id === p.id);
    if (i >= 0) state.policies[i] = { id: p.id, ...body }; else state.policies.push({ id: p.id, ...body });
    lsWrite(LS_KEY, state.policies); renderList();
  }
  if (changed) await recordVersion(p.id, old, body, p.versionNote).catch(e => console.error("version", e));
}
async function deletePolicy(id){
  if (state.mode === "db") await state.col.doc(id).delete();
  else { state.policies = state.policies.filter(x => x.id !== id); lsWrite(LS_KEY, state.policies); renderList(); }
  dropVersions(id).catch(() => {});
}

/* ---------- version history: an index per policy ("vindex") plus one document per saved version ("versions") ---------- */
const VKEEP = 30;
async function versionIndex(pid){ const d = await store.get("vindex", pid).catch(() => null); return (d && d.items) || []; }
async function recordVersion(pid, old, body, note){
  const items = await versionIndex(pid);
  const add = async (src, n, why) => {
    const vid = `${pid}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    await store.set("versions", vid, { pid, title: src.title, html: src.html });
    items.push({ vid, n, at: (n === 1 && old && src === old ? src.updatedAt : null) || new Date().toISOString(), title: src.title, note: why || "" });
  };
  // the first change of a policy saved before history existed keeps its earlier text as version 1
  if (!items.length && old) await add(old, 1, "الإصدار الأول");
  const n = items.length ? items[items.length - 1].n + 1 : 1;
  await add(body, n, note || (n === 1 ? "الإصدار الأول" : ""));
  while (items.length > VKEEP){ const gone = items.shift(); store.del("versions", gone.vid).catch(() => {}); }
  await store.set("vindex", pid, { items });
}
async function dropVersions(pid){
  const items = await versionIndex(pid);
  await Promise.all(items.map(v => store.del("versions", v.vid).catch(() => {})));
  await store.del("vindex", pid);
}
function fmtVerDate(iso){ return iso ? fmtApprovalDate(String(iso).slice(0, 10)) : ""; }

async function openHistory(){
  const p = current(); if (!p) return;
  $("hTitle").textContent = `سجل إصدارات «${p.title}»`;
  $("hView").hidden = true; $("hMsg").textContent = ""; $("hMsg").className = "msg";
  const box = $("hList"); box.innerHTML = '<span class="hint">جارٍ التحميل…</span>';
  $("hdlg").hidden = false;
  const items = await versionIndex(p.id);
  box.innerHTML = "";
  if (!items.length){ box.innerHTML = '<span class="hint">لا توجد إصدارات محفوظة بعد. كل مرة تحفظ فيها تعديلاً على النص أو العنوان يُسجَّل إصدار جديد هنا.</span>'; return; }
  [...items].reverse().forEach((v, i) => {
    const row = document.createElement("div"); row.className = "ver";
    const head = document.createElement("div"); head.className = "ver-h";
    const b = document.createElement("b"); b.textContent = `الإصدار ${v.n}`;
    const d = document.createElement("span"); d.className = "hint"; d.textContent = fmtVerDate(v.at);
    head.append(b, d);
    if (i === 0){ const t = document.createElement("span"); t.className = "tag-cur"; t.textContent = "الحالي"; head.append(t); }
    const note = document.createElement("input"); note.className = "input"; note.type = "text"; note.value = v.note || "";
    note.placeholder = "وصف التعديل (اختياري)"; note.setAttribute("aria-label", `وصف تعديل الإصدار ${v.n}`); note.disabled = !state.canWrite;
    note.addEventListener("change", async () => {
      const all = await versionIndex(p.id); const it = all.find(x => x.vid === v.vid); if (!it) return;
      it.note = note.value.trim(); v.note = it.note;
      try { await store.set("vindex", p.id, { items: all }); $("hMsg").className = "msg ok"; $("hMsg").textContent = "حُفظ الوصف."; previewStale = true; }
      catch (e){ $("hMsg").className = "msg err"; $("hMsg").textContent = storeError(e); }
    });
    const acts = document.createElement("div"); acts.className = "row";
    const view = document.createElement("button"); view.type = "button"; view.className = "btn small"; view.textContent = "عرض";
    view.addEventListener("click", async () => {
      const d = await store.get("versions", v.vid).catch(() => null);
      $("hView").hidden = false; $("hViewT").textContent = `الإصدار ${v.n} · ${v.title || ""}`;
      $("hViewB").innerHTML = d ? decoratePlaceholders(d.html || "") : '<span class="hint">تعذّر تحميل هذا الإصدار.</span>';
      $("hView").scrollIntoView({ block: "nearest" });
    });
    acts.append(view);
    if (i > 0 && state.canWrite){
      const back = document.createElement("button"); back.type = "button"; back.className = "btn small"; back.textContent = "استرجاع";
      back.addEventListener("click", async () => {
        const d = await store.get("versions", v.vid).catch(() => null);
        if (!d){ $("hMsg").className = "msg err"; $("hMsg").textContent = "تعذّر تحميل هذا الإصدار."; return; }
        $("editor").innerHTML = decoratePlaceholders(d.html || ""); tbxSel = null; $("tbxBar").hidden = true; tbxLayoutAll(); markDirty(); state.restoreNote = { pid: p.id, note: `استرجاع الإصدار ${v.n}` };
        $("hdlg").hidden = true; setPTab("edit");
        setMsg(`استُرجع نص الإصدار ${v.n} في المحرر. اضغط «حفظ التعديلات في المكتبة» لاعتماده كإصدار جديد.`, "ok");
      });
      acts.append(back);
    }
    row.append(head, note, acts); box.append(row);
  });
}

/* closing table "سجل الإصدارات" (optional, from the page settings) */
function versionsXml(opt, ctx){
  const items = ctx.verTable && ctx.versions; if (!items || !items.length) return "";
  const font = xmlEsc(opt.font); const sz = Math.max(18, opt.size * 2 - 6);
  const r = (t, b) => `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>${b || opt.allBold ? "<w:b/><w:bCs/>" : ""}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:rtl/></w:rPr><w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
  const jc = opt.forPreview ? "right" : "start";
  const bd = '<w:top w:val="single" w:sz="4" w:color="A6A6A6"/><w:left w:val="single" w:sz="4" w:color="A6A6A6"/><w:bottom w:val="single" w:sz="4" w:color="A6A6A6"/><w:right w:val="single" w:sz="4" w:color="A6A6A6"/><w:insideH w:val="single" w:sz="4" w:color="A6A6A6"/><w:insideV w:val="single" w:sz="4" w:color="A6A6A6"/>';
  const W = [700, 2600, 1700]; // fiftieths of a percent of the text width
  const cell = (t, w, head) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="pct"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : ""}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:bidi/><w:spacing w:before="40" w:after="40"/><w:jc w:val="${jc}"/></w:pPr>${r(t, head)}</w:p></w:tc>`;
  let x = `<w:p><w:pPr><w:keepNext/><w:bidi/><w:spacing w:before="360" w:after="120"/><w:jc w:val="${jc}"/></w:pPr>${r("سجل الإصدارات", true)}</w:p>`;
  x += `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${bd}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${W.map(w => `<w:gridCol w:w="${Math.round(w * 1.8)}"/>`).join("")}</w:tblGrid>`;
  x += `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cell("الإصدار", W[0], true)}${cell("التاريخ", W[1], true)}${cell("وصف التعديل", W[2], true)}</w:tr>`;
  items.forEach(v => { x += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cell(String(v.n), W[0])}${cell(fmtVerDate(v.at), W[1])}${cell(v.note || "—", W[2])}</w:tr>`; });
  return x + "</w:tbl>";
}
function storeError(e){
  if (e && e.code === "lib_load") return "تعذّر تحميل أداة لازمة من الإنترنت. تأكد من الاتصال ثم حاول مرة أخرى.";
  if (e && e.message === "too_big") return "نص السياسة أكبر من الحد المسموح للحفظ. قسّمها إلى سياستين.";
  if (e && (e.code === "invalid_argument" || e.code === "permission-denied")) return "لا تملك صلاحية تعديل المكتبة.";
  if (e && (e.code === "quota_exceeded" || e.code === "resource-exhausted")) return "امتلأت مساحة المكتبة. احذف سياسات غير مستخدمة ثم أعد المحاولة.";
  return "تعذّر الحفظ. حاول مرة أخرى.";
}

/* ---------- library list ---------- */
function fillCats(){
  const f = $("catFilter"); f.innerHTML = "";
  f.append(new Option("كل التصنيفات", ""));
  CATS.forEach(c => f.append(new Option(c, c)));
  const m = $("moveCat"); m.innerHTML = "";
  CATS.forEach(c => m.append(new Option(c, c)));
  const p = $("pCat"); p.innerHTML = "";
  CATS.forEach(c => p.append(new Option(c, c)));
}
/* titles compared loosely: diacritics, tatweel, alef forms, copy suffixes and spacing ignored */
function normTitle(t){
  return (t || "").replace(/\.docx$/i, "").replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة(\s|$)/g, "ه$1")
    .replace(/\s*[(\[]\s*\d+\s*[)\]]\s*$/, "").replace(/\s*-\s*(نسخة|copy)\s*\d*$/i, "").replace(/\s+/g, " ").trim();
}
function duplicateKeys(){
  const seen = new Map();
  state.policies.forEach(p => { const k = normTitle(p.title); seen.set(k, (seen.get(k) || 0) + 1); });
  return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
}
const LEGACY_CATS = { "النزاهة والامتثال": "الامتثال والالتزام", "معيار الامتثال والالتزام": "الامتثال والالتزام", "معيار الشفافية والإفصاح": "الشفافية والإفصاح", "معيار السلامة المالية": "السلامة المالية" };
function legacyPolicies(){ return state.policies.filter(p => !CATS.includes(p.category || "أخرى")); }
function renderLibNotice(dupKeys){
  const n = $("libNotice"); n.innerHTML = "";
  const dupCount = state.policies.filter(p => dupKeys.has(normTitle(p.title))).length;
  const legacy = legacyPolicies();
  // keep the filter option for duplicates in step with the library
  const f = $("catFilter"); let opt = f.querySelector('option[value="__dups"]');
  if (dupKeys.size){ if (!opt){ opt = new Option("", "__dups"); f.append(opt); } opt.textContent = `المكررات (${dupCount})`; }
  else if (opt){ if (f.value === "__dups") f.value = ""; opt.remove(); }
  if (!dupKeys.size && !legacy.length){ n.hidden = true; return; }
  n.hidden = false;
  if (dupKeys.size){
    const row = document.createElement("div"); row.className = "ln-row";
    const t = document.createElement("span"); t.textContent = `${dupKeys.size === 1 ? "سياسة لها" : dupKeys.size + " سياسات لها"} أكثر من نسخة في المكتبة.`;
    const b = document.createElement("button"); b.type = "button"; b.className = "btn small";
    const showing = f.value === "__dups";
    b.textContent = showing ? "عرض الكل" : "عرض المكررات";
    b.addEventListener("click", () => { f.value = showing ? "" : "__dups"; renderList(); });
    row.append(t, b); n.append(row);
  }
  if (legacy.length && state.canWrite){
    const row = document.createElement("div"); row.className = "ln-row";
    const names = [...new Set(legacy.map(p => p.category))].map(c => "«" + c + "»").join("، ");
    const t = document.createElement("span"); t.textContent = `${legacy.length} ${legacy.length === 1 ? "سياسة" : "سياسات"} في تصنيف قديم ${names}.`;
    const b = document.createElement("button"); b.type = "button"; b.className = "btn small";
    b.textContent = "نقلها للتصنيفات الحالية";
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        for (const p of legacy){ const to = LEGACY_CATS[p.category] || "أخرى"; await savePolicy({ ...p, category: to, html: p.id === state.selectedId && state.dirty ? editorHtml() : p.html }); }
        if (legacy.some(p => p.id === state.selectedId)) state.dirty = false;
        renderList(); renderChosen(); setMsg(`نُقلت ${legacy.length} ${legacy.length === 1 ? "سياسة" : "سياسات"} إلى التصنيفات الحالية.`, "ok");
      } catch (e){ setMsg(storeError(e), "err"); b.disabled = false; }
    });
    row.append(t, b); n.append(row);
  }
}
function renderList(){
  const list = $("list"); list.innerHTML = "";
  $("addBtn").disabled = !state.canWrite;
  const q = $("q").value.trim(); const cat = $("catFilter").value;
  const dupKeys = duplicateKeys(); const dupMode = cat === "__dups";
  renderLibNotice(dupKeys);
  const items = state.policies
    .filter(p => (dupMode ? dupKeys.has(normTitle(p.title)) : (!cat || p.category === cat)) && (!q || (p.title || "").includes(q) || (p.code || "").includes(q)))
    .sort((a, b) => (a.code || "").localeCompare(b.code || "", "ar") || (a.title || "").localeCompare(b.title || "", "ar"));
  if (!state.policies.length){
    const e = document.createElement("div"); e.className = "empty";
    e.innerHTML = state.mode === "auth" ? "<strong>سجّل الدخول لعرض المكتبة</strong>استخدم زر «تسجيل الدخول بقوقل» في القائمة الجانبية" :
      state.mode === "loading" ? "<strong>جارٍ تحميل المكتبة…</strong>" :
      "<strong>المكتبة فارغة</strong>أضف أول سياسة من زر «إضافة سياسة»، ويمكنك رفع عدة ملفات وورد دفعة واحدة.";
    list.append(e); return;
  }
  if (!items.length && (q || cat)){ const e = document.createElement("div"); e.className = "empty"; e.textContent = "لا توجد نتائج مطابقة."; list.append(e); return; }
  const groups = {};
  items.forEach(p => (groups[dupMode ? (p.title || "بدون عنوان") : (p.category || "أخرى")] ||= []).push(p));
  const sel = current();
  if (!state.openCats){ state.openCats = new Set(); if (sel) state.openCats.add(sel.category || "أخرى"); }
  (dupMode ? Object.keys(groups) : CATS.concat(Object.keys(groups).filter(c => !CATS.includes(c)))).forEach(c => {
    if (!groups[c] && (q || cat)) return;
    groups[c] ||= [];
    const open = !!cat || !!q || state.openCats.has(c);
    const h = document.createElement("button"); h.type = "button"; h.className = "cat";
    h.setAttribute("aria-expanded", open ? "true" : "false");
    h.innerHTML = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
    const nm = document.createElement("span"); nm.textContent = c;
    const cn = document.createElement("span"); cn.className = "cn"; cn.textContent = groups[c].length;
    h.append(nm, cn);
    const body = document.createElement("div"); body.className = "cat-b"; body.hidden = !open;
    h.addEventListener("click", () => {
      const now = h.getAttribute("aria-expanded") !== "true";
      h.setAttribute("aria-expanded", now ? "true" : "false"); body.hidden = !now;
      if (now) state.openCats.add(c); else state.openCats.delete(c);
    });
    if (state.canWrite && !dupMode){
      h.addEventListener("dragover", e => { if (!dragId) return; e.preventDefault(); h.classList.add("drop"); });
      h.addEventListener("dragleave", () => h.classList.remove("drop"));
      h.addEventListener("drop", e => { e.preventDefault(); h.classList.remove("drop"); const pp = state.policies.find(x => x.id === dragId); dragId = null; if (pp) movePolicy(pp, c); });
    }
    if (!groups[c].length){ const e = document.createElement("div"); e.className = "cat-empty"; e.textContent = "لا توجد ملفات في هذا التصنيف."; body.append(e); }
    list.append(h, body);
    groups[c].forEach(p => {
      const b = document.createElement("button"); b.type = "button"; b.className = "item";
      b.setAttribute("aria-current", p.id === state.selectedId ? "true" : "false");
      const code = document.createElement("span"); code.className = "code"; code.textContent = p.code || "—";
      const box = document.createElement("span");
      const t = document.createElement("span"); t.className = "t"; t.textContent = p.title || "بدون عنوان";
      if (p.sample){ const s = document.createElement("span"); s.className = "tag-sample"; s.textContent = "نموذج تجريبي"; t.append(s); }
      const m = document.createElement("div"); m.className = "m"; m.textContent = "آخر تحديث " + fmtDate(p.updatedAt);
      box.append(t, m); b.append(code, box);
      b.addEventListener("click", () => selectPolicy(p.id));
      const row = document.createElement("div"); row.className = "item-row"; row.append(b);
      if (state.canWrite){
        row.draggable = true;
        row.addEventListener("dragstart", e => { dragId = p.id; row.classList.add("dragging"); try { e.dataTransfer.setData("text/plain", p.id); e.dataTransfer.effectAllowed = "move"; } catch {} });
        row.addEventListener("dragend", () => { dragId = null; row.classList.remove("dragging"); list.querySelectorAll(".cat.drop").forEach(x => x.classList.remove("drop")); });
        const mv = document.createElement("button"); mv.type = "button"; mv.className = "item-mv";
        mv.setAttribute("aria-label", "نقل " + (p.title || "السياسة") + " إلى تصنيف آخر"); mv.title = "نقل إلى تصنيف آخر";
        mv.setAttribute("aria-haspopup", "menu"); mv.setAttribute("aria-expanded", "false");
        mv.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h13l-3-3M21 17H8l3 3"/></svg>';
        mv.addEventListener("click", e => {
          e.stopPropagation();
          const was = mv.getAttribute("aria-expanded") === "true";
          closeMoveMenus(); if (was) return;
          const m = document.createElement("div"); m.className = "mv-menu"; m.setAttribute("role", "menu");
          const mh = document.createElement("div"); mh.className = "mh"; mh.textContent = "نقل إلى"; m.append(mh);
          CATS.forEach(c2 => {
            const o = document.createElement("button"); o.type = "button"; o.setAttribute("role", "menuitem");
            const here = c2 === (p.category || "أخرى"); o.textContent = c2 + (here ? " (الحالي)" : ""); o.disabled = here;
            o.addEventListener("click", ev => { ev.stopPropagation(); closeMoveMenus(); movePolicy(p, c2); });
            m.append(o);
          });
          document.body.append(m); mv.setAttribute("aria-expanded", "true");
          const r = mv.getBoundingClientRect(), mr = m.getBoundingClientRect();
          m.style.left = Math.max(8, Math.min(window.innerWidth - mr.width - 8, r.left)) + "px";
          m.style.top = (r.bottom + 4 + mr.height > window.innerHeight - 8 ? Math.max(8, r.top - 4 - mr.height) : r.bottom + 4) + "px";
          const first = m.querySelector("button:not([disabled])"); if (first) first.focus();
        });
        row.append(mv);
        const del = document.createElement("button"); del.type = "button"; del.className = "item-del";
        del.setAttribute("aria-label", "حذف " + (p.title || "السياسة")); del.title = "حذف من المكتبة";
        const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
        del.innerHTML = icon;
        let timer = null;
        del.addEventListener("click", async e => {
          e.stopPropagation();
          if (!del.classList.contains("armed")){
            list.querySelectorAll(".item-del.armed").forEach(x => { x.classList.remove("armed"); x.innerHTML = icon; });
            del.classList.add("armed"); del.textContent = "تأكيد الحذف";
            timer = setTimeout(() => { del.classList.remove("armed"); del.innerHTML = icon; }, 4000);
            return;
          }
          clearTimeout(timer); del.disabled = true;
          try {
            await deletePolicy(p.id);
            if (state.selectedId === p.id){ state.selectedId = null; state.dirty = false; $("editor").innerHTML = ""; renderChosen(); clearPreview(); }
            renderList(); setMsg("حُذفت «" + (p.title || "السياسة") + "» من المكتبة.", "ok");
          } catch (err){ del.disabled = false; setMsg(storeError(err), "err"); }
        });
        row.append(del);
      }
      body.append(row);
    });
  });
}
let dragId = null;
function closeMoveMenus(){ document.querySelectorAll(".mv-menu").forEach(m => m.remove()); document.querySelectorAll('.item-mv[aria-expanded="true"]').forEach(b => b.setAttribute("aria-expanded", "false")); }
document.addEventListener("click", e => { if (!e.target.closest(".mv-menu")) closeMoveMenus(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeMoveMenus(); });
window.addEventListener("resize", closeMoveMenus);
document.addEventListener("scroll", e => { if (!(e.target.closest && e.target.closest(".mv-menu"))) closeMoveMenus(); }, true);
async function movePolicy(p, to){
  if (!p || to === (p.category || "أخرى")) return;
  const sel = p.id === state.selectedId;
  const html = sel && state.dirty ? editorHtml() : p.html;
  try {
    await savePolicy({ ...p, category: to, html });
    if (sel){ state.dirty = false; $("saveEdits").hidden = true; }
    (state.openCats ||= new Set()).add(to);
    renderList(); renderChosen(); setMsg("نُقلت «" + (p.title || "السياسة") + "» إلى تصنيف «" + to + "».", "ok");
  } catch (e){ renderChosen(); setMsg(storeError(e), "err"); }
}
function fmtDate(s){ try { return new Date(s).toLocaleDateString("ar-SA-u-ca-gregory", { year:"numeric", month:"short", day:"numeric" }); } catch { return ""; } }

function current(){ return state.policies.find(p => p.id === state.selectedId) || null; }
function selectPolicy(id){
  /* leaving a policy with unsaved edits: keep them in the library rather than dropping them */
  const prev = current();
  if (prev && state.dirty && id !== prev.id){
    if (state.canWrite){
      const html = editorHtml();
      savePolicy({ ...prev, html }).then(() => setMsg(`حُفظت تعديلاتك على «${prev.title}» تلقائياً.`, "ok"))
        .catch(() => setMsg(`تعذّر حفظ تعديلاتك على «${prev.title}».`, "err"));
    } else if (!confirm("لديك تعديلات لم تُحفظ على هذه السياسة. هل تريد تركها؟")) return;
  }
  state.selectedId = id; state.dirty = false;
  const p = current();
  $("editor").innerHTML = p ? decoratePlaceholders(p.html || "") : ""; tbxSel = null; $("tbxBar").hidden = true; tbxLayoutAll();
  renderList(); renderChosen(); setMsg("");
  try { localStorage.setItem("assoc-policies-last", id); } catch {}
  schedulePreview(50);
}
function renderChosen(){
  const p = current(); const c = $("chosen"); c.innerHTML = "";
  const show = !!p && state.canWrite;
  $("saveEdits").hidden = !(show && state.dirty); $("editMeta").hidden = !show; $("delBtn").hidden = !show; $("histBtn").hidden = !p;
  $("moveCat").hidden = !show; $("moveLbl").hidden = !show;
  if (p){ const mc = $("moveCat"); if (![...mc.options].some(o => o.value === (p.category || "أخرى"))) mc.append(new Option(p.category, p.category)); mc.value = p.category || "أخرى"; }
  disarmDelete();
  renderApproval();
  const ab = $("abTitle"); ab.innerHTML = "";
  if (p){ ab.textContent = fillName(p.title, $("assoc").value.trim()); ab.title = ab.textContent; }
  else { const s = document.createElement("span"); s.className = "none"; s.textContent = "اختر سياسة من المكتبة"; ab.append(s); }
  if (!p){ const s = document.createElement("span"); s.className = "none"; s.textContent = "لم تُختر سياسة بعد. اختر واحدة من المكتبة."; c.append(s); return; }
  if (p.code){ const k = document.createElement("span"); k.className = "code"; k.textContent = p.code; c.append(k); }
  const h = document.createElement("h3"); h.textContent = p.title; c.append(h);
  if (p.sample){ const s = document.createElement("span"); s.className = "tag-sample"; s.textContent = "نموذج تجريبي"; c.append(s); }
}

/* placeholders shown highlighted in the editor */
function decoratePlaceholders(html){
  return blanksToPlaceholder(cleanHtml(html)).replace(NAME_RX, '<span class="ph">{اسم الجمعية}</span>');
}
function editorHtml(){
  const d = $("editor").cloneNode(true);
  // keep anything typed into the chip; the placeholder text itself is still matched by NAME_RX
  d.querySelectorAll("span.ph").forEach(s => s.replaceWith(document.createTextNode(s.textContent)));
  d.querySelectorAll(".tbox-ui, .tbox-h").forEach(x => x.remove());
  d.querySelectorAll("table.tsel").forEach(t => { t.classList.remove("tsel"); if (!t.className) t.removeAttribute("class"); });
  d.querySelectorAll(".tbox").forEach(b => { b.classList.remove("sel", "behind", "nobd"); b.removeAttribute("style"); });
  return d.innerHTML;
}

/* ---------- editor toolbar (Word-like) ---------- */
const FC_COLORS = ["#000000","#404040","#7F7F7F","#C00000","#FF0000","#FFC000","#FFFF00","#92D050","#00B050","#00B0F0","#0070C0","#002060","#7030A0","#1F4E79","#833C0B","#375623","#7F6000","#B4C6E7"];
const HL_COLORS = ["#FFFF00","#00FF00","#00FFFF","#FF00FF","#0000FF","#FF0000","#000080","#008080","#008000","#800080","#800000","#808000","#808080","#C0C0C0"];
let fcColor = "#C00000", hlColor = "#FFFF00", savedRange = null;
function saveSel(){ const s = getSelection(); if (s.rangeCount && $("editor").contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange(); }
function restoreSel(){ const ed = $("editor"); ed.focus(); if (savedRange){ const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); } }
function exec(cmd, val){
  restoreSel();
  try {
    const css = cmd === "foreColor" || cmd === "hiliteColor";
    document.execCommand("styleWithCSS", false, css);
    if (cmd === "hiliteColor" && val === "transparent"){ document.execCommand("hiliteColor", false, "transparent"); }
    else document.execCommand(cmd, false, val);
    document.execCommand("styleWithCSS", false, false);
  } catch {}
  saveSel(); markDirty(); syncToolbar();
}
function indentBlock(dir){
  restoreSel();
  const s = getSelection(); if (!s.rangeCount) return;
  let n = s.anchorNode; const ed = $("editor");
  if (n && n.nodeType === 3) n = n.parentNode;
  if (n && n.closest && n.closest("li")){ try { document.execCommand(dir > 0 ? "indent" : "outdent"); } catch {} saveSel(); markDirty(); return; }
  while (n && n !== ed && !/^(P|H1|H2|H3|H4|DIV|BLOCKQUOTE)$/.test(n.tagName)) n = n.parentNode;
  if (!n || n === ed){ try { document.execCommand("formatBlock", false, "P"); } catch {} return indentBlock(dir); }
  const cur = parseFloat(n.style.marginRight) || 0;
  const next = Math.max(0, Math.min(240, cur + dir * 40));
  n.style.marginRight = next ? next + "px" : "";
  if (!n.getAttribute("style")) n.removeAttribute("style");
  markDirty();
}
function syncToolbar(){
  const ed = $("editor"); const s = getSelection();
  if (!s.rangeCount || !ed.contains(s.anchorNode)) return;
  ["bold","italic","underline","strikeThrough","justifyRight","justifyCenter","justifyLeft","justifyFull","insertUnorderedList","insertOrderedList"].forEach(c => {
    const b = document.querySelector(`.toolbar [data-cmd="${c}"]`); let on = false;
    try { on = document.queryCommandState(c); } catch {}
    if (b) b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  let blk = ""; try { blk = (document.queryCommandValue("formatBlock") || "").toUpperCase(); } catch {}
  $("tbStyle").value = /^H[123]$/.test(blk) ? blk : "P";
}
/* the user's own colours (picked with the eyedropper or the colour picker), kept in the library so they come back next time */
let myColors = [];
try { myColors = JSON.parse(localStorage.getItem("assoc-policies-colors") || "[]"); } catch {}
function saveMyColors(){
  try { localStorage.setItem("assoc-policies-colors", JSON.stringify(myColors)); } catch {}
  if (typeof store !== "undefined" && state.mode) store.set("prefs", "colors", { list: myColors }).catch(() => {});
}
function addMyColor(c){
  c = c.toUpperCase(); if (FC_COLORS.includes(c) && HL_COLORS.includes(c)) return;
  myColors = [c, ...myColors.filter(x => x !== c)].slice(0, 18); saveMyColors(); renderPops();
}
async function loadMyColors(){
  try { const d = await store.get("prefs", "colors"); if (d && Array.isArray(d.list)){ myColors = d.list.filter(c => /^#[0-9A-F]{6}$/i.test(c)).slice(0, 18); try { localStorage.setItem("assoc-policies-colors", JSON.stringify(myColors)); } catch {} renderPops(); } } catch {}
}
const toHex = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ""); if (m) return "#" + m[1].toUpperCase(); const r = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || ""); return r ? "#" + [r[1], r[2], r[3]].map(v => (+v).toString(16).padStart(2, "0")).join("").toUpperCase() : null; };
function buildPop(id, colors, label, onPick, noneLabel){
  const p = $(id); p.innerHTML = "";
  const swatch = (c, into) => { const b = document.createElement("button"); b.type = "button"; b.className = "c"; b.style.background = c; b.title = c; b.setAttribute("aria-label", c);
    b.addEventListener("mousedown", e => e.preventDefault()); b.addEventListener("click", () => { closePops(); onPick(c); }); into.append(b); return b; };
  const l = document.createElement("div"); l.className = "pl"; l.textContent = label; p.append(l);
  colors.forEach(c => swatch(c, p));
  const ml = document.createElement("div"); ml.className = "pl"; ml.textContent = "ألواني"; p.append(ml);
  const mine = document.createElement("div"); mine.className = "pmine"; p.append(mine);
  myColors.forEach(c => {
    const w = document.createElement("span"); w.className = "mc"; swatch(c, w);
    const x = document.createElement("button"); x.type = "button"; x.className = "x"; x.textContent = "×"; x.title = "حذف من ألواني"; x.setAttribute("aria-label", "حذف " + c + " من ألواني");
    x.addEventListener("mousedown", e => e.preventDefault());
    x.addEventListener("click", e => { e.stopPropagation(); myColors = myColors.filter(y => y !== c); saveMyColors(); renderPops(); $(id).hidden = false; });
    w.append(x); mine.append(w);
  });
  const pick = c => { const h = toHex(c); if (!h) return; addMyColor(h); closePops(); onPick(h); };
  const act = document.createElement("div"); act.className = "pact";
  if ("EyeDropper" in window){
    const d = document.createElement("button"); d.type = "button"; d.title = "اسحب لوناً من أي مكان في الشاشة";
    d.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 6.5l3 3"/><path d="M16 5l1.6-1.6a2.1 2.1 0 0 1 3 3L19 8"/><path d="M15 8L6 17l-1 3 3-1 9-9"/></svg>قطّارة';
    d.addEventListener("mousedown", e => e.preventDefault());
    d.addEventListener("click", async () => { closePops(); try { const r = await new EyeDropper().open(); pick(r.sRGBHex); } catch {} });
    act.append(d);
  }
  const cl = document.createElement("label"); cl.title = "اختر أي لون";
  cl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/></svg>لون جديد';
  const inp = document.createElement("input"); inp.type = "color"; inp.value = myColors[0] || "#C00000"; inp.setAttribute("aria-label", "لون جديد");
  inp.addEventListener("change", () => pick(inp.value));
  cl.append(inp); act.append(cl); p.append(act);
  const n = document.createElement("button"); n.type = "button"; n.className = "none"; n.textContent = noneLabel;
  n.addEventListener("mousedown", e => e.preventDefault()); n.addEventListener("click", () => { closePops(); onPick(null); }); p.append(n);
}
function renderPops(){
  buildPop("pop-fc", FC_COLORS, "لون الخط", c => { if (c){ fcColor = c; $("fcSw").style.background = c; } exec("foreColor", c || "#000000"); }, "تلقائي (أسود)");
  buildPop("pop-hl", HL_COLORS, "لون التمييز", c => { if (c){ hlColor = c; $("hlSw").style.background = c; } exec("hiliteColor", c || "transparent"); }, "بدون تمييز");
}
function closePops(){ document.querySelectorAll(".tb-pop").forEach(p => p.hidden = true); }
renderPops();
document.querySelectorAll(".toolbar [data-pop]").forEach(b => {
  b.addEventListener("mousedown", e => { e.preventDefault(); saveSel(); });
  b.addEventListener("click", e => {
    e.stopPropagation(); const p = $("pop-" + b.dataset.pop); const was = !p.hidden; closePops(); if (was) return;
    p.hidden = false;
    const tb = b.closest(".toolbar").getBoundingClientRect(), r = b.getBoundingClientRect();
    p.style.top = (r.bottom - tb.top + 4) + "px";
    p.style.right = Math.max(0, tb.right - r.right) + "px"; p.style.left = "auto";
    const pr = p.getBoundingClientRect(); if (pr.left < tb.left){ p.style.right = "auto"; p.style.left = "0px"; }
  });
});
document.addEventListener("click", e => { if (!e.target.closest(".tb-pop")) closePops(); });
document.querySelectorAll(".toolbar [data-cmd]").forEach(b => b.addEventListener("mousedown", e => { e.preventDefault(); saveSel(); }));
document.querySelectorAll(".toolbar [data-cmd]").forEach(b => b.addEventListener("click", () => {
  const c = b.dataset.cmd;
  if (c === "foreColor") return exec("foreColor", fcColor);
  if (c === "hiliteColor") return exec("hiliteColor", hlColor);
  if (c === "indent" || c === "outdent") return indentBlock(c === "indent" ? 1 : -1);
  if (c === "name") return exec("insertHTML", '<span class="ph">{اسم الجمعية}</span>&nbsp;');
  if (c === "textbox") return tbxInsert();
  exec(c);
}));
/* ---------- tables: size picker, row/column tools, drag to resize ---------- */
function newTableHtml(rows, cols){
  const w = Array(cols).fill((100 / cols).toFixed(2)).join(",");
  const cg = "<colgroup>" + `<col style="width:${(100 / cols).toFixed(2)}%">`.repeat(cols) + "</colgroup>";
  return `<table data-cols="${w}">${cg}<tbody>` + ("<tr>" + "<td><br></td>".repeat(cols) + "</tr>").repeat(rows) + "</tbody></table><p><br></p>";
}
(function buildTablePicker(){
  const p = $("pop-tb"); const N = 8;
  const l = document.createElement("div"); l.className = "pl"; l.textContent = "إدراج جدول"; p.append(l);
  const cells = [];
  for (let r = 1; r <= N; r++) for (let c = 1; c <= N; c++){
    const b = document.createElement("button"); b.type = "button"; b.className = "tc"; b.dataset.r = r; b.dataset.c = c;
    b.setAttribute("aria-label", `${r} صفوف × ${c} أعمدة`);
    b.addEventListener("mousedown", e => e.preventDefault());
    b.addEventListener("mouseenter", () => mark(r, c)); b.addEventListener("focus", () => mark(r, c));
    b.addEventListener("click", () => { closePops(); exec("insertHTML", newTableHtml(r, c)); });
    cells.push(b); p.append(b);
  }
  const lab = document.createElement("div"); lab.className = "pl"; lab.style.textAlign = "center"; p.append(lab);
  function mark(r, c){ cells.forEach(b => b.classList.toggle("on", +b.dataset.r <= r && +b.dataset.c <= c)); lab.textContent = `${r} صفوف × ${c} أعمدة`; }
  mark(3, 3);
})();
/* grid of a table: map[row][col] = cell, taking colspan and rowspan into account */
function tableGrid(tbl){
  const rows = Array.from(tbl.rows); const map = rows.map(() => []);
  rows.forEach((tr, r) => {
    let c = 0;
    Array.from(tr.cells).forEach(cell => {
      while (map[r][c]) c++;
      const cs = Math.max(1, cell.colSpan || 1), rs = Math.max(1, cell.rowSpan || 1);
      for (let i = 0; i < rs && r + i < rows.length; i++) for (let j = 0; j < cs; j++) map[r + i][c + j] = cell;
      c += cs;
    });
  });
  return { rows, map, ncols: Math.max(1, ...map.map(m => m.length)) };
}
function colWidths(tbl){
  const n = tableGrid(tbl).ncols;
  const w = (tbl.getAttribute("data-cols") || "").split(",").map(Number).filter(x => x > 0);
  if (w.length === n) return w;
  // first time: measure what the browser drew
  const g = tableGrid(tbl); const out = [];
  for (let c = 0; c < n; c++){
    let px = 0;
    for (const row of g.map){ const cell = row[c]; if (cell && (cell.colSpan || 1) === 1){ px = cell.getBoundingClientRect().width; break; } }
    out.push(px || 0);
  }
  const tot = out.reduce((a, b) => a + b, 0);
  return tot > 0 && out.every(x => x > 0) ? out.map(x => x / tot * 100) : Array(n).fill(100 / n);
}
function setColWidths(tbl, w){
  const tot = w.reduce((a, b) => a + b, 0) || 1; w = w.map(x => x / tot * 100);
  tbl.setAttribute("data-cols", w.map(x => x.toFixed(2)).join(","));
  Array.from(tbl.querySelectorAll(":scope > colgroup")).forEach(g => g.remove());
  const cg = document.createElement("colgroup");
  w.forEach(x => { const col = document.createElement("col"); col.style.width = x.toFixed(2) + "%"; cg.append(col); });
  tbl.insertBefore(cg, tbl.firstChild);
}
function curCell(){
  const r = savedRange; if (!r) return null;
  let n = r.startContainer; if (n.nodeType === 3) n = n.parentNode;
  const cell = n && n.closest ? n.closest("td,th") : null;
  return cell && $("editor").contains(cell) ? cell : null;
}
function placeCaret(cell){
  if (!cell) return;
  const r = document.createRange(); r.selectNodeContents(cell); r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r); savedRange = r.cloneRange();
}
function syncTableBar(){ $("tblBar").hidden = !curCell(); }
function tableOp(op){
  const cell = curCell(); if (!cell) return;
  const tbl = cell.closest("table"); const g = tableGrid(tbl);
  const r = g.rows.indexOf(cell.parentNode); const c = g.map[r].indexOf(cell);
  const widths = colWidths(tbl);
  const mkCell = like => { const td = document.createElement(like && like.tagName === "TH" ? "th" : "td"); td.innerHTML = "<br>"; return td; };
  let focus = cell;
  if (op === "rowAbove" || op === "rowBelow"){
    const at = op === "rowAbove" ? r : r + (cell.rowSpan || 1) - 1;
    const tr = document.createElement("tr"); const ref = g.rows[at];
    for (let k = 0; k < g.ncols; k++){
      const o = g.map[at][k];
      const spansOver = o && (op === "rowAbove" ? g.rows.indexOf(o.parentNode) < at : g.rows.indexOf(o.parentNode) + (o.rowSpan || 1) - 1 > at);
      if (spansOver){ if (g.map[at][k - 1] !== o) o.rowSpan = (o.rowSpan || 1) + 1; continue; }
      tr.append(mkCell(null));
    }
    ref.parentNode.insertBefore(tr, op === "rowAbove" ? ref : ref.nextSibling);
    focus = tr.cells[Math.min(c, tr.cells.length - 1)] || cell;
  } else if (op === "colRight" || op === "colLeft"){
    // the table is right-to-left, so "right" is before this column and "left" is after it
    const at = op === "colRight" ? c : c + (cell.colSpan || 1) - 1;
    const done = new Set();
    g.rows.forEach((tr, ri) => {
      const o = g.map[ri][at]; if (!o || done.has(o)) return; done.add(o);
      const oc = g.map[ri].indexOf(o), span = o.colSpan || 1;
      const inside = op === "colRight" ? oc < at : oc + span - 1 > at;
      if (inside){ o.colSpan = span + 1; return; }
      if (g.rows.indexOf(o.parentNode) !== ri) return;
      const n = mkCell(o); tr.insertBefore(n, op === "colRight" ? o : o.nextSibling);
      if (o === cell) focus = n;
    });
    // the new column takes an average share and the others shrink in proportion
    const nw = 100 / (widths.length + 1); const k = (100 - nw) / 100;
    for (let i = 0; i < widths.length; i++) widths[i] *= k;
    widths.splice(op === "colRight" ? at : at + 1, 0, nw);
    setColWidths(tbl, widths);
  } else if (op === "delRow"){
    if (g.rows.length <= 1) return tableOp("delTable");
    const tr = g.rows[r]; const next = g.rows[r + 1] || g.rows[r - 1];
    g.map[r].forEach((o, k) => {
      if (g.map[r][k - 1] === o) return;
      const start = g.rows.indexOf(o.parentNode);
      if ((o.rowSpan || 1) > 1){
        if (start === r && g.rows[r + 1]){ // move a tall cell down into the next row
          const nr = g.rows[r + 1]; const after = Array.from(nr.cells).find(x => g.map[r + 1].indexOf(x) > k);
          o.rowSpan = o.rowSpan - 1; nr.insertBefore(o, after || null);
        } else if (start !== r) o.rowSpan = o.rowSpan - 1;
      }
    });
    tr.remove(); focus = next.cells[0];
  } else if (op === "delCol"){
    if (g.ncols <= 1) return tableOp("delTable");
    const done = new Set();
    g.rows.forEach((tr, ri) => {
      const o = g.map[ri][c]; if (!o || done.has(o)) return; done.add(o);
      if ((o.colSpan || 1) > 1) o.colSpan = o.colSpan - 1; else o.remove();
    });
    widths.splice(c, 1); setColWidths(tbl, widths);
    g.rows.forEach(tr => { if (!tr.cells.length) tr.remove(); });
    const g2 = tableGrid(tbl); focus = g2.map[Math.min(r, g2.rows.length - 1)][Math.min(c, g2.ncols - 1)];
  } else if (op === "equal"){
    setColWidths(tbl, Array(g.ncols).fill(1));
    g.rows.forEach(tr => { tr.style.height = ""; if (!tr.getAttribute("style")) tr.removeAttribute("style"); });
  } else if (op === "delTable"){
    const after = tbl.nextElementSibling; tbl.remove();
    if (after) placeCaret(after); savedRange = null; $("tblBar").hidden = true; markDirty(); return;
  }
  $("editor").focus(); placeCaret(focus); markDirty(); syncTableBar();
}
document.querySelectorAll("#tblBar [data-tbl]").forEach(b => {
  b.addEventListener("mousedown", e => { e.preventDefault(); saveSel(); });
  b.addEventListener("click", () => tableOp(b.dataset.tbl));
});
/* drag a column border or the bottom edge of a row to resize it */
(function tableResize(){
  const ed = $("editor"); const EDGE = 5; let drag = null;
  function hit(e){
    const tbl = e.target.closest && e.target.closest("table"); if (!tbl || !ed.contains(tbl)) return null;
    const tb = tbl.getBoundingClientRect();
    if (e.clientY < tb.top - EDGE || e.clientY > tb.bottom + EDGE || e.clientX < tb.left - EDGE || e.clientX > tb.right + EDGE) return null;
    for (const tr of tbl.rows){ if (Math.abs(e.clientY - tr.getBoundingClientRect().bottom) <= EDGE) return { kind: "row", tbl, tr }; }
    if (Math.abs(e.clientX - tb.left) <= EDGE) return { kind: "tw", tbl, side: "left" };
    if (Math.abs(e.clientX - tb.right) <= EDGE) return { kind: "tw", tbl, side: "right" };
    const w = colWidths(tbl); const ltr = tbl.getAttribute("dir") === "ltr"; let x = ltr ? tb.left : tb.right;
    for (let k = 0; k < w.length - 1; k++){
      x += (ltr ? 1 : -1) * w[k] / 100 * tb.width;
      if (Math.abs(e.clientX - x) <= EDGE) return { kind: "col", tbl, k, w };
    }
    return null;
  }
  ed.addEventListener("pointermove", e => {
    if (drag) return;
    const h = hit(e); ed.classList.toggle("rs-col", !!h && (h.kind === "col" || h.kind === "tw")); ed.classList.toggle("rs-row", !!h && h.kind === "row");
  });
  ed.addEventListener("pointerleave", () => { if (!drag) ed.classList.remove("rs-col", "rs-row"); });
  ed.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    const h = hit(e); if (!h) return;
    e.preventDefault();
    const cs = getComputedStyle(ed); const contentW = ed.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const ind0 = (parseFloat(h.tbl.dataset.indent) || 0) * contentW / textWidthCm();
    drag = { ...h, contentW, ind0, x0: e.clientX, y0: e.clientY, W: h.tbl.getBoundingClientRect().width, h0: h.tr ? h.tr.getBoundingClientRect().height : 0, w0: h.w ? h.w.slice() : null };
    try { ed.setPointerCapture(e.pointerId); } catch {}
  });
  ed.addEventListener("pointermove", e => {
    if (!drag) return;
    if (drag.kind === "tw"){
      /* dragging an outer edge: the edge the table is anchored to also moves the indent, the other edge only changes the width */
      const tbl = drag.tbl; const ltr = tbl.getAttribute("dir") === "ltr"; const al = tbl.dataset.align || "right";
      const anchorSide = al === "center" ? null : al; // the page is right-to-left, so "right" alignment is anchored on the right
      const out = drag.side === "left" ? drag.x0 - e.clientX : e.clientX - drag.x0; // > 0 when the edge moves outwards
      let w = drag.W, ind = drag.ind0;
      if (!anchorSide) w = drag.W + 2 * out;
      else if (drag.side === anchorSide){ w = drag.W + out; ind = Math.max(0, drag.ind0 - out); if (drag.ind0 - out < 0) w = drag.W + drag.ind0; }
      else w = drag.W + out;
      w = Math.max(drag.contentW * 0.1, Math.min(drag.contentW - (anchorSide ? ind : 0), w));
      tbl.dataset.w = String(Math.round(w / drag.contentW * 1000) / 10); tbl.dataset.wunit = "pct";
      const cm = Math.round(ind / drag.contentW * textWidthCm() * 10) / 10;
      if (cm > 0 && anchorSide) tbl.dataset.indent = String(cm); else delete tbl.dataset.indent;
      applyTableLook(tbl);
      return;
    }
    if (drag.kind === "col"){
      // right-to-left: moving the border left widens the column on its right (index k)
      const d = (drag.tbl.getAttribute("dir") === "ltr" ? e.clientX - drag.x0 : drag.x0 - e.clientX) / drag.W * 100; const w = drag.w0.slice(); const k = drag.k;
      const pair = w[k] + w[k + 1]; const MIN = 4;
      w[k] = Math.min(pair - MIN, Math.max(MIN, drag.w0[k] + d)); w[k + 1] = pair - w[k];
      setColWidths(drag.tbl, w);
    } else {
      drag.tr.style.height = Math.max(18, Math.round(drag.h0 + e.clientY - drag.y0)) + "px";
    }
  });
  const end = e => { if (!drag) return; try { ed.releasePointerCapture(e.pointerId); } catch {} drag = null; ed.classList.remove("rs-col", "rs-row"); markDirty(); };
  ed.addEventListener("pointerup", end); ed.addEventListener("pointercancel", end);
})();
/* ---------- table properties (right-click), like Word's "Table Properties" ---------- */
const CM = 567; // twips per centimetre
function textWidthCm(){
  const g = state.geom; const m = readMargins();
  const pageW = (g && g.pageW) || 11906;
  return Math.max(5, (pageW - m.left - m.right) / CM);
}
const BORDER_CSS = { single: "solid", dotted: "dotted", dashed: "dashed", double: "double" };
function tblProps(tbl){
  return {
    w: parseFloat(tbl.dataset.w) || 0, wunit: tbl.dataset.wunit === "cm" ? "cm" : "pct",
    align: tbl.dataset.align || "right", indent: parseFloat(tbl.dataset.indent) || 0,
    dir: tbl.getAttribute("dir") === "ltr" ? "ltr" : "rtl",
    border: tbl.dataset.border || "all", bline: tbl.dataset.bline || "single",
    bcolor: tbl.dataset.bcolor || "#808080", bsz: parseFloat(tbl.dataset.bsz) || 0.5,
  };
}
/* reflect the stored properties in the editor (the Word file is built from the same data attributes) */
function applyTableLook(tbl){
  const p = tblProps(tbl);
  // the editor is narrower than the page, so centimetres are shown as a share of the text width
  const tw = textWidthCm();
  tbl.style.width = p.w ? (p.wunit === "cm" ? (p.w / tw * 100).toFixed(2) + "%" : p.w + "%") : "";
  const ind = p.indent ? (p.indent / tw * 100).toFixed(2) + "%" : "";
  // the page is right-to-left, so "right" is the start edge
  tbl.style.marginRight = p.align === "right" ? ind : p.align === "center" ? "auto" : "";
  tbl.style.marginLeft = p.align === "left" ? ind : p.align === "center" ? "auto" : "";
  if (p.align === "left" && !ind) tbl.style.marginRight = "auto";
  if (p.align === "right" && !ind && p.w) tbl.style.marginLeft = "auto";
  const custom = !!(tbl.dataset.border || tbl.dataset.bline || tbl.dataset.bcolor || tbl.dataset.bsz);
  const line = `${Math.max(1, Math.round(p.bsz * 1.33))}px ${BORDER_CSS[p.bline] || "solid"} ${p.bcolor}`;
  const guide = "1px dashed var(--line)"; // shown in the editor only, so a borderless table can still be edited
  const outer = !custom ? "" : p.border === "all" || p.border === "box" ? line : "hidden";
  const inner = !custom ? "" : p.border === "all" || p.border === "inner" ? line : guide;
  tbl.style.border = outer;
  tableGrid(tbl).rows.forEach(tr => Array.from(tr.cells).forEach(td => {
    td.style.border = inner;
    if (!td.getAttribute("style")) td.removeAttribute("style");
  }));
  ["style"].forEach(a => { if (!tbl.getAttribute(a)) tbl.removeAttribute(a); });
}

/* context menu */
let ctxCell = null;
function openTableMenu(cell, x, y){
  ctxCell = cell; closePops();
  const m = $("tctx"); m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(x - r.width, innerWidth - r.width - 4)) + "px";
  m.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + "px";
  m.querySelector("button").focus({ preventScroll: true });
}
function closeTableMenu(){ $("tctx").hidden = true; }
$("editor").addEventListener("contextmenu", e => {
  const cell = e.target.closest && e.target.closest("td,th");
  if (!cell || !$("editor").contains(cell)) return;
  e.preventDefault();
  const s = getSelection(); if (!s.rangeCount || !cell.contains(s.anchorNode)) placeCaret(cell); else saveSel();
  openTableMenu(cell, e.clientX, e.clientY);
});
document.addEventListener("pointerdown", e => { if (!e.target.closest("#tctx")) closeTableMenu(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeTableMenu(); });
window.addEventListener("scroll", closeTableMenu, true);
$("tctx").addEventListener("mousedown", e => e.preventDefault());
$("tctx").addEventListener("click", e => {
  const b = e.target.closest("[data-tctx]"); if (!b) return;
  closeTableMenu(); const op = b.dataset.tctx;
  if (op === "props" || op === "borders") return openTableProps(ctxCell, op === "borders" ? "borders" : "table");
  if (op === "copyTable" || op === "cutTable") return tblCopy(ctxCell && ctxCell.closest("table"), op === "cutTable");
  if (ctxCell) placeCaret(ctxCell);
  tableOp(op);
});

/* the dialog */
const tp = { tbl: null, cell: null, row: 0, col: 0, snap: null };
function tpTab(name){
  document.querySelectorAll("#tpdlg [data-tp]").forEach(t => t.setAttribute("aria-selected", t.dataset.tp === name ? "true" : "false"));
  document.querySelectorAll("#tpdlg [data-tpp]").forEach(s => s.hidden = s.dataset.tpp !== name);
}
document.querySelectorAll("#tpdlg [data-tp]").forEach(t => t.addEventListener("click", () => { tpCommit(); tpTab(t.dataset.tp); tpLoad(); }));
const tblWidthCm = tbl => { const p = tblProps(tbl); return p.w ? (p.wunit === "cm" ? p.w : p.w / 100 * textWidthCm()) : textWidthCm(); };
const radio = (name, v) => { const r = document.querySelector(`#tpdlg input[name="${name}"][value="${v}"]`); if (r) r.checked = true; };
const radioVal = name => (document.querySelector(`#tpdlg input[name="${name}"]:checked`) || {}).value;
const r1 = v => Math.round(v * 10) / 10;
function openTableProps(cell, tab){
  if (!cell) return;
  const tbl = cell.closest("table"); const g = tableGrid(tbl);
  Object.assign(tp, { tbl, cell, row: g.rows.indexOf(cell.parentNode), col: g.map[g.rows.indexOf(cell.parentNode)].indexOf(cell), snap: tbl.cloneNode(true) });
  if (!tbl.getAttribute("data-cols")) setColWidths(tbl, colWidths(tbl));
  tpLoad(true); tpTab(tab || "table");
  $("tpdlg").hidden = false; document.querySelector("#tpdlg [aria-selected=true]").focus();
}
function tpLoad(all){
  const { tbl } = tp; if (!tbl) return; const p = tblProps(tbl); const g = tableGrid(tbl);
  // table
  $("tpWOn").checked = !!p.w; $("tpWUnit").value = p.wunit; $("tpW").value = p.w ? p.w : (p.wunit === "cm" ? r1(textWidthCm()) : 100);
  $("tpW").disabled = $("tpWUnit").disabled = !p.w;
  radio("tpAlign", p.align); $("tpInd").value = p.indent; $("tpInd").disabled = p.align === "center"; radio("tpDir", p.dir);
  // row
  const tr = g.rows[tp.row]; const h = parseFloat(tr.style.height) || 0;
  $("tpRowLbl").textContent = `الصف ${tp.row + 1} من ${g.rows.length}`;
  $("tpHOn").checked = !!h; $("tpH").value = h ? r1(h / 37.8) : 0.8; $("tpH").disabled = $("tpHRule").disabled = !h;
  $("tpHRule").value = tr.dataset.hrule === "exact" ? "exact" : "atLeast";
  $("tpSplit").checked = tr.dataset.nosplit !== "1"; $("tpHead").checked = tr.dataset.header === "1";
  $("tpRowPrev").disabled = tp.row === 0; $("tpRowNext").disabled = tp.row >= g.rows.length - 1;
  // column and cell
  const w = colWidths(tbl); const tw = tblWidthCm(tbl);
  $("tpColLbl").textContent = `العمود ${tp.col + 1} من ${g.ncols}`;
  $("tpCW").value = r1(w[tp.col] / 100 * tw);
  $("tpColPrev").disabled = tp.col === 0; $("tpColNext").disabled = tp.col >= g.ncols - 1;
  const cell = g.map[tp.row][tp.col] || tp.cell; tp.cell = cell;
  const span = w.slice(tp.col, tp.col + (cell.colSpan || 1)).reduce((a, b) => a + b, 0);
  $("tpCellW").value = r1(span / 100 * tw);
  radio("tpVA", cell.dataset.valign || "top");
  // borders and shading
  radio("tpB", p.border); $("tpBLine").value = p.bline; $("tpBSz").value = String(p.bsz); $("tpBColor").value = p.bcolor;
  $("tpShade").value = toHex(cell.style.backgroundColor) || "#D9D9D9";
  // alt text
  if (all){ $("tpAltT").value = tbl.dataset.title || ""; $("tpAltD").value = tbl.dataset.desc || ""; }
}
function setColCm(i, cm){
  const { tbl } = tp; const w = colWidths(tbl); const tw = tblWidthCm(tbl); const n = w.length;
  if (!(cm > 0) || n < 2) return;
  const want = Math.min(95, Math.max(3, cm / tw * 100)); const rest = 100 - want;
  const others = w.reduce((a, b, k) => k === i ? a : a + b, 0) || 1;
  setColWidths(tbl, w.map((v, k) => k === i ? want : v / others * rest));
}
function tpCommit(){
  const { tbl } = tp; if (!tbl) return; const g = tableGrid(tbl);
  const sel = document.querySelector("#tpdlg [aria-selected=true]").dataset.tp;
  if (sel === "table"){
    const on = $("tpWOn").checked; const v = parseFloat($("tpW").value) || 0;
    if (on && v > 0){ tbl.dataset.w = String(v); tbl.dataset.wunit = $("tpWUnit").value; } else { delete tbl.dataset.w; delete tbl.dataset.wunit; }
    const al = radioVal("tpAlign") || "right"; if (al === "right") delete tbl.dataset.align; else tbl.dataset.align = al;
    const ind = parseFloat($("tpInd").value) || 0; if (ind > 0 && al !== "center") tbl.dataset.indent = String(ind); else delete tbl.dataset.indent;
    if (radioVal("tpDir") === "ltr") tbl.setAttribute("dir", "ltr"); else tbl.removeAttribute("dir");
  } else if (sel === "row"){
    const tr = g.rows[tp.row];
    if ($("tpHOn").checked && parseFloat($("tpH").value) > 0){
      tr.style.height = Math.round(parseFloat($("tpH").value) * 37.8) + "px";
      if ($("tpHRule").value === "exact") tr.dataset.hrule = "exact"; else delete tr.dataset.hrule;
    } else { tr.style.height = ""; delete tr.dataset.hrule; }
    if ($("tpSplit").checked) delete tr.dataset.nosplit; else tr.dataset.nosplit = "1";
    if ($("tpHead").checked) tr.dataset.header = "1"; else delete tr.dataset.header;
    if (!tr.getAttribute("style")) tr.removeAttribute("style");
  } else if (sel === "col"){
    const cm = parseFloat($("tpCW").value); const w = colWidths(tbl);
    if (Math.abs(cm - r1(w[tp.col] / 100 * tblWidthCm(tbl))) > 0.05) setColCm(tp.col, cm);
  } else if (sel === "cell"){
    const cell = tp.cell; const va = radioVal("tpVA") || "top";
    if (va === "top"){ delete cell.dataset.valign; cell.style.verticalAlign = ""; } else { cell.dataset.valign = va; cell.style.verticalAlign = va; }
    const cm = parseFloat($("tpCellW").value);
    if ((cell.colSpan || 1) === 1){ const w = colWidths(tbl); if (Math.abs(cm - r1(w[tp.col] / 100 * tblWidthCm(tbl))) > 0.05) setColCm(tp.col, cm); }
    if (!cell.getAttribute("style")) cell.removeAttribute("style");
  } else if (sel === "borders"){
    tbl.dataset.border = radioVal("tpB") || "all"; tbl.dataset.bline = $("tpBLine").value;
    tbl.dataset.bsz = $("tpBSz").value; tbl.dataset.bcolor = $("tpBColor").value.toUpperCase();
  } else if (sel === "alt"){
    const t = $("tpAltT").value.trim(), d = $("tpAltD").value.trim();
    if (t) tbl.dataset.title = t; else delete tbl.dataset.title;
    if (d) tbl.dataset.desc = d; else delete tbl.dataset.desc;
  }
  applyTableLook(tbl);
}
function shadeCells(color){
  const { tbl } = tp; const g = tableGrid(tbl); const to = $("tpShadeTo").value; const set = new Set();
  g.map.forEach((row, ri) => row.forEach((c, ci) => {
    if (to === "table" || (to === "row" && ri === tp.row) || (to === "col" && ci === tp.col) || (to === "cell" && c === tp.cell)) set.add(c);
  }));
  set.forEach(c => { c.style.backgroundColor = color || ""; if (!c.getAttribute("style")) c.removeAttribute("style"); });
}
$("tpShadeApply").addEventListener("click", () => shadeCells($("tpShade").value));
$("tpShadeNone").addEventListener("click", () => shadeCells(""));
$("tpWOn").addEventListener("change", () => { $("tpW").disabled = $("tpWUnit").disabled = !$("tpWOn").checked; });
$("tpWUnit").addEventListener("change", () => {
  const v = parseFloat($("tpW").value) || 0; const tw = textWidthCm();
  $("tpW").value = $("tpWUnit").value === "cm" ? r1(v / 100 * tw) : Math.round(v / tw * 100);
});
$("tpHOn").addEventListener("change", () => { $("tpH").disabled = $("tpHRule").disabled = !$("tpHOn").checked; });
document.querySelectorAll('#tpdlg input[name="tpAlign"]').forEach(r => r.addEventListener("change", () => { $("tpInd").disabled = radioVal("tpAlign") === "center"; }));
const tpMove = (k, d) => () => { tpCommit(); const g = tableGrid(tp.tbl); tp[k] = Math.max(0, Math.min((k === "row" ? g.rows.length : g.ncols) - 1, tp[k] + d)); tpLoad(); };
$("tpRowPrev").addEventListener("click", tpMove("row", -1)); $("tpRowNext").addEventListener("click", tpMove("row", 1));
$("tpColPrev").addEventListener("click", tpMove("col", -1)); $("tpColNext").addEventListener("click", tpMove("col", 1));
function closeTableProps(ok){
  if (!tp.tbl) return;
  if (ok){ tpCommit(); markDirty(); }
  else if (tp.snap){ tp.tbl.replaceWith(tp.snap); }
  $("tpdlg").hidden = true; const c = ok ? tp.cell : null; tp.tbl = null;
  $("editor").focus(); if (c && c.isConnected) placeCaret(c);
}
$("tpOk").addEventListener("click", () => closeTableProps(true));
["tpCancel", "tpX"].forEach(id => $(id).addEventListener("click", () => closeTableProps(false)));
$("tpdlg").addEventListener("click", e => { if (e.target === $("tpdlg")) closeTableProps(false); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("tpdlg").hidden) closeTableProps(false); });


/* Word-style "+" markers: on the table's start edge between rows to add a row, above it between columns to add a column */
(function tablePlus(){
  const ed = $("editor"), plus = $("tplus"), line = $("tplusLine"); const ZONE = 26, NEAR = 9; let at = null;
  function hide(){ plus.hidden = true; line.hidden = true; at = null; }
  function find(x, y){
    for (const tbl of ed.querySelectorAll("table")){
      const r = tbl.getBoundingClientRect(); if (!r.height) continue;
      const ltr = tbl.getAttribute("dir") === "ltr";
      const sideIn = ltr ? x <= r.left && x >= r.left - ZONE : x >= r.right && x <= r.right + ZONE;
      if (sideIn && y >= r.top - NEAR && y <= r.bottom + NEAR){
        const rows = Array.from(tbl.rows); const ys = rows.map(tr => tr.getBoundingClientRect().top).concat(r.bottom);
        let best = -1, d = NEAR + 1; ys.forEach((v, i) => { if (Math.abs(v - y) < d){ d = Math.abs(v - y); best = i; } });
        if (best >= 0) return { kind: "row", tbl, i: best, x: ltr ? r.left - 12 : r.right + 12, y: ys[best], r };
      }
      if (y <= r.top && y >= r.top - ZONE && x >= r.left - NEAR && x <= r.right + NEAR){
        const w = colWidths(tbl); const xs = [ltr ? r.left : r.right]; let cx = xs[0];
        w.forEach(v => { cx += (ltr ? 1 : -1) * v / 100 * r.width; xs.push(cx); });
        let best = -1, d = NEAR + 1; xs.forEach((v, i) => { if (Math.abs(v - x) < d){ d = Math.abs(v - x); best = i; } });
        if (best >= 0) return { kind: "col", tbl, i: best, x: xs[best], y: r.top - 12, r };
      }
    }
    return null;
  }
  document.addEventListener("pointermove", e => {
    if (e.target === plus || plus.contains(e.target)) return;
    if (!$("tpdlg").hidden || document.body.classList.contains("tmoving")){ hide(); return; }
    const h = find(e.clientX, e.clientY); if (!h){ hide(); return; }
    at = h; plus.hidden = false; line.hidden = false;
    plus.style.left = (h.x - 10) + "px"; plus.style.top = (h.y - 10) + "px";
    if (h.kind === "row"){
      plus.title = "إضافة صف هنا"; plus.setAttribute("aria-label", "إضافة صف هنا");
      Object.assign(line.style, { left: h.r.left + "px", top: (h.y - 1) + "px", width: h.r.width + "px", height: "2px" });
    } else {
      plus.title = "إضافة عمود هنا"; plus.setAttribute("aria-label", "إضافة عمود هنا");
      Object.assign(line.style, { left: (h.x - 1) + "px", top: h.r.top + "px", width: "2px", height: h.r.height + "px" });
    }
  });
  window.addEventListener("scroll", hide, true);
  plus.addEventListener("mousedown", e => e.preventDefault());
  plus.addEventListener("click", () => {
    if (!at) return; const { kind, tbl, i } = at; const g = tableGrid(tbl);
    if (kind === "row"){
      const last = i >= g.rows.length; const tr = g.rows[last ? g.rows.length - 1 : i];
      placeCaret(tr.cells[0]); tableOp(last ? "rowBelow" : "rowAbove");
    } else {
      const last = i >= g.ncols; const cell = g.map[0][last ? g.ncols - 1 : i];
      placeCaret(cell); tableOp(last ? "colLeft" : "colRight");
    }
    hide();
  });
})();
/* move handle: drag a table to another place in the text */
(function tableMove(){
  const ed = $("editor"); const h = $("tmove"); const line = $("tdrop"); let cur = null, mv = null, hideT = null;
  function show(tbl){
    clearTimeout(hideT); cur = tbl; const r = tbl.getBoundingClientRect();
    h.style.left = (r.right + 6) + "px"; h.style.top = (r.top - 26) + "px"; h.hidden = false;
  }
  function hideSoon(){ clearTimeout(hideT); hideT = setTimeout(() => { if (!mv) h.hidden = true; }, 400); }
  ed.addEventListener("pointerover", e => { const t = e.target.closest && e.target.closest("table"); if (t && ed.contains(t)) show(t); });
  ed.addEventListener("pointerleave", hideSoon);
  ed.addEventListener("pointerout", e => { const t = e.target.closest && e.target.closest("table"); if (t && !(e.relatedTarget && t.contains(e.relatedTarget)) && e.relatedTarget !== h) hideSoon(); });
  h.addEventListener("pointerenter", () => clearTimeout(hideT));
  h.addEventListener("pointerleave", hideSoon);
  window.addEventListener("scroll", () => { if (!mv) h.hidden = true; }, true);
  h.addEventListener("contextmenu", e => { e.preventDefault(); if (!cur) return; const c = cur.querySelector("td,th"); if (c){ placeCaret(c); openTableMenu(c, e.clientX, e.clientY); } });
  const blocks = () => Array.from(ed.children).filter(b => b !== cur);
  function target(y){
    const bs = blocks(); for (const b of bs){ const r = b.getBoundingClientRect(); if (y < r.top + r.height / 2) return { before: b, y: r.top }; }
    const last = bs[bs.length - 1]; return { before: null, y: last ? last.getBoundingClientRect().bottom : ed.getBoundingClientRect().top };
  }
  h.addEventListener("pointerdown", e => {
    if (e.button !== 0 || !cur) return; e.preventDefault();
    mv = { tbl: cur, to: null, x0: e.clientX, y0: e.clientY, far: false }; h.setPointerCapture(e.pointerId); document.body.classList.add("tmoving");
  });
  h.addEventListener("pointermove", e => {
    if (!mv) return;
    if (!mv.far){ if (Math.hypot(e.clientX - mv.x0, e.clientY - mv.y0) < 5) return; mv.far = true; }
    const er = ed.getBoundingClientRect();
    if (e.clientY < er.top + 20) ed.scrollTop -= 12; else if (e.clientY > er.bottom - 20) ed.scrollTop += 12;
    mv.to = target(e.clientY);
    Object.assign(line.style, { left: er.left + 12 + "px", width: er.width - 24 + "px", top: mv.to.y - 2 + "px" }); line.hidden = false;
    h.style.left = (e.clientX - 11) + "px"; h.style.top = (e.clientY - 11) + "px";
  });
  const end = e => {
    if (!mv) return; try { h.releasePointerCapture(e.pointerId); } catch {}
    document.body.classList.remove("tmoving"); line.hidden = true;
    const { tbl, to, far } = mv; mv = null;
    if (!far){ tblSelect(tbl); show(tbl); return; } // a plain click selects the whole table
    if (to && to.before !== tbl.nextElementSibling && to.before !== tbl){
      if (to.before) ed.insertBefore(tbl, to.before); else ed.append(tbl);
      // never leave the table as the last thing with nowhere to type after it
      if (!tbl.nextElementSibling){ const p = document.createElement("p"); p.innerHTML = "<br>"; ed.append(p); }
      markDirty();
    }
    show(tbl);
  };
  h.addEventListener("pointerup", end); h.addEventListener("pointercancel", end);
})();
/* select a whole table (click its move handle), then Ctrl+C / Ctrl+X / Ctrl+V like Word */
var tblSel = null, tblClip = null;
/* put a table or text box on the real clipboard (works inside the page frame, no permission needed), marked so a paste knows it */
function clipWrite(kind, html, text){
  let ok = false;
  const h = ev => { ev.preventDefault(); ev.stopImmediatePropagation(); ev.clipboardData.setData("text/html", `<div data-zclip="${kind}">${html}</div>`); ev.clipboardData.setData("text/plain", text); ok = true; };
  document.addEventListener("copy", h, true);
  try { document.execCommand("copy"); } catch {}
  document.removeEventListener("copy", h, true);
  if (!ok) try { navigator.clipboard && navigator.clipboard.writeText(text).catch(() => {}); } catch {}
  return ok;
}
function clipRead(e, kind){
  const html = e.clipboardData ? e.clipboardData.getData("text/html") : "";
  if (!html || !html.includes(`data-zclip="${kind}"`)) return null;
  const d = document.createElement("div"); d.innerHTML = html; const m = d.querySelector(`[data-zclip="${kind}"]`);
  return m && m.firstElementChild ? m.firstElementChild.outerHTML : null;
}
function tblSelect(tbl){
  tblDeselect(); tblSel = tbl; tbl.classList.add("tsel");
  try { const r = document.createRange(); r.selectNode(tbl); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch {}
  setMsg("حُدّد الجدول كاملاً: Ctrl+C للنسخ، Ctrl+X للقص، ثم ضع المؤشر في مكان آخر واضغط Ctrl+V.", "ok");
}
function tblDeselect(){ if (tblSel){ tblSel.classList.remove("tsel"); if (!tblSel.className) tblSel.removeAttribute("class"); } tblSel = null; }
function tblCopy(tbl, cut){
  if (!tbl) return;
  const c = tbl.cloneNode(true); c.classList.remove("tsel"); if (!c.className) c.removeAttribute("class");
  const first = (tbl.querySelector("td,th") || tbl).textContent.trim().slice(0, 30);
  tblClip = { html: c.outerHTML, text: "⟦جدول⟧ " + first }; tbxClip = null;
  clipWrite("table", tblClip.html, tblClip.text);
  if (cut){
    const ed = $("editor"); const next = tbl.nextElementSibling; tblDeselect(); tbl.remove();
    if (!ed.children.length){ const p = document.createElement("p"); p.innerHTML = "<br>"; ed.append(p); }
    $("tmove").hidden = true; markDirty();
    const tgt = next && next.parentNode === ed ? next : ed.lastElementChild; if (tgt){ const r = document.createRange(); r.selectNodeContents(tgt); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    setMsg("قُصّ الجدول. ضع المؤشر حيث تريد واضغط Ctrl+V.", "ok");
  } else { tblDeselect(); setMsg("نُسخ الجدول. ضع المؤشر حيث تريد واضغط Ctrl+V.", "ok"); }
}
function tblPaste(after){
  if (!tblClip) return false;
  const ed = $("editor"); const t = document.createElement("div"); t.innerHTML = tblClip.html; const tbl = t.firstElementChild; if (!tbl) return false;
  let n = after || null;
  if (!n){
    const s = getSelection(); n = s.rangeCount && ed.contains(s.anchorNode) ? s.anchorNode : (savedRange ? savedRange.startContainer : null);
    if (n && n.nodeType === 3) n = n.parentNode;
    while (n && n !== ed && n.parentNode !== ed) n = n.parentNode;
    if (n === ed) n = null;
  }
  // an empty line is replaced by the table, otherwise the table goes under the current line
  if (n && n.tagName === "P" && !n.textContent.trim() && !n.querySelector("img,table,.tbox-wrap")){ n.replaceWith(tbl); }
  else if (n) n.after(tbl); else ed.append(tbl);
  if (!tbl.nextElementSibling){ const p = document.createElement("p"); p.innerHTML = "<br>"; ed.append(p); }
  tblDeselect(); const c = tbl.querySelector("td,th"); if (c) placeCaret(c);
  markDirty(); return true;
}
document.addEventListener("keydown", e => {
  if (!tblSel) return;
  if (!document.contains(tblSel)){ tblSel = null; return; }
  const k = (e.key || "").toLowerCase(), code = e.code, mod = (e.ctrlKey || e.metaKey) && !e.altKey;
  if (mod && (k === "c" || code === "KeyC")){ e.preventDefault(); tblCopy(tblSel, false); }
  else if (mod && (k === "x" || code === "KeyX")){ e.preventDefault(); tblCopy(tblSel, true); }
  else if (mod && (k === "v" || code === "KeyV")){ e.preventDefault(); const at = tblSel; tblPaste(at); }
  else if (e.key === "Delete" || e.key === "Backspace"){ e.preventDefault(); const t = tblSel; tblDeselect(); t.remove(); $("tmove").hidden = true; markDirty(); }
  else if (e.key === "Escape") tblDeselect();
  else if (!["Shift","Control","Meta","Alt"].includes(e.key)) tblDeselect();
}, true);
document.addEventListener("pointerdown", e => { if (tblSel && !e.target.closest("#tmove")) tblDeselect(); });
$("editor").addEventListener("paste", e => {
  const html = clipRead(e, "table");
  if (!html) return;
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest(".tbox-in")) return;
  e.preventDefault(); e.stopImmediatePropagation(); tblClip = { html, text: "" }; tblPaste();
});
document.addEventListener("copy", () => { tblClip = null; });
/* ---------- text boxes: a floating box anchored above the paragraph that follows it, in front of or behind the text ---------- */
const TBX_DEF = { w: 6, h: 3, border: "#000000", bw: 0.75, fill: "#FFFFFF", z: "front" };
function tbxPxPerCm(){
  const ed = $("editor"); const cs = getComputedStyle(ed);
  const w = ed.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  return w > 0 ? w / textWidthCm() : 37.8;
}
function tbxData(box){
  const d = box.dataset; const n = (k, def) => { const v = parseFloat(d[k]); return isFinite(v) ? v : def; };
  return { x: n("x", 0), y: n("y", 0), w: n("w", TBX_DEF.w), h: n("h", TBX_DEF.h), z: d.z === "behind" ? "behind" : "front",
           border: d.border || TBX_DEF.border, bw: n("bw", TBX_DEF.bw), fill: d.fill || TBX_DEF.fill };
}
function tbxLayout(box, k = tbxPxPerCm()){
  const t = tbxData(box);
  Object.assign(box.style, {
    right: (t.x * k) + "px", top: (t.y * k) + "px", width: (t.w * k) + "px", height: (t.h * k) + "px",
    border: t.border === "none" ? "0" : `${Math.max(1, Math.round(t.bw * 1.33))}px solid ${t.border}`,
    background: t.fill === "none" ? "transparent" : t.fill, padding: `${0.127 * k}px ${0.254 * k}px`,
  });
  box.classList.toggle("behind", t.z === "behind");
  box.classList.toggle("nobd", t.border === "none");
  const g = box.parentNode.querySelector(":scope > .tbox-grip");
  if (g){ g.style.right = (t.x * k - 10) + "px"; g.style.top = (t.y * k - 10) + "px"; }
}
function tbxLayoutAll(){ const k = tbxPxPerCm(); $("editor").querySelectorAll(".tbox").forEach(b => { tbxEnsureUi(b); tbxLayout(b, k); }); }
function tbxEnsureUi(box){
  const wrap = box.parentNode;
  wrap.setAttribute("contenteditable", "false");
  let inner = box.querySelector(":scope > .tbox-in");
  if (!inner){ inner = document.createElement("div"); inner.className = "tbox-in"; while (box.firstChild) inner.append(box.firstChild); box.append(inner); }
  inner.setAttribute("contenteditable", "true");
  if (!wrap.querySelector(":scope > .tbox-grip")){
    const g = document.createElement("span"); g.className = "tbox-grip tbox-ui"; g.title = "اسحب لتحريك مربع النص، أو اضغط لتحديده";
    g.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg>';
    wrap.append(g);
  }
}
function tbxInsert(){
  restoreSel();
  const ed = $("editor"); let n = savedRange ? savedRange.startContainer : null;
  if (n && n.nodeType === 3) n = n.parentNode;
  while (n && n.parentNode !== ed) n = n.parentNode;
  if (n && n.closest && n.closest(".tbox-wrap")) n = n.closest(".tbox-wrap").nextElementSibling;
  if (!n){ n = document.createElement("p"); n.innerHTML = "<br>"; ed.append(n); }
  const wrap = document.createElement("div"); wrap.className = "tbox-wrap";
  const k = tbxPxPerCm(); const tw = textWidthCm();
  const x = Math.max(0, Math.round((tw - TBX_DEF.w) / 2 * 10) / 10);
  wrap.innerHTML = `<div class="tbox" data-x="${x}" data-y="0" data-w="${TBX_DEF.w}" data-h="${TBX_DEF.h}" data-z="front" data-border="${TBX_DEF.border}" data-bw="${TBX_DEF.bw}" data-fill="${TBX_DEF.fill}"><div class="tbox-in"><p>اكتب النص هنا</p></div></div>`;
  ed.insertBefore(wrap, n);
  const box = wrap.firstChild; tbxEnsureUi(box); tbxLayout(box, k); tbxSelect(box);
  const inner = box.querySelector(".tbox-in"); const r = document.createRange(); r.selectNodeContents(inner.querySelector("p")); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  inner.focus(); markDirty();
}

/* selection, move and resize */
var tbxSel = null, tbxWhole = false;
function tbxSelect(box){
  if (tbxSel === box) return tbxShowBar();
  tbxDeselect(); tbxSel = box; box.classList.add("sel");
  ["n","s","e","w","ne","nw","se","sw"].forEach(d => { const h = document.createElement("span"); h.className = "tbox-h tbox-ui h-" + d; h.dataset.dir = d; box.append(h); });
  tbxShowBar();
}
function tbxSelectWhole(){
  tbxWhole = true; const a = document.activeElement; if (a && a.closest && a.closest(".tbox-in")) a.blur();
  try { getSelection().removeAllRanges(); } catch {}
}
function tbxDeselect(){
  tbxWhole = false;
  if (!tbxSel) return;
  tbxSel.classList.remove("sel"); tbxSel.querySelectorAll(":scope > .tbox-h").forEach(h => h.remove());
  tbxSel = null; $("tbxBar").hidden = true;
}
function tbxShowBar(){
  const box = tbxSel; if (!box) return; const t = tbxData(box); const bar = $("tbxBar");
  bar.querySelectorAll("[data-tz]").forEach(b => b.setAttribute("aria-pressed", b.dataset.tz === t.z ? "true" : "false"));
  $("tbxBNone").checked = t.border === "none"; $("tbxBColor").value = t.border === "none" ? "#000000" : t.border; $("tbxBColor").disabled = t.border === "none";
  $("tbxBW").value = String(t.bw); $("tbxBW").disabled = t.border === "none";
  $("tbxFNone").checked = t.fill === "none"; $("tbxFColor").value = t.fill === "none" ? "#FFFFFF" : t.fill; $("tbxFColor").disabled = t.fill === "none";
  bar.hidden = false; tbxPlaceBar();
}
function tbxPlaceBar(){
  if (!tbxSel) return; const bar = $("tbxBar"); const r = tbxSel.getBoundingClientRect(); const b = bar.getBoundingClientRect();
  let top = r.top - b.height - 14; if (top < 8) top = r.bottom + 14;
  bar.style.top = top + "px"; bar.style.left = Math.max(8, Math.min(innerWidth - b.width - 8, r.right - b.width)) + "px";
}
function tbxSet(patch){
  if (!tbxSel) return; Object.entries(patch).forEach(([k, v]) => { tbxSel.dataset[k] = String(v); });
  tbxLayout(tbxSel); tbxShowBar(); markDirty();
}
document.querySelectorAll("#tbxBar [data-tz]").forEach(b => b.addEventListener("click", () => tbxSet({ z: b.dataset.tz })));
$("tbxBNone").addEventListener("change", () => tbxSet({ border: $("tbxBNone").checked ? "none" : $("tbxBColor").value.toUpperCase() }));
$("tbxBColor").addEventListener("input", () => tbxSet({ border: $("tbxBColor").value.toUpperCase() }));
$("tbxBW").addEventListener("change", () => tbxSet({ bw: $("tbxBW").value }));
$("tbxFNone").addEventListener("change", () => tbxSet({ fill: $("tbxFNone").checked ? "none" : $("tbxFColor").value.toUpperCase() }));
$("tbxFColor").addEventListener("input", () => tbxSet({ fill: $("tbxFColor").value.toUpperCase() }));
$("tbxDel").addEventListener("click", () => { if (!tbxSel) return; const w = tbxSel.parentNode; tbxDeselect(); w.remove(); markDirty(); });
/* copy, cut and paste a whole box (Ctrl+C / Ctrl+X / Ctrl+V while the box itself is selected, not its text) */
let tbxClip = null;
function tbxClean(wrap){
  const c = wrap.cloneNode(true);
  c.querySelectorAll(".tbox-ui, .tbox-h").forEach(x => x.remove());
  c.querySelectorAll(".tbox").forEach(b => { b.classList.remove("sel", "behind", "nobd"); b.removeAttribute("style"); });
  c.removeAttribute("style"); return c.outerHTML;
}
function tbxCopy(cut){
  if (!tbxSel) return; const w = tbxSel.parentNode;
  tblClip = null; tbxClip = { html: tbxClean(w), text: "⟦مربع نص⟧ " + tbxSel.textContent.trim() };
  clipWrite("box", tbxClip.html, tbxClip.text);
  if (cut){ tbxDeselect(); w.remove(); markDirty(); setMsg("قُصّ مربع النص. ضع المؤشر حيث تريد واضغط Ctrl+V.", "ok"); }
  else setMsg("نُسخ مربع النص. اضغط Ctrl+V للصقه.", "ok");
}
function tbxPaste(){
  if (!tbxClip) return false;
  const t = document.createElement("div"); t.innerHTML = tbxClip.html; const wrap = t.firstElementChild; if (!wrap) return false;
  const box = wrap.querySelector(".tbox"); const ed = $("editor");
  if (tbxSel){
    // pasting while a box is selected puts the copy beside it, shifted a little so both show
    const src = tbxSel.parentNode; const d = tbxData(tbxSel);
    box.dataset.x = String(Math.max(0, Math.round((d.x + 0.5) * 100) / 100)); box.dataset.y = String(Math.round((d.y + 0.5) * 100) / 100);
    src.after(wrap);
  } else {
    let n = null; const s = getSelection();
    if (s.rangeCount && ed.contains(s.anchorNode)) n = s.anchorNode; else if (savedRange) n = savedRange.startContainer;
    if (n && n.nodeType === 3) n = n.parentNode;
    if (n && n.closest && n.closest(".tbox-wrap")) n = n.closest(".tbox-wrap");
    while (n && n !== ed && n.parentNode !== ed) n = n.parentNode;
    if (!n || n === ed){ n = document.createElement("p"); n.innerHTML = "<br>"; ed.append(n); }
    ed.insertBefore(wrap, n);
  }
  tbxEnsureUi(box); tbxLayout(box); tbxDeselect(); tbxSelect(box); tbxSelectWhole(); markDirty();
  return true;
}
$("tbxCopy").addEventListener("click", () => tbxCopy(false));
$("tbxCut").addEventListener("click", () => tbxCopy(true));
$("tbxPaste").addEventListener("click", () => tbxPaste());
document.addEventListener("copy", () => { tbxClip = null; });
document.addEventListener("cut", e => { if (!(e.target.closest && e.target.closest(".tbox-wrap") && !document.activeElement.closest(".tbox-in"))) tbxClip = null; });
$("editor").addEventListener("paste", e => {
  const html = clipRead(e, "box");
  if (!html) return;
  const editing = document.activeElement && document.activeElement.closest && document.activeElement.closest(".tbox-in");
  e.preventDefault(); tbxClip = { html, text: "" }; if (editing) tbxDeselect(); tbxPaste();
});
$("tbxBar").addEventListener("mousedown", e => { if (!e.target.closest("input,select")) e.preventDefault(); });

(function tbxPointer(){
  const ed = $("editor"); let op = null;
  ed.addEventListener("pointerdown", e => {
    const grip = e.target.closest(".tbox-grip"); const handle = e.target.closest(".tbox-h");
    const box = grip ? grip.parentNode.querySelector(":scope > .tbox") : e.target.closest(".tbox");
    if (!box){ return; }
    const inInner = !grip && !handle && e.target.closest(".tbox-in");
    tbxSelect(box);
    if (inInner){ tbxWhole = false; return; } // clicking the text edits it
    e.preventDefault(); tbxSelectWhole();
    const t = tbxData(box); const k = tbxPxPerCm();
    op = { box, k, t, x0: e.clientX, y0: e.clientY, dir: handle ? handle.dataset.dir : "move", id: e.pointerId };
    try { ed.setPointerCapture(e.pointerId); } catch {}
    document.body.classList.add(op.dir === "move" ? "tmoving" : "tbx-resizing");
  });
  ed.addEventListener("pointermove", e => {
    if (!op) return;
    const dx = (e.clientX - op.x0) / op.k, dy = (e.clientY - op.y0) / op.k; const t = op.t; const r1 = v => Math.round(v * 100) / 100;
    const MIN = 0.6; let { x, y, w, h } = t;
    if (op.dir === "move"){ x = t.x - dx; y = t.y + dy; }
    else {
      // x is measured from the right edge of the text column (the page is right-to-left)
      if (op.dir.includes("e")){ w = Math.max(MIN, t.w + dx); x = t.x - (w - t.w); }
      if (op.dir.includes("w")){ w = Math.max(MIN, t.w - dx); }
      if (op.dir.includes("s")) h = Math.max(MIN, t.h + dy);
      if (op.dir.includes("n")){ h = Math.max(MIN, t.h - dy); y = t.y + (t.h - h); }
    }
    Object.assign(op.box.dataset, { x: r1(x), y: r1(y), w: r1(w), h: r1(h) });
    tbxLayout(op.box, op.k); tbxPlaceBar();
  });
  const end = () => { if (!op) return; try { ed.releasePointerCapture(op.id); } catch {} document.body.classList.remove("tmoving", "tbx-resizing"); op = null; markDirty(); };
  ed.addEventListener("pointerup", end); ed.addEventListener("pointercancel", end);
  document.addEventListener("pointerdown", e => { if (tbxSel && !e.target.closest(".tbox-wrap") && !e.target.closest("#tbxBar") && !e.target.closest(".toolbar")) tbxDeselect(); });
  document.addEventListener("keydown", e => {
    if (!tbxSel) return;
    if (e.key === "Escape"){ tbxDeselect(); return; }
    const editing = document.activeElement && document.activeElement.closest && document.activeElement.closest(".tbox-in") && !tbxWhole;
    if (!editing && (e.key === "Delete" || e.key === "Backspace")){ e.preventDefault(); $("tbxDel").click(); return; }
    const k = (e.key || "").toLowerCase(), code = e.code;
    if (!editing && (e.ctrlKey || e.metaKey) && !e.altKey){
      if (k === "c" || code === "KeyC" || k === "ؤ"){ e.preventDefault(); tbxCopy(false); }
      else if (k === "x" || code === "KeyX" || k === "ء"){ e.preventDefault(); tbxCopy(true); }
      else if (k === "v" || code === "KeyV" || k === "ر"){ e.preventDefault(); tbxPaste(); }
    }
  });
  window.addEventListener("scroll", () => tbxPlaceBar(), true);
  window.addEventListener("resize", () => { tbxLayoutAll(); tbxPlaceBar(); });
  ["mgRight", "mgLeft"].forEach(id => { const el = $(id); if (el) el.addEventListener("input", () => tbxLayoutAll()); });
})();

$("tbStyle").addEventListener("mousedown", saveSel);
$("tbStyle").addEventListener("change", () => exec("formatBlock", $("tbStyle").value));
document.addEventListener("selectionchange", () => { const s = getSelection(); if (s.rangeCount && $("editor").contains(s.anchorNode)){ saveSel(); syncToolbar(); syncTableBar(); } });
$("editor").addEventListener("input", markDirty);
window.addEventListener("beforeunload", e => { if (state.dirty){ e.preventDefault(); e.returnValue = ""; } });
function markDirty(){ if (!current()) return; state.dirty = true; $("saveEdits").hidden = !state.canWrite; schedulePreview(); }

$("saveEdits").addEventListener("click", async () => {
  const p = current(); if (!p) return;
  const rn = state.restoreNote && state.restoreNote.pid === p.id ? state.restoreNote.note : "";
  try { await savePolicy({ ...p, html: editorHtml(), versionNote: rn }); state.restoreNote = null; state.dirty = false; $("saveEdits").hidden = true; setMsg("حُفظت التعديلات في المكتبة.", "ok"); }
  catch (e){ setMsg(storeError(e), "err"); }
});

$("moveCat").addEventListener("change", async () => {
  await movePolicy(current(), $("moveCat").value);
});

let delTimer = null;
function disarmDelete(){ const b = $("delBtn"); b.classList.remove("armed"); b.textContent = "حذف"; clearTimeout(delTimer); }
$("delBtn").addEventListener("click", async () => {
  const b = $("delBtn"); const p = current(); if (!p) return;
  if (!b.classList.contains("armed")){ b.classList.add("armed"); b.textContent = "تأكيد الحذف"; delTimer = setTimeout(disarmDelete, 4000); return; }
  disarmDelete();
  try { await deletePolicy(p.id); state.selectedId = null; state.dirty = false; $("editor").innerHTML = ""; renderChosen(); renderList(); setMsg("حُذفت السياسة من المكتبة.", "ok"); clearPreview(); }
  catch (e){ setMsg(storeError(e), "err"); }
});

/* ---------- add / edit dialog ---------- */
let dlgMode = "add"; let dlgTab = "file"; let pendingFiles = [];
function openDialog(mode){
  dlgMode = mode; pendingFiles = []; $("dlgMsg").textContent = ""; $("dlgMsg").className = "msg";
  $("pfFiles").value = ""; $("pfNames").innerHTML = '<span class="hint">اسحب الملفات هنا أو اضغط للاختيار</span>';
  $("dupWrap").hidden = true;
  const p = current();
  if (mode === "edit" && p){
    $("dlgTitle").textContent = "تعديل بيانات السياسة";
    $("dlgTabs").hidden = true; setTab("text"); $("pText").closest(".field").hidden = true;
    $("pTitle").value = p.title || ""; $("pCode").value = p.code || "";
    // an older category is offered as-is, so editing the title does not move the policy
    const pc = $("pCat"), cat = p.category || "أخرى"; if (![...pc.options].some(o => o.value === cat)) pc.append(new Option(cat, cat)); pc.value = cat;
    $("dlgSave").textContent = "حفظ";
  } else {
    $("dlgTitle").textContent = "إضافة سياسة إلى المكتبة";
    $("dlgTabs").hidden = false; setTab("file"); $("pText").closest(".field").hidden = false;
    $("pTitle").value = ""; $("pText").value = ""; $("pCode").value = ""; $("pCat").value = CATS.includes($("catFilter").value) ? $("catFilter").value : CATS[0];
    $("dlgSave").textContent = "حفظ في المكتبة";
  }
  $("dlg").hidden = false;
}
function closeDialog(){ $("dlg").hidden = true; }
function setTab(t){
  dlgTab = t;
  document.querySelectorAll("#dlgTabs .tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"));
  $("tabFile").hidden = t !== "file"; $("tabText").hidden = t !== "text";
}
document.querySelectorAll("#dlgTabs .tab").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
$("addBtn").addEventListener("click", () => openDialog("add"));
$("editMeta").addEventListener("click", () => openDialog("edit"));
$("dlgClose").addEventListener("click", closeDialog);
$("dlgCancel").addEventListener("click", closeDialog);
$("dlg").addEventListener("click", e => { if (e.target === $("dlg")) closeDialog(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("dlg").hidden) closeDialog(); });

function setPendingFiles(files){
  pendingFiles = Array.from(files || []).filter(f => /\.docx$/i.test(f.name));
  const have = new Set(state.policies.map(p => normTitle(p.title)));
  const seen = new Set();
  pendingFiles.forEach(f => { const k = normTitle(f.name); f.dup = have.has(k) || seen.has(k); seen.add(k); });
  const box = $("pfNames"); box.innerHTML = "";
  if (!pendingFiles.length){ box.innerHTML = '<span class="hint">اختر ملفات بصيغة .docx</span>'; $("dupWrap").hidden = true; return; }
  pendingFiles.forEach((f, i) => {
    if (i) box.append("، ");
    const s = document.createElement("span"); s.textContent = f.name.replace(/\.docx$/i, ""); box.append(s);
    if (f.dup){ const t = document.createElement("span"); t.className = "tag-dup"; t.textContent = "موجودة مسبقاً"; box.append(" ", t); }
  });
  const dups = pendingFiles.filter(f => f.dup).length;
  $("dupWrap").hidden = !dups;
  $("dupCount").textContent = dups === 1 ? "ملف واحد موجود مسبقاً في المكتبة." : dups + " ملفات موجودة مسبقاً في المكتبة.";
}
$("pfFiles").addEventListener("change", e => setPendingFiles(e.target.files));
wireDrop($("pfDrop"), files => setPendingFiles(files));

function textToHtml(t){
  return t.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const esc = escHtml(l);
    if (/^#{1,3}\s*/.test(l)) return "<h2>" + escHtml(l.replace(/^#{1,3}\s*/, "")) + "</h2>";
    if (/^[-•*]\s+/.test(l)) return "<ul><li>" + escHtml(l.replace(/^[-•*]\s+/, "")) + "</li></ul>";
    return "<p>" + esc + "</p>";
  }).join("").replace(/<\/ul><ul>/g, "");
}
function escHtml(s){ return s.replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c])); }

async function docxToHtml(file){
  await needLib("mammoth");
  const buf = await file.arrayBuffer();
  const res = await mammoth.convertToHtml({ arrayBuffer: buf }, {
    convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: "" })),
    styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='العنوان'] => h1:fresh"],
  });
  return cleanHtml(res.value.replace(/<img[^>]*>/g, "").replace(/<a id="[^"]*"><\/a>/g, ""));
}

$("dlgSave").addEventListener("click", async () => {
  const m = $("dlgMsg"); m.className = "msg"; m.textContent = "";
  const cat = $("pCat").value; const code = $("pCode").value.trim();
  const btn = $("dlgSave"); btn.disabled = true;
  try {
    if (dlgMode === "edit"){
      const p = current(); const title = $("pTitle").value.trim();
      if (!title){ m.className = "msg err"; m.textContent = "اكتب عنوان السياسة."; return; }
      await savePolicy({ ...p, title, category: cat, code, html: state.dirty ? editorHtml() : p.html, sample: p.sample && !state.dirty ? p.sample : false });
      state.dirty = false; closeDialog(); renderChosen(); return;
    }
    if (dlgTab === "file"){
      if (!pendingFiles.length){ m.className = "msg err"; m.textContent = "اختر ملف وورد واحداً على الأقل."; return; }
      let firstId = null, done = 0;
      const skip = $("skipDups").checked;
      const todo = pendingFiles.filter(f => !(skip && f.dup));
      if (!todo.length){ m.className = "msg err"; m.textContent = "كل الملفات المختارة موجودة مسبقاً في المكتبة."; return; }
      m.textContent = "جارٍ التجهيز…"; await needLib("mammoth");
      for (const f of todo){
        m.textContent = "جارٍ قراءة " + f.name + "…";
        let html;
        try { html = await docxToHtml(f); }
        catch { throw Object.assign(new Error("bad_docx"), { file: f.name, done }); }
        const id = newId(); firstId ||= id;
        await savePolicy({ id, title: f.name.replace(/\.docx$/i, ""), category: cat, code: pendingFiles.length === 1 ? code : "", html });
        done++;
      }
      closeDialog(); setTimeout(() => selectPolicy(firstId), 300);
      const skipped = pendingFiles.length - todo.length;
      setMsg("أُضيفت " + done + (done === 1 ? " سياسة" : " سياسات") + " إلى المكتبة." + (skipped ? ` وتُخطّي ${skipped} ${skipped === 1 ? "ملف موجود" : "ملفات موجودة"} مسبقاً.` : ""), "ok");
    } else {
      const title = $("pTitle").value.trim(); const text = $("pText").value;
      if (!title || !text.trim()){ m.className = "msg err"; m.textContent = "اكتب العنوان والنص."; return; }
      const id = newId();
      await savePolicy({ id, title, category: cat, code, html: textToHtml(text) });
      closeDialog(); setTimeout(() => selectPolicy(id), 300);
      setMsg("أُضيفت السياسة إلى المكتبة.", "ok");
    }
  } catch (e){
    m.className = "msg err";
    m.textContent = e && e.message === "bad_docx"
      ? `تعذّرت قراءة «${e.file}». تأكد أنه ملف وورد بصيغة .docx.` + (e.done ? ` أُضيف قبله ${e.done} ${e.done === 1 ? "ملف" : "ملفات"} إلى المكتبة.` : "")
      : storeError(e);
  } finally { btn.disabled = false; }
});

$("q").addEventListener("input", renderList);
$("catFilter").addEventListener("change", () => { const c = $("catFilter").value; if (c){ state.openCats ||= new Set(); state.openCats.add(c); } renderList(); });

/* ---------- letterhead ---------- */
function wireDrop(el, onFiles){
  ["dragenter","dragover"].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); el.classList.add("over"); }));
  ["dragleave","drop"].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); el.classList.remove("over"); }));
  el.addEventListener("drop", e => onFiles(e.dataTransfer.files));
}
async function setLetterhead(file){
  if (!file) return;
  if (!/\.(docx|dotx)$/i.test(file.name)){
    setMsg("الكليشة يجب أن تكون ملف وورد بصيغة .docx. إن كان الملف .doc فافتحه في وورد واحفظه بصيغة .docx.", "err"); return;
  }
  try {
    await loadLetterheadBuf(await file.arrayBuffer(), file.name);
    state.lhSavedFor = null;
    if (state.assocId) assocNote("أُرفقت كليشة جديدة. اضغط «حفظ التغييرات» لتبقى مع هذه الجمعية.");
  } catch {
    setMsg("تعذّرت قراءة ملف الكليشة. تأكد أنه ملف وورد سليم بصيغة .docx.", "err");
  }
}
async function loadLetterheadBuf(buf, name, { quiet = false } = {}){
  const zip = await JSZip.loadAsync(buf);
  if (!zip.file("word/document.xml")) throw new Error("bad");
  const raw = buf.slice(0);
  const moved = await normalizeLetterhead(zip);
  state.letterhead = moved || buf; state.letterheadRaw = raw; state.letterheadName = name;
  const nzip = moved ? await JSZip.loadAsync(moved) : zip;
  state.lhMargins = await detectMargins(nzip);
  setMargins(state.lhMargins); updateSettingsHint();
  $("lhName").textContent = name;
  if (!quiet) setMsg("أُرفقت الكليشة.", "ok");
  previewStale = true; schedulePreview(50);
}
$("lhFile").addEventListener("change", e => setLetterhead(e.target.files[0]));
wireDrop($("lhDrop"), files => setLetterhead(files[0]));

$("assoc").addEventListener("input", () => { const p = current(); if (p) $("abTitle").textContent = fillName(p.title, $("assoc").value.trim()); try { localStorage.setItem("assoc-policies-name", $("assoc").value); } catch {} schedulePreview(); });
["font","size","addTitle","keepBody","cover","pageNums","verTable"].forEach(id => $(id).addEventListener("change", () => schedulePreview(50)));
try { $("verTable").checked = localStorage.getItem("assoc-policies-vertable") === "1"; } catch {}
$("verTable").addEventListener("change", () => { try { localStorage.setItem("assoc-policies-vertable", $("verTable").checked ? "1" : "0"); } catch {} });
["mgTop","mgBottom","mgRight","mgLeft"].forEach(id => $(id).addEventListener("input", () => schedulePreview(500)));
/* margin arrows: one press = 0.1 cm, hold to keep stepping */
document.querySelectorAll(".mg-step").forEach(btn => {
  const inp = $(btn.dataset.for), dir = +btn.dataset.dir;
  const step = () => {
    const min = +inp.min || 0, max = +inp.max || 99;
    const cur = parseFloat(inp.value); const v = Math.min(max, Math.max(min, Math.round(((isNaN(cur) ? 0 : cur) + dir * 0.1) * 10) / 10));
    if (String(v) === inp.value) return;
    inp.value = v; inp.dispatchEvent(new Event("input", { bubbles: true }));
  };
  let t1 = null, t2 = null;
  const stop = () => { clearTimeout(t1); clearInterval(t2); t1 = t2 = null; };
  btn.addEventListener("pointerdown", e => { if (e.button) return; e.preventDefault(); step(); t1 = setTimeout(() => { t2 = setInterval(step, 70); }, 400); });
  ["pointerup","pointerleave","pointercancel"].forEach(ev => btn.addEventListener(ev, stop));
  btn.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); step(); } });
});
$("mgReset").addEventListener("click", () => { setMargins(state.lhMargins || DEFAULT_MARGINS); updateSettingsHint(); schedulePreview(50); });

/* ---------- page margins ---------- */
const TW_CM = 567, EMU_TW = 635;
const DEFAULT_MARGINS = { top: 1440, bottom: 1440, right: 1304, left: 1304 };
function setMargins(m){
  const f = tw => (Math.round(tw / TW_CM * 10) / 10).toString();
  $("mgTop").value = f(m.top); $("mgBottom").value = f(m.bottom); $("mgRight").value = f(m.right); $("mgLeft").value = f(m.left);
}
function readMargins(){
  // clamp to the box's own limits, so a typo like 40 cm cannot leave no room for text
  const g = (id, d) => { const el = $(id); const v = parseFloat(el.value); if (!isFinite(v) || v < 0) return d;
    return Math.round(Math.min(+el.max || 15, v) * TW_CM); };
  const b = state.lhMargins || DEFAULT_MARGINS;
  return { top: g("mgTop", b.top), bottom: g("mgBottom", b.bottom), right: g("mgRight", b.right), left: g("mgLeft", b.left) };
}
/* Page geometry of the letterhead's last section, in twips. */
function sectGeometry(doc){
  const sects = doc.getElementsByTagNameNS(W_NS, "sectPr");
  const sect = sects[sects.length - 1];
  const mar = sect && sect.getElementsByTagNameNS(W_NS, "pgMar")[0];
  const sz = sect && sect.getElementsByTagNameNS(W_NS, "pgSz")[0];
  const num = (el, a, d) => { const v = el && parseInt(el.getAttributeNS(W_NS, a), 10); return isFinite(v) ? v : d; };
  return {
    pageW: num(sz, "w", 11906), pageH: num(sz, "h", 16838),
    top: Math.abs(num(mar, "top", 1440)), bottom: Math.abs(num(mar, "bottom", 1440)), right: num(mar, "right", 1304), left: num(mar, "left", 1304),
    header: num(mar, "header", 709), footer: num(mar, "footer", 709),
  };
}
/* Where a floating picture sits on the page (twips from the page's top-left corner). */
function anchorBox(a, g, isHeader){
  const ext = a.getElementsByTagNameNS("*", "extent")[0];
  if (!ext) return null;
  const w = (parseInt(ext.getAttribute("cx"), 10) || 0) / EMU_TW, h = (parseInt(ext.getAttribute("cy"), 10) || 0) / EMU_TW;
  const axis = (tag, horiz) => {
    const p = Array.from(a.children).find(c => c.localName === tag);
    const rel = p ? p.getAttribute("relativeFrom") : "page";
    const off = p && p.getElementsByTagNameNS("*", "posOffset")[0];
    const al = p && p.getElementsByTagNameNS("*", "align")[0];
    let base, span;
    if (horiz){
      if (rel === "page"){ base = 0; span = g.pageW; }
      else if (rel === "leftMargin"){ base = 0; span = g.left; }
      else if (rel === "rightMargin"){ base = g.pageW - g.right; span = g.right; }
      else { base = g.left; span = g.pageW - g.left - g.right; }
    } else {
      if (rel === "page"){ base = 0; span = g.pageH; }
      else if (rel === "topMargin"){ base = 0; span = g.top; }
      else if (rel === "bottomMargin"){ base = g.pageH - g.bottom; span = g.bottom; }
      else if (rel === "margin"){ base = g.top; span = g.pageH - g.top - g.bottom; }
      else { base = isHeader ? g.header : g.pageH - g.footer - 300; span = 0; }
    }
    const size = horiz ? w : h;
    if (off) return base + (parseInt(off.textContent, 10) || 0) / EMU_TW;
    const v = al ? al.textContent : "";
    if (v === "right" || v === "bottom" || v === "outside") return base + span - size;
    if (v === "center") return base + (span - size) / 2;
    return base;
  };
  const sp = a.getAttribute("simplePos") === "1" || a.getAttribute("simplePos") === "true";
  const spEl = Array.from(a.children).find(c => c.localName === "simplePos");
  const x = sp && spEl ? (parseInt(spEl.getAttribute("x"), 10) || 0) / EMU_TW : axis("positionH", true);
  const y = sp && spEl ? (parseInt(spEl.getAttribute("y"), 10) || 0) / EMU_TW : axis("positionV", false);
  const behind = a.getAttribute("behindDoc") === "1" || a.getAttribute("behindDoc") === "true";
  return { x, y, w, h, behind };
}
const hfParts = zip => Object.keys(zip.files).filter(k => /^word\/(header|footer)[^/]*\.xml$/.test(k));
const hasPicture = a => a.getElementsByTagNameNS("*", "pic").length > 0;

/* For a full-page background picture, look at its pixels to find the blank area meant for text. Returns page-space twips or null. */
async function clearZone(zip, partPath, anchor, box){
  try {
    const blip = anchor.getElementsByTagNameNS("*", "blip")[0];
    const rid = blip && blip.getAttributeNS(R_NS, "embed"); if (!rid) return null;
    const rels = await relsDoc(zip, partPath.replace(/([^/]+)$/, "_rels/$1.rels"));
    const rel = Array.from(rels.documentElement.children).find(r => r.getAttribute("Id") === rid); if (!rel) return null;
    const f = zip.file("word/" + rel.getAttribute("Target").replace(/^\/?word\//, "")); if (!f) return null;
    const bmp = await createImageBitmap(new Blob([await f.async("arraybuffer")]));
    const W = 120, H = Math.max(40, Math.round(W * bmp.height / bmp.width));
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); ctx.drawImage(bmp, 0, 0, W, H);
    const px = ctx.getImageData(0, 0, W, H).data;
    const ink = (x, y) => { const i = (y * W + x) * 4; return (px[i] + px[i + 1] + px[i + 2]) / 3 < 235; };
    const longestBlank = (n, isBlank) => { let best = [0, -1], s = -1; for (let i = 0; i <= n; i++){ if (i < n && isBlank(i)){ if (s < 0) s = i; } else if (s >= 0){ if (i - s > best[1] - best[0] + 1) best = [s, i - 1]; s = -1; } } return best; };
    const rowBlank = y => { let k = 0; for (let x = 0; x < W; x++) if (ink(x, y)) k++; return k <= W * 0.04; };
    const [y0, y1] = longestBlank(H, rowBlank);
    if (y1 - y0 + 1 < H * 0.4) return null;
    const colBlank = x => { let k = 0; for (let y = y0; y <= y1; y++) if (ink(x, y)) k++; return k <= (y1 - y0 + 1) * 0.04; };
    const [x0, x1] = longestBlank(W, colBlank);
    const sx = box.w / W, sy = box.h / H;
    return { top: box.y + y0 * sy, bottom: box.y + (y1 + 1) * sy, left: x1 - x0 + 1 >= W * 0.5 ? box.x + x0 * sx : null, right: x1 - x0 + 1 >= W * 0.5 ? box.x + (x1 + 1) * sx : null };
  } catch { return null; }
}

/* Read the letterhead's margins, then push them past any floating header/footer artwork so text never runs into it. */
async function detectMargins(zip){
  const g = sectGeometry(parseXml(await zip.file("word/document.xml").async("string")));
  const m = { top: g.top, bottom: g.bottom, right: g.right, left: g.left };
  const gap = 230; // ~0.4 cm of air between artwork and text
  for (const path of hfParts(zip)){
    const x = parseXml(await zip.file(path).async("string"));
    const isHeader = /header/.test(path);
    for (const a of Array.from(x.getElementsByTagNameNS("*", "anchor"))){
      const b = anchorBox(a, g, isHeader);
      if (!b) continue;
      if (b.h > g.pageH * 0.6){
        // a full-page background: text goes in its blank middle, never closer to the edge than the designer's margins
        const z = hasPicture(a) ? await clearZone(zip, path, a, b) : null;
        if (z){
          m.top = Math.max(m.top, Math.round(z.top + gap)); m.bottom = Math.max(m.bottom, Math.round(g.pageH - z.bottom + gap));
          if (z.left != null){ m.left = Math.max(m.left, Math.round(z.left + gap)); m.right = Math.max(m.right, Math.round(g.pageW - z.right + gap)); }
        }
        continue;
      }
      if (b.y + b.h <= g.pageH * 0.45) m.top = Math.max(m.top, Math.round(b.y + b.h + gap));
      else if (b.y >= g.pageH * 0.55) m.bottom = Math.max(m.bottom, Math.round(g.pageH - b.y + gap));
    }
  }
  // never let text run to the paper edge, whatever the letterhead says
  m.top = Math.max(m.top, 1134); m.bottom = Math.max(m.bottom, 1134); m.right = Math.max(m.right, 1020); m.left = Math.max(m.left, 1020);
  return m;
}

/* Artwork in a header or footer that sits "in front of text" or wraps text (a cover design, a full-page image)
   would hide or push away the cover title and the policy, so put it behind the text. */
async function sendHeaderArtBehind(zip){
  let any = false;
  for (const path of hfParts(zip)){
    const x = parseXml(await zip.file(path).async("string"));
    let changed = false;
    Array.from(x.getElementsByTagNameNS("*", "anchor")).forEach(a => {
      const behind = a.getAttribute("behindDoc") === "1" || a.getAttribute("behindDoc") === "true";
      const wrap = Array.from(a.children).find(c => /^wrap/.test(c.localName));
      if (behind && (!wrap || wrap.localName === "wrapNone")) return;
      a.setAttribute("behindDoc", "1");
      if (wrap && wrap.localName !== "wrapNone"){ const pre = wrap.prefix ? wrap.prefix + ":" : ""; a.replaceChild(x.createElementNS(wrap.namespaceURI, pre + "wrapNone"), wrap); }
      changed = true;
    });
    if (changed){ zip.file(path, xmlOut(x)); any = true; }
  }
  return any;
}

/* Letterheads often carry their artwork in the page body (a banner or a full-page image).
   Move that artwork into the page header, behind the text, so it repeats on every page and never pushes or covers the policy. */
async function normalizeLetterhead(zip){
  const docPath = "word/document.xml";
  const doc = parseXml(await zip.file(docPath).async("string"));
  const body = doc.getElementsByTagNameNS(W_NS, "body")[0];
  const g = sectGeometry(doc);
  const EMU = EMU_TW;
  const runs = [];
  Array.from(body.children).forEach(p => {
    if (p.localName !== "p") return;
    Array.from(p.getElementsByTagNameNS(W_NS, "drawing")).forEach(dr => {
      const holder = Array.from(dr.children).find(c => c.localName === "anchor" || c.localName === "inline");
      if (!holder || !hasPicture(holder)) return;
      const ext = holder.getElementsByTagNameNS("*", "extent")[0];
      const cx = ext ? parseInt(ext.getAttribute("cx"), 10) || 0 : 0, cy = ext ? parseInt(ext.getAttribute("cy"), 10) || 0 : 0;
      if (holder.localName === "inline" && cx < g.pageW * EMU * 0.8) return; // a small inline logo stays where it is
      let r = dr.parentNode; while (r && !(r.localName === "r" && r.namespaceURI === W_NS)) r = r.parentNode;
      if (!r || runs.some(x => x.run === r)) return;
      runs.push({ run: r, para: p, holder, cx, cy });
    });
  });
  const hfChanged = await sendHeaderArtBehind(zip);
  if (!runs.length) return hfChanged ? zip.generateAsync({ type: "arraybuffer" }) : null;

  const ns = runs[0].holder.namespaceURI;
  runs.forEach(({ holder, cx, cy }) => {
    const pre = holder.prefix ? holder.prefix + ":" : "";
    const mk = (tag, attrs = {}, text) => { const e = doc.createElementNS(ns, pre + tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); if (text != null) e.textContent = text; return e; };
    let a = holder;
    if (holder.localName === "inline"){
      a = mk("anchor", { distT: "0", distB: "0", distL: "0", distR: "0", simplePos: "0", relativeHeight: "1", behindDoc: "1", locked: "0", layoutInCell: "1", allowOverlap: "1" });
      const x = Math.max(0, Math.round((g.pageW * EMU - cx) / 2));
      const y = cy >= g.pageH * EMU * 0.8 ? 0 : g.top * EMU;
      const ph = mk("positionH", { relativeFrom: "page" }); ph.append(mk("posOffset", {}, String(x)));
      const pv = mk("positionV", { relativeFrom: "page" }); pv.append(mk("posOffset", {}, String(y)));
      a.append(mk("simplePos", { x: "0", y: "0" }), ph, pv);
      const kids = Array.from(holder.children);
      const ext = kids.find(c => c.localName === "extent"); if (ext) a.append(ext);
      a.append(mk("effectExtent", { l: "0", t: "0", r: "0", b: "0" }), mk("wrapNone"));
      kids.filter(c => c.localName !== "extent" && c.localName !== "effectExtent").forEach(c => a.append(c));
      holder.parentNode.replaceChild(a, holder);
    } else {
      a.setAttribute("behindDoc", "1");
      const wrap = Array.from(a.children).find(c => /^wrap/.test(c.localName));
      if (wrap) a.replaceChild(mk("wrapNone"), wrap);
      const pv = Array.from(a.children).find(c => c.localName === "positionV");
      if (pv && /^(paragraph|line)$/.test(pv.getAttribute("relativeFrom"))){
        pv.setAttribute("relativeFrom", "page");
        const off = pv.getElementsByTagNameNS("*", "posOffset")[0];
        if (off) off.textContent = String((parseInt(off.textContent, 10) || 0) + g.top * EMU);
        else { Array.from(pv.children).forEach(c => c.remove()); pv.append(mk("posOffset", {}, String(g.top * EMU))); }
      }
      const ph = Array.from(a.children).find(c => c.localName === "positionH");
      if (ph && /^(column|character)$/.test(ph.getAttribute("relativeFrom"))) ph.setAttribute("relativeFrom", "margin");
    }
  });

  // headers the last section uses; create one when it has none
  const docRels = await relsDoc(zip, "word/_rels/document.xml.rels");
  const relById = id => Array.from(docRels.documentElement.children).find(r => r.getAttribute("Id") === id);
  const sects = doc.getElementsByTagNameNS(W_NS, "sectPr"); const sect = sects[sects.length - 1];
  let refs = Array.from(sect.children).filter(c => c.localName === "headerReference");
  if (!refs.length){
    zip.file("word/headerZ1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:p/></w:hdr>`);
    const rid = addRel(docRels, R_NS + "/header", "headerZ1.xml");
    const ref = doc.createElementNS(W_NS, "w:headerReference"); ref.setAttributeNS(W_NS, "w:type", "default"); ref.setAttributeNS(R_NS, "r:id", rid);
    sect.insertBefore(ref, sect.firstChild); refs = [ref];
    await contentTypes(zip, (ct, cns) => { const o = ct.createElementNS(cns, "Override"); o.setAttribute("PartName", "/word/headerZ1.xml"); o.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"); ct.documentElement.append(o); });
  }
  for (const ref of refs){
    const rel = relById(ref.getAttributeNS(R_NS, "id")); if (!rel) continue;
    const path = "word/" + rel.getAttribute("Target").replace(/^\/?word\//, "");
    const f = zip.file(path); if (!f) continue;
    const hx = parseXml(await f.async("string"));
    const hRelsPath = path.replace(/([^/]+)$/, "_rels/$1.rels");
    const hRels = await relsDoc(zip, hRelsPath);
    let hp = Array.from(hx.documentElement.children).find(c => c.localName === "p");
    if (!hp){ hp = hx.createElementNS(W_NS, "w:p"); hx.documentElement.append(hp); }
    runs.forEach(({ run }) => {
      const copy = hx.importNode(run, true);
      Array.from(copy.getElementsByTagNameNS("*", "*")).forEach(el => {
        ["embed", "link", "id"].forEach(attr => {
          const v = el.getAttributeNS(R_NS, attr); if (!v) return;
          const src = relById(v); if (!src) return;
          const nid = addRel(hRels, src.getAttribute("Type"), src.getAttribute("Target"));
          if (src.getAttribute("TargetMode")) Array.from(hRels.documentElement.children).pop().setAttribute("TargetMode", src.getAttribute("TargetMode"));
          el.setAttributeNS(R_NS, "r:" + attr, nid);
        });
      });
      hp.append(copy);
    });
    zip.file(path, xmlOut(hx)); zip.file(hRelsPath, xmlOut(hRels));
  }
  runs.forEach(({ run, para }) => {
    run.remove();
    if (!para.textContent.trim() && !para.getElementsByTagNameNS(W_NS, "drawing").length && para.parentNode) para.parentNode.removeChild(para);
  });
  zip.file(docPath, xmlOut(doc)); zip.file("word/_rels/document.xml.rels", xmlOut(docRels));
  return zip.generateAsync({ type: "arraybuffer" });
}

/* Preview only: docx-preview cannot place floating pictures, so tag each one, render it in place, then move it to its page position. */
async function tagFloatingArt(zip, g){
  const boxes = {}; let id = 0;
  for (const path of hfParts(zip)){
    const x = parseXml(await zip.file(path).async("string"));
    const isHeader = /header/.test(path);
    let changed = false;
    Array.from(x.getElementsByTagNameNS("*", "anchor")).forEach(a => {
      if (!hasPicture(a)) return;
      const b = anchorBox(a, g, isHeader); if (!b) return;
      id++; boxes[id] = b; changed = true;
      a.setAttribute("simplePos", "0");
      const ns = a.namespaceURI, pre = a.prefix ? a.prefix + ":" : "";
      ["positionH", "positionV"].forEach((tag, i) => {
        let p = Array.from(a.children).find(c => c.localName === tag);
        const np = x.createElementNS(ns, pre + tag); np.setAttribute("relativeFrom", "page");
        const o = x.createElementNS(ns, pre + "posOffset"); o.textContent = String(i === 0 ? id * 914400 : 0); np.append(o);
        if (p) a.replaceChild(np, p); else a.insertBefore(np, a.firstChild);
      });
      const wrap = Array.from(a.children).find(c => /^wrap/.test(c.localName));
      const wn = x.createElementNS(ns, pre + "wrapNone");
      if (wrap) a.replaceChild(wn, wrap); else { const ext = Array.from(a.children).find(c => c.localName === "effectExtent" || c.localName === "extent"); a.insertBefore(wn, ext ? ext.nextSibling : null); }
    });
    if (changed) zip.file(path, xmlOut(x));
  }
  return boxes;
}
function placeFloatingArt(stage, boxes){
  const pt = v => parseFloat(v) || 0;
  stage.querySelectorAll("section.docx").forEach(sec => {
    sec.querySelectorAll(":scope > header div, :scope > footer div").forEach(d => {
      if (d.style.position !== "relative" || d.style.width !== "0px") return;
      const v = pt(d.style.left), unit = d.style.left.replace(/[\d.\-]/g, "");
      const id = Math.round(unit === "px" ? v / 96 : unit === "in" ? v : v / 72); // each tag is a whole inch: 1, 2, 3…
      const b = boxes[id]; const img = d.querySelector("img");
      if (!b || !img) return;
      Object.assign(img.style, { position: "absolute", left: b.x / 15 + "px", top: b.y / 15 + "px", width: b.w / 15 + "px", height: b.h / 15 + "px", zIndex: b.behind ? "0" : "2", maxWidth: "none" });
      sec.append(img); d.remove();
    });
  });
}

/* ---------- HTML -> WordprocessingML ---------- */
function xmlEsc(s){ return s.replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c])); }

function buildBodyXml(html, opt){
  const font = xmlEsc(opt.font); const base = opt.size * 2;
  const out = [];
  const rPr = (st, sz) =>
    `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>` +
    (st.b || opt.allBold ? "<w:b/><w:bCs/>" : "") + (st.i ? "<w:i/><w:iCs/>" : "") + (st.s ? "<w:strike/>" : "") + (st.color ? `<w:color w:val="${st.color}"/>` : "") +
    `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>${st.u ? '<w:u w:val="single"/>' : ""}${st.hl ? `<w:shd w:val="clear" w:color="auto" w:fill="${st.hl}"/>` : ""}<w:rtl/></w:rPr>`;
  const run = (text, st, sz) => text ? `<w:r>${rPr(st, sz)}<w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>` : "";
  const pPr = (jc, after, keepNext, ind, extra = {}) =>
    `<w:pPr>${keepNext ? "<w:keepNext/>" : ""}${extra.num ? `<w:numPr><w:ilvl w:val="${extra.num.lvl}"/><w:numId w:val="${extra.num.id}"/></w:numPr>` : ""}<w:bidi/><w:spacing w:before="0" w:after="${after}" w:line="300" w:lineRule="auto"/>${ind ? `<w:ind w:${opt.forPreview ? "right" : "start"}="${ind}"/>` : ""}<w:jc w:val="${opt.forPreview ? ({ start: "right", end: "left" }[jc] || jc) : jc}"/>${extra.outline !== undefined ? `<w:outlineLvl w:val="${Math.min(9, Math.max(0, extra.outline | 0))}"/>` : ""}</w:pPr>`;
  const hex = c => {
    if (!c) return "";
    let m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m){ let h = m[1]; if (h.length === 3) h = h.replace(/./g, x => x + x); return h.toUpperCase(); }
    m = c.match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?/i);
    if (m){ if (m[4] !== undefined && +m[4] === 0) return ""; return [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, "0")).join("").toUpperCase(); }
    return "";
  };

  function inlineRuns(node, st, sz){
    let s = "";
    node.childNodes.forEach(n => {
      if (n.nodeType === 3){ s += run(n.nodeValue.replace(/\s+/g, " "), st, sz); return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName.toLowerCase();
      if (t === "br"){ s += `<w:r>${rPr(st, sz)}<w:br/></w:r>`; return; }
      if (["ul","ol","table","p","div","h1","h2","h3","h4","h5","h6","li"].includes(t)) return;
      const ns = { ...st };
      if (t === "b" || t === "strong") ns.b = true;
      if (t === "i" || t === "em") ns.i = true;
      if (t === "u" || t === "ins") ns.u = true;
      if (t === "s" || t === "strike" || t === "del") ns.s = true;
      if (t === "font" && n.getAttribute("color")) ns.color = hex(n.getAttribute("color")) || ns.color;
      const cs = n.style;
      if (cs){
        const fw = cs.fontWeight; if (fw === "bold" || +fw >= 600) ns.b = true; else if (fw === "normal" || (fw && +fw < 600)) ns.b = false;
        if (cs.fontStyle === "italic") ns.i = true;
        const td = cs.textDecorationLine || cs.textDecoration || "";
        if (td.includes("underline")) ns.u = true;
        if (td.includes("line-through")) ns.s = true;
        if (cs.color) ns.color = hex(cs.color) || ns.color;
        if (cs.backgroundColor){ const h = hex(cs.backgroundColor); ns.hl = h && h !== "FFFFFF" ? h : (cs.backgroundColor === "transparent" ? "" : ns.hl); }
      }
      s += inlineRuns(n, ns, sz);
    });
    return s;
  }
  const hasText = el => el.textContent.replace(/ /g, " ").trim().length > 0;
  function alignOf(el, dflt){
    const a = ((el.style && el.style.textAlign) || el.getAttribute("align") || "").toLowerCase();
    return a === "center" ? "center" : a === "justify" ? "both" : (a === "right" || a === "start") ? "start" : (a === "left" || a === "end") ? "end" : dflt;
  }
  const indOf = el => { const m = parseFloat(el.style && (el.style.marginRight || el.style.marginInlineStart)) || 0; return m > 0 ? Math.round(m * 15) : 0; };

  function para(el, kind){
    const ind = indOf(el);
    if (kind === "h1") return `<w:p>${pPr(alignOf(el, "center"), 200, true, ind, { outline: opt.outlineBase || 0 })}${inlineRuns(el, { b: true }, base + 8)}</w:p>`;
    if (kind === "h2") return `<w:p>${pPr(alignOf(el, "both"), 120, true, ind, { outline: opt.outlineBase + 0 })}${inlineRuns(el, { b: true }, base + 4)}</w:p>`;
    if (kind === "h3") return `<w:p>${pPr(alignOf(el, "both"), 100, true, ind, { outline: opt.outlineBase + 1 })}${inlineRuns(el, { b: true }, base + 2)}</w:p>`;
    return `<w:p>${pPr(alignOf(el, "both"), 120, false, ind)}${inlineRuns(el, {}, base)}</w:p>`;
  }
  function list(el, depth, numId, parentOrdered, lvl0 = 0){
    const ordered = el.tagName.toLowerCase() === "ol"; let n = 0;
    const real = opt.numbering && !opt.forPreview;
    /* a nested list of the same kind continues its parent (1.1, 1.2); a different kind starts its own Word list,
       numbered from its own first level and indented by hand to its depth */
    if (real && (depth === 0 || ordered !== parentOrdered)){ numId = opt.numbering.add(ordered); lvl0 = depth; }
    const lvl = Math.min(depth - lvl0, 8); const handInd = lvl0 ? 425 + depth * 425 : 0;
    Array.from(el.children).forEach(li => {
      if (li.tagName.toLowerCase() !== "li") return;
      n++;
      if (real){
        out.push(`<w:p>${pPr(alignOf(li, "both"), 80, false, handInd, { num: { id: numId, lvl } })}${inlineRuns(li, {}, base)}</w:p>`);
      } else {
        const marker = ordered ? `${n}. ` : (depth ? "◦ " : "• ");
        out.push(`<w:p>${pPr(alignOf(li, "both"), 80, false, depth * 567)}${run(marker, {}, base)}${inlineRuns(li, {}, base)}</w:p>`);
      }
      li.querySelectorAll(":scope > ul, :scope > ol").forEach(sub => list(sub, depth + 1, numId, ordered, lvl0));
    });
  }
  /* a cell's text: one Word paragraph per block inside it (Word files bring <td><p>…</p></td>) */
  function cellParas(c, th){
    if (!c) return `<w:p>${pPr("both", 0)}</w:p>`;
    const st = { b: th }; const sz = base - 2;
    const blocks = Array.from(c.children).filter(ch => ["p","div","li","h1","h2","h3","h4","h5","h6"].includes(ch.tagName.toLowerCase()));
    if (!blocks.length) return `<w:p>${pPr("both", 0)}${inlineRuns(c, st, sz)}</w:p>`;
    const parts = []; let loose = null;
    c.childNodes.forEach(n => {
      if (n.nodeType === 1 && blocks.includes(n)){
        if (loose){ parts.push(loose); loose = null; }
        if (["ul","ol"].includes(n.tagName.toLowerCase())) return;
        parts.push(n);
      } else if (n.nodeType === 1 && ["ul","ol"].includes(n.tagName.toLowerCase())){
        if (loose){ parts.push(loose); loose = null; }
        n.querySelectorAll("li").forEach(li => parts.push(li));
      } else (loose ||= document.createElement("span")).append(n.cloneNode(true));
    });
    if (loose) parts.push(loose);
    const ps = parts.filter(hasText).map(b => `<w:p>${pPr(alignOf(b, "both"), 0)}${(b.tagName.toLowerCase() === "li" ? run("• ", st, sz) : "") + inlineRuns(b, /^h\d$/i.test(b.tagName) ? { b: true } : st, sz)}</w:p>`);
    return ps.length ? ps.join("") : `<w:p>${pPr("both", 0)}</w:p>`;
  }
  function table(el){
    const rows = Array.from(el.querySelectorAll("tr"));
    if (!rows.length) return;
    const cols = Math.max(...rows.map(r => Array.from(r.children).reduce((n, c) => n + Math.max(1, +c.getAttribute("colspan") || 1), 0)));
    const dw = (el.getAttribute("data-cols") || "").split(",").map(Number).filter(v => v > 0);
    const fixed = dw.length === cols; const wsum = fixed ? dw.reduce((a, b) => a + b, 0) : 1;
    const W = fixed ? dw.map(v => v / wsum * 100) : Array(cols).fill(100 / cols);
    const ds = el.dataset || {};
    const tw = textWidthCm() * CM;
    const wv = parseFloat(ds.w) || 0; const wcm = ds.wunit === "cm";
    const tblTw = wv ? (wcm ? wv * CM : wv / 100 * tw) : tw;
    const grid = W.map(v => Math.max(1, Math.round(v / 100 * tblTw)));
    const ltr = el.getAttribute("dir") === "ltr";
    const custom = ds.border || ds.bline || ds.bcolor || ds.bsz;
    const bl = { single: "single", dotted: "dotted", dashed: "dashed", double: "double" }[ds.bline] || "single";
    const bsz = Math.round((parseFloat(ds.bsz) || 0.5) * 8); const bcol = (ds.bcolor || "#808080").replace("#", "");
    const kind = custom ? (ds.border || "all") : "all";
    const edge = (tag, on) => on ? `<w:${tag} w:val="${custom ? bl : "single"}" w:sz="${custom ? bsz : 4}" w:space="0" w:color="${custom ? bcol : "808080"}"/>` : `<w:${tag} w:val="nil"/>`;
    const out_ = kind === "all" || kind === "box", in_ = kind === "all" || kind === "inner";
    const b = edge("top", out_) + edge("left", out_) + edge("bottom", out_) + edge("right", out_) + edge("insideH", in_) + edge("insideV", in_);
    const al = ds.align || "right"; const ind = parseFloat(ds.indent) || 0;
    const jc = al;
    const cap = ds.title ? `<w:tblCaption w:val="${xmlEsc(ds.title)}"/>` : ""; const desc = ds.desc ? `<w:tblDescription w:val="${xmlEsc(ds.desc)}"/>` : "";
    let x = `<w:tbl><w:tblPr>${ltr ? "" : "<w:bidiVisual/>"}${wv ? (wcm ? `<w:tblW w:w="${Math.round(tblTw)}" w:type="dxa"/>` : `<w:tblW w:w="${Math.round(wv * 50)}" w:type="pct"/>`) : '<w:tblW w:w="5000" w:type="pct"/>'}${ds.align || wv ? `<w:jc w:val="${jc}"/>` : ""}${ind && al !== "center" ? `<w:tblInd w:w="${Math.round(ind * CM)}" w:type="dxa"${opt.forPreview ? ` w:${al}="${Math.round(ind * CM)}"` : ""}/>` : ""}<w:tblBorders>${b}</w:tblBorders>${fixed ? '<w:tblLayout w:type="fixed"/>' : ""}<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>${cap}${desc}</w:tblPr><w:tblGrid>${grid.map(v => `<w:gridCol w:w="${v}"/>`).join("")}</w:tblGrid>`;
    rows.forEach(r => {
      const hpx = parseFloat(r.style && r.style.height) || 0; const rd = r.dataset || {};
      const trPr = (rd.nosplit === "1" ? "<w:cantSplit/>" : "") + (hpx ? `<w:trHeight w:val="${Math.round(hpx * 15)}" w:hRule="${rd.hrule === "exact" ? "exact" : "atLeast"}"/>` : "") + (rd.header === "1" ? "<w:tblHeader/>" : "");
      x += "<w:tr>" + (trPr ? `<w:trPr>${trPr}</w:trPr>` : "");
      const cells = Array.from(r.children);
      // `col` walks the grid, `k` walks this row's cells, so a merged cell does not swallow the ones after it
      for (let col = 0, k = 0; col < cols; k++){
        const c = cells[k]; const th = c && c.tagName.toLowerCase() === "th";
        const span = c ? Math.min(cols - col, Math.max(1, +c.getAttribute("colspan") || 1)) : 1;
        const cw = grid.slice(col, col + span).reduce((a, b) => a + b, 0);
        const fill = c && toHex(c.style.backgroundColor); const va = c && c.dataset && c.dataset.valign;
        x += `<w:tc><w:tcPr>${fixed ? `<w:tcW w:w="${cw}" w:type="dxa"/>` : ""}${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ""}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill.slice(1)}"/>` : ""}${va === "middle" ? '<w:vAlign w:val="center"/>' : va === "bottom" ? '<w:vAlign w:val="bottom"/>' : ""}</w:tcPr>${cellParas(c, th)}</w:tc>`;
        col += span;
      }
      x += "</w:tr>";
    });
    x += "</w:tbl>";
    out.push(x, `<w:p>${pPr("both", 0)}</w:p>`);
  }
  /* a text box: a floating Word shape anchored to the paragraph after it (x from the right edge of the text column) */
  const boxRuns = [];
  function textBox(wrap){
    const box = wrap.querySelector(".tbox"); if (!box) return;
    const d = tbxData(box); const inner = box.querySelector(".tbox-in") || box;
    const n = boxRuns.length;
    if (opt.forPreview){
      (state.tbxPrev ||= []).push({ d, html: inner.innerHTML });
      boxRuns.push(run(`⟦TB${state.tbxPrev.length - 1}⟧`, {}, base));
    } else {
      const E = 360000; const cx = Math.round(d.w * E), cy = Math.round(d.h * E);
      const offX = Math.round((textWidthCm() - d.x - d.w) * E), offY = Math.round(d.y * E);
      const id = (buildBodyXml.boxId = (buildBodyXml.boxId || 7000) + 1);
      const col = c => (toHex(c) || "#000000").slice(1).toUpperCase();
      const fill = d.fill === "none" ? "<a:noFill/>" : `<a:solidFill><a:srgbClr val="${col(d.fill)}"/></a:solidFill>`;
      const ln = d.border === "none" ? "<a:ln><a:noFill/></a:ln>" : `<a:ln w="${Math.round(d.bw * 12700)}"><a:solidFill><a:srgbClr val="${col(d.border)}"/></a:solidFill></a:ln>`;
      const body = buildBodyXml(inner.innerHTML, { ...opt, title: "", approvalTop: "", outlineBase: 9 }) || "<w:p/>";
      boxRuns.push(`<w:r><mc:AlternateContent xmlns:mc="${NS_MC}"><mc:Choice Requires="wps" xmlns:wps="${NS_WPS}"><w:drawing><wp:anchor xmlns:wp="${NS_WP}" distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="${251660000 + n}" behindDoc="${d.z === "behind" ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>${offX}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>${offY}</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${id}" name="مربع نص ${n + 1}"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="${NS_A}"><a:graphicData uri="${NS_WPS}"><wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}${ln}</wps:spPr><wps:txbx><w:txbxContent>${body}</w:txbxContent></wps:txbx><wps:bodyPr rot="0" vert="horz" wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="t" anchorCtr="0"><a:noAutofit/></wps:bodyPr></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice></mc:AlternateContent></w:r>`);
    }
    out.push(`\u0001TBX${n}\u0001`);
  }
  function walk(container){
    let inlineBuf = null;
    const flush = () => { if (inlineBuf && hasText(inlineBuf)) out.push(para(inlineBuf, "p")); inlineBuf = null; };
    container.childNodes.forEach(n => {
      if (n.nodeType === 3 || (n.nodeType === 1 && !isBlock(n))){
        if (n.nodeType === 1 && n.tagName.toLowerCase() === "br" && !inlineBuf) return;
        (inlineBuf ||= document.createElement("p")).append(n.cloneNode(true)); return;
      }
      if (n.nodeType !== 1) return;
      flush();
      const t = n.tagName.toLowerCase();
      if (n.classList && n.classList.contains("tbox-wrap")) textBox(n);
      else if (t === "h1") out.push(para(n, "h1"));
      else if (t === "h2") out.push(para(n, "h2"));
      else if (t === "h3" || t === "h4" || t === "h5" || t === "h6") out.push(para(n, "h3"));
      else if (t === "ul" || t === "ol") list(n, 0);
      else if (t === "table") table(n);
      else if (t === "blockquote"){
        const d = document.createElement("div"); d.innerHTML = n.innerHTML;
        if (!Array.from(d.children).some(isBlock)){ const pz = document.createElement("p"); pz.innerHTML = n.innerHTML; d.innerHTML = ""; d.append(pz); }
        Array.from(d.children).forEach(c => { if (c.style) c.style.marginRight = ((parseFloat(c.style.marginRight) || 0) + 40) + "px"; });
        walk(d);
      }
      else if ((t === "div" || t === "section") && Array.from(n.children).some(isBlock)) walk(n);
      else if (hasText(n)) out.push(para(n, "p"));
    });
    flush();
  }
  function isBlock(n){ return ["p","div","h1","h2","h3","h4","h5","h6","ul","ol","table","section","blockquote","li"].includes(n.tagName.toLowerCase()); }

  if (opt.title) out.push(`<w:p>${pPr("center", 240, true, 0, { outline: 0 })}${run(opt.title, { b: true }, base + 8)}</w:p>`);
  if (opt.approvalTop) out.push(opt.approvalTop);
  const root = document.createElement("div"); root.innerHTML = html;
  walk(root);
  let x = out.join("");
  for (let m; (m = /\u0001TBX(\d+)\u0001/.exec(x)); ){
    const i = m.index; x = x.slice(0, i) + x.slice(i + m[0].length);
    const r = boxRuns[+m[1]]; const p = x.indexOf("<w:p>", i); const tb = x.indexOf("<w:tbl>", i);
    if (p < 0 || (tb >= 0 && tb < p)){ x = x.slice(0, i) + `<w:p>${pPr("both", 0)}${r}</w:p>` + x.slice(i); continue; }
    const e = x.indexOf("</w:pPr>", p), pe = x.indexOf("</w:p>", p);
    const at = e >= 0 && e < pe ? e + 8 : p + 5;
    x = x.slice(0, at) + r + x.slice(at);
  }
  return x;
}
const NS_MC = "http://schemas.openxmlformats.org/markup-compatibility/2006", NS_WPS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
      NS_WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing", NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";

/* Everything an export needs about one policy; the page's own controls by default, or a library entry in a batch. */
function uiCtx(){
  const p = current();
  return { p, html: p ? editorHtml() : "", name: $("assoc").value.trim(), cover: $("cover").checked, addTitle: $("addTitle").checked,
           keepBody: $("keepBody").checked, pageNums: $("pageNums").checked, embed: $("embedFont").checked, approval: approvalFor(p && p.id),
           stmt: $("stmtOn").checked, verTable: $("verTable").checked };
}
function approvalFor(id){ const a = id && state.approvals[id]; return a && Object.values(a).some(v => v) ? a : null; }
function libCtx(p, base){ return { ...base, p, html: p.html || "", approval: approvalFor(p.id) }; }
function fillName(t, name){ return name ? blanksToPlaceholder(t).replace(NAME_RX, name) : (t || ""); }
function policyHtmlForExport(ctx){ return ctx.name ? blanksToPlaceholder(ctx.html).replace(NAME_RX, escHtml(ctx.name)) : ctx.html; }
/* with a cover page the policy name is already on the cover, so drop the body's opening line when it repeats that name
   (even with small wording differences such as المستفيد / المستفيدين) */
const titleWords = t => (t || "").normalize("NFC").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
  .replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(w => w.length > 1).map(w => w.replace(/^(و?ال)/, "").slice(0, 4));
function sameTitle(a, b){
  const x = titleWords(a), y = titleWords(b); if (!x.length || !y.length) return false;
  const hit = x.filter(w => y.includes(w)).length;
  return hit / Math.max(x.length, y.length) >= 0.7;
}
function dropLeadTitle(html, title){
  const box = document.createElement("div"); box.innerHTML = html;
  const first = Array.from(box.children).find(el => !el.classList.contains("tbox-wrap") && (el.textContent.trim() || el.querySelector("img,table")));
  if (!first || first.querySelector("img,table") || !/^(H[1-6]|P|DIV)$/.test(first.tagName)) return html;
  const t = first.textContent.trim();
  if (t.length > 120 || !sameTitle(t, title)) return html;
  first.remove(); return box.innerHTML;
}

const APPROVAL_FIELDS = [
  ["version", "رقم الإصدار"], ["by", "جهة الاعتماد"], ["resolution", "رقم قرار الاعتماد"],
  ["date", "تاريخ الاعتماد", true], ["review", "تاريخ المراجعة القادمة", true],
];
function fmtApprovalDate(v){
  if (!v) return "";
  const d = new Date(v + "T12:00:00"); if (isNaN(d)) return v;
  const parts = cal => { try { const o = {}; new Intl.DateTimeFormat("en-u-ca-" + cal + "-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).forEach(x => { o[x.type] = x.value; }); return o; } catch { return null; } };
  const g = parts("gregory"); const h = parts("islamic-umalqura");
  const ymd = o => `${o.year.replace(/\D/g, "")}/${o.month}/${o.day}`;
  return h ? `${ymd(h)}هـ الموافق ${ymd(g)}م` : `${ymd(g)}م`;
}
/* closing line: "تم اعتماد هذه السياسة في محضر مجلس الإدارة رقم (..) بتاريخ ../../.." with blanks left for handwriting */
const HIJRI_MONTHS = ["محرم","صفر","ربيع الأول","ربيع الآخر","جمادى الأولى","جمادى الآخرة","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];
function stmtDate(a){
  if (!a) return "";
  if (a.mcal === "islamic" && a.hdate){ const [y, m, d] = a.hdate.split("-"); return `${d}/${m}/${y}هـ`; }
  if (a.mcal === "gregory" && a.mdate){ const [y, m, d] = a.mdate.split("-"); return `${d}/${m}/${y}م`; }
  return "";
}
function stmtText(a){
  const sp = "\u00A0";
  const no = ((a && a.minutes) || "").trim(); const date = stmtDate(a);
  /* each label stays with its brackets, so a long line wraps before «بتاريخ» and never inside the brackets */
  return `تم اعتماد هذه السياسة في محضر مجلس الإدارة رقم${sp}(${no || sp.repeat(8)}) بتاريخ${sp}(${date || sp.repeat(14)})`;
}
function stmtXml(opt, ctx){
  if (!ctx.stmt) return "";
  const font = xmlEsc(opt.font); const sz = opt.size * 2;
  const rpr = `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:b/><w:bCs/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:rtl/></w:rPr>`;
  return `<w:p><w:pPr><w:keepLines/><w:bidi/><w:spacing w:before="480" w:after="0" w:line="300" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:r>${rpr}<w:t xml:space="preserve">${xmlEsc(stmtText(state.approvals[ctx.p && ctx.p.id] || ctx.approval))}</w:t></w:r></w:p>`;
}
function approvalRows(a){
  if (!a) return [];
  return APPROVAL_FIELDS.map(([k, label, isDate]) => [label, isDate ? fmtApprovalDate(a[k]) : (a[k] || "").trim()]).filter(r => r[1]);
}
/* small two-column table with the approval details */
function approvalXml(opt, rows){
  if (!rows.length) return "";
  const font = xmlEsc(opt.font); const sz = Math.max(20, opt.size * 2 - 4);
  const r = (t, b) => `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>${b || opt.allBold ? "<w:b/><w:bCs/>" : ""}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:rtl/></w:rPr><w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
  const bd = '<w:top w:val="single" w:sz="4" w:color="A6A6A6"/><w:left w:val="single" w:sz="4" w:color="A6A6A6"/><w:bottom w:val="single" w:sz="4" w:color="A6A6A6"/><w:right w:val="single" w:sz="4" w:color="A6A6A6"/><w:insideH w:val="single" w:sz="4" w:color="A6A6A6"/><w:insideV w:val="single" w:sz="4" w:color="A6A6A6"/>';
  const cell = (t, w, head) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : ""}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:bidi/><w:spacing w:before="40" w:after="40"/><w:jc w:val="${opt.forPreview ? "right" : "start"}"/></w:pPr>${r(t, head)}</w:p></w:tc>`;
  let x = `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="6400" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>${bd}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="4000"/></w:tblGrid>`;
  rows.forEach(([k, v]) => { x += `<w:tr>${cell(k, 2400, true)}${cell(v, 4000, false)}</w:tr>`; });
  return x + "</w:tbl>";
}
/* first page: the policy's name (and the association's) centred on the letterhead, then a page break */
function coverXml(opt, ctx){
  const p = ctx.p; if (!p || !ctx.cover) return "";
  const name = ctx.name;
  const title = fillName(p.title, name);
  const font = xmlEsc(opt.font); const m = opt.margins;
  const r = (t, sz, b) => t ? `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>${b || opt.allBold ? "<w:b/><w:bCs/>" : ""}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:rtl/></w:rPr><w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>` : "";
  const pp = (before, after, outline) => `<w:pPr><w:bidi/><w:spacing w:before="${before}" w:after="${after}" w:line="300" w:lineRule="auto"/><w:jc w:val="center"/>${outline !== undefined ? `<w:outlineLvl w:val="${outline}"/>` : ""}</w:pPr>`;
  const rows = approvalRows(ctx.approval);
  const sects = ((state.geom && state.geom.pageH) || 16838) - m.top - m.bottom;
  const before = Math.max(600, Math.round(sects * (rows.length ? 0.22 : 0.32)));
  let x = `<w:p>${pp(before, 240, 0)}${r(title, Math.max(40, opt.size * 2 + 22), true)}</w:p>`;
  if (p.code) x += `<w:p>${pp(0, 120)}${r(p.code, opt.size * 2, false)}</w:p>`;
  if (name) x += `<w:p>${pp(120, 0)}${r(name, opt.size * 2 + 6, false)}</w:p>`;
  if (rows.length) x += `<w:p>${pp(600, 0)}</w:p>` + approvalXml(opt, rows);
  return x + COVER_BREAK;
}
/* page break that ends a cover page; the bookmark lets buildDocx find it and turn it into a section break */
const COVER_BREAK = '<w:p><w:pPr><w:bidi/></w:pPr><w:bookmarkStart w:id="9901" w:name="_CoverEnd"/><w:bookmarkEnd w:id="9901"/><w:r><w:br w:type="page"/></w:r></w:p>';
function titleForExport(ctx){
  const p = ctx.p; if (!p || !ctx.addTitle) return "";
  const first = document.createElement("div"); first.innerHTML = ctx.html;
  const firstText = (first.querySelector("h1,h2,h3,p") || first).textContent.trim();
  if (firstText && (firstText === p.title.trim() || firstText.includes(p.title.trim()))) return "";
  return fillName(p.title, ctx.name);
}

const BLANK_DOC = () => {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W_NS}"><w:body><w:p/><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1304" w:bottom="1440" w:left="1304" w:header="709" w:footer="709" w:gutter="0"/><w:bidi/></w:sectPr></w:body></w:document>`);
  return zip;
};

async function buildDocx({ forPreview = false, ctx = uiCtx(), merged = null } = {}){
  if (ctx.verTable) for (const c of merged || [ctx]) if (c.p && !c.versions) c.versions = await versionIndex(c.p.id);
  const zip = state.letterhead ? await JSZip.loadAsync(state.letterhead) : BLANK_DOC();
  const xml = await zip.file("word/document.xml").async("string");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const body = doc.getElementsByTagNameNS(W_NS, "body")[0];
  const kids = Array.from(body.childNodes);
  const last = kids.filter(n => n.nodeType === 1).pop();
  const sect = last && last.localName === "sectPr" ? last : null;
  const keepAll = ctx.keepBody;
  if (forPreview) state.tbxPrev = [];
  if (forPreview){
    /* Word uses "even page" headers only when the document turns them on; docx-preview always does, which left every second page blank */
    const st = zip.file("word/settings.xml");
    const evenOn = st && /evenAndOddHeaders(?![^>]*w:val="(0|false)")/.test(await st.async("string"));
    if (!evenOn) Array.from(doc.getElementsByTagNameNS(W_NS, "sectPr")).forEach(sp => Array.from(sp.children)
      .filter(c => (c.localName === "headerReference" || c.localName === "footerReference") && c.getAttributeNS(W_NS, "type") === "even").forEach(c => sp.removeChild(c)));
  }
  const sectOrig = sect ? sect.cloneNode(true) : null;
  if (sect){
    let mar = sect.getElementsByTagNameNS(W_NS, "pgMar")[0];
    if (!mar){
      // schema order: header/footer references, footnotePr, endnotePr, type, pgSz come before pgMar
      mar = doc.createElementNS(W_NS, "w:pgMar");
      const before = ["headerReference","footerReference","footnotePr","endnotePr","type","pgSz"];
      const next = Array.from(sect.children).find(c => !before.includes(c.localName));
      sect.insertBefore(mar, next || null);
    }
    const m = readMargins();
    mar.setAttributeNS(W_NS, "w:top", String(m.top)); mar.setAttributeNS(W_NS, "w:bottom", String(m.bottom));
    mar.setAttributeNS(W_NS, "w:right", String(m.right)); mar.setAttributeNS(W_NS, "w:left", String(m.left));
    ["header", "footer", "gutter"].forEach(a => { if (!mar.hasAttributeNS(W_NS, a)) mar.setAttributeNS(W_NS, "w:" + a, a === "gutter" ? "0" : "709"); });
  }
  kids.forEach(n => {
    if (n === sect) return;
    if (n.nodeType !== 1){ body.removeChild(n); return; }
    if (keepAll) return;
    const graphic = n.getElementsByTagNameNS("*", "drawing").length || n.getElementsByTagNameNS("*", "pict").length || n.getElementsByTagNameNS("*", "object").length;
    if (!graphic) body.removeChild(n);
  });
  const fdef = fontDef();
  const numbering = forPreview ? null : newNumbering();
  const opt = { font: currentWeight().word, size: +$("size").value, allBold: !!(fdef && fdef.allBold), forPreview, margins: readMargins(), numbering };
  let gen = "";
  if (merged){
    gen = guideXml(opt, ctx, merged);
  } else {
    opt.title = titleForExport(ctx);
    opt.outlineBase = ctx.cover || opt.title ? 1 : 0;
    const rows = approvalRows(ctx.approval);
    if (!ctx.cover && rows.length) opt.approvalTop = approvalXml(opt, rows) + `<w:p><w:pPr><w:bidi/><w:spacing w:before="0" w:after="200"/></w:pPr></w:p>`;
    const bodyHtml = ctx.cover && ctx.p ? dropLeadTitle(policyHtmlForExport(ctx), fillName(ctx.p.title, ctx.name)) : policyHtmlForExport(ctx);
    gen = coverXml(opt, ctx) + buildBodyXml(bodyHtml, opt) + stmtXml(opt, ctx) + versionsXml(opt, ctx);
  }
  const geom = sectGeometry(doc);
  if (forPreview){
    gen += '<w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p/>';
    const m = readMargins();
    state.geom = { ...geom, ...m };
    state.artBoxes = await tagFloatingArt(zip, { ...geom, ...m });
  }
  const frag = new DOMParser().parseFromString(`<w:document xmlns:w="${W_NS}"><w:body>${gen}</w:body></w:document>`, "application/xml");
  if (frag.getElementsByTagName("parsererror").length) throw new Error("gen_xml");
  const fb = frag.getElementsByTagNameNS(W_NS, "body")[0];
  if (/TBX|wps:wsp/.test(gen)){ const de = doc.documentElement; [["mc", NS_MC], ["wps", NS_WPS], ["wp", NS_WP], ["a", NS_A]].forEach(([k, v]) => { if (!de.hasAttribute("xmlns:" + k)) de.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:" + k, v); }); }
  Array.from(fb.childNodes).forEach(n => body.insertBefore(doc.importNode(n, true), sect));
  if (!forPreview && ctx.pageNums && sect){
    const coverEnd = Array.from(body.getElementsByTagNameNS(W_NS, "bookmarkStart")).find(b => b.getAttributeNS(W_NS, "name") === "_CoverEnd");
    if (coverEnd && sectOrig){
      /* the cover becomes its own section (with the letterhead's own header and footer), so numbering starts at 1 after it */
      const para = coverEnd.parentNode;
      Array.from(para.getElementsByTagNameNS(W_NS, "r")).forEach(r => r.parentNode.removeChild(r));
      const ppr = para.getElementsByTagNameNS(W_NS, "pPr")[0];
      const cs = doc.importNode(sectOrig, true);
      const cm = cs.getElementsByTagNameNS(W_NS, "pgMar")[0]; const m = readMargins();
      if (cm){ cm.setAttributeNS(W_NS, "w:top", String(m.top)); cm.setAttributeNS(W_NS, "w:bottom", String(m.bottom)); cm.setAttributeNS(W_NS, "w:right", String(m.right)); cm.setAttributeNS(W_NS, "w:left", String(m.left)); }
      ppr.appendChild(cs);
    }
    await addPageNumbers(zip, doc, sect, { ...geom, ...readMargins() }, { ...opt, sectionPages: !!(coverEnd && sectOrig) });
  }
  let outXml = new XMLSerializer().serializeToString(doc);
  if (!/^<\?xml/.test(outXml)) outXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + outXml;
  zip.file("word/document.xml", outXml);
  if (!forPreview && numbering && numbering.used()) await writeNumbering(zip, numbering, opt);
  if (merged && !forPreview) await setUpdateFields(zip);
  if (!forPreview && fdef && !fdef.noEmbed && ctx.embed){
    // a font file that can't be fetched only skips embedding; the document still exports
    let fontOk = true;
    try { await fontBytes(fdef.file); } catch (e){ fontOk = false; console.warn("font embed skipped:", fdef.file, e); }
    if (fontOk) await embedFont(zip, fdef);
  }
  const ct = zip.file("[Content_Types].xml");
  if (ct){ const s = await ct.async("string"); zip.file("[Content_Types].xml", s.replace(/wordprocessingml\.template\.main\+xml/g, "wordprocessingml.document.main+xml")); }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 }, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

/* ---------- font embedding (obfuscated .odttf, ECMA-376 §17.8.1) ---------- */
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PR_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const fontCache = {};
async function fontBytes(file){
  if (!fontCache[file]){
    const r = await fetch("fonts/" + file);
    if (!r.ok) throw new Error("font_fetch");
    fontCache[file] = await r.arrayBuffer();
  }
  return new Uint8Array(fontCache[file].slice(0));
}
function newGuid(){
  const b = crypto.getRandomValues(new Uint8Array(16));
  const h = Array.from(b, x => x.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `{${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}}`;
}
function obfuscate(bytes, guid){
  const hex = guid.replace(/[^0-9A-F]/gi, "");
  const key = []; for (let i = 0; i < 16; i++) key.push(parseInt(hex.substr(30 - 2 * i, 2), 16));
  for (let i = 0; i < 32; i++) bytes[i] ^= key[i % 16];
  return bytes;
}
function parseXml(s){ return new DOMParser().parseFromString(s, "application/xml"); }
function xmlOut(doc){ let x = new XMLSerializer().serializeToString(doc); if (!/^<\?xml/.test(x)) x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + x; return x; }
async function relsDoc(zip, path){
  const f = zip.file(path);
  return parseXml(f ? await f.async("string") : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PR_NS}"/>`);
}
function addRel(rels, type, target){
  const ids = new Set(Array.from(rels.documentElement.children).map(r => r.getAttribute("Id")));
  let n = 1; while (ids.has("rIdZ" + n)) n++;
  const r = rels.createElementNS(PR_NS, "Relationship");
  r.setAttribute("Id", "rIdZ" + n); r.setAttribute("Type", type); r.setAttribute("Target", target);
  rels.documentElement.append(r);
  return "rIdZ" + n;
}
async function contentTypes(zip, fn){
  const doc = parseXml(await zip.file("[Content_Types].xml").async("string"));
  fn(doc, doc.documentElement.namespaceURI);
  zip.file("[Content_Types].xml", xmlOut(doc));
}
async function embedFont(zip, f){
  const docRelsPath = "word/_rels/document.xml.rels";
  const docRels = await relsDoc(zip, docRelsPath);
  const relOf = type => Array.from(docRels.documentElement.children).find(r => r.getAttribute("Type") === R_NS + "/" + type);
  const overrides = [];
  // font table
  let ftRel = relOf("fontTable");
  let ftPath = ftRel ? "word/" + ftRel.getAttribute("Target").replace(/^\/?word\//, "") : "word/fontTable.xml";
  if (!ftRel){
    addRel(docRels, R_NS + "/fontTable", "fontTable.xml");
    overrides.push(["/word/fontTable.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"]);
  }
  const ftFile = zip.file(ftPath);
  const ft = parseXml(ftFile ? await ftFile.async("string") : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts xmlns:w="${W_NS}" xmlns:r="${R_NS}"/>`);
  const ftRelsPath = ftPath.replace(/([^/]+)$/, "_rels/$1.rels");
  const ftRels = await relsDoc(zip, ftRelsPath);
  let node = Array.from(ft.documentElement.children).find(n => n.localName === "font" && n.getAttributeNS(W_NS, "name") === f.word);
  if (!node){ node = ft.createElementNS(W_NS, "w:font"); node.setAttributeNS(W_NS, "w:name", f.word); ft.documentElement.append(node); }
  Array.from(node.children).forEach(c => { if (/^embed/.test(c.localName)) c.remove(); });
  const guid = newGuid();
  const n = Object.keys(zip.files).filter(k => /^word\/fonts\//.test(k)).length + 1;
  zip.file(`word/fonts/zfont${n}.odttf`, obfuscate(await fontBytes(f.file), guid));
  const rid = addRel(ftRels, R_NS + "/font", `fonts/zfont${n}.odttf`);
  const e = ft.createElementNS(W_NS, "w:embedRegular");
  e.setAttributeNS(R_NS, "r:id", rid); e.setAttributeNS(W_NS, "w:fontKey", guid);
  node.append(e);
  zip.file(ftPath, xmlOut(ft)); zip.file(ftRelsPath, xmlOut(ftRels));
  // settings: <w:embedTrueTypeFonts/> in schema order
  let stRel = relOf("settings");
  const stPath = stRel ? "word/" + stRel.getAttribute("Target").replace(/^\/?word\//, "") : "word/settings.xml";
  if (!stRel){
    addRel(docRels, R_NS + "/settings", "settings.xml");
    overrides.push(["/word/settings.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"]);
  }
  const stFile = zip.file(stPath);
  const st = parseXml(stFile ? await stFile.async("string") : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="${W_NS}"/>`);
  if (!Array.from(st.documentElement.children).some(c => c.localName === "embedTrueTypeFonts")){
    const before = ["writeProtection","view","zoom","removePersonalInformation","removeDateAndTime","doNotDisplayPageBoundaries","displayBackgroundShape","printPostScriptOverText","printFractionalCharacterWidth","printFormsData"];
    const ref = Array.from(st.documentElement.children).find(c => !before.includes(c.localName)) || null;
    st.documentElement.insertBefore(st.createElementNS(W_NS, "w:embedTrueTypeFonts"), ref);
  }
  zip.file(stPath, xmlOut(st));
  zip.file(docRelsPath, xmlOut(docRels));
  await contentTypes(zip, (ct, ns) => {
    const root = ct.documentElement;
    if (!Array.from(root.children).some(c => c.localName === "Default" && (c.getAttribute("Extension") || "").toLowerCase() === "odttf")){
      const d = ct.createElementNS(ns, "Default"); d.setAttribute("Extension", "odttf");
      d.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.obfuscatedFont");
      root.insertBefore(d, root.firstChild);
    }
    overrides.forEach(([part, type]) => {
      if (Array.from(root.children).some(c => c.getAttribute("PartName") === part)) return;
      const o = ct.createElementNS(ns, "Override"); o.setAttribute("PartName", part); o.setAttribute("ContentType", type); root.append(o);
    });
  });
}

/* ---------- real Word numbering, page numbers, merged guide ---------- */
const CT_MAIN = "application/vnd.openxmlformats-officedocument.wordprocessingml.";
function partPathOf(rel){ return "word/" + rel.getAttribute("Target").replace(/^\/?word\//, ""); }
async function addOverride(zip, part, type){
  await contentTypes(zip, (ct, ns) => {
    const root = ct.documentElement;
    if (Array.from(root.children).some(c => c.getAttribute("PartName") === part)) return;
    const o = ct.createElementNS(ns, "Override"); o.setAttribute("PartName", part); o.setAttribute("ContentType", type); root.append(o);
  });
}
/* one bullet list definition shared by all bullet lists; each numbered list gets its own instance so it restarts at 1 */
function newNumbering(){
  const nums = []; let bullet = 0;
  return {
    nums,
    add(ordered){
      if (!ordered){ if (!bullet){ bullet = 9100 + nums.length; nums.push({ id: bullet, abs: 9002 }); } return bullet; }
      const id = 9100 + nums.length; nums.push({ id, abs: 9001, restart: true }); return id;
    },
    used(){ return nums.length > 0; },
  };
}
async function writeNumbering(zip, nb, opt){
  const font = xmlEsc(opt.font); const sz = opt.size * 2;
  const rpr = `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:rtl/></w:rPr>`;
  const lvl = (i, fmt, text) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:bidi/><w:ind w:start="${425 + i * 425}" w:hanging="425"/></w:pPr>${rpr}</w:lvl>`;
  const dec = ["%1.", "%1.%2.", "%1.%2.%3."];
  const bul = ["•", "◦", "▪"];
  let absDec = `<w:abstractNum w:abstractNumId="9001"><w:multiLevelType w:val="multilevel"/>`;
  let absBul = `<w:abstractNum w:abstractNumId="9002"><w:multiLevelType w:val="hybridMultilevel"/>`;
  for (let i = 0; i < 9; i++){
    absDec += i < 3 ? lvl(i, "decimal", dec[i]) : lvl(i, "bullet", bul[i % 3]);
    absBul += lvl(i, "bullet", bul[i % 3]);
  }
  absDec += "</w:abstractNum>"; absBul += "</w:abstractNum>";
  const numXml = nb.nums.map(n => `<w:num w:numId="${n.id}"><w:abstractNumId w:val="${n.abs}"/>${n.restart ? '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride>' : ""}</w:num>`).join("");
  const docRelsPath = "word/_rels/document.xml.rels";
  const docRels = await relsDoc(zip, docRelsPath);
  let rel = Array.from(docRels.documentElement.children).find(r => r.getAttribute("Type") === R_NS + "/numbering");
  let path = rel ? partPathOf(rel) : "word/numbering.xml";
  const f = zip.file(path);
  const nd = parseXml(f ? await f.async("string") : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="${W_NS}"/>`);
  const add = parseXml(`<w:numbering xmlns:w="${W_NS}">${absDec}${absBul}${numXml}</w:numbering>`);
  const root = nd.documentElement;
  const firstNum = Array.from(root.children).find(c => c.localName === "num" || c.localName === "numIdMacAtCleanup") || null;
  Array.from(add.documentElement.children).forEach(c => {
    const n = nd.importNode(c, true);
    if (c.localName === "abstractNum") root.insertBefore(n, firstNum);
    else { const cleanup = Array.from(root.children).find(x => x.localName === "numIdMacAtCleanup") || null; root.insertBefore(n, cleanup); }
  });
  zip.file(path, xmlOut(nd));
  if (!rel){
    addRel(docRels, R_NS + "/numbering", "numbering.xml");
    zip.file(docRelsPath, xmlOut(docRels));
    await addOverride(zip, "/word/numbering.xml", CT_MAIN + "numbering+xml");
  }
}
/* "صفحة X من Y" in a frame placed in the gap between the text and the letterhead's footer art.
   It goes into a copy of the letterhead's default footer, used only by the content section. */
async function addPageNumbers(zip, doc, sect, g, opt){
  const docRelsPath = "word/_rels/document.xml.rels";
  const docRels = await relsDoc(zip, docRelsPath);
  const refs = Array.from(sect.children).filter(c => c.localName === "footerReference");
  const defRef = refs.find(r => (r.getAttributeNS(W_NS, "type") || r.getAttribute("w:type")) === "default");
  const rid = defRef && (defRef.getAttributeNS(R_NS, "id") || defRef.getAttribute("r:id"));
  const rel = rid && Array.from(docRels.documentElement.children).find(r => r.getAttribute("Id") === rid);
  const srcPath = rel ? partPathOf(rel) : null;
  const src = srcPath && zip.file(srcPath) ? await zip.file(srcPath).async("string")
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="${W_NS}" xmlns:r="${R_NS}"></w:ftr>`;
  const ftr = parseXml(src);
  const font = xmlEsc(opt.font); const sz = Math.max(18, opt.size * 2 - 6);
  const rpr = `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:color w:val="595959"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:rtl/></w:rPr>`;
  const t = s => `<w:r>${rpr}<w:t xml:space="preserve">${s}</w:t></w:r>`;
  const fld = (instr, v) => `<w:fldSimple w:instr=" ${instr} \\* MERGEFORMAT "><w:r>${rpr}<w:t>${v}</w:t></w:r></w:fldSimple>`;
  const textW = g.pageW - g.left - g.right;
  const y = Math.max(0, g.pageH - g.bottom + 60);
  const para = `<w:p xmlns:w="${W_NS}"><w:pPr><w:framePr w:w="${textW}" w:h="300" w:hRule="atLeast" w:wrap="none" w:vAnchor="page" w:hAnchor="page" w:x="${g.left}" w:y="${y}"/><w:bidi/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>${t("صفحة ")}${fld("PAGE", "1")}${t(" من ")}${fld(opt.sectionPages ? "SECTIONPAGES" : "NUMPAGES", "1")}</w:p>`;
  const pn = ftr.importNode(parseXml(para).documentElement, true);
  const root = ftr.documentElement;
  const sectInFtr = Array.from(root.children).find(c => c.localName === "sectPr") || null;
  root.insertBefore(pn, sectInFtr);
  const newPath = "word/footerPN1.xml";
  zip.file(newPath, xmlOut(ftr));
  if (srcPath){
    const sr = zip.file(srcPath.replace(/^word\//, "word/_rels/") + ".rels");
    if (sr) zip.file("word/_rels/footerPN1.xml.rels", await sr.async("string"));
  }
  const newRid = addRel(docRels, R_NS + "/footer", "footerPN1.xml");
  zip.file(docRelsPath, xmlOut(docRels));
  await addOverride(zip, "/word/footerPN1.xml", CT_MAIN + "footer+xml");
  // point the content section's default footer at the copy
  let ref = defRef;
  if (!ref){
    ref = doc.createElementNS(W_NS, "w:footerReference");
    ref.setAttributeNS(W_NS, "w:type", "default");
    const after = Array.from(sect.children).filter(c => c.localName === "headerReference" || c.localName === "footerReference").pop();
    sect.insertBefore(ref, after ? after.nextSibling : sect.firstChild);
  }
  ref.setAttributeNS(R_NS, "r:id", newRid);
  // content pages all use the default footer, numbered from 1
  Array.from(sect.children).filter(c => c.localName === "titlePg").forEach(c => sect.removeChild(c));
  Array.from(sect.children).filter(c => c.localName === "pgNumType").forEach(c => sect.removeChild(c));
  const pg = doc.createElementNS(W_NS, "w:pgNumType"); pg.setAttributeNS(W_NS, "w:start", "1");
  const later = ["cols","formProt","vAlign","noEndnote","titlePg","textDirection","bidi","rtlGutter","docGrid","printerSettings","sectPrChange"];
  sect.insertBefore(pg, Array.from(sect.children).find(c => later.includes(c.localName)) || null);
}
/* ask Word to refresh the table of contents when the merged guide is opened */
async function setUpdateFields(zip){
  const docRelsPath = "word/_rels/document.xml.rels";
  const docRels = await relsDoc(zip, docRelsPath);
  const rel = Array.from(docRels.documentElement.children).find(r => r.getAttribute("Type") === R_NS + "/settings");
  let path = "word/settings.xml";
  if (rel) path = partPathOf(rel);
  else { addRel(docRels, R_NS + "/settings", "settings.xml"); zip.file(docRelsPath, xmlOut(docRels)); await addOverride(zip, "/word/settings.xml", CT_MAIN + "settings+xml"); }
  const f = zip.file(path);
  const st = parseXml(f ? await f.async("string") : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="${W_NS}"/>`);
  if (!Array.from(st.documentElement.children).some(c => c.localName === "updateFields")){
    const order = ["writeProtection","view","zoom","removePersonalInformation","removeDateAndTime","doNotDisplayPageBoundaries","displayBackgroundShape","printPostScriptOverText","printFractionalCharacterWidth","printFormsData","embedTrueTypeFonts","embedSystemFonts","saveSubsetFonts","saveFormsData","mirrorMargins","alignBordersAndEdges","bordersDoNotSurroundHeader","bordersDoNotSurroundFooter","gutterAtTop","hideSpellingErrors","hideGrammaticalErrors","activeWritingStyle","proofState","formsDesign","attachedTemplate","linkStyles","stylePaneFormatFilter","stylePaneSortMethod","documentType","mailMerge","revisionView","trackRevisions","doNotTrackMoves","doNotTrackFormatting","documentProtection","autoFormatOverride","styleLockTheme","styleLockQFSet","defaultTabStop","autoHyphenation","consecutiveHyphenLimit","hyphenationZone","doNotHyphenateCaps","showEnvelope","summaryLength","clickAndTypeStyle","defaultTableStyle","evenAndOddHeaders","bookFoldRevPrinting","bookFoldPrinting","bookFoldPrintingSheets","drawingGridHorizontalSpacing","drawingGridVerticalSpacing","displayHorizontalDrawingGridEvery","displayVerticalDrawingGridEvery","doNotUseMarginsForDrawingGridOrigin","drawingGridHorizontalOrigin","drawingGridVerticalOrigin","doNotShadeFormData","noPunctuationKerning","characterSpacingControl","printTwoOnOne","strictFirstAndLastChars","noLineBreaksAfter","noLineBreaksBefore","savePreviewPicture","doNotValidateAgainstSchema","saveInvalidXml","ignoreMixedContent","alwaysShowPlaceholderText","doNotDemarcateInvalidXml","saveXmlDataOnly","useXSLTWhenSaving","saveThroughXslt","showXMLTags","alwaysMergeEmptyNamespace"];
    const ref = Array.from(st.documentElement.children).find(c => !order.includes(c.localName)) || null;
    const u = st.createElementNS(W_NS, "w:updateFields"); u.setAttributeNS(W_NS, "w:val", "true");
    st.documentElement.insertBefore(u, ref);
  }
  zip.file(path, xmlOut(st));
}
/* one Word file holding several policies: a guide cover, a contents page, then each policy on its own pages */
function guideXml(opt, base, ctxs){
  const font = xmlEsc(opt.font);
  const r = (t, sz, b, color) => `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>${b || opt.allBold ? "<w:b/><w:bCs/>" : ""}${color ? `<w:color w:val="${color}"/>` : ""}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:rtl/></w:rPr><w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
  const pp = (before, after, jc, extra = "") => `<w:pPr>${extra}<w:bidi/><w:spacing w:before="${before}" w:after="${after}" w:line="300" w:lineRule="auto"/><w:jc w:val="${jc}"/></w:pPr>`;
  const m = opt.margins; const sects = ((state.geom && state.geom.pageH) || 16838) - m.top - m.bottom;
  const pageBreak = '<w:p><w:pPr><w:bidi/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>';
  let x = "";
  if (base.cover){
    x += `<w:p>${pp(Math.max(600, Math.round(sects * 0.3)), 240, "center")}${r(base.guideTitle || "دليل السياسات واللوائح", Math.max(44, opt.size * 2 + 26), true)}</w:p>`;
    if (base.name) x += `<w:p>${pp(120, 0, "center")}${r(base.name, opt.size * 2 + 8, false)}</w:p>`;
    x += `<w:p>${pp(240, 0, "center")}${r(ctxs.length + " " + (ctxs.length <= 10 && ctxs.length > 2 ? "سياسات" : "سياسة"), opt.size * 2, false, "595959")}</w:p>`;
    x += COVER_BREAK;
  }
  // contents: a TOC field Word refreshes on open, pre-filled with the titles
  const fr = (type) => `<w:r><w:fldChar w:fldCharType="${type}"/></w:r>`;
  x += `<w:p>${pp(0, 240, opt.forPreview ? "right" : "start")}${r("المحتويات", opt.size * 2 + 8, true)}</w:p>`;
  const entries = ctxs.map((c, i) => `<w:p>${pp(0, 80, opt.forPreview ? "right" : "start")}${i === 0 && !opt.forPreview ? fr("begin") + `<w:r><w:instrText xml:space="preserve"> TOC \\o "1-1" \\h \\z \\u </w:instrText></w:r>` + fr("separate") : ""}${r((i + 1) + ". " + fillName(c.p.title, base.name), opt.size * 2, false)}${i === ctxs.length - 1 && !opt.forPreview ? fr("end") : ""}</w:p>`);
  x += entries.join("");
  ctxs.forEach(c => {
    x += pageBreak;
    x += `<w:p>${pp(0, 120, "center", '<w:keepNext/>').replace("</w:pPr>", '<w:outlineLvl w:val="0"/></w:pPr>')}${r(fillName(c.p.title, base.name), opt.size * 2 + 12, true)}</w:p>`;
    if (c.p.code) x += `<w:p>${pp(0, 200, "center")}${r(c.p.code, opt.size * 2 - 2, false, "595959")}</w:p>`;
    const rows = approvalRows(c.approval);
    if (rows.length) x += approvalXml(opt, rows) + `<w:p>${pp(0, 200, "center")}</w:p>`;
    x += buildBodyXml(policyHtmlForExport(c), { ...opt, title: "", approvalTop: "", outlineBase: 1 }) + stmtXml(opt, c) + versionsXml(opt, c);
  });
  return x;
}

/* ---------- preview / pagination ---------- */
const SANS = /arial|calibri|tahoma|simplified|segoe|helvetica|verdana|dubai|cairo|tajawal/i;
function webFallbackFonts(root){
  root.querySelectorAll("[style]").forEach(el => {
    const f = el.style.fontFamily; if (!f) return;
    el.style.fontFamily = f + (SANS.test(f) ? ', "IBM Plex Sans Arabic", sans-serif' : ', "Noto Naskh Arabic", serif');
  });
}

let previewTimer = null, previewSeq = 0;
function schedulePreview(ms = 700){ clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, ms); }
function clearPreview(){ $("pages").innerHTML = '<div class="placeholder">ستظهر هنا صفحات السياسة على كليشة الجمعية.</div>'; }

async function renderPreview(){
  if (!current()){ clearPreview(); return; }
  if (pTab !== "preview"){ previewStale = true; return; }
  previewStale = false;
  const seq = ++previewSeq;
  try {
    const pages = await paginate($("stage"), null, null, () => seq !== previewSeq);
    if (!pages || seq !== previewSeq) return;
    showPages(pages);
  } catch (e){
    console.error(e);
    $("pages").innerHTML = '<div class="placeholder">تعذّر عرض المعاينة لهذا الملف، ويبقى تصدير وورد متاحاً.</div>';
  }
}

/* one render at a time: every render shares #stage, #docxStyles and the letterhead geometry,
   so a preview typed during an export (or a slow preview) waits its turn instead of mixing pages */
let paginateLock = Promise.resolve();
function paginate(stage, ctx, merged = null, stale = null){
  const run = paginateLock.then(() => (stale && stale()) ? null : paginateNow(stage, ctx || uiCtx(), merged));
  paginateLock = run.catch(() => {});
  return run;
}
async function paginateNow(stage, ctx, merged){
  const blob = await buildDocx({ forPreview: true, ctx, merged });
  stage.innerHTML = ""; const styles = $("docxStyles"); styles.innerHTML = "";
  await docx.renderAsync(blob, stage, styles, {
    className: "docx", inWrapper: false, breakPages: true, ignoreLastRenderedPageBreak: true,
    renderHeaders: true, renderFooters: true, renderFootnotes: false, useBase64URL: true, experimental: false,
  });
  webFallbackFonts(stage);
  placeFloatingArt(stage, state.artBoxes || {});
  /* text boxes: docx-preview cannot draw Word shapes, so each box leaves a marker that is swapped for a drawn box after paging */
  textNodes(stage).forEach(tn => {
    if (!tn.nodeValue.includes("⟦TB")) return;
    const parts = tn.nodeValue.split(/⟦TB(\d+)⟧/); const fr = document.createDocumentFragment();
    parts.forEach((t, i) => { if (i % 2){ const m = document.createElement("span"); m.className = "tbm"; m.dataset.tbm = t; fr.append(m); } else if (t) fr.append(document.createTextNode(t)); });
    tn.replaceWith(fr);
  });
  // docx-preview leaves a left-aligned table on the right of a right-to-left page
  stage.querySelectorAll("table").forEach(t => { if (t.style.textAlign === "left"){ t.style.textAlign = ""; t.style.marginRight = "auto"; } });
  try {
    const f = fontDef();
    if (f) await Promise.all([document.fonts.load(`16px "${f.word}"`), document.fonts.load(`bold 16px "${f.word}"`)]);
    await document.fonts.ready;
  } catch {}
  const secs = Array.from(stage.querySelectorAll(":scope > section.docx"));
  if (!secs.length) throw new Error("no_sections");
  const rest = secs.length > 1 ? secs[secs.length - 1] : secs[0];
  const contentSecs = secs.slice(0, Math.max(1, secs.length - 1)); // the last one is the preview's extra page

  const work = document.createElement("div"); stage.append(work);
  const made = [];
  const newPage = tpl => {
    const pg = tpl.cloneNode(false);
    pg.classList.add("pg");
    pg.style.height = tpl.style.minHeight || "297mm";
    Array.from(tpl.children).forEach(ch => {
      if (ch.tagName === "ARTICLE"){ const a = ch.cloneNode(false); pg.append(a); }
      else pg.append(ch.cloneNode(true));
    });
    if (!pg.querySelector(":scope > article")) pg.append(document.createElement("article"));
    work.append(pg); made.push(pg);
    return pg.querySelector(":scope > article");
  };
  const fits = a => a.scrollHeight <= a.clientHeight + 1;

  let art = null, count = 0, firstSecPages = 0;
  for (const sec of contentSecs){
  if (made.length && !firstSecPages) firstSecPages = made.length;
  art = newPage(sec); count = 0;
  const a0 = sec.querySelector(":scope > article");
  for (const blk of a0 ? Array.from(a0.children) : []){
    /* an empty paragraph (spacing, or what is left of a page break) never starts a new page */
    if (blk.tagName === "P" && !blk.textContent.trim() && !blk.querySelector("img,svg,canvas,table")){
      art.append(blk); if (!fits(art)) art.removeChild(blk); continue;
    }
    let el = blk;
    for (let guard = 0; guard < 40 && el; guard++){
      art.append(el);
      if (fits(art)){ count++; el = null; break; }
      art.removeChild(el);
      const split = splitToFit(art, el, count === 0);
      if (split){ art.append(split.head); count++; }
      if (!split && count === 0){ art.append(el); el = null; break; }
      const prev = art; const tail = prev.lastElementChild;
      const carry = prev.children.length > 1 && !split && headingLike(tail) ? tail : null;
      art = newPage(rest); count = 0;
      if (carry){ art.append(carry); count = 1; }
      el = split ? split.tail : el;
    }
  }
  }
  if (!firstSecPages) firstSecPages = made.length;
  placePreviewBoxes(made);
  /* Word keeps the footer at its own distance from the page bottom; docx-preview stacks it right under the text */
  if (state.geom) made.forEach(pg => pg.querySelectorAll(":scope > footer").forEach(f => {
    const g = state.geom;
    Object.assign(f.style, { position: "absolute", bottom: g.footer / 15 + "px", left: g.left / 15 + "px", right: g.right / 15 + "px", marginTop: "0", paddingTop: "0" });
  }));
  if (ctx.pageNums && state.geom){
    const g = state.geom; const start = ctx.cover ? firstSecPages : 0; const total = made.length - start;
    const v = currentWeight(); const pt = Math.max(9, +$("size").value - 3);
    made.forEach((pg, i) => {
      if (i < start) return;
      const n = document.createElement("div"); n.className = "pgno";
      Object.assign(n.style, { position: "absolute", left: g.left / 15 + "px", width: (g.pageW - g.left - g.right) / 15 + "px",
        top: (g.pageH - g.bottom + 60) / 15 + "px", textAlign: "center", fontFamily: cssFamily(v), fontWeight: cssWeight(v),
        fontSize: pt + "pt", lineHeight: "1.2", color: "#595959", direction: "rtl", zIndex: "3" });
      n.textContent = `صفحة ${i - start + 1} من ${total}`;
      pg.append(n);
    });
  }
  try { tbxLayoutAll(); } catch {}
  return made;
}

function placePreviewBoxes(pages){
  const list = state.tbxPrev || []; if (!list.length) return;
  const k = 96 / 2.54; const done = new Set(); const v = currentWeight();
  pages.forEach(pg => pg.querySelectorAll("span.tbm").forEach(m => {
    const n = +m.dataset.tbm; const b = list[n];
    if (!b || done.has(n)){ m.remove(); return; }
    done.add(n);
    const art = pg.querySelector(":scope > article") || pg; const par = m.closest("p") || m.parentNode;
    const pr = pg.getBoundingClientRect(), ar = art.getBoundingClientRect(), qr = par.getBoundingClientRect();
    const d = b.d; const el = document.createElement("div"); el.className = "tbx-prev";
    el.innerHTML = b.html;
    el.querySelectorAll(".tbox-ui,.tbox-h").forEach(x => x.remove());
    Object.assign(el.style, {
      position: "absolute", boxSizing: "border-box", overflow: "hidden", direction: "rtl", textAlign: "justify",
      left: (ar.right - pr.left - (d.x + d.w) * k) + "px", top: (qr.top - pr.top + d.y * k) + "px", width: d.w * k + "px", height: d.h * k + "px",
      padding: `${0.127 * k}px ${0.254 * k}px`, zIndex: d.z === "behind" ? "0" : "2",
      border: d.border === "none" ? "0" : `${d.bw}pt solid ${d.border}`, background: d.fill === "none" ? "transparent" : d.fill,
      fontFamily: cssFamily(v), fontWeight: cssWeight(v), fontSize: $("size").value + "pt", lineHeight: "1.25", color: "#000",
    });
    el.querySelectorAll("p,div,h1,h2,h3,li").forEach(x => { x.style.margin = "0 0 6pt"; });
    pg.append(el); m.remove();
  }));
}
/* a short, all-bold paragraph is a heading: keep it with the paragraph after it */
function headingLike(el){
  if (!el || el.tagName !== "P") return false;
  const t = el.textContent.trim();
  if (!t || t.length > 90) return false;
  const spans = Array.from(el.querySelectorAll("span")).filter(x => x.textContent.trim());
  return spans.length > 0 && spans.every(x => { const w = getComputedStyle(x).fontWeight; return w === "bold" || +w >= 600; });
}

/* split a block so its head fits the remaining space of `art`; returns {head, tail} or null */
function splitToFit(art, el, emptyPage){
  if (el.tagName === "TABLE") return splitTable(art, el);
  const total = textLen(el);
  if (total < 40) return null;
  let lo = 1, hi = total - 1, best = 0;
  while (lo <= hi){
    const mid = (lo + hi) >> 1;
    const head = truncate(el, snapWord(el, mid), true);
    art.append(head);
    const ok = art.scrollHeight <= art.clientHeight + 1;
    art.removeChild(head);
    if (ok){ best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  const cut = snapWord(el, best);
  if (!cut || (!emptyPage && cut < 30)) return null;
  return { head: truncate(el, cut, true), tail: truncate(el, cut, false) };
}
function splitTable(art, tbl){
  const rows = Array.from(tbl.querySelectorAll("tr"));
  if (rows.length < 2) return null;
  let n = 0;
  for (let k = 1; k < rows.length; k++){
    const head = tableSlice(tbl, 0, k); art.append(head);
    const ok = art.scrollHeight <= art.clientHeight + 1; art.removeChild(head);
    if (ok) n = k; else break;
  }
  if (!n) return null;
  return { head: tableSlice(tbl, 0, n), tail: tableSlice(tbl, n, rows.length) };
}
function tableSlice(tbl, from, to){
  const c = tbl.cloneNode(true);
  Array.from(c.querySelectorAll("tr")).forEach((r, i) => { if (i < from || i >= to) r.remove(); });
  return c;
}
function textNodes(el){ const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const a = []; while (w.nextNode()) a.push(w.currentNode); return a; }
function textLen(el){ return textNodes(el).reduce((s, n) => s + n.nodeValue.length, 0); }
function snapWord(el, n){
  const t = textNodes(el).map(x => x.nodeValue).join("");
  if (n >= t.length) return t.length;
  const i = t.lastIndexOf(" ", n);
  return i > 0 ? i + 1 : n;
}
function truncate(el, n, keepHead){
  const c = el.cloneNode(true); let pos = 0;
  textNodes(c).forEach(tn => {
    const len = tn.nodeValue.length; const start = pos; pos += len;
    if (keepHead){
      if (start >= n) tn.nodeValue = "";
      else if (pos > n) tn.nodeValue = tn.nodeValue.slice(0, n - start);
    } else {
      if (pos <= n) tn.nodeValue = "";
      else if (start < n) tn.nodeValue = tn.nodeValue.slice(n - start);
    }
  });
  if (!keepHead){ c.style.textIndent = "0"; }
  return c;
}

function showPages(pages){
  const box = $("pages"); box.innerHTML = "";
  const avail = Math.max(240, box.clientWidth - 36);
  pages.forEach((pg, i) => {
    const w = pg.offsetWidth, h = pg.offsetHeight;
    const s = Math.min(1, avail / w);
    const wrap = document.createElement("div"); wrap.className = "pw";
    wrap.style.width = Math.round(w * s) + "px"; wrap.style.height = Math.round(h * s) + "px";
    const clone = pg.cloneNode(true); clone.style.transform = `scale(${s})`;
    wrap.append(clone); box.append(wrap);
    const n = document.createElement("div"); n.className = "pnum"; n.textContent = `صفحة ${i + 1} من ${pages.length}`; box.append(n);
  });
}
$("refreshBtn").addEventListener("click", () => renderPreview());
let lastW = 0;
new ResizeObserver(() => { const w = $("pages").clientWidth; if (Math.abs(w - lastW) > 30){ lastW = w; schedulePreview(200); } }).observe($("pages"));
/* the shell shows and hides this view; text boxes and the preview are measured, so redo them when it comes back */
window.addEventListener("app:view", e => { if (e.detail !== "governance/library") return; tbxLayoutAll(); if (pTab === "preview") schedulePreview(50); });

/* ---------- policy tabs: edit / preview / approval ---------- */
let pTab = "edit", previewStale = true;
function setPTab(t){
  pTab = t;
  document.querySelectorAll("#pTabs .tab").forEach(b => b.setAttribute("aria-selected", b.dataset.ptab === t ? "true" : "false"));
  $("tabEdit").hidden = t !== "edit"; $("tabPreview").hidden = t !== "preview"; $("tabApproval").hidden = t !== "approval";
  if (t === "preview" && previewStale) schedulePreview(0);
  try { localStorage.setItem("assoc-policies-tab", t); } catch {}
}
document.querySelectorAll("#pTabs .tab").forEach(b => b.addEventListener("click", () => setPTab(b.dataset.ptab)));

/* ---------- approval details (per association, per policy) ---------- */
const AP_IDS = { version: "apVersion", by: "apBy", resolution: "apResolution", date: "apDate", review: "apReview", minutes: "apMinutes", mcal: "apMcal", mdate: "apMinutesDate" };
(function fillMinuteLists(){
  const mn = $("apMinutes"); mn.append(new Option("—  اختر الرقم  —", ""));
  for (let i = 1; i <= 300; i++) mn.append(new Option(String(i), String(i)));
  for (let i = 1; i <= 30; i++) $("apHd").append(new Option(String(i).padStart(2, "0"), String(i).padStart(2, "0")));
  HIJRI_MONTHS.forEach((m, i) => $("apHm").append(new Option(`${String(i + 1).padStart(2, "0")} - ${m}`, String(i + 1).padStart(2, "0"))));
  for (let y = 1435; y <= 1470; y++) $("apHy").append(new Option(String(y), String(y)));
})();
function todayHijri(){
  const o = {}; try { new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).forEach(x => { o[x.type] = x.value; }); } catch {}
  return o.year ? `${o.year.replace(/\D/g, "")}-${o.month}-${o.day}` : "1448-01-01";
}
function syncMcal(){ const c = $("apMcal").value; $("apGWrap").hidden = c !== "gregory"; $("apHWrap").hidden = c !== "islamic"; }
function renderApproval(){
  const p = current(); const a = (p && state.approvals[p.id]) || {};
  Object.entries(AP_IDS).forEach(([k, id]) => { $(id).value = a[k] || ""; $(id).disabled = !p; });
  if ($("apMinutes").value !== (a.minutes || "")){ $("apMinutes").append(new Option(a.minutes, a.minutes)); $("apMinutes").value = a.minutes; }
  const [hy, hm, hd] = (a.hdate || todayHijri()).split("-"); $("apHy").value = hy; $("apHm").value = hm; $("apHd").value = hd;
  ["apHy","apHm","apHd"].forEach(id => { $(id).disabled = !p; });
  syncMcal();
  $("apDateH").textContent = fmtApprovalDate(a.date); $("apReviewH").textContent = fmtApprovalDate(a.review);
  $("apDot").hidden = !approvalFor(p && p.id);
  renderStmtPreview();
}
function renderStmtPreview(){
  const p = current(); const a = (p && state.approvals[p.id]) || null;
  $("stmtPreview").textContent = stmtText(a);
  $("stmtPreview").dataset.off = String(!$("stmtOn").checked);
}
try { const v = JSON.parse(localStorage.getItem("assoc-policies-stmt") || "null"); if (v) $("stmtOn").checked = !!v.on; } catch {}
$("stmtOn").addEventListener("change", () => { try { localStorage.setItem("assoc-policies-stmt", JSON.stringify({ on: $("stmtOn").checked })); } catch {} renderStmtPreview(); previewStale = true; schedulePreview(50); });
let apTimer = null;
/* approvals typed before the association is saved are kept here, so a reload does not lose them */
const AP_DRAFT = "assoc-policies-approvals-draft";
function approvalChanged(){
  const p = current(); if (!p) return;
  const a = {}; Object.entries(AP_IDS).forEach(([k, id]) => { a[k] = $(id).value.trim(); });
  a.hdate = a.mcal === "islamic" ? `${$("apHy").value}-${$("apHm").value}-${$("apHd").value}` : "";
  syncMcal();
  state.approvals[p.id] = a;
  $("apDateH").textContent = fmtApprovalDate(a.date); $("apReviewH").textContent = fmtApprovalDate(a.review);
  $("apDot").hidden = !approvalFor(p.id);
  renderStmtPreview();
  previewStale = true; schedulePreview();
  clearTimeout(apTimer); apTimer = null;
  if (state.assocId) apTimer = setTimeout(() => { apTimer = null; saveAssocApprovals().catch(() => {}); }, 900);
  else lsWrite(AP_DRAFT, state.approvals);
}
Object.values(AP_IDS).concat(["apHd","apHm","apHy"]).forEach(id => { $(id).addEventListener("input", approvalChanged); $(id).addEventListener("change", approvalChanged); });
$("apReviewAuto").addEventListener("click", () => {
  const v = $("apDate").value; if (!v){ $("apDate").focus(); return; }
  const d = new Date(v + "T12:00:00"); d.setFullYear(d.getFullYear() + 2);
  $("apReview").value = d.toISOString().slice(0, 10); approvalChanged();
});

/* ---------- saved associations: name, letterhead, page settings, font, approvals ---------- */
const STORE_LS = c => "assoc-store-" + c;
const store = {
  col(c){ return state.db.collection(c); },
  async get(c, id){
    if (state.mode === "db"){ const s = await this.col(c).doc(id).get(); return s.exists ? s.data() : null; }
    return lsRead(STORE_LS(c), {})[id] || null;
  },
  async set(c, id, data){
    if (state.mode === "db") return this.col(c).doc(id).set(data);
    const all = lsRead(STORE_LS(c), {}); all[id] = data;
    try { localStorage.setItem(STORE_LS(c), JSON.stringify(all)); } catch { throw Object.assign(new Error("quota"), { code: "quota_exceeded" }); }
  },
  async update(c, id, data){
    if (state.mode === "db") return this.col(c).doc(id).update(data);
    const all = lsRead(STORE_LS(c), {}); all[id] = { ...(all[id] || {}), ...data }; lsWrite(STORE_LS(c), all);
  },
  async del(c, id){
    if (state.mode === "db") return this.col(c).doc(id).delete();
    const all = lsRead(STORE_LS(c), {}); delete all[id]; lsWrite(STORE_LS(c), all);
  },
};
function b64FromBuf(buf){ const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
function bufFromB64(b){ const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
const LH_CHUNK = 190000;

function renderAssocSel(){
  const sel = $("assocSel"); const cur = state.assocId || "";
  sel.innerHTML = "";
  sel.append(new Option("جمعية جديدة (غير محفوظة)", ""));
  [...state.assocs].sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar")).forEach(a => sel.append(new Option(a.name || "بدون اسم", a.id)));
  sel.value = state.assocs.some(a => a.id === cur) ? cur : "";
  $("assocDel").hidden = !sel.value || !state.canWrite;
  $("assocSave").textContent = sel.value ? "حفظ التغييرات" : "حفظ الجمعية";
  $("assocSave").disabled = !state.canWrite;
}
function assocNote(t, kind){ const n = $("assocNote"); n.textContent = t || ""; n.className = "note field full" + (kind === "err" ? " err-text" : ""); }
function settingsSnapshot(){
  return { margins: readMargins(), font: $("font").value, size: +$("size").value,
           cover: $("cover").checked, addTitle: $("addTitle").checked, keepBody: $("keepBody").checked, pageNums: $("pageNums").checked, embed: $("embedFont").checked,
           stmt: $("stmtOn").checked, verTable: $("verTable").checked };
}
async function saveAssoc(){
  const name = $("assoc").value.trim();
  if (!name){ assocNote("اكتب اسم الجمعية أولاً.", "err"); $("assoc").focus(); return; }
  const id = state.assocId || ("a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const prev = state.assocs.find(a => a.id === id) || {};
  const btn = $("assocSave"); busy(btn, true, "جارٍ الحفظ…");
  try {
    let lhChunks = prev.lhChunks || 0, lhName = prev.lhName || "";
    if (state.letterheadRaw && state.lhSavedFor !== id){
      const b64 = b64FromBuf(state.letterheadRaw);
      const n = Math.ceil(b64.length / LH_CHUNK);
      for (let i = 0; i < n; i++) await store.set("letterheads", `${id}_${i}`, { assoc: id, i, n, data: b64.slice(i * LH_CHUNK, (i + 1) * LH_CHUNK) });
      for (let i = n; i < lhChunks; i++) await store.del("letterheads", `${id}_${i}`).catch(() => {});
      lhChunks = n; lhName = state.letterheadName; state.lhSavedFor = id;
    } else if (!state.letterheadRaw && lhChunks && state.lhLoadFailed !== id){
      for (let i = 0; i < lhChunks; i++) await store.del("letterheads", `${id}_${i}`).catch(() => {});
      lhChunks = 0; lhName = "";
    }
    const body = { name, lhName, lhChunks, lhMargins: state.lhMargins || null, settings: settingsSnapshot(), approvals: state.approvals, updatedAt: new Date().toISOString() };
    await store.set("associations", id, body);
    state.assocId = id;
    try { localStorage.setItem("assoc-policies-assoc", id); localStorage.removeItem(AP_DRAFT); } catch {}
    if (state.mode !== "db"){ const i = state.assocs.findIndex(a => a.id === id); const row = { id, ...body }; if (i >= 0) state.assocs[i] = row; else state.assocs.push(row); }
    renderAssocSel();
    assocNote("حُفظت «" + name + "». اخترها من القائمة في أي وقت لتعود بكليشتها وإعداداتها.", "ok");
  } catch (e){ assocNote(storeError(e), "err"); }
  finally { busy(btn, false); renderAssocSel(); }
}
async function saveAssocApprovals(){
  if (!state.assocId || !state.canWrite) return;
  const data = { approvals: JSON.parse(JSON.stringify(state.approvals)), updatedAt: new Date().toISOString() };
  const row = state.assocs.find(a => a.id === state.assocId); if (row) Object.assign(row, data);
  await store.update("associations", state.assocId, data);
}
async function loadAssoc(id){
  // save approval edits still waiting on the timer before leaving this association
  if (apTimer){ clearTimeout(apTimer); apTimer = null; await saveAssocApprovals().catch(() => {}); }
  if (!id){
    state.assocId = null; state.approvals = lsRead(AP_DRAFT, {}); state.lhSavedFor = null;
    try { localStorage.removeItem("assoc-policies-assoc"); } catch {}
    renderAssocSel(); renderApproval(); assocNote(""); return;
  }
  const a = state.assocs.find(x => x.id === id) || await store.get("associations", id);
  if (!a){ renderAssocSel(); return; }
  state.lhLoadFailed = null;
  state.assocId = id;
  try { localStorage.setItem("assoc-policies-assoc", id); } catch {}
  $("assoc").value = a.name || "";
  try { localStorage.setItem("assoc-policies-name", $("assoc").value); } catch {}
  const st = a.settings || {};
  if (st.font && weightById(st.font)){ $("font").value = st.font; renderFontButton(); $("font").dispatchEvent(new Event("change")); }
  if (st.size) $("size").value = String(st.size);
  ["cover","addTitle","keepBody","pageNums","verTable"].forEach(k => { if (typeof st[k] === "boolean") $(k).checked = st[k]; });
  if (typeof st.embed === "boolean") $("embedFont").checked = st.embed;
  if (typeof st.stmt === "boolean") $("stmtOn").checked = st.stmt;
  state.approvals = a.approvals ? JSON.parse(JSON.stringify(a.approvals)) : {};
  renderAssocSel(); renderApproval();
  if (a.lhChunks){
    assocNote("جارٍ تحميل كليشة الجمعية…");
    try {
      let b64 = "";
      for (let i = 0; i < a.lhChunks; i++){ const c = await store.get("letterheads", `${id}_${i}`); if (!c) throw new Error("missing"); b64 += c.data; }
      if (state.assocId !== id) return;
      await loadLetterheadBuf(bufFromB64(b64), a.lhName || "كليشة.docx", { quiet: true });
      state.lhSavedFor = id;
      if (st.margins) setMargins(st.margins);
      assocNote("");
    } catch {
      if (state.assocId !== id) return;
      state.letterhead = null; state.letterheadRaw = null; state.letterheadName = ""; state.lhMargins = null; state.lhSavedFor = null;
      state.lhLoadFailed = id; // keep the stored letterhead: saving now must not delete it
      $("lhName").innerHTML = '<span class="hint">اسحب الملف هنا أو اضغط للاختيار (.docx)</span>';
      setMargins(st.margins || DEFAULT_MARGINS);
      assocNote("تعذّر تحميل كليشة هذه الجمعية. أرفقها من جديد ثم اضغط «حفظ التغييرات».", "err");
    }
  } else {
    state.letterhead = null; state.letterheadRaw = null; state.letterheadName = ""; state.lhMargins = null;
    $("lhName").innerHTML = '<span class="hint">اسحب الملف هنا أو اضغط للاختيار (.docx)</span>';
    setMargins(st.margins || DEFAULT_MARGINS);
    assocNote("");
  }
  updateSettingsHint(); previewStale = true; schedulePreview(50);
}
let delAssocArmed = null;
$("assocSel").addEventListener("change", () => loadAssoc($("assocSel").value));
$("assocSave").addEventListener("click", saveAssoc);
$("assocDel").addEventListener("click", async () => {
  const b = $("assocDel"); const id = state.assocId; if (!id) return;
  if (delAssocArmed !== id){ delAssocArmed = id; b.textContent = "تأكيد الحذف"; b.classList.add("armed"); setTimeout(() => { delAssocArmed = null; b.textContent = "حذف"; b.classList.remove("armed"); }, 4000); return; }
  delAssocArmed = null; b.textContent = "حذف"; b.classList.remove("armed");
  const a = state.assocs.find(x => x.id === id);
  try {
    for (let i = 0; i < ((a && a.lhChunks) || 0); i++) await store.del("letterheads", `${id}_${i}`).catch(() => {});
    await store.del("associations", id);
    if (state.mode !== "db") state.assocs = state.assocs.filter(x => x.id !== id);
    state.assocId = null; renderAssocSel(); assocNote("حُذفت الجمعية من القائمة. البيانات المكتوبة في الصفحة باقية حتى تغيّرها.");
  } catch (e){ assocNote(storeError(e), "err"); }
});
function initAssocs(){
  const last = (() => { try { return localStorage.getItem("assoc-policies-assoc"); } catch { return null; } })();
  let first = true;
  const ready = () => {
    renderAssocSel();
    if (first){ first = false; if (last && state.assocs.some(a => a.id === last)) loadAssoc(last); else { state.approvals = lsRead(AP_DRAFT, {}); renderApproval(); } }
  };
  if (state.mode === "db"){
    store.col("associations").onSnapshot(snap => { state.assocs = snap.docs.map(d => ({ id: d.id, ...d.data() })); ready(); }, () => {});
  } else {
    state.assocs = Object.entries(lsRead(STORE_LS("associations"), {})).map(([id, v]) => ({ id, ...v })); ready();
  }
}

/* settings summary line, so the collapsed panel still says what is set */
function updateSettingsHint(){
  const m = readMargins(); const f = tw => (Math.round(tw / TW_CM * 10) / 10);
  const bits = [`الهوامش ${f(m.top)}/${f(m.bottom)}/${f(m.right)}/${f(m.left)} سم`];
  if ($("cover").checked) bits.push("صفحة غلاف");
  if ($("pageNums").checked) bits.push("ترقيم");
  $("settingsHint").textContent = bits.join(" · ");
}
["mgTop","mgBottom","mgRight","mgLeft"].forEach(id => $(id).addEventListener("input", updateSettingsHint));
["cover","pageNums"].forEach(id => $(id).addEventListener("change", updateSettingsHint));

/* ---------- export ---------- */
let msgTimer = null;
function setMsg(t, kind){
  const m = $("msg"); m.textContent = t || ""; m.className = "msg" + (kind ? " " + kind : "");
  clearTimeout(msgTimer); if (t && kind !== "err") msgTimer = setTimeout(() => { if (m.textContent === t) m.textContent = ""; }, 7000);
}
function fileBase(){
  const p = current(); const name = $("assoc").value.trim();
  return ((p ? p.title : "سياسة") + (name ? " - " + name : "")).replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 150);
}
function ready(){
  if (!current()){ setMsg("اختر سياسة من المكتبة أولاً.", "err"); return false; }
  if (!$("assoc").value.trim()){ setMsg("اكتب اسم الجمعية أولاً.", "err"); $("assoc").focus(); return false; }
  return true;
}
async function offer(filename, blob){
  let dl = state.downloads;
  if (!dl && window.claude && window.claude.use){ try { dl = state.downloads = await window.claude.use("downloads"); } catch {} }
  if (!dl){
    // outside Claude: a normal browser download
    try {
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMsg("جاهز: " + filename, "ok");
    } catch { setMsg("تعذّر حفظ الملف في هذا العرض.", "err"); }
    return;
  }
  try {
    await dl.save({ filename, data: blob });
    setMsg("جاهز: " + filename, "ok");
  } catch (e){
    const c = e && e.code;
    if (c === "declined") setMsg("أُلغي الحفظ.", "");
    else if (c === "rate_limited") setMsg("هناك نافذة حفظ مفتوحة بالفعل. أكملها ثم أعد المحاولة.", "err");
    else setMsg("تعذّر حفظ الملف في هذا العرض.", "err");
  }
}
/* ---------- backup and restore: the whole library in one JSON file, to move it to another account or keep it safe ---------- */
const BK_COLS = ["policies", "associations", "letterheads", "vindex", "versions", "prefs"];
function readCol(c){
  if (state.mode !== "db"){
    if (c === "policies") return Promise.resolve(state.policies.map(p => { const { id, ...data } = p; return { id, data }; }));
    return Promise.resolve(Object.entries(lsRead(STORE_LS(c), {})).map(([id, data]) => ({ id, data })));
  }
  return new Promise((res, rej) => {
    let un = null, done = false;
    un = state.db.collection(c).onSnapshot(snap => {
      if (done) return; done = true;
      res(snap.docs.map(d => ({ id: d.id, data: d.data() })));
      setTimeout(() => { try { un && un(); } catch {} }, 0);
    }, err => { if (!done){ done = true; rej(err); } });
  });
}
$("bkOut").addEventListener("click", async () => {
  const b = $("bkOut"); busy(b, true, "جارٍ التجهيز…");
  try {
    const out = { app: "assoc-policies", format: 1, exportedAt: new Date().toISOString(), collections: {} };
    for (const c of BK_COLS) out.collections[c] = await readCol(c);
    const n = out.collections.policies.length, a = out.collections.associations.length;
    const blob = new Blob([JSON.stringify(out)], { type: "application/json" });
    await offer(`نسخة احتياطية - مكتبة اللوائح - ${new Date().toISOString().slice(0, 10)}.json`, blob);
    if ($("msg").className.includes("ok")) setMsg(`جاهز: نسخة احتياطية فيها ${n} سياسة و${a} جمعية.`, "ok");
  } catch (e){ console.error(e); setMsg("تعذّر تجهيز النسخة الاحتياطية.", "err"); }
  finally { busy(b, false); }
});
$("bkIn").addEventListener("click", () => { if (!state.canWrite){ setMsg("ليست لديك صلاحية التعديل على هذه المكتبة.", "err"); return; } $("bkFile").value = ""; $("bkFile").click(); });
$("bkFile").addEventListener("change", async () => {
  const f = $("bkFile").files[0]; if (!f) return;
  let bk; try { bk = JSON.parse(await f.text()); } catch { setMsg("هذا الملف ليس نسخة احتياطية صالحة.", "err"); return; }
  if (!bk || bk.app !== "assoc-policies" || !bk.collections){ setMsg("هذا الملف ليس نسخة احتياطية من مكتبة اللوائح.", "err"); return; }
  const cols = bk.collections; const n = (cols.policies || []).length, a = (cols.associations || []).length;
  bkPending = bk;
  $("bkAskT").textContent = `في الملف ${n} سياسة و${a} جمعية مع كليشاتها وسجل الإصدارات. تُضاف إلى المكتبة، وما يطابق عنصراً موجوداً يُستبدل.`;
  $("bkAsk").hidden = false; $("bkGo").focus();
});
let bkPending = null;
$("bkNo").addEventListener("click", () => { bkPending = null; $("bkAsk").hidden = true; });
$("bkGo").addEventListener("click", async () => {
  const bk = bkPending; bkPending = null; $("bkAsk").hidden = true; if (!bk) return;
  const cols = bk.collections; const n = (cols.policies || []).length, a = (cols.associations || []).length;
  const b = $("bkIn"); busy(b, true, "جارٍ الاستعادة…");
  let done = 0, failed = 0; const total = BK_COLS.reduce((t, c) => t + ((cols[c] || []).length), 0);
  try {
    for (const c of BK_COLS){
      for (const d of cols[c] || []){
        if (!d || !d.id || typeof d.data !== "object") { failed++; continue; }
        try {
          if (c === "policies"){
            if (state.mode === "db") await state.col.doc(d.id).set(d.data);
            else { const i = state.policies.findIndex(x => x.id === d.id); const v = { id: d.id, ...d.data }; if (i >= 0) state.policies[i] = v; else state.policies.push(v); lsWrite(LS_KEY, state.policies); }
          } else await store.set(c, d.id, d.data);
          done++;
        } catch (e){ console.error(e); failed++; }
        if (done % 5 === 0) setMsg(`جارٍ الاستعادة… ${done} من ${total}`, "");
      }
    }
    if (state.mode !== "db"){ renderList(); state.assocs = Object.entries(lsRead(STORE_LS("associations"), {})).map(([id, v]) => ({ id, ...v })); renderAssocSel(); }
    loadMyColors && loadMyColors();
    setMsg(failed ? `اكتملت الاستعادة: ${done} عنصر، وتعذّر ${failed}.` : `اكتملت الاستعادة: ${n} سياسة و${a} جمعية مع كليشاتها وسجل الإصدارات.`, failed ? "err" : "ok");
  } finally { busy(b, false); }
});
function busy(btn, on, label){
  if (on){ btn.dataset.label = btn.innerHTML; btn.innerHTML = '<span class="spin"></span>' + label; btn.disabled = true; }
  else { btn.innerHTML = btn.dataset.label; btn.disabled = false; }
}
$("wordBtn").addEventListener("click", async () => {
  if (!ready()) return;
  const b = $("wordBtn"); busy(b, true, "جارٍ التجهيز…"); setMsg("");
  try { const blob = await buildDocx(); await offer(fileBase() + ".docx", blob); }
  catch (e){ console.error(e); setMsg("تعذّر إنشاء ملف وورد من هذه الكليشة.", "err"); }
  finally { busy(b, false); }
});
$("pdfBtn").addEventListener("click", async () => {
  if (!ready()) return;
  const b = $("pdfBtn"); busy(b, true, "جارٍ تجهيز PDF…"); setMsg("");
  const stage = $("exportStage");
  try {
    const pages = await paginate(stage);
    const blob = await pagesToPdf(pages);
    stage.innerHTML = "";
    await offer(fileBase() + ".pdf", blob);
  } catch (e){ console.error(e); setMsg(e && e.code === "lib_load" ? storeError(e) : "تعذّر إنشاء ملف PDF. جرّب تصدير وورد ثم حفظه PDF من وورد.", "err"); stage.innerHTML = ""; }
  finally { busy(b, false); }
});

/* ---------- batch export ---------- */
function openBatch(){
  const box = $("bList"); box.innerHTML = "";
  const groups = {};
  state.policies.forEach(p => (groups[CATS.includes(p.category) ? p.category : (p.category || "أخرى")] ||= []).push(p));
  const order = CATS.concat(Object.keys(groups).filter(c => !CATS.includes(c)));
  order.forEach(c => {
    const ps = groups[c]; if (!ps || !ps.length) return;
    ps.sort((a, b) => (a.code || "").localeCompare(b.code || "", "ar") || (a.title || "").localeCompare(b.title || "", "ar"));
    const g = document.createElement("div"); g.className = "bgroup";
    const h = document.createElement("label"); h.className = "check bcat";
    const hc = document.createElement("input"); hc.type = "checkbox";
    h.append(hc, document.createTextNode(` ${c} (${ps.length})`));
    const items = document.createElement("div"); items.className = "bitems";
    ps.forEach(p => {
      const l = document.createElement("label"); l.className = "check";
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.value = p.id; cb.checked = p.id === state.selectedId;
      l.append(cb, document.createTextNode(" " + (p.title || "بدون عنوان")));
      items.append(l);
    });
    const sync = () => { const all = items.querySelectorAll("input"); const on = [...all].filter(x => x.checked).length; hc.checked = on === all.length; hc.indeterminate = on > 0 && on < all.length; updateBatchCount(); };
    hc.addEventListener("change", () => { items.querySelectorAll("input").forEach(x => { x.checked = hc.checked; }); sync(); });
    items.addEventListener("change", sync);
    g.append(h, items); box.append(g); sync();
  });
  $("bMsg").textContent = ""; $("bMsg").className = "msg";
  $("bAssoc").textContent = $("assoc").value.trim() ? `للجمعية: «${$("assoc").value.trim()}»${state.letterhead ? "، على كليشتها" : "، بدون كليشة"}، بالإعدادات والخط وبيانات الاعتماد الحالية.` : "اكتب اسم الجمعية في «بيانات الجمعية» أولاً.";
  syncBatchFormat(); updateBatchCount();
  $("bdlg").hidden = false;
}
function batchSelected(){ const ids = [...$("bList").querySelectorAll(".bitems input:checked")].map(x => x.value); return state.policies.filter(p => ids.includes(p.id)); }
function updateBatchCount(){ const n = batchSelected().length; $("bGo").textContent = n ? `تصدير ${n} ${n === 1 ? "سياسة" : n <= 10 ? "سياسات" : "سياسة"}` : "تصدير"; $("bGo").disabled = !n; }
function batchFormat(){ return (document.querySelector('input[name="bFmt"]:checked') || {}).value || "merged"; }
function syncBatchFormat(){ $("bGuideWrap").hidden = !batchFormat().startsWith("merged"); }
document.querySelectorAll('input[name="bFmt"]').forEach(r => r.addEventListener("change", syncBatchFormat));
$("bAll").addEventListener("click", () => { const all = $("bList").querySelectorAll("input[type=checkbox]"); const on = [...$("bList").querySelectorAll(".bitems input")].every(x => x.checked); all.forEach(x => { x.checked = !on; x.indeterminate = false; }); updateBatchCount(); });
$("batchBtn").addEventListener("click", openBatch);
const closeBatch = () => { if (!state.batchBusy) $("bdlg").hidden = true; };
$("bClose").addEventListener("click", closeBatch); $("bCancel").addEventListener("click", closeBatch);
$("bdlg").addEventListener("click", e => { if (e.target === $("bdlg")) closeBatch(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("bdlg").hidden) closeBatch(); });

function safeName(t){ return (t || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120); }
async function pagesToPdf(pages){
  await needLib("pdf");
  const { jsPDF } = window.jspdf;
  let pdf = null;
  for (const pg of pages){
    const w = pg.offsetWidth, h = pg.offsetHeight;
    const canvas = await html2canvas(pg, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false, scrollX: 0, scrollY: 0, windowWidth: document.documentElement.clientWidth });
    const wpt = w * 0.75, hpt = h * 0.75;
    if (!pdf) pdf = new jsPDF({ unit: "pt", format: [wpt, hpt], orientation: wpt > hpt ? "landscape" : "portrait", compress: true });
    else pdf.addPage([wpt, hpt], wpt > hpt ? "landscape" : "portrait");
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, wpt, hpt);
  }
  return pdf.output("blob");
}
$("bGo").addEventListener("click", async () => {
  const name = $("assoc").value.trim();
  const m = $("bMsg"); m.className = "msg";
  if (!name){ m.className = "msg err"; m.textContent = "اكتب اسم الجمعية أولاً."; return; }
  const ps = batchSelected(); if (!ps.length) return;
  const fmt = batchFormat();
  const base = { name, cover: $("cover").checked, addTitle: $("addTitle").checked, keepBody: $("keepBody").checked,
                 pageNums: $("pageNums").checked, embed: $("embedFont").checked, stmt: $("stmtOn").checked, verTable: $("verTable").checked, guideTitle: $("bGuide").value.trim() || "دليل السياسات واللوائح" };
  const ctxs = ps.map(p => { const c = libCtx(p, base); if (p.id === state.selectedId && state.dirty) c.html = editorHtml(); return c; });
  const btn = $("bGo"); state.batchBusy = true; busy(btn, true, "جارٍ التجهيز…");
  const stage = $("exportStage");
  try {
    let blob, filename;
    if (fmt === "merged"){
      m.textContent = "جارٍ تجميع السياسات في ملف واحد…";
      blob = await buildDocx({ ctx: base, merged: ctxs });
      filename = safeName(base.guideTitle + " - " + name) + ".docx";
    } else if (fmt === "mergedPdf"){
      m.textContent = "جارٍ تجهيز صفحات الدليل…";
      const pages = await paginate(stage, base, ctxs);
      m.textContent = `جارٍ إنشاء PDF (${pages.length} صفحة)…`;
      blob = await pagesToPdf(pages); stage.innerHTML = "";
      filename = safeName(base.guideTitle + " - " + name) + ".pdf";
    } else {
      const zip = new JSZip(); const pad = String(ctxs.length).length;
      for (let i = 0; i < ctxs.length; i++){
        const c = ctxs[i];
        const fn = String(i + 1).padStart(pad, "0") + " - " + safeName(fillName(c.p.title, name));
        m.textContent = `(${i + 1} من ${ctxs.length}) ${c.p.title}`;
        if (fmt === "pdf"){
          const pages = await paginate(stage, c);
          zip.file(fn + ".pdf", await pagesToPdf(pages)); stage.innerHTML = "";
        } else zip.file(fn + ".docx", await buildDocx({ ctx: c }));
      }
      m.textContent = "جارٍ ضغط الملفات…";
      blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      filename = safeName("سياسات " + name) + (fmt === "pdf" ? " - PDF" : " - Word") + ".zip";
    }
    m.textContent = "";
    await offer(filename, blob);
    m.className = $("msg").className; m.textContent = $("msg").textContent;
  } catch (e){ console.error(e); m.className = "msg err"; m.textContent = "تعذّر التصدير المجمّع. جرّب عدداً أقل من السياسات أو صيغة أخرى."; stage.innerHTML = ""; }
  finally { state.batchBusy = false; busy(btn, false); updateBatchCount(); }
});

/* ---------- version history dialog ---------- */
$("histBtn").addEventListener("click", openHistory);
const closeHistory = () => { $("hdlg").hidden = true; if (previewStale) schedulePreview(50); };
$("hClose").addEventListener("click", closeHistory); $("hCancel").addEventListener("click", closeHistory);
$("hdlg").addEventListener("click", e => { if (e.target === $("hdlg")) closeHistory(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("hdlg").hidden) closeHistory(); });

/* ---------- one policy for every saved association ---------- */
function openAllAssoc(){
  const p = current();
  if (!p){ setMsg("اختر سياسة من المكتبة أولاً.", "err"); return; }
  const box = $("aList"); box.innerHTML = "";
  const list = [...state.assocs].sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
  if (!list.length) box.innerHTML = '<span class="hint">لا توجد جمعيات محفوظة بعد. اكتب بيانات الجمعية واضغط «حفظ الجمعية» أولاً.</span>';
  list.forEach(a => {
    const l = document.createElement("label"); l.className = "check";
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.value = a.id; cb.checked = true;
    l.append(cb, document.createTextNode(" " + (a.name || "بدون اسم") + (a.lhChunks ? "" : " (بدون كليشة)")));
    box.append(l);
  });
  $("aPolicy").textContent = `السياسة: «${p.title}»`;
  $("aMsg").textContent = ""; $("aMsg").className = "msg";
  updateAllAssocCount();
  $("adlg").hidden = false;
}
function allAssocSelected(){ const ids = [...$("aList").querySelectorAll("input:checked")].map(x => x.value); return state.assocs.filter(a => ids.includes(a.id)); }
function updateAllAssocCount(){ const n = allAssocSelected().length; $("aGo").textContent = n ? `تصدير لـ ${n} ${n === 1 ? "جمعية" : n <= 10 ? "جمعيات" : "جمعية"}` : "تصدير"; $("aGo").disabled = !n || state.allBusy; }
$("aList").addEventListener("change", updateAllAssocCount);
$("aAll").addEventListener("click", () => { const all = [...$("aList").querySelectorAll("input")]; const on = all.every(x => x.checked); all.forEach(x => { x.checked = !on; }); updateAllAssocCount(); });
$("allAssocBtn").addEventListener("click", openAllAssoc);
const closeAllAssoc = () => { if (!state.allBusy) $("adlg").hidden = true; };
$("aClose").addEventListener("click", closeAllAssoc); $("aCancel").addEventListener("click", closeAllAssoc);
$("adlg").addEventListener("click", e => { if (e.target === $("adlg")) closeAllAssoc(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("adlg").hidden) closeAllAssoc(); });

/* everything loadAssoc changes, so the page can be put back exactly as it was afterwards */
function snapshotWorkspace(){
  return { assocId: state.assocId, letterhead: state.letterhead, letterheadRaw: state.letterheadRaw, letterheadName: state.letterheadName,
           lhMargins: state.lhMargins, lhSavedFor: state.lhSavedFor, approvals: state.approvals, geom: state.geom, artBoxes: state.artBoxes,
           settings: settingsSnapshot(), name: $("assoc").value, lhLabel: $("lhName").innerHTML,
           ls: ["assoc-policies-assoc", "assoc-policies-name", "assoc-policies-font2"].map(k => { try { return [k, localStorage.getItem(k)]; } catch { return [k, null]; } }) };
}
function restoreWorkspace(w){
  Object.assign(state, { assocId: w.assocId, letterhead: w.letterhead, letterheadRaw: w.letterheadRaw, letterheadName: w.letterheadName,
    lhMargins: w.lhMargins, lhSavedFor: w.lhSavedFor, approvals: w.approvals, geom: w.geom, artBoxes: w.artBoxes });
  const st = w.settings;
  $("assoc").value = w.name; $("lhName").innerHTML = w.lhLabel;
  if (weightById(st.font)){ $("font").value = st.font; renderFontButton(); syncEmbedOption(); }
  $("size").value = String(st.size);
  ["cover","addTitle","keepBody","pageNums","verTable"].forEach(k => { $(k).checked = !!st[k]; });
  $("embedFont").checked = st.embed; $("stmtOn").checked = st.stmt;
  setMargins(st.margins);
  w.ls.forEach(([k, v]) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} });
  renderAssocSel(); renderApproval(); renderChosen(); updateSettingsHint(); assocNote("");
  previewStale = true; schedulePreview(50);
}
$("aGo").addEventListener("click", async () => {
  const p = current(); const targets = allAssocSelected(); if (!p || !targets.length) return;
  const fmt = (document.querySelector('input[name="aFmt"]:checked') || {}).value || "docx";
  const m = $("aMsg"); m.className = "msg"; const btn = $("aGo");
  const html = editorHtml(); const was = snapshotWorkspace();
  state.allBusy = true; busy(btn, true, "جارٍ التصدير…");
  const stage = $("exportStage"); const zip = new JSZip(); const failed = [];
  try {
    for (let i = 0; i < targets.length; i++){
      const a = targets[i];
      m.textContent = `(${i + 1} من ${targets.length}) ${a.name}`;
      try {
        await loadAssoc(a.id);
        const ctx = { ...uiCtx(), html };
        const fn = safeName(fillName(p.title, a.name) + " - " + a.name);
        if (fmt === "pdf"){ const pages = await paginate(stage, ctx); zip.file(fn + ".pdf", await pagesToPdf(pages)); stage.innerHTML = ""; }
        else zip.file(fn + ".docx", await buildDocx({ ctx }));
      } catch (e){ console.error(e); failed.push(a.name); stage.innerHTML = ""; }
    }
    restoreWorkspace(was);
    if (failed.length === targets.length) throw new Error("all_failed");
    m.textContent = "جارٍ ضغط الملفات…";
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    m.textContent = "";
    await offer(safeName(p.title + " - كل الجمعيات") + (fmt === "pdf" ? " - PDF" : " - Word") + ".zip", blob);
    m.className = $("msg").className; m.textContent = $("msg").textContent + (failed.length ? ` تعذّر تصدير: ${failed.join("، ")}.` : "");
  } catch (e){
    console.error(e); restoreWorkspace(was);
    m.className = "msg err"; m.textContent = "تعذّر التصدير لكل الجمعيات. تأكد أن كليشات الجمعيات محفوظة، ثم أعد المحاولة.";
  } finally { state.allBusy = false; busy(btn, false); updateAllAssocCount(); }
});

/* ---------- boot ---------- */
fillCats();
setMargins(DEFAULT_MARGINS);
try { $("assoc").value = localStorage.getItem("assoc-policies-name") || ""; } catch {}
renderList();
updateSettingsHint();
try { const t = localStorage.getItem("assoc-policies-tab"); if (t === "preview" || t === "approval") setPTab(t); } catch {}
initStore().then(() => {
  initAssocs(); loadMyColors();
  let last = null; try { last = localStorage.getItem("assoc-policies-last"); } catch {}
  const pick = () => {
    if (state.selectedId || !state.policies.length) return;
    const id = state.policies.some(p => p.id === last) ? last : state.policies[0].id;
    selectPolicy(id);
  };
  // the library may arrive later than this (first snapshot), so pick again when it does
  state.onPolicies = () => { pick(); if (state.selectedId) state.onPolicies = null; };
  pick();
});
})();
