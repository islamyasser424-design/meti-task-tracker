/**
 * build_upgraded_ui.js
 * Enhances the 6 approved analytics pages in dashboard-ui.js with native, database-backed intelligence.
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'dashboard-ui.js');
let code = fs.readFileSync(filePath, 'utf8');

console.log('Original code length:', code.length);

// 1. Ensure normalizeShift & isModPass are present and robust
const helperMarker = 'function maskEmployeeId';
const helperStart = code.indexOf(helperMarker);
if (helperStart === -1) {
  console.error('Could not find maskEmployeeId');
  process.exit(1);
}

// 2. Define the enhanced renderOverview
const newRenderOverview = `function renderOverview(){
  if(root.hidden) return;
  const rows = rowsInView();
  const catSummary = getCategorySummary(rows);
  const activeLabelers = uniq(rows, 'Labeler Name') || 0;
  const activeQtcs = uniq(rows, 'QTC Name') || 0;
  const activeQueues = uniq(rows, 'Queue Name') || 0;
  const totalSubmissions = rows.length;
  const avgSubmit = activeLabelers ? (totalSubmissions / activeLabelers).toFixed(1) : '0';

  const oi = hdrs.findIndex(h => ['object count', 'object_count', 'objects'].includes(h.toLowerCase()));
  const totalObjects = rows.reduce((acc, r) => acc + (parseFloat(oi >= 0 ? r[oi] : 0) || 0), 0);
  const avgObjects = totalSubmissions > 0 ? (totalObjects / totalSubmissions).toFixed(1) : '0';

  const lidarFP = rows.filter(r => isModPass(r, 'lidar', 'FP')).length;
  const lidarQA = rows.filter(r => isModPass(r, 'lidar', 'QA')).length;
  const laneFP = rows.filter(r => isModPass(r, 'laneline', 'FP')).length;
  const laneQA = rows.filter(r => isModPass(r, 'laneline', 'QA')).length;
  const totalQA = lidarQA + laneQA;
  const totalFP = lidarFP + laneFP;
  const totalLidar = lidarFP + lidarQA;
  const totalLane = laneFP + laneQA;
  const qaSharePct = totalSubmissions ? ((totalQA / totalSubmissions) * 100).toFixed(1) + '%' : '0%';

  // Daily submission dates & Cairo growth %
  const dateMap = new Map();
  rows.forEach(r => { const d = rDate(r); if (d) dateMap.set(d, (dateMap.get(d) || 0) + 1); });
  const sortedDates = [...dateMap.keys()].sort();
  const activeDays = Math.max(1, sortedDates.length);
  const queueVelocity = (totalSubmissions / (activeDays * 18)).toFixed(1);

  let growthPct = '0.0';
  let isPositiveGrowth = true;
  if (sortedDates.length >= 2) {
    const latestDate = sortedDates[sortedDates.length - 1];
    const prevDate = sortedDates[sortedDates.length - 2];
    const latestC = dateMap.get(latestDate) || 0;
    const prevC = dateMap.get(prevDate) || 0;
    if (prevC > 0) {
      const g = ((latestC - prevC) / prevC) * 100;
      growthPct = (g >= 0 ? '+' : '') + g.toFixed(1);
      isPositiveGrowth = g >= 0;
    }
  }

  // Today vs Yesterday
  const cToday = cairoToday();
  const cYesterday = _addDays(cToday, -1);
  const todayTasks = dateMap.get(cToday) || 0;
  const yestTasks = dateMap.get(cYesterday) || 0;

  // Last 7 days
  const last7Start = _addDays(cToday, -6);
  let last7Total = 0;
  dateMap.forEach((cnt, d) => { if (d >= last7Start && d <= cToday) last7Total += cnt; });
  const last7Avg = Math.round(last7Total / 7);

  // Top rankings
  const qMap = new Map();
  const qtcMap = new Map();
  const labMap = new Map();
  const qi = hdrs.findIndex(h => h.toLowerCase() === 'queue name');
  const qcI = hdrs.findIndex(h => h.toLowerCase() === 'qtc name');
  const li = hdrs.findIndex(h => h.toLowerCase() === 'labeler name');

  rows.forEach(r => {
    if (qi >= 0 && r[qi]) qMap.set(r[qi], (qMap.get(r[qi]) || 0) + 1);
    if (qcI >= 0 && r[qcI]) qtcMap.set(r[qcI], (qtcMap.get(r[qcI]) || 0) + 1);
    if (li >= 0 && r[li]) labMap.set(r[li], (labMap.get(r[li]) || 0) + 1);
  });

  const topQueues = [...qMap.entries()].sort((a,b) => b[1] - a[1]).slice(0, 10);
  const topQtcs = [...qtcMap.entries()].sort((a,b) => b[1] - a[1]).slice(0, 10);
  const topLabelers = [...labMap.entries()].sort((a,b) => b[1] - a[1]).slice(0, 10);

  // Shift & Floor distribution (Floor = Unit)
  const si = hdrs.findIndex(h => h.toLowerCase() === 'shift');
  const fi = hdrs.findIndex(h => ['floor', 'unit'].includes(h.toLowerCase()));
  const shiftMap = new Map();
  const floorMap = new Map();
  rows.forEach(r => {
    if (si >= 0 && r[si]) shiftMap.set(r[si], (shiftMap.get(r[si]) || 0) + 1);
    if (fi >= 0 && r[fi]) {
      const fl = deriveFloor(r[fi]);
      floorMap.set(fl, (floorMap.get(fl) || 0) + 1);
    }
  });

  // Hourly distribution (00 to 23)
  const tsIdx = hdrs.findIndex(h => ['timestamp', 'created at', 'date'].includes(h.toLowerCase()));
  const hourCounts = new Array(24).fill(0);
  rows.forEach(r => {
    if (tsIdx >= 0 && r[tsIdx]) {
      const m = String(r[tsIdx]).match(/(\\d{1,2}):\\d{2}/);
      if (m) {
        const h = parseInt(m[1], 10);
        if (h >= 0 && h < 24) hourCounts[h]++;
      }
    }
  });
  const maxHour = Math.max(1, ...hourCounts);

  // Daily trend last 21 points
  const last21 = sortedDates.slice(-21).map(d => [d, dateMap.get(d) || 0]);
  const maxDay = Math.max(1, ...last21.map(p => p[1]));

  // Operational Highlights calculations (Part 3.6)
  const workstreamRank = [
    { label: 'Lidar FP', cnt: lidarFP, tone: '#0d9488' },
    { label: 'Lidar QA', cnt: lidarQA, tone: '#14b8a6' },
    { label: 'Lane Line FP', cnt: laneFP, tone: '#ed9a35' },
    { label: 'Lane Line QA', cnt: laneQA, tone: '#ec4899' }
  ].sort((a,b) => b.cnt - a.cnt);
  const topWorkstream = workstreamRank[0] || { label: '—', cnt: 0, tone: '#0d9488' };
  const topShift = [...shiftMap.entries()].sort((a,b) => b[1] - a[1])[0] || ['—', 0];
  const topUnit = [...floorMap.entries()].sort((a,b) => b[1] - a[1])[0] || ['—', 0];
  const avgDaily = activeDays > 0 ? Math.round(totalSubmissions / activeDays) : 0;

  // Largest increase/decrease between consecutive days
  let maxInc = 0, maxIncDate = '—', maxDec = 0, maxDecDate = '—';
  for (let i = 1; i < sortedDates.length; i++) {
    const diff = (dateMap.get(sortedDates[i]) || 0) - (dateMap.get(sortedDates[i-1]) || 0);
    if (diff > maxInc) { maxInc = diff; maxIncDate = sortedDates[i]; }
    if (diff < maxDec) { maxDec = diff; maxDecDate = sortedDates[i]; }
  }

  // 13 Main KPI Cards Definitions (Including Total Objects)
  const kpiDefs = [
    { title: 'Total Submissions', val: totalSubmissions.toLocaleString(), sub: 'Selected period output', tone: '#0d9488' },
    { title: 'Total Objects', val: totalObjects.toLocaleString(), sub: 'Cumulative objects (' + avgObjects + ' avg/task)', tone: '#0284c7' },
    { title: 'Active Labelers', val: activeLabelers.toLocaleString(), sub: 'Unique contributors', tone: '#0a9d8c' },
    { title: 'Active QTCs', val: activeQtcs.toLocaleString(), sub: 'Distinct QA reviewers', tone: '#df8b24' },
    { title: 'Active Queues', val: activeQueues.toLocaleString(), sub: 'Operational queues', tone: '#df5c99' },
    { title: 'Avg Submissions / Labeler', val: avgSubmit, sub: 'Average output per person', tone: '#3b82f6' },
    { title: 'QA Submission Share', val: qaSharePct, sub: 'Volume share · not quality score', tone: '#8b5cf6' },
    { title: 'Lidar FP Submissions', val: lidarFP.toLocaleString(), sub: 'First pass Lidar volume', tone: '#0d9488' },
    { title: 'Lidar QA Submissions', val: lidarQA.toLocaleString(), sub: 'Quality review Lidar volume', tone: '#14b8a6' },
    { title: 'Lane Line FP Submissions', val: laneFP.toLocaleString(), sub: 'First pass Lane Line volume', tone: '#f59e0b' },
    { title: 'Lane Line QA Submissions', val: laneQA.toLocaleString(), sub: 'Quality review Lane Line', tone: '#ec4899' },
    { title: 'Daily Productivity Growth', val: (growthPct + '%'), isGrowth: true, pos: isPositiveGrowth, sub: 'Latest day vs previous day', tone: '#10b981' },
    { title: 'Queue Velocity', val: (queueVelocity + ' /hr'), sub: 'Submissions per operating hr', tone: '#6366f1' }
  ];

  overview.innerHTML = '<div class="ux-heading">'
    + '<div>'
      + '<div class="ux-eyebrow">Enterprise Operations · Executive Intelligence</div>'
      + '<h2>Executive Overview</h2>'
      + '<p>Holistic view of workforce activity, throughput velocity, and modality performance.</p>'
    + '</div>'
    + '<div class="ux-tools">'
      + renderHeaderControlsHTML('ov')
      + '<button class="btn" id="uxCSV">↓ Export CSV</button>'
      + '<button class="btn" id="uxPrint">🖨️ Print Report</button>'
    + '</div>'
  + '</div>'

  + renderUniversalFilterBar('overview')

  // Freshness & Operational Comparison Banner
  + '<div class="ux-panel" style="margin-bottom:20px; padding:14px 20px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:14px; background:var(--bg-2); border-left:4px solid var(--primary);">'
    + '<div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">'
      + '<span style="display:flex; align-items:center; gap:6px; font-weight:700; font-size:12px; color:var(--text);"><span style="color:var(--success); font-size:10px;">🟢</span> Live Turso DB · Africa/Cairo</span>'
      + '<span class="ux-note">Today: <b>' + todayTasks.toLocaleString() + '</b> tasks</span>'
      + '<span class="ux-note">Yesterday: <b>' + yestTasks.toLocaleString() + '</b> tasks</span>'
      + '<span class="ux-note">Last 7 Days: <b>' + last7Total.toLocaleString() + '</b> tasks (~' + last7Avg.toLocaleString() + '/day)</span>'
    + '</div>'
    + '<div style="display:flex; gap:8px;">'
      + '<button class="btn btn-c" id="ovDrilldownBtn" style="font-size:12px; padding:5px 12px;">🔍 Drill-down Records</button>'
      + '<button class="btn" id="uxCompare" style="font-size:12px; padding:5px 12px;">⚖️ Compare Periods</button>'
    + '</div>'
  + '</div>'

  // 13 Main KPI Cards Grid
  + '<div class="ux-grid-12" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:12px;">'
    + kpiDefs.map(k => '<div class="kpi-mini-card" style="--tone:' + k.tone + '">'
      + '<div class="kpi-title"><span>' + esc(k.title) + '</span><span style="color:' + k.tone + '">●</span></div>'
      + (k.isGrowth
        ? '<div style="display:flex; align-items:baseline; gap:8px; margin:8px 0 4px;"><span class="kpi-val" style="margin:0;">' + k.val + '</span><span class="kpi-growth ' + (k.pos ? 'positive' : 'negative') + '">' + (k.pos ? '▲ Growth' : '▼ Decline') + '</span></div>'
        : '<div class="kpi-val">' + k.val + '</div>')
      + '<div class="kpi-sub">' + esc(k.sub) + '</div>'
    + '</div>').join('')
  + '</div>'

  // 4 Workstream Performance Cards
  + renderCategoryCardsHTML(catSummary, '', 'overview')

  // Operational Highlights Panel (Part 3.6)
  + '<div class="ux-panel" style="margin-top:20px; padding:18px 22px; background:var(--bg-2); border-radius:12px; border:1px solid var(--border);">'
    + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px;">'
      + '<h3 style="margin:0; font-size:15px; display:flex; align-items:center; gap:8px;">💡 Operational Highlights &amp; Key Insights</h3>'
      + '<span class="ux-note">Computed from real database activity</span>'
    + '</div>'
    + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">'
      + '<div style="background:var(--bg-3); padding:12px 14px; border-radius:8px; border-left:3px solid ' + topWorkstream.tone + ';">'
        + '<span class="ux-note">Highest-Volume Workstream</span>'
        + '<div style="font-weight:700; font-size:14px; color:var(--text); margin-top:3px;">' + topWorkstream.label + ' (' + topWorkstream.cnt.toLocaleString() + ' tasks)</div>'
      + '</div>'
      + '<div style="background:var(--bg-3); padding:12px 14px; border-radius:8px; border-left:3px solid #3b82f6;">'
        + '<span class="ux-note">Highest-Volume Shift</span>'
        + '<div style="font-weight:700; font-size:14px; color:var(--text); margin-top:3px;">' + esc(topShift[0]) + ' (' + topShift[1].toLocaleString() + ' tasks)</div>'
      + '</div>'
      + '<div style="background:var(--bg-3); padding:12px 14px; border-radius:8px; border-left:3px solid #ed9a35;">'
        + '<span class="ux-note">Highest-Volume Floor / Unit</span>'
        + '<div style="font-weight:700; font-size:14px; color:var(--text); margin-top:3px;">Unit ' + esc(topUnit[0]) + ' (' + topUnit[1].toLocaleString() + ' tasks)</div>'
      + '</div>'
      + '<div style="background:var(--bg-3); padding:12px 14px; border-radius:8px; border-left:3px solid #8b5cf6;">'
        + '<span class="ux-note">Average Daily Submissions</span>'
        + '<div style="font-weight:700; font-size:14px; color:var(--text); margin-top:3px;">' + avgDaily.toLocaleString() + ' tasks / day (' + activeDays + ' active days)</div>'
      + '</div>'
      + (maxInc > 0 ? ('<div style="background:var(--bg-3); padding:12px 14px; border-radius:8px; border-left:3px solid #10b981;">'
        + '<span class="ux-note">Largest Daily Increase</span>'
        + '<div style="font-weight:700; font-size:14px; color:var(--success); margin-top:3px;">+' + maxInc.toLocaleString() + ' on ' + maxIncDate + '</div>'
      + '</div>') : '')
    + '</div>'
  + '</div>'

  // Top Charts Grid: Daily Trend & Hourly Production
  + '<div class="ux-panels" style="margin-top:20px;">'
    // Chart 1: Daily Submission Trend Line (Last 21 active dates)
    + '<section class="ux-panel" style="flex:1.6;">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">'
        + '<div><h3 style="margin:0 0 4px;">📈 Daily Submission Activity (Last 21 Dates)</h3><p style="margin:0;">Recent 21 active dates with task count. Select a bar to filter dashboard.</p></div>'
        + '<span class="ux-note">' + last21.length + ' active days</span>'
      + '</div>'
      + '<div class="ux-bars">'
        + (last21.length
          ? last21.map(([d, c]) => '<button class="ux-bar" style="height:' + Math.max(6, (c / maxDay) * 100) + '%;" data-date="' + d + '" data-count="' + c + '" aria-label="' + d + ': ' + c + ' submissions"></button>').join('')
          : '<div class="ux-empty">No dated submissions in current view.</div>')
      + '</div>'
      + '<div style="display:flex; justify-content:space-between; margin-top:8px; font-size:11px; color:var(--text-soft);">'
        + '<span>' + (last21.length ? last21[0][0] : '') + '</span>'
        + '<span>Peak: ' + maxDay.toLocaleString() + ' tasks</span>'
        + '<span>' + (last21.length ? last21[last21.length - 1][0] : '') + '</span>'
      + '</div>'
    + '</section>'

    // Chart 2: Hourly Production Distribution (00 to 23)
    + '<section class="ux-panel" style="flex:1;">'
      + '<h3>⏱️ Hourly Production (24h Distribution)</h3>'
      + '<p>Submission volume across operating hours of the day.</p>'
      + '<div style="display:flex; align-items:flex-end; gap:2px; height:140px; margin-top:14px; padding-bottom:18px; position:relative; border-bottom:1px solid var(--border);">'
        + hourCounts.map((cnt, h) => '<div title="' + String(h).padStart(2,'0') + ':00 · ' + cnt.toLocaleString() + ' tasks" style="flex:1; height:' + Math.max(3, (cnt / maxHour) * 100) + '%; background:' + (cnt === maxHour ? 'var(--primary)' : 'rgba(13,148,136,0.4)') + '; border-radius:2px 2px 0 0; transition:height 0.2s;"></div>').join('')
      + '</div>'
      + '<div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-soft); margin-top:6px;">'
        + '<span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>'
      + '</div>'
    + '</section>'
  + '</div>'

  // Mid Charts Grid: Workstream Donut, Shift & Floor comparison
  + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-top:20px;">'
    // Chart 3 & 4: Modality & Pass Visual Distribution
    + '<div class="ux-panel">'
      + '<h3>📦 Workstream & Pass Share</h3>'
      + '<p>Distribution across work types and validation stages.</p>'
      + '<div style="display:flex; flex-direction:column; gap:12px; margin-top:14px;">'
        + '<div>'
          + '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><b>Lidar vs Lane Line</b><span>' + (totalSubmissions ? ((totalLidar/totalSubmissions)*100).toFixed(1) : 0) + '% / ' + (totalSubmissions ? ((totalLane/totalSubmissions)*100).toFixed(1) : 0) + '%</span></div>'
          + '<div style="display:flex; height:12px; border-radius:6px; overflow:hidden; background:var(--border);">'
            + '<div style="width:' + (totalSubmissions ? (totalLidar/totalSubmissions)*100 : 50) + '%; background:#0d9488;"></div>'
            + '<div style="width:' + (totalSubmissions ? (totalLane/totalSubmissions)*100 : 50) + '%; background:#ed9a35;"></div>'
          + '</div>'
          + '<div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-soft); margin-top:3px;">'
            + '<span><span style="color:#0d9488">●</span> Lidar: ' + totalLidar.toLocaleString() + '</span>'
            + '<span><span style="color:#ed9a35">●</span> Lane Line: ' + totalLane.toLocaleString() + '</span>'
          + '</div>'
        + '</div>'
        + '<div style="margin-top:6px;">'
          + '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><b>First Pass vs QA</b><span>' + (totalSubmissions ? ((totalFP/totalSubmissions)*100).toFixed(1) : 0) + '% / ' + (totalSubmissions ? ((totalQA/totalSubmissions)*100).toFixed(1) : 0) + '%</span></div>'
          + '<div style="display:flex; height:12px; border-radius:6px; overflow:hidden; background:var(--border);">'
            + '<div style="width:' + (totalSubmissions ? (totalFP/totalSubmissions)*100 : 50) + '%; background:#3b82f6;"></div>'
            + '<div style="width:' + (totalSubmissions ? (totalQA/totalSubmissions)*100 : 50) + '%; background:#8b5cf6;"></div>'
          + '</div>'
          + '<div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-soft); margin-top:3px;">'
            + '<span><span style="color:#3b82f6">●</span> FP: ' + totalFP.toLocaleString() + '</span>'
            + '<span><span style="color:#8b5cf6">●</span> QA: ' + totalQA.toLocaleString() + '</span>'
          + '</div>'
        + '</div>'
      + '</div>'
    + '</div>'

    // Chart 5: Shift Productivity
    + '<div class="ux-panel">'
      + '<h3>☀️ Shift Productivity Comparison</h3>'
      + '<p>Volume of submissions contributed by each shift.</p>'
      + '<div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">'
        + ([...shiftMap.entries()].sort((a,b)=>b[1]-a[1]).map(([s, cnt]) => {
          const maxS = Math.max(1, ...shiftMap.values());
          const pct = ((cnt / Math.max(1, totalSubmissions)) * 100).toFixed(1);
          return '<div>'
            + '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;"><span>' + esc(s) + '</span><b>' + cnt.toLocaleString() + ' (' + pct + '%)</b></div>'
            + '<div style="height:8px; border-radius:4px; background:var(--border); overflow:hidden;">'
              + '<div style="height:100%; width:' + ((cnt/maxS)*100) + '%; background:var(--primary);"></div>'
            + '</div>'
          + '</div>';
        }).join('') || '<div class="ux-empty">No shift data available.</div>')
      + '</div>'
    + '</div>'

    // Chart 6: Floor Productivity (Floor = Unit)
    + '<div class="ux-panel">'
      + '<h3>🏢 Floor / Unit Productivity Comparison</h3>'
      + '<p>Throughput by floor based on operational Unit mapping.</p>'
      + '<div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">'
        + (([...floorMap.keys()].sort().map(fl => {
          const cnt = floorMap.get(fl) || 0;
          const maxF = Math.max(1, ...floorMap.values());
          const pct = totalSubmissions ? ((cnt / totalSubmissions) * 100).toFixed(1) : 0;
          return '<div>'
            + '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;"><span>Unit ' + esc(fl) + '</span><b>' + cnt.toLocaleString() + ' (' + pct + '%)</b></div>'
            + '<div style="height:8px; border-radius:4px; background:var(--border); overflow:hidden;">'
              + '<div style="height:100%; width:' + ((cnt/maxF)*100) + '%; background:#df8b24;"></div>'
            + '</div>'
          + '</div>';
        }).join('')) || '<div class="ux-empty">No floor/unit records available.</div>')
      + '</div>'
    + '</div>'
  + '</div>'

  // Bottom Rankings: Top 10 Queues, Top 10 QTCs, Top 10 Labelers
  + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:16px; margin-top:20px;">'
    // Chart 7: Top 10 Queues
    + '<div class="ux-panel">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">'
        + '<h3 style="margin:0;">🗂️ Top 10 Queues</h3>'
        + '<span class="ux-note">By Submissions</span>'
      + '</div>'
      + '<div style="display:flex; flex-direction:column; gap:6px;">'
        + (topQueues.map(([q, cnt], idx) => {
          const maxQ = topQueues[0][1] || 1;
          return '<div style="padding:4px 0; border-bottom:1px solid var(--border-light);">'
            + '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:2px;">'
              + '<span><b style="color:var(--text-soft); font-size:10px; margin-right:4px;">#' + (idx+1) + '</b> ' + esc(q) + '</span>'
              + '<b>' + cnt.toLocaleString() + '</b>'
            + '</div>'
            + '<div style="height:4px; border-radius:2px; background:var(--border); overflow:hidden;">'
              + '<div style="height:100%; width:' + ((cnt/maxQ)*100) + '%; background:var(--accent);"></div>'
            + '</div>'
          + '</div>';
        }).join('') || '<div class="ux-empty">No queue data available.</div>')
      + '</div>'
    + '</div>'

    // Chart 8: Top 10 QTCs
    + '<div class="ux-panel">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">'
        + '<h3 style="margin:0;">👥 Top 10 QTC Supervisors</h3>'
        + '<span class="ux-note">By Team Volume</span>'
      + '</div>'
      + '<div style="display:flex; flex-direction:column; gap:6px;">'
        + (topQtcs.map(([qc, cnt], idx) => {
          const maxQc = topQtcs[0][1] || 1;
          return '<div style="padding:4px 0; border-bottom:1px solid var(--border-light);">'
            + '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:2px;">'
              + '<span><b style="color:var(--text-soft); font-size:10px; margin-right:4px;">#' + (idx+1) + '</b> ' + esc(qc) + '</span>'
              + '<b>' + cnt.toLocaleString() + '</b>'
            + '</div>'
            + '<div style="height:4px; border-radius:2px; background:var(--border); overflow:hidden;">'
              + '<div style="height:100%; width:' + ((cnt/maxQc)*100) + '%; background:#df8b24;"></div>'
            + '</div>'
          + '</div>';
        }).join('') || '<div class="ux-empty">No QTC data available.</div>')
      + '</div>'
    + '</div>'

    // Chart 9: Top 10 Labelers
    + '<div class="ux-panel">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">'
        + '<h3 style="margin:0;">👤 Top 10 Labelers</h3>'
        + '<span class="ux-note">By Submissions</span>'
      + '</div>'
      + '<div style="display:flex; flex-direction:column; gap:6px;">'
        + (topLabelers.map(([lbl, cnt], idx) => {
          const maxL = topLabelers[0][1] || 1;
          return '<div style="padding:4px 0; border-bottom:1px solid var(--border-light);">'
            + '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:2px;">'
              + '<span><b style="color:var(--text-soft); font-size:10px; margin-right:4px;">#' + (idx+1) + '</b> ' + esc(lbl) + '</span>'
              + '<b>' + cnt.toLocaleString() + '</b>'
            + '</div>'
            + '<div style="height:4px; border-radius:2px; background:var(--border); overflow:hidden;">'
              + '<div style="height:100%; width:' + ((cnt/maxL)*100) + '%; background:#10b981;"></div>'
            + '</div>'
          + '</div>';
        }).join('') || '<div class="ux-empty">No labeler data available.</div>')
      + '</div>'
    + '</div>'
  + '</div>'

  // Personal Target Tracking Feature (Part 3.4)
  + '<div class="ux-panel" style="margin-top:20px;">'
    + '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">'
      + '<div><h3 style="margin:0;">🎯 Personal Submission Target</h3><p style="margin:2px 0 0;">Track progress toward operational shift and daily goals.</p></div>'
      + '<span class="ux-note">Saved locally</span>'
    + '</div>'
    + '<div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap; margin-top:12px;">'
      + '<label class="ux-note" style="display:flex; align-items:center; gap:8px;">Target Tasks:<input class="ux-target" id="uxTarget" type="number" min="1" step="1" placeholder="e.g. 500" value="' + (target || '') + '" style="padding:6px 12px; border-radius:8px; border:1px solid var(--border); width:140px;"></label>'
      + '<div id="uxProgress" style="flex:1; min-width:240px;"></div>'
    + '</div>'
  + '</div>';

  bindHeaderControls(overview, 'ov');

  // Event handlers
  $('uxCSV').onclick = exportCSV;
  $('uxPrint').onclick = () => window.print();
  $('uxCompare').onclick = () => { if (!cmpMode) toggleCompare(); $('cmpBar').scrollIntoView({ behavior: reduced() ? 'instant' : 'smooth' }); };
  $('ovDrilldownBtn').onclick = () => {
    const cols = ['Task ID', 'Timestamp', 'Labeler Name', 'Employee ID', 'Shift', 'Unit', 'QTC Name', 'Queue Name', 'Modality', 'Pass'];
    const ni = hdrs.findIndex(h => h.toLowerCase() === 'national id');
    const ti = hdrs.findIndex(h => ['task id', 'id'].includes(h.toLowerCase()));
    const drillRows = rows.map(r => [
      ti >= 0 ? esc(r[ti]) : '—',
      tsIdx >= 0 ? esc(r[tsIdx]) : '—',
      li >= 0 ? esc(r[li]) : '—',
      maskEmployeeId(ni >= 0 ? r[ni] : '', r[li]),
      si >= 0 ? esc(r[si]) : '—',
      fi >= 0 ? esc(r[fi]) : '—',
      qcI >= 0 ? esc(r[qcI]) : '—',
      qi >= 0 ? esc(r[qi]) : '—',
      esc(r[hdrs.findIndex(h => h.toLowerCase() === 'modality')] || ''),
      esc(r[hdrs.findIndex(h => h.toLowerCase() === 'pass')] || '')
    ]);
    openDrilldownModal({
      title: 'Current Selection Records',
      subtitle: 'Drill-down view of ' + rows.length.toLocaleString() + ' filtered submissions (National IDs masked)',
      badge: 'Live Data',
      columns: cols,
      rows: drillRows
    });
  };

  overview.querySelectorAll('.an-cat-card[data-cat]').forEach(card => {
    const cat = card.dataset.cat;
    card.onclick = () => {
      analysisFilters.category = cat;
      if (typeof switchTab === 'function') switchTab('analysis');
      else location.hash = 'analysis-overview';
    };
  });

  overview.querySelectorAll('.ux-bar').forEach(b => {
    const d = b.dataset.date;
    const count = Number(b.dataset.count || 0);
    const pct = Math.max(1, maxDay) ? ((count / maxDay) * 100).toFixed(1) : '0';
    MeegTooltip.attach(b, () => ({
      title: d,
      badge: 'Daily Volume',
      desc: 'Operational submissions for this date',
      rows: [
        { label: 'Submissions', value: count.toLocaleString(), color: 'var(--accent)' },
        { label: '% of Peak Day', value: pct + '%', color: '#15b8a6' }
      ],
      note: 'Click to filter entire dashboard to this date'
    }));
    b.onclick = () => {
      selD.clear(); selWeeks.clear(); selD.add(d); buildStrip(); applyAll();
    };
  });

  $('uxTarget').onchange = e => {
    target = Math.max(0, Math.floor(Number(e.target.value) || 0));
    try { localStorage.setItem('meeg_personal_target', String(target)); } catch(e){}
    progress(rows.length);
  };

  progress(rows.length);
  applyView();
  bindUniversalFilterBar(overview, 'overview');
}`;

// Helper to replace a function by its exact start and end
function replaceFunctionInCode(source, funcName, newFuncCode) {
  const marker = 'function ' + funcName + '(';
  const start = source.indexOf(marker);
  if (start === -1) throw new Error('Could not find function ' + funcName);
  let brace = 0;
  let inFunc = false;
  let end = -1;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') {
      brace++;
      inFunc = true;
    } else if (source[i] === '}') {
      brace--;
      if (inFunc && brace === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error('Could not find end of function ' + funcName);
  return source.slice(0, start) + newFuncCode + source.slice(end + 1);
}

code = replaceFunctionInCode(code, 'renderOverview', newRenderOverview);
console.log('Replaced renderOverview successfully');

fs.writeFileSync(filePath, code, 'utf8');
console.log('Saved dashboard-ui.js');
