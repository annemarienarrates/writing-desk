/* The Writing Desk — who and where: people and places, and the scenes they turn up in.
   No codex entries to write: names are suggested from the bible on the reference shelf and from the manuscript itself,
   and one click keeps them. Counting is automatic. A book keeps its list in book.json as
   cast: [{ name, aliases: [..], kind: "person" | "place" }] */
(function () {
  "use strict";
  const COMMON = new Set("I I'm I'd I'll I've The A An And But Or So Then When Where What Who Why How If He She They It We You His Her Their Its Our Your My Mr Mrs Ms Dr Sir Lady Lord Yes No Oh Okay OK God Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December Chapter Scene Part Book This That These Those There Here Not Just Even Still Now Later After Before Again Maybe Well Hey Please Thanks Thank Sorry Good Great Fine Damn Hell Shit Fuck Christ Jesus Every Some Any All One Two Three First Second Last Next Because While Though Although Once Instead Meanwhile Nothing Something Everything Anything Nobody Somebody Everyone Someone Anyone Let Don't Can't Won't Didn't Wasn't Isn't Couldn't Wouldn't Shouldn't Hadn't Haven't Doesn't Aren't Weren't Is Was Are Were Be Do Did Does Have Had Has To Of In On At For With By From Up Down Out Over Under Into Onto Off Through Around About As Like Than With Without Inside Outside Behind Beside Between".split(" "));
  const clean = md => String(md || "").replace(/\[xx\b[^\]]*\]/gi, " ").replace(/\\\*/g, "*").replace(/\*+/g, "");
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // names from the bible: "- **Mara Voss**, 29…", "**Teo**:", "### Mara Voss" under a Cast / Places heading, first table column
  function fromBible(md) {
    const out = [], seen = new Set(); let kind = null;
    const add = (n, k) => { n = n.replace(/[*_`]/g, "").replace(/\s*\(.*$/, "").replace(/[,:;.–—-].*$/, "").trim(); if (!n || n.length > 40 || n.split(" ").length > 4 || !/^\p{Lu}/u.test(n) || seen.has(n.toLowerCase())) return; seen.add(n.toLowerCase()); out.push({ name: n, kind: k || "person" }); };
    for (const line of String(md || "").split("\n")) {
      const h = line.match(/^#{1,6}\s+(.*)$/);
      if (h) {
        const t = h[1].toLowerCase();
        if (/\b(cast|characters?|people|love interests?|family|crew|party|villains?|antagonists?|npcs?)\b/.test(t)) { kind = "person"; continue; }
        if (/\b(places?|locations?|settings?|world|cities|towns|map|geography|realms?)\b/.test(t)) { kind = "place"; continue; }
        if (kind && /^#{3,6}/.test(line)) { add(h[1], kind); continue; }
        kind = null; continue;
      }
      const b = line.match(/^\s*(?:[-*+]|\d+\.)?\s*\*\*([^*]{2,40})\*\*/); if (b) { add(b[1], kind); continue; }
      const tr = line.match(/^\s*\|\s*([^|]+?)\s*\|/); if (tr && kind && !/^(name|character|place|-+)$/i.test(tr[1])) add(tr[1], kind);
    }
    return out;
  }
  // names from the manuscript: capitalised words mid-sentence, three times or more
  function fromText(texts) {
    const counts = {}, starts = {};
    for (const md of texts) {
      const t = clean(md);
      for (const m of t.matchAll(/(?<=[a-z,;:'’”"—–-]\s+|[a-z][’']s\s+)(\p{Lu}[\p{Ll}’']+(?:\s+\p{Lu}[\p{Ll}]+)?)/gu)) { const n = m[1].replace(/[’']s$/, ""); if (COMMON.has(n.split(" ")[0])) continue; counts[n] = (counts[n] || 0) + 1; }
      for (const m of t.matchAll(/(?:^|[.!?]\s+|[“"])(\p{Lu}[\p{Ll}]+)/gmu)) starts[m[1]] = (starts[m[1]] || 0) + 1;
    }
    // after "at / in / to / from / near / through" more often than not → a place
    const prep = {};
    for (const md of texts) for (const m of clean(md).matchAll(/\b(?:at|in|to|from|near|through|across|outside|inside|toward|towards|into)\s+(?:the\s+)?(\p{Lu}[\p{Ll}’']+(?:\s+\p{Lu}[\p{Ll}]+)?)/gu)) prep[m[1]] = (prep[m[1]] || 0) + 1;
    return Object.entries(counts).filter(([n, c]) => c >= 3).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([name, n]) => ({ name, n, kind: (prep[name] || 0) * 2 >= n ? "place" : "person" }));
  }
  function suggest(bibleMd, texts, existing) {
    const have = new Set((existing || []).flatMap(c => [c.name, ...(c.aliases || [])]).map(s => s.toLowerCase()));
    const out = [], seen = new Set();
    for (const c of fromBible(bibleMd).concat(fromText(texts))) {
      const k = c.name.toLowerCase(); if (have.has(k) || seen.has(k)) continue;
      // "Mara" when "Mara Voss" is already suggested → an alias, not a second person
      const full = out.find(o => o.name.split(" ")[0].toLowerCase() === k || o.name.split(" ").slice(-1)[0].toLowerCase() === k);
      if (full) { full.aliases = full.aliases || []; if (!full.aliases.includes(c.name)) full.aliases.push(c.name); seen.add(k); continue; }
      seen.add(k); out.push({ name: c.name, kind: c.kind, aliases: [], from: c.n ? "manuscript" : "bible" });
    }
    // first names of full names count as aliases automatically
    for (const o of out) { const p = o.name.split(" "); if (p.length > 1 && o.kind === "person" && !o.aliases.includes(p[0])) o.aliases.push(p[0]); }
    return out;
  }
  // counts per scene: { sceneId: { name: n } }
  function count(cast, scenes) {
    const res = {};
    const res2 = cast.map(c => ({ c, re: new RegExp("(?<![\\p{L}])(" + [c.name, ...(c.aliases || [])].filter(Boolean).sort((a, b) => b.length - a.length).map(esc).join("|") + ")(?![\\p{L}])", "gu") }));
    for (const s of scenes) { const t = clean(s.md), r = res[s.id] = {}; for (const { c, re } of res2) { const n = (t.match(re) || []).length; if (n) r[c.name] = n; } }
    return res;
  }
  window.Cast = { suggest, count, fromBible, fromText };
})();
