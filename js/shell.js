/* App shell: hash routing between views and the mobile navigation drawer. */
(() => {
  const ROUTES = {
    "home": "الرئيسية",
    "tasks": "المهام",
    "governance/library": "اللوائح والسياسات",
    "governance/associations": "الجمعيات",
    "governance/compliance": "متطلبات الامتثال",
  };
  // until the home page is built, open on the library
  const DEFAULT = "governance/library";
  const app = document.querySelector(".app");
  let current = null;

  function route(){
    let r = location.hash.replace(/^#\/?/, "");
    if (!ROUTES[r]) r = DEFAULT;
    document.querySelectorAll(".view").forEach(v => { v.hidden = v.dataset.view !== r; });
    document.querySelectorAll(".nav a").forEach(a => {
      if (a.getAttribute("href") === "#/" + r) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    document.querySelector(".topbar .t").textContent = ROUTES[r];
    document.title = ROUTES[r] + " · مكتب الحوكمة";
    app.classList.remove("nav-open");
    if (r !== current){ current = r; window.scrollTo(0, 0); window.dispatchEvent(new CustomEvent("app:view", { detail: r })); }
  }
  window.addEventListener("hashchange", route);
  document.querySelector(".menu-btn").addEventListener("click", () => app.classList.add("nav-open"));
  document.querySelector(".scrim").addEventListener("click", () => app.classList.remove("nav-open"));
  document.addEventListener("keydown", e => { if (e.key === "Escape") app.classList.remove("nav-open"); });
  route();
})();
