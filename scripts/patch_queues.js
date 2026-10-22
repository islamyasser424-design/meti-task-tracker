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

const newQueuesAggregateData = `function queuesAggregateData(rows){
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

    const qtc = qci >= 0 ? String(r[qci] || '').normalize('NFC').trim().replace(/\\s+/gu, ' ') : '';
    if (qtc) item.qtcs.add(qtc);

    let lid = '';
    if (ni >= 0) {
      const rawNi = String(r[ni] ?? '').trim()
        .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776))
        .replace(/\\.0+$/, '').replace(/[\\s-]/g, '');
      if (/^\\d{14}$/.test(rawNi)) lid = rawNi;
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
}`;

const newRenderQueuesAnalysis = `function renderQueuesAnalysis(){
  const page = $('uxQueues');
  if(!page || page.hidden) return;

  if(!window._firstDataReady && !hdrs.length){
    const error = $('mainContent')?.querySelector('.errbox');
    page.innerHTML = '<div class="ux-overview"><div class="ux-heading"><div><div class="ux-eyebrow">Queue breakdown · Shifts &amp; Floors &amp; QTCs</div><h2>Queues Analysis</h2><p>Submission volume, shifts, floors, and QTC distribution per queue</p></div>' + renderHeaderControlsHTML('queues') + '</div><div class="ux-panel"><h3>' + (error ? 'Data could not be loaded' : 'Waiting for source data') + '</h3><p>' + esc(error ? error.textContent.replace('↻ Retry','').trim() : 'Queues analysis will appear once dashboard data is loaded.') + '</p><button class="btn btn-c" id="qRetry" style="margin-top:16px">↻ Retry data load</button></div></div>';
    bindHeaderControls(page, 'queues'); bindUniversalFilterBar(page, 'queues');
    $('qRetry')?.addEventListener('click', () => loadData());
    return;
  }

  const base = rowsInView();
  const catSummary = getCategorySummary(base);
  const allQueues = queuesAggregateData(base);

  const allShifts = [...new Set(allQueues.flatMap(q => q.shifts))].sort();
  const allFloors = [...new Set(allQueues.flatMap(q => q.floors))].sort();
  const distinctQueues = [...new Set(allQueues.map(q => q.name))].sort();

  // Filter queues
  const qFilter = (queuesFilters.query || '').toLowerCase().trim();
  const filtered = allQueues.filter(q => {
    if(queuesFilters.shift && !q.shifts.includes(queuesFilters.shift)) return false;
    if(queuesFilters.floor && !q.floors.includes(queuesFilters.floor)) return false;
    if(queuesFilters.category){
      if(queuesFilters.category === 'lidarFP' && q.lidarFP === 0) return false;
      if(queuesFilters.category === 'lidarQA' && q.lidarQA === 0) return false;
      if(queuesFilters.category === 'laneFP' && q.laneFP === 0) return false;
      if(queuesFilters.category === 'laneQA' && q.laneQA === 0) return false;
    }
    if(qFilter){
      const matchName = q.name.toLowerCase().includes(qFilter);
      const matchShifts = q.shifts.some(s => s.toLowerCase().includes(qFilter));
      const matchFloors = q.floors.some(f => f.toLowerCase().includes(qFilter));
      const matchQtcs = q.qtcs.some(qc => qc.toLowerCase().includes(qFilter));
      if(!matchName && !matchShifts && !matchFloors && !matchQtcs) return false;
    }
    return true;
  });

  // Sort queues
  const col = queuesFilters.sortCol || 'totalSubmit';
  const asc = !!queuesFilters.sortAsc;
  filtered.sort((a,b) => {
    let va = a[col], vb = b[col];
    if(typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    va = Number(va) || 0; vb = Number(vb) || 0;
    return asc ? (va - vb) : (vb - va);
  });

  // Selection summary stats
  const totalTasks = filtered.reduce((n,q) => n + q.totalSubmit, 0);
  const totalObjectsAll = filtered.reduce((n,q) => n + q.totalObjects, 0);
  const totalLidarFP = filtered.reduce((n,q) => n + q.lidarFP, 0);
  const totalLidarQA = filtered.reduce((n,q) => n + q.lidarQA, 0);
  const totalLaneFP = filtered.reduce((n,q) => n + q.laneFP, 0);
  const totalLaneQA = filtered.reduce((n,q) => n + q.laneQA, 0);

  const totalUniqueQtcs = new Set(filtered.flatMap(q => q.qtcs)).size;
  const totalUniqueLabelers = new Set(filtered.flatMap(q => [...(q.labelerSet || [])])).size;
  const avgSubmit = totalUniqueLabelers > 0 ? (totalTasks / totalUniqueLabelers).toFixed(1) : '0';
  const avgObjectsPerTask = totalTasks > 0 ? (totalObjectsAll / totalTasks).toFixed(1) : '0';

  const sortedByVol = [...filtered].sort((a,b) => b.totalSubmit - a.totalSubmit);
  const topQueue = sortedByVol.length ? sortedByVol[0] : null;
  const lowestQueue = sortedByVol.length ? sortedByVol[sortedByVol.length - 1] : null;
  const decliningQueues = filtered.filter(q => q.totalSubmit <= 5);

  // Workload concentration: Top 3 queues share
  const top3Vol = sortedByVol.slice(0, 3).reduce((n, q) => n + q.totalSubmit, 0);
  const top3Share = totalTasks > 0 ? ((top3Vol / totalTasks) * 100).toFixed(1) : '0';

  // Pagination
  const pageSize = queuesFilters.pageSize || 25;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  queuesFilters.page = Math.min(queuesFilters.page || 0, totalPages - 1);
  const visible = filtered.slice(queuesFilters.page * pageSize, (queuesFilters.page + 1) * pageSize);

  // 8 Main KPI Cards (Including Total Objects)
  const kpi8 = [
    { title: 'Total Active Queues', val: filtered.length.toLocaleString(), sub: 'Receiving submissions', tone: '#df5c99' },
    { title: 'Queue Submissions', val: totalTasks.toLocaleString(), sub: 'Total task entries', tone: '#0d9488' },
    { title: 'Total Objects', val: totalObjectsAll.toLocaleString(), sub: 'Cumulative objects (' + avgObjectsPerTask + ' avg/task)', tone: '#0284c7' },
    { title: 'Unique Labelers', val: totalUniqueLabelers.toLocaleString(), sub: 'Active contributors', tone: '#0a9d8c' },
    { title: 'Unique QTCs', val: totalUniqueQtcs.toLocaleString(), sub: 'Distinct QA reviewers', tone: '#df8b24' },
    { title: 'Avg Submissions / Labeler', val: avgSubmit, sub: 'Average productivity', tone: '#3b82f6' },
    { title: 'Highest Performing Queue', val: (topQueue ? topQueue.name : '—'), sub: (topQueue ? topQueue.totalSubmit.toLocaleString() + ' tasks' : '—'), tone: '#10b981' },
    { title: 'Workload Concentration', val: (top3Share + '%'), sub: 'Top 3 queues share of total output', tone: '#8b5cf6' }
  ];

  page.innerHTML = '<div class="ux-overview">'
    + '<div class="ux-heading">'
      + '<div>'
        + '<div class="ux-eyebrow">Queue Operations · Velocity &amp; Workload</div>'
        + '<h2>Queues Analysis</h2>'
        + '<p>Monitor queue productivity, operational balance, modality distribution, and team throughput.</p>'
      + '</div>'
      + renderHeaderControlsHTML('queues')
    + '</div>'

    + renderUniversalFilterBar('queues')

    // 8 KPI Grid
    + '<div class="ux-grid-8">'
      + kpi8.map(k => '<div class="kpi-mini-card" style="--tone:' + k.tone + '">'
        + '<div class="kpi-title"><span>' + esc(k.title) + '</span><span style="color:' + k.tone + '">●</span></div>'
        + '<div class="kpi-val" style="font-size:18px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="' + esc(k.val) + '">' + esc(k.val) + '</div>'
        + '<div class="kpi-sub">' + esc(k.sub) + '</div>'
      + '</div>').join('')
    + '</div>'

    + renderCategoryCardsHTML(catSummary, queuesFilters.category, 'queues')

    // Smart Queue Insights Panel (Section 5.5)
    + '<div class="ux-panel" style="margin-top:16px; padding:16px 20px; background:var(--bg-2); border-radius:12px; border:1px solid var(--border);">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">'
        + '<h3 style="margin:0; font-size:14px; display:flex; align-items:center; gap:8px;">📊 Smart Queue Insights &amp; Workload Health</h3>'
        + '<span class="ux-note">Live analytics from Turso database</span>'
      + '</div>'
      + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">'
        + '<div style="background:var(--bg-3); padding:10px 14px; border-radius:8px; border-left:3px solid #10b981;">'
          + '<span class="ux-note">Top Queue by Volume</span>'
          + '<div style="font-weight:700; font-size:13px; color:var(--text); margin-top:2px;">' + (topQueue ? esc(topQueue.name) + ' (' + topQueue.totalSubmit.toLocaleString() + ' tasks)' : '—') + '</div>'
        + '</div>'
        + '<div style="background:var(--bg-3); padding:10px 14px; border-radius:8px; border-left:3px solid #8b5cf6;">'
          + '<span class="ux-note">Workload Concentration (Top 3 Queues)</span>'
          + '<div style="font-weight:700; font-size:13px; color:var(--text); margin-top:2px;">' + top3Share + '% of all submissions</div>'
        + '</div>'
        + '<div style="background:var(--bg-3); padding:10px 14px; border-radius:8px; border-left:3px solid #f59e0b;">'
          + '<span class="ux-note">Lowest Volume Queue</span>'
          + '<div style="font-weight:700; font-size:13px; color:var(--text); margin-top:2px;">' + (lowestQueue ? esc(lowestQueue.name) + ' (' + lowestQueue.totalSubmit.toLocaleString() + ' tasks)' : '—') + '</div>'
        + '</div>'
        + '<div style="background:var(--bg-3); padding:10px 14px; border-radius:8px; border-left:3px solid #ef4444;">'
          + '<span class="ux-note">Declining / Low Activity Queues</span>'
          + '<div style="font-weight:700; font-size:13px; color:var(--text); margin-top:2px;">' + decliningQueues.length + ' queues (<= 5 submissions)</div>'
        + '</div>'
      + '</div>'
    + '</div>'

    // Filter Controls Bar
    + '<div class="queues-controls" style="margin-top:16px;">'
      + '<label>Search Queue / Shift / Floor / QTC<input id="qSearch" placeholder="Type to filter queues, shifts, floors, QTCs…" value="' + esc(queuesFilters.query || '') + '"></label>'
      + '<label>Shift<select id="qShift"><option value="">All shifts (' + allShifts.length + ')</option>' + allShifts.map(s => '<option value="' + esc(s) + '" ' + (queuesFilters.shift===s?'selected':'') + '>' + esc(s) + '</option>').join('') + '</select></label>'
      + '<label>Floor / Unit<select id="qFloor"><option value="">All floors (' + allFloors.length + ')</option>' + allFloors.map(f => '<option value="' + esc(f) + '" ' + (queuesFilters.floor===f?'selected':'') + '>' + esc(f) + '</option>').join('') + '</select></label>'
      + '<label>Category filter<select id="qCategory"><option value="">All categories</option><option value="lidarFP" ' + (queuesFilters.category==='lidarFP'?'selected':'') + '>Lidar FP</option><option value="lidarQA" ' + (queuesFilters.category==='lidarQA'?'selected':'') + '>Lidar QA</option><option value="laneFP" ' + (queuesFilters.category==='laneFP'?'selected':'') + '>Lane Line FP</option><option value="laneQA" ' + (queuesFilters.category==='laneQA'?'selected':'') + '>Lane Line QA</option></select></label>'
      + '<div style="margin-left:auto; display:flex; gap:8px; align-items:flex-end;">'
        + '<button class="btn btn-c" id="qExportCSV">↓ Export CSV</button>'
        + '<button class="btn" id="qReset">Reset filters</button>'
      + '</div>'
    + '</div>'

    // MAIN QUEUE TABLE WITH OBJECTS AND CONTRIBUTION %
    + '<section class="ux-panel" style="margin-top:20px;">'
      + '<div class="ux-heading" style="margin-bottom:12px;">'
        + '<div><h3>Queues Breakdown Table (' + filtered.length.toLocaleString() + ' queues)</h3><p>Click any column header with ↕ to sort. Click any queue row to open interactive drill-down modal.</p></div>'
        + '<span class="ux-note">Showing ' + (visible.length ? (queuesFilters.page*pageSize+1) : 0) + ' – ' + Math.min((queuesFilters.page+1)*pageSize, filtered.length) + ' of ' + filtered.length + ' queues</span>'
      + '</div>'
      + '<div class="perf-table">'
        + '<table>'
          + '<thead><tr>'
            + '<th data-sort="name">Queue Name ↕</th>'
            + '<th>Shifts</th>'
            + '<th>Floors / Units</th>'
            + '<th data-sort="lidarFP" style="color:#0d9488;">Lidar FP ↕</th>'
            + '<th data-sort="lidarQA" style="color:#14b8a6;">Lidar QA ↕</th>'
            + '<th data-sort="laneFP" style="color:#ed9a35;">Lane Line FP ↕</th>'
            + '<th data-sort="laneQA" style="color:#ec4899;">Lane Line QA ↕</th>'
            + '<th data-sort="totalSubmit" style="color:var(--primary);">Total Submit ↕</th>'
            + '<th data-sort="totalObjects" style="color:#0284c7;">Total Objects ↕</th>'
            + '<th data-sort="uniqueLabelers">Unique Labelers ↕</th>'
            + '<th data-sort="uniqueQtc">Unique QTCs ↕</th>'
            + '<th data-sort="avgSubmit">Avg / Labeler ↕</th>'
            + '<th>Share %</th>'
            + '<th>Action</th>'
          + '</tr></thead>'
          + '<tbody>'
            + visible.map(q => {
              const isDeclining = q.totalSubmit <= 5;
              const sharePct = totalTasks ? ((q.totalSubmit / totalTasks) * 100).toFixed(1) + '%' : '0%';
              return '<tr class="queue-row-item" data-queue-name="' + esc(q.name) + '" style="cursor:pointer;" title="Click to view detailed queue drill-down">'
                + '<td><b>' + esc(q.name) + '</b>' + (isDeclining ? ' <span class="q-badge" style="background:rgba(239,68,68,0.12); color:var(--danger); border:1px solid rgba(239,68,68,0.3); font-size:9px;">📉 Declining</span>' : '') + '</td>'
                + '<td><span class="ux-note" style="font-size:11px;">' + (q.shifts.slice(0, 2).map(esc).join(', ') + (q.shifts.length > 2 ? '...' : '')) + '</span></td>'
                + '<td><span class="ux-note" style="font-size:11px;">' + (q.floors.slice(0, 2).map(f => 'Unit ' + esc(f)).join(', ') + (q.floors.length > 2 ? '...' : '')) + '</span></td>'
                + '<td><b style="color:#0d9488;">' + q.lidarFP.toLocaleString() + '</b></td>'
                + '<td><b style="color:#14b8a6;">' + q.lidarQA.toLocaleString() + '</b></td>'
                + '<td><b style="color:#ed9a35;">' + q.laneFP.toLocaleString() + '</b></td>'
                + '<td><b style="color:#ec4899;">' + q.laneQA.toLocaleString() + '</b></td>'
                + '<td><strong style="color:var(--primary); font-size:14px;">' + q.totalSubmit.toLocaleString() + '</strong></td>'
                + '<td><strong style="color:#0284c7;">' + q.totalObjects.toLocaleString() + '</strong></td>'
                + '<td><b>' + q.uniqueLabelers.toLocaleString() + '</b></td>'
                + '<td><b>' + q.uniqueQtc.toLocaleString() + '</b></td>'
                + '<td><span class="q-val-avg">' + q.avgSubmitStr + '</span></td>'
                + '<td><b>' + sharePct + '</b></td>'
                + '<td><button class="btn btn-c q-drilldown-btn" data-queue-name="' + esc(q.name) + '" style="font-size:10px; padding:3px 8px;">🔍 Drill-down</button></td>'
              + '</tr>';
            }).join('')
          + '</tbody>'
        + '</table>'
        + (!filtered.length ? '<div class="ux-empty">No queues match your current filters.</div>' : '')
      + '</div>'
      + '<div class="perf-pagination" style="display:flex; justify-content:space-between; align-items:center; margin-top:14px;">'
        + '<button class="btn" id="qPrev" ' + (queuesFilters.page === 0 ? 'disabled' : '') + '>Previous</button>'
        + '<span class="ux-note">Page ' + (queuesFilters.page + 1) + ' of ' + totalPages + '</span>'
        + '<button class="btn" id="qNext" ' + (queuesFilters.page >= totalPages - 1 ? 'disabled' : '') + '>Next</button>'
      + '</div>'
    + '</section>'

    // INTERACTIVE TREND & BREAKDOWN SECTION
    + '<section class="ux-panel queues-trend-section" style="margin-top:20px;">'
      + '<div class="ux-heading" style="margin-bottom:14px;">'
        + '<div>'
          + '<div class="ux-eyebrow">Interactive Trend Analysis</div>'
          + '<h3 style="font-size:18px; margin:4px 0;">Queue Performance Trend</h3>'
          + '<p style="margin:0;">Track submissions over time for any queue and stage.</p>'
        + '</div>'
      + '</div>'
      + '<div class="queues-controls" style="margin:0 0 16px; padding:14px 18px;">'
        + '<label>Select Queue:<select id="qTrendQueue"><option value="all">All Queues</option>' + distinctQueues.map(n => '<option value="' + esc(n) + '" ' + (queuesChartFilters.queue===n?'selected':'') + '>' + esc(n) + '</option>').join('') + '</select></label>'
        + '<label>Stage / Modality:<select id="qTrendStage"><option value="all" ' + (queuesChartFilters.stage==='all'?'selected':'') + '>All Stages (Total)</option><option value="lidarFP" ' + (queuesChartFilters.stage==='lidarFP'?'selected':'') + '>Lidar FP</option><option value="lidarQA" ' + (queuesChartFilters.stage==='lidarQA'?'selected':'') + '>Lidar QA</option><option value="laneFP" ' + (queuesChartFilters.stage==='laneFP'?'selected':'') + '>Lane Line FP</option><option value="laneQA" ' + (queuesChartFilters.stage==='laneQA'?'selected':'') + '>Lane Line QA</option></select></label>'
        + '<label>Single Day:<input type="date" id="qTrendDay" value="' + esc(queuesChartFilters.day || '') + '"></label>'
        + '<label>From:<input type="date" id="qTrendFrom" value="' + esc(queuesChartFilters.from || '') + '"></label>'
        + '<label>To:<input type="date" id="qTrendTo" value="' + esc(queuesChartFilters.to || '') + '"></label>'
        + '<div style="display:flex; gap:8px; align-self:flex-end;">'
          + '<button class="btn btn-c" id="qTrendApplyDate">Filter Trend</button>'
          + '<button class="btn" id="qTrendResetDate">Reset Trend</button>'
        + '</div>'
      + '</div>'
      + '<div id="qTrendChart" class="an-line"></div>'
      + '<div id="qTrendSummary" style="display:flex; gap:12px; flex-wrap:wrap; margin-top:14px; font-size:12px;"></div>'
    + '</section>'
  + '</div>';

  bindHeaderControls(page, 'queues');
  bindUniversalFilterBar(page, 'queues');

  // Search, filter, sorting events
  const qSearchInput = $('qSearch');
  if(qSearchInput){
    qSearchInput.oninput = e => { queuesFilters.query = e.target.value; queuesFilters.page = 0; renderQueuesAnalysis(); };
  }
  const qShiftSel = $('qShift');
  if(qShiftSel){
    qShiftSel.onchange = e => { queuesFilters.shift = e.target.value; queuesFilters.page = 0; renderQueuesAnalysis(); };
  }
  const qFloorSel = $('qFloor');
  if(qFloorSel){
    qFloorSel.onchange = e => { queuesFilters.floor = e.target.value; queuesFilters.page = 0; renderQueuesAnalysis(); };
  }
  const qCatSel = $('qCategory');
  if(qCatSel){
    qCatSel.onchange = e => { queuesFilters.category = e.target.value; queuesFilters.page = 0; renderQueuesAnalysis(); };
  }
  const qResetBtn = $('qReset');
  if(qResetBtn){
    qResetBtn.onclick = () => {
      Object.assign(queuesFilters, { query: '', shift: '', floor: '', category: '', sortCol: 'totalSubmit', sortAsc: false, page: 0 });
      renderQueuesAnalysis();
    };
  }

  // Sorting
  page.querySelectorAll('th[data-sort]').forEach(th => {
    th.style.cursor = 'pointer';
    th.onclick = () => {
      const s = th.dataset.sort;
      if(queuesFilters.sortCol === s) { queuesFilters.sortAsc = !queuesFilters.sortAsc; }
      else { queuesFilters.sortCol = s; queuesFilters.sortAsc = false; }
      renderQueuesAnalysis();
    };
  });

  // Pagination
  const qPrev = $('qPrev'); if(qPrev) qPrev.onclick = () => { if(queuesFilters.page > 0){ queuesFilters.page--; renderQueuesAnalysis(); } };
  const qNext = $('qNext'); if(qNext) qNext.onclick = () => { if(queuesFilters.page < totalPages - 1){ queuesFilters.page++; renderQueuesAnalysis(); } };

  // Export CSV
  const qExp = $('qExportCSV');
  if(qExp) qExp.onclick = () => exportQueuesCSV(filtered);

  // Queue Drilldown Modal Bindings
  page.querySelectorAll('.queue-row-item, .q-drilldown-btn').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const qName = el.dataset.queueName;
      if(qName && typeof openQueueDetailModal === 'function') openQueueDetailModal(qName);
    };
  });

  // Trend controls
  renderQueueTrendChart(base);
}`;

// Helper: Open Queue Detail Drilldown Modal
const queueModalHelper = `
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
`;

code = replaceFunctionInCode(code, 'queuesAggregateData', newQueuesAggregateData);
code = replaceFunctionInCode(code, 'renderQueuesAnalysis', newRenderQueuesAnalysis);

// Append modal helper if not present
if (!code.includes('function openQueueDetailModal')) {
  code += queueModalHelper;
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('Applied new queuesAggregateData & renderQueuesAnalysis successfully');
