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

const newQtcFloorAggregateData = `function qtcFloorAggregateData(rows){
  const idx = name => hdrs.findIndex(h => h.trim().toLowerCase() === name.toLowerCase());
  const qi = idx('qtc name'), fi = hdrs.findIndex(h => ['floor','unit'].includes(h.trim().toLowerCase()));
  const si = idx('shift'), mi = idx('modality'), pi = idx('pass');
  const ni = idx('national id'), li = idx('labeler name');
  const oi = idx('object count'), qni = idx('queue name');

  const groups = new Map();
  rows.forEach(r => {
    const qtc = qi >= 0 ? (String(r[qi] || '').normalize('NFC').trim().replace(/\\s+/gu, ' ') || 'Unknown QTC') : 'Unknown QTC';
    const floor = fi >= 0 ? (deriveFloor(r[fi]) || 'Unknown Floor') : 'Unknown Floor';
    const key = qtc + '|||' + floor;
    if (!groups.has(key)) {
      groups.set(key, {
        qtc,
        floor,
        shifts: new Set(),
        queues: new Set(),
        lidarFP: 0,
        lidarQA: 0,
        laneFP: 0,
        laneQA: 0,
        totalSubmit: 0,
        totalObjects: 0,
        labelerSet: new Set()
      });
    }
    const g = groups.get(key);
    g.totalSubmit++;
    const objCnt = parseFloat(oi >= 0 ? r[oi] : 0) || 0;
    g.totalObjects += objCnt;

    if (si >= 0 && r[si]) {
      const s = String(r[si] || '').trim();
      if (s) g.shifts.add(s);
    }
    if (qni >= 0 && r[qni]) {
      const qn = String(r[qni] || '').trim();
      if (qn) g.queues.add(qn);
    }

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
    if (lid) g.labelerSet.add(lid);

    if (isModPass(r, 'lidar', 'FP')) g.lidarFP++;
    if (isModPass(r, 'lidar', 'QA')) g.lidarQA++;
    if (isModPass(r, 'laneline', 'FP')) g.laneFP++;
    if (isModPass(r, 'laneline', 'QA')) g.laneQA++;
  });

  return [...groups.values()].map(g => {
    const uniqueLabelers = g.labelerSet.size;
    const avgSubmit = uniqueLabelers > 0 ? (g.totalSubmit / uniqueLabelers) : 0;
    return {
      ...g,
      shifts: [...g.shifts].sort(),
      queues: [...g.queues].sort(),
      uniqueQueues: g.queues.size,
      uniqueLabelers,
      avgSubmit,
      avgSubmitStr: avgSubmit.toFixed(1)
    };
  });
}`;

const newFloorAggregateData = `function floorAggregateData(rows){
  const idx = name => hdrs.findIndex(h => h.trim().toLowerCase() === name.toLowerCase());
  const qi = idx('qtc name'), fi = hdrs.findIndex(h => ['floor','unit'].includes(h.trim().toLowerCase()));
  const si = idx('shift'), mi = idx('modality'), pi = idx('pass');
  const ni = idx('national id'), li = idx('labeler name');
  const oi = idx('object count');

  const groups = new Map();
  rows.forEach(r => {
    const floor = fi >= 0 ? (deriveFloor(r[fi]) || 'Unknown Floor') : 'Unknown Floor';
    const qtc = qi >= 0 ? (String(r[qi] || '').normalize('NFC').trim().replace(/\\s+/gu, ' ') || 'Unknown QTC') : 'Unknown QTC';
    if (!groups.has(floor)) {
      groups.set(floor, {
        floor,
        shifts: new Set(),
        qtcs: new Set(),
        lidarFP: 0,
        lidarQA: 0,
        laneFP: 0,
        laneQA: 0,
        totalSubmit: 0,
        totalObjects: 0,
        labelerSet: new Set()
      });
    }
    const g = groups.get(floor);
    g.totalSubmit++;
    const objCnt = parseFloat(oi >= 0 ? r[oi] : 0) || 0;
    g.totalObjects += objCnt;

    if (si >= 0 && r[si]) {
      const s = String(r[si] || '').trim();
      if (s) g.shifts.add(s);
    }
    if (qtc && qtc !== 'Unknown QTC') g.qtcs.add(qtc);

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
    if (lid) g.labelerSet.add(lid);

    if (isModPass(r, 'lidar', 'FP')) g.lidarFP++;
    if (isModPass(r, 'lidar', 'QA')) g.lidarQA++;
    if (isModPass(r, 'laneline', 'FP')) g.laneFP++;
    if (isModPass(r, 'laneline', 'QA')) g.laneQA++;
  });

  const overallTotal = rows.length || 1;

  return [...groups.values()].map(g => {
    const uniqueLabelers = g.labelerSet.size;
    const avgSubmit = uniqueLabelers > 0 ? (g.totalSubmit / uniqueLabelers) : 0;
    const sharePct = ((g.totalSubmit / overallTotal) * 100).toFixed(1);
    return {
      ...g,
      shifts: [...g.shifts].sort(),
      qtcs: [...g.qtcs].sort(),
      uniqueQtcs: g.qtcs.size,
      uniqueLabelers,
      totalFP: g.lidarFP + g.laneFP,
      totalQA: g.lidarQA + g.laneQA,
      avgSubmit,
      avgSubmitStr: avgSubmit > 0 ? avgSubmit.toFixed(1) : '—',
      sharePct: Number(sharePct) || 0,
      sharePctStr: sharePct + '%'
    };
  });
}`;

