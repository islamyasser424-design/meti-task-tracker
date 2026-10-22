const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'dashboard-ui.js');
let code = fs.readFileSync(filePath, 'utf8');

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

const newRenderAnalysis = `function renderAnalysis(){
  if(analysis.hidden) return;
  const base = rowsInView();
  const a = analysisAggregate(base, analysisFilters);
  const catSummary = getCategorySummary(a.selected);
  const si = hdrs.findIndex(h => h.toLowerCase() === 'shift');
  const fi = hdrs.findIndex(h => ['floor', 'unit'].includes(h.toLowerCase()));
  const qi = hdrs.findIndex(h => h.toLowerCase() === 'queue name');
  const qcI = hdrs.findIndex(h => h.toLowerCase() === 'qtc name');
  const li = hdrs.findIndex(h => h.toLowerCase() === 'labeler name');

  const shifts = [...new Set(base.map(r => si >= 0 ? String(r[si] || '').trim() : '').filter(Boolean))].sort();

  // Metrics calculation
  const lidarFP = a.selected.filter(r => isModPass(r, 'lidar', 'FP')).length;
  const lidarQA = a.selected.filter(r => isModPass(r, 'lidar', 'QA')).length;
  const laneFP = a.selected.filter(r => isModPass(r, 'laneline', 'FP')).length;
  const laneQA = a.selected.filter(r => isModPass(r, 'laneline', 'QA')).length;

  const totalLidar = lidarFP + lidarQA;
  const totalLane = laneFP + laneQA;
  const totalFP = lidarFP + laneFP;
  const totalQA = lidarQA + laneQA;
  const totalSelected = a.selected.length;

  const uniqueLabelers = uniq(a.selected, 'Labeler Name') || 0;
  const uniqueQtcs = uniq(a.selected, 'QTC Name') || 0;
  const avgSubmit = uniqueLabelers ? (totalSelected / uniqueLabelers).toFixed(1) : '0';

  const lidarPct = totalSelected ? ((totalLidar / totalSelected) * 100).toFixed(1) : '0';
  const lanePct = totalSelected ? ((totalLane / totalSelected) * 100).toFixed(1) : '0';

  // Lidar sub-aggregations
  const lidarRows = a.selected.filter(r => {
    const mi = hdrs.findIndex(h => h.toLowerCase() === 'modality');
    return mi >= 0 && String(r[mi] || '').toLowerCase().replace(/[\\s_-]+/g,'') === 'lidar';
  });
  const lidarQueueMap = new Map();
  const lidarShiftMap = new Map();
  const lidarFloorMap = new Map();
  const lidarLabMap = new Map();
  const lidarQtcMap = new Map();
  lidarRows.forEach(r => {
    if (qi >= 0 && r[qi]) lidarQueueMap.set(r[qi], (lidarQueueMap.get(r[qi]) || 0) + 1);
    if (si >= 0 && r[si]) lidarShiftMap.set(r[si], (lidarShiftMap.get(r[si]) || 0) + 1);
    if (fi >= 0 && r[fi]) { const fl = deriveFloor(r[fi]); lidarFloorMap.set(fl, (lidarFloorMap.get(fl) || 0) + 1); }
    if (li >= 0 && r[li]) lidarLabMap.set(r[li], (lidarLabMap.get(r[li]) || 0) + 1);
    if (qcI >= 0 && r[qcI]) lidarQtcMap.set(r[qcI], (lidarQtcMap.get(r[qcI]) || 0) + 1);
  });

  // Lane Line sub-aggregations
  const laneRows = a.selected.filter(r => {
    const mi = hdrs.findIndex(h => h.toLowerCase() === 'modality');
    const m = String(r[mi] || '').toLowerCase().replace(/[\\s_-]+/g,'');
    return m === 'laneline' || m === 'lane';
  });
  const laneQueueMap = new Map();
  const laneShiftMap = new Map();
  const laneFloorMap = new Map();
  const laneLabMap = new Map();
  const laneQtcMap = new Map();
  laneRows.forEach(r => {
    if (qi >= 0 && r[qi]) laneQueueMap.set(r[qi], (laneQueueMap.get(r[qi]) || 0) + 1);
    if (si >= 0 && r[si]) laneShiftMap.set(r[si], (laneShiftMap.get(r[si]) || 0) + 1);
    if (fi >= 0 && r[fi]) { const fl = deriveFloor(r[fi]); laneFloorMap.set(fl, (laneFloorMap.get(fl) || 0) + 1); }
    if (li >= 0 && r[li]) laneLabMap.set(r[li], (laneLabMap.get(r[li]) || 0) + 1);
    if (qcI >= 0 && r[qcI]) laneQtcMap.set(r[qcI], (laneQtcMap.get(r[qcI]) || 0) + 1);
  });

  // Compare All Floors / Units Matrix (Section 4.4 - Evaluated across base for full comparison)
  const allFloors = [...new Set(base.map(r => fi >= 0 ? deriveFloor(r[fi]) : '').filter(Boolean))].sort();
  const floorUnitData = allFloors.map(fl => {
    const fRows = base.filter(r => fi >= 0 && deriveFloor(r[fi]) === fl);
    const tot = fRows.length;
    const lFP = fRows.filter(r => isModPass(r, 'lidar', 'FP')).length;
    const lQA = fRows.filter(r => isModPass(r, 'lidar', 'QA')).length;
    const lnFP = fRows.filter(r => isModPass(r, 'laneline', 'FP')).length;
    const lnQA = fRows.filter(r => isModPass(r, 'laneline', 'QA')).length;
    const labCnt = uniq(fRows, 'Labeler Name') || 0;
    const qtcCnt = uniq(fRows, 'QTC Name') || 0;
    const avg = labCnt > 0 ? (tot / labCnt).toFixed(1) : '0';
    const share = base.length > 0 ? ((tot / base.length) * 100).toFixed(1) : '0';
    return { floor: fl, total: tot, lFP, lQA, lnFP, lnQA, labelers: labCnt, qtcs: qtcCnt, avg, share };
  }).sort((a,b) => b.total - a.total);

  // QTC Supervisory Analysis (Section 4.5)
  const qtcMapAnalysis = new Map();
  a.selected.forEach(r => {
    const qtc = qcI >= 0 ? String(r[qcI] || '').normalize('NFC').trim().replace(/\\s+/gu, ' ') : '';
    if (!qtc) return;
    if (!qtcMapAnalysis.has(qtc)) {
      qtcMapAnalysis.set(qtc, { qtc, total: 0, lFP: 0, lQA: 0, lnFP: 0, lnQA: 0, labSet: new Set() });
    }
    const item = qtcMapAnalysis.get(qtc);
    item.total++;
    if (isModPass(r, 'lidar', 'FP')) item.lFP++;
    if (isModPass(r, 'lidar', 'QA')) item.lQA++;
    if (isModPass(r, 'laneline', 'FP')) item.lnFP++;
    if (isModPass(r, 'laneline', 'QA')) item.lnQA++;
    const lab = li >= 0 ? String(r[li] || '').trim() : '';
    if (lab) item.labSet.add(lab);
  });
  const allQtcsSorted = [...qtcMapAnalysis.values()].map(item => ({
    ...item,
    uniqueLabelers: item.labSet.size,
    avgSubmit: item.labSet.size > 0 ? (item.total / item.labSet.size).toFixed(1) : '0'
  })).sort((a,b) => b.total - a.total);
  const top15Qtcs = allQtcsSorted.slice(0, 15);
  const bottom15Qtcs = allQtcsSorted.length > 15 ? allQtcsSorted.slice(-15) : allQtcsSorted;

  // Verified Quality Analysis Data from qualityStore
  const qs = getQualityStore();
  const qsEntries = Object.entries(qs);
  let qAssessments = 0, qSumTot = 0, qSumAtt = 0, qSumTva = 0, qSumArt = 0;
  qsEntries.forEach(([aid, q]) => {
    const tot = typeof window.qNum === 'function' ? window.qNum(q.totalAccuracy) : parseFloat(q.totalAccuracy);
    const att = typeof window.qNum === 'function' ? window.qNum(q.attribute) : parseFloat(q.attribute);
    const tva = typeof window.qNum === 'function' ? window.qNum(q.tvaF1) : parseFloat(q.tvaF1);
    const art = typeof window.qNum === 'function' ? window.qNum(q.artifacts) : parseFloat(q.artifacts);
    if (tot !== null && !isNaN(tot)) { qSumTot += tot; qAssessments++; }
    if (att !== null && !isNaN(att)) qSumAtt += att;
    if (tva !== null && !isNaN(tva)) qSumTva += tva;
    if (art !== null && !isNaN(art)) qSumArt += art;
  });

  const avgTotAcc = qAssessments ? (qSumTot / qAssessments) : null;
  const avgAttAcc = qAssessments ? (qSumAtt / qAssessments) : null;
  const avgTva = qAssessments ? (qSumTva / qAssessments) : null;
  const avgArt = qAssessments ? (qSumArt / qAssessments).toFixed(1) : '—';

  // 8 Main KPI Cards
  const kpiCards = [
    { title: 'Total Lidar Submissions', val: totalLidar.toLocaleString(), sub: 'FP + QA Lidar Tasks', tone: '#0d9488' },
    { title: 'Total Lane Line Submissions', val: totalLane.toLocaleString(), sub: 'FP + QA Lane Line Tasks', tone: '#ed9a35' },
    { title: 'Total FP Submissions', val: totalFP.toLocaleString(), sub: 'All First Pass Tasks', tone: '#3b82f6' },
    { title: 'Total QA Submissions', val: totalQA.toLocaleString(), sub: 'All QA Review Tasks', tone: '#8b5cf6' },
    { title: 'Unique Labelers', val: uniqueLabelers.toLocaleString(), sub: 'Active in selection', tone: '#0a9d8c' },
    { title: 'Unique QTCs', val: uniqueQtcs.toLocaleString(), sub: 'Supervising reviewers', tone: '#df8b24' },
    { title: 'Avg Submissions / Labeler', val: avgSubmit, sub: 'Average productivity', tone: '#10b981' },
    { title: 'Modality Share %', val: (lidarPct + '% / ' + lanePct + '%'), sub: 'Lidar vs Lane Line share', tone: '#df5c99' }
  ];

  analysis.innerHTML = '<div class="ux-overview">'
    + '<div class="ux-heading">'
      + '<div>'
        + '<div class="ux-eyebrow">Modality &amp; Attribute Operations</div>'
        + '<h2>Modality &amp; Attribute Analysis</h2>'
        + '<p>Deep operational distribution across Lidar, Lane Line, Facility Units, and supervised quality.</p>'
      + '</div>'
      + renderHeaderControlsHTML('an')
    + '</div>'

    + renderUniversalFilterBar('analysis')

    // 8 KPI Grid
    + '<div class="ux-grid-8" style="margin-top:16px;">'
      + kpiCards.map(k => '<div class="kpi-mini-card" style="--tone:' + k.tone + '">'
        + '<div class="kpi-title"><span>' + esc(k.title) + '</span><span style="color:' + k.tone + '">●</span></div>'
        + '<div class="kpi-val">' + k.val + '</div>'
        + '<div class="kpi-sub">' + esc(k.sub) + '</div>'
      + '</div>').join('')
    + '</div>'

    // Category cards row (4 Workstream Deep-Dive Cards)
    + renderCategoryCardsHTML(catSummary, analysisFilters.category, 'analysis')

    // SECTION 1 & 2: Lidar Deep Dive & Lane Line Deep Dive
    + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:18px; margin-top:20px;">'
      // Lidar Box
      + '<div class="ux-panel" style="border-top:4px solid #0d9488;">'
        + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">'
          + '<h3 style="margin:0; color:#0d9488;">📡 Lidar Modality Analysis</h3>'
          + '<span class="q-badge" style="background:#0d9488; color:#fff;">' + totalLidar.toLocaleString() + ' tasks</span>'
        + '</div>'
        + '<div style="display:flex; gap:12px; margin-bottom:14px; background:var(--bg-2); padding:10px 14px; border-radius:10px;">'
          + '<div style="flex:1;"><b>FP:</b> ' + lidarFP.toLocaleString() + '</div>'
          + '<div style="flex:1;"><b>QA:</b> ' + lidarQA.toLocaleString() + '</div>'
          + '<div style="flex:1;"><b>QA Share:</b> ' + (totalLidar ? ((lidarQA/totalLidar)*100).toFixed(1) : 0) + '%</div>'
        + '</div>'
        + '<h4 style="font-size:12px; margin:10px 0 4px; color:var(--text-soft);">Top 5 Lidar Queues</h4>'
        + '<div style="display:flex; flex-direction:column; gap:4px; font-size:12px;">'
          + ([...lidarQueueMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([q,c])=>'<div style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid var(--border-light);"><span style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:220px;">' + esc(q) + '</span><b>' + c.toLocaleString() + '</b></div>').join('') || '<span class="ux-note">No Lidar queue data</span>')
        + '</div>'
        + '<h4 style="font-size:12px; margin:12px 0 4px; color:var(--text-soft);">Top 5 Lidar Labelers</h4>'
        + '<div style="display:flex; flex-direction:column; gap:4px; font-size:12px;">'
          + ([...lidarLabMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([l,c])=>'<div style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid var(--border-light);"><span style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:220px;">' + esc(l) + '</span><b style="color:#0d9488;">' + c.toLocaleString() + '</b></div>').join('') || '<span class="ux-note">No Lidar labelers</span>')
        + '</div>'
      + '</div>'

      // Lane Line Box
      + '<div class="ux-panel" style="border-top:4px solid #ed9a35;">'
        + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">'
          + '<h3 style="margin:0; color:#ed9a35;">🛣️ Lane Line Modality Analysis</h3>'
          + '<span class="q-badge" style="background:#ed9a35; color:#fff;">' + totalLane.toLocaleString() + ' tasks</span>'
        + '</div>'
        + '<div style="display:flex; gap:12px; margin-bottom:14px; background:var(--bg-2); padding:10px 14px; border-radius:10px;">'
          + '<div style="flex:1;"><b>FP:</b> ' + laneFP.toLocaleString() + '</div>'
          + '<div style="flex:1;"><b>QA:</b> ' + laneQA.toLocaleString() + '</div>'
          + '<div style="flex:1;"><b>QA Share:</b> ' + (totalLane ? ((laneQA/totalLane)*100).toFixed(1) : 0) + '%</div>'
        + '</div>'
        + '<h4 style="font-size:12px; margin:10px 0 4px; color:var(--text-soft);">Top 5 Lane Line Queues</h4>'
        + '<div style="display:flex; flex-direction:column; gap:4px; font-size:12px;">'
          + ([...laneQueueMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([q,c])=>'<div style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid var(--border-light);"><span style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:220px;">' + esc(q) + '</span><b>' + c.toLocaleString() + '</b></div>').join('') || '<span class="ux-note">No Lane Line queue data</span>')
        + '</div>'
        + '<h4 style="font-size:12px; margin:12px 0 4px; color:var(--text-soft);">Top 5 Lane Line Labelers</h4>'
        + '<div style="display:flex; flex-direction:column; gap:4px; font-size:12px;">'
          + ([...laneLabMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([l,c])=>'<div style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid var(--border-light);"><span style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:220px;">' + esc(l) + '</span><b style="color:#ed9a35;">' + c.toLocaleString() + '</b></div>').join('') || '<span class="ux-note">No Lane Line labelers</span>')
        + '</div>'
      + '</div>'
    + '</div>'

    // SECTION 3: Attribute & Quality Analysis
    + '<div class="ux-panel" style="margin-top:20px;">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px;">'
        + '<div>'
          + '<h3 style="margin:0;">⭐ Attribute &amp; Verified Quality Analysis</h3>'
          + '<p style="margin:2px 0 0;">Quality accuracy metrics derived strictly from verified assessment records in the Export tab.</p>'
        + '</div>'
        + '<div class="q-badge" style="background:rgba(16,185,129,0.12); color:var(--success); border:1px solid rgba(16,185,129,0.3); font-size:11px; padding:4px 10px;">'
          + 'Verified Records Only · No raw volume proxy'
        + '</div>'
      + '</div>'

      // Quality KPI Metrics Grid
      + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:16px;">'
        + '<div style="background:var(--bg-2); padding:12px; border-radius:10px; border:1px solid var(--border);"><span class="ux-note">Total Assessed Tasks</span><div style="font-size:20px; font-weight:700; color:var(--primary); margin-top:2px;">' + qAssessments.toLocaleString() + '</div></div>'
        + '<div style="background:var(--bg-2); padding:12px; border-radius:10px; border:1px solid var(--border);"><span class="ux-note">Verified Total Accuracy</span><div style="font-size:20px; font-weight:700; color:var(--success); margin-top:2px;">' + (typeof window.qFmt === 'function' ? window.qFmt(avgTotAcc) : (avgTotAcc ? (avgTotAcc*100).toFixed(1)+'%' : '—')) + '</div></div>'
        + '<div style="background:var(--bg-2); padding:12px; border-radius:10px; border:1px solid var(--border);"><span class="ux-note">Attribute Accuracy</span><div style="font-size:20px; font-weight:700; color:var(--accent); margin-top:2px;">' + (typeof window.qFmt === 'function' ? window.qFmt(avgAttAcc) : (avgAttAcc ? (avgAttAcc*100).toFixed(1)+'%' : '—')) + '</div></div>'
        + '<div style="background:var(--bg-2); padding:12px; border-radius:10px; border:1px solid var(--border);"><span class="ux-note">TVA F1 Score</span><div style="font-size:20px; font-weight:700; color:#df8b24; margin-top:2px;">' + (typeof window.qFmt === 'function' ? window.qFmt(avgTva) : (avgTva ? (avgTva*100).toFixed(1)+'%' : '—')) + '</div></div>'
        + '<div style="background:var(--bg-2); padding:12px; border-radius:10px; border:1px solid var(--border);"><span class="ux-note">Avg Artifacts</span><div style="font-size:20px; font-weight:700; color:var(--danger); margin-top:2px;">' + avgArt + '</div></div>'
      + '</div>'
    + '</div>'

    // SECTION 4: Compare All Floors / Units Matrix (Section 4.4)
    + '<div class="ux-panel" style="margin-top:20px;">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px;">'
        + '<div>'
          + '<h3 style="margin:0;">🏢 Compare All Floors / Units Matrix</h3>'
          + '<p style="margin:2px 0 0;">Facility-wide performance comparison across all operational units (Floor = Unit).</p>'
        + '</div>'
        + '<span class="q-badge" style="background:var(--primary); color:#fff; font-weight:700;">' + floorUnitData.length + ' Units Compared</span>'
      + '</div>'
      + '<div style="overflow-x:auto;">'
        + '<table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">'
          + '<thead>'
            + '<tr style="background:var(--bg-2); border-bottom:1px solid var(--border);">'
              + '<th style="padding:10px 14px;">Floor / Unit</th>'
              + '<th style="padding:10px 12px; text-align:center; color:#0d9488;">Lidar FP</th>'
              + '<th style="padding:10px 12px; text-align:center; color:#14b8a6;">Lidar QA</th>'
              + '<th style="padding:10px 12px; text-align:center; color:#ed9a35;">Lane Line FP</th>'
              + '<th style="padding:10px 12px; text-align:center; color:#ec4899;">Lane Line QA</th>'
              + '<th style="padding:10px 12px; text-align:center; font-weight:700;">Total Submits</th>'
              + '<th style="padding:10px 12px; text-align:center;">Unique Labelers</th>'
              + '<th style="padding:10px 12px; text-align:center;">Unique QTCs</th>'
              + '<th style="padding:10px 12px; text-align:center;">Avg / Labeler</th>'
              + '<th style="padding:10px 14px; text-align:center;">Unit Share %</th>'
            + '</tr>'
          + '</thead>'
          + '<tbody>'
            + floorUnitData.map(item => \`
              <tr style="border-bottom:1px solid var(--border);" onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background='transparent'">
                <td style="padding:10px 14px; font-weight:700; color:var(--accent);">🏢 Unit \${esc(item.floor)}</td>
                <td style="padding:10px 12px; text-align:center; color:#0d9488; font-weight:600;">\${item.lFP.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; color:#14b8a6; font-weight:600;">\${item.lQA.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; color:#ed9a35; font-weight:600;">\${item.lnFP.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; color:#ec4899; font-weight:600;">\${item.lnQA.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; font-weight:800; color:var(--text); font-size:13px;">\${item.total.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center;">\${item.labelers.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center;">\${item.qtcs.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; font-weight:600; color:var(--primary);">\${item.avg}</td>
                <td style="padding:10px 14px; text-align:center;">
                  <div style="display:flex; align-items:center; justify-content:center; gap:6px;">
                    <div style="width:50px; height:6px; border-radius:3px; background:var(--border); overflow:hidden;">
                      <div style="width:\${item.share}%; height:100%; background:var(--primary);"></div>
                    </div>
                    <b>\${item.share}%</b>
                  </div>
                </td>
              </tr>
            \`).join('')
          + '</tbody>'
        + '</table>'
      + '</div>'
    + '</div>'

    // SECTION 5: QTC Supervisory Analysis (Section 4.5)
    + '<div class="ux-panel" style="margin-top:20px;">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px;">'
        + '<div>'
          + '<h3 style="margin:0;">👥 QTC Supervisory Analysis (Top 15 &amp; Bottom 15)</h3>'
          + '<p style="margin:2px 0 0;">Supervisory volume, team size, and workstream distribution for highest and lowest active QTCs.</p>'
        + '</div>'
        + '<div style="display:flex; gap:6px;">'
          + '<button class="btn btn-c" id="anQtcTopBtn" style="font-size:11px; padding:5px 12px;">Top 15 QTCs</button>'
          + '<button class="btn" id="anQtcBotBtn" style="font-size:11px; padding:5px 12px;">Bottom 15 QTCs</button>'
        + '</div>'
      + '</div>'
      + '<div style="overflow-x:auto;">'
        + '<table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">'
          + '<thead>'
            + '<tr style="background:var(--bg-2); border-bottom:1px solid var(--border);">'
              + '<th style="padding:10px 14px;">QTC Supervisor</th>'
              + '<th style="padding:10px 12px; text-align:center; font-weight:700;">Total Tasks</th>'
              + '<th style="padding:10px 12px; text-align:center;">Unique Labelers</th>'
              + '<th style="padding:10px 12px; text-align:center; color:#0d9488;">Lidar FP</th>'
              + '<th style="padding:10px 12px; text-align:center; color:#14b8a6;">Lidar QA</th>'
              + '<th style="padding:10px 12px; text-align:center; color:#ed9a35;">Lane Line FP</th>'
              + '<th style="padding:10px 12px; text-align:center; color:#ec4899;">Lane Line QA</th>'
              + '<th style="padding:10px 12px; text-align:center;">Avg / Labeler</th>'
            + '</tr>'
          + '</thead>'
          + '<tbody id="anQtcTableBody">'
            + top15Qtcs.map(item => \`
              <tr style="border-bottom:1px solid var(--border);" onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background='transparent'">
                <td style="padding:9px 14px; font-weight:700; color:var(--primary);">👤 \${esc(item.qtc)}</td>
                <td style="padding:9px 12px; text-align:center; font-weight:800; color:var(--text);">\${item.total.toLocaleString()}</td>
                <td style="padding:9px 12px; text-align:center; font-weight:600;">\${item.uniqueLabelers.toLocaleString()}</td>
                <td style="padding:9px 12px; text-align:center; color:#0d9488;">\${item.lFP.toLocaleString()}</td>
                <td style="padding:9px 12px; text-align:center; color:#14b8a6;">\${item.lQA.toLocaleString()}</td>
                <td style="padding:9px 12px; text-align:center; color:#ed9a35;">\${item.lnFP.toLocaleString()}</td>
                <td style="padding:9px 12px; text-align:center; color:#ec4899;">\${item.lnQA.toLocaleString()}</td>
                <td style="padding:9px 12px; text-align:center; font-weight:600; color:var(--accent);">\${item.avgSubmit}</td>
              </tr>
            \`).join('')
          + '</tbody>'
        + '</table>'
      + '</div>'
    + '</div>'

    // Charts: Modality Trends & Shift Share
    + '<div class="ux-panels" style="margin-top:20px;">'
      + '<section class="ux-panel">'
        + '<div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:12px;">'
          + '<div><h3>Daily Submission Area Trend</h3><p>Select category tab below to filter trend. Includes 7-day moving average.</p></div>'
          + '<div class="an-chart-cat-tabs" id="anChartCatTabs">'
            + [
              {key:'all',label:'All Stages (Total)',color:'#0d9488'},
              {key:'lidarFP',label:'Lidar FP',color:'#0d9488'},
              {key:'lidarQA',label:'Lidar QA',color:'#15b8a6'},
              {key:'laneFP',label:'Lane Line FP',color:'#ed9a35'},
              {key:'laneQA',label:'Lane Line QA',color:'#e9689e'}
            ].map(t=>'<button class="an-chart-tab '+(t.key===(analysisFilters.chartCategory||'all')?'active':'')+'" style="--tab-color:'+t.color+'" data-tab-cat="'+t.key+'">'+t.label+'</button>').join('')
          + '</div>'
        + '</div>'
        + '<div id="anLine" class="an-line"></div>'
        + '<div style="display:flex; justify-content:flex-end; gap:16px; font-size:11px; color:var(--text-soft); margin-top:8px;">'
          + '<span><span style="display:inline-block; width:12px; height:12px; background:var(--primary); border-radius:2px; vertical-align:middle; margin-right:4px;"></span> Daily Submissions</span>'
          + '<span><span style="display:inline-block; width:14px; height:0; border-top:2px dashed #ef4444; vertical-align:middle; margin-right:4px;"></span> 7-Day Moving Avg</span>'
        + '</div>'
      + '</section>'
      + '<section class="ux-panel">'
        + '<h3>Shift Submission Distribution</h3>'
        + '<p>Share of ' + a.selected.length.toLocaleString() + ' filtered submissions.</p>'
        + '<div id="anDonut" class="an-donut"></div>'
        + '<div id="anLegend" class="an-legend"></div>'
      + '</section>'
    + '</div>'
  + '</div>';

  bindHeaderControls(analysis, 'an'); bindUniversalFilterBar(analysis, 'analysis');
  const slicerContainer = analysis.querySelector('#anSlicers');
  if (slicerContainer) slicerContainer.appendChild(createListSlicers());

  // QTC Top/Bottom toggle buttons
  const topBtn = $('anQtcTopBtn');
  const botBtn = $('anQtcBotBtn');
  const qtcTableBody = $('anQtcTableBody');
  const renderQtcList = (list) => {
    if (!qtcTableBody) return;
    qtcTableBody.innerHTML = list.map(item => \`
      <tr style="border-bottom:1px solid var(--border);" onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background='transparent'">
        <td style="padding:9px 14px; font-weight:700; color:var(--primary);">👤 \${esc(item.qtc)}</td>
        <td style="padding:9px 12px; text-align:center; font-weight:800; color:var(--text);">\${item.total.toLocaleString()}</td>
        <td style="padding:9px 12px; text-align:center; font-weight:600;">\${item.uniqueLabelers.toLocaleString()}</td>
        <td style="padding:9px 12px; text-align:center; color:#0d9488;">\${item.lFP.toLocaleString()}</td>
        <td style="padding:9px 12px; text-align:center; color:#14b8a6;">\${item.lQA.toLocaleString()}</td>
        <td style="padding:9px 12px; text-align:center; color:#ed9a35;">\${item.lnFP.toLocaleString()}</td>
        <td style="padding:9px 12px; text-align:center; color:#ec4899;">\${item.lnQA.toLocaleString()}</td>
        <td style="padding:9px 12px; text-align:center; font-weight:600; color:var(--accent);">\${item.avgSubmit}</td>
      </tr>
    \`).join('');
  };
  if (topBtn && botBtn) {
    topBtn.onclick = () => {
      topBtn.classList.add('btn-c'); botBtn.classList.remove('btn-c');
      renderQtcList(top15Qtcs);
    };
    botBtn.onclick = () => {
      botBtn.classList.add('btn-c'); topBtn.classList.remove('btn-c');
      renderQtcList(bottom15Qtcs);
    };
  }

  // Category card filter click
  analysis.querySelectorAll('.an-cat-card[data-cat]').forEach(card => {
    const cat = card.dataset.cat;
    card.onclick = () => {
      analysisFilters.category = analysisFilters.category === cat ? '' : cat;
      renderAnalysis();
    };
  });

  // Chart category tabs
  analysis.querySelectorAll('[data-tab-cat]').forEach(btn => {
    btn.onclick = () => {
      analysisFilters.chartCategory = btn.dataset.tabCat;
      renderAnalysis();
    };
  });

  // Render SVG Area Line chart with 7-Day Moving Average
  const palette = ['#0d9488', '#15b8a6', '#ed9a35', '#e9689e', '#459ce8', '#9ca53c', '#b77bdb', '#7689a3'];
  if (!a.selected.length) {
    $('anLine').innerHTML = '<div class="ux-empty">No submissions match these filters.</div>';
    $('anDonut').innerHTML = '<div class="ux-empty">No shift distribution available.</div>';
    return;
  }

  const chartCat = analysisFilters.chartCategory || 'all';
  const catColorMap = { all: '#0d9488', lidarFP: '#0d9488', lidarQA: '#15b8a6', laneFP: '#ed9a35', laneQA: '#e9689e' };
  const strokeColor = catColorMap[chartCat] || '#0d9488';
  let catRows = a.selected;
  if (chartCat !== 'all') {
    const mi = hdrs.findIndex(h => h.toLowerCase() === 'modality');
    const pi = hdrs.findIndex(h => h.toLowerCase() === 'pass');
    catRows = a.selected.filter(r => {
      const mod = mi < 0 ? '' : String(r[mi] || '').toLowerCase().replace(/[\\s_-]+/g, '');
      const pass = pi < 0 ? '' : String(r[pi] || '').trim().toUpperCase();
      const prefix = mod === 'lidar' ? 'lidar' : (mod === 'laneline' || mod === 'lane') ? 'lane' : '';
      return (prefix + pass) === chartCat;
    });
  }

  const catDates = new Map();
  catRows.forEach(r => { const d = rDate(r); if (d) catDates.set(d, (catDates.get(d) || 0) + 1); });
  const chartPoints = a.points.map(([d]) => [d, catDates.get(d) || 0]);

  // Compute 7-day moving average
  const movingAvg = chartPoints.map((p, i) => {
    const start = Math.max(0, i - 6);
    const slice = chartPoints.slice(start, i + 1);
    const sum = slice.reduce((acc, pt) => acc + pt[1], 0);
    return [p[0], Math.round(sum / slice.length)];
  });

  const W = 760, H = 260, L = 55, R = 20, T = 20, B = 45;
  const max = Math.max(1, ...chartPoints.map(p => p[1]));
  const x = i => L + (chartPoints.length === 1 ? (W - L - R) / 2 : (i / (chartPoints.length - 1)) * (W - L - R));
  const y = v => H - B - (v / max) * (H - T - B);

  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="Daily submission area chart">';
  svg += '<defs><linearGradient id="anAreaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + strokeColor + '" stop-opacity="0.38"/><stop offset="100%" stop-color="' + strokeColor + '" stop-opacity="0.02"/></linearGradient></defs>';
  for (let i = 0; i < 5; i++) {
    const value = (max * i) / 4, yy = y(value);
    svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--border)" stroke-dasharray="3 3"/><text x="' + (L - 9) + '" y="' + (yy + 4) + '" text-anchor="end">' + Number(value.toFixed(1)).toLocaleString() + '</text>';
  }
  if (chartPoints.length > 1) {
    const polyPoints = [L + ',' + (H - B), ...chartPoints.map((p, i) => x(i) + ',' + y(p[1])), (chartPoints.length === 1 ? L : x(chartPoints.length - 1)) + ',' + (H - B)].join(' ');
    svg += '<polygon fill="url(#anAreaGrad)" points="' + polyPoints + '"/>';
  }
  svg += '<polyline fill="none" stroke="' + strokeColor + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="' + chartPoints.map((p, i) => x(i) + ',' + y(p[1])).join(' ') + '"/>';
  // 7-day moving average dashed overlay
  if (chartPoints.length > 1) {
    svg += '<polyline fill="none" stroke="#ef4444" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round" points="' + movingAvg.map((p, i) => x(i) + ',' + y(p[1])).join(' ') + '"/>';
  }
  chartPoints.forEach(([d, c], i) => {
    svg += '<circle tabindex="0" role="img" cx="' + x(i) + '" cy="' + y(c) + '" r="4.5" fill="' + strokeColor + '" stroke="var(--bg-3)" stroke-width="1.5"><title>' + d + ' (' + chartCat + '): ' + c.toLocaleString() + ' submissions (7d avg: ' + movingAvg[i][1] + ')</title></circle>';
    if (i === 0 || i === chartPoints.length - 1 || (chartPoints.length > 3 && i === Math.floor(chartPoints.length / 2))) {
      svg += '<text x="' + x(i) + '" y="' + (H - 12) + '" text-anchor="' + (i === 0 ? 'start' : i === chartPoints.length - 1 ? 'end' : 'middle') + '">' + d + '</text>';
    }
  });
  $('anLine').innerHTML = svg + '</svg>';

  // Render Donut
  let offset = 0;
  const circumference = 2 * Math.PI * 70;
  let ring = '<svg viewBox="0 0 200 200" role="group" aria-label="Shift submission share donut chart"><circle cx="100" cy="100" r="70" fill="none" stroke="var(--border)" stroke-width="26"/>';
  a.shifts.forEach(([s, c], i) => {
    const length = (c / a.selected.length) * circumference;
    ring += '<circle tabindex="0" role="img" cx="100" cy="100" r="70" fill="none" stroke="' + palette[i % palette.length] + '" stroke-width="26" stroke-dasharray="' + length + ' ' + (circumference - length) + '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 100 100)"><title>' + esc(s) + ' · ' + c.toLocaleString() + ' · ' + ((c / a.selected.length) * 100).toFixed(1) + '%</title></circle>';
    offset += length;
  });
  $('anDonut').innerHTML = ring + '<text x="100" y="99" text-anchor="middle" class="an-total">' + a.selected.length.toLocaleString() + '</text><text x="100" y="120" text-anchor="middle">Submissions</text></svg>';
  $('anLegend').innerHTML = a.shifts.map(([s, c], i) => '<div><span style="background:' + palette[i % palette.length] + '" class="an-dot"></span><span>' + esc(s) + '</span><b>' + c.toLocaleString() + '</b><span>' + ((c / a.selected.length) * 100).toFixed(1) + '%</span></div>').join('');
}`;

code = replaceFunctionInCode(code, 'renderAnalysis', newRenderAnalysis);
fs.writeFileSync(filePath, code, 'utf8');
console.log('Applied new renderAnalysis successfully');
