function renderDailyReport(){
  const page = $('uxDaily');
  if(!page || page.hidden) return;

  const rows = rowsInView();
  const cToday = cairoToday();
  const dateA = dailyReportDateA || cToday;
  const dateB = dailyReportDateB || _addDays(dateA, -1);

  // SECTION A: Quality Analytics Aggregations
  const qs = getQualityStore();
  const qsEntries = Object.entries(qs);
  let qTotal = 0, qSumTot = 0, qSumAtt = 0, qSumTva = 0, qSumArt = 0;
  let tierHighCount = 0, tierMidCount = 0, tierLowCount = 0;
  const qShiftMap = new Map();
  const qQtcMap = new Map();
  const qLabMap = new Map();

  qsEntries.forEach(([aid, q]) => {
    qTotal++;
    const tot = typeof window.qNum === 'function' ? window.qNum(q.totalAccuracy) : parseFloat(q.totalAccuracy);
    const att = typeof window.qNum === 'function' ? window.qNum(q.attribute) : parseFloat(q.attribute);
    const tva = typeof window.qNum === 'function' ? window.qNum(q.tvaF1) : parseFloat(q.tvaF1);
    const art = typeof window.qNum === 'function' ? window.qNum(q.artifacts) : parseFloat(q.artifacts);
    if(tot !== null && !isNaN(tot)) {
      qSumTot += tot;
      if (tot >= 0.95) tierHighCount++;
      else if (tot >= 0.85) tierMidCount++;
      else tierLowCount++;
    }
    if(att !== null && !isNaN(att)) qSumAtt += att;
    if(tva !== null && !isNaN(tva)) qSumTva += tva;
    if(art !== null && !isNaN(art)) qSumArt += art;

    const info = (window.idInfo && window.idInfo[aid]) || {};
    const sh = info.shift || 'Overnight';
    const qtc = info.qtc || 'Unassigned QTC';
    const lab = info.name || q.email || 'Unassigned Labeler';

    if(!qShiftMap.has(sh)) qShiftMap.set(sh, { count: 0, sum: 0 });
    qShiftMap.get(sh).count++;
    if(tot !== null && !isNaN(tot)) qShiftMap.get(sh).sum += tot;

    if(!qQtcMap.has(qtc)) qQtcMap.set(qtc, { count: 0, sum: 0 });
    qQtcMap.get(qtc).count++;
    if(tot !== null && !isNaN(tot)) qQtcMap.get(qtc).sum += tot;

    if(!qLabMap.has(lab)) qLabMap.set(lab, { count: 0, sum: 0, email: q.email || '' });
    qLabMap.get(lab).count++;
    if(tot !== null && !isNaN(tot)) qLabMap.get(lab).sum += tot;
  });

  const avgTot = qTotal ? (qSumTot / qTotal) : null;
  const avgAtt = qTotal ? (qSumAtt / qTotal) : null;
  const avgTva = qTotal ? (qSumTva / qTotal) : null;
  const avgArt = qTotal ? (qSumArt / qTotal).toFixed(1) : '—';

  // SECTION B: Daily Operational Breakdown for selected date
  const allDailyRows = (typeof rawRows !== 'undefined' && rawRows.length) ? rawRows : ((window.rawRows && window.rawRows.length) ? window.rawRows : rows);
  const selectedDateRows = allDailyRows.filter(r => rDate(r) === dateA);
  const compareDateRows = allDailyRows.filter(r => rDate(r) === dateB);

  const getDayStats = (rList) => {
    const tot = rList.length;
    const lab = uniq(rList, 'Labeler Name') || 0;
    const qtc = uniq(rList, 'QTC Name') || 0;
    const q = uniq(rList, 'Queue Name') || 0;
    const lFP = rList.filter(r => isModPass(r, 'lidar', 'FP')).length;
    const lQA = rList.filter(r => isModPass(r, 'lidar', 'QA')).length;
    const lnFP = rList.filter(r => isModPass(r, 'laneline', 'FP')).length;
    const lnQA = rList.filter(r => isModPass(r, 'laneline', 'QA')).length;
    const vel = (tot / 18).toFixed(1);
    return { tot, lab, qtc, q, lFP, lQA, lnFP, lnQA, vel };
  };

  const statsA = getDayStats(selectedDateRows);
  const statsB = getDayStats(compareDateRows);
  const dodGrowth = statsB.tot > 0 ? (((statsA.tot - statsB.tot) / statsB.tot) * 100).toFixed(1) : '0.0';

  // Daily 6 breakdown tables for Date A
  const si = hdrs.findIndex(h => h.toLowerCase() === 'shift');
  const fi = hdrs.findIndex(h => ['floor', 'unit'].includes(h.toLowerCase()));
  const qi = hdrs.findIndex(h => h.toLowerCase() === 'queue name');
  const qcI = hdrs.findIndex(h => h.toLowerCase() === 'qtc name');
  const li = hdrs.findIndex(h => h.toLowerCase() === 'labeler name');

  const shiftDaily = new Map();
  const floorDaily = new Map();
  const queueDaily = new Map();
  const qtcDaily = new Map();
  const labelerDaily = new Map();

  selectedDateRows.forEach(r => {
    if(si >= 0 && r[si]) shiftDaily.set(r[si], (shiftDaily.get(r[si]) || 0) + 1);
    if(fi >= 0 && r[fi]) { const fl = deriveFloor(r[fi]); floorDaily.set(fl, (floorDaily.get(fl) || 0) + 1); }
    if(qi >= 0 && r[qi]) queueDaily.set(r[qi], (queueDaily.get(r[qi]) || 0) + 1);
    if(qcI >= 0 && r[qcI]) qtcDaily.set(r[qcI], (qtcDaily.get(r[qcI]) || 0) + 1);
    if(li >= 0 && r[li]) labelerDaily.set(r[li], (labelerDaily.get(r[li]) || 0) + 1);
  });

  // Render HTML
  page.innerHTML = '<div class="ux-overview">'
    + '<div class="ux-heading">'
      + '<div>'
        + '<div class="ux-eyebrow">Enterprise Operations · Comprehensive Reports</div>'
        + '<h2>Quality & Daily Operational Report</h2>'
        + '<p>Verified annotation quality scores and day-by-day operational production breakdowns.</p>'
      + '</div>'
      + renderHeaderControlsHTML('daily')
    + '</div>'

    + renderUniversalFilterBar('daily')

    // Segmented Section Toggle
    + '<div class="section-switch-wrap">'
      + '<button class="section-switch-btn ' + (dailyReportSection==='quality'?'active':'') + '" id="btnSecQuality">⭐ Section A — Quality Analytics</button>'
      + '<button class="section-switch-btn ' + (dailyReportSection==='daily'?'active':'') + '" id="btnSecDaily">📅 Section B — Daily Operational Report</button>'
    + '</div>'

    // ============================================================
    // SECTION A CONTENT: QUALITY ANALYTICS
    // ============================================================
    + '<div id="sectionA_Quality" style="display:' + (dailyReportSection==='quality'?'block':'none') + ';">'
      + '<div class="ux-panel" style="margin-bottom:18px; padding:12px 18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; background:var(--bg-2); border-left:4px solid var(--success);">'
        + '<div><b>Verified Quality Knowledgebase:</b> Strictly derived from quality assessment records in the Export tab.</div>'
        + '<div style="display:flex; gap:8px;">'
          + '<button class="btn btn-c" id="qualityRefreshBtn" style="font-size:12px;">📥 Import / Refresh Quality</button>'
          + '<button class="btn" id="qualityUnmatchedBtn" style="font-size:12px;">⚠️ Unmatched Records</button>'
        + '</div>'
      + '</div>'

      // 8 Quality KPI Cards
      + '<div class="ux-grid-8">'
        + '<div class="kpi-mini-card" style="--tone:var(--primary);"><div class="kpi-title">Total Reviews</div><div class="kpi-val">' + qTotal.toLocaleString() + '</div><div class="kpi-sub">Assessed tasks</div></div>'
        + '<div class="kpi-mini-card" style="--tone:var(--success);"><div class="kpi-title">Verified Accuracy</div><div class="kpi-val" style="color:var(--success);">' + (avgTot ? (avgTot*100).toFixed(1)+'%' : '—') + '</div><div class="kpi-sub">Weighted mean</div></div>'
        + '<div class="kpi-mini-card" style="--tone:var(--accent);"><div class="kpi-title">Attribute Accuracy</div><div class="kpi-val">' + (avgAtt ? (avgAtt*100).toFixed(1)+'%' : '—') + '</div><div class="kpi-sub">Attribute precision</div></div>'
        + '<div class="kpi-mini-card" style="--tone:#df8b24;"><div class="kpi-title">TVA F1 Score</div><div class="kpi-val">' + (avgTva ? (avgTva*100).toFixed(1)+'%' : '—') + '</div><div class="kpi-sub">Temporal volume</div></div>'
        + '<div class="kpi-mini-card" style="--tone:var(--danger);"><div class="kpi-title">Artifacts Reported</div><div class="kpi-val">' + avgArt + '</div><div class="kpi-sub">Mean artifacts / task</div></div>'
        + '<div class="kpi-mini-card" style="--tone:var(--success);"><div class="kpi-title">High Tier (≥95%)</div><div class="kpi-val" style="color:var(--success);">' + tierHighCount.toLocaleString() + '</div><div class="kpi-sub">' + (qTotal ? ((tierHighCount/qTotal)*100).toFixed(0) : 0) + '% of assessments</div></div>'
        + '<div class="kpi-mini-card" style="--tone:var(--warning);"><div class="kpi-title">Mid Tier (85-94%)</div><div class="kpi-val" style="color:var(--warning);">' + tierMidCount.toLocaleString() + '</div><div class="kpi-sub">' + (qTotal ? ((tierMidCount/qTotal)*100).toFixed(0) : 0) + '% of assessments</div></div>'
        + '<div class="kpi-mini-card" style="--tone:var(--danger);"><div class="kpi-title">Low Tier (<85%)</div><div class="kpi-val" style="color:var(--danger);">' + tierLowCount.toLocaleString() + '</div><div class="kpi-sub">' + (qTotal ? ((tierLowCount/qTotal)*100).toFixed(0) : 0) + '% of assessments</div></div>'
      + '</div>'

      // Quality Rankings Tables: Shift & QTC
      + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:18px; margin-top:20px;">'
        + '<div class="ux-panel">'
          + '<h3>Quality Accuracy by Shift</h3>'
          + '<div class="perf-table" style="margin-top:10px;">'
            + '<table>'
              + '<thead><tr><th>Shift</th><th>Assessed Tasks</th><th>Avg Accuracy</th><th>Tier</th></tr></thead>'
              + '<tbody>'
                + ([...qShiftMap.entries()].sort((a,b)=>(b[1].sum/b[1].count)-(a[1].sum/a[1].count)).map(([sh, d]) => {
                  const acc = d.count ? d.sum / d.count : 0;
                  const tier = acc >= 0.95 ? 'tier-high' : acc >= 0.85 ? 'tier-mid' : 'tier-low';
                  return '<tr><td><b>' + esc(sh) + '</b></td><td>' + d.count.toLocaleString() + '</td><td>' + (acc*100).toFixed(1) + '%</td><td><span class="tier-badge ' + tier + '">' + (acc >= 0.95 ? 'High' : acc >= 0.85 ? 'Mid' : 'Low') + '</span></td></tr>';
                }).join('') || '<tr><td colspan="4" class="ux-empty">No shift quality records</td></tr>')
              + '</tbody>'
            + '</table>'
          + '</div>'
        + '</div>'

        + '<div class="ux-panel">'
          + '<h3>Top QTC Quality Rankings</h3>'
          + '<div class="perf-table" style="margin-top:10px;">'
            + '<table>'
              + '<thead><tr><th>Rank</th><th>QTC Supervisor</th><th>Assessed Tasks</th><th>Accuracy</th><th>Tier</th></tr></thead>'
              + '<tbody>'
                + ([...qQtcMap.entries()].sort((a,b)=>(b[1].sum/b[1].count)-(a[1].sum/a[1].count)).slice(0, 10).map(([qc, d], i) => {
                  const acc = d.count ? d.sum / d.count : 0;
                  const tier = acc >= 0.95 ? 'tier-high' : acc >= 0.85 ? 'tier-mid' : 'tier-low';
                  return '<tr><td>' + (i < 3 ? ['🥇','🥈','🥉'][i] : '#' + (i+1)) + '</td><td><b>' + esc(qc) + '</b></td><td>' + d.count.toLocaleString() + '</td><td>' + (acc*100).toFixed(1) + '%</td><td><span class="tier-badge ' + tier + '">' + (acc >= 0.95 ? 'High' : acc >= 0.85 ? 'Mid' : 'Low') + '</span></td></tr>';
                }).join('') || '<tr><td colspan="5" class="ux-empty">No QTC quality records</td></tr>')
              + '</tbody>'
            + '</table>'
          + '</div>'
        + '</div>'
      + '</div>'

      // Main Quality Assessments Table
      + '<section class="ux-panel" style="margin-top:20px;">'
        + '<div class="ux-heading" style="margin-bottom:12px;">'
          + '<div><h3>Verified Quality Assessment Records (' + qTotal.toLocaleString() + ')</h3><p>Individual task accuracy scores from quality evaluations.</p></div>'
        + '</div>'
        + '<div class="perf-table">'
          + '<table>'
            + '<thead><tr>'
              + '<th>Task ID</th><th>Date</th><th>Labeler</th><th>QTC</th><th>Shift</th><th>Attribute Acc</th><th>TVA F1</th><th>Total Acc</th><th>Tier</th><th>Artifacts</th>'
            + '</tr></thead>'
            + '<tbody>'
              + (qsEntries.slice(0, 50).map(([aid, q]) => {
                const info = (window.idInfo && window.idInfo[aid]) || {};
                const tot = typeof window.qNum === 'function' ? window.qNum(q.totalAccuracy) : parseFloat(q.totalAccuracy);
                const tier = tot !== null ? (tot >= 0.95 ? 'tier-high' : tot >= 0.85 ? 'tier-mid' : 'tier-low') : '';
                return '<tr>'
                  + '<td><code>' + esc(aid) + '</code></td>'
                  + '<td>' + (q.actualDate || '—') + '</td>'
                  + '<td><b>' + esc(info.name || q.email || '—') + '</b></td>'
                  + '<td>' + esc(info.qtc || '—') + '</td>'
                  + '<td>' + esc(info.shift || '—') + '</td>'
                  + '<td>' + (typeof window.qFmt === 'function' ? window.qFmt(q.attribute) : (q.attribute || '—')) + '</td>'
                  + '<td>' + (typeof window.qFmt === 'function' ? window.qFmt(q.tvaF1) : (q.tvaF1 || '—')) + '</td>'
                  + '<td><b>' + (typeof window.qFmt === 'function' ? window.qFmt(tot) : (tot*100).toFixed(1)+'%') + '</b></td>'
                  + '<td>' + (tier ? '<span class="tier-badge ' + tier + '">' + (tot >= 0.95 ? 'High' : tot >= 0.85 ? 'Mid' : 'Low') + '</span>' : '—') + '</td>'
                  + '<td>' + (q.artifacts || '0') + '</td>'
                + '</tr>';
              }).join('') || '<tr><td colspan="10" class="ux-empty">No quality assessment records found. Click "Import / Refresh Quality" above.</td></tr>')
            + '</tbody>'
          + '</table>'
          + (qTotal > 50 ? '<div style="text-align:center; padding:12px; font-size:12px; color:var(--muted);">Showing first 50 of ' + qTotal.toLocaleString() + ' records</div>' : '')
        + '</div>'
      + '</section>'
    + '</div>'

    // ============================================================
    // SECTION B CONTENT: DAILY OPERATIONAL REPORT
    // ============================================================
    + '<div id="sectionB_Daily" style="display:' + (dailyReportSection==='daily'?'block':'none') + ';">'
      // Operational Date Picker Bar
      + '<div class="ux-panel" style="margin-bottom:18px; padding:14px 20px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:14px;">'
        + '<div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">'
          + '<label style="font-weight:700; font-size:13px; display:flex; align-items:center; gap:6px;">📅 Operational Date (Cairo):<input type="date" id="dailyDateAInput" value="' + dateA + '" style="padding:6px 10px; border-radius:8px; border:1px solid var(--border); font-size:13px; background:var(--bg-3); color:var(--text);"></label>'
          + '<button class="btn btn-c" id="btnDailyToday" style="font-size:12px; padding:5px 10px;">Today</button>'
          + '<button class="btn" id="btnDailyYesterday" style="font-size:12px; padding:5px 10px;">Yesterday</button>'
          + '<label style="font-size:12px; display:flex; align-items:center; gap:6px; margin-left:10px; cursor:pointer;"><input type="checkbox" id="dailyCompareToggle" ' + (dailyReportCompareMode?'checked':'') + '> <b>⚖️ Compare Two Dates</b></label>'
          + (dailyReportCompareMode ? '<label style="font-size:12px; display:flex; align-items:center; gap:6px;">Compare with Date B:<input type="date" id="dailyDateBInput" value="' + dateB + '" style="padding:5px 8px; border-radius:8px; border:1px solid var(--border); font-size:12px; background:var(--bg-3); color:var(--text);"></label>' : '')
        + '</div>'
        + '<div style="display:flex; gap:8px;">'
          + '<button class="btn btn-c" id="dailyExportCSV" style="font-size:12px;">↓ Export Daily CSV</button>'
          + '<button class="btn" id="dailyPrintBtn" style="font-size:12px;">🖨️ Print</button>'
        + '</div>'
      + '</div>'

      // 10 Daily KPI Cards
      + '<div class="ux-grid-10">'
        + '<div class="kpi-mini-card" style="--tone:var(--primary);"><div class="kpi-title">Day Submissions</div><div class="kpi-val">' + statsA.tot.toLocaleString() + '</div><div class="kpi-sub">' + dateA + ' output</div></div>'
        + '<div class="kpi-mini-card" style="--tone:#0a9d8c;"><div class="kpi-title">Active Labelers</div><div class="kpi-val">' + statsA.lab.toLocaleString() + '</div><div class="kpi-sub">On this date</div></div>'
        + '<div class="kpi-mini-card" style="--tone:#df8b24;"><div class="kpi-title">Active QTCs</div><div class="kpi-val">' + statsA.qtc.toLocaleString() + '</div><div class="kpi-sub">Supervising</div></div>'
        + '<div class="kpi-mini-card" style="--tone:#df5c99;"><div class="kpi-title">Active Queues</div><div class="kpi-val">' + statsA.q.toLocaleString() + '</div><div class="kpi-sub">Receiving work</div></div>'
        + '<div class="kpi-mini-card" style="--tone:#0d9488;"><div class="kpi-title">Lidar FP</div><div class="kpi-val">' + statsA.lFP.toLocaleString() + '</div><div class="kpi-sub">First pass</div></div>'
        + '<div class="kpi-mini-card" style="--tone:#14b8a6;"><div class="kpi-title">Lidar QA</div><div class="kpi-val">' + statsA.lQA.toLocaleString() + '</div><div class="kpi-sub">Quality review</div></div>'
        + '<div class="kpi-mini-card" style="--tone:#ed9a35;"><div class="kpi-title">Lane Line FP</div><div class="kpi-val">' + statsA.lnFP.toLocaleString() + '</div><div class="kpi-sub">First pass</div></div>'
        + '<div class="kpi-mini-card" style="--tone:#ec4899;"><div class="kpi-title">Lane Line QA</div><div class="kpi-val">' + statsA.lnQA.toLocaleString() + '</div><div class="kpi-sub">Quality review</div></div>'
        + '<div class="kpi-mini-card" style="--tone:#6366f1;"><div class="kpi-title">Hourly Velocity</div><div class="kpi-val">' + statsA.vel + ' /hr</div><div class="kpi-sub">Submits / hour</div></div>'
        + '<div class="kpi-mini-card" style="--tone:var(--success);"><div class="kpi-title">DoD Growth %</div><div class="kpi-val" style="color:' + (parseFloat(dodGrowth)>=0?'var(--success)':'var(--danger)') + ';">' + (parseFloat(dodGrowth)>=0?'+':'') + dodGrowth + '%</div><div class="kpi-sub">vs previous day</div></div>'
      + '</div>'

      // TWO-DATE COMPARISON MODE VIEW (When active)
      + (dailyReportCompareMode ? (
        '<div class="ux-panel" style="margin-top:20px; border-top:4px solid var(--accent);">'
          + '<div class="ux-heading" style="margin-bottom:12px;">'
            + '<div><h3>⚖️ Two-Date Period Comparison: ' + dateA + ' vs ' + dateB + '</h3><p>Side-by-side delta calculation between both selected operational dates.</p></div>'
          + '</div>'
          + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">'
            + [
              ['Total Submissions', statsA.tot, statsB.tot],
              ['Active Labelers', statsA.lab, statsB.lab],
              ['Active QTCs', statsA.qtc, statsB.qtc],
              ['Active Queues', statsA.q, statsB.q],
              ['Lidar FP', statsA.lFP, statsB.lFP],
              ['Lidar QA', statsA.lQA, statsB.lQA],
              ['Lane Line FP', statsA.lnFP, statsB.lnFP],
              ['Lane Line QA', statsA.lnQA, statsB.lnQA]
            ].map(([lbl, va, vb]) => {
              const diff = va - vb;
              const pct = vb > 0 ? ((diff / vb) * 100).toFixed(1) : '—';
              const isPos = diff >= 0;
              return '<div style="background:var(--bg-2); padding:12px; border-radius:10px; border:1px solid var(--border);">'
                + '<span class="ux-note">' + lbl + '</span>'
                + '<div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:4px;">'
                  + '<strong style="font-size:16px;">' + va.toLocaleString() + '</strong>'
                  + '<span style="font-size:12px; color:var(--text-soft);">vs ' + vb.toLocaleString() + '</span>'
                + '</div>'
                + '<div style="margin-top:6px; font-weight:700; font-size:11px; color:' + (isPos ? 'var(--success)' : 'var(--danger)') + ';">'
                  + (isPos ? '▲ +' : '▼ ') + diff.toLocaleString() + (pct !== '—' ? ' (' + (isPos ? '+' : '') + pct + '%)' : '')
                + '</div>'
              + '</div>';
            }).join('')
          + '</div>'
        + '</div>'
      ) : '')

      // 6 IN-DEPTH BREAKDOWN TABLES FOR DATE A
      + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:18px; margin-top:20px;">'
        // 1. Shift Breakdown
        + '<div class="ux-panel">'
          + '<h3>1. Shift Production Breakdown</h3>'
          + '<div class="perf-table" style="margin-top:10px;">'
            + '<table><thead><tr><th>Shift</th><th>Submissions</th><th>Share %</th></tr></thead><tbody>'
              + ([...shiftDaily.entries()].sort((a,b)=>b[1]-a[1]).map(([s,c])=>'<tr><td><b>' + esc(s) + '</b></td><td>' + c.toLocaleString() + '</td><td>' + (statsA.tot ? ((c/statsA.tot)*100).toFixed(1) : 0) + '%</td></tr>').join('') || '<tr><td colspan="3" class="ux-empty">No shift data</td></tr>')
            + '</tbody></table>'
          + '</div>'
        + '</div>'

        // 2. Floor Breakdown
        + '<div class="ux-panel">'
          + '<h3>2. Floor Breakdown</h3>'
          + '<div class="perf-table" style="margin-top:10px;">'
            + '<table><thead><tr><th>Floor</th><th>Submissions</th><th>Share %</th></tr></thead><tbody>'
              + (([...floorDaily.keys()].sort().map(fl=>{ const c = floorDaily.get(fl)||0; return '<tr><td><b>' + esc(fl) + '</b></td><td>' + c.toLocaleString() + '</td><td>' + (statsA.tot ? ((c/statsA.tot)*100).toFixed(1) : 0) + '%</td></tr>'; }).join('')) || '<tr><td colspan="3" class="ux-empty">No floor data</td></tr>')
            + '</tbody></table>'
          + '</div>'
        + '</div>'

        // 3. Queue Breakdown
        + '<div class="ux-panel">'
          + '<h3>3. Top Queues for ' + dateA + '</h3>'
          + '<div class="perf-table" style="margin-top:10px;">'
            + '<table><thead><tr><th>Queue</th><th>Submissions</th></tr></thead><tbody>'
              + ([...queueDaily.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([q,c])=>'<tr><td><b style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:200px; display:block;">' + esc(q) + '</b></td><td>' + c.toLocaleString() + '</td></tr>').join('') || '<tr><td colspan="2" class="ux-empty">No queue data</td></tr>')
            + '</tbody></table>'
          + '</div>'
        + '</div>'

        // 4. QTC Breakdown
        + '<div class="ux-panel">'
          + '<h3>4. Top QTC Teams for ' + dateA + '</h3>'
          + '<div class="perf-table" style="margin-top:10px;">'
            + '<table><thead><tr><th>QTC Supervisor</th><th>Team Submissions</th></tr></thead><tbody>'
              + ([...qtcDaily.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([qc,c])=>'<tr><td><b>' + esc(qc) + '</b></td><td>' + c.toLocaleString() + '</td></tr>').join('') || '<tr><td colspan="2" class="ux-empty">No QTC data</td></tr>')
            + '</tbody></table>'
          + '</div>'
        + '</div>'

        // 5. Top Labelers
        + '<div class="ux-panel">'
          + '<h3>5. Top Labelers for ' + dateA + '</h3>'
          + '<div class="perf-table" style="margin-top:10px;">'
            + '<table><thead><tr><th>Labeler</th><th>Submissions</th></tr></thead><tbody>'
              + ([...labelerDaily.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([l,c])=>'<tr><td><b>' + esc(l) + '</b></td><td>' + c.toLocaleString() + '</td></tr>').join('') || '<tr><td colspan="2" class="ux-empty">No labeler data</td></tr>')
            + '</tbody></table>'
          + '</div>'
        + '</div>'

        // 6. Modality x Pass Matrix
        + '<div class="ux-panel">'
          + '<h3>6. Modality × Pass Matrix</h3>'
          + '<div class="perf-table" style="margin-top:10px;">'
            + '<table><thead><tr><th>Modality</th><th>First Pass (FP)</th><th>Quality (QA)</th><th>Total</th></tr></thead><tbody>'
              + '<tr><td><b>Lidar</b></td><td>' + statsA.lFP.toLocaleString() + '</td><td>' + statsA.lQA.toLocaleString() + '</td><td><b>' + (statsA.lFP + statsA.lQA).toLocaleString() + '</b></td></tr>'
              + '<tr><td><b>Lane Line</b></td><td>' + statsA.lnFP.toLocaleString() + '</td><td>' + statsA.lnQA.toLocaleString() + '</td><td><b>' + (statsA.lnFP + statsA.lnQA).toLocaleString() + '</b></td></tr>'
            + '</tbody></table>'
          + '</div>'
        + '</div>'
      + '</div>'
    + '</div>'
  + '</div>';

  bindHeaderControls(page, 'daily'); bindUniversalFilterBar(page, 'daily');

  // Toggle Section A / Section B
  $('btnSecQuality').onclick = () => { dailyReportSection = 'quality'; renderDailyReport(); };
  $('btnSecDaily').onclick = () => { dailyReportSection = 'daily'; renderDailyReport(); };

  // Section A Buttons
  const qRefBtn = page.querySelector('#qualityRefreshBtn');
  if(qRefBtn) qRefBtn.onclick = () => {
    if(typeof fetchQualityData === 'function') fetchQualityData(false);
  };
  const qUnmBtn = page.querySelector('#qualityUnmatchedBtn');
  if(qUnmBtn) qUnmBtn.onclick = () => {
    const unList = [];
    qsEntries.forEach(([aid, q]) => {
      const match = rows.some(r => {
        const ti = hdrs.findIndex(h => ['task id', 'id'].includes(h.toLowerCase()));
        return ti >= 0 && String(r[ti]).trim() === aid;
      });
      if (!match) unList.push([aid, q.actualDate || '—', q.email || '—', q.totalAccuracy || '—']);
    });
    openDrilldownModal({
      title: 'Unmatched Quality Records (' + unList.length + ')',
      subtitle: 'Tasks in Quality Export tab not matched to active Turso DB rows',
      badge: 'Discrepancy Check',
      columns: ['Actual Task ID', 'Actual Date', 'Email', 'Total Accuracy'],
      rows: unList
    });
  };

  // Section B Buttons
  const dateAInp = page.querySelector('#dailyDateAInput');
  if(dateAInp) dateAInp.onchange = (e) => { dailyReportDateA = e.target.value; renderDailyReport(); };
  const dateBInp = page.querySelector('#dailyDateBInput');
  if(dateBInp) dateBInp.onchange = (e) => { dailyReportDateB = e.target.value; renderDailyReport(); };

  const cmpTgl = page.querySelector('#dailyCompareToggle');
  if(cmpTgl) cmpTgl.onchange = (e) => { dailyReportCompareMode = e.target.checked; renderDailyReport(); };

  const todayBtn = page.querySelector('#btnDailyToday');
  if(todayBtn) todayBtn.onclick = () => { dailyReportDateA = cToday; renderDailyReport(); };
  const yestBtn = page.querySelector('#btnDailyYesterday');
  if(yestBtn) yestBtn.onclick = () => { dailyReportDateA = _addDays(cToday, -1); renderDailyReport(); };

  const printBtn = page.querySelector('#dailyPrintBtn');
  if(printBtn) printBtn.onclick = () => window.print();

  const exportBtn = page.querySelector('#dailyExportCSV');
  if(exportBtn) exportBtn.onclick = () => {
    const headers = ['Category', 'Item Name', 'Count / Value', 'Share %'];
    const csvRows = [
      ['Date', dateA, statsA.tot + ' tasks', '100%'],
      ['Metrics', 'Active Labelers', statsA.lab, '—'],
      ['Metrics', 'Active QTCs', statsA.qtc, '—'],
      ['Metrics', 'Active Queues', statsA.q, '—'],
      ['Metrics', 'Lidar FP', statsA.lFP, '—'],
      ['Metrics', 'Lidar QA', statsA.lQA, '—'],
      ['Metrics', 'Lane Line FP', statsA.lnFP, '—'],
      ['Metrics', 'Lane Line QA', statsA.lnQA, '—'],
      ['Metrics', 'Hourly Velocity', statsA.vel + ' /hr', '—'],
      ...([...shiftDaily.entries()].map(([s,c]) => ['Shift', s, c, ((c/statsA.tot)*100).toFixed(1)+'%'])),
      ...([...floorDaily.entries()].map(([f,c]) => ['Floor', f, c, ((c/statsA.tot)*100).toFixed(1)+'%'])),
      ...([...queueDaily.entries()].slice(0, 15).map(([q,c]) => ['Queue', q, c, ((c/statsA.tot)*100).toFixed(1)+'%']))
    ];
    const cell = v => '"' + String(v ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
    const csv = [headers, ...csvRows].map(r => r.map(cell).join(',')).join('\r\n');
    downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), 'MEEG_daily_report_' + dateA + '.csv');
    showToast('✓ Daily operational report CSV exported');
  };
}