const newRenderQtcFloorPerformance = `function renderQtcFloorPerformance(){
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

  const distinctQtcs = [...new Set(baseRows.map(r => qi >= 0 ? String(r[qi] || '').normalize('NFC').trim().replace(/\\s+/gu, ' ') : '').filter(Boolean))].sort();
  const distinctFloors = [...new Set(baseRows.map(r => fi >= 0 ? deriveFloor(r[fi]) : '').filter(Boolean))].sort();
  const distinctShifts = [...new Set(baseRows.map(r => si >= 0 ? String(r[si] || '').trim() : '').filter(Boolean))].sort();

  // Filter baseRows by page filters
  const q = (qtcFloorFilters.query || '').toLowerCase().trim();
  const filteredRows = baseRows.filter(r => {
    const qtc = qi >= 0 ? String(r[qi] || '').normalize('NFC').trim().replace(/\\s+/gu, ' ') : '';
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
      + kpiDefs.map(k => '<div class="kpi-mini-card" style="--tone:' + k.tone + '">'
        + '<div class="kpi-title"><span>' + esc(k.title) + '</span><span style="color:' + k.tone + '">●</span></div>'
        + '<div class="kpi-val">' + k.val + '</div>'
        + '<div class="kpi-sub">' + esc(k.sub) + '</div>'
      + '</div>').join('')
    + '</div>'

    // Controls & Filter Bar
    + '<div class="queues-controls" style="margin-top:16px;">'
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
    + '<div class="ux-panel" style="margin-top:20px;">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">'
        + '<h3 style="margin:0;">🔥 Facility Heatmap: Floor / Unit × Shift</h3>'
        + '<span class="ux-note">Color intensity represents submission throughput volume</span>'
      + '</div>'
      + '<div style="overflow-x:auto;">'
        + '<table style="width:100%; border-collapse:collapse; font-size:12px; text-align:center;">'
          + '<thead><tr style="background:var(--bg-2); border-bottom:1px solid var(--border);"><th style="padding:10px 14px; text-align:left;">Floor / Unit</th>' + distinctShifts.map(sh => '<th style="padding:10px 14px;">' + esc(sh) + '</th>').join('') + '<th style="padding:10px 14px; font-weight:700;">Unit Total</th></tr></thead>'
          + '<tbody>'
            + distinctFloors.map(fl => {
              let rowTot = 0;
              return '<tr style="border-bottom:1px solid var(--border);">'
                + '<td style="padding:10px 14px; text-align:left; font-weight:700; color:var(--accent);">🏢 Unit ' + esc(fl) + '</td>'
                + distinctShifts.map(sh => {
                  const val = heatmapData[fl][sh] || 0;
                  rowTot += val;
                  const ratio = maxHeat > 0 ? (val / maxHeat) : 0;
                  const bg = val > 0 ? 'rgba(13,148,136,' + Math.max(0.12, ratio * 0.75).toFixed(2) + ')' : 'transparent';
                  return '<td style="padding:10px 14px; background:' + bg + '; font-weight:' + (val > 0 ? '700' : '400') + '; color:var(--text);">' + val.toLocaleString() + '</td>';
                }).join('')
                + '<td style="padding:10px 14px; font-weight:800; color:var(--primary); font-size:13px;">' + rowTot.toLocaleString() + '</td>'
              + '</tr>';
            }).join('')
          + '</tbody>'
        + '</table>'
      + '</div>'
    + '</div>'

    // TABLE 1: QTC × Unit Performance Table (Section 7.2)
    + '<section class="ux-panel" style="margin-top:20px;">'
      + '<div class="ux-heading" style="margin-bottom:12px;">'
        + '<div><h3>Table 1: QTC × Floor Performance Table (' + allQTCFloorGroups.length + ' combinations)</h3><p>Composite groups: each row represents an actual QTC + Unit assignment. Never combines different Units.</p></div>'
        + '<span class="ux-note">Showing ' + (qfVisible.length ? (qtcFloorFilters.page*qfPageSize+1) : 0) + ' – ' + Math.min((qtcFloorFilters.page+1)*qfPageSize, allQTCFloorGroups.length) + ' of ' + allQTCFloorGroups.length + ' records</span>'
      + '</div>'
      + '<div class="perf-table">'
        + '<table>'
          + '<thead><tr>'
            + '<th data-sort="qtc">QTC Supervisor ↕</th>'
            + '<th data-sort="floor">Floor / Unit ↕</th>'
            + '<th>Active Shifts</th>'
            + '<th data-sort="lidarFP" style="color:#0d9488;">Lidar FP ↕</th>'
            + '<th data-sort="lidarQA" style="color:#14b8a6;">Lidar QA ↕</th>'
            + '<th data-sort="laneFP" style="color:#ed9a35;">Lane FP ↕</th>'
            + '<th data-sort="laneQA" style="color:#ec4899;">Lane QA ↕</th>'
            + '<th data-sort="totalSubmit" style="color:var(--primary);">Total Submit ↕</th>'
            + '<th data-sort="totalObjects" style="color:#0284c7;">Total Objects ↕</th>'
            + '<th data-sort="uniqueLabelers">Team (Labelers) ↕</th>'
            + '<th data-sort="avgSubmit">Avg / Labeler ↕</th>'
            + '<th>Queues Covered</th>'
          + '</tr></thead>'
          + '<tbody>'
            + qfVisible.map(item => \`
              <tr style="border-bottom:1px solid var(--border);" onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background='transparent'">
                <td style="padding:9px 12px; font-weight:700; color:var(--primary);">👤 \${esc(item.qtc)}</td>
                <td style="padding:9px 12px; font-weight:600; color:var(--accent);">🏢 Unit \${esc(item.floor)}</td>
                <td style="padding:9px 12px;"><span class="ux-note">\${esc(item.shifts.join(', ') || '—')}</span></td>
                <td style="padding:9px 12px; text-align:center; color:#0d9488;">\${item.lidarFP.toLocaleString()}</td>
                <td style="padding:9px 12px; text-align:center; color:#14b8a6;">\${item.lidarQA.toLocaleString()}</td>
                <td style="padding:9px 12px; text-align:center; color:#ed9a35;">\${item.laneFP.toLocaleString()}</td>
                <td style="padding:9px 12px; text-align:center; color:#ec4899;">\${item.laneQA.toLocaleString()}</td>
                <td style="padding:9px 12px; text-align:center; font-weight:800; color:var(--text); font-size:13px;">\${item.totalSubmit.toLocaleString()}</td>
                <td style="padding:9px 12px; text-align:center; font-weight:700; color:#0284c7;">\${item.totalObjects.toLocaleString()}</td>
                <td style="padding:9px 12px; text-align:center; font-weight:600;">\${item.uniqueLabelers.toLocaleString()}</td>
                <td style="padding:9px 12px; text-align:center; font-weight:600; color:var(--primary);">\${item.avgSubmitStr}</td>
                <td style="padding:9px 12px;"><span class="ux-note">\${item.uniqueQueues} queues</span></td>
              </tr>
            \`).join('')
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
    + '<section class="ux-panel" style="margin-top:20px;">'
      + '<div class="ux-heading" style="margin-bottom:12px;">'
        + '<div><h3>Table 2: Floor (= Unit) Performance Table (' + allFloorGroups.length + ' Units)</h3><p>Overall operational throughput per facility unit (Floor = Unit).</p></div>'
        + '<button class="btn btn-c" id="floorExportCSV" style="font-size:11px; padding:5px 12px;">↓ Export Floor CSV</button>'
      + '</div>'
      + '<div class="perf-table">'
        + '<table>'
          + '<thead><tr>'
            + '<th data-sort="floor">Floor / Unit ↕</th>'
            + '<th>Active Shifts</th>'
            + '<th data-sort="uniqueQtcs">Unique QTCs ↕</th>'
            + '<th data-sort="uniqueLabelers">Unique Labelers ↕</th>'
            + '<th data-sort="lidarFP" style="color:#0d9488;">Lidar FP</th>'
            + '<th data-sort="lidarQA" style="color:#14b8a6;">Lidar QA</th>'
            + '<th data-sort="laneFP" style="color:#ed9a35;">Lane FP</th>'
            + '<th data-sort="laneQA" style="color:#ec4899;">Lane QA</th>'
            + '<th data-sort="totalFP">Total FP</th>'
            + '<th data-sort="totalQA">Total QA</th>'
            + '<th data-sort="totalSubmit" style="color:var(--primary); font-weight:800;">Total Submits ↕</th>'
            + '<th data-sort="totalObjects" style="color:#0284c7;">Total Objects</th>'
            + '<th data-sort="avgSubmit">Avg / Labeler</th>'
            + '<th>Unit Share %</th>'
          + '</tr></thead>'
          + '<tbody>'
            + allFloorGroups.map(g => \`
              <tr style="border-bottom:1px solid var(--border);" onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background='transparent'">
                <td style="padding:10px 14px; font-weight:700; color:var(--accent);">🏢 Unit \${esc(g.floor)}</td>
                <td style="padding:10px 12px;"><span class="ux-note">\${esc(g.shifts.join(', ') || '—')}</span></td>
                <td style="padding:10px 12px; text-align:center; font-weight:600;">\${g.uniqueQtcs}</td>
                <td style="padding:10px 12px; text-align:center; font-weight:600;">\${g.uniqueLabelers}</td>
                <td style="padding:10px 12px; text-align:center; color:#0d9488;">\${g.lidarFP.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; color:#14b8a6;">\${g.lidarQA.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; color:#ed9a35;">\${g.laneFP.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; color:#ec4899;">\${g.laneQA.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; font-weight:700; color:#3b82f6;">\${g.totalFP.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; font-weight:700; color:#8b5cf6;">\${g.totalQA.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; font-weight:800; color:var(--text); font-size:13px;">\${g.totalSubmit.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; font-weight:700; color:#0284c7;">\${g.totalObjects.toLocaleString()}</td>
                <td style="padding:10px 12px; text-align:center; font-weight:600; color:var(--primary);">\${g.avgSubmitStr}</td>
                <td style="padding:10px 14px; text-align:center;">
                  <div style="display:flex; align-items:center; justify-content:center; gap:6px;">
                    <div style="width:45px; height:6px; border-radius:3px; background:var(--border); overflow:hidden;">
                      <div style="width:\${g.sharePct}%; height:100%; background:var(--primary);"></div>
                    </div>
                    <b>\${g.sharePctStr}</b>
                  </div>
                </td>
              </tr>
            \`).join('')
          + '</tbody>'
        + '</table>'
      + '</div>'
    + '</section>'
  + '</div>';

  bindHeaderControls(page, 'qf');
  bindUniversalFilterBar(page, 'qtcfloor');

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
}`;

code = replaceFunctionInCode(code, 'qtcFloorAggregateData', newQtcFloorAggregateData);
code = replaceFunctionInCode(code, 'floorAggregateData', newFloorAggregateData);
code = replaceFunctionInCode(code, 'renderQtcFloorPerformance', newRenderQtcFloorPerformance);

fs.writeFileSync(filePath, code, 'utf8');
console.log('Applied new qtcFloor functions successfully');
