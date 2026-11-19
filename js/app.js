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
      E.base = md; E.dirty = false; setSaved("saved"); if (!SP.on) renderStats();
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
    ({ shelf: viewShelf, new: viewNew, import: viewNew, title: viewTitle, settings: viewSettings, book: viewBook, series: viewSeries }[route.name] || viewShelf)();
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
      ${order.map(k => `<section class="shelf"><h3>${k ? `<a class="plaque" href="#/series/${encodeURIComponent(k)}" title="The series: every book, who's in which, continuity">${esc(k)} ›</a>` : "Standalone"}</h3><div class="shelf-row">${groups[k].map(b => {
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
    for (const el of $$("[data-lcov]")) { const blob = await Lamp.coverBlob(el.dataset.lcov); if (blob) { el.classList.add("img"); el.innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="">`; } }
    wireLampConnect(main);
    const setF = (k, v) => { f[k] = v; localStorage.setItem("wd-shelf", JSON.stringify(f)); viewShelf(); };
    $("#fpen") && ($("#fpen").onchange = e => setF("pen", e.target.value));
    $("#fwr") && ($("#fwr").onchange = e => setF("writer", e.target.value));
    // covers are shown whole (never cropped), standing on the shelf
    const showCover = (c, u) => { c.classList.add("img"); c.innerHTML = `<img src="${u}" alt="">`; };
    for (const el of $$(".spine[data-f]")) { const b = Store.byFolder(el.dataset.f); const u = b && await Store.coverUrl(b); if (u) showCover($(".cov", el), u); }
  }

  // ---------- new book: fresh or imported ----------
  function bookFields(v = {}, more) {
    const pens = Store.pens(), writers = (Store.settings.writers || []).map(w => w.name);
    return `<div class="fields">
      <label class="grow">Title<input name="title" required value="${esc(v.title || "")}"></label>
      <label class="grow">Series<input name="series" list="serieslist" value="${esc(v.series || "")}" placeholder="Leave empty for a standalone"></label>
      <datalist id="serieslist">${[...new Set(Store.books.map(b => b.series).filter(Boolean))].map(s => `<option value="${esc(s)}">`).join("")}</datalist>
      <label class="short">Book no.<input name="seriesNo" value="${esc(v.seriesNo || "")}"></label>
      <label>Pen name<select name="penName"><option value="">(none)</option>${pens.map(p => `<option ${v.penName === p.pen ? "selected" : ""} data-w="${esc(p.writer)}">${esc(p.pen)}</option>`).join("")}</select></label>
      <label>Writer<select name="writer">${writers.map(w => `<option ${v.writer === w ? "selected" : ""}>${esc(w)}</option>`).join("")}</select></label>
      <label>Genre<input name="genre" list="genrelist" value="${esc(v.genre || "")}" placeholder="for the Forge"></label>
      <datalist id="genrelist">${["Harem LitRPG", "Reverse Harem Romance", "Space Opera", "Dark Fantasy"].map(g => `<option value="${g}">`).join("")}</datalist>
      ${more ? `<label class="short">Target words<input name="targetWords" type="number" min="0" step="1000" value="${esc(v.targetWords || "")}"></label>
      <label>Started<input name="started" type="date" value="${esc(v.started || (v.created || "").slice(0, 10))}"></label>
      <label>Finished<input name="finished" type="date" value="${esc(v.finished || "")}" title="Leave empty: it's finished when its last Forge stage is done"></label>` : ""}</div>`;
  }
  const formInfo = form => Object.fromEntries(["title", "series", "seriesNo", "penName", "writer", "genre", "targetWords", "started", "finished"].filter(k => form.elements[k]).map(k => [k, (form.elements[k].value || "").trim()]));
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
        <div class="deskhead"><div class="statbar" id="statbar"></div>
        <div class="rail" id="rail"></div>
        <div class="deskbar"><span id="where" class="muted small"></span><span class="spacer"></span>
          <button class="btn small quiet" id="dict" title="Dictate into the page (Chrome speech-to-text)">🎙 Dictate</button>
          <button class="btn small quiet" id="hist" title="Earlier versions of this scene">History</button>
          <button class="btn small quiet" id="seal" title="Save a version nothing can change">🔒 Seal</button>
          <button class="btn small quiet" id="seals">Seals</button>
          <button class="btn small quiet" id="mode">${mode === "page" ? "Plain" : "Book page"}</button>
          <button class="btn small quiet" id="tgp">${showPanel ? "Hide panel" : "Panel"}</button></div></div>
        <div id="ms-page" class="wd-${mode}"><input id="sctitle" class="sctitle" aria-label="Scene title"><div id="ed" class="ed" contenteditable="true" spellcheck="true"></div></div>
        <div class="counts small muted" id="counts"></div>
        <div id="forgeview" class="forgeview hidden"></div></section>
      <aside class="panel"><div class="tabs">${[["beats", "Beats"], ["who", "Cast"], ["ref", "Reference"], ["book", "Book"]].map(([k, l]) => `<button data-t="${k}" class="${panelTab === k ? "on" : ""}">${l}</button>`).join("")}</div><div id="ptab"></div></aside></div>`;
    renderBinder();
    if (book.lampTitle && Lamp.state === "ready") { const t = await Lamp.readTitle(book.lampTitle).catch(() => null); if (t && Forge.fromLamp(book, t)) await Store.saveBook(book); }
    forgeTab = null; renderRail(); renderStats();
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
      box.innerHTML = `<form id="bookf">${bookFields(book, true)}<button class="btn small primary">Save details</button></form>
        <h3>Cover</h3><div class="row"><label class="btn small file-btn">${book.cover ? "Replace cover…" : "Add a cover…"}<input type="file" id="covf" accept="image/*" hidden></label></div>
        <h3>Manuscript</h3><a class="btn small" href="#/import/${encodeURIComponent(book.folder)}">Import a manuscript into this book…</a>
        <h3>Lamp Room</h3>${book.lampTitle ? `<p class="small">Linked to its writing project in the Lamp Room. Title, series, pen name and cover changes here go there too. <a href="${Lamp.url()}" target="lamp-room">Open the Lamp Room ↗</a></p>` : Lamp.state === "ready" ? `<button class="btn small" id="tolamp">Add to the writer's projects in the Lamp Room</button>` : `<p class="small muted">Connect the Lamp Room library in <a href="#/settings">Settings</a> to link this book.</p>`}
        <h3>Files</h3><p class="small muted">This book's folder in your library: <code>Books/${esc(book.folder)}</code>. Each scene is a plain <code>.md</code> file; <code>CONTENTS.md</code> lists them in order.</p>`;
      const f = $("#bookf"); wirePen(f);
      f.onsubmit = guard(async e => { e.preventDefault(); const info = formInfo(f); if (!info.title) return; await Store.updateBook(book, info); $(".bk-title span").textContent = book.title;
        if (book.lampTitle && Lamp.state === "ready") await Lamp.updateTitle(book.lampTitle, book).catch(err => toast("Saved here, but the Lamp Room couldn't be updated: " + err.message));
        renderStats(); toast("Saved."); });
      $("#tolamp") && ($("#tolamp").onclick = guard(async () => { await sendToLamp(book, Store.bookWords(book) ? "draft" : "outline"); toast("Added to your Lamp Room projects."); renderPanel(); }));
      $("#covf").onchange = guard(async e => { const file = e.target.files[0]; if (!file) return; await Store.setCover(book, file);
        if (book.lampTitle && Lamp.state === "ready") await Lamp.setCover(book.lampTitle, file).catch(err => console.warn(err));
        toast("Cover on" + (book.lampTitle && Lamp.state === "ready" ? ", here and in the Lamp Room." : ".")); });
    }
  }

  // ---------- stats above the stages, writing pace, monthly goal, sprints ----------
  const ym = () => Store.today().slice(0, 7);
  const daysBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 864e5));
  const writerOf = book => (Store.settings.writers || []).find(w => w.name === book.writer) || null;
  async function paceOf(name) {
    const key = Lamp.state === "ready" ? Lamp.keyOf(name) : null;
    if (key) return { wph: await Lamp.pace(key), from: "lamp", key };
    const w = (Store.settings.writers || []).find(x => x.name === name);
    return { wph: (w && +w.pace) || 1000, from: w && w.pace ? "desk" : "default", key: null };
  }
  function bookSpeed() {
    const done = Store.books.map(b => Forge.span(b)).filter(x => x.all && x.start && x.finish);
    if (!done.length) return null;
    return { days: done.reduce((a, x) => a + daysBetween(x.start, x.finish), 0) / done.length, n: done.length };
  }
  const months = d => d / 30.44;
  async function renderStats() {
    const book = E.book, el = $("#statbar"); if (!book || !el) return;
    const total = Store.bookWords(book), target = +book.targetWords || 0, span = Forge.span(book);
    const days = span.start ? daysBetween(span.start, span.finish || Store.today()) : 0;
    const avgMonth = days >= 1 ? total / Math.max(1, months(days)) : 0;
    const w = writerOf(book), goal = w && +w.monthGoal || 0;
    const mine = Store.books.filter(b => b.writer === book.writer).reduce((a, b) => a + Store.monthWords(b, ym()), 0);
    const speed = bookSpeed(), pace = await paceOf(book.writer);
    const left = target > total ? target - total : 0;
    el.innerHTML = `
      <div class="st"><span>Words</span><b id="stwords">${num(total)}</b>${target ? `<i class="bar"><i style="width:${Math.min(100, 100 * total / target)}%"></i></i><em>of ${num(target)}</em>` : `<em><a href="#" data-booktab>set a target</a></em>`}</div>
      <div class="st"><span>This month</span><b>${num(Store.monthWords(book, ym()))}</b><em>this book</em></div>
      <div class="st"><span>${esc(book.writer || "You")}'s month</span><b>${num(mine)}</b>${goal ? `<i class="bar"><i style="width:${Math.min(100, 100 * mine / goal)}%"></i></i><em>of ${num(goal)}, all books</em>` : `<em><a href="#/settings">set a goal</a></em>`}</div>
      <div class="st"><span>Per month</span><b>${days >= 1 ? num(Math.round(avgMonth)) : "—"}</b><em>${span.start ? (span.finish ? "start to finish" : "since " + esc(new Date(span.start + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }))) : ""}</em></div>
      <div class="st"><span>Book speed</span><b>${speed ? months(speed.days).toFixed(1) + " mo" : "—"}</b><em title="${speed ? `Average start-to-finish time of ${speed.n} finished book${speed.n === 1 ? "" : "s"}` : "Shows once a book is finished"}">${speed ? `avg of ${speed.n}` : "none finished yet"}${span.start && !span.finish ? ` · this: ${months(days).toFixed(1)} mo` : ""}</em></div>
      <div class="st" title="${pace.from === "lamp" ? "Writing pace from the Lamp Room's settings" : "Writing pace from Settings"}"><span>Pace</span><b>${num(pace.wph)}</b><em>words/hr${left ? ` · ${Math.ceil(left / pace.wph)} h left` : ""}</em></div>
      <div class="st sprint"><button class="btn small ${SP.on ? "primary" : ""}" id="sprintb">${SP.on ? "⏱ " + sprintClock() : "⏱ Sprint"}</button>${SP.on ? `<em>${num(sprintWords())} words so far</em>` : ""}</div>`;
    $("[data-booktab]", el) && ($("[data-booktab]", el).onclick = e => { e.preventDefault(); panelTab = "book"; localStorage.setItem("wd-panel-tab", "book"); localStorage.setItem("wd-panel", "on"); viewBook(); });
    $("#sprintb").onclick = guard(sprintMenu);
  }
  const SP = { on: false, end: 0, min: 0, start: 0, timer: 0, book: null };
  function liveWords() { const b = E.book; if (!b) return 0; const ed = editorEl(); const extra = E.sc && ed ? Store.words(Editor.htmlToMd(ed)) - (E.sc.words || 0) : 0; return Store.bookWords(b) + extra; }
  const sprintWords = () => Math.max(0, liveWords() - SP.start);
  const sprintClock = () => { const ms = Math.max(0, SP.end - Date.now()), m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60; return `${m}:${String(s).padStart(2, "0")}`; };
  async function sprintMenu() {
    if (SP.on) { if (await confirmBox("End the sprint now?", "End it")) endSprint(); return; }
    const m = await modal(`<h2>Writing sprint</h2><p class="small">Write until the timer runs out. The Desk counts the words you add to this book.</p>
      <div class="row">${[10, 15, 25, 45, 60].map(n => `<button class="btn ${n === 25 ? "primary" : ""}" data-close="${n}">${n} min</button>`).join("")}</div>`);
    if (!m) return;
    Object.assign(SP, { on: true, min: +m, end: Date.now() + m * 60000, start: liveWords(), book: E.book });
    clearInterval(SP.timer); SP.timer = setInterval(() => { if (Date.now() >= SP.end) endSprint(); else if (E.book === SP.book) { const b = $("#sprintb"); if (b) { b.textContent = "⏱ " + sprintClock(); const em = b.nextElementSibling; if (em) em.textContent = num(sprintWords()) + " words so far"; } } }, 1000);
    renderStats(); toast(`Go. ${m} minutes.`); editorEl() && editorEl().focus();
  }
  async function endSprint() {
    clearInterval(SP.timer); if (!SP.on) return;
    const book = SP.book, minutes = Math.max(1, Math.round((SP.min * 60000 - Math.max(0, SP.end - Date.now())) / 60000)), words = E.book === book ? sprintWords() : 0;
    SP.on = false; await saveNow();
    const wph = Math.round(words / (minutes / 60));
    book.sprints = (book.sprints || []).concat([{ at: new Date().toISOString(), minutes, words }]).slice(-200); await Store.saveBook(book);
    const pace = await paceOf(book.writer), linked = book.lampTitle && Lamp.state === "ready";
    const stage = (Forge.STAGES.find(x => x.lamp && !Forge.isDone(book, x.key)) || { lamp: "draft" }).lamp;
    renderStats();
    await modal(`<h2>Sprint done</h2><div class="tiles"><div class="tile"><span>Words</span><b>${num(words)}</b></div><div class="tile"><span>Minutes</span><b>${minutes}</b></div><div class="tile"><span>Words / hour</span><b>${num(wph)}</b><em>your pace: ${num(pace.wph)}</em></div></div>
      <div class="row end">${words > 0 ? `<button class="btn" id="setpace">Make ${num(wph)} my writing pace</button>` : ""}${linked ? `<button class="btn" id="tolog">Add it to today's Lamp Room log</button>` : ""}<button class="btn primary" data-close>Done</button></div>`,
      { mount: (d) => {
        $("#setpace", d) && ($("#setpace", d).onclick = guard(async () => { await setPaceFor(book.writer, wph); $("#setpace", d).disabled = true; toast("Writing pace updated" + (pace.key ? " in the Lamp Room too." : ".")); renderStats(); }));
        $("#tolog", d) && ($("#tolog", d).onclick = guard(async () => { const key = Lamp.keyOf(book.writer) || "anne"; await Lamp.addLog(key, book.lampTitle, stage, minutes, words); $("#tolog", d).disabled = true; toast(`Logged: ${minutes} minute${minutes === 1 ? "" : "s"} on ${book.title} in the Lamp Room.`); }));
      } });
  }
  async function setPaceFor(name, wph) {
    const key = Lamp.state === "ready" ? Lamp.keyOf(name) : null;
    if (key) await Lamp.setPace(key, wph);
    const w = (Store.settings.writers || []).find(x => x.name === name); if (w) { w.pace = Math.round(wph); await Store.saveSettings(); }
  }
  setInterval(() => { if (E.book && E.dirty && !SP.on) { const b = $("#stwords"); if (b) b.textContent = num(liveWords()); } }, 2000);

  // ---------- the Forge: stage tabs above the page ----------
  let forgeTab = null;
  function renderRail() {
    const book = E.book, el = $("#rail"); if (!book || !el) return;
    const cur = Forge.current(book);
    el.innerHTML = `<button data-ft="" class="${forgeTab ? "" : "on"}">✎ Manuscript</button><button data-ft="check" class="${forgeTab === "check" ? "on" : ""}">✓ Check</button><button data-ft="cast" class="${forgeTab === "cast" ? "on" : ""}">👥 Cast</button><button data-ft="time" class="${forgeTab === "time" ? "on" : ""}">🕰 Timeline</button><button data-ft="build" class="${forgeTab === "build" ? "on" : ""}">📖 Build</button><button data-ft="kit" class="${forgeTab === "kit" ? "on" : ""}">🏷 Kit</button><button data-ft="voices" class="${forgeTab === "voices" ? "on" : ""}">🎙 Voices</button><span class="rail-sep"></span>` + Forge.STAGES.map(s => {
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
    $("#where").textContent = forgeTab === "check" ? "Style check" : forgeTab === "cast" ? "People & places" : forgeTab === "time" ? "Timeline" : forgeTab === "build" ? "Book Build" : forgeTab === "kit" ? "Publishing kit" : forgeTab === "voices" ? "Voices" : on ? "Series Forge" : E.ch && E.sc ? E.ch.title + " › " + E.sc.title : "";
    if (forgeTab === "check") guard(renderCheck)(); else if (forgeTab === "cast") guard(renderCast)(); else if (forgeTab === "time") guard(renderTimeline)(); else if (forgeTab === "build") guard(renderBuild)(); else if (forgeTab === "kit") guard(renderKit)(); else if (forgeTab === "voices") guard(renderVoices)(); else if (on) renderForge();
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
      const st = Forge.state(book), day = Store.today(); for (const x of Forge.STAGES.slice(0, idx + 1)) { if (!st.done[x.key]) st.doneAt[x.key] = day; st.done[x.key] = true; }
      await Store.saveBook(book);
      let lampMsg = "";
      if (book.lampTitle && s.lamp) { if (Lamp.state === "ready") { await Lamp.setStage(book.lampTitle, s.lamp, true); lampMsg = " Ticked in the Lamp Room too."; } else lampMsg = " Connect the Lamp Room in Settings to tick it there."; }
      toast(`${s.label} done.${lampMsg}`);
      if (next) forgeTab = next.key; renderRail(); showForge(); renderStats();
    }));
    $("#reopen") && ($("#reopen").onclick = guard(async () => {
      const st = Forge.state(book); for (const x of Forge.STAGES.slice(idx)) { delete st.done[x.key]; delete st.doneAt[x.key]; }
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

  // ---------- the timeline ----------
  async function renderTimeline() {
    const book = E.book, fv = $("#forgeview");
    fv.innerHTML = `<div class="fv-head"><h2>Timeline</h2></div><p class="small muted">Reading the book…</p>`;
    await saveNow();
    const scenes = await scenesOf(book);
    const rows = scenes.map(x => { const sc = Store.find(book, x.id).sc; return { x, sc, when: sc.when || {}, hints: Cast.timeHints(x.md) }; });
    const start = book.storyStart || "";
    const dateOf = d => { if (!start || !d) return ""; const t = new Date(start + "T12:00:00"); t.setDate(t.getDate() + (+d - 1)); return t.toISOString().slice(0, 10); };
    // problems: days going backwards, a weekday in the text that doesn't match the date, "next morning" with no day change
    let prev = null; for (const r of rows) {
      r.warn = [];
      const d = +r.when.day || null, step = Cast.stepOf(r.hints);
      if (d && prev && d < prev && !r.when.flashback) r.warn.push(`Day ${d} comes after Day ${prev}. A flashback? Tick it.`);
      if (d && prev && step && d - prev !== step && !r.when.flashback) r.warn.push(`The text says ${step === 1 ? "the next day" : step + " days later"}, but the days move ${d - prev}.`);
      const date = r.when.date || dateOf(d);
      if (date) { const wd = Cast.weekdayOf(date); const said = r.hints.map(h => h.toLowerCase()).find(h => Cast.WEEKDAYS.includes(h)); if (said && said !== wd) r.warn.push(`It mentions ${said[0].toUpperCase() + said.slice(1)}, but ${date} is a ${wd[0].toUpperCase() + wd.slice(1)}.`); }
      if (d) prev = d;
    }
    let lastCh = "";
    fv.innerHTML = `<div class="fv-head"><h2>Timeline</h2><span class="muted small">Which day each scene happens on, checked against the time words in the text</span></div>
      <div class="row"><label>Day 1 is<input type="date" id="tstart" value="${esc(start)}"></label><span class="small muted">optional: gives every day a date and checks weekdays</span><span class="spacer"></span><button class="btn small" id="tsuggest">Fill in days from the text</button></div>
      <table class="ctable tline"><tr><th>Scene</th><th>Day</th><th>Time</th><th>Date</th><th>Time words in the text</th></tr>
      ${rows.map(r => { const head = r.x.ch !== lastCh ? `<tr class="tch"><td colspan="5">${esc(r.x.ch)}</td></tr>` : ""; lastCh = r.x.ch; const date = r.when.date || dateOf(r.when.day);
        return head + `<tr data-id="${r.x.id}" class="${r.warn.length ? "warnrow" : ""}"><td><a href="#" data-open="${r.x.id}">${esc(r.x.title)}</a>${r.warn.map(w => `<div class="small bad">${esc(w)}</div>`).join("")}</td>
          <td><input type="number" min="1" class="tday" data-f="day" value="${esc(r.when.day || "")}"></td>
          <td><select data-f="time">${["", "morning", "afternoon", "evening", "night"].map(t => `<option ${r.when.time === t ? "selected" : ""}>${t}</option>`).join("")}</select></td>
          <td class="small">${date ? esc(date) + " · " + Cast.weekdayOf(date).slice(0, 3) : ""}<label class="check small"><input type="checkbox" data-f="flashback" ${r.when.flashback ? "checked" : ""}> flashback</label></td>
          <td class="small">${r.hints.map(h => `<span class="hint-chip">${esc(h)}</span>`).join(" ")}</td></tr>`; }).join("")}</table>`;
    const save = guard(async () => { await Store.saveBook(book); });
    $("#tstart").onchange = async e => { book.storyStart = e.target.value; await save(); renderTimeline(); };
    $$("[data-open]", fv).forEach(a => a.onclick = guard(async e => { e.preventDefault(); forgeTab = null; renderRail(); showForge(); await openScene(a.dataset.open); }));
    $$("tr[data-id] [data-f]", fv).forEach(inp => inp.onchange = async () => {
      const sc = Store.find(book, inp.closest("tr").dataset.id).sc; sc.when = sc.when || {};
      const f = inp.dataset.f; sc.when[f] = f === "flashback" ? inp.checked : f === "day" ? (+inp.value || null) : inp.value;
      await save(); renderTimeline();
    });
    $("#tsuggest").onclick = guard(async () => {
      let day = 0, filled = 0;
      for (const r of rows) {
        if (r.when.flashback) continue;
        if (+r.when.day) { day = +r.when.day; continue; }
        day = day ? day + Cast.stepOf(r.hints) : 1;
        r.sc.when = Object.assign({}, r.sc.when, { day }); filled++;
        const tm = r.hints.map(h => h.toLowerCase()).find(h => /morning|dawn|sunrise|afternoon|noon|evening|dusk|sunset|night|midnight/.test(h));
        if (tm && !r.sc.when.time) r.sc.when.time = /morning|dawn|sunrise/.test(tm) ? "morning" : /afternoon|noon/.test(tm) ? "afternoon" : /evening|dusk|sunset/.test(tm) ? "evening" : "night";
      }
      await save(); toast(filled ? `Filled in ${filled} scene${filled === 1 ? "" : "s"}. Days you'd already set were kept.` : "Every scene already has a day."); renderTimeline();
    });
  }

  // ---------- a series: every book in it, side by side ----------
  async function viewSeries() {
    const name = route.a, books = Store.books.filter(b => b.series === name).sort((a, b) => (parseFloat(a.seriesNo) || 0) - (parseFloat(b.seriesNo) || 0) || a.title.localeCompare(b.title));
    if (!books.length) { main.innerHTML = `<div class="card">No books in the series “${esc(name)}”. <a href="#/shelf">Back to the shelf</a></div>`; return; }
    main.innerHTML = `<div class="view-header"><h2>${esc(name)}</h2></div><p class="muted small">Reading the series…</p>`;
    // the text of every book, once
    const texts = {}; for (const b of books) texts[b.folder] = await scenesOf(b);
    const total = books.reduce((a, b) => a + Store.bookWords(b), 0), month = books.reduce((a, b) => a + Store.monthWords(b, ym()), 0);
    const spans = books.map(b => Forge.span(b)), fin = spans.filter(x => x.all && x.start && x.finish);
    const speed = fin.length ? fin.reduce((a, x) => a + daysBetween(x.start, x.finish), 0) / fin.length : null;
    const first = spans.map(x => x.start).filter(Boolean).sort()[0], perMonth = first ? total / Math.max(1, months(daysBetween(first, Store.today()))) : 0;
    // everyone on any book's list, merged by name
    const cast = []; for (const b of books) for (const c of b.cast || []) { const have = cast.find(x => x.name === c.name); if (have) { for (const a of c.aliases || []) if (!have.aliases.includes(a)) have.aliases.push(a); } else cast.push({ name: c.name, kind: c.kind, aliases: [...(c.aliases || [])] }); }
    const perBook = books.map(b => { const cnt = Cast.count(cast, texts[b.folder]), o = {}; for (const r of Object.values(cnt)) for (const [k, n] of Object.entries(r)) o[k] = (o[k] || 0) + n; return o; });
    const max = Math.max(1, ...perBook.flatMap(o => Object.values(o)));
    // continuity across the books (and every book's reference shelf)
    const sources = [];
    for (const b of books) {
      let ref = ""; for (const r of await Store.listReference(b)) if (!/^Imported manuscript/i.test(r.name)) ref += "\n" + await Store.readReference(b, r.name);
      if (ref.trim()) sources.push({ where: `${b.title}: reference shelf`, book: b, sceneId: null, md: ref });
      for (const s of texts[b.folder]) sources.push({ where: `${b.title} › ${s.ch}`, book: b, sceneId: s.id, md: s.md });
    }
    const conflicts = Cast.continuity(cast, sources).filter(c => c.attr !== "age");
    // ages: fine to go up from book to book, not down
    const ageIssues = [];
    for (const c of cast.filter(c => c.kind === "person")) {
      let last = null;
      for (const b of books) {
        const ages = []; const re = new RegExp(`(?:^|\\b)(?:${[c.name, ...(c.aliases || [])].map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?:,\\s+(\\d{1,3}),|\\s+(?:was|is|turned)\\s+(\\d{1,3})\\b)`, "g");
        for (const s of sources.filter(s => s.book === b)) { let m; while ((m = re.exec(s.md.replace(/\*+/g, "")))) ages.push(+(m[1] || m[2])); }
        if (!ages.length) continue;
        const lo = Math.min(...ages);
        if (last && lo < last.age) ageIssues.push(`${c.name} is ${last.age} in ${last.book} but ${lo} in ${b.title}, a later book.`);
        last = { age: Math.max(...ages), book: b.title };
      }
    }
    // story time across the books: Day 1 dates and how many days each book covers
    const tl = books.map(b => { const days = b.chapters.flatMap(c => c.scenes.map(s => +(s.when || {}).day || 0)).filter(Boolean); const last = days.length ? Math.max(...days) : 0; let end = ""; if (b.storyStart && last) { const t = new Date(b.storyStart + "T12:00:00"); t.setDate(t.getDate() + last - 1); end = t.toISOString().slice(0, 10); } return { b, start: b.storyStart || "", end, days: last }; });
    const tlIssues = []; for (let i = 1; i < tl.length; i++) { const a = tl[i - 1], c = tl[i]; if (a.end && c.start && c.start < a.end) tlIssues.push(`${c.b.title} starts on ${c.start}, before ${a.b.title} ends (${a.end}). Fine if it's a prequel or overlap.`); }
    const nextNo = Math.max(0, ...books.map(b => parseFloat(b.seriesNo) || 0)) + 1, lastBook = books[books.length - 1];
    main.innerHTML = `<div class="view-header"><h2>${esc(name)}</h2><div class="view-header-actions"><a class="btn quiet" href="#/shelf">‹ Shelf</a><button class="btn primary" id="nextbook">Start Book ${nextNo}</button></div></div>
      <div class="tiles">
        <div class="tile"><span>Books</span><b>${books.length}</b><em>${fin.length} finished</em></div>
        <div class="tile"><span>Words</span><b>${num(total)}</b><em>the whole series</em></div>
        <div class="tile"><span>This month</span><b>${num(month)}</b><em>written in this series</em></div>
        <div class="tile"><span>Per month</span><b>${perMonth ? num(Math.round(perMonth)) : "—"}</b><em>${first ? "since " + esc(first) : ""}</em></div>
        <div class="tile"><span>Book speed</span><b>${speed ? months(speed).toFixed(1) + " mo" : "—"}</b><em>${speed ? "average, start to finish" : "after the first finished book"}</em></div></div>
      <div class="card"><h3>The books</h3><table class="ctable sbooks"><tr><th>#</th><th>Book</th><th>Stage</th><th>Words</th><th>Started</th><th>Finished</th><th></th></tr>
        ${books.map((b, i) => { const sp = spans[i], cur = Forge.current(b), stg = Forge.STAGES.find(s => s.key === cur); const doneN = Forge.STAGES.filter(s => Forge.isDone(b, s.key)).length;
          return `<tr><td>${esc(b.seriesNo || "")}</td><td><a href="#/book/${encodeURIComponent(b.folder)}"><b>${esc(b.title)}</b></a>${b.penName ? `<div class="small muted">${esc(b.penName)}</div>` : ""}</td>
            <td><i class="sbar"><i style="width:${100 * doneN / Forge.STAGES.length}%"></i></i><span class="small">${stg ? esc(stg.label) : "Done ✓"}</span></td><td>${num(Store.bookWords(b))}${b.targetWords ? `<span class="small muted"> / ${num(+b.targetWords)}</span>` : ""}</td>
            <td class="small">${esc(sp.start || "")}</td><td class="small">${esc(sp.finish || "")}</td><td>${b.lampTitle ? '<span title="Linked to the Lamp Room">🪔</span>' : ""}</td></tr>`; }).join("")}</table></div>
      <div class="card"><h3>Who's in which book</h3>${cast.length ? `<div class="hscroll"><table class="ctable heat"><tr><th></th>${books.map(b => `<th title="${esc(b.title)}">${esc(b.seriesNo ? "#" + b.seriesNo : b.title.slice(0, 8))}</th>`).join("")}</tr>
        ${["person", "place"].map(kind => cast.filter(c => c.kind === kind).map(c => `<tr><th>${esc(c.name)}${kind === "place" ? ' <span class="muted small">place</span>' : ""}</th>${perBook.map(o => `<td class="hc" style="--a:${o[c.name] ? 0.15 + 0.85 * o[c.name] / max : 0}">${o[c.name] || ""}</td>`).join("")}</tr>`).join("")).join("")}</table></div>` : `<p class="small muted">No one's on any book's list yet. Open a book's <b>👥 Cast</b> tab to start one; the next book in the series starts with the same list.</p>`}</div>
      <div class="card"><h3>Continuity across the series</h3>
        ${conflicts.length || ageIssues.length ? conflicts.map(c => `<div class="crow plain"><span><b>${esc(c.name)}</b>: ${esc(c.attr)}</span></div>${c.values.map(v => `<div class="ex"><b>${esc(v.v)}</b> <span class="muted small">${v.where.map(w => esc(w.where)).join(" · ")}</span></div>`).join("")}`).join("") + ageIssues.map(t => `<div class="ex">${esc(t)}</div>`).join("")
          : `<p class="small">Nothing disagrees between the books: eyes, hair and ages line up${cast.length ? "" : " (once there's a cast list to check)"}.</p>`}
        <p class="small muted">Eyes and hair must match in every book and on every reference shelf. Ages may go up from book to book, never down.</p></div>
      <div class="card"><h3>Story time across the books</h3><table class="ctable"><tr><th>Book</th><th>Day 1</th><th>Days covered</th><th>Last day</th></tr>${tl.map(t => `<tr><td>${esc(t.b.title)}</td><td class="small">${esc(t.start) || '<span class="muted">not set</span>'}</td><td>${t.days || "—"}</td><td class="small">${esc(t.end)}</td></tr>`).join("")}</table>
        ${tlIssues.map(t => `<div class="ex">${esc(t)}</div>`).join("")}<p class="small muted">Each book's 🕰 Timeline tab sets its Day 1 date and scene days.</p></div>`;
    $("#nextbook").onclick = guard(() => startNextBook(name, nextNo, books, cast));
  }
  // the next book in a series: same pen name, writer and genre; the cast list and the reference shelf come along
  async function startNextBook(series, no, books, cast) {
    const prev = books[books.length - 1];
    const t = await promptBox(`Book ${no} of ${series}: title`, "", "Create");
    if (!t) return;
    const b = await Store.createBook({ title: t, series, seriesNo: String(no), penName: prev.penName, writer: prev.writer, genre: prev.genre });
    b.cast = (cast || prev.cast || []).map(c => ({ ...c, aliases: [...(c.aliases || [])] }));
    const st = Forge.state(b); st.done.setup = true; st.doneAt.setup = Store.today();   // the series is already set up
    await Store.saveBook(b);
    // the newest copy of each reference file from any earlier book (the latest book wins)
    const copied = new Set();
    for (const src of [...books].reverse()) for (const r of await Store.listReference(src)) if (!/^Imported manuscript/i.test(r.name) && !copied.has(r.name)) { copied.add(r.name); await Store.addReference(b, r.name, await Store.readReference(src, r.name)); }
    if (prev.lampTitle && Lamp.state === "ready") await sendToLamp(b, "outline");
    toast(`“${t}” is Book ${no}: same pen name and cast list, the reference shelf copied over${b.lampTitle ? ", and it's in your Lamp Room projects" : ""}. The Outline tab has the handoff prompt.`, 7000);
    location.hash = "#/book/" + encodeURIComponent(b.folder);
  }

  // ---------- Book Build: matter, look, files ----------
  let buildLook = localStorage.getItem("wd-look") || "steel", buildPrev = "c1";
  async function renderBuild() {
    const book = E.book, fv = $("#forgeview"), M = Build.matter(book);
    await saveNow();
    const ps = await Build.pieces(book, { dropLove: true }), warn = await Build.warnings(book);
    if (!ps.some(p => p.id === buildPrev)) buildPrev = (ps.find(p => p.kind === "chapter") || ps[0] || {}).id;
    const P = Build.profile(book), c = M.copyrightInfo;
    fv.innerHTML = `<div class="fv-head"><h2>Book Build</h2><span class="muted small">Front matter, back matter, and the files for KDP and Draft2Digital</span></div>
      ${warn.length ? `<div class="card hint small"><b>Before you build:</b>${warn.slice(0, 8).map(w => `<div>• ${esc(w)}</div>`).join("")}${warn.length > 8 ? `<div>…and ${warn.length - 8} more</div>` : ""}</div>` : ""}
      ${!book.penName ? "" : !Object.keys(P).length ? `<p class="small muted">Tip: fill in <b>${esc(book.penName)}</b>'s profile in <a href="#/settings">Settings › Pen names</a> (bio, website, newsletter, free book) and the About, Links and Free book pages write themselves.</p>` : ""}
      <h3>The look</h3>
      <div class="looks">${[["steel", "Steel", "Clean: bold sans-serif chapter titles, a plain rule between scenes. Reads well for men's fiction: LitRPG, space opera."], ["filigree", "Filigree", "Decorative: italic titles, a flourish, drop caps and a ❦ between scenes. Romance and fantasy."]].map(([k, l, d]) => `<button class="look ${buildLook === k ? "on" : ""}" data-look="${k}"><b>${l}</b><span class="small">${d}</span></button>`).join("")}</div>
      <div class="row"><label class="small">Preview<select id="prevsel">${ps.map(p => `<option value="${p.id}" ${p.id === buildPrev ? "selected" : ""}>${esc(p.label || p.title)}</option>`).join("")}</select></label></div>
      <iframe id="prevframe" class="prevframe" title="Preview"></iframe>
      <h3>Make the files</h3>
      <div class="row"><button class="btn primary" data-make="epub">EPUB (${buildLook === "steel" ? "Steel" : "Filigree"})</button><button class="btn" data-make="docx">Word .docx for Draft2Digital</button></div>
      <p class="small muted">Both are saved in this book's <i>Exports</i> folder and downloaded. <b>KDP:</b> upload the EPUB. <b>Draft2Digital:</b> upload the EPUB to keep this look, or the .docx to use one of D2D's own looks (D2D makes its own title page, contents, Also By and About pages from your account, so switch those off on one side or the other). Check every page in each store's previewer before you publish.</p>
      <h3>Front and back matter</h3>
      <div class="matterlist">${Build.MATTER.map(m => { const cur = M[m.key], auto = m.auto ? Build.matterText(book, m.key) : null;
        return `<div class="mrow ${cur.on ? "" : "off"}"><label class="check"><input type="checkbox" data-mon="${m.key}" ${cur.on ? "checked" : ""}> <b>${esc(m.label)}</b> <span class="muted small">${m.side === "front" ? "front" : "back"}</span></label>
          ${m.key === "copyright" ? `<div class="fields small">${[["year", "Year"], ["holder", "Copyright holder"], ["cover", "Cover by"], ["edition", "Edition"], ["isbn", "ISBN (leave empty for KDP)"]].map(([k, l]) => `<label>${l}<input data-cr="${k}" value="${esc(c[k] || "")}" placeholder="${k === "holder" ? esc(book.penName || "") : ""}"></label>`).join("")}</div>` : ""}
          ${m.text ? `<textarea data-mtext="${m.key}" placeholder="${esc(m.hint || "")}">${esc(cur.text || "")}</textarea>` : ""}
          ${m.auto && m.key !== "title" && m.key !== "copyright" ? `<div class="small ${auto.length ? "" : "muted"}">${auto.length ? auto.map(x => esc(x.replace(/\*/g, ""))).join(" · ") : esc(m.hint || "")}</div>` : ""}</div>`; }).join("")}</div>
      <h3>Chapters in the book</h3><div class="found">${book.chapters.map(ch => `<label class="check"><input type="checkbox" data-chon="${ch.id}" ${ch.skip ? "" : "checked"}> ${esc(ch.title)}</label>`).join("")}</div>`;
    const showPrev = async () => { const all = await Build.pieces(book, { dropLove: true }); const p = all.find(x => x.id === buildPrev) || all[0]; if (p) $("#prevframe").srcdoc = Build.previewHtml(p, book, buildLook); };
    showPrev();
    $("#prevsel").onchange = e => { buildPrev = e.target.value; showPrev(); };
    $$("[data-look]", fv).forEach(b => b.onclick = () => { buildLook = b.dataset.look; localStorage.setItem("wd-look", buildLook); renderBuild(); });
    let tt = 0; const later = fn => { clearTimeout(tt); tt = setTimeout(guard(async () => { await fn(); await Store.saveBook(book); showPrev(); }), 600); };
    $$("[data-mon]", fv).forEach(x => x.onchange = guard(async () => { M[x.dataset.mon].on = x.checked; await Store.saveBook(book); renderBuild(); }));
    $$("[data-mtext]", fv).forEach(x => x.oninput = () => { const k = x.dataset.mtext; if (x.value.trim() && !M[k].on) { M[k].on = true; const cb = $(`[data-mon="${k}"]`, fv); cb.checked = true; cb.closest(".mrow").classList.remove("off"); } later(() => { M[k].text = x.value; }); });
    $$("[data-cr]", fv).forEach(x => x.oninput = () => later(() => { M.copyrightInfo[x.dataset.cr] = x.value.trim(); }));
    $$("[data-chon]", fv).forEach(x => x.onchange = guard(async () => { const ch = book.chapters.find(c => c.id === x.dataset.chon); ch.skip = !x.checked || undefined; await Store.saveBook(book); showPrev(); }));
    $$("[data-make]", fv).forEach(b => b.onclick = guard(async () => {
      b.disabled = true; toast("Building…");
      try {
        const kind = b.dataset.make, blob = kind === "epub" ? await Build.epub(book, buildLook) : await Build.docx(book);
        const name = `${Store.safe(book.title)}${kind === "epub" ? " - " + (buildLook === "steel" ? "Steel" : "Filigree") + ".epub" : " - Draft2Digital.docx"}`;
        await Store.saveExport(book, name, blob);
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
        toast(`${name}: saved in Exports and downloaded.`, 5000);
      } finally { b.disabled = false; }
    }));
  }

  // ---------- the publishing kit ----------
  async function renderKit() {
    const book = E.book, fv = $("#forgeview"), K = book.kit = book.kit || {};
    if (!K.title) K.title = book.title;
    const field = ([k, label, kind, lim, hint]) => {
      const v = K[k], copy = `<button class="btn small quiet" data-copy="${k}" title="Copy">Copy</button>`;
      if (kind === "list") { const arr = Array.isArray(v) ? v : []; return `<div class="kf"><div class="kl"><b>${esc(label)}</b>${hint ? `<span class="small muted">${esc(hint)}</span>` : ""}</div>${Array.from({ length: lim }, (_, i) => `<div class="kli"><span class="muted small">${i + 1}</span><input data-k="${k}" data-i="${i}" value="${esc(arr[i] || "")}">${k === "keywords" ? `<span class="cnt" data-cnt="${k}.${i}"></span>` : ""}<button class="btn small quiet" data-copy="${k}" data-ci="${i}">Copy</button></div>`).join("")}</div>`; }
      if (kind === "select") return `<div class="kf"><div class="kl"><b>${esc(label)}</b>${hint ? `<span class="small muted">${esc(hint)}</span>` : ""}</div><select data-k="${k}">${lim.map(o => `<option ${v === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`;
      if (kind === "date") return `<div class="kf"><div class="kl"><b>${esc(label)}</b></div><input type="date" data-k="${k}" value="${esc(v || "")}"></div>`;
      return `<div class="kf"><div class="kl"><b>${esc(label)}</b>${hint ? `<span class="small muted">${esc(hint)}</span>` : ""}<span class="cnt" data-cnt="${k}"></span>${copy}</div>${kind === "text" ? `<textarea data-k="${k}" rows="${k === "blurb" ? 9 : 4}">${esc(v || "")}</textarea>` : `<input data-k="${k}" value="${esc(v || "")}">`}</div>`;
    };
    const arcs = book.arcs = book.arcs || [];
    fv.innerHTML = `<div class="fv-head"><h2>Publishing kit</h2><span class="muted small">Everything the store forms ask for, kept with the book</span></div>
      <div class="card"><b>Let Claude write it.</b> <span class="small">Copy the prompt into the series' Claude Project, then paste the whole reply below: each heading fills its field. Anything already typed here is only replaced by the headings Claude sent.</span>
        <div class="row"><button class="btn small" id="kprompt">Copy the kit prompt</button><button class="btn small" id="kpaste">Paste Claude's kit…</button><span class="spacer"></span><button class="btn small quiet" id="ksave">Save the kit as Markdown</button></div></div>
      ${Kit.GROUPS.map(([g, fs]) => `<details class="csec" open><summary><b>${esc(g)}</b></summary>${fs.map(field).join("")}</details>`).join("")}
      <details class="csec" open><summary><b>Advance reader copies</b> <span class="badge">${arcs.length}</span></summary>
        <p class="small muted">Each reader gets their own EPUB with their name on the title page and after every chapter, so a leaked copy can be traced. It uses the look chosen in 📖 Build (${buildLook === "steel" ? "Steel" : "Filigree"}).</p>
        <table class="ctable">${arcs.map((a, i) => `<tr><td><b>${esc(a.name)}</b></td><td class="small">${a.sent ? "made " + esc(a.sent) : ""}</td><td><label class="check small"><input type="checkbox" data-arcrev="${i}" ${a.reviewed ? "checked" : ""}> reviewed</label></td><td><input class="small" data-arcnote="${i}" value="${esc(a.note || "")}" placeholder="note, review link"></td><td><button class="btn small" data-arcmake="${i}">EPUB</button><button class="btn small quiet" data-arcdel="${i}">✕</button></td></tr>`).join("")}</table>
        <form class="row" id="arcadd"><input id="arcname" placeholder="Reader's name"><button class="btn small">Add reader</button></form></details>`;
    const save = guard(async () => { await Store.saveBook(book); });
    let t = 0; const later = () => { clearTimeout(t); t = setTimeout(save, 600); };
    const counts = () => {
      for (const el of $$("[data-cnt]", fv)) {
        const [k, i] = el.dataset.cnt.split("."), v = i != null ? ((K[k] || [])[+i] || "") : (K[k] || "");
        const lim = k === "keywords" ? 50 : k === "blurb" ? 4000 : (k === "title" || k === "subtitle") ? 200 : 0;
        const n = k === "title" || k === "subtitle" ? (K.title || "").length + (K.subtitle || "").length : String(v).length;
        el.textContent = lim ? `${n}/${lim}${k === "title" || k === "subtitle" ? " with " + (k === "title" ? "subtitle" : "title") : ""}` : "";
        el.classList.toggle("over", !!lim && n > lim);
      }
    };
    counts();
    $$("[data-k]", fv).forEach(x => x.oninput = x.onchange = () => {
      const k = x.dataset.k;
      if (x.dataset.i != null) { const a = Array.isArray(K[k]) ? K[k] : []; a[+x.dataset.i] = x.value; K[k] = a; } else K[k] = x.value;
      counts(); later();
    });
    $$("[data-copy]", fv).forEach(b => b.onclick = () => { const k = b.dataset.copy, v = b.dataset.ci != null ? ((K[k] || [])[+b.dataset.ci] || "") : Array.isArray(K[k]) ? K[k].filter(Boolean).join("\n") : (K[k] || ""); navigator.clipboard.writeText(v).then(() => toast("Copied."), () => toast("Couldn't copy.")); });
    $("#kprompt").onclick = () => copyText(Kit.prompt(book));
    $("#kpaste").onclick = guard(async () => {
      const md = await modal(`<h2>Paste Claude's kit</h2><textarea id="kmd" class="packtext" placeholder="Paste the whole reply here" autofocus></textarea><div class="row end"><button class="btn quiet" data-close>Cancel</button><button class="btn primary" id="kgo">Fill in the kit</button></div>`, { wide: true, mount: (d, close) => { $("#kgo", d).onclick = () => close($("#kmd", d).value); } });
      if (!md) return;
      const got = Kit.parse(md), n = Object.keys(got).length;
      if (!n) { toast("No headings matched. Use the kit prompt so Claude sends the right headings."); return; }
      Object.assign(K, got); await save(); toast(`Filled ${n} field${n === 1 ? "" : "s"}.`); renderKit();
    });
    $("#ksave").onclick = guard(async () => { const name = `${Store.safe(book.title)} - Publishing Kit.md`; await Store.saveExport(book, name, Kit.toMarkdown(book)); await Store.addReference(book, "publishing-kit.md", Kit.toMarkdown(book)); toast(`Saved in Exports, and on the reference shelf as publishing-kit.md.`); });
    $("#arcadd").onsubmit = guard(async e => { e.preventDefault(); const n = $("#arcname").value.trim(); if (!n) return; arcs.push({ name: n }); await save(); renderKit(); });
    $$("[data-arcdel]", fv).forEach(b => b.onclick = guard(async () => { arcs.splice(+b.dataset.arcdel, 1); await save(); renderKit(); }));
    $$("[data-arcrev]", fv).forEach(c => c.onchange = guard(async () => { arcs[+c.dataset.arcrev].reviewed = c.checked; await save(); }));
    $$("[data-arcnote]", fv).forEach(c => c.oninput = () => { arcs[+c.dataset.arcnote].note = c.value; later(); });
    $$("[data-arcmake]", fv).forEach(b => b.onclick = guard(async () => {
      const a = arcs[+b.dataset.arcmake]; b.disabled = true; toast("Building " + a.name + "'s copy…");
      try {
        const blob = await Build.epub(book, buildLook, a.name), name = `${Store.safe(book.title)} - ARC for ${Store.safe(a.name)}.epub`;
        await Store.saveExport(book, name, blob); a.sent = Store.today(); await save();
        const l = document.createElement("a"); l.href = URL.createObjectURL(blob); l.download = name; document.body.appendChild(l); l.click(); l.remove();
        toast(`${name}: saved in Exports and downloaded.`); renderKit();
      } finally { b.disabled = false; }
    }));
  }

  // ---------- voices: who speaks each line, then off to the Lamp Room ----------
  let voiceFilter = "look";
  async function renderVoices() {
    const book = E.book, fv = $("#forgeview"), V = book.voices = book.voices || {}; V.lines = V.lines || {}; V.tones = V.tones || {}; V.readers = V.readers || {}; V.mode = V.mode || "duet";
    fv.innerHTML = `<div class="fv-head"><h2>Voices</h2></div><p class="small muted">Reading the book…</p>`;
    await saveNow();
    const people = (book.cast || []).filter(c => c.kind === "person");
    const scenes = (await scenesOf(book)).filter(s => !(book.chapters.find(c => c.id === s.chId) || {}).skip);
    const lines = Voices.analyse(book.cast || [], scenes, V.pov);
    if (V.mode === "full") Voices.ensureColors(book);
    const voices = Voices.voicesUsed(book, lines);
    const spk = l => Voices.speakerOf(book, l), chosen = l => !!V.lines[l.key];
    const needs = l => !chosen(l) && (!l.sure || !l.guess), unset = people.filter(c => !c.voice);
    const counts = {}; for (const l of lines) { const s = spk(l); counts[s] = (counts[s] || 0) + 1; }
    const shown = lines.filter(l => voiceFilter === "all" || needs(l));
    const readers = [...new Set([...(Lamp.state === "ready" ? Lamp.narrators() : []), ...(Store.settings.writers || []).map(w => w.name).filter(n => n !== "Me"), "Cast 1", "Cast 2", "Cast 3", "Cast 4"])];
    const rsel = (part, label) => `<label class="small">${esc(label)}<select data-reader="${esc(part)}"><option value="">—</option>${readers.map(r => `<option ${V.readers[part] === r ? "selected" : ""}>${esc(r)}</option>`).join("")}</select></label>`;
    const opts = cur => `<option value="">(narration)</option>${people.map(c => `<option ${cur === c.name ? "selected" : ""}>${esc(c.name)}</option>`).join("")}<option ${cur === "System" ? "selected" : ""}>System</option>`;
    let lastCh = "";
    const sentOk = book.lampAudio && Lamp.state === "ready" && await Lamp.audioExists(book.lampAudio.folder);
    fv.innerHTML = `<div class="fv-head"><h2>Voices</h2><span class="muted small">Who speaks each line, for narration in the Lamp Room</span></div>
      ${!people.length ? `<div class="card hint">Start in <b>👥 Cast</b>: keep the people on the list, then come back here.</div>` : ""}
      <div class="card"><h3>1. The voices</h3>
        <div class="row"><label class="check"><input type="radio" name="vmode" value="duet" ${V.mode === "duet" ? "checked" : ""}> <b>Duet</b>: men's lines blue, women's pink, the System yellow</label>
          <label class="check"><input type="radio" name="vmode" value="full" ${V.mode === "full" ? "checked" : ""}> <b>Full cast</b>: a colour for every character</label></div>
        <div class="row"><label class="small">Whose is “I said” (first person)<select id="vpov"><option value="">—</option>${people.map(c => `<option ${V.pov === c.name ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label></div>
        ${people.length ? `<table class="ctable"><tr><th>Character</th><th>Voice</th><th>Lines</th>${V.mode === "full" ? "<th>Colour</th>" : ""}</tr>${people.map(c => `<tr><td><b>${esc(c.name)}</b></td><td><select data-cv="${esc(c.name)}"><option value="">choose…</option><option value="m" ${c.voice === "m" ? "selected" : ""}>Male</option><option value="f" ${c.voice === "f" ? "selected" : ""}>Female</option><option value="n" ${c.voice === "n" ? "selected" : ""}>Read as narration</option></select></td><td>${counts[c.name] || 0}</td>${V.mode === "full" ? `<td><span class="swatch" style="background:#${esc((V.colors || {})[c.name] || "eee")}"></span></td>` : ""}</tr>`).join("")}</table>` : ""}
        ${unset.length ? `<p class="small bad">Choose a voice for ${unset.map(c => esc(c.name)).join(", ")}: it also tells the guesser who “he” and “she” are.</p>` : ""}
        <h4>Who reads them</h4><div class="row">${rsel("n", "Narration")}${voices.map(v => rsel(v.part, v.label)).join("")}</div></div>
      <div class="card"><h3>2. The lines</h3>
        <p class="small">${num(lines.length)} lines of dialogue: ${num(lines.filter(l => chosen(l)).length)} set by you, ${num(lines.filter(l => !chosen(l) && l.sure && l.guess).length)} sure from a tag, ${num(lines.filter(l => !chosen(l) && l.guess && !l.sure).length)} guessed, <b>${num(lines.filter(l => !chosen(l) && !l.guess).length)} with no speaker</b>.</p>
        <div class="row chips"><button class="btn small ${voiceFilter === "look" ? "primary" : "quiet"}" data-vf="look">Needs a look (${num(lines.filter(needs).length)})</button><button class="btn small ${voiceFilter === "all" ? "primary" : "quiet"}" data-vf="all">Every line</button></div>
        <div class="vlines">${shown.slice(0, 400).map(l => { const s = spk(l), part = Voices.partOf(book, s), col = part === "n" ? "" : part.startsWith("c:") ? "#" + part.slice(2) : "#" + Voices.DUET[part];
          const head = l.ch !== lastCh ? `<div class="vch">${esc(l.ch)}</div>` : ""; lastCh = l.ch;
          return head + `<div class="vline ${chosen(l) ? "mine" : l.sure ? "sure" : l.guess ? "guess" : "none"}"><select data-vl="${esc(l.key)}">${opts(s)}</select>
            <span class="vtext" ${col ? `style="background:${col}"` : ""}>${esc(l.text.length > 220 ? l.text.slice(0, 220) + "…" : l.text)}</span>
            <input class="vtone" data-vt="${esc(l.key)}" value="${esc(Voices.toneOf(book, l))}" placeholder="tone"><button class="btn small quiet" data-vgo="${esc(l.sceneId)}" data-vfind="${esc(l.text.slice(0, 40))}" title="Show in the page">↗</button>
            <span class="vhow small muted">${chosen(l) ? "set by you" : esc(l.how)}</span></div>`; }).join("") || `<p class="small">Nothing needs a look. ✓</p>`}
          ${shown.length > 400 ? `<p class="small muted">Showing the first 400. Fix these and the rest move up.</p>` : ""}</div></div>
      <div class="card"><h3>3. To the Lamp Room</h3>
        <div class="row"><button class="btn" id="vdocx">Highlighted manuscript (.docx)</button><button class="btn" id="vscripts">Character scripts (.docx)</button>
          ${Lamp.state !== "ready" ? `<span class="small muted">Connect the Lamp Room in Settings to send it straight there.</span>` : sentOk ? `<span class="badge ok">Sent to the Lamp Room ✓</span>` : `<button class="btn primary" id="vsend">Send to the Lamp Room</button>`}</div>
        <p class="small muted">${sentOk ? "The Lamp Room's copy is never overwritten from here, so recordings stay safe. For a changed manuscript, make the highlighted .docx and use <b>Update manuscript</b> on the book in the Lamp Room (chapters are matched by title, recordings stay); character scripts can be replaced there too." : "Sending makes a new audio project in the Lamp Room with every line already marked, the readers set and the character scripts loaded. The files go to this book's Exports folder too, for other narrators or for the Lamp Room's own import."}</p></div>`;
    const save = guard(async () => { await Store.saveBook(book); });
    let t = 0; const later = () => { clearTimeout(t); t = setTimeout(save, 600); };
    $$("[name=vmode]", fv).forEach(r => r.onchange = guard(async () => { V.mode = r.value; await save(); renderVoices(); }));
    $("#vpov").onchange = guard(async e => { V.pov = e.target.value; await save(); renderVoices(); });
    $$("[data-cv]", fv).forEach(sel => sel.onchange = guard(async () => { book.cast.find(c => c.name === sel.dataset.cv).voice = sel.value; await save(); renderVoices(); }));
    $$("[data-reader]", fv).forEach(sel => sel.onchange = guard(async () => { V.readers[sel.dataset.reader] = sel.value; await save(); }));
    $$("[data-vf]", fv).forEach(b => b.onclick = () => { voiceFilter = b.dataset.vf; renderVoices(); });
    $$("[data-vl]", fv).forEach(sel => sel.onchange = () => {
      V.lines[sel.dataset.vl] = sel.value || "-";   // "-": you chose narration
      const row = sel.closest(".vline"); row.className = "vline mine"; row.querySelector(".vhow").textContent = "set by you";
      const part = Voices.partOf(book, sel.value), tx = row.querySelector(".vtext"); tx.style.background = part === "n" ? "" : part.startsWith("c:") ? "#" + part.slice(2) : "#" + Voices.DUET[part];
      later();
    });
    $$("[data-vt]", fv).forEach(inp => inp.oninput = () => { V.tones[inp.dataset.vt] = inp.value; later(); });
    $$("[data-vgo]", fv).forEach(b => b.onclick = guard(() => goFind(b.dataset.vgo, b.dataset.vfind)));
    const outputs = async () => {
      const L = Voices.analyse(book.cast || [], (await scenesOf(book)).filter(s => !(book.chapters.find(c => c.id === s.chId) || {}).skip), V.pov);
      const vs = Voices.voicesUsed(book, L), chs = await Voices.lampChapters(book, L);
      return { L, vs, chs };
    };
    const dl = (blob, name) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
    $("#vdocx").onclick = guard(async () => { const { vs, chs } = await outputs(); const blob = await Voices.highlightedDocx(book, chs, vs), name = `${Store.safe(book.title)} - Highlighted manuscript.docx`; await Store.saveExport(book, name, blob); dl(blob, name); toast(`${name}: saved in Exports and downloaded.`); });
    $("#vscripts").onclick = guard(async () => {
      const { L, vs } = await outputs(), scs = Voices.scripts(book, L, vs);
      if (!scs.length) { toast("No voiced lines yet."); return; }
      for (const sc of scs) { const blob = await Voices.scriptDocx(book, sc, V.readers[sc.voice.part]), name = `${Store.safe(book.title)} - Script - ${Store.safe(sc.title)}.docx`; await Store.saveExport(book, name, blob); dl(blob, name); }
      toast(`${scs.length} character script${scs.length === 1 ? "" : "s"}: saved in Exports and downloaded.`);
    });
    $("#vsend") && ($("#vsend").onclick = guard(async () => {
      if (unset.length && !(await confirmBox(`${unset.map(c => esc(c.name)).join(", ")} ${unset.length === 1 ? "has" : "have"} no voice yet, so their lines would be read as narration. Send anyway?`, "Send anyway"))) return;
      const nl = lines.filter(l => !chosen(l) && !l.guess).length;
      if (nl && !(await confirmBox(`${nl} line${nl === 1 ? " has" : "s have"} no speaker and will be read as narration. Send anyway?`, "Send anyway"))) return;
      const { L, vs, chs } = await outputs(), scs = Voices.scripts(book, L, vs);
      const parts = { n: V.readers.n || "" }; for (const v of vs) parts[v.part] = V.readers[v.part] || "";
      const blob = await Voices.highlightedDocx(book, chs, vs), name = `${Store.safe(book.title)} - Highlighted manuscript.docx`;
      await Store.saveExport(book, name, blob);
      const r = await Lamp.createAudio(book, chs, parts, Voices.lampCues(book, scs), blob, name);
      book.lampAudio = { id: r.id, folder: r.folder, sent: Store.today() }; await save();
      toast(`“${book.title}” is in the Lamp Room as an audio project: ${chs.length} chapters, ${vs.length} voice${vs.length === 1 ? "" : "s"}, ${scs.length} character script${scs.length === 1 ? "" : "s"}.`, 7000);
      renderVoices();
    }));
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
    const conflicts = Cast.continuity(book.cast, [{ where: "Reference shelf", sceneId: null, md: bible }].concat(scenes.map(s => ({ where: s.ch + " › " + s.title, sceneId: s.id, md: s.md }))));
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
      ${book.cast.length ? `<div class="card cont"><h3>Continuity: details that don't agree</h3>${conflicts.length ? conflicts.map(c => `<div class="crow plain"><span><b>${esc(c.name)}</b>: ${esc(c.attr)}</span></div>${c.values.map(v => `<div class="ex"><b>${esc(v.v)}</b> <span class="muted small">${v.where.map(w => esc(w.where)).join(" · ")}</span>${v.where.filter(w => w.sceneId).slice(0, 1).map(w => ` <button class="btn small quiet" data-go="${esc(w.sceneId)}" data-find="${esc(w.find)}">Show</button>`).join("")}</div>`).join("")}`).join("") : `<p class="small">Nothing disagrees: eye colour, hair colour and ages match everywhere they're mentioned${bible ? ", including the bible" : ""}.</p>`}
        <p class="small muted">Checks eyes, hair and ages for everyone on the list, in the manuscript and the reference shelf. An age can change legitimately (a birthday, a later book).</p></div>` : ""}
      ${sug.length ? `<div class="card sugg"><h3>Suggested</h3><p class="small muted">From the bible and codex on the reference shelf, and from names that keep turning up in the manuscript. Untick anything that isn't a person or a place.</p>
        <div class="found">${sug.map((c, i) => `<label class="check"><input type="checkbox" data-s="${i}" ${c.from === "bible" || c.kind === "place" ? "checked" : ""}> <span class="grow"><b>${esc(c.name)}</b>${c.aliases.length ? ` <span class="muted small">also ${esc(c.aliases.join(", "))}</span>` : ""}</span><select data-k="${i}"><option value="person" ${c.kind === "person" ? "selected" : ""}>person</option><option value="place" ${c.kind === "place" ? "selected" : ""}>place</option></select><span class="muted small">${c.from}</span></label>`).join("")}</div>
        <button class="btn primary" id="keep">Keep the ticked ones</button></div>` : ""}
      <form class="row" id="addn"><input id="nn" placeholder="Add a name"><select id="nk"><option value="person">person</option><option value="place">place</option></select><button class="btn small">Add</button></form>`;
    const save = async () => { await Store.saveBook(book); renderCast(); };
    $("#keep") && ($("#keep").onclick = guard(async () => { for (const c of $$("[data-s]", fv)) if (c.checked) { const x = sug[+c.dataset.s]; book.cast.push({ name: x.name, aliases: x.aliases, kind: $(`[data-k="${c.dataset.s}"]`, fv).value }); } await save(); }));
    $("#addn").onsubmit = guard(async e => { e.preventDefault(); const n = $("#nn").value.trim(); if (!n || book.cast.some(c => c.name === n)) return; book.cast.push({ name: n, aliases: n.includes(" ") ? [n.split(" ")[0]] : [], kind: $("#nk").value }); await save(); });
    $$("[data-del]", fv).forEach(b => b.onclick = guard(async () => { book.cast = book.cast.filter(c => c.name !== b.dataset.del); await save(); }));
    $$("[data-go]", fv).forEach(b => b.onclick = guard(() => goFind(b.dataset.go, b.dataset.find)));
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
          await Store.writeScene(book, ch, sc, t, true, true); E.base = t; if (E.sc === sc) $("#ed").innerHTML = Editor.mdToHtml(t);
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
      <div class="card"><h3>Pen names</h3><p class="small muted">What the Book Build puts on the About the Author, Links, Free book and Also By pages for each pen name.</p><div id="pens"></div></div>
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
        <label class="short">Monthly goal<input type="number" min="0" step="1000" data-goal="${i}" value="${esc(w.monthGoal || "")}" placeholder="words"></label>
        <label class="short">Writing pace<input type="number" min="100" step="50" data-pace="${i}" value="${esc(w.pace || "")}" placeholder="words/hr"></label>
        <button class="btn small quiet" data-morep="${i}" title="Another pen name">+ pen name</button>${S.writers.length > 1 ? `<button class="btn small quiet" data-delw="${i}" title="Remove writer">✕</button>` : ""}</div>`).join("");
      $$("[data-w]").forEach(x => x.oninput = x.onchange = () => { S.writers[+x.dataset.w].name = x.value.trim() || "Writer"; save(); });
      $$("[data-p]").forEach(x => x.oninput = x.onchange = () => { const [i, j] = x.dataset.p.split(":").map(Number); const p = S.writers[i].pens = S.writers[i].pens || []; p[j] = x.value.trim(); S.writers[i].pens = p.map(v => v || ""); save(); });
      $$("[data-goal]").forEach(x => x.oninput = x.onchange = () => { S.writers[+x.dataset.goal].monthGoal = +x.value || 0; save(); });
      $$("[data-pace]").forEach(x => x.onchange = guard(async () => { const w = S.writers[+x.dataset.pace]; if (+x.value > 0) { await setPaceFor(w.name, +x.value); toast("Writing pace saved" + (Lamp.state === "ready" && Lamp.keyOf(w.name) ? ", in the Lamp Room too." : ".")); } }));
      (async () => { for (const [i, w] of S.writers.entries()) { const p = await paceOf(w.name); const inp = $(`[data-pace="${i}"]`); if (inp && p.from !== "default") inp.value = p.wph; if (inp && p.from === "lamp") inp.title = "From the Lamp Room's settings; changing it here changes it there"; } })();
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
    const drawPens = () => {
      const pens = Store.pens(); S.penProfiles = S.penProfiles || {};
      $("#pens").innerHTML = pens.length ? pens.map(({ pen }) => { const p = S.penProfiles[pen] || {}; return `<details class="penbox"><summary><b>${esc(pen)}</b> <span class="muted small">${p.bio ? "bio ✓ " : ""}${p.website ? "website ✓ " : ""}${p.offer ? "free book ✓" : ""}</span></summary>
        <div class="fields"><label class="grow">Website<input data-pp="${esc(pen)}" data-k="website" value="${esc(p.website || "")}"></label><label class="grow">Newsletter sign-up link<input data-pp="${esc(pen)}" data-k="newsletter" value="${esc(p.newsletter || "")}"></label></div>
        <div class="fields"><label class="grow">Free book: title<input data-pp="${esc(pen)}" data-k="offerTitle" value="${esc(p.offerTitle || "")}"></label><label class="grow">Free book: the offer<input data-pp="${esc(pen)}" data-k="offer" value="${esc(p.offer || "")}" placeholder="Get the prequel novella free when you join the newsletter."></label></div>
        <label class="wide">About the author<textarea data-pp="${esc(pen)}" data-k="bio">${esc(p.bio || "")}</textarea></label>
        <label class="wide">Other links, one per line: <i>Label | URL</i><textarea data-pp="${esc(pen)}" data-k="links" placeholder="Facebook group | https://…">${esc(p.links || "")}</textarea></label></details>`; }).join("") : `<p class="small muted">Add pen names under Writers first.</p>`;
      $$("[data-pp]").forEach(x => x.oninput = () => { const p = S.penProfiles[x.dataset.pp] = S.penProfiles[x.dataset.pp] || {}; p[x.dataset.k] = x.value; save(); });
    };
    drawPens();
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
