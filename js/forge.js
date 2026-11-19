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
    { key: "format", guide: `<p><b>Ebook first.</b> The formatted .docx from this stage goes into Draft2Digital's free formatter, which makes the EPUB. That EPUB can go to KDP too.</p>
<p><b>Paperback: when.</b> Once the ebook text is final, so you only lay it out once. A paperback rarely sells many copies in Kindle Unlimited genres, but it makes the ebook look like a bargain next to it, and it's what you sign, give away and send to reviewers. Many authors add paperbacks at launch for book one, and do the rest of a series in a batch.</p>
<p><b>Paperback: how.</b> Lay out the interior in <b>Vellum</b> (Mac only; the print version is Vellum Press, about $250 one time; the ebook-only version can't make print). Pick a trim size (5.5 × 8.5 in or 6 × 9 in are usual for fiction), export the print PDF, and note the page count. The cover designer needs that page count for the spine width of the full wraparound cover. Order a proof copy before you publish it.</p>`, label: "Format", lamp: "format", forge: "Stage 19",
      intro: "Front matter, back matter and the formatted file, one piece at a time.",
      prompt: c => `series-forge stage 19: ${c.series} Book ${c.n}. Book Build, one piece at a time.`,
      items: [["title", "Title page"], ["copyright", "Copyright page"], ["content", "Content note"], ["bonus", "Free bonus page"], ["back", "Back matter: review ask, teaser, freebies, links, afterword, also by, about"], ["file", "Formatted .docx built for Draft2Digital"], ["paper", "Paperback interior (Vellum) and wraparound cover (optional)"]] },
    { key: "publish", guide: `<p class="small muted">Rules and fees change. Each site's help pages win over this note.</p>
<p><b>First, one decision: Kindle Unlimited or wide.</b></p>
<ul><li><b>KDP Select (Kindle Unlimited):</b> the ebook is sold only on Amazon, in 90-day terms that renew on their own. You're paid for KU page reads as well as sales, and get one promotion per term (up to 5 free days, or a Countdown Deal). While it's enrolled, the ebook can't be on Draft2Digital, other stores or your own website. Paperbacks and audiobooks aren't affected.</li>
<li><b>Wide:</b> Amazon through KDP, and every other store (Apple, Kobo, Barnes &amp; Noble, Google, libraries) through Draft2Digital.</li></ul>
<p><b>Amazon KDP</b> (kdp.amazon.com)</p>
<ol><li>Sign in with an Amazon account and fill in the tax interview and bank details first: payments wait on them.</li>
<li>Create a Kindle eBook: title, subtitle, series name and number, pen name, description (the blurb), and up to 7 keywords and 3 categories from the kit.</li>
<li>Answer the AI-generated content question honestly (see the checklist).</li>
<li>Upload the EPUB and the cover (a JPG; KDP's help gives the current size). Check every page in the previewer.</li>
<li>Pricing: on Amazon.com, ebooks priced $2.99 to $12.99 can take the 70% royalty; outside that range it's 35%. Choose KDP Select here or not.</li>
<li>Publish. It usually goes live within 72 hours. A pre-order (up to a year ahead) is a good way to collect launch-day sales.</li>
<li>Paperback: add it from the same book's page ("+ Create paperback") so Amazon links the editions. Upload the print PDF and the wraparound cover, then order a proof.</li></ol>
<p><b>Draft2Digital</b> (draft2digital.com), for going wide</p>
<ol><li>Make an account. New accounts pay a one-time $20 activation fee. From the second year there's $12 a year if the account earned under $100 in the last 12 months.</li>
<li>Add the book: upload the .docx (D2D formats it) or your EPUB, then the cover and the blurb. D2D gives you a free ISBN if you don't have one.</li>
<li>Pick the stores. Leave Amazon unticked if you publish there yourself through KDP.</li>
<li>D2D keeps about 10% of the list price, and the store keeps its own share. Payments come monthly.</li>
<li>D2D Print can make the paperback for the wide stores, or use KDP's paperback for Amazon.</li></ol>`, label: "Publish", lamp: "publish", forge: "Stage 18",
      intro: "The publishing kit, then the uploads. Check KDP's and Draft2Digital's current limits first, every time.",
      prompt: c => `series-forge stage 18: ${c.series} Book ${c.n}. Publishing kit; search the current KDP and Draft2Digital limits first.`,
      items: [["route", "Kindle Unlimited or wide: decided"], ["kdp", "KDP title, series fields, long blurb, keywords and categories"], ["wide", "Wide retail: short blurb, BISAC codes"], ["covers", "Cover prompts finalized and the cover made"], ["ai", "AI disclosure checked against KDP's current wording"], ["upload", "Uploaded (KDP, Draft2Digital)"], ["print", "Paperback live and proof copy checked (optional)"]] },
    { key: "market", guide: `<p><b>The email list comes first.</b> Followers belong to the platform; an email list is yours. Use an email service built for it (MailerLite and similar) and offer something free for signing up: a short story, a bonus scene, a prequel (a "reader magnet"). BookFunnel or StoryOrigin delivers the free book to any device and adds the reader to your list. Put the sign-up link at the front and the back of every book.</p>
<p><b>Your website.</b> One home: books, series reading order, sign-up and links. You can sell ebooks there directly (a store such as Payhip or Shopify, with BookFunnel delivering the file) and keep far more per sale. You can't do that for an ebook enrolled in Kindle Unlimited.</p>
<p><b>Author swaps.</b> Trade a mention in your newsletter for one in another author's, in the same genre and with a list of similar size. BookFunnel and StoryOrigin both run newsletter swaps and group promotions, where many authors share one giveaway or sale page.</p>
<p><b>Where to post.</b> Where your readers already are: genre reader groups on Facebook (read each group's self-promotion rules), TikTok and Instagram (BookTok, Bookstagram), and, for LitRPG, Royal Road, where many series are read as serials first. Post about the book's tropes and moments, not "buy my book". Be steady rather than everywhere.</p>
<p><b>Discovery sites.</b> Deal newsletters send your discounted or free book to readers who signed up for your genre:</p>
<ul><li><b>BookBub Featured Deal:</b> the biggest. It's curated and hard to get, so apply often.</li>
<li><b>Written Word Media:</b> Freebooksy (free), Bargain Booksy (discounted) and genre lists.</li>
<li><b>Robin Reads, The Fussy Librarian, ENT:</b> smaller and cheaper. Stack a few over five days of a sale.</li></ul>
<p>Free or $0.99 for book one of a series usually pays off through the later books. Check each site's requirements (reviews, price, days since launch) before booking.</p>
<p><b>Ads.</b> Amazon Ads and Facebook Ads work best once a series has three or more books for the reader to continue into. Start small and stop what doesn't pay.</p>`, label: "Market", lamp: "market", forge: "Stage 20 and launch",
      intro: "Launch: the hooks, ads, newsletter and ARC copies, then the close-out package.",
      prompt: c => `series-forge stage 20: ${c.series} Book ${c.n}. Close-out package, plus my launch set: hooks, ad copy, newsletter and social posts.`,
      items: [["hooks", "Hooks, tagline and 3 ad variants"], ["news", "Newsletter and social posts"], ["arc", "ARC copies out"], ["launch", "Launch checklist done"], ["close", "Close-out package: Project state current, next book's opener saved"]] }
  ];

  const Forge = {
    STAGES,
    state(book) { book.forge = book.forge || { done: {}, checks: {} }; book.forge.done = book.forge.done || {}; book.forge.checks = book.forge.checks || {}; book.forge.doneAt = book.forge.doneAt || {}; return book.forge; },
    // started → finished: the book's own dates if set, else when it was made and when its last stage was done
    span(book) {
      const st = this.state(book), start = book.started || (book.created || "").slice(0, 10);
      const all = STAGES.every(x => st.done[x.key]);
      const finish = book.finished || (all ? Object.values(st.doneAt).sort().pop() || null : null);
      return { start, finish, all: !!finish };
    },
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
        st.doneAt = st.doneAt || {};
        if (ls.done && ls.doneDate && st.doneAt[s.key] !== ls.doneDate) { st.doneAt[s.key] = ls.doneDate; changed = true; }
        if (!ls.done && st.doneAt[s.key]) { delete st.doneAt[s.key]; changed = true; }
      }
      // a book past outlining in the Lamp Room is past setup too
      if (st.done.outline && !st.done.setup) { st.done.setup = true; changed = true; }
      return changed;
    }
  };
  window.Forge = Forge;
})();
