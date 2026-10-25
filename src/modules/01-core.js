/* Presentation layer. The existing Google data and authentication remain authoritative. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let protectedOptions=null;

const escHtml = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const esc = window.esc || escHtml;

if (typeof window.showToast !== 'function') {
  window.showToast = function(msg) {
    if (typeof document === 'undefined') return;
    try {
      let ex = document.querySelector('.toast');
      if (ex) ex.remove();
      const t = document.createElement('div');
      t.className = 'toast';
      t.style.cssText = 'position:fixed; bottom:24px; right:24px; background:#0f172a; color:#fff; padding:10px 18px; border-radius:8px; z-index:999999; font-size:13px; font-weight:600; box-shadow:0 10px 25px rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.1); transition:all 0.3s ease;';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateY(10px)';
        setTimeout(() => t.remove(), 300);
      }, 3200);
    } catch(e) {}
  };
}
const showToast = window.showToast;

function cairoToday() {
  if (typeof window.cairoToday === 'function') return window.cairoToday();
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  } catch(e) {
    const n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' + String(n.getDate()).padStart(2,'0');
  }
}

function _addDays(d, n) {
  if (typeof window._addDays === 'function') return window._addDays(d, n);
  try {
    const dt = new Date(d + 'T12:00:00');
    dt.setDate(dt.getDate() + n);
    return dt.toISOString().substring(0, 10);
  } catch(e) {
    return d;
  }
}

const MeegTooltip = (function(){
 let el = null;
 function init(){
  if(el) return el;
  el = document.createElement('div');
  el.id = 'meegGlobalTooltip';
  el.setAttribute('role', 'tooltip');
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  window.addEventListener('scroll', hide, {passive: true});
  window.addEventListener('resize', hide, {passive: true});
  window.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  return el;
 }

 function show(opts, event){
  if(!opts) return hide();
  const tip = init();
  let html = '';
  if (opts.title || opts.badge) {
   html += '<div class="tip-head">';
   if (opts.title) html += '<span class="tip-title">' + escHtml(opts.title) + '</span>';
   if (opts.badge) html += '<span class="tip-badge">' + escHtml(opts.badge) + '</span>';
   html += '</div>';
  }
  if (opts.desc) {
   html += '<div class="tip-desc">' + escHtml(opts.desc) + '</div>';
  }
  if (opts.rows && opts.rows.length) {
   html += '<div class="tip-rows">';
   opts.rows.forEach(r => {
    html += '<div class="tip-row">'
     + '<span class="tip-row-lbl">'
     + (r.color ? '<span class="tip-dot" style="background:' + escHtml(r.color) + '"></span>' : '')
     + escHtml(r.label)
     + '</span>'
     + '<span class="tip-row-val">' + escHtml(String(r.value ?? '—')) + '</span>'
     + '</div>';
   });
   html += '</div>';
  }
  if (opts.chips && opts.chips.length) {
   html += '<div class="tip-chips">';
   opts.chips.forEach(c => {
    html += '<span class="tip-chip">' + escHtml(c) + '</span>';
   });
   html += '</div>';
  }
  if (opts.note) {
   html += '<div class="tip-note">💡 ' + escHtml(opts.note) + '</div>';
  }

  tip.innerHTML = html;
  tip.classList.add('visible');
  tip.setAttribute('aria-hidden', 'false');

  const rect = (event && event.currentTarget && typeof event.currentTarget.getBoundingClientRect === 'function')
   ? event.currentTarget.getBoundingClientRect()
   : null;
  const clientX = (event && event.clientX !== undefined) ? event.clientX : (rect ? rect.left + rect.width / 2 : 120);
  const clientY = (event && event.clientY !== undefined) ? event.clientY : (rect ? rect.top : 120);

  const tipW = tip.offsetWidth || 240;
  const tipH = tip.offsetHeight || 120;

  let left = clientX + 12;
  let top = clientY + 14;

  if (left + tipW > window.innerWidth - 12) {
   left = clientX - tipW - 12;
   if (left < 10) left = Math.max(10, window.innerWidth - tipW - 12);
  }
  if (top + tipH > window.innerHeight - 12) {
   top = clientY - tipH - 12;
   if (top < 10) top = Math.max(10, window.innerHeight - tipH - 12);
  }

  tip.style.left = Math.round(left) + 'px';
  tip.style.top = Math.round(top) + 'px';
 }

 function hide(){
  if (!el) return;
  el.classList.remove('visible');
  el.setAttribute('aria-hidden', 'true');
 }

 function attach(targetEl, dataProvider){
  if (!targetEl) return;
  const handleMove = e => {
   const data = typeof dataProvider === 'function' ? dataProvider(e, targetEl) : dataProvider;
   if (data) show(data, e);
   else hide();
  };
  targetEl.addEventListener('pointerenter', handleMove);
  targetEl.addEventListener('pointermove', handleMove);
  targetEl.addEventListener('pointerleave', hide);
  targetEl.addEventListener('focus', handleMove);
  targetEl.addEventListener('blur', hide);
 }

 return { show, hide, attach, init };
})();
MeegTooltip.init();
window.MeegTooltip = MeegTooltip;
window.openGuideModal = openGuideModal;
window.copyCurrentSummaryToClipboard = copyCurrentSummaryToClipboard;
window.renderQueuesAnalysis = renderQueuesAnalysis;
window.renderQtcFloorPerformance = renderQtcFloorPerformance;
window.floorAggregateData = floorAggregateData;
window.exportFloorPerformanceCSV = exportFloorPerformanceCSV;
window.renderPerformance = renderPerformance;
window.renderDailyReport = renderDailyReport;
window.renderOverview = renderOverview;
window.renderAnalysis = renderAnalysis;
window.renderGmReport = typeof renderGmReport !== "undefined" ? renderGmReport : null;
window.renderShiftComparison = typeof renderShiftComparison !== "undefined" ? renderShiftComparison : null;

const QUEUE_HEADER_EXPLANATIONS = {
 'name': { title: 'Queue Name', desc: 'Name of the task queue or operational workflow path', note: 'Click to sort alphabetically' },
 'shifts': { title: 'Shifts', desc: 'Operational shifts with recorded submissions in this queue' },
 'floors': { title: 'Floors / Units', desc: 'Physical floors and operational units working on this queue' },
 'qtcs': { title: 'QCs / QTCs', desc: 'Quality controllers and review supervisors overseeing this queue' },
 'lidarFP': { title: 'Lidar FP (First Pass)', desc: 'Lidar first-pass annotation submissions', note: 'Click to sort by volume' },
 'lidarQA': { title: 'Lidar QA (Quality Assurance)', desc: 'Lidar quality assurance review submissions', note: 'Click to sort by volume' },
 'laneFP': { title: 'Lane Line FP', desc: 'Lane Line first-pass annotation submissions', note: 'Click to sort by volume' },
 'laneQA': { title: 'Lane Line QA', desc: 'Lane Line quality assurance review submissions', note: 'Click to sort by volume' },
 'totalSubmit': { title: 'Total Submit', desc: 'Total submitted tasks recorded for this queue across all passes', note: 'Click to sort' },
 'uniqueLabelers': { title: 'Unique Labelers', desc: 'Unique active labelers (deduplicated by 14-digit National ID)', note: 'Click to sort' },
 'avgSubmit': { title: 'Avg Submit / Labeler', desc: 'Average productivity = Total Submit ÷ Unique Labelers', note: 'Click to sort' },
 'uniqueQtc': { title: 'Total Unique QTC', desc: 'Distinct quality supervisors overseeing this queue', note: 'Click to sort' }
};

const FLOOR_HEADER_EXPLANATIONS = {
 'floor': { title: 'Floor / Unit / Room', desc: 'Floor, room, or operational unit identifier (e.g. 4th Floor, NC Room 102)', note: 'Click to sort alphabetically' },
 'shifts': { title: 'Active Shifts', desc: 'Shifts with recorded production on this floor (Morning, Night, Over Night)' },
 'uniqueQtcs': { title: 'Supervising QTCs', desc: 'Count of quality supervisors overseeing this floor — hover to view roster', note: 'Click to sort' },
 'lidarFP': { title: 'Lidar FP', desc: 'Total Lidar first-pass tasks submitted on this floor', note: 'Click to sort' },
 'lidarQA': { title: 'Lidar QA', desc: 'Total Lidar quality assurance tasks submitted on this floor', note: 'Click to sort' },
 'laneFP': { title: 'Lane Line FP', desc: 'Total Lane Line first-pass tasks submitted on this floor', note: 'Click to sort' },
 'laneQA': { title: 'Lane Line QA', desc: 'Total Lane Line quality assurance tasks submitted on this floor', note: 'Click to sort' },
 'totalSubmit': { title: 'Total Submit', desc: 'Total submissions from all contributors on this floor', note: 'Click to sort' },
 'uniqueLabelers': { title: 'Unique Labelers', desc: 'Unique labelers on this floor (deduplicated by 14-digit National ID)', note: 'Click to sort' },
 'avgSubmit': { title: 'Avg Submit / Labeler', desc: 'Floor average productivity = Total Submit ÷ Unique Labelers', note: 'Click to sort' },
 'sharePct': { title: 'Floor Share %', desc: 'Percentage contribution of this floor to total enterprise submissions', note: 'Click to sort' }
};

const QF_HEADER_EXPLANATIONS = {
 'qtc': { title: 'QTC Name', desc: 'Name of the Quality Controller supervising the team', note: 'Click to sort alphabetically' },
 'floor': { title: 'Floor / Unit', desc: 'Physical floor or unit location of the team', note: 'Click to sort' },
 'shifts': { title: 'Shifts', desc: 'Active shifts for this supervisor and team' },
 'lidarFP': { title: 'Lidar FP', desc: 'Lidar first-pass task submissions', note: 'Click to sort' },
 'lidarQA': { title: 'Lidar QA', desc: 'Lidar quality assurance (QA) task submissions', note: 'Click to sort' },
 'laneFP': { title: 'Lane Line FP', desc: 'Lane Line first-pass task submissions', note: 'Click to sort' },
 'laneQA': { title: 'Lane Line QA', desc: 'Lane Line quality assurance (QA) task submissions', note: 'Click to sort' },
 'totalSubmit': { title: 'Total Submit', desc: 'Total tasks submitted under this QTC and floor', note: 'Click to sort' },
 'uniqueLabelers': { title: 'Unique Labelers', desc: 'Unique labelers supervised (deduplicated by 14-digit National ID)', note: 'Click to sort' },
 'avgSubmit': { title: 'Avg Submit / Labeler', desc: 'Average productivity = Total Submit ÷ Unique Labelers', note: 'Click to sort' }
};

const PERF_HEADER_EXPLANATIONS = {
 'rank': { title: 'Rank', desc: 'Descending rank ordered by total completed objects or submissions' },
 'labeler': { title: 'Labeler Name', desc: 'Contributor name and masked identifier' },
 'totalObjects': { title: 'Total Objects', desc: 'Cumulative object count across all submitted tasks' },
 'tasks': { title: 'Tasks Count', desc: 'Total number of submitted tasks (task rows)' },
 'largestTask': { title: 'Largest Task', desc: 'Single task with highest object count' },
 'shifts': { title: 'Shifts', desc: 'Shifts during which submissions were logged' },
 'qtcs': { title: 'QTCs', desc: 'Supervisors who oversaw these submissions' }
};

const DAILY_HEADER_EXPLANATIONS = {
 'queue': { title: 'Queue & Modality', desc: 'Queue name, operational path, and modality (Lidar / Lane Line)' },
 'fpLabelers': { title: 'Unique Labelers (FP)', desc: 'Unique labelers in First Pass (deduplicated by 14-digit National ID)' },
 'fpSubmits': { title: 'Total Submit (FP)', desc: 'Total First Pass submissions during this period' },
 'qaLabelers': { title: 'Unique Labelers (QA)', desc: 'Unique labelers in QA (deduplicated by 14-digit National ID)' },
 'qaSubmits': { title: 'Total Submit (QA)', desc: 'Total Quality Assurance submissions during this period' }
};

function copyCurrentSummaryToClipboard(){
 const base = rowsInView();
 const metrics = labelerSubmissionMetrics(base);
 const totals = metrics.totals;
 const uniqueLabelers = metrics.unique ?? uniq(base, 'Labeler Name') ?? 0;
 const totalTasks = base.length;
 const avgSubmit = uniqueLabelers > 0 ? (totalTasks / uniqueLabelers).toFixed(1) : '0';
 const qtcCount = uniqueQtcCount(base) ?? uniq(base, 'Qtc Name') ?? 0;
 const activeQueues = uniq(base, 'Queue Name') ?? 0;

 const dateStr = selD.size === 1 ? [...selD][0] : selD.size > 1 ? ([...selD].sort()[0] + ' → ' + [...selD].sort().reverse()[0]) : 'All dates';

 const text = [
  '📊 *MEEG Productivity Dashboard Summary*',
  '📅 Date: ' + dateStr,
  '═════════════════════════════',
  '• Total Submissions: ' + totalTasks.toLocaleString(),
  '• Unique Labelers: ' + uniqueLabelers.toLocaleString() + ' (by 14-digit National ID)',
  '• Avg Submit / Labeler: ' + avgSubmit,
  '• Total Unique QTC: ' + qtcCount.toLocaleString(),
  '• Active Queues: ' + activeQueues.toLocaleString(),
  '─────────────────────────────',
  '📌 Breakdown by Stage:',
  '  • Lidar FP: ' + totals.lidarFP.toLocaleString(),
  '  • Lidar QA: ' + totals.lidarQA.toLocaleString(),
  '  • Lane Line FP: ' + totals.laneFP.toLocaleString(),
  '  • Lane Line QA: ' + totals.laneQA.toLocaleString(),
  '═════════════════════════════',
  'Generated from MEEG Internal Dashboard'
 ].join('\n');

 if (navigator.clipboard && navigator.clipboard.writeText) {
  navigator.clipboard.writeText(text).then(()=>{
   showToast('✓ Summary copied to clipboard!');
  }).catch(()=>{
   fallbackCopy(text);
  });
 } else {
  fallbackCopy(text);
 }
}

function fallbackCopy(text){
 const ta = document.createElement('textarea');
 ta.value = text;
 ta.style.position = 'fixed';
 ta.style.opacity = '0';
 document.body.appendChild(ta);
 ta.select();
 try {
  document.execCommand('copy');
  showToast('✓ Summary copied to clipboard!');
 } catch(e) {
  showToast('Could not auto-copy. Please copy manually.');
 }
 ta.remove();
}

function openGuideModal(){
 let modal = $('uxGuideModal');
 if(!modal){
  modal = document.createElement('div');
  modal.id = 'uxGuideModal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'guideTitle');
  modal.innerHTML = '<div class="guide-box">'
   +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid var(--border);padding-bottom:12px">'
    +'<h3 id="guideTitle" style="margin:0;color:var(--accent);display:flex;align-items:center;gap:8px">ℹ Metrics & Dashboard Guide</h3>'
    +'<button class="btn" id="closeGuideBtn" aria-label="Close guide" style="padding:4px 10px">✕</button>'
   +'</div>'
   +'<div class="guide-content" style="font-size:13px;line-height:1.7;color:var(--text)">'
    +'<h4 style="margin:12px 0 6px;color:var(--text)">📐 Metric Definitions</h4>'
    +'<ul style="padding-left:20px;margin:0 0 16px">'
     +'<li><b>Total Submit:</b> Total rows matching current filters. Each row represents one submitted task.</li>'
     +'<li><b>Unique Labelers:</b> Distinct labelers calculated strictly using 14-digit Egyptian National ID. Incomplete or missing IDs are highlighted in notes.</li>'
     +'<li><b>Avg Submit / Labeler:</b> Total Submissions ÷ Unique Labelers. Measures productivity per individual.</li>'
     +'<li><b>Total Unique QTC:</b> Distinct Quality Controllers / QTCs present in the selection.</li>'
     +'<li><b>Active Queues:</b> Count of active task queues in the dataset.</li>'
    +'</ul>'
    +'<h4 style="margin:12px 0 6px;color:var(--text)">🚀 Work Modality & Stages</h4>'
    +'<ul style="padding-left:20px;margin:0 0 16px">'
     +'<li><b style="color:#0d9488">Lidar FP:</b> Modality = Lidar, Pass = First Pass (FP).</li>'
     +'<li><b style="color:#15b8a6">Lidar QA:</b> Modality = Lidar, Pass = Quality Assurance (QA).</li>'
     +'<li><b style="color:#ed9a35">Lane Line FP:</b> Modality = Lane Line, Pass = First Pass (FP).</li>'
     +'<li><b style="color:#e9689e">Lane Line QA:</b> Modality = Lane Line, Pass = Quality Assurance (QA).</li>'
    +'</ul>'
    +'<h4 style="margin:12px 0 6px;color:var(--text)">⌨ Shortcuts & Tips</h4>'
    +'<ul style="padding-left:20px;margin:0">'
     +'<li>Press <kbd style="background:var(--bg-3);padding:2px 6px;border-radius:4px;border:1px solid var(--border)">Esc</kbd> to close any modal, open dropdown, or drawer.</li>'
     +'<li>Press <kbd style="background:var(--bg-3);padding:2px 6px;border-radius:4px;border:1px solid var(--border)">?</kbd> anywhere to open this guide.</li>'
     +'<li>Click any table column header with <b style="color:var(--accent)">▲ / ▼</b> to sort ascending or descending.</li>'
     +'<li>Hover over any badge, chart point, or table header to see the rich glassmorphic tooltip.</li>'
    +'</ul>'
   +'</div>'
   +'<div style="text-align:right;margin-top:20px">'
    +'<button class="btn btn-c" id="closeGuideBottomBtn">Got it</button>'
   +'</div>'
  +'</div>';
  document.body.appendChild(modal);
  const hide = () => modal.classList.remove('open');
  modal.querySelector('#closeGuideBtn').onclick = hide;
  modal.querySelector('#closeGuideBottomBtn').onclick = hide;
  modal.onclick = e => { if (e.target === modal) hide(); };
 }
 modal.classList.add('open');
}

window.addEventListener('keydown', e => {
 if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
  e.preventDefault();
  openGuideModal();
 }
});


// ============================================================
// MEEG ENTERPRISE ANALYTICS FOUNDATION HELPERS
// ============================================================

function deriveFloor(unit) {
  if (!unit) return 'Unknown';
  return String(unit).trim() || 'Unknown';
}

function maskEmployeeId(rawId, pcOrName) {
  const str = String(rawId || '').trim()
    .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776))
    .replace(/\.0+$/, '').replace(/[\s-]/g, '');
  if (/^\d{14}$/.test(str)) {
    return 'EMP-***' + str.slice(-4);
  }
  if (str && str.length >= 4) {
    return 'EMP-***' + str.slice(-4);
  }
  if (pcOrName) {
    return 'PC-' + String(pcOrName).replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
  }
  return 'EMP-—';
}

function normalizeShift(sh) {
  const s = String(sh || '').trim().toLowerCase();
  if (s.includes('morning') || s === 'over shift (m)' || s === 'm') return 'Morning';
  if ((s.includes('night') && (s.includes('over') || s.includes('on'))) || s.includes('12 h') || s === 'over shift (on)') return 'Over Night';
  if (s.includes('night') || s === 'over shift (n)' || s === 'n') return 'Night';
  return String(sh || '').trim() || 'Other';
}

function isModPass(r, targetMod, targetPass) {
  const mi = hdrs.findIndex(h => h.toLowerCase() === 'modality');
  const pi = hdrs.findIndex(h => h.toLowerCase() === 'pass');
  const mod = mi < 0 ? '' : String(r[mi] || '').toLowerCase().replace(/[\s_-]+/g, '');
  const pass = pi < 0 ? '' : String(r[pi] || '').trim().toUpperCase();
  const normalizedMod = (mod === 'lidar') ? 'lidar' : (mod === 'laneline' || mod === 'lane') ? 'laneline' : mod;

  const tMod = String(targetMod || '').toLowerCase().trim();
  const tPass = String(targetPass || '').toUpperCase().trim();

  const modMatch = !tMod || tMod === 'any' || tMod === 'all' || tMod === '*' ||
    normalizedMod === tMod.replace(/[\s_-]+/g, '') ||
    (tMod.includes('lane') && normalizedMod === 'laneline');

  const passMatch = !tPass || tPass === 'any' || tPass === 'all' || tPass === '*' ||
    pass === tPass ||
    (tPass === 'FP' && (pass === 'FP' || pass === 'PASS'));

  return modMatch && passMatch;
}

function getQualityStore() {
  if (window.qualityStore && Object.keys(window.qualityStore).length) return window.qualityStore;
  try {
    const raw = localStorage.getItem('meeg_quality_store_v1') || localStorage.getItem('qualityStore');
    if (raw) {
      window.qualityStore = JSON.parse(raw);
      return window.qualityStore;
    }
  } catch(e) {}
  return window.qualityStore || {};
}

function getLabelerQuality(labelerName, email) {
  const qs = getQualityStore();
  const keys = Object.keys(qs);
  if (!keys.length) return null;
  const lLower = (labelerName || '').trim().toLowerCase();
  const eLower = (email || '').trim().toLowerCase();
  let count = 0, sumTotal = 0, sumAttr = 0, sumTva = 0, sumArt = 0;
  keys.forEach(aid => {
    const q = qs[aid];
    const info = (window.idInfo && window.idInfo[aid]) || {};
    const matchName = info.name && info.name.toLowerCase() === lLower;
    const matchEmail = (q.email && q.email.toLowerCase() === eLower) || (info.email && info.email.toLowerCase() === eLower);
    if (matchName || matchEmail) {
      const tot = typeof window.qNum === 'function' ? window.qNum(q.totalAccuracy) : parseFloat(q.totalAccuracy);
      const att = typeof window.qNum === 'function' ? window.qNum(q.attribute) : parseFloat(q.attribute);
      const tva = typeof window.qNum === 'function' ? window.qNum(q.tvaF1) : parseFloat(q.tvaF1);
      const art = typeof window.qNum === 'function' ? window.qNum(q.artifacts) : parseFloat(q.artifacts);
      if (tot !== null && !isNaN(tot)) { sumTotal += tot; count++; }
      if (att !== null && !isNaN(att)) sumAttr += att;
      if (tva !== null && !isNaN(tva)) sumTva += tva;
      if (art !== null && !isNaN(art)) sumArt += art;
    }
  });
  if (!count) return null;
  return {
    count,
    totalAccuracy: sumTotal / count,
    attribute: sumAttr / count,
    tvaF1: sumTva / count,
    artifacts: sumArt / count
  };
}

function getQtcQuality(qtcName) {
  const qs = getQualityStore();
  const keys = Object.keys(qs);
  if (!keys.length) return null;
  const qLower = (qtcName || '').trim().toLowerCase();
  let count = 0, sumTotal = 0;
  keys.forEach(aid => {
    const q = qs[aid];
    const info = (window.idInfo && window.idInfo[aid]) || {};
    const matchQtc = info.qtc && info.qtc.toLowerCase().includes(qLower);
    if (matchQtc) {
      const tot = typeof window.qNum === 'function' ? window.qNum(q.totalAccuracy) : parseFloat(q.totalAccuracy);
      if (tot !== null && !isNaN(tot)) { sumTotal += tot; count++; }
    }
  });
  if (!count) return null;
  return { count, totalAccuracy: sumTotal / count };
}

function openDrilldownModal({ title, subtitle, badge, columns, rows }) {
  let modal = document.getElementById('uxDrilldownModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'uxDrilldownModal';
    modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(15,23,42,0.65); backdrop-filter:blur(4px); z-index:99999; align-items:center; justify-content:center; padding:18px;';
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    document.body.appendChild(modal);
  }

  modal.innerHTML = '<div style="background:var(--card); border:1px solid var(--border); border-radius:16px; width:100%; max-width:920px; max-height:86vh; display:flex; flex-direction:column; box-shadow:var(--shadow-hover); overflow:hidden;">'
    + '<div style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:12px; background:var(--bg-2);">'
      + '<div>'
        + '<div style="display:flex; align-items:center; gap:8px;">'
          + '<h3 style="margin:0; font-size:16px; font-weight:700; color:var(--text);">' + esc(title) + '</h3>'
          + (badge ? '<span class="q-badge" style="background:var(--primary); color:#fff; font-size:10px;">' + esc(badge) + '</span>' : '')
        + '</div>'
        + (subtitle ? '<p style="margin:4px 0 0; font-size:12px; color:var(--text-soft);">' + esc(subtitle) + '</p>' : '')
      + '</div>'
      + '<button type="button" class="btn" id="closeDrilldownModalBtn" style="font-size:18px; line-height:1; padding:4px 10px; cursor:pointer;">&times;</button>'
    + '</div>'
    + '<div style="padding:12px 20px; border-bottom:1px solid var(--border-light); display:flex; justify-content:space-between; align-items:center; gap:10px; background:var(--bg-1);">'
      + '<input type="text" id="drilldownSearch" placeholder="🔍 Search records..." style="padding:6px 12px; border-radius:8px; border:1px solid var(--border); font-size:12px; width:260px; background:var(--bg-3); color:var(--text);">'
      + '<span class="ux-note" id="drilldownCount">' + rows.length.toLocaleString() + ' total records</span>'
    + '</div>'
    + '<div style="padding:16px 20px; overflow-y:auto; flex:1;" id="drilldownBody">'
      + '<div class="perf-table">'
        + '<table id="drilldownTable">'
          + '<thead><tr>' + columns.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead>'
          + '<tbody>'
            + rows.slice(0, 100).map(r => '<tr>' + r.map(cell => '<td>' + cell + '</td>').join('') + '</tr>').join('')
          + '</tbody>'
        + '</table>'
        + (rows.length > 100 ? '<div style="text-align:center; padding:12px; font-size:12px; color:var(--muted);">Showing first 100 of ' + rows.length.toLocaleString() + ' records</div>' : '')
        + (!rows.length ? '<div class="ux-empty">No detailed records found.</div>' : '')
      + '</div>'
    + '</div>'
  + '</div>';

  modal.style.display = 'flex';
  const closeBtn = modal.querySelector('#closeDrilldownModalBtn');
  if (closeBtn) closeBtn.onclick = () => { modal.style.display = 'none'; };

  const searchInput = modal.querySelector('#drilldownSearch');
  if (searchInput) {
    searchInput.oninput = (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = q ? rows.filter(r => r.some(cell => String(cell).toLowerCase().includes(q))) : rows;
      const tbody = modal.querySelector('#drilldownTable tbody');
      if (tbody) {
        tbody.innerHTML = filtered.slice(0, 100).map(r => '<tr>' + r.map(cell => '<td>' + cell + '</td>').join('') + '</tr>').join('');
      }
      const countEl = modal.querySelector('#drilldownCount');
      if (countEl) countEl.textContent = filtered.length.toLocaleString() + ' matching records';
    };
  }
}

const targetSimState = {
  dailyTarget: 50,
  shiftTarget: 25,
  modality: 'all',
  workHours: 8,
  workforceSize: 120
};

let dailyReportSection = 'quality'; // 'quality' or 'daily'
let dailyReportDateA = '';
let dailyReportDateB = '';
let dailyReportCompareMode = false;

const analysisFilters={from:'',to:'',modality:'all',shift:'',unit:'',qtc:'',category:'',chartCategory:'all'};
const perfFilters={from:'',to:'',day:'',week:'',category:'',query:'',person:'',page:0};

let _shiftReportViewMode = 'queues'; // 'queues' | 'floors' | 'floor_summary' | 'qcs' | 'labelers'
window._setShiftReportViewMode = function(mode) { _shiftReportViewMode = mode; };
window._getShiftReportViewMode = function() { return _shiftReportViewMode; };

const gmReportFilters = { query: '', shift: '', floor: '', modality: 'all', from: '', to: '', sortCol: 'id', sortAsc: true };
const shiftCompFilters = { shiftA: 'all', shiftB: 'all', floor: '', modality: 'all', from: '', to: '', subTab: 'floor', query: '' };
const queuesFilters={query:'',shift:'',floor:'',category:'',sortCol:'totalSubmit',sortAsc:false,page:0,pageSize:25};
const queuesChartFilters={queue:'all',stage:'all',from:'',to:'',day:''};
const qtcFloorFilters={query:'',qtc:'',floor:'',shift:'',category:'',sortCol:'totalSubmit',sortAsc:false,page:0,pageSize:25};
const floorPerformanceFilters={sortCol:'totalSubmit',sortAsc:false,page:0,pageSize:15};
let view='both';let target=0;try{target=Math.max(0,Number(localStorage.getItem('meeg_personal_target'))||0);}catch(e){}
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const isUnified=!!document.getElementById('mainSidebar');
const panelAnalytics=document.getElementById('panelAnalytics');
const targetContainer=panelAnalytics || document.body;

// Hide legacy DOM elements completely from view
document.querySelectorAll('#shiftBanner, #fstrip, .pills-row, #locTabs, #mainContent, #cmpBar').forEach(el => {
  el.style.setProperty('display', 'none', 'important');
  el.classList.add('legacy-analytics-hidden');
});

const overview=document.createElement('section');
overview.className='ux-overview ux-workspace-page';
overview.id='uxOverview';
targetContainer.appendChild(overview);

const analysis=document.createElement('section');
analysis.id='uxAnalysis';
analysis.className='ux-workspace-page';
analysis.hidden=true;
analysis.style.display='none';
targetContainer.appendChild(analysis);

const performance=document.createElement('section');
performance.id='uxPerformance';
performance.className='ux-workspace-page';
performance.hidden=true;
performance.style.display='none';
targetContainer.appendChild(performance);

const dailyPage=document.createElement('section');
dailyPage.id='uxDaily';
dailyPage.className='ux-workspace-page';
dailyPage.hidden=true;
dailyPage.style.display='none';
targetContainer.appendChild(dailyPage);

const queuesPage=document.createElement('section');
queuesPage.id='uxQueues';
queuesPage.className='ux-workspace-page';
queuesPage.hidden=true;
queuesPage.style.display='none';
targetContainer.appendChild(queuesPage);

const qtcFloorPage=document.createElement('section');
qtcFloorPage.id='uxQtcFloor';
qtcFloorPage.className='ux-workspace-page';
qtcFloorPage.hidden=true;
qtcFloorPage.style.display='none';
targetContainer.appendChild(qtcFloorPage);

const gmReportPage=document.createElement('section');
gmReportPage.id='uxGmReport';
gmReportPage.className='ux-workspace-page';
gmReportPage.hidden=true;
gmReportPage.style.display='none';
targetContainer.appendChild(gmReportPage);

const shiftComparisonPage=document.createElement('section');
shiftComparisonPage.id='uxShiftComparison';
shiftComparisonPage.className='ux-workspace-page';
shiftComparisonPage.hidden=true;
shiftComparisonPage.style.display='none';
targetContainer.appendChild(shiftComparisonPage);

const advancedInsightsPage=document.createElement('section');
advancedInsightsPage.id='uxAdvancedInsights';
advancedInsightsPage.className='ux-workspace-page';
advancedInsightsPage.hidden=true;
advancedInsightsPage.style.display='none';
targetContainer.appendChild(advancedInsightsPage);

const root=overview;

const aside=document.createElement('aside');aside.className='ux-sidebar';aside.setAttribute('aria-label','Main navigation');aside.innerHTML='<div class="ux-brand"><div class="brand-logo-card"><img src="logo.jpg" alt="MEEG - Micro Engineering Egypt" class="brand-img"></div><span class="brand-workspace-tag">PRODUCTIVITY WORKSPACE</span></div><small>WORKSPACE</small><button class="ux-nav active" data-page="dashboard">▦ &nbsp; Overview</button><button class="ux-nav" data-page="analysis">◈ &nbsp; Analysis</button><button class="ux-nav" data-page="queues">☷ &nbsp; Queues Analysis</button><button class="ux-nav" data-page="gm_report">📊 &nbsp; GM Report</button><button class="ux-nav" data-page="shift_comparison">⚖️ &nbsp; Shift Comparison</button><button class="ux-nav" data-page="performance">▤ &nbsp; Performance per Labelers</button><button class="ux-nav" data-page="qtcfloor">🏢 &nbsp; Performance per QTC & Floor</button><button class="ux-nav" data-page="daily">▦ &nbsp; Daily Report</button><button class="ux-nav" data-page="advanced_insights">🔮 &nbsp; Advanced Insights</button><footer>Connected to your existing data<br><span style="display:block;margin-top:8px">MEEG · Internal Dashboard</span></footer>';
if (isUnified) {
  aside.style.display = 'none';
}
document.body.appendChild(aside);

const menu=document.createElement('button');menu.className='btn ux-mobile';menu.textContent='☰ Menu';menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open navigation');
if (isUnified) {
  menu.style.display = 'none';
} else {
  document.body.prepend(menu);
}

const backdrop=document.createElement('button');backdrop.className='ux-backdrop';backdrop.setAttribute('aria-label','Close navigation');
if (isUnified) {
  backdrop.style.display = 'none';
} else {
  document.body.appendChild(backdrop);
}

function closeNav(){document.body.classList.remove('ux-sidebar-open');menu.setAttribute('aria-expanded','false');}
menu.onclick=()=>{const open=document.body.classList.toggle('ux-sidebar-open');menu.setAttribute('aria-expanded',String(open));if(open)aside.querySelector('button').focus();};backdrop.onclick=closeNav;
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeNav();menu.focus();}});

function resolveAnalyticsPageKey(target) {
  let raw = target || location.hash || (typeof _activeTab !== 'undefined' ? _activeTab : '#dashboard');
  let clean = String(raw).toLowerCase().trim().replace(/^[#\/]+/, '').split('?')[0].split('&')[0];

  if (['gm-report', 'gm_report', 'gmreport'].includes(clean)) return 'gm_report';
  if (['shift-comparison', 'shift_comparison', 'shiftcomparison'].includes(clean)) return 'shift_comparison';
  if (['analysis-overview', 'analysis_overview', 'analysis'].includes(clean)) return 'analysis';
  if (['queues-analysis', 'queues_analysis', 'queues'].includes(clean)) return 'queues';
  if (['performance-labelers', 'performance_labelers', 'performance'].includes(clean)) return 'performance';
  if (['performance-qtc-floor', 'performance_qtc_floor', 'qtcfloor', 'qtc_floor'].includes(clean)) return 'qtcfloor';
  if (['daily-report', 'daily_report', 'daily'].includes(clean)) return 'daily';
  if (['advanced-insights', 'advanced_insights', 'insights', 'analytics-insights'].includes(clean)) return 'advanced_insights';
  return 'dashboard';
}

function route(forcedTarget){
  const current = resolveAnalyticsPageKey(forcedTarget);
  const targetHashMap = {
    'dashboard': '#dashboard',
    'analysis': '#analysis-overview',
    'queues': '#queues-analysis',
    'gm_report': '#gm-report',
    'shift_comparison': '#shift-comparison',
    'performance': '#performance-labelers',
    'qtcfloor': '#performance-qtc-floor',
    'daily': '#daily-report',
    'advanced_insights': '#advanced-insights'
  };

  const expectedHash = targetHashMap[current] || '#dashboard';
  if (location.hash !== expectedHash) {
    try {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', expectedHash);
      } else {
        location.hash = expectedHash;
      }
    } catch(e) {
      location.hash = expectedHash;
    }
  }

  overview.hidden = (current !== 'dashboard');
  overview.style.display = (current === 'dashboard') ? 'block' : 'none';

  analysis.hidden = (current !== 'analysis');
  analysis.style.display = (current === 'analysis') ? 'block' : 'none';

  queuesPage.hidden = (current !== 'queues');
  queuesPage.style.display = (current === 'queues') ? 'block' : 'none';

  gmReportPage.hidden = (current !== 'gm_report');
  gmReportPage.style.display = (current === 'gm_report') ? 'block' : 'none';

  shiftComparisonPage.hidden = (current !== 'shift_comparison');
  shiftComparisonPage.style.display = (current === 'shift_comparison') ? 'block' : 'none';

  performance.hidden = (current !== 'performance');
  performance.style.display = (current === 'performance') ? 'block' : 'none';

  qtcFloorPage.hidden = (current !== 'qtcfloor');
  qtcFloorPage.style.display = (current === 'qtcfloor') ? 'block' : 'none';

  dailyPage.hidden = (current !== 'daily');
  dailyPage.style.display = (current === 'daily') ? 'block' : 'none';

  if (typeof advancedInsightsPage !== 'undefined' && advancedInsightsPage) {
    advancedInsightsPage.hidden = (current !== 'advanced_insights');
    advancedInsightsPage.style.display = (current === 'advanced_insights') ? 'block' : 'none';
  }

  document.querySelectorAll('#shiftBanner, #fstrip, .pills-row, #locTabs, #mainContent, #cmpBar').forEach(el => {
    el.style.setProperty('display', 'none', 'important');
  });

  if(aside){
    aside.querySelectorAll('[data-page]').forEach(b=>{
      const active=b.dataset.page===current;
      b.classList.toggle('active',active);
      if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
    });
  }
  closeNav();
  if(current==='queues'&&typeof renderQueuesAnalysis==='function')renderQueuesAnalysis();
  else if(current==='gm_report'&&typeof renderGmReport==='function')renderGmReport();
  else if(current==='shift_comparison'&&typeof renderShiftComparison==='function')renderShiftComparison();
  else if(current==='analysis'&&typeof renderAnalysis==='function')renderAnalysis();
  else if(current==='performance'&&typeof renderPerformance==='function')renderPerformance();
  else if(current==='qtcfloor'&&typeof renderQtcFloorPerformance==='function')renderQtcFloorPerformance();
  else if(current==='daily'&&typeof renderDailyReport==='function')renderDailyReport();
  else if(current==='advanced_insights'&&typeof renderAdvancedInsights==='function')renderAdvancedInsights();
  else if(typeof renderOverview==='function')renderOverview();

  if(!window.rawRows || !window.rawRows.length){
    if(typeof loadData==='function' && typeof getAuthToken==='function' && getAuthToken()) loadData();
  }
}

window.resolveAnalyticsPageKey = resolveAnalyticsPageKey;
window.route = route;
window.switchAnalyticsWorkspace = function(hashOrKey) {
  route(hashOrKey);
};

aside.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{location.hash=b.dataset.page==='analysis'?'analysis-overview':b.dataset.page==='queues'?'queues-analysis':b.dataset.page==='gm_report'?'gm-report':b.dataset.page==='shift_comparison'?'shift-comparison':b.dataset.page==='performance'?'performance-labelers':b.dataset.page==='qtcfloor'?'performance-qtc-floor':b.dataset.page==='daily'?'daily-report':b.dataset.page==='advanced_insights'?'advanced-insights':'dashboard';});
const uxBackEl = $('uxBack'); if (uxBackEl) uxBackEl.onclick = () => { if (typeof switchTab === 'function') switchTab('overview'); else location.hash = 'dashboard'; };
$('uxSideRefresh')?.addEventListener('click',()=>loadData());$('uxSideTheme')?.addEventListener('click',()=>toggleDark());window.addEventListener('hashchange',route);

// ============================================================
// GLOBAL UNIFIED OPERATIONAL FILTERS (Across all 8 pages)
// ============================================================
const globalUnifiedFilters = {
  date: '',    // YYYY-MM-DD for single day
  from: '',    // YYYY-MM-DD
  to: '',      // YYYY-MM-DD
  floor: '',   // Unit / Floor
  qtc: '',     // QTC Supervisor Name
  shift: '',   // Shift Name
  queue: '',   // Queue Name
  labeler: '', // Labeler Name
  modality: '',// 'lidar' | 'laneline'
  pass: ''     // 'FP' | 'QA'
};

function toggleGlobalFilter(field, val) {
  if (!field) return;
  const target = String(val || '').trim();
  if (globalUnifiedFilters[field] === target) {
    globalUnifiedFilters[field] = '';
  } else {
    globalUnifiedFilters[field] = target;
  }
  applyGlobalFilters();
}
window.toggleGlobalFilter = toggleGlobalFilter;

function getGlobalFilterOptions() {
  const source = (typeof rawRows !== 'undefined' && rawRows && rawRows.length) ? rawRows : ((window.rawRows && window.rawRows.length) ? window.rawRows : ((typeof fcache !== 'undefined' && fcache) ? fcache : []));
  const idx = name => hdrs ? hdrs.findIndex(h => h.trim().toLowerCase() === name.toLowerCase()) : -1;
  const si = idx('shift');
  const fi = hdrs ? hdrs.findIndex(h => ['floor', 'unit'].includes(h.trim().toLowerCase())) : -1;
  const qi = hdrs ? hdrs.findIndex(h => ['qtc name', 'qtc', 'supervisor'].includes(h.trim().toLowerCase())) : -1;
  const mi = hdrs ? hdrs.findIndex(h => ['modality', 'mod'].includes(h.trim().toLowerCase())) : -1;
  const pi = hdrs ? hdrs.findIndex(h => ['pass', 'stage'].includes(h.trim().toLowerCase())) : -1;

  const shifts = [...new Set(source.map(r => si >= 0 ? String(r[si] || '').trim() : '').filter(Boolean))].sort();
  const floors = [...new Set(source.map(r => fi >= 0 ? deriveFloor(r[fi]) : '').filter(Boolean))].sort();
  const qtcs = [...new Set(source.map(r => qi >= 0 ? String(r[qi] || '').trim() : '').filter(Boolean))].sort();
  const dates = [...new Set(source.map(r => typeof rDate === 'function' ? rDate(r) : '').filter(Boolean))].sort();
  const modalities = [...new Set(source.map(r => mi >= 0 ? String(r[mi] || '').trim() : '').filter(Boolean))].sort();
  const rawPasses = [...new Set(source.map(r => pi >= 0 ? String(r[pi] || '').trim().toUpperCase() : '').filter(Boolean))].sort();
  const validPasses = rawPasses.filter(p => ['FP', 'QA'].includes(p));
  const passes = validPasses.length ? validPasses : rawPasses;

  return { shifts, floors, qtcs, dates, modalities, passes, totalTasks: source.length };
}

function renderUniversalFilterBar(pageKey) {
  const opts = getGlobalFilterOptions();
  const filteredRows = rowsInView();
  const filteredCount = filteredRows.length;
  const totalCount = opts.totalTasks;
  const pct = totalCount > 0 ? ((filteredCount / totalCount) * 100).toFixed(1) : '100';

  const cToday = cairoToday();
  const isToday = globalUnifiedFilters.date === cToday;
  const isYesterday = globalUnifiedFilters.date === _addDays(cToday, -1);
  const isAllDays = !globalUnifiedFilters.date && !globalUnifiedFilters.from && !globalUnifiedFilters.to;

  const hasAnyFilter = Boolean(
    globalUnifiedFilters.date || globalUnifiedFilters.from || globalUnifiedFilters.to ||
    globalUnifiedFilters.floor || globalUnifiedFilters.qtc || globalUnifiedFilters.shift ||
    globalUnifiedFilters.queue || globalUnifiedFilters.labeler || globalUnifiedFilters.modality || globalUnifiedFilters.pass
  );

  let activeTagsHtml = '';
  if (hasAnyFilter) {
    activeTagsHtml = '<div class="uf-tags-strip">'
      + '<span class="uf-tags-lbl">Active Filters:</span>'
      + (globalUnifiedFilters.date ? '<span class="uf-tag">📅 Date: <b>' + esc(globalUnifiedFilters.date) + '</b> <button type="button" class="uf-tag-del" data-clear="date">✕</button></span>' : '')
      + (globalUnifiedFilters.from ? '<span class="uf-tag">From: <b>' + esc(globalUnifiedFilters.from) + '</b> <button type="button" class="uf-tag-del" data-clear="from">✕</button></span>' : '')
      + (globalUnifiedFilters.to ? '<span class="uf-tag">To: <b>' + esc(globalUnifiedFilters.to) + '</b> <button type="button" class="uf-tag-del" data-clear="to">✕</button></span>' : '')
      + (globalUnifiedFilters.floor ? '<span class="uf-tag">🏢 Floor: <b>' + esc(globalUnifiedFilters.floor) + '</b> <button type="button" class="uf-tag-del" data-clear="floor">✕</button></span>' : '')
      + (globalUnifiedFilters.qtc ? '<span class="uf-tag">👤 QTC: <b>' + esc(globalUnifiedFilters.qtc) + '</b> <button type="button" class="uf-tag-del" data-clear="qtc">✕</button></span>' : '')
      + (globalUnifiedFilters.shift ? '<span class="uf-tag">⏱️ Shift: <b>' + esc(globalUnifiedFilters.shift) + '</b> <button type="button" class="uf-tag-del" data-clear="shift">✕</button></span>' : '')
      + (globalUnifiedFilters.queue ? '<span class="uf-tag">🗂️ Queue: <b>' + esc(globalUnifiedFilters.queue) + '</b> <button type="button" class="uf-tag-del" data-clear="queue">✕</button></span>' : '')
      + (globalUnifiedFilters.labeler ? '<span class="uf-tag">👤 Labeler: <b>' + esc(globalUnifiedFilters.labeler) + '</b> <button type="button" class="uf-tag-del" data-clear="labeler">✕</button></span>' : '')
      + (globalUnifiedFilters.modality ? '<span class="uf-tag">📦 Modality: <b>' + esc(globalUnifiedFilters.modality.toUpperCase()) + '</b> <button type="button" class="uf-tag-del" data-clear="modality">✕</button></span>' : '')
      + (globalUnifiedFilters.pass ? '<span class="uf-tag">🎯 Pass: <b>' + esc(globalUnifiedFilters.pass) + '</b> <button type="button" class="uf-tag-del" data-clear="pass">✕</button></span>' : '')
      + '<button type="button" class="uf-clear-all-link" id="ufClearAllLink_' + pageKey + '">Clear All Filters</button>'
      + '</div>';
  }

  return '<div class="universal-filter-panel" data-uf-page="' + pageKey + '">'
    + '<div class="uf-header-row">'
      + '<div class="uf-header-left">'
        + '<span class="uf-header-badge">⚡ Universal Operational Filters</span>'
        + '<span class="uf-stats-badge ' + (hasAnyFilter ? 'active-filter-badge' : '') + '">'
          + 'Showing <b>' + filteredCount.toLocaleString() + '</b> of <b>' + totalCount.toLocaleString() + '</b> tasks (' + pct + '%)'
        + '</span>'
      + '</div>'
      + '<div class="uf-header-right">'
        + (hasAnyFilter ? '<button type="button" class="btn btn-sm btn-uf-reset" id="ufResetBtn_' + pageKey + '">↺ Reset All Filters</button>' : '')
      + '</div>'
    + '</div>'

    + '<div class="uf-grid-controls">'
      // 1. Date Picker (Any day) & Presets & Custom Range
      + '<div class="uf-ctrl-box uf-ctrl-date">'
        + '<label class="uf-ctrl-lbl" for="ufDate_' + pageKey + '">📅 Specific Date:</label>'
        + '<div class="uf-date-actions-wrap">'
          + '<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">'
            + '<input type="date" class="uf-input-date" id="ufDate_' + pageKey + '" value="' + esc(globalUnifiedFilters.date) + '" title="Select any date to filter all data">'
            + '<div class="uf-presets-group">'
              + '<button type="button" class="uf-preset-btn ' + (isToday ? 'active' : '') + '" data-uf-date-preset="today">Today</button>'
              + '<button type="button" class="uf-preset-btn ' + (isYesterday ? 'active' : '') + '" data-uf-date-preset="yesterday">Yesterday</button>'
              + '<button type="button" class="uf-preset-btn ' + (isAllDays ? 'active' : '') + '" data-uf-date-preset="all">All</button>'
            + '</div>'
          + '</div>'
          + '<div style="display:flex; gap:6px; align-items:center; margin-top:4px;">'
            + '<span style="font-size:11px; color:var(--text-soft); white-space:nowrap;">Or Range: From:</span>'
            + '<input type="date" class="uf-input-date-sm" id="ufFrom_' + pageKey + '" value="' + esc(globalUnifiedFilters.from) + '" title="From date">'
            + '<span style="font-size:11px; color:var(--text-soft);">To:</span>'
            + '<input type="date" class="uf-input-date-sm" id="ufTo_' + pageKey + '" value="' + esc(globalUnifiedFilters.to) + '" title="To date">'
          + '</div>'
        + '</div>'
      + '</div>'

      // 2. Floor (= Unit) Dropdown
      + '<div class="uf-ctrl-box">'
        + '<label class="uf-ctrl-lbl" for="ufFloor_' + pageKey + '">🏢 Floor / Unit:</label>'
        + '<select class="uf-input-select" id="ufFloor_' + pageKey + '">'
          + '<option value="">🏢 All Floors / Units</option>'
          + opts.floors.map(f => '<option value="' + esc(f) + '" ' + (globalUnifiedFilters.floor === f ? 'selected' : '') + '>' + esc(f) + '</option>').join('')
        + '</select>'
      + '</div>'

      // 3. QTC Supervisor Dropdown
      + '<div class="uf-ctrl-box">'
        + '<label class="uf-ctrl-lbl" for="ufQtc_' + pageKey + '">👤 QTC Supervisor:</label>'
        + '<select class="uf-input-select" id="ufQtc_' + pageKey + '">'
          + '<option value="">👤 All QTCs</option>'
          + opts.qtcs.map(q => '<option value="' + esc(q) + '" ' + (globalUnifiedFilters.qtc === q ? 'selected' : '') + '>' + esc(q) + '</option>').join('')
        + '</select>'
      + '</div>'

      // 4. Shift Dropdown
      + '<div class="uf-ctrl-box">'
        + '<label class="uf-ctrl-lbl" for="ufShift_' + pageKey + '">⏱️ Shift:</label>'
        + '<select class="uf-input-select" id="ufShift_' + pageKey + '">'
          + '<option value="">⏱️ All Shifts</option>'
          + opts.shifts.map(s => '<option value="' + esc(s) + '" ' + (globalUnifiedFilters.shift === s ? 'selected' : '') + '>' + esc(s) + '</option>').join('')
        + '</select>'
      + '</div>'
      // 5. Modality Dropdown
      + '<div class="uf-ctrl-box">'
        + '<label class="uf-ctrl-lbl" for="ufModality_' + pageKey + '">📦 Modality:</label>'
        + '<select class="uf-input-select" id="ufModality_' + pageKey + '">'
          + '<option value="">📦 All Modalities</option>'
          + (opts.modalities || []).map(m => '<option value="' + esc(m) + '" ' + (globalUnifiedFilters.modality && globalUnifiedFilters.modality.toLowerCase() === m.toLowerCase() ? 'selected' : '') + '>' + esc(m) + '</option>').join('')
        + '</select>'
      + '</div>'

      // 6. Pass Type Dropdown
      + '<div class="uf-ctrl-box">'
        + '<label class="uf-ctrl-lbl" for="ufPass_' + pageKey + '">🎯 Pass Type:</label>'
        + '<select class="uf-input-select" id="ufPass_' + pageKey + '">'
          + '<option value="">🎯 All Passes (FP & QA)</option>'
          + ((opts.passes && opts.passes.length) ? opts.passes : ['FP', 'QA']).map(p => '<option value="' + esc(p) + '" ' + (globalUnifiedFilters.pass && globalUnifiedFilters.pass.toUpperCase() === p.toUpperCase() ? 'selected' : '') + '>' + (p === 'FP' ? 'FP (First Pass)' : (p === 'QA' ? 'QA (Quality)' : esc(p))) + '</option>').join('')
        + '</select>'
      + '</div>'
    + '</div>'

    + activeTagsHtml
  + '</div>';
}

function bindUniversalFilterBar(container, pageKey) {
  if (!container) return;
  const panel = container.querySelector('.universal-filter-panel[data-uf-page="' + pageKey + '"]');
  if (!panel) return;

  const dateInput = panel.querySelector('#ufDate_' + pageKey);
  if (dateInput) {
    dateInput.onchange = (e) => {
      globalUnifiedFilters.date = e.target.value.trim();
      globalUnifiedFilters.from = '';
      globalUnifiedFilters.to = '';
      applyGlobalFilters();
    };
  }

  const fromInput = panel.querySelector('#ufFrom_' + pageKey);
  if (fromInput) {
    fromInput.onchange = (e) => {
      globalUnifiedFilters.from = e.target.value.trim();
      globalUnifiedFilters.date = '';
      applyGlobalFilters();
    };
  }

  const toInput = panel.querySelector('#ufTo_' + pageKey);
  if (toInput) {
    toInput.onchange = (e) => {
      globalUnifiedFilters.to = e.target.value.trim();
      globalUnifiedFilters.date = '';
      applyGlobalFilters();
    };
  }

  panel.querySelectorAll('[data-uf-date-preset]').forEach(btn => {
    btn.onclick = () => {
      const preset = btn.dataset.ufDatePreset;
      if (preset === 'today') {
        globalUnifiedFilters.date = cairoToday();
      } else if (preset === 'yesterday') {
        globalUnifiedFilters.date = _addDays(cairoToday(), -1);
      } else if (preset === 'all') {
        globalUnifiedFilters.date = '';
      }
      globalUnifiedFilters.from = '';
      globalUnifiedFilters.to = '';
      applyGlobalFilters();
    };
  });

  const floorSelect = panel.querySelector('#ufFloor_' + pageKey);
  if (floorSelect) {
    floorSelect.onchange = (e) => {
      globalUnifiedFilters.floor = e.target.value.trim();
      applyGlobalFilters();
    };
  }

  const qtcSelect = panel.querySelector('#ufQtc_' + pageKey);
  if (qtcSelect) {
    qtcSelect.onchange = (e) => {
      globalUnifiedFilters.qtc = e.target.value.trim();
      applyGlobalFilters();
    };
  }

  const shiftSelect = panel.querySelector('#ufShift_' + pageKey);
  if (shiftSelect) {
    shiftSelect.onchange = (e) => {
      globalUnifiedFilters.shift = e.target.value.trim();
      applyGlobalFilters();
    };
  }

  const modSelect = panel.querySelector('#ufModality_' + pageKey);
  if (modSelect) {
    modSelect.onchange = (e) => {
      globalUnifiedFilters.modality = e.target.value.trim();
      applyGlobalFilters();
    };
  }

  const passSelect = panel.querySelector('#ufPass_' + pageKey);
  if (passSelect) {
    passSelect.onchange = (e) => {
      globalUnifiedFilters.pass = e.target.value.trim();
      applyGlobalFilters();
    };
  }

  panel.querySelectorAll('.uf-tag-del[data-clear]').forEach(btn => {
    btn.onclick = () => {
      const k = btn.dataset.clear;
      if (k in globalUnifiedFilters) {
        globalUnifiedFilters[k] = '';
      }
      applyGlobalFilters();
    };
  });

  const resetBtn = panel.querySelector('#ufResetBtn_' + pageKey);
  if (resetBtn) {
    resetBtn.onclick = () => resetUniversalFilters();
  }
  const clearLink = panel.querySelector('#ufClearAllLink_' + pageKey);
  if (clearLink) {
    clearLink.onclick = () => resetUniversalFilters();
  }
}

function resetUniversalFilters() {
  globalUnifiedFilters.date = '';
  globalUnifiedFilters.from = '';
  globalUnifiedFilters.to = '';
  globalUnifiedFilters.floor = '';
  globalUnifiedFilters.qtc = '';
  globalUnifiedFilters.shift = '';
  globalUnifiedFilters.queue = '';
  globalUnifiedFilters.labeler = '';
  globalUnifiedFilters.modality = '';
  globalUnifiedFilters.pass = '';
  applyGlobalFilters();
  if (typeof showToast === 'function') {
    showToast('✓ All operational filters reset');
  }
}

function applyGlobalFilters() {
  if (typeof route === 'function') {
    route();
  }
}

function rowsInView(){
  const allData = (typeof rawRows !== 'undefined' && rawRows && rawRows.length) ? rawRows : ((window.rawRows && window.rawRows.length) ? window.rawRows : ((typeof fcache !== 'undefined' && fcache) ? fcache : []));
  let rows = activeLoc && !activeLoc.startsWith('__') && locColIdx >= 0
    ? allData.filter(r => String(r[locColIdx]||'').trim() === activeLoc)
    : allData;

  if (!rows || !rows.length) return [];

  const idx = name => hdrs ? hdrs.findIndex(h => h.trim().toLowerCase() === name.toLowerCase()) : -1;
  const si = idx('shift');
  const fi = hdrs ? hdrs.findIndex(h => ['floor', 'unit'].includes(h.trim().toLowerCase())) : -1;
  const qi = hdrs ? hdrs.findIndex(h => ['qtc name', 'qtc', 'supervisor'].includes(h.trim().toLowerCase())) : -1;
  const queueIdx = hdrs ? hdrs.findIndex(h => ['queue name', 'queue'].includes(h.trim().toLowerCase())) : -1;
  const modIdx = hdrs ? hdrs.findIndex(h => ['modality', 'mod'].includes(h.trim().toLowerCase())) : -1;
  const passIdx = hdrs ? hdrs.findIndex(h => ['pass', 'stage'].includes(h.trim().toLowerCase())) : -1;
  const labIdx = hdrs ? hdrs.findIndex(h => ['labeler name', 'labeler'].includes(h.trim().toLowerCase())) : -1;

  return rows.filter(r => {
    const d = typeof rDate === 'function' ? rDate(r) : '';
    // Date filter: exact date match if selected
    if (globalUnifiedFilters.date) {
      if (!d || d !== globalUnifiedFilters.date) return false;
    } else {
      if (globalUnifiedFilters.from && d && d < globalUnifiedFilters.from) return false;
      if (globalUnifiedFilters.to && d && d > globalUnifiedFilters.to) return false;
    }
    // Shift filter
    if (globalUnifiedFilters.shift && si >= 0 && String(r[si] || '').trim() !== globalUnifiedFilters.shift) return false;
    // Floor filter (Floor == Unit)
    if (globalUnifiedFilters.floor && fi >= 0 && deriveFloor(r[fi]) !== globalUnifiedFilters.floor) return false;
    // QTC filter
    if (globalUnifiedFilters.qtc && qi >= 0 && String(r[qi] || '').trim() !== globalUnifiedFilters.qtc) return false;
    // Queue filter
    if (globalUnifiedFilters.queue && queueIdx >= 0 && String(r[queueIdx] || '').trim() !== globalUnifiedFilters.queue) return false;
    // Modality filter
    if (globalUnifiedFilters.modality && modIdx >= 0) {
      const m = String(r[modIdx] || '').toLowerCase().replace(/[\s_-]+/g, '');
      const targetM = globalUnifiedFilters.modality.toLowerCase().replace(/[\s_-]+/g, '');
      if (!m.includes(targetM)) return false;
    }
    // Pass filter
    if (globalUnifiedFilters.pass && passIdx >= 0 && String(r[passIdx] || '').trim().toUpperCase() !== globalUnifiedFilters.pass.toUpperCase()) return false;
    // Labeler filter
    if (globalUnifiedFilters.labeler && labIdx >= 0 && String(r[labIdx] || '').trim().toLowerCase() !== globalUnifiedFilters.labeler.toLowerCase()) return false;

    return true;
  });
}

window.globalUnifiedFilters = globalUnifiedFilters;
window.getGlobalFilterOptions = getGlobalFilterOptions;
window.renderUniversalFilterBar = renderUniversalFilterBar;
window.bindUniversalFilterBar = bindUniversalFilterBar;
window.resetUniversalFilters = resetUniversalFilters;
window.applyGlobalFilters = applyGlobalFilters;
window.rowsInView = rowsInView;
function uniq(rows,name){const i=hdrs.findIndex(h=>h.toLowerCase()===name.toLowerCase());return i<0?null:new Set(rows.map(r=>String(r[i]||'').trim()).filter(Boolean)).size;}
function daily(rows){const map=new Map();rows.forEach(r=>{const d=rDate(r);if(d)map.set(d,(map.get(d)||0)+1);});return [...map].sort(([a],[b])=>a.localeCompare(b));}
function spark(points){if(!points.length)return '';const max=Math.max(1,...points.map(p=>p[1]));return '<svg class="ux-spark" viewBox="0 0 200 32" preserveAspectRatio="none" aria-label="Daily submission trend"><polyline fill="none" stroke="currentColor" stroke-width="2.5" points="'+points.map((p,i)=>(points.length===1?100:i/(points.length-1)*200)+','+(30-p[1]/max*26)).join(' ')+'"/></svg>';}
function animate(){overview.querySelectorAll('[data-count]').forEach(el=>{const value=Number(el.dataset.count);if(reduced()){el.textContent=value.toLocaleString();return;}const begin=performance.now();function tick(t){const p=Math.min(1,(t-begin)/650);el.textContent=Math.round(value*(1-Math.pow(1-p,3))).toLocaleString();if(p<1&&el.isConnected)requestAnimationFrame(tick);}requestAnimationFrame(tick);});}
function applyView(){root.classList.toggle('ux-summary-hidden',view==='details');root.classList.toggle('ux-details-hidden',view==='summary');overview.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.view===view)));}
function resetAllFilters(){
 globalUnifiedFilters.date = ''; globalUnifiedFilters.from = ''; globalUnifiedFilters.to = ''; globalUnifiedFilters.floor = ''; globalUnifiedFilters.qtc = ''; globalUnifiedFilters.shift = '';
 selD.clear();selWeeks.clear();
 Object.keys(sel).forEach(k=>sel[k].clear());
 Object.assign(analysisFilters,{from:'',to:'',modality:'all',shift:'',unit:'',qtc:'',category:'',chartCategory:'all'});
 Object.assign(queuesFilters,{query:'',shift:'',floor:'',category:'',sortCol:'totalSubmit',sortAsc:false,page:0});
 Object.assign(queuesChartFilters,{queue:'all',stage:'all',from:'',to:'',day:''});
 Object.assign(perfFilters,{from:'',to:'',day:'',week:'',category:'',query:'',person:'',page:0});
 Object.assign(qtcFloorFilters,{query:'',qtc:'',floor:'',shift:'',category:'',sortCol:'totalSubmit',sortAsc:false,page:0});
 Object.assign(floorPerformanceFilters,{sortCol:'totalSubmit',sortAsc:false,page:0});
 if(typeof setShiftsUI==='function')setShiftsUI({});
 const idInput=$('idFilterInput');if(idInput)idInput.value='';
 idFilter='';timeFrom='';timeTo='';timePreset='';activeLoc='__all__';
 if(typeof closeAll==='function')closeAll();
 if(typeof buildStrip==='function')buildStrip();
 if(typeof applyAll==='function')applyAll();
 renderAllSections();
 showToast('✓ All filters have been reset');
}

function renderHeaderControlsHTML(prefix='ux'){
 return '<div class="ux-header-actions">'
  +'<button class="btn btn-copy-summary" aria-label="Copy metrics summary to clipboard">📋 Copy summary</button>'
  +'<button class="btn btn-reset-all" aria-label="Reset all active filters">↺ Reset all filters</button>'
  +'<button class="btn btn-guide" aria-label="Metrics and shortcuts guide">ℹ Guide</button>'
  +'</div>';
}
function _oldRenderHeaderControlsHTML(prefix='ux'){
 const isDark=document.documentElement.getAttribute('data-theme')==='dark';
 const themeLabel=isDark?'☀️ Light mode':'🌙 Dark mode';
 return '<div class="ux-header-actions">'
  +'<button class="btn btn-c '+prefix+'-btn-refresh" title="Refresh Google Sheet data">↻ Refresh data</button>'
  +'<button class="btn '+prefix+'-btn-theme" title="Toggle appearance mode (Dark / Light)">'+themeLabel+'</button>'
  +'</div>';
}
function bindHeaderControls(container,prefix='ux'){
 if(!container)return;
 container.querySelectorAll('.btn-reset-all').forEach(btn=>{
  btn.onclick=()=>resetAllFilters();
  MeegTooltip.attach(btn, () => ({
   title: 'Reset All Filters',
   badge: 'Action',
   desc: 'Clears all date ranges, categories, search queries, and shift/floor slicers across all pages.',
   note: 'Click to return to full unfiltered data'
  }));
 });
 container.querySelectorAll('.btn-copy-summary').forEach(btn=>{
  btn.onclick=()=>copyCurrentSummaryToClipboard();
  MeegTooltip.attach(btn, () => ({
   title: 'Copy Metrics Summary',
   badge: 'Export',
   desc: 'Generates a clean text summary of current metrics ready to paste into Teams or WhatsApp.',
   note: 'Includes total submits, labelers, avg, and stage breakdown'
  }));
 });
 container.querySelectorAll('.btn-guide').forEach(btn=>{
  btn.onclick=()=>openGuideModal();
  MeegTooltip.attach(btn, () => ({
   title: 'Metrics & Shortcuts Guide',
   badge: 'Help',
   desc: 'Details on National ID parsing, stage definitions, and keyboard shortcuts.',
   note: 'Shortcut: press ? anywhere on your keyboard'
  }));
 });
}
function _oldBindHeaderControls(container,prefix='ux'){
 if(!container)return;
 container.querySelectorAll('.'+prefix+'-btn-refresh').forEach(btn=>{
  btn.onclick=()=>loadData();
 });
 container.querySelectorAll('.'+prefix+'-btn-theme').forEach(btn=>{
  btn.onclick=()=>{
   toggleDark();
   updateAllThemeButtons();
  };
 });
}
function updateAllThemeButtons(){
 const isDark=document.documentElement.getAttribute('data-theme')==='dark';
 const themeLabel=isDark?'☀️ Light mode':'🌙 Dark mode';
 document.querySelectorAll('[class*="-btn-theme"]').forEach(b=>{
  b.innerHTML=themeLabel;
 });
}

function getCategorySummary(rows){
 const idx=name=>hdrs.findIndex(h=>String(h).trim().toLowerCase()===name);
 const ni=idx('national id'),mi=idx('modality'),pi=idx('pass'),li=idx('labeler name'),qi=idx('qtc name');
 const defs=[
  {key:'lidarFP',label:'Lidar FP',modality:'Lidar',pass:'FP',color:'#0d9488',bg:'rgba(13,148,136,0.12)',icon:'⚡'},
  {key:'lidarQA',label:'Lidar QA',modality:'Lidar',pass:'QA',color:'#15b8a6',bg:'rgba(21,184,166,0.12)',icon:'✓'},
  {key:'laneFP',label:'Lane Line FP',modality:'Lane Line',pass:'FP',color:'#ed9a35',bg:'rgba(237,154,53,0.12)',icon:'⚡'},
  {key:'laneQA',label:'Lane Line QA',modality:'Lane Line',pass:'QA',color:'#e9689e',bg:'rgba(233,104,158,0.12)',icon:'✓'}
 ];
 const categories=Object.fromEntries(defs.map(d=>[d.key,{
  ...d,
  tasks:0,
  labelerSet:new Set(),
  uniqueLabelers:0,
  avgSubmit:'0',
  qtcSet:new Set(),
  uniqueQtc:0
 }]));
 const overallLabelers=new Set();
 const overallQtc=new Set();
 let overallTasks=0;
 rows.forEach(r=>{
  let lid='';
  if(ni>=0){
   const rawNi=String(r[ni]??'').trim()
    .replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632))
    .replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776))
    .replace(/\.0+$/,'').replace(/[\s-]/g,'');
   if(/^\d{14}$/.test(rawNi))lid=rawNi;
  }
  if(!lid&&li>=0){
   const name=String(r[li]??'').trim().toLowerCase();
   if(name)lid='name:'+name;
  }
  if(lid)overallLabelers.add(lid);

  const qtc=qi>=0?String(r[qi]||'').normalize('NFC').trim().replace(/\s+/gu,' ').toLowerCase():'';
  if(qtc)overallQtc.add(qtc);

  overallTasks++;
  const mod=mi<0?'':String(r[mi]??'').trim().toLowerCase().replace(/[\s_-]+/g,'');
  const pass=pi<0?'':String(r[pi]??'').trim().toUpperCase();
  const prefix=mod==='lidar'?'lidar':(mod==='laneline'||mod==='lane')?'lane':'';
  if(prefix&&(pass==='FP'||pass==='QA')){
   const key=prefix+pass;
   const cat=categories[key];
   if(cat){
    cat.tasks++;
    if(lid)cat.labelerSet.add(lid);
    if(qtc)cat.qtcSet.add(qtc);
   }
  }
 });
 defs.forEach(d=>{
  const cat=categories[d.key];
  cat.uniqueLabelers=cat.labelerSet.size;
  cat.avgSubmit=cat.uniqueLabelers>0?(cat.tasks/cat.uniqueLabelers).toFixed(1):'0';
  cat.uniqueQtc=cat.qtcSet.size;
 });
 const overallUnique=overallLabelers.size;
 const overallAvg=overallUnique>0?(overallTasks/overallUnique).toFixed(1):'0';
 return {
  defs,
  categories,
  overall:{
   tasks:overallTasks,
   uniqueLabelers:overallUnique,
   avgSubmit:overallAvg,
   uniqueQtc:overallQtc.size
  }
 };
}

function renderCategoryCardsHTML(summary,activeCategory='',scope='overview'){
 const defs=summary.defs;
 const isOverview=scope==='overview';
 const overallTasks=summary.overall.tasks || 1;
 return '<section class="an-cat-section" aria-label="Workstream metrics">'
  +'<div class="an-cat-grid">'
  +defs.map(d=>{
   const cat=summary.categories[d.key];
   const isSel=activeCategory===d.key;
   const titleAction=isOverview?'Click to view '+d.label+' in Analysis':'Click to filter by '+d.label+(isSel?' (active)':'');
   const sharePct=((cat.tasks / overallTasks) * 100).toFixed(1);
   return '<article class="an-cat-card '+(isSel?'selected':'')+'" style="--cat-color:'+d.color+';--cat-bg:'+d.bg+'" data-cat="'+d.key+'" role="button" tabindex="0" aria-label="'+d.label+': '+cat.tasks.toLocaleString()+' tasks, '+cat.uniqueLabelers.toLocaleString()+' unique labelers, '+cat.avgSubmit+' avg submit, '+cat.uniqueQtc.toLocaleString()+' unique QTC" title="'+titleAction+'">'
    +'<div class="an-cat-header">'
     +'<div class="an-cat-title"><span aria-hidden="true">'+d.icon+'</span> <span>'+d.label+'</span></div>'
     +'<span class="an-cat-badge">'+d.pass+'</span>'
    +'</div>'
    +'<div class="an-cat-stats">'
     +'<div class="an-cat-stat">'
      +'<span class="an-cat-stat-lbl">Total Tasks</span>'
      +'<strong class="an-cat-stat-val highlight">'+cat.tasks.toLocaleString()+'</strong>'
     +'</div>'
     +'<div class="an-cat-stat">'
      +'<span class="an-cat-stat-lbl">Unique Labelers</span>'
      +'<strong class="an-cat-stat-val">'+cat.uniqueLabelers.toLocaleString()+'</strong>'
     +'</div>'
     +'<div class="an-cat-stat">'
      +'<span class="an-cat-stat-lbl">Avg / Labeler</span>'
      +'<strong class="an-cat-stat-val highlight">'+cat.avgSubmit+'</strong>'
     +'</div>'
     +'<div class="an-cat-stat">'
      +'<span class="an-cat-stat-lbl">Total Unique QTC</span>'
      +'<strong class="an-cat-stat-val">'+cat.uniqueQtc.toLocaleString()+'</strong>'
     +'</div>'
     +'<div class="an-cat-stat" style="grid-column:span 2;">'
      +'<span class="an-cat-stat-lbl">Contribution Share</span>'
      +'<strong class="an-cat-stat-val" style="color:var(--text);">'+sharePct+'% of total</strong>'
     +'</div>'
    +'</div>'
   +'</article>';
  }).join('')
  +'</div>'
  +'</section>';
}
