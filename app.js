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
  const EMOJIS = ["📚", "💡", "🧠", "⚡", "🌱", "💰", "❤️", "🎯", "🛠️", "✍️", "🧭", "🔥", "🌙", "🎨", "🗣️", "⭐"];
  const ICONS = {
    bookmark: '<svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" fill="currentColor"/></svg>',
    bookmarkO: '<svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="19" cy="12" r="1.9" fill="currentColor"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
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
  const buzz = () => { try { navigator.vibrate && navigator.vibrate(12); } catch {} };
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const words = (s) => String(s || "").trim().split(/\s+/).length;
  const readTime = (i) => { const sec = Math.max(10, Math.round((words(i.title) + words(i.body)) / 3.8 / 5) * 5); return sec < 60 ? `${sec} sec read` : `${Math.round(sec / 60)} min read`; };
  const validImage = (src) => typeof src === "string" && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(src);
  const artHTML = (idea, opts) => validImage(idea.image) ? `<img src="${esc(idea.image)}" alt="">` : Art.svg(idea, opts);
  const topicStyle = (t) => { const [a, b] = Art.palette(t); return `--g1:${a};--g2:${b}`; };

  // ---------------------------------------------------------------- state
  const freshData = () => ({
    v: 1,
    ideas: {},      // user ideas: id -> {id,title,body,source,topic,image?,createdAt,updatedAt,deleted?}
    stashes: {      // id -> {id,name,emoji,ideaIds:[],updatedAt,deleted?}
      "st-saved": { id: "st-saved", name: "Saved", emoji: "⭐", ideaIds: [], updatedAt: 1 }
    },
    reviews: {},    // ideaId -> {box, due, at}
    days: [],       // YYYY-MM-DD dates a daily review was finished
    updatedAt: 0
  });
  let data = load(STORE_KEY, null) || freshData();
  let local = Object.assign({ seen: {}, lastStash: "st-saved", topic: "All", storySeen: {}, installDismissed: false }, load(LOCAL_KEY, {}));
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
  function allIdeas() {
    const starters = (window.STARTER_IDEAS || []).map((i) => ({ ...i, starter: true }));
    const mine = Object.values(data.ideas).filter((i) => !i.deleted);
    return [...mine.sort((a, b) => b.createdAt - a.createdAt), ...starters];
  }
  const ideaById = (id) => data.ideas[id] && !data.ideas[id].deleted ? data.ideas[id] : (window.STARTER_IDEAS || []).find((i) => i.id === id) && { ...(window.STARTER_IDEAS.find((i) => i.id === id)), starter: true };
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
  // Quick-stash into the last used stash. Returns true if it was newly added.
  function quickStash(id, { announce = true } = {}) {
    if (isStashed(id)) return false;
    const target = defaultStash();
    setInStash(target, id, true); save(); buzz();
    if (announce) toast(`Stashed in ${data.stashes[target].name}`, { label: "Change", fn: () => openStashPicker(id) });
    return true;
  }

  // ---------------------------------------------------------------- streak & review
  function streakInfo() {
    const set = new Set(data.days);
    const today = dayKey();
    let cur = set.has(today) ? today : addDays(today, -1);
    let count = 0;
    while (set.has(cur)) { count++; cur = addDays(cur, -1); }
    const sorted = [...set].sort(); let best = 0, run = 0, prev = null;
    for (const d of sorted) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
    return { count, best, doneToday: set.has(today) };
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
    return { ids, i: 0, revealed: false, results: [], fromLibrary };
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

  // ---------------------------------------------------------------- toast & sheet
  let toastTimer;
  function toast(msg, action) {
    const t = $("#toast");
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ""}`;
    if (action) t.querySelector("button").onclick = () => { t.classList.remove("show"); action.fn(); };
    t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), action ? 4000 : 2200);
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
    document.documentElement.classList.remove("sheet-open");
  }
  $("#sheetBackdrop").onclick = closeSheet;
  // Drag the sheet down by its handle (or from the top when scrolled up) to dismiss.
  (() => {
    const sheet = $("#sheet"); let y0 = null, dy = 0;
    sheet.addEventListener("pointerdown", (e) => {
      if (!e.target.closest(".sheet-grab") && (sheet.scrollTop > 0 || e.target.closest("input,textarea,select,button,label,a"))) return;
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
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if ($("#storyView")) closeStory(); else closeSheet(); } });

  // ---------------------------------------------------------------- chrome & navigation
  function refreshChrome() {
    const s = streakInfo();
    $("#streakCount").textContent = s.count;
    $("#streakPill").classList.toggle("lit", s.doneToday);
    $("#streakPill").title = s.doneToday ? `${s.count}-day streak — today's review is done` : `${s.count}-day streak — do today's review to keep it`;
    const due = dueCount(); const b = $("#reviewBadge");
    b.hidden = !due || s.doneToday; b.textContent = Math.min(due, 99);
  }
  document.querySelectorAll(".tab").forEach((btn) => btn.onclick = () => {
    if (btn.dataset.tab === ui.tab) { window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" }); if (ui.tab === "stashes" && ui.openStash) { ui.openStash = null; render(); } return; }
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
    ({ feed: renderFeed, review: renderReview, stashes: renderStashes, search: renderSearch })[ui.tab]();
    refreshChrome();
  }
  // Re-draw after a data change without losing the feed's scroll position.
  function softRefresh() {
    if (ui.tab !== "feed") return render();
    document.querySelectorAll("#feed .fcard").forEach((el) => {
      const idea = ideaById(el.dataset.id);
      if (!idea) return el.remove();
      const fresh = htmlToEl(feedCardHTML(idea, el.dataset.idx));
      el.replaceWith(fresh); bindFeedCard(fresh); feedObserver.observe(fresh);
    });
    const row = $(".stories"); if (row) { row.outerHTML = storiesRowHTML(); bindStoriesRow(); }
    refreshChrome();
  }
  const htmlToEl = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  // ---------------------------------------------------------------- STORIES
  function buildStories() {
    const today = dayKey(), lib = allIdeas();
    const list = [{ id: "daily", name: "Daily 5", topic: "daily", ids: shuffle(lib, Art.rng("daily" + today)).slice(0, 5).map((i) => i.id) }];
    const mine = lib.filter((i) => !i.starter).slice(0, 10);
    if (mine.length) list.push({ id: "mine", name: "Your ideas", topic: "mine", ids: mine.map((i) => i.id) });
    for (const t of topics()) {
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
  function bindStoriesRow() {
    document.querySelectorAll(".story-bubble").forEach((b) => b.onclick = () => openStory(+b.dataset.si));
  }

  const story = { list: null, si: 0, ii: 0, t0: 0, elapsed: 0, dur: 0, paused: false, raf: 0, el: null };
  function openStory(si) {
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
    document.documentElement.classList.remove("story-open");
    if (ui.tab === "feed") softRefresh();
  }
  function showStoryFrame() {
    const s = story.list[story.si];
    const idea = ideaById(s.ids[story.ii]);
    if (!idea) return nextFrame();
    local.storySeen[s.id] = dayKey(); saveLocal();
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
  function pauseStory() { if (!story.paused) { story.elapsed += performance.now() - story.t0; story.paused = true; story.el?.classList.add("paused"); } }
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
    if (!story.el || !$("#sheet").hidden) return;
    if (e.key === "ArrowRight") nextFrame();
    if (e.key === "ArrowLeft") prevFrame();
    if (e.key === " ") { e.preventDefault(); story.paused ? resumeStory() : pauseStory(); }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseStory(); else resumeStory(); });

  // ---------------------------------------------------------------- FEED
  function buildFeedQueue() {
    const topic = local.topic;
    const pool = allIdeas().filter((i) => topic === "All" || i.topic === topic);
    const unseen = pool.filter((i) => !local.seen[i.id]);
    const mine = unseen.filter((i) => !i.starter); // your newest ideas first, then the shuffled library
    ui.feedQueue = [...mine, ...shuffle(unseen.filter((i) => i.starter))].map((i) => i.id);
    ui.feedShown = 0;
  }
  function feedCardHTML(idea, idx) {
    const on = isStashed(idea.id);
    return `<article class="fcard" data-id="${esc(idea.id)}" data-idx="${idx}" style="${topicStyle(idea.topic)}">
      <div class="fcard-art">${artHTML(idea)}<span class="topic-pill">${esc(idea.topic || "Idea")}</span></div>
      <div class="fcard-content">
        <div class="fcard-meta">${readTime(idea)}${idea.starter ? "" : " · Yours"}</div>
        <h2>${esc(idea.title)}</h2>
        <p>${esc(idea.body)}</p>
      </div>
      ${idea.source ? `<div class="fcard-source">${esc(idea.source)}</div>` : ""}
      <div class="fcard-actions">
        <button class="act save ${on ? "on" : ""}" data-act="save">${on ? ICONS.bookmark : ICONS.bookmarkO}<span>${on ? "Stashed" : "Stash"}</span></button>
        <button class="act icon" data-act="share" aria-label="Share">${ICONS.share}</button>
        <button class="act icon" data-act="more" aria-label="More">${ICONS.more}</button>
      </div>
      <div class="burst" aria-hidden="true">${ICONS.bookmark}</div>
    </article>`;
  }
  function endCardHTML() {
    return `<div class="fcard end-card"><div class="empty">
      <div class="end-art">${Art.svg({ id: "end", topic: "daily" }, { center: true })}</div>
      <h3>You're all caught up</h3><p>You've seen every idea${local.topic !== "All" ? " in " + esc(local.topic) : ""}. Add one of your own, or start the feed over.</p>
      <div class="row" style="max-width:360px;margin:18px auto 0"><button class="btn" id="restartBtn">Start over</button><button class="btn primary" id="addHere">Add an idea</button></div></div></div>`;
  }
  function renderFeed() {
    if (!ui.feedQueue) buildFeedQueue();
    ui.feedQueue = ui.feedQueue.filter((id) => ideaById(id));
    ui.feedShown = 0;
    const chips = ["All", ...topics()].map((t) => `<button class="chip ${local.topic === t ? "active" : ""}" data-topic="${esc(t)}">${esc(t)}</button>`).join("");
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
      $("#addHere").onclick = () => openEditor();
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
    if (ui.tab !== "feed" || story.el || !$("#sheet").hidden || /input|textarea|select/i.test(document.activeElement?.tagName)) return;
    const cards = [...document.querySelectorAll("#feed .fcard")];
    const top = (el) => el.getBoundingClientRect().top;
    const cur = cards.findIndex((c) => top(c) > 40) - (e.key === "ArrowUp" || e.key === "k" ? 1 : 0);
    if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); cards[Math.max(0, cur)]?.scrollIntoView({ behavior: "smooth" }); }
    if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); (cards[cur - 1] ? cards[cur - 1] : $(".feed-head"))?.scrollIntoView({ behavior: "smooth" }); }
  });

  async function shareIdea(idea) {
    const text = `${idea.title}\n\n${idea.body}${idea.source ? "\n\n— " + idea.source : ""}`;
    try {
      if (navigator.share) { pauseStory(); await navigator.share({ title: idea.title, text }); }
      else { await navigator.clipboard.writeText(text); toast("Copied to clipboard"); }
    } catch {} finally { resumeStory(); }
  }

  // ---------------------------------------------------------------- idea detail
  function openIdea(id) {
    const idea = ideaById(id); if (!idea) return;
    const st = stashesFor(id);
    openSheet(`
      <div class="detail-art" style="${topicStyle(idea.topic)}">${artHTML(idea)}<span class="topic-pill">${esc(idea.topic || "Idea")}</span></div>
      <h2 class="detail-title">${esc(idea.title)}</h2>
      <p class="detail-body">${esc(idea.body)}</p>
      ${idea.source ? `<p class="help" style="margin:0 0 6px">Source: ${esc(idea.source)}</p>` : ""}
      <p class="help" style="margin:0 0 16px">${st.length ? "In " + st.map((s) => esc(s.emoji + " " + s.name)).join(", ") : "Not in any stash yet"}</p>
      <div class="row">
        <button class="btn primary" id="dStash">${ICONS.bookmark}${st.length ? "Edit stashes" : "Add to stash"}</button>
        <button class="btn" id="dShare">${ICONS.share}Share</button>
      </div>
      ${idea.starter ? "" : `<div class="row" style="margin-top:10px"><button class="btn ghost" id="dEdit">Edit</button><button class="btn ghost danger" id="dDel">Delete</button></div>`}
    `, (el) => {
      el.querySelector("#dStash").onclick = () => openStashPicker(id);
      el.querySelector("#dShare").onclick = () => shareIdea(idea);
      if (!idea.starter) {
        el.querySelector("#dEdit").onclick = () => openEditor(idea);
        el.querySelector("#dDel").onclick = () => {
          if (!confirm("Delete this idea? It will be removed from every stash.")) return;
          data.ideas[id] = { ...data.ideas[id], deleted: true, image: undefined, updatedAt: now() };
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
      el.querySelector("#pickDone").onclick = () => { closeSheet(); if (onClose) onClose(); else softRefresh(); };
    });
    if (onClose) {
      const watch = new MutationObserver(() => { if ($("#sheet").hidden) { watch.disconnect(); onClose(); } });
      watch.observe($("#sheet"), { attributes: true, attributeFilter: ["hidden"] });
      const done = $("#pickDone"); done.onclick = () => closeSheet();
    }
  }

  // ---------------------------------------------------------------- editor
  async function resizeImage(file, max = 720) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.72);
    } finally { URL.revokeObjectURL(url); }
  }
  function openEditor(existing) {
    const isEdit = !!existing;
    const draft = { id: existing?.id || uid("i"), topic: existing?.topic || "", image: existing?.image };
    const tlist = topics().map((t) => `<option value="${esc(t)}">`).join("");
    const stashOpts = liveStashes().map((s) => `<option value="${esc(s.id)}">${esc(s.emoji + " " + s.name)}</option>`).join("");
    openSheet(`
      <h3>${isEdit ? "Edit idea" : "New idea"}</h3>
      <div class="cover-pick" id="coverPrev"></div>
      <div class="row" style="margin:-4px 0 14px"><button class="btn" id="coverBtn">Add a photo</button><button class="btn ghost" id="coverDel">Use artwork</button></div>
      <input type="file" id="coverFile" accept="image/*" hidden>
      <label class="field"><span>Idea in one line</span><input class="input" id="eTitle" maxlength="140" placeholder="e.g. Constraints spark creativity" value="${esc(existing?.title)}"></label>
      <label class="field"><span>Explain it in your own words</span><textarea class="input" id="eBody" maxlength="1200" placeholder="A few sentences you'd want to remember">${esc(existing?.body)}</textarea></label>
      <label class="field"><span>Source (book, article, podcast…)</span><input class="input" id="eSource" maxlength="140" placeholder="Optional" value="${esc(existing?.source)}"></label>
      <label class="field"><span>Topic</span><input class="input" id="eTopic" list="topicList" maxlength="40" placeholder="e.g. Psychology" value="${esc(existing?.topic)}"><datalist id="topicList">${tlist}</datalist></label>
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
      el.querySelector("#eSave").onclick = () => {
        const title = el.querySelector("#eTitle").value.trim();
        const body = el.querySelector("#eBody").value.trim();
        if (!title || !body) { toast("Add a title and a short explanation"); return; }
        const fields = { title, body, source: el.querySelector("#eSource").value.trim(), topic: el.querySelector("#eTopic").value.trim() || "Other", image: validImage(draft.image) ? draft.image : undefined };
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

  // ---------------------------------------------------------------- REVIEW
  function renderReview() {
    const s = streakInfo();
    const today = dayKey();
    const week = Array.from({ length: 7 }, (_, k) => addDays(today, k - 6)).map((d) => {
      const [y, m, dd] = d.split("-").map(Number);
      const label = new Date(y, m - 1, dd).toLocaleDateString(undefined, { weekday: "narrow" });
      return `<div class="day ${data.days.includes(d) ? "done" : ""} ${d === today ? "today" : ""}">${label}<i>${data.days.includes(d) ? "✓" : dd}</i></div>`;
    }).join("");
    const head = `
      <h1 class="view-title">Daily review</h1>
      <p class="view-sub">${s.doneToday ? "Done for today. Your streak is safe." : "A few minutes of recall keeps ideas from fading."}</p>
      <div class="stats">
        <div class="stat"><b>${s.count}</b><span>day streak</span></div>
        <div class="stat"><b>${s.best}</b><span>best streak</span></div>
        <div class="stat"><b>${stashedIds().size}</b><span>ideas stashed</span></div>
      </div>
      <div class="week">${week}</div>`;

    const r = ui.review;
    if (!r) {
      const due = dueCount();
      $("#view").innerHTML = head + `
        <div class="empty" style="padding-top:12px">
          ${stashedIds().size === 0
            ? `<h3>Nothing stashed yet</h3><p>Stash ideas from your feed and they'll come back here for review. For today, you can warm up with ${DAILY_REVIEW_SIZE} ideas from the library.</p>`
            : due ? `<h3>${Math.min(due, DAILY_REVIEW_SIZE)} idea${Math.min(due, DAILY_REVIEW_SIZE) > 1 ? "s" : ""} ready</h3><p>See the headline, recall the idea in your head, then check yourself.</p>`
            : `<h3>All reviewed</h3><p>Nothing is due right now. Ideas come back after 1, 3, 7, 16 and 35 days as you remember them.</p>`}
          ${(due || stashedIds().size === 0) ? `<button class="btn primary" id="startReview" style="margin-top:14px">Start review</button>` : ""}
        </div>`;
      const sb = $("#startReview"); if (sb) sb.onclick = () => { ui.review = buildReviewSession(); renderReview(); };
      return;
    }
    if (r.i >= r.ids.length) {
      const got = r.results.filter(Boolean).length;
      $("#view").innerHTML = head + `
        <div class="empty"><h3>Review complete 🔥</h3><p>You remembered ${got} of ${r.results.length}. ${streakInfo().count > 1 ? `That's ${streakInfo().count} days in a row.` : "Come back tomorrow to start a streak."}</p>
        <button class="btn primary" id="doneReview" style="margin-top:14px">Back to review</button></div>`;
      $("#doneReview").onclick = () => { ui.review = null; renderReview(); };
      return;
    }
    const idea = ideaById(r.ids[r.i]);
    if (!idea) { r.i++; return renderReview(); }
    $("#view").innerHTML = `
      <h1 class="view-title">Daily review</h1>
      <p class="view-sub">${r.i + 1} of ${r.ids.length}${r.fromLibrary ? " · warm-up from the library" : ""}</p>
      <div class="progress"><div style="width:${(r.i / r.ids.length) * 100}%"></div></div>
      <article class="rcard" style="${topicStyle(idea.topic)}">
        <div class="rcard-art">${artHTML(idea)}<span class="topic-pill">${esc(idea.topic || "Idea")}</span></div>
        <div class="rcard-content">
          <h2>${esc(idea.title)}</h2>
          ${r.revealed ? `<p>${esc(idea.body)}</p>${idea.source ? `<small>${esc(idea.source)}</small>` : ""}`
            : `<button class="reveal-cover" id="reveal">What's the idea? Think of it, then tap to check.</button>`}
        </div>
      </article>
      <div class="row" style="margin-top:16px">
        ${r.revealed ? `<button class="btn" id="again">Review again</button><button class="btn primary" id="gotIt">I remembered</button>`
          : `<button class="btn primary block" id="reveal2">Show the idea</button>`}
      </div>`;
    const reveal = () => { r.revealed = true; renderReview(); };
    if (!r.revealed) { $("#reveal").onclick = reveal; $("#reveal2").onclick = reveal; return; }
    const grade = (ok) => {
      if (!r.fromLibrary) gradeReview(idea.id, ok);
      r.results.push(ok); r.i++; r.revealed = false;
      if (r.i >= r.ids.length && !data.days.includes(dayKey())) { data.days.push(dayKey()); buzz(); }
      save(); renderReview();
    };
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
        <span class="tile-text"><span class="name">${esc(s.emoji)} ${esc(s.name)}</span><span class="count">${s.ideaIds.length} idea${s.ideaIds.length === 1 ? "" : "s"}</span></span></button>`;
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
    $("#view").innerHTML = `
      <button class="back-btn" id="back">‹ Stashes</button>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <h1 class="view-title">${esc(s.emoji)} ${esc(s.name)}</h1>
        <button class="btn" id="editStash">Edit</button>
      </div>
      <p class="view-sub">${items.length} idea${items.length === 1 ? "" : "s"}</p>
      ${items.length ? `<div class="list">${items.map((i) => listItem(i)).join("")}</div>`
        : `<div class="empty"><h3>Empty for now</h3><p>Double-tap ideas in your feed, or tap Stash on a card and choose this stash.</p></div>`}`;
    $("#back").onclick = () => { ui.openStash = null; renderStashes(); };
    $("#editStash").onclick = () => openStashEditor(s);
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

  // ---------------------------------------------------------------- SEARCH
  function renderSearch() {
    const chips = ["All", "Yours", ...topics()].map((t) => `<button class="chip ${ui.searchTopic === t ? "active" : ""}" data-topic="${esc(t)}">${esc(t)}</button>`).join("");
    $("#view").innerHTML = `
      <h1 class="view-title">Search</h1>
      <div class="search-box"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      <input class="input" id="q" type="search" placeholder="Search ideas, sources, topics" value="${esc(ui.query)}" autocomplete="off"></div>
      <div class="chips">${chips}</div>
      <div id="results"></div>`;
    const run = () => {
      const q = ui.query.trim().toLowerCase();
      const res = allIdeas().filter((i) =>
        (ui.searchTopic === "All" || (ui.searchTopic === "Yours" ? !i.starter : i.topic === ui.searchTopic)) &&
        (!q || [i.title, i.body, i.source, i.topic].some((f) => String(f || "").toLowerCase().includes(q))));
      $("#results").innerHTML = res.length
        ? `<p class="help" style="margin:4px 0 10px">${res.length} idea${res.length === 1 ? "" : "s"}</p><div class="list">${res.map((i) => listItem(i, ui.query.trim())).join("")}</div>`
        : `<div class="empty"><h3>No matches</h3><p>Try a different word, or add this idea yourself.</p></div>`;
      bindListItems();
    };
    $("#q").oninput = (e) => { ui.query = e.target.value; run(); };
    $("#view").querySelectorAll(".chip").forEach((c) => c.onclick = () => { ui.searchTopic = c.dataset.topic; renderSearch(); });
    run();
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
    for (const [id, v] of Object.entries(b)) if (!out[id] || (v.updatedAt || v.at || 0) > (out[id].updatedAt || out[id].at || 0)) out[id] = v;
    return out;
  }
  function merge(localData, remote) {
    if (!remote) return localData;
    return {
      v: 1,
      ideas: mergeById(localData.ideas, remote.ideas),
      stashes: mergeById(localData.stashes, remote.stashes),
      reviews: mergeById(localData.reviews, remote.reviews),
      days: [...new Set([...(localData.days || []), ...(remote.days || [])])].sort(),
      updatedAt: Math.max(localData.updatedAt || 0, remote.updatedAt || 0)
    };
  }
  const canonical = (d) => JSON.stringify({ ideas: d.ideas, stashes: d.stashes, reviews: d.reviews, days: d.days });

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
          // Files over 1 MB (lots of photos) come back without content; fetch the raw blob instead.
          const b64 = file.content && file.encoding === "base64" ? file.content : (await gh(`${repoPath()}/git/blobs/${file.sha}`)).content;
          remote = JSON.parse(b64decode(b64));
        } catch (e) { if (e.status !== 404) throw e; }
        const merged = merge(data, remote);
        const localChanged = canonical(merged) !== canonical(data);
        data = merged; persist(STORE_KEY, data);
        if (!remote || canonical(merged) !== canonical(remote)) {
          try {
            await gh(contentsPath(), { method: "PUT", body: JSON.stringify({
              message: `Deeper Stash sync · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
              content: b64encode(JSON.stringify(merged)), branch: syncCfg.branch, ...(sha ? { sha } : {})
            }) });
          } catch (e) { if (e.status === 409 || e.status === 422) continue; throw e; }
        }
        syncCfg.lastSync = now(); persist(SYNC_KEY, syncCfg);
        setDot("ok", "Synced " + new Date().toLocaleTimeString());
        if (localChanged && $("#sheet").hidden && !story.el) { ui.feedQueue = ui.tab === "feed" ? ui.feedQueue : null; softRefresh(); } else refreshChrome();
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
  function openSettings() {
    const last = syncCfg.lastSync ? new Date(syncCfg.lastSync).toLocaleString() : "never";
    openSheet(`
      <h3>Settings</h3>
      <div class="section-label" style="margin-top:0">Sync with GitHub</div>
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
      <p class="help" style="margin-top:18px">Deeper Stash · ${allIdeas().length} ideas · ${liveStashes().length} stashes</p>
    `, (el) => {
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
  render();
  setupInstall();
  requestAnimationFrame(() => setTimeout(() => { const sp = $("#splash"); if (sp) { sp.classList.add("gone"); setTimeout(() => sp.remove(), 500); } }, 450));
  if (syncReady()) { setDot("", "Sync ready"); if (syncCfg.auto) syncNow(); } else setDot("", "Sync is off — set it up in Settings");
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
