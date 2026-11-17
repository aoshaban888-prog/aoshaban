/* Home: today's date (Gregorian and Hijri), the clock, prayer times for the device's location, and a small task panel. */
(() => {
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  /* ---------- date and clock ---------- */
  const fmtG = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const fmtH = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "long", year: "numeric" });
  const fmtT = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { hour: "numeric", minute: "2-digit", hour12: true });
  const timeParts = d => {
    const p = fmtT.formatToParts(d);
    const v = t => (p.find(x => x.type === t) || {}).value || "";
    return { hm: `${v("hour")}:${v("minute")}`, ap: v("dayPeriod") };
  };
  let lastDay = "";
  function tick(){
    const now = new Date();
    const t = timeParts(now);
    $("hClock").textContent = t.hm; $("hAmPm").textContent = t.ap;
    if (ymd(now) !== lastDay){
      lastDay = ymd(now);
      $("hDate").textContent = fmtG.format(now);
      $("hHijri").textContent = fmtH.format(now).replace(/\s*هـ$/, "") + " هـ";
      renderPrayers(); renderTasks();
    }
    markNextPrayer(now);
  }

  /* ---------- prayer times (computed in the browser, Umm al-Qura method) ---------- */
  const PRAYERS = [["fajr", "الفجر"], ["sunrise", "الشروق"], ["dhuhr", "الظهر"], ["asr", "العصر"], ["maghrib", "المغرب"], ["isha", "العشاء"]];
  const LOC_KEY = "app-prayer-loc";
  const RIYADH = { lat: 24.7136, lng: 46.6753, name: "الرياض", fallback: true };
  let loc = null, times = null;
  try { loc = JSON.parse(localStorage.getItem(LOC_KEY) || "null"); } catch {}

  function askLocation(){
    if (!navigator.geolocation){ setLoc(RIYADH); return; }
    $("pNote").textContent = "جارٍ تحديد موقعك…";
    navigator.geolocation.getCurrentPosition(
      pos => setLoc({ lat: +pos.coords.latitude.toFixed(3), lng: +pos.coords.longitude.toFixed(3), name: "موقعك الحالي" }),
      () => setLoc(loc && !loc.fallback ? loc : RIYADH),
      { timeout: 10000, maximumAge: 6 * 3600 * 1000 }
    );
  }
  function setLoc(l){
    loc = l;
    try { localStorage.setItem(LOC_KEY, JSON.stringify(l)); } catch {}
    renderPrayers();
  }
  function renderPrayers(){
    const box = $("pList");
    if (!window.adhan){ $("pNote").textContent = "تعذّر تحميل حساب أوقات الصلاة"; return; }
    if (!loc){ askLocation(); return; }
    const params = adhan.CalculationMethod.UmmAlQura();
    times = new adhan.PrayerTimes(new adhan.Coordinates(loc.lat, loc.lng), new Date(), params);
    box.innerHTML = "";
    PRAYERS.forEach(([k, label]) => {
      const row = document.createElement("li"); row.dataset.k = k;
      const t = timeParts(times[k]);
      row.innerHTML = `<span class="pn"></span><span class="pt"><bdi class="mono"></bdi> <span class="ap"></span></span>`;
      row.querySelector(".pn").textContent = label;
      row.querySelector(".pt bdi").textContent = t.hm;
      row.querySelector(".pt .ap").textContent = t.ap;
      box.append(row);
    });
    $("pNote").textContent = loc.fallback ? "أوقات الرياض. اسمح بالوصول للموقع لعرض أوقات مدينتك" : "حسب موقعك · تقويم أم القرى";
    $("pLocBtn").hidden = !loc.fallback;
    markNextPrayer(new Date());
  }
  function markNextPrayer(now){
    if (!times) return;
    let next = PRAYERS.find(([k]) => k !== "sunrise" && times[k] > now);
    let at = next ? times[next[0]] : null;
    if (!next){ // after isha: tomorrow's fajr
      const tm = new Date(now); tm.setDate(tm.getDate() + 1);
      at = new adhan.PrayerTimes(new adhan.Coordinates(loc.lat, loc.lng), tm, adhan.CalculationMethod.UmmAlQura()).fajr;
      next = PRAYERS[0];
    }
    document.querySelectorAll("#pList li").forEach(li => li.classList.toggle("next", li.dataset.k === next[0]));
    const mins = Math.max(0, Math.round((at - now) / 60000));
    const h = Math.floor(mins / 60), m = mins % 60;
    $("pNext").textContent = next[1];
    $("pLeft").textContent = h ? `بعد ${h}:${pad(m)} ساعة` : `بعد ${m} دقيقة`;
  }
  $("pLocBtn").addEventListener("click", () => { try { localStorage.removeItem(LOC_KEY); } catch {} loc = null; askLocation(); });

  /* ---------- tasks panel (Firestore "tasks") ---------- */
  let tasks = [], col = null, unsub = null;
  const dayDiff = s => { if (!s) return null; const a = new Date(s + "T00:00:00"), b = new Date(ymd(new Date()) + "T00:00:00"); return Math.round((a - b) / 86400000); };
  const dueLabel = s => {
    const d = dayDiff(s);
    if (d === null) return "";
    if (d < 0) return d === -1 ? "متأخرة يوماً" : `متأخرة ${-d} أيام`;
    if (d === 0) return "اليوم";
    if (d === 1) return "غداً";
    return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short" }).format(new Date(s + "T00:00:00"));
  };
  function connect(db){
    if (col) return;
    col = db.collection("tasks");
    $("tAdd").hidden = false; $("tSignin").hidden = true;
    unsub = col.onSnapshot(snap => { tasks = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderTasks(); },
      e => { console.error(e); $("tEmpty").textContent = "تعذّر تحميل المهام"; $("tEmpty").hidden = false; });
  }
  function renderTasks(){
    const list = $("tList"); if (!list) return;
    const open = tasks.filter(t => t.status !== "done");
    const rank = t => { const d = dayDiff(t.due); return d === null ? 9999 : d; };
    open.sort((a, b) => rank(a) - rank(b) || (b.priority === "high") - (a.priority === "high") || String(a.createdAt).localeCompare(String(b.createdAt)));
    const late = open.filter(t => (dayDiff(t.due) ?? 1) < 0).length;
    const today = open.filter(t => dayDiff(t.due) === 0).length;
    $("tCount").textContent = col ? `${open.length} مفتوحة` + (today ? ` · ${today} اليوم` : "") + (late ? ` · ${late} متأخرة` : "") : "";
    list.innerHTML = "";
    open.slice(0, 8).forEach(t => {
      const li = document.createElement("li");
      const d = dayDiff(t.due);
      li.className = "task" + (d !== null && d < 0 ? " late" : "") + (t.priority === "high" ? " high" : "");
      li.innerHTML = `<label class="tk"><input type="checkbox" aria-label="تمت"><span class="tt"></span></label><span class="td mono"></span>`;
      li.querySelector(".tt").textContent = t.title;
      li.querySelector(".td").textContent = dueLabel(t.due);
      li.querySelector("input").addEventListener("change", () => col.doc(t.id).update({ status: "done", doneAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).catch(console.error));
      list.append(li);
    });
    $("tEmpty").hidden = !col || open.length > 0;
    $("tMore").hidden = open.length <= 8;
    $("tMore").textContent = `و${open.length - 8} مهام أخرى`;
  }
  $("tAdd").addEventListener("submit", async e => {
    e.preventDefault();
    const title = $("tTitle").value.trim(); if (!title || !col) return;
    const now = new Date().toISOString();
    const btn = $("tAdd").querySelector("button"); btn.disabled = true;
    try {
      await col.add({ title, status: "todo", due: $("tDue").value || null, priority: "normal", notes: "", createdAt: now, updatedAt: now });
      $("tTitle").value = ""; $("tDue").value = ""; $("tTitle").focus();
    } catch (err){ console.error(err); alert("تعذّر حفظ المهمة"); }
    finally { btn.disabled = false; }
  });

  if (window.appDb) connect(window.appDb);
  window.addEventListener("app:db", e => connect(e.detail.db));
  tick();
  setInterval(tick, 15000);
})();
