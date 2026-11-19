/* The Writing Desk — bringing books in. Reads a Word .docx (headings, italics, bold, scene breaks) and turns it
   into chapters and scenes; turns a codex or bible .docx into a readable Markdown copy for the reference shelf. */
(function () {
  "use strict";
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const kids = (el, name) => [...el.childNodes].filter(n => n.nodeType === 1 && n.localName === name && n.namespaceURI === W);
  const kid = (el, name) => kids(el, name)[0] || null;
  const attr = (el, name) => el ? (el.getAttributeNS(W, name) || el.getAttribute("w:" + name)) : null;
  const on = el => { if (!el) return false; const v = attr(el, "val"); return v == null || !/^(0|false|off|none)$/i.test(v); };

  const SCENE_BREAK = /^\s*(?:[*#~•·⁂◆◇❖✦✧=_-]\s*){1,7}\s*$/;
  const CHAPTER_LINE = /^\s*(chapter|prologue|epilogue|interlude|part|book)\b[\s\w:.'’,—–-]{0,70}$/i;
  const esc = s => s.replace(/\\/g, "\\\\").replace(/\*/g, "\\*");

  // → [{ text, md, level (0 = body, 1–3 heading), list }]
  async function readBlocks(arrayBuffer) {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docFile = zip.file("word/document.xml");
    if (!docFile) throw new Error("That doesn't look like a Word .docx file.");
    const styles = {};
    const sf = zip.file("word/styles.xml");
    if (sf) {
      const sd = new DOMParser().parseFromString(await sf.async("string"), "application/xml");
      for (const st of sd.getElementsByTagNameNS(W, "style")) {
        const id = attr(st, "styleId"), nm = (attr(kid(st, "name"), "val") || id || "").toLowerCase();
        const rpr = kid(st, "rPr"), ppr = kid(st, "pPr");
        const ol = ppr && kid(ppr, "outlineLvl");
        styles[id] = { name: nm, i: rpr && on(kid(rpr, "i")), b: rpr && on(kid(rpr, "b")), outline: ol ? +attr(ol, "val") : null };
      }
    }
    const doc = new DOMParser().parseFromString(await docFile.async("string"), "application/xml");
    const body = doc.getElementsByTagNameNS(W, "body")[0];
    const blocks = [];
    const walk = el => {
      for (const n of el.childNodes) {
        if (n.nodeType !== 1) continue;
        if (n.localName === "p") blocks.push(readPara(n, styles));
        else if (["tbl", "tr", "tc", "sdt", "sdtContent", "customXml"].includes(n.localName)) walk(n);
      }
    };
    walk(body);
    return blocks;
  }

  function readPara(p, styles) {
    const ppr = kid(p, "pPr");
    const sid = attr(kid(ppr || p, "pStyle"), "val");
    const st = styles[sid] || { name: (sid || "").toLowerCase() };
    let level = 0;
    const m = st.name.match(/^heading ?([1-6])$/);
    if (st.name === "title") level = 1; else if (m) level = +m[1]; else if (st.outline != null && st.outline < 6) level = st.outline + 1;
    const ol = ppr && kid(ppr, "outlineLvl"); if (ol && +attr(ol, "val") < 6) level = +attr(ol, "val") + 1;
    const list = !!(ppr && kid(ppr, "numPr")) || /list/.test(st.name);
    const runs = [];
    const walk = el => {
      for (const n of el.childNodes) {
        if (n.nodeType !== 1) continue;
        if (n.localName === "r") readRun(n);
        else if (["del", "moveFrom", "pPr", "rPr"].includes(n.localName)) continue;
        else walk(n);
      }
    };
    const readRun = r => {
      const rpr = kid(r, "rPr"), rs = rpr && styles[attr(kid(rpr, "rStyle"), "val")];
      const i = rpr && kid(rpr, "i") ? on(kid(rpr, "i")) : !!((rs && rs.i) || st.i);
      const b = rpr && kid(rpr, "b") ? on(kid(rpr, "b")) : !!((rs && rs.b) || st.b);
      let text = "";
      for (const n of r.childNodes) {
        if (n.nodeType !== 1) continue;
        if (n.localName === "t") text += n.textContent;
        else if (n.localName === "tab") text += " ";
        else if (n.localName === "br" || n.localName === "cr") text += attr(n, "type") === "page" ? "" : "\n";
        else if (n.localName === "noBreakHyphen") text += "-";
      }
      if (text) runs.push({ text, i, b });
    };
    walk(p);
    // join runs into Markdown, merging neighbours with the same style so we don't get **a****b**
    const merged = [];
    for (const r of runs) { const l = merged[merged.length - 1]; if (l && l.i === r.i && l.b === r.b) l.text += r.text; else merged.push({ ...r }); }
    const text = merged.map(r => r.text).join("");
    const md = merged.map(r => {
      const t = esc(r.text); if (!t.trim() || level) return t;
      const lead = t.match(/^\s*/)[0], trail = t.match(/\s*$/)[0], core = t.trim();
      const mark = r.b && r.i ? "***" : r.b ? "**" : r.i ? "*" : "";
      return lead + mark + core + mark + trail;
    }).join("");
    return { text: text.trim(), md: md.trim(), level, list };
  }

  // blocks → [{ title, scenes: [{ title, text }], words, front }]
  function splitManuscript(blocks) {
    const useHeadings = blocks.some(b => b.level && b.text);
    const isChapter = b => b.text && (useHeadings ? b.level >= 1 && b.level <= 2 : CHAPTER_LINE.test(b.text) && b.text.length < 80);
    const chapters = [];
    let ch = null, scene = null;
    const newScene = () => { scene = { title: `Scene ${ch.scenes.length + 1}`, paras: [] }; ch.scenes.push(scene); };
    const newChapter = (title, front) => { ch = { title, scenes: [], front: !!front }; chapters.push(ch); newScene(); };
    for (const b of blocks) {
      if (isChapter(b)) { newChapter(b.text.replace(/\s+/g, " ")); continue; }
      if (!b.text) continue;
      if (!ch) newChapter("Front matter", true);
      if (SCENE_BREAK.test(b.text)) { if (scene.paras.length) newScene(); continue; }
      if (b.level) { scene.paras.push("**" + esc(b.text) + "**"); continue; }  // a sub-heading inside a chapter stays as bold text
      scene.paras.push(b.md);
    }
    for (const c of chapters) {
      c.scenes = c.scenes.filter(s => s.paras.length);
      if (!c.scenes.length) c.scenes = [{ title: "Scene 1", paras: [] }];
      c.scenes.forEach((s, i) => { s.title = `Scene ${i + 1}`; s.text = s.paras.join("\n\n") + "\n"; delete s.paras; });
      c.words = c.scenes.reduce((a, s) => a + Store.words(s.text), 0);
    }
    return chapters;
  }

  // a codex / bible document → readable Markdown
  function blocksToMarkdown(blocks) {
    let out = "", prevList = false;
    for (const b of blocks) {
      if (!b.text) continue;
      const line = b.level ? "#".repeat(Math.min(b.level, 4)) + " " + b.text : b.list ? "- " + b.md : b.md;
      out += (out ? (b.list && prevList ? "\n" : "\n\n") : "") + line;
      prevList = !!b.list && !b.level;
    }
    return out + "\n";
  }

  // plain text or Markdown manuscripts too: "# Chapter" lines or "Chapter 1" lines start chapters
  function blocksFromText(text) {
    return String(text || "").replace(/\r\n?/g, "\n").split(/\n[ \t]*\n+/).map(p => {
      const t = p.trim(), h = t.match(/^(#{1,6})\s+(.*)$/);
      return h ? { text: h[2], md: h[2], level: h[1].length } : { text: t.replace(/[*_]/g, ""), md: t.replace(/\s*\n\s*/g, " "), level: 0 };
    });
  }

  window.Import = { readBlocks, splitManuscript, blocksToMarkdown, blocksFromText, SCENE_BREAK };
})();
