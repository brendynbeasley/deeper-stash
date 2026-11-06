# Deeper Stash

Bite-sized ideas from books, articles, podcasts and life — swipe through them, stash the ones worth keeping, and review them so they stick.

**Live app:** https://brendynbeasley.github.io/deeper-stash/

## Features

- **Full-screen feed** — scroll through full-height idea cards, each with its own illustration. Double-tap a card (or tap **Stash**) to save it; tap to open it.
- **Stories** — a row of story circles (Daily 5, Your ideas, and each topic) that open full-screen and auto-advance. Tap right/left to move, hold to pause, swipe down to close.
- **Photos** — give your own ideas a cover photo, or keep the generated artwork.
- **Starter library** — 43 original idea cards across Productivity, Psychology, Learning, Money, Health, Communication, Creativity, Thinking and Habits.
- **Your own ideas** — tap **+** to add an idea with a title, explanation, source and topic.
- **Stashes** — named collections with an icon. An idea can live in several stashes.
- **Topics & search** — filter the feed by topic; search across titles, text, sources and topics.
- **Daily review & streak** — each day, up to 5 stashed ideas come back. See the headline, recall the idea, then check yourself. Ideas you remember return after 1, 3, 7, 16, 35 and 90 days; ones you miss come back tomorrow. Finishing the day's review keeps your streak going.
- **Works offline** and can be installed to your home screen (Share → Add to Home Screen on iPhone).

## Syncing across devices with GitHub

Your data is stored in the browser and, if you turn on sync, as a single `stash.json` file in a GitHub repo of your choice.

1. Open **Settings** (gear icon).
2. Create a token:
   - **Fine-grained token** (recommended): access to only your data repo, permission **Contents: Read and write**. Create the private repo (e.g. `deeper-stash-data`) on GitHub first.
   - Or a **classic token** with the `repo` scope, and tap **Create private repo** to have the app make it for you.
3. Enter your username, repo name and token, then tap **Save & sync**.
4. Repeat on each device with the same repo.

The token is kept only in that browser's local storage and is sent only to `api.github.com`. Keep your data repo **private** — this app's own repo is public.

Changes sync automatically a few seconds after you make them, and again whenever you reopen the app. If two devices change things at once, the newest edit of each idea and stash wins.

## Files

| File | What it is |
| --- | --- |
| `index.html` | App shell |
| `styles.css` | Styles (light and dark mode) |
| `app.js` | All app logic: feed, stashes, review, search, GitHub sync |
| `art.js` | Generates each card's illustration and the story avatars |
| `starter.js` | The starter idea library — add your own cards here |
| `sw.js`, `manifest.webmanifest` | Offline support and home-screen install |

No build step — it's plain HTML, CSS and JavaScript served by GitHub Pages.
