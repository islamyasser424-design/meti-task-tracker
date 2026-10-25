function renderAdvancedInsights() {
  const page = $('uxAdvancedInsights');
  if (!page || page.hidden) return;

  const baseRows = rowsInView();
  const idx = name => hdrs.findIndex(h => h.trim().toLowerCase() === name.toLowerCase());
  const qi = idx('queue name');
  const li = idx('labeler name');
  const qtc_i = idx('qtc name');
  const fi = hdrs.findIndex(h => ['floor', 'unit'].includes(h.trim().toLowerCase()));
  const si = idx('shift');
  const mi = idx('modality');
  const pi = idx('pass');
  const oi = idx('object count');

  // 1. Time Series & Period-over-Period Partitioning
  const dateMap = new Map();
  baseRows.forEach(r => {
    const d = rDate(r);
    if (d) {
      if (!dateMap.has(d)) dateMap.set(d, []);
      dateMap.get(d).push(r);
    }
  });

  const sortedDates = [...dateMap.keys()].sort();
  let p1Rows = [], p2Rows = [];
  let p1Label = 'Prior Period', p2Label = 'Recent Period';

  if (sortedDates.length >= 2) {
    const mid = Math.ceil(sortedDates.length / 2);
    const p1Dates = new Set(sortedDates.slice(0, mid));
    const p2Dates = new Set(sortedDates.slice(mid));
    p1Rows = baseRows.filter(r => p1Dates.has(rDate(r)));
    p2Rows = baseRows.filter(r => p2Dates.has(rDate(r)));
    p1Label = sortedDates[0] + ' → ' + sortedDates[mid - 1];
    p2Label = sortedDates[mid] + ' → ' + sortedDates[sortedDates.length - 1];
  } else {
    // If single date or no date, partition records chronologically into two halves
    const half = Math.ceil(baseRows.length / 2);
    p1Rows = baseRows.slice(0, half);
    p2Rows = baseRows.slice(half);
  }

  const p1Count = p1Rows.length;
  const p2Count = p2Rows.length;
  const countDelta = p1Count > 0 ? (((p2Count - p1Count) / p1Count) * 100) : 0;
  const countDeltaStr = (countDelta >= 0 ? '+' : '') + countDelta.toFixed(1) + '%';

  const p1Obj = p1Rows.reduce((acc, r) => acc + (parseFloat(oi >= 0 ? r[oi] : 0) || 0), 0);
  const p2Obj = p2Rows.reduce((acc, r) => acc + (parseFloat(oi >= 0 ? r[oi] : 0) || 0), 0);
  const objDelta = p1Obj > 0 ? (((p2Obj - p1Obj) / p1Obj) * 100) : 0;
  const objDeltaStr = (objDelta >= 0 ? '+' : '') + objDelta.toFixed(1) + '%';

  const p1Qa = p1Rows.filter(r => pi >= 0 && String(r[pi]||'').toUpperCase().includes('QA')).length;
  const p2Qa = p2Rows.filter(r => pi >= 0 && String(r[pi]||'').toUpperCase().includes('QA')).length;
  const p1QaRate = p1Count > 0 ? (p1Qa / p1Count * 100) : 0;
  const p2QaRate = p2Count > 0 ? (p2Qa / p2Count * 100) : 0;
  const qaRateDelta = (p2QaRate - p1QaRate).toFixed(1);

  // 2. QTC Supervisory Workload Gini & Balance Index
  const qtcMap = new Map();
  baseRows.forEach(r => {
    const qtc = qtc_i >= 0 ? String(r[qtc_i] || '').normalize('NFC').trim().replace(/\s+/gu, ' ') : 'Unknown';
    if (!qtc) return;
    if (!qtcMap.has(qtc)) qtcMap.set(qtc, { qtc, count: 0, objects: 0, labelers: new Set() });
    const item = qtcMap.get(qtc);
    item.count++;
    item.objects += (parseFloat(oi >= 0 ? r[oi] : 0) || 0);
    const lab = li >= 0 ? String(r[li] || '').trim() : '';
    if (lab) item.labelers.add(lab);
  });

  const qtcList = [...qtcMap.values()].map(item => ({
    qtc: item.qtc,
    count: item.count,
    objects: item.objects,
    labelerCount: item.labelers.size,
    avgPerLabeler: item.labelers.size > 0 ? (item.count / item.labelers.size).toFixed(1) : '0'
  })).sort((a,b) => b.count - a.count);

  // Compute Workload Balance Index
  let balanceScore = 100;
  let balanceStatus = 'Optimal Balance across Teams';
  let balanceTone = '#10b981';
  if (qtcList.length >= 2) {
    const counts = qtcList.map(q => q.count);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? (stdDev / mean) : 0;
    balanceScore = Math.max(10, Math.min(100, Math.round((1 - Math.min(cv, 1)) * 100)));
    if (cv < 0.30) {
      balanceStatus = 'Balanced supervisory workload distribution';
      balanceTone = '#10b981';
    } else if (cv <= 0.60) {
      balanceStatus = 'Moderate supervisory load disparity';
      balanceTone = '#f59e0b';
    } else {
      balanceStatus = 'High workload disparity detected across QTC supervisors';
      balanceTone = '#ef4444';
    }
  }

  // 3. Labeler Productivity Stability & Consistency Profiling
  const labelerDailyMap = new Map();
  baseRows.forEach(r => {
    const lab = li >= 0 ? String(r[li] || '').trim() : '';
    const d = rDate(r) || 'all';
    if (!lab) return;
    if (!labelerDailyMap.has(lab)) labelerDailyMap.set(lab, { name: lab, total: 0, totalObjects: 0, days: new Map() });
    const rec = labelerDailyMap.get(lab);
    rec.total++;
    rec.totalObjects += (parseFloat(oi >= 0 ? r[oi] : 0) || 0);
    rec.days.set(d, (rec.days.get(d) || 0) + 1);
  });

  const labelerProfiles = [...labelerDailyMap.values()].map(rec => {
    const dailyCounts = [...rec.days.values()];
    const activeDays = dailyCounts.length;
    const mean = activeDays > 0 ? (rec.total / activeDays) : 0;
    const variance = activeDays > 1 ? (dailyCounts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / activeDays) : 0;
    const std = Math.sqrt(variance);
    const consistencyScore = Math.max(10, Math.min(100, Math.round(100 - (std / Math.max(1, mean) * 45))));

    let tier = '🎯 Steady Performer';
    let tierColor = '#0284c7';
    if (rec.total >= 15 && consistencyScore >= 70) {
      tier = '🌟 Core Consistent Driver';
      tierColor = '#10b981';
    } else if (rec.total >= 15 && consistencyScore < 70) {
      tier = '⚡ High-Velocity Sprinter';
      tierColor = '#f59e0b';
    } else if (rec.total < 5) {
      tier = '🌱 Emerging / Support';
      tierColor = '#64748b';
    }

    return {
      name: rec.name,
      total: rec.total,
      totalObjects: rec.totalObjects,
      activeDays,
      avgPerDay: mean.toFixed(1),
      stabilityScore: consistencyScore,
      tier,
      tierColor
    };
  });

  const highConsistencyCount = labelerProfiles.filter(p => p.stabilityScore >= 70).length;
  const highConsistencyPct = labelerProfiles.length > 0 ? ((highConsistencyCount / labelerProfiles.length) * 100).toFixed(1) : '0';

  // 4. Facility Unit × Modality Density Matrix
  const distinctUnits = [...new Set(baseRows.map(r => fi >= 0 ? deriveFloor(r[fi]) : '').filter(Boolean))].sort();
  const modalityCategories = [
    { key: 'lidarFP', label: 'Lidar FP', match: r => isModPass(r, 'lidar', 'FP') },
    { key: 'lidarQA', label: 'Lidar QA', match: r => isModPass(r, 'lidar', 'QA') },
    { key: 'laneFP', label: 'Lane Line FP', match: r => isModPass(r, 'laneline', 'FP') },
    { key: 'laneQA', label: 'Lane Line QA', match: r => isModPass(r, 'laneline', 'QA') },
    { key: 'relabelFP', label: 'Relabeling FP', match: r => isModPass(r, 'relabeling', 'FP') }
  ];

  const unitModalityMatrix = {};
  let maxCellCount = 1;
  distinctUnits.forEach(u => {
    unitModalityMatrix[u] = {};
    modalityCategories.forEach(mc => {
      const c = baseRows.filter(r => (fi >= 0 && deriveFloor(r[fi]) === u) && mc.match(r)).length;
      unitModalityMatrix[u][mc.key] = c;
      if (c > maxCellCount) maxCellCount = c;
    });
  });

  // Top 4 Momentum KPIs
  const insightKPIs = [
    { title: 'Period Output Momentum', val: countDeltaStr, sub: p2Label + ' vs ' + p1Label, tone: countDelta >= 0 ? '#10b981' : '#ef4444' },
    { title: 'Object Velocity Delta', val: objDeltaStr, sub: 'Total annotated objects comparison', tone: objDelta >= 0 ? '#0284c7' : '#ef4444' },
    { title: 'Workload Balance Score', val: balanceScore + '%', sub: balanceStatus, tone: balanceTone },
    { title: 'Workforce Stability Rate', val: highConsistencyPct + '%', sub: highConsistencyCount + ' / ' + labelerProfiles.length + ' labelers at high consistency', tone: '#8b5cf6' }
  ];

  page.innerHTML = '<div class="ux-overview">'
    + '<div class="ux-heading">'
      + '<div>'
        + '<div class="ux-eyebrow">Enterprise Intelligence &amp; Predictive Diagnostics</div>'
        + '<h2>🔮 Advanced Operational Insights</h2>'
        + '<p>Period-over-period momentum, supervisory workload distribution, labeler productivity stability, and facility modality concentration.</p>'
      + '</div>'
      + renderHeaderControlsHTML('adv')
    + '</div>'

    + renderUniversalFilterBar('advanced_insights')

    // Top 4 Diagnostic Cards
    + '<div class="ux-grid-4">'
      + insightKPIs.map((k, idx) => '<div class="kpi-mini-card adv-kpi-card" data-idx="' + idx + '" style="--tone:' + k.tone + '; cursor:help;">'
        + '<div class="kpi-title"><span>' + esc(k.title) + '</span><span style="color:' + k.tone + '">●</span></div>'
        + '<div class="kpi-val" style="color:' + k.tone + ';">' + k.val + '</div>'
        + '<div class="kpi-sub">' + esc(k.sub) + '</div>'
      + '</div>').join('')
    + '</div>'

    // MODULE 1: Period-over-Period Performance Comparison (WoW / MoM)
    + '<div class="ux-panel" style="margin-top:20px;">'
      + '<div class="ux-heading" style="margin-bottom:14px;">'
        + '<div>'
          + '<h3 style="margin:0;">📅 Module 1: Period-over-Period Performance Comparison</h3>'
          + '<p style="margin:4px 0 0;">Comparing performance between chronological partitions (' + esc(p1Label) + ' vs ' + esc(p2Label) + ').</p>'
        + '</div>'
      + '</div>'
      + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">'
        + '<div style="background:var(--bg-2); border:1px solid var(--border); border-radius:12px; padding:18px;">'
          + '<div style="font-size:12px; font-weight:700; color:var(--text-secondary); text-transform:uppercase;">Submissions Volume Momentum</div>'
          + '<div style="display:flex; justify-content:space-between; align-items:baseline; margin:10px 0;">'
            + '<div><span style="font-size:24px; font-weight:800; color:var(--text);">' + p2Count.toLocaleString() + '</span><span style="font-size:11px; color:var(--text-secondary); margin-left:6px;">recent</span></div>'
            + '<div style="font-size:13px; font-weight:700; color:' + (countDelta >= 0 ? '#10b981' : '#ef4444') + '; background:' + (countDelta >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)') + '; padding:3px 8px; border-radius:12px;">' + countDeltaStr + '</div>'
          + '</div>'
          + '<div style="font-size:11px; color:var(--text-secondary);">Prior period: ' + p1Count.toLocaleString() + ' tasks</div>'
        + '</div>'

        + '<div style="background:var(--bg-2); border:1px solid var(--border); border-radius:12px; padding:18px;">'
          + '<div style="font-size:12px; font-weight:700; color:var(--text-secondary); text-transform:uppercase;">Object Annotations Momentum</div>'
          + '<div style="display:flex; justify-content:space-between; align-items:baseline; margin:10px 0;">'
            + '<div><span style="font-size:24px; font-weight:800; color:#0284c7;">' + p2Obj.toLocaleString() + '</span><span style="font-size:11px; color:var(--text-secondary); margin-left:6px;">objects</span></div>'
            + '<div style="font-size:13px; font-weight:700; color:' + (objDelta >= 0 ? '#0284c7' : '#ef4444') + '; background:' + (objDelta >= 0 ? 'rgba(2,132,199,0.12)' : 'rgba(239,68,68,0.12)') + '; padding:3px 8px; border-radius:12px;">' + objDeltaStr + '</div>'
          + '</div>'
          + '<div style="font-size:11px; color:var(--text-secondary);">Prior period: ' + p1Obj.toLocaleString() + ' objects</div>'
        + '</div>'

        + '<div style="background:var(--bg-2); border:1px solid var(--border); border-radius:12px; padding:18px;">'
          + '<div style="font-size:12px; font-weight:700; color:var(--text-secondary); text-transform:uppercase;">QA Verification Share</div>'
          + '<div style="display:flex; justify-content:space-between; align-items:baseline; margin:10px 0;">'
            + '<div><span style="font-size:24px; font-weight:800; color:#8b5cf6;">' + p2QaRate.toFixed(1) + '%</span><span style="font-size:11px; color:var(--text-secondary); margin-left:6px;">QA rate</span></div>'
            + '<div style="font-size:13px; font-weight:700; color:#8b5cf6; background:rgba(139,92,246,0.12); padding:3px 8px; border-radius:12px;">' + (qaRateDelta >= 0 ? '+' : '') + qaRateDelta + '% pts</div>'
          + '</div>'
          + '<div style="font-size:11px; color:var(--text-secondary);">Prior period QA rate: ' + p1QaRate.toFixed(1) + '%</div>'
        + '</div>'
      + '</div>'
    + '</div>'

    // MODULE 2: QTC Supervisory Workload Distribution
    + '<div class="ux-panel" style="margin-top:20px;">'
      + '<div class="ux-heading" style="margin-bottom:14px;">'
        + '<div>'
          + '<h3 style="margin:0;">👥 Module 2: QTC Supervisory Workload Distribution (' + qtcList.length + ' Supervisors)</h3>'
          + '<p style="margin:4px 0 0;">Output and team size distribution across QTC supervisors. Click any supervisor to filter the view.</p>'
        + '</div>'
        + '<div style="display:inline-flex; align-items:center; gap:8px; background:' + balanceTone + '18; color:' + balanceTone + '; padding:4px 12px; border-radius:20px; font-size:11px; font-weight:700;">● ' + esc(balanceStatus) + '</div>'
      + '</div>'
      + '<div style="display:grid; gap:10px;">'
        + qtcList.slice(0, 10).map(q => {
          const maxQ = qtcList[0] ? qtcList[0].count : 1;
          const pct = Math.max(2, Math.round((q.count / maxQ) * 100));
          return '<div class="adv-qtc-bar-row" data-qtc="' + esc(q.qtc) + '" style="display:flex; align-items:center; gap:14px; padding:8px 12px; border-radius:8px; background:var(--bg-2); cursor:pointer;" title="Click to filter by ' + esc(q.qtc) + '">'
            + '<div style="width:160px; font-weight:700; color:var(--primary); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">👤 ' + esc(q.qtc) + '</div>'
            + '<div style="flex:1; height:8px; border-radius:4px; background:var(--border); overflow:hidden;">'
              + '<div style="width:' + pct + '%; height:100%; background:linear-gradient(90deg, var(--primary) 0%, var(--accent) 100%);"></div>'
            + '</div>'
            + '<div style="width:70px; text-align:right; font-weight:800; font-size:12px; color:var(--text);">' + q.count.toLocaleString() + ' <span style="font-size:10px; font-weight:500; color:var(--text-secondary);">tasks</span></div>'
            + '<div style="width:90px; text-align:right; font-size:11px; color:var(--text-secondary);">' + q.labelerCount + ' labelers</div>'
            + '<div style="width:90px; text-align:right; font-size:11px; color:var(--primary); font-weight:600;">' + q.avgPerLabeler + ' avg/lab</div>'
          + '</div>';
        }).join('')
      + '</div>'
    + '</div>'

    // MODULE 3: Labeler Productivity Consistency Matrix
    + '<div class="ux-panel" style="margin-top:20px;">'
      + '<div class="ux-heading" style="margin-bottom:14px;">'
        + '<div>'
          + '<h3 style="margin:0;">🎯 Module 3: Labeler Productivity Stability &amp; Consistency Profiling</h3>'
          + '<p style="margin:4px 0 0;">Statistical stability scores evaluating daily output predictability and reliable contributors.</p>'
        + '</div>'
      + '</div>'
      + '<div class="perf-table">'
        + '<table>'
          + '<thead><tr>'
            + '<th>Labeler Name</th>'
            + '<th>Performance Classification</th>'
            + '<th style="text-align:center;">Stability Score</th>'
            + '<th style="text-align:center;">Total Submits</th>'
            + '<th style="text-align:center;">Total Objects</th>'
            + '<th style="text-align:center;">Active Days</th>'
            + '<th style="text-align:center;">Daily Velocity</th>'
            + '<th>Action</th>'
          + '</tr></thead>'
          + '<tbody>'
            + labelerProfiles.slice(0, 15).map(lp => `
              <tr style="border-bottom:1px solid var(--border);" onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background='transparent'">
                <td style="padding:10px 14px; font-weight:700; color:var(--text);">👤 ${esc(lp.name)}</td>
                <td style="padding:10px 14px;"><span style="display:inline-block; font-size:11px; font-weight:700; padding:3px 10px; border-radius:12px; background:${lp.tierColor}18; color:${lp.tierColor};">● ${lp.tier}</span></td>
                <td style="padding:10px 14px; text-align:center;">
                  <div style="display:inline-flex; align-items:center; gap:6px;">
                    <div style="width:40px; height:5px; border-radius:3px; background:var(--border); overflow:hidden;">
                      <div style="width:${lp.stabilityScore}%; height:100%; background:${lp.stabilityScore >= 70 ? '#10b981' : '#f59e0b'};"></div>
                    </div>
                    <b>${lp.stabilityScore}%</b>
                  </div>
                </td>
                <td style="padding:10px 14px; text-align:center; font-weight:800; color:var(--primary);">${lp.total.toLocaleString()}</td>
                <td style="padding:10px 14px; text-align:center; font-weight:700; color:#0284c7;">${lp.totalObjects.toLocaleString()}</td>
                <td style="padding:10px 14px; text-align:center; color:var(--text-secondary);">${lp.activeDays} days</td>
                <td style="padding:10px 14px; text-align:center; font-weight:700; color:var(--text);">${lp.avgPerDay} / day</td>
                <td style="padding:10px 14px;"><button class="btn btn-c adv-drilldown-btn" data-labeler="${esc(lp.name)}" style="font-size:10px; padding:3px 8px;">🔍 Profile</button></td>
              </tr>
            `).join('')
          + '</tbody>'
        + '</table>'
      + '</div>'
    + '</div>'

    // MODULE 4: Facility Unit × Modality Density Matrix
    + '<div class="ux-panel" style="margin-top:20px;">'
      + '<div class="ux-heading" style="margin-bottom:14px;">'
        + '<div>'
          + '<h3 style="margin:0;">🏢 Module 4: Facility Unit (Floor) × Modality Density Matrix</h3>'
          + '<p style="margin:4px 0 0;">Volume distribution across Facility Units and Modality Pass types. Click any cell to filter.</p>'
        + '</div>'
      + '</div>'
      + '<div style="overflow-x:auto;">'
        + '<table style="width:100%; border-collapse:collapse; font-size:12px; text-align:center;">'
          + '<thead><tr style="background:var(--bg-2); border-bottom:1px solid var(--border);"><th style="padding:10px 14px; text-align:left;">Facility Unit</th>'
            + modalityCategories.map(mc => '<th style="padding:10px 14px;">' + mc.label + '</th>').join('')
            + '<th style="padding:10px 14px; font-weight:700;">Total Unit Volume</th>'
          + '</tr></thead>'
          + '<tbody>'
            + distinctUnits.map(u => {
              let rowSum = 0;
              return '<tr style="border-bottom:1px solid var(--border);">'
                + '<td style="padding:10px 14px; text-align:left; font-weight:700; color:var(--accent);">🏢 Unit ' + esc(u) + '</td>'
                + modalityCategories.map(mc => {
                  const c = unitModalityMatrix[u][mc.key] || 0;
                  rowSum += c;
                  const ratio = maxCellCount > 0 ? (c / maxCellCount) : 0;
                  const bg = c > 0 ? 'rgba(13,148,136,' + Math.max(0.10, ratio * 0.70).toFixed(2) + ')' : 'transparent';
                  return '<td class="adv-mod-cell" data-unit="' + esc(u) + '" data-mod="' + mc.key + '" style="padding:10px 14px; background:' + bg + '; font-weight:' + (c > 0 ? '700' : '400') + '; color:var(--text); cursor:pointer;" title="Click to filter Unit ' + esc(u) + ' ' + mc.label + '">' + c.toLocaleString() + '</td>';
                }).join('')
                + '<td style="padding:10px 14px; font-weight:800; color:var(--primary); font-size:13px;">' + rowSum.toLocaleString() + '</td>'
              + '</tr>';
            }).join('')
          + '</tbody>'
        + '</table>'
      + '</div>'
    + '</div>'
  + '</div>';

  bindHeaderControls(page, 'adv');
  bindUniversalFilterBar(page, 'advanced_insights');

  // Interactive bindings
  page.querySelectorAll('.adv-qtc-bar-row').forEach(row => {
    row.onclick = () => {
      const qtc = row.dataset.qtc;
      if (qtc && typeof qtcFloorFilters !== 'undefined') {
        qtcFloorFilters.qtc = qtc;
        location.hash = 'performance-qtc-floor';
      }
    };
  });

  page.querySelectorAll('.adv-drilldown-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const lab = btn.dataset.labeler;
      if (lab && typeof openLabelerDetailModal === 'function') openLabelerDetailModal(lab);
    };
  });

  page.querySelectorAll('.adv-mod-cell').forEach(cell => {
    cell.onclick = () => {
      const u = cell.dataset.unit;
      const mod = cell.dataset.mod;
      if (typeof qtcFloorFilters !== 'undefined') {
        qtcFloorFilters.floor = u;
        qtcFloorFilters.category = mod;
        location.hash = 'performance-qtc-floor';
      }
    };
  });

  // KPI card tooltips
  page.querySelectorAll('.adv-kpi-card').forEach((card, idx) => {
    const k = insightKPIs[idx];
    if (k) {
      MeegTooltip.attach(card, () => ({
        title: k.title,
        badge: 'Diagnostic Metric',
        desc: k.sub,
        rows: [
          { label: 'Current Score', value: k.val, color: k.tone }
        ]
      }));
    }
  });
}

