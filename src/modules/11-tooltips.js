function renderDateDotTooltip(dateStr, countStr) {
  if (!_metiTooltipEl) return;
  const count = countStr ? Number(countStr).toLocaleString() : '—';
  _metiTooltipEl.innerHTML = '<div style="font-weight:700; font-size:13px; color:#38bdf8; margin-bottom:6px; border-bottom:1px solid #334155; padding-bottom:4px; display:flex; justify-content:space-between; align-items:center;">'
    + '<span>📅 ' + esc(dateStr) + '</span>'
    + '<span style="font-size:10px; background:rgba(56,189,248,0.2); color:#38bdf8; padding:1px 6px; border-radius:4px;">Daily Volume</span>'
  + '</div>'
  + '<div style="display:flex; flex-direction:column; gap:4px; font-size:11.5px;">'
    + '<div style="display:flex; justify-content:space-between;">'
      + '<span style="color:#94a3b8;">Total Submissions:</span>'
      + '<b style="color:#10b981; font-weight:700;">' + count + ' tasks</b>'
    + '</div>'
    + '<div style="color:#38bdf8; font-size:10.5px; margin-top:4px; border-top:1px dashed #334155; padding-top:4px;">'
      + '💡 Click dot to toggle filter for this date'
    + '</div>'
  + '</div>';
}

function renderShiftTooltip(shiftName) {
  if (!_metiTooltipEl) return;
  const rows = typeof rowsInView === 'function' ? rowsInView() : [];
  const si = findColIndex(['shift', 'shift_name']);
  const pi = findColIndex(['pass', 'stage']);
  const li = findColIndex(['labeler name', 'labeler_name', 'labeler', 'name']);

  let fp = 0, qa = 0;
  const labelers = new Set();
  rows.forEach(r => {
    if (si >= 0 && String(r[si] || '').trim() === shiftName) {
      const p = pi >= 0 ? String(r[pi] || '').trim().toUpperCase() : '';
      if (p === 'FP') fp++;
      if (p === 'QA') qa++;
      if (li >= 0 && r[li]) labelers.add(String(r[li]).trim());
    }
  });
  const total = fp + qa;

  _metiTooltipEl.innerHTML = '<div style="font-weight:700; font-size:13px; color:#38bdf8; margin-bottom:6px; border-bottom:1px solid #334155; padding-bottom:4px; display:flex; justify-content:space-between; align-items:center;">'
    + '<span>☀️ ' + esc(shiftName) + '</span>'
    + '<b style="color:#f1f5f9; font-size:11px;">' + total.toLocaleString() + ' tasks</b>'
  + '</div>'
  + '<div style="display:flex; flex-direction:column; gap:4px; font-size:11.5px;">'
    + '<div style="display:flex; justify-content:space-between;">'
      + '<span style="color:#94a3b8;">First Pass (FP):</span>'
      + '<b style="color:#0d9488;">' + fp.toLocaleString() + '</b>'
    + '</div>'
    + '<div style="display:flex; justify-content:space-between;">'
      + '<span style="color:#94a3b8;">Quality Review (QA):</span>'
      + '<b style="color:#14b8a6;">' + qa.toLocaleString() + '</b>'
    + '</div>'
    + '<div style="display:flex; justify-content:space-between;">'
      + '<span style="color:#94a3b8;">Active Contributors:</span>'
      + '<b style="color:#f8fafc;">' + labelers.size + ' labelers</b>'
    + '</div>'
    + '<div style="color:#38bdf8; font-size:10.5px; margin-top:4px; border-top:1px dashed #334155; padding-top:4px;">'
      + '💡 Click shift to toggle filter'
    + '</div>'
  + '</div>';
}

