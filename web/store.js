// Saved marathons: several named lists, kept in localStorage.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Store = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const KEY = "marathon-data";
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const defaults = () => ({ strategy: "bestfit", brk: 10, budget: "", start: "18:00", date: "", buffer: 0 });
  const blank = (name) => ({ name, movies: [], settings: defaults(), order: null, live: null });

  function load(storage = localStorage) {
    try {
      const d = JSON.parse(storage.getItem(KEY) || "null");
      if (d && d.lists && d.lists[d.current]) return d;
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

  function uniqueName(data, base) {
    const names = new Set(Object.values(data.lists).map((l) => l.name));
    if (!names.has(base)) return base;
    for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
  }

  return { load, save, create, remove, uniqueName, uid, defaults };
});
