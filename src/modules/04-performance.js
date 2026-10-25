function renderPerformance(){
  const page = $('uxPerformance');
  if(!page || page.hidden) return;

  const rows = rowsInView();
  const si = hdrs.findIndex(h => h.toLowerCase() === 'shift');
  const fi = hdrs.findIndex(h => ['floor', 'unit'].includes(h.toLowerCase()));
  const qcI = hdrs.findIndex(h => h.toLowerCase() === 'qtc name');
  const li = hdrs.findIndex(h => h.toLowerCase() === 'labeler name');
  const ni = hdrs.findIndex(h => h.toLowerCase() === 'national id');
  const pcI = hdrs.findIndex(h => ['pc no', 'pc'].includes(h.toLowerCase()));
  const mi = hdrs.findIndex(h => h.toLowerCase() === 'modality');
  const pi = hdrs.findIndex(h => h.toLowerCase() === 'pass');
  const ti = hdrs.findIndex(h => ['task id', 'id'].includes(h.toLowerCase()));
  const oi = hdrs.findIndex(h => ['object count', 'object_count', 'objects'].includes(h.toLowerCase()));
  const qi = hdrs.findIndex(h => h.toLowerCase() === 'queue name');
  const tlIdx = hdrs.findIndex(h => ['task link', 'task_link', 'link'].includes(h.toLowerCase()));

  // Aggregate people with complete object counts
  const peopleMap = new Map();
  rows.forEach(r => {
    const rawName = li >= 0 ? String(r[li] || '').trim() : '';
    const rawId = ni >= 0 ? String(r[ni] || '').trim() : '';
    const pc = pcI >= 0 ? String(r[pcI] || '').trim() : '';
    const name = rawName || (rawId ? ('Labeler ' + rawId.slice(-4)) : 'Unknown Labeler');
    const key = rawName ? rawName.toLowerCase() : rawId;
    if (!key) return;

    if (!peopleMap.has(key)) {
      peopleMap.set(key, {
        key,
        name,
        rawId,
        maskedId: maskEmployeeId(rawId, pc || rawName),
        shifts: new Set(),
        units: new Set(),
        qtcs: new Set(),
        queues: new Set(),
        dates: new Set(),
        tasks: [],
        total: 0,
        totalObjects: 0,
        largestTask: 0,
        lidarFP: 0,
        lidarQA: 0,
        laneFP: 0,
        laneQA: 0
      });
    }

    const p = peopleMap.get(key);
    p.total++;

    const objCount = parseFloat(oi >= 0 ? r[oi] : 0) || 0;
    p.totalObjects += objCount;
    if (objCount > p.largestTask) p.largestTask = objCount;

    if (si >= 0 && r[si]) p.shifts.add(r[si]);
    if (fi >= 0 && r[fi]) p.units.add(deriveFloor(r[fi]));
    if (qcI >= 0 && r[qcI]) p.qtcs.add(r[qcI]);
    if (qi >= 0 && r[qi]) p.queues.add(r[qi]);

    const d = rDate(r);
    if (d) p.dates.add(d);

    if (isModPass(r, 'lidar', 'FP')) p.lidarFP++;
    if (isModPass(r, 'lidar', 'QA')) p.lidarQA++;
    if (isModPass(r, 'laneline', 'FP')) p.laneFP++;
    if (isModPass(r, 'laneline', 'QA')) p.laneQA++;

    p.tasks.push({
      id: ti >= 0 ? r[ti] : '—',
      date: d || 'Unknown',
      shift: si >= 0 ? r[si] : '—',
      unit: fi >= 0 ? deriveFloor(r[fi]) : '—',
      queue: qi >= 0 ? r[qi] : '—',
      qtc: qcI >= 0 ? r[qcI] : '—',
      mod: mi >= 0 ? r[mi] : '—',
      pass: pi >= 0 ? r[pi] : '—',
      objects: objCount,
      link: tlIdx >= 0 ? r[tlIdx] : ''
    });
  });

  const people = [...peopleMap.values()].map(p => {
    const activeDays = Math.max(1, p.dates.size);
    const avgPerDay = (p.total / activeDays).toFixed(1);
    const avgObjectsPerTask = p.total > 0 ? (p.totalObjects / p.total).toFixed(1) : '0';
    return {
      ...p,
      activeDays,
      avgPerDay: Number(avgPerDay) || 0,
      avgPerDayStr: avgPerDay,
      avgObjectsPerTask: Number(avgObjectsPerTask) || 0,
      avgObjectsPerTaskStr: avgObjectsPerTask
    };
  });

  // Calculate 8 Main KPI Cards (Section 6.1)
  const totalPeople = people.length;
  const totalSubmits = rows.length;
  const totalObjectsAll = people.reduce((s, p) => s + p.totalObjects, 0);
  const avgSubmit = totalPeople ? (totalSubmits / totalPeople).toFixed(1) : '0';
  const overallAvgObjects = totalSubmits > 0 ? (totalObjectsAll / totalSubmits).toFixed(1) : '0';
  const overallLargestTask = people.reduce((m, p) => Math.max(m, p.largestTask), 0);

  // Filter people by query & category
  const qFilter = (perfFilters.query || '').toLowerCase().trim();
  let filteredPeople = people.filter(p => {
    if (perfFilters.category) {
      if (perfFilters.category === 'lidarFP' && p.lidarFP === 0) return false;
      if (perfFilters.category === 'lidarQA' && p.lidarQA === 0) return false;
      if (perfFilters.category === 'laneFP' && p.laneFP === 0) return false;
      if (perfFilters.category === 'laneQA' && p.laneQA === 0) return false;
    }
    if (qFilter) {
      const mName = p.name.toLowerCase().includes(qFilter);
      const mId = p.maskedId.toLowerCase().includes(qFilter);
      const mShift = [...p.shifts].some(s => s.toLowerCase().includes(qFilter));
      const mQtc = [...p.qtcs].some(q => q.toLowerCase().includes(qFilter));
      const mUnit = [...p.units].some(u => u.toLowerCase().includes(qFilter));
      if (!mName && !mId && !mShift && !mQtc && !mUnit) return false;
    }
    return true;
  });

  // Default Sort ranking: Total Objects (Section 6.2)
  const sortCol = perfFilters.sortCol || 'totalObjects';
  const sortAsc = !!perfFilters.sortAsc;
  filteredPeople.sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol];
    if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    va = Number(va) || 0; vb = Number(vb) || 0;
    return sortAsc ? (va - vb) : (vb - va);
  });

  // Top rankings for Insights (Section 6.5)
  const topByObjects = [...people].sort((a,b) => b.totalObjects - a.totalObjects).slice(0, 5);
  const topByTasks = [...people].sort((a,b) => b.total - a.total).slice(0, 5);

  // Pagination (Section 6.2 - No 100 limit, full pagination)
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(filteredPeople.length / pageSize));
  perfFilters.page = Math.min(perfFilters.page || 0, totalPages - 1);
  const visiblePeople = filteredPeople.slice(perfFilters.page * pageSize, (perfFilters.page + 1) * pageSize);

  // Expose people list globally for drill-down modal lookup
  window._allPeoplePerfMap = peopleMap;

  // KPI Definitions
  const kpiDefs = [
    { title: 'Total Annotated Objects', val: totalObjectsAll.toLocaleString(), sub: 'Across all verified submissions', tone: '#0284c7' },
    { title: 'Total Unique Labelers', val: totalPeople.toLocaleString(), sub: 'Active contributors in view', tone: '#0a9d8c' },
    { title: 'Total Task Submissions', val: totalSubmits.toLocaleString(), sub: 'Cumulative task entries', tone: '#0d9488' },
    { title: 'Largest Task Objects', val: overallLargestTask.toLocaleString(), sub: 'Max object count single task', tone: '#f59e0b' },
    { title: 'Avg Objects / Task', val: overallAvgObjects, sub: 'Mean object complexity', tone: '#8b5cf6' },
    { title: 'Avg Submissions / Labeler', val: avgSubmit, sub: 'Average output per person', tone: '#3b82f6' }
  ];

  page.innerHTML = '<div class="ux-overview">'
    + '<div class="ux-heading">'
      + '<div>'
        + '<div class="ux-eyebrow">Workforce Performance Intelligence</div>'
        + '<h2>Performance per Labelers</h2>'
        + '<p>Task volume, annotated object counts, and productivity analytics per individual contributor.</p>'
      + '</div>'
      + renderHeaderControlsHTML('perf')
    + '</div>'

    + renderUniversalFilterBar('performance')

    // Main KPI Cards Grid
    + '<div class="ux-grid-8" style="grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));">'
      + kpiDefs.map(k => '<div class="kpi-mini-card" style="--tone:' + k.tone + '">'
        + '<div class="kpi-title"><span>' + esc(k.title) + '</span><span style="color:' + k.tone + '">●</span></div>'
        + '<div class="kpi-val">' + k.val + '</div>'
        + '<div class="kpi-sub">' + esc(k.sub) + '</div>'
      + '</div>').join('')
    + '</div>'

    // Employee Productivity Insights Panel (Section 6.5)
    + '<div class="ux-panel" style="margin-top:16px; padding:16px 20px; background:var(--bg-2); border-radius:12px; border:1px solid var(--border);">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">'
        + '<h3 style="margin:0; font-size:14px; display:flex; align-items:center; gap:8px;">🏆 Top Labeler Highlights (By Objects &amp; By Tasks)</h3>'
        + '<span class="ux-note">Default ranking is ordered by Total Objects</span>'
      + '</div>'
      + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:14px;">'
        + '<div style="background:var(--bg-3); padding:12px 14px; border-radius:8px; border-left:3px solid #0284c7;">'
          + '<div style="font-weight:700; font-size:12px; margin-bottom:6px; color:#0284c7;">Top 5 Labelers by Total Objects:</div>'
          + '<div style="display:flex; flex-direction:column; gap:4px; font-size:11px;">'
            + topByObjects.map((p, i) => '<div style="display:flex; justify-content:space-between;"><span><b>#' + (i+1) + '</b> ' + esc(p.name) + '</span><strong style="color:#0284c7;">' + p.totalObjects.toLocaleString() + ' obj</strong></div>').join('')
          + '</div>'
        + '</div>'
        + '<div style="background:var(--bg-3); padding:12px 14px; border-radius:8px; border-left:3px solid #0d9488;">'
          + '<div style="font-weight:700; font-size:12px; margin-bottom:6px; color:#0d9488;">Top 5 Labelers by Total Tasks:</div>'
          + '<div style="display:flex; flex-direction:column; gap:4px; font-size:11px;">'
            + topByTasks.map((p, i) => '<div style="display:flex; justify-content:space-between;"><span><b>#' + (i+1) + '</b> ' + esc(p.name) + '</span><strong style="color:var(--primary);">' + p.total.toLocaleString() + ' tasks</strong></div>').join('')
          + '</div>'
        + '</div>'
      + '</div>'
    + '</div>'

    // Controls & Filter Bar
    + '<div class="queues-controls" style="margin-top:16px;">'
      + '<label>Search Labeler / ID / Shift / Unit / QTC<input id="perfSearch" placeholder="Type name, masked ID, unit, QTC…" value="' + esc(perfFilters.query || '') + '"></label>'
      + '<label>Category Filter<select id="perfCategory"><option value="">All Categories</option><option value="lidarFP" ' + (perfFilters.category==='lidarFP'?'selected':'') + '>Lidar FP</option><option value="lidarQA" ' + (perfFilters.category==='lidarQA'?'selected':'') + '>Lidar QA</option><option value="laneFP" ' + (perfFilters.category==='laneFP'?'selected':'') + '>Lane Line FP</option><option value="laneQA" ' + (perfFilters.category==='laneQA'?'selected':'') + '>Lane Line QA</option></select></label>'
      + '<div style="margin-left:auto; display:flex; gap:8px; align-items:flex-end;">'
        + '<button class="btn btn-c" id="perfExportCSV">↓ Export CSV</button>'
        + '<button class="btn" id="perfReset">Reset filters</button>'
      + '</div>'
    + '</div>'

    // RANKING TABLE
    + '<section class="ux-panel" style="margin-top:20px;">'
      + '<div class="ux-heading" style="margin-bottom:12px;">'
        + '<div><h3>Labeler Ranking Table (' + filteredPeople.length.toLocaleString() + ' contributors)</h3><p>Default sorted by Total Objects. Click headers with ↕ to reorder. Click any employee to open detail drill-down.</p></div>'
        + '<span class="ux-note">Showing ' + (visiblePeople.length ? (perfFilters.page*pageSize+1) : 0) + ' – ' + Math.min((perfFilters.page+1)*pageSize, filteredPeople.length) + ' of ' + filteredPeople.length + ' labelers</span>'
      + '</div>'
      + '<div class="perf-table">'
        + '<table>'
          + '<thead><tr>'
            + '<th>#</th>'
            + '<th data-sort="name">Labeler Name ↕</th>'
            + '<th>Masked ID</th>'
            + '<th data-sort="totalObjects" style="color:#0284c7; font-weight:800;">Total Objects ↕</th>'
            + '<th data-sort="total" style="color:var(--primary);">Total Tasks ↕</th>'
            + '<th data-sort="avgObjectsPerTask">Avg Obj / Task ↕</th>'
            + '<th data-sort="largestTask">Largest Task ↕</th>'
            + '<th data-sort="activeDays">Active Days ↕</th>'
            + '<th data-sort="avgPerDay">Avg / Day ↕</th>'
            + '<th style="color:#0d9488;">Lidar FP</th>'
            + '<th style="color:#14b8a6;">Lidar QA</th>'
            + '<th style="color:#ed9a35;">Lane FP</th>'
            + '<th style="color:#ec4899;">Lane QA</th>'
            + '<th>Action</th>'
          + '</tr></thead>'
          + '<tbody>'
            + visiblePeople.map((p, idx) => {
              const rank = (perfFilters.page * pageSize) + idx + 1;
              return '<tr class="labeler-row-item" data-person-key="' + esc(p.key) + '" onclick="window.openLabelerDetailModal && window.openLabelerDetailModal(\'' + esc(p.key) + '\')" style="cursor:pointer;" title="Click to view detailed employee task history">'
                + '<td><b style="color:var(--text-soft); font-size:11px;">' + rank + '</b></td>'
                + '<td><strong style="color:var(--primary);">' + esc(p.name) + '</strong></td>'
                + '<td><span class="ux-note" style="font-family:monospace; font-size:11px;">' + esc(p.maskedId) + '</span></td>'
                + '<td><strong style="color:#0284c7; font-size:13px;">' + p.totalObjects.toLocaleString() + '</strong></td>'
                + '<td><strong style="color:var(--text);">' + p.total.toLocaleString() + '</strong></td>'
                + '<td><span>' + p.avgObjectsPerTaskStr + '</span></td>'
                + '<td><span>' + p.largestTask.toLocaleString() + '</span></td>'
                + '<td><span>' + p.activeDays + '</span></td>'
                + '<td><b>' + p.avgPerDayStr + '</b></td>'
                + '<td><span style="color:#0d9488;">' + p.lidarFP.toLocaleString() + '</span></td>'
                + '<td><span style="color:#14b8a6;">' + p.lidarQA.toLocaleString() + '</span></td>'
                + '<td><span style="color:#ed9a35;">' + p.laneFP.toLocaleString() + '</span></td>'
                + '<td><span style="color:#ec4899;">' + p.laneQA.toLocaleString() + '</span></td>'
                + '<td><button type="button" class="btn btn-c lab-drill-btn" data-person-key="' + esc(p.key) + '" onclick="event.stopPropagation(); window.openLabelerDetailModal && window.openLabelerDetailModal(\'' + esc(p.key) + '\');" style="font-size:10px; padding:3px 8px; cursor:pointer;">🔍 Detail</button></td>'
              + '</tr>';
            }).join('')
          + '</tbody>'
        + '</table>'
        + (!filteredPeople.length ? '<div class="ux-empty">No labelers match your current filters.</div>' : '')
      + '</div>'
      + '<div class="perf-pagination" style="display:flex; justify-content:space-between; align-items:center; margin-top:14px;">'
        + '<button class="btn" id="perfPrev" ' + (perfFilters.page === 0 ? 'disabled' : '') + '>Previous</button>'
        + '<span class="ux-note">Page ' + (perfFilters.page + 1) + ' of ' + totalPages + '</span>'
        + '<button class="btn" id="perfNext" ' + (perfFilters.page >= totalPages - 1 ? 'disabled' : '') + '>Next</button>'
      + '</div>'
    + '</section>'
  + '</div>';

  bindHeaderControls(page, 'perf');
  bindUniversalFilterBar(page, 'performance');

  // Search input
  const sInput = $('perfSearch');
  if(sInput){
    sInput.oninput = e => { perfFilters.query = e.target.value; perfFilters.page = 0; renderPerformance(); };
  }
  const cSelect = $('perfCategory');
  if(cSelect){
    cSelect.onchange = e => { perfFilters.category = e.target.value; perfFilters.page = 0; renderPerformance(); };
  }
  const rBtn = $('perfReset');
  if(rBtn){
    rBtn.onclick = () => {
      Object.assign(perfFilters, { query: '', category: '', sortCol: 'totalObjects', sortAsc: false, page: 0 });
      renderPerformance();
    };
  }

  // Sorting
  page.querySelectorAll('th[data-sort]').forEach(th => {
    th.style.cursor = 'pointer';
    th.onclick = () => {
      const s = th.dataset.sort;
      if(perfFilters.sortCol === s) { perfFilters.sortAsc = !perfFilters.sortAsc; }
      else { perfFilters.sortCol = s; perfFilters.sortAsc = false; }
      renderPerformance();
    };
  });

  // Pagination
  const pPrev = $('perfPrev'); if(pPrev) pPrev.onclick = () => { if(perfFilters.page > 0){ perfFilters.page--; renderPerformance(); } };
  const pNext = $('perfNext'); if(pNext) pNext.onclick = () => { if(perfFilters.page < totalPages - 1){ perfFilters.page++; renderPerformance(); } };

  // Export CSV
  const pExp = $('perfExportCSV');
  if(pExp) pExp.onclick = () => exportPerformanceCSV(filteredPeople);

  // Drilldown modal bindings
  page.querySelectorAll('.labeler-row-item, .lab-drill-btn').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const pKey = el.dataset.personKey;
      if(pKey && typeof openLabelerDetailModal === 'function') openLabelerDetailModal(pKey);
    };
  });
}