const sourceStateObserver=new MutationObserver(()=>{if(!window._firstDataReady){renderDailyReport();if(typeof renderQueuesAnalysis==='function')renderQueuesAnalysis();}});if($('mainContent'))sourceStateObserver.observe($('mainContent'),{childList:true,subtree:true});



/* Bound source requests and worker parsing; keep the same sheet and session. */

async function fetchSheetText(url,timeoutMs=45000){

 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);

 try{

   const response=await fetch(url,{cache:'no-store',signal:controller.signal});

   if(!response.ok)throw new Error('HTTP '+response.status);

   const text=await response.text();

   if(/^\s*</.test(text))throw new Error('Google returned a sign-in or error page instead of CSV');

   const firstLine=text.slice(0,text.indexOf('\n')>=0?text.indexOf('\n')+1:text.length);

   const first=parseCSV(firstLine)[0]||[];

   if(!first.some(h=>String(h).trim().toLowerCase()==='queue name')||!first.some(h=>String(h).trim().toLowerCase()==='pass'))throw new Error('The source response is missing Queue Name or Pass');

   return text;

 }catch(e){

   if(e.name==='AbortError')throw new Error('Source request timed out');

   throw e;

 }finally{clearTimeout(timer);}

}



const originalCsvParser=parseCSVAsync;

