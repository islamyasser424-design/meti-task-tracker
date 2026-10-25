function renderQueuesAnalysis(){
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
          + '<div style="font-weight:700; font-size:13px; color:var(--text); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + (topQueue ? esc(topQueue.name) + ' (' + topQueue.totalSubmit.toLocaleString() + ' tasks)' : '') + '">' + (topQueue ? esc(topQueue.name) + ' <span style="color:var(--text-soft); font-weight:500;">(' + topQueue.totalSubmit.toLocaleString() + ')</span>' : '—') + '</div>'
        + '</div>'
        + '<div style="background:var(--bg-3); padding:10px 14px; border-radius:8px; border-left:3px solid #8b5cf6;">'
          + '<span class="ux-note">Workload Concentration (Top 3 Queues)</span>'
          + '<div style="font-weight:700; font-size:13px; color:var(--text); margin-top:2px;">' + top3Share + '% of all submissions</div>'
        + '</div>'
        + '<div style="background:var(--bg-3); padding:10px 14px; border-radius:8px; border-left:3px solid #f59e0b;">'
          + '<span class="ux-note">Lowest Volume Queue</span>'
          + '<div style="font-weight:700; font-size:13px; color:var(--text); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + (lowestQueue ? esc(lowestQueue.name) + ' (' + lowestQueue.totalSubmit.toLocaleString() + ' tasks)' : '') + '">' + (lowestQueue ? esc(lowestQueue.name) + ' <span style="color:var(--text-soft); font-weight:500;">(' + lowestQueue.totalSubmit.toLocaleString() + ')</span>' : '—') + '</div>'
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
  renderQueueTrendChart('qTrendChart', base);
}

function renderQueueTrendChart(containerId, rows) {
  if (Array.isArray(containerId)) { rows = containerId; containerId = 'qTrendChart'; }
  if (!containerId) containerId = 'qTrendChart';
  let chartRows = rows || [];
  const qi=hdrs.findIndex(h=>h.trim().toLowerCase()==='queue name');
 const mi=hdrs.findIndex(h=>h.trim().toLowerCase()==='modality');
 const pi=hdrs.findIndex(h=>h.trim().toLowerCase()==='pass');

 if(queuesChartFilters.queue!=='all'&&qi>=0){
  chartRows=chartRows.filter(r=>String(r[qi]||'').trim()===queuesChartFilters.queue);
 }
 if(queuesChartFilters.stage!=='all'){
  chartRows=chartRows.filter(r=>{
   const mod=mi<0?'':String(r[mi]||'').toLowerCase().replace(/[\s_-]+/g,'');
   const pass=pi<0?'':String(r[pi]||'').trim().toUpperCase();
   const prefix=mod==='lidar'?'lidar':(mod==='laneline'||mod==='lane')?'lane':'';
   return (prefix+pass)===queuesChartFilters.stage;
  });
 }
 if(queuesChartFilters.day){
  chartRows=chartRows.filter(r=>rDate(r)===queuesChartFilters.day);
 } else {
  if(queuesChartFilters.from) chartRows=chartRows.filter(r=>{const d=rDate(r); return d&&d>=queuesChartFilters.from;});
  if(queuesChartFilters.to) chartRows=chartRows.filter(r=>{const d=rDate(r); return d&&d<=queuesChartFilters.to;});
 }

 const dateMap=new Map();
 chartRows.forEach(r=>{
  const d=rDate(r);
  if(d) dateMap.set(d,(dateMap.get(d)||0)+1);
 });

 const sortedDates=[...dateMap.keys()].sort();
 const el=$(containerId);
 if(!el) return;
 if(!sortedDates.length){
  el.innerHTML='<div class="ux-empty">No queue submissions match the selected trend filters.</div>';
  const sumEl=$('qTrendSummary');
  if(sumEl) sumEl.innerHTML='<span class="q-trend-pill">Total: 0 submissions</span>';
  return;
 }

 const points=[];
 const startD=queuesChartFilters.from||sortedDates[0];
 const endD=queuesChartFilters.to||sortedDates[sortedDates.length-1];
 let cur=new Date(startD+'T00:00:00Z'), end=new Date(endD+'T00:00:00Z');
 if(cur<=end && (end-cur)/(86400000)<=90){
  while(cur<=end){
   const k=cur.toISOString().slice(0,10);
   points.push([k,dateMap.get(k)||0]);
   cur.setUTCDate(cur.getUTCDate()+1);
  }
 } else {
  sortedDates.forEach(d=>points.push([d,dateMap.get(d)||0]));
 }

 const catColorMap={all:'#0d9488',lidarFP:'#0d9488',lidarQA:'#15b8a6',laneFP:'#ed9a35',laneQA:'#e9689e'};
 const strokeColor=catColorMap[queuesChartFilters.stage]||'#0d9488';

 const W=760,H=260,L=55,R=20,T=20,B=45;
 const max=Math.max(1,...points.map(p=>p[1]));
 const x=i=>L+(points.length===1?(W-L-R)/2:i/(points.length-1)*(W-L-R));
 const y=v=>H-B-v/max*(H-T-B);

 let svg='<svg viewBox="0 0 '+W+' '+H+'" role="group" aria-label="Queue trend area chart">';
 svg+='<defs><linearGradient id="qTrendGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="'+strokeColor+'" stop-opacity="0.4"/><stop offset="100%" stop-color="'+strokeColor+'" stop-opacity="0.02"/></linearGradient></defs>';
 for(let i=0;i<5;i++){
  const val=max*i/4, yy=y(val);
  svg+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+yy+'" y2="'+yy+'" stroke="var(--border)" stroke-dasharray="3 3"/><text x="'+(L-9)+'" y="'+(yy+4)+'" text-anchor="end">'+Number(val.toFixed(1)).toLocaleString()+'</text>';
 }
 if(points.length>1){
  const polyPoints=[L+','+(H-B),...points.map((p,i)=>x(i)+','+y(p[1])),(points.length===1?L:x(points.length-1))+','+(H-B)].join(' ');
  svg+='<polygon fill="url(#qTrendGrad)" points="'+polyPoints+'"/>';
 }
 svg+='<polyline fill="none" stroke="'+strokeColor+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="'+points.map((p,i)=>x(i)+','+y(p[1])).join(' ')+'"/>';
 points.forEach(([d,c],i)=>{
  svg+='<circle tabindex="0" role="button" aria-label="'+d+': '+c+' submissions" cx="'+x(i)+'" cy="'+y(c)+'" r="4.5" fill="'+strokeColor+'" stroke="var(--bg-3)" stroke-width="1.5"></circle>';
  if(i===0||i===points.length-1||(points.length>3&&i===Math.floor(points.length/2))){
   svg+='<text x="'+x(i)+'" y="'+(H-12)+'" text-anchor="'+(i===0?'start':i===points.length-1?'end':'middle')+'">'+d+'</text>';
  }
 });
 svg+='</svg>';
 el.innerHTML=svg;

 const qName = queuesChartFilters.queue==='all'?'All Queues':queuesChartFilters.queue;
 const stageName = queuesChartFilters.stage==='all'?'All Stages':queuesChartFilters.stage;
 el.querySelectorAll('circle').forEach((circle, i)=>{
  const [d, c] = points[i] || [];
  MeegTooltip.attach(circle, () => ({
   title: d,
   badge: stageName,
   desc: 'Queue Performance Trend',
   rows: [
    { label: 'Queue', value: qName, color: 'var(--accent)' },
    { label: 'Stage', value: stageName, color: strokeColor },
    { label: 'Submissions', value: (c || 0).toLocaleString(), color: '#15b8a6' },
    { label: '% of Period Peak', value: ((c / max) * 100).toFixed(1) + '%', color: '#f59e0b' }
   ]
  }));
 });

 const sumEl=$('qTrendSummary');
 if(sumEl){
  const totalSub=points.reduce((s,p)=>s+p[1],0);
  const peak=points.reduce((p,c)=>c[1]>p[1]?c:p,['—',0]);
  sumEl.innerHTML='<span class="q-trend-pill">Queue: <b>'+esc(queuesChartFilters.queue==='all'?'All Queues':queuesChartFilters.queue)+'</b></span>'
   +'<span class="q-trend-pill">Stage: <b>'+esc(queuesChartFilters.stage)+'</b></span>'
   +'<span class="q-trend-pill">Total Submissions: <b style="color:var(--accent)">'+totalSub.toLocaleString()+'</b></span>'
   +'<span class="q-trend-pill">Peak Day: <b>'+peak[0]+' ('+peak[1].toLocaleString()+')</b></span>'
   +'<span class="q-trend-pill">Active Days: <b>'+points.filter(p=>p[1]>0).length+'</b></span>';
 }
}


// ============================================================
// PAGE: GM REPORT (Queue Operations Table matching user sheet)
// ============================================================


