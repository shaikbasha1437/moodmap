/* MoodMap UI. All data lives in localStorage on this device. */
(function () {
  'use strict';
  const C = window.MoodCore;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const KEY = 'moodmap.entries', SKEY = 'moodmap.settings';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v && typeof v === 'object' ? v : d; } catch (e) { return d; } }
  let store = {};
  Object.values(load(KEY, {})).forEach((e) => { const n = C.normalizeEntry(e); if (n) store[n.date] = n; });
  const settings = Object.assign({ theme: 'auto', customTags: [], hiddenTags: [], reminder: false, reminderTime: '20:00', lastReminded: null, passHash: null, passSalt: null }, load(SKEY, {}));
  function saveStore() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { toast('Could not save — browser storage is full or blocked.'); } }
  function saveSettings() { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (e) {} }

  const today = () => C.dateKey(new Date());
  const ui = { tab: 'today', date: today(), mood: null, energy: null, tags: new Set(), metric: 'mood', year: new Date().getFullYear(), month: new Date().getMonth(), range: 30, dirty: false };

  function colorFor(metric, v) { return v ? `var(--${metric === 'energy' ? 'e' : 'm'}${v})` : 'var(--empty)'; }
  function fmtDate(k, opts = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) { return C.parseKey(k).toLocaleDateString(undefined, opts); }
  let toastT; function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

  /* ---------- Theme ---------- */
  function applyTheme() { if (settings.theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = settings.theme; }
  $('#themeBtn').addEventListener('click', () => {
    const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    settings.theme = dark ? 'light' : 'dark'; applyTheme(); saveSettings();
  });

  /* ---------- Tabs ---------- */
  function showTab(name) {
    ui.tab = name;
    $$('.tab').forEach((b) => { const on = b.dataset.tab === name; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
    render();
  }
  $$('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $$('[data-goto]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); showTab(a.dataset.goto); setTimeout(() => $('#about').scrollIntoView({ behavior: 'smooth' }), 50); }));

  /* ---------- Check-in ---------- */
  function buildPicker(el, list, metric) {
    el.innerHTML = list.map((o) => `<button type="button" role="radio" aria-checked="false" data-v="${o.v}" style="--c:${colorFor(metric, o.v)}" title="${o.label}"><span class="em">${o.emoji}</span><span class="lb">${o.label}</span></button>`).join('');
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const v = Number(b.dataset.v); ui[metric] = ui[metric] === v && metric === 'energy' ? null : v; ui.dirty = true; syncPickers();
    });
  }
  buildPicker($('#moodPick'), C.MOODS, 'mood');
  buildPicker($('#energyPick'), C.ENERGY, 'energy');
  function syncPickers() {
    [['#moodPick', 'mood'], ['#energyPick', 'energy']].forEach(([s, m]) => $$('button', $(s)).forEach((b) => { const on = Number(b.dataset.v) === ui[m]; b.classList.toggle('sel', on); b.setAttribute('aria-checked', on); }));
    $('#saveBtn').disabled = !ui.mood;
  }
  function allTags() {
    const used = new Set(); Object.values(store).forEach((e) => e.tags.forEach((t) => used.add(t)));
    const list = C.DEFAULT_TAGS.concat(settings.customTags.filter((t) => !C.DEFAULT_TAGS.includes(t)));
    ui.tags.forEach((t) => { if (!list.includes(t)) list.push(t); });
    return list.filter((t) => !settings.hiddenTags.includes(t) || ui.tags.has(t));
  }
  function renderTags() {
    $('#tagPick').innerHTML = allTags().map((t) => `<button type="button" class="tag${ui.tags.has(t) ? ' sel' : ''}" data-tag="${esc(t)}" aria-pressed="${ui.tags.has(t)}">${esc(t)}</button>`).join('');
  }
  $('#tagPick').addEventListener('click', (e) => { const b = e.target.closest('.tag'); if (!b) return; const t = b.dataset.tag; ui.tags.has(t) ? ui.tags.delete(t) : ui.tags.add(t); ui.dirty = true; renderTags(); });
  $('#addTagForm').addEventListener('submit', (e) => {
    e.preventDefault(); const t = C.cleanTag($('#newTag').value); if (!t) return;
    if (!C.DEFAULT_TAGS.includes(t) && !settings.customTags.includes(t)) settings.customTags.push(t);
    settings.hiddenTags = settings.hiddenTags.filter((x) => x !== t); saveSettings();
    ui.tags.add(t); ui.dirty = true; $('#newTag').value = ''; renderTags(); renderCustomTags();
  });
  $('#ciNote').addEventListener('input', () => { ui.dirty = true; });

  function loadDay(k) {
    ui.date = k; const e = store[k];
    ui.mood = e ? e.mood : null; ui.energy = e ? e.energy : null; ui.tags = new Set(e ? e.tags : []); $('#ciNote').value = e ? e.note : ''; ui.dirty = false;
    $('#ciDate').value = k; $('#ciDate').max = today();
    $('#ciTitle').textContent = k === today() ? (e ? 'Today’s check-in' : 'How are you today?') : fmtDate(k, { weekday: 'long', month: 'short', day: 'numeric' });
    $('#saveBtn').textContent = e ? 'Update check-in' : 'Save check-in';
    $('#clearDayBtn').hidden = !e; $('#saveMsg').textContent = e && e.demo ? 'This is a demo entry. Saving makes it yours.' : '';
    $('#nextDay').disabled = k >= today();
    syncPickers(); renderTags();
  }
  $('#ciDate').addEventListener('change', (e) => { const k = e.target.value; if (C.isValidKey(k) && k <= today()) loadDay(k); else e.target.value = ui.date; });
  $('#prevDay').addEventListener('click', () => loadDay(C.addDays(ui.date, -1)));
  $('#nextDay').addEventListener('click', () => { if (ui.date < today()) loadDay(C.addDays(ui.date, 1)); });
  $('#saveBtn').addEventListener('click', () => {
    if (!ui.mood) return;
    store = C.upsert(store, { date: ui.date, mood: ui.mood, energy: ui.energy, tags: Array.from(ui.tags), note: $('#ciNote').value.trim(), updated: Date.now() });
    saveStore(); const k = ui.date; loadDay(k);
    $('#saveMsg').textContent = 'Saved ✓'; toast(k === today() ? 'Checked in for today 🌱' : 'Saved ' + fmtDate(k, { month: 'short', day: 'numeric' }));
    renderBadges(); renderQuick();
  });
  $('#clearDayBtn').addEventListener('click', () => confirmBox('Delete the check-in for ' + fmtDate(ui.date) + '?', false, () => {
    const next = Object.assign({}, store); delete next[ui.date]; store = next; saveStore(); loadDay(ui.date); renderBadges(); renderQuick(); toast('Day deleted');
  }));
  document.addEventListener('keydown', (e) => {
    if (ui.tab !== 'today' || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[1-5]$/.test(e.key)) { ui.mood = Number(e.key); ui.dirty = true; syncPickers(); }
    else if (e.key === 'Enter' && ui.mood) $('#saveBtn').click();
  });

  function renderQuick() {
    const list = C.sortedEntries(store), last7 = C.periodCompare(store, today(), 7, 'mood');
    $('#quickStats').innerHTML = [
      [C.currentStreak(store, today()), 'day streak'], [list.length, 'days logged'],
      [last7.current == null ? '—' : last7.current.toFixed(1), '7-day mood'], [C.average(list, 'energy') == null ? '—' : C.average(list, 'energy').toFixed(1), 'avg energy'],
    ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  }
  function renderBadges() {
    const s = C.currentStreak(store, today()); $('#streakBadge').textContent = '🔥 ' + s; $('#streakBadge').title = s + '-day check-in streak';
    const demo = C.hasDemo(store); $('#demoFlag').hidden = !demo; $('#removeDemoBtn').hidden = !demo; $('#demoBtn').hidden = demo;
  }

  /* ---------- Metric toggles ---------- */
  $$('.metric-toggle').forEach((g) => g.addEventListener('click', (e) => { const b = e.target.closest('.seg-btn'); if (!b) return; ui.metric = b.dataset.metric; render(); }));
  function syncMetricButtons() { $$('.metric-toggle .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.metric === ui.metric)); }

  /* ---------- Year in pixels ---------- */
  function renderYear() {
    const years = C.yearsWithData(store, new Date().getFullYear()); if (!years.includes(ui.year)) years.push(ui.year); years.sort();
    $('#yearSel').innerHTML = years.map((y) => `<option${y === ui.year ? ' selected' : ''}>${y}</option>`).join('');
    const grid = C.yearGrid(store, ui.year, ui.metric), t = today(), list = C.MONTHS;
    let h = '<div></div>'; for (let d = 1; d <= 31; d++) h += `<div class="hd">${d % 5 === 1 || d === 31 ? d : ''}</div>`;
    grid.forEach((row, m) => {
      h += `<div class="mo">${list[m].slice(0, 3)}</div>`;
      row.forEach((c) => {
        if (!c) { h += '<span class="px none" aria-hidden="true"></span>'; return; }
        const fut = c.date > t, cls = ['px', fut ? 'future' : '', c.date === t ? 'today' : '', c.entry && c.entry.demo ? 'demo' : ''].join(' ');
        const lab = fmtDate(c.date, { month: 'short', day: 'numeric' }) + (c.entry ? ` — mood ${c.entry.mood}${c.entry.energy ? ', energy ' + c.entry.energy : ''}` : ' — no check-in');
        h += `<button class="${cls}" data-date="${c.date}" style="background-color:${colorFor(ui.metric, c.value)}" title="${lab}" aria-label="${lab}"${fut ? ' disabled' : ''}></button>`;
      });
    });
    $('#yearGrid').innerHTML = h;
    const opts = ui.metric === 'energy' ? C.ENERGY : C.MOODS;
    $('#legend').innerHTML = opts.map((o) => `<span><i style="background:${colorFor(ui.metric, o.v)}"></i>${o.label}</span>`).join('') + '<span><i style="background:var(--empty)"></i>No check-in</span>';
    const inYear = C.sortedEntries(store).filter((e) => e.date.startsWith(ui.year + '-')), avg = C.average(inYear, ui.metric);
    $('#yearSummary').textContent = inYear.length ? `${inYear.length} check-ins in ${ui.year} · average ${ui.metric} ${avg == null ? '—' : avg.toFixed(1)} / 5 · tap a pixel to see or edit a day` : `No check-ins in ${ui.year} yet.`;
  }
  $('#yearSel').addEventListener('change', (e) => { ui.year = Number(e.target.value); renderYear(); });
  $('#yearPrev').addEventListener('click', () => { ui.year--; renderYear(); });
  $('#yearNext').addEventListener('click', () => { ui.year++; renderYear(); });
  $('#yearGrid').addEventListener('click', (e) => { const b = e.target.closest('button.px'); if (b) openDay(b.dataset.date); });

  /* ---------- Month calendar ---------- */
  function renderMonth() {
    $('#monthTitle').textContent = C.MONTHS[ui.month] + ' ' + ui.year;
    const t = today(), opts = ui.metric === 'energy' ? C.ENERGY : C.MOODS;
    let h = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="hd">${d}</div>`).join('');
    C.monthMatrix(ui.year, ui.month).forEach((w) => w.forEach((k) => {
      if (!k) { h += '<div class="day blank"></div>'; return; }
      const e = store[k], v = e ? e[ui.metric] : null, fut = k > t;
      h += `<button class="day${fut ? ' future' : ''}${k === t ? ' today' : ''}" data-date="${k}" style="background:${colorFor(ui.metric, v)}"${fut ? ' disabled' : ''} aria-label="${fmtDate(k)}${e ? ', mood ' + e.mood : ', no check-in'}"><span class="n">${Number(k.slice(8))}</span><span class="e">${v ? opts[v - 1].emoji : ''}</span></button>`;
    }));
    $('#monthCal').innerHTML = h;
    const prefix = ui.year + '-' + String(ui.month + 1).padStart(2, '0') + '-', inM = C.sortedEntries(store).filter((e) => e.date.startsWith(prefix));
    const avg = C.average(inM, ui.metric);
    $('#monthSummary').textContent = inM.length ? `${inM.length} check-ins · average ${ui.metric} ${avg == null ? '—' : avg.toFixed(1)} / 5` : 'No check-ins this month.';
  }
  $('#monthPrev').addEventListener('click', () => { if (--ui.month < 0) { ui.month = 11; ui.year--; } renderMonth(); });
  $('#monthNext').addEventListener('click', () => { if (++ui.month > 11) { ui.month = 0; ui.year++; } renderMonth(); });
  $('#monthCal').addEventListener('click', (e) => { const b = e.target.closest('button.day'); if (b) openDay(b.dataset.date); });

  /* ---------- Day dialog ---------- */
  function openDay(k) {
    const e = store[k], dlg = $('#dayDialog');
    if (!e) { $('#dayBody').innerHTML = `<h3>${fmtDate(k)}</h3><p class="muted">No check-in for this day.</p>`; $('#dayEdit').textContent = 'Add check-in'; }
    else {
      const m = C.MOODS[e.mood - 1], en = e.energy ? C.ENERGY[e.energy - 1] : null;
      $('#dayBody').innerHTML = `<h3>${fmtDate(k)}${e.demo ? ' <span class="badge demo">demo</span>' : ''}</h3>
        <div class="dlg-head"><div class="sw" style="background:${colorFor('mood', e.mood)}">${m.emoji}</div><div><b>Mood: ${m.label}</b> (${e.mood}/5)<br><span class="muted">Energy: ${en ? en.emoji + ' ' + en.label + ' (' + e.energy + '/5)' : '—'}</span></div></div>
        ${e.tags.length ? `<div class="tags">${e.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        ${e.note ? `<p>${esc(e.note)}</p>` : ''}`;
      $('#dayEdit').textContent = 'Edit this day';
    }
    dlg.dataset.date = k;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function closeDlg(d) { if (d.close) d.close(); else d.removeAttribute('open'); }
  $('#dayClose').addEventListener('click', () => closeDlg($('#dayDialog')));
  $('#dayEdit').addEventListener('click', () => { const k = $('#dayDialog').dataset.date; closeDlg($('#dayDialog')); showTab('today'); loadDay(k); });

  /* ---------- Insights ---------- */
  function renderInsights() {
    const list = C.sortedEntries(store), m = ui.metric, word = m === 'energy' ? 'energy' : 'mood';
    const tagIns = C.tagInsights(list, m);
    const enough = list.length >= C.MIN_SAMPLE * 2;
    $('#insightsEmpty').hidden = enough; $('#insightsBody').hidden = !enough;
    if (!enough) return;
    // Trend
    $$('.small-seg .seg-btn').forEach((b) => b.classList.toggle('active', Number(b.dataset.range) === ui.range));
    const series = C.trendSeries(store, today(), ui.range, m, ui.range === 7 ? 3 : 7);
    $('#trendChart').innerHTML = trendSVG(series, m);
    const cmp = C.periodCompare(store, today(), ui.range, m);
    $('#trendText').textContent = cmp.current == null ? `No ${word} entries in the last ${ui.range} days.` :
      `Last ${ui.range} days: average ${word} ${cmp.current.toFixed(1)} (${cmp.currentCount} check-ins)` + (cmp.change == null ? '.' : `, ${cmp.change > 0 ? 'up' : cmp.change < 0 ? 'down' : 'no change'}${cmp.change ? ' ' + Math.abs(cmp.change).toFixed(1) : ''} vs the ${ui.range} days before.`) + ` Line = ${ui.range === 7 ? '3' : '7'}-day rolling average.`;
    // Tags
    const avg = C.average(list, m);
    $('#tagInsights').innerHTML = tagIns.length ? tagIns.map((i) => {
      const w = Math.min(100, Math.abs(i.diff) / 2 * 100), pos = i.diff >= 0;
      return `<li><span class="bar"><i style="left:${pos ? 50 : 50 - w / 2}%;width:${w / 2}%;background:${pos ? 'var(--m5)' : 'var(--m1)'}"></i></span><span class="t">${esc(C.describeTagInsight(i, m))}</span><span class="n">${i.withCount} vs ${i.withoutCount} days</span></li>`;
    }).join('') : `<li class="muted">Not enough data yet. A tag needs at least ${C.MIN_SAMPLE} days with it and ${C.MIN_SAMPLE} days without before it's compared.</li>`;
    // Weekday
    const wd = C.weekdayAverages(list, m), order = [1, 2, 3, 4, 5, 6, 0];
    $('#weekdayChart').innerHTML = order.map((i) => { const d = wd[i]; return `<div class="wd"><span>${d.day.slice(0, 3)}</span><span class="track"><span class="fill" style="width:${d.avg ? d.avg / 5 * 100 : 0}%;background:${colorFor(m, d.avg ? Math.round(d.avg) : 0)}"></span></span><span>${d.count >= C.MIN_SAMPLE ? d.avg.toFixed(1) : '<span class="muted">—</span>'}</span></div>`; }).join('')
      + (() => { const ok = wd.filter((d) => d.count >= C.MIN_SAMPLE); if (ok.length < 2) return '<p class="muted tiny">Weekday averages show once a weekday has 3+ entries.</p>'; const b = ok.reduce((a, c) => (c.avg > a.avg ? c : a)); return `<p class="muted small">${b.day}s tend to be your highest-${word} day so far (avg ${b.avg.toFixed(1)}${avg == null ? "" : " vs " + avg.toFixed(1) + " overall"}).</p>`; })();
    // Streaks & weeks
    const bw = C.bestWorstWeeks(list, m), wk = (w) => w ? `${fmtDate(w.start, { month: 'short', day: 'numeric' })}–${fmtDate(w.end, { month: 'short', day: 'numeric' })}` : '—';
    $('#weekStats').innerHTML = [
      [C.currentStreak(store, today()), 'current streak (days)'], [C.longestStreak(store), 'longest streak'],
      [bw.best ? bw.best.avg.toFixed(1) : '—', 'best week · ' + wk(bw.best)], [bw.worst ? bw.worst.avg.toFixed(1) : '—', 'toughest week · ' + wk(bw.worst)],
    ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  }
  function trendSVG(series, metric) {
    const W = 600, H = 170, L = 26, R = 8, T = 10, B = 22, n = series.length;
    const x = (i) => L + (n === 1 ? 0 : i * (W - L - R) / (n - 1)), y = (v) => T + (5 - v) * (H - T - B) / 4;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${metric} trend">`;
    for (let v = 1; v <= 5; v++) s += `<line class="ax" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="lbl" x="4" y="${y(v) + 3}">${v}</text>`;
    series.forEach((p, i) => { if (p.value != null) s += `<circle cx="${x(i)}" cy="${y(p.value)}" r="3.5" fill="${colorFor(metric, p.value)}" opacity=".9"><title>${p.date}: ${p.value}</title></circle>`; });
    let d = '', pen = false; series.forEach((p, i) => { if (p.rolling == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.rolling).toFixed(1) + ' '; pen = true; });
    if (d) s += `<path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    [0, Math.floor((n - 1) / 2), n - 1].forEach((i) => { s += `<text class="lbl" x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${fmtDate(series[i].date, { month: 'short', day: 'numeric' })}</text>`; });
    return s + '</svg>';
  }
  $$('.small-seg .seg-btn').forEach((b) => b.addEventListener('click', () => { ui.range = Number(b.dataset.range); renderInsights(); }));

  /* ---------- Demo / data ---------- */
  function loadDemo() {
    store = C.addDemo(store, C.addDays(today(), -1), 150, Date.now() % 100000); saveStore(); renderBadges(); render();
    toast('Demo data added — remove it any time in Settings');
  }
  $$('[data-action=demo]').forEach((b) => b.addEventListener('click', () => { loadDemo(); if (ui.tab === 'settings') showTab('insights'); }));
  $('#removeDemoBtn').addEventListener('click', () => { const n = Object.keys(store).length; store = C.removeDemo(store); saveStore(); renderBadges(); render(); loadDay(ui.date); toast(`Removed ${n - Object.keys(store).length} demo entries`); });
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  $('#expJson').addEventListener('click', () => download(`moodmap-${today()}.json`, C.toJSON(store, settings.customTags), 'application/json'));
  $('#expCsv').addEventListener('click', () => download(`moodmap-${today()}.csv`, C.toCSV(store), 'text/csv'));
  $('#importFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const text = await f.text(), isCsv = /\.csv$/i.test(f.name) || !/^\s*[\[{]/.test(text);
      const res = isCsv ? C.fromCSV(text) : C.fromJSON(text);
      if (!res.entries.length) throw new Error('No valid entries found');
      store = C.mergeEntries(store, res.entries); saveStore();
      (res.customTags || []).forEach((t) => { if (!settings.customTags.includes(t) && !C.DEFAULT_TAGS.includes(t)) settings.customTags.push(t); }); saveSettings();
      $('#dataMsg').textContent = `Imported ${res.entries.length} entries${res.skipped ? `, skipped ${res.skipped} invalid rows` : ''}.`;
      renderBadges(); render(); loadDay(ui.date); renderCustomTags();
    } catch (err) { $('#dataMsg').textContent = 'Import failed: ' + err.message; }
  });
  $('#deleteAll').addEventListener('click', () => confirmBox('Delete ALL check-ins and settings from this browser? This cannot be undone. Export first if you want a backup.', true, () => {
    localStorage.removeItem(KEY); localStorage.removeItem(SKEY); store = {};
    Object.assign(settings, { customTags: [], hiddenTags: [], reminder: false, lastReminded: null, passHash: null, passSalt: null });
    renderBadges(); render(); loadDay(today()); renderCustomTags(); syncSettingsUI(); $('#dataMsg').textContent = 'All data deleted.';
  }));
  function confirmBox(text, typed, onYes) {
    const d = $('#confirmDialog'); $('#confirmText').textContent = text; const inp = $('#confirmInput'); inp.hidden = !typed; inp.value = '';
    $('#confirmYes').onclick = () => { if (typed && inp.value.trim().toUpperCase() !== 'DELETE') { inp.focus(); return; } closeDlg(d); onYes(); };
    $('#confirmNo').onclick = () => closeDlg(d);
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }
  function renderCustomTags() {
    const el = $('#customTagList');
    el.innerHTML = settings.customTags.length ? settings.customTags.map((t) => `<button class="tag" data-tag="${esc(t)}" title="Remove from picker">${esc(t)}<span class="x">✕</span></button>`).join('') : '<span class="muted small">None yet — add one from the check-in screen.</span>';
  }
  $('#customTagList').addEventListener('click', (e) => { const b = e.target.closest('.tag'); if (!b) return; settings.customTags = settings.customTags.filter((t) => t !== b.dataset.tag); saveSettings(); renderCustomTags(); renderTags(); });

  /* ---------- Reminder ---------- */
  function syncSettingsUI() { $('#remOn').checked = !!settings.reminder; $('#remTime').value = settings.reminderTime || '20:00'; $('#passOff').hidden = !settings.passHash; }
  $('#remOn').addEventListener('change', async (e) => {
    if (e.target.checked) {
      if (!('Notification' in window)) { $('#remMsg').textContent = 'This browser does not support notifications.'; e.target.checked = false; return; }
      const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (p !== 'granted') { $('#remMsg').textContent = 'Notifications are blocked for this site. Allow them in your browser settings to use reminders.'; e.target.checked = false; return; }
      $('#remMsg').textContent = 'Reminder on. Keep MoodMap open in a tab.';
    } else $('#remMsg').textContent = 'Reminder off.';
    settings.reminder = e.target.checked; saveSettings();
  });
  $('#remTime').addEventListener('change', (e) => { settings.reminderTime = e.target.value; settings.lastReminded = null; saveSettings(); });
  function checkReminder() {
    if (!C.reminderDue(settings, store, new Date()) || !('Notification' in window) || Notification.permission !== 'granted') return;
    settings.lastReminded = today(); saveSettings();
    try { const n = new Notification('MoodMap check-in', { body: 'How was today? It takes 10 seconds.', icon: 'icon.svg', tag: 'moodmap-daily' }); n.onclick = () => { window.focus(); showTab('today'); loadDay(today()); n.close(); }; } catch (e) {}
  }
  setInterval(checkReminder, 30000);

  /* ---------- Passcode ---------- */
  async function hash(pass, salt) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pass));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  $('#passForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const p = $('#passNew').value;
    if (p.length < 4) { $('#passMsg').textContent = 'Use at least 4 characters.'; return; }
    if (!(window.crypto && crypto.subtle)) { $('#passMsg').textContent = 'Passcodes need a secure (https) page.'; return; }
    settings.passSalt = Array.from(crypto.getRandomValues(new Uint8Array(8))).map((b) => b.toString(16)).join('');
    settings.passHash = await hash(p, settings.passSalt); saveSettings(); $('#passNew').value = '';
    $('#passMsg').textContent = 'Passcode set. MoodMap will ask for it next time it opens. If you forget it, you\'ll need to clear this site\'s data.'; syncSettingsUI();
  });
  $('#passOff').addEventListener('click', () => { settings.passHash = settings.passSalt = null; saveSettings(); syncSettingsUI(); $('#passMsg').textContent = 'Passcode removed.'; });
  $('#lockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await hash($('#lockInput').value, settings.passSalt) === settings.passHash) { $('#lock').hidden = true; $('#lockInput').value = ''; }
    else { $('#lockMsg').textContent = 'That passcode didn\'t match.'; $('#lockInput').select(); }
  });

  /* ---------- Render ---------- */
  function render() {
    syncMetricButtons();
    if (ui.tab === 'today') renderQuick();
    if (ui.tab === 'year') renderYear();
    if (ui.tab === 'month') renderMonth();
    if (ui.tab === 'insights') renderInsights();
  }
  // Keep "today" correct across midnight when the tab stays open.
  let lastToday = today();
  setInterval(() => { const t = today(); if (t !== lastToday) { if (ui.date === lastToday && !ui.dirty) loadDay(t); lastToday = t; renderBadges(); render(); } }, 60000);

  applyTheme();
  if (settings.passHash && window.crypto && crypto.subtle) { $('#lock').hidden = false; setTimeout(() => $('#lockInput').focus(), 50); }
  syncSettingsUI(); renderCustomTags(); loadDay(today()); renderBadges(); render();
  if (location.hash === '#about') showTab('settings');
  if ('serviceWorker' in navigator && location.protocol !== 'file:') window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

  window.MoodMap = { get store() { return store; }, settings, ui, showTab, loadDay, openDay };
})();