parseCSVAsync=function(text){

 return new Promise((resolve,reject)=>{

   const timer=setTimeout(()=>{

     try{resolve(parseCSV(text).filter(r=>r&&r.length&&r.some(c=>String(c||'').trim())));}catch(e){reject(e);}

   },15000);

   Promise.resolve().then(()=>originalCsvParser(text)).then(table=>{

     clearTimeout(timer);resolve(table);

   },error=>{

     clearTimeout(timer);

     try{resolve(parseCSV(text).filter(r=>r&&r.length&&r.some(c=>String(c||'').trim())));}catch(e){reject(error);}

   });

 });

};



// Source data uses the existing CSV transport; no layout or calendar changes.
function dashboardCsvSources(){
 const base='https://docs.google.com/spreadsheets/d/'+SHEET_ID;
 const query=encodeURIComponent('select * where A is not null');
 const backup='https://docs.google.com/spreadsheets/d/1vpsYtvoZSKLsUeKj-FTXVGJmyFygSSck8DUIODJha_A';
 const tab=encodeURIComponent('Backup Date Base');
 return [
  {name:'Main Data Base',urls:[base+'/gviz/tq?tqx=out:csv&headers=1&tq='+query+(SHEET_GID?'&gid='+encodeURIComponent(SHEET_GID):''),base+'/export?format=csv&gid='+encodeURIComponent(SHEET_GID),base+'/gviz/tq?tqx=out:csv&headers=1&gid='+encodeURIComponent(SHEET_GID)]},
  {name:'Backup Intake / Backup Date Base',urls:[backup+'/gviz/tq?tqx=out:csv&headers=1&sheet='+tab+'&tq='+query,backup+'/gviz/tq?tqx=out:csv&headers=1&sheet='+tab]}
 ];
}
async function fetchDashboardCsvSource(source){
 let failure;
 for(const url of source.urls){
  try{
   const table=await parseCSVAsync(await fetchSheetText(url,45000));
   if(!table.length)throw new Error('Empty CSV response');
   return table;
  }catch(e){failure=e;}
 }
 throw new Error(source.name+': '+(failure?.message||'Source unavailable'));
}
function mergeDashboardCsvSources(tables){
 const canonical=value=>{const key=String(value??'').trim().toLowerCase().replace(/\s+/g,' ');return key==='task id'?'id':key;};
 const headers=[],keys=[],positions=new Map();
 tables.forEach(table=>(table[0]||[]).forEach(header=>{
  const key=canonical(header);if(!key||positions.has(key))return;
  positions.set(key,headers.length);keys.push(key);headers.push(key==='id'?'Id':String(header).trim());
 }));
 const combined=[headers],priorCounts=new Map();
 const context=['timestamp','shift','unit','qtc name','yubikey email','labeler name','national id','pc no','modality','queue name','task link','id','object count','pass','stage'];
 const get=(row,key)=>row[positions.get(key)]||'';
 tables.forEach(table=>{
  const mapping=(table[0]||[]).map(h=>positions.get(canonical(h)));
  const counts=new Map();
  table.slice(1).forEach(input=>{
   const row=headers.map(()=>'');
   input.forEach((value,index)=>{const to=mapping[index];if(to!==undefined)row[to]=String(value??'').trim();});
   if(!row.some(Boolean))return;
   // Exact matching submission context across sources only. Keep repeated tasks,
   // FP versus QA and different timestamps. Preserve within-source multiplicity.
   if(get(row,'id')||get(row,'task link')){
    const key=JSON.stringify(context.map(k=>k==='timestamp'?(get(row,k)||get(row,'created at')):get(row,k)));
    const occurrence=(counts.get(key)||0)+1;counts.set(key,occurrence);
    if(occurrence<=(priorCounts.get(key)||0))return;
   }
   combined.push(row);
  });
  counts.forEach((count,key)=>priorCounts.set(key,Math.max(count,priorCounts.get(key)||0)));
 });
 return combined;
}
function dashboardCsvText(table){return table.map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');}

let sheetLoadPromise=null;

let _instantCacheAttempted=false;



loadData=function(){

 if(sheetLoadPromise)return sheetLoadPromise;

 // Allow data fetch for dashboard clients

 const button=$('refreshBtn');setSyncActive(true);setTrafficLight('yellow');if(button)button.disabled=true;



 // Fast cache hydration: immediately render from IndexedDB if memory is empty

 if(!rawRows.length&&!_instantCacheAttempted){
    _instantCacheAttempted=true;
    idbGet('meti_dataset_cache_v2').then(cached=>{
      if(cached&&cached.table&&cached.table.length&&!rawRows.length){
        onCsvTable(cached.table);
        setTrafficLight('yellow');
        if (typeof showToast === 'function') {
          showToast('⚡ Loaded from instant local cache — syncing latest updates…');
        }
      } else {
        idbGet('csv-two-sources-v1').then(c=>{
          if(c&&c.text&&!rawRows.length){
            parseCSVAsync(c.text).then(t=>{ if(!rawRows.length&&t&&t.length){ onCsvTable(t); setTrafficLight('yellow'); } }).catch(()=>{});
          }
        }).catch(()=>{});
      }
    }).catch(()=>{});
  }

  if(!rawRows.length)$('mainContent').innerHTML='<div class="loader"><div class="spin"></div><span class="ltxt">Loading source data…</span></div>';

 

 sheetLoadPromise=(async()=>{
    let failure;
    try{
      const token = (typeof getAuthToken === "function" ? getAuthToken() : (sessionStorage.getItem("meeg_auth_token") || ""));
      const apiBase = window.MEEG_API_URL || localStorage.getItem("meeg_api_url") || "https://meeg-secure-api.islamyasser424.workers.dev";
      var _m5Etag = window._anEtag || "";
      var m5Headers = token ? { "Authorization": "Bearer " + token } : {};
      if (_m5Etag) m5Headers["If-None-Match"] = _m5Etag;

      const res = await (typeof apiFetch === "function" ? apiFetch("/api/analytics/dataset?limit=25000", { headers: m5Headers }) : fetch(apiBase + "/api/analytics/dataset?limit=25000", {
        headers: m5Headers,
        credentials: "include"
      }));

      if (res.status === 304) {
        // Fast 304 Not Modified
        setTrafficLight('green');
        return;
      }
      if (res.status === 429) {
        if (typeof showToast === 'function') showToast('⚠️ تم إيقاف التحديث التلقائي لتجاوز حصة الاستعلامات');
        throw new Error("QUOTA_BLOCKED");
      }
      if(!res.ok) throw new Error("HTTP " + res.status);
      var net = res.headers.get("ETag");
      if (net) { window._anEtag = net; }
      const data = await res.json();
      const dbRows = data.rows || [];
      const headers = ['Timestamp', 'Shift', 'Unit', 'Qtc Name', 'Yubikey Email', 'Labeler Name', 'National ID', 'Pc No', 'Modality', 'Queue Name', 'Task Link', 'Id', 'Object Count', 'Pass', 'Stage', 'Created At'];
      const table = [headers];
      for (let i = 0; i < dbRows.length; i++) {
        const row = dbRows[i];
        table.push([
          row.timestamp != null ? String(row.timestamp) : '',
          row.shift != null ? String(row.shift) : '',
          row.unit != null ? String(row.unit) : '',
          row.qtc_name != null ? String(row.qtc_name) : '',
          row.yubikey_email != null ? String(row.yubikey_email) : '',
          row.labeler_name != null ? String(row.labeler_name) : '',
          row.national_id != null ? String(row.national_id) : '',
          row.pc_no != null ? String(row.pc_no) : '',
          row.modality != null ? String(row.modality) : '',
          row.queue_name != null ? String(row.queue_name) : '',
          row.task_link != null ? String(row.task_link) : '',
          row.id != null ? String(row.id) : '',
          row.object_count != null ? String(row.object_count) : '0',
          row.pass != null ? String(row.pass) : '',
          row.stage != null ? String(row.stage) : '',
          row.created_at != null ? String(row.created_at) : ''
        ]);
      }
      onCsvTable(table);
      setTrafficLight('green');
      try {
        if (typeof idbSet === 'function') {
          idbSet('meti_dataset_cache_v2', { v: (typeof AUTH_VER !== 'undefined' ? AUTH_VER : '1'), timestamp: Date.now(), table });
        }
      } catch (e) {}
      return;
   }catch(e){
      failure = e;
   }

   if(!rawRows.length){

     const cached=await idbGet('csv-two-sources-v1');

     if(cached&&cached.v===AUTH_VER&&cached.text){

       try{

         onCsvTable(await parseCSVAsync(cached.text));

         setTrafficLight('yellow');

         showToast('Showing saved combined data. '+(failure?.message||'A source could not be reached.'));

         return;

       }catch(e){}

     }

     showErr('Could not load both Google Sheets: '+(failure?.message||'Network error')+'. Check source viewing access, then retry.');

   }else{

     setTrafficLight('red');

     showToast('Refresh failed — keeping the last combined data. '+(failure?.message||''));

   }

 })().finally(()=>{

   sheetLoadPromise=null;

   setSyncActive(false);

   if(button)button.disabled=false;

   renderAllSections();

 });



 return sheetLoadPromise;

};



const rowDates=new WeakMap();

const uncachedRowDate=rDate;

rDate=function(row){

 const source=tsIdx>=0?row[tsIdx]:undefined;

 const hit=rowDates.get(row);

 if(hit&&hit.column===tsIdx&&hit.source===source)return hit.value;

 const value=uncachedRowDate(row);

 rowDates.set(row,{column:tsIdx,source,value});

 return value;

};



const oldRender=renderAllSections;


/* ============ Queues Analysis Logic ============ */
/* queuesFilters declared at top */

function queuesAggregateData(rows){
  const idx = name => hdrs.findIndex(h => h.trim().toLowerCase() === name.toLowerCase());
  const qi = idx('queue name'), si = idx('shift'), fi = hdrs.findIndex(h => ['floor','unit'].includes(h.trim().toLowerCase()));
  const qci = idx('qtc name'), mi = idx('modality'), pi = idx('pass'), ni = idx('national id'), li = idx('labeler name');
  const oi = idx('object count');

  const queueMap = new Map();

  rows.forEach(r => {
    const qName = qi >= 0 ? String(r[qi] || '').trim() : '';
    if (!qName) return;

    if (!queueMap.has(qName)) {
      queueMap.set(qName, {
        name: qName,
        shifts: new Set(),
        floors: new Set(),
        qtcs: new Set(),
        labelers: new Set(),
        totalSubmit: 0,
        totalObjects: 0,
        lidarFP: 0,
        lidarQA: 0,
        laneFP: 0,
        laneQA: 0,
        dates: new Map(),
        latestTimestamp: ''
      });
    }

    const item = queueMap.get(qName);

    const shift = si >= 0 ? String(r[si] || '').trim() : '';
    if (shift) item.shifts.add(shift);

    const floor = fi >= 0 ? deriveFloor(r[fi]) : '';
    if (floor) item.floors.add(floor);

    const qtc = qci >= 0 ? String(r[qci] || '').normalize('NFC').trim().replace(/\s+/gu, ' ') : '';
    if (qtc) item.qtcs.add(qtc);

    let lid = '';
    if (ni >= 0) {
      const rawNi = String(r[ni] ?? '').trim()
        .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776))
        .replace(/\.0+$/, '').replace(/[\s-]/g, '');
      if (/^\d{14}$/.test(rawNi)) lid = rawNi;
    }
    if (!lid && li >= 0) {
      const name = String(r[li] ?? '').trim().toLowerCase();
      if (name) lid = 'name:' + name;
    }
    if (lid) item.labelers.add(lid);

    item.totalSubmit++;
    const objCnt = parseFloat(oi >= 0 ? r[oi] : 0) || 0;
    item.totalObjects += objCnt;

    const d = rDate(r);
    if (d) {
      item.dates.set(d, (item.dates.get(d) || 0) + 1);
      if (!item.latestTimestamp || d > item.latestTimestamp) item.latestTimestamp = d;
    }

    if (isModPass(r, 'lidar', 'FP')) item.lidarFP++;
    if (isModPass(r, 'lidar', 'QA')) item.lidarQA++;
    if (isModPass(r, 'laneline', 'FP')) item.laneFP++;
    if (isModPass(r, 'laneline', 'QA')) item.laneQA++;
  });

  return [...queueMap.values()].map(q => {
    const uniqueLabelers = q.labelers.size;
    const avgSubmit = uniqueLabelers > 0 ? (q.totalSubmit / uniqueLabelers).toFixed(1) : '0';
    const avgObjects = q.totalSubmit > 0 ? (q.totalObjects / q.totalSubmit).toFixed(1) : '0';
    return {
      name: q.name,
      shifts: [...q.shifts].sort(),
      floors: [...q.floors].sort(),
      qtcs: [...q.qtcs].sort(),
      labelerSet: q.labelers,
      totalSubmit: q.totalSubmit,
      totalObjects: q.totalObjects,
      avgObjects,
      lidarFP: q.lidarFP,
      lidarQA: q.lidarQA,
      laneFP: q.laneFP,
      laneQA: q.laneQA,
      uniqueLabelers,
      avgSubmit: Number(avgSubmit),
      avgSubmitStr: avgSubmit,
      uniqueQtc: q.qtcs.size,
      dates: q.dates,
      latestTimestamp: q.latestTimestamp
    };
  });
}

function exportQueuesCSV(queues){
 if(!queues.length){showToast('No queues to export.');return;}
 const headers=['Queue Name','Shifts','Floors / Units','QTC Names','Total Unique QTC','Lidar FP Submit','Lidar QA Submit','Lane Line FP Submit','Lane Line QA Submit','Total Submit','Unique Labelers','Avg Submit / Labeler'];
 const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
 const rows=queues.map(q=>[
  q.name,
  q.shifts.join('; '),
  q.floors.join('; '),
  q.qtcs.join('; '),
  q.uniqueQtc,
  q.lidarFP,
  q.lidarQA,
  q.laneFP,
  q.laneQA,
  q.totalSubmit,
  q.uniqueLabelers,
  q.avgSubmitStr
 ]);
 const csv=[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n');
 downloadBlob(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}),'MEEG_queues_analysis_'+cairoToday()+'.csv');
 showToast('Queues analysis exported to CSV.');
}
