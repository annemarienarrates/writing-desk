/* The Writing Desk — the link to the Lamp Room's writing projects.
   A writing project is a planner title in the Lamp Room library ("Author work"): Ledger/titles/<id>.json with kind "author",
   and its cover in Covers/<id>.jpg. A Desk book links to one by its id (book.lampTitle).
   Both apps live on the same site, so the Desk can reuse the Lamp Room library folder this browser already opened
   (Chrome still asks once). The Desk never touches audio projects, and only ever writes a writing project's details
   (title, series, pen name) and cover, never its stages, hours or dates. */
(function () {
  "use strict";
  const AUTHOR_KEYS = ["outline", "draft", "revise", "aedit", "format", "publish", "market"];
  const INKS = ["#7a2e1d", "#2f5d50", "#23466e", "#6b3f7a", "#8a6a12", "#4c6a1f", "#8c3b55", "#3d5a80", "#9c4f12", "#5a5048"];
  const safeId = s => String(s).replace(/[^\w.-]+/g, "_");
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const today = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const seriesNo = v => v === "" || v == null || isNaN(+v) ? null : +v;

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
  // the Lamp Room keeps covers as JPEGs no bigger than 800 px
  async function toJpeg(blob) {
    const img = await createImageBitmap(blob), k = Math.min(1, 800 / Math.max(img.width, img.height));
    const cv = document.createElement("canvas"); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    return new Promise(res => cv.toBlob(res, "image/jpeg", 0.88));
  }

  const Lamp = {
    root: null, state: "none", titles: [], settings: null,

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
        const looks = (await readJson(h, "lamp-room.json")) || (await h.getDirectoryHandle("Ledger").then(() => ({}), () => null));
        if (!looks) throw new Error("That folder doesn't look like the Lamp Room library (it has no lamp-room.json or Ledger folder).");
        this.root = h;
      }
      await kvSet("lamp", this.root);
      this.state = "ready"; await this.load();
    },
    async titlesDir(create) { return (await this.root.getDirectoryHandle("Ledger", { create })).getDirectoryHandle("titles", { create }); },
    async load() {
      this.settings = (await readJson(this.root, "lamp-room.json")) || {};
      this.titles = [];
      let td; try { td = await this.titlesDir(false); } catch (e) { return; }
      for await (const [n, h] of td.entries()) {
        if (h.kind !== "file" || !n.endsWith(".json")) continue;
        const t = await readJson(td, n);
        if (t && t.kind === "author") { t.id = n.slice(0, -5); this.titles.push(t); }
      }
      this.titles.sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || (a.name || "").localeCompare(b.name || ""));
    },
    byId(id) { return this.titles.find(t => t.id === id); },
    linkedDesk(id) { return Store.books.find(b => b.lampTitle === id); },
    unlinked() { return this.titles.filter(t => t.status !== "done" && !this.linkedDesk(t.id)); },
    url() { return "../lamp-room/" + (Store.testMode ? "?test" : ""); },

    // the Lamp Room's people are keys ("anne", "jack"); the Desk's writers are names
    keyOf(name) {
      const n = String(name || "").trim().toLowerCase(), N = ((this.settings && this.settings.narrators) || []).map(x => String(x.name || "").toLowerCase());
      if (n === "anne" || n === "jack") return n;
      const i = N.indexOf(n); return i === 0 ? "anne" : i === 1 ? "jack" : null;
    },
    nameOf(key) {
      const N = (this.settings && this.settings.narrators) || [];
      const fromLamp = key === "anne" ? N[0] && N[0].name : key === "jack" ? N[1] && N[1].name : null;
      const ws = (Store.settings.writers || []).map(w => w.name);
      return ws.find(w => w.toLowerCase() === String(key || "").toLowerCase()) || ws.find(w => fromLamp && w.toLowerCase() === fromLamp.toLowerCase()) || fromLamp || "";
    },

    // a writing project's details, ready for the Desk's book form
    deskInfo(t) {
      return { title: t.name || "", series: t.series || "", seriesNo: t.seriesNo == null ? "" : String(t.seriesNo), penName: t.penName || "", writer: this.nameOf(t.writer) };
    },
    async coverBlob(id) { try { return await (await (await this.root.getDirectoryHandle("Covers")).getFileHandle(safeId(id) + ".jpg")).getFile(); } catch (e) { return null; } },

    // a new writing project from a Desk book; lands in the Lamp Room's "Writing projects" for its writer
    async createTitle(book, stage) {
      const writer = this.keyOf(book.writer) || "anne", ci = Math.max(0, AUTHOR_KEYS.indexOf(stage || "outline"));
      const t = { kind: "author", status: "active", name: book.title, short: "", writer, publisher: writer, targetWords: +book.targetWords || 0, due: null,
        penName: book.penName || "", series: book.series || "", seriesNo: seriesNo(book.seriesNo),
        priorHours: { anne: 0, jack: 0 }, color: INKS[this.titles.length % INKS.length],
        stages: AUTHOR_KEYS.map((k, i) => ({ id: "a-" + k, type: k, owner: writer, after: i ? ["a-" + AUTHOR_KEYS[i - 1]] : [], done: i < ci, doneDate: i < ci ? today() : null, estHours: null })) };
      const id = "t-" + uid();
      await writeFile(await this.titlesDir(true), safeId(id) + ".json", JSON.stringify(t, null, 1));
      t.id = id; this.titles.push(t);
      return t;
    },
    // keep a linked project's name, series and pen name in step with the Desk (nothing else is touched)
    async updateTitle(id, book) {
      const td = await this.titlesDir(true), cur = await readJson(td, safeId(id) + ".json"); if (!cur) return false;
      const next = Object.assign({}, cur, { name: book.title, series: book.series || "", seriesNo: seriesNo(book.seriesNo), penName: book.penName || "" }, book.targetWords ? { targetWords: +book.targetWords || 0 } : {});
      if (JSON.stringify(next) === JSON.stringify(cur)) return false;
      await writeFile(td, safeId(id) + ".json", JSON.stringify(next, null, 1));
      const t = this.byId(id); if (t) Object.assign(t, next, { id });
      return true;
    },
    async readTitle(id) { const t = await readJson(await this.titlesDir(true), safeId(id) + ".json"); if (t) { t.id = id; const i = this.titles.findIndex(x => x.id === id); if (i >= 0) this.titles[i] = t; } return t; },
    // a finished stage: it and the ones before it are done. Reopened: it and the ones after it aren't. Nothing else changes.
    async setStage(id, key, done) {
      const td = await this.titlesDir(true), cur = await readJson(td, safeId(id) + ".json"); if (!cur) return false;
      const ki = AUTHOR_KEYS.indexOf(key); if (ki < 0) return false;
      const stages = (cur.stages || []).map(s => {
        const i = AUTHOR_KEYS.indexOf(s.type); if (i < 0) return s;
        if (done && i <= ki && !s.done) return Object.assign({}, s, { done: true, doneDate: today() });
        if (!done && i >= ki && s.done) return Object.assign({}, s, { done: false, doneDate: null });
        return s;
      });
      if (JSON.stringify(stages) === JSON.stringify(cur.stages)) return false;
      const next = Object.assign({}, cur, { stages });
      await writeFile(td, safeId(id) + ".json", JSON.stringify(next, null, 1));
      const t = this.byId(id); if (t) Object.assign(t, next, { id });
      return true;
    },
    // the planner's writing pace (words an hour) lives in Ledger/config.json → people.<anne|jack>.writeWph
    DEFAULT_WPH: { anne: 1000, jack: 800 },
    async config() { try { return await readJson(await this.root.getDirectoryHandle("Ledger"), "config.json"); } catch (e) { return null; } },
    async pace(key) { const c = await this.config(); return (c && c.people && c.people[key] && +c.people[key].writeWph) || this.DEFAULT_WPH[key] || 1000; },
    async setPace(key, wph) {
      const ld = await this.root.getDirectoryHandle("Ledger", { create: true }), cur = (await readJson(ld, "config.json")) || {};
      cur.people = cur.people || {}; cur.people[key] = Object.assign({}, cur.people[key], { writeWph: Math.round(wph) });
      await writeFile(ld, "config.json", JSON.stringify(cur, null, 1));
    },
    // a writing session as a line in the Lamp Room's Log (time on the book's current stage), only when asked
    async addLog(key, titleId, stageKey, minutes, words) {
      const ld = await this.root.getDirectoryHandle("Ledger", { create: true }), dir = await ld.getDirectoryHandle("logs", { create: true });
      const date = today(), id = "log-" + date + "-" + uid();
      const doc = { date, person: key, raw: "Writing Desk sprint", entries: [{ person: key, titleId, stageId: "a-" + (stageKey || "draft"), kind: "author", hours: Math.max(0.25, Math.round(minutes / 60 * 4) / 4), auto: false, finished: false, finishedOn: null, note: `${words.toLocaleString()} words in a Writing Desk sprint` }], ot: null, createdAt: new Date().toISOString(), by: key };
      await writeFile(dir, safeId(id) + ".json", JSON.stringify(doc, null, 1));
      return id;
    },
    // the narrators the Lamp Room knows (Settings there), for choosing who reads which voice
    narrators() { return ((this.settings && this.settings.narrators) || []).map(n => n.name).filter(Boolean); },
    // a NEW audio project in the Lamp Room: chapters with parts already marked, readers set, character scripts loaded.
    // An audio project that exists is never written to: updates go through the Lamp Room's own "Update manuscript".
    async createAudio(book, chapters, parts, cues, docxBlob, docxName) {
      const bd = await this.root.getDirectoryHandle("Books", { create: true });
      const base = String(book.title || "Untitled").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").trim().slice(0, 80) || "Untitled";
      let folder = base, n = 2; while (true) { try { await bd.getDirectoryHandle(folder); folder = base + " (" + n++ + ")"; } catch (e) { break; } }
      const dir = await bd.getDirectoryHandle(folder, { create: true });
      for (const sub of ["manuscript", "audio", "exports"]) await dir.getDirectoryHandle(sub, { create: true });
      if (docxBlob) await writeFile(await dir.getDirectoryHandle("manuscript"), docxName || "manuscript.docx", docxBlob);
      const now = new Date().toISOString(), uidL = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      const readers = [...new Set(Object.values(parts).filter(Boolean))];
      const lb = { version: 1, id: uidL(), title: book.title, author: book.penName || book.writer || "", client: "", color: INKS[(this.titles.length + 3) % INKS.length], due: "",
        rate: { type: "pfh", amount: "" }, myShare: 100, cast: readers.map(r => ({ name: r, share: Math.round(100 / Math.max(1, readers.length)) })), status: "active", notes: "Sent from the Writing Desk with parts marked.",
        source: { file: docxName || null, method: "writing-desk", options: {} }, parts, cues: { scripts: cues },
        chapters: chapters.map(c => ({ id: uidL(), title: c.title, paras: c.paras, words: c.words, included: true, status: "todo", boothSeconds: 0, notes: "" })), created: now, updated: now };
      if (book.series) lb.series = book.series;
      await writeFile(dir, "book.json", JSON.stringify(lb, null, 1));
      return { id: lb.id, folder };
    },
    async audioExists(folder) { try { await (await (await this.root.getDirectoryHandle("Books")).getDirectoryHandle(folder)).getFileHandle("book.json"); return true; } catch (e) { return false; } },
    async setCover(id, blob) {
      const cd = await this.root.getDirectoryHandle("Covers", { create: true });
      await writeFile(cd, safeId(id) + ".jpg", await toJpeg(blob));
    },

    async seedTest() {
      const td = await this.titlesDir(true);
      if (await readJson(td, "t-lamptest1.json")) return;
      await writeFile(this.root, "lamp-room.json", JSON.stringify({ narrators: [{ name: "Anne", pace: 9000 }, { name: "Jack", pace: 2000 }] }));
      await writeFile(td, "t-lamptest1.json", JSON.stringify({ kind: "author", status: "active", name: "Ember Vow", writer: "anne", publisher: "anne", penName: "Pen Name Two", series: "Ash Court", seriesNo: 2, color: "#8c3b55",
        stages: AUTHOR_KEYS.map((k, i) => ({ id: "a-" + k, type: k, owner: "anne", after: i ? ["a-" + AUTHOR_KEYS[i - 1]] : [], done: i < 1, doneDate: null })) }, null, 1));
      await writeFile(td, "t-narr1.json", JSON.stringify({ kind: "narration", status: "active", name: "Someone Else's Audiobook", stages: [] }));
      const cv = document.createElement("canvas"); cv.width = 200; cv.height = 300; const g = cv.getContext("2d"); g.fillStyle = "#8c3b55"; g.fillRect(0, 0, 200, 300); g.fillStyle = "#fff"; g.font = "28px serif"; g.fillText("EMBER", 40, 150);
      const blob = await new Promise(r => cv.toBlob(r, "image/jpeg"));
      await writeFile(await this.root.getDirectoryHandle("Covers", { create: true }), "t-lamptest1.jpg", blob);
    }
  };
  window.Lamp = Lamp;
})();