window.renderAdvancedInsights = renderAdvancedInsights;

renderAllSections=function(){
  document.querySelectorAll('#shiftBanner, #fstrip, .pills-row, #locTabs, #mainContent, #cmpBar').forEach(el => {
    el.style.setProperty('display', 'none', 'important');
  });
  renderSharedPeriods();
  renderOverview();
  renderAnalysis();
  renderQueuesAnalysis();
  renderGmReport();
  renderShiftComparison();
  renderPerformance();
  renderQtcFloorPerformance();
  renderDailyReport();
  renderAdvancedInsights();
};



// Immediate instant hydration check on script load

try{

 idbGet('csv-two-sources-v1').then(cached=>{

   if(cached&&cached.v===AUTH_VER&&cached.text&&!rawRows.length){

     parseCSVAsync(cached.text).then(table=>{

       if(!rawRows.length&&table&&table.length){

         onCsvTable(table);

         renderAllSections();

       }

     }).catch(()=>{});

   }

 }).catch(()=>{});

}catch(e){}



window.loadData = loadData;
route();
renderSharedPeriods();
})();



function openQueueDetailModal(queueName) {
  const allRows = rowsInView();
  const qi = hdrs.findIndex(h => h.toLowerCase() === 'queue name');
  const qRows = allRows.filter(r => qi >= 0 && String(r[qi] || '').trim() === queueName);
  if (!qRows.length) {
    showToast('No record history found for queue: ' + queueName);
    return;
  }

  const si = hdrs.findIndex(h => h.toLowerCase() === 'shift');
  const fi = hdrs.findIndex(h => ['floor', 'unit'].includes(h.toLowerCase()));
  const qci = hdrs.findIndex(h => h.toLowerCase() === 'qtc name');
  const li = hdrs.findIndex(h => h.toLowerCase() === 'labeler name');
  const oi = hdrs.findIndex(h => ['object count', 'object_count', 'objects'].includes(h.toLowerCase()));
  const ti = hdrs.findIndex(h => ['task id', 'id'].includes(h.toLowerCase()));
  const tsIdx = hdrs.findIndex(h => ['timestamp', 'created at', 'date'].includes(h.toLowerCase()));
  const ni = hdrs.findIndex(h => h.toLowerCase() === 'national id');

  const totalTasks = qRows.length;
  const totalObjects = qRows.reduce((n, r) => n + (parseFloat(oi >= 0 ? r[oi] : 0) || 0), 0);
  const uniqueLabelers = uniq(qRows, 'Labeler Name') || 0;
  const uniqueQtcs = uniq(qRows, 'QTC Name') || 0;

  const lFP = qRows.filter(r => isModPass(r, 'lidar', 'FP')).length;
  const lQA = qRows.filter(r => isModPass(r, 'lidar', 'QA')).length;
  const lnFP = qRows.filter(r => isModPass(r, 'laneline', 'FP')).length;
  const lnQA = qRows.filter(r => isModPass(r, 'laneline', 'QA')).length;

  const shifts = [...new Set(qRows.map(r => si >= 0 ? String(r[si] || '').trim() : '').filter(Boolean))].sort();
  const floors = [...new Set(qRows.map(r => fi >= 0 ? deriveFloor(r[fi]) : '').filter(Boolean))].sort();

  // Daily map
  const dateMap = new Map();
  qRows.forEach(r => { const d = rDate(r); if (d) dateMap.set(d, (dateMap.get(d) || 0) + 1); });
  const sortedDates = [...dateMap.keys()].sort();
  const maxDay = Math.max(1, ...dateMap.values());

  let modal = $('uxQueueDetailModal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'uxQueueDetailModal';
  modal.className = 'modal-overlay show';
  modal.style.cssText = 'display:flex; position:fixed; inset:0; background:rgba(15,23,42,0.7); backdrop-filter:blur(4px); z-index:9999; align-items:center; justify-content:center; padding:16px;';

  modal.innerHTML = '<div class="modal-box" style="width:100%; max-width:850px; max-height:90vh; overflow-y:auto; background:var(--bg-1); border-radius:14px; border:1px solid var(--border); box-shadow:0 24px 48px rgba(0,0,0,0.3);">'
    + '<div class="modal-hd" style="display:flex; justify-content:space-between; align-items:center; padding:16px 22px; border-bottom:1px solid var(--border); background:var(--bg-2);">'
      + '<div>'
        + '<div style="font-size:11px; font-weight:700; color:var(--primary); text-transform:uppercase;">Queue Deep-Dive · Turso Verified</div>'
        + '<h3 style="margin:2px 0 0; font-size:17px; color:var(--text);">' + esc(queueName) + '</h3>'
      + '</div>'
      + '<button class="modal-close" id="closeQModalBtn" style="background:none; border:none; font-size:20px; cursor:pointer; color:var(--text-soft);">&times;</button>'
    + '</div>'
    + '<div class="modal-bd" style="padding:20px 22px;">'
      // KPI Grid
      + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-bottom:18px;">'
        + '<div style="background:var(--bg-2); padding:10px; border-radius:8px; border:1px solid var(--border); text-align:center;"><div class="ux-note">Total Tasks</div><div style="font-size:18px; font-weight:800; color:var(--primary);">' + totalTasks.toLocaleString() + '</div></div>'
        + '<div style="background:var(--bg-2); padding:10px; border-radius:8px; border:1px solid var(--border); text-align:center;"><div class="ux-note">Total Objects</div><div style="font-size:18px; font-weight:800; color:#0284c7;">' + totalObjects.toLocaleString() + '</div></div>'
        + '<div style="background:var(--bg-2); padding:10px; border-radius:8px; border:1px solid var(--border); text-align:center;"><div class="ux-note">Unique Labelers</div><div style="font-size:18px; font-weight:800; color:#0a9d8c;">' + uniqueLabelers.toLocaleString() + '</div></div>'
        + '<div style="background:var(--bg-2); padding:10px; border-radius:8px; border:1px solid var(--border); text-align:center;"><div class="ux-note">Unique QTCs</div><div style="font-size:18px; font-weight:800; color:#df8b24;">' + uniqueQtcs.toLocaleString() + '</div></div>'
        + '<div style="background:var(--bg-2); padding:10px; border-radius:8px; border:1px solid var(--border); text-align:center;"><div class="ux-note">Units Covered</div><div style="font-size:18px; font-weight:800; color:var(--text);">' + floors.length + '</div></div>'
      + '</div>'
      // Stage Breakdown Box
      + '<div style="background:var(--bg-2); padding:12px 16px; border-radius:10px; margin-bottom:18px; border:1px solid var(--border);">'
        + '<div style="font-weight:700; font-size:12px; margin-bottom:8px; color:var(--text);">Workstream Distribution:</div>'
        + '<div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; text-align:center; font-size:12px;">'
          + '<div style="background:var(--bg-3); padding:8px; border-radius:6px; border-left:3px solid #0d9488;"><span class="ux-note">Lidar FP</span><div style="font-weight:700; color:#0d9488;">' + lFP.toLocaleString() + '</div></div>'
          + '<div style="background:var(--bg-3); padding:8px; border-radius:6px; border-left:3px solid #14b8a6;"><span class="ux-note">Lidar QA</span><div style="font-weight:700; color:#14b8a6;">' + lQA.toLocaleString() + '</div></div>'
          + '<div style="background:var(--bg-3); padding:8px; border-radius:6px; border-left:3px solid #ed9a35;"><span class="ux-note">Lane Line FP</span><div style="font-weight:700; color:#ed9a35;">' + lnFP.toLocaleString() + '</div></div>'
          + '<div style="background:var(--bg-3); padding:8px; border-radius:6px; border-left:3px solid #ec4899;"><span class="ux-note">Lane Line QA</span><div style="font-weight:700; color:#ec4899;">' + lnQA.toLocaleString() + '</div></div>'
        + '</div>'
      + '</div>'
      // Daily Trend Sparkline Bars
      + '<div style="margin-bottom:18px;">'
        + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;"><span style="font-weight:700; font-size:12px;">Daily Activity Timeline (' + sortedDates.length + ' active dates)</span><span class="ux-note">Peak: ' + maxDay.toLocaleString() + ' tasks</span></div>'
        + '<div class="ux-bars" style="height:90px;">'
          + (sortedDates.length ? sortedDates.map(d => '<button class="ux-bar" style="height:' + Math.max(8, ((dateMap.get(d)||0) / maxDay) * 100) + '%;" title="' + d + ': ' + (dateMap.get(d)||0) + ' tasks"></button>').join('') : '<div class="ux-empty">No dated submissions</div>')
        + '</div>'
        + '<div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-soft); margin-top:4px;"><span>' + (sortedDates[0] || '') + '</span><span>' + (sortedDates[sortedDates.length - 1] || '') + '</span></div>'
      + '</div>'
      // Recent Tasks Sample Table
      + '<div style="border-top:1px solid var(--border); padding-top:14px;">'
        + '<div style="font-weight:700; font-size:12px; margin-bottom:8px;">Recent Submissions Sample:</div>'
        + '<div style="max-height:220px; overflow-y:auto; border:1px solid var(--border); border-radius:8px;">'
          + '<table style="width:100%; border-collapse:collapse; font-size:11px; text-align:left;">'
            + '<thead><tr style="background:var(--bg-2); position:sticky; top:0;"><th style="padding:6px 10px;">Date</th><th style="padding:6px 10px;">Labeler</th><th style="padding:6px 10px;">Shift</th><th style="padding:6px 10px;">Unit</th><th style="padding:6px 10px;">Stage</th><th style="padding:6px 10px; text-align:right;">Objects</th></tr></thead>'
            + '<tbody>'
              + qRows.slice(0, 30).map(r => '<tr style="border-bottom:1px solid var(--border);"><td style="padding:5px 10px;">' + (tsIdx >= 0 ? esc(r[tsIdx]) : '') + '</td><td style="padding:5px 10px; font-weight:600;">' + (li >= 0 ? esc(r[li]) : '') + '</td><td style="padding:5px 10px;">' + (si >= 0 ? esc(r[si]) : '') + '</td><td style="padding:5px 10px;">Unit ' + (fi >= 0 ? esc(deriveFloor(r[fi])) : '') + '</td><td style="padding:5px 10px;">' + esc(r[hdrs.findIndex(h=>h.toLowerCase()==='pass')]||'') + '</td><td style="padding:5px 10px; text-align:right; font-weight:700;">' + (oi >= 0 ? esc(r[oi]) : '0') + '</td></tr>').join('')
            + '</tbody>'
          + '</table>'
        + '</div>'
      + '</div>'
    + '</div>'
  + '</div>';

  document.body.appendChild(modal);
  const hide = () => modal.remove();
  modal.querySelector('#closeQModalBtn').onclick = hide;
  modal.onclick = e => { if (e.target === modal) hide(); };
}
window.openQueueDetailModal = openQueueDetailModal;

// ============================================================
// EMPLOYEE PERFORMANCE DRILLDOWN MODAL & DATA BUILDER
// ============================================================

function findColIndex(aliases) {
  const headers = (typeof hdrs !== 'undefined' && hdrs && hdrs.length)
    ? hdrs
    : ((typeof window !== 'undefined' && window.hdrs && window.hdrs.length)
      ? window.hdrs
      : ((typeof global !== 'undefined' && global.hdrs && global.hdrs.length) ? global.hdrs : []));
  if (!headers || !headers.length) return -1;
  const list = Array.isArray(aliases) ? aliases : [aliases];
  return headers.findIndex(h => {
    const clean = String(h || '').trim().toLowerCase().replace(/[_s]+/g, ' ');
    return list.some(a => {
      const aClean = String(a).trim().toLowerCase().replace(/[_s]+/g, ' ');
      return clean === aClean || clean.includes(aClean);
    });
  });
}

function buildEmployeeRecordFromData(personKey) {
  if (!personKey) return null;
  const normKey = String(personKey).trim().toLowerCase();
  if (!normKey) return null;

  const sourceRows = (typeof rawRows !== 'undefined' && rawRows && rawRows.length)
    ? rawRows
    : ((typeof window !== 'undefined' && window.rawRows && window.rawRows.length)
      ? window.rawRows
      : ((typeof fcache !== 'undefined' && fcache && fcache.length)
        ? fcache
        : ((typeof window !== 'undefined' && window.fcache && window.fcache.length)
          ? window.fcache
          : ((typeof global !== 'undefined' && global.rawRows && global.rawRows.length)
            ? global.rawRows
            : ((typeof rowsInView === 'function') ? rowsInView() : [])))));
  if (!sourceRows || !sourceRows.length) return null;

  const ni = findColIndex(['national id', 'nid', 'national_id', 'nationalid']);
  const li = findColIndex(['labeler name', 'labeler_name', 'labeler', 'name']);
  const si = findColIndex(['shift', 'shift_name']);
  const fi = findColIndex(['floor', 'unit']);
  const qcI = findColIndex(['qtc name', 'qtc_name', 'qtc']);
  const qi = findColIndex(['queue name', 'queue_name', 'queue']);
  const pcI = findColIndex(['pc no', 'pc_no', 'pc']);
  const mi = findColIndex(['modality']);
  const pi = findColIndex(['pass', 'stage']);
  const ti = findColIndex(['task id', 'task_id', 'id']);
  const oi = findColIndex(['object count', 'object_count', 'objects']);
  const tlIdx = findColIndex(['task link', 'task_link', 'link']);

  let resolvedName = '';
  let resolvedId = '';
  let resolvedPc = '';
  const matchingTasks = [];
  const shifts = new Set();
  const units = new Set();
  const qtcs = new Set();
  const queues = new Set();
  const dates = new Set();
  let totalObjects = 0;
  let largestTask = 0;
  let lidarFP = 0, lidarQA = 0, laneFP = 0, laneQA = 0;

  sourceRows.forEach(r => {
    const rawName = li >= 0 ? String(r[li] || '').trim() : '';
    const rawId = ni >= 0 ? String(r[ni] || '').trim() : '';
    const nameMatch = rawName && (rawName.toLowerCase() === normKey || rawName.toLowerCase().includes(normKey) || normKey.includes(rawName.toLowerCase()));
    const idMatch = rawId && (rawId === personKey || rawId.toLowerCase() === normKey);

    if (!nameMatch && !idMatch) return;

    if (!resolvedName && rawName) resolvedName = rawName;
    if (!resolvedId && rawId) resolvedId = rawId;
    if (!resolvedPc && pcI >= 0 && r[pcI]) resolvedPc = String(r[pcI]).trim();

    const objCount = parseFloat(oi >= 0 ? r[oi] : 0) || 0;
    totalObjects += objCount;
    if (objCount > largestTask) largestTask = objCount;

    if (si >= 0 && r[si]) shifts.add(r[si]);
    const flVal = fi >= 0 ? (typeof deriveFloor === 'function' ? deriveFloor(r[fi]) : r[fi]) : '';
    if (flVal) units.add(flVal);
    if (qcI >= 0 && r[qcI]) qtcs.add(r[qcI]);
    if (qi >= 0 && r[qi]) queues.add(r[qi]);

    const d = typeof rDate === 'function' ? rDate(r) : '';
    if (d) dates.add(d);

    if (typeof isModPass === 'function') {
      if (isModPass(r, 'lidar', 'FP')) lidarFP++;
      if (isModPass(r, 'lidar', 'QA')) lidarQA++;
      if (isModPass(r, 'laneline', 'FP')) laneFP++;
      if (isModPass(r, 'laneline', 'QA')) laneQA++;
    }

    matchingTasks.push({
      id: ti >= 0 ? r[ti] : '—',
      date: d || 'Unknown',
      shift: si >= 0 ? r[si] : '—',
      unit: flVal || '—',
      queue: qi >= 0 ? r[qi] : '—',
      qtc: qcI >= 0 ? r[qcI] : '—',
      mod: mi >= 0 ? r[mi] : '—',
      pass: pi >= 0 ? r[pi] : '—',
      objects: objCount,
      link: tlIdx >= 0 ? r[tlIdx] : ''
    });
  });

  if (!matchingTasks.length) return null;

  const finalName = resolvedName || (resolvedId ? ('Labeler ' + resolvedId.slice(-4)) : personKey);
  const maskedId = typeof maskEmployeeId === 'function' ? maskEmployeeId(resolvedId, resolvedPc || finalName) : resolvedId;

  return {
    key: personKey,
    name: finalName,
    rawId: resolvedId,
    maskedId,
    shifts,
    units,
    qtcs,
    queues,
    dates,
    tasks: matchingTasks,
    total: matchingTasks.length,
    totalObjects,
    largestTask,
    lidarFP,
    lidarQA,
    laneFP,
    laneQA
  };
}
window.buildEmployeeRecordFromData = buildEmployeeRecordFromData;

function openLabelerDetailModal(personKey) {
  if (!personKey) return;
  let p = null;
  const peopleMap = window._allPeoplePerfMap;

  if (peopleMap && peopleMap.size) {
    if (peopleMap.has(personKey)) {
      p = peopleMap.get(personKey);
    } else {
      const norm = String(personKey).trim().toLowerCase();
      if (peopleMap.has(norm)) {
        p = peopleMap.get(norm);
      } else {
        for (const item of peopleMap.values()) {
          if (item.key === norm || (item.name && item.name.toLowerCase() === norm) || item.rawId === personKey || item.maskedId === personKey) {
            p = item;
            break;
          }
        }
      }
    }
  }

  // Fallback: build employee record directly from database
  if (!p) {
    p = buildEmployeeRecordFromData(personKey);
  }

  if (!p) {
    if (typeof showToast === 'function') {
      showToast('Could not load employee details for: ' + personKey);
    } else {
      alert('Could not load employee details for: ' + personKey);
    }
    return;
  }

  let modal = document.getElementById('uxLabelerDetailModal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'uxLabelerDetailModal';
  modal.className = 'modal-overlay show';
  modal.style.cssText = 'display:flex; position:fixed; inset:0; background:rgba(15,23,42,0.75); backdrop-filter:blur(5px); z-index:999999; align-items:center; justify-content:center; padding:16px;';

  const shiftsStr = [...p.shifts].map(esc).join(', ') || '—';
  const unitsStr = [...p.units].map(u => 'Unit ' + esc(u)).join(', ') || '—';
  const qtcsStr = [...p.qtcs].map(esc).join(', ') || '—';
  const queuesStr = [...p.queues].map(esc).join(', ') || '—';

  // Daily points
  const dateCounts = new Map();
  p.tasks.forEach(t => { if (t.date && t.date !== 'Unknown') dateCounts.set(t.date, (dateCounts.get(t.date)||0) + 1); });
  const sortedDates = [...dateCounts.keys()].sort();
  const maxDay = Math.max(1, ...dateCounts.values());

  modal.innerHTML = '<div class="modal-box" style="width:100%; max-width:920px; max-height:92vh; display:flex; flex-direction:column; background:var(--bg-1, #1e293b); border-radius:14px; border:1px solid var(--border, #334155); box-shadow:0 24px 48px rgba(0,0,0,0.5); overflow:hidden;">'
    + '<div class="modal-hd" style="display:flex; justify-content:space-between; align-items:center; padding:16px 22px; border-bottom:1px solid var(--border, #334155); background:var(--bg-2, #0f172a); flex-shrink:0;">'
      + '<div>'
        + '<div style="font-size:11px; font-weight:700; color:var(--primary, #0284c7); text-transform:uppercase; letter-spacing:0.5px;">Employee Performance Intelligence · ID Masked</div>'
        + '<h3 style="margin:2px 0 0; font-size:18px; color:var(--text, #f8fafc); font-weight:700;">' + esc(p.name) + ' <span style="font-family:monospace; font-size:12px; color:var(--text-soft, #94a3b8); font-weight:400;">(' + esc(p.maskedId) + ')</span></h3>'
      + '</div>'
      + '<button class="modal-close" id="closeLabModalBtn" style="background:none; border:none; font-size:24px; cursor:pointer; color:var(--text-soft, #94a3b8); line-height:1; padding:4px 8px;">&times;</button>'
    + '</div>'
    + '<div class="modal-bd" style="padding:20px 22px; overflow-y:auto; flex:1;">'
      // Stats KPI Grid
      + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-bottom:18px;">'
        + '<div style="background:var(--bg-2, #0f172a); padding:10px; border-radius:8px; border:1px solid var(--border, #334155); text-align:center;"><div class="ux-note">Total Objects</div><div style="font-size:18px; font-weight:800; color:#0284c7;">' + p.totalObjects.toLocaleString() + '</div></div>'
        + '<div style="background:var(--bg-2, #0f172a); padding:10px; border-radius:8px; border:1px solid var(--border, #334155); text-align:center;"><div class="ux-note">Total Tasks</div><div style="font-size:18px; font-weight:800; color:var(--primary, #0d9488);">' + p.total.toLocaleString() + '</div></div>'
        + '<div style="background:var(--bg-2, #0f172a); padding:10px; border-radius:8px; border:1px solid var(--border, #334155); text-align:center;"><div class="ux-note">Avg Obj / Task</div><div style="font-size:18px; font-weight:800; color:var(--accent, #f59e0b);">' + (p.total > 0 ? (p.totalObjects/p.total).toFixed(1) : 0) + '</div></div>'
        + '<div style="background:var(--bg-2, #0f172a); padding:10px; border-radius:8px; border:1px solid var(--border, #334155); text-align:center;"><div class="ux-note">Active Days</div><div style="font-size:18px; font-weight:800; color:var(--text, #f8fafc);">' + p.dates.size + '</div></div>'
        + '<div style="background:var(--bg-2, #0f172a); padding:10px; border-radius:8px; border:1px solid var(--border, #334155); text-align:center;"><div class="ux-note">Avg Tasks/Day</div><div style="font-size:18px; font-weight:800; color:#10b981;">' + (p.dates.size > 0 ? (p.total/p.dates.size).toFixed(1) : 0) + '</div></div>'
      + '</div>'
      // Modality Breakdown Grid
      + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-bottom:18px;">'
        + '<div style="background:var(--bg-2, #0f172a); padding:8px; border-radius:8px; border:1px solid var(--border, #334155); text-align:center;"><div class="ux-note" style="color:#0d9488;">Lidar FP</div><div style="font-size:15px; font-weight:700; color:#0d9488;">' + (p.lidarFP || 0).toLocaleString() + '</div></div>'
        + '<div style="background:var(--bg-2, #0f172a); padding:8px; border-radius:8px; border:1px solid var(--border, #334155); text-align:center;"><div class="ux-note" style="color:#14b8a6;">Lidar QA</div><div style="font-size:15px; font-weight:700; color:#14b8a6;">' + (p.lidarQA || 0).toLocaleString() + '</div></div>'
        + '<div style="background:var(--bg-2, #0f172a); padding:8px; border-radius:8px; border:1px solid var(--border, #334155); text-align:center;"><div class="ux-note" style="color:#ed9a35;">Lane FP</div><div style="font-size:15px; font-weight:700; color:#ed9a35;">' + (p.laneFP || 0).toLocaleString() + '</div></div>'
        + '<div style="background:var(--bg-2, #0f172a); padding:8px; border-radius:8px; border:1px solid var(--border, #334155); text-align:center;"><div class="ux-note" style="color:#ec4899;">Lane QA</div><div style="font-size:15px; font-weight:700; color:#ec4899;">' + (p.laneQA || 0).toLocaleString() + '</div></div>'
      + '</div>'
      // Operational Context Meta Box
      + '<div style="background:var(--bg-2, #0f172a); padding:12px 16px; border-radius:10px; margin-bottom:18px; border:1px solid var(--border, #334155); font-size:12px; display:grid; grid-template-columns:1fr 1fr; gap:10px;">'
        + '<div><b>Shifts:</b> <span class="ux-note">' + shiftsStr + '</span></div>'
        + '<div><b>Floors / Units:</b> <span class="ux-note">' + unitsStr + '</span></div>'
        + '<div><b>QTC Supervisors:</b> <span class="ux-note">' + qtcsStr + '</span></div>'
        + '<div><b>Active Queues:</b> <span class="ux-note">' + queuesStr + '</span></div>'
      + '</div>'
      // Daily Production Trend
      + '<div style="margin-bottom:18px;">'
        + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;"><span style="font-weight:700; font-size:12px;">Daily Output Timeline (' + sortedDates.length + ' active dates)</span><span class="ux-note">Peak: ' + maxDay + ' tasks</span></div>'
        + '<div class="ux-bars" style="height:80px; display:flex; align-items:flex-end; gap:3px;">'
          + (sortedDates.length ? sortedDates.map(d => '<div style="flex:1; height:' + Math.max(8, ((dateCounts.get(d)||0) / maxDay) * 100) + '%; background:#0d9488; border-radius:2px 2px 0 0;" title="' + d + ': ' + (dateCounts.get(d)||0) + ' tasks"></div>').join('') : '<div class="ux-empty">No dated tasks</div>')
        + '</div>'
        + '<div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-soft, #94a3b8); margin-top:4px;"><span>' + (sortedDates[0] || '') + '</span><span>' + (sortedDates[sortedDates.length - 1] || '') + '</span></div>'
      + '</div>'
      // Searchable Task History Table
      + '<div style="border-top:1px solid var(--border, #334155); padding-top:14px;">'
        + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">'
          + '<div style="font-weight:700; font-size:13px;">Task History (' + p.tasks.length + ' tasks):</div>'
          + '<input id="labTaskSearch" placeholder="Filter tasks by date, queue, stage…" style="padding:6px 12px; border-radius:6px; border:1px solid var(--border, #334155); font-size:11px; width:220px; background:var(--bg-3, #0f172a); color:var(--text, #f8fafc);">'
        + '</div>'
        + '<div style="max-height:260px; overflow-y:auto; border:1px solid var(--border, #334155); border-radius:8px;">'
          + '<table style="width:100%; border-collapse:collapse; font-size:11px; text-align:left;">'
            + '<thead><tr style="background:var(--bg-2, #0f172a); position:sticky; top:0;"><th style="padding:6px 10px;">Task ID</th><th style="padding:6px 10px;">Date</th><th style="padding:6px 10px;">Shift</th><th style="padding:6px 10px;">Queue</th><th style="padding:6px 10px;">Unit</th><th style="padding:6px 10px;">QTC</th><th style="padding:6px 10px;">Stage</th><th style="padding:6px 10px; text-align:right;">Objects</th><th style="padding:6px 10px; text-align:center;">Link</th></tr></thead>'
            + '<tbody id="labTaskTableBody">'
              + p.tasks.map(t => '<tr style="border-bottom:1px solid var(--border, #334155);"><td style="padding:5px 10px; font-weight:600;">' + esc(t.id) + '</td><td style="padding:5px 10px;">' + esc(t.date) + '</td><td style="padding:5px 10px;">' + esc(t.shift) + '</td><td style="padding:5px 10px;">' + esc(t.queue) + '</td><td style="padding:5px 10px;">Unit ' + esc(t.unit) + '</td><td style="padding:5px 10px;">' + esc(t.qtc) + '</td><td style="padding:5px 10px;">' + esc(t.pass) + '</td><td style="padding:5px 10px; text-align:right; font-weight:700; color:#0284c7;">' + esc(t.objects) + '</td><td style="padding:5px 10px; text-align:center;">' + (t.link ? '<a href="' + esc(t.link) + '" target="_blank" rel="noopener noreferrer" style="color:var(--primary, #38bdf8);">🔗 Open</a>' : '—') + '</td></tr>').join('')
            + '</tbody>'
          + '</table>'
        + '</div>'
      + '</div>'
    + '</div>'
  + '</div>';

  document.body.appendChild(modal);

  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const hide = () => {
    document.body.style.overflow = prevOverflow;
    document.removeEventListener('keydown', onEsc);
    if (modal && modal.parentNode) modal.remove();
  };

  const onEsc = (e) => {
    if (e.key === 'Escape') hide();
  };
  document.addEventListener('keydown', onEsc);

  const closeBtn = modal.querySelector('#closeLabModalBtn');
  if (closeBtn) closeBtn.onclick = hide;
  modal.onclick = e => { if (e.target === modal) hide(); };

  // Task filter inside modal
  const sInput = modal.querySelector('#labTaskSearch');
  if (sInput) {
    sInput.oninput = e => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = p.tasks.filter(t => !q || [t.id, t.date, t.shift, t.queue, t.unit, t.qtc, t.pass, String(t.objects)].some(v => String(v).toLowerCase().includes(q)));
      const tbody = modal.querySelector('#labTaskTableBody');
      if (tbody) {
        tbody.innerHTML = filtered.map(t => '<tr style="border-bottom:1px solid var(--border, #334155);"><td style="padding:5px 10px; font-weight:600;">' + esc(t.id) + '</td><td style="padding:5px 10px;">' + esc(t.date) + '</td><td style="padding:5px 10px;">' + esc(t.shift) + '</td><td style="padding:5px 10px;">' + esc(t.queue) + '</td><td style="padding:5px 10px;">Unit ' + esc(t.unit) + '</td><td style="padding:5px 10px;">' + esc(t.qtc) + '</td><td style="padding:5px 10px;">' + esc(t.pass) + '</td><td style="padding:5px 10px; text-align:right; font-weight:700; color:#0284c7;">' + esc(t.objects) + '</td><td style="padding:5px 10px; text-align:center;">' + (t.link ? '<a href="' + esc(t.link) + '" target="_blank" rel="noopener noreferrer" style="color:var(--primary, #38bdf8);">🔗 Open</a>' : '—') + '</td></tr>').join('');
      }
    };
  }
}
window.openLabelerDetailModal = openLabelerDetailModal;

// Document-level event delegation for drill-down buttons
if (typeof document !== 'undefined') {
  document.addEventListener('click', function(e) {
    const drillBtn = e.target.closest('.lab-drill-btn');
    if (drillBtn) {
      e.stopPropagation();
      const pKey = drillBtn.dataset.personKey || drillBtn.getAttribute('data-person-key');
      if (pKey && typeof window.openLabelerDetailModal === 'function') {
        window.openLabelerDetailModal(pKey);
        return;
      }
    }
    const labRow = e.target.closest('.labeler-row-item');
    if (labRow && !e.target.closest('button, a, input, select')) {
      const pKey = labRow.dataset.personKey || labRow.getAttribute('data-person-key');
      if (pKey && typeof window.openLabelerDetailModal === 'function') {
        window.openLabelerDetailModal(pKey);
        return;
      }
    }
  });
}

// ============================================================
// GLOBAL UNIFIED METRIC & ELEMENT TOOLTIP ENGINE
// ============================================================
let _metiTooltipEl = null;

function initGlobalTooltipEngine() {
  if (typeof document === 'undefined') return;
  if (_metiTooltipEl) return;

  _metiTooltipEl = document.createElement('div');
  _metiTooltipEl.id = 'metiGlobalTooltip';
  _metiTooltipEl.className = 'meti-global-tooltip';
  _metiTooltipEl.style.cssText = 'position:fixed; z-index:999999; display:none; pointer-events:none; background:#0f172a; color:#f8fafc; border:1px solid #334155; border-radius:10px; box-shadow:0 12px 28px -4px rgba(0,0,0,0.7); padding:12px 14px; font-size:12px; line-height:1.45; min-width:240px; max-width:340px; font-family:inherit; transition:opacity 0.1s ease;';
  document.body.appendChild(_metiTooltipEl);

  document.addEventListener('mouseover', function(e) {
    // 1. Chart date dots
    const dateDot = e.target.closest('.ov-chart-dot, [data-date]');
    if (dateDot) {
      const d = dateDot.getAttribute('data-date');
      const c = dateDot.getAttribute('data-count');
      if (d) {
        renderDateDotTooltip(d, c);
        _metiTooltipEl.style.display = 'block';
        positionTooltip(e);
        return;
      }
    }

    // 2. Shift bars / elements
    const shiftEl = e.target.closest('[data-shift]');
    if (shiftEl) {
      const s = shiftEl.getAttribute('data-shift');
      if (s) {
        renderShiftTooltip(s);
        _metiTooltipEl.style.display = 'block';
        positionTooltip(e);
        return;
      }
    }

    // 3. Floor bars / elements
    const floorEl = e.target.closest('[data-floor]');
    if (floorEl) {
      const fl = floorEl.getAttribute('data-floor');
      if (fl) {
        renderFloorTooltip(fl);
        _metiTooltipEl.style.display = 'block';
        positionTooltip(e);
        return;
      }
    }

    // 4. Queue rows & queue badges
    const queueEl = e.target.closest('[data-tooltip-queue], [data-queue], .daily-queue-row, [data-metric-tooltip]');
    if (queueEl) {
      const qName = queueEl.getAttribute('data-tooltip-queue') || queueEl.getAttribute('data-queue') || queueEl.querySelector('.daily-queue-name')?.textContent || queueEl.textContent;
      if (qName) {
        renderQueueTooltipContent(qName.trim());
        _metiTooltipEl.style.display = 'block';
        positionTooltip(e);
        return;
      }
    }

    // 5. Generic custom tooltips
    const tipEl = e.target.closest('[data-tooltip]');
    if (tipEl) {
      const text = tipEl.getAttribute('data-tooltip');
      if (text) {
        _metiTooltipEl.innerHTML = '<div style="font-size:11.5px; color:#f1f5f9;">' + esc(text) + '</div>';
        _metiTooltipEl.style.display = 'block';
        positionTooltip(e);
        return;
      }
    }

    if (_metiTooltipEl) _metiTooltipEl.style.display = 'none';
  });

  document.addEventListener('mousemove', function(e) {
    if (_metiTooltipEl && _metiTooltipEl.style.display !== 'none') {
      positionTooltip(e);
    }
  });

  document.addEventListener('mouseout', function(e) {
    const target = e.target.closest('.ov-chart-dot, [data-date], [data-shift], [data-floor], [data-tooltip-queue], [data-queue], .daily-queue-row, [data-metric-tooltip], [data-tooltip]');
    if (target && _metiTooltipEl) {
      _metiTooltipEl.style.display = 'none';
    }
  });
}

function positionTooltip(e) {
  if (!_metiTooltipEl) return;
  const pad = 15;
  let left = e.clientX + pad;
  let top = e.clientY + pad;
  const rect = _metiTooltipEl.getBoundingClientRect();
  if (left + rect.width > window.innerWidth - 10) {
    left = e.clientX - rect.width - pad;
  }
  if (top + rect.height > window.innerHeight - 10) {
    top = e.clientY - rect.height - pad;
  }
  _metiTooltipEl.style.left = Math.max(10, left) + 'px';
  _metiTooltipEl.style.top = Math.max(10, top) + 'px';
}
