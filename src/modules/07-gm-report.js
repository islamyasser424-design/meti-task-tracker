function renderGmReport(){
  const page = $('uxGmReport');
  if(!page || page.hidden) return;

  const baseRows = rowsInView();
  const sourceUniverse = (typeof rawRows !== 'undefined' && rawRows.length) ? rawRows : baseRows;

  // Shift Definitions covering full 24 hours:
  const SHIFTS_META = [
    {
      key: 'on',
      name: 'ON Report',
      fullTitle: '1. ON Report — Over Night Shift',
      timeWindow: '12:00 AM to 8:00 AM (00:00 – 08:00)',
      icon: '🌙',
      tone: '#8b5cf6',
      cardClass: 'shift-card-on',
      badgeClass: 'shift-badge-on'
    },
    {
      key: 'morning',
      name: 'Morning Report',
      fullTitle: '2. Morning Report — Morning Shift',
      timeWindow: '8:00 AM to 4:00 PM (08:00 – 16:00)',
      icon: '☀️',
      tone: '#0d9488',
      cardClass: 'shift-card-morning',
      badgeClass: 'shift-badge-morning'
    },
    {
      key: 'night',
      name: 'Night Report',
      fullTitle: '3. Night Report — Night Shift',
      timeWindow: '4:00 PM to 12:00 AM (16:00 – 00:00)',
      icon: '🌆',
      tone: '#ed9a35',
      cardClass: 'shift-card-night',
      badgeClass: 'shift-badge-night'
    }
  ];

  // Partition rows into 3 non-overlapping shift buckets
  const shiftRowsMap = { on: [], morning: [], night: [] };
  baseRows.forEach(r => {
    const sCat = getTaskShiftCategory(r);
    if (shiftRowsMap[sCat]) {
      shiftRowsMap[sCat].push(r);
    } else {
      shiftRowsMap.morning.push(r);
    }
  });

  // Calculate aggregates for each shift
  const qSearch = (gmReportFilters.query || '').toLowerCase().trim();
  const modFilter = gmReportFilters.modality || 'all';

  const shiftReports = SHIFTS_META.map(meta => {
    const sRows = shiftRowsMap[meta.key] || [];
    const rep = gmQueueReport(sRows, sourceUniverse);
    let groups = rep.groups;

    // Filter zero activity queues (default true)
    if (gmReportFilters.hideZero !== false) {
      groups = groups.filter(g => g.fp > 0 || g.qa > 0);
    }

    // Modality filter
    if (modFilter !== 'all') {
      if (modFilter === 'relabel') {
        groups = groups.filter(g => g.isRelabel);
      } else if (modFilter === 'lidar') {
        groups = groups.filter(g => g.mod === 'Lidar' && !g.isRelabel);
      } else if (modFilter === 'laneline') {
        groups = groups.filter(g => g.mod === 'Lane Line' && !g.isRelabel);
      }
    }

    // Search query filter
    if (qSearch) {
      groups = groups.filter(g => g.name.toLowerCase().includes(qSearch));
    }

    // Sorting
    const sortCol = gmReportFilters.sortCol || 'name';
    const sortAsc = gmReportFilters.sortAsc !== undefined ? gmReportFilters.sortAsc : (sortCol === 'name');
    groups.sort((a, b) => {
      let va = (sortCol === 'name') ? a.name : (sortCol === 'fpLabelers') ? a.fpIds.size : (sortCol === 'fp') ? a.fp : (sortCol === 'qaLabelers') ? a.qaIds.size : a.qa;
      let vb = (sortCol === 'name') ? b.name : (sortCol === 'fpLabelers') ? b.fpIds.size : (sortCol === 'fp') ? b.fp : (sortCol === 'qaLabelers') ? b.qaIds.size : b.qa;
      if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      va = Number(va) || 0; vb = Number(vb) || 0;
      return sortAsc ? (va - vb) : (vb - va);
    });

    let totalFp = 0, totalQa = 0, missing = 0;
    let lidarFp = 0, lidarQa = 0;
    let laneFp = 0, laneQa = 0;
    let relabelFp = 0, relabelQa = 0;
    const fpIds = new Set(), qaIds = new Set();

    groups.forEach(g => {
      totalFp += g.fp;
      totalQa += g.qa;
      g.fpIds.forEach(id => fpIds.add(id));
      g.qaIds.forEach(id => qaIds.add(id));
      missing += g.missing;

      const mLower = String(g.mod || '').toLowerCase().replace(/[\s_-]+/g, '');
      if (mLower === 'lidar') {
        lidarFp += g.fp;
        lidarQa += g.qa;
      } else if (mLower === 'laneline' || mLower === 'lane') {
        laneFp += g.fp;
        laneQa += g.qa;
      }

      if (g.isRelabel) {
        relabelFp += g.fp;
        relabelQa += g.qa;
      }
    });

    const lidarTotal = lidarFp + lidarQa;
    const laneTotal = laneFp + laneQa;
    const relabelTotal = relabelFp + relabelQa;

    return {
      meta,
      rowsCount: sRows.length,
      sRows: sRows,
      groups,
      totalFp,
      totalQa,
      totalSubmits: totalFp + totalQa,
      uniqueFp: fpIds.size,
      uniqueQa: qaIds.size,
      lidarFp,
      lidarQa,
      lidarTotal,
      laneFp,
      laneQa,
      laneTotal,
      relabelFp,
      relabelQa,
      relabelTotal,
      missing
    };
  });

  // Grand totals across all 24 hours
  const grand24hSubmits = baseRows.length;
  const activeDateDisplay = globalUnifiedFilters.date 
    ? ('📅 Day: ' + globalUnifiedFilters.date)
    : (globalUnifiedFilters.from && globalUnifiedFilters.to)
      ? ('📅 Range: ' + globalUnifiedFilters.from + ' → ' + globalUnifiedFilters.to)
      : ('📅 All Available History (All-time: ' + cairoToday() + ')');

  page.innerHTML = `
    <div class="ux-overview">
      <div class="ux-heading">
        <div>
          <div class="ux-eyebrow">24-Hour Operational Diagnostics · 3 Sequential Shift Reports</div>
          <h2>📊 GM Report — 3 Shift Daily Activity</h2>
          <p>${esc(activeDateDisplay)} · 24-Hour Sequential Shift Windows (ON · Morning · Night)</p>
        </div>
        <div class="ux-tools">
          ${renderHeaderControlsHTML('gm')}
          <button class="btn btn-c" id="gmExportAllCsvBtn" title="Export complete 24H 3-shift data to CSV">↓ Export 24H GM CSV</button>
        </div>
      </div>

      ${renderUniversalFilterBar('gm_report')}

      <!-- 24H Consolidated Summary & Quick Shift Jump Bar -->
      <div class="gm-shift-overview-card">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; margin-bottom:12px;">
          <div>
            <h3 style="margin:0 0 4px; font-size:16px; font-weight:700; color:var(--text); display:flex; align-items:center; gap:8px;">
              <span>⏱️</span> 24-Hour Operational Summary (Consolidated Daily)
            </h3>
            <p style="margin:0; font-size:12px; color:var(--text-soft);">
              Total Daily Submissions: <b style="color:var(--primary); font-size:14px;">${grand24hSubmits.toLocaleString()}</b> recorded tasks distributed across 3 shifts (8 hours per shift).
            </p>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:12px; color:var(--text-soft); display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" id="gmHideZeroToggle" ${gmReportFilters.hideZero !== false ? 'checked' : ''}>
              Hide Inactive Queues
            </label>
          </div>
        </div>

        <!-- 3 Shifts Metric Distribution Pills -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:12px; margin-top:14px;">
          ${shiftReports.map(rep => {
            const share = grand24hSubmits > 0 ? ((rep.totalSubmits / grand24hSubmits) * 100).toFixed(1) : 0;
            return `
              <div class="ux-panel" style="padding:14px 18px; border-left:4px solid ${rep.meta.tone}; background:var(--bg-2); display:flex; flex-direction:column; justify-content:space-between;">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-size:13px; font-weight:700; color:${rep.meta.tone};">${rep.meta.icon} ${rep.meta.name}</span>
                    <span class="q-badge" style="background:${rep.meta.tone}22; color:${rep.meta.tone}; font-weight:700;">${share}% share</span>
                  </div>
                  <div style="font-size:22px; font-weight:800; color:var(--text); margin-bottom:4px;">
                    ${rep.totalSubmits.toLocaleString()} <span style="font-size:11px; font-weight:500; color:var(--text-soft);">tasks</span>
                  </div>
                  <div style="font-size:11px; color:var(--text-soft); display:flex; justify-content:space-between; margin-bottom:10px;">
                    <span>FP: <b class="highlight-fp">${rep.totalFp.toLocaleString()}</b></span>
                    <span>QA: <b class="highlight-qa">${rep.totalQa.toLocaleString()}</b></span>
                    <span>Queues: <b>${rep.groups.length}</b></span>
                  </div>
                </div>

                <!-- Modality Breakdown (Lidar FP/QA, Lane Line FP/QA, Relabeling FP/QA) -->
                <div class="gm-shift-mod-breakdown">
                  <div class="gm-mod-breakdown-row">
                    <span class="gm-mod-pill-tag">
                      <span class="daily-mod daily-lidar">📡 Lidar</span>
                      <span class="gm-mod-mini-tot">(${rep.lidarTotal.toLocaleString()})</span>
                    </span>
                    <span class="gm-mod-stat-values">
                      <span class="stat-fp">FP: <b>${rep.lidarFp.toLocaleString()}</b></span>
                      <span class="stat-sep">|</span>
                      <span class="stat-qa">QA: <b>${rep.lidarQa.toLocaleString()}</b></span>
                    </span>
                  </div>

                  <div class="gm-mod-breakdown-row">
                    <span class="gm-mod-pill-tag">
                      <span class="daily-mod daily-lane">🛣️ Lane Line</span>
                      <span class="gm-mod-mini-tot">(${rep.laneTotal.toLocaleString()})</span>
                    </span>
                    <span class="gm-mod-stat-values">
                      <span class="stat-fp">FP: <b>${rep.laneFp.toLocaleString()}</b></span>
                      <span class="stat-sep">|</span>
                      <span class="stat-qa">QA: <b>${rep.laneQa.toLocaleString()}</b></span>
                    </span>
                  </div>

                  ${rep.relabelTotal > 0 ? `
                  <div class="gm-mod-breakdown-row" style="background:rgba(245, 158, 11, 0.08); border-color:rgba(245, 158, 11, 0.25);">
                    <span class="gm-mod-pill-tag">
                      <span class="daily-mod daily-relabel">🔄 Relabeling</span>
                      <span class="gm-mod-mini-tot">(${rep.relabelTotal.toLocaleString()})</span>
                    </span>
                    <span class="gm-mod-stat-values">
                      <span class="stat-fp">FP: <b>${rep.relabelFp.toLocaleString()}</b></span>
                      <span class="stat-sep">|</span>
                      <span class="stat-qa">QA: <b>${rep.relabelQa.toLocaleString()}</b></span>
                    </span>
                  </div>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- 4 Distinct Shift Report View Mode Switcher -->
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; border-bottom:1px solid var(--border); padding-bottom:12px;">
          <button type="button" class="btn ${_shiftReportViewMode==='queues'?'btn-c':''}" data-shift-view="queues" style="font-weight:700; font-size:12px;">
            🗂️ 1. Queue Productivity (Screenshot Layout)
          </button>
          <button type="button" class="btn ${_shiftReportViewMode==='floors'?'btn-c':''}" data-shift-view="floors" style="font-weight:700; font-size:12px;">
            🏢 2. Floor / Room Breakdown
          </button>
          <button type="button" class="btn ${_shiftReportViewMode==='floor_summary'?'btn-c':''}" data-shift-view="floor_summary" style="font-weight:700; font-size:12px;">
            🏢 Summary of Floor / Room Breakdown
          </button>
          <button type="button" class="btn ${_shiftReportViewMode==='qcs'?'btn-c':''}" data-shift-view="qcs" style="font-weight:700; font-size:12px;">
            👥 3. QC / QTC Supervisors Breakdown
          </button>
          <button type="button" class="btn ${_shiftReportViewMode==='labelers'?'btn-c':''}" data-shift-view="labelers" style="font-weight:700; font-size:12px;">
            👤 4. Labelers Productivity Breakdown
          </button>
        </div>

        <!-- Toolbar for Real-time Searching & Modality Filter across all 3 tables -->
        <div class="daily-toolbar-row" style="margin-top:16px;">
          <div class="daily-search-box">
            <input type="text" id="gmSearchInput" class="daily-search-input" placeholder="🔍 Search queue name across all 3 reports..." value="${esc(gmReportFilters.query || '')}">
          </div>
          <div class="daily-mod-pills">
            <button type="button" class="daily-pill-btn ${(!gmReportFilters.modality || gmReportFilters.modality === 'all') ? 'active' : ''}" data-gm-mod="all">All Modalities</button>
            <button type="button" class="daily-pill-btn ${gmReportFilters.modality === 'lidar' ? 'active' : ''}" data-gm-mod="lidar">📡 Lidar</button>
            <button type="button" class="daily-pill-btn ${gmReportFilters.modality === 'laneline' ? 'active' : ''}" data-gm-mod="laneline">🛣️ Lane Line</button>
            <button type="button" class="daily-pill-btn ${gmReportFilters.modality === 'relabel' ? 'active' : ''}" data-gm-mod="relabel">🔄 Relabeling</button>
          </div>
        </div>

        <!-- Quick Jump Navigation -->
        <div class="gm-shift-nav-bar">
          <span style="font-size:11.5px; font-weight:700; color:var(--muted);">Jump directly to report:</span>
          <div class="gm-shift-jump-group">
            ${shiftReports.map(rep => `
              <a href="#gmShiftSec_${rep.meta.key}" class="gm-shift-jump-btn">
                <span>${rep.meta.icon} ${rep.meta.name}</span>
                <span class="jump-count">${rep.totalSubmits.toLocaleString()}</span>
              </a>
            `).join('')}
          </div>
        </div>
      </div>

      ${_shiftReportViewMode === 'floor_summary' ? `
        <section class="daily-queue-card" style="margin-bottom:28px; border-left:4px solid var(--primary);">
          <div class="daily-queue-card-head">
            <div>
              <h3>
                <span>🌐</span>
                <span style="color:var(--primary);">24-Hour Grand Summary — Floor & Shifts Breakdown</span>
                <span class="daily-mod" style="background:rgba(59, 130, 246, 0.1); color:var(--primary);">Full 24 Hours</span>
              </h3>
              <p>
                Consolidated 24-hour floor productivity comparing Over Night (ON), Morning, and Night shifts side-by-side with exact modality and unique labeler breakdown.
              </p>
            </div>
          </div>
          ${build24HourFloorSummaryTableHTML(shiftReports, baseRows, gmReportFilters.sortCol, gmReportFilters.sortAsc)}
        </section>
      ` : ''}

      <!-- ============================================================ -->
      <!-- 3 INDEPENDENT SHIFT REPORTS (STACKED VERTICALLY) -->
      <!-- ============================================================ -->
      ${shiftReports.map(rep => {
        const sortCol = gmReportFilters.sortCol || 'name';
        const sortAsc = gmReportFilters.sortAsc !== undefined ? gmReportFilters.sortAsc : (sortCol === 'name');

        return `
          <section class="daily-queue-card ${rep.meta.cardClass}" id="gmShiftSec_${rep.meta.key}" style="margin-bottom:28px;">
            <div class="daily-queue-card-head">
              <div>
                <h3>
                  <span>${rep.meta.icon}</span>
                  <span style="color:${rep.meta.tone};">${rep.meta.fullTitle}</span>
                  <span class="daily-mod ${rep.meta.badgeClass}">${rep.meta.timeWindow}</span>
                </h3>
                <p>
                  Detailed queue productivity report for shift window (${rep.meta.timeWindow}). Queues without submissions during this period are excluded.
                </p>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <button class="btn btn-sm btn-c" data-export-shift="${rep.meta.key}">↓ Export ${rep.meta.name} CSV</button>
              </div>
            </div>

            <!-- Dynamic Shift Report Table (Queues, Floors, QCs, Labelers) -->
            ${buildShiftTableHTML(rep, rep.sRows || [], _shiftReportViewMode, sortCol, sortAsc)}

            <p class="an-context" style="margin-top:12px; font-size:11px; color:var(--muted);">
              ${rep.missing > 0 ? (rep.missing + ' FP/QA entries de-duplicated by name. ') : ''}
              Period window: ${rep.meta.timeWindow}. Verified live from Turso database.
            </p>
          </section>
        `;
      }).join('')}
    </div>
  `;

  bindHeaderControls(page, 'gm');
  bindUniversalFilterBar(page, 'gm_report');

  // Search input binding across reports
  const searchInput = page.querySelector('#gmSearchInput');
  if (searchInput) {
    searchInput.oninput = (e) => {
      gmReportFilters.query = e.target.value;
      renderGmReport();
      const refocused = page.querySelector('#gmSearchInput');
      if (refocused) {
        refocused.focus();
        refocused.selectionStart = refocused.selectionEnd = refocused.value.length;
      }
    };
  }

  // Shift view modes binding
  page.querySelectorAll('[data-shift-view]').forEach(btn => {
    btn.onclick = () => {
      _shiftReportViewMode = btn.dataset.shiftView;
      renderGmReport();
    };
  });

  // Modality pills binding
  page.querySelectorAll('[data-gm-mod]').forEach(btn => {
    btn.onclick = () => {
      gmReportFilters.modality = btn.dataset.gmMod;
      renderGmReport();
    };
  });

  // Zero-toggle binding
  const zeroToggle = page.querySelector('#gmHideZeroToggle');
  if (zeroToggle) {
    zeroToggle.onchange = (e) => {
      gmReportFilters.hideZero = e.target.checked;
      renderGmReport();
    };
  }

  // Table header sorting binding across all GM Report tables
  page.querySelectorAll('th.sortable[data-sort]').forEach(th => {
    th.onclick = (e) => {
      e.stopPropagation();
      const col = th.dataset.sort;
      if (gmReportFilters.sortCol === col) {
        gmReportFilters.sortAsc = !gmReportFilters.sortAsc;
      } else {
        gmReportFilters.sortCol = col;
        const isText = ['name', 'qc', 'floor', 'labeler', 'queue', 'mod'].includes(col);
        gmReportFilters.sortAsc = isText;
      }
      renderGmReport();
    };
  });

  // Export Individual Shift CSV
  page.querySelectorAll('[data-export-shift]').forEach(btn => {
    btn.onclick = () => {
      const sKey = btn.dataset.exportShift;
      const rep = shiftReports.find(r => r.meta.key === sKey);
      if (!rep || !rep.groups.length) {
        showToast('No queue rows to export for ' + sKey);
        return;
      }
      const cell = v => '"' + String(v ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
      let csvHeaders, csvRows;
      if (_shiftReportViewMode === 'floor_summary') {
        csvHeaders = ['Shift Name', 'Shift Window', 'Floor / Room', 'Lidar FP Tasks', 'Lidar FP Unique Labelers', 'Lidar QA Tasks', 'Lidar QA Unique Labelers', 'Lane Line FP Tasks', 'Lane Line FP Unique Labelers', 'Lane Line QA Tasks', 'Lane Line QA Unique Labelers', 'Total Tasks', 'Total Unique Labelers'];
        const fMap = new Map();
        (rep.sRows || []).forEach(r => {
          const fl = (typeof deriveFloor === 'function' && fi >= 0) ? deriveFloor(r[fi]) : (fi >= 0 && r[fi] ? String(r[fi]).trim() : 'Floor Room');
          const mod = getModality(r).toLowerCase().replace(/[\s_-]+/g, '');
          const pass = pi >= 0 ? String(r[pi]||'').trim().toUpperCase() : '';
          const labId = ni >= 0 && r[ni] ? String(r[ni]).trim() : (li >= 0 ? String(r[li]||'').trim() : '');
          if (!fMap.has(fl)) {
            fMap.set(fl, { floor: fl, lidarFp: 0, lidarFpLabs: new Set(), lidarQa: 0, lidarQaLabs: new Set(), laneFp: 0, laneFpLabs: new Set(), laneQa: 0, laneQaLabs: new Set(), total: 0, allLabs: new Set() });
          }
          const f = fMap.get(fl);
          f.total++;
          if (labId) f.allLabs.add(labId);
          if (mod === 'lidar') {
            if (pass === 'FP') { f.lidarFp++; if (labId) f.lidarFpLabs.add(labId); }
            else if (pass === 'QA') { f.lidarQa++; if (labId) f.lidarQaLabs.add(labId); }
          } else if (mod === 'laneline' || mod === 'lane') {
            if (pass === 'FP') { f.laneFp++; if (labId) f.laneFpLabs.add(labId); }
            else if (pass === 'QA') { f.laneQa++; if (labId) f.laneQaLabs.add(labId); }
          }
        });
        csvRows = [...fMap.values()].map(f => [
          rep.meta.name, rep.meta.timeWindow, f.floor, f.lidarFp, f.lidarFpLabs.size, f.lidarQa, f.lidarQaLabs.size, f.laneFp, f.laneFpLabs.size, f.laneQa, f.laneQaLabs.size, f.total, f.allLabs.size
        ]);
      } else {
        csvHeaders = ['Queue Name', 'Modality', 'Is Relabeling', 'Shift Window', 'Unique Labelers (FP)', 'Total Submit (FP)', 'Unique Labelers (QA)', 'Total Submit (QA)', 'Total Submissions'];
        csvRows = rep.groups.map(g => [
        g.name,
        g.mod,
        g.isRelabel ? 'Yes' : 'No',
        rep.meta.timeWindow,
        g.fpIds.size,
        g.fp,
        g.qaIds.size,
        g.qa,
        g.fp + g.qa
      ]);
      }
      const csvContent = [csvHeaders, ...csvRows].map(r => r.map(cell).join(',')).join('\r\n');
      downloadBlob(new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' }), 'MEEG_GM_' + rep.meta.name.replace(/\s+/g, '_') + '_' + cairoToday() + '.csv');
      showToast('✓ ' + rep.meta.name + ' exported to CSV');
    };
  });

  // Export Full 24H GM CSV
  const exportAllBtn = page.querySelector('#gmExportAllCsvBtn');
  if (exportAllBtn) {
    exportAllBtn.onclick = () => {
      const cell = v => '"' + String(v ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
      const csvHeaders = ['Shift Report', 'Time Window', 'Queue Name', 'Modality', 'Is Relabeling', 'Unique Labelers (FP)', 'Total Submit (FP)', 'Unique Labelers (QA)', 'Total Submit (QA)', 'Total Submissions'];
      const allRows = [];
      shiftReports.forEach(rep => {
        rep.groups.forEach(g => {
          allRows.push([
            rep.meta.name,
            rep.meta.timeWindow,
            g.name,
            g.mod,
            g.isRelabel ? 'Yes' : 'No',
            g.fpIds.size,
            g.fp,
            g.qaIds.size,
            g.qa,
            g.fp + g.qa
          ]);
        });
      });
      if (!allRows.length) {
        showToast('No queue rows to export');
        return;
      }
      const csvContent = [csvHeaders, ...allRows].map(r => r.map(cell).join(',')).join('\r\n');
      downloadBlob(new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' }), 'MEEG_GM_24H_3Shifts_Report_' + cairoToday() + '.csv');
      showToast('✓ Full 24-Hour 3-Shift GM Report exported to CSV');
    };
  }
}