function parseTaskHour(ts) {
  if (!ts) return -1;
  const s = String(ts).trim();
  // 12-hour AM/PM: e.g. '10/21/2026, 11:06:49 AM'
  const ampm = s.match(/(\d{1,2}):\d{2}(?::\d{2})?\s*(AM|PM)/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const isPM = ampm[2].toUpperCase() === 'PM';
    if (isPM && h < 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return h;
  }
  // 24-hour: e.g. '2026-10-21 14:41:37' or '2026-10-21 1:41:37'
  const m24 = s.match(/(?:\s+|T)(\d{1,2}):(\d{2})/);
  if (m24) {
    return parseInt(m24[1], 10);
  }
  return -1;
}

function getTaskShiftCategory(r) {
  const tsIdx = hdrs ? hdrs.findIndex(h => ['timestamp', 'created at', 'date'].includes(h.toLowerCase())) : -1;
  const si = hdrs ? hdrs.findIndex(h => h.toLowerCase() === 'shift') : -1;

  const ts = tsIdx >= 0 ? r[tsIdx] : '';
  const h = parseTaskHour(ts);
  if (h >= 0) {
    // 12:00 AM to 8:00 AM (00:00 to 07:59:59)
    if (h < 8) return 'on';
    // 8:00 AM to 4:00 PM (08:00 to 15:59:59)
    if (h < 16) return 'morning';
    // 4:00 PM to 12:00 AM (16:00 to 23:59:59)
    return 'night';
  }

  // Fallback to Shift text if timestamp has no hour
  const shStr = si >= 0 ? String(r[si] || '').toLowerCase() : '';
  if (shStr.includes('on') || shStr.includes('over')) return 'on';
  if (shStr.includes('morn')) return 'morning';
  if (shStr.includes('night')) return 'night';
  return 'morning';
}

function gmQueueReport(rows, universe = rows) {
  const idx = name => hdrs ? hdrs.findIndex(h => h.trim().toLowerCase() === name.toLowerCase()) : -1;
  const qi = idx('Queue Name');
  const mi = idx('Modality');
  const pi = idx('Pass');
  const ni = idx('National Id');
  const li = idx('Labeler Name');
  const sti = idx('Stage');

  const groups = new Map();

  const getModality = r => {
    const raw = mi >= 0 ? String(r[mi] || '').trim() : '';
    const key = raw.toLowerCase().replace(/[\s_-]+/g, '');
    if (key === 'lidar') return 'Lidar';
    if (key === 'laneline' || key === 'lane') return 'Lane Line';
    return raw || 'Unspecified';
  };

  const checkRelabel = (qName, r) => {
    const qLower = String(qName || '').toLowerCase();
    const stLower = sti >= 0 ? String(r[sti] || '').toLowerCase() : '';
    const modLower = mi >= 0 ? String(r[mi] || '').toLowerCase() : '';
    return qLower.includes('relabel') || stLower.includes('relabel') || modLower.includes('relabel');
  };

  function group(r) {
    const name = qi < 0 ? '' : String(r[qi] || '').trim();
    if (!name) return null;
    const mod = getModality(r);
    const isRelabel = checkRelabel(name, r);
    const key = JSON.stringify([name, mod, isRelabel]);
    if (!groups.has(key)) {
      groups.set(key, {
        name,
        mod,
        isRelabel,
        fp: 0,
        qa: 0,
        fpIds: new Set(),
        qaIds: new Set(),
        missing: 0
      });
    }
    return groups.get(key);
  }

  universe.forEach(group);

  rows.forEach(r => {
    const g = group(r);
    if (!g) return;
    const pass = pi < 0 ? '' : String(r[pi] || '').trim().toUpperCase();
    if (pass !== 'FP' && pass !== 'QA') return;
    const key = pass.toLowerCase();
    g[key]++;

    // De-duplicate unique labelers
    let id = ni < 0 ? '' : String(r[ni] || '').trim()
      .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632))
      .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776))
      .replace(/\.0+$/, '').replace(/[\s-]/g, '');

    if (/^\d{14}$/.test(id)) {
      g[key + 'Ids'].add(id);
    } else {
      const name = li >= 0 ? String(r[li] || '').trim().toLowerCase() : '';
      if (name) {
        g[key + 'Ids'].add('NAME_' + name);
      } else {
        g.missing++;
      }
    }
  });

  return {
    hasQueue: qi >= 0,
    hasPass: pi >= 0,
    groups: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name) || a.mod.localeCompare(b.mod))
  };
}



