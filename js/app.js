/* The Writing Desk — pages: bookshelf, the desk (binder, page, side panel), new book & import, settings. */
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const num = n => (n || 0).toLocaleString();
  const main = $("#main");
  const THEMES = [["ledger", "Ledger — warm paper & brass (light)"], ["archive", "Archive — cool paper & ink (light)"], ["lamp", "Lamp — lamplit dark"], ["nocturne", "Nocturne — violet dark"], ["foundry", "Foundry — soot, smoke & whisky"], ["afterglow", "Afterglow — violet night & sunset neon"], ["velvet", "Velvet — wine, black velvet & rose gold"], ["signal", "Signal — hot pink & acid yellow on black"], ["phosphor", "Phosphor — green-screen terminal"], ["sanguine", "Sanguine — neon blood red, blackletter titles"]];

  function toast(m, ms) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = m; $("#toasts").appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 600); }, ms || 3200);
  }
  const guard = fn => async (...a) => { try { return await fn(...a); } catch (e) { console.error(e); toast("Something went wrong: " + (e.message || e), 6000); } };
  function applyLook() {
    const S = Store.settings, html = document.documentElement;
    html.dataset.theme = S.theme || "ledger";
    html.style.setProperty("--wd-size", (S.textSize || 19) + "px");
  }
  // the bookshelf's wall: drawn wood panelling in the theme's colours, your own picture tinted by the theme, or plain
  let wallUrl = null;
  async function applyShelfWall(on) {
    const b = document.body, mode = Store.settings.shelfWall || "wood";
    b.classList.toggle("on-shelf", on); b.classList.toggle("wall-wood", on && mode === "wood"); b.classList.toggle("wall-photo", on && mode === "photo");
    if (on && mode === "photo") {
      if (!wallUrl) { try { const f = await (await Store.root.getFileHandle("shelf-wall.jpg")).getFile(); wallUrl = URL.createObjectURL(f); } catch (e) { } }
      b.style.setProperty("--wall-img", wallUrl ? `url("${wallUrl}")` : "none");
    }
  }
  function chip(id, text, cls) { const c = $("#" + id); c.textContent = text || ""; c.className = "chip" + (text ? "" : " hidden") + (cls ? " " + cls : ""); }

  // ---------- dialogs ----------
  let closeModal = null;
  function modal(inner, opts = {}) {
    const m = $("#modal"), d = $(".wd-dlg", m);
    d.className = "wd-dlg card" + (opts.wide ? " wide" : ""); d.innerHTML = inner; m.classList.remove("hidden");
    return new Promise(res => {
      closeModal = v => { m.classList.add("hidden"); d.innerHTML = ""; closeModal = null; res(v); };
      m.onmousedown = e => { if (e.target === m && !opts.sticky) closeModal(null); };
      $$("[data-close]", d).forEach(b => b.onclick = () => closeModal(b.dataset.close || null));
      opts.mount && opts.mount(d, closeModal);
      const f = $("[autofocus]", d); f && f.focus();
    });
  }
  const confirmBox = (msg, ok = "OK") => modal(`<p>${msg}</p><div class="row end"><button class="btn quiet" data-close>Cancel</button><button class="btn primary" data-close="yes">${esc(ok)}</button></div>`).then(v => v === "yes");
  function promptBox(title, value, ok = "Save") {
    return modal(`<h2>${esc(title)}</h2><form id="pf"><input id="pv" class="wide" value="${esc(value || "")}" autofocus><div class="row end"><button type="button" class="btn quiet" data-close>Cancel</button><button class="btn primary">${esc(ok)}</button></div></form>`,
      { mount: (d, close) => { const i = $("#pv", d); i.select(); $("#pf", d).onsubmit = e => { e.preventDefault(); close(i.value.trim() || null); }; } });
  }
  addEventListener("keydown", e => { if (e.key === "Escape" && closeModal && !$("#modal .wd-dlg[data-sticky]")) closeModal(null); });

  // a light Markdown reader for the reference shelf, seals and history
  function renderMd(md) {
    const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n"); let out = "", para = [], list = null, table = [];
    const flush = () => {
      if (para.length) { out += "<p>" + Editor.inline(para.join("\n")) + "</p>"; para = []; }
      if (list) { out += "<ul>" + list.map(l => "<li>" + Editor.inline(l) + "</li>").join("") + "</ul>"; list = null; }
      if (table.length) { out += "<table>" + table.filter(r => !/^\s*\|?\s*:?-{2,}/.test(r)).map((r, i) => "<tr>" + r.replace(/^\s*\||\|\s*$/g, "").split("|").map(c => `<${i ? "td" : "th"}>${Editor.inline(c.trim())}</${i ? "td" : "th"}>`).join("") + "</tr>").join("") + "</table>"; table = []; }
    };
    for (const l of lines) {
      const h = l.match(/^(#{1,6})\s+(.*)$/), li = l.match(/^\s*[-*+]\s+(.*)$/);
      if (!l.trim()) { flush(); continue; }
      if (h) { flush(); out += `<h${Math.min(6, h[1].length + 2)}>${Editor.inline(h[2])}</h${Math.min(6, h[1].length + 2)}>`; continue; }
      if (/^\s*\|/.test(l)) { if (para.length || list) { const t = table; table = []; flush(); table = t; } table.push(l); continue; }
      if (li && !/^\s*\*\s*\*/.test(l)) { if (para.length || table.length) flush(); (list = list || []).push(li[1]); continue; }
      if (list || table.length) flush();
      para.push(l);
    }
    flush();
    return out || '<p class="muted">Empty.</p>';
  }

  // ---------- the writing session: one open scene ----------
  const E = { book: null, ch: null, sc: null, base: "", dirty: false, timer: 0, lastSnap: 0, busy: false, conflict: false };
  function editorEl() { return $("#ed"); }
  function setSaved(state) { chip("savechip", state === "saved" ? "Saved" : state === "saving" ? "Saving…" : state === "unsaved" ? "Unsaved" : "", state === "error" ? "err" : ""); }
  async function saveNow(force) {
    clearTimeout(E.timer);
    const ed = editorEl(); if (!E.sc || !ed || E.conflict) return;
    const md = Editor.htmlToMd(ed);
    if (md === E.base && !force) { E.dirty = false; setSaved("saved"); return; }
    if (E.busy) { E.timer = setTimeout(saveNow, 400); return; }
    E.busy = true; setSaved("saving");
    try {
      await Store.writeScene(E.book, E.ch, E.sc, md);
      E.base = md; E.dirty = false; setSaved("saved");
      if (Date.now() - E.lastSnap > 10 * 60 * 1000) { await Store.snapshot(E.book, E.sc, md, "autosave"); E.lastSnap = Date.now(); }
      refreshCounts();
    } catch (e) {
      if (e.conflict) { E.busy = false; await resolveConflict(md, e.theirs); return; }
      setSaved("error"); toast("Couldn't save: " + e.message, 6000);
    } finally { E.busy = false; }
  }
  function onType() { const ed = editorEl(); ed && Editor.tidy(ed); Checks.clear(); E.dirty = true; setSaved("unsaved"); clearTimeout(E.timer); E.timer = setTimeout(saveNow, 1200); }
  // Claude (or anyone) changed the open scene's file
  async function checkOutside() {
    if (!E.sc || E.conflict || E.busy || closeModal) return;
    const book = E.book, ch = E.ch, sc = E.sc;
    const m = await Store.peekScene(book, ch, sc);
    if (!Store.changedOutside(book, ch, sc, m) || E.sc !== sc) return;
    const ed = editorEl(); const mine = ed ? Editor.htmlToMd(ed) : E.base;
    if (mine === E.base) {
      await Store.snapshot(book, sc, E.base, "before outside change");
      const r = await Store.readScene(book, ch, sc);
      E.base = r.text; if (ed) ed.innerHTML = Editor.mdToHtml(r.text); E.dirty = false;
      await Store.writeScene(book, ch, sc, r.text, true).catch(() => { }); // refresh counts and markers
      refreshCounts(); renderBinder();
      toast(`“${sc.title}” was changed outside the Desk (Claude?). The page now shows that version; the old one is in History.`, 6000);
    } else {
      const theirs = (await Store.readScene(book, ch, sc)).text;
      Store._seen[Store.scenePath(book, ch, sc)] = 0; // keep it flagged until resolved
      await resolveConflict(mine, theirs);
    }
  }
  async function resolveConflict(mine, theirs) {
    const { book, ch, sc } = E; E.conflict = true;
    const pick = await modal(`<h2>This scene changed in two places</h2>
      <p>“${esc(sc.title)}” was changed outside the Desk (probably Claude) while you had unsaved changes here. Nothing is lost: whichever you choose, the other goes into the scene's History.</p>
      <div id="cmp" class="wd-cmp hidden"></div>
      <div class="row end"><button class="btn quiet" id="cmpb">Compare</button><button class="btn" data-close="theirs">Take the outside version</button><button class="btn primary" data-close="mine">Keep mine</button></div>`,
      { sticky: true, wide: true, mount: d => { d.dataset.sticky = 1; $("#cmpb", d).onclick = () => { const c = $("#cmp", d); c.classList.toggle("hidden"); c.innerHTML = Editor.diff(mine.trim(), theirs.trim()).map(([k, p]) => `<div class="df df${k === "=" ? "s" : k === "-" ? "m" : "t"}"><span>${k === "=" ? "" : k === "-" ? "Mine" : "Outside"}</span>${Editor.inline(p)}</div>`).join(""); }; } });
    try {
      if (pick === "theirs") {
        await Store.snapshot(book, sc, mine, "my version (conflict)");
        await Store.readScene(book, ch, sc);
        E.base = theirs; if (E.sc === sc && editorEl()) editorEl().innerHTML = Editor.mdToHtml(theirs);
        await Store.writeScene(book, ch, sc, theirs, true);
        toast("Took the outside version. Yours is in History.");
      } else {
        await Store.snapshot(book, sc, theirs, "outside version (conflict)");
        await Store.writeScene(book, ch, sc, mine, true); E.base = mine;
        toast("Kept yours. The outside version is in History.");
      }
      E.dirty = false; setSaved("saved"); refreshCounts(); renderBinder();
    } finally { E.conflict = false; }
  }
  setInterval(() => checkOutside().catch(e => console.warn(e)), 2500);
  addEventListener("focus", () => checkOutside().catch(() => { }));
  addEventListener("beforeunload", e => { if (E.dirty) { saveNow(); e.preventDefault(); e.returnValue = ""; } });
  async function leaveScene() { if (window.Dictation && Dictation.on) Dictation.stop(); if (E.sc && E.dirty) await saveNow(); }

  // ---------- routing ----------
  let route = {};
  async function go() {
    await leaveScene();
    const h = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    route = { name: h[0] || "shelf", a: h[1], b: h[2] };
    $$("#nav a[data-r]").forEach(a => a.classList.toggle("on", a.dataset.r === route.name));
    document.body.classList.toggle("on-desk", route.name === "book");
    applyShelfWall(route.name === "shelf");
    if (route.name !== "book") { E.book = E.sc = E.ch = null; setSaved(""); }
    ({ shelf: viewShelf, new: viewNew, import: viewNew, title: viewTitle, settings: viewSettings, book: viewBook }[route.name] || viewShelf)();
  }
  addEventListener("hashchange", guard(go));

  // ---------- first run ----------
  async function boot() {
    let st;
    try { st = await Store.init(); } catch (e) { st = "error"; console.error(e); }
    if (st === "ready") return ready();
    const box = (body) => main.innerHTML = `<div class="gate card"><h1>The Writing Desk</h1>${body}</div>`;
    if (st === "unsupported") return box(`<p>The Writing Desk works in <b>Google Chrome</b> on a Mac or PC: it's the browser that lets a web page work directly in a folder you choose. Open this page in Chrome.</p>`);
    if (st === "needs-permission") {
      box(`<p>Welcome back. Chrome needs your OK to open your library folder, <b>${esc(Store.folderName())}</b>, again.</p><div class="row"><button class="btn primary" id="reopen">Open my library</button><button class="btn quiet" id="pick">Choose a different folder</button></div>`);
      $("#reopen").onclick = guard(async () => { await Store.reopen(); ready(); });
      $("#pick").onclick = guard(async () => { await Store.pickFolder(); ready(); });
      return;
    }
    box(`<p>Your books live as plain files in a folder on this computer, never in the app. Pick or make a folder for your library: <b>Documents › Writing Desk Library</b> is a good home. Keep it outside Google Drive.</p>
      <ol class="small muted"><li>Click the button, go to Documents, and click <b>New Folder</b>.</li><li>Name it <i>Writing Desk Library</i>, select it, and click <b>Open</b>, then <b>Edit files</b>.</li></ol>
      <button class="btn primary" id="pick">Choose library folder</button>${st === "error" ? '<p class="bad small">The last folder couldn\'t be opened. Choose it again.</p>' : ""}`);
    $("#pick").onclick = guard(async () => { await Store.pickFolder(); ready(); });
  }
  async function ready() {
    applyLook(); chip("folderchip", "📁 " + Store.folderName());
    if (Store.testMode && !Store.books.length && !/[?&]empty\b/.test(location.search)) await seedTestBook();
    await Lamp.init();
    go();
  }
  async function seedTestBook() {
    Store.settings.writers = [{ name: "Anne", pens: ["Pen Name One", "Pen Name Two"] }, { name: "Jack", pens: ["Pen Name Three"] }]; await Store.saveSettings();
    await Store.createBook({ title: "The Salt Road", series: "Test Series", seriesNo: "1", penName: "Pen Name One", writer: "Anne" }, [
      { title: "Chapter 1", beats: "Mara arrives at the salt flats.\nThe guide lies about the road.", scenes: [{ title: "Arrival", text: "The bus left Mara at the edge of the flats at noon, which was the wrong time to arrive anywhere.\n\nShe had *one* bag and a map that was **definitely** lying.\n" }, { title: "The Guide", text: "Teo was waiting by the pump, eating sunflower seeds like it was a job.\n\n[xx — scene]\n" }] },
      { title: "Chapter 2", scenes: [{ title: "Night Camp", text: "Nobody slept.\n" }] }]);
    const b = Store.books[0];
    await Store.addReference(b, "bible.md", "# The Salt Road bible\n\n## Cast\n\n- **Mara Voss**, 29, cartographer. Grey eyes.\n- **Teo Ruiz**, 31, guide.\n\n| Name | Eyes |\n|---|---|\n| Mara | grey |\n| Teo | brown |\n");
    const b2 = await Store.createBook({ title: "Glass Harbor", series: "", penName: "Pen Name Two", writer: "Anne" });
    void b2;
  }

  // ---------- the Lamp Room link: writing projects ----------
  function lampOffer() {
    if (Lamp.state === "ready") return `<label class="check lampbox"><input type="checkbox" name="toLamp" checked> Also add it to the writer's projects in the Lamp Room</label>`;
    return `<p class="small muted lampbox">${Lamp.state === "needs-permission" ? `To add it to your Lamp Room projects too, <a href="#" data-lampconnect>connect the Lamp Room library</a> first.` : `Connect the Lamp Room library in <a href="#/settings">Settings</a> to add new books to your projects there too.`}</p>`;
  }
  function wireLampConnect(root, after) {
    $$("[data-lampconnect]", root).forEach(a => a.onclick = guard(async e => { e.preventDefault(); await Lamp.connect(); toast("Lamp Room library connected."); after ? after() : go(); }));
  }
  async function sendToLamp(book, stage) {
    if (Object.keys(Forge.state(book).done).length) stage = (Forge.STAGES.find(x => x.lamp && !Forge.isDone(book, x.key)) || { lamp: "market" }).lamp;
    const t = await Lamp.createTitle(book, stage);
    book.lampTitle = t.id; await Store.saveBook(book);
    if (book.cover) { try { const f = await (await (await Store.bookDir(book)).getFileHandle(book.cover)).getFile(); await Lamp.setCover(t.id, f); } catch (e) { console.warn(e); } }
    return t;
  }
  // a Lamp Room writing project → a Desk book with its details and cover (the manuscript gets imported here later)
  async function bringFromLamp(t) {
    const v = Lamp.deskInfo(t);
    if (v.penName && !Store.pens().some(p => p.pen === v.penName)) { const w = (Store.settings.writers || []).find(w => w.name === v.writer) || (Store.settings.writers || [])[0]; if (w) { w.pens = (w.pens || []).filter(Boolean).concat([v.penName]); await Store.saveSettings(); } }
    await modal(`<h2>Open “${esc(t.name)}” in the Writing Desk</h2>
      <p class="small">Its details and cover come over from the Lamp Room, and the two stay linked. It starts as an empty book; import the manuscript into it when you're ready.</p>
      <form id="bf">${bookFields(v)}
      <div class="row end"><button type="button" class="btn quiet" data-close>Cancel</button><button class="btn primary">Put it on the Desk</button></div></form>`,
      { wide: true, mount: (d, close) => { const f = $("#bf", d); wirePen(f);
        f.onsubmit = guard(async e => { e.preventDefault(); const info = formInfo(f); if (!info.title) return;
          const b = await Store.createBook(info); b.lampTitle = t.id; await Store.saveBook(b);
          const cov = await Lamp.coverBlob(t.id); if (cov) await Store.setCover(b, cov);
          if (info.title !== t.name || info.series !== (t.series || "") || info.penName !== (t.penName || "") || String(info.seriesNo) !== String(t.seriesNo == null ? "" : t.seriesNo)) await Lamp.updateTitle(t.id, b);
          close(); toast("“" + b.title + "” is on the Desk, linked to the Lamp Room."); location.hash = "#/book/" + encodeURIComponent(b.folder); }); } });
  }
  // the ✒ icon on a Lamp Room writing project lands here
  async function viewTitle() {
    const id = route.a;
    const linked = Store.books.find(b => b.lampTitle === id);
    if (linked) { location.replace("#/book/" + encodeURIComponent(linked.folder)); return; }
    if (Lamp.state === "needs-permission") { main.innerHTML = `<div class="gate card"><h2>One click first</h2><p>Chrome needs your OK to open the Lamp Room library from the Writing Desk. It only asks once.</p><button class="btn primary" id="lc">Connect the Lamp Room library</button></div>`; $("#lc").onclick = guard(async () => { await Lamp.connect(); viewTitle(); }); return; }
    if (Lamp.state !== "ready") { main.innerHTML = `<div class="gate card"><h2>Connect the Lamp Room</h2><p>Choose the Lamp Room's library folder so the Desk can see your writing projects.</p><button class="btn primary" id="lc">Choose the Lamp Room library…</button></div>`; $("#lc").onclick = guard(async () => { await Lamp.connect(true); viewTitle(); }); return; }
    await Lamp.load();
    const t = Lamp.byId(id);
    if (!t) { main.innerHTML = `<div class="card">That writing project isn't in the Lamp Room library this Desk is connected to. <a href="#/shelf">Back to the shelf</a></div>`; return; }
    location.replace("#/shelf"); await bringFromLamp(t);
  }

  // ---------- bookshelf ----------
  function hue(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) % 360; }
  async function viewShelf() {
    const S = Store.settings, f = JSON.parse(localStorage.getItem("wd-shelf") || "{}");
    const books = Store.books.filter(b => (!f.pen || b.penName === f.pen) && (!f.writer || b.writer === f.writer));
    const groups = {};
    for (const b of books) (groups[b.series || ""] = groups[b.series || ""] || []).push(b);
    const order = Object.keys(groups).sort((a, b) => !a ? 1 : !b ? -1 : a.localeCompare(b));
    for (const k of order) groups[k].sort((a, b) => (parseFloat(a.seriesNo) || 0) - (parseFloat(b.seriesNo) || 0) || a.title.localeCompare(b.title));
    const pens = [...new Set(Store.books.map(b => b.penName).filter(Boolean))].sort(), writers = [...new Set(Store.books.map(b => b.writer).filter(Boolean))].sort();
    main.innerHTML = `<div class="view-header"><h2>Bookshelf</h2><div class="view-header-actions">
        ${pens.length ? `<select id="fpen"><option value="">All pen names</option>${pens.map(p => `<option ${f.pen === p ? "selected" : ""}>${esc(p)}</option>`).join("")}</select>` : ""}
        ${writers.length > 1 ? `<select id="fwr"><option value="">All writers</option>${writers.map(p => `<option ${f.writer === p ? "selected" : ""}>${esc(p)}</option>`).join("")}</select>` : ""}
        <a class="btn primary" href="#/new">New book</a></div></div>
      ${!(S.writers || []).some(w => (w.name && w.name !== "Me") || (w.pens || []).some(Boolean)) ? `<div class="card hint">Add your name and pen names in <a href="#/settings">Settings</a> so books can be filed under them.</div>` : ""}
      ${!Store.books.length ? `<div class="card empty"><h2>No books yet</h2><p>Start a book from scratch, or bring in a manuscript you already have.</p><a class="btn primary" href="#/new">New book</a></div>` : ""}
      ${order.map(k => `<section class="shelf"><h3>${k ? esc(k) : "Standalone"}</h3><div class="shelf-row">${groups[k].map(b => {
        const love = Store.openLove(b).length;
        const lampMark = b.lampTitle ? ` · <span title="Linked to a writing project in the Lamp Room">🪔</span>` : "";
        return `<a class="spine" href="#/book/${encodeURIComponent(b.folder)}" data-f="${esc(b.folder)}" style="--h:${hue(b.title)}">
          <div class="cov"><div class="cov-t">${esc(b.title)}</div><div class="cov-a">${esc(b.penName || "")}</div></div>
          <div class="meta"><b>${esc(b.title)}</b><span>${b.series && b.seriesNo ? "Book " + esc(b.seriesNo) + " · " : ""}${num(Store.bookWords(b))} words${lampMark}${love ? ` · <span class="lovec" title="Love scenes still to write">♥ ${love}</span>` : ""}</span>${b.penName ? `<span class="muted">${esc(b.penName)}</span>` : ""}</div></a>`;
      }).join("")}</div></section>`).join("")}
      ${Lamp.state === "ready" && Lamp.unlinked().length ? `<section class="shelf"><h3>Writing projects in the Lamp Room, not on the Desk yet</h3><div class="shelf-row">${Lamp.unlinked().map(t => `<div class="spine lampspine" style="--h:${hue(t.name || "")}">
          <div class="cov" data-lcov="${esc(t.id)}"><div class="cov-t">${esc(t.name)}</div><div class="cov-a">${esc(t.penName || "")}</div></div>
          <div class="meta"><b>${esc(t.name)}</b><span>${t.series ? esc(t.series) + (t.seriesNo != null ? " #" + esc(t.seriesNo) : "") : "Standalone"}</span><button class="btn small" data-bring="${esc(t.id)}">Open in the Writing Desk</button></div></div>`).join("")}</div></section>` : ""}
      ${Lamp.state === "needs-permission" ? `<div class="card hint">Your Lamp Room writing projects can show up here too. <a href="#" data-lampconnect>Connect the Lamp Room library</a> (Chrome asks once).</div>` : ""}`;
    $$("[data-bring]").forEach(b => b.onclick = guard(() => bringFromLamp(Lamp.byId(b.dataset.bring))));
    for (const el of $$("[data-lcov]")) { const blob = await Lamp.coverBlob(el.dataset.lcov); if (blob) { el.style.backgroundImage = `url("${URL.createObjectURL(blob)}")`; el.classList.add("img"); } }
    wireLampConnect(main);
    const setF = (k, v) => { f[k] = v; localStorage.setItem("wd-shelf", JSON.stringify(f)); viewShelf(); };
    $("#fpen") && ($("#fpen").onchange = e => setF("pen", e.target.value));
    $("#fwr") && ($("#fwr").onchange = e => setF("writer", e.target.value));
    for (const el of $$(".spine")) { const b = Store.byFolder(el.dataset.f); const u = b && await Store.coverUrl(b); if (u) { const c = $(".cov", el); c.style.backgroundImage = `url("${u}")`; c.classList.add("img"); } }
  }

  // ---------- new book: fresh or imported ----------
  function bookFields(v = {}) {
    const pens = Store.pens(), writers = (Store.settings.writers || []).map(w => w.name);
    return `<div class="fields">
      <label class="grow">Title<input name="title" required value="${esc(v.title || "")}"></label>
      <label class="grow">Series<input name="series" list="serieslist" value="${esc(v.series || "")}" placeholder="Leave empty for a standalone"></label>
      <datalist id="serieslist">${[...new Set(Store.books.map(b => b.series).filter(Boolean))].map(s => `<option value="${esc(s)}">`).join("")}</datalist>
      <label class="short">Book no.<input name="seriesNo" value="${esc(v.seriesNo || "")}"></label>
      <label>Pen name<select name="penName"><option value="">(none)</option>${pens.map(p => `<option ${v.penName === p.pen ? "selected" : ""} data-w="${esc(p.writer)}">${esc(p.pen)}</option>`).join("")}</select></label>
      <label>Writer<select name="writer">${writers.map(w => `<option ${v.writer === w ? "selected" : ""}>${esc(w)}</option>`).join("")}</select></label>
      <label>Genre<input name="genre" list="genrelist" value="${esc(v.genre || "")}" placeholder="for the Forge"></label>
      <datalist id="genrelist">${["Harem LitRPG", "Reverse Harem Romance", "Space Opera", "Dark Fantasy"].map(g => `<option value="${g}">`).join("")}</datalist></div>`;
  }
  const formInfo = form => Object.fromEntries(["title", "series", "seriesNo", "penName", "writer", "genre"].map(k => [k, (form.elements[k] && form.elements[k].value || "").trim()]));
  function wirePen(form) { const p = form.elements.penName; p.onchange = () => { const w = p.selectedOptions[0] && p.selectedOptions[0].dataset.w; if (w) form.elements.writer.value = w; }; }
  async function readAnyText(file) { return /\.docx$/i.test(file.name) ? Import.blocksToMarkdown(await Import.readBlocks(await file.arrayBuffer())) : await file.text(); }

  function viewNew() {
    const into = route.name === "import" ? Store.byFolder(route.a) : null;
    if (route.name === "import" && !into) { location.hash = "#/new"; return; }
    main.innerHTML = `<div class="view-header"><h2>${into ? "Import a manuscript into “" + esc(into.title) + "”" : "New book"}</h2></div>
      <div class="${into ? "" : "two"}">
        ${into ? "" : `<form class="card" id="fresh"><h3>Start fresh</h3>${bookFields()}<p class="small muted">Starts with Chapter 1, Scene 1.</p>${lampOffer()}<button class="btn primary">Create book</button></form>`}
        <div class="card" id="imp"><h3>${into ? "The manuscript" : "Import a manuscript"}</h3>
          ${into && Store.bookWords(into) ? `<p class="small"><b>This book already has ${num(Store.bookWords(into))} words.</b> The imported chapters go after the ones it has; nothing is replaced.</p>` : ""}
          <p class="small">A Word <b>.docx</b> (or .md / .txt). Chapters are split at its headings, or at lines like “Chapter 12” when it has none, and scenes at its scene breaks (<code>* * *</code>, <code>#</code>, <code>***</code>).</p>
          <label class="file">Manuscript<input type="file" id="msf" accept=".docx,.md,.txt"></label>
          <div id="prev"></div></div></div>`;
    const fr = $("#fresh");
    wireLampConnect(main, viewNew);
    fr && wirePen(fr);
    fr && (fr.onsubmit = guard(async e => { e.preventDefault(); const b = await Store.createBook(formInfo(fr));
      if (fr.elements.toLamp && fr.elements.toLamp.checked) await sendToLamp(b, "outline");
      toast("“" + b.title + "” is on the shelf" + (b.lampTitle ? " and in your Lamp Room projects." : ".")); location.hash = "#/book/" + encodeURIComponent(b.folder); }));
    $("#msf").onchange = guard(async e => {
      const file = e.target.files[0]; if (!file) return;
      const blocks = /\.docx$/i.test(file.name) ? await Import.readBlocks(await file.arrayBuffer()) : Import.blocksFromText(await file.text());
      const chapters = Import.splitManuscript(blocks);
      if (!chapters.length) { toast("No text found in that file."); return; }
      const total = chapters.reduce((a, c) => a + c.words, 0);
      $("#prev").innerHTML = `<form id="impf">${into ? "" : bookFields({ title: file.name.replace(/\.\w+$/, "") })}
        <h3>What we found: ${chapters.length} chapter${chapters.length === 1 ? "" : "s"}, ${num(total)} words</h3>
        <div class="found">${chapters.map((c, i) => `<label class="check"><input type="checkbox" data-i="${i}" ${c.front && c.words < 300 ? "" : "checked"}> <span class="grow">${esc(c.title)}</span><span class="muted small">${c.scenes.length} scene${c.scenes.length === 1 ? "" : "s"} · ${num(c.words)} words</span></label>`).join("")}</div>
        <p class="small muted">Untick anything you don't want, such as a title page or copyright page.</p>
        <label class="file">Story bible and codex files (optional, .docx, .md or .txt; pick several)<input type="file" id="reff" multiple accept=".docx,.md,.txt"></label>
        <p class="small muted">These go on the book's reference shelf as read-only copies; the original files are kept beside them.</p>
        ${into ? "" : lampOffer()}<button class="btn primary">${into ? "Import into this book" : "Import book"}</button></form>`;
      const f = $("#impf"); into || wirePen(f); wireLampConnect(f, () => $("#msf").dispatchEvent(new Event("change")));
      f.onsubmit = guard(async ev => {
        ev.preventDefault();
        const keep = $$("[data-i]", f).filter(c => c.checked).map(c => chapters[+c.dataset.i]);
        if (!keep.length) { toast("Tick at least one chapter."); return; }
        const info = into ? null : formInfo(f); if (info && !info.title) { toast("Give the book a title."); return; }
        toast("Importing…");
        const b = into ? await Store.importInto(into, keep) : await Store.createBook(info, keep);
        await Store.addReference(b, "Imported manuscript - " + file.name.replace(/\.\w+$/, "") + ".md", "# Imported manuscript\n\nThe text exactly as it came in from " + file.name + ", before any editing.\n\n" + keep.map(c => "## " + c.title + "\n\n" + c.scenes.map(s => s.text).join("\n* * *\n\n")).join("\n"), file);
        for (const rf of $("#reff").files) await Store.addReference(b, rf.name.replace(/\.\w+$/, "") + ".md", await readAnyText(rf), /\.docx$/i.test(rf.name) ? rf : null);
        if (f.elements.toLamp && f.elements.toLamp.checked) await sendToLamp(b, "revise");
        toast(into ? keep.length + " chapters imported into “" + b.title + "”." : "“" + b.title + "” is on the shelf: " + keep.length + " chapters" + (b.lampTitle ? ", and in your Lamp Room projects." : "."));
        location.hash = "#/book/" + encodeURIComponent(b.folder);
      });
    });
  }

  // ---------- the desk ----------
  let panelTab = localStorage.getItem("wd-panel-tab") || "beats";
  async function viewBook() {
    const book = Store.byFolder(route.a);
    if (!book) { main.innerHTML = `<div class="card">That book isn't in this library. <a href="#/shelf">Back to the shelf</a></div>`; return; }
    E.book = book;
    const showPanel = localStorage.getItem("wd-panel") !== "off", mode = localStorage.getItem("wd-mode") || Store.settings.mode || "page";
    main.innerHTML = `<div class="desk ${showPanel ? "" : "nopanel"}">
      <aside class="binder"><div class="bk-title"><a href="#/shelf" title="Back to the shelf">‹</a><span>${esc(book.title)}</span></div><div id="binder"></div>
        <button class="btn small quiet addch" id="addch">+ Chapter</button></aside>
      <section class="paper">
        <div class="rail" id="rail"></div>
        <div class="deskbar"><span id="where" class="muted small"></span><span class="spacer"></span>
          <button class="btn small quiet" id="dict" title="Dictate into the page (Chrome speech-to-text)">🎙 Dictate</button>
          <button class="btn small quiet" id="hist" title="Earlier versions of this scene">History</button>
          <button class="btn small quiet" id="seal" title="Save a version nothing can change">🔒 Seal</button>
          <button class="btn small quiet" id="seals">Seals</button>
          <button class="btn small quiet" id="mode">${mode === "page" ? "Plain" : "Book page"}</button>
          <button class="btn small quiet" id="tgp">${showPanel ? "Hide panel" : "Panel"}</button></div>
        <div id="ms-page" class="wd-${mode}"><input id="sctitle" class="sctitle" aria-label="Scene title"><div id="ed" class="ed" contenteditable="true" spellcheck="true"></div></div>
        <div class="counts small muted" id="counts"></div>
        <div id="forgeview" class="forgeview hidden"></div></section>
      <aside class="panel"><div class="tabs">${[["beats", "Beats"], ["who", "Cast"], ["ref", "Reference"], ["book", "Book"]].map(([k, l]) => `<button data-t="${k}" class="${panelTab === k ? "on" : ""}">${l}</button>`).join("")}</div><div id="ptab"></div></aside></div>`;
    renderBinder();
    if (book.lampTitle && Lamp.state === "ready") { const t = await Lamp.readTitle(book.lampTitle).catch(() => null); if (t && Forge.fromLamp(book, t)) await Store.saveBook(book); }
    forgeTab = null; renderRail();
    $("#dict").onclick = () => Dictation.toggle(); if (!Dictation.supported) $("#dict").remove();
    const ed = $("#ed");
    document.execCommand("defaultParagraphSeparator", false, "p");
    ed.addEventListener("input", onType);
    ed.addEventListener("paste", Editor.onPaste);
    ed.addEventListener("keydown", e => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); saveNow(); } });
    $("#sctitle").onchange = guard(async e => { if (!E.sc) return; await saveNow(); await Store.renameScene(E.book, E.ch, E.sc, e.target.value); renderBinder(); refreshCounts(); });
    $("#sctitle").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); ed.focus(); } };
    $("#addch").onclick = guard(async () => { const t = await promptBox("New chapter", "Chapter " + (book.chapters.length + 1), "Add"); if (!t) return; const ch = await Store.addChapter(book, t); const sc = await Store.addScene(book, ch, "Scene 1"); renderBinder(); openScene(sc.id); });
    $("#tgp").onclick = () => { localStorage.setItem("wd-panel", showPanel ? "off" : "on"); viewBook(); };
    $("#mode").onclick = () => { localStorage.setItem("wd-mode", mode === "page" ? "plain" : "page"); saveNow().then(viewBook); };
    $("#hist").onclick = guard(showHistory);
    $("#seal").onclick = guard(sealDialog);
    $("#seals").onclick = guard(showSeals);
    $$(".tabs button").forEach(b => b.onclick = () => { panelTab = b.dataset.t; localStorage.setItem("wd-panel-tab", panelTab); $$(".tabs button").forEach(x => x.classList.toggle("on", x === b)); renderPanel(); });
    const want = route.b || (book.lastOpen && Store.find(book, book.lastOpen) && book.lastOpen) || (book.chapters[0] && book.chapters[0].scenes[0] && book.chapters[0].scenes[0].id);
    if (want) await openScene(want, true); else renderPanel();
  }

  async function openScene(id, initial) {
    const book = E.book, hit = Store.find(book, id); if (!hit) return;
    if (E.sc && E.sc.id !== id) await saveNow();
    const r = await Store.readScene(book, hit.ch, hit.sc);
    Object.assign(E, { ch: hit.ch, sc: hit.sc, base: r.text, dirty: false, lastSnap: Date.now() });
    await Store.snapshot(book, hit.sc, r.text, "opened");
    $("#ed").innerHTML = Editor.mdToHtml(r.text);
    $("#sctitle").value = hit.sc.title;
    if (book.lastOpen !== id) { book.lastOpen = id; Store.saveBook(book); }
    history.replaceState(null, "", "#/book/" + encodeURIComponent(book.folder) + "/" + id);
    setSaved("saved"); renderBinder(); refreshCounts(); renderPanel();
    if (!initial) $("#ed").focus();
  }
  function refreshCounts() {
    const { book, ch, sc } = E; if (!book || !sc) return;
    const live = editorEl() ? Store.words(Editor.htmlToMd(editorEl())) : sc.words;
    const delta = live - (sc.words || 0);
    $("#counts").textContent = `Scene ${num(live)} · Chapter ${num(Store.chapterWords(ch) + delta)} · Book ${num(Store.bookWords(book) + delta)} words`;
    if (!forgeTab) $("#where").textContent = ch.title + " › " + sc.title;
  }
  setInterval(() => { if (E.sc && E.dirty) refreshCounts(); }, 1500);

  // the binder: chapters and scenes, drag to reorder, small tools on hover
  function renderBinder() {
    const book = E.book, el = $("#binder"); if (!book || !el) return;
    const closed = JSON.parse(localStorage.getItem("wd-closed") || "[]");
    el.innerHTML = book.chapters.map((c, ci) => `<div class="bch ${closed.includes(c.id) ? "closed" : ""}" data-ch="${c.id}">
      <div class="bch-h" draggable="true" data-chh="${c.id}"><button class="tw" data-tw="${c.id}">▾</button><span class="t" title="${esc(c.title)}">${esc(c.title)}</span><span class="wc">${num(Store.chapterWords(c))}</span>
        <span class="tools"><button title="Add a scene" data-adds="${c.id}">+</button><button title="Rename chapter" data-rnc="${c.id}">✎</button><button title="Move chapter to Trash" data-trc="${c.id}">🗑</button></span></div>
      <div class="bsc-list">${c.scenes.map(s => `<div class="bsc ${E.sc && E.sc.id === s.id ? "on" : ""}" draggable="true" data-sc="${s.id}">
        <span class="t" title="${esc(s.title)}">${esc(s.title)}</span>${s.love ? '<span class="lv" title="A love scene still to write">♥</span>' : ""}<span class="wc">${num(s.words)}</span>
        <span class="tools"><button title="Rename scene" data-rns="${s.id}">✎</button><button title="Move scene to Trash" data-trs="${s.id}">🗑</button></span></div>`).join("")}
        <div class="bsc drop-end" data-end="${c.id}"></div></div></div>`).join("") || `<p class="muted small">No chapters yet.</p>`;
    const chOf = id => book.chapters.find(c => c.id === id);
    $$("[data-sc]", el).forEach(n => n.onclick = e => { if (e.target.closest(".tools")) return; if (forgeTab) { forgeTab = null; renderRail(); showForge(); } guard(openScene)(n.dataset.sc); });
    $$("[data-tw]", el).forEach(b => b.onclick = () => { const id = b.dataset.tw, i = closed.indexOf(id); i < 0 ? closed.push(id) : closed.splice(i, 1); localStorage.setItem("wd-closed", JSON.stringify(closed)); renderBinder(); });
    $$("[data-adds]", el).forEach(b => b.onclick = guard(async () => { const c = chOf(b.dataset.adds); const t = await promptBox("New scene", "Scene " + (c.scenes.length + 1), "Add"); if (!t) return; const s = await Store.addScene(book, c, t); renderBinder(); openScene(s.id); }));
    $$("[data-rnc]", el).forEach(b => b.onclick = guard(async () => { const c = chOf(b.dataset.rnc); const t = await promptBox("Rename chapter", c.title); if (!t) return; await saveNow(); await Store.renameChapter(book, c, t); renderBinder(); refreshCounts(); }));
    $$("[data-rns]", el).forEach(b => b.onclick = guard(async () => { const h = Store.find(book, b.dataset.rns); const t = await promptBox("Rename scene", h.sc.title); if (!t) return; await saveNow(); await Store.renameScene(book, h.ch, h.sc, t); if (E.sc === h.sc) $("#sctitle").value = h.sc.title; renderBinder(); refreshCounts(); }));
    $$("[data-trs]", el).forEach(b => b.onclick = guard(async () => {
      const h = Store.find(book, b.dataset.trs);
      if (!(await confirmBox(`Move “${esc(h.sc.title)}” to the book's Trash folder? Its text is kept there.`, "Move to Trash"))) return;
      if (E.sc === h.sc) { await saveNow(); E.sc = null; }
      await Store.trashScene(book, h.ch, h.sc);
      if (!h.ch.scenes.length) await Store.addScene(book, h.ch, "Scene 1");
      const next = h.ch.scenes[0]; renderBinder(); if (!E.sc) openScene(next.id);
    }));
    $$("[data-trc]", el).forEach(b => b.onclick = guard(async () => {
      const c = chOf(b.dataset.trc);
      if (!(await confirmBox(`Move the chapter “${esc(c.title)}” and its ${c.scenes.length} scene(s) to the book's Trash folder?`, "Move to Trash"))) return;
      if (E.ch === c) { await saveNow(); E.sc = null; }
      await Store.trashChapter(book, c);
      if (!book.chapters.length) { const nc = await Store.addChapter(book, "Chapter 1"); await Store.addScene(book, nc, "Scene 1"); }
      renderBinder(); if (!E.sc) openScene(book.chapters[0].scenes[0].id);
    }));
    // drag and drop
    let drag = null;
    $$("[draggable]", el).forEach(n => {
      n.ondragstart = e => { drag = n.dataset.sc ? { sc: n.dataset.sc } : { ch: n.dataset.chh }; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", "wd"); n.classList.add("dragging"); };
      n.ondragend = () => { n.classList.remove("dragging"); $$(".over", el).forEach(x => x.classList.remove("over")); };
    });
    $$(".bsc, .bch-h", el).forEach(n => {
      n.ondragover = e => { if (!drag) return; if (drag.ch && !n.dataset.chh) return; e.preventDefault(); n.classList.add("over"); };
      n.ondragleave = () => n.classList.remove("over");
      n.ondrop = guard(async e => {
        e.preventDefault(); n.classList.remove("over"); const d = drag; drag = null; if (!d) return;
        await saveNow();
        if (d.ch) { await Store.moveChapter(book, d.ch, book.chapters.findIndex(c => c.id === n.dataset.chh)); }
        else if (n.dataset.sc) { const t = Store.find(book, n.dataset.sc); if (t.sc.id === d.sc) return; await Store.moveScene(book, d.sc, t.ch, t.ch.scenes.indexOf(t.sc)); }
        else { const c = chOf(n.dataset.end || n.dataset.chh); await Store.moveScene(book, d.sc, c, c.scenes.length); }
        if (E.sc) { const h = Store.find(book, E.sc.id); E.ch = h.ch; }
        renderBinder(); refreshCounts();
      });
    });
  }

  // side panel: this chapter's beats, the reference shelf, the book's details
  let refOpen = null;
  async function renderPanel() {
    const box = $("#ptab"), book = E.book; if (!box || !book) return;
    if (panelTab === "beats") {
      const ch = E.ch;
      box.innerHTML = ch ? `<h3>${esc(ch.title)}: outline &amp; beats</h3><textarea id="beats" placeholder="Paste or type this chapter's beats here.">${esc(ch.beats || "")}</textarea>
        <h3>Love scenes to write</h3>${Store.openLove(book).map(x => `<button class="lovelink" data-go="${x.sc.id}">♥ ${esc(x.ch.title)} › ${esc(x.sc.title)}</button>`).join("") || '<p class="small muted">None open. A scene with a <code>[xx — scene]</code> marker shows up here until the marker is gone.</p>'}` : "";
      let t = 0; const ta = $("#beats");
      ta && (ta.oninput = () => { clearTimeout(t); t = setTimeout(guard(async () => { ch.beats = ta.value; await Store.saveBook(book); }), 800); });
      $$("[data-go]", box).forEach(b => b.onclick = () => openScene(b.dataset.go));
    } else if (panelTab === "who") {
      const cast = book.cast || [];
      if (!cast.length) { box.innerHTML = `<p class="small muted">No one's on the list yet. Open <b>👥 Cast</b> above the page: it suggests names from the bible and the manuscript, and one click keeps them.</p>`; return; }
      const here = E.sc ? Cast.count(cast, [{ id: "s", md: Editor.htmlToMd(editorEl()) }]).s || {} : {};
      const chs = E.ch ? await scenesOf(book, [E.ch]) : [], inCh = {}; for (const r of Object.values(Cast.count(cast, chs))) for (const [k, n] of Object.entries(r)) inCh[k] = (inCh[k] || 0) + n;
      const row = (k, n) => `<div class="castrow"><span>${esc(k)}</span><span class="muted small">${n}</span></div>`;
      const list = (o, kind) => cast.filter(c => c.kind === kind && o[c.name]).map(c => row(c.name, o[c.name])).join("");
      box.innerHTML = `<h3>In this scene</h3>${list(here, "person") || '<p class="small muted">No one on the list.</p>'}${list(here, "place") ? "<h3>Places</h3>" + list(here, "place") : ""}
        <h3>In ${esc(E.ch ? E.ch.title : "this chapter")}</h3>${list(inCh, "person") || '<p class="small muted">No one on the list.</p>'}${list(inCh, "place") ? "<h3>Places</h3>" + list(inCh, "place") : ""}`;
    } else if (panelTab === "ref") {
      const files = await Store.listReference(book);
      if (refOpen && files.some(f => f.name === refOpen)) {
        const text = await Store.readReference(book, refOpen);
        box.innerHTML = `<div class="row"><button class="btn small quiet" id="refback">‹ All files</button><span class="spacer"></span><span class="badge">read-only</span></div><h3>${esc(refOpen)}</h3><div class="refdoc">${renderMd(text)}</div>`;
        $("#refback").onclick = () => { refOpen = null; renderPanel(); };
        return;
      }
      box.innerHTML = `<p class="small muted">Read-only copies of the bible, tropes, outlines and codex. The working versions live in your Claude Project; drop in a fresh copy whenever they change. The old copy is kept in <i>Reference › Previous</i>.</p>
        ${files.map(f => `<button class="reffile" data-ref="${esc(f.name)}"><b>${esc(f.name.replace(/\.md$/, ""))}</b><span class="muted small">${new Date(f.modified).toLocaleDateString()}</span></button>`).join("") || '<p class="muted small">Nothing here yet.</p>'}
        <label class="btn small file-btn">Add or replace copies…<input type="file" id="addref" multiple accept=".md,.txt,.docx" hidden></label>`;
      $$("[data-ref]", box).forEach(b => b.onclick = () => { refOpen = b.dataset.ref; renderPanel(); });
      $("#addref").onchange = guard(async e => { for (const f of e.target.files) await Store.addReference(book, f.name.replace(/\.\w+$/, "") + ".md", await readAnyText(f), /\.docx$/i.test(f.name) ? f : null); toast("Reference shelf updated."); renderPanel(); });
    } else {
      box.innerHTML = `<form id="bookf">${bookFields(book)}<button class="btn small primary">Save details</button></form>
        <h3>Cover</h3><div class="row"><label class="btn small file-btn">${book.cover ? "Replace cover…" : "Add a cover…"}<input type="file" id="covf" accept="image/*" hidden></label></div>
        <h3>Manuscript</h3><a class="btn small" href="#/import/${encodeURIComponent(book.folder)}">Import a manuscript into this book…</a>
        <h3>Lamp Room</h3>${book.lampTitle ? `<p class="small">Linked to its writing project in the Lamp Room. Title, series, pen name and cover changes here go there too. <a href="${Lamp.url()}" target="lamp-room">Open the Lamp Room ↗</a></p>` : Lamp.state === "ready" ? `<button class="btn small" id="tolamp">Add to the writer's projects in the Lamp Room</button>` : `<p class="small muted">Connect the Lamp Room library in <a href="#/settings">Settings</a> to link this book.</p>`}
        <h3>Files</h3><p class="small muted">This book's folder in your library: <code>Books/${esc(book.folder)}</code>. Each scene is a plain <code>.md</code> file; <code>CONTENTS.md</code> lists them in order.</p>`;
      const f = $("#bookf"); wirePen(f);
      f.onsubmit = guard(async e => { e.preventDefault(); const info = formInfo(f); if (!info.title) return; await Store.updateBook(book, info); $(".bk-title span").textContent = book.title;
        if (book.lampTitle && Lamp.state === "ready") await Lamp.updateTitle(book.lampTitle, book).catch(err => toast("Saved here, but the Lamp Room couldn't be updated: " + err.message));
        toast("Saved."); });
      $("#tolamp") && ($("#tolamp").onclick = guard(async () => { await sendToLamp(book, Store.bookWords(book) ? "draft" : "outline"); toast("Added to your Lamp Room projects."); renderPanel(); }));
      $("#covf").onchange = guard(async e => { const file = e.target.files[0]; if (!file) return; await Store.setCover(book, file);
        if (book.lampTitle && Lamp.state === "ready") await Lamp.setCover(book.lampTitle, file).catch(err => console.warn(err));
        toast("Cover on" + (book.lampTitle && Lamp.state === "ready" ? ", here and in the Lamp Room." : ".")); });
    }
  }

  // ---------- the Forge: stage tabs above the page ----------
  let forgeTab = null;
  function renderRail() {
    const book = E.book, el = $("#rail"); if (!book || !el) return;
    const cur = Forge.current(book);
    el.innerHTML = `<button data-ft="" class="${forgeTab ? "" : "on"}">✎ Manuscript</button><button data-ft="check" class="${forgeTab === "check" ? "on" : ""}">✓ Check</button><button data-ft="cast" class="${forgeTab === "cast" ? "on" : ""}">👥 Cast</button><span class="rail-sep"></span>` + Forge.STAGES.map(s => {
      const done = Forge.isDone(book, s.key), blocked = !done && Forge.blockedBy(book, s.key);
      return `<button data-ft="${s.key}" class="${forgeTab === s.key ? "on" : ""} ${done ? "done" : s.key === cur ? "cur" : ""} ${blocked ? "blocked" : ""}" title="${done ? "Done" : s.key === cur ? "You are here" : blocked ? "Not ready: " + esc(blocked.item[1]) + " (" + blocked.stage.label + ")" : ""}">${done ? "✓ " : s.key === cur ? "● " : ""}${s.label}</button>`;
    }).join("");
    $$("[data-ft]", el).forEach(b => b.onclick = guard(async () => { await saveNow(); forgeTab = b.dataset.ft || null; renderRail(); showForge(); }));
  }
  function showForge() {
    const fv = $("#forgeview"), on = !!forgeTab;
    $("#ms-page").classList.toggle("hidden", on); $("#counts").classList.toggle("hidden", on);
    $$(".deskbar .btn").forEach(b => b.classList.toggle("hidden", on && b.id !== "tgp"));
    fv.classList.toggle("hidden", !on);
    $("#where").textContent = forgeTab === "check" ? "Style check" : forgeTab === "cast" ? "People & places" : on ? "Series Forge" : E.ch && E.sc ? E.ch.title + " › " + E.sc.title : "";
    if (forgeTab === "check") guard(renderCheck)(); else if (forgeTab === "cast") guard(renderCast)(); else if (on) renderForge();
  }
  async function copyText(t) { try { await navigator.clipboard.writeText(t); toast("Copied. Paste it into the series' Claude Project chat."); } catch (e) { toast("Couldn't copy: select the text and copy it by hand."); } }
  function renderForge() {
    const book = E.book, s = Forge.STAGES.find(x => x.key === forgeTab), fv = $("#forgeview"); if (!s) return;
    const ctx = Forge.context(book), done = Forge.isDone(book, s.key), blocked = !done && Forge.blockedBy(book, s.key), all = Forge.allTicked(book, s.key);
    const idx = Forge.STAGES.indexOf(s), next = Forge.STAGES[idx + 1];
    const linked = book.lampTitle && Lamp.state === "ready" && s.lamp;
    fv.innerHTML = `<div class="fv-head"><h2>${esc(s.label)}</h2><span class="muted small">Series Forge ${esc(s.forge)}</span>
        ${done ? `<span class="badge ok">Done ✓</span>` : Forge.current(book) === s.key ? `<span class="badge">You are here</span>` : ""}</div>
      ${blocked ? `<div class="card hint small">Not ready yet: <b>${esc(blocked.item[1])}</b> in ${esc(blocked.stage.label)} still needs an approve. You can still look ahead.</div>` : ""}
      <p>${esc(s.intro)}</p>
      ${s.guide ? `<details class="card fguide" ${done ? "" : "open"}><summary><b>A quick guide</b></summary><div class="guide">${s.guide}</div></details>` : ""}
      ${!book.series ? `<p class="small muted">Tip: give the book a series and book number (Book tab, right) so the prompts name them.</p>` : ""}
      <div class="card fprompt"><div class="small muted">Paste into the series' Claude Project chat</div><pre id="fp">${esc(s.prompt(ctx))}</pre><button class="btn small" id="fpc">Copy</button></div>
      <h3>Checklist</h3><div class="fchecks">${s.items.map(([id, label, gate]) => `<label class="check fcheck ${gate ? "gate" : ""}"><input type="checkbox" data-ck="${id}" ${Forge.checked(book, s.key, id) ? "checked" : ""}> <span>${esc(label)}</span>${gate ? `<span class="badge">gate: approve</span>` : ""}</label>`).join("")}</div>
      ${done ? `<div class="card fdone"><b>${esc(s.label)} is done.</b>${linked ? " It's ticked in the Lamp Room too." : ""}${next ? ` Next: <a href="#" data-goft="${next.key}">${esc(next.label)}</a>.` : " That's the whole book."}<div class="row"><button class="btn small quiet" id="reopen">Reopen this stage</button></div></div>`
        : all ? `<div class="card fready"><b>Everything's ticked.</b> Mark ${esc(s.label)} done${linked ? " here and in the Lamp Room's planner" : ""}${next ? `, then hand off to ${esc(next.label)}` : ""}.
          ${next ? `<div class="small muted" style="margin-top:8px">${esc(next.label)}'s prompt:</div><pre>${esc(next.prompt(ctx))}</pre>` : ""}
          <div class="row"><button class="btn primary" id="markdone">Mark ${esc(s.label)} done${next ? " and go to " + esc(next.label) : ""}</button>${next ? `<button class="btn small" id="nextcopy">Copy ${esc(next.label)}'s prompt</button>` : ""}</div></div>`
        : `<p class="small muted">When everything's ticked, this stage hands off to the next one${linked ? " and ticks it in the Lamp Room" : ""}.</p>`}`;
    $("#fpc").onclick = () => copyText(s.prompt(ctx));
    $$("[data-ck]", fv).forEach(c => c.onchange = guard(async () => { const st = Forge.state(book); if (c.checked) st.checks[s.key + "." + c.dataset.ck] = true; else delete st.checks[s.key + "." + c.dataset.ck]; await Store.saveBook(book); renderRail(); renderForge(); }));
    $$("[data-goft]", fv).forEach(a => a.onclick = e => { e.preventDefault(); forgeTab = a.dataset.goft; renderRail(); showForge(); });
    $("#nextcopy") && ($("#nextcopy").onclick = () => copyText(next.prompt(ctx)));
    $("#markdone") && ($("#markdone").onclick = guard(async () => {
      const st = Forge.state(book); for (const x of Forge.STAGES.slice(0, idx + 1)) st.done[x.key] = true;
      await Store.saveBook(book);
      let lampMsg = "";
      if (book.lampTitle && s.lamp) { if (Lamp.state === "ready") { await Lamp.setStage(book.lampTitle, s.lamp, true); lampMsg = " Ticked in the Lamp Room too."; } else lampMsg = " Connect the Lamp Room in Settings to tick it there."; }
      toast(`${s.label} done.${lampMsg}`);
      if (next) forgeTab = next.key; renderRail(); showForge();
    }));
    $("#reopen") && ($("#reopen").onclick = guard(async () => {
      const st = Forge.state(book); for (const x of Forge.STAGES.slice(idx)) delete st.done[x.key];
      await Store.saveBook(book);
      if (book.lampTitle && s.lamp && Lamp.state === "ready") await Lamp.setStage(book.lampTitle, s.lamp, false);
      toast(`${s.label} reopened.`); renderRail(); renderForge();
    }));
  }

  // ---------- reading the book's text for checks and cast ----------
  async function scenesOf(book, chapters) {
    const out = [];
    for (const c of chapters || book.chapters) for (const sc of c.scenes) {
      const md = E.sc && E.sc.id === sc.id && editorEl() ? Editor.htmlToMd(editorEl()) : (await Store.readScene(book, c, sc)).text;
      out.push({ id: sc.id, ch: c.title, chId: c.id, title: sc.title, md });
    }
    return out;
  }
  async function goFind(sceneId, phrases) {
    forgeTab = null; renderRail(); showForge();
    if (!E.sc || E.sc.id !== sceneId) await openScene(sceneId);
    const n = Checks.highlight(editorEl(), [].concat(phrases));
    if (!n) toast("Opened the scene; the exact spot may have changed since the check.");
  }

  // ---------- the style checker ----------
  let checkScope = localStorage.getItem("wd-check-scope") || "chapter", openSec = JSON.parse(localStorage.getItem("wd-check-open") || '["tells"]');
  async function renderCheck() {
    const book = E.book, fv = $("#forgeview");
    fv.innerHTML = `<div class="fv-head"><h2>Style check</h2><span class="muted small">On this computer: no AI, no internet</span></div><p class="small muted">Working…</p>`;
    await saveNow();
    const chs = checkScope === "book" ? book.chapters : checkScope === "chapter" && E.ch ? [E.ch] : null;
    const scenes = chs ? await scenesOf(book, chs) : E.sc ? (await scenesOf(book, [E.ch])).filter(x => x.id === E.sc.id) : [];
    const pack = book.genre ? await Store.readPack(book.genre) : null;
    const R = Checks.run(scenes, pack && pack.checks, (book.cast || []).flatMap(c => [c.name, ...(c.aliases || [])]).flatMap(n => n.split(" ")), chs ? chs.length : 1);
    const fl = R.flesch, ease = fl >= 80 ? "very easy" : fl >= 70 ? "easy" : fl >= 60 ? "plain" : fl >= 50 ? "fairly hard" : "hard";
    const ex = list => list.map(e => `<div class="ex"><span class="muted small">${esc(e.where)}</span> ${e.text ? esc(e.text) : `<i>${esc(e.find)}</i>`} <button class="btn small quiet" data-go="${esc(e.scene)}" data-find="${esc(e.find || "")}">Show</button></div>`).join("");
    const sec = (key, title, count, body, note) => `<details class="csec" data-sec="${key}" ${openSec.includes(key) ? "open" : ""}><summary><b>${title}</b>${count != null ? ` <span class="badge ${count ? "" : "ok"}">${count}</span>` : ""}</summary>${note ? `<p class="small muted">${note}</p>` : ""}${body}</details>`;
    const rowEx = (label, n, list, extra) => `<details class="crow"><summary><span>${label}</span><span class="muted small">${extra || ""}</span><b>${n}</b></summary>${ex(list)}</details>`;
    const scopeName = checkScope === "book" ? "the whole book" : checkScope === "chapter" ? (E.ch ? E.ch.title : "this chapter") : (E.sc ? E.sc.title : "this scene");
    fv.innerHTML = `<div class="fv-head"><h2>Style check</h2><span class="muted small">On this computer: no AI, no internet</span></div>
      <div class="row chips">${[["scene", "This scene"], ["chapter", "This chapter"], ["book", "Whole book"]].map(([k, l]) => `<button class="btn small ${checkScope === k ? "primary" : "quiet"}" data-scope="${k}">${l}</button>`).join("")}<span class="spacer"></span><button class="btn small quiet" id="rerun">Check again</button></div>
      ${!R.words ? `<p class="muted">No words in ${esc(scopeName)} yet.</p>` : `
      <div class="tiles">
        <div class="tile"><span>Words</span><b>${num(R.words)}</b><em>${esc(scopeName)}</em></div>
        <div class="tile"><span>Readability</span><b>${Math.round(fl)}</b><em>${ease} · grade ${R.grade.toFixed(1)}</em></div>
        <div class="tile"><span>Sentence</span><b>${R.avgSent.toFixed(1)}</b><em>words on average</em></div>
        <div class="tile"><span>Dialogue</span><b>${R.dialoguePct}%</b><em>of the text</em></div>
        <div class="tile"><span>Adverbs</span><b>${R.rates.adverbs.toFixed(1)}</b><em>per 1,000 words, narration</em></div>
        <div class="tile"><span>AI tells</span><b>${R.tellList.reduce((a, t) => a + t.n, 0)}</b><em>in narration</em></div></div>
      ${book.genre ? `<p class="small muted">Using the <b>${esc(book.genre)}</b> genre pack's extra tells and budgets.${pack ? "" : " (No pack file found for it: Settings › Genre packs.)"}</p>` : `<p class="small muted">Give the book a genre (Book tab) and the checker adds that genre pack's tells and budgets.</p>`}
      ${sec("tells", "AI tells", R.tellList.reduce((a, t) => a + t.n, 0), R.tellList.map(t => rowEx(esc(t.k), t.n, t.ex)).join("") || '<p class="small">None found.</p>', "Stock phrases from Series Forge's list and your genre pack, in narration only. Dialogue is the character's voice.")}
      ${sec("words", "Overused words", R.watchList.filter(w => w.over).length, `<div class="wgrid">${R.watchList.map(w => `<button class="wchip ${w.over ? "over" : ""}" data-word="${esc(w.w)}" title="${w.rate.toFixed(1)} per 1,000 words (watch above ${Checks.WATCH[w.w]})"><b>${esc(w.w)}</b> ${w.n}</button>`).join("")}</div>
        <h4>Most used words</h4><div class="wgrid">${R.top.map(w => `<button class="wchip" data-word="${esc(w.w)}"><b>${esc(w.w)}</b> ${w.n}</button>`).join("")}</div>`, "Highlighted words are over the usual rate for fiction. Click any word to light it up in the open scene.")}
      ${sec("repeat", "Repetition", R.echoList.length + R.repeats.length + R.starts.length, `
        <h4>Echoes: the same word again within 40 words</h4>${R.echoList.map(e => rowEx(esc(e.w), e.n, e.ex.map(x => ({ ...x, find: e.w })))).join("") || '<p class="small">None.</p>'}
        <h4>Repeated phrases (five words or more)</h4>${R.repeats.map(r => rowEx("“" + esc(r.k) + "”", r.n, r.where)).join("") || '<p class="small">None.</p>'}
        <h4>Three sentences in a row starting the same way</h4>${R.starts.length ? ex(R.starts) : '<p class="small">None.</p>'}`, "Callbacks and catchphrases you meant are fine: these are candidates, not mistakes.")}
      ${sec("pace", "Pacing and readability", R.longPara.length + R.longSent.length, `
        <table class="ctable"><tr><th>Chapter</th><th>Words</th><th>Avg sentence</th><th>Variety</th><th>Avg paragraph</th><th>Dialogue</th></tr>${R.chapterRows.map(r => `<tr><td>${esc(r.ch)}</td><td>${num(r.words)}</td><td>${r.avgSent.toFixed(1)}</td><td title="How much sentence length varies. Low means a flat rhythm.">${r.variety < 5 ? '<span class="bad">' + r.variety.toFixed(1) + "</span>" : r.variety.toFixed(1)}</td><td>${r.avgPara.toFixed(0)} words</td><td>${r.dialoguePct}%</td></tr>`).join("")}</table>
        <h4>Long narration paragraphs (over 4 sentences)</h4>${R.longPara.length ? ex(R.longPara) : '<p class="small">None.</p>'}
        ${R.walls.length ? `<h4>Walls of text: three long paragraphs in a row</h4>${ex(R.walls)}` : ""}
        <h4>Long sentences (over 35 words)</h4>${R.longSent.length ? ex(R.longSent) : '<p class="small">None.</p>'}`)}
      ${sec("tags", "Dialogue tags", R.notSpeech.length + R.tagAdverbs.length, `
        <p class="small">${num(R.tagsTotal)} tags on ${num(R.linesTotal)} lines of dialogue${R.linesTotal ? ` (${Math.round(100 * R.tagsTotal / R.linesTotal)}%)` : ""}.</p>
        <div class="wgrid">${R.tagList.map(t => `<button class="wchip ${t.plain ? "" : "over"}" data-word="${esc(t.k)}"><b>${esc(t.k)}</b> ${t.n}</button>`).join("")}</div>
        <h4>Not ways of speaking (smiled, laughed, shrugged… used as a tag)</h4>${R.notSpeech.length ? ex(R.notSpeech) : '<p class="small">None.</p>'}
        <h4>Adverbs on tags</h4>${R.tagAdverbs.length ? ex(R.tagAdverbs) : '<p class="small">None.</p>'}`, "Said and asked disappear; everything else is highlighted so you can see how often you reach for it.")}
      ${sec("style", "Style report", R.emDash.length + R.notXbutY.length, `
        ${rowEx("Em-dashes", R.emDash.length, R.emDash.slice(0, 6), R.rates.emDash.toFixed(1) + " per 1,000")}
        ${rowEx("“Not X, but Y”", R.notXbutY.length, R.notXbutY.slice(0, 6))}
        ${rowEx("Passive voice (narration)", R.passive.length, R.passive.slice(0, 6), R.rates.passive.toFixed(1) + " per 1,000")}
        <div class="crow plain"><span>Filter words (felt, saw, heard, realized…) in narration</span><b>${R.rates.filter.toFixed(1)} per 1,000</b></div>
        <div class="crow plain"><span>Exclamation marks in narration</span><b>${R.exclaim}</b></div>`)}
      ${R.budgetList.length ? sec("budgets", "Budgets from the genre pack", R.budgetList.filter(b => b.over).length, R.budgetList.map(b => `<div class="crow plain ${b.over ? "bad" : ""}"><span>${esc(b.k)}</span><b>${b.n} / ${b.lim}</b></div>`).join("")) : ""}`}`;
    $$("[data-scope]", fv).forEach(b => b.onclick = () => { checkScope = b.dataset.scope; localStorage.setItem("wd-check-scope", checkScope); renderCheck(); });
    $("#rerun", fv).onclick = () => renderCheck();
    $$("details.csec", fv).forEach(d => d.ontoggle = () => { const k = d.dataset.sec; openSec = openSec.filter(x => x !== k); if (d.open) openSec.push(k); localStorage.setItem("wd-check-open", JSON.stringify(openSec)); });
    $$("[data-go]", fv).forEach(b => b.onclick = guard(() => goFind(b.dataset.go, b.dataset.find)));
    $$("[data-word]", fv).forEach(b => b.onclick = guard(async () => { forgeTab = null; renderRail(); showForge(); const n = Checks.highlight(editorEl(), [" " + b.dataset.word + " ", " " + b.dataset.word + ".", " " + b.dataset.word + ",", b.dataset.word + " "]); toast(n ? `“${b.dataset.word}” lit up in this scene (${n}). Typing clears it.` : `No “${b.dataset.word}” in this scene.`); }));
  }

  // ---------- people and places ----------
  async function renderCast() {
    const book = E.book, fv = $("#forgeview"); book.cast = book.cast || [];
    fv.innerHTML = `<div class="fv-head"><h2>People &amp; places</h2></div><p class="small muted">Reading the book…</p>`;
    await saveNow();
    const scenes = await scenesOf(book);
    const refs = await Store.listReference(book); let bible = "";
    for (const r of refs) if (!/^Imported manuscript/i.test(r.name)) bible += "\n" + await Store.readReference(book, r.name);
    const sug = Cast.suggest(bible, scenes.map(s => s.md), book.cast);
    const counts = Cast.count(book.cast, scenes);
    const byCh = book.chapters.map(c => { const o = {}; for (const sc of c.scenes) for (const [k, n] of Object.entries(counts[sc.id] || {})) o[k] = (o[k] || 0) + n; return o; });
    const max = Math.max(1, ...byCh.flatMap(o => Object.values(o)));
    const rowFor = c => {
      const cells = byCh.map(o => o[c.name] || 0), seen = cells.map((n, i) => n ? i : -1).filter(i => i >= 0), total = cells.reduce((a, b) => a + b, 0);
      let gap = 0, best = 0; for (let i = (seen[0] ?? cells.length); i < cells.length; i++) { gap = cells[i] ? 0 : gap + 1; best = Math.max(best, gap); }
      const lastGap = seen.length ? cells.length - 1 - seen[seen.length - 1] : 0;
      return `<tr><th><span class="cname">${esc(c.name)}</span>${(c.aliases || []).length ? `<span class="muted small"> · ${esc(c.aliases.join(", "))}</span>` : ""}</th>${cells.map((n, i) => `<td class="hc" style="--a:${n ? 0.15 + 0.85 * n / max : 0}" ${n ? `data-cell="${i}" data-name="${esc(c.name)}"` : ""} title="${esc(book.chapters[i].title)}: ${n}">${n || ""}</td>`).join("")}
        <td>${total}</td><td class="small">${seen.length ? esc(book.chapters[seen[0]].title) : "—"}</td><td class="small ${lastGap >= 3 ? "bad" : ""}">${!seen.length ? "never appears" : lastGap >= 3 ? `gone for the last ${lastGap} chapters` : best >= 3 ? `a ${best}-chapter gap` : ""}</td>
        <td><button class="btn small quiet" data-edit="${esc(c.name)}" title="Aliases">✎</button><button class="btn small quiet" data-del="${esc(c.name)}" title="Take off the list">✕</button></td></tr>`;
    };
    const table = kind => { const cs = book.cast.filter(c => c.kind === kind); return cs.length ? `<div class="hscroll"><table class="ctable heat"><tr><th>${kind === "person" ? "People" : "Places"}</th>${book.chapters.map((c, i) => `<th title="${esc(c.title)}">${i + 1}</th>`).join("")}<th>Total</th><th>First</th><th></th><th></th></tr>${cs.map(rowFor).join("")}</table></div>` : ""; };
    fv.innerHTML = `<div class="fv-head"><h2>People &amp; places</h2><span class="muted small">When and how often each one turns up, chapter by chapter</span></div>
      ${book.cast.length ? table("person") + table("place") + `<p class="small muted">Click a number to open the first scene in that chapter where the name turns up.</p>` : `<p>No one's on the list yet. Keep the suggestions below with one click.</p>`}
      ${sug.length ? `<div class="card sugg"><h3>Suggested</h3><p class="small muted">From the bible and codex on the reference shelf, and from names that keep turning up in the manuscript. Untick anything that isn't a person or a place.</p>
        <div class="found">${sug.map((c, i) => `<label class="check"><input type="checkbox" data-s="${i}" ${c.from === "bible" || c.kind === "place" ? "checked" : ""}> <span class="grow"><b>${esc(c.name)}</b>${c.aliases.length ? ` <span class="muted small">also ${esc(c.aliases.join(", "))}</span>` : ""}</span><select data-k="${i}"><option value="person" ${c.kind === "person" ? "selected" : ""}>person</option><option value="place" ${c.kind === "place" ? "selected" : ""}>place</option></select><span class="muted small">${c.from}</span></label>`).join("")}</div>
        <button class="btn primary" id="keep">Keep the ticked ones</button></div>` : ""}
      <form class="row" id="addn"><input id="nn" placeholder="Add a name"><select id="nk"><option value="person">person</option><option value="place">place</option></select><button class="btn small">Add</button></form>`;
    const save = async () => { await Store.saveBook(book); renderCast(); };
    $("#keep") && ($("#keep").onclick = guard(async () => { for (const c of $$("[data-s]", fv)) if (c.checked) { const x = sug[+c.dataset.s]; book.cast.push({ name: x.name, aliases: x.aliases, kind: $(`[data-k="${c.dataset.s}"]`, fv).value }); } await save(); }));
    $("#addn").onsubmit = guard(async e => { e.preventDefault(); const n = $("#nn").value.trim(); if (!n || book.cast.some(c => c.name === n)) return; book.cast.push({ name: n, aliases: n.includes(" ") ? [n.split(" ")[0]] : [], kind: $("#nk").value }); await save(); });
    $$("[data-del]", fv).forEach(b => b.onclick = guard(async () => { book.cast = book.cast.filter(c => c.name !== b.dataset.del); await save(); }));
    $$("[data-edit]", fv).forEach(b => b.onclick = guard(async () => { const c = book.cast.find(x => x.name === b.dataset.edit); const v = await promptBox(`Other names for ${c.name} (commas between)`, (c.aliases || []).join(", ")); if (v == null) return; c.aliases = v.split(",").map(x => x.trim()).filter(Boolean); await save(); }));
    $$("[data-cell]", fv).forEach(td => td.onclick = guard(async () => {
      const ch = book.chapters[+td.dataset.cell], c = book.cast.find(x => x.name === td.dataset.name);
      const sc = ch.scenes.find(s => (counts[s.id] || {})[c.name]); if (sc) await goFind(sc.id, [c.name, ...(c.aliases || [])]);
    }));
  }

  // ---------- history: earlier versions of the open scene ----------
  async function showHistory() {
    const { book, ch, sc } = E; if (!sc) return;
    await saveNow();
    const snaps = await Store.listSnapshots(book, sc);
    if (!snaps.length) { toast("No earlier versions of this scene yet."); return; }
    await modal(`<h2>History: ${esc(sc.title)}</h2><div class="hist"><div class="hist-list">${snaps.map((s, i) => `<button data-s="${esc(s.name)}" class="${i ? "" : "on"}"><b>${esc(s.when)}</b><span class="muted small">${esc(s.why)}</span></button>`).join("")}</div>
      <div class="hist-view"><div class="refdoc" id="hv"></div><div class="row end"><button class="btn quiet" data-close>Close</button><button class="btn primary" id="restore">Restore this version</button></div></div></div>`,
      { wide: true, mount: (d, close) => {
        let cur = snaps[0].name;
        const show = async n => { cur = n; $$("[data-s]", d).forEach(b => b.classList.toggle("on", b.dataset.s === n)); $("#hv", d).innerHTML = renderMd(await Store.readSnapshot(book, sc, n)); };
        $$("[data-s]", d).forEach(b => b.onclick = () => show(b.dataset.s));
        $("#restore", d).onclick = guard(async () => {
          const t = await Store.readSnapshot(book, sc, cur);
          await Store.snapshot(book, sc, E.base, "before restore");
          await Store.writeScene(book, ch, sc, t, true); E.base = t; if (E.sc === sc) $("#ed").innerHTML = Editor.mdToHtml(t);
          renderBinder(); refreshCounts(); close(); toast("Restored. The version you replaced is in History too.");
        });
        show(cur);
      } });
  }

  // ---------- sealed versions ----------
  async function sealDialog() {
    const book = E.book; await saveNow();
    const name = await modal(`<h2>Seal a version</h2><p class="small">A sealed version is a copy nothing can change: not the Desk, not Claude. You can always start a new draft from it; the seal stays as it is.</p>
      <form id="sf"><label class="wide">Name<input id="sn" placeholder="Draft 2, sent to beta readers" autofocus></label>
      <div class="scope"><label class="check"><input type="radio" name="sc" value="book" checked> The whole book (${num(Store.bookWords(book))} words)</label>
        ${E.ch ? `<label class="check"><input type="radio" name="sc" value="ch"> Just ${esc(E.ch.title)} (${num(Store.chapterWords(E.ch))} words)</label>` : ""}
        <label class="check"><input type="radio" name="sc" value="pick"> Chapters I pick</label><div id="pick" class="found hidden">${book.chapters.map(c => `<label class="check"><input type="checkbox" value="${c.id}"> ${esc(c.title)}</label>`).join("")}</div></div>
      <div class="row end"><button type="button" class="btn quiet" data-close>Cancel</button><button class="btn primary">🔒 Seal</button></div></form>`,
      { mount: (d, close) => {
        $$("[name=sc]", d).forEach(r => r.onchange = () => $("#pick", d).classList.toggle("hidden", r.value !== "pick" || !r.checked));
        $("#sf", d).onsubmit = e => { e.preventDefault(); const n = $("#sn", d).value.trim(); if (!n) { $("#sn", d).focus(); return; }
          const s = $("[name=sc]:checked", d).value; close({ n, ids: s === "book" ? null : s === "ch" ? [E.ch.id] : $$("#pick input:checked", d).map(c => c.value) }); };
      } });
    if (!name) return;
    if (name.ids && !name.ids.length) { toast("Pick at least one chapter."); return; }
    const s = await Store.seal(book, name.n, name.ids);
    toast(`🔒 Sealed “${s.name}”: ${s.files.length} scene${s.files.length === 1 ? "" : "s"}, ${num(s.words)} words.`, 5000);
  }
  async function showSeals() {
    const book = E.book, seals = await Store.listSeals(book);
    if (!seals.length) { toast("No sealed versions yet. Use 🔒 Seal to make one."); return; }
    await modal(`<h2>Sealed versions</h2><div class="seals">${seals.map((s, i) => `<div class="seal"><div><b>🔒 ${esc(s.name)}</b><div class="small muted">${new Date(s.date).toLocaleString()} · ${s.scope === "book" ? "whole book" : esc((s.chapters || []).join(", "))} · ${num(s.words)} words</div><div class="small" id="v${i}"></div></div>
      <div class="row"><button class="btn small" data-view="${i}">Read</button><button class="btn small" data-ver="${i}">Check fingerprint</button><button class="btn small" data-draft="${i}">New draft from this</button></div></div>`).join("")}</div>
      <div class="row end"><button class="btn quiet" data-close>Close</button></div>`,
      { wide: true, mount: (d, close) => {
        $$("[data-ver]", d).forEach(b => b.onclick = guard(async () => { const i = +b.dataset.ver, r = await Store.verifySeal(book, seals[i]); const bad = r.results.filter(x => x.state !== "ok");
          $("#v" + i, d).innerHTML = r.ok ? `<span class="badge ok">Unchanged since it was sealed ✓</span>` : `<span class="badge bad">Changed: ${bad.length ? bad.map(x => esc(x.path) + " (" + x.state + ")").join(", ") : "the file list was edited"}</span>`; }));
        $$("[data-view]", d).forEach(b => b.onclick = guard(async () => { const s = seals[+b.dataset.view]; let html = ""; let last = "";
          for (const f of s.files) { if (f.chapter !== last) { html += `<h3>${esc(f.chapter)}</h3>`; last = f.chapter; } html += `<h4>${esc(f.scene)}</h4>` + renderMd(await Store.readSealed(book, s, f.path) || ""); }
          close(); await modal(`<h2>🔒 ${esc(s.name)}</h2><p class="small muted">Sealed ${new Date(s.date).toLocaleString()}. Read-only.</p><div class="refdoc sealed">${html}</div><div class="row end"><button class="btn primary" data-close>Close</button></div>`, { wide: true }); }));
        $$("[data-draft]", d).forEach(b => b.onclick = guard(async () => { const s = seals[+b.dataset.draft];
          if (!(await confirmBox(`Copy the text of “${esc(s.name)}” back into your working draft? Each scene's current text goes into its History first, and the seal stays exactly as it is.`, "Start the new draft"))) return;
          await saveNow(); const r = await Store.draftFromSeal(book, s); if (E.sc) { const t = (await Store.readScene(book, E.ch, E.sc)).text; E.base = t; $("#ed").innerHTML = Editor.mdToHtml(t); }
          renderBinder(); refreshCounts(); toast(`Working draft now matches “${s.name}” (${r.n} scenes).`); }));
      } });
  }

  async function editPack(g) {
    const p = (await Store.readPack(g)) || { text: "", checks: { tells: [], budgets: {}, ignore: [] } };
    await modal(`<h2>${esc(g)} genre pack</h2>
      <form id="pk"><label class="wide">The pack<textarea id="pt" class="packtext">${esc(p.text)}</textarea></label>
      <div class="row"><label class="btn small file-btn">Replace from a file (.docx, .md)…<input type="file" id="pf2" accept=".docx,.md,.txt" hidden></label><span class="small muted">The old copy is kept in Genre Packs › Previous.</span></div>
      <h3>For the style checker</h3><div class="two">
        <label>Extra AI tells and stock phrases, one per line<textarea id="ptl">${esc((p.checks.tells || []).join("\n"))}</textarea></label>
        <label>Budgets, one per line: <i>phrase: times per chapter</i><textarea id="pbu">${esc(Object.entries(p.checks.budgets || {}).map(([k, v]) => k + ": " + v).join("\n"))}</textarea></label></div>
      <label class="wide">Lines that legitimately repeat (sign-on, sign-off, status-screen headers), one per line<textarea id="pig">${esc((p.checks.ignore || []).join("\n"))}</textarea></label>
      <div class="row end"><button type="button" class="btn quiet" data-close>Cancel</button><button class="btn primary">Save pack</button></div></form>`,
      { wide: true, mount: (d, close) => {
        $("#pf2", d).onchange = guard(async e => { const f = e.target.files[0]; if (f) $("#pt", d).value = await readAnyText(f); });
        $("#pk", d).onsubmit = guard(async e => { e.preventDefault();
          const lines = id => $(id, d).value.split("\n").map(x => x.trim()).filter(Boolean);
          const budgets = {}; for (const l of lines("#pbu")) { const m = l.match(/^(.+?)\s*[:=]\s*(\d+(?:\.\d+)?)$/); if (m) budgets[m[1].trim()] = +m[2]; }
          await Store.savePack(g, $("#pt", d).value, { tells: lines("#ptl"), budgets, ignore: lines("#pig") }); close(true); toast("Pack saved."); });
      } });
  }

  // ---------- settings ----------
  function viewSettings() {
    const S = Store.settings;
    main.innerHTML = `<div class="view-header"><h2>Settings</h2></div>
      <div class="card"><h3>Look</h3><div class="fields">
        <label>Theme<select id="th">${THEMES.map(([k, l]) => `<option value="${k}" ${S.theme === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label>Text size<input type="range" id="ts" min="15" max="26" value="${S.textSize || 19}"></label>
        <label>Editor<select id="md"><option value="page" ${S.mode !== "plain" ? "selected" : ""}>Book page</option><option value="plain" ${S.mode === "plain" ? "selected" : ""}>Plain</option></select></label></div>
        <label>Bookshelf wall<select id="wall"><option value="wood" ${(S.shelfWall || "wood") === "wood" ? "selected" : ""}>Wood shelves (in the theme's colours)</option><option value="photo" ${S.shelfWall === "photo" ? "selected" : ""}>My own picture, tinted by the theme</option><option value="plain" ${S.shelfWall === "plain" ? "selected" : ""}>Plain</option></select></label>
        <div class="row ${S.shelfWall === "photo" ? "" : "hidden"}" id="wallrow"><label class="btn small file-btn">Choose a picture…<input type="file" id="wallf" accept="image/*" hidden></label><span class="small muted">A photo of a library or a bookcase works well. It stays in your library folder.</span></div>
        <label class="check"><input type="checkbox" id="calm" ${S.calm ? "checked" : ""}> Calm: no moving backgrounds</label>
        <p class="small muted">The themes come straight from the Lamp Room, so a theme added there shows up here too.</p></div>
      <div class="card"><h3>Writers and pen names</h3><div id="wr"></div><button class="btn small" id="addw">+ Writer</button>
        <p class="small muted">Each book is filed under a writer and a pen name. The bookshelf can filter by either.</p></div>
      <div class="card"><h3>Genre packs</h3><p class="small muted">The master copies, in your library's <i>Genre Packs</i> folder. A book's genre (Book tab) decides which pack the style checker uses. Each pack also holds its own extra tells, budgets and ignored lines.</p>
        <div id="packs" class="packs"></div><button class="btn small quiet" id="addpack">+ Genre</button></div>
      <div class="card"><h3>Lamp Room</h3>${Lamp.state === "ready" ? `<p>Connected to <b>${esc(Lamp.name())}</b>: ${Lamp.titles.length} writing project${Lamp.titles.length === 1 ? "" : "s"}.</p>` : Lamp.state === "needs-permission" ? `<p>The Lamp Room library this browser uses, <b>${esc(Lamp.name())}</b>, needs your OK.</p>` : `<p>Not connected yet.</p>`}
        <div class="row">${Lamp.state === "ready" ? "" : `<button class="btn primary" id="lampc">${Lamp.state === "needs-permission" ? "Connect the Lamp Room library" : "Choose the Lamp Room library…"}</button>`}${Store.testMode ? "" : `<button class="btn quiet" id="lampn">Use a different folder…</button>`}</div>
        <p class="small muted">New books can go into your Lamp Room writing projects at the same time, and writing projects there can be opened here. The Desk only touches writing projects: their title, series, pen name and cover. It never changes audio projects, stages, hours or dates.</p></div>
      <div class="card"><h3>Library</h3><p>This computer's library: <b>${esc(Store.folderName())}</b></p>
        <div class="row"><button class="btn" id="bk">Back up library…</button>${Store.testMode ? "" : '<button class="btn quiet" id="chg">Use a different folder…</button>'}</div>
        <p class="small muted">The backup is one .zip of everything: books, history and seals. Time Machine backs the folder up too.</p>
        <label>Versions kept per scene in History<input type="number" id="keep" min="10" max="1000" value="${S.snapKeep || 100}"></label></div>`;
    const save = guard(async () => { await Store.saveSettings(); });
    $("#th").onchange = e => { S.theme = e.target.value; applyLook(); save(); };
    $("#ts").oninput = e => { S.textSize = +e.target.value; applyLook(); };
    $("#ts").onchange = save;
    $("#md").onchange = e => { S.mode = e.target.value; localStorage.removeItem("wd-mode"); save(); };
    $("#calm").onchange = e => { S.calm = e.target.checked; save(); };
    $("#wall").onchange = e => { S.shelfWall = e.target.value; $("#wallrow").classList.toggle("hidden", S.shelfWall !== "photo"); save(); };
    $("#wallf").onchange = guard(async e => { const f = e.target.files[0]; if (!f) return; const w = await (await Store.root.getFileHandle("shelf-wall.jpg", { create: true })).createWritable(); await w.write(f); await w.close(); wallUrl = null; toast("Picture saved. It shows on the bookshelf."); });
    $("#keep").onchange = e => { S.snapKeep = Math.max(10, +e.target.value || 100); save(); };
    const drawW = () => {
      $("#wr").innerHTML = (S.writers || []).map((w, i) => `<div class="fields wrow"><label>Writer<input data-w="${i}" value="${esc(w.name)}"></label>
        ${[0, 1].concat((w.pens || []).slice(2).map((_, j) => j + 2)).map(j => `<label>Pen name ${j + 1}<input data-p="${i}:${j}" value="${esc((w.pens || [])[j] || "")}"></label>`).join("")}
        <button class="btn small quiet" data-morep="${i}" title="Another pen name">+ pen name</button>${S.writers.length > 1 ? `<button class="btn small quiet" data-delw="${i}" title="Remove writer">✕</button>` : ""}</div>`).join("");
      $$("[data-w]").forEach(x => x.oninput = x.onchange = () => { S.writers[+x.dataset.w].name = x.value.trim() || "Writer"; save(); });
      $$("[data-p]").forEach(x => x.oninput = x.onchange = () => { const [i, j] = x.dataset.p.split(":").map(Number); const p = S.writers[i].pens = S.writers[i].pens || []; p[j] = x.value.trim(); S.writers[i].pens = p.map(v => v || ""); save(); });
      $$("[data-morep]").forEach(x => x.onclick = () => { const w = S.writers[+x.dataset.morep]; w.pens = (w.pens || []).concat(["", ""]).slice(0, Math.max(2, (w.pens || []).length) + 1); drawW(); });
      $$("[data-delw]").forEach(x => x.onclick = () => { S.writers.splice(+x.dataset.delw, 1); save(); drawW(); });
    };
    drawW();
    $("#addw").onclick = () => { S.writers.push({ name: "Writer " + (S.writers.length + 1), pens: [] }); save(); drawW(); };
    $("#bk").onclick = guard(async () => {
      toast("Packing up the library…");
      const blob = await Store.backupZip(), name = `Writing Desk Library ${Store.stamp().slice(0, 10)}.zip`;
      if (window.showSaveFilePicker) { try { const h = await showSaveFilePicker({ suggestedName: name, types: [{ description: "Zip", accept: { "application/zip": [".zip"] } }] }); const w = await h.createWritable(); await w.write(blob); await w.close(); toast("Backup saved."); } catch (e) { if (e.name !== "AbortError") throw e; } }
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); }
    });
    const drawPacks = guard(async () => { const ps = await Store.listPacks(); $("#packs").innerHTML = ps.map(g => `<button class="reffile" data-pack="${esc(g)}"><b>${esc(g)}</b><span class="muted small">${Store.books.filter(b => b.genre === g).length} book(s)</span></button>`).join(""); $$("[data-pack]").forEach(b => b.onclick = guard(() => editPack(b.dataset.pack).then(drawPacks))); });
    drawPacks();
    $("#addpack").onclick = guard(async () => { const g = await promptBox("New genre", "", "Add"); if (!g) return; await Store.savePack(g, `# ${g} genre pack\n`, { tells: [], budgets: {}, ignore: [] }); drawPacks(); });
    $("#lampc") && ($("#lampc").onclick = guard(async () => { await Lamp.connect(); toast("Lamp Room library connected."); viewSettings(); }));
    $("#lampn") && ($("#lampn").onclick = guard(async () => { await Lamp.connect(true); toast("Lamp Room library connected."); viewSettings(); }));
    $("#chg") && ($("#chg").onclick = guard(async () => { await Store.pickFolder(); applyLook(); chip("folderchip", "📁 " + Store.folderName()); location.hash = "#/shelf"; }));
  }

  window.Desk = { E, saveNow, openScene, checkOutside, toast };
  boot();
})();
