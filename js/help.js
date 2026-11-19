/* The Writing Desk — the guide. One source for the ? page and the printed PDF guides (guide/src).
   Written with Mac keys (⌘) and Mac words; WDHelp.pc() swaps them for Windows. */
(function () {
  "use strict";
  const HELP = [
    { id: "start", icon: "🪶", title: "First time at the Desk",
      lead: "Five minutes, once. After that the Desk opens straight to your shelf.",
      steps: [
        "Open the Desk in Google Chrome. It only works in Chrome (Safari and Firefox can't open folders on your computer).",
        "Click Choose library folder. Go to Documents, click New Folder and call it Writing Desk Library. Keep it out of Google Drive, iCloud and Dropbox: syncing services can fight the Desk over a file while you type.",
        "Select the new folder and click Open, then Edit files when Chrome asks. Everything you write is saved there as ordinary files you can see in Finder.",
        "Go to Settings ▸ Writers. Add yourself, then up to two pen names. Each book belongs to one writer and one pen name.",
        "Pick a look in Settings (it uses the same themes as the Lamp Room), and connect the Lamp Room library if you use the Lamp Room."
      ],
      items: [
        ["After a restart", "Chrome may ask again after it restarts. Click Open my library and allow it. If Chrome offers Allow on every visit, pick that and it stops asking."],
        ["One library each", "Each writer keeps their own library folder, on their own computer. A library holds all of that writer's books."],
        ["Trying things out", "Add ?test to the address to play in a practice library inside Chrome. It never touches your real books."]
      ] },

    { id: "shelf", icon: "📚", title: "The bookshelf",
      lead: "Every book in your library, standing on a shelf. Click a cover to open it.",
      items: [
        ["Covers", "Shown whole, never cropped. Add or change a cover in a book's side panel under Book."],
        ["Series plaques", "Books in the same series stand together behind a brass plaque. Click the plaque for the series page."],
        ["♥ number", "How many love scenes are still marked to write in that book."],
        ["✒ Lamp Room projects", "Writing projects in the Lamp Room that aren't on the Desk yet. Click one to bring it over."],
        ["The wall", "Settings ▸ Bookshelf wall: wood shelves in your theme's colours, your own photo, or plain."]
      ] },

    { id: "newbook", icon: "✚", title: "Starting a book",
      lead: "Click New book. Start with a blank page or bring in a Word file you already have.",
      steps: [
        "Type the title, then pick the writer, pen name, genre and (if it has one) the series and book number.",
        "Leave Add to the writer's projects in the Lamp Room ticked if you want it in the planner too.",
        "To import, choose your manuscript .docx. Chapters are found from Word headings, or from lines like “Chapter 3” if there are no headings.",
        "Add your codex and story bible .docx files in the same step. They go on the book's Reference shelf, not into the manuscript.",
        "Check the chapter list it shows you, then click Create book."
      ],
      items: [
        ["Scene breaks", "A line of * * * or ⁂ in your Word file starts a new scene."],
        ["Italics and bold", "Come across from Word. So do headings."],
        ["Importing later", "A book that's already on the shelf can take a .docx too: open its side panel ▸ Book ▸ Import a manuscript into this book…."]
      ] },

    { id: "writing", icon: "✎", title: "Writing",
      lead: "Chapters and scenes on the left, the page in the middle, your notes on the right.",
      items: [
        ["Saving", "Automatic, a second after you stop typing. The chip at the top says Saved. ⌘S saves this instant if you like the habit."],
        ["Chapters and scenes", "+ Chapter at the bottom of the left list; the + beside a chapter adds a scene. Drag either to move it. Hover for rename and trash."],
        ["Book page or Plain", "Book page looks like a printed page; Plain is a calm, wide writing box. Switch with the button above the page."],
        ["Formatting", "⌘B bold, ⌘I italic. Type * * * on its own line for a scene break. Pasting from Word or Google Docs keeps italics and drops the clutter."],
        ["Love scenes", "Type [xx] (or [xx — the barn]) where a love scene will go. It's tinted on the page, counted with a ♥ and listed under Beats so none get forgotten."],
        ["Side panel", "Beats: this chapter's outline. Cast: who's in this scene. Reference: your bible and codex copies. Book: details, cover, import. Hide it with Hide panel."],
        ["Dictation", "Click 🎙 Dictate and talk. Say “comma”, “period”, “question mark”, “new paragraph”, “scene break”. Say “stop dictating” or click again to stop."]
      ] },

    { id: "stats", icon: "📈", title: "Stats, goals and sprints",
      lead: "The bar across the top of every book.",
      items: [
        ["Words", "The whole book as it stands, with a bar toward its word target."],
        ["This month", "Words written on this book this month. Days where you cut more than you wrote count as zero, so editing never drags you below nothing."],
        ["Your month", "Everything you've written this month across all your books, against your monthly goal."],
        ["Per month", "This book's average since it started."],
        ["Book speed", "How many months your finished books took on average, and how long this one has been going."],
        ["Pace and monthly goal", "Pace is words per hour, with the hours left to reach the book's target. Set it and your monthly goal in Settings ▸ Writers. It's the same pace as the Lamp Room's Settings, so changing one changes both."],
        ["⏱ Sprint", "Pick 10 to 60 minutes and write. The button counts down and counts your words. At the end you can add them to today's Lamp Room log."]
      ] },

    { id: "forge", icon: "⚒", title: "The Forge stages",
      lead: "The tabs after the tools: Setup, Outline, Draft, Revise, Edit, Format, Publish, Market. Your road from idea to launch.",
      steps: [
        "Click the stage with the bright edge. That's where you are.",
        "Read the short note at the top, then work through the checklist. Tick things off as you do them.",
        "Items marked as a gate must be ticked before the next stage opens. They're the ones that hurt to skip.",
        "Copy the prompt in the box and paste it into the series' Claude Project chat. It tells Claude exactly where the book stands.",
        "When everything's ticked, mark the stage done. The Lamp Room's stage for that book ticks itself too."
      ],
      items: [
        ["Format, Publish, Market", "Each has a step-by-step guide: Vellum for paperbacks, uploading to KDP and Draft2Digital, pricing, the email list, author swaps and where to get featured."],
        ["Going back", "Reopen this stage on any finished stage. Nothing is deleted."]
      ] },

    { id: "check", icon: "✓", title: "Check: the style report",
      lead: "Your ProWritingAid replacement. Click ✓ Check on a scene, a chapter or the whole book.",
      items: [
        ["What it finds", "AI tells and stock phrases, overused words, echoes (the same word too close), repeated phrases across chapters, samey sentence starts, pacing, readability, dialogue tags, adverbs, filter words, passive voice, em-dashes and “not X but Y”."],
        ["Show in the page", "Every finding has a link that jumps to it and lights it up. Fix it and click Check again."],
        ["Dialogue is safe", "Most checks only look at narration. Characters are allowed to talk badly."],
        ["Genre packs", "Settings ▸ Genre packs. Each genre has its own watch-list and limits (how many times a pet name or a catchphrase can appear). Edit them to suit you."]
      ] },

    { id: "cast", icon: "👥", title: "Cast, timeline and continuity",
      lead: "No codex entries to fill in. The Desk reads your bible and your pages and keeps track for you.",
      items: [
        ["👥 Cast", "Built from your story bible on the Reference shelf and the names in your text. Shows who appears in which scene, and how often."],
        ["Continuity", "Flags a character whose eyes, hair or age change between scenes. You decide which one is right."],
        ["🕰 Timeline", "One line per scene with its day. Fill in days from the text reads “the next morning”, “three days later” and weekdays for you; correct anything it got wrong."],
        ["Series page", "Click a series plaque. Every book in order, who's in which, where each one stands, and Start Book N for the next one (it carries the cast across)."]
      ] },

    { id: "build", icon: "📖", title: "Build: the ebook and Word files",
      lead: "When the words are done. Click 📖 Build.",
      steps: [
        "Check the pen-name profile: website, newsletter link, the free book you offer, your bio. Fill it once; every book by that pen name uses it.",
        "Tick the front and back matter you want: title page, copyright, also-by list, about the author, a sign-up page and so on. Click any of them to read or edit the text.",
        "Choose a look. Steel is clean and sharp, for male readers. Filigree is decorative, with ornaments and a drop cap, for female readers.",
        "Click EPUB for the ebook, or Word .docx for Draft2Digital if you'd rather let D2D do the formatting.",
        "The files are saved in the book's Exports folder and downloaded for you."
      ],
      items: [
        ["Preview", "Shows the book as a reader would see it before you build."],
        ["Advance reader copies", "Add a reader's name to make an EPUB with their name quietly marked on every chapter. Tick when it's sent."],
        ["Paperback", "Use the Word file in Vellum. The Format stage walks you through it."]
      ] },

    { id: "kit", icon: "🏷", title: "Kit: the publishing details",
      lead: "Everything the stores ask for, in one place, with copy buttons. Click 🏷 Kit.",
      steps: [
        "Click Copy the kit prompt and paste it into the series' Claude Project chat.",
        "Copy Claude's whole reply and click Paste Claude's kit…. The Desk sorts it into the right boxes.",
        "Fix anything you like. The counter beside a box turns red when it's over a store's limit.",
        "At upload time, click Copy next to each box and paste it into KDP or Draft2Digital."
      ],
      items: [
        ["Groups", "KDP, Wide (the other stores), Launch, Audiobook, Marketing and Cover prompts."],
        ["Save the kit as Markdown", "Keeps a copy in the book's folder, for the Project or for your records."]
      ] },

    { id: "voices", icon: "🎙", title: "Voices: from book to audiobook",
      lead: "Works out who says each line, then makes the narration scripts. Click 🎙 Voices.",
      steps: [
        "Choose Duet (men's lines blue, women's pink, the System yellow) or Full cast (a colour for every character).",
        "Look at the lines it wasn't sure about and pick the speaker. Every line lets you change its speaker.",
        "Make the Highlighted manuscript (.docx) for the narrators, and Character scripts (.docx) for each actor.",
        "Or click Send to the Lamp Room: it creates the audio project there with the chapters, the parts, the readers and the cues."
      ],
      items: [
        ["How it decides", "Dialogue tags first (“said Mara”), then he/she after a line, then who acted just before it, then the back-and-forth of a two-person talk."],
        ["System lines", "[Bracketed] LitRPG messages are the System's, and arrive in the Lamp Room as System cues."]
      ] },

    { id: "lamp", icon: "✒", title: "The Lamp Room link",
      lead: "The Desk and the Lamp Room share your writing projects. Connect it once in Settings.",
      items: [
        ["From the Lamp Room", "Writing projects have a ✒ in the corner of the thumbnail. Click it to open that book at the Desk."],
        ["From the Desk", "New books go into the writer's projects in the Lamp Room, with their cover."],
        ["What travels", "Title, series, book number, pen name, word target and cover, both ways. Stages tick on both sides. The writing pace is shared."],
        ["What stays put", "The manuscript lives at the Desk. The Lamp Room only gets it when you send a book from Voices."]
      ] },

    { id: "safety", icon: "🔒", title: "Keeping your work safe",
      lead: "It's hard to lose words here. These are the nets.",
      items: [
        ["History", "Each scene keeps earlier versions: one every ten minutes while you write, plus one whenever it opens. Click History, pick a time on the left to read it, then Restore this version."],
        ["Changed elsewhere", "If a scene changed outside the Desk (say, on another computer), it asks: Keep mine or Take the outside version. Both are saved in History either way."],
        ["🔒 Seal", "Freezes a chapter or the whole book with a fingerprint. Nothing can change a seal, ever. Check fingerprint proves it; New draft from this starts fresh from it."],
        ["Trash", "Deleted chapters and scenes go to the book's Trash folder, not into thin air."],
        ["Back up", "Settings ▸ Back up library… makes one zip of everything. Do it before a big change, and keep a copy somewhere else."]
      ] },

    { id: "claude", icon: "✦", title: "Working with Claude",
      lead: "The Desk has no AI inside. Claude lives in your claude.ai Projects; the Desk hands it what it needs.",
      items: [
        ["One Project per series", "The story bible lives there. Keep the master copy in the Project."],
        ["Reference shelf", "Drop the latest bible or codex into the book's Reference. The Desk keeps the newest on top and the older ones under Previous."],
        ["Forge prompts", "Every stage has a ready prompt to paste into the Project chat."],
        ["NOTES FOR CLAUDE", "A file in your library folder that explains the layout, if Claude ever works on the folder directly."]
      ] },

    { id: "keys", icon: "⌨", title: "Shortcuts and spoken words",
      keys: [
        ["⌘S", "Save now"], ["⌘B", "Bold"], ["⌘I", "Italic"], ["⌘Z", "Undo"], ["⌘⇧Z", "Redo"], ["Esc", "Close a window"], ["Enter", "In a scene title: jump to the page"]
      ],
      spoken: [
        ["comma", ","], ["period / full stop", "."], ["question mark", "?"], ["exclamation point", "!"], ["colon · semicolon", ": ;"], ["dash", "—"], ["ellipsis", "…"],
        ["open quote · close quote", "“ ”"], ["new paragraph", "¶"], ["scene break", "* * *"], ["stop dictating", "stops"]
      ] },

    { id: "trouble", icon: "🛠", title: "When something's off",
      items: [
        ["It asks for the folder again", "Normal after Chrome restarts. Click Open my library and allow it (Allow on every visit, if offered, stops the asking)."],
        ["No 🎙 Dictate button", "Dictation needs Chrome and the internet. If it stops at once, allow the microphone from the 🔒 in the address bar."],
        ["A book is missing", "Check the library folder in Settings. Each book is a folder under Books; nothing leaves it except into Trash."],
        ["The Lamp Room link is grey", "Settings ▸ Lamp Room: click Connect the Lamp Room library and allow it."],
        ["Something looks broken", "Reload the page (⌘R). Your words were already saved. If it keeps happening, tell Claude what you clicked."]
      ] }
  ];

  const MAC_TO_PC = s => String(s).replace(/⌘⇧/g, "Ctrl+Shift+").replace(/⌘/g, "Ctrl+").replace(/⇧/g, "Shift+").replace(/\bFinder\b/g, "File Explorer");
  const isPC = () => { try { const v = localStorage.getItem("lr-platform"); if (v) return v === "pc"; } catch (e) { } const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || ""; return !/mac|iphone|ipad/i.test(p); };
  // a deep copy of HELP with every string swapped for Windows
  const forPC = () => JSON.parse(JSON.stringify(HELP), (k, v) => typeof v === "string" ? MAC_TO_PC(v) : v);
  window.WDHelp = { HELP, isPC, forPC, swap: MAC_TO_PC, get(pc) { return pc ? forPC() : HELP; } };
})();
