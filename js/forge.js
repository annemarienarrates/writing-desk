/* The Writing Desk — the Series Forge stages, one tab each. Each tab has a prompt to paste into the series' Claude
   Project, a suggested checklist (ticked by hand, nothing locked), gates that want an Approve, and a handoff when done.
   Seven of the tabs match the Lamp Room planner's author stages; finishing one there and here keeps both in step. */
(function () {
  "use strict";
  const STAGES = [
    { key: "setup", label: "Setup", lamp: null, forge: "Stages 0–5",
      intro: "Once per series: the genre pack, the tropes, the arc, the cast, then the bible locked.",
      prompt: c => c.n > 1
        ? `series-forge status: ${c.series}. I'm starting Book ${c.n}; confirm the bible and genre pack are current before we outline.`
        : `series-forge: Let's write a new series. Working title: "${c.series}"${c.genre ? `. Genre: ${c.genre}` : ""}.`,
      items: [["intake", "Notes, character sheets or old drafts dropped in (optional)"], ["genre", "Genre pack in the Project as genre-pack.md"], ["tropes", "Trope ledger: capture, bend, ban, with payoffs"], ["arc", "Arc and theme in one line"], ["cast", "Cast, voice table, real-world texture bank, cover sheets"], ["bible", "Bible locked", true]] },
    { key: "outline", label: "Outline", lamp: "outline", forge: "Stages 6–8",
      intro: "The series outline and cover rotation, then this book's chapter-by-chapter outline and the genre audit.",
      prompt: c => c.n > 1 ? `series-forge next: ${c.series} Book ${c.n}. Start the outline from handoff-book-${c.n}.md.` : `series-forge stage 6: ${c.series} Book ${c.n}. Series outline and cover rotation, then the Book ${c.n} outline.`,
      items: [["series", "Series outline and cover rotation"], ["book", "Book outline: one row per chapter, with beats, plants, payoffs and target words"], ["beats", "Each chapter's beats pasted into its Beats panel here"], ["audit", "Genre audit approved", true]] },
    { key: "draft", label: "Draft", lamp: "draft", forge: "Stages 9–13",
      intro: "The chapter loop: a brief, the draft, first checks, your pass here, final checks, canon. Claude can edit the scene files directly from the desktop app.",
      prompt: c => `series-forge next: ${c.series} Book ${c.n}, Chapter ${c.nextCh}. Brief me first, then draft. The book is in my Writing Desk library: Books/${c.folder}/CONTENTS.md.`,
      items: [["chapters", "Every outlined chapter drafted"], ["love", "Every [xx — scene] marker written by the author"], ["pass", "Your pass done on every chapter"], ["canon", "Every chapter final-checked and saved as canon in the Project"]] },
    { key: "revise", label: "Revise", lamp: "revise", forge: "Stages 14–17",
      intro: "The full-book sweep (the editor pass), the bible and genre-pack cleanup, the Scrivener exports and the next-book handoff.",
      prompt: c => `series-forge stage 14: ${c.series} Book ${c.n}. Full-book sweep. The latest manuscript is in my Writing Desk library: Books/${c.folder}.`,
      items: [["sweep", "Editor markup and sweep report received"], ["cleanup", "Bible and genre pack cleanup approved", true], ["exports", "Bible, reference sheet, trope ledger and archive exported"], ["handoff", "Next-book handoff written"], ["refs", "Fresh bible and outline copies added to this book's reference shelf"]] },
    { key: "aedit", label: "Edit", lamp: "aedit", forge: "Your pass on the markup",
      intro: "Work through the editor markup, then bring the final manuscript back.",
      prompt: c => `series-forge: ${c.series} Book ${c.n}. My pass on the editor markup is done. Scan the final manuscript in my Writing Desk library (Books/${c.folder}) for merge typos, then run Stage 13 on the changed chapters.`,
      items: [["markup", "Every suggestion accepted or rejected"], ["merge", "Merge-typo scan clean"], ["final", "Manuscript marked final"], ["seal", "Final draft sealed here (🔒 Seal)"]] },
    { key: "format", label: "Format", lamp: "format", forge: "Stage 19",
      intro: "Front matter, back matter and the formatted file, one piece at a time.",
      prompt: c => `series-forge stage 19: ${c.series} Book ${c.n}. Book Build, one piece at a time.`,
      items: [["title", "Title page"], ["copyright", "Copyright page"], ["content", "Content note"], ["bonus", "Free bonus page"], ["back", "Back matter: review ask, teaser, freebies, links, afterword, also by, about"], ["file", "Formatted .docx built for Draft2Digital"]] },
    { key: "publish", label: "Publish", lamp: "publish", forge: "Stage 18",
      intro: "The publishing kit, then the uploads. Check KDP's and Draft2Digital's current limits first, every time.",
      prompt: c => `series-forge stage 18: ${c.series} Book ${c.n}. Publishing kit; search the current KDP and Draft2Digital limits first.`,
      items: [["kdp", "KDP title, series fields, long blurb, keywords and categories"], ["wide", "Wide retail: short blurb, BISAC codes"], ["covers", "Cover prompts finalized and the cover made"], ["ai", "AI disclosure checked against KDP's current wording"], ["upload", "Uploaded (KDP, Draft2Digital)"]] },
    { key: "market", label: "Market", lamp: "market", forge: "Stage 20 and launch",
      intro: "Launch: the hooks, ads, newsletter and ARC copies, then the close-out package.",
      prompt: c => `series-forge stage 20: ${c.series} Book ${c.n}. Close-out package, plus my launch set: hooks, ad copy, newsletter and social posts.`,
      items: [["hooks", "Hooks, tagline and 3 ad variants"], ["news", "Newsletter and social posts"], ["arc", "ARC copies out"], ["launch", "Launch checklist done"], ["close", "Close-out package: Project state current, next book's opener saved"]] }
  ];

  const Forge = {
    STAGES,
    state(book) { book.forge = book.forge || { done: {}, checks: {} }; book.forge.done = book.forge.done || {}; book.forge.checks = book.forge.checks || {}; return book.forge; },
    isDone(book, key) { return !!this.state(book).done[key]; },
    checked(book, key, id) { return !!this.state(book).checks[key + "." + id]; },
    current(book) { const s = STAGES.find(x => !this.isDone(book, x.key)); return s ? s.key : null; },
    // a gate in an earlier stage that isn't approved yet
    blockedBy(book, key) {
      for (const s of STAGES) { if (s.key === key) return null; if (this.isDone(book, s.key)) continue; const g = s.items.find(i => i[2] && !this.checked(book, s.key, i[0])); if (g) return { stage: s, item: g }; }
      return null;
    },
    allTicked(book, key) { const s = STAGES.find(x => x.key === key); return s.items.every(i => this.checked(book, key, i[0])); },
    context(book) {
      const n = parseInt(book.seriesNo, 10) || 1;
      const nextCh = Math.max(1, (book.chapters.findIndex(c => !c.scenes.some(s => s.words)) + 1) || book.chapters.length + 1);
      return { series: book.series || book.title, n, genre: book.genre || "", folder: book.folder, nextCh };
    },
    // the Lamp Room's stages are the source of truth for the seven it shares
    fromLamp(book, title) {
      const st = this.state(book); let changed = false;
      for (const s of STAGES) {
        if (!s.lamp) continue;
        const ls = (title.stages || []).find(x => x.id === "a-" + s.lamp); if (!ls) continue;
        if (!!ls.done !== !!st.done[s.key]) { st.done[s.key] = !!ls.done; changed = true; }
      }
      // a book past outlining in the Lamp Room is past setup too
      if (st.done.outline && !st.done.setup) { st.done.setup = true; changed = true; }
      return changed;
    }
  };
  window.Forge = Forge;
})();
