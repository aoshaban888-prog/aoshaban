/* Smart task entry: "ذكرني يوم الخميس الصباح الساعة 9 بإعداد محضر اجتماع"
   → { title: "إعداد محضر اجتماع", date: "YYYY-MM-DD", time: "09:00", priority }.
   A local Arabic parser answers instantly (and offline); when the site runs on Vercel the AI endpoint
   /api/parse-task refines the wording, and the local result is used if it is unavailable. */
(() => {
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  // matching only: no diacritics, one alef, ta marbuta as ha, Latin digits
  const norm = s => s.replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, c => "٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(/[۰-۹]/g, c => "۰۱۲۳۴۵۶۷۸۹".indexOf(c));

  const DAYS = { "الاحد": 0, "احد": 0, "الاثنين": 1, "الاتنين": 1, "اثنين": 1, "الثلاثاء": 2, "الثلاثا": 2, "الثلوث": 2, "الاربعاء": 3, "الاربعا": 3, "الاربع": 3, "الخميس": 4, "الجمعه": 5, "السبت": 6 };
  const NUMS = { "واحد": 1, "وحده": 1, "اثنين": 2, "ثنتين": 2, "اثنتين": 2, "ثلاث": 3, "ثلاثه": 3, "اربع": 4, "اربعه": 4, "خمس": 5, "خمسه": 5, "ست": 6, "سته": 6, "سبع": 7, "سبعه": 7, "ثمان": 8, "ثمانيه": 8, "ثمنيه": 8, "تسع": 9, "تسعه": 9, "عشر": 10, "عشره": 10, "احدعش": 11, "احدعشر": 11, "اطنعش": 12, "اثنعش": 12, "اثناعشر": 12, "عشرين": 20, "ثلاثين": 30, "اربعين": 40 };
  const MONTHS = { "يناير": 0, "فبراير": 1, "مارس": 2, "ابريل": 3, "مايو": 4, "يونيو": 5, "يوليو": 6, "اغسطس": 7, "سبتمبر": 8, "اكتوبر": 9, "نوفمبر": 10, "ديسمبر": 11 };
  const NEXT = new Set(["الجاي", "الجايه", "القادم", "القادمه", "الياي", "اللي", "الي"]);
  const AM = new Set(["ص", "صباحا", "صباح", "الصبح", "الصباح", "بالصباح", "الصباحيه", "صبحا", "فجرا", "الفجر"]);
  const PM = new Set(["م", "مساء", "مساءا", "المساء", "بالليل", "الليل", "ليلا", "العصر", "عصرا", "بالعصر", "المغرب", "مغربا", "العشاء", "العشا", "الظهر", "ظهرا", "بالظهر", "الضهر", "ضهرا", "الليله"]);
  const PERIOD_AT = { "الصبح": "09:00", "الصباح": "09:00", "صباحا": "09:00", "بالصباح": "09:00", "الفجر": "05:00", "الظهر": "12:00", "ظهرا": "12:00", "بالظهر": "12:00", "الضهر": "12:00", "العصر": "15:30", "عصرا": "15:30", "بالعصر": "15:30", "المغرب": "18:00", "العشاء": "19:30", "العشا": "19:30", "الليل": "21:00", "بالليل": "21:00", "الليله": "20:00", "المساء": "18:00", "مساء": "18:00" };
  const ASK = new Set(["ذكرني", "ذكريني", "فكرني", "نبهني", "تذكير", "ذكرنا", "ذكرو", "لاتنساني", "لاتنسى", "ابغى", "ابغا", "ابي", "ودي", "ابغاك", "ابيك", "ممكن", "سجل", "اضف", "حط", "اكتب"]);
  const LINK = new Set(["في", "يوم", "على", "الساعه", "ساعه", "تمام", "بتاريخ", "تاريخ", "موعد", "الموعد", "عند", "قبل", "حوالي"]);
  const HIGH = new Set(["مهم", "مهمه", "ضروري", "ضروريه", "هام"]);
  const URGENT = new Set(["عاجل", "عاجله", "مستعجل", "مستعجله", "فوري"]);
  const PRI = { "عاليه": "high", "عالي": "high", "مهم": "high", "عاجل": "urgent", "عاجله": "urgent", "متوسط": "medium", "متوسطه": "medium", "منخفض": "low", "منخفضه": "low", "high": "high", "urgent": "urgent", "low": "low" };
  const HAMZA = { "اعداد": "إعداد", "ارسال": "إرسال", "انهاء": "إنهاء", "اكمال": "إكمال", "ابلاغ": "إبلاغ", "اضافه": "إضافة", "اضافة": "إضافة", "اعتماد": "اعتماد", "اصدار": "إصدار", "اغلاق": "إغلاق", "انجاز": "إنجاز", "ارفاق": "إرفاق", "اعاده": "إعادة", "اعادة": "إعادة", "اجراء": "إجراء", "ايداع": "إيداع", "اخبار": "إخبار", "الغاء": "إلغاء", "ابلاغه": "إبلاغه" };

  const numOf = w => /^\d+$/.test(w) ? +w : NUMS[w] ?? null;

  function local(text, now = new Date()){
    const src = (text || "").replace(/(\d)([؀-ۿ])/g, "$1 $2").replace(/([؀-ۿ])(\d)/g, "$1 $2").replace(/[،,؛]/g, " ").trim();
    const raw = src.split(/\s+/).filter(Boolean), t = raw.map(norm);
    const used = new Array(t.length).fill(false);
    let date = null, hh = null, mm = 0, ampm = null, period = null, priority = "medium", at = null, mentionedDate = false;
    const tags = [];
    const take = (...ix) => ix.forEach(i => { if (i >= 0 && i < t.length) used[i] = true; });

    for (let i = 0; i < t.length; i++){
      const w = t[i], nx = t[i + 1] || "";
      if (used[i]) continue;
      // "لا تنساني"
      if (w === "لا" && /^تنسا?ني|^تنسى/.test(nx)){ take(i, i + 1); continue; }
      // #وسم and !أولوية
      if (/^#\S/.test(raw[i])){ tags.push(raw[i].slice(1).replace(/[،,.]+$/, "")); take(i); continue; }
      if (/^!\S/.test(raw[i])){ const p = norm(raw[i].slice(1)); const v = PRI[p]; if (v){ priority = v; take(i); continue; } }
      if (URGENT.has(w)){ priority = "urgent"; take(i); continue; }
      if (HIGH.has(w)){ priority = priority === "urgent" ? priority : "high"; take(i); continue; }
      if (w === "اليوم"){ date = ymd(now); mentionedDate = true; take(i); continue; }
      if (w === "الليله"){ date = ymd(now); mentionedDate = true; period = period || w; take(i); continue; }
      if (/^(بكره|بكرا|بكرة|غدا|غدوه|الغد|باكر|باجر)$/.test(w)){ date = ymd(addDays(now, 1)); mentionedDate = true; take(i); continue; }
      if (w === "بعد" && /^(بكره|بكرا|غدا|باكر)$/.test(nx)){ date = ymd(addDays(now, 2)); mentionedDate = true; take(i, i + 1); continue; }
      if (w in DAYS){
        let d = (DAYS[w] - now.getDay() + 7) % 7; if (d === 0) d = 7;
        date = ymd(addDays(now, d)); mentionedDate = true; take(i);
        if (t[i - 1] === "يوم") take(i - 1);
        if (NEXT.has(nx)) take(i + 1);
        continue;
      }
      if ((w === "الاسبوع" || w === "الأسبوع") && NEXT.has(nx)){ date = ymd(addDays(now, 7)); mentionedDate = true; take(i, i + 1); continue; }
      // "بعد ساعة"، "بعد ساعتين"، "بعد 3 أيام"، "بعد نص ساعة"
      if (w === "بعد"){
        let n = 1, j = i + 1, unit = t[j] || "";
        if (numOf(unit) !== null){ n = numOf(unit); j++; unit = t[j] || ""; }
        else if (unit === "نص" || unit === "نصف"){ n = 0.5; j++; unit = t[j] || ""; }
        else if (unit === "ربع"){ n = 0.25; j++; unit = t[j] || ""; }
        const u = unit.replace(/^ال/, "");
        let ms = null;
        if (/^(ساعه|ساعات)$/.test(u)) ms = n * 3600e3; else if (u === "ساعتين") ms = 2 * 3600e3;
        else if (/^(دقيقه|دقايق|دقائق)$/.test(u)) ms = n * 60e3; else if (u === "دقيقتين") ms = 120e3;
        else if (/^(يوم|ايام)$/.test(u)) ms = n * 86400e3; else if (u === "يومين") ms = 2 * 86400e3;
        else if (/^(اسبوع|اسابيع)$/.test(u)) ms = n * 7 * 86400e3; else if (u === "اسبوعين") ms = 14 * 86400e3;
        if (ms !== null){
          const x = new Date(now.getTime() + ms);
          date = ymd(x); mentionedDate = true; if (ms < 86400e3){ at = `${pad(x.getHours())}:${pad(x.getMinutes())}`; }
          for (let k = i; k <= j; k++) take(k); continue;
        }
      }
      // explicit dates: 20/11, 20-11-2026, "20 نوفمبر"
      let m = w.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
      if (m){
        let y = m[3] ? +m[3] : now.getFullYear(); if (y < 100) y += 2000;
        const d = new Date(y, +m[2] - 1, +m[1]); if (!m[3] && d < addDays(now, -1)) d.setFullYear(y + 1);
        date = ymd(d); mentionedDate = true; take(i); continue;
      }
      if (/^\d{1,2}$/.test(w) && nx in MONTHS){
        const d = new Date(now.getFullYear(), MONTHS[nx], +w); if (d < addDays(now, -1)) d.setFullYear(d.getFullYear() + 1);
        date = ymd(d); mentionedDate = true; take(i, i + 1); continue;
      }
      // times: "الساعة 9"، "9:30"، "9 ونص"، "الساعه تسع الا ربع"، "9 ص"
      const isClockWord = t[i - 1] === "الساعه" || t[i - 1] === "ساعه";
      m = w.match(/^(\d{1,2})(?:[:.](\d{2}))?$/);
      const wn = !m && isClockWord ? numOf(w) : null;
      if ((m && (isClockWord || AM.has(nx) || PM.has(nx) || /^و(نص|ربع|ثلث)$/.test(nx) || nx === "الا" || (m[2] && true))) || wn !== null){
        hh = m ? +m[1] : wn; mm = m && m[2] ? +m[2] : 0; take(i); if (isClockWord) take(i - 1);
        let j = i + 1;
        if (t[j] === "و" && /^(نص|ربع|ثلث)$/.test(t[j + 1] || "")){ t[j] = "و" + t[j + 1]; take(j); j++; }
        if (/^و(نص|نصف)$/.test(t[j] || "")){ mm = 30; take(j); j++; }
        else if (t[j] === "وربع"){ mm = 15; take(j); j++; }
        else if (t[j] === "وثلث"){ mm = 20; take(j); j++; }
        else if (t[j] === "الا" && /^(ربع|ثلث)$/.test(t[j + 1] || "")){ mm = t[j + 1] === "ربع" ? 45 : 40; hh = hh - 1; take(j, j + 1); j += 2; }
        if (AM.has(t[j] || "")){ ampm = "am"; take(j); } else if (PM.has(t[j] || "")){ ampm = t[j] === "الظهر" || t[j] === "ظهرا" ? "noon" : "pm"; take(j); }
        continue;
      }
      if (w in PERIOD_AT || AM.has(w) || PM.has(w)){
        if (w === "ص" || w === "م") continue; // single letters only count right after a number
        period = w; if (AM.has(w)) ampm = ampm || "am"; else ampm = ampm || (w === "الظهر" || w === "ظهرا" ? "noon" : "pm"); take(i);
        if (t[i - 1] === "في" || t[i - 1] === "الساعه") take(i - 1);
        continue;
      }
    }
    // the hour on a 12-hour clock: marked by ص/م or a part of the day; unmarked 1–6 read as afternoon (working hours)
    let time = at;
    if (hh !== null && hh >= 0 && hh <= 23){
      let h = hh;
      if (h <= 12){
        if (ampm === "am") h = h === 12 ? 0 : h;
        else if (ampm === "pm") h = h === 12 ? 12 : h + 12;
        else if (ampm === "noon") h = h <= 5 ? h + 12 : h;
        else if (h >= 1 && h <= 6) h += 12;
      }
      time = `${pad(h % 24)}:${pad(mm)}`;
    } else if (!time && period && PERIOD_AT[period]) time = PERIOD_AT[period];
    if (time && !date){ const cand = new Date(`${ymd(now)}T${time}:00`); date = ymd(cand > now ? now : addDays(now, 1)); }

    // linking words that sat next to a date or time go too
    for (let i = 0; i < t.length; i++) if (!used[i] && LINK.has(t[i]) && (used[i + 1] || used[i - 1])) used[i] = true;
    // the request verb at the start ("ذكرني"، "ابغى") and a following "ان/اني"
    let k = 0; while (k < t.length && (used[k] || ASK.has(t[k]) || (k > 0 && /^(ان|اني|انه|اننا)$/.test(t[k]) && (ASK.has(t[k - 1]) || used[k - 1])))) { if (!used[k]) used[k] = true; k++; }
    const words = raw.filter((_, i) => !used[i]);
    // "بإعداد"/"باعداد" after "ذكرني" → "إعداد"
    if (words.length && /^ب/.test(norm(words[0])) && norm(words[0]).length >= 4 && t.slice(0, k).some(x => ASK.has(x))) words[0] = words[0].replace(/^ب/, "");
    while (words.length && LINK.has(norm(words[0]))) words.shift();
    while (words.length && LINK.has(norm(words[words.length - 1]))) words.pop();
    let title = words.map(w => HAMZA[norm(w)] || w).join(" ").replace(/\s+([.!؟?])/g, "$1").trim();
    if (!title) title = (text || "").trim();
    return { title, date, time, priority, tags, mentionedDate: mentionedDate || !!time || tags.length > 0 || priority !== "medium", source: "local" };
  }

  // the AI endpoint (Vercel); unavailable when the site runs locally or the key is not set
  let aiOff = /^(localhost|127\.|file:)/.test(location.hostname || "file:") || location.protocol === "file:";
  async function ai(text, now){
    if (aiOff || !window.appUser || !window.appUser.getIdToken) return null;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const token = await window.appUser.getIdToken();
      const res = await fetch("/api/parse-task", { method: "POST", signal: ctl.signal,
        headers: { "content-type": "application/json", authorization: "Bearer " + token },
        body: JSON.stringify({ text, now: `${ymd(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`, weekday: now.getDay() }) });
      if (res.status === 404 || res.status === 501){ aiOff = true; return null; }
      if (!res.ok) return null;
      const r = await res.json();
      return r && r.title ? { title: r.title, date: r.date || null, time: r.time || null, priority: ["low", "medium", "high", "urgent"].includes(r.priority) ? r.priority : "medium", source: "ai" } : null;
    } catch { return null; }
    finally { clearTimeout(timer); }
  }
  async function parse(text, now = new Date()){
    const l = local(text, now);
    if (!l.mentionedDate) return l; // nothing about a time in the text: no need to wait for the AI
    const a = await ai(text, now);
    if (!a) return l;
    // keep a date or time the local reader was sure of when the AI left it out
    const rank = { low: 0, medium: 1, high: 2, urgent: 3 };
    return { ...a, tags: l.tags, date: a.date || l.date, time: a.time || l.time, priority: rank[l.priority] > rank[a.priority] ? l.priority : a.priority };
  }

  const fmtDay = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long" });
  function timeLabel(t){ if (!t) return ""; const [h, m] = t.split(":").map(Number); const ap = h < 12 ? "ص" : "م"; const h12 = h % 12 || 12; return `${h12}:${pad(m)} ${ap}`; }
  function dayLabel(d){
    if (!d) return ""; const diff = Math.round((new Date(d + "T00:00:00") - new Date(ymd(new Date()) + "T00:00:00")) / 86400000);
    return diff === 0 ? "اليوم" : diff === 1 ? "غداً" : diff === 2 ? "بعد غد" : fmtDay.format(new Date(d + "T00:00:00"));
  }
  const describe = r => [dayLabel(r.date), timeLabel(r.time)].filter(Boolean).join(" · ");

  window.SmartTask = { local, parse, describe, timeLabel, dayLabel, get aiOn(){ return !aiOff; } };
})();
