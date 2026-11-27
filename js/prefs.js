/* Per-person preferences (the dashboard layout, favourites, notification read state, quiet hours, density…):
   Firestore userPrefs/{email}, readable and writable only by that person. A copy in localStorage applies them
   before the database answers. UserPrefs.get(key, fallback) / UserPrefs.set(key, value); "app:prefs" when they change. */
(() => {
  let db = null, me = "", data = {}, saveT = 0, unsub = null;
  const lsKey = () => "app-prefs-" + (me || "guest");
  const load = () => { try { data = JSON.parse(localStorage.getItem(lsKey()) || "{}"); } catch { data = {}; } };
  const cache = () => { try { localStorage.setItem(lsKey(), JSON.stringify(data)); } catch {} };
  const emit = () => window.dispatchEvent(new CustomEvent("app:prefs", { detail: data }));
  function get(k, fb){ return data[k] === undefined ? fb : JSON.parse(JSON.stringify(data[k])); }
  function set(k, v){
    data = { ...data, [k]: v }; cache(); emit();
    clearTimeout(saveT); saveT = setTimeout(() => { if (db && me) db.collection("userPrefs").doc(me).set({ ...data, updatedAt: new Date().toISOString() }).catch(e => console.error("prefs", e)); }, 600);
  }
  function connect({ db: d, user }){
    if (unsub){ unsub(); unsub = null; }
    db = d; me = ((user && user.email) || "").toLowerCase(); load(); emit();
    if (!db || !me) return;
    unsub = db.collection("userPrefs").doc(me).onSnapshot(s => { if (s.exists){ const { updatedAt, ...rest } = s.data(); data = { ...data, ...rest }; cache(); emit(); } }, () => {});
  }
  load();
  window.UserPrefs = { get, set, get all(){ return { ...data }; } };
  window.addEventListener("app:db", e => connect(e.detail));
  if (window.appDb) connect({ db: window.appDb, user: window.appUser });
})();
