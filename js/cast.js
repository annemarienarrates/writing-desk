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

  // ---------- continuity: eyes, hair and ages that don't agree ----------
  const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };
  const numOf = w => { w = String(w).toLowerCase(); if (/^\d+$/.test(w)) return +w; const p = w.split(/[- ]/); let n = 0; for (const x of p) { if (NUM[x] == null) return null; n += NUM[x]; } return n || null; };
  const EYE = "green|blue|grey|gray|brown|hazel|amber|black|violet|purple|gold|golden|silver|dark|pale|ice[- ]blue|sea[- ]green|emerald|sapphire|steel[- ]grey|steel[- ]gray|honey|whiskey|whisky|red|yellow|white|mismatched";
  const HAIR = "blonde|blond|red|auburn|black|brown|dark|silver|white|grey|gray|copper|ginger|chestnut|raven|pink|blue|green|purple|platinum|sandy|honey|strawberry[- ]blond(?:e)?|jet[- ]black|dark[- ]brown|light[- ]brown|ash[- ]blond(?:e)?";
  const AGEW = "\\d{1,3}|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|eighteen|nineteen|seventeen|sixteen|fifteen|fourteen|thirteen|twelve|eleven|ten|one hundred|hundred";
  const norm = v => v.toLowerCase().replace(/gray/g, "grey").replace(/blond(?!e)/g, "blonde").replace(/whisky/, "whiskey").replace(/[- ]+/g, " ").trim();
  // sources: [{ where, sceneId|null, md }] → [{ name, attr, values: [{ v, where: [..], sceneId }] }] where more than one value turns up
  function continuity(cast, sources) {
    const found = {};
    const add = (name, attr, v, src, find) => { const k = name + "|" + attr; const f = found[k] = found[k] || { name, attr, vals: {} }; const nv = attr === "age" ? String(numOf(v)) : norm(v); if (nv === "null") return; const e = f.vals[nv] = f.vals[nv] || { v: nv, where: [] }; if (e.where.length < 4 && !e.where.some(w => w.where === src.where)) e.where.push({ where: src.where, sceneId: src.sceneId, find }); };
    for (const c of cast.filter(c => c.kind === "person")) {
      const N = "(?:" + [c.name, ...(c.aliases || [])].filter(Boolean).sort((a, b) => b.length - a.length).map(esc).join("|") + ")";
      const R = [
        ["eyes", new RegExp(`\\b${N}['’]s\\s+(?:\\w+\\s+)?(${EYE})(?:[- ]coloured|[- ]colored)?\\s+eyes`, "gi")],
        ["eyes", new RegExp(`\\b${N}(?:,[^,.\\n]{1,20},)?\\s+(?:had|has)\\s+(?:\\w+\\s+)?(${EYE})\\s+eyes`, "gi")],
        ["eyes", new RegExp(`\\b${N}\\b[^.!?\\n“”"]{0,30}\\b(?:her|his|their)\\s+(?:\\w+\\s+)?(${EYE})\\s+eyes`, "gi")],
        ["eyes", new RegExp(`\\b${N}['’]s\\s+eyes\\s+(?:were|are|was|went|turned)\\s+(?:a\\s+)?(${EYE})\\b`, "gi")],
        ["eyes", new RegExp(`\\b${N}\\b[^.\\n]{0,30}\\b(${EYE})[- ]eyed\\b`, "gi")],
        ["hair", new RegExp(`\\b${N}['’]s\\s+(?:\\w+\\s+)?(${HAIR})\\s+(?:hair|curls|braid|locks|waves)`, "gi")],
        ["hair", new RegExp(`\\b${N}(?:,[^,.\\n]{1,20},)?\\s+(?:had|has)\\s+(?:\\w+\\s+)?(${HAIR})\\s+hair`, "gi")],
        ["hair", new RegExp(`\\b${N}\\b[^.!?\\n“”"]{0,30}\\b(?:her|his|their)\\s+(?:\\w+\\s+)?(${HAIR})\\s+(?:hair|curls|braid)`, "gi")],
        ["hair", new RegExp(`\\b${N}['’]s\\s+hair\\s+(?:was|is|were)\\s+(?:a\\s+)?(${HAIR})\\b`, "gi")],
        ["age", new RegExp(`\\b${N},\\s+(${AGEW}),`, "gi")],
        ["age", new RegExp(`\\b${N}\\s+(?:was|is|turned|had just turned)\\s+(${AGEW})(?:\\s+years\\s+old|\\b(?=[.,;]))`, "gi")],
        ["age", new RegExp(`\\b${N},?\\s+(?:a|an|the)\\s+(${AGEW})[- ]year[- ]old`, "gi")],
        ["age", new RegExp(`\\b(${AGEW})[- ]year[- ]old\\s+${N}\\b`, "gi")]
      ];
      for (const src of sources) { const t = clean(src.md); for (const [attr, re] of R) { re.lastIndex = 0; let m; while ((m = re.exec(t))) add(c.name, attr, m[1], src, m[0]); } }
    }
    return Object.values(found).map(f => ({ name: f.name, attr: f.attr, values: Object.values(f.vals) })).filter(f => f.values.length > 1);
  }

  // ---------- the timeline: time words in each scene, and day numbers ----------
  const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  function timeHints(md) {
    const t = clean(md), out = [];
    const re = /\b(the next (?:morning|day|night|evening|afternoon)|the following (?:morning|day|night|week)|(?:a|one|two|three|four|five|six|seven|eight|nine|ten|\d+|several|a few) (?:days?|weeks?|months?|years?|hours?) (?:later|after|passed|went by)|that (?:night|evening|afternoon|morning)|later that (?:day|night|evening)|(?:yester|to)day|tonight|tomorrow|dawn|sunrise|sunset|dusk|midnight|noon|(?:mon|tues|wednes|thurs|fri|satur|sun)day|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?)\b/gi;
    let m; while ((m = re.exec(t)) && out.length < 8) if (!out.some(x => x.toLowerCase() === m[1].toLowerCase())) out.push(m[1]);
    return out;
  }
  // how many days a scene's hints move the story on from the scene before
  function stepOf(hints) {
    for (const h of hints.map(x => x.toLowerCase())) {
      if (/^(the next|the following) (morning|day)|^tomorrow/.test(h)) return 1;
      if (/^the following week/.test(h)) return 7;
      const m = h.match(/^(a|one|two|three|four|five|six|seven|eight|nine|ten|\d+|several|a few) (day|week|month|year)s?/);
      if (m) { const n = m[1] === "a" ? 1 : m[1] === "several" ? 3 : m[1] === "a few" ? 3 : (numOf(m[1]) || 1); return n * ({ day: 1, week: 7, month: 30, year: 365 }[m[2]]); }
    }
    return 0;
  }
  const weekdayOf = date => WEEKDAYS[new Date(date + "T12:00:00").getDay()];

  window.Cast = Object.assign(window.Cast, { continuity, timeHints, stepOf, weekdayOf, WEEKDAYS });

})();
