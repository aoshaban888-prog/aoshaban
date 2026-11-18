/* Shared interface pieces: confirm / alert dialogs in the site's own style, and short toasts.
   UI.confirm(text, { title, ok, danger }) → Promise<boolean>
   UI.alert(text, { title })              → Promise<void>
   UI.toast(text, "ok" | "err")           → shows for a few seconds at the bottom
   UI.prompt(text, { title, ok, danger, choices, note, noteRequired, placeholder }) → Promise<{ choice, note } | null> */
(() => {
  let open = null;
  function dialog({ title, text, ok = "موافق", cancel = null, danger = false, form = null }){
    return new Promise(resolve => {
      if (open) open.close(false);
      const back = document.createElement("div"); back.className = "ui-scrim";
      const box = document.createElement("div"); box.className = "ui-dialog"; box.setAttribute("role", cancel ? "alertdialog" : "dialog"); box.setAttribute("aria-modal", "true");
      const id = "uid" + Math.random().toString(36).slice(2, 7);
      box.setAttribute("aria-labelledby", id + "t"); box.setAttribute("aria-describedby", id + "d");
      box.innerHTML = `<h2 id="${id}t"></h2><p id="${id}d"></p><div class="ui-actions"></div>`;
      box.querySelector("h2").textContent = title || (cancel ? "تأكيد" : "تنبيه");
      box.querySelector("p").textContent = text || "";
      let sel = null, note = null, err = null;
      if (form){
        const f = document.createElement("div"); f.className = "ui-form";
        if (form.choices){ sel = document.createElement("select"); sel.className = "select"; sel.setAttribute("aria-label", "السبب");
          sel.append(new Option("اختر السبب", "")); form.choices.forEach(c => sel.append(new Option(c, c))); f.append(sel); }
        note = document.createElement("textarea"); note.className = "input"; note.rows = 3; note.placeholder = form.placeholder || "ملاحظة"; note.value = form.note || ""; note.setAttribute("aria-label", "ملاحظة"); f.append(note);
        err = document.createElement("p"); err.className = "ui-err"; err.hidden = true; f.append(err);
        box.querySelector("p").after(f);
      }
      const actions = box.querySelector(".ui-actions");
      const okBtn = document.createElement("button"); okBtn.type = "button"; okBtn.className = "btn " + (danger ? "danger" : "primary"); okBtn.textContent = ok;
      actions.append(okBtn);
      let cancelBtn = null;
      if (cancel){ cancelBtn = document.createElement("button"); cancelBtn.type = "button"; cancelBtn.className = "btn"; cancelBtn.textContent = cancel; actions.append(cancelBtn); }
      const before = document.activeElement;
      const close = v => {
        document.removeEventListener("keydown", onKey, true);
        back.remove(); box.remove(); open = null;
        if (before && before.focus) before.focus();
        resolve(v);
      };
      const onKey = e => {
        if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); close(false); }
        if (e.key === "Tab"){ // keep focus inside the dialog
          const f = [...box.querySelectorAll("button,select,textarea")]; const i = f.indexOf(document.activeElement);
          e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
        }
      };
      okBtn.addEventListener("click", () => {
        if (!form) return close(true);
        const choice = sel ? sel.value : "", text = note.value.trim();
        if (sel && !choice){ err.textContent = "اختر السبب"; err.hidden = false; sel.focus(); return; }
        if (form.noteRequired && !text){ err.textContent = "اكتب التفاصيل"; err.hidden = false; note.focus(); return; }
        close({ choice, note: text });
      });
      if (cancelBtn) cancelBtn.addEventListener("click", () => close(false));
      back.addEventListener("click", () => close(false));
      document.addEventListener("keydown", onKey, true);
      document.body.append(back, box);
      open = { close };
      (sel || note || (danger && cancelBtn ? cancelBtn : okBtn)).focus();
    });
  }
  let stack = null;
  function toast(text, kind = "ok"){
    if (!stack){ stack = document.createElement("div"); stack.className = "ui-toasts"; stack.setAttribute("aria-live", "polite"); document.body.append(stack); }
    const t = document.createElement("div"); t.className = "ui-toast " + kind; t.setAttribute("role", kind === "err" ? "alert" : "status");
    t.textContent = text;
    stack.append(t);
    requestAnimationFrame(() => t.classList.add("in"));
    setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 300); }, kind === "err" ? 5000 : 2800);
  }
  window.UI = {
    confirm: (text, o = {}) => dialog({ title: o.title, text, ok: o.ok || "تأكيد", cancel: o.cancel || "إلغاء", danger: !!o.danger }),
    alert: (text, o = {}) => dialog({ title: o.title, text, ok: o.ok || "حسناً" }),
    prompt: (text, o = {}) => dialog({ title: o.title, text, ok: o.ok || "تأكيد", cancel: "إلغاء", danger: !!o.danger, form: o }).then(v => v || null),
    toast,
  };
})();
