/* Sign-in page: while nobody is signed in the site shows only this page.
   Email and password (accounts made by an admin, activated from a link sent to the email), or Google.
   The allowed list and rules stay as they are: an account needs a verified email and an entry in "allowed". */
(() => {
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const gate = $("login");
  if (!gate) return;
  const fb = () => window.firebase && firebase.apps && firebase.apps.length ? firebase : null;
  let decided = false;

  function brand(){
    const s = window.siteSettings || {};
    const dark = (root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) !== "light";
    const src = (dark && s.logoDark) || s.logo || "";
    $("lgLogo").hidden = !src; if (src) $("lgLogo").src = src;
    $("lgName").textContent = s.siteName || "مكتب الحوكمة";
  }
  window.addEventListener("app:settings", brand);
  function msg(t, kind){ const m = $("lgMsg"); m.textContent = t || ""; m.className = "lg-msg" + (kind ? " " + kind : ""); m.hidden = !t; }
  function busy(on){ $("lgGo").disabled = on; $("lgGoogle").disabled = on; $("lgGo").classList.toggle("loading", on); }
  function panel(name){ ["lgForm", "lgVerify", "lgDenied"].forEach(id => { $(id).hidden = id !== name; }); }

  function showGate(){ decided = true; brand(); gate.hidden = false; root.classList.remove("gate-wait"); root.classList.add("gate-on"); setTimeout(() => { if (!$("lgForm").hidden) $("lgEmail").focus(); }, 50); }
  function openApp(){ decided = true; gate.hidden = true; root.classList.remove("gate-wait", "gate-on"); }

  // the library reports the sign-in state (js/library.js → app:auth)
  window.addEventListener("app:auth", e => {
    const a = e.detail || {};
    if (a.user && a.allowed){ openApp(); return; }
    if (!a.user){ panel("lgForm"); showGate(); return; }
    if (!a.user.emailVerified && a.user.providerData.some(p => p.providerId === "password")){
      $("lgVerifyMail").textContent = a.user.email; panel("lgVerify"); showGate(); return;
    }
    $("lgDeniedMail").textContent = a.user.email; panel("lgDenied"); showGate();
  });
  // no Firebase (opened from a file or inside Claude): keep the old behaviour and show the site
  setTimeout(() => { if (!decided && !fb()) openApp(); }, 4000);
  setTimeout(() => { if (!decided) openApp(); }, 12000);

  const ERR = {
    "auth/invalid-credential": "البريد الإلكتروني أو كلمة المرور غير صحيحة",
    "auth/wrong-password": "البريد الإلكتروني أو كلمة المرور غير صحيحة",
    "auth/user-not-found": "البريد الإلكتروني أو كلمة المرور غير صحيحة",
    "auth/invalid-email": "اكتب بريداً إلكترونياً صحيحاً",
    "auth/too-many-requests": "محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى",
    "auth/user-disabled": "هذا الحساب موقوف",
    "auth/operation-not-allowed": "الدخول بالبريد وكلمة المرور غير مفعّل بعد في إعدادات Firebase",
    "auth/network-request-failed": "تعذّر الاتصال. تأكد من الإنترنت",
    "auth/unauthorized-domain": "هذا النطاق غير مضاف في إعدادات Firebase",
  };
  const errText = e => ERR[e && e.code] || "تعذّر تسجيل الدخول. حاول مرة أخرى";

  $("lgForm").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("lgEmail").value.trim().toLowerCase(), pass = $("lgPass").value;
    if (!email || !pass){ msg("اكتب البريد الإلكتروني وكلمة المرور", "err"); return; }
    if (!fb()){ msg("خدمة الدخول لم تُحمَّل بعد. حدّث الصفحة", "err"); return; }
    msg(""); busy(true);
    try { await firebase.auth().signInWithEmailAndPassword(email, pass); msg("جارٍ التحقق من الصلاحية…"); }
    catch (err){ console.error(err); msg(errText(err), "err"); }
    finally { busy(false); }
  });
  $("lgGoogle").addEventListener("click", async () => {
    if (!fb()) return msg("خدمة الدخول لم تُحمَّل بعد. حدّث الصفحة", "err");
    const p = new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" });
    msg(""); busy(true);
    try { await firebase.auth().signInWithPopup(p); }
    catch (err){
      if (err && (err.code === "auth/popup-blocked" || err.code === "auth/operation-not-supported-in-this-environment")) return firebase.auth().signInWithRedirect(p);
      if (!(err && err.code === "auth/popup-closed-by-user")) msg(errText(err), "err");
    } finally { busy(false); }
  });
  $("lgForgot").addEventListener("click", async () => {
    const email = $("lgEmail").value.trim().toLowerCase();
    if (!email){ msg("اكتب بريدك الإلكتروني أولاً ثم اضغط «نسيت كلمة المرور؟»", "err"); $("lgEmail").focus(); return; }
    try { await firebase.auth().sendPasswordResetEmail(email); msg("إذا كان البريد مسجلاً لدينا فستصلك رسالة لتعيين كلمة مرور جديدة", "ok"); }
    catch (err){ msg(errText(err), "err"); }
  });
  $("lgEye").addEventListener("click", () => {
    const p = $("lgPass"), show = p.type === "password";
    p.type = show ? "text" : "password"; $("lgEye").setAttribute("aria-label", show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"); $("lgEye").classList.toggle("on", show);
  });
  $("lgResend").addEventListener("click", async () => {
    const u = fb() && firebase.auth().currentUser; if (!u) return;
    try { await u.sendEmailVerification(); msg("أُرسل رابط التفعيل من جديد", "ok"); } catch (err){ msg(errText(err), "err"); }
  });
  $("lgVerified").addEventListener("click", async () => {
    const u = fb() && firebase.auth().currentUser; if (!u) return;
    await u.reload(); await u.getIdToken(true);
    if (u.emailVerified) location.reload(); else msg("لم يُفعَّل البريد بعد. افتح الرابط في رسالة التفعيل", "err");
  });
  document.querySelectorAll("[data-lg-out]").forEach(b => b.addEventListener("click", () => { if (fb()) firebase.auth().signOut().then(() => location.reload()); }));
  brand();
})();
