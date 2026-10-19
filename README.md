# MoodMap

A private daily mood and energy tracker with a **year-in-pixels** view and gentle pattern insights. It runs entirely in your browser: no accounts, no server, no analytics.

**Live app:** https://shaikbasha1437.github.io/moodmap/

## Features

- **10-second check-in:** mood 1–5 and energy 1–5 with emoji and colors, optional activity tags (walk, workout, sleep well, social, work stress, study, outdoors, caffeine, screen-heavy, plus your own), and an optional one-line note. One entry per day; edit any past day. Keyboard: press `1`–`5` for mood, `Enter` to save.
- **Year in pixels:** a 12 × 31 grid colored by mood (or energy), with a year switcher. Tap any day to see or edit it.
- **Month calendar:** the same data as a calendar with emoji per day.
- **Insights** (only shown when there's enough data):
  - average mood or energy on days *with* vs *without* each tag (each side needs at least 3 days), e.g. “Your mood tends to be higher on days with ‘walk’: +0.8 vs other days”
  - averages by weekday
  - 7- and 30-day trend chart with a rolling average, compared with the previous period
  - current and longest check-in streak, best and toughest week
- **Demo data:** preview insights with clearly labeled sample entries that never overwrite your own and can be removed in one click.
- **Daily reminder:** an optional browser notification at a time you choose, while MoodMap is open in a tab.
- **Your data, your device:** stored in `localStorage` only. Export or import JSON and CSV, or delete everything (typed confirmation).
- **Optional passcode lock:** a privacy screen for shared devices (not encryption).
- Light/dark theme, responsive layout, and an installable PWA that works offline.

Insights describe patterns in your own entries. They're correlations, not causes.

## Not medical advice

MoodMap is a journaling tool and can't diagnose or treat anything. If you're struggling, please reach out to someone you trust or a professional. In the US you can call or text **988** or visit [988lifeline.org](https://988lifeline.org/) (Suicide & Crisis Lifeline, 24/7).

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
npm test                      # Node 18+ unit tests for streaks, insights and aggregation
```

No build step and no dependencies. `core.js` holds all the pure logic (streaks, tag comparisons, weekday averages, trends, weekly bests, grids, CSV/JSON import and export, demo data) and is shared by the app and the tests. `app.js` is the UI. `sw.js` is a network-first service worker: it always fetches fresh files when online and falls back to a versioned per-file cache offline.

## CSV format

```
date,mood,energy,tags,note
2026-10-19,4,3,walk;social,"Good day, short walk"
```

`date` (YYYY-MM-DD) and `mood` (1–5) are required; tags are separated by `;`.

## License

[MIT](LICENSE)
