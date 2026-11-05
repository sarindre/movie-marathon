// Saved marathons: several named lists, kept in localStorage.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Store = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const KEY = "marathon-data";
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const defaults = () => ({ strategy: "bestfit", brk: 10, budget: "", start: "18:00", date: "", buffer: 0, finishBy: "", mealAfter: 0, mealMin: 0 });
  const blank = (name) => ({ name, movies: [], settings: defaults(), order: null, live: null });

  function load(storage = localStorage) {
    try {
      const d = JSON.parse(storage.getItem(KEY) || "null");
      if (d && d.lists && d.lists[d.current]) {
        // Marathons saved by older versions lack newer settings: fill them in.
        for (const l of Object.values(d.lists)) l.settings = { ...defaults(), ...l.settings };
        return d;
      }
    } catch {}
    // First run, or upgrading from the single-list version.
    let old = [];
    try { old = JSON.parse(storage.getItem("marathon") || "[]"); } catch {}
    const id = uid();
    return { current: id, lists: { [id]: { ...blank("My marathon"), movies: old } } };
  }

  const save = (data, storage = localStorage) => storage.setItem(KEY, JSON.stringify(data));

  function create(data, name) {
    const id = uid();
    data.lists[id] = blank(name);
    data.current = id;
    return id;
  }

  // Never leaves the user with zero marathons.
  function remove(data, id) {
    delete data.lists[id];
    const ids = Object.keys(data.lists);
    if (!ids.length) create(data, "My marathon");
    else if (data.current === id) data.current = ids[0];
  }

  // Copies a marathon under a new name. Movies get new ids (the manual order is translated to match),
  // watched ticks are cleared so the copy is ready to plan, and nothing is "now playing".
  function duplicate(data, id, newId = uid) {
    const src = data.lists[id];
    const ids = new Map();
    const movies = src.movies.map((m) => {
      const copy = { ...m, id: newId() };
      delete copy.watched;
      ids.set(m.id, copy.id);
      return copy;
    });
    const base = (src.name.length > 50 ? src.name.slice(0, 50).trim() : src.name) + " copy";
    const nid = newId();
    data.lists[nid] = {
      name: uniqueName(data, base),
      movies,
      settings: { ...src.settings },
      order: src.order ? src.order.map((x) => ids.get(x)).filter(Boolean) : null,
      live: null,
    };
    data.current = nid;
    return nid;
  }

  function uniqueName(data, base) {
    const names = new Set(Object.values(data.lists).map((l) => l.name));
    if (!names.has(base)) return base;
    for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
  }

  return { load, save, create, remove, duplicate, uniqueName, uid, defaults };
});
