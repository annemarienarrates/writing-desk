# The Writing Desk

A private drafting desk for Jack & Anne's books. It's a sibling to [the Lamp Room](https://annemarienarrates.github.io/lamp-room/).

Open the app at **https://annemarienarrates.github.io/writing-desk/**. It only works in Google Chrome.

This repository holds only the app. Your books never come here. They live as plain files in a library folder you choose on your own computer.

## Phase 1
- **Bookshelf:** books grouped by series, filtered by pen name or writer, with optional covers.
- **Start or import a book:** start fresh, or import a Word .docx. Chapters split at headings, and scenes split at scene breaks. Story bible and codex files go on the reference shelf.
- **Binder:** chapters hold scenes. Drag to reorder, and move between chapters.
- **Editor:** a book page or a plain page, in any Lamp Room theme. It autosaves.
- **Side panel:** the chapter's beats, the list of love scenes still to write (`[xx — scene]` markers), the read-only reference shelf, and the book's details.
- **History:** a rolling list of earlier versions of each scene. Any version can be restored.
- **Sealed versions:** a seal is a copy of a chapter or the whole book that nothing changes. Each file has a fingerprint you can check, and you can start a new draft from a seal.
- **Safe editing with Claude:** when a scene file changes outside the Desk, the page picks up the new version. If you also have unsaved changes, you choose which version to keep, and the other goes into History.
- **Lamp Room link:** a new book can also become a writing project in the Lamp Room, for its writer. Lamp Room writing projects can be opened here (the ✒ icon on their thumbnail), bringing their details and cover. The Desk only ever writes a writing project's title, series, pen name and cover; it never touches audio projects, hours or dates. Stages change only when you finish or reopen one in the Forge tabs.
- **Series Forge tabs:** Setup, Outline, Draft, Revise, Edit, Format, Publish and Market sit above the page. Each tab has a prompt to paste into the series' Claude Project, a suggested checklist, gates to approve, and a handoff to the next stage. Finishing a stage ticks the matching author stage in the Lamp Room's planner, and stages ticked there show up here.
- **Dictation:** Chrome's speech-to-text types into the page. Speak punctuation ("comma", "period", "new paragraph", "scene break") and say "stop dictating" to stop.
- **Style check:** runs on this computer, with no AI and no internet, on a scene, a chapter or the whole book. It looks for AI tells (in narration only), overused words, echoes, repeated phrases, sentences that start the same way, pacing and readability by chapter, long paragraphs and sentences, dialogue tags (fancy tags, non-speech tags, adverbs on tags), em-dashes, "not X but Y", passive voice and filter words, plus the genre pack's budgets. "Show" lights up the spot on the page.
- **People & places:** names are suggested from the bible on the reference shelf and from the manuscript, and one click keeps them; there are no codex entries to write. A chapter-by-chapter grid shows who turns up where, and who has gone missing. The side panel's Cast tab shows who's in the open scene.
- **Genre packs:** master packs for Harem LitRPG, Reverse Harem Romance, Space Opera and Dark Fantasy live in the library's `Genre Packs` folder. Each has its own checker extras (tells, budgets, ignored lines). A book's genre decides which pack the checker uses.
- **Stats above the stages:** the book's words (and its target), words written this month, the writer's month against their monthly goal, words per month, the average book speed of finished books, and the writing pace. Words count when they land in the files, from the Desk or from Claude; imported text isn't counted as written.
- **Sprints:** a timer that counts the words added. At the end you can make the result your writing pace (shared with the Lamp Room) or add the time to today's Lamp Room log.
- **Timeline:** a day and time for every scene, filled in from time words in the text ("the next morning", "three days later", weekdays). It flags days that go backwards, jumps that don't match the text, and weekdays that don't match the dates.
- **Continuity:** eye colour, hair colour and ages that disagree between chapters and the bible (in People & places).
- **Series page** (click a series label on the shelf): every book in the series with its stage, words and dates; series totals and book speed; who appears in which book; continuity across the books (eyes and hair must match, ages may only go up); story time across the books. **Start Book N** carries the pen name, genre, cast list and reference shelf into the next book.
- **📖 Book Build:** front and back matter (title page, copyright, content note, free bonus, review ask, next-book teaser, newsletter, links, afterword, Also By, About the Author, acknowledgments), with the pen-name pages filled in from each pen name's profile in Settings. It makes an EPUB 3 in two looks, **Steel** (clean) and **Filigree** (decorative, with drop caps and ornaments), and a plain Word .docx for Draft2Digital's formatter. Files are saved in the book's `Exports` folder. The EPUBs pass epubcheck.
- **🏷 Publishing kit:** every field the store forms ask for (title and subtitle, blurb, 7 keywords, 3 categories, A+ copy, short blurb, BISAC codes, launch details and prices, AI disclosure, audiobook copy, tagline, hooks, ad copy, cover prompts), kept with the book. It has character counters where KDP has limits and a Copy button on every field. Paste Claude's Stage 18 kit and the fields fill themselves. It saves as Markdown to Exports and to the reference shelf.
- **Advance reader copies:** each reader gets their own watermarked EPUB, with their name on the title page and after every chapter; the list tracks who has reviewed.
- **Backup:** saves the whole library as one .zip.

## Built like the Lamp Room
- Plain HTML, CSS and JavaScript, served by GitHub Pages. There's no server and no build step.
- Chrome's folder access (the File System Access API) reads and writes the library folder directly.
- The Lamp Room's themes are shared, not copied: `index.html` loads `../lamp-room/css/app.css` and `../lamp-room/js/themefx.js`.
- `?test` runs on browser-private storage with a made-up book. `?test&fresh` wipes that storage first.

## Library layout
See `NOTES FOR CLAUDE.md`, which the Desk writes into every library.
