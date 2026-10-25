function renderShiftComparison(){
  const page = $('uxShiftComparison');
  if(!page || page.hidden) return;

  // Use base dataset from rawRows/fcache, overriding globalUnifiedFilters.shift so all 3 shifts always appear
  const allData = (typeof rawRows !== 'undefined' && rawRows && rawRows.length) ? rawRows : ((window.rawRows && window.rawRows.length) ? window.rawRows : ((typeof fcache !== 'undefined' && fcache) ? fcache : []));
  let baseRows = activeLoc && !activeLoc.startsWith('__') && locColIdx >= 0
    ? allData.filter(r => String(r[locColIdx]||'').trim() === activeLoc)
    : allData;

  const idx = name => hdrs.findIndex(h => h.trim().toLowerCase() === name.toLowerCase());
  const si = idx('shift');
  const fi = hdrs.findIndex(h => ['floor', 'unit'].includes(h.trim().toLowerCase()));
  const qi = idx('qtc name');
  const li = idx('labeler name');
  const ni = idx('national id');
  const mi = idx('modality');
  const pi = idx('pass');
  const oi = idx('object count');
  const qni = idx('queue name');

  // Employee & QTC identity helpers
  const getEmpKey = r => {
    let lid = '';
    if (ni >= 0) {
      const rawNi = String(r[ni] ?? '').trim().replace(/[٠-٩]/g, c => String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0)-1776)).replace(/\.0+$/, '').replace(/[\s-]/g, '');
      if (/^\d{14}$/.test(rawNi)) lid = rawNi;
    }
    if (!lid && li >= 0) {
      const name = String(r[li] ?? '').trim().toLowerCase();
      if (name) lid = 'name:' + name;
    }
    return lid || 'unknown';
  };
  const getQtcKey = r => (qi >= 0 ? String(r[qi] || '').normalize('NFC').trim().replace(/\s+/gu, ' ') : '') || 'unknown';

  // Filter rows for Shift Comparison view (Floor, Date, Modality)
  const filteredRows = baseRows.filter(r => {
    const floor = fi >= 0 ? deriveFloor(r[fi]) : 'Unknown';
    const d = rDate(r);
    if (globalUnifiedFilters.date && d !== globalUnifiedFilters.date) return false;
    if (globalUnifiedFilters.from && d && d < globalUnifiedFilters.from) return false;
    if (globalUnifiedFilters.to && d && d > globalUnifiedFilters.to) return false;
    if (globalUnifiedFilters.floor && fi >= 0 && floor !== globalUnifiedFilters.floor) return false;
    if (globalUnifiedFilters.qtc && qi >= 0 && String(r[qi] || '').trim() !== globalUnifiedFilters.qtc) return false;

    if (shiftCompFilters.floor && floor !== shiftCompFilters.floor) return false;
    if (shiftCompFilters.modality && shiftCompFilters.modality !== 'all') {
      const isLidar = isModPass(r, 'lidar', 'any');
      const isLane = isModPass(r, 'laneline', 'any');
      if (shiftCompFilters.modality === 'lidar' && !isLidar) return false;
      if (shiftCompFilters.modality === 'laneline' && !isLane) return false;
    }
    return true;
  });

  const distinctFloors = [...new Set(baseRows.map(r => fi >= 0 ? deriveFloor(r[fi]) : '').filter(Boolean))].sort();

  // The 3 canonical operational shifts
  const mainShifts = ['Morning', 'Night', 'Over Night'];

  // Calculate 3-Shift Aggregations for the Permanent Main Matrix (Section 8.1 & 8.2)
  const shiftMatrixData = {};
  let all3ShiftsTotal = 0;

  mainShifts.forEach(sh => {
    const sRows = filteredRows.filter(r => si >= 0 && normalizeShift(r[si]) === sh);
    all3ShiftsTotal += sRows.length;

    // Lidar FP
    const rLFP = sRows.filter(r => isModPass(r, 'lidar', 'FP'));
    // Lidar QA
    const rLQA = sRows.filter(r => isModPass(r, 'lidar', 'QA'));
    // Lane Line FP
    const rLNFP = sRows.filter(r => isModPass(r, 'laneline', 'FP'));
    // Lane Line QA
    const rLNQA = sRows.filter(r => isModPass(r, 'laneline', 'QA'));

    const sLabelers = new Set(sRows.map(getEmpKey)).size;
    const sQtcs = new Set(sRows.map(getQtcKey)).size;
    const sObjects = sRows.reduce((acc, r) => acc + (parseFloat(oi >= 0 ? r[oi] : 0) || 0), 0);
    const sQueues = new Set(sRows.map(r => qni >= 0 ? String(r[qni]||'').trim() : '').filter(Boolean)).size;
    const sUnits = new Set(sRows.map(r => fi >= 0 ? deriveFloor(r[fi]) : '').filter(Boolean)).size;
    const sDates = new Set(sRows.map(r => rDate(r)).filter(Boolean)).size;

    shiftMatrixData[sh] = {
      shift: sh,
      total: sRows.length,
      lidarFP: { tasks: rLFP.length, labelers: new Set(rLFP.map(getEmpKey)).size, qtcs: new Set(rLFP.map(getQtcKey)).size },
      lidarQA: { tasks: rLQA.length, labelers: new Set(rLQA.map(getEmpKey)).size, qtcs: new Set(rLQA.map(getQtcKey)).size },
      laneFP: { tasks: rLNFP.length, labelers: new Set(rLNFP.map(getEmpKey)).size, qtcs: new Set(rLNFP.map(getQtcKey)).size },
      laneQA: { tasks: rLNQA.length, labelers: new Set(rLNQA.map(getEmpKey)).size, qtcs: new Set(rLNQA.map(getQtcKey)).size },
      labelers: sLabelers,
      qtcs: sQtcs,
      avgPerLabeler: sLabelers > 0 ? (sRows.length / sLabelers).toFixed(1) : '0',
      totalObjects: sObjects,
      avgObjects: sRows.length > 0 ? (sObjects / sRows.length).toFixed(1) : '0',
      queues: sQueues,
      units: sUnits,
      activeDays: sDates,
      avgDaily: sDates > 0 ? Math.round(sRows.length / sDates) : 0
    };
  });

  const activeSubTab = shiftCompFilters.subTab || 'floor';
  const totalSubmissions = filteredRows.length;

  // TAB 1: Floor (= Unit) Matrix
  const floorMatrix = [];
  distinctFloors.forEach(fl => {
    const flRows = filteredRows.filter(r => fi >= 0 && deriveFloor(r[fi]) === fl);
    const flTotal = flRows.length;
    const flLabelers = uniq(flRows, 'Labeler Name') || 0;
    const flQtcs = uniq(flRows, 'Qtc Name') || 0;
    const perShift = {};
    mainShifts.forEach(sh => {
      const cellRows = flRows.filter(r => si >= 0 && normalizeShift(r[si]) === sh);
      perShift[sh] = {
        total: cellRows.length,
        labelers: uniq(cellRows, 'Labeler Name') || 0,
        qtcs: uniq(cellRows, 'Qtc Name') || 0
      };
    });
    floorMatrix.push({
      floor: fl,
      total: flTotal,
      labelers: flLabelers,
      qtcs: flQtcs,
      perShift
    });
  });
  floorMatrix.sort((a,b) => b.total - a.total);

  // TAB 2: Queue x Shift Comparison (Section 8.4)
  const queueMap = new Map();
  filteredRows.forEach(r => {
    const qn = qni >= 0 ? String(r[qni] || '').trim() : '';
    if (!qn) return;
    const sh = normalizeShift(si >= 0 ? r[si] : '');
    if (!queueMap.has(qn)) {
      queueMap.set(qn, {
        name: qn,
        total: 0,
        totalObjects: 0,
        morning: 0,
        night: 0,
        on: 0,
        lFP: 0,
        lQA: 0,
        lnFP: 0,
        lnQA: 0,
        labSet: new Set(),
        qtcSet: new Set()
      });
    }
    const item = queueMap.get(qn);
    item.total++;
    const objCnt = parseFloat(oi >= 0 ? r[oi] : 0) || 0;
    item.totalObjects += objCnt;

    if (sh === 'Morning') item.morning++;
    else if (sh === 'Night') item.night++;
    else if (sh === 'Over Night') item.on++;

    if (isModPass(r, 'lidar', 'FP')) item.lFP++;
    if (isModPass(r, 'lidar', 'QA')) item.lQA++;
    if (isModPass(r, 'laneline', 'FP')) item.lnFP++;
    if (isModPass(r, 'laneline', 'QA')) item.lnQA++;

    const lab = getEmpKey(r);
    if (lab) item.labSet.add(lab);
    const qtc = getQtcKey(r);
    if (qtc) item.qtcSet.add(qtc);
  });
  const queueRows = [...queueMap.values()].map(q => ({
    ...q,
    uniqueLabelers: q.labSet.size,
    uniqueQtcs: q.qtcSet.size,
    avgSubmit: q.labSet.size > 0 ? (q.total / q.labSet.size).toFixed(1) : '0'
  })).sort((a,b) => b.total - a.total);

  // TAB 3: QTC Supervisor Breakdown (Grouped by QTC + Shift + Unit) (Section 8.5)
  const qtcMap = new Map();
  filteredRows.forEach(r => {
    const qtc = qi >= 0 ? String(r[qi] || '').normalize('NFC').trim().replace(/\s+/gu, ' ') : '';
    if (!qtc) return;
    const sh = normalizeShift(si >= 0 ? r[si] : 'Unknown');
    const fl = fi >= 0 ? deriveFloor(r[fi]) : 'Unknown';
    const key = qtc + '__' + sh + '__' + fl;
    if (!qtcMap.has(key)) {
      qtcMap.set(key, {
        qtc,
        shift: sh,
        floor: fl,
        total: 0,
        totalObjects: 0,
        lFP: 0,
        lQA: 0,
        lnFP: 0,
        lnQA: 0,
        labSet: new Set(),
        queueSet: new Set()
      });
    }
    const item = qtcMap.get(key);
    item.total++;
    const objCnt = parseFloat(oi >= 0 ? r[oi] : 0) || 0;
    item.totalObjects += objCnt;

    if (isModPass(r, 'lidar', 'FP')) item.lFP++;
    if (isModPass(r, 'lidar', 'QA')) item.lQA++;
    if (isModPass(r, 'laneline', 'FP')) item.lnFP++;
    if (isModPass(r, 'laneline', 'QA')) item.lnQA++;

    const lab = getEmpKey(r);
    if (lab) item.labSet.add(lab);
    const qn = qni >= 0 ? String(r[qni] || '').trim() : '';
    if (qn) item.queueSet.add(qn);
  });
  const qtcRows = [...qtcMap.values()].map(item => ({
    ...item,
    teamSize: item.labSet.size,
    queuesCovered: item.queueSet.size,
    avgSubmit: item.labSet.size > 0 ? (item.total / item.labSet.size).toFixed(1) : '0'
  })).sort((a,b) => b.total - a.total);

  // TAB 4: Labelers Breakdown (Section 8.6 - Full pagination, no 100 limit)
  const labMap = new Map();
  filteredRows.forEach(r => {
    const rawName = li >= 0 ? String(r[li] || '').trim() : '';
    if (!rawName) return;
    const rawId = ni >= 0 ? String(r[ni] || '').trim() : '';
    const sh = normalizeShift(si >= 0 ? r[si] : 'Unknown');
    const fl = fi >= 0 ? deriveFloor(r[fi]) : 'Unknown';
    const qtc = qi >= 0 ? String(r[qi] || '').trim() : 'Unknown';
    const d = rDate(r);
    const key = rawName.toLowerCase() + '__' + sh + '__' + fl;
    if (!labMap.has(key)) {
      labMap.set(key, {
        name: rawName,
        rawId,
        maskedId: maskEmployeeId(rawId, rawName),
        shift: sh,
        floor: fl,
        qtc,
        total: 0,
        totalObjects: 0,
        lFP: 0,
        lQA: 0,
        lnFP: 0,
        lnQA: 0,
        dates: new Set()
      });
    }
    const item = labMap.get(key);
    item.total++;
    const objCnt = parseFloat(oi >= 0 ? r[oi] : 0) || 0;
    item.totalObjects += objCnt;

    if (isModPass(r, 'lidar', 'FP')) item.lFP++;
    if (isModPass(r, 'lidar', 'QA')) item.lQA++;
    if (isModPass(r, 'laneline', 'FP')) item.lnFP++;
    if (isModPass(r, 'laneline', 'QA')) item.lnQA++;
    if (d) item.dates.add(d);
  });
  const allLabelerRows = [...labMap.values()].map(l => ({
    ...l,
    activeDays: Math.max(1, l.dates.size),
    avgPerDay: (l.total / Math.max(1, l.dates.size)).toFixed(1)
  })).sort((a,b) => b.total - a.total);

  // Pagination for Labelers Table
  const labPageSize = 25;
  const labTotalPages = Math.max(1, Math.ceil(allLabelerRows.length / labPageSize));
  shiftCompFilters.labPage = Math.min(shiftCompFilters.labPage || 0, labTotalPages - 1);
  const visibleLabelerRows = allLabelerRows.slice(shiftCompFilters.labPage * labPageSize, (shiftCompFilters.labPage + 1) * labPageSize);

  // TAB 5: Daily Shift Trends chart data
  const shiftDailyMap = { Morning: new Map(), Night: new Map(), 'Over Night': new Map() };
  filteredRows.forEach(r => {
    const d = rDate(r);
    const sh = normalizeShift(si >= 0 ? r[si] : '');
    if (d && shiftDailyMap[sh]) {
      shiftDailyMap[sh].set(d, (shiftDailyMap[sh].get(d) || 0) + 1);
    }
  });
  const allChartDates = [...new Set(filteredRows.map(r => rDate(r)).filter(Boolean))].sort();

  // Smart Insights (Section 8.9)
  const shiftLeader = mainShifts.map(s => shiftMatrixData[s]).sort((a,b) => b.total - a.total)[0] || { shift: '—', total: 0 };
  const prodLeader = mainShifts.map(s => shiftMatrixData[s]).sort((a,b) => Number(b.avgPerLabeler) - Number(a.avgPerLabeler))[0] || { shift: '—', avgPerLabeler: 0 };
  const lidarLeader = mainShifts.map(s => shiftMatrixData[s]).sort((a,b) => (b.lidarFP.tasks + b.lidarQA.tasks) - (a.lidarFP.tasks + a.lidarQA.tasks))[0] || { shift: '—' };
  const laneLeader = mainShifts.map(s => shiftMatrixData[s]).sort((a,b) => (b.laneFP.tasks + b.laneQA.tasks) - (a.laneFP.tasks + a.laneQA.tasks))[0] || { shift: '—' };

  page.innerHTML = `
    <div class="ux-overview">
      <div class="ux-heading">
        <div>
          <div class="ux-eyebrow">Workforce &amp; Facility Shift Diagnostics</div>
          <h2>⚖️ Detailed Shift Comparison</h2>
          <p>Side-by-side comparison across Morning, Night, and Over Night by Workstreams, Stages, Facility Floors (= Units), Queues, and Workforce.</p>
        </div>
        ${renderHeaderControlsHTML('sc')}
      </div>

      ${renderUniversalFilterBar('shift_comparison')}

      <!-- 8.1 MAIN THREE-SHIFT COMPARISON MATRIX (Permanent Side-by-Side Table) -->
      <div class="ux-panel" style="margin-bottom: 24px; padding: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 12px;">
        <div style="padding: 16px 20px; background: var(--bg-2); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <h3 style="margin: 0; font-size: 16px; color: var(--text);">⏱️ Main Three-Shift Comparison Matrix</h3>
            <p style="margin: 2px 0 0; font-size: 12px; color: var(--text-soft);">Permanent side-by-side view across Morning, Night, and Over Night (Floor = Unit).</p>
          </div>
          <span class="q-badge" style="background: var(--primary); color: #fff; font-weight: 700;">Side-by-Side 3 Shifts</span>
        </div>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
            <thead>
              <tr style="background: var(--bg-3); border-bottom: 2px solid var(--border);">
                <th style="padding: 12px 18px; width: 34%; font-size: 13px;">Metric / Operational Stage</th>
                <th style="padding: 12px 16px; text-align: center; width: 22%; font-size: 13px; color: #0d9488;">🌅 Morning</th>
                <th style="padding: 12px 16px; text-align: center; width: 22%; font-size: 13px; color: #ed9a35;">🌙 Night</th>
                <th style="padding: 12px 16px; text-align: center; width: 22%; font-size: 13px; color: #3b82f6;">🌌 Over Night</th>
              </tr>
            </thead>
            <tbody>
              <!-- GROUP 1: LIDAR FP -->
              <tr style="background: rgba(13,148,136,0.06); font-weight: 700; border-top: 1px solid var(--border);">
                <td colspan="4" style="padding: 8px 18px; color: #0d9488; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">📡 1. Lidar First Pass (FP)</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 8px 18px 8px 30px;">Total Submissions</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700; color: #0d9488;">${shiftMatrixData.Morning.lidarFP.tasks.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700; color: #ed9a35;">${shiftMatrixData.Night.lidarFP.tasks.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700; color: #3b82f6;">${shiftMatrixData['Over Night'].lidarFP.tasks.toLocaleString()}</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 8px 18px 8px 30px;">Unique Labelers</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Morning.lidarFP.labelers.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Night.lidarFP.labelers.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData['Over Night'].lidarFP.labelers.toLocaleString()}</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 8px 18px 8px 30px;">Unique QTCs</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Morning.lidarFP.qtcs.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Night.lidarFP.qtcs.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData['Over Night'].lidarFP.qtcs.toLocaleString()}</td>
              </tr>

              <!-- GROUP 2: LIDAR QA -->
              <tr style="background: rgba(20,184,166,0.06); font-weight: 700;">
                <td colspan="4" style="padding: 8px 18px; color: #14b8a6; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">🔍 2. Lidar Quality Assurance (QA)</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 8px 18px 8px 30px;">Total Submissions</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700; color: #0d9488;">${shiftMatrixData.Morning.lidarQA.tasks.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700; color: #ed9a35;">${shiftMatrixData.Night.lidarQA.tasks.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700; color: #3b82f6;">${shiftMatrixData['Over Night'].lidarQA.tasks.toLocaleString()}</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 8px 18px 8px 30px;">Unique Labelers</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Morning.lidarQA.labelers.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Night.lidarQA.labelers.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData['Over Night'].lidarQA.labelers.toLocaleString()}</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 8px 18px 8px 30px;">Unique QTCs</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Morning.lidarQA.qtcs.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Night.lidarQA.qtcs.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData['Over Night'].lidarQA.qtcs.toLocaleString()}</td>
              </tr>

              <!-- GROUP 3: LANE LINE FP -->
              <tr style="background: rgba(237,154,53,0.06); font-weight: 700;">
                <td colspan="4" style="padding: 8px 18px; color: #ed9a35; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">🛣️ 3. Lane Line First Pass (FP)</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 8px 18px 8px 30px;">Total Submissions</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700; color: #0d9488;">${shiftMatrixData.Morning.laneFP.tasks.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700; color: #ed9a35;">${shiftMatrixData.Night.laneFP.tasks.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700; color: #3b82f6;">${shiftMatrixData['Over Night'].laneFP.tasks.toLocaleString()}</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 8px 18px 8px 30px;">Unique Labelers</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Morning.laneFP.labelers.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Night.laneFP.labelers.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData['Over Night'].laneFP.labelers.toLocaleString()}</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 8px 18px 8px 30px;">Unique QTCs</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Morning.laneFP.qtcs.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Night.laneFP.qtcs.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData['Over Night'].laneFP.qtcs.toLocaleString()}</td>
              </tr>

              <!-- GROUP 4: LANE LINE QA -->
              <tr style="background: rgba(236,72,153,0.06); font-weight: 700;">
                <td colspan="4" style="padding: 8px 18px; color: #ec4899; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">✅ 4. Lane Line Quality Assurance (QA)</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 8px 18px 8px 30px;">Total Submissions</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700; color: #0d9488;">${shiftMatrixData.Morning.laneQA.tasks.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700; color: #ed9a35;">${shiftMatrixData.Night.laneQA.tasks.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700; color: #3b82f6;">${shiftMatrixData['Over Night'].laneQA.tasks.toLocaleString()}</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 8px 18px 8px 30px;">Unique Labelers</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Morning.laneQA.labelers.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Night.laneQA.labelers.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData['Over Night'].laneQA.labelers.toLocaleString()}</td>
              </tr>
              <tr style="border-bottom: 2px solid var(--border);">
                <td style="padding: 8px 18px 8px 30px;">Unique QTCs</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Morning.laneQA.qtcs.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Night.laneQA.qtcs.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData['Over Night'].laneQA.qtcs.toLocaleString()}</td>
              </tr>

              <!-- GROUP 5: OVERALL SHIFT SUMMARY ROWS (Section 8.2) -->
              <tr style="background: var(--bg-2); font-weight: 800;">
                <td colspan="4" style="padding: 10px 18px; color: var(--text); font-size: 12px; text-transform: uppercase;">📊 Overall Shift Diagnostics &amp; Capacity</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border-light); background: var(--bg-1);">
                <td style="padding: 9px 18px 9px 30px; font-weight: 700;">Total Shift Submissions</td>
                <td style="padding: 9px 16px; text-align: center; font-weight: 800; color: #0d9488; font-size: 13px;">${shiftMatrixData.Morning.total.toLocaleString()}</td>
                <td style="padding: 9px 16px; text-align: center; font-weight: 800; color: #ed9a35; font-size: 13px;">${shiftMatrixData.Night.total.toLocaleString()}</td>
                <td style="padding: 9px 16px; text-align: center; font-weight: 800; color: #3b82f6; font-size: 13px;">${shiftMatrixData['Over Night'].total.toLocaleString()}</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 8px 18px 8px 30px;">Shift Share % of Output</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700;">${(all3ShiftsTotal > 0 ? ((shiftMatrixData.Morning.total / all3ShiftsTotal)*100).toFixed(1) : 0)}%</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700;">${(all3ShiftsTotal > 0 ? ((shiftMatrixData.Night.total / all3ShiftsTotal)*100).toFixed(1) : 0)}%</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700;">${(all3ShiftsTotal > 0 ? ((shiftMatrixData['Over Night'].total / all3ShiftsTotal)*100).toFixed(1) : 0)}%</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 8px 18px 8px 30px;">Total Unique Labelers (Counted Once)</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700;">${shiftMatrixData.Morning.labelers.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700;">${shiftMatrixData.Night.labelers.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700;">${shiftMatrixData['Over Night'].labelers.toLocaleString()}</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 8px 18px 8px 30px;">Total Unique QTCs (Counted Once)</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700;">${shiftMatrixData.Morning.qtcs.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700;">${shiftMatrixData.Night.qtcs.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700;">${shiftMatrixData['Over Night'].qtcs.toLocaleString()}</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 8px 18px 8px 30px;">Avg Submissions / Labeler</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700; color: var(--primary);">${shiftMatrixData.Morning.avgPerLabeler}</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700; color: var(--primary);">${shiftMatrixData.Night.avgPerLabeler}</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700; color: var(--primary);">${shiftMatrixData['Over Night'].avgPerLabeler}</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 8px 18px 8px 30px;">Total Annotated Objects</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700; color: #0284c7;">${shiftMatrixData.Morning.totalObjects.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700; color: #0284c7;">${shiftMatrixData.Night.totalObjects.toLocaleString()}</td>
                <td style="padding: 8px 16px; text-align: center; font-weight: 700; color: #0284c7;">${shiftMatrixData['Over Night'].totalObjects.toLocaleString()}</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 8px 18px 8px 30px;">Avg Objects / Task</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Morning.avgObjects}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Night.avgObjects}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData['Over Night'].avgObjects}</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 8px 18px 8px 30px;">Active Queues</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Morning.queues}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Night.queues}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData['Over Night'].queues}</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border-light);">
                <td style="padding: 8px 18px 8px 30px;">Active Floors / Units</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Morning.units}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Night.units}</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData['Over Night'].units}</td>
              </tr>
              <tr>
                <td style="padding: 8px 18px 8px 30px;">Avg Daily Submissions</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Morning.avgDaily.toLocaleString()} / day</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData.Night.avgDaily.toLocaleString()} / day</td>
                <td style="padding: 8px 16px; text-align: center;">${shiftMatrixData['Over Night'].avgDaily.toLocaleString()} / day</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Navigation Sub-Tabs & Filter Bar (Preserving All Sub-Tabs) -->
      <div class="ux-panel" style="padding: 14px 18px; margin-bottom: 18px;">
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px;">
          <!-- 6 Sub-Tabs -->
          <div style="display: flex; gap: 6px; flex-wrap: wrap; background: var(--bg-2); padding: 4px; border-radius: 10px; border: 1px solid var(--border);">
            <button class="btn ${activeSubTab === 'floor' ? 'btn-c' : ''}" id="scTabFloor" style="padding: 6px 12px; font-size: 12px; font-weight: 600;">🏢 Floor (= Unit) Matrix</button>
            <button class="btn ${activeSubTab === 'queue' ? 'btn-c' : ''}" id="scTabQueue" style="padding: 6px 12px; font-size: 12px; font-weight: 600;">🗂️ Queue Breakdown</button>
            <button class="btn ${activeSubTab === 'qtc' ? 'btn-c' : ''}" id="scTabQtc" style="padding: 6px 12px; font-size: 12px; font-weight: 600;">👥 QTC Supervisors</button>
            <button class="btn ${activeSubTab === 'labelers' ? 'btn-c' : ''}" id="scTabLabelers" style="padding: 6px 12px; font-size: 12px; font-weight: 600;">👤 Labelers Breakdown</button>
            <button class="btn ${activeSubTab === 'chart' ? 'btn-c' : ''}" id="scTabChart" style="padding: 6px 12px; font-size: 12px; font-weight: 600;">📊 Daily Trends Chart</button>
            <button class="btn ${activeSubTab === 'fair' ? 'btn-c' : ''}" id="scTabFair" style="padding: 6px 12px; font-size: 12px; font-weight: 600;">⚖️ Fair Benchmarking</button>
          </div>
          <!-- Quick filters & export -->
          <div style="display: flex; gap: 8px; align-items: center;">
            <select id="scFloorSelect" style="padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-3); color: var(--text); font-size: 12px;">
              <option value="">All Floors (Units)</option>
              ${distinctFloors.map(f => `<option value="${esc(f)}" ${shiftCompFilters.floor === f ? 'selected' : ''}>Unit ${esc(f)}</option>`).join('')}
            </select>
            <button class="btn btn-c" id="scExportBtn" style="padding: 7px 14px; font-size: 12px; font-weight: 600;">↓ Export CSV</button>
          </div>
        </div>
      </div>

      <!-- SUB-TAB CONTENT -->
      ${activeSubTab === 'floor' ? `
        <!-- SUB-TAB 1: Floor Comparison Matrix (Floor = Unit) -->
        <div class="ux-panel" style="padding: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 12px;">
          <div style="padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin:0;">🏢 Floor (= Unit) Production by Shift</h3>
            <span class="ux-note">Comparison across operational units and shifts (Floor = Unit)</span>
          </div>
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
              <thead>
                <tr style="background: var(--bg-2); border-bottom: 1px solid var(--border);">
                  <th style="padding: 10px 14px;">Floor / Unit</th>
                  ${mainShifts.map(sh => `<th style="padding: 10px 12px; text-align: center;">${esc(sh)} Tasks</th><th style="padding: 10px 12px; text-align: center; color: var(--text-soft); font-size: 11px;">Labelers</th>`).join('')}
                  <th style="padding: 10px 14px; text-align: center;">Total Submits</th>
                  <th style="padding: 10px 14px; text-align: center;">Floor Share %</th>
                </tr>
              </thead>
              <tbody>
                ${floorMatrix.map(item => {
                  const pct = totalSubmissions > 0 ? ((item.total / totalSubmissions) * 100).toFixed(1) : 0;
                  return `
                    <tr style="border-bottom: 1px solid var(--border);" onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background='transparent'">
                      <td style="padding: 10px 14px; font-weight: 700; color: var(--accent);"><span style="display:flex; align-items:center; gap:6px;">🏢 Unit ${esc(item.floor)}</span></td>
                      ${mainShifts.map(sh => {
                        const cell = item.perShift[sh] || { total: 0, labelers: 0 };
                        return `
                          <td style="padding: 10px 12px; text-align: center; font-weight: 700; ${cell.total > 0 ? 'color: var(--primary);' : 'color: var(--muted);'}">${cell.total.toLocaleString()}</td>
                          <td style="padding: 10px 12px; text-align: center; color: var(--text-soft); font-size: 11px;">${cell.labelers}</td>
                        `;
                      }).join('')}
                      <td style="padding: 10px 14px; text-align: center; font-weight: 800; color: var(--text);">${item.total.toLocaleString()}</td>
                      <td style="padding: 10px 14px; text-align: center;">
                        <div style="display:flex; align-items:center; justify-content:center; gap:6px;">
                          <div style="width: 50px; height: 6px; border-radius: 3px; background: var(--border); overflow:hidden;">
                            <div style="width:${pct}%; height:100%; background: var(--primary);"></div>
                          </div>
                          <b>${pct}%</b>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            ${!floorMatrix.length ? '<div class="ux-empty" style="padding: 24px; text-align:center;">No floor records found.</div>' : ''}
          </div>
        </div>
      ` : activeSubTab === 'queue' ? `
        <!-- SUB-TAB 2: Queue x Shift Breakdown (Section 8.4) -->
        <div class="ux-panel" style="padding: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 12px;">
          <div style="padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin:0;">🗂️ Queue Production by Shift (${queueRows.length} Queues)</h3>
            <span class="ux-note">Throughput across shifts for each operational queue</span>
          </div>
          <div style="overflow-x: auto; max-height: 60vh;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
              <thead>
                <tr style="background: var(--bg-2); border-bottom: 1px solid var(--border); position: sticky; top:0; z-index:1;">
                  <th style="padding: 10px 14px;">Queue Name</th>
                  <th style="padding: 10px 12px; text-align: center; color:#0d9488;">Morning</th>
                  <th style="padding: 10px 12px; text-align: center; color:#ed9a35;">Night</th>
                  <th style="padding: 10px 12px; text-align: center; color:#3b82f6;">Over Night</th>
                  <th style="padding: 10px 12px; text-align: center;">Lidar FP</th>
                  <th style="padding: 10px 12px; text-align: center;">Lidar QA</th>
                  <th style="padding: 10px 12px; text-align: center;">Lane FP</th>
                  <th style="padding: 10px 12px; text-align: center;">Lane QA</th>
                  <th style="padding: 10px 14px; text-align: center; font-weight:800;">Total Submits</th>
                  <th style="padding: 10px 12px; text-align: center; color:#0284c7;">Total Objects</th>
                  <th style="padding: 10px 12px; text-align: center;">Labelers</th>
                </tr>
              </thead>
              <tbody>
                ${queueRows.map(q => `
                  <tr style="border-bottom: 1px solid var(--border);" onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background='transparent'">
                    <td style="padding: 9px 14px; font-weight: 700; color: var(--primary);">🗂️ ${esc(q.name)}</td>
                    <td style="padding: 9px 12px; text-align: center; font-weight: 700; color:#0d9488;">${q.morning.toLocaleString()}</td>
                    <td style="padding: 9px 12px; text-align: center; font-weight: 700; color:#ed9a35;">${q.night.toLocaleString()}</td>
                    <td style="padding: 9px 12px; text-align: center; font-weight: 700; color:#3b82f6;">${q.on.toLocaleString()}</td>
                    <td style="padding: 9px 12px; text-align: center;">${q.lFP.toLocaleString()}</td>
                    <td style="padding: 9px 12px; text-align: center;">${q.lQA.toLocaleString()}</td>
                    <td style="padding: 9px 12px; text-align: center;">${q.lnFP.toLocaleString()}</td>
                    <td style="padding: 9px 12px; text-align: center;">${q.lnQA.toLocaleString()}</td>
                    <td style="padding: 9px 14px; text-align: center; font-weight: 800; color: var(--text);">${q.total.toLocaleString()}</td>
                    <td style="padding: 9px 12px; text-align: center; font-weight: 700; color: #0284c7;">${q.totalObjects.toLocaleString()}</td>
                    <td style="padding: 9px 12px; text-align: center;">${q.uniqueLabelers}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : activeSubTab === 'qtc' ? `
        <!-- SUB-TAB 3: QTC Supervisors Comparison (Grouped by QTC + Shift + Unit) -->
        <div class="ux-panel" style="padding: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 12px;">
          <div style="padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin:0;">👥 QTC Supervisor Performance Across Shifts &amp; Units</h3>
            <span class="ux-note">Grouping: QTC + Shift + Unit</span>
          </div>
          <div style="overflow-x: auto; max-height: 60vh;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
              <thead>
                <tr style="background: var(--bg-2); border-bottom: 1px solid var(--border); position: sticky; top:0; z-index:1;">
                  <th style="padding: 10px 14px;">QTC Supervisor</th>
                  <th style="padding: 10px 12px;">Shift</th>
                  <th style="padding: 10px 12px;">Floor (Unit)</th>
                  <th style="padding: 10px 12px; text-align: center;">Team Size</th>
                  <th style="padding: 10px 12px; text-align: center;">Queues Covered</th>
                  <th style="padding: 10px 12px; text-align: center; color:#0d9488;">Lidar FP</th>
                  <th style="padding: 10px 12px; text-align: center; color:#14b8a6;">Lidar QA</th>
                  <th style="padding: 10px 12px; text-align: center; color:#ed9a35;">Lane FP</th>
                  <th style="padding: 10px 12px; text-align: center; color:#ec4899;">Lane QA</th>
                  <th style="padding: 10px 14px; text-align: center; font-weight:800;">Total Submits</th>
                  <th style="padding: 10px 12px; text-align: center; color:#0284c7;">Total Objects</th>
                  <th style="padding: 10px 12px; text-align: center;">Avg / Labeler</th>
                </tr>
              </thead>
              <tbody>
                ${qtcRows.map(item => `
                  <tr style="border-bottom: 1px solid var(--border);" onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background='transparent'">
                    <td style="padding: 9px 14px; font-weight: 700; color: var(--primary);">👤 ${esc(item.qtc)}</td>
                    <td style="padding: 9px 12px;"><span class="q-badge" style="background:var(--bg-3);">${esc(item.shift)}</span></td>
                    <td style="padding: 9px 12px; font-weight:600; color:var(--accent);">🏢 Unit ${esc(item.floor)}</td>
                    <td style="padding: 9px 12px; text-align: center; font-weight: 600;">${item.teamSize}</td>
                    <td style="padding: 9px 12px; text-align: center;"><span class="ux-note">${item.queuesCovered} queues</span></td>
                    <td style="padding: 9px 12px; text-align: center; color:#0d9488;">${item.lFP.toLocaleString()}</td>
                    <td style="padding: 9px 12px; text-align: center; color:#14b8a6;">${item.lQA.toLocaleString()}</td>
                    <td style="padding: 9px 12px; text-align: center; color:#ed9a35;">${item.lnFP.toLocaleString()}</td>
                    <td style="padding: 9px 12px; text-align: center; color:#ec4899;">${item.lnQA.toLocaleString()}</td>
                    <td style="padding: 9px 14px; text-align: center; font-weight: 800; color: var(--text);">${item.total.toLocaleString()}</td>
                    <td style="padding: 9px 12px; text-align: center; font-weight: 700; color: #0284c7;">${item.totalObjects.toLocaleString()}</td>
                    <td style="padding: 9px 12px; text-align: center; font-weight: 600; color: var(--primary);">${item.avgSubmit}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : activeSubTab === 'labelers' ? `
        <!-- SUB-TAB 4: Labelers Breakdown (Section 8.6 - Full pagination, no 100 limit) -->
        <div class="ux-panel" style="padding: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 12px;">
          <div style="padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap:wrap; gap:8px;">
            <div>
              <h3 style="margin:0;">👤 Labelers Performance by Shift (${allLabelerRows.length} Labeler-Shift records)</h3>
              <p style="margin:2px 0 0; font-size:11px; color:var(--text-soft);">Complete paginated directory. National IDs masked for privacy.</p>
            </div>
            <span class="ux-note">Showing ${(visibleLabelerRows.length ? (shiftCompFilters.labPage*labPageSize+1) : 0)} – ${Math.min((shiftCompFilters.labPage+1)*labPageSize, allLabelerRows.length)} of ${allLabelerRows.length} records</span>
          </div>
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
              <thead>
                <tr style="background: var(--bg-2); border-bottom: 1px solid var(--border);">
                  <th style="padding: 10px 14px;">Labeler Name</th>
                  <th style="padding: 10px 12px;">Masked ID</th>
                  <th style="padding: 10px 12px;">Shift</th>
                  <th style="padding: 10px 12px;">Floor (Unit)</th>
                  <th style="padding: 10px 12px;">QTC Supervisor</th>
                  <th style="padding: 10px 12px; text-align: center; color:#0d9488;">Lidar FP</th>
                  <th style="padding: 10px 12px; text-align: center; color:#14b8a6;">Lidar QA</th>
                  <th style="padding: 10px 12px; text-align: center; color:#ed9a35;">Lane FP</th>
                  <th style="padding: 10px 12px; text-align: center; color:#ec4899;">Lane QA</th>
                  <th style="padding: 10px 14px; text-align: center; font-weight:800;">Total Tasks</th>
                  <th style="padding: 10px 12px; text-align: center; color:#0284c7;">Objects</th>
                  <th style="padding: 10px 12px; text-align: center;">Active Days</th>
                  <th style="padding: 10px 12px; text-align: center;">Avg / Day</th>
                </tr>
              </thead>
              <tbody>
                ${visibleLabelerRows.map(l => `
                  <tr style="border-bottom: 1px solid var(--border);" onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background='transparent'">
                    <td style="padding: 9px 14px; font-weight: 700; color: var(--primary);">${esc(l.name)}</td>
                    <td style="padding: 9px 12px;"><span class="ux-note" style="font-family:monospace; font-size:11px;">${esc(l.maskedId)}</span></td>
                    <td style="padding: 9px 12px;"><span class="q-badge" style="background:var(--bg-3);">${esc(l.shift)}</span></td>
                    <td style="padding: 9px 12px; font-weight:600; color:var(--accent);">Unit ${esc(l.floor)}</td>
                    <td style="padding: 9px 12px;">${esc(l.qtc)}</td>
                    <td style="padding: 9px 12px; text-align: center; color:#0d9488;">${l.lFP.toLocaleString()}</td>
                    <td style="padding: 9px 12px; text-align: center; color:#14b8a6;">${l.lQA.toLocaleString()}</td>
                    <td style="padding: 9px 12px; text-align: center; color:#ed9a35;">${l.lnFP.toLocaleString()}</td>
                    <td style="padding: 9px 12px; text-align: center; color:#ec4899;">${l.lnQA.toLocaleString()}</td>
                    <td style="padding: 9px 14px; text-align: center; font-weight: 800; color: var(--text);">${l.total.toLocaleString()}</td>
                    <td style="padding: 9px 12px; text-align: center; font-weight: 700; color: #0284c7;">${l.totalObjects.toLocaleString()}</td>
                    <td style="padding: 9px 12px; text-align: center;">${l.activeDays}</td>
                    <td style="padding: 9px 12px; text-align: center; font-weight: 600;">${l.avgPerDay}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div class="perf-pagination" style="display:flex; justify-content:space-between; align-items:center; padding:12px 18px; border-top:1px solid var(--border);">
            <button class="btn" id="scLabPrev" ${shiftCompFilters.labPage === 0 ? 'disabled' : ''}>Previous</button>
            <span class="ux-note">Page ${shiftCompFilters.labPage + 1} of ${labTotalPages}</span>
            <button class="btn" id="scLabNext" ${shiftCompFilters.labPage >= labTotalPages - 1 ? 'disabled' : ''}>Next</button>
          </div>
        </div>
      ` : activeSubTab === 'chart' ? `
        <!-- SUB-TAB 5: Daily Shift Trends Chart (Section 8.7) -->
        <div class="ux-panel" style="padding: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div>
              <h3 style="margin:0;">📊 Daily Shift Volume Trends</h3>
              <p style="margin:2px 0 0;">Comparing daily task submissions across Morning, Night, and Over Night over time.</p>
            </div>
            <div style="display:flex; gap:16px; font-size:12px; font-weight:600;">
              <span><span style="display:inline-block; width:12px; height:12px; background:#0d9488; border-radius:2px; vertical-align:middle; margin-right:4px;"></span> Morning</span>
              <span><span style="display:inline-block; width:12px; height:12px; background:#ed9a35; border-radius:2px; vertical-align:middle; margin-right:4px;"></span> Night</span>
              <span><span style="display:inline-block; width:12px; height:12px; background:#3b82f6; border-radius:2px; vertical-align:middle; margin-right:4px;"></span> Over Night</span>
            </div>
          </div>
          <div id="scDailyChart" class="an-line" style="min-height:280px;"></div>
        </div>
      ` : `
        <!-- SUB-TAB 6: Fair Shift Benchmarking & Smart Insights (Section 8.8 & 8.9) -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:16px;">
          <!-- Benchmarking Card -->
          <div class="ux-panel">
            <h3 style="margin:0 0 12px;">⚖️ Fair Normalized Benchmarking</h3>
            <p style="margin:0 0 16px; font-size:12px; color:var(--text-soft);">Normalizing production by headcount and active days rather than raw totals.</p>
            <div style="display:flex; flex-direction:column; gap:12px;">
              ${mainShifts.map(sh => {
                const s = shiftMatrixData[sh];
                const tone = sh === 'Morning' ? '#0d9488' : sh === 'Night' ? '#ed9a35' : '#3b82f6';
                return `
                  <div style="background:var(--bg-2); padding:12px 14px; border-radius:10px; border-left:4px solid ${tone};">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                      <strong style="color:${tone}; font-size:14px;">${esc(sh)} Shift</strong>
                      <span class="q-badge" style="background:${tone}22; color:${tone}; font-weight:700;">${s.avgPerLabeler} tasks / labeler</span>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; font-size:11px; color:var(--text-soft);">
                      <div>Headcount: <b>${s.labelers}</b></div>
                      <div>Daily Avg: <b>${s.avgDaily}</b></div>
                      <div>Avg Obj: <b>${s.avgObjects}</b></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Automated Insights Card -->
          <div class="ux-panel">
            <h3 style="margin:0 0 12px;">💡 Automated Shift Intelligence</h3>
            <p style="margin:0 0 16px; font-size:12px; color:var(--text-soft);">Data-backed operational findings derived directly from Turso database records.</p>
            <div style="display:flex; flex-direction:column; gap:10px; font-size:12px;">
              <div style="padding:10px 14px; background:var(--bg-2); border-radius:8px; border-left:3px solid #10b981;">
                <b>🏆 Highest Total Output:</b> ${shiftLeader.shift} contributed <b>${shiftLeader.total.toLocaleString()}</b> submissions (${all3ShiftsTotal > 0 ? ((shiftLeader.total/all3ShiftsTotal)*100).toFixed(1) : 0}% of all output).
              </div>
              <div style="padding:10px 14px; background:var(--bg-2); border-radius:8px; border-left:3px solid #3b82f6;">
                <b>⚡ Highest Per-Capita Velocity:</b> ${prodLeader.shift} achieved <b>${prodLeader.avgPerLabeler}</b> average tasks per active labeler.
              </div>
              <div style="padding:10px 14px; background:var(--bg-2); border-radius:8px; border-left:3px solid #0d9488;">
                <b>📡 Lidar Production Leader:</b> ${lidarLeader.shift} produced ${(lidarLeader.lidarFP.tasks + lidarLeader.lidarQA.tasks).toLocaleString()} Lidar tasks.
              </div>
              <div style="padding:10px 14px; background:var(--bg-2); border-radius:8px; border-left:3px solid #ed9a35;">
                <b>🛣️ Lane Line Production Leader:</b> ${laneLeader.shift} produced ${(laneLeader.laneFP.tasks + laneLeader.laneQA.tasks).toLocaleString()} Lane Line tasks.
              </div>
            </div>
          </div>
        </div>
      `}
    </div>
  `;

  bindHeaderControls(page, 'sc');
  bindUniversalFilterBar(page, 'shift_comparison');

  // Sub-tab button events
  page.querySelector('#scTabFloor')?.addEventListener('click', () => { shiftCompFilters.subTab = 'floor'; renderShiftComparison(); });
  page.querySelector('#scTabQueue')?.addEventListener('click', () => { shiftCompFilters.subTab = 'queue'; renderShiftComparison(); });
  page.querySelector('#scTabQtc')?.addEventListener('click', () => { shiftCompFilters.subTab = 'qtc'; renderShiftComparison(); });
  page.querySelector('#scTabLabelers')?.addEventListener('click', () => { shiftCompFilters.subTab = 'labelers'; renderShiftComparison(); });
  page.querySelector('#scTabChart')?.addEventListener('click', () => { shiftCompFilters.subTab = 'chart'; renderShiftComparison(); });
  page.querySelector('#scTabFair')?.addEventListener('click', () => { shiftCompFilters.subTab = 'fair'; renderShiftComparison(); });

  // Pagination for labelers tab
  page.querySelector('#scLabPrev')?.addEventListener('click', () => { if(shiftCompFilters.labPage > 0){ shiftCompFilters.labPage--; renderShiftComparison(); } });
  page.querySelector('#scLabNext')?.addEventListener('click', () => { if(shiftCompFilters.labPage < labTotalPages - 1){ shiftCompFilters.labPage++; renderShiftComparison(); } });

  const floorSel = page.querySelector('#scFloorSelect');
  if (floorSel) {
    floorSel.onchange = (e) => { shiftCompFilters.floor = e.target.value; renderShiftComparison(); };
  }

  // Multi-line chart rendering for TAB 5
  if (activeSubTab === 'chart') {
    const chartEl = page.querySelector('#scDailyChart');
    if (chartEl && allChartDates.length > 0) {
      const datesSlice = allChartDates.slice(-21);
      let maxVol = 1;
      mainShifts.forEach(sh => {
        datesSlice.forEach(d => {
          const v = shiftDailyMap[sh].get(d) || 0;
          if (v > maxVol) maxVol = v;
        });
      });

      const W = 760, H = 260, L = 55, R = 20, T = 20, B = 45;
      const x = i => L + (datesSlice.length === 1 ? (W - L - R) / 2 : (i / (datesSlice.length - 1)) * (W - L - R));
      const y = v => H - B - (v / maxVol) * (H - T - B);

      const colors = { Morning: '#0d9488', Night: '#ed9a35', 'Over Night': '#3b82f6' };
      let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="Shift daily trends">';
      for (let i = 0; i < 5; i++) {
        const val = (maxVol * i) / 4, yy = y(val);
        svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--border)" stroke-dasharray="3 3"/><text x="' + (L - 8) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="10" fill="var(--text-soft)">' + Math.round(val) + '</text>';
      }

      mainShifts.forEach(sh => {
        const pts = datesSlice.map((d, i) => x(i) + ',' + y(shiftDailyMap[sh].get(d) || 0)).join(' ');
        svg += '<polyline fill="none" stroke="' + colors[sh] + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="' + pts + '"/>';
        datesSlice.forEach((d, i) => {
          const cnt = shiftDailyMap[sh].get(d) || 0;
          svg += '<circle cx="' + x(i) + '" cy="' + y(cnt) + '" r="3.5" fill="' + colors[sh] + '"><title>' + d + ' (' + sh + '): ' + cnt + ' tasks</title></circle>';
        });
      });

      datesSlice.forEach((d, i) => {
        if (i === 0 || i === datesSlice.length - 1 || (datesSlice.length > 4 && i % 4 === 0)) {
          svg += '<text x="' + x(i) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="10" fill="var(--text-soft)">' + d.slice(5) + '</text>';
        }
      });
      svg += '</svg>';
      chartEl.innerHTML = svg;
    }
  }

  // Export CSV
  const expBtn = page.querySelector('#scExportBtn');
  if (expBtn) {
    expBtn.onclick = () => {
      let headers = [], dataRows = [];
      if (activeSubTab === 'floor') {
        headers = ['Floor / Unit', ...mainShifts.map(s => s + ' Tasks'), 'Total Submissions', 'Floor Share %'];
        dataRows = floorMatrix.map(f => [f.floor, ...mainShifts.map(s => f.perShift[s]?.total || 0), f.total, ((f.total / totalSubmissions) * 100).toFixed(1) + '%']);
      } else if (activeSubTab === 'queue') {
        headers = ['Queue Name', 'Morning Tasks', 'Night Tasks', 'Over Night Tasks', 'Lidar FP', 'Lidar QA', 'Lane Line FP', 'Lane Line QA', 'Total Submissions', 'Total Objects', 'Unique Labelers'];
        dataRows = queueRows.map(q => [q.name, q.morning, q.night, q.on, q.lFP, q.lQA, q.lnFP, q.lnQA, q.total, q.totalObjects, q.uniqueLabelers]);
      } else if (activeSubTab === 'qtc') {
        headers = ['QTC Supervisor', 'Shift', 'Floor / Unit', 'Team Size', 'Queues Covered', 'Lidar FP', 'Lidar QA', 'Lane Line FP', 'Lane Line QA', 'Total Submissions', 'Total Objects', 'Avg / Labeler'];
        dataRows = qtcRows.map(q => [q.qtc, q.shift, q.floor, q.teamSize, q.queuesCovered, q.lFP, q.lQA, q.lnFP, q.lnQA, q.total, q.totalObjects, q.avgSubmit]);
      } else {
        headers = ['Labeler Name', 'Masked Employee ID', 'Shift', 'Floor / Unit', 'QTC Supervisor', 'Lidar FP', 'Lidar QA', 'Lane Line FP', 'Lane Line QA', 'Total Tasks', 'Total Objects', 'Active Days', 'Avg Tasks / Day'];
        dataRows = allLabelerRows.map(l => [l.name, l.maskedId, l.shift, l.floor, l.qtc, l.lFP, l.lQA, l.lnFP, l.lnQA, l.total, l.totalObjects, l.activeDays, l.avgPerDay]);
      }
      const cell = v => '"' + String(v ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
      const csv = [headers, ...dataRows].map(r => r.map(cell).join(',')).join('\r\n');
      downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), 'Shift_Comparison_' + activeSubTab + '_' + cairoToday() + '.csv');
    };
  }
}

function qtcFloorAggregateData(rows){
  const idx = name => hdrs.findIndex(h => h.trim().toLowerCase() === name.toLowerCase());
  const qi = idx('qtc name'), fi = hdrs.findIndex(h => ['floor','unit'].includes(h.trim().toLowerCase()));
  const si = idx('shift'), mi = idx('modality'), pi = idx('pass');
  const ni = idx('national id'), li = idx('labeler name');
  const oi = idx('object count'), qni = idx('queue name');

  const groups = new Map();
  rows.forEach(r => {
    const qtc = qi >= 0 ? (String(r[qi] || '').normalize('NFC').trim().replace(/\s+/gu, ' ') || 'Unknown QTC') : 'Unknown QTC';
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
        .replace(/\.0+$/, '').replace(/[\s-]/g, '');
      if (/^\d{14}$/.test(rawNi)) lid = rawNi;
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
}

function exportQtcFloorCSV(items){
 if(!items||!items.length){
  showToast('No QTC & Floor data to export.');
  return;
 }
 const headers=['QTC Name','Floor','Shifts','Lidar FP Submit','Lidar QA Submit','Lane Line FP Submit','Lane Line QA Submit','Total Submit','Unique Labelers','Avg Submit / Labeler'];
 const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
 const rows=items.map(q=>[
  q.qtc,
  q.floor,
  q.shifts.join('; '),
  q.lidarFP,
  q.lidarQA,
  q.laneFP,
  q.laneQA,
  q.totalSubmit,
  q.uniqueLabelers,
  q.avgSubmitStr
 ]);
 const csv=[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n');
 downloadBlob(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}),'MEEG_QTC_Floor_Performance_'+cairoToday()+'.csv');
}

function floorAggregateData(rows){
  const idx = name => hdrs.findIndex(h => h.trim().toLowerCase() === name.toLowerCase());
  const qi = idx('qtc name'), fi = hdrs.findIndex(h => ['floor','unit'].includes(h.trim().toLowerCase()));
  const si = idx('shift'), mi = idx('modality'), pi = idx('pass');
  const ni = idx('national id'), li = idx('labeler name');
  const oi = idx('object count');

  const groups = new Map();
  rows.forEach(r => {
    const floor = fi >= 0 ? (deriveFloor(r[fi]) || 'Unknown Floor') : 'Unknown Floor';
    const qtc = qi >= 0 ? (String(r[qi] || '').normalize('NFC').trim().replace(/\s+/gu, ' ') || 'Unknown QTC') : 'Unknown QTC';
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
        .replace(/\.0+$/, '').replace(/[\s-]/g, '');
      if (/^\d{14}$/.test(rawNi)) lid = rawNi;
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
}

function exportFloorPerformanceCSV(groups){
 if(!groups||!groups.length){showToast('No floor records to export.');return;}
 const headers=['Floor / Unit / Room','Active Shifts','Active QTC Count','Supervising QTCs','Lidar FP','Lidar QA','Lane Line FP','Lane Line QA','Total Submit','Unique Labelers','Avg Submit / Labeler','Floor Share %'];
 const rows=groups.map(g=>[
  g.floor,
  g.shifts.join('; '),
  g.uniqueQtcs,
  g.qtcs.join('; '),
  g.lidarFP,
  g.lidarQA,
  g.laneFP,
  g.laneQA,
  g.totalSubmit,
  g.uniqueLabelers,
  g.avgSubmitStr,
  g.sharePctStr
 ]);
 const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
 const csv=[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n');
 downloadBlob(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}),'MEEG_floor_performance_'+cairoToday()+'.csv');
 showToast('✓ Floor performance CSV exported successfully!');
}

let _qfActiveView = 'all';
window._setQfActiveView = function(view) {
  _qfActiveView = view;
  renderQtcFloorPerformance();
};