function renderFloorTooltip(floorName) {
  if (!_metiTooltipEl) return;
  const rows = typeof rowsInView === 'function' ? rowsInView() : [];
  const fi = findColIndex(['floor', 'unit']);
  const pi = findColIndex(['pass', 'stage']);
  const li = findColIndex(['labeler name', 'labeler_name', 'labeler', 'name']);

  let fp = 0, qa = 0;
  const labelers = new Set();
  rows.forEach(r => {
    const fl = fi >= 0 ? (typeof deriveFloor === 'function' ? deriveFloor(r[fi]) : String(r[fi] || '')) : '';
    if (fl === floorName) {
      const p = pi >= 0 ? String(r[pi] || '').trim().toUpperCase() : '';
      if (p === 'FP') fp++;
      if (p === 'QA') qa++;
      if (li >= 0 && r[li]) labelers.add(String(r[li]).trim());
    }
  });
  const total = fp + qa;

  _metiTooltipEl.innerHTML = '<div style="font-weight:700; font-size:13px; color:#ed9a35; margin-bottom:6px; border-bottom:1px solid #334155; padding-bottom:4px; display:flex; justify-content:space-between; align-items:center;">'
    + '<span>🏢 Unit ' + esc(floorName) + '</span>'
    + '<b style="color:#f1f5f9; font-size:11px;">' + total.toLocaleString() + ' tasks</b>'
  + '</div>'
  + '<div style="display:flex; flex-direction:column; gap:4px; font-size:11.5px;">'
    + '<div style="display:flex; justify-content:space-between;">'
      + '<span style="color:#94a3b8;">First Pass (FP):</span>'
      + '<b style="color:#0d9488;">' + fp.toLocaleString() + '</b>'
    + '</div>'
    + '<div style="display:flex; justify-content:space-between;">'
      + '<span style="color:#94a3b8;">Quality Review (QA):</span>'
      + '<b style="color:#14b8a6;">' + qa.toLocaleString() + '</b>'
    + '</div>'
    + '<div style="display:flex; justify-content:space-between;">'
      + '<span style="color:#94a3b8;">Active Contributors:</span>'
      + '<b style="color:#f8fafc;">' + labelers.size + ' labelers</b>'
    + '</div>'
    + '<div style="color:#38bdf8; font-size:10.5px; margin-top:4px; border-top:1px dashed #334155; padding-top:4px;">'
      + '💡 Click unit/floor to toggle filter'
    + '</div>'
  + '</div>';
}

function renderQueueTooltipContent(queueName) {
  if (!_metiTooltipEl) return;
  const rows = typeof rowsInView === 'function' ? rowsInView() : [];
  const qi = findColIndex(['queue name', 'queue_name', 'queue']);
  const mi = findColIndex(['modality']);
  const pi = findColIndex(['pass', 'stage']);
  const ni = findColIndex(['national id', 'nid', 'national_id', 'nationalid']);
  const li = findColIndex(['labeler name', 'labeler_name', 'labeler', 'name']);
  const qci = findColIndex(['qtc name', 'qtc_name', 'qtc']);

  let fpLidar = 0, qaLidar = 0, fpLane = 0, qaLane = 0;
  const labLidar = new Set(), labLane = new Set();
  const qtcLidar = new Set(), qtcLane = new Set();

  rows.forEach(r => {
    if (queueName && qi >= 0) {
      const q = String(r[qi] || '').trim();
      if (q !== queueName) return;
    }
    const rawMod = mi >= 0 ? String(r[mi] || '').toLowerCase() : '';
    const pass = pi >= 0 ? String(r[pi] || '').trim().toUpperCase() : '';
    const isLidar = rawMod.includes('lidar');
    const isLane = rawMod.includes('lane');

    let labId = ni >= 0 ? String(r[ni] || '').trim() : '';
    if (!labId || labId.length < 5) labId = li >= 0 ? String(r[li] || '').trim() : '';
    const qtcName = qci >= 0 ? String(r[qci] || '').trim() : '';

    if (isLidar) {
      if (pass === 'FP') { fpLidar++; if (labId) labLidar.add(labId); }
      if (pass === 'QA') { qaLidar++; if (labId) labLidar.add(labId); }
      if (qtcName) qtcLidar.add(qtcName);
    } else if (isLane) {
      if (pass === 'FP') { fpLane++; if (labId) labLane.add(labId); }
      if (pass === 'QA') { qaLane++; if (labId) labLane.add(labId); }
      if (qtcName) qtcLane.add(qtcName);
    }
  });

  _metiTooltipEl.innerHTML = '<div style="font-weight:700; font-size:12.5px; color:#38bdf8; margin-bottom:8px; border-bottom:1px solid #334155; padding-bottom:5px; word-break:break-all;">'
    + esc(queueName || 'Operational Queue Overview')
  + '</div>'
  + '<div style="display:flex; flex-direction:column; gap:4px; font-size:11.5px;">'
    + '<div style="display:flex; justify-content:space-between; gap:12px;">'
      + '<span style="color:#94a3b8;">📡 Total FP Lidar:</span>'
      + '<b style="color:#10b981; font-weight:700;">' + fpLidar.toLocaleString() + '</b>'
    + '</div>'
    + '<div style="display:flex; justify-content:space-between; gap:12px;">'
      + '<span style="color:#94a3b8;">🔍 QA Lidar:</span>'
      + '<b style="color:#60a5fa; font-weight:700;">' + qaLidar.toLocaleString() + '</b>'
    + '</div>'
    + '<div style="display:flex; justify-content:space-between; gap:12px;">'
      + '<span style="color:#94a3b8;">🛣️ Lane Line FP:</span>'
      + '<b style="color:#34d399; font-weight:700;">' + fpLane.toLocaleString() + '</b>'
    + '</div>'
    + '<div style="display:flex; justify-content:space-between; gap:12px;">'
      + '<span style="color:#94a3b8;">📐 Lane Line QA:</span>'
      + '<b style="color:#a78bfa; font-weight:700;">' + qaLane.toLocaleString() + '</b>'
    + '</div>'
    + '<div style="border-top:1px dashed #334155; margin:4px 0;"></div>'
    + '<div style="display:flex; justify-content:space-between; gap:12px;">'
      + '<span style="color:#94a3b8;">👤 Unique Labelers:</span>'
      + '<b style="color:#f1f5f9;">Lidar: ' + labLidar.size + ' | Lane: ' + labLane.size + '</b>'
    + '</div>'
    + '<div style="display:flex; justify-content:space-between; gap:12px;">'
      + '<span style="color:#94a3b8;">👥 Unique QTC:</span>'
      + '<b style="color:#f1f5f9;">Lidar: ' + qtcLidar.size + ' | Lane: ' + qtcLane.size + '</b>'
    + '</div>'
    + '<div style="color:#38bdf8; font-size:10.5px; margin-top:4px; border-top:1px dashed #334155; padding-top:4px;">'
      + '💡 Click queue to toggle filter'
    + '</div>'
  + '</div>';
}