function rankQcGroups(groups,category,lower){return groups.filter(g=>g.totals[category]>0).sort((a,b)=>(lower?a.totals[category]-b.totals[category]:b.totals[category]-a.totals[category])||a.name.localeCompare(b.name)).slice(0,15);}
const sharedPeriods=document.createElement('section');sharedPeriods.className='ux-shared-periods';sharedPeriods.setAttribute('aria-label','Date filters for all pages');if(!isUnified && root && root.parentNode) root.parentNode.insertBefore(sharedPeriods,root);
function renderSharedPeriods(){
 const dates=protectedOptions?[...(protectedOptions.day||[])].sort().reverse():[...new Set(rawRows.map(r=>rDate(r)).filter(Boolean))].sort().reverse();const weeks=[...new Set(dates.map(d=>performanceWeek(d)?.start).filter(Boolean))].sort().reverse();
 sharedPeriods.replaceChildren();
 const caption=document.createElement('strong');caption.textContent='GLOBAL FILTERS';sharedPeriods.appendChild(caption);

 const dayLabel=document.createElement('label');dayLabel.textContent='Day: ';
 const day=document.createElement('input');day.type='date';day.id='sharedDay';day.setAttribute('aria-label','Day filter for all pages');day.value=selD.size===1?[...selD][0]:'';dayLabel.appendChild(day);
 const applyDay=document.createElement('button');applyDay.className='btn btn-c';applyDay.textContent='Apply Day';
 dayLabel.appendChild(applyDay);sharedPeriods.appendChild(dayLabel);

 const rangeWrap=document.createElement('div');rangeWrap.style.display='inline-flex';rangeWrap.style.alignItems='center';rangeWrap.style.gap='5px';
 rangeWrap.innerHTML='<label>From: <input type="date" id="sharedFrom"></label><label>To: <input type="date" id="sharedTo"></label><button class="btn btn-c" id="sharedApplyRange">Apply Range</button>';
 const fromInp=rangeWrap.querySelector('#sharedFrom');const toInp=rangeWrap.querySelector('#sharedTo');
 if(selD.size>1){const s=[...selD].sort();fromInp.value=s[0];toInp.value=s[s.length-1];}
 rangeWrap.querySelector('#sharedApplyRange').onclick=()=>{
  const f=fromInp.value,t=toInp.value;
  if(!f||!t||f>t){showToast('Choose a valid start and end date.');return;}
  selD.clear();selWeeks.clear();
  const rangeDates=(sOpts._dates||[]).filter(d=>d>=f&&d<=t);
  if(!rangeDates.length)selD.add(f);else rangeDates.forEach(d=>selD.add(d));
  Object.assign(analysisFilters,{from:f,to:t});
  Object.assign(perfFilters,{from:f,to:t,day:'',week:''});
  buildStrip();applyAll();renderAllSections();
  showToast('Applied range: '+f+' → '+t);
 };
 sharedPeriods.appendChild(rangeWrap);

 const weekLabel=document.createElement('label');weekLabel.textContent='Week: ';
 const week=document.createElement('select');week.id='sharedWeek';week.setAttribute('aria-label','Week filter for all pages');week.add(new Option('All weeks',''));weeks.forEach(w=>week.add(new Option(w+' → '+performanceWeek(w).end,w)));
 if(selD.size===7){const starts=new Set([...selD].map(d=>performanceWeek(d)?.start));if(starts.size===1)week.value=[...starts][0];}
 weekLabel.appendChild(week);sharedPeriods.appendChild(weekLabel);

 function applyPeriod(value,isWeek){selD.clear();selWeeks.clear();if(value){if(isWeek){const d=new Date(value+'T00:00:00Z');for(let i=0;i<7;i++){selD.add(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()+1);}}else selD.add(value);}Object.assign(analysisFilters,{from:'',to:''});Object.assign(perfFilters,{from:'',to:'',day:'',week:'',page:0,person:''});buildStrip();applyAll();}
 applyDay.onclick=()=>{if(!day.value){showToast('Choose a day from the calendar.');day.focus();return;}applyPeriod(day.value,false);};
 day.onchange=()=>{if(day.value)applyPeriod(day.value,false);};
 week.onchange=()=>applyPeriod(week.value,true);

 const clear=document.createElement('button');clear.className='btn';clear.textContent='Clear dates';clear.onclick=()=>{applyPeriod('',false);fromInp.value='';toInp.value='';day.value='';week.value='';};sharedPeriods.appendChild(clear);

 MeegTooltip.attach(applyDay, () => ({
  title: 'Apply Day Filter',
  badge: 'Global',
  desc: 'Filters all dashboard pages and charts to the selected date.'
 }));
 MeegTooltip.attach(rangeWrap.querySelector('#sharedApplyRange'), () => ({
  title: 'Apply Date Range',
  badge: 'Global',
  desc: 'Filters all dashboard pages between From and To dates.'
 }));
 MeegTooltip.attach(clear, () => ({
  title: 'Clear Date Filters',
  badge: 'Global',
  desc: 'Resets date filtering across all pages.'
 }));
 const info=document.createElement('span');info.className='ux-note';info.textContent=selD.size?selD.size+' selected day(s) · applies to all pages':'Applies to all pages';sharedPeriods.appendChild(info);
}

