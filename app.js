/* Deeper Stash — bite-sized ideas, stashed and remembered.
   Everything runs in the browser. Data lives in localStorage and, optionally,
   syncs to a JSON file in a GitHub repo via the GitHub REST API. */
(() => {
  "use strict";

  // ---------------------------------------------------------------- constants
  const STORE_KEY = "deeperstash:data:v1";
  const SYNC_KEY = "deeperstash:sync:v1";
  const LOCAL_KEY = "deeperstash:local:v1"; // per-device: seen cards, prefs
  const REVIEW_INTERVALS = [1, 3, 7, 16, 35, 90]; // days, by box
  const DAILY_REVIEW_SIZE = 5;
  const MAX_FREEZES = 2;
  const EMOJIS = ["📚", "💡", "🧠", "⚡", "🌱", "💰", "❤️", "🎯", "🛠️", "✍️", "🧭", "🔥", "🌙", "🎨", "🗣️", "⭐"];
  const ICONS = {
    bookmark: '<svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" fill="currentColor"/></svg>',
    bookmarkO: '<svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="19" cy="12" r="1.9" fill="currentColor"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    headphones: '<svg viewBox="0 0 24 24"><path d="M4 15v-3a8 8 0 0 1 16 0v3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><rect x="3" y="14" width="5" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="1.9"/><rect x="16" y="14" width="5" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4.2" height="14" rx="1.3" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.3" fill="currentColor"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M5 6v12l9-6Z" fill="currentColor"/><rect x="16" y="6" width="3" height="12" rx="1" fill="currentColor"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="9" cy="10" r="2" fill="currentColor"/><path d="m4 18 5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    route: '<svg viewBox="0 0 24 24"><circle cx="6" cy="18" r="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="18" cy="6" r="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8.5 18H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    iosShare: '<svg viewBox="0 0 24 24" style="width:16px;height:16px;vertical-align:-3px"><path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  // ---------------------------------------------------------------- helpers
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const now = () => Date.now();
  const uid = (p) => p + "-" + Math.random().toString(36).slice(2, 8) + now().toString(36).slice(-4);
  const dayKey = (d = new Date()) => {
    const z = new Date(d); return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`;
  };
  const addDays = (key, n) => { const [y, m, d] = key.split("-").map(Number); return dayKey(new Date(y, m - 1, d + n)); };
  const shuffle = (a, rand = Math.random) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const load = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const persist = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const buzz = (ms = 12) => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const words = (s) => String(s || "").trim().split(/\s+/).length;
  const readTime = (i) => { const sec = Math.max(10, Math.round((words(i.title) + words(i.body)) / 3.8 / 5) * 5); return sec < 60 ? `${sec} sec read` : `${Math.round(sec / 60)} min read`; };
  const validImage = (src) => typeof src === "string" && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(src);
  const validUrl = (u) => typeof u === "string" && /^https?:\/\//i.test(u);
  const validQuiz = (q) => q && typeof q.q === "string" && q.q.trim() && typeof q.a === "string" && q.a.trim() && Array.isArray(q.w) && q.w.some((x) => String(x || "").trim());
  const artHTML = (idea, opts) => validImage(idea.image) ? `<img src="${esc(idea.image)}" alt="">` : Art.svg(idea, opts);
  const topicStyle = (t) => { const [a, b] = Art.palette(t); return `--g1:${a};--g2:${b}`; };
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  // ---------------------------------------------------------------- state
  const freshData = () => ({
    v: 1,
    ideas: {},      // user ideas: id -> {id,title,body,source,url?,topic,image?,quiz?,createdAt,updatedAt,deleted?}
    stashes: {      // id -> {id,name,emoji,ideaIds:[],updatedAt,deleted?}
      "st-saved": { id: "st-saved", name: "Saved", emoji: "⭐", ideaIds: [], updatedAt: 1 }
    },
    reviews: {},    // ideaId -> {box, due, at}
    days: [],       // YYYY-MM-DD dates a daily review was finished
    freezeDays: [], // dates covered by a streak freeze
    freeze: { count: 0, updatedAt: 0 },
    journeys: {},   // journeyId -> {done:[ideaIds], completedAt?, updatedAt}
    stats: { quizRight: 0, quizTotal: 0 },
    updatedAt: 0
  });
  const normalize = (d) => { const f = freshData(); d = Object.assign(f, d || {}); d.freeze = Object.assign({ count: 0, updatedAt: 0 }, d.freeze); d.stats = Object.assign({ quizRight: 0, quizTotal: 0 }, d.stats); return d; };
  let data = normalize(load(STORE_KEY, null));
  let local = Object.assign({ seen: {}, lastStash: "st-saved", topic: "All", storySeen: {}, installDismissed: false, interests: [], onboarded: false, rate: 1, achSeen: null }, load(LOCAL_KEY, {}));
  let syncCfg = load(SYNC_KEY, { owner: "", repo: "deeper-stash-data", branch: "main", path: "stash.json", token: "", lastSync: 0, auto: true });

  const ui = { tab: "feed", feedQueue: null, feedShown: 0, review: null, query: "", searchTopic: "All", openStash: null };

  function save({ sync = true } = {}) {
    data.updatedAt = now();
    persist(STORE_KEY, data);
    if (sync) scheduleSync();
    refreshChrome();
  }
  let localTimer;
  const saveLocal = () => { clearTimeout(localTimer); localTimer = setTimeout(() => persist(LOCAL_KEY, local), 150); };

  // ---------------------------------------------------------------- ideas
  const starterById = (id) => { const s = (window.STARTER_IDEAS || []).find((i) => i.id === id); return s && { ...s, starter: true, quiz: (window.STARTER_QUIZZES || {})[id] }; };
  function allIdeas() {
    const starters = (window.STARTER_IDEAS || []).map((i) => starterById(i.id));
    const mine = Object.values(data.ideas).filter((i) => !i.deleted);
    return [...mine.sort((a, b) => b.createdAt - a.createdAt), ...starters];
  }
  const ideaById = (id) => data.ideas[id] && !data.ideas[id].deleted ? data.ideas[id] : starterById(id);
  const liveStashes = () => Object.values(data.stashes).filter((s) => !s.deleted).sort((a, b) => (a.id === "st-saved" ? -1 : b.id === "st-saved" ? 1 : a.name.localeCompare(b.name)));
  const topics = () => [...new Set(allIdeas().map((i) => i.topic).filter(Boolean))].sort();
  const stashedIds = () => new Set(liveStashes().flatMap((s) => s.ideaIds));
  const stashesFor = (id) => liveStashes().filter((s) => s.ideaIds.includes(id));
  const isStashed = (id) => liveStashes().some((s) => s.ideaIds.includes(id));
  const defaultStash = () => data.stashes[local.lastStash] && !data.stashes[local.lastStash].deleted ? local.lastStash : "st-saved";

  function setInStash(stashId, ideaId, on) {
    const s = data.stashes[stashId]; if (!s) return;
    const has = s.ideaIds.includes(ideaId);
    if (on && !has) s.ideaIds.unshift(ideaId);
    if (!on && has) s.ideaIds = s.ideaIds.filter((x) => x !== ideaId);
    s.updatedAt = now();
    if (on && !data.reviews[ideaId]) data.reviews[ideaId] = { box: 0, due: dayKey(), at: now() };
  }
  function quickStash(id, { announce = true } = {}) {
    if (isStashed(id)) return false;
    const target = defaultStash();
    setInStash(target, id, true); save(); buzz();
    if (announce) toast(`Stashed in ${data.stashes[target].name}`, { label: "Change", fn: () => openStashPicker(id) });
    return true;
  }
  // A quiz with shuffled options, or null.
  function quizFor(idea) {
    const q = idea && idea.quiz; if (!validQuiz(q)) return null;
    const opts = shuffle([q.a, ...q.w.map((x) => String(x || "").trim()).filter(Boolean)]);
    return { q: q.q, a: q.a, opts };
  }
  function recordQuiz(correct) { data.stats.quizTotal++; if (correct) data.stats.quizRight++; }

  // ---------------------------------------------------------------- streak, freezes & review
  function streakInfo() {
    const set = new Set([...data.days, ...data.freezeDays]);
    const today = dayKey();
    let cur = set.has(today) ? today : addDays(today, -1);
    let count = 0;
    while (set.has(cur)) { count++; cur = addDays(cur, -1); }
    const sorted = [...set].sort(); let best = 0, run = 0, prev = null;
    for (const d of sorted) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
    return { count, best, doneToday: data.days.includes(today), freezes: data.freeze.count };
  }
  // If you missed days since your last review, spend streak freezes to cover them.
  function applyFreezes() {
    const all = [...data.days, ...data.freezeDays].sort(); if (!all.length) return;
    const today = dayKey(), last = all[all.length - 1], yesterday = addDays(today, -1);
    if (last >= yesterday) return;
    const gap = []; for (let d = addDays(last, 1); d < today; d = addDays(d, 1)) gap.push(d);
    if (gap.length && gap.length <= data.freeze.count) {
      data.freezeDays.push(...gap);
      data.freeze = { count: data.freeze.count - gap.length, updatedAt: now() };
      save();
      setTimeout(() => toast(`❄️ ${gap.length === 1 ? "A streak freeze covered yesterday" : `${gap.length} streak freezes covered your missed days`} — streak saved`), 1200);
    }
  }
  function finishDay() {
    if (data.days.includes(dayKey())) return;
    data.days.push(dayKey()); buzz([10, 40, 10]);
    const s = streakInfo();
    if (s.count > 0 && s.count % 7 === 0 && data.freeze.count < MAX_FREEZES) {
      data.freeze = { count: data.freeze.count + 1, updatedAt: now() };
      setTimeout(() => toast(`❄️ ${s.count}-day streak! You earned a streak freeze`), 600);
    }
  }
  function buildReviewSession() {
    const today = dayKey();
    const inStash = stashedIds();
    const due = [...inStash].filter((id) => ideaById(id))
      .map((id) => ({ id, r: data.reviews[id] || { box: 0, due: today } }))
      .filter((x) => x.r.due <= today)
      .sort((a, b) => a.r.due.localeCompare(b.r.due) || a.r.box - b.r.box)
      .map((x) => x.id);
    let ids = due.slice(0, DAILY_REVIEW_SIZE), fromLibrary = false;
    if (ids.length === 0 && inStash.size === 0) { ids = shuffle(allIdeas()).slice(0, DAILY_REVIEW_SIZE).map((i) => i.id); fromLibrary = true; }
    return { ids, i: 0, revealed: false, results: [], fromLibrary, quiz: null, answer: null };
  }
  const dueCount = () => {
    const today = dayKey();
    return [...stashedIds()].filter((id) => ideaById(id) && (data.reviews[id]?.due || today) <= today).length;
  };
  function gradeReview(id, remembered) {
    const r = data.reviews[id] || { box: 0 };
    const box = remembered ? Math.min(r.box + 1, REVIEW_INTERVALS.length - 1) : 0;
    const interval = remembered ? REVIEW_INTERVALS[r.box] : 1;
    if (stashedIds().has(id)) data.reviews[id] = { box, due: addDays(dayKey(), interval), at: now() };
  }

  // ---------------------------------------------------------------- achievements
  function achievements() {
    const stashed = stashedIds().size, mine = Object.values(data.ideas).filter((i) => !i.deleted).length;
    const s = streakInfo(), read = Object.keys(local.seen).length;
    const journeysDone = Object.values(data.journeys).filter((j) => j.completedAt).length;
    const A = (id, icon, name, desc, got, goal) => ({ id, icon, name, desc, done: got >= goal, got: Math.min(got, goal), goal });
    return [
      A("stash1", "🔖", "First stash", "Stash your first idea", stashed, 1),
      A("stash25", "🗃️", "Collector", "Stash 25 ideas", stashed, 25),
      A("read50", "👀", "Curious", "Read 50 ideas", read, 50),
      A("read200", "🦉", "Bookworm", "Read 200 ideas", read, 200),
      A("write1", "✍️", "Thinker", "Write your own idea", mine, 1),
      A("write10", "🖋️", "Prolific", "Write 10 ideas", mine, 10),
      A("review5", "🔁", "Remember this", "Finish 5 daily reviews", data.days.length, 5),
      A("streak7", "🔥", "On fire", "Reach a 7-day streak", s.best, 7),
      A("streak30", "☄️", "Unstoppable", "Reach a 30-day streak", s.best, 30),
      A("quiz10", "🎯", "Sharp", "Answer 10 quiz questions right", data.stats.quizRight, 10),
      A("journey1", "🧭", "Explorer", "Finish a journey", journeysDone, 1),
      A("journey3", "🏔️", "Pathfinder", "Finish 3 journeys", journeysDone, 3)
    ];
  }
  function checkAchievements() {
    const done = achievements().filter((a) => a.done);
    if (!Array.isArray(local.achSeen)) { local.achSeen = done.map((a) => a.id); saveLocal(); return; }
    const fresh = done.filter((a) => !local.achSeen.includes(a.id));
    if (fresh.length) {
      local.achSeen.push(...fresh.map((a) => a.id)); saveLocal();
      setTimeout(() => toast(`${fresh[0].icon} Achievement unlocked: ${fresh[0].name}`), 900);
    }
  }

  // ---------------------------------------------------------------- toast & sheet
  let toastTimer;
  function toast(msg, action) {
    const t = $("#toast");
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ""}`;
    if (action) t.querySelector("button").onclick = () => { t.classList.remove("show"); action.fn(); };
    t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), action ? 4000 : 2400);
  }
  function openSheet(html, bind) {
    const sheet = $("#sheet");
    $("#sheetBody").innerHTML = html;
    sheet.style.transform = ""; sheet.hidden = false; $("#sheetBackdrop").hidden = false;
    sheet.scrollTop = 0;
    document.documentElement.classList.add("sheet-open");
    bind && bind($("#sheetBody"));
  }
  function closeSheet() {
    const sheet = $("#sheet"); if (sheet.hidden) return;
    sheet.hidden = true; $("#sheetBackdrop").hidden = true; sheet.style.transform = "";
    $("#sheetBody").innerHTML = "";
    document.documentElement.classList.remove("sheet-open");
  }
  $("#sheetBackdrop").onclick = closeSheet;
  (() => {
    const sheet = $("#sheet"); let y0 = null, dy = 0;
    sheet.addEventListener("pointerdown", (e) => {
      if (!e.target.closest(".sheet-grab") && (sheet.scrollTop > 0 || e.target.closest("input,textarea,select,button,label,a,summary"))) return;
      if (!e.target.closest(".sheet-grab") && e.pointerType === "mouse") return;
      y0 = e.clientY; dy = 0;
    });
    window.addEventListener("pointermove", (e) => {
      if (y0 === null) return; dy = Math.max(0, e.clientY - y0);
      if (dy > 4) { sheet.style.transition = "none"; sheet.style.transform = `translateY(${dy}px)`; }
    });
    const end = () => {
      if (y0 === null) return; y0 = null; sheet.style.transition = "";
      if (dy > 110) closeSheet(); else sheet.style.transform = "";
    };
    window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end);
  })();
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#sheet").hidden) closeSheet(); else if (journey.el) closeJourney(); else if (story.el) closeStory();
  });

  // ---------------------------------------------------------------- chrome & navigation
  function refreshChrome() {
    const s = streakInfo();
    $("#streakCount").textContent = s.count;
    $("#streakPill").classList.toggle("lit", s.doneToday);
    $("#streakPill").title = s.doneToday ? `${s.count}-day streak — today's review is done` : `${s.count}-day streak — do today's review to keep it`;
    const due = dueCount(); const b = $("#reviewBadge");
    b.hidden = !due || s.doneToday; b.textContent = Math.min(due, 99);
    checkAchievements();
  }
  document.querySelectorAll(".tab").forEach((btn) => btn.onclick = () => {
    if (btn.dataset.tab === ui.tab) {
      window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" });
      if (ui.tab === "stashes" && ui.openStash) { ui.openStash = null; render(); }
      if (ui.tab === "search" && (ui.query || ui.searchTopic !== "All")) { ui.query = ""; ui.searchTopic = "All"; render(); }
      return;
    }
    go(btn.dataset.tab);
  });
  $("#streakPill").onclick = () => go("review");
  $("#settingsBtn").onclick = openSettings;
  $("#addBtn").onclick = () => openEditor();

  function go(tab) {
    const run = () => {
      ui.tab = tab; if (tab !== "stashes") ui.openStash = null;
      document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
      render(); window.scrollTo(0, 0);
    };
    if (document.startViewTransition && !reduceMotion()) document.startViewTransition(run); else run();
  }
  function render() {
    document.documentElement.classList.toggle("snap", ui.tab === "feed");
    ({ feed: renderFeed, review: renderReview, stashes: renderStashes, search: renderExplore })[ui.tab]();
    refreshChrome();
  }
  function softRefresh() {
    if (ui.tab !== "feed") return render();
    document.querySelectorAll("#feed .fcard[data-id]").forEach((el) => {
      const idea = ideaById(el.dataset.id);
      if (!idea) return el.remove();
      const fresh = htmlToEl(feedCardHTML(idea, el.dataset.idx));
      el.replaceWith(fresh); bindFeedCard(fresh); feedObserver.observe(fresh);
    });
    const row = $(".stories"); if (row) { row.outerHTML = storiesRowHTML(); bindStoriesRow(); }
    refreshChrome();
  }
  const htmlToEl = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  // ---------------------------------------------------------------- LISTEN MODE (text-to-speech)
  const canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const player = { ids: [], i: 0, playing: false, label: "", chunks: [], ci: 0, token: 0 };
  let voiceCache = null;
  function pickVoice() {
    if (voiceCache) return voiceCache;
    const vs = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
    for (const p of [/natural/i, /premium|enhanced/i, /^samantha/i, /google us english/i, /^daniel/i, /^karen/i]) { const v = vs.find((x) => p.test(x.name)); if (v) return (voiceCache = v); }
    return (voiceCache = vs.find((v) => v.default) || vs[0] || null);
  }
  if (canSpeak) speechSynthesis.onvoiceschanged = () => { voiceCache = null; };
  function listen(ids, start = 0, label = "Listening") {
    if (!canSpeak) return toast("This browser can't read aloud");
    player.ids = ids.filter((id) => ideaById(id)); if (!player.ids.length) return;
    player.i = Math.min(start, player.ids.length - 1); player.label = label; player.playing = true;
    playCurrent();
  }
  function playCurrent() {
    const idea = ideaById(player.ids[player.i]); if (!idea) return stopPlayer();
    local.seen[idea.id] = local.seen[idea.id] || now(); saveLocal();
    player.chunks = [idea.title.replace(/[.!?]*$/, ".")].concat(String(idea.body).match(/[^.!?]+[.!?]+["”’)]*\s*|[^.!?]+$/g) || [idea.body]);
    player.ci = 0; speakChunk(); renderPlayer();
  }
  function speakChunk() {
    speechSynthesis.cancel();
    const tok = ++player.token;
    if (player.ci >= player.chunks.length) {
      if (player.i < player.ids.length - 1) { setTimeout(() => { if (tok === player.token && player.playing) { player.i++; playCurrent(); } }, 700); }
      else { player.playing = false; renderPlayer(); }
      return;
    }
    const u = new SpeechSynthesisUtterance(player.chunks[player.ci].trim());
    const v = pickVoice(); if (v) u.voice = v;
    u.rate = local.rate || 1;
    u.onend = () => { if (tok !== player.token || !player.playing) return; player.ci++; speakChunk(); };
    speechSynthesis.speak(u);
  }
  function pausePlayer() { player.playing = false; player.token++; speechSynthesis.cancel(); renderPlayer(); }
  function resumePlayer() { if (!player.ids.length) return; player.playing = true; if (player.ci >= player.chunks.length) { player.i = 0; return playCurrent(); } speakChunk(); renderPlayer(); }
  function stopPlayer() { player.playing = false; player.token++; player.ids = []; if (canSpeak) speechSynthesis.cancel(); renderPlayer(); }
  function renderPlayer() {
    const bar = $("#player");
    const idea = player.ids.length && ideaById(player.ids[player.i]);
    document.documentElement.classList.toggle("has-player", !!idea);
    if (!idea) { bar.hidden = true; return; }
    bar.hidden = false; bar.setAttribute("style", topicStyle(idea.topic));
    bar.innerHTML = `
      <span class="pl-thumb">${artHTML(idea, { center: true })}</span>
      <button class="pl-text" id="plOpen"><b>${esc(idea.title)}</b><small>${player.playing ? '<i class="eq"><i></i><i></i><i></i></i>' : ""}${esc(player.label)} · ${player.i + 1} of ${player.ids.length}</small></button>
      <button class="pl-btn pl-rate" id="plRate" aria-label="Speed">${local.rate || 1}×</button>
      <button class="pl-btn pl-main" id="plPlay" aria-label="${player.playing ? "Pause" : "Play"}">${player.playing ? ICONS.pause : ICONS.play}</button>
      <button class="pl-btn" id="plNext" aria-label="Next" ${player.i >= player.ids.length - 1 ? "disabled" : ""}>${ICONS.next}</button>
      <button class="pl-btn" id="plClose" aria-label="Stop">${ICONS.close}</button>`;
    $("#plPlay").onclick = () => player.playing ? pausePlayer() : resumePlayer();
    $("#plNext").onclick = () => { if (player.i < player.ids.length - 1) { player.i++; player.playing = true; playCurrent(); } };
    $("#plClose").onclick = stopPlayer;
    $("#plOpen").onclick = () => openIdea(idea.id);
    $("#plRate").onclick = () => {
      const rates = [1, 1.25, 1.5, 0.85]; local.rate = rates[(rates.indexOf(local.rate || 1) + 1) % rates.length]; saveLocal();
      if (player.playing) speakChunk(); renderPlayer();
    };
  }

  // ---------------------------------------------------------------- SHARE AS IMAGE
  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  function wrapLines(g, text, maxW, maxLines) {
    const out = []; let line = "";
    for (const w of String(text).split(/\s+/)) {
      const test = line ? line + " " + w : w;
      if (g.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
    }
    if (line) out.push(line);
    if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = out[maxLines - 1].replace(/\s*\S*$/, "") + "…"; }
    return out;
  }
  async function ideaImage(idea) {
    const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    try { await document.fonts?.ready; } catch {}
    const [c1, c2] = Art.palette(idea.topic);
    g.fillStyle = "#fffdf8"; g.fillRect(0, 0, W, H);
    const artH = 600;
    try {
      const img = await loadImg(validImage(idea.image) ? idea.image : "data:image/svg+xml;charset=utf-8," + encodeURIComponent(Art.svg(idea)));
      const r = Math.max(W / img.width, artH / img.height), w = img.width * r, h = img.height * r;
      g.drawImage(img, (W - w) / 2, (artH - h) / 2, w, h);
    } catch { const gr = g.createLinearGradient(0, 0, W, artH); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(0, 0, W, artH); }
    // topic pill
    g.font = "700 30px Inter, system-ui, sans-serif";
    const tl = (idea.topic || "Idea").toUpperCase(), tw = g.measureText(tl).width;
    g.fillStyle = "rgba(255,255,255,.94)"; g.beginPath(); g.roundRect(56, 52, tw + 48, 58, 29); g.fill();
    g.fillStyle = c2; g.fillText(tl, 80, 92);
    let y = artH + 110;
    g.fillStyle = "#1d1914"; g.font = "700 66px Fraunces, Georgia, serif";
    for (const l of wrapLines(g, idea.title, W - 144, 3)) { g.fillText(l, 72, y); y += 80; }
    y += 18; g.fillStyle = "#554d42"; g.font = "400 38px Inter, system-ui, sans-serif";
    const room = Math.max(1, Math.floor((H - 170 - y) / 56));
    for (const l of wrapLines(g, idea.body, W - 144, room)) { g.fillText(l, 72, y); y += 56; }
    g.fillStyle = "#e2d9c7"; g.fillRect(72, H - 140, W - 144, 2);
    g.font = "500 30px Inter, system-ui, sans-serif"; g.fillStyle = "#8c8374";
    if (idea.source) g.fillText(wrapLines(g, idea.source, W - 520, 1)[0], 72, H - 76);
    g.font = "700 34px Fraunces, Georgia, serif"; g.fillStyle = "#e2552b"; g.textAlign = "right"; g.fillText("Deeper Stash", W - 72, H - 76);
    return new Promise((r) => c.toBlob(r, "image/png"));
  }
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "idea";
  async function shareIdea(idea) {
    const text = `${idea.title}\n\n${idea.body}${idea.source ? "\n\n— " + idea.source : ""}`;
    pauseStory();
    try {
      if (navigator.share) {
        try {
          const blob = await ideaImage(idea);
          const file = new File([blob], slug(idea.title) + ".png", { type: "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: idea.title, text }); return; }
        } catch (e) { if (e && e.name === "AbortError") return; }
        await navigator.share({ title: idea.title, text });
      } else { await navigator.clipboard.writeText(text); toast("Copied to clipboard"); }
    } catch {} finally { resumeStory(); }
  }
  async function saveIdeaImage(idea) {
    const blob = await ideaImage(idea);
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = slug(idea.title) + ".png"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast("Image saved");
  }

  // ---------------------------------------------------------------- STORIES
  function buildStories() {
    const today = dayKey(), lib = allIdeas();
    const list = [{ id: "daily", name: "Daily 5", topic: "daily", ids: shuffle(lib, Art.rng("daily" + today)).slice(0, 5).map((i) => i.id) }];
    const mine = lib.filter((i) => !i.starter).slice(0, 10);
    if (mine.length) list.push({ id: "mine", name: "Your ideas", topic: "mine", ids: mine.map((i) => i.id) });
    const ts = topics(), int = local.interests || [];
    for (const t of [...ts.filter((t) => int.includes(t)), ...ts.filter((t) => !int.includes(t))]) {
      const ids = shuffle(lib.filter((i) => i.topic === t), Art.rng(t + today)).slice(0, 8).map((i) => i.id);
      if (ids.length) list.push({ id: "t:" + t, name: t, topic: t, ids });
    }
    const seen = (s) => local.storySeen[s.id] === today;
    return [...list.filter((s) => !seen(s)), ...list.filter(seen)];
  }
  function storiesRowHTML() {
    const today = dayKey();
    return `<div class="stories" role="list">${buildStories().map((s, i) => `
      <button class="story-bubble ${local.storySeen[s.id] === today ? "seen" : ""}" data-si="${i}" role="listitem" aria-label="${esc(s.name)} story">
        <span class="ring"><span class="av">${Art.avatar(s.topic)}</span></span><span class="sl">${esc(s.name)}</span>
      </button>`).join("")}</div>`;
  }
  function bindStoriesRow() { document.querySelectorAll(".story-bubble").forEach((b) => b.onclick = () => openStory(+b.dataset.si)); }

  const story = { list: null, si: 0, ii: 0, t0: 0, elapsed: 0, dur: 0, paused: false, raf: 0, el: null };
  function openStory(si) {
    if (player.playing) pausePlayer();
    story.list = buildStories(); story.si = si; story.ii = 0;
    const el = document.createElement("div"); el.id = "storyView"; el.className = "story"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Story");
    document.body.appendChild(el); story.el = el;
    document.documentElement.classList.add("story-open");
    bindStoryGestures(el);
    showStoryFrame();
  }
  function closeStory() {
    cancelAnimationFrame(story.raf);
    if (story.el) { story.el.classList.add("leaving"); const el = story.el; setTimeout(() => el.remove(), 180); }
    story.el = null;
    if (!journey.el) document.documentElement.classList.remove("story-open");
    if (ui.tab === "feed") softRefresh();
  }
  function showStoryFrame() {
    const s = story.list[story.si];
    const idea = ideaById(s.ids[story.ii]);
    if (!idea) return nextFrame();
    local.storySeen[s.id] = dayKey(); local.seen[idea.id] = local.seen[idea.id] || now(); saveLocal();
    const el = story.el;
    el.setAttribute("style", topicStyle(idea.topic));
    el.innerHTML = `
      <div class="story-frame">
        <div class="story-bars">${s.ids.map((_, k) => `<i><b style="width:${k < story.ii ? 100 : 0}%"></b></i>`).join("")}</div>
        <header class="story-head">
          <span class="sav">${Art.avatar(s.topic)}</span>
          <span class="story-name"><b>${esc(s.name)}</b><small>${story.ii + 1} of ${s.ids.length}</small></span>
          <button class="story-x" aria-label="Close">${ICONS.close}</button>
        </header>
        <div class="story-art">${artHTML(idea)}</div>
        <div class="story-text">
          <span class="story-topic">${esc(idea.topic || "Idea")} · ${readTime(idea)}</span>
          <h2>${esc(idea.title)}</h2>
          <p>${esc(idea.body)}</p>
          ${idea.source ? `<small class="story-src">${esc(idea.source)}</small>` : ""}
        </div>
        <footer class="story-foot">
          <button class="story-save ${isStashed(idea.id) ? "on" : ""}">${isStashed(idea.id) ? ICONS.bookmark : ICONS.bookmarkO}<span>${isStashed(idea.id) ? "Stashed" : "Stash"}</span></button>
          <button class="story-share" aria-label="Share">${ICONS.share}</button>
        </footer>
        <div class="story-pause" aria-hidden="true">Paused</div>
      </div>`;
    el.querySelector(".story-x").onclick = closeStory;
    el.querySelector(".story-save").onclick = () => {
      if (isStashed(idea.id)) { pauseStory(); openStashPicker(idea.id, { onClose: () => { refreshStorySave(idea.id); resumeStory(); } }); return; }
      quickStash(idea.id, { announce: false }); toast(`Stashed in ${data.stashes[defaultStash()].name}`); refreshStorySave(idea.id);
    };
    el.querySelector(".story-share").onclick = () => shareIdea(idea);
    story.bar = el.querySelectorAll(".story-bars b")[story.ii];
    story.dur = Math.min(16000, Math.max(6000, 2500 + (words(idea.title) + words(idea.body)) * 230));
    story.elapsed = 0; story.t0 = performance.now(); story.paused = false;
    cancelAnimationFrame(story.raf); tickStory();
  }
  function refreshStorySave(id) {
    const b = story.el?.querySelector(".story-save"); if (!b) return;
    const on = isStashed(id); b.classList.toggle("on", on); b.innerHTML = `${on ? ICONS.bookmark : ICONS.bookmarkO}<span>${on ? "Stashed" : "Stash"}</span>`;
  }
  function tickStory() {
    if (!story.el) return;
    if (!story.paused) {
      const t = story.elapsed + (performance.now() - story.t0);
      story.bar.style.width = Math.min(100, (t / story.dur) * 100) + "%";
      if (t >= story.dur) return nextFrame();
    }
    story.raf = requestAnimationFrame(tickStory);
  }
  function pauseStory() { if (story.el && !story.paused) { story.elapsed += performance.now() - story.t0; story.paused = true; story.el.classList.add("paused"); } }
  function resumeStory() { if (story.paused && story.el && $("#sheet").hidden) { story.t0 = performance.now(); story.paused = false; story.el.classList.remove("paused"); } }
  function nextFrame() {
    const s = story.list[story.si];
    if (story.ii < s.ids.length - 1) story.ii++;
    else if (story.si < story.list.length - 1) { story.si++; story.ii = 0; }
    else return closeStory();
    showStoryFrame();
  }
  function prevFrame() {
    if (story.ii > 0) story.ii--;
    else if (story.si > 0) { story.si--; story.ii = 0; }
    showStoryFrame();
  }
  function bindStoryGestures(el) {
    let x0, y0, holdTimer, held = false, active = false;
    el.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      active = true; held = false; x0 = e.clientX; y0 = e.clientY;
      holdTimer = setTimeout(() => { held = true; pauseStory(); }, 200);
    });
    el.addEventListener("pointermove", (e) => {
      if (!active) return; const dy = e.clientY - y0;
      if (dy > 10) { clearTimeout(holdTimer); el.querySelector(".story-frame").style.transform = `translateY(${dy}px) scale(${1 - Math.min(dy, 300) / 2000})`; }
    });
    el.addEventListener("pointerup", (e) => {
      if (!active) return; active = false; clearTimeout(holdTimer);
      const dy = e.clientY - y0, dx = e.clientX - x0, frame = el.querySelector(".story-frame");
      if (dy > 90) return closeStory();
      frame.style.transform = "";
      if (held) { resumeStory(); return; }
      if (Math.abs(dx) > 50) return dx < 0 ? nextFrame() : prevFrame();
      if (e.clientX < window.innerWidth * 0.3) prevFrame(); else nextFrame();
    });
    el.addEventListener("pointercancel", () => { active = false; clearTimeout(holdTimer); resumeStory(); });
  }
  document.addEventListener("keydown", (e) => {
    if (!story.el || journey.el || !$("#sheet").hidden) return;
    if (e.key === "ArrowRight") nextFrame();
    if (e.key === "ArrowLeft") prevFrame();
    if (e.key === " ") { e.preventDefault(); story.paused ? resumeStory() : pauseStory(); }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseStory(); else resumeStory(); });

  // ---------------------------------------------------------------- JOURNEYS
  function journeyList() {
    return (window.JOURNEYS || []).map((j) => ({ ...j, ideas: j.ideas.filter((id) => ideaById(id)) })).filter((j) => j.ideas.length);
  }
  function journeyById(id) {
    if (id.startsWith("stash:")) {
      const s = data.stashes[id.slice(6)]; if (!s || s.deleted) return null;
      const ideas = s.ideaIds.filter((x) => ideaById(x));
      return { id, title: s.name, emoji: s.emoji, topic: ideas[0] ? ideaById(ideas[0]).topic : "other", desc: `Work through your “${s.name}” stash, one idea at a time, with a quick check after each.`, learn: [], ideas, isStash: true };
    }
    return journeyList().find((j) => j.id === id) || null;
  }
  const jProgress = (j) => { const p = data.journeys[j.id]; const done = p ? j.ideas.filter((x) => p.done.includes(x)).length : 0; return { done, total: j.ideas.length, pct: j.ideas.length ? Math.round((done / j.ideas.length) * 100) : 0, completed: !!(p && p.completedAt) }; };
  const jMinutes = (j) => Math.max(1, Math.round(j.ideas.reduce((n, id) => { const i = ideaById(id); return n + words(i.title) + words(i.body); }, 0) / 200 + j.ideas.length * 0.3));
  function journeyCardHTML(j) {
    const p = jProgress(j);
    return `<button class="jcard" data-j="${esc(j.id)}" style="${topicStyle(j.topic)}">
      <span class="jcard-art">${Art.svg({ id: j.id, topic: j.topic }, { center: true })}${p.completed ? '<span class="jdone">✓ Done</span>' : ""}</span>
      <span class="jcard-body"><b>${esc(j.title)}</b><small>${plural(j.ideas.length, "idea")} · ${jMinutes(j)} min</small>
      <span class="jprog"><i style="width:${p.pct}%"></i></span></span></button>`;
  }
  function openJourneySheet(id) {
    const j = journeyById(id); if (!j) return;
    const p = jProgress(j), doneSet = new Set(data.journeys[j.id]?.done || []);
    openSheet(`
      <div class="detail-art" style="${topicStyle(j.topic)}">${Art.svg({ id: j.id, topic: j.topic }, { center: true })}<span class="topic-pill">Journey</span></div>
      <h2 class="detail-title">${j.emoji ? esc(j.emoji) + " " : ""}${esc(j.title)}</h2>
      <p class="detail-body" style="margin-bottom:10px">${esc(j.desc)}</p>
      <p class="help" style="margin:0 0 14px">${plural(j.ideas.length, "idea")} · about ${jMinutes(j)} min · ${p.pct}% done</p>
      <div class="jprog big"><i style="width:${p.pct}%"></i></div>
      ${j.learn.length ? `<div class="section-label">What you'll learn</div><ul class="learn">${j.learn.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
      <div class="section-label">Ideas</div>
      <ol class="jlist">${j.ideas.map((x) => { const i = ideaById(x); return `<li class="${doneSet.has(x) ? "done" : ""}"><span class="jl-dot">${doneSet.has(x) ? "✓" : ""}</span><span>${esc(i.title)}</span></li>`; }).join("")}</ol>
      <div class="row" style="margin-top:16px">
        <button class="btn primary" id="jStart">${ICONS.route}${p.completed ? "Go again" : p.done ? "Continue" : "Start journey"}</button>
        <button class="btn" id="jListen">${ICONS.headphones}Listen</button>
      </div>
      ${j.isStash ? "" : `<button class="btn ghost block" id="jStashAll" style="margin-top:8px">${ICONS.bookmarkO}Stash all ${j.ideas.length} ideas</button>`}
    `, (el) => {
      el.querySelector("#jStart").onclick = () => { closeSheet(); openJourney(j.id, { restart: p.completed }); };
      el.querySelector("#jListen").onclick = () => { closeSheet(); listen(j.ideas, 0, j.title); };
      const sa = el.querySelector("#jStashAll");
      if (sa) sa.onclick = () => { const t = defaultStash(); j.ideas.forEach((x) => setInStash(t, x, true)); save(); buzz(); closeSheet(); toast(`Stashed ${j.ideas.length} ideas in ${data.stashes[t].name}`); };
    });
  }

  const journey = { j: null, steps: [], si: 0, el: null, score: 0, answered: 0, answer: null };
  function openJourney(id, { restart = false } = {}) {
    const j = journeyById(id); if (!j || !j.ideas.length) return;
    if (player.playing) pausePlayer();
    if (restart || !data.journeys[j.id]) data.journeys[j.id] = { done: [], updatedAt: now() };
    const doneSet = new Set(data.journeys[j.id].done);
    journey.j = j; journey.steps = []; journey.score = 0; journey.answered = 0;
    for (const x of j.ideas) { const q = quizFor(ideaById(x)); journey.steps.push({ type: "idea", id: x }); if (q) journey.steps.push({ type: "quiz", id: x, quiz: q }); }
    journey.steps.push({ type: "end" });
    const firstOpen = journey.steps.findIndex((s) => s.type === "idea" && !doneSet.has(s.id));
    journey.si = firstOpen < 0 ? 0 : firstOpen;
    const el = document.createElement("div"); el.id = "journeyView"; el.className = "story jplay"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", j.title);
    document.body.appendChild(el); journey.el = el;
    document.documentElement.classList.add("story-open");
    showJourneyStep();
  }
  function closeJourney() {
    if (journey.el) { journey.el.classList.add("leaving"); const el = journey.el; setTimeout(() => el.remove(), 180); }
    journey.el = null;
    if (!story.el) document.documentElement.classList.remove("story-open");
    save(); render();
  }
  function markJourneyDone(ideaId) {
    const p = data.journeys[journey.j.id];
    if (!p.done.includes(ideaId)) p.done.push(ideaId);
    p.updatedAt = now();
  }
  function showJourneyStep() {
    const { j, steps, el } = journey, step = steps[journey.si];
    const ideaSteps = steps.filter((s) => s.type === "idea"), ideaNo = step.id ? ideaSteps.findIndex((s) => s.id === step.id) + 1 : ideaSteps.length;
    const pct = Math.round((journey.si / (steps.length - 1)) * 100);
    const idea = step.id ? ideaById(step.id) : null;
    el.setAttribute("style", topicStyle(idea ? idea.topic : j.topic));
    const head = `
      <div class="jbar"><i style="width:${pct}%"></i></div>
      <header class="story-head">
        <span class="sav">${Art.avatar(j.isStash ? "mine" : j.topic)}</span>
        <span class="story-name"><b>${esc(j.title)}</b><small>${step.type === "end" ? "Complete" : `Idea ${ideaNo} of ${ideaSteps.length}${step.type === "quiz" ? " · Quick check" : ""}`}</small></span>
        ${step.type === "idea" && canSpeak ? `<button class="story-x" id="jSpeak" aria-label="Listen">${ICONS.headphones}</button>` : ""}
        <button class="story-x" id="jClose" aria-label="Close">${ICONS.close}</button>
      </header>`;
    if (step.type === "idea") {
      local.seen[idea.id] = local.seen[idea.id] || now(); saveLocal();
      const on = isStashed(idea.id);
      el.innerHTML = `<div class="story-frame">${head}
        <div class="story-art">${artHTML(idea)}</div>
        <div class="story-text"><span class="story-topic">${esc(idea.topic || "Idea")} · ${readTime(idea)}</span><h2>${esc(idea.title)}</h2><p>${esc(idea.body)}</p>${idea.source ? `<small class="story-src">${esc(idea.source)}</small>` : ""}</div>
        <footer class="story-foot">
          <button class="story-share ${on ? "on" : ""}" id="jSave" aria-label="Stash">${on ? ICONS.bookmark : ICONS.bookmarkO}</button>
          <button class="story-save solid" id="jNext">${steps[journey.si + 1].type === "quiz" ? "Quick check" : steps[journey.si + 1].type === "end" ? "Finish" : "Next idea"} →</button>
        </footer></div>`;
      el.querySelector("#jSave").onclick = (e) => {
        if (isStashed(idea.id)) { openStashPicker(idea.id, { onClose: () => showJourneyStep() }); return; }
        quickStash(idea.id, { announce: false }); toast("Stashed"); showJourneyStep();
      };
      const sp = el.querySelector("#jSpeak"); if (sp) sp.onclick = () => listen([idea.id], 0, j.title);
      el.querySelector("#jNext").onclick = () => {
        if (player.playing) stopPlayer();
        if (steps[journey.si + 1].type !== "quiz") markJourneyDone(idea.id);
        journey.si++; journey.answer = null; save({ sync: false }); showJourneyStep();
      };
    } else if (step.type === "quiz") {
      const a = journey.answer;
      el.innerHTML = `<div class="story-frame">${head}
        <div class="quiz">
          <span class="story-topic">Quick check · ${esc(idea.title)}</span>
          <h2>${esc(step.quiz.q)}</h2>
          <div class="opts">${step.quiz.opts.map((o, k) => `<button class="opt ${a ? (o === step.quiz.a ? "right" : k === a.k ? "wrong" : "dim") : ""}" data-k="${k}" ${a ? "disabled" : ""}>${esc(o)}</button>`).join("")}</div>
          <p class="qfeed">${a ? (a.correct ? "✓ Nice — that's right." : `Not quite. The answer is “${esc(step.quiz.a)}”.`) : ""}</p>
        </div>
        <footer class="story-foot"><button class="story-save solid" id="jNext" ${a ? "" : "disabled"}>${steps[journey.si + 1].type === "end" ? "Finish" : "Next idea"} →</button></footer></div>`;
      el.querySelectorAll(".opt").forEach((b) => b.onclick = () => {
        const k = +b.dataset.k, correct = step.quiz.opts[k] === step.quiz.a;
        journey.answer = { k, correct }; journey.answered++; if (correct) journey.score++;
        recordQuiz(correct); buzz(correct ? 12 : [20, 50, 20]); showJourneyStep();
      });
      el.querySelector("#jNext").onclick = () => { markJourneyDone(step.id); journey.si++; journey.answer = null; save({ sync: false }); showJourneyStep(); };
    } else {
      const p = data.journeys[j.id], first = !p.completedAt;
      j.ideas.forEach((x) => { if (!p.done.includes(x)) p.done.push(x); });
      p.completedAt = p.completedAt || now(); p.updatedAt = now(); save();
      el.innerHTML = `<div class="story-frame">${head}
        <div class="jend">
          <div class="jend-badge">${Art.avatar(j.isStash ? "mine" : j.topic)}</div>
          <h2>Journey complete</h2>
          <p>You worked through ${plural(j.ideas.length, "idea")}${journey.answered ? ` and got ${journey.score} of ${journey.answered} quick checks right` : ""}.</p>
          ${first ? '<p class="jend-confetti" aria-hidden="true">🎉</p>' : ""}
        </div>
        <footer class="story-foot">
          ${j.isStash ? "" : `<button class="story-share wide" id="jStashAll">${ICONS.bookmarkO} Stash all</button>`}
          <button class="story-save solid" id="jDone">Done</button>
        </footer></div>`;
      buzz([10, 40, 10, 40, 10]);
      const sa = el.querySelector("#jStashAll");
      if (sa) sa.onclick = () => { const t = defaultStash(); j.ideas.forEach((x) => setInStash(t, x, true)); save(); toast(`Stashed ${j.ideas.length} ideas — they'll show up in your daily review`); sa.disabled = true; };
      el.querySelector("#jDone").onclick = closeJourney;
    }
    el.querySelector("#jClose").onclick = closeJourney;
  }

  // ---------------------------------------------------------------- FEED
  function buildFeedQueue() {
    const topic = local.topic;
    const pool = allIdeas().filter((i) => topic === "All" || i.topic === topic);
    const unseen = pool.filter((i) => !local.seen[i.id]);
    const mine = unseen.filter((i) => !i.starter);
    const lib = unseen.filter((i) => i.starter), int = local.interests || [];
    const fav = shuffle(lib.filter((i) => int.includes(i.topic))), rest = shuffle(lib.filter((i) => !int.includes(i.topic)));
    // Mostly your interests, with other topics mixed in every few cards.
    const mixed = []; while (fav.length || rest.length) { for (let k = 0; k < 3 && fav.length; k++) mixed.push(fav.shift()); if (rest.length) mixed.push(rest.shift()); }
    ui.feedQueue = [...mine, ...mixed].map((i) => i.id);
    ui.feedShown = 0;
  }
  function feedCardHTML(idea, idx) {
    const on = isStashed(idea.id);
    return `<article class="fcard" data-id="${esc(idea.id)}" data-idx="${idx}" style="${topicStyle(idea.topic)}">
      <div class="fcard-art">${artHTML(idea)}<span class="topic-pill">${esc(idea.topic || "Idea")}</span></div>
      <div class="fcard-content">
        <div class="fcard-meta">${readTime(idea)}${idea.starter ? "" : " · Yours"}${validQuiz(idea.quiz) ? " · Quiz" : ""}</div>
        <h2>${esc(idea.title)}</h2>
        <p>${esc(idea.body)}</p>
      </div>
      ${idea.source ? `<div class="fcard-source">${esc(idea.source)}</div>` : ""}
      <div class="fcard-actions">
        <button class="act save ${on ? "on" : ""}" data-act="save">${on ? ICONS.bookmark : ICONS.bookmarkO}<span>${on ? "Stashed" : "Stash"}</span></button>
        ${canSpeak ? `<button class="act icon" data-act="listen" aria-label="Listen">${ICONS.headphones}</button>` : ""}
        <button class="act icon" data-act="share" aria-label="Share">${ICONS.share}</button>
        <button class="act icon" data-act="more" aria-label="More">${ICONS.more}</button>
      </div>
      <div class="burst" aria-hidden="true">${ICONS.bookmark}</div>
    </article>`;
  }
  function endCardHTML() {
    return `<div class="fcard end-card"><div class="empty">
      <div class="end-art">${Art.svg({ id: "end", topic: "daily" }, { center: true })}</div>
      <h3>You're all caught up</h3><p>You've seen every idea${local.topic !== "All" ? " in " + esc(local.topic) : ""}. Try a journey, add one of your own, or start the feed over.</p>
      <div class="row" style="max-width:360px;margin:18px auto 0"><button class="btn" id="restartBtn">Start over</button><button class="btn primary" id="exploreHere">Explore journeys</button></div></div></div>`;
  }
  function renderFeed() {
    if (!ui.feedQueue) buildFeedQueue();
    ui.feedQueue = ui.feedQueue.filter((id) => ideaById(id));
    ui.feedShown = 0;
    const ts = topics(), int = local.interests || [];
    const chips = ["All", ...ts.filter((t) => int.includes(t)), ...ts.filter((t) => !int.includes(t))].map((t) => `<button class="chip ${local.topic === t ? "active" : ""}" data-topic="${esc(t)}">${esc(t)}</button>`).join("");
    $("#view").innerHTML = `
      <section class="feed-head">${storiesRowHTML()}<div class="chips">${chips}</div></section>
      <div class="feed" id="feed"></div>`;
    bindStoriesRow();
    $("#view").querySelectorAll(".chip").forEach((c) => c.onclick = () => { local.topic = c.dataset.topic; saveLocal(); buildFeedQueue(); renderFeed(); });
    appendFeedCards(6);
  }
  function appendFeedCards(n) {
    const feed = $("#feed"); if (!feed || feed.querySelector(".end-card")) return;
    const slice = ui.feedQueue.slice(ui.feedShown, ui.feedShown + n);
    slice.forEach((id, k) => {
      const el = htmlToEl(feedCardHTML(ideaById(id), ui.feedShown + k));
      feed.appendChild(el); bindFeedCard(el); feedObserver.observe(el);
    });
    ui.feedShown += slice.length;
    if (ui.feedShown >= ui.feedQueue.length) {
      feed.appendChild(htmlToEl(endCardHTML()));
      $("#restartBtn").onclick = () => {
        allIdeas().filter((i) => local.topic === "All" || i.topic === local.topic).forEach((i) => delete local.seen[i.id]);
        saveLocal(); buildFeedQueue(); renderFeed(); window.scrollTo(0, 0);
      };
      $("#exploreHere").onclick = () => go("search");
    }
  }
  const feedObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const id = e.target.dataset.id;
      if (id && !local.seen[id]) { local.seen[id] = now(); saveLocal(); }
      if (+e.target.dataset.idx >= ui.feedShown - 3) appendFeedCards(6);
    }
  }, { threshold: 0.55 });

  function bindFeedCard(card) {
    const id = card.dataset.id;
    let tapTimer = null;
    card.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]");
      if (act) {
        const a = act.dataset.act, idea = ideaById(id);
        if (a === "save") { if (!quickStash(id)) openStashPicker(id); else refreshCardSave(card); }
        if (a === "listen") listen(ui.feedQueue, +card.dataset.idx, "Your feed");
        if (a === "share") shareIdea(idea);
        if (a === "more") openIdea(id);
        return;
      }
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; doubleTap(card); return; }
      tapTimer = setTimeout(() => { tapTimer = null; openIdea(id); }, 260);
    });
  }
  function doubleTap(card) {
    const burst = card.querySelector(".burst");
    burst.classList.remove("go"); void burst.offsetWidth; burst.classList.add("go");
    quickStash(card.dataset.id); refreshCardSave(card);
  }
  function refreshCardSave(card) {
    const on = isStashed(card.dataset.id), b = card.querySelector(".act.save");
    b.classList.toggle("on", on); b.innerHTML = `${on ? ICONS.bookmark : ICONS.bookmarkO}<span>${on ? "Stashed" : "Stash"}</span>`;
  }
  document.addEventListener("keydown", (e) => {
    if (ui.tab !== "feed" || story.el || journey.el || !$("#sheet").hidden || /input|textarea|select/i.test(document.activeElement?.tagName)) return;
    const cards = [...document.querySelectorAll("#feed .fcard")];
    const top = (el) => el.getBoundingClientRect().top;
    const cur = cards.findIndex((c) => top(c) > 40);
    if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); cards[Math.max(0, cur)]?.scrollIntoView({ behavior: "smooth" }); }
    if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); (cards[cur - 2] || $(".feed-head"))?.scrollIntoView({ behavior: "smooth" }); }
  });

  // ---------------------------------------------------------------- idea detail
  function quizBlockHTML(q) {
    return `<div class="qblock"><div class="section-label" style="margin-top:0">Quick check</div><p class="q-q">${esc(q.q)}</p>
      <div class="opts light">${q.opts.map((o, k) => `<button class="opt" data-k="${k}">${esc(o)}</button>`).join("")}</div><p class="qfeed"></p></div>`;
  }
  function bindQuizBlock(el, q, onAnswer) {
    el.querySelectorAll(".qblock .opt").forEach((b) => b.onclick = () => {
      const k = +b.dataset.k, correct = q.opts[k] === q.a;
      el.querySelectorAll(".qblock .opt").forEach((x, i) => { x.disabled = true; x.classList.add(q.opts[i] === q.a ? "right" : i === k ? "wrong" : "dim"); });
      el.querySelector(".qblock .qfeed").textContent = correct ? "✓ Nice — that's right." : `Not quite. The answer is “${q.a}”.`;
      buzz(correct ? 12 : [20, 50, 20]); onAnswer && onAnswer(correct);
    });
  }
  function openIdea(id) {
    const idea = ideaById(id); if (!idea) return;
    pauseStory();
    const st = stashesFor(id), q = quizFor(idea);
    openSheet(`
      <div class="detail-art" style="${topicStyle(idea.topic)}">${artHTML(idea)}<span class="topic-pill">${esc(idea.topic || "Idea")}</span></div>
      <h2 class="detail-title">${esc(idea.title)}</h2>
      <p class="detail-body">${esc(idea.body)}</p>
      ${idea.source || validUrl(idea.url) ? `<p class="help" style="margin:0 0 6px">${idea.source ? "Source: " + esc(idea.source) : ""}${validUrl(idea.url) ? ` <a href="${esc(idea.url)}" target="_blank" rel="noopener">Open link ↗</a>` : ""}</p>` : ""}
      <p class="help" style="margin:0 0 16px">${st.length ? "In " + st.map((s) => esc(s.emoji + " " + s.name)).join(", ") : "Not in any stash yet"}</p>
      <div class="row">
        <button class="btn primary" id="dStash">${ICONS.bookmark}${st.length ? "Edit stashes" : "Stash"}</button>
        ${canSpeak ? `<button class="btn" id="dListen">${ICONS.headphones}Listen</button>` : ""}
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn" id="dShare">${ICONS.share}Share</button>
        <button class="btn" id="dImg">${ICONS.image}Save image</button>
      </div>
      ${q ? quizBlockHTML(q) : ""}
      ${idea.starter ? "" : `<div class="row" style="margin-top:14px"><button class="btn ghost" id="dEdit">Edit</button><button class="btn ghost danger" id="dDel">Delete</button></div>`}
    `, (el) => {
      el.querySelector("#dStash").onclick = () => openStashPicker(id);
      const dl = el.querySelector("#dListen"); if (dl) dl.onclick = () => { closeSheet(); listen([id], 0, "Listening"); };
      el.querySelector("#dShare").onclick = () => shareIdea(idea);
      el.querySelector("#dImg").onclick = () => saveIdeaImage(idea);
      if (q) bindQuizBlock(el, q, (correct) => { recordQuiz(correct); save(); });
      if (!idea.starter) {
        el.querySelector("#dEdit").onclick = () => openEditor(idea);
        el.querySelector("#dDel").onclick = () => {
          if (!confirm("Delete this idea? It will be removed from every stash.")) return;
          data.ideas[id] = { id, deleted: true, createdAt: data.ideas[id].createdAt, updatedAt: now() };
          liveStashes().forEach((s) => s.ideaIds.includes(id) && setInStash(s.id, id, false));
          delete data.reviews[id]; save(); closeSheet(); softRefresh(); toast("Idea deleted");
        };
      }
    });
  }

  function openStashPicker(id, { onClose } = {}) {
    const idea = ideaById(id);
    const rows = () => liveStashes().map((s) => `
      <label class="check-row"><input type="checkbox" data-s="${esc(s.id)}" ${s.ideaIds.includes(id) ? "checked" : ""}>
      <span class="emoji">${esc(s.emoji)}</span><span style="flex:1">${esc(s.name)}</span><span class="help" style="margin:0">${s.ideaIds.length}</span></label>`).join("");
    openSheet(`
      <h3>Stash “${esc(idea.title)}”</h3>
      <div id="pickRows">${rows()}</div>
      <div class="row" style="margin-top:14px"><input class="input" id="newStashName" placeholder="New stash name" style="flex:2"><button class="btn" id="newStashBtn">Create</button></div>
      <button class="btn primary block" style="margin-top:14px" id="pickDone">Done</button>
    `, (el) => {
      const bindRows = () => el.querySelectorAll("input[data-s]").forEach((cb) => cb.onchange = () => {
        setInStash(cb.dataset.s, id, cb.checked); if (cb.checked) { local.lastStash = cb.dataset.s; saveLocal(); buzz(); } save();
      });
      bindRows();
      el.querySelector("#newStashBtn").onclick = () => {
        const name = el.querySelector("#newStashName").value.trim(); if (!name) return;
        const s = createStash(name, EMOJIS[Math.floor(Math.random() * EMOJIS.length)]);
        setInStash(s.id, id, true); local.lastStash = s.id; saveLocal(); save();
        el.querySelector("#pickRows").innerHTML = rows(); el.querySelector("#newStashName").value = ""; bindRows();
      };
      el.querySelector("#pickDone").onclick = () => { closeSheet(); if (!onClose) softRefresh(); };
    });
    if (onClose) {
      const watch = new MutationObserver(() => { if ($("#sheet").hidden) { watch.disconnect(); onClose(); } });
      watch.observe($("#sheet"), { attributes: true, attributeFilter: ["hidden"] });
    }
  }

  // ---------------------------------------------------------------- editor
  async function resizeImage(file, max = 720) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImg(url);
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.72);
    } finally { URL.revokeObjectURL(url); }
  }
  function openEditor(existing, prefill = {}) {
    const isEdit = !!existing;
    const base = { ...prefill, ...(existing || {}) };
    const draft = { id: existing?.id || uid("i"), topic: base.topic || "", image: base.image };
    const qz = validQuiz(base.quiz) ? base.quiz : null;
    const tlist = topics().map((t) => `<option value="${esc(t)}">`).join("");
    const stashOpts = liveStashes().map((s) => `<option value="${esc(s.id)}">${esc(s.emoji + " " + s.name)}</option>`).join("");
    openSheet(`
      <h3>${isEdit ? "Edit idea" : prefill.body || prefill.url ? "Save from the web" : "New idea"}</h3>
      <div class="cover-pick" id="coverPrev"></div>
      <div class="row" style="margin:-4px 0 14px"><button class="btn" id="coverBtn">${ICONS.image}Add a photo</button><button class="btn ghost" id="coverDel">Use artwork</button></div>
      <input type="file" id="coverFile" accept="image/*" hidden>
      <label class="field"><span>Idea in one line</span><input class="input" id="eTitle" maxlength="140" placeholder="e.g. Constraints spark creativity" value="${esc(base.title)}"></label>
      <label class="field"><span>Explain it in your own words</span><textarea class="input" id="eBody" maxlength="1200" placeholder="A few sentences you'd want to remember">${esc(base.body)}</textarea></label>
      <label class="field"><span>Source (book, article, podcast…)</span><input class="input" id="eSource" maxlength="140" placeholder="Optional" value="${esc(base.source)}"></label>
      <label class="field"><span>Link</span><input class="input" id="eUrl" type="url" inputmode="url" maxlength="600" placeholder="https://… (optional)" value="${esc(base.url)}"></label>
      <label class="field"><span>Topic</span><input class="input" id="eTopic" list="topicList" maxlength="40" placeholder="e.g. Psychology" value="${esc(base.topic)}"><datalist id="topicList">${tlist}</datalist></label>
      <details class="quiz-edit" ${qz ? "open" : ""}><summary>Add a quiz question <span class="help" style="margin:0">(used in your daily review)</span></summary>
        <label class="field"><span>Question</span><input class="input" id="qQ" maxlength="200" placeholder="e.g. What sparks creativity?" value="${esc(qz?.q)}"></label>
        <label class="field"><span>Right answer</span><input class="input" id="qA" maxlength="120" value="${esc(qz?.a)}"></label>
        <label class="field"><span>Wrong answers</span><input class="input" id="qW1" maxlength="120" placeholder="Wrong answer 1" value="${esc(qz?.w?.[0])}" style="margin-bottom:8px"><input class="input" id="qW2" maxlength="120" placeholder="Wrong answer 2 (optional)" value="${esc(qz?.w?.[1])}"></label>
      </details>
      ${isEdit ? "" : `<label class="field"><span>Save to stash</span><select class="input" id="eStash"><option value="">Don't stash yet</option>${stashOpts}</select></label>`}
      <button class="btn primary block" id="eSave">${isEdit ? "Save changes" : "Add idea"}</button>
    `, (el) => {
      const prev = () => { el.querySelector("#coverPrev").innerHTML = artHTML(draft); el.querySelector("#coverDel").hidden = !validImage(draft.image); };
      prev();
      el.querySelector("#eTopic").oninput = (e) => { draft.topic = e.target.value; prev(); };
      el.querySelector("#coverBtn").onclick = () => el.querySelector("#coverFile").click();
      el.querySelector("#coverDel").onclick = () => { draft.image = undefined; prev(); };
      el.querySelector("#coverFile").onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { draft.image = await resizeImage(f); prev(); } catch { toast("Couldn't read that photo"); }
      };
      if (!isEdit) el.querySelector("#eStash").value = defaultStash();
      if (!isEdit && (prefill.body || prefill.url)) setTimeout(() => el.querySelector("#eTitle").focus(), 350);
      el.querySelector("#eSave").onclick = () => {
        const v = (s) => el.querySelector(s).value.trim();
        const title = v("#eTitle"), body = v("#eBody");
        if (!title || !body) { toast("Add a title and a short explanation"); return; }
        const url = v("#eUrl");
        if (url && !validUrl(url)) { toast("Links need to start with http:// or https://"); return; }
        const quiz = { q: v("#qQ"), a: v("#qA"), w: [v("#qW1"), v("#qW2")].filter(Boolean) };
        if ((quiz.q || quiz.a || quiz.w.length) && !validQuiz(quiz)) { toast("A quiz needs a question, the right answer and at least one wrong answer"); return; }
        const fields = { title, body, source: v("#eSource"), url: url || undefined, topic: v("#eTopic") || "Other", image: validImage(draft.image) ? draft.image : undefined, quiz: validQuiz(quiz) ? quiz : undefined };
        if (isEdit) {
          data.ideas[existing.id] = { ...data.ideas[existing.id], ...fields, updatedAt: now() };
          save(); closeSheet(); softRefresh(); toast("Idea updated");
        } else {
          const id = draft.id;
          data.ideas[id] = { id, ...fields, createdAt: now(), updatedAt: now() };
          const st = el.querySelector("#eStash").value;
          if (st) { setInStash(st, id, true); local.lastStash = st; saveLocal(); }
          save(); closeSheet(); ui.feedQueue = null;
          if (ui.tab === "feed") { render(); window.scrollTo(0, 0); } else go("feed");
          toast(st ? `Added to ${data.stashes[st].name}` : "Idea added to your feed");
        }
      };
    });
  }

  // ---------------------------------------------------------------- REVIEW (+ stats, achievements, history)
  function renderReview() {
    const s = streakInfo();
    const today = dayKey();
    const fz = new Set(data.freezeDays);
    const week = Array.from({ length: 7 }, (_, k) => addDays(today, k - 6)).map((d) => {
      const [y, m, dd] = d.split("-").map(Number);
      const label = new Date(y, m - 1, dd).toLocaleDateString(undefined, { weekday: "narrow" });
      const done = data.days.includes(d), frozen = !done && fz.has(d);
      return `<div class="day ${done ? "done" : ""} ${frozen ? "frozen" : ""} ${d === today ? "today" : ""}">${label}<i>${done ? "✓" : frozen ? "❄️" : dd}</i></div>`;
    }).join("");
    const head = `
      <h1 class="view-title">Daily review</h1>
      <p class="view-sub">${s.doneToday ? "Done for today. Your streak is safe." : "A few minutes of recall keeps ideas from fading."}</p>
      <div class="stats">
        <div class="stat"><b>${s.count}</b><span>day streak</span></div>
        <div class="stat"><b>${s.best}</b><span>best streak</span></div>
        <div class="stat" title="Earn one for every 7-day streak (hold up to ${MAX_FREEZES}). A freeze covers a missed day automatically."><b>${s.freezes}<small>/${MAX_FREEZES}</small></b><span>❄️ freezes</span></div>
      </div>
      <div class="week">${week}</div>`;

    const r = ui.review;
    if (r && r.i < r.ids.length) return renderReviewCard(r);
    let body;
    if (r && r.i >= r.ids.length) {
      const got = r.results.filter(Boolean).length;
      body = `<div class="empty review-cta"><h3>Review complete 🔥</h3><p>You remembered ${got} of ${r.results.length}. ${streakInfo().count > 1 ? `That's ${streakInfo().count} days in a row.` : "Come back tomorrow to start a streak."}</p>
        <button class="btn primary" id="doneReview" style="margin-top:14px">Back to review</button></div>`;
    } else {
      const due = dueCount();
      body = `<div class="empty review-cta">
          ${stashedIds().size === 0
            ? `<h3>Nothing stashed yet</h3><p>Stash ideas from your feed and they'll come back here for review. For today, warm up with ${DAILY_REVIEW_SIZE} ideas from the library.</p>`
            : due ? `<h3>${plural(Math.min(due, DAILY_REVIEW_SIZE), "idea")} ready</h3><p>Answer a quick question or recall the idea, then check yourself.</p>`
            : `<h3>All reviewed</h3><p>Nothing is due right now. Ideas come back after 1, 3, 7, 16 and 35 days as you remember them.</p>`}
          ${(due || stashedIds().size === 0) ? `<button class="btn primary" id="startReview" style="margin-top:14px">Start review</button>` : ""}
        </div>`;
    }
    const ach = achievements(), got = ach.filter((a) => a.done).length;
    // Reading history by day (this device).
    const byDay = {};
    for (const [id, ts] of Object.entries(local.seen)) { if (!ideaById(id)) continue; const d = dayKey(new Date(ts)); (byDay[d] = byDay[d] || []).push([id, ts]); }
    const days = Object.keys(byDay).sort().reverse().slice(0, 14);
    const dayLabel = (d) => d === today ? "Today" : d === addDays(today, -1) ? "Yesterday" : (() => { const [y, m, dd] = d.split("-").map(Number); return new Date(y, m - 1, dd).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }); })();
    const quizPct = data.stats.quizTotal ? Math.round((data.stats.quizRight / data.stats.quizTotal) * 100) : null;
    $("#view").innerHTML = head + body + `
      <div class="stats" style="margin-top:22px">
        <div class="stat"><b>${Object.keys(local.seen).length}</b><span>ideas read</span></div>
        <div class="stat"><b>${Object.values(data.journeys).filter((j) => j.completedAt).length}</b><span>journeys done</span></div>
        <div class="stat"><b>${quizPct === null ? "–" : quizPct + "%"}</b><span>quiz accuracy</span></div>
      </div>
      <h2 class="sec">Achievements <small>${got} of ${ach.length}</small></h2>
      <div class="ach-grid">${ach.map((a) => `<div class="ach ${a.done ? "on" : ""}" title="${esc(a.desc)}"><span class="ach-icon">${a.icon}</span><b>${esc(a.name)}</b><small>${a.done ? esc(a.desc) : `${a.got} / ${a.goal}`}</small>${a.done ? "" : `<span class="ach-prog"><i style="width:${(a.got / a.goal) * 100}%"></i></span>`}</div>`).join("")}</div>
      <h2 class="sec">Reading history</h2>
      ${days.length ? days.map((d, k) => `<details class="hist" ${k === 0 ? "open" : ""}><summary><span>${esc(dayLabel(d))}</span><small>${plural(byDay[d].length, "idea")}</small></summary>
        <div class="list">${byDay[d].sort((a, b) => b[1] - a[1]).map(([id]) => listItem(ideaById(id))).join("")}</div></details>`).join("")
        : `<p class="help" style="margin:0">Ideas you read will show up here, by day.</p>`}`;
    const sb = $("#startReview"); if (sb) sb.onclick = () => { ui.review = buildReviewSession(); renderReview(); window.scrollTo(0, 0); };
    const db = $("#doneReview"); if (db) db.onclick = () => { ui.review = null; renderReview(); };
    bindListItems();
  }
  function renderReviewCard(r) {
    const idea = ideaById(r.ids[r.i]);
    if (!idea) { r.i++; return renderReview(); }
    if (!r.quiz || r.quiz.id !== idea.id) { const q = quizFor(idea); r.quiz = q ? { ...q, id: idea.id } : { id: idea.id, none: true }; r.answer = null; }
    const q = r.quiz.none ? null : r.quiz, a = r.answer;
    $("#view").innerHTML = `
      <h1 class="view-title">Daily review</h1>
      <p class="view-sub">${r.i + 1} of ${r.ids.length}${r.fromLibrary ? " · warm-up from the library" : ""}</p>
      <div class="progress"><div style="width:${(r.i / r.ids.length) * 100}%"></div></div>
      <article class="rcard" style="${topicStyle(idea.topic)}">
        <div class="rcard-art">${artHTML(idea)}<span class="topic-pill">${esc(idea.topic || "Idea")}</span></div>
        <div class="rcard-content">
          <h2>${esc(idea.title)}</h2>
          ${q ? `<p class="q-q">${esc(q.q)}</p>
              <div class="opts light">${q.opts.map((o, k) => `<button class="opt ${a ? (o === q.a ? "right" : k === a.k ? "wrong" : "dim") : ""}" data-k="${k}" ${a ? "disabled" : ""}>${esc(o)}</button>`).join("")}</div>
              ${a ? `<p class="qfeed">${a.correct ? "✓ Nice — that's right." : `Not quite. The answer is “${esc(q.a)}”.`}</p><p class="rbody">${esc(idea.body)}</p>` : ""}`
            : r.revealed ? `<p class="rbody">${esc(idea.body)}</p>${idea.source ? `<small>${esc(idea.source)}</small>` : ""}`
            : `<button class="reveal-cover" id="reveal">What's the idea? Think of it, then tap to check.</button>`}
        </div>
      </article>
      <div class="row" style="margin-top:16px">
        ${q ? (a ? `<button class="btn primary block" id="cont">Continue</button>` : `<p class="help" style="margin:4px auto">Pick an answer</p>`)
          : r.revealed ? `<button class="btn" id="again">Review again</button><button class="btn primary" id="gotIt">I remembered</button>`
          : `<button class="btn primary block" id="reveal2">Show the idea</button>`}
      </div>`;
    const grade = (ok) => {
      if (!r.fromLibrary) gradeReview(idea.id, ok);
      r.results.push(ok); r.i++; r.revealed = false; r.answer = null;
      if (r.i >= r.ids.length) finishDay();
      save(); renderReview();
    };
    if (q) {
      $("#view").querySelectorAll(".opt").forEach((b) => b.onclick = () => {
        const k = +b.dataset.k, correct = q.opts[k] === q.a;
        r.answer = { k, correct }; recordQuiz(correct); buzz(correct ? 12 : [20, 50, 20]); renderReviewCard(r);
      });
      const c = $("#cont"); if (c) c.onclick = () => grade(r.answer.correct);
      return;
    }
    const reveal = () => { r.revealed = true; renderReviewCard(r); };
    if (!r.revealed) { $("#reveal").onclick = reveal; $("#reveal2").onclick = reveal; return; }
    $("#again").onclick = () => grade(false);
    $("#gotIt").onclick = () => grade(true);
  }

  // ---------------------------------------------------------------- STASHES
  function createStash(name, emoji) {
    const id = uid("st");
    data.stashes[id] = { id, name, emoji: emoji || "📚", ideaIds: [], updatedAt: now() };
    return data.stashes[id];
  }
  function renderStashes() {
    if (ui.openStash && data.stashes[ui.openStash] && !data.stashes[ui.openStash].deleted) return renderStash(data.stashes[ui.openStash]);
    ui.openStash = null;
    const tiles = liveStashes().map((s) => {
      const items = s.ideaIds.map(ideaById).filter(Boolean).slice(0, 3);
      const cover = items.length
        ? `<div class="tile-cover n${items.length}">${items.map((i) => `<span>${artHTML(i, { center: true })}</span>`).join("")}</div>`
        : `<div class="tile-cover empty-cover"><span class="emoji">${esc(s.emoji)}</span></div>`;
      return `<button class="stash-tile" data-s="${esc(s.id)}">${cover}
        <span class="tile-text"><span class="name">${esc(s.emoji)} ${esc(s.name)}</span><span class="count">${plural(s.ideaIds.length, "idea")}</span></span></button>`;
    }).join("");
    $("#view").innerHTML = `
      <h1 class="view-title">Your stashes</h1>
      <p class="view-sub">Collections of ideas worth keeping.</p>
      <div class="stash-grid">${tiles}<button class="stash-tile new" id="newStash"><span class="plus">+</span>New stash</button></div>`;
    $("#view").querySelectorAll("[data-s]").forEach((b) => b.onclick = () => { ui.openStash = b.dataset.s; renderStashes(); window.scrollTo(0, 0); });
    $("#newStash").onclick = () => openStashEditor();
  }
  function openStashEditor(stash) {
    let emoji = stash?.emoji || EMOJIS[0];
    openSheet(`
      <h3>${stash ? "Edit stash" : "New stash"}</h3>
      <label class="field"><span>Name</span><input class="input" id="sName" maxlength="40" placeholder="e.g. Ideas for work" value="${esc(stash?.name)}"></label>
      <div class="section-label" style="margin-top:0">Icon</div>
      <div class="emoji-pick">${EMOJIS.map((e) => `<button data-e="${e}" class="${e === emoji ? "on" : ""}">${e}</button>`).join("")}</div>
      <button class="btn primary block" id="sSave">${stash ? "Save" : "Create stash"}</button>
      ${stash && stash.id !== "st-saved" ? `<button class="btn ghost danger block" style="margin-top:10px" id="sDel">Delete stash</button>` : ""}
    `, (el) => {
      el.querySelectorAll("[data-e]").forEach((b) => b.onclick = () => { emoji = b.dataset.e; el.querySelectorAll("[data-e]").forEach((x) => x.classList.toggle("on", x === b)); });
      el.querySelector("#sSave").onclick = () => {
        const name = el.querySelector("#sName").value.trim(); if (!name) return toast("Give your stash a name");
        if (stash) Object.assign(data.stashes[stash.id], { name, emoji, updatedAt: now() });
        else ui.openStash = createStash(name, emoji).id;
        save(); closeSheet(); renderStashes();
      };
      const del = el.querySelector("#sDel");
      if (del) del.onclick = () => {
        if (!confirm(`Delete “${stash.name}”? The ideas themselves stay in your library.`)) return;
        Object.assign(data.stashes[stash.id], { deleted: true, ideaIds: [], updatedAt: now() });
        if (local.lastStash === stash.id) { local.lastStash = "st-saved"; saveLocal(); }
        ui.openStash = null; save(); closeSheet(); renderStashes();
      };
    });
  }
  function renderStash(s) {
    const items = s.ideaIds.map(ideaById).filter(Boolean);
    const j = journeyById("stash:" + s.id), p = j ? jProgress(j) : null;
    $("#view").innerHTML = `
      <button class="back-btn" id="back">‹ Stashes</button>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <h1 class="view-title">${esc(s.emoji)} ${esc(s.name)}</h1>
        <button class="btn" id="editStash">Edit</button>
      </div>
      <p class="view-sub">${plural(items.length, "idea")}${p && p.done ? ` · journey ${p.pct}% done` : ""}</p>
      ${items.length ? `<div class="row" style="margin-bottom:14px">
          <button class="btn primary" id="playStash">${ICONS.route}${p && p.done && !p.completed ? "Continue journey" : "Play as journey"}</button>
          ${canSpeak ? `<button class="btn" id="listenStash">${ICONS.headphones}Listen</button>` : ""}</div>
        <div class="list">${items.map((i) => listItem(i)).join("")}</div>`
        : `<div class="empty"><h3>Empty for now</h3><p>Double-tap ideas in your feed, or tap Stash on a card and choose this stash.</p></div>`}`;
    $("#back").onclick = () => { ui.openStash = null; renderStashes(); };
    $("#editStash").onclick = () => openStashEditor(s);
    const ps = $("#playStash"); if (ps) ps.onclick = () => openJourney("stash:" + s.id, { restart: p.completed });
    const ls = $("#listenStash"); if (ls) ls.onclick = () => listen(items.map((i) => i.id), 0, s.name);
    bindListItems();
  }
  function listItem(i, q) {
    const hl = (t) => { const e = esc(t); if (!q) return e; const re = new RegExp(`(${esc(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"); return e.replace(re, "<mark>$1</mark>"); };
    return `<button class="list-item" data-id="${esc(i.id)}" style="${topicStyle(i.topic)}">
      <span class="thumb">${artHTML(i, { center: true })}</span>
      <span class="li-text"><span class="li-topic">${esc(i.topic || "Idea")}${i.starter ? "" : " · yours"}</span>
      <span class="li-title">${hl(i.title)}</span><span class="li-body">${hl(i.body)}</span></span></button>`;
  }
  const bindListItems = () => $("#view").querySelectorAll(".list-item").forEach((b) => b.onclick = () => openIdea(b.dataset.id));

  // ---------------------------------------------------------------- EXPLORE (journeys, topics, search)
  function renderExplore() {
    const chips = ["All", "Yours", ...topics()].map((t) => `<button class="chip ${ui.searchTopic === t ? "active" : ""}" data-topic="${esc(t)}">${esc(t)}</button>`).join("");
    $("#view").innerHTML = `
      <h1 class="view-title">Explore</h1>
      <div class="search-box"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      <input class="input" id="q" type="search" placeholder="Search ideas, sources, topics" value="${esc(ui.query)}" autocomplete="off"></div>
      <div class="chips">${chips}</div>
      <div id="results"></div>`;
    const run = () => {
      const q = ui.query.trim().toLowerCase();
      if (!q && ui.searchTopic === "All") {
        const js = journeyList(), int = local.interests || [];
        js.sort((a, b) => (jProgress(b).done && !jProgress(b).completed) - (jProgress(a).done && !jProgress(a).completed) || int.includes(b.topic) - int.includes(a.topic));
        const counts = {}; allIdeas().forEach((i) => counts[i.topic] = (counts[i.topic] || 0) + 1);
        const stashJ = liveStashes().filter((s) => s.ideaIds.filter((x) => ideaById(x)).length >= 2).map((s) => journeyById("stash:" + s.id));
        $("#results").innerHTML = `
          <h2 class="sec">Journeys <small>guided paths with quick checks</small></h2>
          <div class="jrow">${js.map(journeyCardHTML).join("")}</div>
          ${stashJ.length ? `<h2 class="sec">From your stashes</h2><div class="jrow">${stashJ.map(journeyCardHTML).join("")}</div>` : ""}
          <h2 class="sec">Topics</h2>
          <div class="topic-grid">${topics().map((t) => `<button class="topic-tile" data-t="${esc(t)}" style="${topicStyle(t)}"><span class="tt-av">${Art.avatar(t)}</span><b>${esc(t)}</b><small>${plural(counts[t] || 0, "idea")}</small></button>`).join("")}</div>`;
        $("#results").querySelectorAll(".jcard").forEach((b) => b.onclick = () => openJourneySheet(b.dataset.j));
        $("#results").querySelectorAll(".topic-tile").forEach((b) => b.onclick = () => { ui.searchTopic = b.dataset.t; renderExplore(); window.scrollTo(0, 0); });
        return;
      }
      const res = allIdeas().filter((i) =>
        (ui.searchTopic === "All" || (ui.searchTopic === "Yours" ? !i.starter : i.topic === ui.searchTopic)) &&
        (!q || [i.title, i.body, i.source, i.topic].some((f) => String(f || "").toLowerCase().includes(q))));
      $("#results").innerHTML = res.length
        ? `<p class="help" style="margin:4px 0 10px">${plural(res.length, "idea")}</p><div class="list">${res.map((i) => listItem(i, ui.query.trim())).join("")}</div>`
        : `<div class="empty"><h3>No matches</h3><p>Try a different word, or add this idea yourself.</p></div>`;
      bindListItems();
    };
    $("#q").oninput = (e) => { ui.query = e.target.value; run(); };
    $("#view").querySelectorAll(".chip").forEach((c) => c.onclick = () => { ui.searchTopic = c.dataset.topic; renderExplore(); });
    run();
  }

  // ---------------------------------------------------------------- ONBOARDING
  function showOnboarding({ fromSettings = false } = {}) {
    const chosen = new Set(local.interests || []);
    const el = document.createElement("div"); el.className = "onboard"; el.id = "onboard";
    el.innerHTML = `<div class="ob-inner">
      <img src="icon-192.png" alt="" width="64" height="64" class="ob-logo">
      <h1>What do you want to get better at?</h1>
      <p>Pick a few topics. You'll see them first in your feed, stories and journeys.</p>
      <div class="ob-grid">${topics().map((t) => `<button class="ob-topic ${chosen.has(t) ? "on" : ""}" data-t="${esc(t)}" style="${topicStyle(t)}"><span class="tt-av">${Art.avatar(t)}</span><b>${esc(t)}</b><span class="ob-check">✓</span></button>`).join("")}</div>
      <button class="btn primary block" id="obGo" ${chosen.size ? "" : "disabled"}>${chosen.size ? "Start learning" : "Pick at least one"}</button>
      <button class="btn ghost block" id="obSkip">${fromSettings ? "Cancel" : "Skip for now"}</button>
    </div>`;
    document.body.appendChild(el); document.documentElement.classList.add("story-open");
    const go2 = el.querySelector("#obGo");
    el.querySelectorAll(".ob-topic").forEach((b) => b.onclick = () => {
      const t = b.dataset.t; chosen.has(t) ? chosen.delete(t) : chosen.add(t); b.classList.toggle("on"); buzz(8);
      go2.disabled = !chosen.size; go2.textContent = chosen.size ? `Start learning · ${chosen.size}` : "Pick at least one";
    });
    const close = () => { el.classList.add("leaving"); setTimeout(() => el.remove(), 250); document.documentElement.classList.remove("story-open"); };
    go2.onclick = () => { local.interests = [...chosen]; local.onboarded = true; saveLocal(); ui.feedQueue = null; close(); go("feed"); };
    el.querySelector("#obSkip").onclick = () => { local.onboarded = true; saveLocal(); close(); };
  }

  // ---------------------------------------------------------------- GITHUB SYNC
  const b64encode = (str) => { const bytes = new TextEncoder().encode(str); let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };
  const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
  const syncReady = () => syncCfg.token && syncCfg.owner && syncCfg.repo && syncCfg.path;
  const repoPath = () => `/repos/${encodeURIComponent(syncCfg.owner)}/${encodeURIComponent(syncCfg.repo)}`;

  async function gh(path, opts = {}) {
    const res = await fetch("https://api.github.com" + path, {
      ...opts,
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${syncCfg.token}`, "X-GitHub-Api-Version": "2022-11-28", ...(opts.body ? { "Content-Type": "application/json" } : {}) },
      cache: "no-store"
    });
    const body = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) { const err = new Error(body?.message || `GitHub error ${res.status}`); err.status = res.status; throw err; }
    return body;
  }
  const contentsPath = () => `${repoPath()}/contents/${syncCfg.path.split("/").map(encodeURIComponent).join("/")}`;

  function mergeById(a = {}, b = {}) {
    const out = { ...a };
    for (const [id, v] of Object.entries(b || {})) if (!out[id] || (v.updatedAt || v.at || 0) > (out[id].updatedAt || out[id].at || 0)) out[id] = v;
    return out;
  }
  function merge(localData, remote) {
    if (!remote) return localData;
    const r = normalize(JSON.parse(JSON.stringify(remote))), l = localData;
    return {
      v: 1,
      ideas: mergeById(l.ideas, r.ideas),
      stashes: mergeById(l.stashes, r.stashes),
      reviews: mergeById(l.reviews, r.reviews),
      journeys: mergeById(l.journeys, r.journeys),
      days: [...new Set([...(l.days || []), ...(r.days || [])])].sort(),
      freezeDays: [...new Set([...(l.freezeDays || []), ...(r.freezeDays || [])])].sort(),
      freeze: (r.freeze.updatedAt || 0) > (l.freeze.updatedAt || 0) ? r.freeze : l.freeze,
      stats: { quizRight: Math.max(l.stats.quizRight, r.stats.quizRight), quizTotal: Math.max(l.stats.quizTotal, r.stats.quizTotal) },
      updatedAt: Math.max(l.updatedAt || 0, r.updatedAt || 0)
    };
  }
  const canonical = (d) => JSON.stringify({ ideas: d.ideas, stashes: d.stashes, reviews: d.reviews, days: d.days, journeys: d.journeys, freezeDays: d.freezeDays, freeze: d.freeze, stats: d.stats });

  let syncTimer, syncing = false, syncAgain = false;
  function setDot(state, title) { const d = $("#syncDot"); d.className = "sync-dot " + (state || ""); d.title = title || ""; }
  function scheduleSync() { if (!syncReady() || !syncCfg.auto) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), 2500); }

  async function syncNow({ quiet = true } = {}) {
    if (!syncReady()) { setDot("", "Sync is off — set it up in Settings"); return false; }
    if (!navigator.onLine) { setDot("err", "Offline — will sync when you're back online"); return false; }
    if (syncing) { syncAgain = true; return false; }
    syncing = true; setDot("busy", "Syncing…");
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        let remote = null, sha;
        try {
          const file = await gh(`${contentsPath()}?ref=${encodeURIComponent(syncCfg.branch)}`);
          sha = file.sha;
          const b64 = file.content && file.encoding === "base64" ? file.content : (await gh(`${repoPath()}/git/blobs/${file.sha}`)).content;
          remote = JSON.parse(b64decode(b64));
        } catch (e) { if (e.status !== 404) throw e; }
        const merged = merge(data, remote);
        const localChanged = canonical(merged) !== canonical(data);
        data = merged; persist(STORE_KEY, data);
        if (!remote || canonical(merged) !== canonical(normalize(remote))) {
          try {
            await gh(contentsPath(), { method: "PUT", body: JSON.stringify({
              message: `Deeper Stash sync · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
              content: b64encode(JSON.stringify(merged)), branch: syncCfg.branch, ...(sha ? { sha } : {})
            }) });
          } catch (e) { if (e.status === 409 || e.status === 422) continue; throw e; }
        }
        syncCfg.lastSync = now(); persist(SYNC_KEY, syncCfg);
        setDot("ok", "Synced " + new Date().toLocaleTimeString());
        if (localChanged && $("#sheet").hidden && !story.el && !journey.el && !ui.review) softRefresh(); else refreshChrome();
        if (!quiet) toast("Synced with GitHub");
        return true;
      }
      throw new Error("Couldn't resolve a sync conflict — try again");
    } catch (e) {
      const msg = e.status === 401 ? "GitHub rejected the token" : e.status === 404 ? "Repo not found, or the token can't see it" : e.message;
      setDot("err", "Sync failed: " + msg);
      if (!quiet) toast("Sync failed: " + msg);
      return false;
    } finally {
      syncing = false;
      if (syncAgain) { syncAgain = false; scheduleSync(); }
    }
  }
  window.addEventListener("online", () => scheduleSync());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && syncReady() && syncCfg.auto) syncNow(); });

  // ---------------------------------------------------------------- SETTINGS
  const appUrl = () => new URL("./", location.href).href;
  const bookmarklet = () => `javascript:(()=>{const s=String(getSelection()).trim();open('${appUrl()}?title='+encodeURIComponent(document.title)+'&text='+encodeURIComponent(s)+'&url='+encodeURIComponent(location.href),'_blank')})()`;
  function openSettings() {
    const last = syncCfg.lastSync ? new Date(syncCfg.lastSync).toLocaleString() : "never";
    openSheet(`
      <h3>Settings</h3>
      <div class="section-label" style="margin-top:0">Your interests</div>
      <p class="help" style="margin:0 0 10px">${local.interests?.length ? esc(local.interests.join(", ")) : "None picked yet — your feed mixes every topic."}</p>
      <button class="btn block" id="sInterests">Change interests</button>

      <div class="section-label">Save from anywhere</div>
      <p class="help" style="margin:0 0 10px"><b>On your phone:</b> after adding Deeper Stash to your home screen, use the Share button in any app (on Android) and pick Deeper Stash. <b>On a computer:</b> drag this button to your bookmarks bar, then click it on any page — highlighted text becomes a new idea.</p>
      <div class="row"><a class="btn" id="bmLink" href="#">🔖 Stash it</a><button class="btn" id="bmCopy">Copy bookmarklet</button></div>

      <div class="section-label">Sync with GitHub</div>
      <p class="help" style="margin:0 0 14px">Your ideas are saved as one JSON file in a GitHub repo, so every device you set up sees the same stashes. Use a <b>private</b> repo — your token stays on this device only.</p>
      <div class="status-box" id="syncStatus">${syncReady() ? `Connected to <b>${esc(syncCfg.owner)}/${esc(syncCfg.repo)}</b> · last sync ${esc(last)}` : "Not connected yet."}</div>
      <label class="field"><span>GitHub username</span><input class="input" id="gOwner" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(syncCfg.owner)}" placeholder="your-username"></label>
      <label class="field"><span>Data repo</span><input class="input" id="gRepo" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(syncCfg.repo)}"></label>
      <div class="row">
        <label class="field" style="flex:1"><span>Branch</span><input class="input" id="gBranch" autocapitalize="off" value="${esc(syncCfg.branch)}"></label>
        <label class="field" style="flex:1"><span>File</span><input class="input" id="gPath" autocapitalize="off" value="${esc(syncCfg.path)}"></label>
      </div>
      <label class="field"><span>Personal access token</span><input class="input" id="gToken" type="password" autocomplete="off" value="${esc(syncCfg.token)}" placeholder="github_pat_…"></label>
      <p class="help">Create a <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">fine-grained token</a> with access to just your data repo and <b>Contents: Read and write</b>. Want the app to create the repo for you? Use a <a href="https://github.com/settings/tokens/new?scopes=repo&description=Deeper%20Stash" target="_blank" rel="noopener">classic token with the repo scope</a> instead.</p>
      <label class="check-row" style="border:0;padding-top:0"><input type="checkbox" id="gAuto" ${syncCfg.auto ? "checked" : ""}><span>Sync automatically after changes</span></label>
      <div class="row" style="margin-top:6px">
        <button class="btn primary" id="gConnect">Save &amp; sync</button>
        <button class="btn" id="gCreate">Create private repo</button>
      </div>
      ${syncCfg.token ? `<button class="btn ghost block" id="gForget" style="margin-top:8px">Disconnect this device</button>` : ""}

      <div class="section-label">Backup</div>
      <div class="row"><button class="btn" id="exp">Export JSON</button><button class="btn" id="imp">Import JSON</button></div>
      <input type="file" id="impFile" accept="application/json,.json" hidden>

      <div class="section-label">Feed</div>
      <div class="row"><button class="btn" id="resetSeen">Show all ideas again</button></div>
      <p class="help" style="margin-top:18px">Deeper Stash · ${plural(allIdeas().length, "idea")} · ${plural(journeyList().length, "journey")} · ${plural(liveStashes().length, "stash")}</p>
    `, (el) => {
      el.querySelector("#sInterests").onclick = () => { closeSheet(); showOnboarding({ fromSettings: true }); };
      const bm = el.querySelector("#bmLink"); bm.setAttribute("href", bookmarklet());
      bm.onclick = (e) => { e.preventDefault(); toast("Drag this button to your bookmarks bar"); };
      el.querySelector("#bmCopy").onclick = async () => { try { await navigator.clipboard.writeText(bookmarklet()); toast("Copied — paste it as a new bookmark's URL"); } catch { toast("Couldn't copy on this device"); } };
      const read = () => ({
        owner: el.querySelector("#gOwner").value.trim(), repo: el.querySelector("#gRepo").value.trim(),
        branch: el.querySelector("#gBranch").value.trim() || "main", path: el.querySelector("#gPath").value.trim().replace(/^\/+/, "") || "stash.json",
        token: el.querySelector("#gToken").value.trim(), auto: el.querySelector("#gAuto").checked
      });
      const status = (html) => { el.querySelector("#syncStatus").innerHTML = html; };
      el.querySelector("#gConnect").onclick = async () => {
        Object.assign(syncCfg, read()); persist(SYNC_KEY, syncCfg);
        if (!syncReady()) return status("Fill in your username, repo and token first.");
        status("Syncing…");
        const ok = await syncNow({ quiet: false });
        status(ok ? `Connected to <b>${esc(syncCfg.owner)}/${esc(syncCfg.repo)}</b> · synced just now` : esc($("#syncDot").title));
      };
      el.querySelector("#gCreate").onclick = async () => {
        Object.assign(syncCfg, read()); persist(SYNC_KEY, syncCfg);
        if (!syncCfg.token || !syncCfg.repo) return status("Enter a token and a repo name first.");
        status("Creating repo…");
        try {
          const me = await gh("/user");
          await gh("/user/repos", { method: "POST", body: JSON.stringify({ name: syncCfg.repo, private: true, auto_init: true, description: "Deeper Stash data" }) });
          syncCfg.owner = me.login; persist(SYNC_KEY, syncCfg); el.querySelector("#gOwner").value = me.login;
          await new Promise((r) => setTimeout(r, 1500));
          const ok = await syncNow({ quiet: false });
          status(ok ? `Created private repo <b>${esc(me.login)}/${esc(syncCfg.repo)}</b> and synced.` : esc($("#syncDot").title));
        } catch (e) {
          status(e.status === 422 ? "That repo already exists — just tap Save &amp; sync." : e.status === 403 ? "This token can't create repos. Create the repo on GitHub yourself, or use a classic token with the repo scope." : esc(e.message));
        }
      };
      const forget = el.querySelector("#gForget");
      if (forget) forget.onclick = () => { syncCfg.token = ""; syncCfg.lastSync = 0; persist(SYNC_KEY, syncCfg); setDot(""); closeSheet(); toast("This device is disconnected from GitHub"); };
      el.querySelector("#exp").onclick = () => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `deeper-stash-${dayKey()}.json`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };
      el.querySelector("#imp").onclick = () => el.querySelector("#impFile").click();
      el.querySelector("#impFile").onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try {
          const incoming = JSON.parse(await f.text());
          if (!incoming || typeof incoming.ideas !== "object" || typeof incoming.stashes !== "object") throw new Error();
          data = merge(data, incoming); save(); ui.feedQueue = null; closeSheet(); render(); toast("Backup imported");
        } catch { toast("That file isn't a Deeper Stash backup"); }
      };
      el.querySelector("#resetSeen").onclick = () => { local.seen = {}; saveLocal(); ui.feedQueue = null; closeSheet(); go("feed"); toast("Your feed is full again"); };
    });
  }

  // ---------------------------------------------------------------- install banner
  function setupInstall() {
    const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    document.documentElement.classList.toggle("standalone", !!standalone);
    if (standalone || local.installDismissed) return;
    const banner = $("#installBanner");
    const show = (html, action) => {
      banner.innerHTML = `<img src="icon-192.png" alt=""><span>${html}</span>${action ? `<button class="btn primary small" id="installGo">${action.label}</button>` : ""}<button class="icon-btn" id="installX" aria-label="Dismiss">${ICONS.close}</button>`;
      banner.hidden = false;
      $("#installX").onclick = () => { banner.hidden = true; local.installDismissed = true; saveLocal(); };
      if (action) $("#installGo").onclick = action.fn;
    };
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios) setTimeout(() => show(`<b>Get the app:</b> tap ${ICONS.iosShare} Share, then <b>Add to Home Screen</b>`), 1500);
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      show("<b>Install Deeper Stash</b> for full-screen, offline use", { label: "Install", fn: async () => { e.prompt(); await e.userChoice.catch(() => {}); banner.hidden = true; } });
    });
    window.addEventListener("appinstalled", () => { banner.hidden = true; });
  }

  // ---------------------------------------------------------------- boot
  function handleLaunchParams() {
    const p = new URLSearchParams(location.search);
    const clean = () => history.replaceState(null, "", location.pathname);
    if (p.get("tab") && ["feed", "review", "stashes", "search"].includes(p.get("tab"))) { ui.tab = p.get("tab"); document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === ui.tab)); }
    if (p.get("action") === "add") { clean(); setTimeout(() => openEditor(), 500); return true; }
    if (p.has("title") || p.has("text") || p.has("url")) {
      let text = (p.get("text") || "").trim(), url = (p.get("url") || "").trim(), title = (p.get("title") || "").trim();
      const m = text.match(/https?:\/\/\S+/);
      if (!url && m) { url = m[0]; text = text.replace(m[0], "").trim(); }
      clean(); local.onboarded = true; saveLocal();
      setTimeout(() => openEditor(null, { body: text.slice(0, 1200), source: title.slice(0, 140), url: validUrl(url) ? url : "" }), 500);
      return true;
    }
    if (p.toString()) clean();
    return false;
  }
  const launched = handleLaunchParams();
  applyFreezes();
  render();
  setupInstall();
  requestAnimationFrame(() => setTimeout(() => { const sp = $("#splash"); if (sp) { sp.classList.add("gone"); setTimeout(() => sp.remove(), 500); } }, 450));
  const fresh = !Object.keys(data.ideas).length && !data.days.length && !Object.keys(local.seen).length;
  if (!launched && !local.onboarded && fresh) setTimeout(() => showOnboarding(), 600);
  if (syncReady()) { setDot("", "Sync ready"); if (syncCfg.auto) syncNow(); } else setDot("", "Sync is off — set it up in Settings");
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