function buildFloorSummaryTableHTML(rep, sRows, sortCol, sortAsc) {
  const idx = name => hdrs ? hdrs.findIndex(h => h.trim().toLowerCase() === name.toLowerCase()) : -1;
  const qi = idx('Queue Name');
  const mi = idx('Modality');
  const pi = idx('Pass');
  const ni = idx('National Id');
  const li = idx('Labeler Name');
  const sti = idx('Stage');
  const fi = hdrs ? hdrs.findIndex(h => ['floor', 'unit', 'location'].includes(h.toLowerCase())) : -1;

  const getModality = r => {
    const raw = mi >= 0 ? String(r[mi] || '').trim() : '';
    const key = raw.toLowerCase().replace(/[\s_-]+/g, '');
    if (key === 'lidar') return 'Lidar';
    if (key === 'laneline' || key === 'lane') return 'Lane Line';
    return raw || 'Unspecified';
  };

  const checkRelabel = (qName, r) => {
    const qLower = String(qName || '').toLowerCase();
    const stLower = sti >= 0 ? String(r[sti] || '').toLowerCase() : '';
    const modLower = mi >= 0 ? String(r[mi] || '').toLowerCase() : '';
    return qLower.includes('relabel') || stLower.includes('relabel') || modLower.includes('relabel');
  };

  const floorMap = new Map();

  sRows.forEach(r => {
    const fl = (typeof deriveFloor === 'function' && fi >= 0) ? deriveFloor(r[fi]) : (fi >= 0 && r[fi] ? String(r[fi]).trim() : 'Floor Room');
    const mod = getModality(r);
    const mLower = mod.toLowerCase().replace(/[\s_-]+/g, '');
    const pass = pi >= 0 ? String(r[pi]||'').trim().toUpperCase() : '';
    const labId = ni >= 0 && r[ni] ? String(r[ni]).trim() : (li >= 0 ? String(r[li]||'').trim() : '');
    const q = qi >= 0 ? String(r[qi]||'').trim() : '';
    const isRelabel = checkRelabel(q, r);

    if (!floorMap.has(fl)) {
      floorMap.set(fl, {
        floor: fl,
        lidarFp: 0,
        lidarFpLabelers: new Set(),
        lidarQa: 0,
        lidarQaLabelers: new Set(),
        laneFp: 0,
        laneFpLabelers: new Set(),
        laneQa: 0,
        laneQaLabelers: new Set(),
        relabelFp: 0,
        relabelFpLabelers: new Set(),
        relabelQa: 0,
        relabelQaLabelers: new Set(),
        totalTasks: 0,
        allLabelers: new Set()
      });
    }

    const f = floorMap.get(fl);
    f.totalTasks++;
    if (labId) f.allLabelers.add(labId);

    if (isRelabel) {
      if (pass === 'FP') {
        f.relabelFp++;
        if (labId) f.relabelFpLabelers.add(labId);
      } else if (pass === 'QA') {
        f.relabelQa++;
        if (labId) f.relabelQaLabelers.add(labId);
      }
    }

    if (mLower === 'lidar') {
      if (pass === 'FP') {
        f.lidarFp++;
        if (labId) f.lidarFpLabelers.add(labId);
      } else if (pass === 'QA') {
        f.lidarQa++;
        if (labId) f.lidarQaLabelers.add(labId);
      }
    } else if (mLower === 'laneline' || mLower === 'lane') {
      if (pass === 'FP') {
        f.laneFp++;
        if (labId) f.laneFpLabelers.add(labId);
      } else if (pass === 'QA') {
        f.laneQa++;
        if (labId) f.laneQaLabelers.add(labId);
      }
    }
  });

  let floorList = [...floorMap.values()];
  if (sortCol === 'floor') {
    floorList.sort((a,b) => sortAsc ? a.floor.localeCompare(b.floor) : b.floor.localeCompare(a.floor));
  } else if (sortCol === 'lidarFp') {
    floorList.sort((a,b) => sortAsc ? a.lidarFp - b.lidarFp : b.lidarFp - a.lidarFp);
  } else if (sortCol === 'lidarFpLabs') {
    floorList.sort((a,b) => sortAsc ? a.lidarFpLabelers.size - b.lidarFpLabelers.size : b.lidarFpLabelers.size - a.lidarFpLabelers.size);
  } else if (sortCol === 'lidarQa') {
    floorList.sort((a,b) => sortAsc ? a.lidarQa - b.lidarQa : b.lidarQa - a.lidarQa);
  } else if (sortCol === 'lidarQaLabs') {
    floorList.sort((a,b) => sortAsc ? a.lidarQaLabelers.size - b.lidarQaLabelers.size : b.lidarQaLabelers.size - a.lidarQaLabelers.size);
  } else if (sortCol === 'laneFp') {
    floorList.sort((a,b) => sortAsc ? a.laneFp - b.laneFp : b.laneFp - a.laneFp);
  } else if (sortCol === 'laneFpLabs') {
    floorList.sort((a,b) => sortAsc ? a.laneFpLabelers.size - b.laneFpLabelers.size : b.laneFpLabelers.size - a.laneFpLabelers.size);
  } else if (sortCol === 'laneQa') {
    floorList.sort((a,b) => sortAsc ? a.laneQa - b.laneQa : b.laneQa - a.laneQa);
  } else if (sortCol === 'laneQaLabs') {
    floorList.sort((a,b) => sortAsc ? a.laneQaLabelers.size - b.laneQaLabelers.size : b.laneQaLabelers.size - a.laneQaLabelers.size);
  } else if (sortCol === 'relabelFp') {
    floorList.sort((a,b) => sortAsc ? a.relabelFp - b.relabelFp : b.relabelFp - a.relabelFp);
  } else if (sortCol === 'relabelLabs') {
    floorList.sort((a,b) => sortAsc ? (a.relabelFpLabelers.size + a.relabelQaLabelers.size) - (b.relabelFpLabelers.size + b.relabelQaLabelers.size) : (b.relabelFpLabelers.size + b.relabelQaLabelers.size) - (a.relabelFpLabelers.size + a.relabelQaLabelers.size));
  } else if (sortCol === 'total') {
    floorList.sort((a,b) => sortAsc ? a.totalTasks - b.totalTasks : b.totalTasks - a.totalTasks);
  } else if (sortCol === 'labelers') {
    floorList.sort((a,b) => sortAsc ? a.allLabelers.size - b.allLabelers.size : b.allLabelers.size - a.allLabelers.size);
  } else {
    floorList.sort((a,b) => b.totalTasks - a.totalTasks || a.floor.localeCompare(b.floor));
  }
  
  const getFSIcon = c => (sortCol === c ? `<span class="table-sort-icon active">${sortAsc ? '▲' : '▼'}</span>` : `<span class="table-sort-icon">↕</span>`);
  
  let sumLidarFp = 0, sumLidarQa = 0;
  let sumLaneFp = 0, sumLaneQa = 0;
  let sumRelabelFp = 0, sumRelabelQa = 0;
  let sumGrandTasks = 0;
  const allLidarFpLabs = new Set(), allLidarQaLabs = new Set();
  const allLaneFpLabs = new Set(), allLaneQaLabs = new Set();
  const allRelabelLabs = new Set();
  const grandAllLabs = new Set();

  floorList.forEach(f => {
    sumLidarFp += f.lidarFp;
    sumLidarQa += f.lidarQa;
    sumLaneFp += f.laneFp;
    sumLaneQa += f.laneQa;
    sumRelabelFp += f.relabelFp;
    sumRelabelQa += f.relabelQa;
    sumGrandTasks += f.totalTasks;

    f.lidarFpLabelers.forEach(l => allLidarFpLabs.add(l));
    f.lidarQaLabelers.forEach(l => allLidarQaLabs.add(l));
    f.laneFpLabelers.forEach(l => allLaneFpLabs.add(l));
    f.laneQaLabelers.forEach(l => allLaneQaLabs.add(l));
    f.relabelFpLabelers.forEach(l => allRelabelLabs.add(l));
    f.relabelQaLabelers.forEach(l => allRelabelLabs.add(l));
    f.allLabelers.forEach(l => grandAllLabs.add(l));
  });

  const hasRelabeling = (sumRelabelFp + sumRelabelQa) > 0;

  return `
    <div class="daily-table-wrap">
      <table class="daily-queue-table" style="font-size:12px; border:1px solid var(--border); border-radius:8px; overflow:hidden;">
        <thead>
          <tr style="background:var(--bg-subtle, rgba(0,0,0,0.03)); border-bottom:1px solid var(--border);">
            <th rowspan="2" class="sortable" data-sort="floor" style="vertical-align:middle; width:160px; font-weight:800; font-size:12px; background:var(--card-bg, #fff); cursor:pointer;" title="Sort by Floor / Room">
              🏢 FLOOR / ROOM ${getFSIcon('floor')}
            </th>
            <th colspan="2" style="text-align:center; background:rgba(56, 189, 248, 0.1); border-left:1px solid var(--border); border-right:1px solid var(--border); color:#0284c7; font-weight:800; padding:8px 4px;">
              📡 LIDAR FP
            </th>
            <th colspan="2" style="text-align:center; background:rgba(16, 185, 129, 0.1); border-right:1px solid var(--border); color:#059669; font-weight:800; padding:8px 4px;">
              🔍 LIDAR QA
            </th>
            <th colspan="2" style="text-align:center; background:rgba(99, 102, 241, 0.1); border-right:1px solid var(--border); color:#4f46e5; font-weight:800; padding:8px 4px;">
              🛣️ LANE LINE FP
            </th>
            <th colspan="2" style="text-align:center; background:rgba(236, 72, 153, 0.1); border-right:1px solid var(--border); color:#db2777; font-weight:800; padding:8px 4px;">
              📐 LANE LINE QA
            </th>
            ${hasRelabeling ? `
              <th colspan="2" style="text-align:center; background:rgba(245, 158, 11, 0.1); border-right:1px solid var(--border); color:#d97706; font-weight:800; padding:8px 4px;">
                🔄 RELABELING
              </th>
            ` : ''}
            <th colspan="2" style="text-align:center; background:rgba(100, 116, 139, 0.1); border-right:1px solid var(--border); color:var(--text); font-weight:800; padding:8px 4px;">
              ⭐ TOTAL SUMMARY
            </th>
          </tr>
          <tr style="font-size:10.5px; text-transform:uppercase; background:var(--bg-subtle, rgba(0,0,0,0.02)); border-bottom:1.5px solid var(--border);">
            <th class="sortable" data-sort="lidarFp" style="border-left:1px solid var(--border); text-align:right; padding:6px 10px; color:#0284c7; cursor:pointer;" title="Sort by Lidar FP Tasks">Tasks ${getFSIcon('lidarFp')}</th>
            <th class="sortable" data-sort="lidarFpLabs" style="border-right:1px solid var(--border); text-align:right; padding:6px 10px; color:var(--text-soft); cursor:pointer;" title="Sort by Lidar FP Labelers">Uniq Lab ${getFSIcon('lidarFpLabs')}</th>
            <th class="sortable" data-sort="lidarQa" style="text-align:right; padding:6px 10px; color:#059669; cursor:pointer;" title="Sort by Lidar QA Tasks">Tasks ${getFSIcon('lidarQa')}</th>
            <th class="sortable" data-sort="lidarQaLabs" style="border-right:1px solid var(--border); text-align:right; padding:6px 10px; color:var(--text-soft); cursor:pointer;" title="Sort by Lidar QA Labelers">Uniq Lab ${getFSIcon('lidarQaLabs')}</th>
            <th class="sortable" data-sort="laneFp" style="text-align:right; padding:6px 10px; color:#4f46e5; cursor:pointer;" title="Sort by Lane Line FP Tasks">Tasks ${getFSIcon('laneFp')}</th>
            <th class="sortable" data-sort="laneFpLabs" style="border-right:1px solid var(--border); text-align:right; padding:6px 10px; color:var(--text-soft); cursor:pointer;" title="Sort by Lane Line FP Labelers">Uniq Lab ${getFSIcon('laneFpLabs')}</th>
            <th class="sortable" data-sort="laneQa" style="text-align:right; padding:6px 10px; color:#db2777; cursor:pointer;" title="Sort by Lane Line QA Tasks">Tasks ${getFSIcon('laneQa')}</th>
            <th class="sortable" data-sort="laneQaLabs" style="border-right:1px solid var(--border); text-align:right; padding:6px 10px; color:var(--text-soft); cursor:pointer;" title="Sort by Lane Line QA Labelers">Uniq Lab ${getFSIcon('laneQaLabs')}</th>
            ${hasRelabeling ? `
              <th class="sortable" data-sort="relabelFp" style="text-align:right; padding:6px 10px; color:#d97706; cursor:pointer;" title="Sort by Relabel Tasks">Tasks ${getFSIcon('relabelFp')}</th>
              <th class="sortable" data-sort="relabelLabs" style="border-right:1px solid var(--border); text-align:right; padding:6px 10px; color:var(--text-soft); cursor:pointer;" title="Sort by Relabel Labelers">Uniq Lab ${getFSIcon('relabelLabs')}</th>
            ` : ''}
            <th class="sortable" data-sort="total" style="text-align:right; font-weight:800; padding:6px 12px; color:var(--text); cursor:pointer;" title="Sort by Total Tasks">Tasks ${getFSIcon('total')}</th>
            <th class="sortable" data-sort="labelers" style="text-align:right; font-weight:800; padding:6px 12px; color:var(--primary); cursor:pointer;" title="Sort by Total Unique Labelers">Uniq Lab ${getFSIcon('labelers')}</th>
          </tr>
        </thead>
        <tbody>
          ${floorList.map(f => `
            <tr class="daily-queue-row">
              <td style="font-weight:700; color:var(--primary); font-size:12.5px; white-space:nowrap; padding:10px 14px;">
                🏢 ${esc(f.floor)}
              </td>
              <td class="daily-num-cell highlight-fp" style="border-left:1px solid var(--border);">${f.lidarFp.toLocaleString()}</td>
              <td class="daily-num-cell" style="border-right:1px solid var(--border); color:var(--text-soft);">${f.lidarFpLabelers.size.toLocaleString()}</td>
              <td class="daily-num-cell highlight-qa">${f.lidarQa.toLocaleString()}</td>
              <td class="daily-num-cell" style="border-right:1px solid var(--border); color:var(--text-soft);">${f.lidarQaLabelers.size.toLocaleString()}</td>
              <td class="daily-num-cell highlight-fp">${f.laneFp.toLocaleString()}</td>
              <td class="daily-num-cell" style="border-right:1px solid var(--border); color:var(--text-soft);">${f.laneFpLabelers.size.toLocaleString()}</td>
              <td class="daily-num-cell highlight-qa">${f.laneQa.toLocaleString()}</td>
              <td class="daily-num-cell" style="border-right:1px solid var(--border); color:var(--text-soft);">${f.laneQaLabelers.size.toLocaleString()}</td>
              ${hasRelabeling ? `
                <td class="daily-num-cell" style="color:#d97706; font-weight:700;">${(f.relabelFp + f.relabelQa).toLocaleString()}</td>
                <td class="daily-num-cell" style="border-right:1px solid var(--border); color:var(--text-soft);">${(f.relabelFpLabelers.size + f.relabelQaLabelers.size).toLocaleString()}</td>
              ` : ''}
              <td class="daily-num-cell" style="font-weight:800; font-size:13px; color:var(--text); background:rgba(0,0,0,0.015); padding:10px 12px;">${f.totalTasks.toLocaleString()}</td>
              <td class="daily-num-cell" style="font-weight:700; color:var(--primary); background:rgba(0,0,0,0.015); padding:10px 12px;">${f.allLabelers.size.toLocaleString()}</td>
            </tr>
          `).join('')}
          ${!floorList.length ? `<tr><td colspan="${hasRelabeling ? 13 : 11}" class="ux-empty" style="text-align:center; padding:32px;">No floor submissions recorded for ${rep.meta.name}.</td></tr>` : ''}
        </tbody>
        <tfoot>
          <tr class="daily-total-row" style="background:var(--bg-subtle, rgba(0,0,0,0.04));">
            <td style="padding:14px 18px; font-weight:800; font-size:12.5px;">
              TOTAL ${rep.meta.name} (${floorList.length} Floors):
            </td>
            <td class="daily-num-cell highlight-fp" style="border-left:1px solid var(--border);"><b>${sumLidarFp.toLocaleString()}</b></td>
            <td class="daily-num-cell" style="border-right:1px solid var(--border);"><b>${allLidarFpLabs.size.toLocaleString()}</b></td>
            <td class="daily-num-cell highlight-qa"><b>${sumLidarQa.toLocaleString()}</b></td>
            <td class="daily-num-cell" style="border-right:1px solid var(--border);"><b>${allLidarQaLabs.size.toLocaleString()}</b></td>
            <td class="daily-num-cell highlight-fp"><b>${sumLaneFp.toLocaleString()}</b></td>
            <td class="daily-num-cell" style="border-right:1px solid var(--border);"><b>${allLaneFpLabs.size.toLocaleString()}</b></td>
            <td class="daily-num-cell highlight-qa"><b>${sumLaneQa.toLocaleString()}</b></td>
            <td class="daily-num-cell" style="border-right:1px solid var(--border);"><b>${allLaneQaLabs.size.toLocaleString()}</b></td>
            ${hasRelabeling ? `
              <td class="daily-num-cell" style="color:#d97706;"><b>${(sumRelabelFp + sumRelabelQa).toLocaleString()}</b></td>
              <td class="daily-num-cell" style="border-right:1px solid var(--border);"><b>${allRelabelLabs.size.toLocaleString()}</b></td>
            ` : ''}
            <td class="daily-num-cell" style="font-size:14px; font-weight:900; color:var(--text);"><b>${sumGrandTasks.toLocaleString()}</b></td>
            <td class="daily-num-cell" style="font-size:13px; font-weight:800; color:var(--primary);"><b>${grandAllLabs.size.toLocaleString()}</b></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function build24HourFloorSummaryTableHTML(shiftReports, baseRows, sortCol, sortAsc) {
  const idx = name => hdrs ? hdrs.findIndex(h => h.trim().toLowerCase() === name.toLowerCase()) : -1;
  const qi = idx('Queue Name');
  const mi = idx('Modality');
  const pi = idx('Pass');
  const ni = idx('National Id');
  const li = idx('Labeler Name');
  const sti = idx('Stage');
  const fi = hdrs ? hdrs.findIndex(h => ['floor', 'unit', 'location'].includes(h.toLowerCase())) : -1;

  const getModality = r => {
    const raw = mi >= 0 ? String(r[mi] || '').trim() : '';
    const key = raw.toLowerCase().replace(/[\s_-]+/g, '');
    if (key === 'lidar') return 'Lidar';
    if (key === 'laneline' || key === 'lane') return 'Lane Line';
    return raw || 'Unspecified';
  };

  const checkRelabel = (qName, r) => {
    const qLower = String(qName || '').toLowerCase();
    const stLower = sti >= 0 ? String(r[sti] || '').toLowerCase() : '';
    const modLower = mi >= 0 ? String(r[mi] || '').toLowerCase() : '';
    return qLower.includes('relabel') || stLower.includes('relabel') || modLower.includes('relabel');
  };

  const floorMap = new Map();

  shiftReports.forEach(rep => {
    const sCat = rep.meta.key; // 'on' | 'morning' | 'night'
    (rep.sRows || []).forEach(r => {
      const fl = (typeof deriveFloor === 'function' && fi >= 0) ? deriveFloor(r[fi]) : (fi >= 0 && r[fi] ? String(r[fi]).trim() : 'Floor Room');
      const mod = getModality(r);
      const mLower = mod.toLowerCase().replace(/[\s_-]+/g, '');
      const pass = pi >= 0 ? String(r[pi]||'').trim().toUpperCase() : '';
      const labId = ni >= 0 && r[ni] ? String(r[ni]).trim() : (li >= 0 ? String(r[li]||'').trim() : '');
      const q = qi >= 0 ? String(r[qi]||'').trim() : '';
      const isRelabel = checkRelabel(q, r);

      if (!floorMap.has(fl)) {
        floorMap.set(fl, {
          floor: fl,
          onTasks: 0, onLabs: new Set(),
          mornTasks: 0, mornLabs: new Set(),
          nightTasks: 0, nightLabs: new Set(),
          lidarFp: 0, lidarFpLabs: new Set(),
          lidarQa: 0, lidarQaLabs: new Set(),
          laneFp: 0, laneFpLabs: new Set(),
          laneQa: 0, laneQaLabs: new Set(),
          relabelTasks: 0, relabelLabs: new Set(),
          totalTasks: 0, allLabs: new Set()
        });
      }

      const f = floorMap.get(fl);
      f.totalTasks++;
      if (labId) f.allLabs.add(labId);

      if (sCat === 'on') {
        f.onTasks++;
        if (labId) f.onLabs.add(labId);
      } else if (sCat === 'morning') {
        f.mornTasks++;
        if (labId) f.mornLabs.add(labId);
      } else if (sCat === 'night') {
        f.nightTasks++;
        if (labId) f.nightLabs.add(labId);
      }

      if (isRelabel) {
        f.relabelTasks++;
        if (labId) f.relabelLabs.add(labId);
      }

      if (mLower === 'lidar') {
        if (pass === 'FP') { f.lidarFp++; if (labId) f.lidarFpLabs.add(labId); }
        else if (pass === 'QA') { f.lidarQa++; if (labId) f.lidarQaLabs.add(labId); }
      } else if (mLower === 'laneline' || mLower === 'lane') {
        if (pass === 'FP') { f.laneFp++; if (labId) f.laneFpLabs.add(labId); }
        else if (pass === 'QA') { f.laneQa++; if (labId) f.laneQaLabs.add(labId); }
      }
    });
  });

  let floorList = [...floorMap.values()];
  if (sortCol === 'floor') {
    floorList.sort((a,b) => sortAsc ? a.floor.localeCompare(b.floor) : b.floor.localeCompare(a.floor));
  } else if (sortCol === 'onTasks') {
    floorList.sort((a,b) => sortAsc ? a.onTasks - b.onTasks : b.onTasks - a.onTasks);
  } else if (sortCol === 'onLabs') {
    floorList.sort((a,b) => sortAsc ? a.onLabs.size - b.onLabs.size : b.onLabs.size - a.onLabs.size);
  } else if (sortCol === 'mornTasks') {
    floorList.sort((a,b) => sortAsc ? a.mornTasks - b.mornTasks : b.mornTasks - a.mornTasks);
  } else if (sortCol === 'mornLabs') {
    floorList.sort((a,b) => sortAsc ? a.mornLabs.size - b.mornLabs.size : b.mornLabs.size - a.mornLabs.size);
  } else if (sortCol === 'nightTasks') {
    floorList.sort((a,b) => sortAsc ? a.nightTasks - b.nightTasks : b.nightTasks - a.nightTasks);
  } else if (sortCol === 'nightLabs') {
    floorList.sort((a,b) => sortAsc ? a.nightLabs.size - b.nightLabs.size : b.nightLabs.size - a.nightLabs.size);
  } else if (sortCol === 'lidarFp') {
    floorList.sort((a,b) => sortAsc ? a.lidarFp - b.lidarFp : b.lidarFp - a.lidarFp);
  } else if (sortCol === 'lidarQa') {
    floorList.sort((a,b) => sortAsc ? a.lidarQa - b.lidarQa : b.lidarQa - a.lidarQa);
  } else if (sortCol === 'laneFp') {
    floorList.sort((a,b) => sortAsc ? a.laneFp - b.laneFp : b.laneFp - a.laneFp);
  } else if (sortCol === 'laneQa') {
    floorList.sort((a,b) => sortAsc ? a.laneQa - b.laneQa : b.laneQa - a.laneQa);
  } else if (sortCol === 'total') {
    floorList.sort((a,b) => sortAsc ? a.totalTasks - b.totalTasks : b.totalTasks - a.totalTasks);
  } else if (sortCol === 'labelers') {
    floorList.sort((a,b) => sortAsc ? a.allLabs.size - b.allLabs.size : b.allLabs.size - a.allLabs.size);
  } else {
    floorList.sort((a,b) => b.totalTasks - a.totalTasks || a.floor.localeCompare(b.floor));
  }

  const get24Icon = c => (sortCol === c ? `<span class="table-sort-icon active">${sortAsc ? '▲' : '▼'}</span>` : `<span class="table-sort-icon">↕</span>`);
  
  let totOn = 0, totMorn = 0, totNight = 0, grandTot = 0;
  let totLidarFp = 0, totLidarQa = 0, totLaneFp = 0, totLaneQa = 0, totRelabel = 0;
  const allOnLabs = new Set(), allMornLabs = new Set(), allNightLabs = new Set(), allTotalLabs = new Set();
  const allLidarFpLabs = new Set(), allLidarQaLabs = new Set(), allLaneFpLabs = new Set(), allLaneQaLabs = new Set(), allRelabelLabs = new Set();

  floorList.forEach(f => {
    totOn += f.onTasks; totMorn += f.mornTasks; totNight += f.nightTasks; grandTot += f.totalTasks;
    totLidarFp += f.lidarFp; totLidarQa += f.lidarQa; totLaneFp += f.laneFp; totLaneQa += f.laneQa; totRelabel += f.relabelTasks;

    f.onLabs.forEach(l => allOnLabs.add(l));
    f.mornLabs.forEach(l => allMornLabs.add(l));
    f.nightLabs.forEach(l => allNightLabs.add(l));
    f.allLabs.forEach(l => allTotalLabs.add(l));
    f.lidarFpLabs.forEach(l => allLidarFpLabs.add(l));
    f.lidarQaLabs.forEach(l => allLidarQaLabs.add(l));
    f.laneFpLabs.forEach(l => allLaneFpLabs.add(l));
    f.laneQaLabs.forEach(l => allLaneQaLabs.add(l));
    f.relabelLabs.forEach(l => allRelabelLabs.add(l));
  });

  return `
    <div class="daily-table-wrap">
      <table class="daily-queue-table" style="font-size:12px; border:1px solid var(--border); border-radius:8px; overflow:hidden;">
        <thead>
          <tr style="background:var(--bg-subtle, rgba(0,0,0,0.03)); border-bottom:1px solid var(--border);">
            <th rowspan="2" class="sortable" data-sort="floor" style="vertical-align:middle; width:160px; font-weight:800; font-size:12px; background:var(--card-bg, #fff); cursor:pointer;" title="Sort by Floor / Room">
              🏢 FLOOR / ROOM ${get24Icon('floor')}
            </th>
            <th colspan="2" style="text-align:center; background:rgba(139, 92, 246, 0.1); border-left:1px solid var(--border); border-right:1px solid var(--border); color:#8b5cf6; font-weight:800; padding:8px 4px;">
              🌙 ON SHIFT (00–08)
            </th>
            <th colspan="2" style="text-align:center; background:rgba(13, 148, 136, 0.1); border-right:1px solid var(--border); color:#0d9488; font-weight:800; padding:8px 4px;">
              ☀️ MORNING SHIFT (08–16)
            </th>
            <th colspan="2" style="text-align:center; background:rgba(237, 154, 53, 0.1); border-right:1px solid var(--border); color:#ed9a35; font-weight:800; padding:8px 4px;">
              🌆 NIGHT SHIFT (16–00)
            </th>
            <th colspan="2" style="text-align:center; background:rgba(56, 189, 248, 0.08); border-right:1px solid var(--border); color:#0284c7; font-weight:800; padding:8px 4px;">
              📡 LIDAR (FP / QA)
            </th>
            <th colspan="2" style="text-align:center; background:rgba(99, 102, 241, 0.08); border-right:1px solid var(--border); color:#4f46e5; font-weight:800; padding:8px 4px;">
              🛣️ LANE LINE (FP / QA)
            </th>
            <th colspan="2" style="text-align:center; background:rgba(100, 116, 139, 0.1); border-right:1px solid var(--border); color:var(--text); font-weight:800; padding:8px 4px;">
              ⭐ 24H GRAND TOTAL
            </th>
          </tr>
          <tr style="font-size:10.5px; text-transform:uppercase; background:var(--bg-subtle, rgba(0,0,0,0.02)); border-bottom:1.5px solid var(--border);">
            <th class="sortable" data-sort="onTasks" style="border-left:1px solid var(--border); text-align:right; padding:6px 10px; color:#8b5cf6; cursor:pointer;" title="Sort by ON Tasks">Tasks ${get24Icon('onTasks')}</th>
            <th class="sortable" data-sort="onLabs" style="border-right:1px solid var(--border); text-align:right; padding:6px 10px; color:var(--text-soft); cursor:pointer;" title="Sort by ON Labelers">Uniq Lab ${get24Icon('onLabs')}</th>
            <th class="sortable" data-sort="mornTasks" style="text-align:right; padding:6px 10px; color:#0d9488; cursor:pointer;" title="Sort by Morning Tasks">Tasks ${get24Icon('mornTasks')}</th>
            <th class="sortable" data-sort="mornLabs" style="border-right:1px solid var(--border); text-align:right; padding:6px 10px; color:var(--text-soft); cursor:pointer;" title="Sort by Morning Labelers">Uniq Lab ${get24Icon('mornLabs')}</th>
            <th class="sortable" data-sort="nightTasks" style="text-align:right; padding:6px 10px; color:#ed9a35; cursor:pointer;" title="Sort by Night Tasks">Tasks ${get24Icon('nightTasks')}</th>
            <th class="sortable" data-sort="nightLabs" style="border-right:1px solid var(--border); text-align:right; padding:6px 10px; color:var(--text-soft); cursor:pointer;" title="Sort by Night Labelers">Uniq Lab ${get24Icon('nightLabs')}</th>
            <th class="sortable" data-sort="lidarFp" style="text-align:right; padding:6px 10px; color:#0284c7; cursor:pointer;" title="Sort by Lidar FP">FP ${get24Icon('lidarFp')}</th>
            <th class="sortable" data-sort="lidarQa" style="border-right:1px solid var(--border); text-align:right; padding:6px 10px; color:#059669; cursor:pointer;" title="Sort by Lidar QA">QA ${get24Icon('lidarQa')}</th>
            <th class="sortable" data-sort="laneFp" style="text-align:right; padding:6px 10px; color:#4f46e5; cursor:pointer;" title="Sort by Lane Line FP">FP ${get24Icon('laneFp')}</th>
            <th class="sortable" data-sort="laneQa" style="border-right:1px solid var(--border); text-align:right; padding:6px 10px; color:#db2777; cursor:pointer;" title="Sort by Lane Line QA">QA ${get24Icon('laneQa')}</th>
            <th class="sortable" data-sort="total" style="text-align:right; font-weight:800; padding:6px 12px; color:var(--text); cursor:pointer;" title="Sort by Total Tasks">Tasks ${get24Icon('total')}</th>
            <th class="sortable" data-sort="labelers" style="text-align:right; font-weight:800; padding:6px 12px; color:var(--primary); cursor:pointer;" title="Sort by Total Unique Labelers">Total Lab ${get24Icon('labelers')}</th>
          </tr>
        </thead>
            <th style="text-align:right; font-weight:800; padding:6px 12px; color:var(--text);">Tasks</th>
            <th style="text-align:right; font-weight:800; padding:6px 12px; color:var(--primary);">Total Lab</th>
          </tr>
        </thead>
        <tbody>
          ${floorList.map(f => `
            <tr class="daily-queue-row">
              <td style="font-weight:700; color:var(--primary); font-size:12.5px; white-space:nowrap; padding:10px 14px;">
                🏢 ${esc(f.floor)}
              </td>
              <td class="daily-num-cell" style="border-left:1px solid var(--border); font-weight:700; color:#8b5cf6;">${f.onTasks.toLocaleString()}</td>
              <td class="daily-num-cell" style="border-right:1px solid var(--border); color:var(--text-soft);">${f.onLabs.size.toLocaleString()}</td>
              <td class="daily-num-cell" style="font-weight:700; color:#0d9488;">${f.mornTasks.toLocaleString()}</td>
              <td class="daily-num-cell" style="border-right:1px solid var(--border); color:var(--text-soft);">${f.mornLabs.size.toLocaleString()}</td>
              <td class="daily-num-cell" style="font-weight:700; color:#ed9a35;">${f.nightTasks.toLocaleString()}</td>
              <td class="daily-num-cell" style="border-right:1px solid var(--border); color:var(--text-soft);">${f.nightLabs.size.toLocaleString()}</td>
              <td class="daily-num-cell highlight-fp">${f.lidarFp.toLocaleString()}</td>
              <td class="daily-num-cell highlight-qa" style="border-right:1px solid var(--border);">${f.lidarQa.toLocaleString()}</td>
              <td class="daily-num-cell highlight-fp">${f.laneFp.toLocaleString()}</td>
              <td class="daily-num-cell highlight-qa" style="border-right:1px solid var(--border);">${f.laneQa.toLocaleString()}</td>
              <td class="daily-num-cell" style="font-weight:900; font-size:13px; color:var(--text); background:rgba(0,0,0,0.015); padding:10px 12px;">${f.totalTasks.toLocaleString()}</td>
              <td class="daily-num-cell" style="font-weight:800; color:var(--primary); background:rgba(0,0,0,0.015); padding:10px 12px;">${f.allLabs.size.toLocaleString()}</td>
            </tr>
          `).join('')}
          ${!floorList.length ? '<tr><td colspan="12" class="ux-empty" style="text-align:center; padding:32px;">No 24-hour floor records found.</td></tr>' : ''}
        </tbody>
        <tfoot>
          <tr class="daily-total-row" style="background:var(--bg-subtle, rgba(0,0,0,0.04));">
            <td style="padding:14px 18px; font-weight:800; font-size:12.5px;">
              24-HOUR TOTAL (${floorList.length} Floors):
            </td>
            <td class="daily-num-cell" style="border-left:1px solid var(--border); color:#8b5cf6;"><b>${totOn.toLocaleString()}</b></td>
            <td class="daily-num-cell" style="border-right:1px solid var(--border);"><b>${allOnLabs.size.toLocaleString()}</b></td>
            <td class="daily-num-cell" style="color:#0d9488;"><b>${totMorn.toLocaleString()}</b></td>
            <td class="daily-num-cell" style="border-right:1px solid var(--border);"><b>${allMornLabs.size.toLocaleString()}</b></td>
            <td class="daily-num-cell" style="color:#ed9a35;"><b>${totNight.toLocaleString()}</b></td>
            <td class="daily-num-cell" style="border-right:1px solid var(--border);"><b>${allNightLabs.size.toLocaleString()}</b></td>
            <td class="daily-num-cell highlight-fp"><b>${totLidarFp.toLocaleString()}</b></td>
            <td class="daily-num-cell highlight-qa" style="border-right:1px solid var(--border);"><b>${totLidarQa.toLocaleString()}</b></td>
            <td class="daily-num-cell highlight-fp"><b>${totLaneFp.toLocaleString()}</b></td>
            <td class="daily-num-cell highlight-qa" style="border-right:1px solid var(--border);"><b>${totLaneQa.toLocaleString()}</b></td>
            <td class="daily-num-cell" style="font-size:14px; font-weight:900; color:var(--text);"><b>${grandTot.toLocaleString()}</b></td>
            <td class="daily-num-cell" style="font-size:13px; font-weight:800; color:var(--primary);"><b>${allTotalLabs.size.toLocaleString()}</b></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function buildShiftTableHTML(rep, sRows, viewMode, sortCol, sortAsc) {
  const idx = name => hdrs ? hdrs.findIndex(h => h.trim().toLowerCase() === name.toLowerCase()) : -1;
  const qi = idx('Queue Name');
  const mi = idx('Modality');
  const pi = idx('Pass');
  const ni = idx('National Id');
  const li = idx('Labeler Name');
  const qci = idx('QTC Name');
  const fi = hdrs ? hdrs.findIndex(h => ['floor', 'unit', 'location'].includes(h.toLowerCase())) : -1;

  const getModality = r => {
    const raw = mi >= 0 ? String(r[mi] || '').trim() : '';
    const key = raw.toLowerCase().replace(/[\s_-]+/g, '');
    if (key === 'lidar') return 'Lidar';
    if (key === 'laneline' || key === 'lane') return 'Lane Line';
    return raw || 'Unspecified';
  };

  const getModBadge = mod => {
    if (mod === 'Lidar') return '<span class="daily-mod daily-lidar">(Lidar)</span>';
    if (mod === 'Lane Line') return '<span class="daily-mod daily-lane">(Lane Line)</span>';
    return '<span class="daily-mod daily-lidar">(' + esc(mod) + ')</span>';
  };

  const getSortIcon = (col) => {
    if (sortCol === col) return `<span class="table-sort-icon active" style="margin-left:5px; font-size:10px; color:var(--primary, #0284c7); font-weight:800;">${sortAsc ? '▲' : '▼'}</span>`;
    return `<span class="table-sort-icon" style="margin-left:5px; font-size:10px; opacity:0.35;">↕</span>`;
  };

  // 1. QUEUES VIEW (Screenshot layout)
  if (viewMode === 'queues') {
    return `
      <div class="daily-table-wrap">
        <table class="daily-queue-table">
          <thead>
            <tr>
              <th class="sortable" data-sort="name" style="cursor:pointer; user-select:none;" title="Click to sort by Queue Name">QUEUE ${getSortIcon('name')}</th>
              <th class="sortable" data-sort="fpLabelers" style="cursor:pointer; user-select:none;" title="Click to sort by Unique Labelers (FP)">UNIQUE LABELERS (FP) ${getSortIcon('fpLabelers')}</th>
              <th class="sortable" data-sort="fp" style="cursor:pointer; user-select:none;" title="Click to sort by Total Submit (FP)">TOTAL SUBMIT (FP) ${getSortIcon('fp')}</th>
              <th class="sortable" data-sort="qaLabelers" style="cursor:pointer; user-select:none;" title="Click to sort by Unique Labelers (QA)">UNIQUE LABELERS (QA) ${getSortIcon('qaLabelers')}</th>
              <th class="sortable" data-sort="qa" style="cursor:pointer; user-select:none;" title="Click to sort by Total Submit (QA)">TOTAL SUBMIT (QA) ${getSortIcon('qa')}</th>
            </tr>
          </thead>
          <tbody>
            ${rep.groups.map(g => {
              let badges = g.isRelabel ? '<span class="daily-mod daily-relabel">(Relabeling)</span> ' : '';
              badges += getModBadge(g.mod);
              return `
                <tr class="daily-queue-row" data-tooltip-queue="${esc(g.name)}">
                  <td class="daily-queue-cell">
                    <span class="daily-queue-name">${esc(g.name)}</span>
                    ${badges}
                  </td>
                  <td class="daily-num-cell">${g.fpIds.size.toLocaleString()}</td>
                  <td class="daily-num-cell highlight-fp">${g.fp.toLocaleString()}</td>
                  <td class="daily-num-cell">${g.qaIds.size.toLocaleString()}</td>
                  <td class="daily-num-cell highlight-qa">${g.qa.toLocaleString()}</td>
                </tr>
              `;
            }).join('')}
            ${!rep.groups.length ? `
              <tr>
                <td colspan="5" class="ux-empty" style="text-align:center; padding:32px; color:var(--muted);">
                  No submissions recorded during ${rep.meta.name} (${rep.meta.timeWindow}).
                </td>
              </tr>
            ` : ''}
          </tbody>
          <tfoot>
            <tr class="daily-total-row">
              <td style="padding:14px 18px; font-weight:800; color:var(--text);">
                <div>TOTAL ${rep.meta.name} (${rep.groups.length} active queues):</div>
                <div style="font-size:11px; font-weight:600; color:var(--text-soft); margin-top:4px; display:flex; flex-wrap:wrap; gap:12px;">
                  <span>📡 Lidar: <b style="color:#38bdf8;">FP ${rep.lidarFp.toLocaleString()}</b> | <b style="color:#34d399;">QA ${rep.lidarQa.toLocaleString()}</b></span>
                  <span>🛣️ Lane Line: <b style="color:#38bdf8;">FP ${rep.laneFp.toLocaleString()}</b> | <b style="color:#34d399;">QA ${rep.laneQa.toLocaleString()}</b></span>
                  ${rep.relabelTotal > 0 ? `<span>🔄 Relabeling: <b style="color:#38bdf8;">FP ${rep.relabelFp.toLocaleString()}</b> | <b style="color:#34d399;">QA ${rep.relabelQa.toLocaleString()}</b></span>` : ''}
                </div>
              </td>
              <td class="daily-num-cell"><b>${rep.uniqueFp.toLocaleString()}</b></td>
              <td class="daily-num-cell highlight-fp"><b>${rep.totalFp.toLocaleString()}</b></td>
              <td class="daily-num-cell"><b>${rep.uniqueQa.toLocaleString()}</b></td>
              <td class="daily-num-cell highlight-qa"><b>${rep.totalQa.toLocaleString()}</b></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  // 2. FLOOR PRODUCTIVITY VIEW
  if (viewMode === 'floors') {
    const summaryHTML = buildFloorSummaryTableHTML(rep, sRows, sortCol, sortAsc);

    const floorMap = new Map();
    sRows.forEach(r => {
      const fl = (typeof deriveFloor === 'function' && fi >= 0) ? deriveFloor(r[fi]) : (fi >= 0 && r[fi] ? String(r[fi]).trim() : 'Floor Room');
      const q = qi >= 0 ? String(r[qi]||'').trim() : 'Unknown';
      const mod = getModality(r);
      const pass = pi >= 0 ? String(r[pi]||'').trim().toUpperCase() : '';
      const labId = ni >= 0 && r[ni] ? String(r[ni]).trim() : (li >= 0 ? String(r[li]||'').trim() : '');
      const key = fl + '___' + q + '___' + mod;

      if (!floorMap.has(key)) {
        floorMap.set(key, { floor: fl, queue: q, mod, fp: 0, qa: 0, total: 0, labelers: new Set() });
      }
      const e = floorMap.get(key);
      if (pass === 'FP') e.fp++;
      if (pass === 'QA') e.qa++;
      e.total++;
      if (labId) e.labelers.add(labId);
    });

    let floorList = [...floorMap.values()];
    if (sortCol === 'floor') {
      floorList.sort((a,b) => sortAsc ? a.floor.localeCompare(b.floor) : b.floor.localeCompare(a.floor));
    } else if (sortCol === 'queue') {
      floorList.sort((a,b) => sortAsc ? a.queue.localeCompare(b.queue) : b.queue.localeCompare(a.queue));
    } else if (sortCol === 'mod') {
      floorList.sort((a,b) => sortAsc ? a.mod.localeCompare(b.mod) : b.mod.localeCompare(a.mod));
    } else if (sortCol === 'fp') {
      floorList.sort((a,b) => sortAsc ? a.fp - b.fp : b.fp - a.fp);
    } else if (sortCol === 'qa') {
      floorList.sort((a,b) => sortAsc ? a.qa - b.qa : b.qa - a.qa);
    } else if (sortCol === 'total') {
      floorList.sort((a,b) => sortAsc ? a.total - b.total : b.total - a.total);
    } else if (sortCol === 'labelers') {
      floorList.sort((a,b) => sortAsc ? a.labelers.size - b.labelers.size : b.labelers.size - a.labelers.size);
    } else {
      floorList.sort((a,b) => a.floor.localeCompare(b.floor) || b.total - a.total);
    }

    let totFp = 0, totQa = 0, grandTot = 0;
    const allLabs = new Set();
    floorList.forEach(f => {
      totFp += f.fp;
      totQa += f.qa;
      grandTot += f.total;
      f.labelers.forEach(l => allLabs.add(l));
    });

    return `
      <div style="margin-bottom:24px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <h4 style="margin:0; font-size:13px; font-weight:800; color:var(--text);">🏢 Summary of Floor / Room Breakdown (${rep.meta.name})</h4>
          <span style="font-size:11px; color:var(--muted);">Aggregated by Modality & Unique Labelers</span>
        </div>
        ${summaryHTML}
      </div>
      <div class="daily-table-wrap">
        <div style="font-size:12px; font-weight:800; color:var(--text); margin-bottom:8px;">📋 Detailed Floor & Queue Breakdown (${rep.meta.name}):</div>
        <table class="daily-queue-table">
          <thead>
            <tr>
              <th class="sortable" data-sort="floor" style="cursor:pointer; user-select:none;" title="Click to sort by Floor / Unit">FLOOR / UNIT ${getSortIcon('floor')}</th>
              <th class="sortable" data-sort="queue" style="cursor:pointer; user-select:none;" title="Click to sort by Queue Name">QUEUE NAME ${getSortIcon('queue')}</th>
              <th class="sortable" data-sort="mod" style="cursor:pointer; user-select:none;" title="Click to sort by Modality">MODALITY ${getSortIcon('mod')}</th>
              <th class="sortable" data-sort="fp" style="cursor:pointer; user-select:none;" title="Click to sort by FP Submits">FP SUBMITS ${getSortIcon('fp')}</th>
              <th class="sortable" data-sort="qa" style="cursor:pointer; user-select:none;" title="Click to sort by QA Submits">QA SUBMITS ${getSortIcon('qa')}</th>
              <th class="sortable" data-sort="total" style="cursor:pointer; user-select:none;" title="Click to sort by Total Submits">TOTAL SUBMITS ${getSortIcon('total')}</th>
              <th class="sortable" data-sort="labelers" style="cursor:pointer; user-select:none;" title="Click to sort by Unique Labelers">UNIQUE LABELERS ${getSortIcon('labelers')}</th>
            </tr>
          </thead>
          <tbody>
            ${floorList.map(f => `
              <tr class="daily-queue-row" data-tooltip-queue="${esc(f.queue)}">
                <td style="font-weight:700; color:var(--primary); font-size:12.5px;">🏢 ${esc(f.floor)}</td>
                <td class="daily-queue-cell"><span class="daily-queue-name">${esc(f.queue)}</span></td>
                <td>${getModBadge(f.mod)}</td>
                <td class="daily-num-cell highlight-fp">${f.fp.toLocaleString()}</td>
                <td class="daily-num-cell highlight-qa">${f.qa.toLocaleString()}</td>
                <td class="daily-num-cell" style="font-weight:800; color:var(--text);">${f.total.toLocaleString()}</td>
                <td class="daily-num-cell">${f.labelers.size.toLocaleString()}</td>
              </tr>
            `).join('')}
            ${!floorList.length ? '<tr><td colspan="7" class="ux-empty" style="text-align:center; padding:32px;">No floor records for this shift.</td></tr>' : ''}
          </tbody>
          <tfoot>
            <tr class="daily-total-row">
              <td colspan="3" style="padding:14px 18px; font-weight:800;">
                TOTAL ${rep.meta.name} (Floor Breakdown):
                <div style="font-size:11px; font-weight:600; color:var(--text-soft); margin-top:4px;">
                  📡 Lidar: FP ${rep.lidarFp.toLocaleString()} | QA ${rep.lidarQa.toLocaleString()} &nbsp;•&nbsp; 🛣️ Lane Line: FP ${rep.laneFp.toLocaleString()} | QA ${rep.laneQa.toLocaleString()}
                </div>
              </td>
              <td class="daily-num-cell highlight-fp"><b>${totFp.toLocaleString()}</b></td>
              <td class="daily-num-cell highlight-qa"><b>${totQa.toLocaleString()}</b></td>
              <td class="daily-num-cell" style="font-size:14px;"><b>${grandTot.toLocaleString()}</b></td>
              <td class="daily-num-cell"><b>${allLabs.size.toLocaleString()}</b></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  // 2.5 FLOOR SUMMARY VIEW (Detailed Modality & Unique Labelers Breakdown)
  if (viewMode === 'floor_summary') {
    return buildFloorSummaryTableHTML(rep, sRows, sortCol, sortAsc);
  }

  // 3. QC / QTC SUPERVISORS VIEW
  if (viewMode === 'qcs') {
    const qcMap = new Map();
    sRows.forEach(r => {
      const qc = qci >= 0 && r[qci] ? String(r[qci]).trim() : 'Unassigned QC';
      const q = qi >= 0 ? String(r[qi]||'').trim() : 'Unknown';
      const mod = getModality(r);
      const pass = pi >= 0 ? String(r[pi]||'').trim().toUpperCase() : '';
      const labId = ni >= 0 && r[ni] ? String(r[ni]).trim() : (li >= 0 ? String(r[li]||'').trim() : '');
      const key = qc + '___' + q + '___' + mod;

      if (!qcMap.has(key)) {
        qcMap.set(key, { qc, queue: q, mod, fp: 0, qa: 0, total: 0, labelers: new Set() });
      }
      const e = qcMap.get(key);
      if (pass === 'FP') e.fp++;
      if (pass === 'QA') e.qa++;
      e.total++;
      if (labId) e.labelers.add(labId);
    });

    let qcList = [...qcMap.values()];
    if (sortCol === 'qc') {
      qcList.sort((a,b) => sortAsc ? a.qc.localeCompare(b.qc) : b.qc.localeCompare(a.qc));
    } else if (sortCol === 'queue') {
      qcList.sort((a,b) => sortAsc ? a.queue.localeCompare(b.queue) : b.queue.localeCompare(a.queue));
    } else if (sortCol === 'mod') {
      qcList.sort((a,b) => sortAsc ? a.mod.localeCompare(b.mod) : b.mod.localeCompare(a.mod));
    } else if (sortCol === 'fp') {
      qcList.sort((a,b) => sortAsc ? a.fp - b.fp : b.fp - a.fp);
    } else if (sortCol === 'qa') {
      qcList.sort((a,b) => sortAsc ? a.qa - b.qa : b.qa - a.qa);
    } else if (sortCol === 'total') {
      qcList.sort((a,b) => sortAsc ? a.total - b.total : b.total - a.total);
    } else if (sortCol === 'labelers') {
      qcList.sort((a,b) => sortAsc ? a.labelers.size - b.labelers.size : b.labelers.size - a.labelers.size);
    } else {
      qcList.sort((a,b) => a.qc.localeCompare(b.qc) || b.total - a.total);
    }

    let totFp = 0, totQa = 0, grandTot = 0;
    qcList.forEach(qc => {
      totFp += qc.fp;
      totQa += qc.qa;
      grandTot += qc.total;
    });

    return `
      <div class="daily-table-wrap">
        <table class="daily-queue-table">
          <thead>
            <tr>
              <th class="sortable" data-sort="qc" style="cursor:pointer; user-select:none;" title="Click to sort by QC / QTC Supervisor">QC / QTC SUPERVISOR ${getSortIcon('qc')}</th>
              <th class="sortable" data-sort="queue" style="cursor:pointer; user-select:none;" title="Click to sort by Queue Name">QUEUE NAME ${getSortIcon('queue')}</th>
              <th class="sortable" data-sort="mod" style="cursor:pointer; user-select:none;" title="Click to sort by Modality">MODALITY ${getSortIcon('mod')}</th>
              <th class="sortable" data-sort="fp" style="cursor:pointer; user-select:none;" title="Click to sort by FP Reviewed">FP REVIEWED ${getSortIcon('fp')}</th>
              <th class="sortable" data-sort="qa" style="cursor:pointer; user-select:none;" title="Click to sort by QA Reviewed">QA REVIEWED ${getSortIcon('qa')}</th>
              <th class="sortable" data-sort="total" style="cursor:pointer; user-select:none;" title="Click to sort by Total Submissions">TOTAL SUBMISSIONS ${getSortIcon('total')}</th>
              <th class="sortable" data-sort="labelers" style="cursor:pointer; user-select:none;" title="Click to sort by Labelers Served">LABELERS SERVED ${getSortIcon('labelers')}</th>
            </tr>
          </thead>
          <tbody>
            ${qcList.map(qc => `
              <tr class="daily-queue-row" data-tooltip-queue="${esc(qc.queue)}">
                <td style="font-weight:700; color:var(--text); font-size:12.5px;">👥 ${esc(qc.qc)}</td>
                <td class="daily-queue-cell"><span class="daily-queue-name">${esc(qc.queue)}</span></td>
                <td>${getModBadge(qc.mod)}</td>
                <td class="daily-num-cell highlight-fp">${qc.fp.toLocaleString()}</td>
                <td class="daily-num-cell highlight-qa">${qc.qa.toLocaleString()}</td>
                <td class="daily-num-cell" style="font-weight:800; color:var(--text);">${qc.total.toLocaleString()}</td>
                <td class="daily-num-cell">${qc.labelers.size.toLocaleString()}</td>
              </tr>
            `).join('')}
            ${!qcList.length ? '<tr><td colspan="7" class="ux-empty" style="text-align:center; padding:32px;">No QC submissions recorded for this shift.</td></tr>' : ''}
          </tbody>
          <tfoot>
            <tr class="daily-total-row">
              <td colspan="3" style="padding:14px 18px; font-weight:800;">
                TOTAL ${rep.meta.name} (QC Productivity):
                <div style="font-size:11px; font-weight:600; color:var(--text-soft); margin-top:4px;">
                  📡 Lidar: FP ${rep.lidarFp.toLocaleString()} | QA ${rep.lidarQa.toLocaleString()} &nbsp;•&nbsp; 🛣️ Lane Line: FP ${rep.laneFp.toLocaleString()} | QA ${rep.laneQa.toLocaleString()}
                </div>
              </td>
              <td class="daily-num-cell highlight-fp"><b>${totFp.toLocaleString()}</b></td>
              <td class="daily-num-cell highlight-qa"><b>${totQa.toLocaleString()}</b></td>
              <td class="daily-num-cell" style="font-size:14px;"><b>${grandTot.toLocaleString()}</b></td>
              <td class="daily-num-cell">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  // 4. LABELERS PRODUCTIVITY VIEW
  if (viewMode === 'labelers') {
    const labMap = new Map();
    sRows.forEach(r => {
      const lab = li >= 0 && r[li] ? String(r[li]).trim() : 'Unknown Labeler';
      const q = qi >= 0 ? String(r[qi]||'').trim() : 'Unknown';
      const mod = getModality(r);
      const pass = pi >= 0 ? String(r[pi]||'').trim().toUpperCase() : '';
      const key = lab + '___' + q + '___' + mod;

      if (!labMap.has(key)) {
        labMap.set(key, { labeler: lab, queue: q, mod, fp: 0, qa: 0, total: 0 });
      }
      const e = labMap.get(key);
      if (pass === 'FP') e.fp++;
      if (pass === 'QA') e.qa++;
      e.total++;
    });

    let labList = [...labMap.values()];
    if (sortCol === 'labeler') {
      labList.sort((a,b) => sortAsc ? a.labeler.localeCompare(b.labeler) : b.labeler.localeCompare(a.labeler));
    } else if (sortCol === 'queue') {
      labList.sort((a,b) => sortAsc ? a.queue.localeCompare(b.queue) : b.queue.localeCompare(a.queue));
    } else if (sortCol === 'mod') {
      labList.sort((a,b) => sortAsc ? a.mod.localeCompare(b.mod) : b.mod.localeCompare(a.mod));
    } else if (sortCol === 'fp') {
      labList.sort((a,b) => sortAsc ? a.fp - b.fp : b.fp - a.fp);
    } else if (sortCol === 'qa') {
      labList.sort((a,b) => sortAsc ? a.qa - b.qa : b.qa - a.qa);
    } else if (sortCol === 'total') {
      labList.sort((a,b) => sortAsc ? a.total - b.total : b.total - a.total);
    } else {
      labList.sort((a,b) => a.labeler.localeCompare(b.labeler) || b.total - a.total);
    }

    let totFp = 0, totQa = 0, grandTot = 0;
    labList.forEach(l => {
      totFp += l.fp;
      totQa += l.qa;
      grandTot += l.total;
    });

    return `
      <div class="daily-table-wrap">
        <table class="daily-queue-table">
          <thead>
            <tr>
              <th class="sortable" data-sort="labeler" style="cursor:pointer; user-select:none;" title="Click to sort by Labeler Name">LABELER NAME ${getSortIcon('labeler')}</th>
              <th class="sortable" data-sort="queue" style="cursor:pointer; user-select:none;" title="Click to sort by Queue Name">QUEUE NAME ${getSortIcon('queue')}</th>
              <th class="sortable" data-sort="mod" style="cursor:pointer; user-select:none;" title="Click to sort by Modality">MODALITY ${getSortIcon('mod')}</th>
              <th class="sortable" data-sort="fp" style="cursor:pointer; user-select:none;" title="Click to sort by FP Submits">FP SUBMITS ${getSortIcon('fp')}</th>
              <th class="sortable" data-sort="qa" style="cursor:pointer; user-select:none;" title="Click to sort by QA Submits">QA SUBMITS ${getSortIcon('qa')}</th>
              <th class="sortable" data-sort="total" style="cursor:pointer; user-select:none;" title="Click to sort by Total Submissions">TOTAL SUBMISSIONS ${getSortIcon('total')}</th>
            </tr>
          </thead>
          <tbody>
            ${labList.map(l => `
              <tr class="daily-queue-row" data-tooltip-queue="${esc(l.queue)}">
                <td style="font-weight:700; color:var(--text); font-size:12.5px;">✍️ ${esc(l.labeler)}</td>
                <td class="daily-queue-cell"><span class="daily-queue-name">${esc(l.queue)}</span></td>
                <td>${getModBadge(l.mod)}</td>
                <td class="daily-num-cell highlight-fp">${l.fp.toLocaleString()}</td>
                <td class="daily-num-cell highlight-qa">${l.qa.toLocaleString()}</td>
                <td class="daily-num-cell" style="font-weight:800; color:var(--text);">${l.total.toLocaleString()}</td>
              </tr>
            `).join('')}
            ${!labList.length ? '<tr><td colspan="6" class="ux-empty" style="text-align:center; padding:32px;">No labeler submissions for this shift.</td></tr>' : ''}
          </tbody>
          <tfoot>
            <tr class="daily-total-row">
              <td colspan="3" style="padding:14px 18px; font-weight:800;">
                TOTAL ${rep.meta.name} (Labeler Productivity):
                <div style="font-size:11px; font-weight:600; color:var(--text-soft); margin-top:4px;">
                  📡 Lidar: FP ${rep.lidarFp.toLocaleString()} | QA ${rep.lidarQa.toLocaleString()} &nbsp;•&nbsp; 🛣️ Lane Line: FP ${rep.laneFp.toLocaleString()} | QA ${rep.laneQa.toLocaleString()}
                </div>
              </td>
              <td class="daily-num-cell highlight-fp"><b>${totFp.toLocaleString()}</b></td>
              <td class="daily-num-cell highlight-qa"><b>${totQa.toLocaleString()}</b></td>
              <td class="daily-num-cell" style="font-size:14px;"><b>${grandTot.toLocaleString()}</b></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  return '';
}