// Auto-initialize tooltip engine
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGlobalTooltipEngine);
  } else {
    initGlobalTooltipEngine();
  }
}

// ============================================================
// UNIVERSAL INTERACTIVE TABLE SORTER (ALL PAGES & ALL TABLES)
// ============================================================

function sortDOMTable(table, th) {
  if (!table || !th) return;
  const tr = th.closest('tr');
  if (!tr) return;

  const headerCells = Array.from(tr.children);
  const colIndex = headerCells.indexOf(th);
  if (colIndex === -1) return;

  const tbody = table.querySelector('tbody') || table;
  const allRows = Array.from(tbody.querySelectorAll('tr'));
  const dataRows = allRows.filter(r => {
    if (r.querySelector('th')) return false;
    if (r.closest('tfoot')) return false;
    if (r.classList.contains('daily-total-row') || r.classList.contains('total-row') || r.classList.contains('ux-empty')) return false;
    return true;
  });

  if (dataRows.length <= 1) return;

  const currentOrder = th.getAttribute('data-dom-sort');
  let newOrder = 'asc';
  if (currentOrder === 'asc') {
    newOrder = 'desc';
  } else if (currentOrder === 'desc') {
    newOrder = 'asc';
  } else {
    // Detect if column is mostly numeric to default to descending (highest first)
    let numericCount = 0;
    for (let i = 0; i < Math.min(dataRows.length, 5); i++) {
      const cell = dataRows[i].children[colIndex];
      if (cell) {
        const raw = cell.textContent.trim().replace(/[$,%]/g, '').replace(/,/g, '');
        if (raw !== '' && !isNaN(parseFloat(raw)) && isFinite(raw)) numericCount++;
      }
    }
    newOrder = numericCount >= 2 ? 'desc' : 'asc';
  }

  // Update indicators on all headers in the same row
  headerCells.forEach(cell => {
    cell.removeAttribute('data-dom-sort');
    const icon = cell.querySelector('.table-sort-icon');
    if (icon) {
      icon.textContent = '↕';
      icon.classList.remove('active');
      icon.style.opacity = '0.35';
    }
  });

  th.setAttribute('data-dom-sort', newOrder);
  let icon = th.querySelector('.table-sort-icon');
  if (!icon) {
    icon = document.createElement('span');
    icon.className = 'table-sort-icon';
    icon.style.marginLeft = '5px';
    icon.style.fontSize = '10px';
    icon.style.display = 'inline-block';
    th.appendChild(icon);
  }
  icon.textContent = newOrder === 'asc' ? '▲' : '▼';
  icon.classList.add('active');
  icon.style.opacity = '1';
  icon.style.color = 'var(--primary, #0284c7)';

  const getVal = (row) => {
    const cell = row.children[colIndex];
    if (!cell) return { isNum: false, val: '' };
    const attrVal = cell.getAttribute('data-sort-val') || cell.getAttribute('data-val');
    const text = (attrVal !== null ? attrVal : cell.textContent).trim();
    
    // Number check
    const cleanNum = text.replace(/,/g, '').replace(/[%$]/g, '').trim();
    if (cleanNum !== '' && !isNaN(cleanNum) && isFinite(cleanNum)) {
      return { isNum: true, val: parseFloat(cleanNum) };
    }
    // Date check
    const d = Date.parse(text);
    if (!isNaN(d) && text.length >= 8 && (text.includes('/') || text.includes('-'))) {
      return { isNum: true, val: d };
    }
    return { isNum: false, val: text.toLowerCase() };
  };

  dataRows.sort((a, b) => {
    const valA = getVal(a);
    const valB = getVal(b);

    if (valA.isNum && valB.isNum) {
      return newOrder === 'asc' ? valA.val - valB.val : valB.val - valA.val;
    }
    return newOrder === 'asc'
      ? String(valA.val).localeCompare(String(valB.val), undefined, { numeric: true, sensitivity: 'base' })
      : String(valB.val).localeCompare(String(valA.val), undefined, { numeric: true, sensitivity: 'base' });
  });

  const totalRow = tbody.querySelector('.daily-total-row, .total-row, .ux-empty');
  dataRows.forEach(row => {
    if (totalRow) {
      tbody.insertBefore(row, totalRow);
    } else {
      tbody.appendChild(row);
    }
  });
}

