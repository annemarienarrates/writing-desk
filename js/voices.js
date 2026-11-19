/* The Writing Desk — voices: who speaks each line, for narration in the Lamp Room.
   No AI: dialogue tags ("Mara said"), pronoun tags matched to the last man or woman on stage, action beats in the
   same paragraph, and back-and-forth all make a guess; you fix the ones it isn't sure of. Then:
   - a manuscript .docx highlighted the way the Lamp Room reads parts (duet: blue / pink / yellow; full cast: a colour each),
   - character scripts (.docx per voice) in the Lamp Room's cue-script layout,
   - or a new audio project written straight into the Lamp Room library, parts and cues included. */
(function () {
  "use strict";
  const DUET = { m: "BDD7EE", f: "F8CBDE", s: "FFF59D" };
  const FULL = ["AEC6E8", "F4B6C2", "C6E0B4", "FFE699", "D9C3E9", "F8CBAD", "B4E5E1", "E2EFDA", "FCE4D6", "C9C9F2", "F2D0A9", "BDD7EE", "EAD1DC", "D0E0C0", "F5D5E5", "C8E6F5"];
  const SCENE_MARK = "⁂";
  const SAY = "said|says|asked|asks|replied|answered|whispered|murmured|muttered|hissed|growled|snapped|barked|breathed|purred|drawled|exclaimed|shouted|yelled|called|cried|demanded|insisted|added|continued|admitted|offered|teased|warned|agreed|protested|pleaded|begged|groaned|moaned|gasped|sneered|scoffed|snarled|grumbled|rasped|croaked|whimpered|sobbed|laughed|chuckled|giggled|snorted|sighed|told|repeated|announced|admitted|mumbled|grunted|roared|screamed|ordered|corrected|explained|interrupted|whined|spat|managed";
  const TONE = { whispered: "whispering", murmured: "murmuring", muttered: "muttering", hissed: "hissing", growled: "growling", snapped: "snapping", barked: "barking", breathed: "breathy", purred: "purring", drawled: "drawling", exclaimed: "excited", shouted: "shouting", yelled: "yelling", called: "calling out", cried: "crying out", demanded: "demanding", teased: "teasing", warned: "warning", pleaded: "pleading", begged: "begging", groaned: "groaning", moaned: "moaning", gasped: "gasping", sneered: "sneering", scoffed: "scoffing", snarled: "snarling", grumbled: "grumbling", rasped: "rasping", croaked: "croaking", whimpered: "whimpering", sobbed: "sobbing", laughed: "laughing", chuckled: "chuckling", giggled: "giggling", snorted: "snorting", sighed: "sighing", mumbled: "mumbling", grunted: "grunting", roared: "roaring", screamed: "screaming", ordered: "commanding", whined: "whining", spat: "spitting it out" };
  const QUOTE = /“[^”]*”|"[^"\n]*"/g;
  const clean = md => String(md || "").replace(/\\\*/g, "\u0002").replace(/\*+/g, "").replace(/\u0002/g, "*").replace(/\\\\/g, "\\");
  const paras = md => String(md || "").replace(/\r\n?/g, "\n").split(/\n[ \t]*\n+/).map(p => p.trim()).filter(Boolean);
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const BREAK = /^\s*(?:[*#~•·⁂◆◇❖✦✧=_-]\s*){3,7}\s*$/;
  const isSystem = p => /^\s*\[[^\]]+\]\s*$/.test(p) && !/^\s*\[xx\b/i.test(p);
  const keyOf = (sceneId, text, occ) => sceneId + "|" + text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 60) + "|" + occ;

  // cast: [{ name, aliases, kind, voice: "m" | "f" | "s" | "n" }]; scenes: [{ id, ch, chId, title, md }]
  // → lines: [{ key, sceneId, ch, p (paragraph index), q (quote index), text, guess, how, sure, tone }]
  function analyse(cast, scenes, pov) {
    const people = cast.filter(c => c.kind === "person");
    const nameRe = people.length ? new RegExp("(?<![\\p{L}])(" + people.flatMap(c => [c.name, ...(c.aliases || [])]).filter(Boolean).sort((a, b) => b.length - a.length).map(esc).join("|") + ")(?![\\p{L}])", "gu") : null;
    const who = n => people.find(c => c.name === n || (c.aliases || []).includes(n));
    const lines = [];
    for (const sc of scenes) {
      let recent = [], lastSpk = [], prevDialogue = false;   // recent: names on stage, newest first; lastSpk: speakers of the last dialogue paragraphs
      const occ = {};
      paras(sc.md).forEach((raw, pi) => {
        if (BREAK.test(raw)) { recent = []; lastSpk = []; return; }
        const p = clean(raw);
        if (isSystem(p)) { const k = keyOf(sc.id, p, occ[p] = (occ[p] || 0) + 1); lines.push({ key: k, sceneId: sc.id, ch: sc.ch, chId: sc.chId, p: pi, q: -1, text: p.trim(), guess: "System", how: "a bracketed system line", sure: true, tone: "", system: true }); prevDialogue = false; return; }
        const quotes = [...p.matchAll(QUOTE)];
        const outside = p.replace(QUOTE, m => " ".repeat(m.length));
        const mentioned = nameRe ? [...outside.matchAll(nameRe)].map(m => who(m[1])).filter(Boolean) : [];
        if (!quotes.length) { for (const c of mentioned.reverse()) { recent = [c.name, ...recent.filter(x => x !== c.name)]; } prevDialogue = false; return; }
        let paraSpeaker = null, paraHow = "", paraSure = false, paraTone = "";
        // a tag or a beat anywhere in the paragraph speaks for every quote in it
        const tagRes = [
          new RegExp(`[”"],?\\s+(?:(${SAY})\\s+)?([\\p{Lu}][\\p{L}'’-]+(?:\\s+[\\p{Lu}][\\p{L}'’-]+)?)\\s+(${SAY})\\b`, "u"),
          new RegExp(`[”"],?\\s+(${SAY})\\s+([\\p{Lu}][\\p{L}'’-]+(?:\\s+[\\p{Lu}][\\p{L}'’-]+)?)\\b`, "u"),
          new RegExp(`([\\p{Lu}][\\p{L}'’-]+(?:\\s+[\\p{Lu}][\\p{L}'’-]+)?)\\s+(${SAY})(?:\\s+\\w+ly)?\\s*[,:]?\\s*[“"]`, "u")
        ];
        for (const re of tagRes) {
          const m = p.match(re); if (!m) continue;
          const nm = re === tagRes[1] ? m[2] : m[re === tagRes[0] ? 2 : 1], verb = (re === tagRes[0] ? m[3] : m[re === tagRes[1] ? 1 : 2]).toLowerCase();
          const c = who(nm); if (c) { paraSpeaker = c.name; paraHow = `tag: “${nm} ${verb}”`; paraSure = true; paraTone = TONE[verb] || ""; break; }
        }
        if (!paraSpeaker) {
          const pm = p.match(new RegExp(`[”"],?\\s+(he|she|I)\\s+(${SAY})\\b`, "i")) || p.match(new RegExp(`\\b(he|she|I)\\s+(${SAY})(?:\\s+\\w+ly)?\\s*[,:]?\\s*[“"]`, "i"));
          if (pm) {
            const pro = pm[1].toLowerCase(), verb = pm[2].toLowerCase(); paraTone = TONE[verb] || "";
            if (pro === "i" && pov) { paraSpeaker = pov; paraHow = "“I said”: the POV character"; paraSure = true; }
            else if (pro !== "i") { const g = pro === "he" ? "m" : "f"; const c = recent.map(who).find(x => x && x.voice === g); if (c) { paraSpeaker = c.name; paraHow = `“${pro} ${verb}”: the last ${g === "m" ? "man" : "woman"} named`; paraSure = false; } }
          }
        }
        if (!paraSpeaker && mentioned.length) { paraSpeaker = mentioned[0].name; paraHow = `action beat: ${mentioned[0].name} is in the paragraph`; paraSure = mentioned.every(c => c.name === mentioned[0].name); }
        if (!paraSpeaker && prevDialogue && lastSpk.length >= 2 && lastSpk[0] !== lastSpk[1]) { paraSpeaker = lastSpk[1]; paraHow = "back-and-forth: the one before last"; paraSure = false; }
        else if (!paraSpeaker && prevDialogue && lastSpk.length === 1 && recent.length >= 2) { const other = recent.find(x => x !== lastSpk[0]); if (other) { paraSpeaker = other; paraHow = "back-and-forth: the other person here"; paraSure = false; } }
        quotes.forEach((m, qi) => {
          const text = m[0], k = keyOf(sc.id, text, occ[text] = (occ[text] || 0) + 1);
          lines.push({ key: k, sceneId: sc.id, ch: sc.ch, chId: sc.chId, p: pi, q: qi, text, guess: paraSpeaker || "", how: paraHow || "no clue in the text", sure: !!paraSpeaker && paraSure, tone: paraTone });
        });
        for (const c of mentioned.reverse()) recent = [c.name, ...recent.filter(x => x !== c.name)];
        if (paraSpeaker) { recent = [paraSpeaker, ...recent.filter(x => x !== paraSpeaker)]; lastSpk = [paraSpeaker, ...lastSpk].slice(0, 3); }
        prevDialogue = true;
      });
    }
    return lines;
  }

  // the final speaker of each line: your choice if you made one, else the guess
  const speakerOf = (book, l) => { const v = ((book.voices || {}).lines || {})[l.key]; return v === "-" ? "" : v || l.guess || ""; };
  const toneOf = (book, l) => { const t = ((book.voices || {}).tones || {})[l.key]; return t != null ? t : l.tone; };
  // the part a speaker's lines go to in the Lamp Room
  function partOf(book, speaker) {
    const V = book.voices || {};
    if (!speaker) return "n";
    if (speaker === "System") return V.mode === "full" ? "c:" + (V.colors || {}).System : "s";
    const c = (book.cast || []).find(x => x.name === speaker); if (!c) return "n";
    if (c.voice === "n" || !c.voice) return "n";
    if (V.mode === "full") return "c:" + ((V.colors || {})[c.name] || "");
    return c.voice;
  }
  // every voice that has lines, with its colour
  function voicesUsed(book, lines) {
    const V = book.voices = book.voices || {}; V.colors = V.colors || {};
    const used = {};
    for (const l of lines) { const s = speakerOf(book, l), part = partOf(book, s); if (part === "n") continue; (used[part] = used[part] || { part, speakers: new Set(), n: 0 }).n++; used[part].speakers.add(s); }
    return Object.values(used).map(u => ({ ...u, speakers: [...u.speakers], color: u.part.startsWith("c:") ? u.part.slice(2) : DUET[u.part], label: u.part === "m" ? "Male lines" : u.part === "f" ? "Female lines" : u.part === "s" ? "System voice" : u.speakers.join(", ") }));
  }
  function ensureColors(book) {
    const V = book.voices = book.voices || {}; V.colors = V.colors || {};
    const names = (book.cast || []).filter(c => c.kind === "person" && c.voice && c.voice !== "n").map(c => c.name).concat(["System"]);
    let i = 0; for (const n of names) if (!V.colors[n]) { while (Object.values(V.colors).includes(FULL[i % FULL.length]) && i < FULL.length * 2) i++; V.colors[n] = FULL[i++ % FULL.length]; }
  }

  // a paragraph → runs [[text, part]] using the lines found in it
  function paraRuns(book, sceneId, pi, rawMd, byPara) {
    const p = clean(rawMd), mine = byPara[sceneId + ":" + pi] || [];
    if (!mine.length) return [[p, "n"]];
    if (mine[0].q === -1) return [[p, partOf(book, speakerOf(book, mine[0]))]];
    const runs = []; let at = 0, qi = 0;
    for (const m of p.matchAll(QUOTE)) {
      const qn = qi++, l = mine.find(x => x.q === qn), part = l ? partOf(book, speakerOf(book, l)) : "n";
      if (m.index > at) runs.push([p.slice(at, m.index), "n"]);
      runs.push([m[0], part]); at = m.index + m[0].length;
    }
    if (at < p.length) runs.push([p.slice(at), "n"]);
    const merged = []; for (const r of runs) { const l = merged[merged.length - 1]; if (l && l[1] === r[1]) l[0] += r[0]; else merged.push([...r]); }
    return merged;
  }
  // the book in the Lamp Room's shape: chapters of paragraphs (plain strings, or { r: runs }), scene breaks as ⁂
  async function lampChapters(book, lines) {
    const byPara = {}; for (const l of lines) (byPara[l.sceneId + ":" + l.p] = byPara[l.sceneId + ":" + l.p] || []).push(l);
    const out = [];
    for (const c of book.chapters) {
      if (c.skip) continue;
      const P = [c.title];
      for (const [si, s] of c.scenes.entries()) {
        const md = (await Store.readScene(book, c, s)).text, ps = paras(md).filter(x => !(/^\s*\[xx\b[^\]]*\]\s*$/i.test(x)));
        if (si && ps.length && P[P.length - 1] !== SCENE_MARK) P.push(SCENE_MARK);
        paras(md).forEach((raw, pi) => {
          if (/^\s*\[xx\b[^\]]*\]\s*$/i.test(raw)) return;
          if (BREAK.test(raw)) { if (P[P.length - 1] !== SCENE_MARK) P.push(SCENE_MARK); return; }
          const runs = paraRuns(book, s.id, pi, raw, byPara);
          P.push(runs.length === 1 && runs[0][1] === "n" ? runs[0][0] : { r: runs });
        });
      }
      const words = P.filter(x => x !== SCENE_MARK).map(x => typeof x === "string" ? x : x.r.map(r => r[0]).join("")).join(" ").match(/\S+/g);
      out.push({ title: c.title, paras: P, words: words ? words.length : 0 });
    }
    return out;
  }

  // ---------- Word files ----------
  const W = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const run = (t, fill, b) => `<w:r>${fill || b ? `<w:rPr>${b ? "<w:b/>" : ""}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ""}</w:rPr>` : ""}<w:t xml:space="preserve">${W(t)}</w:t></w:r>`;
  const para = (inner, style, center) => `<w:p>${style || center ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${center ? `<w:jc w:val="center"/>` : ""}</w:pPr>` : ""}${inner}</w:p>`;
  async function wordFile(title, author, body) {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
    zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="24"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="480" w:after="240"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style></w:styles>`);
    zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`);
    return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", compression: "DEFLATE" });
  }
  // the manuscript, highlighted by voice (the Lamp Room's import and "Update manuscript" read this)
  async function highlightedDocx(book, chapters, voices) {
    const colorOf = part => part === "n" ? null : part.startsWith("c:") ? part.slice(2) : DUET[part];
    let body = para(run(book.title, null, true), "Title");
    // the key is plain text: a highlighted sample here would be read as part of the book
    if (voices.length) body += para(run("Highlight key: " + voices.map(v => `${v.label} = ${v.part.length === 1 ? { m: "blue", f: "pink", s: "yellow" }[v.part] : "#" + v.color}`).join(" · ")));
    for (const c of chapters) {
      c.paras.forEach((p, i) => {
        if (i === 0) { body += para(run(p), "Heading1"); return; }
        if (p === SCENE_MARK) { body += para(run("* * *"), null, true); return; }
        body += para(typeof p === "string" ? run(p) : p.r.map(([t, part]) => run(t, colorOf(part))).join(""));
      });
    }
    return wordFile(book.title, book.penName, body);
  }
  // one script per voice: chapter heading, then the cue (the line before, from someone else), NAME, (tone), the line
  function scripts(book, lines, voices) {
    const ordered = lines.slice();
    return voices.map(v => {
      const out = []; let curCh = null, n = 0;
      ordered.forEach((l, i) => {
        const s = speakerOf(book, l); if (!v.speakers.includes(s)) return;
        if (l.ch !== curCh) { out.push({ head: l.ch }); curCh = l.ch; }
        const prev = ordered.slice(0, i).reverse().find(x => x.ch === l.ch && speakerOf(book, x) && speakerOf(book, x) !== s);
        const prevIsJustBefore = prev && ordered.indexOf(prev) === i - 1;
        const bare = x => x.system ? x.text.replace(/^\s*\[|\]\s*$/g, "") : x.text.replace(/^[“"]|[”"]$/g, "");   // the Lamp Room drops [bracketed] lines from scripts
        out.push({ who: s, tone: toneOf(book, l), text: bare(l), prev: prevIsJustBefore ? { who: speakerOf(book, prev), text: bare(prev) } : null, ch: l.ch });
        n++;
      });
      return { voice: v, title: v.part.length === 1 ? v.label : v.speakers[0], items: out, n };
    }).filter(s => s.n);
  }
  async function scriptDocx(book, sc, readerName) {
    let body = para(run(`${book.title}`, null, true), "Title") + para(run(`Actor script — ${sc.title}`), null, true) + (readerName ? para(run(`Performed by ${readerName}`), null, true) : "");
    for (const it of sc.items) {
      if (it.head) { body += para(run(it.head), "Heading1"); continue; }
      if (it.prev) body += para(run(`${it.prev.who.toUpperCase()}: ${it.prev.text}`));
      body += para(run(it.who.toUpperCase(), null, true));
      if (it.tone) body += para(run(`(${it.tone})`));
      body += para(run(it.text));
    }
    body += para(run("CREDITS", null, true)) + [...new Set(sc.items.filter(x => x.who).map(x => x.who))].map(w => para(run(`${w}: ${readerName || "____________"}`))).join("");
    return wordFile(book.title, book.penName, body);
  }
  // the same scripts as the Lamp Room keeps them once read (book.cues.scripts)
  function lampCues(book, scs, readerOf) {
    const tidy = s => s.toLowerCase().replace(/(^|[\s\-'’])\S/g, x => x.toUpperCase());
    return scs.map(sc => ({ id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4), char: tidy(sc.title), file: "From the Writing Desk", added: new Date().toISOString(), mine: false,
      lines: sc.items.filter(x => !x.head).map(x => ({ ch: x.ch, who: x.who.toUpperCase(), tone: x.tone || "", fx: "", text: x.text, prev: x.prev ? { who: x.prev.who.toUpperCase(), text: x.prev.text } : null, whoName: tidy(x.who) })) }));
  }

  window.Voices = { analyse, speakerOf, toneOf, partOf, voicesUsed, ensureColors, lampChapters, highlightedDocx, scripts, scriptDocx, lampCues, DUET, SCENE_MARK };
})();
