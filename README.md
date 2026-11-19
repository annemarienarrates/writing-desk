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
- **Lamp Room link:** a new book can also become a writing project in the Lamp Room, for its writer. Lamp Room writing projects can be opened here (the ✒ icon on their thumbnail), bringing their details and cover. The Desk only ever writes a writing project's title, series, pen name and cover; it never touches audio projects, stages, hours or dates.
- **Backup:** saves the whole library as one .zip.

## Built like the Lamp Room
- Plain HTML, CSS and JavaScript, served by GitHub Pages. There's no server and no build step.
- Chrome's folder access (the File System Access API) reads and writes the library folder directly.
- The Lamp Room's themes are shared, not copied: `index.html` loads `../lamp-room/css/app.css` and `../lamp-room/js/themefx.js`.
- `?test` runs on browser-private storage with a made-up book. `?test&fresh` wipes that storage first.

## Library layout
See `NOTES FOR CLAUDE.md`, which the Desk writes into every library.
