// Movie runtime lookup via Wikidata (no API key needed, CORS-enabled).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Lookup = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const API = "https://www.wikidata.org/w/api.php";
  const UNIT_TO_MIN = { Q7727: 1, Q11574: 1 / 60, Q25235: 60 }; // minute, second, hour

  const get = async (params) => {
    const res = await fetch(`${API}?${new URLSearchParams({ format: "json", origin: "*", ...params })}`);
    if (!res.ok) throw new Error(`Wikidata ${res.status}`);
    return res.json();
  };

  function runtimeMinutes(claims) {
    for (const c of (claims && claims.P2047) || []) {
      const v = c.mainsnak.datavalue && c.mainsnak.datavalue.value;
      const factor = v && UNIT_TO_MIN[v.unit.split("/").pop()];
      if (factor) return Math.round(parseFloat(v.amount) * factor);
    }
    return null;
  }

  // Returns [{ id, title, description, minutes|null }] for films matching the query.
  async function searchFilms(query) {
    const found = await get({ action: "wbsearchentities", search: query, language: "en", type: "item", limit: "10" });
    const films = found.search.filter((r) => /film/i.test(r.description || ""));
    if (!films.length) return [];
    const ents = await get({ action: "wbgetentities", ids: films.map((f) => f.id).join("|"), props: "claims" });
    return films.map((f) => ({
      id: f.id,
      title: f.label,
      description: f.description,
      minutes: runtimeMinutes(ents.entities[f.id].claims),
    }));
  }

  return { searchFilms, runtimeMinutes };
});
