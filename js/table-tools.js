/* Table tools for the editable letter page (js/hr.js):
   - a move handle (✥) at the table's top corner: drag it to move the whole table between paragraphs
   - drag the table's outer right or left edge to change its width
   - right-click the handle or any cell for a menu like Word's: cut, copy, insert, delete, distribute rows and
     columns evenly, border styles, autofit, text direction, caption and table properties
   Every change fires an "input" event on the page so the letter counts as edited by hand. */
(() => {
  const paper = document.getElementById("hrPaper");
  if (!paper) return;
  const EDGE = 5;
  const k = () => parseFloat(getComputedStyle(paper).getPropertyValue("--k")) || 1;
  const editableTable = t => t && paper.contains(t) && t.closest("[contenteditable=true]");
  const changed = t => { const host = t && t.closest("[contenteditable=true]"); (host || paper).dispatchEvent(new Event("input", { bubbles: true })); };
  const pct = (px, of) => (px / of * 100).toFixed(2) + "%";

  /* ---------- move handle ---------- */
  const handle = document.createElement("button");
  handle.type = "button"; handle.className = "tt-handle"; handle.title = "اسحب لتحريك الجدول، أو اضغط بالزر الأيمن لخياراته";
  handle.setAttribute("aria-label", "تحريك الجدول وخياراته");
  handle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg>';
  let cur = null, hideT = null;
  function showHandle(t){
    cur = t; clearTimeout(hideT);
    if (handle.parentNode !== paper) paper.append(handle);
    const pr = paper.getBoundingClientRect(), r = t.getBoundingClientRect(), s = k();
    handle.style.top = ((r.top - pr.top) / s - 18) + "px";
    handle.style.left = ((r.right - pr.left) / s + 2) + "px";
    handle.hidden = false;
  }
  function hideSoon(){ clearTimeout(hideT); hideT = setTimeout(() => { if (!dragging && !menuOpen()) handle.hidden = true; }, 500); }
  paper.addEventListener("mousemove", e => {
    if (e.buttons) return;
    const t = e.target.closest && e.target.closest(".lt-table");
    if (editableTable(t)) showHandle(t); else if (e.target !== handle && !handle.contains(e.target)) hideSoon();
    const ed = outerEdge(e);
    paper.classList.toggle("rs-tw", !!ed);
  });
  paper.addEventListener("mouseleave", hideSoon);
  document.addEventListener("selectionchange", () => {
    const s = getSelection(); const n = s.rangeCount ? s.anchorNode : null;
    const t = n && (n.nodeType === 1 ? n : n.parentNode).closest && (n.nodeType === 1 ? n : n.parentNode).closest(".lt-table");
    if (editableTable(t)) showHandle(t);
  });

  // dragging the handle: a line shows where the table will land
  let dragging = false;
  const line = document.createElement("div"); line.className = "tt-drop";
  handle.addEventListener("pointerdown", e => {
    if (e.button !== 0 || !cur) return;
    e.preventDefault(); try { handle.setPointerCapture(e.pointerId); } catch {}
    const t = cur, host = t.parentNode, sy = e.clientY;
    let target = null, moved = false;
    const blocks = () => [...host.children].filter(b => b !== t && b !== line);
    const move = ev => {
      if (!moved && Math.abs(ev.clientY - sy) < 4) return;
      moved = true; dragging = true; t.classList.add("tt-moving");
      const list = blocks(); target = list.find(b => { const r = b.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; }) || null;
      if (line.parentNode !== host) host.append(line);
      if (target) host.insertBefore(line, target); else host.append(line);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up);
      line.remove(); t.classList.remove("tt-moving"); dragging = false;
      if (moved){ if (target) host.insertBefore(t, target); else host.append(t); changed(t); showHandle(t); }
    };
    handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", up);
  });

  /* ---------- outer edges: table width ---------- */
  function outerEdge(e){
    const td = e.target.closest && e.target.closest(".lt-table td, .lt-table th");
    if (!td || !editableTable(td.closest("table"))) return null;
    const r = td.getBoundingClientRect();
    if (!td.nextElementSibling && e.clientX - r.left <= EDGE) return { side: "left", t: td.closest("table") };
    if (!td.previousElementSibling && r.right - e.clientX <= EDGE) return { side: "right", t: td.closest("table") };
    return null;
  }
  paper.addEventListener("pointerdown", e => {
    const ed = outerEdge(e); if (!ed) return;
    e.preventDefault(); e.stopPropagation();
    const el = e.target; try { el.setPointerCapture(e.pointerId); } catch {}
    const t = ed.t, host = t.parentNode.getBoundingClientRect().width;
    const w0 = t.getBoundingClientRect().width, m0 = parseFloat(getComputedStyle(t).marginRight) * k(), sx = e.clientX;
    const move = ev => {
      const dx = ev.clientX - sx;
      if (ed.side === "left"){ const w = Math.max(60, Math.min(host - m0, w0 - dx)); t.style.width = pct(w, host); }
      else { const m = Math.max(0, Math.min(m0 + w0 - 60, m0 - dx)); t.style.marginRight = pct(m, host); t.style.width = pct(w0 + m0 - m, host); }
      t.style.marginLeft = "0"; showHandle(t);
    };
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); changed(t); };
    el.addEventListener("pointermove", move); el.addEventListener("pointerup", up);
  }, true);

  /* ---------- helpers for the menu ---------- */
  function cols(t){
    let cg = t.querySelector("colgroup"); const first = t.rows[0]; const n = first ? first.cells.length : 0;
    if (!cg || cg.children.length !== n){
      if (cg) cg.remove();
      const tw = t.getBoundingClientRect().width;
      cg = document.createElement("colgroup");
      [...first.cells].forEach(c => { const col = document.createElement("col"); col.style.width = pct(c.getBoundingClientRect().width, tw); cg.append(col); });
      t.prepend(cg);
    }
    t.style.tableLayout = "fixed"; return [...cg.children];
  }
  const newCell = () => { const td = document.createElement("td"); td.innerHTML = "<br>"; return td; };
  function insertRow(t, cell, after){
    const tr = cell ? cell.parentNode : t.rows[t.rows.length - 1];
    const n = tr.cloneNode(false); [...tr.cells].forEach(() => n.append(newCell()));
    after ? tr.after(n) : tr.before(n);
  }
  function insertCol(t, cell, toLeft){
    const i = cell ? [...cell.parentNode.children].indexOf(cell) : t.rows[0].cells.length - 1;
    const cg = t.querySelector("colgroup"); if (cg) cg.remove();
    [...t.rows].forEach(r => { const ref = r.children[i] || r.lastChild; const c = newCell(); toLeft ? ref.after(c) : ref.before(c); });
    t.style.tableLayout = "";
  }
  function borders(t, kind){ t.classList.remove("lt-b-out", "lt-b-h", "lt-b-none"); if (kind !== "all") t.classList.add("lt-b-" + kind); }
  async function copyTable(t){
    const html = t.outerHTML, text = [...t.rows].map(r => [...r.cells].map(c => c.innerText.trim()).join("\t")).join("\n");
    try { await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]); return true; }
    catch { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }
  }

  /* ---------- context menu ---------- */
  const menu = document.createElement("div"); menu.className = "tt-menu"; menu.setAttribute("role", "menu"); menu.hidden = true;
  document.body.append(menu);
  const menuOpen = () => !menu.hidden;
  let mTable = null, mCell = null;
  const ICON = {
    cut: '<path d="M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    ins: '<path d="M12 5v14M5 12h14"/>', del: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    rows: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9.5h18M3 14.5h18"/>', colsI: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 4v16M15 4v16"/>',
    border: '<rect x="4" y="4" width="16" height="16"/><path d="M4 12h16M12 4v16" stroke-dasharray="2 2"/>', fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    dir: '<path d="M10 4v16M14 4v10M6 4h10a0 0 0 0 1 0 0M17 17l3 3-3 3M20 20H9"/>', cap: '<path d="M4 6h16M4 10h10"/><rect x="4" y="14" width="16" height="6" rx="1"/>',
    props: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M9 10v10"/>',
  };
  const ico = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n] || ""}</svg>`;
  function items(){
    const c = mCell, t = mTable;
    return [
      { label: "قص", icon: "cut", run: async () => { if (await copyTable(t)) { t.remove(); changed(paper.querySelector(".lt-body")); handle.hidden = true; UI.toast("قُصّ الجدول. الصقه بـ Ctrl+V"); } else UI.toast("المتصفح منع النسخ", "err"); } },
      { label: "نسخ", icon: "copy", run: async () => { const ok = await copyTable(t); UI.toast(ok ? "نُسخ الجدول. الصقه بـ Ctrl+V" : "المتصفح منع النسخ", ok ? "ok" : "err"); } },
      "-",
      { label: "إدراج", icon: "ins", sub: [
        { label: "صف فوق", run: () => insertRow(t, c, false) }, { label: "صف تحت", run: () => insertRow(t, c, true) },
        { label: "عمود إلى اليمين", run: () => insertCol(t, c, false) }, { label: "عمود إلى اليسار", run: () => insertCol(t, c, true) },
        "-", { label: "تسمية توضيحية", run: () => { const p = document.createElement("p"); p.className = "lt-cap"; const n = paper.querySelectorAll(".lt-cap").length + 1; p.textContent = `جدول (${n}): `; t.before(p); } },
      ] },
      { label: "حذف جدول", icon: "del", run: () => { t.remove(); handle.hidden = true; } },
      { label: "حذف", icon: "del", sub: [
        { label: "الصف", disabled: !c, run: () => { if (t.rows.length > 1) c.parentNode.remove(); else t.remove(); } },
        { label: "العمود", disabled: !c, run: () => { const i = [...c.parentNode.children].indexOf(c); if (c.parentNode.children.length > 1){ const cg = t.querySelector("colgroup"); if (cg && cg.children[i]) cg.children[i].remove(); [...t.rows].forEach(r => r.children[i] && r.children[i].remove()); } else t.remove(); } },
      ] },
      { label: "توزيع الصفوف بالتساوي", icon: "rows", run: () => { const h = Math.max(...[...t.rows].map(r => r.getBoundingClientRect().height)) / k(); [...t.rows].forEach(r => { r.style.height = h + "px"; }); } },
      { label: "توزيع الأعمدة بالتساوي", icon: "colsI", run: () => { const cs = cols(t); cs.forEach(col => { col.style.width = (100 / cs.length).toFixed(2) + "%"; }); } },
      "-",
      { label: "أنماط الحدود", icon: "border", sub: [
        { label: "كل الحدود", run: () => borders(t, "all") }, { label: "الحدود الخارجية فقط", run: () => borders(t, "out") },
        { label: "حدود أفقية", run: () => borders(t, "h") }, { label: "بدون حدود", run: () => borders(t, "none") },
      ] },
      { label: "احتواء تلقائي", icon: "fit", sub: [
        { label: "احتواء تلقائي للمحتوى", run: () => { const cg = t.querySelector("colgroup"); if (cg) cg.remove(); t.style.tableLayout = "auto"; t.style.width = "auto"; t.style.marginRight = ""; } },
        { label: "احتواء تلقائي للإطار", run: () => { t.style.width = "100%"; t.style.marginRight = "0"; t.style.marginLeft = "0"; } },
        { label: "عرض أعمدة ثابت", run: () => cols(t) },
      ] },
      { label: "اتجاه النص", icon: "dir", sub: [
        { label: "من اليمين إلى اليسار", run: () => t.setAttribute("dir", "rtl") }, { label: "من اليسار إلى اليمين", run: () => t.setAttribute("dir", "ltr") },
      ] },
      { label: "إدراج تسمية توضيحية…", icon: "cap", run: () => { const p = document.createElement("p"); p.className = "lt-cap"; const n = paper.querySelectorAll(".lt-cap").length + 1; p.textContent = `جدول (${n}): `; t.before(p); } },
      "-",
      { label: "خصائص الجدول…", icon: "props", run: () => openProps(t) },
    ];
  }
  function build(list, box){
    box.innerHTML = "";
    list.forEach(it => {
      if (it === "-"){ const s = document.createElement("div"); s.className = "tt-sep"; box.append(s); return; }
      const b = document.createElement("button"); b.type = "button"; b.className = "tt-item"; b.setAttribute("role", "menuitem"); b.disabled = !!it.disabled;
      b.innerHTML = `<span class="tt-ic">${it.icon ? ico(it.icon) : ""}</span><span class="tt-l"></span>${it.sub ? '<span class="tt-more" aria-hidden="true">‹</span>' : ""}`;
      b.querySelector(".tt-l").textContent = it.label;
      if (it.sub){
        const sub = document.createElement("div"); sub.className = "tt-menu tt-sub"; sub.hidden = true; build(it.sub, sub); b.append(sub);
        b.addEventListener("mouseenter", () => { box.querySelectorAll(":scope > .tt-item > .tt-sub").forEach(x => { x.hidden = x !== sub; }); });
        b.addEventListener("click", e => { if (e.target.closest(".tt-sub") ) return; sub.hidden = !sub.hidden; });
      } else {
        b.addEventListener("mouseenter", () => box.querySelectorAll(":scope > .tt-item > .tt-sub").forEach(x => { x.hidden = true; }));
        b.addEventListener("click", async e => { e.stopPropagation(); closeMenu(); const t = mTable; await it.run(); if (t && t.isConnected){ changed(t); showHandle(t); } else changed(paper.querySelector(".lt-body")); });
      }
      box.append(b);
    });
  }
  function openMenu(x, y, t, cell){
    mTable = t; mCell = cell || (t.rows[0] && t.rows[0].cells[0]) || null;
    build(items(), menu); menu.hidden = false;
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(innerWidth - w - 8, x - w)) + "px";
    menu.style.top = Math.max(8, Math.min(innerHeight - h - 8, y)) + "px";
    menu.querySelector(".tt-item:not(:disabled)").focus();
  }
  function closeMenu(){ menu.hidden = true; }
  handle.addEventListener("contextmenu", e => { e.preventDefault(); if (cur) openMenu(e.clientX, e.clientY, cur, null); });
  paper.addEventListener("contextmenu", e => {
    const cell = e.target.closest && e.target.closest(".lt-table td, .lt-table th");
    if (!cell || !editableTable(cell.closest("table"))) return;
    e.preventDefault(); openMenu(e.clientX, e.clientY, cell.closest("table"), cell);
  });
  document.addEventListener("pointerdown", e => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !menu.hidden) closeMenu(); });
  addEventListener("scroll", closeMenu, true);

  /* ---------- table properties ---------- */
  function openProps(t){
    const back = document.createElement("div"); back.className = "ui-scrim";
    const d = document.createElement("div"); d.className = "ui-dialog tt-props"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true");
    const cs = getComputedStyle(t), host = t.parentNode.getBoundingClientRect().width;
    const widthNow = Math.round(t.getBoundingClientRect().width / host * 100);
    const align = t.style.marginLeft === "auto" && t.style.marginRight === "auto" ? "center" : t.style.marginRight === "auto" ? "left" : "right";
    const v = n => t.style.getPropertyValue(n).trim();
    d.innerHTML = `<h2>خصائص الجدول</h2>
      <div class="s-row"><label>العرض</label><div class="range"><input type="range" data-p="w" min="20" max="100" value="${Math.min(100, widthNow)}"><span class="mono" data-v="w">${Math.min(100, widthNow)}%</span></div></div>
      <div class="s-row"><label>المحاذاة</label><select class="select" data-p="align"><option value="right">يمين</option><option value="center">وسط</option><option value="left">يسار</option></select></div>
      <div class="s-row"><label>لون الحدود</label><input type="color" data-p="bc" value="${v("--bc") || "#9a9a9a"}"></div>
      <div class="s-row"><label>سماكة الحدود</label><select class="select" data-p="bw"><option value="0.5px">رفيعة جداً</option><option value="1px">رفيعة</option><option value="1.5px">متوسطة</option><option value="2px">سميكة</option></select></div>
      <div class="s-row"><label>الحشو داخل الخلايا</label><select class="select" data-p="pad"><option value="2px 6px">ضيق</option><option value="4px 8px">عادي</option><option value="8px 12px">واسع</option></select></div>
      <div class="s-row"><label>تظليل الصف الأول</label><div class="tt-shade"><input type="color" data-p="hs" value="${v("--hs") || "#efe9fb"}"><label class="s-check"><input type="checkbox" data-p="hson" ${t.classList.contains("lt-hshade") ? "checked" : ""}> تفعيل</label></div></div>
      <div class="ui-actions"><button class="btn primary" type="button" data-ok>تطبيق</button><button class="btn" type="button" data-no>إلغاء</button></div>`;
    const q = s => d.querySelector(s);
    q('[data-p="align"]').value = align;
    q('[data-p="bw"]').value = v("--bw") || "1px";
    q('[data-p="pad"]').value = v("--pad") || "4px 8px";
    q('[data-p="w"]').addEventListener("input", e => { q('[data-v="w"]').textContent = e.target.value + "%"; });
    const close = () => { back.remove(); d.remove(); };
    back.addEventListener("click", close); q("[data-no]").addEventListener("click", close);
    q("[data-ok]").addEventListener("click", () => {
      const w = +q('[data-p="w"]').value, a = q('[data-p="align"]').value;
      t.style.width = w + "%";
      t.style.marginRight = a === "right" ? "0" : "auto"; t.style.marginLeft = a === "left" ? "0" : "auto";
      if (a === "right") t.style.marginLeft = "auto";
      if (a === "left") t.style.marginRight = "auto";
      if (a === "center"){ t.style.marginLeft = "auto"; t.style.marginRight = "auto"; }
      t.style.setProperty("--bc", q('[data-p="bc"]').value);
      t.style.setProperty("--bw", q('[data-p="bw"]').value);
      t.style.setProperty("--pad", q('[data-p="pad"]').value);
      t.style.setProperty("--hs", q('[data-p="hs"]').value);
      t.classList.toggle("lt-hshade", q('[data-p="hson"]').checked);
      close(); changed(t); showHandle(t);
    });
    document.body.append(back, d);
    q('[data-p="w"]').focus();
  }
})();
