/* The Writing Desk — the link to the Lamp Room.
   Both apps live on the same site, so the Desk can reuse the Lamp Room library folder this browser already opened
   (Chrome still asks once for permission). The Desk only ever ADDS new book folders to the Lamp Room library;
   it never edits a Lamp Room book that already exists, so nothing there (parts, takes, progress) can be disturbed. */
(function () {
  "use strict";
  const SCENE_MARK = "⁂";
  const INKS = ["#7a2e1d", "#2f5d50", "#23466e", "#6b3f7a", "#8a6a12", "#4c6a1f", "#8c3b55", "#3d5a80", "#9c4f12", "#5a5048"];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const safeFolder = s => String(s || "Untitled").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled";
  const countWords = s => { const m = String(s || "").match(/\S+/g); return m ? m.length : 0; };
  const paraText = p => typeof p === "string" ? p : (p && p.r ? p.r.map(x => x[0]).join("") : "");
  // Desk Markdown → the Lamp Room's plain paragraphs
  const plain = md => md.replace(/\\\*/g, "\u0002").replace(/\*\*\*|\*\*|\*/g, "").replace(/\u0002/g, "*").replace(/\\\\/g, "\\").replace(/\s*\n\s*/g, " ").trim();
  // the Lamp Room's paragraphs → Desk Markdown (narration parts and highlights are left behind; the text comes over)
  const toMd = t => String(t).replace(/\\/g, "\\\\").replace(/\*/g, "\\*");

  async function kvGet(dbName, key) {
    if (indexedDB.databases) { const list = await indexedDB.databases(); if (!list.some(d => d.name === dbName)) return null; }
    else if (dbName !== "writing-desk") return null;   // never create the Lamp Room's database by accident
    const db = await new Promise((res, rej) => { const r = indexedDB.open(dbName); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error("blocked")); });
    try {
      if (!db.objectStoreNames.contains("kv")) return null;
      return await new Promise((res, rej) => { const r = db.transaction("kv").objectStore("kv").get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    } finally { db.close(); }
  }
  async function kvSet(key, value) {
    const db = await new Promise((res, rej) => { const r = indexedDB.open("writing-desk", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    try { await new Promise((res, rej) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(value, key); t.oncomplete = res; t.onerror = () => rej(t.error); }); } finally { db.close(); }
  }
  async function readJson(dir, name) { try { return JSON.parse(await (await (await dir.getFileHandle(name)).getFile()).text()); } catch (e) { return null; } }
  async function writeFile(dir, name, data) { const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(data); await w.close(); }

  const Lamp = {
    root: null, state: "none", books: [], settings: null,

    async init() {
      try {
        if (Store.testMode) { this.root = await (await navigator.storage.getDirectory()).getDirectoryHandle("_lamp-room-test", { create: true }); await this.seedTest(); this.state = "ready"; await this.load(); return; }
        let h = await kvGet("writing-desk", "lamp").catch(() => null);
        if (!h) h = await kvGet("lamp-room", "root").catch(() => null);
        if (!h) { this.state = "none"; return; }
        this.root = h;
        this.state = (await h.queryPermission({ mode: "readwrite" })) === "granted" ? "ready" : "needs-permission";
        if (this.state === "ready") await this.load();
      } catch (e) { console.warn("Lamp Room link", e); this.state = "none"; }
    },
    name() { return this.root ? this.root.name : ""; },
    // needs a click (Chrome asks for permission)
    async connect(pickNew) {
      if (this.root && !pickNew) {
        if ((await this.root.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("Chrome didn't get permission for the Lamp Room library.");
      } else {
        const h = await window.showDirectoryPicker({ id: "lamp-room-library", mode: "readwrite" });
        const looks = (await readJson(h, "lamp-room.json")) || (await h.getDirectoryHandle("Books").then(() => ({}), () => null));
        if (!looks) throw new Error("That folder doesn't look like the Lamp Room library (it has no lamp-room.json or Books folder).");
        this.root = h;
      }
      await kvSet("lamp", this.root);
      this.state = "ready"; await this.load();
    },
    async load() {
      this.settings = (await readJson(this.root, "lamp-room.json")) || {};
      this.books = [];
      let bd; try { bd = await this.root.getDirectoryHandle("Books"); } catch (e) { return; }
      for await (const [name, h] of bd.entries()) {
        if (h.kind !== "directory") continue;
        const b = await readJson(h, "book.json");
        if (b && b.id) { b.folder = name; this.books.push(b); }
      }
      this.books.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    },
    byId(id) { return this.books.find(b => b.id === id); },
    linkedDesk(lampId) { return Store.books.find(b => b.lamp && b.lamp.id === lampId); },
    unlinked() { return this.books.filter(b => !this.linkedDesk(b.id)); },
    url(lampId) { return "../lamp-room/" + (Store.testMode ? "?test" : "") + "#/book/" + encodeURIComponent(lampId); },

    // a Lamp Room book's text as Desk chapters and scenes
    toDeskChapters(lb) {
      return (lb.chapters || []).map(c => {
        const paras = (c.paras || []).map(paraText).map(s => s.trim()).filter(Boolean);
        const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
        // the heading line(s), kept in the Lamp Room because they're read aloud: "Chapter 2" or "Chapter 2" + "Cinders"
        if (paras.length > 1 && norm(paras[0] + " " + paras[1]) === norm(c.title)) paras.splice(0, 2);
        else if (paras.length && (norm(paras[0]) === norm(c.title) || norm(c.title).startsWith(norm(paras[0])) && paras[0].length <= 60)) paras.shift();
        const scenes = [[]];
        for (const p of paras) { if (p === SCENE_MARK || /^\s*(?:[*#~•·⁂◆◇❖✦✧=_-]\s*){1,7}\s*$/.test(p)) { if (scenes[scenes.length - 1].length) scenes.push([]); } else scenes[scenes.length - 1].push(toMd(p)); }
        const out = scenes.filter(s => s.length).map((s, i) => ({ title: `Scene ${i + 1}`, text: s.join("\n\n") + "\n" }));
        return { title: c.title || "Chapter", scenes: out.length ? out : [{ title: "Scene 1", text: "" }], words: c.words || 0, front: c.included === false };
      });
    },

    // a new Lamp Room book from a Desk book; chapters = [{ title, scenes: [{ text }] }] (Markdown)
    async createFromDesk(book, chapters, originalFile) {
      if (this.state !== "ready") throw new Error("The Lamp Room library isn't connected.");
      const bd = await this.root.getDirectoryHandle("Books", { create: true });
      let base = safeFolder(book.title), folder = base, n = 2;
      while (true) { try { await bd.getDirectoryHandle(folder); folder = base + " (" + n++ + ")"; } catch (e) { break; } }
      const dir = await bd.getDirectoryHandle(folder, { create: true });
      for (const sub of ["manuscript", "audio", "exports"]) await dir.getDirectoryHandle(sub, { create: true });
      if (originalFile) { try { await writeFile(await dir.getDirectoryHandle("manuscript"), safeFolder(originalFile.name), originalFile); } catch (e) { console.warn(e); } }
      const narr = ((this.settings && this.settings.narrators) || [])[0] || {};
      const lchs = chapters.map(c => {
        const paras = [c.title];
        c.scenes.forEach((s, i) => { const ps = String(s.text || "").split(/\n[ \t]*\n+/).map(plain).filter(Boolean); if (i && ps.length) paras.push(SCENE_MARK); paras.push(...ps); });
        return { id: uid(), title: c.title, paras, words: countWords(paras.filter(p => p !== SCENE_MARK).join(" ")), included: !c.front, status: "todo", boothSeconds: 0, notes: "" };
      });
      const now = new Date().toISOString();
      const lb = { version: 1, id: uid(), title: book.title, author: book.penName || book.writer || "", client: "", color: INKS[this.books.length % INKS.length], due: "",
        rate: { type: "pfh", amount: "" }, myShare: 100, cast: [{ name: narr.name || "Me", share: 100 }], status: "active", notes: "Added from the Writing Desk.",
        source: { file: originalFile ? originalFile.name : null, method: "writing-desk", options: {} }, chapters: lchs, created: now, updated: now };
      if (book.series) lb.series = book.series;
      await writeFile(dir, "book.json", JSON.stringify(lb, null, 1));
      lb.folder = folder; this.books.push(lb);
      return lb;
    },

    async seedTest() {
      const bd = await this.root.getDirectoryHandle("Books", { create: true });
      try { await bd.getDirectoryHandle("Ember Vow"); return; } catch (e) { }
      await writeFile(this.root, "lamp-room.json", JSON.stringify({ narrators: [{ name: "Anne", pace: 9000 }] }));
      const d = await bd.getDirectoryHandle("Ember Vow", { create: true });
      await writeFile(d, "book.json", JSON.stringify({ version: 1, id: "lamptest1", title: "Ember Vow", author: "Pen Name Two", chapters: [
        { id: "c0", title: "Front matter", paras: ["Ember Vow", "Copyright 2026"], included: false, words: 4 },
        { id: "c1", title: "Chapter 1", paras: ["Chapter 1", "The vow was made in smoke.", { r: [["“Say it,” ", "n"], ["she said.", "f"]] }, "⁂", "Later, the ash settled."], included: true, words: 15 },
        { id: "c2", title: "Chapter 2: Cinders", paras: ["Chapter 2", "Cinders", "He didn't say it."], included: true, words: 6 }] }, null, 1));
    }
  };
  window.Lamp = Lamp;
})();
