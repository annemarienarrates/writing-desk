/* The Writing Desk — Book Build: front and back matter, then the files.
   EPUB in two looks (Steel: clean; Filigree: decorative) for KDP and the wide stores, and a plain Word .docx for
   Draft2Digital's own formatter. Fonts are left to the reader's device (no font files are embedded). */
(function () {
  "use strict";
  const X = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const LOVE = /\[xx\b[^\]]*\]/i;
  const BREAK = /^\s*(?:[*#~•·⁂◆◇❖✦✧=_-]\s*){3,7}\s*$/;

  // Markdown runs → [{ t, b, i }]
  function runs(md) {
    const out = []; let b = false, i = false, buf = "";
    const push = () => { if (buf) out.push({ t: buf, b, i }); buf = ""; };
    for (let k = 0; k < md.length; k++) {
      const c = md[k];
      if (c === "\\" && k + 1 < md.length) { buf += md[++k]; continue; }
      if (c === "*") {
        let n = 1; while (md[k + n] === "*") n++;
        push(); if (n >= 3) { b = !b; i = !i; } else if (n === 2) b = !b; else i = !i;
        k += n - 1; continue;
      }
      buf += c;
    }
    push();
    return out;
  }
  const inlineX = md => runs(md).map(r => { let t = X(r.t).replace(/\n/g, "<br/>"); if (r.i) t = `<em>${t}</em>`; if (r.b) t = `<strong>${t}</strong>`; return t; }).join("");
  const paras = md => String(md || "").replace(/\r\n?/g, "\n").split(/\n[ \t]*\n+/).map(p => p.trim()).filter(Boolean);

  // ---------- the pieces of the book, in order ----------
  const MATTER = [
    { key: "title", side: "front", label: "Title page", auto: true },
    { key: "copyright", head: "Copyright", side: "front", label: "Copyright page", auto: true },
    { key: "content", head: "A Note Before You Begin", side: "front", label: "Content note", text: true, hint: "One short paragraph in the author's voice: 18+, language, explicit scenes by chapter, the promise." },
    { key: "bonus", head: "A Free Book for You", side: "front", label: "Free bonus", auto: true, hint: "From the pen name's free-book offer (Settings › Pen names)." },
    { key: "review", head: "Thank You for Reading", side: "back", label: "Review ask", text: true, def: b => `If you enjoyed ${b.title}, a short review on the store where you bought it helps other readers find it. Thank you.` },
    { key: "teaser", head: "What's Next", side: "back", label: "Next book", text: true, hint: "The next-book teaser and where to get it." },
    { key: "freebies", head: "Stay in Touch", side: "back", label: "Free book and newsletter", auto: true, hint: "From the pen name's free-book offer and newsletter link." },
    { key: "links", head: "Find Me Online", side: "back", label: "Links and more", auto: true, hint: "From the pen name's website and links." },
    { key: "afterword", head: "Afterword", side: "back", label: "Afterword", text: true, hint: "Real talk, specific, a little rough: what finishing felt like, the hard part, a decision, what's next, thanks." },
    { key: "alsoby", side: "back", label: "Also by", auto: true, hint: "Every other book on the shelf under this pen name, by series." },
    { key: "about", head: "About the Author", side: "back", label: "About the author", auto: true, hint: "The pen name's bio." },
    { key: "thanks", head: "Acknowledgments", side: "back", label: "Acknowledgments", text: true }
  ];
  function profile(book) { return ((Store.settings.penProfiles || {})[book.penName]) || {}; }
  function matter(book) {
    book.matter = book.matter || {};
    for (const m of MATTER) {
      const cur = book.matter[m.key] = book.matter[m.key] || {};
      if (cur.on == null) cur.on = ["title", "copyright", "review", "alsoby", "about"].includes(m.key) || (m.key === "bonus" || m.key === "freebies") && !!profile(book).offer || m.key === "links" && !!(profile(book).website || profile(book).links);
      if (m.text && cur.text == null) cur.text = m.def ? m.def(book) : "";
    }
    book.matter.copyrightInfo = book.matter.copyrightInfo || { year: String(new Date().getFullYear()), holder: "", cover: "", edition: "First", isbn: "" };
    return book.matter;
  }
  // a piece of matter → paragraphs of Markdown ([] when there's nothing to say)
  function matterText(book, key) {
    const P = profile(book), M = matter(book), pen = book.penName || book.writer || "";
    const link = (label, url) => url ? `${label}: ${url}` : "";
    switch (key) {
      case "title": return [];
      case "copyright": {
        const c = M.copyrightInfo, holder = c.holder || pen;
        return [`Copyright © ${c.year || new Date().getFullYear()} ${holder}. All rights reserved.`,
          "This is a work of fiction. Names, characters, places and incidents are the product of the author's imagination or are used fictitiously. Any resemblance to actual persons, living or dead, events or locales is entirely coincidental.",
          "Brands, titles and other trademarks mentioned in this book are the property of their respective owners; no endorsement is implied.",
          "No part of this book may be reproduced in any form without written permission from the author, except for brief quotations in reviews.",
          [c.cover ? `Cover by ${c.cover}.` : "", c.edition ? `${c.edition} edition.` : "", c.isbn ? `ISBN ${c.isbn}` : ""].filter(Boolean).join(" ")].filter(Boolean);
      }
      case "bonus": return P.offer ? [`**${P.offerTitle || "A free book for you"}**`, P.offer, link("Get it here", P.newsletter || P.website)].filter(Boolean) : [];
      case "freebies": return P.offer || P.newsletter ? [P.offer || "Join the newsletter for new releases and the occasional free story.", link("Sign up", P.newsletter || P.website)].filter(Boolean) : [];
      case "links": return [link("Website", P.website), ...String(P.links || "").split("\n").map(l => l.split("|").map(x => x.trim())).filter(x => x[0]).map(([l, u]) => u ? `${l}: ${u}` : l)].filter(Boolean);
      case "alsoby": {
        const others = Store.books.filter(b => b !== book && b.penName && b.penName === book.penName);
        if (!others.length) return [];
        const by = {}; for (const b of others.concat([book])) (by[b.series || ""] = by[b.series || ""] || []).push(b);
        const out = [];
        for (const [s, bs] of Object.entries(by).sort((a, b) => !a[0] ? 1 : !b[0] ? -1 : a[0].localeCompare(b[0]))) {
          if (s) out.push(`**${s}**`);
          bs.sort((a, b) => (parseFloat(a.seriesNo) || 0) - (parseFloat(b.seriesNo) || 0)).forEach(b => out.push(`*${b.title}*${s && b.seriesNo ? ` (Book ${b.seriesNo})` : ""}`));
        }
        return out;
      }
      case "about": return P.bio ? paras(P.bio).concat(P.website ? [P.website] : []) : [];
      default: return paras((M[key] || {}).text || "");
    }
  }
  // the whole book as pieces: [{ id, kind: "front" | "chapter" | "back", title, label, sub, paras: [md], scenes: [[md]] }]
  async function pieces(book, opts) {
    opts = opts || {};
    const M = matter(book), out = [];
    for (const m of MATTER.filter(m => m.side === "front")) if (M[m.key].on) { const p = matterText(book, m.key); if (m.key === "title" || p.length) out.push({ id: m.key, kind: "front", title: m.key === "title" ? book.title : m.head || m.label, label: m.label, paras: p }); }
    let n = 0;
    for (const c of book.chapters) {
      if (c.skip) continue;
      const scenes = [];
      for (const s of c.scenes) { const t = (await Store.readScene(book, c, s)).text; const ps = paras(t).filter(p => !(opts.dropLove && LOVE.test(p) && p.replace(LOVE, "").trim() === "")); if (ps.length) scenes.push(ps); }
      const m = c.title.match(/^\s*((?:chapter|part|book)\s+[\w-]+|prologue|epilogue|interlude)\s*[:.\-–—]\s*(.+)$/i);
      out.push({ id: "c" + (++n), kind: "chapter", title: c.title, label: m ? m[1] : "", sub: m ? m[2] : c.title, scenes });
    }
    for (const m of MATTER.filter(m => m.side === "back")) if (M[m.key].on) { const p = matterText(book, m.key); if (p.length) out.push({ id: m.key, kind: "back", title: m.key === "alsoby" ? `Also by ${book.penName}` : m.head || m.label, label: m.label, paras: p }); }
    return out;
  }
  // problems worth knowing before building
  async function warnings(book) {
    const w = [];
    for (const c of book.chapters) for (const s of c.scenes) { if (s.love) w.push(`${c.title} › ${s.title} still has an [xx — scene] marker.`); if (!s.words) w.push(`${c.title} › ${s.title} is empty.`); }
    if (!book.cover) w.push("No cover yet (Book tab): the EPUB is built without one.");
    if (!book.penName) w.push("No pen name: the title page and copyright use the writer's name.");
    return w;
  }

  // ---------- the looks ----------
  const ORN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 24" width="240" height="24"><g fill="none" stroke="#5a4636" stroke-width="1.4" stroke-linecap="round"><path d="M4 12 H92"/><path d="M148 12 H236"/><path d="M92 12 C100 2 110 2 114 10 C116 14 112 18 108 15"/><path d="M148 12 C140 2 130 2 126 10 C124 14 128 18 132 15"/></g><path d="M120 5 L127 12 L120 19 L113 12 Z" fill="#5a4636"/></svg>`;
  const CSS = {
    steel: `body{margin:0 5%;font-family:serif;line-height:1.5;text-align:justify;}
p{margin:0;text-indent:1.4em;}
p.first,.scene>p:first-child,.matter p,hr.brk+p,p.brk+p{text-indent:0;}
h1{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-weight:700;text-align:center;margin:3em 0 2em;font-size:1.5em;letter-spacing:.04em;text-transform:uppercase;page-break-before:always;}
h1 .label{display:block;font-size:.55em;font-weight:400;letter-spacing:.35em;margin-bottom:.8em;color:#555;}
hr.brk{border:0;border-top:1px solid #888;width:20%;margin:1.6em auto;}
.matter{text-align:center;}
.matter p{margin:0 0 .9em;}
.title-page{text-align:center;margin-top:30%;}
.title-page .t{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:2.2em;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin:0 0 .4em;text-indent:0;}
.title-page .s,.title-page .a{text-indent:0;margin:.4em 0;letter-spacing:.2em;text-transform:uppercase;font-size:.9em;}
.copyright p{font-size:.8em;text-align:left;}
.cover{text-align:center;margin:0;padding:0;}
.cover img{max-width:100%;max-height:100%;}
nav ol{list-style:none;padding:0;margin:0;}nav li{margin:.5em 0;}nav a{text-decoration:none;color:inherit;}
.arc{margin-top:3em;font-size:.8em;text-indent:0;}.arcmark{text-align:center;text-indent:0;font-size:.7em;color:#888;margin-top:2em;}`,
    filigree: `body{margin:0 6%;font-family:Georgia,"Palatino Linotype",Palatino,serif;line-height:1.55;text-align:justify;}
p{margin:0;text-indent:1.5em;}
p.first,.scene>p:first-child,.matter p,hr.brk+p,p.brk+p{text-indent:0;}
h1{font-weight:400;font-style:italic;text-align:center;margin:2.6em 0 .6em;font-size:1.7em;page-break-before:always;}
h1 .label{display:block;font-style:normal;font-variant:small-caps;letter-spacing:.25em;font-size:.55em;margin-bottom:.6em;color:#5a4636;}
.orn{text-align:center;text-indent:0;margin:0 0 2em;}
.orn img{width:50%;max-width:12em;}
.drop{float:left;font-size:3.3em;line-height:.85;margin:.06em .08em 0 0;color:#5a4636;}
.lead{font-variant:small-caps;letter-spacing:.06em;}
p.brk{text-align:center;text-indent:0;margin:1.2em 0;color:#5a4636;letter-spacing:.4em;}
.matter{text-align:center;}
.matter p{margin:0 0 .9em;}
.title-page{text-align:center;margin-top:28%;}
.title-page .t{font-size:2.3em;font-style:italic;margin:0 0 .3em;text-indent:0;}
.title-page .s,.title-page .a{text-indent:0;margin:.4em 0;font-variant:small-caps;letter-spacing:.2em;}
.copyright p{font-size:.8em;text-align:left;}
.cover{text-align:center;margin:0;padding:0;}
.cover img{max-width:100%;max-height:100%;}
nav ol{list-style:none;padding:0;margin:0;}nav li{margin:.5em 0;font-style:italic;}nav a{text-decoration:none;color:inherit;}
.arc{margin-top:3em;font-size:.8em;text-indent:0;font-variant:normal;letter-spacing:0;}.arcmark{text-align:center;text-indent:0;font-size:.7em;color:#888;margin-top:2em;}`
  };
  // the opening of a chapter: Filigree gets a drop cap and small-caps lead-in
  function opener(md, look) {
    if (look !== "filigree") return `<p class="first">${inlineX(md)}</p>`;
    const r = runs(md); if (!r.length) return `<p class="first"></p>`;
    const t = r[0].t, m = t.match(/^(["“'‘]?\p{L})(\S*\s+\S+\s+\S+)?/u);
    if (!m) return `<p class="first">${inlineX(md)}</p>`;
    const rest = t.slice(m[1].length), lead = m[2] || "", after = rest.slice(lead.length);
    const wrap = (s, x) => (x.i ? `<em>${s}</em>` : s);
    let h = `<span class="drop">${X(m[1])}</span>` + (lead ? `<span class="lead">${wrap(X(lead), r[0])}</span>` : "") + wrap(X(after), r[0]);
    h += r.slice(1).map(x => { let s = X(x.t); if (x.i) s = `<em>${s}</em>`; if (x.b) s = `<strong>${s}</strong>`; return s; }).join("");
    return `<p class="first">${h}</p>`;
  }
  function body(p, book, look, arc) {
    const brk = look === "filigree" ? `<p class="brk">❦</p>` : `<hr class="brk"/>`;
    if (p.kind === "chapter") {
      const head = `<h1>${p.label ? `<span class="label">${X(p.label)}</span>` : ""}${X(p.sub)}</h1>${look === "filigree" ? `<p class="orn"><img src="orn.svg" alt=""/></p>` : ""}`;
      return `<section epub:type="chapter" role="doc-chapter">${head}${p.scenes.map((sc, i) => `<div class="scene">${sc.map((md, j) => BREAK.test(md) ? brk : i === 0 && j === 0 ? opener(md, look) : `<p>${inlineX(md)}</p>`).join("")}</div>`).join(brk)}${arc ? `<p class="arcmark">Advance reader copy for ${X(arc)}</p>` : ""}</section>`;
    }
    if (p.id === "title") return `<section epub:type="titlepage" class="title-page"><p class="t">${X(book.title)}</p>${book.series ? `<p class="s">${X(book.series)}${book.seriesNo ? `, Book ${X(book.seriesNo)}` : ""}</p>` : ""}<p class="a">${X(book.penName || book.writer || "")}</p>${arc ? `<p class="arc">Advance reader copy for <b>${X(arc)}</b>. Please don't share or upload it.</p>` : ""}</section>`;
    const type = { copyright: "copyright-page", about: "appendix", alsoby: "appendix" }[p.id] || (p.kind === "front" ? "preface" : "appendix");
    return `<section epub:type="${type}" class="matter ${p.id === "copyright" ? "copyright" : ""}">${p.id === "copyright" ? "" : `<h1>${X(p.title)}</h1>`}${p.paras.map(md => `<p>${inlineX(md)}</p>`).join("")}</section>`;
  }
  const page = (title, inner, extraNs) => `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en"${extraNs || ""}>\n<head><meta charset="utf-8"/><title>${X(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>\n<body>${inner}</body>\n</html>\n`;

  // ---------- EPUB 3 ----------
  // arc: a reader's name for a watermarked advance copy (its own identifier, the name on the title page and after every chapter)
  async function epub(book, look, arc) {
    const ps = await pieces(book, { dropLove: true }), zip = new JSZip(), id = "urn:uuid:" + (arc ? crypto.randomUUID() : (book.epubId || (book.epubId = crypto.randomUUID())));
    if (arc && !ps.some(p => p.id === "title")) ps.unshift({ id: "title", kind: "front", title: book.title, paras: [] });
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
    zip.file("META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n`);
    zip.file("OEBPS/style.css", CSS[look]);
    if (look === "filigree") zip.file("OEBPS/orn.svg", ORN);
    let coverBlob = null;
    if (book.cover) { try { coverBlob = await (await (await Store.bookDir(book)).getFileHandle(book.cover)).getFile(); } catch (e) { } }
    const items = [], spine = [];
    if (coverBlob) {
      const isPng = coverBlob.type === "image/png"; const cname = isPng ? "cover.png" : "cover.jpg";
      zip.file("OEBPS/" + cname, await coverBlob.arrayBuffer());
      items.push(`<item id="cover-img" href="${cname}" media-type="${isPng ? "image/png" : "image/jpeg"}" properties="cover-image"/>`);
      zip.file("OEBPS/cover.xhtml", page("Cover", `<section epub:type="cover" class="cover"><img src="${cname}" alt="${X(book.title)}"/></section>`));
      items.push(`<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`); spine.push(`<itemref idref="cover" linear="yes"/>`);
    }
    let navPlaced = false;
    for (const p of ps) {
      if (!navPlaced && p.kind !== "front") { spine.push(`<itemref idref="nav"/>`); navPlaced = true; }   // the contents page, after the front matter
      zip.file(`OEBPS/${p.id}.xhtml`, page(p.title, body(p, book, look, arc)));
      items.push(`<item id="${p.id}" href="${p.id}.xhtml" media-type="application/xhtml+xml"${look === "filigree" && p.kind === "chapter" ? "" : ""}/>`);
      spine.push(`<itemref idref="${p.id}"/>`);
    }
    if (!navPlaced) spine.push(`<itemref idref="nav"/>`);
    const tocEntries = ps.filter(p => p.id !== "title" && p.id !== "copyright");
    const firstCh = ps.find(p => p.kind === "chapter");
    zip.file("OEBPS/nav.xhtml", page("Contents", `<nav epub:type="toc" id="toc" role="doc-toc" class="matter"><h1>Contents</h1><ol>${tocEntries.map(p => `<li><a href="${p.id}.xhtml">${X(p.kind === "chapter" ? p.title : p.title)}</a></li>`).join("")}</ol></nav>
<nav epub:type="landmarks" hidden=""><ol>${coverBlob ? `<li><a epub:type="cover" href="cover.xhtml">Cover</a></li>` : ""}<li><a epub:type="toc" href="nav.xhtml">Contents</a></li>${firstCh ? `<li><a epub:type="bodymatter" href="${firstCh.id}.xhtml">Start</a></li>` : ""}</ol></nav>`));
    items.push(`<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`);
    zip.file("OEBPS/toc.ncx", `<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${id}"/></head><docTitle><text>${X(book.title)}</text></docTitle><navMap>${tocEntries.map((p, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${X(p.title)}</text></navLabel><content src="${p.id}.xhtml"/></navPoint>`).join("")}</navMap></ncx>\n`);
    items.push(`<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`, `<item id="css" href="style.css" media-type="text/css"/>`);
    if (look === "filigree") items.push(`<item id="orn" href="orn.svg" media-type="image/svg+xml"/>`);
    const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    zip.file("OEBPS/content.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${id}</dc:identifier>
<dc:title>${X(book.title)}${arc ? " (Advance Reader Copy)" : ""}</dc:title>
<dc:creator>${X(book.penName || book.writer || "")}</dc:creator>
<dc:language>en</dc:language>
<meta property="dcterms:modified">${modified}</meta>
${book.series ? `<meta property="belongs-to-collection" id="series">${X(book.series)}</meta><meta refines="#series" property="collection-type">series</meta>${book.seriesNo ? `<meta refines="#series" property="group-position">${X(book.seriesNo)}</meta>` : ""}` : ""}
${coverBlob ? `<meta name="cover" content="cover-img"/>` : ""}
</metadata>
<manifest>${items.join("\n")}</manifest>
<spine toc="ncx">${spine.join("")}</spine>
</package>
`);
    await Store.saveBook(book);   // keeps the book's EPUB identifier the same from one build to the next
    return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip", compression: "DEFLATE" });
  }

  // ---------- Word .docx for Draft2Digital ----------
  const W = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const wRuns = md => runs(md).map(r => r.t.split("\n").map((t, k) => `${k ? "<w:r><w:br/></w:r>" : ""}<w:r>${r.b || r.i ? `<w:rPr>${r.b ? "<w:b/>" : ""}${r.i ? "<w:i/>" : ""}</w:rPr>` : ""}<w:t xml:space="preserve">${W(t)}</w:t></w:r>`).join("")).join("");
  const wP = (md, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${wRuns(md)}</w:p>`;
  async function docx(book) {
    const ps = await pieces(book, { dropLove: true }), out = [];
    for (const p of ps) {
      if (p.id === "title") continue;   // D2D makes its own title page
      if (p.kind === "chapter") {
        out.push(wP(p.title.replace(/\*/g, "\\*"), "Heading1"));
        p.scenes.forEach((sc, i) => { if (i) out.push(wP("\\* \\* \\*", "SceneBreak")); sc.forEach((md, j) => out.push(BREAK.test(md) ? wP("\\* \\* \\*", "SceneBreak") : wP(md, i === 0 && j === 0 ? "FirstParagraph" : null))); });
      } else {
        out.push(wP(p.title, "Heading1"));
        p.paras.forEach(md => out.push(wP(md, "Matter")));
      }
    }
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
    zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
    zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${W(book.title)}</dc:title><dc:creator>${W(book.penName || book.writer || "")}</dc:creator></cp:coreProperties>`);
    zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="24"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:ind w:firstLine="432"/><w:jc w:val="both"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="FirstParagraph"><w:name w:val="First Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:firstLine="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Matter"><w:name w:val="Matter"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="160"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="SceneBreak"><w:name w:val="Scene Break"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="240"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="FirstParagraph"/><w:pPr><w:keepNext/><w:pageBreakBefore/><w:spacing w:before="1440" w:after="480"/><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
</w:styles>`);
    zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${out.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`);
    return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", compression: "DEFLATE" });
  }

  // ---------- a page of the book, for the preview ----------
  function previewHtml(p, book, look) {
    const css = CSS[look].replace(/page-break-before:always;/g, "") + "body{background:#fbf8f2;color:#222;font-size:17px;padding:28px 0 60px;max-width:560px;margin:0 auto;}";
    const inner = body(p, book, look).replace(/src="orn\.svg"/g, `src="data:image/svg+xml;utf8,${encodeURIComponent(ORN)}"`);
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${inner}</body></html>`;
  }

  window.Build = { MATTER, matter, matterText, profile, pieces, warnings, epub, docx, previewHtml, runs };
})();
