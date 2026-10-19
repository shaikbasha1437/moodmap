/* MoodMap core logic: pure functions, no DOM. Works in the browser (window.MoodCore) and Node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MoodCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_TAGS = ['walk', 'workout', 'sleep well', 'social', 'work stress', 'study', 'outdoors', 'caffeine', 'screen-heavy'];
  const MOODS = [
    { v: 1, emoji: '😞', label: 'Awful' },
    { v: 2, emoji: '😕', label: 'Low' },
    { v: 3, emoji: '😐', label: 'Okay' },
    { v: 4, emoji: '🙂', label: 'Good' },
    { v: 5, emoji: '😄', label: 'Great' },
  ];
  const ENERGY = [
    { v: 1, emoji: '🪫', label: 'Drained' },
    { v: 2, emoji: '🥱', label: 'Tired' },
    { v: 3, emoji: '😌', label: 'Steady' },
    { v: 4, emoji: '⚡', label: 'Energized' },
    { v: 5, emoji: '🚀', label: 'Buzzing' },
  ];
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MIN_SAMPLE = 3;

  const pad = (n) => String(n).padStart(2, '0');
  /** Local-date key YYYY-MM-DD (never UTC, so late-night check-ins land on the right day). */
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); }
  function isValidKey(k) {
    if (typeof k !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
    const d = parseKey(k); return dateKey(d) === k;
  }
  function addDays(k, n) { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); }
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); } // m is 0-based
  function round1(x) { return Math.round(x * 10) / 10; }
  function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
  function cleanTag(t) { return String(t || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 30); }

  /** Validate and normalise one entry; returns null if unusable. */
  function normalizeEntry(e) {
    if (!e || !isValidKey(e.date)) return null;
    const mood = Number(e.mood), energy = e.energy == null || e.energy === '' ? null : Number(e.energy);
    if (!Number.isInteger(mood) || mood < 1 || mood > 5) return null;
    const out = { date: e.date, mood };
    out.energy = Number.isInteger(energy) && energy >= 1 && energy <= 5 ? energy : null;
    let tags = e.tags;
    if (typeof tags === 'string') tags = tags.split(/[;|]/);
    out.tags = Array.from(new Set((Array.isArray(tags) ? tags : []).map(cleanTag).filter(Boolean)));
    out.note = String(e.note || '').slice(0, 280);
    if (e.demo) out.demo = true;
    if (e.updated) out.updated = e.updated;
    return out;
  }

  /** Store is an object keyed by date: one entry per day. */
  function upsert(store, entry) {
    const n = normalizeEntry(entry); if (!n) throw new Error('Invalid entry');
    const next = Object.assign({}, store); next[n.date] = n; return next;
  }
  function sortedEntries(store) { return Object.values(store).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)); }

  /** Current streak: consecutive logged days ending today, or ending yesterday if today isn't logged yet. */
  function currentStreak(store, todayKey) {
    let k = store[todayKey] ? todayKey : addDays(todayKey, -1), n = 0;
    while (store[k]) { n++; k = addDays(k, -1); }
    return n;
  }
  function longestStreak(store) {
    const keys = Object.keys(store).sort(); let best = 0, run = 0, prev = null;
    for (const k of keys) { run = prev && addDays(prev, 1) === k ? run + 1 : 1; best = Math.max(best, run); prev = k; }
    return best;
  }

  function values(entries, metric) { return entries.map((e) => e[metric]).filter((v) => typeof v === 'number'); }
  function average(entries, metric) { const m = mean(values(entries, metric)); return m == null ? null : round1(m); }

  /**
   * Average mood/energy on days with vs without each tag. Only reported when both sides
   * have at least minSample days, so a single good day can't produce a "pattern".
   */
  function tagInsights(entries, metric = 'mood', minSample = MIN_SAMPLE) {
    const rated = entries.filter((e) => typeof e[metric] === 'number');
    const tags = new Set(); rated.forEach((e) => e.tags.forEach((t) => tags.add(t)));
    const out = [];
    for (const tag of tags) {
      const withT = rated.filter((e) => e.tags.includes(tag)), without = rated.filter((e) => !e.tags.includes(tag));
      if (withT.length < minSample || without.length < minSample) continue;
      const a = mean(values(withT, metric)), b = mean(values(without, metric));
      out.push({ tag, withAvg: round1(a), withoutAvg: round1(b), diff: round1(a - b), withCount: withT.length, withoutCount: without.length });
    }
    return out.sort((x, y) => y.diff - x.diff || y.withCount - x.withCount);
  }

  function describeTagInsight(ins, metric = 'mood') {
    const word = metric === 'energy' ? 'energy' : 'mood';
    const sign = ins.diff > 0 ? '+' : ins.diff < 0 ? '−' : '±';
    const mag = Math.abs(ins.diff).toFixed(1);
    if (ins.diff >= 0.3) return `Your ${word} tends to be higher on days with “${ins.tag}”: ${sign}${mag} vs other days`;
    if (ins.diff <= -0.3) return `Your ${word} tends to be lower on days with “${ins.tag}”: ${sign}${mag} vs other days`;
    return `Days with “${ins.tag}” look about the same as other days (${sign}${mag})`;
  }

  function weekdayAverages(entries, metric = 'mood') {
    const buckets = WEEKDAYS.map(() => []);
    entries.forEach((e) => { if (typeof e[metric] === 'number') buckets[parseKey(e.date).getDay()].push(e[metric]); });
    return buckets.map((b, i) => ({ day: WEEKDAYS[i], count: b.length, avg: b.length ? round1(mean(b)) : null }));
  }

  /** Daily series for the last `days` days ending at endKey, with a trailing rolling average (window). */
  function trendSeries(store, endKey, days = 30, metric = 'mood', window = 7) {
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const k = addDays(endKey, -i), e = store[k];
      const val = e && typeof e[metric] === 'number' ? e[metric] : null;
      const win = [];
      for (let j = 0; j < window; j++) { const w = store[addDays(k, -j)]; if (w && typeof w[metric] === 'number') win.push(w[metric]); }
      series.push({ date: k, value: val, rolling: win.length ? round1(mean(win)) : null });
    }
    return series;
  }

  /** Average over the last n days vs the n days before that. */
  function periodCompare(store, endKey, n = 7, metric = 'mood') {
    const pick = (from, to) => { const v = []; for (let i = from; i < to; i++) { const e = store[addDays(endKey, -i)]; if (e && typeof e[metric] === 'number') v.push(e[metric]); } return v; };
    const cur = pick(0, n), prev = pick(n, 2 * n);
    const c = cur.length ? round1(mean(cur)) : null, p = prev.length ? round1(mean(prev)) : null;
    return { current: c, previous: p, currentCount: cur.length, previousCount: prev.length, change: c != null && p != null ? round1(c - p) : null };
  }

  /** Monday-start week key for a date key. */
  function weekStart(k) { const d = parseKey(k); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); return dateKey(d); }

  /** Weekly averages; weeks with fewer than minDays entries are ignored. Returns {best, worst, weeks}. */
  function bestWorstWeeks(entries, metric = 'mood', minDays = MIN_SAMPLE) {
    const map = {};
    entries.forEach((e) => { if (typeof e[metric] !== 'number') return; const w = weekStart(e.date); (map[w] = map[w] || []).push(e[metric]); });
    const weeks = Object.entries(map).filter(([, v]) => v.length >= minDays).map(([start, v]) => ({ start, end: addDays(start, 6), avg: round1(mean(v)), count: v.length }));
    weeks.sort((a, b) => b.avg - a.avg || (a.start < b.start ? 1 : -1));
    if (weeks.length < 2) return { best: null, worst: null, weeks };
    return { best: weeks[0], worst: weeks[weeks.length - 1], weeks };
  }

  /** 12 rows x 31 columns. Cells are {date, value, entry} or null for days that don't exist (e.g. Feb 30). */
  function yearGrid(store, year, metric = 'mood') {
    const rows = [];
    for (let m = 0; m < 12; m++) {
      const row = [], dim = daysInMonth(year, m);
      for (let d = 1; d <= 31; d++) {
        if (d > dim) { row.push(null); continue; }
        const k = year + '-' + pad(m + 1) + '-' + pad(d), e = store[k];
        row.push({ date: k, value: e && typeof e[metric] === 'number' ? e[metric] : null, entry: e || null });
      }
      rows.push(row);
    }
    return rows;
  }

  /** Month calendar: weeks (Monday start) of cells, null for padding. */
  function monthMatrix(year, month) {
    const first = new Date(year, month, 1, 12), lead = (first.getDay() + 6) % 7, dim = daysInMonth(year, month);
    const cells = Array(lead).fill(null);
    for (let d = 1; d <= dim; d++) cells.push(year + '-' + pad(month + 1) + '-' + pad(d));
    while (cells.length % 7) cells.push(null);
    const weeks = []; for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }

  function yearsWithData(store, currentYear) {
    const ys = new Set([currentYear]); Object.keys(store).forEach((k) => ys.add(Number(k.slice(0, 4))));
    return Array.from(ys).sort((a, b) => a - b);
  }

  /* ---------- Import / export ---------- */
  function csvCell(s) { s = String(s == null ? '' : s); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toCSV(store) {
    const lines = ['date,mood,energy,tags,note'];
    sortedEntries(store).forEach((e) => lines.push([e.date, e.mood, e.energy == null ? '' : e.energy, e.tags.join(';'), e.note].map(csvCell).join(',')));
    return lines.join('\n') + '\n';
  }
  function parseCSVRows(text) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
  }
  function fromCSV(text) {
    const rows = parseCSVRows(String(text).replace(/^\uFEFF/, ''));
    if (!rows.length) return { entries: [], skipped: 0 };
    const head = rows[0].map((h) => h.trim().toLowerCase()), idx = (n) => head.indexOf(n);
    if (idx('date') < 0 || idx('mood') < 0) throw new Error('CSV needs at least "date" and "mood" columns');
    const entries = []; let skipped = 0;
    rows.slice(1).forEach((r) => {
      const n = normalizeEntry({ date: (r[idx('date')] || '').trim(), mood: r[idx('mood')], energy: idx('energy') >= 0 ? r[idx('energy')] : null, tags: idx('tags') >= 0 ? r[idx('tags')] : '', note: idx('note') >= 0 ? r[idx('note')] : '' });
      n ? entries.push(n) : skipped++;
    });
    return { entries, skipped };
  }
  function toJSON(store, customTags = []) {
    return JSON.stringify({ app: 'MoodMap', version: 1, exported: new Date().toISOString(), customTags, entries: sortedEntries(store) }, null, 2);
  }
  function fromJSON(text) {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : Array.isArray(data.entries) ? data.entries : data && typeof data === 'object' ? Object.values(data) : [];
    const entries = []; let skipped = 0;
    list.forEach((e) => { const n = normalizeEntry(e); n ? entries.push(n) : skipped++; });
    return { entries, skipped, customTags: Array.isArray(data.customTags) ? data.customTags.map(cleanTag).filter(Boolean) : [] };
  }
  /** Merge imported entries. Imported entries win on conflicts. */
  function mergeEntries(store, entries) { const next = Object.assign({}, store); entries.forEach((e) => { next[e.date] = e; }); return next; }

  /* ---------- Demo data ---------- */
  function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
  /** Generates `days` of plausible demo entries ending at endKey, flagged demo:true. Never overwrites real entries. */
  function demoEntries(endKey, days = 120, seed = 42) {
    const r = rng(seed), out = [];
    for (let i = days - 1; i >= 0; i--) {
      const skip = r() < 0.12; if (skip && i > 10) continue; // some missed days, like real life (recent days kept so the streak shows)
      const k = addDays(endKey, -i), dow = parseKey(k).getDay(), tags = [];
      if (r() < 0.45) tags.push('walk');
      if (r() < 0.3) tags.push('workout');
      if (r() < 0.55) tags.push('sleep well');
      if (r() < (dow === 5 || dow === 6 ? 0.6 : 0.25)) tags.push('social');
      if (dow >= 1 && dow <= 5 && r() < 0.35) tags.push('work stress');
      if (r() < 0.3) tags.push('study');
      if (r() < 0.25) tags.push('outdoors');
      if (r() < 0.5) tags.push('caffeine');
      if (r() < 0.35) tags.push('screen-heavy');
      let m = 3 + (r() - 0.5) * 1.6;
      if (tags.includes('walk')) m += 0.6; if (tags.includes('sleep well')) m += 0.5; if (tags.includes('social')) m += 0.4;
      if (tags.includes('outdoors')) m += 0.3; if (tags.includes('work stress')) m -= 0.9; if (tags.includes('screen-heavy')) m -= 0.4;
      if (dow === 1) m -= 0.3; if (dow === 6) m += 0.3;
      let en = m + (r() - 0.5) * 1.4 + (tags.includes('workout') ? 0.4 : 0) + (tags.includes('caffeine') ? 0.3 : 0) - (tags.includes('sleep well') ? 0 : 0.4);
      const clamp = (x) => Math.max(1, Math.min(5, Math.round(x)));
      out.push({ date: k, mood: clamp(m), energy: clamp(en), tags, note: '', demo: true });
    }
    return out;
  }
  function addDemo(store, endKey, days, seed) { const next = Object.assign({}, store); demoEntries(endKey, days, seed).forEach((e) => { if (!next[e.date]) next[e.date] = e; }); return next; }
  function removeDemo(store) { const next = {}; Object.values(store).forEach((e) => { if (!e.demo) next[e.date] = e; }); return next; }
  function hasDemo(store) { return Object.values(store).some((e) => e.demo); }

  /** Reminder is due if enabled, the time has passed today, today isn't logged, and we haven't reminded today. */
  function reminderDue(settings, store, now) {
    if (!settings || !settings.reminder || !settings.reminderTime) return false;
    const today = dateKey(now); if (store[today] || settings.lastReminded === today) return false;
    const [h, m] = settings.reminderTime.split(':').map(Number);
    return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
  }

  return { DEFAULT_TAGS, MOODS, ENERGY, WEEKDAYS, MONTHS, MIN_SAMPLE, dateKey, parseKey, isValidKey, addDays, daysInMonth, normalizeEntry, upsert, sortedEntries,
    currentStreak, longestStreak, average, tagInsights, describeTagInsight, weekdayAverages, trendSeries, periodCompare, weekStart, bestWorstWeeks,
    yearGrid, monthMatrix, yearsWithData, toCSV, fromCSV, parseCSVRows, toJSON, fromJSON, mergeEntries, demoEntries, addDemo, removeDemo, hasDemo, reminderDue, cleanTag };
});
