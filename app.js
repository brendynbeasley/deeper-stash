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
  const TOPIC_COLORS = {
    productivity: "--t-prod", psychology: "--t-psy", learning: "--t-learn", money: "--t-money",
    health: "--t-health", communication: "--t-comm", creativity: "--t-create", thinking: "--t-think", habits: "--t-habit"
  };
  const EMOJIS = ["📚", "💡", "🧠", "⚡", "🌱", "💰", "❤️", "🎯", "🛠️", "✍️", "🧭", "🔥", "🌙", "🎨", "🗣️", "⭐"];

  // ---------------------------------------------------------------- helpers
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const now = () => Date.now();
  const uid = (p) => p + "-" + Math.random().toString(36).slice(2, 8) + now().toString(36).slice(-4);
  const dayKey = (d = new Date()) => {
    const z = new Date(d); return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`;
  };
  const addDays = (key, n) => { const [y, m, d] = key.split("-").map(Number); return dayKey(new Date(y, m - 1, d + n)); };
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const topicVar = (t) => `var(${TOPIC_COLORS[String(t || "").toLowerCase()] || "--t-other"})`;
  const load = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const persist = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  // ---------------------------------------------------------------- state
  const freshData = () => ({
    v: 1,
    ideas: {},      // user ideas: id -> {id,title,body,source,topic,createdAt,updatedAt,deleted?}
    stashes: {      // id -> {id,name,emoji,ideaIds:[],updatedAt,deleted?}
      "st-saved": { id: "st-saved", name: "Saved", emoji: "⭐", ideaIds: [], updatedAt: 1 }
    },
    reviews: {},    // ideaId -> {box, due, at}
    days: [],       // YYYY-MM-DD dates a daily review was finished
    updatedAt: 0
  });
  let data = load(STORE_KEY, null) || freshData();
  let local = load(LOCAL_KEY, { seen: {}, lastStash: "st-saved", topic: "All" });
  let syncCfg = load(SYNC_KEY, { owner: "", repo: "deeper-stash-data", branch: "main", path: "stash.json", token: "", lastSync: 0, auto: true });

  const ui = { tab: "feed", feedQueue: null, review: null, query: "", searchTopic: "All", openStash: null };

  function save({ sync = true } = {}) {
    data.updatedAt = now();
    persist(STORE_KEY, data);
    if (sync) scheduleSync();
    refreshChrome();
  }
  const saveLocal = () => persist(LOCAL_KEY, local);

  // ---------------------------------------------------------------- ideas
  function allIdeas() {
    const starters = (window.STARTER_IDEAS || []).map((i) => ({ ...i, starter: true }));
    const mine = Object.values(data.ideas).filter((i) => !i.deleted);
    return [...mine.sort((a, b) => b.createdAt - a.createdAt), ...starters];
  }
  const ideaById = (id) => data.ideas[id] && !data.ideas[id].deleted ? data.ideas[id] : (window.STARTER_IDEAS || []).find((i) => i.id === id);
  const liveStashes = () => Object.values(data.stashes).filter((s) => !s.deleted).sort((a, b) => (a.id === "st-saved" ? -1 : b.id === "st-saved" ? 1 : a.name.localeCompare(b.name)));
  const topics = () => [...new Set(allIdeas().map((i) => i.topic).filter(Boolean))].sort();
  const stashedIds = () => new Set(liveStashes().flatMap((s) => s.ideaIds));
  const stashesFor = (id) => liveStashes().filter((s) => s.ideaIds.includes(id));

  function setInStash(stashId, ideaId, on) {
    const s = data.stashes[stashId]; if (!s) return;
    const has = s.ideaIds.includes(ideaId);
    if (on && !has) s.ideaIds.unshift(ideaId);
    if (!on && has) s.ideaIds = s.ideaIds.filter((x) => x !== ideaId);
    s.updatedAt = now();
    if (on && !data.reviews[ideaId]) data.reviews[ideaId] = { box: 0, due: dayKey(), at: now() };
  }

  // ---------------------------------------------------------------- streak & review
  function streakInfo() {
    const set = new Set(data.days);
    const today = dayKey();
    let cur = set.has(today) ? today : addDays(today, -1);
    let count = 0;
    while (set.has(cur)) { count++; cur = addDays(cur, -1); }
    // best streak
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
    if (ids.length === 0 && inStash.size === 0) {
      ids = shuffle(allIdeas()).slice(0, DAILY_REVIEW_SIZE).map((i) => i.id); fromLibrary = true;
    }
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
    $("#sheetBody").innerHTML = html;
    $("#sheet").hidden = false; $("#sheetBackdrop").hidden = false;
    document.body.style.overflow = "hidden";
    bind && bind($("#sheetBody"));
  }
  function closeSheet() {
    $("#sheet").hidden = true; $("#sheetBackdrop").hidden = true; document.body.style.overflow = "";
  }
  $("#sheetBackdrop").onclick = closeSheet;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

  // ---------------------------------------------------------------- chrome
  function refreshChrome() {
    const s = streakInfo();
    $("#streakCount").textContent = s.count;
    $("#streakPill").classList.toggle("lit", s.doneToday);
    $("#streakPill").title = s.doneToday ? `${s.count}-day streak — today's review is done` : `${s.count}-day streak — do today's review to keep it`;
    const due = dueCount(); const b = $("#reviewBadge");
    b.hidden = !due || s.doneToday; b.textContent = Math.min(due, 99);
  }
  document.querySelectorAll(".tab").forEach((btn) => btn.onclick = () => go(btn.dataset.tab));
  $("#streakPill").onclick = () => go("review");
  $("#settingsBtn").onclick = openSettings;
  $("#addBtn").onclick = () => openEditor();

  function go(tab) {
    ui.tab = tab; ui.openStash = tab === "stashes" ? ui.openStash : null;
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    render(); window.scrollTo(0, 0);
  }
  function render() {
    ({ feed: renderFeed, review: renderReview, stashes: renderStashes, search: renderSearch })[ui.tab]();
    refreshChrome();
  }

  // ---------------------------------------------------------------- FEED
  function buildFeedQueue() {
    const topic = local.topic;
    const pool = allIdeas().filter((i) => topic === "All" || i.topic === topic);
    const unseen = pool.filter((i) => !local.seen[i.id]);
    const mine = unseen.filter((i) => !i.starter); // your newest ideas first, then shuffled library
    ui.feedQueue = [...mine, ...shuffle(unseen.filter((i) => i.starter))].map((i) => i.id);
    ui.feedPoolSize = pool.length;
  }
  function cardHTML(idea, extra = "") {
    const st = stashesFor(idea.id);
    return `<article class="idea-card ${extra}" style="--tc:${topicVar(idea.topic)}" data-id="${esc(idea.id)}">
      <span class="stamp save">Stash</span><span class="stamp skip">Skip</span>
      <span class="topic">${esc(idea.topic || "Idea")}</span>
      <h2>${esc(idea.title)}</h2>
      <p>${esc(idea.body)}</p>
      <div class="source"><span>${idea.source ? esc(idea.source) : ""}</span><span>${st.length ? "★ " + esc(st.map((s) => s.name).join(", ")) : ""}</span></div>
    </article>`;
  }
  function renderFeed() {
    if (!ui.feedQueue) buildFeedQueue();
    ui.feedQueue = ui.feedQueue.filter((id) => ideaById(id));
    const chips = ["All", ...topics()].map((t) => `<button class="chip ${local.topic === t ? "active" : ""}" data-topic="${esc(t)}">${esc(t)}</button>`).join("");
    const [a, b] = ui.feedQueue.map(ideaById);
    $("#view").innerHTML = `
      <div class="chips" role="tablist">${chips}</div>
      ${a ? `
        <div class="deck" id="deck">${b ? cardHTML(b, "behind") : ""}${cardHTML(a)}</div>
        <div class="deck-actions">
          <button class="round-btn" id="skipBtn" aria-label="Skip"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>
          <button class="round-btn save" id="saveBtn" aria-label="Stash it"><svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" fill="currentColor"/></svg></button>
          <button class="round-btn small" id="moreBtn" aria-label="Choose stash or open"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg></button>
        </div>
        <p class="hint">Swipe right to stash · left to skip · tap a card to open it</p>`
      : `<div class="empty"><h3>You're all caught up</h3><p>You've been through every idea${local.topic !== "All" ? " in " + esc(local.topic) : ""}. Add your own, or go through them again.</p>
          <div class="row" style="max-width:360px;margin:18px auto 0"><button class="btn" id="restartBtn">Start over</button><button class="btn primary" id="addHere">Add an idea</button></div></div>`}`;

    $("#view").querySelectorAll(".chip").forEach((c) => c.onclick = () => { local.topic = c.dataset.topic; saveLocal(); buildFeedQueue(); renderFeed(); });
    if (!a) {
      $("#restartBtn").onclick = () => {
        const pool = allIdeas().filter((i) => local.topic === "All" || i.topic === local.topic);
        pool.forEach((i) => delete local.seen[i.id]); saveLocal(); buildFeedQueue(); renderFeed();
      };
      $("#addHere").onclick = () => openEditor();
      return;
    }
    $("#skipBtn").onclick = () => flick(-1);
    $("#saveBtn").onclick = () => flick(1);
    $("#moreBtn").onclick = () => openIdea(a.id);
    attachSwipe($("#deck .idea-card:not(.behind)"), a.id);
  }

  function advanceFeed(id) {
    local.seen[id] = now(); saveLocal();
    ui.feedQueue = ui.feedQueue.filter((x) => x !== id);
  }
  function stashFromFeed(id) {
    const target = data.stashes[local.lastStash] && !data.stashes[local.lastStash].deleted ? local.lastStash : "st-saved";
    setInStash(target, id, true); save();
    toast(`Stashed in ${data.stashes[target].name}`, { label: "Change", fn: () => openStashPicker(id) });
  }
  function flick(dir) {
    const card = $("#deck .idea-card:not(.behind)"); if (!card) return;
    const id = card.dataset.id;
    card.style.transform = `translateX(${dir * 140}%) rotate(${dir * 18}deg)`; card.style.opacity = "0";
    const behind = $("#deck .idea-card.behind"); if (behind) behind.classList.remove("behind");
    if (dir > 0) stashFromFeed(id);
    advanceFeed(id);
    setTimeout(renderFeed, 260);
  }
  function attachSwipe(card, id) {
    let sx = 0, sy = 0, dx = 0, dragging = false, moved = false;
    const stampSave = card.querySelector(".stamp.save"), stampSkip = card.querySelector(".stamp.skip");
    card.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      sx = e.clientX; sy = e.clientY; dx = 0; dragging = true; moved = false;
      card.setPointerCapture(e.pointerId); card.classList.add("dragging");
    });
    card.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dx = e.clientX - sx; const dy = e.clientY - sy;
      if (!moved && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) { dragging = false; card.classList.remove("dragging"); return; }
      if (Math.abs(dx) > 6) moved = true;
      card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
      stampSave.style.opacity = Math.max(0, Math.min(1, dx / 90));
      stampSkip.style.opacity = Math.max(0, Math.min(1, -dx / 90));
    });
    const end = () => {
      if (!dragging) return; dragging = false; card.classList.remove("dragging");
      if (Math.abs(dx) > 100) return flick(dx > 0 ? 1 : -1);
      card.style.transform = ""; stampSave.style.opacity = 0; stampSkip.style.opacity = 0;
      if (!moved) openIdea(id);
    };
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", () => { dragging = false; card.classList.remove("dragging"); card.style.transform = ""; });
  }
  document.addEventListener("keydown", (e) => {
    if (ui.tab !== "feed" || !$("#sheet").hidden || /input|textarea/i.test(document.activeElement?.tagName)) return;
    if (e.key === "ArrowRight") flick(1);
    if (e.key === "ArrowLeft") flick(-1);
  });

  // ---------------------------------------------------------------- idea detail
  function openIdea(id) {
    const idea = ideaById(id); if (!idea) return;
    const st = stashesFor(id);
    openSheet(`
      <span class="topic" style="color:${topicVar(idea.topic)};font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase">${esc(idea.topic || "Idea")}</span>
      <h2 class="detail-title">${esc(idea.title)}</h2>
      <p class="detail-body">${esc(idea.body)}</p>
      ${idea.source ? `<p class="help" style="margin:0 0 16px">${esc(idea.source)}</p>` : ""}
      <p class="help" style="margin:0 0 16px">${st.length ? "In: " + st.map((s) => esc(s.emoji + " " + s.name)).join(", ") : "Not in any stash yet"}</p>
      <div class="row">
        <button class="btn primary" id="dStash">${st.length ? "Edit stashes" : "Add to stash"}</button>
        <button class="btn" id="dShare">Share</button>
      </div>
      ${idea.starter ? "" : `<div class="row" style="margin-top:10px"><button class="btn ghost" id="dEdit">Edit</button><button class="btn ghost danger" id="dDel">Delete</button></div>`}
    `, (el) => {
      el.querySelector("#dStash").onclick = () => openStashPicker(id);
      el.querySelector("#dShare").onclick = async () => {
        const text = `${idea.title}\n\n${idea.body}${idea.source ? "\n\n— " + idea.source : ""}`;
        try { if (navigator.share) await navigator.share({ title: idea.title, text }); else { await navigator.clipboard.writeText(text); toast("Copied to clipboard"); } } catch {}
      };
      if (!idea.starter) {
        el.querySelector("#dEdit").onclick = () => openEditor(idea);
        el.querySelector("#dDel").onclick = () => {
          if (!confirm("Delete this idea? It will be removed from every stash.")) return;
          data.ideas[id] = { ...data.ideas[id], deleted: true, updatedAt: now() };
          liveStashes().forEach((s) => s.ideaIds.includes(id) && setInStash(s.id, id, false));
          delete data.reviews[id]; save(); closeSheet(); render(); toast("Idea deleted");
        };
      }
    });
  }

  function openStashPicker(id) {
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
        setInStash(cb.dataset.s, id, cb.checked); if (cb.checked) { local.lastStash = cb.dataset.s; saveLocal(); } save();
      });
      bindRows();
      el.querySelector("#newStashBtn").onclick = () => {
        const name = el.querySelector("#newStashName").value.trim(); if (!name) return;
        const s = createStash(name, EMOJIS[Math.floor(Math.random() * EMOJIS.length)]);
        setInStash(s.id, id, true); local.lastStash = s.id; saveLocal(); save();
        el.querySelector("#pickRows").innerHTML = rows(); el.querySelector("#newStashName").value = ""; bindRows();
      };
      el.querySelector("#pickDone").onclick = () => { closeSheet(); render(); };
    });
  }

  // ---------------------------------------------------------------- editor
  function openEditor(existing) {
    const isEdit = !!existing;
    const tlist = topics().map((t) => `<option value="${esc(t)}">`).join("");
    const stashOpts = liveStashes().map((s) => `<option value="${esc(s.id)}">${esc(s.emoji + " " + s.name)}</option>`).join("");
    openSheet(`
      <h3>${isEdit ? "Edit idea" : "New idea"}</h3>
      <label class="field"><span>Idea in one line</span><input class="input" id="eTitle" maxlength="140" placeholder="e.g. Constraints spark creativity" value="${esc(existing?.title)}"></label>
      <label class="field"><span>Explain it in your own words</span><textarea class="input" id="eBody" maxlength="1200" placeholder="A few sentences you'd want to remember">${esc(existing?.body)}</textarea></label>
      <label class="field"><span>Source (book, article, podcast…)</span><input class="input" id="eSource" maxlength="140" placeholder="Optional" value="${esc(existing?.source)}"></label>
      <label class="field"><span>Topic</span><input class="input" id="eTopic" list="topicList" maxlength="40" placeholder="e.g. Psychology" value="${esc(existing?.topic)}"><datalist id="topicList">${tlist}</datalist></label>
      ${isEdit ? "" : `<label class="field"><span>Save to stash</span><select class="input" id="eStash"><option value="">Don't stash yet</option>${stashOpts}</select></label>`}
      <button class="btn primary block" id="eSave">${isEdit ? "Save changes" : "Add idea"}</button>
    `, (el) => {
      if (!isEdit) el.querySelector("#eStash").value = local.lastStash && data.stashes[local.lastStash] && !data.stashes[local.lastStash].deleted ? local.lastStash : "";
      setTimeout(() => el.querySelector("#eTitle").focus(), 250);
      el.querySelector("#eSave").onclick = () => {
        const title = el.querySelector("#eTitle").value.trim();
        const body = el.querySelector("#eBody").value.trim();
        if (!title || !body) { toast("Add a title and a short explanation"); return; }
        const fields = { title, body, source: el.querySelector("#eSource").value.trim(), topic: el.querySelector("#eTopic").value.trim() || "Other" };
        if (isEdit) {
          data.ideas[existing.id] = { ...data.ideas[existing.id], ...fields, updatedAt: now() };
          save(); closeSheet(); render(); toast("Idea updated");
        } else {
          const id = uid("i");
          data.ideas[id] = { id, ...fields, createdAt: now(), updatedAt: now() };
          const st = el.querySelector("#eStash").value;
          if (st) { setInStash(st, id, true); local.lastStash = st; saveLocal(); }
          save(); closeSheet(); ui.feedQueue = null; render();
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
      <article class="idea-card review-card" style="--tc:${topicVar(idea.topic)}">
        <span class="topic">${esc(idea.topic || "Idea")}</span>
        <h2>${esc(idea.title)}</h2>
        ${r.revealed ? `<p>${esc(idea.body)}</p><div class="source"><span>${esc(idea.source || "")}</span></div>`
          : `<button class="reveal-cover" id="reveal">What's the idea? Think of it, then tap to check.</button>`}
      </article>
      <div class="row" style="margin-top:18px">
        ${r.revealed ? `<button class="btn" id="again">Review again</button><button class="btn primary" id="gotIt">I remembered</button>`
          : `<button class="btn primary block" id="reveal2">Show the idea</button>`}
      </div>`;
    const reveal = () => { r.revealed = true; renderReview(); };
    if (!r.revealed) { $("#reveal").onclick = reveal; $("#reveal2").onclick = reveal; return; }
    const grade = (ok) => {
      if (!r.fromLibrary) gradeReview(idea.id, ok);
      r.results.push(ok); r.i++; r.revealed = false;
      if (r.i >= r.ids.length && !data.days.includes(dayKey())) data.days.push(dayKey());
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
    const tiles = liveStashes().map((s) => `
      <button class="stash-tile" data-s="${esc(s.id)}"><span class="emoji">${esc(s.emoji)}</span>
      <span><div class="name">${esc(s.name)}</div><div class="count">${s.ideaIds.length} idea${s.ideaIds.length === 1 ? "" : "s"}</div></span></button>`).join("");
    $("#view").innerHTML = `
      <h1 class="view-title">Your stashes</h1>
      <p class="view-sub">Collections of ideas worth keeping.</p>
      <div class="stash-grid">${tiles}<button class="stash-tile new" id="newStash">+ New stash</button></div>`;
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
      <button class="btn ghost" id="back" style="padding:8px 0;border:0">← All stashes</button>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <h1 class="view-title">${esc(s.emoji)} ${esc(s.name)}</h1>
        <button class="btn" id="editStash">Edit</button>
      </div>
      <p class="view-sub">${items.length} idea${items.length === 1 ? "" : "s"}</p>
      ${items.length ? `<div class="list">${items.map(listItem).join("")}</div>`
        : `<div class="empty"><h3>Empty for now</h3><p>Swipe right on ideas in your feed, or tap ⋯ on a card to choose this stash.</p></div>`}`;
    $("#back").onclick = () => { ui.openStash = null; renderStashes(); };
    $("#editStash").onclick = () => openStashEditor(s);
    bindListItems();
  }
  function listItem(i, q) {
    const hl = (t) => { const e = esc(t); if (!q) return e; const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"); return e.replace(re, "<mark>$1</mark>"); };
    return `<button class="list-item" data-id="${esc(i.id)}" style="--tc:${topicVar(i.topic)}">
      <div class="li-topic">${esc(i.topic || "Idea")}${i.starter ? "" : " · yours"}</div>
      <div class="li-title">${hl(i.title)}</div><div class="li-body">${hl(i.body)}</div></button>`;
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
  const contentsPath = () => `/repos/${encodeURIComponent(syncCfg.owner)}/${encodeURIComponent(syncCfg.repo)}/contents/${syncCfg.path.split("/").map(encodeURIComponent).join("/")}`;

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
          sha = file.sha; remote = JSON.parse(b64decode(file.content));
        } catch (e) { if (e.status !== 404) throw e; }
        const merged = merge(data, remote);
        const localChanged = canonical(merged) !== canonical(data);
        data = merged; persist(STORE_KEY, data);
        if (!remote || canonical(merged) !== canonical(remote)) {
          try {
            await gh(contentsPath(), { method: "PUT", body: JSON.stringify({
              message: `Deeper Stash sync · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
              content: b64encode(JSON.stringify(merged, null, 1)), branch: syncCfg.branch, ...(sha ? { sha } : {})
            }) });
          } catch (e) { if (e.status === 409 || e.status === 422) continue; throw e; }
        }
        syncCfg.lastSync = now(); persist(SYNC_KEY, syncCfg);
        setDot("ok", "Synced " + new Date().toLocaleTimeString());
        if (localChanged) { ui.feedQueue = null; if ($("#sheet").hidden) render(); else refreshChrome(); }
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

  // ---------------------------------------------------------------- boot
  render();
  if (syncReady()) { setDot("", "Sync ready"); if (syncCfg.auto) syncNow(); } else setDot("", "Sync is off — set it up in Settings");
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