function enableUniversalTableSorting() {
  if (typeof document === 'undefined') return;

  // 1. Inject Styles
  if (!document.getElementById('universal-table-sort-css')) {
    const style = document.createElement('style');
    style.id = 'universal-table-sort-css';
    style.textContent = `
      table thead th:not(.no-sort), 
      table tr:first-child th:not(.no-sort),
      th.sortable {
        cursor: pointer !important;
        user-select: none !important;
        transition: background-color 0.15s ease, color 0.15s ease;
      }
      table thead th:not(.no-sort):hover, 
      table tr:first-child th:not(.no-sort):hover,
      th.sortable:hover {
        background-color: var(--accent-light, rgba(2, 132, 199, 0.08)) !important;
        color: var(--primary, #0284c7) !important;
      }
      .table-sort-icon {
        display: inline-block;
        margin-left: 5px;
        font-size: 10px;
        opacity: 0.35;
        vertical-align: middle;
        transition: opacity 0.15s, transform 0.15s, color 0.15s;
      }
      .table-sort-icon.active {
        opacity: 1 !important;
        color: var(--primary, #0284c7) !important;
        font-weight: 800;
      }
    `;
    document.head.appendChild(style);
  }

  // 2. Event delegation on document
  document.addEventListener('click', function(e) {
    const th = e.target.closest('th');
    if (!th) return;

    if (th.classList.contains('no-sort') || th.getAttribute('data-no-sort') === 'true') return;
    const table = th.closest('table');
    if (!table) return;

    // Managed pages that already have dataset re-rendering for th[data-sort]
    const managedPage = th.closest('#uxGmReport, #uxPerformance, #uxPerfLabelers, #uxQueuesAnalysis, #uxQtcFloor');
    if (managedPage && (th.classList.contains('sortable') || th.hasAttribute('data-sort'))) {
      return; // Handled by component state
    }

    // All other tables (Submissions, Overview, Daily Report, Shift Comp, Admin Tables, Modals)
    sortDOMTable(table, th);
  });
}

// Auto-initialize Universal Table Sorter
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enableUniversalTableSorting);
  } else {
    enableUniversalTableSorting();
  }
}

if (typeof window !== 'undefined') {
  window.enableUniversalTableSorting = enableUniversalTableSorting;
  window.sortDOMTable = sortDOMTable;
}
