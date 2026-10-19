const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const mk = (date, mood, energy = null, tags = [], extra = {}) => Object.assign({ date, mood, energy, tags, note: '' }, extra);
const storeOf = (list) => list.reduce((s, e) => C.upsert(s, e), {});

test('dateKey uses local date and round-trips', () => {
  assert.equal(C.dateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(C.dateKey(C.parseKey('2024-02-29')), '2024-02-29');
  assert.ok(C.isValidKey('2024-02-29'));
  assert.ok(!C.isValidKey('2025-02-29'));
  assert.ok(!C.isValidKey('2025-13-01'));
  assert.equal(C.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(C.addDays('2026-12-31', 1), '2027-01-01');
});

test('normalizeEntry validates mood, energy and tags', () => {
  assert.equal(C.normalizeEntry({ date: '2026-10-01', mood: 0 }), null);
  assert.equal(C.normalizeEntry({ date: '2026-10-01', mood: 6 }), null);
  assert.equal(C.normalizeEntry({ date: 'bad', mood: 3 }), null);
  const n = C.normalizeEntry({ date: '2026-10-01', mood: '4', energy: 9, tags: [' Walk ', 'walk', 'Sleep  Well', ''] });
  assert.deepEqual(n, { date: '2026-10-01', mood: 4, energy: null, tags: ['walk', 'sleep well'], note: '' });
});

test('upsert keeps one entry per day and edits replace', () => {
  let s = C.upsert({}, mk('2026-10-01', 2));
  s = C.upsert(s, mk('2026-10-01', 5, 4));
  assert.equal(Object.keys(s).length, 1);
  assert.equal(s['2026-10-01'].mood, 5);
  assert.throws(() => C.upsert(s, { date: '2026-10-02', mood: 9 }));
});

test('currentStreak counts back from today, or from yesterday if today is not logged', () => {
  const s = storeOf([mk('2026-10-15', 3), mk('2026-10-16', 3), mk('2026-10-17', 3), mk('2026-10-18', 3)]);
  assert.equal(C.currentStreak(s, '2026-10-18'), 4);
  assert.equal(C.currentStreak(s, '2026-10-19'), 4); // today not logged yet: streak still alive
  assert.equal(C.currentStreak(s, '2026-10-20'), 0); // missed yesterday
  assert.equal(C.currentStreak({}, '2026-10-20'), 0);
});

test('currentStreak crosses month and year boundaries', () => {
  const s = storeOf([mk('2025-12-30', 3), mk('2025-12-31', 3), mk('2026-01-01', 3)]);
  assert.equal(C.currentStreak(s, '2026-01-01'), 3);
});

test('longestStreak finds the longest run', () => {
  const s = storeOf([mk('2026-01-01', 3), mk('2026-01-02', 3), mk('2026-01-04', 3), mk('2026-01-05', 3), mk('2026-01-06', 3), mk('2026-02-28', 1)]);
  assert.equal(C.longestStreak(s), 3);
  assert.equal(C.longestStreak({}), 0);
});

test('tagInsights compares with vs without and respects the minimum sample', () => {
  const list = [
    mk('2026-10-01', 5, 4, ['walk']), mk('2026-10-02', 4, 4, ['walk']), mk('2026-10-03', 5, 3, ['walk']),
    mk('2026-10-04', 3, 2, []), mk('2026-10-05', 2, 2, []), mk('2026-10-06', 3, 3, ['coffee']), mk('2026-10-07', 4, 3, ['coffee']),
  ];
  const ins = C.tagInsights(list, 'mood');
  assert.equal(ins.length, 1); // coffee has only 2 days
  assert.equal(ins[0].tag, 'walk');
  assert.equal(ins[0].withAvg, 4.7);
  assert.equal(ins[0].withoutAvg, 3);
  assert.equal(ins[0].diff, 1.7);
  assert.match(C.describeTagInsight(ins[0]), /tends to be higher on days with “walk”: \+1\.7 vs other days/);
  assert.equal(C.tagInsights(list.slice(0, 5), 'mood').length, 0); // only 2 days without walk
});

test('describeTagInsight uses correlational, non-medical wording', () => {
  const all = [{ tag: 'x', diff: 1 }, { tag: 'x', diff: -1 }, { tag: 'x', diff: 0.1 }].map((i) => C.describeTagInsight(i, 'energy'));
  all.forEach((t) => assert.doesNotMatch(t, /cause|because|improve|treat|depress|diagnos/i));
  assert.match(all[1], /lower.*−1\.0/);
  assert.match(all[2], /about the same/);
});

test('tagInsights for energy ignores entries without energy', () => {
  const list = [1, 2, 3, 4, 5, 6].map((d) => mk('2026-10-0' + d, 3, d <= 3 ? 5 : null, d <= 3 ? ['gym'] : []));
  assert.equal(C.tagInsights(list, 'energy').length, 0); // no "without" days have energy
});

test('weekdayAverages buckets by local weekday', () => {
  // 2026-10-19 is a Monday
  const wd = C.weekdayAverages([mk('2026-10-19', 2), mk('2026-10-26', 4), mk('2026-10-24', 5)]);
  assert.equal(wd[1].day, 'Monday'); assert.equal(wd[1].avg, 3); assert.equal(wd[1].count, 2);
  assert.equal(wd[6].avg, 5); assert.equal(wd[0].avg, null);
});

test('trendSeries and periodCompare', () => {
  const s = storeOf([mk('2026-10-13', 1), mk('2026-10-17', 3), mk('2026-10-18', 4), mk('2026-10-19', 5)]);
  const t = C.trendSeries(s, '2026-10-19', 7, 'mood', 3);
  assert.equal(t.length, 7); assert.equal(t[0].date, '2026-10-13'); assert.equal(t[6].value, 5);
  assert.equal(t[6].rolling, 4); assert.equal(t[1].value, null); assert.equal(t[1].rolling, 1);
  const p = C.periodCompare(s, '2026-10-19', 3);
  assert.equal(p.current, 4); assert.equal(p.previous, null); assert.equal(p.change, null);
  const p2 = C.periodCompare(s, '2026-10-19', 4);
  assert.equal(p2.current, 4); assert.equal(p2.previousCount, 1); assert.equal(p2.change, 3);
});

test('bestWorstWeeks uses Monday-start weeks and skips sparse weeks', () => {
  assert.equal(C.weekStart('2026-10-25'), '2026-10-19'); // Sunday belongs to the week starting Monday
  const list = [
    mk('2026-10-05', 5), mk('2026-10-06', 5), mk('2026-10-07', 4),
    mk('2026-10-12', 2), mk('2026-10-13', 1), mk('2026-10-14', 2),
    mk('2026-10-19', 1), // sparse week ignored
  ];
  const r = C.bestWorstWeeks(list);
  assert.equal(r.weeks.length, 2);
  assert.equal(r.best.start, '2026-10-05'); assert.equal(r.best.avg, 4.7);
  assert.equal(r.worst.start, '2026-10-12'); assert.equal(r.worst.end, '2026-10-18');
  assert.equal(C.bestWorstWeeks(list.slice(0, 3)).best, null); // need 2 weeks to compare
});

test('yearGrid is 12x31 with nulls for days that do not exist', () => {
  const s = storeOf([mk('2024-02-29', 4, 2)]);
  const g = C.yearGrid(s, 2024);
  assert.equal(g.length, 12); g.forEach((r) => assert.equal(r.length, 31));
  assert.equal(g[1][28].value, 4); assert.equal(g[1][29], null); assert.equal(g[3][30], null); assert.ok(g[0][30]);
  assert.equal(C.yearGrid(s, 2024, 'energy')[1][28].value, 2);
  assert.equal(C.yearGrid({}, 2025)[1][28], null);
});

test('monthMatrix pads to Monday-start weeks', () => {
  const m = C.monthMatrix(2026, 9); // October 2026 starts on Thursday
  assert.deepEqual(m[0].slice(0, 4), [null, null, null, '2026-10-01']);
  m.forEach((w) => assert.equal(w.length, 7));
  assert.equal(m.flat().filter(Boolean).length, 31);
});

test('CSV export/import round-trips quotes, commas and newlines', () => {
  const s = storeOf([mk('2026-10-01', 4, 3, ['walk', 'social'], { note: 'Said "hi", then\nleft' }), mk('2026-10-02', 2)]);
  const csv = C.toCSV(s);
  const back = C.fromCSV(csv);
  assert.equal(back.skipped, 0);
  assert.deepEqual(back.entries, C.sortedEntries(s));
  const bad = C.fromCSV('date,mood\n2026-10-01,9\n2026-10-02,3\n');
  assert.equal(bad.entries.length, 1); assert.equal(bad.skipped, 1);
  assert.throws(() => C.fromCSV('foo,bar\n1,2'));
});

test('JSON export/import round-trips and merge prefers imported', () => {
  const s = storeOf([mk('2026-10-01', 4, 3, ['walk'])]);
  const back = C.fromJSON(C.toJSON(s, ['piano']));
  assert.deepEqual(back.entries, C.sortedEntries(s)); assert.deepEqual(back.customTags, ['piano']);
  const merged = C.mergeEntries(storeOf([mk('2026-10-01', 1), mk('2026-09-30', 2)]), back.entries);
  assert.equal(merged['2026-10-01'].mood, 4); assert.equal(merged['2026-09-30'].mood, 2);
  assert.equal(C.fromJSON('[{"date":"2026-10-01","mood":3},{"date":"x"}]').skipped, 1);
});

test('demo data is flagged, never overwrites real entries, and removes cleanly', () => {
  const real = storeOf([mk('2026-10-10', 1, 1, [], { note: 'mine' })]);
  const withDemo = C.addDemo(real, '2026-10-18', 90, 7);
  assert.ok(Object.keys(withDemo).length > 60);
  assert.equal(withDemo['2026-10-10'].note, 'mine'); assert.ok(!withDemo['2026-10-10'].demo);
  assert.ok(C.hasDemo(withDemo));
  const ins = C.tagInsights(C.sortedEntries(withDemo));
  assert.ok(ins.length >= 3, 'demo data should be rich enough to produce insights');
  assert.ok(C.currentStreak(withDemo, '2026-10-19') >= 9, 'recent demo days are continuous');
  const cleaned = C.removeDemo(withDemo);
  assert.deepEqual(cleaned, real); assert.ok(!C.hasDemo(cleaned));
  assert.deepEqual(C.demoEntries('2026-10-18', 30, 5), C.demoEntries('2026-10-18', 30, 5)); // deterministic
});

test('reminderDue only fires once, after the set time, when today is not logged', () => {
  const now = new Date(2026, 9, 19, 20, 30), set = { reminder: true, reminderTime: '20:00', lastReminded: null };
  assert.equal(C.reminderDue(set, {}, now), true);
  assert.equal(C.reminderDue(Object.assign({}, set, { reminderTime: '21:00' }), {}, now), false);
  assert.equal(C.reminderDue(Object.assign({}, set, { lastReminded: '2026-10-19' }), {}, now), false);
  assert.equal(C.reminderDue(set, storeOf([mk('2026-10-19', 3)]), now), false);
  assert.equal(C.reminderDue(Object.assign({}, set, { reminder: false }), {}, now), false);
});
