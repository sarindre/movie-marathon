// Seasonal skins. "auto" picks by today's date; the choice is remembered.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Theme = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const themes = {
    cinema:    { label: "Cinema",         icon: "🎬", bg: "#14141a" },
    halloween: { label: "Halloween",      icon: "🎃", bg: "#120a1a" },
    christmas: { label: "Christmas",      icon: "🎄", bg: "#0d1a14" },
    winter:    { label: "Winter",         icon: "❄️", bg: "#0e1722" },
    valentine: { label: "Valentine's",    icon: "💘", bg: "#1d0f17" },
    spring:    { label: "Spring",         icon: "🌸", bg: "#12201a" },
    summer:    { label: "Summer",         icon: "☀️", bg: "#0b1a26" },
    autumn:    { label: "Autumn",         icon: "🍂", bg: "#1c130c" },
  };

  // Holidays win over the plain season.
  function themeForDate(d = new Date()) {
    const m = d.getMonth() + 1, day = d.getDate();
    if (m === 10) return "halloween";
    if (m === 12 && day >= 1) return "christmas";
    if (m === 2 && day <= 14) return "valentine";
    if (m >= 3 && m <= 5) return "spring";
    if (m >= 6 && m <= 8) return "summer";
    if (m >= 9 && m <= 11) return "autumn";
    return "winter"; // Jan, Feb 15+
  }

  const KEY = "marathon-theme";
  const choice = () => localStorage.getItem(KEY) || "auto";
  const resolve = (c = choice()) => (themes[c] ? c : themeForDate());

  // Display settings: dark/light and text size, remembered separately from the seasonal theme.
  const DKEY = "marathon-display";
  const SIZES = { normal: "100%", large: "118%", xlarge: "135%" };
  const display = () => {
    try { return { mode: "dark", size: "normal", ...JSON.parse(localStorage.getItem(DKEY) || "{}") }; }
    catch { return { mode: "dark", size: "normal" }; }
  };
  const prefersDark = () => !window.matchMedia || window.matchMedia("(prefers-color-scheme: dark)").matches;

  function apply() {
    const name = resolve();
    const d = display();
    const dark = d.mode === "dark" || (d.mode === "auto" && prefersDark());
    const root = document.documentElement;
    root.dataset.theme = name;
    root.dataset.mode = dark ? "dark" : "light";
    root.style.setProperty("--fs", SIZES[d.size] || SIZES.normal);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? themes[name].bg : "#f6f6f8";
    for (const el of document.querySelectorAll("[data-theme-icon]")) el.textContent = themes[name].icon;
    return name;
  }

  function initDisplay(modeSel, sizeSel) {
    const d = display();
    modeSel.value = d.mode;
    sizeSel.value = SIZES[d.size] ? d.size : "normal";
    const save = () => { localStorage.setItem(DKEY, JSON.stringify({ mode: modeSel.value, size: sizeSel.value })); apply(); };
    modeSel.addEventListener("input", save);
    sizeSel.addEventListener("input", save);
    if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
  }

  function initPicker(select) {
    const auto = document.createElement("option");
    auto.value = "auto";
    auto.textContent = `Auto (${themes[themeForDate()].label})`;
    select.append(auto);
    for (const [k, t] of Object.entries(themes)) {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = `${t.icon} ${t.label}`;
      select.append(o);
    }
    select.value = themes[choice()] ? choice() : "auto";
    select.addEventListener("input", () => { localStorage.setItem(KEY, select.value); apply(); });
  }

  return { themes, themeForDate, apply, initPicker, initDisplay };
});
