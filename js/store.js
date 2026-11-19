/* The Writing Desk — storage. Everything is plain files in a library folder you pick on this computer:
     <Library>/desk.json                                    your settings, writers and pen names
     <Library>/NOTES FOR CLAUDE.md                          how the folder is laid out, and the rules
     <Library>/Books/<Book>/book.json                       the book: details, chapter and scene order, beats
     <Library>/Books/<Book>/CONTENTS.md                     the order in plain words (rewritten on every save)
     <Library>/Books/<Book>/Manuscript/<Chapter>/<Scene>.md one plain Markdown file per scene
     <Library>/Books/<Book>/Reference/                      read-only copies: bible, tropes, outlines, codex
     <Library>/Books/<Book>/Snapshots/<scene id>/           rolling history of each scene
     <Library>/Books/<Book>/Sealed/<date name>/             sealed versions: never written to again
     <Library>/Books/<Book>/Trash/                          deleted scenes and chapters (nothing is destroyed)
   The folder handle is remembered in IndexedDB so Chrome can reopen it with one click. */
(function () {
  "use strict";
  const DEFAULTS = { version: 1, theme: "ledger", calm: false, mode: "page", textSize: 19, writers: [{ name: "Me", pens: [] }], snapKeep: 100 };

  const idb = {
    db: null,
    async open() {
      if (this.db) return this.db;
      this.db = await new Promise((res, rej) => { const r = indexedDB.open("writing-desk", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      return this.db;
    },
    async get(k) { const db = await this.open(); return new Promise((res, rej) => { const r = db.transaction("kv").objectStore("kv").get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
    async set(k, v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
  };

  const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const safe = s => String(s || "Untitled").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").replace(/\s+/g, " ").replace(/^\.+/, "").trim().slice(0, 70) || "Untitled";
  const stamp = (d = new Date()) => { const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`; };
  const words = s => { const m = String(s || "").replace(/\[xx\b[^\]]*\]/gi, " ").match(/\S+/g); return m ? m.filter(t => /[\p{L}\p{N}]/u.test(t)).length : 0; };
  const LOVE = /\[xx\b[^\]]*\]/i;
  async function sha256(text) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  }

  async function dirAt(base, parts, create) {
    let d = base;
    for (const p of parts) d = await d.getDirectoryHandle(p, { create: !!create });
    return d;
  }
  async function tryDir(base, parts) { try { return await dirAt(base, parts, false); } catch (e) { if (e.name === "NotFoundError" || e.name === "TypeMismatchError") return null; throw e; } }
  async function readFile(dir, name) {
    try { const f = await (await dir.getFileHandle(name)).getFile(); return { text: await f.text(), modified: f.lastModified }; }
    catch (e) { if (e.name === "NotFoundError") return null; throw e; }
  }
  async function writeFile(dir, name, data) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable(); await w.write(data); await w.close();
    return (await fh.getFile()).lastModified;
  }
  async function exists(dir, name) { try { await dir.getFileHandle(name); return true; } catch (e) { return false; } }
  async function dirExists(dir, name) { try { await dir.getDirectoryHandle(name); return true; } catch (e) { return false; } }
  async function names(dir, kind) { const out = []; if (!dir) return out; for await (const [n, h] of dir.entries()) if (!kind || h.kind === kind) out.push(n); return out.sort(); }
  // a name that isn't taken in this folder: "Arrival", "Arrival (2)"…
  async function freeName(dir, base, ext, isDir) {
    for (let i = 1; i < 500; i++) {
      const n = base + (i > 1 ? ` (${i})` : "") + (ext || "");
      if (!(isDir ? await dirExists(dir, n) : await exists(dir, n))) return n;
    }
    return base + " " + uid() + (ext || "");
  }

  const CLAUDE_NOTES = `# Notes for Claude: The Writing Desk library

This folder is The Writing Desk's library. Everything here is plain files.

## Layout
- \`Books/<Book>/book.json\`: the book's details and the ORDER of chapters and scenes. Order lives only here.
- \`Books/<Book>/CONTENTS.md\`: the same order in plain words, with each scene's file path. Read this first.
- \`Books/<Book>/Manuscript/<Chapter>/<Scene>.md\`: one scene per file, plain Markdown. *italic*, **bold**, a blank line between paragraphs.
- \`Books/<Book>/Reference/\`: copies of the bible, tropes, outlines and codex. The working versions live in the Claude Project.
- \`Books/<Book>/Snapshots/\`: rolling history the Desk keeps. Leave it alone.
- \`Books/<Book>/Trash/\`: deleted scenes. Leave it alone.

## Rules
1. **Never write to, rename or delete anything in a \`Sealed/\` folder, for any reason.** Sealed versions are locked; the Desk checks their fingerprints.
2. To change a scene, edit its \`.md\` file in place. Don't rename scene files or move them between folders: the Desk does that.
3. Don't add or reorder scenes by editing book.json. Ask Anne to do it in the Desk, or write a new scene's text in chat for her to paste.
4. Love scenes: leave the marker \`[xx — scene]\` and a brief; the authors write those scenes.
5. If the Desk has the same scene open with unsaved changes, it will ask Anne which version to keep. Nothing is lost either way.
`;

  const Store = {
    root: null, settings: clone(DEFAULTS), books: [], testMode: false,
    supported: typeof window.showDirectoryPicker === "function",
    words, LOVE, uid, safe, stamp, sha256,
    _seen: {},       // path → lastModified when this Desk last read or wrote it

    async init() {
      this.testMode = /[?&]test\b/.test(location.search);
      if (this.testMode && navigator.storage && navigator.storage.getDirectory) {
        this.root = await navigator.storage.getDirectory();
        if (/[?&]fresh\b/.test(location.search)) for (const n of await names(this.root)) await this.root.removeEntry(n, { recursive: true });
        await this.load(); return "ready";
      }
      if (!this.supported) return "unsupported";
      const h = await idb.get("root").catch(() => null);
      if (!h) return "no-folder";
      this.root = h;
      if ((await h.queryPermission({ mode: "readwrite" })) === "granted") { await this.load(); return "ready"; }
      return "needs-permission";
    },
    folderName() { return this.testMode ? "Test library (in this browser)" : this.root ? this.root.name : ""; },
    async pickFolder() {
      const h = await window.showDirectoryPicker({ id: "writing-desk-library", mode: "readwrite", startIn: "documents" });
      await idb.set("root", h); this.root = h; await this.load();
    },
    async reopen() {
      if ((await this.root.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("Permission wasn't granted.");
      await this.load();
    },
    async load() {
      const s = await readFile(this.root, "desk.json");
      this.settings = Object.assign(clone(DEFAULTS), s ? JSON.parse(s.text) : {});
      if (!s) await this.saveSettings();
      const n = await readFile(this.root, "NOTES FOR CLAUDE.md");
      if (!n || n.text !== CLAUDE_NOTES) await writeFile(this.root, "NOTES FOR CLAUDE.md", CLAUDE_NOTES);
      await this.loadBooks();
    },
    async saveSettings() { await writeFile(this.root, "desk.json", JSON.stringify(this.settings, null, 2)); },
    pens() { const out = []; for (const w of this.settings.writers || []) for (const p of w.pens || []) if (p) out.push({ pen: p, writer: w.name }); return out; },

    // ---------- books ----------
    async loadBooks() {
      const bd = await this.root.getDirectoryHandle("Books", { create: true });
      this.books = [];
      for (const name of await names(bd, "directory")) {
        try {
          const f = await readFile(await bd.getDirectoryHandle(name), "book.json");
          if (!f) continue;
          const b = JSON.parse(f.text); b.folder = name; this.books.push(b);
        } catch (e) { console.warn("Couldn't read", name, e); }
      }
    },
    byFolder(f) { return this.books.find(b => b.folder === f); },
    async bookDir(book, create) { return dirAt(this.root, ["Books", book.folder], create); },
    async createBook(info, chapters) {
      const bd = await this.root.getDirectoryHandle("Books", { create: true });
      const folder = await freeName(bd, safe(info.title), "", true);
      const book = { id: uid(), title: info.title || "Untitled", series: info.series || "", seriesNo: info.seriesNo || "", penName: info.penName || "", writer: info.writer || "", created: new Date().toISOString(), updated: new Date().toISOString(), cover: null, chapters: [], folder };
      await bd.getDirectoryHandle(folder, { create: true });
      const chs = chapters && chapters.length ? chapters : [{ title: "Chapter 1", scenes: [{ title: "Scene 1", text: "" }] }];
      for (const c of chs) {
        const ch = await this.addChapter(book, c.title, null, true);
        ch.beats = c.beats || "";
        for (const s of c.scenes) await this.addScene(book, ch, s.title, null, s.text || "", true);
      }
      this.books.push(book);
      await this.saveBook(book);
      return book;
    },
    async saveBook(book) {
      book.updated = new Date().toISOString();
      const dir = await this.bookDir(book, true);
      const data = clone(book); delete data.folder;
      await writeFile(dir, "book.json", JSON.stringify(data, null, 2));
      await writeFile(dir, "CONTENTS.md", this.contents(book));
    },
    contents(book) {
      const L = [`# ${book.title}`, "", "Written by The Writing Desk on every save. The order here is the book's order; edit scenes in their files, not here.", ""];
      if (book.series) L.push(`Series: ${book.series}${book.seriesNo ? ", Book " + book.seriesNo : ""}`);
      if (book.penName) L.push(`Pen name: ${book.penName}`);
      L.push(`Words: ${this.bookWords(book).toLocaleString()}`, "");
      book.chapters.forEach((c, i) => {
        L.push(`## ${i + 1}. ${c.title}`, "");
        c.scenes.forEach((s, j) => L.push(`${j + 1}. ${s.title}: \`Manuscript/${c.folder}/${s.file}\` (${(s.words || 0).toLocaleString()} words)${s.love ? " [xx scene to write]" : ""}`));
        L.push("");
      });
      return L.join("\n");
    },
    bookWords(book) { return book.chapters.reduce((a, c) => a + this.chapterWords(c), 0); },
    chapterWords(ch) { return ch.scenes.reduce((a, s) => a + (s.words || 0), 0); },
    openLove(book) { const out = []; for (const c of book.chapters) for (const s of c.scenes) if (s.love) out.push({ ch: c, sc: s }); return out; },

    async addChapter(book, title, at, noSave) {
      const md = await dirAt(await this.bookDir(book, true), ["Manuscript"], true);
      const folder = await freeName(md, safe(title || "Chapter"), "", true);
      await md.getDirectoryHandle(folder, { create: true });
      const ch = { id: uid(), title: title || "Chapter", folder, beats: "", scenes: [] };
      if (at == null) book.chapters.push(ch); else book.chapters.splice(at, 0, ch);
      if (!noSave) await this.saveBook(book);
      return ch;
    },
    async addScene(book, ch, title, at, text, noSave) {
      const cd = await this.chapterDir(book, ch);
      const file = await freeName(cd, safe(title || "Scene"), ".md");
      const sc = { id: uid(), title: title || "Scene", file, words: words(text), love: LOVE.test(text || "") };
      this._seen[this.scenePath(book, ch, sc)] = await writeFile(cd, file, text || "");
      if (at == null) ch.scenes.push(sc); else ch.scenes.splice(at, 0, sc);
      if (!noSave) await this.saveBook(book);
      return sc;
    },
    async chapterDir(book, ch) { return dirAt(await this.bookDir(book, true), ["Manuscript", ch.folder], true); },
    scenePath(book, ch, sc) { return `${book.folder}/Manuscript/${ch.folder}/${sc.file}`; },
    find(book, sceneId) { for (const c of book.chapters) { const s = c.scenes.find(x => x.id === sceneId); if (s) return { ch: c, sc: s }; } return null; },

    async readScene(book, ch, sc) {
      const f = await readFile(await this.chapterDir(book, ch), sc.file);
      const r = f || { text: "", modified: 0 };
      this._seen[this.scenePath(book, ch, sc)] = r.modified;
      return r;
    },
    // when the file on disk changed since we last read or wrote it, someone else (Claude) touched it
    async peekScene(book, ch, sc) {
      try { const f = await (await (await this.chapterDir(book, ch)).getFileHandle(sc.file)).getFile(); return f.lastModified; }
      catch (e) { return 0; }
    },
    changedOutside(book, ch, sc, modified) { const seen = this._seen[this.scenePath(book, ch, sc)]; return seen != null && modified && modified !== seen; },
    async writeScene(book, ch, sc, text, force) {
      const cd = await this.chapterDir(book, ch), path = this.scenePath(book, ch, sc);
      if (!force) {
        const now = await this.peekScene(book, ch, sc);
        if (this.changedOutside(book, ch, sc, now)) { const f = await readFile(cd, sc.file); const e = new Error("conflict"); e.conflict = true; e.theirs = f ? f.text : ""; e.modified = f ? f.modified : 0; throw e; }
      }
      this._seen[path] = await writeFile(cd, sc.file, text);
      const w = words(text), love = LOVE.test(text);
      if (w !== sc.words || love !== !!sc.love) { sc.words = w; sc.love = love; await this.saveBook(book); }
    },
    async renameScene(book, ch, sc, title) {
      title = String(title || "").trim() || "Scene";
      if (title === sc.title) return;
      const cd = await this.chapterDir(book, ch), old = await readFile(cd, sc.file);
      const file = await freeName(cd, safe(title), ".md");
      this._seen[`${book.folder}/Manuscript/${ch.folder}/${file}`] = await writeFile(cd, file, old ? old.text : "");
      await cd.removeEntry(sc.file);
      sc.title = title; sc.file = file;
      await this.saveBook(book);
    },
    async renameChapter(book, ch, title) {
      title = String(title || "").trim() || "Chapter";
      if (title === ch.title) return;
      const md = await dirAt(await this.bookDir(book, true), ["Manuscript"], true);
      const folder = await freeName(md, safe(title), "", true);
      const nd = await md.getDirectoryHandle(folder, { create: true }), od = await md.getDirectoryHandle(ch.folder);
      for (const n of await names(od, "file")) { const f = await readFile(od, n); this._seen[`${book.folder}/Manuscript/${folder}/${n}`] = await writeFile(nd, n, f.text); }
      await md.removeEntry(ch.folder, { recursive: true });
      ch.title = title; ch.folder = folder;
      await this.saveBook(book);
    },
    // move a scene to another chapter (or another place in its own); the file follows its chapter
    async moveScene(book, sceneId, toCh, toIdx) {
      const f = this.find(book, sceneId); if (!f) return;
      const { ch, sc } = f, from = ch.scenes.indexOf(sc);
      ch.scenes.splice(from, 1);
      if (ch === toCh && from < toIdx) toIdx--;
      if (ch !== toCh) {
        const od = await this.chapterDir(book, ch), nd = await this.chapterDir(book, toCh);
        const t = await readFile(od, sc.file), file = await freeName(nd, sc.file.replace(/\.md$/, ""), ".md");
        this._seen[`${book.folder}/Manuscript/${toCh.folder}/${file}`] = await writeFile(nd, file, t ? t.text : "");
        await od.removeEntry(sc.file); sc.file = file;
      }
      toCh.scenes.splice(Math.max(0, Math.min(toIdx, toCh.scenes.length)), 0, sc);
      await this.saveBook(book);
    },
    async moveChapter(book, chId, toIdx) {
      const i = book.chapters.findIndex(c => c.id === chId); if (i < 0) return;
      const [c] = book.chapters.splice(i, 1); if (i < toIdx) toIdx--;
      book.chapters.splice(toIdx, 0, c); await this.saveBook(book);
    },
    async trashScene(book, ch, sc) {
      const cd = await this.chapterDir(book, ch), t = await readFile(cd, sc.file);
      const tr = await dirAt(await this.bookDir(book, true), ["Trash"], true);
      await writeFile(tr, await freeName(tr, `${stamp()} ${safe(ch.title)} - ${sc.file.replace(/\.md$/, "")}`, ".md"), t ? t.text : "");
      await cd.removeEntry(sc.file);
      ch.scenes.splice(ch.scenes.indexOf(sc), 1);
      await this.saveBook(book);
    },
    async trashChapter(book, ch) {
      for (const sc of [...ch.scenes]) await this.trashScene(book, ch, sc);
      const md = await dirAt(await this.bookDir(book, true), ["Manuscript"], true);
      try { await md.removeEntry(ch.folder, { recursive: true }); } catch (e) { }
      book.chapters.splice(book.chapters.indexOf(ch), 1);
      await this.saveBook(book);
    },

    // ---------- snapshots: rolling history per scene ----------
    async snapshot(book, sc, text, why) {
      const sd = await dirAt(await this.bookDir(book, true), ["Snapshots", sc.id], true);
      const list = await names(sd, "file");
      if (list.length) { const last = await readFile(sd, list[list.length - 1]); if (last && last.text === text) return false; }
      if (!text && !list.length) return false;
      await writeFile(sd, await freeName(sd, `${stamp()} ${why || "saved"}`, ".md"), text);
      const keep = this.settings.snapKeep || 100;
      if (list.length + 1 > keep) for (const n of list.slice(0, list.length + 1 - keep)) await sd.removeEntry(n);
      return true;
    },
    async listSnapshots(book, sc) {
      const sd = await tryDir(await this.bookDir(book, true), ["Snapshots", sc.id]);
      return (await names(sd, "file")).reverse().map(n => { const m = n.match(/^(\d{4}-\d\d-\d\d) (\d\d)\.(\d\d)\.(\d\d) (.*)\.md$/); return { name: n, when: m ? `${m[1]} ${m[2]}:${m[3]}` : n, why: m ? m[5].replace(/ \(\d+\)$/, "") : "" }; });
    },
    async readSnapshot(book, sc, name) { const sd = await dirAt(await this.bookDir(book, true), ["Snapshots", sc.id]); const f = await readFile(sd, name); return f ? f.text : ""; },

    // ---------- sealed versions ----------
    async seal(book, name, chapterIds) {
      const chs = chapterIds ? book.chapters.filter(c => chapterIds.includes(c.id)) : book.chapters;
      const sd = await dirAt(await this.bookDir(book, true), ["Sealed"], true);
      if (!(await exists(sd, "README.txt"))) await writeFile(sd, "README.txt", "Sealed versions. Nothing in this folder is ever edited, by the Desk, by Claude, or by hand.\nThe Desk keeps a fingerprint of every file in each seal.json and can show that a seal is unchanged.\n");
      const date = new Date().toISOString().slice(0, 10);
      const folder = await freeName(sd, safe(`${date} ${name}`), "", true);
      const dir = await sd.getDirectoryHandle(folder, { create: true });
      const files = [];
      for (const [ci, c] of chs.entries()) {
        const cdir = await dir.getDirectoryHandle(safe(`${String(book.chapters.indexOf(c) + 1).padStart(2, "0")} ${c.title}`), { create: true });
        for (const [si, s] of c.scenes.entries()) {
          const t = (await this.readScene(book, c, s)).text;
          const fname = safe(`${String(si + 1).padStart(2, "0")} ${s.title}`) + ".md";
          await writeFile(cdir, fname, t);
          files.push({ path: `${cdir.name}/${fname}`, sceneId: s.id, chapterId: c.id, chapter: c.title, scene: s.title, words: words(t), sha256: await sha256(t) });
        }
      }
      const info = { name, date: new Date().toISOString(), scope: chapterIds ? "chapters" : "book", chapters: chs.map(c => c.title), words: files.reduce((a, f) => a + f.words, 0), files };
      info.fingerprint = await sha256(files.map(f => f.path + ":" + f.sha256).join("\n"));
      await writeFile(dir, "seal.json", JSON.stringify(info, null, 2));
      return { folder, ...info };
    },
    async listSeals(book) {
      const sd = await tryDir(await this.bookDir(book, true), ["Sealed"]);
      const out = [];
      for (const n of await names(sd, "directory")) {
        const f = await readFile(await sd.getDirectoryHandle(n), "seal.json");
        if (f) { try { out.push({ folder: n, ...JSON.parse(f.text) }); } catch (e) { out.push({ folder: n, name: n, broken: true, files: [] }); } }
      }
      return out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    },
    async readSealed(book, seal, path) {
      const [c, f] = path.split("/");
      const d = await dirAt(await this.bookDir(book, true), ["Sealed", seal.folder, c]);
      const r = await readFile(d, f); return r ? r.text : null;
    },
    // → { ok, results: [{ path, state: "ok" | "changed" | "missing" }] }
    async verifySeal(book, seal) {
      const results = [];
      for (const f of seal.files || []) {
        const t = await this.readSealed(book, seal, f.path).catch(() => null);
        results.push({ path: f.path, state: t == null ? "missing" : (await sha256(t)) === f.sha256 ? "ok" : "changed" });
      }
      const fp = await sha256((seal.files || []).map(f => f.path + ":" + f.sha256).join("\n"));
      return { ok: fp === seal.fingerprint && results.every(r => r.state === "ok"), listOk: fp === seal.fingerprint, results };
    },
    // copy a seal's text back into the working scenes (each current text is snapshotted first); the seal itself is untouched
    async draftFromSeal(book, seal) {
      let n = 0, missing = 0;
      for (const f of seal.files || []) {
        const hit = this.find(book, f.sceneId); const t = await this.readSealed(book, seal, f.path);
        if (t == null) { missing++; continue; }
        if (hit) { const cur = (await this.readScene(book, hit.ch, hit.sc)).text; await this.snapshot(book, hit.sc, cur, "before draft from seal"); await this.writeScene(book, hit.ch, hit.sc, t, true); n++; }
        else {
          let ch = book.chapters.find(c => c.id === f.chapterId) || book.chapters.find(c => c.title === f.chapter);
          if (!ch) ch = await this.addChapter(book, f.chapter);
          await this.addScene(book, ch, f.scene, null, t); n++;
        }
      }
      return { n, missing };
    },

    // ---------- reference shelf ----------
    async listReference(book) {
      const rd = await tryDir(await this.bookDir(book, true), ["Reference"]);
      const out = [];
      for (const n of await names(rd, "file")) { const f = await (await rd.getFileHandle(n)).getFile(); out.push({ name: n, modified: f.lastModified, size: f.size }); }
      return out;
    },
    async readReference(book, name) { const f = await readFile(await dirAt(await this.bookDir(book, true), ["Reference"], true), name); return f ? f.text : ""; },
    // a new copy replaces the old one; the old one goes to Reference/Previous with a date
    async addReference(book, name, text, original) {
      const rd = await dirAt(await this.bookDir(book, true), ["Reference"], true);
      const cur = await readFile(rd, name);
      if (cur && cur.text !== text) { const pd = await rd.getDirectoryHandle("Previous", { create: true }); await writeFile(pd, `${stamp()} ${name}`, cur.text); }
      await writeFile(rd, name, text);
      if (original) { const od = await rd.getDirectoryHandle("Originals", { create: true }); await writeFile(od, original.name, original); }
    },

    // ---------- cover ----------
    async setCover(book, file) {
      const dir = await this.bookDir(book, true);
      await writeFile(dir, "cover.jpg", file); book.cover = "cover.jpg"; await this.saveBook(book);
    },
    _covers: {},
    async coverUrl(book) {
      if (!book.cover) return null;
      try { const f = await (await (await this.bookDir(book)).getFileHandle(book.cover)).getFile(); const k = book.folder + f.lastModified; if (!this._covers[k]) this._covers[k] = URL.createObjectURL(f); return this._covers[k]; }
      catch (e) { return null; }
    },
    async updateBook(book, patch) {
      Object.assign(book, patch); await this.saveBook(book);
    },

    // ---------- backup: the whole library as one zip ----------
    async backupZip(onProgress) {
      const zip = new JSZip(); let n = 0;
      const walk = async (dir, path) => {
        for await (const [name, h] of dir.entries()) {
          if (h.kind === "directory") await walk(h, path + name + "/");
          else { zip.file(path + name, await (await h.getFile()).arrayBuffer()); n++; if (onProgress && n % 25 === 0) onProgress(n); }
        }
      };
      await walk(this.root, "Writing Desk Library/");
      return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    }
  };
  window.Store = Store;
})();