function dailyQueueReport(rows,universe=rows){
 const idx=name=>hdrs.findIndex(h=>h.trim().toLowerCase()===name.toLowerCase());const qi=idx('Queue Name'),mi=idx('Modality'),pi=idx('Pass'),ni=idx('National Id');
 const groups=new Map();const modality=r=>{const raw=String(r[mi]||'').trim(),key=raw.toLowerCase().replace(/[\s_-]+/g,'');return key==='lidar'?'Lidar':key==='laneline'?'Lane Line':raw||'Unspecified';};
 function group(r){const name=qi<0?'':String(r[qi]||'').trim();if(!name)return null;const mod=modality(r),key=JSON.stringify([name,mod]);if(!groups.has(key))groups.set(key,{name,mod,fp:0,qa:0,fpIds:new Set(),qaIds:new Set(),missing:0});return groups.get(key);}
 universe.forEach(group);rows.forEach(r=>{const g=group(r);if(!g)return;const pass=String(r[pi]||'').trim().toUpperCase();if(pass!=='FP'&&pass!=='QA')return;const key=pass.toLowerCase();g[key]++;const id=ni<0?'':String(r[ni]||'').trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/\.0+$/,'').replace(/[\s-]/g,'');if(/^\d{14}$/.test(id))g[key+'Ids'].add(id);else g.missing++;});
 return {hasQueue:qi>=0,hasPass:pi>=0,hasNational:ni>=0,groups:[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.mod.localeCompare(b.mod))};
}