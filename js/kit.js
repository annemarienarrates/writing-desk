/* The Writing Desk — the publishing kit, kept with each book (book.kit): everything the store forms ask for, ready to
   copy field by field. Claude writes it (Series Forge Stage 18); paste its Markdown in and the fields fill themselves. */
(function () {
  "use strict";
  // [key, label, kind, limit/count, hint]; kinds: line, text, list (count fields), select
  const GROUPS = [
    ["Amazon KDP", [
      ["title", "Title", "line", 0, "Exactly as on the cover."],
      ["subtitle", "Subtitle", "line", 0, "Title and subtitle together: 200 characters at most. The series goes in KDP's series field, not here."],
      ["seriesDesc", "Series description", "text", 0, "Shown on the series page."],
      ["blurb", "Long blurb (description)", "text", 4000, "Hook line, setup, stakes, then a bold tropes line. Up to 4,000 characters."],
      ["keywords", "Keywords", "list", 7, "Seven boxes, up to 50 characters each: reader search phrases. No title words, no other authors, no store programme names."],
      ["categories", "Categories", "list", 3, "Three categories."],
      ["aplus", "A+ Content copy", "text", 0, ""],
      ["heat", "Heat and content note", "text", 0, ""]
    ]],
    ["Wide stores", [
      ["shortBlurb", "Short blurb", "text", 0, "For stores and promo sites that want something short."],
      ["bisac", "BISAC codes", "list", 3, "e.g. FIC009000 Fiction / Fantasy / General"],
      ["wideKeywords", "Keywords (comma separated)", "line", 0, ""]
    ]],
    ["Launch", [
      ["release", "Release date", "date", 0, ""],
      ["route", "Kindle Unlimited or wide", "select", ["", "Kindle Unlimited (KDP Select)", "Wide"], ""],
      ["ebookPrice", "Ebook price", "line", 0, "On Amazon.com, $2.99 to $12.99 can take the 70% royalty."],
      ["printPrice", "Paperback price", "line", 0, ""],
      ["isbn", "ISBN (wide / print)", "line", 0, "Amazon ebooks don't need one."],
      ["ai", "AI disclosure (KDP's question)", "select", ["", "None: no AI-generated content", "AI-generated text, images or translation: disclose", "AI-assisted only (editing, brainstorming): no disclosure needed"], "Check KDP's current wording when you upload."]
    ]],
    ["Audiobook", [
      ["audioDesc", "Retail description", "text", 0, ""],
      ["sample", "Retail sample (5 minutes)", "line", 0, "Chapter and the first line it starts on."]
    ]],
    ["Marketing", [
      ["tagline", "Tagline", "line", 0, ""],
      ["hooks", "One-line hooks", "list", 5, ""],
      ["ads", "Ad copy", "list", 3, "Three variants."],
      ["newsletter", "Newsletter announcement", "text", 0, ""],
      ["social", "Social posts", "text", 0, ""]
    ]],
    ["Cover", [
      ["coverA", "Cover prompt A", "text", 0, ""],
      ["coverB", "Cover prompt B", "text", 0, "Different composition and style family from A."]
    ]]
  ];
  const FIELDS = GROUPS.flatMap(([, fs]) => fs);
  const ALIASES = { title: ["full title", "searchable title", "book title"], blurb: ["long blurb", "description", "book description", "amazon description"], keywords: ["keyword slots", "kdp keywords", "amazon keywords", "backend keywords"], categories: ["category picks", "amazon categories", "kdp categories"], aplus: ["a+ content", "a+ content copy", "a plus"], heat: ["heat and content note", "content note", "heat level"], shortBlurb: ["short blurb", "short description"], bisac: ["bisac", "bisac codes"], wideKeywords: ["wide keywords", "reformatted keywords", "keywords for wide"], audioDesc: ["audiobook description", "retail description", "audio description"], sample: ["retail sample", "audiobook sample", "5-minute sample", "sample"], tagline: ["tagline"], hooks: ["hooks", "one-line hooks", "5 one-line hooks"], ads: ["ad copy", "ad copy variants", "ads"], coverA: ["cover prompt a", "option a", "cover a"], coverB: ["cover prompt b", "option b", "cover b"], seriesDesc: ["series description"], subtitle: ["subtitle"], newsletter: ["newsletter", "newsletter announcement"], social: ["social posts", "social"] };

  const norm = s => s.toLowerCase().replace(/[*_`#:]/g, "").replace(/\s+/g, " ").trim();
  function keyFor(heading) {
    const h = norm(heading).replace(/^\d+[.)]\s*/, "").replace(/\s*\(.*\)$/, "");
    for (const f of FIELDS) { const names = [f[1].toLowerCase(), ...(ALIASES[f[0]] || [])]; if (names.some(n => h === n || h.startsWith(n + " ") || h.endsWith(" " + n))) return f[0]; }
    for (const f of FIELDS) { const names = [f[1].toLowerCase(), ...(ALIASES[f[0]] || [])]; if (names.some(n => n.length > 4 && h.includes(n))) return f[0]; }
    return null;
  }
  // Claude's Markdown → { key: value }; headings at any level, list items become list entries
  function parse(md) {
    const out = {}, parts = String(md || "").replace(/\r\n?/g, "\n").split(/^#{1,4}\s+(.+)$/m);
    for (let i = 1; i < parts.length; i += 2) {
      const k = keyFor(parts[i]); if (!k) continue;
      const f = FIELDS.find(x => x[0] === k), body = parts[i + 1].trim();
      if (!body) continue;
      if (f[2] === "list") out[k] = body.split("\n").map(l => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").replace(/^["“](.*)["”]$/, "$1").trim()).filter(Boolean).slice(0, f[3]);
      else if (f[2] === "line") out[k] = body.split("\n").map(l => l.replace(/^\s*(?:[-*+])\s+/, "").trim()).filter(Boolean).join(" ");
      else out[k] = body;
    }
    return out;
  }
  function prompt(book) {
    const n = parseInt(book.seriesNo, 10) || 1;
    return `series-forge stage 18: ${book.series || book.title} Book ${n}. Publishing kit; search the current KDP and Draft2Digital limits first. Give me the kit as Markdown with these exact headings, so it pastes straight into my Writing Desk:\n\n` +
      FIELDS.filter(f => !["release", "route", "ebookPrice", "printPrice", "isbn", "ai"].includes(f[0])).map(f => `## ${f[1]}${f[2] === "list" ? ` (${f[3]} lines, one per line)` : ""}`).join("\n");
  }
  function toMarkdown(book) {
    const K = book.kit || {}, L = [`# ${book.title}: publishing kit`, ""];
    for (const [g, fs] of GROUPS) {
      const filled = fs.filter(f => (Array.isArray(K[f[0]]) ? K[f[0]].some(Boolean) : K[f[0]]));
      if (!filled.length) continue;
      L.push(`## ${g}`, "");
      for (const f of filled) { const v = K[f[0]]; L.push(`### ${f[1]}`, "", Array.isArray(v) ? v.filter(Boolean).map(x => `- ${x}`).join("\n") : v, ""); }
    }
    if ((book.arcs || []).length) { L.push("## ARC readers", "", ...book.arcs.map(a => `- ${a.name}${a.sent ? ", sent " + a.sent : ""}${a.reviewed ? ", reviewed" : ""}${a.note ? ": " + a.note : ""}`), ""); }
    return L.join("\n");
  }
  window.Kit = { GROUPS, FIELDS, parse, prompt, toMarkdown };
})();
