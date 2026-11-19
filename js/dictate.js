/* The Writing Desk — dictation into the page, with Chrome's built-in speech-to-text.
   Speak punctuation: "comma", "period" / "full stop", "question mark", "exclamation point", "colon", "semicolon",
   "dash", "open quote" / "close quote", "new line", "new paragraph", "scene break". Say "stop dictating" to stop.
   Chrome sends the audio to Google's speech service, so it needs the internet; nothing is kept by the Desk. */
(function () {
  "use strict";
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const MARKS = [
    [/\s*\b(full stop|period)\b/gi, "."], [/\s*\bcomma\b/gi, ","], [/\s*\bquestion mark\b/gi, "?"], [/\s*\bexclamation (point|mark)\b/gi, "!"],
    [/\s*\bsemicolon\b/gi, ";"], [/\s*\bcolon\b/gi, ":"], [/\s*\b(em )?dash\b\s*/gi, "—"], [/\s*\bellipsis\b/gi, "…"],
    [/\bopen quote\s*/gi, "“"], [/\s*\bclose quote\b/gi, "”"]
  ];
  const D = {
    on: false, rec: null, wanted: false,
    supported: !!SR,
    toggle() { this.on ? this.stop() : this.start(); },
    start() {
      if (!SR) { Desk.toast("Dictation needs Google Chrome."); return; }
      const ed = document.getElementById("ed"); if (!ed) return;
      if (!ed.contains(document.getSelection().anchorNode)) { ed.focus(); const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      const rec = new SR(); rec.lang = (window.Store && Store.settings.dictLang) || navigator.language || "en-US"; rec.continuous = true; rec.interimResults = true;
      rec.onresult = e => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) this.insert(r[0].transcript); else interim += r[0].transcript;
        }
        this.show(interim);
      };
      rec.onerror = e => { if (e.error === "not-allowed" || e.error === "service-not-allowed") { this.wanted = false; Desk.toast("Chrome wasn't allowed to use the microphone. Allow it from the 🔒 icon in the address bar."); } else if (e.error === "network") Desk.toast("Dictation needs the internet (Chrome's speech service)."); };
      rec.onend = () => { if (this.wanted) { try { rec.start(); } catch (e) { this.stop(); } } else this.stop(); };   // Chrome stops after a pause; keep going until told
      this.rec = rec; this.wanted = true; this.on = true;
      try { rec.start(); } catch (e) { }
      this.ui();
      Desk.toast("Dictating. Say “new paragraph”, “comma”, “period”… and “stop dictating” to stop.", 5000);
    },
    stop() { this.wanted = false; this.on = false; try { this.rec && this.rec.stop(); } catch (e) { } this.rec = null; this.show(""); this.ui(); },
    ui() { const b = document.getElementById("dict"); if (b) { b.classList.toggle("rec", this.on); b.textContent = this.on ? "■ Stop dictating" : "🎙 Dictate"; } },
    show(t) { let el = document.getElementById("dictlive"); if (!el) { el = document.createElement("div"); el.id = "dictlive"; document.body.appendChild(el); } el.textContent = t; el.classList.toggle("hidden", !t); },
    insert(raw) {
      let t = " " + raw.trim();
      if (/\bstop dictating\b/i.test(t)) { t = t.replace(/\s*\bstop dictating\b.*$/i, ""); this.place(t); this.stop(); return; }
      this.place(t);
    },
    place(t) {
      const ed = document.getElementById("ed"); if (!ed || !t.trim()) return;
      if (!ed.contains(document.getSelection().anchorNode)) ed.focus();
      const parts = t.split(/\s*\b(new paragraph|new line|scene break)\b\s*/i);
      for (const p of parts) {
        if (!p) continue;
        const k = p.toLowerCase();
        if (k === "new paragraph" || k === "new line") { document.execCommand("insertParagraph"); continue; }
        if (k === "scene break") { document.execCommand("insertParagraph"); document.execCommand("insertText", false, "* * *"); document.execCommand("insertParagraph"); continue; }
        let s = p; for (const [re, m] of MARKS) s = s.replace(re, m);
        // capitals after a full stop and at the start of a paragraph
        const before = this.before(ed);
        if (/(^|[.!?…]\s*["”]?)\s*$/.test(before)) s = s.replace(/^\s*(“?)([a-z])/, (_, q, c) => (before && !/\s$/.test(before) ? " " : "") + q + c.toUpperCase());
        else if (/\S$/.test(before) && !/^[\s.,;:!?…”—]/.test(s)) s = " " + s.trimStart();
        else s = s.replace(/^\s+/, /\s$/.test(before) || !before ? "" : " ");
        s = s.replace(/([.!?]\s+)([a-z])/g, (_, a, c) => a + c.toUpperCase()).replace(/“\s+/g, "“").replace(/\s+”/g, "”");
        document.execCommand("insertText", false, s);
      }
    },
    // the text of the current paragraph up to the caret
    before(ed) {
      const sel = getSelection(); if (!sel.rangeCount) return "";
      let p = sel.anchorNode; while (p && p.parentNode !== ed) p = p.parentNode; if (!p) return "";
      const r = document.createRange(); r.selectNodeContents(p); r.setEnd(sel.anchorNode, sel.anchorOffset);
      return r.toString();
    }
  };
  window.Dictation = D;
})();
