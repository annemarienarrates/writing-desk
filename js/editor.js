/* The Writing Desk — the writing surface. Scenes are Markdown on disk (*italic*, **bold**, a blank line between
   paragraphs); in the editor they're plain paragraphs you type into. These two functions go back and forth. */
(function () {
  "use strict";
  const html = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const BREAK = /^\s*(?:[*#~•·⁂◆◇❖✦✧=_-]\s*){3,7}\s*$/;

  function inline(md) {
    // protect escaped stars, then bold before italic
    let s = html(md).replace(/\\\\/g, "\u0001").replace(/\\\*/g, "\u0002");
    s = s.replace(/\*\*\*([^*\n]+?)\*\*\*/g, "<b><i>$1</i></b>")
         .replace(/\*\*([^*\n]+?)\*\*/g, "<b>$1</b>")
         .replace(/\*([^*\n]+?)\*/g, "<i>$1</i>")
         .replace(/\[xx\b([^\]]*)\]/gi, '<span class="love">[xx$1]</span>')
         .replace(/\n/g, "<br>");
    return s.replace(/\u0001/g, "\\").replace(/\u0002/g, "*");
  }
  function mdToHtml(md) {
    const paras = String(md || "").replace(/\r\n?/g, "\n").split(/\n[ \t]*\n+/).map(p => p.replace(/^\n+|\n+$/g, "")).filter(p => p.trim());
    if (!paras.length) return "<p><br></p>";
    return paras.map(p => BREAK.test(p) ? '<p class="brk">* * *</p>' : "<p>" + inline(p) + "</p>").join("");
  }

  const escMd = s => s.replace(/\\/g, "\\\\").replace(/\*/g, "\\*");
  function inlineMd(node, st) {
    let out = "";
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { out += escMd(n.nodeValue.replace(/ /g, " ")); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName;
      if (tag === "BR") { out += "\n"; continue; }
      if (n.classList && n.classList.contains("love") && /^\[xx\b[^\]]*\]$/i.test(n.textContent.trim())) { out += n.textContent.replace(/\u00a0/g, " "); continue; }
      const fw = n.style && n.style.fontWeight, fs = n.style && n.style.fontStyle;
      const b = !st.b && (tag === "B" || tag === "STRONG" || fw === "bold" || +fw >= 600);
      const i = !st.i && (tag === "I" || tag === "EM" || fs === "italic");
      let inner = inlineMd(n, { b: st.b || b, i: st.i || i });
      if ((b || i) && inner.trim()) {
        const lead = inner.match(/^\s*/)[0], trail = inner.match(/\s*$/)[0], core = inner.trim(), m = (b ? "**" : "") + (i ? "*" : "");
        inner = lead + m + core + [...m].reverse().join("") + trail;
      }
      out += inner;
    }
    return out;
  }
  function htmlToMd(el) {
    const paras = [];
    const block = n => {
      if (n.nodeType === 3) { if (n.nodeValue.trim()) paras.push(escMd(n.nodeValue.trim())); return; }
      if (n.nodeType !== 1) return;
      if (n.classList.contains("brk")) { paras.push("* * *"); return; }
      if (/^(DIV|SECTION|BLOCKQUOTE|UL|OL)$/.test(n.tagName) && [...n.children].some(c => /^(P|DIV|LI)$/.test(c.tagName))) { n.childNodes.forEach(block); return; }
      const t = inlineMd(n, { b: false, i: false }).replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").replace(/^\n+|\n+$/g, "");
      if (t.trim()) paras.push(BREAK.test(t) ? "* * *" : t.trim());
    };
    el.childNodes.forEach(block);
    return paras.length ? paras.join("\n\n") + "\n" : "";
  }

  // paste as plain paragraphs (keeps the page clean whatever it came from)
  function onPaste(e) {
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData("text/plain");
    const parts = t.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n+|\n/);
    if (parts.length < 2) { document.execCommand("insertText", false, t); return; }
    document.execCommand("insertHTML", false, parts.map(p => "<p>" + (html(p) || "<br>") + "</p>").join(""));
  }

  // a simple line-by-line comparison for "Compare" (paragraphs, not characters: it's prose)
  function diff(a, b) {
    const A = a.split(/\n\s*\n/), B = b.split(/\n\s*\n/), n = A.length, m = B.length;
    const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = []; let i = 0, j = 0;
    while (i < n && j < m) { if (A[i] === B[j]) { out.push(["=", A[i]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push(["-", A[i++]]); else out.push(["+", B[j++]]); }
    while (i < n) out.push(["-", A[i++]]); while (j < m) out.push(["+", B[j++]]);
    return out;
  }

  // a marker span that has grown other text (Enter after a marker copies the span in Chrome) goes back to plain text
  function tidy(ed) {
    for (const s of ed.querySelectorAll(".love")) if (!/^\[xx\b[^\]]*\]$/i.test(s.textContent.trim())) s.replaceWith(...s.childNodes);
  }

  window.Editor = { tidy, mdToHtml, htmlToMd, onPaste, diff, inline };
})();
