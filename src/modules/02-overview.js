function renderOverview(){
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

  // Top rankings with FP and QA breakdown
  const qMap = new Map();
  const qtcMap = new Map();
  const labMap = new Map();
  const qi = hdrs.findIndex(h => h.toLowerCase() === 'queue name');
  const qcI = hdrs.findIndex(h => h.toLowerCase() === 'qtc name');
  const li = hdrs.findIndex(h => h.toLowerCase() === 'labeler name');
  const pi = hdrs.findIndex(h => h.toLowerCase() === 'pass');

  rows.forEach(r => {
    const isFP = pi >= 0 && String(r[pi] || '').trim().toUpperCase() === 'FP';
    const isQA = pi >= 0 && String(r[pi] || '').trim().toUpperCase() === 'QA';

    if (qi >= 0 && r[qi]) {
      const q = String(r[qi]).trim();
      if (!qMap.has(q)) qMap.set(q, { total: 0, fp: 0, qa: 0 });
      const ent = qMap.get(q);
      ent.total++;
      if (isFP) ent.fp++;
      if (isQA) ent.qa++;
    }
    if (qcI >= 0 && r[qcI]) {
      const qc = String(r[qcI]).trim();
      if (!qtcMap.has(qc)) qtcMap.set(qc, { total: 0, fp: 0, qa: 0 });
      const ent = qtcMap.get(qc);
      ent.total++;
      if (isFP) ent.fp++;
      if (isQA) ent.qa++;
    }
    if (li >= 0 && r[li]) {
      const l = String(r[li]).trim();
      if (!labMap.has(l)) labMap.set(l, { total: 0, fp: 0, qa: 0 });
      const ent = labMap.get(l);
      ent.total++;
      if (isFP) ent.fp++;
      if (isQA) ent.qa++;
    }
  });

  const topQueues = [...qMap.entries()].sort((a,b) => b[1].total - a[1].total).slice(0, 10);
  const topQtcs = [...qtcMap.entries()].sort((a,b) => b[1].total - a[1].total).slice(0, 10);
  const topLabelers = [...labMap.entries()].sort((a,b) => b[1].total - a[1].total).slice(0, 10);

  // Shift & Floor distribution (Floor = Unit) with FP/QA breakdown
  const si = hdrs.findIndex(h => h.toLowerCase() === 'shift');
  const fi = hdrs.findIndex(h => ['floor', 'unit'].includes(h.toLowerCase()));
  const shiftMap = new Map();
  const floorMap = new Map();
  rows.forEach(r => {
    const isFP = pi >= 0 && String(r[pi] || '').trim().toUpperCase() === 'FP';
    const isQA = pi >= 0 && String(r[pi] || '').trim().toUpperCase() === 'QA';

    if (si >= 0 && r[si]) {
      const s = String(r[si]).trim();
      if (!shiftMap.has(s)) shiftMap.set(s, { total: 0, fp: 0, qa: 0 });
      const ent = shiftMap.get(s);
      ent.total++;
      if (isFP) ent.fp++;
      if (isQA) ent.qa++;
    }
    if (fi >= 0 && r[fi]) {
      const fl = deriveFloor(r[fi]);
      if (!floorMap.has(fl)) floorMap.set(fl, { total: 0, fp: 0, qa: 0 });
      const ent = floorMap.get(fl);
      ent.total++;
      if (isFP) ent.fp++;
      if (isQA) ent.qa++;
    }
  });

  // Hourly distribution (00 to 23)
  const tsIdx = hdrs.findIndex(h => ['timestamp', 'created at', 'date'].includes(h.toLowerCase()));
  const hourCounts = new Array(24).fill(0);
  rows.forEach(r => {
    if (tsIdx >= 0 && r[tsIdx]) {
      const m = String(r[tsIdx]).match(/(\d{1,2}):\d{2}/);
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
  const topShift = [...shiftMap.entries()].sort((a,b) => b[1].total - a[1].total)[0] || ['—', { total: 0 }];
  const topUnit = [...floorMap.entries()].sort((a,b) => b[1].total - a[1].total)[0] || ['—', { total: 0 }];
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
      + '<div style="background:var(--bg-3); padding:12px 14px; border-radius:8px; border-left:3px solid #3b82f6; cursor:pointer;" onclick="window.toggleGlobalFilter && window.toggleGlobalFilter(\'shift\', \'' + esc(topShift[0]) + '\')" title="Click to filter by ' + esc(topShift[0]) + '">'
        + '<span class="ux-note">Highest-Volume Shift (Click to filter)</span>'
        + '<div style="font-weight:700; font-size:14px; color:var(--text); margin-top:3px;">' + esc(topShift[0]) + ' (' + (topShift[1] && topShift[1].total !== undefined ? topShift[1].total : topShift[1]).toLocaleString() + ' tasks)</div>'
      + '</div>'
      + '<div style="background:var(--bg-3); padding:12px 14px; border-radius:8px; border-left:3px solid #ed9a35; cursor:pointer;" onclick="window.toggleGlobalFilter && window.toggleGlobalFilter(\'floor\', \'' + esc(topUnit[0]) + '\')" title="Click to filter by Unit ' + esc(topUnit[0]) + '">'
        + '<span class="ux-note">Highest-Volume Floor / Unit</span>'
        + '<div style="font-weight:700; font-size:14px; color:var(--text); margin-top:3px;">Unit ' + esc(topUnit[0]) + ' (' + (topUnit[1] && topUnit[1].total !== undefined ? topUnit[1].total : topUnit[1]).toLocaleString() + ' tasks)</div>'
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
    // Chart 1: Daily Submission Area Line Chart (Last 21 active dates)
    + '<section class="ux-panel" style="flex:1.6;">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">'
        + '<div><h3 style="margin:0 0 4px;">📈 Daily Submission Activity (Last 21 Dates)</h3><p style="margin:0;">Interactive line chart with area trend & 7-day average. Click any dot to filter.</p></div>'
        + '<span class="ux-note">' + last21.length + ' active days</span>'
      + '</div>'
      + (() => {
        if (!last21.length) return '<div class="ux-empty" style="height:150px; display:flex; align-items:center; justify-content:center;">No dated submissions in current view.</div>';

        // 7-day moving average
        const movingAvg = last21.map((p, i) => {
          const start = Math.max(0, i - 6);
          const slice = last21.slice(start, i + 1);
          const sum = slice.reduce((acc, pt) => acc + pt[1], 0);
          return [p[0], Math.round(sum / slice.length)];
        });

        const W = 680, H = 190, L = 50, R = 25, T = 20, B = 40;
        const maxV = Math.max(1, ...last21.map(p => p[1]));
        const x = i => L + (last21.length <= 1 ? (W - L - R) / 2 : (i / (last21.length - 1)) * (W - L - R));
        const y = v => H - B - (v / maxV) * (H - T - B);

        let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%; height:auto; display:block; overflow:visible;" role="group" aria-label="Daily submission activity line chart">';
        svg += '<defs><linearGradient id="ovLineGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0d9488" stop-opacity="0.38"/><stop offset="100%" stop-color="#0d9488" stop-opacity="0.02"/></linearGradient></defs>';

        // Horizontal Gridlines
        for (let i = 0; i < 4; i++) {
          const val = (maxV * i) / 3;
          const yy = y(val);
          svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--border)" stroke-dasharray="3 3"/>';
          svg += '<text x="' + (L - 8) + '" y="' + (yy + 4) + '" fill="var(--text-soft)" font-size="10" text-anchor="end">' + Math.round(val).toLocaleString() + '</text>';
        }

        // Area polygon fill & lines
        if (last21.length > 1) {
          const polyPoints = [L + ',' + (H - B), ...last21.map((p, i) => x(i) + ',' + y(p[1])), x(last21.length - 1) + ',' + (H - B)].join(' ');
          svg += '<polygon fill="url(#ovLineGrad)" points="' + polyPoints + '"/>';
          svg += '<polyline fill="none" stroke="#ef4444" stroke-width="2" stroke-dasharray="4 3" stroke-linecap="round" points="' + movingAvg.map((p, i) => x(i) + ',' + y(p[1])).join(' ') + '"/>';
          svg += '<polyline fill="none" stroke="#0d9488" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="' + last21.map((p, i) => x(i) + ',' + y(p[1])).join(' ') + '"/>';
        } else if (last21.length === 1) {
          svg += '<line x1="' + (L + 20) + '" x2="' + (W - R - 20) + '" y1="' + y(last21[0][1]) + '" y2="' + y(last21[0][1]) + '" stroke="#0d9488" stroke-width="2" stroke-dasharray="5 5" opacity="0.6"/>';
        }

        // Circular Dots & X-axis Labels
        last21.forEach(([d, c], i) => {
          const cx = x(i), cy = y(c);
          const isFilterActive = globalUnifiedFilters.date === d;
          svg += '<circle class="ov-chart-dot" cx="' + cx + '" cy="' + cy + '" r="' + (isFilterActive ? '7' : '5') + '" fill="' + (isFilterActive ? '#38bdf8' : '#0d9488') + '" stroke="var(--bg-1)" stroke-width="2" style="cursor:pointer; transition:all 0.15s ease;" data-date="' + esc(d) + '" data-count="' + c + '" onclick="window.toggleGlobalFilter && window.toggleGlobalFilter(\'date\', \'' + esc(d) + '\')" title="' + esc(d) + ': ' + c.toLocaleString() + ' tasks"></circle>';

          if (last21.length <= 7 || i === 0 || i === last21.length - 1 || i === Math.floor(last21.length / 2)) {
            svg += '<text x="' + cx + '" y="' + (H - 12) + '" fill="var(--text-soft)" font-size="10" text-anchor="' + (i === 0 ? 'start' : i === last21.length - 1 ? 'end' : 'middle') + '">' + d + '</text>';
          }
        });

        svg += '</svg>';
        return svg;
      })()
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; font-size:11px; color:var(--text-soft); flex-wrap:wrap; gap:8px;">'
        + '<div style="display:flex; gap:14px; align-items:center;">'
          + '<span><span style="display:inline-block; width:10px; height:10px; background:#0d9488; border-radius:50%; vertical-align:middle; margin-right:4px;"></span> Daily Submissions</span>'
          + '<span><span style="display:inline-block; width:14px; height:0; border-top:2px dashed #ef4444; vertical-align:middle; margin-right:4px;"></span> 7-Day Moving Avg</span>'
        + '</div>'
        + '<span>Peak: <b>' + maxDay.toLocaleString() + '</b> tasks · 💡 Click any dot to filter</span>'
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
      + '<p>Distribution across work types and validation stages. Click any bar to filter.</p>'
      + '<div style="display:flex; flex-direction:column; gap:12px; margin-top:14px;">'
        + '<div>'
          + '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><b>Lidar vs Lane Line</b><span>' + (totalSubmissions ? ((totalLidar/totalSubmissions)*100).toFixed(1) : 0) + '% / ' + (totalSubmissions ? ((totalLane/totalSubmissions)*100).toFixed(1) : 0) + '%</span></div>'
          + '<div style="display:flex; height:12px; border-radius:6px; overflow:hidden; background:var(--border); cursor:pointer;">'
            + '<div style="width:' + (totalSubmissions ? (totalLidar/totalSubmissions)*100 : 50) + '%; background:#0d9488;" onclick="window.toggleGlobalFilter && window.toggleGlobalFilter(\'modality\', \'lidar\')" title="Click to filter Lidar"></div>'
            + '<div style="width:' + (totalSubmissions ? (totalLane/totalSubmissions)*100 : 50) + '%; background:#ed9a35;" onclick="window.toggleGlobalFilter && window.toggleGlobalFilter(\'modality\', \'laneline\')" title="Click to filter Lane Line"></div>'
          + '</div>'
          + '<div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-soft); margin-top:3px;">'
            + '<span style="cursor:pointer;" onclick="window.toggleGlobalFilter && window.toggleGlobalFilter(\'modality\', \'lidar\')"><span style="color:#0d9488">●</span> Lidar: <b>' + totalLidar.toLocaleString() + '</b></span>'
            + '<span style="cursor:pointer;" onclick="window.toggleGlobalFilter && window.toggleGlobalFilter(\'modality\', \'laneline\')"><span style="color:#ed9a35">●</span> Lane Line: <b>' + totalLane.toLocaleString() + '</b></span>'
          + '</div>'
        + '</div>'
        + '<div style="margin-top:6px;">'
          + '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><b>First Pass vs QA</b><span>' + (totalSubmissions ? ((totalFP/totalSubmissions)*100).toFixed(1) : 0) + '% / ' + (totalSubmissions ? ((totalQA/totalSubmissions)*100).toFixed(1) : 0) + '%</span></div>'
          + '<div style="display:flex; height:12px; border-radius:6px; overflow:hidden; background:var(--border); cursor:pointer;">'
            + '<div style="width:' + (totalSubmissions ? (totalFP/totalSubmissions)*100 : 50) + '%; background:#3b82f6;" onclick="window.toggleGlobalFilter && window.toggleGlobalFilter(\'pass\', \'FP\')" title="Click to filter First Pass"></div>'
            + '<div style="width:' + (totalSubmissions ? (totalQA/totalSubmissions)*100 : 50) + '%; background:#8b5cf6;" onclick="window.toggleGlobalFilter && window.toggleGlobalFilter(\'pass\', \'QA\')" title="Click to filter QA"></div>'
          + '</div>'
          + '<div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-soft); margin-top:3px;">'
            + '<span style="cursor:pointer;" onclick="window.toggleGlobalFilter && window.toggleGlobalFilter(\'pass\', \'FP\')"><span style="color:#3b82f6">●</span> FP: <b>' + totalFP.toLocaleString() + '</b></span>'
            + '<span style="cursor:pointer;" onclick="window.toggleGlobalFilter && window.toggleGlobalFilter(\'pass\', \'QA\')"><span style="color:#8b5cf6">●</span> QA: <b>' + totalQA.toLocaleString() + '</b></span>'
          + '</div>'
        + '</div>'
      + '</div>'
    + '</div>'

    // Chart 5: Shift Productivity (Clickable to Filter & FP/QA breakdown)
    + '<div class="ux-panel">'
      + '<h3>☀️ Shift Productivity Comparison</h3>'
      + '<p>Volume contributed by each shift. Click any shift to filter.</p>'
      + '<div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">'
        + ([...shiftMap.entries()].sort((a,b)=>b[1].total - a[1].total).map(([s, ent]) => {
          const maxS = Math.max(1, ...[...shiftMap.values()].map(v => v.total));
          const pct = ((ent.total / Math.max(1, totalSubmissions)) * 100).toFixed(1);
          const isFilterActive = globalUnifiedFilters.shift === s;
          return '<div style="cursor:pointer; padding:3px 4px; border-radius:6px; transition:background 0.15s; background:' + (isFilterActive ? 'var(--accent-light)' : 'transparent') + ';" onclick="window.toggleGlobalFilter && window.toggleGlobalFilter(\'shift\', \'' + esc(s) + '\')" title="Click to filter by ' + esc(s) + '" data-shift="' + esc(s) + '">'
            + '<div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; margin-bottom:3px;">'
              + '<span><b>' + esc(s) + '</b></span>'
              + '<div style="display:flex; align-items:center; gap:6px;">'
                + '<span class="q-badge" style="background:rgba(13,148,136,0.15); color:#0d9488; font-size:10px; font-weight:700; padding:1px 5px; border-radius:4px;">FP: ' + ent.fp.toLocaleString() + '</span>'
                + '<span class="q-badge" style="background:rgba(20,184,166,0.15); color:#14b8a6; font-size:10px; font-weight:700; padding:1px 5px; border-radius:4px;">QA: ' + ent.qa.toLocaleString() + '</span>'
                + '<b>' + ent.total.toLocaleString() + ' (' + pct + '%)</b>'
              + '</div>'
            + '</div>'
            + '<div style="height:8px; border-radius:4px; background:var(--border); overflow:hidden;">'
              + '<div style="height:100%; width:' + ((ent.total/maxS)*100) + '%; background:' + (isFilterActive ? '#38bdf8' : 'var(--primary)') + ';"></div>'
            + '</div>'
          + '</div>';
        }).join('') || '<div class="ux-empty">No shift data available.</div>')
      + '</div>'
    + '</div>'

    // Chart 6: Floor Productivity (Floor = Unit, Clickable & FP/QA breakdown)
    + '<div class="ux-panel">'
      + '<h3>🏢 Floor / Unit Productivity Comparison</h3>'
      + '<p>Throughput by floor based on operational Unit. Click to filter.</p>'
      + '<div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">'
        + (([...floorMap.keys()].sort().map(fl => {
          const ent = floorMap.get(fl) || { total: 0, fp: 0, qa: 0 };
          const maxF = Math.max(1, ...[...floorMap.values()].map(v => v.total));
          const pct = totalSubmissions ? ((ent.total / totalSubmissions) * 100).toFixed(1) : 0;
          const isFilterActive = globalUnifiedFilters.floor === fl;
          return '<div style="cursor:pointer; padding:3px 4px; border-radius:6px; transition:background 0.15s; background:' + (isFilterActive ? 'var(--accent-light)' : 'transparent') + ';" onclick="window.toggleGlobalFilter && window.toggleGlobalFilter(\'floor\', \'' + esc(fl) + '\')" title="Click to filter by Unit ' + esc(fl) + '" data-floor="' + esc(fl) + '">'
            + '<div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; margin-bottom:3px;">'
              + '<span><b>Unit ' + esc(fl) + '</b></span>'
              + '<div style="display:flex; align-items:center; gap:6px;">'
                + '<span class="q-badge" style="background:rgba(13,148,136,0.15); color:#0d9488; font-size:10px; font-weight:700; padding:1px 5px; border-radius:4px;">FP: ' + ent.fp.toLocaleString() + '</span>'
                + '<span class="q-badge" style="background:rgba(20,184,166,0.15); color:#14b8a6; font-size:10px; font-weight:700; padding:1px 5px; border-radius:4px;">QA: ' + ent.qa.toLocaleString() + '</span>'
                + '<b>' + ent.total.toLocaleString() + ' (' + pct + '%)</b>'
              + '</div>'
            + '</div>'
            + '<div style="height:8px; border-radius:4px; background:var(--border); overflow:hidden;">'
              + '<div style="height:100%; width:' + ((ent.total/maxF)*100) + '%; background:' + (isFilterActive ? '#38bdf8' : '#df8b24') + ';"></div>'
            + '</div>'
          + '</div>';
        }).join('')) || '<div class="ux-empty">No floor/unit records available.</div>')
      + '</div>'
    + '</div>'
  + '</div>'

  // Bottom Rankings: Top 10 Queues, Top 10 QTCs, Top 10 Labelers (With FP/QA and Click-to-Filter)
  + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:16px; margin-top:20px;">'
    // Chart 7: Top 10 Queues
    + '<div class="ux-panel">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">'
        + '<h3 style="margin:0;">🗂️ Top 10 Queues</h3>'
        + '<span class="ux-note">FP &amp; QA Split · Click to filter</span>'
      + '</div>'
      + '<div style="display:flex; flex-direction:column; gap:6px;">'
        + (topQueues.map(([q, ent], idx) => {
          const maxQ = topQueues[0] ? topQueues[0][1].total : 1;
          const isFilterActive = globalUnifiedFilters.queue === q;
          return '<div style="padding:4px 4px; border-bottom:1px solid var(--border-light); cursor:pointer; border-radius:4px; background:' + (isFilterActive ? 'var(--accent-light)' : 'transparent') + ';" onclick="window.toggleGlobalFilter && window.toggleGlobalFilter(\'queue\', \'' + esc(q) + '\')" title="Click to filter by ' + esc(q) + '" data-tooltip-queue="' + esc(q) + '">'
            + '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:12px; margin-bottom:2px;">'
              + '<span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><b style="color:var(--text-soft); font-size:10px; margin-right:4px;">#' + (idx+1) + '</b> ' + esc(q) + '</span>'
              + '<div style="display:flex; align-items:center; gap:5px; flex-shrink:0;">'
                + '<span class="q-badge" style="background:rgba(13,148,136,0.15); color:#0d9488; font-size:10px; font-weight:700; padding:1px 5px; border-radius:4px;">FP: ' + ent.fp.toLocaleString() + '</span>'
                + '<span class="q-badge" style="background:rgba(20,184,166,0.15); color:#14b8a6; font-size:10px; font-weight:700; padding:1px 5px; border-radius:4px;">QA: ' + ent.qa.toLocaleString() + '</span>'
                + '<b style="font-variant-numeric:tabular-nums; font-size:11px;">(' + ent.total.toLocaleString() + ')</b>'
              + '</div>'
            + '</div>'
            + '<div style="height:4px; border-radius:2px; background:var(--border); overflow:hidden;">'
              + '<div style="height:100%; width:' + ((ent.total/maxQ)*100) + '%; background:' + (isFilterActive ? '#38bdf8' : 'var(--accent)') + ';"></div>'
            + '</div>'
          + '</div>';
        }).join('') || '<div class="ux-empty">No queue data available.</div>')
      + '</div>'
    + '</div>'

    // Chart 8: Top 10 QTCs
    + '<div class="ux-panel">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">'
        + '<h3 style="margin:0;">👥 Top 10 QTC Supervisors</h3>'
        + '<span class="ux-note">FP &amp; QA Split · Click to filter</span>'
      + '</div>'
      + '<div style="display:flex; flex-direction:column; gap:6px;">'
        + (topQtcs.map(([qc, ent], idx) => {
          const maxQc = topQtcs[0] ? topQtcs[0][1].total : 1;
          const isFilterActive = globalUnifiedFilters.qtc === qc;
          return '<div style="padding:4px 4px; border-bottom:1px solid var(--border-light); cursor:pointer; border-radius:4px; background:' + (isFilterActive ? 'var(--accent-light)' : 'transparent') + ';" onclick="window.toggleGlobalFilter && window.toggleGlobalFilter(\'qtc\', \'' + esc(qc) + '\')" title="Click to filter by ' + esc(qc) + '">'
            + '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:12px; margin-bottom:2px;">'
              + '<span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><b style="color:var(--text-soft); font-size:10px; margin-right:4px;">#' + (idx+1) + '</b> ' + esc(qc) + '</span>'
              + '<div style="display:flex; align-items:center; gap:5px; flex-shrink:0;">'
                + '<span class="q-badge" style="background:rgba(13,148,136,0.15); color:#0d9488; font-size:10px; font-weight:700; padding:1px 5px; border-radius:4px;">FP: ' + ent.fp.toLocaleString() + '</span>'
                + '<span class="q-badge" style="background:rgba(20,184,166,0.15); color:#14b8a6; font-size:10px; font-weight:700; padding:1px 5px; border-radius:4px;">QA: ' + ent.qa.toLocaleString() + '</span>'
                + '<b style="font-variant-numeric:tabular-nums; font-size:11px;">(' + ent.total.toLocaleString() + ')</b>'
              + '</div>'
            + '</div>'
            + '<div style="height:4px; border-radius:2px; background:var(--border); overflow:hidden;">'
              + '<div style="height:100%; width:' + ((ent.total/maxQc)*100) + '%; background:' + (isFilterActive ? '#38bdf8' : '#df8b24') + ';"></div>'
            + '</div>'
          + '</div>';
        }).join('') || '<div class="ux-empty">No QTC data available.</div>')
      + '</div>'
    + '</div>'

    // Chart 9: Top 10 Labelers (Click to open detail modal)
    + '<div class="ux-panel">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">'
        + '<h3 style="margin:0;">👤 Top 10 Labelers</h3>'
        + '<span class="ux-note">FP &amp; QA Split · Click for Detail</span>'
      + '</div>'
      + '<div style="display:flex; flex-direction:column; gap:6px;">'
        + (topLabelers.map(([lbl, ent], idx) => {
          const maxL = topLabelers[0] ? topLabelers[0][1].total : 1;
          return '<div style="padding:4px 4px; border-bottom:1px solid var(--border-light); cursor:pointer; border-radius:4px;" onclick="window.openLabelerDetailModal && window.openLabelerDetailModal(\'' + esc(lbl) + '\')" title="Click to view ' + esc(lbl) + ' task history" class="labeler-row-item" data-person-key="' + esc(lbl) + '">'
            + '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:12px; margin-bottom:2px;">'
              + '<span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--primary); font-weight:600;"><b style="color:var(--text-soft); font-size:10px; margin-right:4px;">#' + (idx+1) + '</b> ' + esc(lbl) + '</span>'
              + '<div style="display:flex; align-items:center; gap:5px; flex-shrink:0;">'
                + '<span class="q-badge" style="background:rgba(13,148,136,0.15); color:#0d9488; font-size:10px; font-weight:700; padding:1px 5px; border-radius:4px;">FP: ' + ent.fp.toLocaleString() + '</span>'
                + '<span class="q-badge" style="background:rgba(20,184,166,0.15); color:#14b8a6; font-size:10px; font-weight:700; padding:1px 5px; border-radius:4px;">QA: ' + ent.qa.toLocaleString() + '</span>'
                + '<b style="font-variant-numeric:tabular-nums; font-size:11px;">(' + ent.total.toLocaleString() + ')</b>'
              + '</div>'
            + '</div>'
            + '<div style="height:4px; border-radius:2px; background:var(--border); overflow:hidden;">'
              + '<div style="height:100%; width:' + ((ent.total/maxL)*100) + '%; background:#10b981;"></div>'
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
}
function progress(count){
  const t = Number(target) || 0;
  const pct = t > 0 ? ((count / t) * 100).toFixed(1) : '0';
  const remaining = Math.max(0, t - count);
  const el = $('uxProgress');
  if (!el) return;
  if (!t) {
    el.innerHTML = '<span class="ux-note" style="display:block; margin-top:6px;">Set an operational target above to view achievement and remaining tasks.</span>';
    return;
  }
  el.innerHTML = '<div style="display:flex; flex-direction:column; gap:4px; margin-top:2px;">'
    + '<div style="display:flex; justify-content:space-between; font-size:12px; align-items:center;">'
      + '<span><b>' + count.toLocaleString() + '</b> / ' + t.toLocaleString() + ' actual tasks</span>'
      + '<span style="font-weight:700; color:' + (Number(pct) >= 100 ? 'var(--success)' : 'var(--primary)') + ';">' + pct + '% achieved (' + remaining.toLocaleString() + ' remaining)</span>'
    + '</div>'
    + '<div class="ux-track" role="progressbar" aria-valuenow="' + Math.min(100, Math.round(Number(pct))) + '" aria-valuemin="0" aria-valuemax="100" style="height:10px; border-radius:5px; background:var(--border); overflow:hidden;">'
      + '<div class="ux-fill" style="width:' + Math.min(100, Number(pct)) + '%; height:100%; background:' + (Number(pct) >= 100 ? 'var(--success)' : 'var(--primary)') + '; transition:width 0.3s;"></div>'
    + '</div>'
  + '</div>';
}
function exportCSV(){const rows=rowsInView();if(!rows.length){showToast('No matching rows to export.');return;}const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';const csv=[hdrs,...rows].map(r=>r.map(cell).join(',')).join('\r\n');downloadBlob(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}),'MEEG_filtered_'+cairoToday()+'.csv');}
function labelerSubmissionMetrics(rows){
 const idx=name=>hdrs.findIndex(h=>String(h).trim().toLowerCase()===name);
 const ni=idx('national id'),mi=idx('modality'),pi=idx('pass');
 const names=new Set();let missingNames=0;
 const totals={lidarFP:0,lidarQA:0,laneFP:0,laneQA:0};
 const categoryIds=Object.fromEntries(Object.keys(totals).map(k=>[k,new Set()]));
 rows.forEach(r=>{
  const name=ni<0?'':String(r[ni]??'').trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/\.0+$/,'').replace(/[\s-]/g,'');
  if(/^\d{14}$/.test(name))names.add(name);else missingNames++;
  const modality=mi<0?'':String(r[mi]??'').trim().toLowerCase().replace(/[\s_-]+/g,'');
  const pass=pi<0?'':String(r[pi]??'').trim().toUpperCase();
  const prefix=modality==='lidar'?'lidar':modality==='laneline'?'lane':'';
  if(prefix&&(pass==='FP'||pass==='QA')){const key=prefix+pass;totals[key]++;if(/^\d{14}$/.test(name))categoryIds[key].add(name);}
 });
 return {unique:ni<0?null:names.size,missingNames,totals,categoryUnique:Object.fromEntries(Object.entries(categoryIds).map(([k,ids])=>[k,ni<0?null:ids.size])),categoryColumns:mi>=0&&pi>=0};
}

function uniqueQtcCount(rows){const i=hdrs.findIndex(h=>String(h).trim().toLowerCase()==='qtc name');if(i<0)return null;return new Set(rows.map(r=>String(r[i]||'').normalize('NFC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('en')).filter(Boolean)).size;}

function categoryGroups(rows,field){
 const idx=hdrs.findIndex(h=>String(h).trim().toLowerCase()===field.toLowerCase());if(idx<0)return null;
 const map=new Map();rows.forEach(r=>{const name=String(r[idx]||'').trim()||'Unknown';if(!map.has(name))map.set(name,[]);map.get(name).push(r);});
 return [...map].map(([name,group])=>({name,rows:group,totals:labelerSubmissionMetrics(group).totals})).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
}
function floorComparisonRows(dimension='unit'){
 const excluded=new Set(dimension==='unit'?['floor','unit','location','modality','pass']:['qtc name','modality','pass']);const idIdx=hdrs.findIndex(h=>h.trim().toLowerCase()==='id');
 const rows=rawRows.filter(r=>{if(!isRowAllowed(r)||!timeOk(r))return false;const date=rDate(r);if(selD.size&&!selD.has(date))return false;if(selWeeks.size&&!selWeeks.has(getWeekLabel(date)))return false;if(idFilter&&idIdx>=0&&!String(r[idIdx]||'').toLowerCase().includes(idFilter.toLowerCase()))return false;for(const [key,values]of Object.entries(sel)){if(excluded.has(key.toLowerCase())||!values.size)continue;const ci=sIdx[key];if(ci!==undefined&&!values.has(String(r[ci]||'').trim()))return false;}return true;});
 const scoped=dimension==='qtc'&&activeLoc&&!activeLoc.startsWith('__')&&locColIdx>=0?rows.filter(r=>String(r[locColIdx]||'').trim()===activeLoc):rows;
 return analysisAggregate(scoped,{...analysisFilters,[dimension]:'',category:'',modality:'all'}).selected;
}

function addAnalysisCharts(a){
 const defs=[['Lidar FP','lidarFP','#0d9488'],['Lidar QA','lidarQA','#15b8a6'],['Lane Line FP','laneFP','#ed9a35'],['Lane Line QA','laneQA','#e9689e']];
 const container=document.createElement('div');container.className='an-extra-charts';
 const floorField=hdrs.some(h=>h.trim().toLowerCase()==='floor')?'Floor':'Unit';
 [[floorField,'Floor / Unit','horizontal','unit'],['Qtc Name','QC','vertical','qtc']].forEach(([field,label,layout,key])=>{
 const floorMode=key==='unit';const comparisonStage=analysisFilters[floorMode?'floorStage':'qcStage']||'lidarFP';const chartDefs=defs.filter(d=>d[1]===comparisonStage);
 const groups=categoryGroups(floorComparisonRows(key),field),panel=document.createElement('section');panel.className='ux-panel';
 if(groups){const idx=hdrs.findIndex(h=>h.trim().toLowerCase()===field.toLowerCase());const allFloors=[...new Set(rawRows.map(r=>String(r[idx]||'').trim()||'Unknown'))];allFloors.forEach(name=>{if(!groups.some(g=>g.name===name))groups.push({name,totals:{lidarFP:0,lidarQA:0,laneFP:0,laneQA:0}});});groups.sort((a,b)=>b.totals[comparisonStage]-a.totals[comparisonStage]||a.name.localeCompare(b.name));}
 if(!floorMode&&groups){const ranked=rankQcGroups(groups,comparisonStage,!!analysisFilters.qcLower);groups.splice(0,groups.length,...ranked);}
 panel.innerHTML='<h3>'+ (floorMode?'Compare all Floors · '+chartDefs[0][0]:(analysisFilters.qcLower?'Lower 15 QCs · ':'Top 15 QCs · ')+chartDefs[0][0])+'</h3><p>'+(floorMode?'Same category across every floor. Floor selection is ignored in this comparison; date, shift, QTC and email filters still apply.':'Switch Top / Lower 15 by Total Submit. QCs with zero submits in this category are excluded. Date, shift, floor and email filters apply.')+'</p><div class="an-chart-key">'+chartDefs.map(([name,,color])=>'<span><i style="background:'+color+'"></i>'+name+'</span>').join('')+'</div>';
 if(groups===null){panel.insertAdjacentHTML('beforeend','<div class="ux-empty">Required column unavailable: '+esc(field)+'</div>');container.appendChild(panel);return;}
 {const stageSelect=document.createElement('select');stageSelect.className='an-stage-select';stageSelect.setAttribute('aria-label',floorMode?'Floor comparison category':'QC comparison category');defs.forEach(([name,key])=>stageSelect.add(new Option(name,key)));stageSelect.value=comparisonStage;stageSelect.onchange=()=>{analysisFilters[floorMode?'floorStage':'qcStage']=stageSelect.value;renderAnalysis();};panel.insertBefore(stageSelect,panel.querySelector('.an-chart-key'));}
 if(!floorMode){const toggle=document.createElement('button');toggle.className='btn btn-c';toggle.classList.add('an-qc-switch');toggle.setAttribute('role','switch');toggle.setAttribute('aria-checked',String(!!analysisFilters.qcLower));toggle.textContent=analysisFilters.qcLower?'Lower 15 · switch to Top 15':'Top 15 · switch to Lower 15';toggle.onclick=()=>{analysisFilters.qcLower=!analysisFilters.qcLower;renderAnalysis();};const controls=document.createElement('div');controls.className='an-qc-controls';const categorySelect=panel.querySelector('.an-stage-select');panel.insertBefore(controls,panel.querySelector('.an-chart-key'));controls.append(categorySelect,toggle);}
 const max=Math.max(1,...groups.flatMap(g=>chartDefs.map(d=>g.totals[d[1]])));
 const chart=document.createElement('div');chart.className='an-group-chart '+layout;chart.setAttribute('aria-label','Total Submit by '+label);
 groups.forEach(g=>{const group=document.createElement('div');group.className='an-bar-group';const title=document.createElement('strong');title.textContent=g.name;title.className='an-group-name';group.appendChild(title);const bars=document.createElement('div');bars.className='an-category-bars';chartDefs.forEach(([name,cat,color])=>{const bar=document.createElement('button');bar.className='an-category-bar';const value=g.totals[cat];bar.style.setProperty('--bar-color',color);bar.style.setProperty('--bar-size',Math.max(value?2:0,value/max*100)+'%');bar.setAttribute('aria-label',g.name+' · '+name+': '+value+' submissions. Select to filter.');const mi=hdrs.findIndex(h=>h.trim().toLowerCase()==='modality'),pi=hdrs.findIndex(h=>h.trim().toLowerCase()==='pass');bar._tooltipRows=(g.rows||[]).filter(r=>{const mod=String(r[mi]||'').toLowerCase().replace(/[\s_-]+/g,'');return (mod==='lidar'?'lidar':mod==='laneline'?'lane':'')+String(r[pi]||'').trim().toUpperCase()===cat;});bar._tooltipTitle=g.name+' · '+name;bar.setAttribute('aria-description','Total Unique QTC: '+(uniqueQtcCount(bar._tooltipRows)??'Unavailable'));bar.innerHTML='<span>'+value.toLocaleString()+'</span>';bar.onclick=()=>{analysisFilters[key]=g.name;analysisFilters.category=cat;renderAnalysis();};bars.appendChild(bar);});group.appendChild(bars);chart.appendChild(group);});
 panel.appendChild(chart);if(!groups.length)chart.innerHTML='<div class="ux-empty">No matching submissions.</div>';container.appendChild(panel);
 });analysis.querySelector('.ux-overview').appendChild(container);
 const hint=document.createElement('p');hint.className='an-context';hint.textContent='Chart filters: '+[analysisFilters.unit,analysisFilters.qtc,defs.find(d=>d[1]===analysisFilters.category)?.[0]].filter(Boolean).join(' · ');const clear=document.createElement('button');clear.className='btn';clear.textContent='Clear chart filters';clear.onclick=()=>{Object.assign(analysisFilters,{unit:'',qtc:'',category:''});renderAnalysis();};hint.append(' ',clear);container.prepend(hint);
 function show(rows,title,event){
  const totals=labelerSubmissionMetrics(rows).totals;
  const qtc=uniqueQtcCount(rows);
  MeegTooltip.show({
   title: title,
   badge: 'Stage Breakdown',
   desc: 'Submissions & Quality Controllers',
   rows: [
    { label: 'Submissions', value: rows.length.toLocaleString(), color: 'var(--accent)' },
    { label: 'Total Unique QTC', value: (qtc ?? 'Unavailable').toLocaleString(), color: '#ed9a35' },
    { label: 'Lidar FP', value: totals.lidarFP.toLocaleString(), color: '#0d9488' },
    { label: 'Lidar QA', value: totals.lidarQA.toLocaleString(), color: '#15b8a6' },
    { label: 'Lane Line FP', value: totals.laneFP.toLocaleString(), color: '#ed9a35' },
    { label: 'Lane Line QA', value: totals.laneQA.toLocaleString(), color: '#e9689e' }
   ],
   note: 'Click to filter analysis by this selection'
  }, event);
 }
 function bind(el,rows,title,select){
  el.setAttribute('role','button');
  const display=e=>show(rows,title,e);
  el.addEventListener('pointermove',display);
  el.addEventListener('focus',display);
  el.addEventListener('pointerleave',()=>MeegTooltip.hide());
  el.addEventListener('blur',()=>MeegTooltip.hide());
  el.addEventListener('click',()=>{MeegTooltip.hide();select();});
  el.addEventListener('keydown',e=>{
   if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}
   if(e.key==='Escape')MeegTooltip.hide();
  });
 }
 container.querySelectorAll('.an-category-bar').forEach(bar=>{
  const display=e=>show(bar._tooltipRows,bar._tooltipTitle,e);
  bar.addEventListener('pointermove',display);
  bar.addEventListener('focus',display);
  bar.addEventListener('pointerleave',()=>MeegTooltip.hide());
  bar.addEventListener('blur',()=>MeegTooltip.hide());
  bar.addEventListener('click',()=>MeegTooltip.hide());
 });
 const line=$('anLine').querySelector('svg');
 if(line){const circles=line.querySelectorAll('circle');circles.forEach((el,i)=>{const date=a.points[i][0];bind(el,a.selected.filter(r=>rDate(r)===date),date,()=>{analysisFilters.from=date;analysisFilters.to=date;renderAnalysis();});});
 line.addEventListener('click',e=>{if(e.target.closest('circle'))return;const rect=line.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*760;const index=Math.min(a.points.length-1,Math.max(0,Math.round((x-55)/(760-55-20)*Math.max(0,a.points.length-1))));const d=a.points[index]?.[0];if(d){analysisFilters.from=d;analysisFilters.to=d;MeegTooltip.hide();renderAnalysis();}});
 line.addEventListener('pointermove',e=>{if(e.target.closest('circle'))return;const rect=line.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*760;const i=Math.min(a.points.length-1,Math.max(0,Math.round((x-55)/685*Math.max(0,a.points.length-1))));const date=a.points[i]?.[0];if(date)show(a.selected.filter(r=>rDate(r)===date),date,e);});line.addEventListener('pointerleave',()=>tooltip.hidden=true);
 }
 const si=hdrs.findIndex(h=>h.trim().toLowerCase()==='shift');const shiftName=r=>si>=0?String(r[si]||'').trim()||'Unknown':'Unknown';
 $('anDonut').querySelectorAll('circle[tabindex]').forEach((el,i)=>{const shift=a.shifts[i][0];el.style.pointerEvents='stroke';bind(el,a.selected.filter(r=>shiftName(r)===shift),shift,()=>{analysisFilters.shift=shift;renderAnalysis();});});
 $('anLegend').querySelectorAll(':scope > div').forEach((el,i)=>{el.tabIndex=0;const shift=a.shifts[i][0];bind(el,a.selected.filter(r=>shiftName(r)===shift),shift,()=>{analysisFilters.shift=shift;renderAnalysis();});});
}

function analysisAggregate(rows,filters){
 const idx=name=>hdrs.findIndex(h=>h.toLowerCase()===name.toLowerCase());const mi=idx('Modality'),si=idx('Shift');
 const lane=r=>mi>=0&&String(r[mi]||'').toLowerCase().replace(/[\s_-]+/g,'')==='laneline';
 const fi=idx(hdrs.some(h=>h.trim().toLowerCase()==='floor')?'Floor':'Unit'),qi=idx('Qtc Name'),passIdx=idx('Pass');
 const selected=rows.filter(r=>{const date=rDate(r);const mod=mi<0?'':String(r[mi]||'').toLowerCase().replace(/[\s_-]+/g,'');const pass=passIdx<0?'':String(r[passIdx]||'').trim().toUpperCase();const category=(mod==='lidar'?'lidar':mod==='laneline'?'lane':'')+pass;return (!filters.unit||(fi>=0&&(String(r[fi]||'').trim()||'Unknown')===filters.unit))&&(!filters.qtc||(qi>=0&&(String(r[qi]||'').trim()||'Unknown')===filters.qtc))&&(!filters.category||category===filters.category)&& (!filters.from||date>=filters.from)&&(!filters.to||date&&date<=filters.to)&&(filters.modality!=='lane'||lane(r))&&(!filters.shift||(si>=0?String(r[si]||'').trim()||'Unknown':'Unknown')===filters.shift);});
 const dates=new Map(),shifts=new Map();selected.forEach(r=>{const d=rDate(r);if(d)dates.set(d,(dates.get(d)||0)+1);const shift=si<0?'Unknown':String(r[si]||'').trim()||'Unknown';shifts.set(shift,(shifts.get(shift)||0)+1);});
 const dated=[...dates.keys()].sort();const points=[];
 if(dated.length){const from=filters.from||dated[0],to=filters.to||dated[dated.length-1];let d=new Date(from+'T00:00:00Z');const end=new Date(to+'T00:00:00Z');while(d<=end){const key=d.toISOString().slice(0,10);points.push([key,dates.get(key)||0]);d.setUTCDate(d.getUTCDate()+1);}}
 return {selected,points,shifts:[...shifts].sort((a,b)=>b[1]-a[1]),lane:mi<0?null:selected.filter(lane).length,undated:selected.length-[...dates.values()].reduce((a,b)=>a+b,0)};
}
const slicerQueries={};
const slicerDropdownOpen={};
const slicerValueCache=new WeakMap();function slicerValues(rows,column){if(column<0)return [];let columns=slicerValueCache.get(rows);if(!columns){columns=new Map();slicerValueCache.set(rows,columns);}if(!columns.has(column))columns.set(column,[...new Set(rows.map(r=>String(r[column]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})));return columns.get(column);}
function createListSlicers(){
 const host=document.createElement('div');host.className='an-list-slicers';
 [['Shift','Shift'],['Floor',hdrs.some(h=>h.trim().toLowerCase()==='floor')?'Floor':'Unit'],['QTC','Qtc Name'],['Email','Yubikey Email']].forEach(([label,key])=>{
 const ci=hdrs.findIndex(h=>h.trim().toLowerCase()===key.toLowerCase());const apiKey={'Shift':'shift','Unit':'unit','Floor':'unit','Qtc Name':'qtc','Yubikey Email':'email'}[key];const values=protectedOptions&&apiKey?(protectedOptions[apiKey]||[]):slicerValues(rawRows,ci);
 if(ci>=0)sIdx[key]=ci;
 const clearChartSelection=()=>{if(key==='Shift')analysisFilters.shift='';if(label==='Floor')analysisFilters.unit='';if(label==='QTC')analysisFilters.qtc='';};
 const panel=document.createElement('section');panel.className='an-slicer';const title=document.createElement('div');title.className='an-slicer-head';const heading=document.createElement('b');heading.textContent=label;const clear=document.createElement('button');clear.type='button';clear.className='btn';clear.textContent='Clear All';clear.setAttribute('aria-label','Clear '+label+' selections');clear.onclick=()=>{clearChartSelection();sel[key]?.clear();if(key==='Shift')setShiftsUI(null);applyAll();refreshOpenSlicers();};const selectAll=document.createElement('button');selectAll.type='button';selectAll.className='btn';selectAll.textContent='Select All';selectAll.disabled=values.length===0;selectAll.setAttribute('aria-label','Select all '+label+' values');selectAll.onclick=()=>{clearChartSelection();sel[key]=new Set(values);if(key==='Shift')setShiftsUI(null);applyAll();refreshOpenSlicers();};const actions=document.createElement('div');actions.className='an-slicer-actions';actions.append(selectAll,clear);title.append(heading,actions);panel.appendChild(title);
 const search=document.createElement('input');search.type='search';search.placeholder='Search '+label+'…';search.setAttribute('aria-label','Search '+label);search.value=slicerQueries[key]||'';panel.appendChild(search);
 const list=document.createElement('div');list.className='an-slicer-options';list.setAttribute('role','group');list.setAttribute('aria-label',label+' filter options');panel.appendChild(list);
 function draw(){list.replaceChildren();const q=search.value.trim().toLowerCase();const visible=values.filter(v=>v.toLowerCase().includes(q));visible.forEach(value=>{const row=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=!!sel[key]?.has(value);const text=document.createElement('span');text.textContent=value;row.append(checkbox,text);checkbox.onchange=()=>{clearChartSelection();if(!sel[key])sel[key]=new Set();if(key==='Shift')setShiftsUI(null);checkbox.checked?sel[key].add(value):sel[key].delete(value);applyAll();refreshOpenSlicers();};list.appendChild(row);});if(!visible.length){const empty=document.createElement('p');empty.className='ux-note';empty.textContent=ci<0?'Column unavailable':'No matching values';list.appendChild(empty);}}
 search.oninput=()=>{slicerQueries[key]=search.value;draw();};draw();
 const dropdown=document.createElement('details');dropdown.className='an-slicer-dropdown';dropdown.dataset.slicerKey=key;dropdown.open=!!slicerDropdownOpen[key];
 const summary=document.createElement('summary');summary.setAttribute('aria-label',label+' filter');const selected=[...(sel[key]||[])];summary.textContent=selected.length===0?label+' · All':label+' · '+(selected.length===1?selected[0]:selected.length+' selected');summary.title=selected.length?selected.join(', '):'All '+label;dropdown.append(summary,panel);
 dropdown.addEventListener('toggle',()=>{if(!dropdown.isConnected)return;slicerDropdownOpen[key]=dropdown.open;if(dropdown.open){document.querySelectorAll('.an-slicer-dropdown[open]').forEach(other=>{if(other!==dropdown){other.open=false;slicerDropdownOpen[other.dataset.slicerKey]=false;}});}});
 dropdown.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();dropdown.open=false;slicerDropdownOpen[key]=false;summary.focus();}});
 host.appendChild(dropdown);
 });return host;
}
function refreshOpenSlicers(){if(filterDrawer.open)renderDrawerAnalysis();}

function enableAnalysisFlips(rows){
 const flipCache=new Map();
 analysis.querySelectorAll('.an-metrics > article').forEach(card=>{
 const label=card.querySelector('.ux-label')?.textContent||'Metric';const note=card.querySelector('p')?.textContent||'';
 const category=[['Lidar FP','lidarFP'],['Lidar QA','lidarQA'],['Lane Line FP','laneFP'],['Lane Line QA','laneQA']].find(([name])=>label.includes(name));
 const cacheKey=category?category[1]:'all';let cached=flipCache.get(cacheKey);if(!cached){const mi=hdrs.findIndex(h=>h.trim().toLowerCase()==='modality'),pi=hdrs.findIndex(h=>h.trim().toLowerCase()==='pass');const relevant=category?rows.filter(r=>{const mod=String(r[mi]||'').toLowerCase().replace(/[\s_-]+/g,'');return (mod==='lidar'?'lidar':mod==='laneline'?'lane':'')+String(r[pi]||'').trim().toUpperCase()===category[1];}):rows;const metrics=labelerSubmissionMetrics(relevant);cached={relevant,metrics,qtc:uniqueQtcCount(relevant)};flipCache.set(cacheKey,cached);}
 const {relevant,metrics,qtc}=cached;
 const front=document.createElement('div');front.className='an-flip-front';while(card.firstChild)front.appendChild(card.firstChild);
 const back=document.createElement('div');back.className='an-flip-back';back.inert=true;const title=document.createElement('b');title.textContent=label;const description=document.createElement('p');description.textContent=note;back.append(title,description);
 [['Total Submit',relevant.length],['Unique Labelers',metrics.unique??'—'],['Unique QTC',qtc??'—']].forEach(([key,value])=>{const line=document.createElement('p');line.textContent=key+': '+(typeof value==='number'?value.toLocaleString():value);back.appendChild(line);});
 const hint=document.createElement('span');hint.className='ux-note';hint.textContent='Current filters · click to return';back.appendChild(hint);
 const inner=document.createElement('div');inner.className='an-flip-inner';inner.append(front,back);card.appendChild(inner);card.classList.add('an-flip-card');card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',label+' — flip for filtered details');card.setAttribute('aria-pressed','false');
 const cue=document.createElement('span');cue.className='an-flip-cue';cue.textContent='↻';cue.setAttribute('aria-hidden','true');card.appendChild(cue);
 const toggle=()=>{const flipped=card.classList.toggle('an-is-flipped');front.inert=flipped;back.inert=!flipped;card.setAttribute('aria-pressed',String(flipped));};card.onclick=toggle;card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}if(e.key==='Escape'&&card.classList.contains('an-is-flipped'))toggle();};
 });
}
