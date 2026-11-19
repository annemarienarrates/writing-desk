/* The Writing Desk — the style checker. Runs on this computer, no AI and no internet.
   It finds candidates; you judge them. AI tells and filter words are counted in narration only (dialogue is the
   character's voice). Rules: Series Forge's checks list, plus the book's genre pack (extra tells, budgets, ignored lines). */
(function () {
  "use strict";
  const TELLS = [
    ["a testament to", /\ba testament to\b/gi], ["delve", /\bdelv(e|es|ed|ing)\b/gi], ["tapestry", /\btapestr(y|ies)\b/gi], ["couldn't help but", /\bcouldn['’]t help but\b/gi],
    ["breath they didn't know they were holding", /\bbreath (he|she|they|I) didn['’]t know\b/gi], ["the weight of", /\bthe weight of\b/gi], ["something shifted", /\bsomething shifted\b/gi],
    ["for what felt like", /\bfor what felt like\b/gi], ["palpable", /\bpalpabl[ey]\b/gi], ["unspoken", /\bunspoken\b/gi], ["in that moment", /\bin that moment\b/gi],
    ["barely above a whisper", /\bbarely above a whisper\b/gi], ["barely audible", /\bbarely audible\b/gi], ["ozone", /\bozone\b/gi], ["the air thick with", /\bair (was )?thick with\b/gi],
    ["a mix of", /\ba mix(ture)? of\b/gi], ["smirk", /\bsmirk(s|ed|ing)?\b/gi], ["jaw tightened", /\bjaw (tighten|clench)(ed|s|ing)?\b/gi], ["eyes that held", /\beyes that held\b/gi],
    ["let out a breath / sigh", /\blet out a (breath|sigh)\b/gi], ["somehow", /\bsomehow\b/gi], ["a beat later", /\ba beat later\b/gi],
    ["for a long time / moment", /\bfor a long (time|moment)\b/gi], ["a long moment", /\ba long moment\b/gi], ["didn't say anything", /\bdidn['’]t say anything\b/gi],
    ["the way you / he / she…", /\bthe way (you|he|she|they|it)\b/gi], ["the kind of", /\bthe kind of\b/gi], ["something in his / her chest", /\bsomething in (his|her|their|my) chest\b/gi],
    ["like a man / woman who", /\blike a (man|woman|person) who\b/gi], ["began / started to", /\b(began|begins|started|starts) to\b/gi], ["seemed to", /\bseem(ed|s)? to\b/gi],
    ["for the first time", /\bfor the first time\b/gi], ["a flicker of", /\ba flicker of\b/gi], ["steeled herself", /\bsteeled (him|her|them|my)sel(f|ves)\b/gi],
    ["a shiver down the spine", /\bshivers? (ran|went|raced) down\b/gi], ["heart hammered / pounded", /\bheart (hammer|pound|thunder)(ed|s|ing)\b/gi],
    ["the silence stretched", /\bsilence stretch(ed|es)\b/gi], ["electric", /\belectric(ity)?\b/gi], ["intoxicating", /\bintoxicating\b/gi], ["visceral", /\bvisceral\b/gi],
    ["echoed through", /\becho(ed|es) (through|off)\b/gi], ["a dance of", /\ba dance of\b/gi], ["searing", /\bsearing\b/gi], ["it was as if", /\bit was as if\b/gi]
  ];
  const WATCH = { just: 2, very: 1, really: 1, then: 3, suddenly: .5, seemed: 1, felt: 2.5, looked: 3, turned: 2, nodded: 1, smiled: 1.5, sighed: .5, shrugged: .5,
    glanced: 1, little: 2, quite: .5, almost: 1, slightly: .7, even: 2.5, still: 3.5, around: 2.5, something: 2, actually: .7, simply: .5, literally: .3, gaze: .7, grin: 1, grinned: 1, smirked: .3 };
  const FILTER = /\b(felt|saw|heard|noticed|realized|realised|watched|wondered|knew|thought|seemed|could see|could hear|could feel)\b/gi;
  const PLAIN_TAGS = new Set(["said", "says", "asked", "asks", "told", "replied", "answered"]);
  const SPEECH = "said|says|asked|asks|told|replied|answered|whispered|murmured|muttered|hissed|growled|snapped|barked|breathed|purred|drawled|exclaimed|shouted|yelled|called|cried|demanded|insisted|added|continued|admitted|offered|teased|warned|agreed|protested|pleaded|begged|groaned|moaned|gasped|sneered|scoffed|snarled|grumbled|rasped|croaked|whimpered|sobbed|laughed|chuckled|giggled|snorted|smiled|grinned|smirked|sighed|shrugged|nodded";
  const NOT_SPEECH = new Set(["laughed", "chuckled", "giggled", "snorted", "smiled", "grinned", "smirked", "sighed", "shrugged", "nodded"]);
  const STOP = new Set("a an and the of to in on at for with by from as is was were be been are am it its it's this that these those he she they them his her their hers him i me my mine you your we us our but or so if not no nor then than there here when where what who whom which why how all any some one two up out down over into onto off about after before again just had has have do did does done said would could should will can may might must shall very really too also back only just even still more most much many such own same than other each both few s t don didn wasn weren isn couldn wouldn shouldn won hadn hasn haven doesn ain let's i'm i'd i'll i've you're you'd you'll he's she's they're they'd we're we'd that's there's what's it's yeah okay ok oh like get got go went going come came know knew think thought say tell told".split(" "));
  const strip = md => String(md || "").replace(/\[xx\b[^\]]*\]/gi, " ").replace(/\\\*/g, "\u0002").replace(/\*+/g, "").replace(/\u0002/g, "*").replace(/\\\\/g, "\\");
  const words = s => (s.match(/[\p{L}][\p{L}'’]*/gu) || []);
  // dialogue → blanks of the same length, so offsets in narration still line up with the text
  const narrationOf = t => t.replace(/“[^”]*”|"[^"\n]*"/g, m => " ".repeat(m.length));
  const sentences = t => (t.replace(/\s+/g, " ").match(/[^.!?…]+(?:[.!?…]+["”’)]*|$)/g) || []).map(s => s.trim()).filter(s => /\p{L}/u.test(s));
  function syllables(w) {
    w = w.toLowerCase().replace(/[^a-z]/g, ""); if (!w) return 0; if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
    const m = w.match(/[aeiouy]{1,2}/g); return Math.max(1, m ? m.length : 1);
  }
  const snippet = (t, i, len) => { const a = Math.max(0, t.lastIndexOf(" ", Math.max(0, i - 40)) + 1), b = Math.min(t.length, (t.indexOf(" ", i + len + 40) + 1 || t.length + 1) - 1); return (a > 0 ? "…" : "") + t.slice(a, b).replace(/\s+/g, " ").trim() + (b < t.length ? "…" : ""); };

  // scenes: [{ id, ch (chapter title), title, md }]; pack: { tells: [phrases], budgets: {phrase: per chapter}, ignore: [lines] }; names: [tracked names]
  function run(scenes, pack, names, chapterCount) {
    pack = pack || {}; names = (names || []).map(n => n.toLowerCase());
    const ign = (pack.ignore || []).filter(Boolean);
    const extra = (pack.tells || []).filter(Boolean).map(p => [p, new RegExp("\\b" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+") + "\\b", "gi")]);
    const R = { words: 0, sentences: 0, syl: 0, dialogueChars: 0, chars: 0, tells: {}, watch: {}, freq: {}, echoes: [], starts: [], ngrams: {}, longSent: [], longPara: [], walls: [], tags: {}, tagAdverbs: [], notSpeech: [], tagsTotal: 0, linesTotal: 0, emDash: [], notXbutY: [], passive: [], adverbs: 0, filter: 0, exclaim: 0, budgets: {}, perChapter: {} };
    const hit = (bag, key, sc, t, i, len) => { const b = bag[key] = bag[key] || { n: 0, ex: [] }; b.n++; if (b.ex.length < 6) b.ex.push({ scene: sc.id, where: sc.ch + " › " + sc.title, text: snippet(t, i, len), find: t.substr(i, len) }); };
    for (const sc of scenes) {
      let t = strip(sc.md); for (const l of ign) t = t.split(l).join(" ");
      const nar = narrationOf(t), W = words(t), S = sentences(t);
      const pc = R.perChapter[sc.ch] = R.perChapter[sc.ch] || { words: 0, sentences: 0, dialogue: 0, chars: 0, paras: 0, sentLens: [] };
      R.words += W.length; R.sentences += S.length; pc.words += W.length; pc.sentences += S.length;
      for (const w of W) R.syl += syllables(w);
      const dch = t.length - nar.replace(/ {3,}/g, "").length; R.dialogueChars += Math.max(0, dch); R.chars += t.length; pc.dialogue += Math.max(0, dch); pc.chars += t.length;
      for (const s of S) { const n = words(s).length; pc.sentLens.push(n); if (n > 35) (R.longSent.length < 10 && R.longSent.push({ scene: sc.id, where: sc.ch + " › " + sc.title, text: s.slice(0, 160) + (s.length > 160 ? "…" : ""), find: s.slice(0, 40), n })); }
      // AI tells and extra tells (narration only)
      for (const [label, re] of TELLS.concat(extra)) { re.lastIndex = 0; let m; while ((m = re.exec(nar))) hit(R.tells, label, sc, t, m.index, m[0].length); }
      // watch words, frequency
      const lw = W.map(w => w.toLowerCase().replace(/’/g, "'"));
      for (const w of lw) { if (WATCH[w] != null) R.watch[w] = (R.watch[w] || 0) + 1; if (!STOP.has(w) && w.length > 3 && !names.includes(w)) R.freq[w] = (R.freq[w] || 0) + 1; }
      // echoes: the same word again within 40 words
      const last = {};
      lw.forEach((w, i) => { if (STOP.has(w) || w.length < 5 || names.includes(w)) return; if (last[w] != null && i - last[w] <= 40 && R.echoes.length < 400) R.echoes.push({ w, scene: sc.id, where: sc.ch + " › " + sc.title }); last[w] = i; });
      // three sentences in a row starting the same way
      for (let i = 2; i < S.length; i++) { const f = s => (words(s)[0] || "").toLowerCase(); const a = f(S[i]); if (a && a === f(S[i - 1]) && a === f(S[i - 2]) && (i < 3 || f(S[i - 3]) !== a)) R.starts.push({ w: a, scene: sc.id, where: sc.ch + " › " + sc.title, text: S[i - 2].slice(0, 90) + "…", find: S[i - 2].slice(0, 30) }); }
      // repeated phrases (5 words, across the book)
      for (let i = 0; i + 5 <= lw.length; i++) { const g = lw.slice(i, i + 5); if (g.every(x => STOP.has(x))) continue; const k = g.join(" "); const e = R.ngrams[k] = R.ngrams[k] || { n: 0, where: [] }; e.n++; if (e.where.length < 4 && !e.where.some(x => x.scene === sc.id)) e.where.push({ scene: sc.id, where: sc.ch + " › " + sc.title, find: W.slice(i, i + 5).join(" ") }); }
      // paragraphs: long narration paragraphs, walls of them
      const paras = t.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean); pc.paras += paras.length; let run = 0;
      for (const p of paras) { const n = sentences(p).length, dial = /^[“"]/.test(p); if (n > 4 && !dial) { R.longPara.length < 30 && R.longPara.push({ scene: sc.id, where: sc.ch + " › " + sc.title, text: p.slice(0, 120) + "…", find: p.slice(0, 40), n }); run++; if (run === 3) R.walls.push({ scene: sc.id, where: sc.ch + " › " + sc.title, text: p.slice(0, 90) + "…", find: p.slice(0, 40) }); } else run = 0; }
      // dialogue tags
      const lines = t.match(/“[^”]*”|"[^"\n]*"/g) || []; R.linesTotal += lines.length;
      const tagRe = new RegExp(`[”"],?\\s+(?:(?:he|she|they|I|we|you|[A-Z][a-z]+)\\s+(${SPEECH})|(${SPEECH})\\s+(?:he|she|they|I|we|[A-Z][a-z]+))\\b(\\s+\\w+ly\\b)?`, "g");
      let m; while ((m = tagRe.exec(t))) {
        const v = (m[1] || m[2]).toLowerCase(); R.tagsTotal++; R.tags[v] = (R.tags[v] || 0) + 1;
        if (m[3] && !/^\s+(only|early|family|holy|silly|belly|bully|rally|reply|lily)$/i.test(m[3])) R.tagAdverbs.length < 20 && R.tagAdverbs.push({ scene: sc.id, where: sc.ch + " › " + sc.title, text: snippet(t, m.index, m[0].length), find: m[0].replace(/^[”"],?\s+/, "") });
        if (NOT_SPEECH.has(v)) R.notSpeech.length < 20 && R.notSpeech.push({ scene: sc.id, where: sc.ch + " › " + sc.title, text: snippet(t, m.index, m[0].length), find: m[0].replace(/^[”"],?\s+/, "") });
      }
      // style: em-dashes, "not X but Y", passive, adverbs, filter words, exclamation in narration
      for (const mm of t.matchAll(/—/g)) R.emDash.length < 400 && R.emDash.push({ scene: sc.id, where: sc.ch + " › " + sc.title, text: snippet(t, mm.index, 1), find: "—" });
      for (const mm of t.matchAll(/\b(?:wasn['’]t|isn['’]t|not)\b[^.]{0,40}[,;—]\s*(?:it was|but)\b/gi)) R.notXbutY.push({ scene: sc.id, where: sc.ch + " › " + sc.title, text: snippet(t, mm.index, mm[0].length), find: mm[0] });
      for (const mm of nar.matchAll(/\b(was|were|been|being|is|are|be)\s+(\w+ed|\w+en)\b/gi)) if (!/^(open|even|seen|often|eleven|kitten|garden|golden|wooden|sudden|hidden|broken|chosen|frozen|forgotten|rotten|swollen|woven)$/i.test(mm[2]) || /^(seen|broken|chosen|frozen|forgotten|hidden|woven)$/i.test(mm[2])) R.passive.length < 300 && R.passive.push({ scene: sc.id, where: sc.ch + " › " + sc.title, text: snippet(t, mm.index, mm[0].length), find: mm[0] });
      R.adverbs += (nar.match(/\b\w{3,}ly\b/g) || []).filter(w => !/^(only|early|family|holy|silly|belly|bully|rally|reply|lily|ugly|supply|apply|fly|july|italy|lonely|lovely|friendly|likely|daily|elderly|costly|deadly|ally|jolly|hilly|chilly|curly|surly|burly|wily)$/i.test(w)).length;
      R.filter += (nar.match(FILTER) || []).length;
      R.exclaim += (nar.match(/!/g) || []).length;
      // budgets from the genre pack
      for (const [k, lim] of Object.entries(pack.budgets || {})) { const re = new RegExp("\\b" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi"); const n = (t.match(re) || []).length; const b = R.budgets[k] = R.budgets[k] || { n: 0, lim: +lim, ex: [] }; b.n += n; if (n && b.ex.length < 4) b.ex.push({ scene: sc.id, where: sc.ch + " › " + sc.title, find: k }); }
    }
    // tidy up
    const per1k = n => R.words ? n * 1000 / R.words : 0;
    R.chapters = chapterCount || Object.keys(R.perChapter).length || 1;
    R.flesch = R.words && R.sentences ? 206.835 - 1.015 * (R.words / R.sentences) - 84.6 * (R.syl / R.words) : 0;
    R.grade = R.words && R.sentences ? 0.39 * (R.words / R.sentences) + 11.8 * (R.syl / R.words) - 15.59 : 0;
    R.avgSent = R.sentences ? R.words / R.sentences : 0;
    R.dialoguePct = R.chars ? Math.round(100 * R.dialogueChars / R.chars) : 0;
    R.watchList = Object.entries(R.watch).map(([w, n]) => ({ w, n, rate: per1k(n), over: per1k(n) > WATCH[w] })).sort((a, b) => (b.over - a.over) || b.rate - a.rate);
    R.top = Object.entries(R.freq).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([w, n]) => ({ w, n, rate: per1k(n) }));
    const ec = {}; for (const e of R.echoes) (ec[e.w] = ec[e.w] || { w: e.w, n: 0, ex: [] }).n++, ec[e.w].ex.length < 4 && ec[e.w].ex.push(e);
    R.echoList = Object.values(ec).sort((a, b) => b.n - a.n).slice(0, 15);
    R.repeats = Object.entries(R.ngrams).filter(([, e]) => e.n >= 2 && e.where.length >= 1).map(([k, e]) => ({ k, n: e.n, where: e.where })).sort((a, b) => b.n - a.n).slice(0, 20);
    delete R.ngrams; delete R.freq; delete R.watch;
    R.tellList = Object.entries(R.tells).map(([k, v]) => ({ k, ...v })).sort((a, b) => b.n - a.n);
    R.tagList = Object.entries(R.tags).map(([k, n]) => ({ k, n, plain: PLAIN_TAGS.has(k) })).sort((a, b) => b.n - a.n);
    R.budgetList = Object.entries(R.budgets).map(([k, b]) => ({ k, n: b.n, lim: b.lim * R.chapters, ex: b.ex, over: b.n > b.lim * R.chapters }));
    R.rates = { adverbs: per1k(R.adverbs), filter: per1k(R.filter), passive: per1k(R.passive.length), emDash: per1k(R.emDash.length) };
    R.chapterRows = Object.entries(R.perChapter).map(([ch, c]) => {
      const mean = c.sentLens.reduce((a, b) => a + b, 0) / (c.sentLens.length || 1), sd = Math.sqrt(c.sentLens.reduce((a, b) => a + (b - mean) ** 2, 0) / (c.sentLens.length || 1));
      return { ch, words: c.words, avgSent: mean, variety: sd, dialoguePct: c.chars ? Math.round(100 * c.dialogue / c.chars) : 0, avgPara: c.paras ? c.words / c.paras : 0 };
    });
    return R;
  }

  // light up a phrase in the open page (CSS Custom Highlight API; nothing is written into the text)
  function highlight(ed, phrases) {
    if (!window.CSS || !CSS.highlights) return 0;
    CSS.highlights.delete("wd-check");
    if (!phrases || !phrases.length) return 0;
    const ranges = [], walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    const needles = phrases.filter(Boolean).map(p => p.toLowerCase());
    let n; while ((n = walker.nextNode())) {
      const hay = n.nodeValue.toLowerCase();
      for (const p of needles) { let i = 0; while ((i = hay.indexOf(p, i)) >= 0) { const r = new Range(); r.setStart(n, i); r.setEnd(n, i + p.length); ranges.push(r); i += p.length; } }
    }
    if (ranges.length) { CSS.highlights.set("wd-check", new Highlight(...ranges)); const rect = ranges[0].getBoundingClientRect(); const sc = ed.closest(".paper"); if (sc) sc.scrollBy({ top: rect.top - sc.getBoundingClientRect().top - 160, behavior: "smooth" }); }
    return ranges.length;
  }
  function clear() { if (window.CSS && CSS.highlights) CSS.highlights.delete("wd-check"); }

  window.Checks = { run, highlight, clear, TELLS, WATCH };
})();
