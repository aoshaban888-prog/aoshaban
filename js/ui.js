/* Shared interface pieces: confirm / alert dialogs in the site's own style, and short toasts.
   UI.confirm(text, { title, ok, danger }) → Promise<boolean>
   UI.alert(text, { title })              → Promise<void>
   UI.toast(text, "ok" | "err")           → shows for a few seconds at the bottom */
(() => {
  let open = null;
  function dialog({ title, text, ok = "موافق", cancel = null, danger = false }){
    return new Promise(resolve => {
      if (open) open.close(false);
      const back = document.createElement("div"); back.className = "ui-scrim";
      const box = document.createElement("div"); box.className = "ui-dialog"; box.setAttribute("role", cancel ? "alertdialog" : "dialog"); box.setAttribute("aria-modal", "true");
      const id = "uid" + Math.random().toString(36).slice(2, 7);
      box.setAttribute("aria-labelledby", id + "t"); box.setAttribute("aria-describedby", id + "d");
      box.innerHTML = `<h2 id="${id}t"></h2><p id="${id}d"></p><div class="ui-actions"></div>`;
      box.querySelector("h2").textContent = title || (cancel ? "تأكيد" : "تنبيه");
      box.querySelector("p").textContent = text || "";
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
          const f = [...box.querySelectorAll("button")]; const i = f.indexOf(document.activeElement);
          e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
        }
      };
      okBtn.addEventListener("click", () => close(true));
      if (cancelBtn) cancelBtn.addEventListener("click", () => close(false));
      back.addEventListener("click", () => close(false));
      document.addEventListener("keydown", onKey, true);
      document.body.append(back, box);
      open = { close };
      (danger && cancelBtn ? cancelBtn : okBtn).focus();
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
    toast,
  };
})();
