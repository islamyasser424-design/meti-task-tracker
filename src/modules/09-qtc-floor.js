function renderQtcFloorPerformance(){
  const page = $('uxQtcFloor');
  if(!page || page.hidden) return;

  const baseRows = rowsInView();
  const idx = name => hdrs.findIndex(h => h.trim().toLowerCase() === name.toLowerCase());
  const qi = idx('qtc name');
  const fi = hdrs.findIndex(h => ['floor', 'unit'].includes(h.trim().toLowerCase()));
  const si = idx('shift');
  const mi = idx('modality');
  const pi = idx('pass');
  const oi = idx('object count');

  const distinctQtcs = [...new Set(baseRows.map(r => qi >= 0 ? String(r[qi] || '').normalize('NFC').trim().replace(/\s+/gu, ' ') : '').filter(Boolean))].sort();
  const distinctFloors = [...new Set(baseRows.map(r => fi >= 0 ? deriveFloor(r[fi]) : '').filter(Boolean))].sort();
  const distinctShifts = [...new Set(baseRows.map(r => si >= 0 ? String(r[si] || '').trim() : '').filter(Boolean))].sort();

  // Filter baseRows by page filters
  const q = (qtcFloorFilters.query || '').toLowerCase().trim();
  const filteredRows = baseRows.filter(r => {
    const qtc = qi >= 0 ? String(r[qi] || '').normalize('NFC').trim().replace(/\s+/gu, ' ') : '';
    const floor = fi >= 0 ? deriveFloor(r[fi]) : 'Unknown';
    const shift = si >= 0 ? String(r[si] || '').trim() : '';

    if (qtcFloorFilters.qtc && qtc !== qtcFloorFilters.qtc) return false;
    if (qtcFloorFilters.floor && floor !== qtcFloorFilters.floor) return false;
    if (qtcFloorFilters.shift && shift !== qtcFloorFilters.shift) return false;
    if (qtcFloorFilters.category) {
      if (qtcFloorFilters.category === 'lidarFP' && !isModPass(r, 'lidar', 'FP')) return false;
      if (qtcFloorFilters.category === 'lidarQA' && !isModPass(r, 'lidar', 'QA')) return false;
      if (qtcFloorFilters.category === 'laneFP' && !isModPass(r, 'laneline', 'FP')) return false;
      if (qtcFloorFilters.category === 'laneQA' && !isModPass(r, 'laneline', 'QA')) return false;
    }

    if (q) {
      const matchQ = qtc.toLowerCase().includes(q);
      const matchF = floor.toLowerCase().includes(q);
      const matchS = shift.toLowerCase().includes(q);
      if (!matchQ && !matchF && !matchS) return false;
    }
    return true;
  });

  // Table 1: QTC & Floor aggregation (Composite QTC + Unit)
  const allQTCFloorGroups = qtcFloorAggregateData(filteredRows);
  allQTCFloorGroups.sort((a,b) => {
    const col = qtcFloorFilters.sortCol || 'totalSubmit';
    let va = a[col], vb = b[col];
    if (typeof va === 'string') return qtcFloorFilters.sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    va = Number(va) || 0; vb = Number(vb) || 0;
    return qtcFloorFilters.sortAsc ? (va - vb) : (vb - va);
  });

  const qfPageSize = qtcFloorFilters.pageSize || 25;
  const qfTotalPages = Math.max(1, Math.ceil(allQTCFloorGroups.length / qfPageSize));
  qtcFloorFilters.page = Math.min(qtcFloorFilters.page || 0, qfTotalPages - 1);
  const qfVisible = allQTCFloorGroups.slice(qtcFloorFilters.page * qfPageSize, (qtcFloorFilters.page + 1) * qfPageSize);

  // Table 2: Floor Performance aggregation (Floor = Unit)
  const allFloorGroups = floorAggregateData(filteredRows);
  allFloorGroups.sort((a,b) => {
    const col = floorPerformanceFilters.sortCol || 'totalSubmit';
    let va = a[col], vb = b[col];
    if (typeof va === 'string') return floorPerformanceFilters.sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    va = Number(va) || 0; vb = Number(vb) || 0;
    return floorPerformanceFilters.sortAsc ? (va - vb) : (vb - va);
  });

  // Summary Metrics for Main KPIs (Section 7.1)
  const totalSubmissions = filteredRows.length;
  const totalObjectsAll = filteredRows.reduce((acc, r) => acc + (parseFloat(oi >= 0 ? r[oi] : 0) || 0), 0);
  const totalActiveLabelers = uniq(filteredRows, 'Labeler Name') || 0;
  const totalActiveQtcs = distinctQtcs.length;
  const totalFloorsCount = distinctFloors.length;
  const avgSubmitsPerQtcTeam = totalActiveQtcs > 0 ? (totalSubmissions / totalActiveQtcs).toFixed(1) : '0';
  const avgLabelersPerQtc = totalActiveQtcs > 0 ? (totalActiveLabelers / totalActiveQtcs).toFixed(1) : '0';
  const avgObjectsPerTask = totalSubmissions > 0 ? (totalObjectsAll / totalSubmissions).toFixed(1) : '0';

  // Heatmap Matrix: Floor (Unit) x Shift
  const heatmapData = {};
  distinctFloors.forEach(fl => {
    heatmapData[fl] = {};
    distinctShifts.forEach(sh => {
      heatmapData[fl][sh] = filteredRows.filter(r => (fi >= 0 && deriveFloor(r[fi]) === fl) && (si >= 0 && String(r[si] || '').trim() === sh)).length;
    });
  });
  let maxHeat = 1;
  distinctFloors.forEach(fl => {
    distinctShifts.forEach(sh => {
      if (heatmapData[fl][sh] > maxHeat) maxHeat = heatmapData[fl][sh];
    });
  });

  // Helper sort icon indicator
  const qfIcon = col => qtcFloorFilters.sortCol === col ? (qtcFloorFilters.sortAsc ? ' <span class="table-sort-icon active">▲</span>' : ' <span class="table-sort-icon active">▼</span>') : ' <span class="table-sort-icon">↕</span>';
  const flIcon = col => floorPerformanceFilters.sortCol === col ? (floorPerformanceFilters.sortAsc ? ' <span class="table-sort-icon active">▲</span>' : ' <span class="table-sort-icon active">▼</span>') : ' <span class="table-sort-icon">↕</span>';

  // 8 Main KPI Cards (Including Total Objects)
  const kpiDefs = [
    { title: 'Total Submissions', val: totalSubmissions.toLocaleString(), sub: 'In current view', tone: '#0d9488' },
    { title: 'Total Objects', val: totalObjectsAll.toLocaleString(), sub: 'Cumulative annotated objects (' + avgObjectsPerTask + ' avg/task)', tone: '#0284c7' },
    { title: 'Active QTC Supervisors', val: totalActiveQtcs.toLocaleString(), sub: 'Supervising teams', tone: '#df8b24' },
    { title: 'Active Floors / Units', val: totalFloorsCount.toLocaleString(), sub: 'Operational units', tone: '#3b82f6' },
    { title: 'Active Labelers', val: totalActiveLabelers.toLocaleString(), sub: 'Production workforce', tone: '#0a9d8c' },
    { title: 'Avg Tasks / QTC Team', val: avgSubmitsPerQtcTeam, sub: 'Average output per supervisor', tone: '#8b5cf6' },
    { title: 'Avg Labelers / QTC', val: avgLabelersPerQtc, sub: 'Average team size', tone: '#10b981' },
    { title: 'Floor Count', val: totalFloorsCount.toLocaleString(), sub: 'Distinct Unit dimension', tone: '#df5c99' }
  ];

  page.innerHTML = '<div class="ux-overview">'
    + '<div class="ux-heading">'
      + '<div>'
        + '<div class="ux-eyebrow">Supervisory &amp; Facility Diagnostics</div>'
        + '<h2>Performance per QTC &amp; Floor</h2>'
        + '<p>Operational productivity analyzed by QTC Supervisor Teams and Facility Floors (= Units).</p>'
      + '</div>'
      + renderHeaderControlsHTML('qf')
    + '</div>'

    + renderUniversalFilterBar('qtcfloor')

    // 8 Main KPI Cards Grid
    + '<div class="ux-grid-8">'
      + kpiDefs.map((k, idx) => '<div class="kpi-mini-card qf-kpi-card" data-kpi-idx="' + idx + '" style="--tone:' + k.tone + '; cursor:help;">'
        + '<div class="kpi-title"><span>' + esc(k.title) + '</span><span style="color:' + k.tone + '">●</span></div>'
        + '<div class="kpi-val">' + k.val + '</div>'
        + '<div class="kpi-sub">' + esc(k.sub) + '</div>'
      + '</div>').join('')
    + '</div>'

    // Segmented View Toggle Buttons
    + '<div class="dash-tabs-bar" style="margin-top:18px; margin-bottom:12px; border-bottom:1px solid var(--border); padding-bottom:8px;">'
      + '<button class="dash-tab-btn ' + (_qfActiveView==='all'?'active':'') + '" onclick="window._setQfActiveView(\'all\')">📑 All Views</button>'
      + '<button class="dash-tab-btn ' + (_qfActiveView==='teams'?'active':'') + '" onclick="window._setQfActiveView(\'teams\')">👥 Table 1: QTC × Floor Teams (' + allQTCFloorGroups.length + ')</button>'
      + '<button class="dash-tab-btn ' + (_qfActiveView==='floors'?'active':'') + '" onclick="window._setQfActiveView(\'floors\')">🏢 Table 2: Facility Units (' + allFloorGroups.length + ')</button>'
      + '<button class="dash-tab-btn ' + (_qfActiveView==='heatmap'?'active':'') + '" onclick="window._setQfActiveView(\'heatmap\')">🔥 Facility Heatmap Matrix</button>'
    + '</div>'

    // Controls & Filter Bar
    + '<div class="queues-controls" style="margin-top:8px;">'
      + '<label>Search QTC / Unit / Shift<input id="qfSearch" placeholder="Type QTC name, unit, shift…" value="' + esc(qtcFloorFilters.query || '') + '"></label>'
      + '<label>Select QTC<select id="qfSelectQtc"><option value="">All QTC Supervisors (' + distinctQtcs.length + ')</option>' + distinctQtcs.map(q => '<option value="' + esc(q) + '" ' + (qtcFloorFilters.qtc===q?'selected':'') + '>' + esc(q) + '</option>').join('') + '</select></label>'
      + '<label>Select Floor / Unit<select id="qfSelectFloor"><option value="">All Floors (' + distinctFloors.length + ')</option>' + distinctFloors.map(f => '<option value="' + esc(f) + '" ' + (qtcFloorFilters.floor===f?'selected':'') + '>Unit ' + esc(f) + '</option>').join('') + '</select></label>'
      + '<label>Select Shift<select id="qfSelectShift"><option value="">All Shifts (' + distinctShifts.length + ')</option>' + distinctShifts.map(s => '<option value="' + esc(s) + '" ' + (qtcFloorFilters.shift===s?'selected':'') + '>' + esc(s) + '</option>').join('') + '</select></label>'
      + '<div style="margin-left:auto; display:flex; gap:8px; align-items:flex-end;">'
        + '<button class="btn btn-c" id="qfExportCSV">↓ Export QTC &amp; Floor CSV</button>'
        + '<button class="btn" id="qfReset">Reset filters</button>'
      + '</div>'
    + '</div>'

    // HEATMAP: Floor (Unit) x Shift Matrix
    + '<div class="ux-panel qf-sec-heatmap" style="margin-top:20px; display:' + (_qfActiveView==='all'||_qfActiveView==='heatmap'?'block':'none') + ';">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">'
        + '<h3 style="margin:0;">🔥 Facility Heatmap: Floor / Unit × Shift</h3>'
        + '<span class="ux-note">Click any cell or unit to instantly filter the tables</span>'
      + '</div>'
      + '<div style="overflow-x:auto;">'
        + '<table style="width:100%; border-collapse:collapse; font-size:12px; text-align:center;">'
          + '<thead><tr style="background:var(--bg-2); border-bottom:1px solid var(--border);"><th style="padding:10px 14px; text-align:left;">Floor / Unit</th>' + distinctShifts.map(sh => '<th class="qf-heat-shift-hdr" data-shift="' + esc(sh) + '" style="padding:10px 14px; cursor:pointer;" title="Click to filter by ' + esc(sh) + ' shift">' + esc(sh) + ' ↕</th>').join('') + '<th style="padding:10px 14px; font-weight:700;">Unit Total</th></tr></thead>'
          + '<tbody>'
            + distinctFloors.map(fl => {
              let rowTot = 0;
              return '<tr style="border-bottom:1px solid var(--border);">'
                + '<td class="qf-heat-unit-hdr" data-floor="' + esc(fl) + '" style="padding:10px 14px; text-align:left; font-weight:700; color:var(--accent); cursor:pointer;" title="Click to filter by Unit ' + esc(fl) + '">🏢 Unit ' + esc(fl) + '</td>'
                + distinctShifts.map(sh => {
                  const val = heatmapData[fl][sh] || 0;
                  rowTot += val;
                  const ratio = maxHeat > 0 ? (val / maxHeat) : 0;
                  const bg = val > 0 ? 'rgba(13,148,136,' + Math.max(0.12, ratio * 0.75).toFixed(2) + ')' : 'transparent';
                  return '<td class="qf-heat-cell" data-floor="' + esc(fl) + '" data-shift="' + esc(sh) + '" style="padding:10px 14px; background:' + bg + '; font-weight:' + (val > 0 ? '700' : '400') + '; color:var(--text); cursor:pointer;" title="Click to filter by Unit ' + esc(fl) + ' - ' + esc(sh) + ' shift">' + val.toLocaleString() + '</td>';
                }).join('')
                + '<td style="padding:10px 14px; font-weight:800; color:var(--primary); font-size:13px;">' + rowTot.toLocaleString() + '</td>'
              + '</tr>';
            }).join('')
          + '</tbody>'
        + '</table>'
      + '</div>'
    + '</div>'

    // TABLE 1: QTC × Unit Performance Table (Section 7.2)
    + '<section class="ux-panel qf-sec-teams" style="margin-top:20px; display:' + (_qfActiveView==='all'||_qfActiveView==='teams'?'block':'none') + ';">'
      + '<div class="ux-heading" style="margin-bottom:12px;">'
        + '<div><h3>Table 1: QTC × Floor Performance Table (' + allQTCFloorGroups.length + ' combinations)</h3><p>Composite groups: each row represents an actual QTC + Unit assignment. Click any column header to sort.</p></div>'
        + '<span class="ux-note">Showing ' + (qfVisible.length ? (qtcFloorFilters.page*qfPageSize+1) : 0) + ' – ' + Math.min((qtcFloorFilters.page+1)*qfPageSize, allQTCFloorGroups.length) + ' of ' + allQTCFloorGroups.length + ' records</span>'
      + '</div>'
      + '<div class="perf-table">'
        + '<table>'
          + '<thead><tr>'
            + '<th data-sort="qtc">QTC Supervisor' + qfIcon('qtc') + '</th>'
            + '<th data-sort="floor">Floor / Unit' + qfIcon('floor') + '</th>'
            + '<th>Active Shifts</th>'
            + '<th data-sort="lidarFP" style="color:#0d9488;">Lidar FP' + qfIcon('lidarFP') + '</th>'
            + '<th data-sort="lidarQA" style="color:#14b8a6;">Lidar QA' + qfIcon('lidarQA') + '</th>'
            + '<th data-sort="laneFP" style="color:#ed9a35;">Lane FP' + qfIcon('laneFP') + '</th>'
            + '<th data-sort="laneQA" style="color:#ec4899;">Lane QA' + qfIcon('laneQA') + '</th>'
            + '<th data-sort="totalSubmit" style="color:var(--primary); font-weight:800;">Total Submit' + qfIcon('totalSubmit') + '</th>'
            + '<th data-sort="totalObjects" style="color:#0284c7;">Total Objects' + qfIcon('totalObjects') + '</th>'
            + '<th data-sort="uniqueLabelers">Team (Labelers)' + qfIcon('uniqueLabelers') + '</th>'
            + '<th data-sort="avgSubmit">Avg / Labeler' + qfIcon('avgSubmit') + '</th>'
            + '<th>Queues Covered</th>'
          + '</tr></thead>'
          + '<tbody>'
            + qfVisible.map((item, rowIdx) => `
              <tr class="qf-row-item" data-qtc="${esc(item.qtc)}" data-floor="${esc(item.floor)}" style="border-bottom:1px solid var(--border); cursor:pointer;" onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background='transparent'">
                <td style="padding:9px 12px; font-weight:700; color:var(--primary);">👤 ${esc(item.qtc)}</td>
                <td style="padding:9px 12px; font-weight:600; color:var(--accent);">🏢 Unit ${esc(item.floor)}</td>
                <td style="padding:9px 12px;"><span class="ux-note">${esc(item.shifts.join(', ') || '—')}</span></td>
                <td style="padding:9px 12px; text-align:center; color:#0d9488;">${item.lidarFP.toLocaleString()}</td>
                <td style="padding:9px 12px; text-align:center; color:#14b8a6;">${item.lidarQA.toLocaleString()}</td>
                <td style="padding:9px 12px; text-align:center; color:#ed9a35;">${item.laneFP.toLocaleString()}</td>
                <td style="padding:9px 12px; text-align:center; color:#ec4899;">${item.laneQA.toLocaleString()}</td>
                <td style="padding:9px 12px; text-align:center; font-weight:800; color:var(--text); font-size:13px;">${item.totalSubmit.toLocaleString()}</td>
                <td style="padding:9px 12px; text-align:center; font-weight:700; color:#0284c7;">${item.totalObjects.toLocaleString()}</td>
                <td style="padding:9px 12px; text-align:center; font-weight:600;">${item.uniqueLabelers.toLocaleString()}</td>
                <td style="padding:9px 12px; text-align:center; font-weight:600; color:var(--primary);">${item.avgSubmitStr}</td>
                <td style="padding:9px 12px;"><span class="ux-note">${item.uniqueQueues} queues</span></td>
              </tr>
            `).join('')
          + '</tbody>'
        + '</table>'
        + (!allQTCFloorGroups.length ? '<div class="ux-empty">No QTC &amp; Floor combinations match your filter.</div>' : '')
      + '</div>'
      + '<div class="perf-pagination" style="display:flex; justify-content:space-between; align-items:center; margin-top:14px;">'
        + '<button class="btn" id="qfPrev" ' + (qtcFloorFilters.page === 0 ? 'disabled' : '') + '>Previous</button>'
        + '<span class="ux-note">Page ' + (qtcFloorFilters.page + 1) + ' of ' + qfTotalPages + '</span>'
        + '<button class="btn" id="qfNext" ' + (qtcFloorFilters.page >= qfTotalPages - 1 ? 'disabled' : '') + '>Next</button>'
      + '</div>'
    + '</section>'

    // TABLE 2: Floor Performance Table (Section 7.3)
    + '<section class="ux-panel qf-sec-floors" style="margin-top:20px; display:' + (_qfActiveView==='all'||_qfActiveView==='floors'?'block':'none') + ';">'
      + '<div class="ux-heading" style="margin-bottom:12px;">'
        + '<div><h3>Table 2: Floor (= Unit) Performance Table (' + allFloorGroups.length + ' Units)</h3><p>Overall operational throughput per facility unit (Floor = Unit). Click any column header to sort.</p></div>'
        + '<button class="btn btn-c" id="floorExportCSV" style="font-size:11px; padding:5px 12px;">↓ Export Floor CSV</button>'
      + '</div>'
      + '<div class="perf-table">'
        + '<table>'
          + '<thead><tr>'
            + '<th data-sort="floor">Floor / Unit' + flIcon('floor') + '</th>'
            + '<th>Active Shifts</th>'
            + '<th data-sort="uniqueQtcs">Unique QTCs' + flIcon('uniqueQtcs') + '</th>'
            + '<th data-sort="uniqueLabelers">Unique Labelers' + flIcon('uniqueLabelers') + '</th>'
            + '<th data-sort="lidarFP" style="color:#0d9488;">Lidar FP' + flIcon('lidarFP') + '</th>'
            + '<th data-sort="lidarQA" style="color:#14b8a6;">Lidar QA' + flIcon('lidarQA') + '</th>'
            + '<th data-sort="laneFP" style="color:#ed9a35;">Lane FP' + flIcon('laneFP') + '</th>'
            + '<th data-sort="laneQA" style="color:#ec4899;">Lane QA' + flIcon('laneQA') + '</th>'
            + '<th data-sort="totalFP">Total FP' + flIcon('totalFP') + '</th>'
            + '<th data-sort="totalQA">Total QA' + flIcon('totalQA') + '</th>'
            + '<th data-sort="totalSubmit" style="color:var(--primary); font-weight:800;">Total Submits' + flIcon('totalSubmit') + '</th>'
            + '<th data-sort="totalObjects" style="color:#0284c7;">Total Objects' + flIcon('totalObjects') + '</th>'
            + '<th data-sort="avgSubmit">Avg / Labeler' + flIcon('avgSubmit') + '</th>'
            + '<th>Unit Share %</th>'
          + '</tr></thead>'
          + '<tbody>'
            + allFloorGroups.map(g => `
              <tr style="border-bottom:1px solid var(--border);" onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background='transparent'">
                <td style="padding:10px 14px; font-weight:700; color:var(--accent);">🏢 Unit ${esc(g.floor)}</td>
                <td style="padding:10px 12px;"><span class="ux-note">${esc(g.shifts.join(', ') || '—')}</span></td>
                <td style="padding:10px 12px; text-align:center; font-weight:600;">${g.uniqueQtcs}</td>
                <td style="padding:10px 12px; text-align:center; font-weight:600;">${g.uniqueLabelers}</td>
                <td style="padding:10px 12px; text-align:center; color:#0d9488;">${g.lidarFP.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; color:#14b8a6;">${g.lidarQA.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; color:#ed9a35;">${g.laneFP.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; color:#ec4899;">${g.laneQA.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; font-weight:700; color:#3b82f6;">${g.totalFP.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; font-weight:700; color:#8b5cf6;">${g.totalQA.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; font-weight:800; color:var(--text); font-size:13px;">${g.totalSubmit.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; font-weight:700; color:#0284c7;">${g.totalObjects.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; font-weight:600; color:var(--primary);">${g.avgSubmitStr}</td>
                <td style="padding:10px 14px; text-align:center;">
                  <div style="display:flex; align-items:center; justify-content:center; gap:6px;">
                    <div style="width:45px; height:6px; border-radius:3px; background:var(--border); overflow:hidden;">
                      <div style="width:${g.sharePct}%; height:100%; background:var(--primary);"></div>
                    </div>
                    <b>${g.sharePctStr}</b>
                  </div>
                </td>
              </tr>
            `).join('')
          + '</tbody>'
        + '</table>'
      + '</div>'
    + '</section>'
  + '</div>';

  bindHeaderControls(page, 'qf');
  bindUniversalFilterBar(page, 'qtcfloor');

  // Sorting Table 1 click listeners
  const perfTables = page.querySelectorAll('.perf-table');
  const tbl1 = perfTables[0];
  if (tbl1) {
    tbl1.querySelectorAll('th[data-sort]').forEach(th => {
      th.style.cursor = 'pointer';
      th.onclick = () => {
        const s = th.dataset.sort;
        if (qtcFloorFilters.sortCol === s) { qtcFloorFilters.sortAsc = !qtcFloorFilters.sortAsc; }
        else { qtcFloorFilters.sortCol = s; qtcFloorFilters.sortAsc = false; }
        qtcFloorFilters.page = 0;
        renderQtcFloorPerformance();
      };
    });
  }

  // Sorting Table 2 click listeners
  const tbl2 = perfTables[1];
  if (tbl2) {
    tbl2.querySelectorAll('th[data-sort]').forEach(th => {
      th.style.cursor = 'pointer';
      th.onclick = () => {
        const s = th.dataset.sort;
        if (floorPerformanceFilters.sortCol === s) { floorPerformanceFilters.sortAsc = !floorPerformanceFilters.sortAsc; }
        else { floorPerformanceFilters.sortCol = s; floorPerformanceFilters.sortAsc = false; }
        renderQtcFloorPerformance();
      };
    });
  }

  // Heatmap interactive clicks & tooltips
  page.querySelectorAll('.qf-heat-cell').forEach(cell => {
    cell.onclick = () => {
      const fl = cell.dataset.floor;
      const sh = cell.dataset.shift;
      if (fl) qtcFloorFilters.floor = fl;
      if (sh) qtcFloorFilters.shift = sh;
      qtcFloorFilters.page = 0;
      renderQtcFloorPerformance();
    };
    MeegTooltip.attach(cell, () => ({
      title: 'Unit ' + cell.dataset.floor + ' · ' + cell.dataset.shift,
      badge: 'Heatmap Cell',
      desc: 'Facility Shift Throughput',
      rows: [
        { label: 'Unit', value: 'Unit ' + cell.dataset.floor, color: 'var(--accent)' },
        { label: 'Shift', value: cell.dataset.shift, color: 'var(--primary)' },
        { label: 'Submissions', value: cell.textContent.trim(), color: '#10b981' }
      ]
    }));
  });

  page.querySelectorAll('.qf-heat-unit-hdr').forEach(el => {
    el.onclick = () => {
      const fl = el.dataset.floor;
      if (fl) qtcFloorFilters.floor = (qtcFloorFilters.floor === fl ? '' : fl);
      qtcFloorFilters.page = 0;
      renderQtcFloorPerformance();
    };
  });

  page.querySelectorAll('.qf-heat-shift-hdr').forEach(el => {
    el.onclick = () => {
      const sh = el.dataset.shift;
      if (sh) qtcFloorFilters.shift = (qtcFloorFilters.shift === sh ? '' : sh);
      qtcFloorFilters.page = 0;
      renderQtcFloorPerformance();
    };
  });

  // KPI card tooltips
  page.querySelectorAll('.qf-kpi-card').forEach((card, idx) => {
    const k = kpiDefs[idx];
    if (k) {
      MeegTooltip.attach(card, () => ({
        title: k.title,
        badge: 'Diagnostic KPI',
        desc: k.sub,
        rows: [
          { label: 'Current Value', value: k.val, color: k.tone }
        ]
      }));
    }
  });

  // Event handlers
  const qfSearch = $('qfSearch');
  if(qfSearch) qfSearch.oninput = e => { qtcFloorFilters.query = e.target.value; qtcFloorFilters.page = 0; renderQtcFloorPerformance(); };

  const qfSelQtc = $('qfSelectQtc');
  if(qfSelQtc) qfSelQtc.onchange = e => { qtcFloorFilters.qtc = e.target.value; qtcFloorFilters.page = 0; renderQtcFloorPerformance(); };

  const qfSelFl = $('qfSelectFloor');
  if(qfSelFl) qfSelFl.onchange = e => { qtcFloorFilters.floor = e.target.value; qtcFloorFilters.page = 0; renderQtcFloorPerformance(); };

  const qfSelSh = $('qfSelectShift');
  if(qfSelSh) qfSelSh.onchange = e => { qtcFloorFilters.shift = e.target.value; qtcFloorFilters.page = 0; renderQtcFloorPerformance(); };

  const qfReset = $('qfReset');
  if(qfReset) qfReset.onclick = () => {
    Object.assign(qtcFloorFilters, { query: '', qtc: '', floor: '', shift: '', category: '', sortCol: 'totalSubmit', sortAsc: false, page: 0 });
    renderQtcFloorPerformance();
  };

  // Pagination Table 1
  const qfPrev = $('qfPrev'); if(qfPrev) qfPrev.onclick = () => { if(qtcFloorFilters.page > 0){ qtcFloorFilters.page--; renderQtcFloorPerformance(); } };
  const qfNext = $('qfNext'); if(qfNext) qfNext.onclick = () => { if(qtcFloorFilters.page < qfTotalPages - 1){ qtcFloorFilters.page++; renderQtcFloorPerformance(); } };

  // Exports
  const qfExp = $('qfExportCSV');
  if(qfExp) qfExp.onclick = () => exportQtcFloorCSV(allQTCFloorGroups);

  const flExp = $('floorExportCSV');
  if(flExp) flExp.onclick = () => exportFloorPerformanceCSV(allFloorGroups);
}

// ============================================================
// PAGE: ADVANCED INSIGHTS (Additive Analytical Workspace)
// ============================================================
const advancedInsightsFilters = { query: '', sortCol: 'total', sortAsc: false, page: 0, pageSize: 20 };
