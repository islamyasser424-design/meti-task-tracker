/* Presentation layer. The existing Google data and authentication remain authoritative. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let protectedOptions=null;

const escHtml = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const esc = window.esc || escHtml;

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
 'name': { title: 'Queue Name', desc: 'اسم الكيو أو مسار العمل الخاص بالتاسكات', note: 'اضغط للترتيب أبجدياً' },
 'shifts': { title: 'Shifts', desc: 'الشيفتات التي سجلت تسليمات في هذا الكيو' },
 'floors': { title: 'Floors / Units', desc: 'الأدوار والوحدات المكانية المشاركة في العمل' },
 'qtcs': { title: 'QCs / QTCs', desc: 'مسؤولو الجودة والمراجعة المشرفون على هذا الكيو' },
 'lidarFP': { title: 'Lidar FP (First Pass)', desc: 'تاسكات الليدار مرحلة الفيرست باس الأولى', note: 'اضغط للترتيب حسب الحجم' },
 'lidarQA': { title: 'Lidar QA (Quality Assurance)', desc: 'تاسكات الليدار مرحلة مراجعة الجودة', note: 'اضغط للترتيب حسب الحجم' },
 'laneFP': { title: 'Lane Line FP', desc: 'تاسكات اللين لاين مرحلة الفيرست باس', note: 'اضغط للترتيب حسب الحجم' },
 'laneQA': { title: 'Lane Line QA', desc: 'تاسكات اللين لاين مرحلة مراجعة الجودة', note: 'اضغط للترتيب حسب الحجم' },
 'totalSubmit': { title: 'Total Submit', desc: 'إجمالي عدد التاسكات المسلمة المسجلة لهذا الكيو عبر كافة المراحل', note: 'اضغط للترتيب' },
 'uniqueLabelers': { title: 'Unique Labelers', desc: 'عدد أفراد اللابلرز الفريدين (محسوب بالرقم القومي 14 رقم بالضبط)', note: 'اضغط للترتيب' },
 'avgSubmit': { title: 'Avg Submit / Labeler', desc: 'معدل الإنتاجية المتوسط = Total Submit ÷ Unique Labelers', note: 'اضغط للترتيب' },
 'uniqueQtc': { title: 'Total Unique QTC', desc: 'عدد مسؤولي الجودة (QTCs) الفريدين المشرفين على هذا الكيو', note: 'اضغط للترتيب' }
};

const FLOOR_HEADER_EXPLANATIONS = {
 'floor': { title: 'Floor / Unit / Room', desc: 'اسم الدور أو الغرفة أو الوحدة المكانية (مثل 4th Floor, NC Room 102)', note: 'اضغط للترتيب أبجدياً' },
 'shifts': { title: 'Active Shifts', desc: 'الشيفتات التي سجلت إنتاجية في هذا الدور (Morning, Night, Over Night)' },
 'uniqueQtcs': { title: 'Supervising QTCs', desc: 'عدد مسؤولي الجودة المشرفين على هذا الدور - حوّم لرؤية قائمة الأسماء', note: 'اضغط للترتيب' },
 'lidarFP': { title: 'Lidar FP', desc: 'إجمالي تاسكات ليدار فيرست باس المسلمة في هذا الدور', note: 'اضغط للترتيب' },
 'lidarQA': { title: 'Lidar QA', desc: 'إجمالي تاسكات ليدار مراجعة الجودة في هذا الدور', note: 'اضغط للترتيب' },
 'laneFP': { title: 'Lane Line FP', desc: 'إجمالي تاسكات لين لاين فيرست باس في هذا الدور', note: 'اضغط للترتيب' },
 'laneQA': { title: 'Lane Line QA', desc: 'إجمالي تاسكات لين لاين مراجعة الجودة في هذا الدور', note: 'اضغط للترتيب' },
 'totalSubmit': { title: 'Total Submit', desc: 'إجمالي عدد التاسكات المسلمة من جميع العاملين في هذا الدور', note: 'اضغط للترتيب' },
 'uniqueLabelers': { title: 'Unique Labelers', desc: 'عدد أفراد اللابلرز الفريدين في هذا الدور (محسوب بالرقم القومي 14 رقم)', note: 'اضغط للترتيب' },
 'avgSubmit': { title: 'Avg Submit / Labeler', desc: 'معدل الإنتاجية المتوسط للدور = Total Submit ÷ Unique Labelers', note: 'اضغط للترتيب' },
 'sharePct': { title: 'Floor Share %', desc: 'نسبة مساهمة هذا الدور من إجمالي تسليمات الشركة المعروضة', note: 'اضغط للترتيب' }
};

const QF_HEADER_EXPLANATIONS = {
 'qtc': { title: 'QTC Name', desc: 'اسم مسؤول الجودة المشرف على الفريق', note: 'اضغط للترتيب أبجدياً' },
 'floor': { title: 'Floor / Unit', desc: 'الدور أو الوحدة المكانية للعمل', note: 'اضغط للترتيب' },
 'shifts': { title: 'Shifts', desc: 'الشيفتات التي عمل بها هذا الفريق' },
 'lidarFP': { title: 'Lidar FP', desc: 'تاسكات ليدار فيرست باس', note: 'اضغط للترتيب' },
 'lidarQA': { title: 'Lidar QA', desc: 'تاسكات ليدار كواليتي (QA)', note: 'اضغط للترتيب' },
 'laneFP': { title: 'Lane Line FP', desc: 'تاسكات لين لاين فيرست باس', note: 'اضغط للترتيب' },
 'laneQA': { title: 'Lane Line QA', desc: 'تاسكات لين لاين كواليتي (QA)', note: 'اضغط للترتيب' },
 'totalSubmit': { title: 'Total Submit', desc: 'إجمالي التاسكات المسلمة لهذا الـ QTC والدور', note: 'اضغط للترتيب' },
 'uniqueLabelers': { title: 'Unique Labelers', desc: 'عدد اللابلرز الفريدين (محسوبين بالرقم القومي 14 رقم)', note: 'اضغط للترتيب' },
 'avgSubmit': { title: 'Avg Submit / Labeler', desc: 'متوسط الإنتاجية = Total Submit ÷ Unique Labelers', note: 'اضغط للترتيب' }
};

const PERF_HEADER_EXPLANATIONS = {
 'rank': { title: 'Rank', desc: 'الترتيب التنازلي حسب إجمالي عدد الأوبجكت المنجزة' },
 'labeler': { title: 'Labeler Name', desc: 'اسم اللابلر أو الرقم القومي 14 رقم' },
 'totalObjects': { title: 'Total Objects', desc: 'إجمالي عدد الأوبجكت في جميع التاسكات المسلمة' },
 'tasks': { title: 'Tasks Count', desc: 'إجمالي عدد التاسكات المسلمة (صفوف التسليم)' },
 'largestTask': { title: 'Largest Task', desc: 'أكبر تاسك من حيث عدد الأوبجكت المنجزة دفعة واحدة' },
 'shifts': { title: 'Shifts', desc: 'الشيفتات التي قام بالعمل خلالها' },
 'qtcs': { title: 'QTCs', desc: 'مسؤولو الجودة المشرفون على تسليماته' }
};

const DAILY_HEADER_EXPLANATIONS = {
 'queue': { title: 'Queue & Modality', desc: 'اسم الكيو ومسار العمل ونوع الموداليتي (Lidar / Lane Line)' },
 'fpLabelers': { title: 'Unique Labelers (FP)', desc: 'عدد اللابلرز الفريدين في مرحلة الفيرست باس (محسوبين بالرقم القومي 14 رقم)' },
 'fpSubmits': { title: 'Total Submit (FP)', desc: 'إجمالي عدد تاسكات الفيرست باس المسلمة في هذا اليوم' },
 'qaLabelers': { title: 'Unique Labelers (QA)', desc: 'عدد اللابلرز الفريدين في مرحلة مراجعة الجودة (QA)' },
 'qaSubmits': { title: 'Total Submit (QA)', desc: 'إجمالي عدد تاسكات الكواليتي المسلمة في هذا اليوم' }
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
     +'<li><b>Total Submit (إجمالي التسليمات):</b> Total rows matching current filters. Each row represents one submitted task.</li>'
     +'<li><b>Unique Labelers (اللابلرز الفريدين):</b> Distinct labelers calculated strictly using 14-digit Egyptian National ID (الرقم القومي). Incomplete or missing IDs are highlighted in notes.</li>'
     +'<li><b>Avg Submit / Labeler (متوسط التسليم لكل لابلر):</b> Total Submissions ÷ Unique Labelers. Measures productivity per individual.</li>'
     +'<li><b>Total Unique QTC (مسؤولو الجودة):</b> Distinct Quality Controllers / QTCs present in the selection.</li>'
     +'<li><b>Active Queues (الكيوات النشطة):</b> Count of active task queues in the dataset.</li>'
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

function isModPass(r, targetMod, targetPass) {
  const mi = hdrs.findIndex(h => h.toLowerCase() === 'modality');
  const pi = hdrs.findIndex(h => h.toLowerCase() === 'pass');
  const mod = mi < 0 ? '' : String(r[mi] || '').toLowerCase().replace(/[\s_-]+/g, '');
  const pass = pi < 0 ? '' : String(r[pi] || '').trim().toUpperCase();
  const normalizedMod = (mod === 'lidar') ? 'lidar' : (mod === 'laneline' || mod === 'lane') ? 'laneline' : mod;
  return normalizedMod === targetMod.toLowerCase() && pass === targetPass.toUpperCase();
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

const root=overview;

const aside=document.createElement('aside');aside.className='ux-sidebar';aside.setAttribute('aria-label','Main navigation');aside.innerHTML='<div class="ux-brand"><div class="brand-logo-card"><img src="logo.jpg" alt="MEEG - Micro Engineering Egypt" class="brand-img"></div><span class="brand-workspace-tag">PRODUCTIVITY WORKSPACE</span></div><small>WORKSPACE</small><button class="ux-nav active" data-page="dashboard">▦ &nbsp; Overview</button><button class="ux-nav" data-page="analysis">◈ &nbsp; Analysis</button><button class="ux-nav" data-page="queues">☷ &nbsp; Queues Analysis</button><button class="ux-nav" data-page="gm_report">📊 &nbsp; GM Report</button><button class="ux-nav" data-page="shift_comparison">⚖️ &nbsp; Shift Comparison</button><button class="ux-nav" data-page="performance">▤ &nbsp; Performance per Labelers</button><button class="ux-nav" data-page="qtcfloor">🏢 &nbsp; Performance per QTC & Floor</button><button class="ux-nav" data-page="daily">▦ &nbsp; Daily Report</button><footer>Connected to your existing data<br><span style="display:block;margin-top:8px">MEEG · Internal Dashboard</span></footer>';
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

function route(){
  const hash = location.hash || '#dashboard';
  const current = hash === '#analysis-overview' ? 'analysis'
                : hash === '#queues-analysis' ? 'queues'
                : hash === '#gm-report' ? 'gm_report'
                : hash === '#shift-comparison' ? 'shift_comparison'
                : hash === '#performance-labelers' ? 'performance'
                : hash === '#performance-qtc-floor' ? 'qtcfloor'
                : hash === '#daily-report' ? 'daily'
                : 'dashboard';

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
  else if(typeof renderOverview==='function')renderOverview();

  if(!window.rawRows || !window.rawRows.length){
    if(typeof loadData==='function' && typeof getAuthToken==='function' && getAuthToken()) loadData();
  }
}

window.route = route;
window.switchAnalyticsWorkspace = function(hash) {
  if (hash) location.hash = hash;
  route();
};

aside.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{location.hash=b.dataset.page==='analysis'?'analysis-overview':b.dataset.page==='queues'?'queues-analysis':b.dataset.page==='gm_report'?'gm-report':b.dataset.page==='shift_comparison'?'shift-comparison':b.dataset.page==='performance'?'performance-labelers':b.dataset.page==='qtcfloor'?'performance-qtc-floor':b.dataset.page==='daily'?'daily-report':'dashboard';});
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
  shift: ''    // Shift Name
};

function getGlobalFilterOptions() {
  const source = (typeof fcache !== 'undefined' && fcache && fcache.length) ? fcache : (typeof rawRows !== 'undefined' && rawRows ? rawRows : (window.rawRows || []));
  const idx = name => hdrs ? hdrs.findIndex(h => h.trim().toLowerCase() === name.toLowerCase()) : -1;
  const si = idx('shift');
  const fi = hdrs ? hdrs.findIndex(h => ['floor', 'unit'].includes(h.trim().toLowerCase())) : -1;
  const qi = hdrs ? hdrs.findIndex(h => ['qtc name', 'qtc', 'supervisor'].includes(h.trim().toLowerCase())) : -1;

  const shifts = [...new Set(source.map(r => si >= 0 ? String(r[si] || '').trim() : '').filter(Boolean))].sort();
  const floors = [...new Set(source.map(r => fi >= 0 ? deriveFloor(r[fi]) : '').filter(Boolean))].sort();
  const qtcs = [...new Set(source.map(r => qi >= 0 ? String(r[qi] || '').trim() : '').filter(Boolean))].sort();
  const dates = [...new Set(source.map(r => typeof rDate === 'function' ? rDate(r) : '').filter(Boolean))].sort();

  return { shifts, floors, qtcs, dates, totalTasks: source.length };
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
    globalUnifiedFilters.floor || globalUnifiedFilters.qtc || globalUnifiedFilters.shift
  );

  let activeTagsHtml = '';
  if (hasAnyFilter) {
    activeTagsHtml = '<div class="uf-tags-strip">'
      + '<span class="uf-tags-lbl">الفلاتر النشطة (Active):</span>'
      + (globalUnifiedFilters.date ? '<span class="uf-tag">📅 يوم: <b>' + esc(globalUnifiedFilters.date) + '</b> <button type="button" class="uf-tag-del" data-clear="date">✕</button></span>' : '')
      + (globalUnifiedFilters.from ? '<span class="uf-tag">من: <b>' + esc(globalUnifiedFilters.from) + '</b> <button type="button" class="uf-tag-del" data-clear="from">✕</button></span>' : '')
      + (globalUnifiedFilters.to ? '<span class="uf-tag">إلى: <b>' + esc(globalUnifiedFilters.to) + '</b> <button type="button" class="uf-tag-del" data-clear="to">✕</button></span>' : '')
      + (globalUnifiedFilters.floor ? '<span class="uf-tag">🏢 فلور: <b>' + esc(globalUnifiedFilters.floor) + '</b> <button type="button" class="uf-tag-del" data-clear="floor">✕</button></span>' : '')
      + (globalUnifiedFilters.qtc ? '<span class="uf-tag">👤 مشرف: <b>' + esc(globalUnifiedFilters.qtc) + '</b> <button type="button" class="uf-tag-del" data-clear="qtc">✕</button></span>' : '')
      + (globalUnifiedFilters.shift ? '<span class="uf-tag">⏱️ شيفت: <b>' + esc(globalUnifiedFilters.shift) + '</b> <button type="button" class="uf-tag-del" data-clear="shift">✕</button></span>' : '')
      + '<button type="button" class="uf-clear-all-link" id="ufClearAllLink_' + pageKey + '">مسح كل الفلاتر</button>'
      + '</div>';
  }

  return '<div class="universal-filter-panel" data-uf-page="' + pageKey + '">'
    + '<div class="uf-header-row">'
      + '<div class="uf-header-left">'
        + '<span class="uf-header-badge">⚡ الفلاتر العامة الموحدة (Operational Filters)</span>'
        + '<span class="uf-stats-badge ' + (hasAnyFilter ? 'active-filter-badge' : '') + '">'
          + 'عرض <b>' + filteredCount.toLocaleString() + '</b> من <b>' + totalCount.toLocaleString() + '</b> مهمة (' + pct + '%)'
        + '</span>'
      + '</div>'
      + '<div class="uf-header-right">'
        + (hasAnyFilter ? '<button type="button" class="btn btn-sm btn-uf-reset" id="ufResetBtn_' + pageKey + '">↺ تفريغ الفلاتر (Reset All)</button>' : '')
      + '</div>'
    + '</div>'

    + '<div class="uf-grid-controls">'
      // 1. Date Picker (Any day) & Presets & Custom Range
      + '<div class="uf-ctrl-box uf-ctrl-date">'
        + '<label class="uf-ctrl-lbl" for="ufDate_' + pageKey + '">📅 التاريخ (أي يوم - Date):</label>'
        + '<div class="uf-date-actions-wrap">'
          + '<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">'
            + '<input type="date" class="uf-input-date" id="ufDate_' + pageKey + '" value="' + esc(globalUnifiedFilters.date) + '" title="اختر أي يوم لتصفية كل البيانات">'
            + '<div class="uf-presets-group">'
              + '<button type="button" class="uf-preset-btn ' + (isToday ? 'active' : '') + '" data-uf-date-preset="today">اليوم</button>'
              + '<button type="button" class="uf-preset-btn ' + (isYesterday ? 'active' : '') + '" data-uf-date-preset="yesterday">أمس</button>'
              + '<button type="button" class="uf-preset-btn ' + (isAllDays ? 'active' : '') + '" data-uf-date-preset="all">الكل</button>'
            + '</div>'
          + '</div>'
          + '<div style="display:flex; gap:6px; align-items:center; margin-top:4px;">'
            + '<span style="font-size:11px; color:var(--text-soft); white-space:nowrap;">أو فترة من:</span>'
            + '<input type="date" class="uf-input-date-sm" id="ufFrom_' + pageKey + '" value="' + esc(globalUnifiedFilters.from) + '" title="من تاريخ">'
            + '<span style="font-size:11px; color:var(--text-soft);">إلى:</span>'
            + '<input type="date" class="uf-input-date-sm" id="ufTo_' + pageKey + '" value="' + esc(globalUnifiedFilters.to) + '" title="إلى تاريخ">'
          + '</div>'
        + '</div>'
      + '</div>'

      // 2. Floor (= Unit) Dropdown
      + '<div class="uf-ctrl-box">'
        + '<label class="uf-ctrl-lbl" for="ufFloor_' + pageKey + '">🏢 الفلور = Unit (Floor):</label>'
        + '<select class="uf-input-select" id="ufFloor_' + pageKey + '">'
          + '<option value="">🏢 كل الفلورات (All Floors / Units)</option>'
          + opts.floors.map(f => '<option value="' + esc(f) + '" ' + (globalUnifiedFilters.floor === f ? 'selected' : '') + '>' + esc(f) + '</option>').join('')
        + '</select>'
      + '</div>'

      // 3. QTC Supervisor Dropdown
      + '<div class="uf-ctrl-box">'
        + '<label class="uf-ctrl-lbl" for="ufQtc_' + pageKey + '">👤 المشرف (QTC Supervisor):</label>'
        + '<select class="uf-input-select" id="ufQtc_' + pageKey + '">'
          + '<option value="">👤 كل المشرفين (All QTCs)</option>'
          + opts.qtcs.map(q => '<option value="' + esc(q) + '" ' + (globalUnifiedFilters.qtc === q ? 'selected' : '') + '>' + esc(q) + '</option>').join('')
        + '</select>'
      + '</div>'

      // 4. Shift Dropdown
      + '<div class="uf-ctrl-box">'
        + '<label class="uf-ctrl-lbl" for="ufShift_' + pageKey + '">⏱️ الشيفت (Shift):</label>'
        + '<select class="uf-input-select" id="ufShift_' + pageKey + '">'
          + '<option value="">⏱️ كل الشيفتات (All Shifts)</option>'
          + opts.shifts.map(s => '<option value="' + esc(s) + '" ' + (globalUnifiedFilters.shift === s ? 'selected' : '') + '>' + esc(s) + '</option>').join('')
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
  applyGlobalFilters();
  if (typeof showToast === 'function') {
    showToast('✓ تم تفريغ جميع الفلاتر الموحدة (Filters reset)');
  }
}

function applyGlobalFilters() {
  if (typeof route === 'function') {
    route();
  }
}

function rowsInView(){
  const allData = (typeof fcache !== 'undefined' && fcache && fcache.length) ? fcache : (typeof rawRows !== 'undefined' && rawRows ? rawRows : (window.rawRows || []));
  let rows = activeLoc && !activeLoc.startsWith('__') && locColIdx >= 0
    ? allData.filter(r => String(r[locColIdx]||'').trim() === activeLoc)
    : allData;

  if (!rows || !rows.length) return [];

  const idx = name => hdrs ? hdrs.findIndex(h => h.trim().toLowerCase() === name.toLowerCase()) : -1;
  const si = idx('shift');
  const fi = hdrs ? hdrs.findIndex(h => ['floor', 'unit'].includes(h.trim().toLowerCase())) : -1;
  const qi = hdrs ? hdrs.findIndex(h => ['qtc name', 'qtc', 'supervisor'].includes(h.trim().toLowerCase())) : -1;

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
 return '<section class="an-cat-section" aria-label="Workstream metrics">'
  +'<div class="an-cat-grid">'
  +defs.map(d=>{
   const cat=summary.categories[d.key];
   const isSel=activeCategory===d.key;
   const titleAction=isOverview?'Click to view '+d.label+' in Analysis':'Click to filter by '+d.label+(isSel?' (active)':'');
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
      +'<span class="an-cat-stat-lbl">Avg Submit / Labeler</span>'
      +'<strong class="an-cat-stat-val highlight">'+cat.avgSubmit+'</strong>'
     +'</div>'
     +'<div class="an-cat-stat">'
      +'<span class="an-cat-stat-lbl">Total Unique QTC</span>'
      +'<strong class="an-cat-stat-val">'+cat.uniqueQtc.toLocaleString()+'</strong>'
     +'</div>'
    +'</div>'
   +'</article>';
  }).join('')
  +'</div>'
  +'</section>';
}

function renderOverview(){
  if(root.hidden) return;
  const rows = rowsInView();
  const catSummary = getCategorySummary(rows);
  const activeLabelers = uniq(rows, 'Labeler Name') || 0;
  const activeQtcs = uniq(rows, 'QTC Name') || 0;
  const activeQueues = uniq(rows, 'Queue Name') || 0;
  const totalSubmissions = rows.length;
  const avgSubmit = activeLabelers ? (totalSubmissions / activeLabelers).toFixed(1) : '0';

  const lidarFP = rows.filter(r => isModPass(r, 'lidar', 'FP')).length;
  const lidarQA = rows.filter(r => isModPass(r, 'lidar', 'QA')).length;
  const laneFP = rows.filter(r => isModPass(r, 'laneline', 'FP')).length;
  const laneQA = rows.filter(r => isModPass(r, 'laneline', 'QA')).length;
  const totalQA = lidarQA + laneQA;
  const totalFP = lidarFP + laneFP;
  const totalLidar = lidarFP + lidarQA;
  const totalLane = laneFP + laneQA;
  const qaSharePct = totalSubmissions ? ((totalQA / totalSubmissions) * 100).toFixed(1) + '%' : '0%';

  // Daily submission dates & Cairo growth %
  const dateMap = new Map();
  rows.forEach(r => { const d = rDate(r); if (d) dateMap.set(d, (dateMap.get(d) || 0) + 1); });
  const sortedDates = [...dateMap.keys()].sort();
  const activeDays = Math.max(1, sortedDates.length);
  const queueVelocity = (totalSubmissions / (activeDays * 18)).toFixed(1);

  let growthPct = '0.0';
  let isPositiveGrowth = true;
  if (sortedDates.length >= 2) {
    const latestDate = sortedDates[sortedDates.length - 1];
    const prevDate = sortedDates[sortedDates.length - 2];
    const latestC = dateMap.get(latestDate) || 0;
    const prevC = dateMap.get(prevDate) || 0;
    if (prevC > 0) {
      const g = ((latestC - prevC) / prevC) * 100;
      growthPct = (g >= 0 ? '+' : '') + g.toFixed(1);
      isPositiveGrowth = g >= 0;
    }
  }

  // Today vs Yesterday
  const cToday = cairoToday();
  const cYesterday = _addDays(cToday, -1);
  const todayTasks = dateMap.get(cToday) || 0;
  const yestTasks = dateMap.get(cYesterday) || 0;

  // Last 7 days
  const last7Start = _addDays(cToday, -6);
  let last7Total = 0;
  dateMap.forEach((cnt, d) => { if (d >= last7Start && d <= cToday) last7Total += cnt; });
  const last7Avg = Math.round(last7Total / 7);

  // Top rankings
  const qMap = new Map();
  const qtcMap = new Map();
  const labMap = new Map();
  const qi = hdrs.findIndex(h => h.toLowerCase() === 'queue name');
  const qcI = hdrs.findIndex(h => h.toLowerCase() === 'qtc name');
  const li = hdrs.findIndex(h => h.toLowerCase() === 'labeler name');

  rows.forEach(r => {
    if (qi >= 0 && r[qi]) qMap.set(r[qi], (qMap.get(r[qi]) || 0) + 1);
    if (qcI >= 0 && r[qcI]) qtcMap.set(r[qcI], (qtcMap.get(r[qcI]) || 0) + 1);
    if (li >= 0 && r[li]) labMap.set(r[li], (labMap.get(r[li]) || 0) + 1);
  });

  const topQueues = [...qMap.entries()].sort((a,b) => b[1] - a[1]).slice(0, 10);
  const topQtcs = [...qtcMap.entries()].sort((a,b) => b[1] - a[1]).slice(0, 10);
  const topLabelers = [...labMap.entries()].sort((a,b) => b[1] - a[1]).slice(0, 10);

  // Shift & Floor distribution
  const si = hdrs.findIndex(h => h.toLowerCase() === 'shift');
  const fi = hdrs.findIndex(h => ['floor', 'unit'].includes(h.toLowerCase()));
  const shiftMap = new Map();
  const floorMap = new Map();
  rows.forEach(r => {
    if (si >= 0 && r[si]) shiftMap.set(r[si], (shiftMap.get(r[si]) || 0) + 1);
    if (fi >= 0 && r[fi]) {
      const fl = deriveFloor(r[fi]);
      floorMap.set(fl, (floorMap.get(fl) || 0) + 1);
    }
  });

  // Hourly distribution (00 to 23)
  const tsIdx = hdrs.findIndex(h => ['timestamp', 'created at', 'date'].includes(h.toLowerCase()));
  const hourCounts = new Array(24).fill(0);
  rows.forEach(r => {
    if (tsIdx >= 0 && r[tsIdx]) {
      const m = String(r[tsIdx]).match(/(\d{1,2}):\d{2}/);
      if (m) {
        const h = parseInt(m[1], 10);
        if (h >= 0 && h < 24) hourCounts[h]++;
      }
    }
  });
  const maxHour = Math.max(1, ...hourCounts);

  // Daily trend last 21 points
  const last21 = sortedDates.slice(-21).map(d => [d, dateMap.get(d) || 0]);
  const maxDay = Math.max(1, ...last21.map(p => p[1]));

  // 12 KPI Cards Definitions
  const kpiDefs = [
    { title: 'Total Submissions', val: totalSubmissions.toLocaleString(), sub: 'Selected period output', tone: '#0d9488' },
    { title: 'Active Labelers', val: activeLabelers.toLocaleString(), sub: 'Unique contributors', tone: '#0a9d8c' },
    { title: 'Active QTCs', val: activeQtcs.toLocaleString(), sub: 'Distinct QA reviewers', tone: '#df8b24' },
    { title: 'Active Queues', val: activeQueues.toLocaleString(), sub: 'Operational queues', tone: '#df5c99' },
    { title: 'Avg Submissions / Labeler', val: avgSubmit, sub: 'Average output per person', tone: '#3b82f6' },
    { title: 'QA Submission Share', val: qaSharePct, sub: 'Volume share · not quality score', tone: '#8b5cf6' },
    { title: 'Lidar FP Submissions', val: lidarFP.toLocaleString(), sub: 'First pass Lidar volume', tone: '#0d9488' },
    { title: 'Lidar QA Submissions', val: lidarQA.toLocaleString(), sub: 'Quality review Lidar volume', tone: '#14b8a6' },
    { title: 'Lane Line FP Submissions', val: laneFP.toLocaleString(), sub: 'First pass Lane Line volume', tone: '#f59e0b' },
    { title: 'Lane Line QA Submissions', val: laneQA.toLocaleString(), sub: 'Quality review Lane Line', tone: '#ec4899' },
    { title: 'Daily Productivity Growth', val: (growthPct + '%'), isGrowth: true, pos: isPositiveGrowth, sub: 'Latest day vs previous day', tone: '#10b981' },
    { title: 'Queue Velocity', val: (queueVelocity + ' /hr'), sub: 'Submissions per operating hr', tone: '#6366f1' }
  ];

  overview.innerHTML = '<div class="ux-heading">'
    + '<div>'
      + '<div class="ux-eyebrow">Enterprise Operations · Executive Intelligence</div>'
      + '<h2>Executive Overview</h2>'
      + '<p>Holistic view of workforce activity, throughput velocity, and modality performance.</p>'
    + '</div>'
    + '<div class="ux-tools">'
      + renderHeaderControlsHTML('ov')
      + '<button class="btn" id="uxCSV">↓ Export CSV</button>'
      + '<button class="btn" id="uxPrint">🖨️ Print Report</button>'
    + '</div>'
  + '</div>'

  + renderUniversalFilterBar('overview')

  // Freshness & Operational Comparison Banner
  + '<div class="ux-panel" style="margin-bottom:20px; padding:14px 20px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:14px; background:var(--bg-2); border-left:4px solid var(--primary);">'
    + '<div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">'
      + '<span style="display:flex; align-items:center; gap:6px; font-weight:700; font-size:12px; color:var(--text);"><span style="color:var(--success); font-size:10px;">🟢</span> Live Turso DB · Africa/Cairo</span>'
      + '<span class="ux-note">Today: <b>' + todayTasks.toLocaleString() + '</b> tasks</span>'
      + '<span class="ux-note">Yesterday: <b>' + yestTasks.toLocaleString() + '</b> tasks</span>'
      + '<span class="ux-note">Last 7 Days: <b>' + last7Total.toLocaleString() + '</b> tasks (~' + last7Avg.toLocaleString() + '/day)</span>'
    + '</div>'
    + '<div style="display:flex; gap:8px;">'
      + '<button class="btn btn-c" id="ovDrilldownBtn" style="font-size:12px; padding:5px 12px;">🔍 Drill-down Records</button>'
      + '<button class="btn" id="uxCompare" style="font-size:12px; padding:5px 12px;">⚖️ Compare Periods</button>'
    + '</div>'
  + '</div>'

  // 12 KPI Grid
  + '<div class="ux-grid-12">'
    + kpiDefs.map(k => '<div class="kpi-mini-card" style="--tone:' + k.tone + '">'
      + '<div class="kpi-title"><span>' + esc(k.title) + '</span><span style="color:' + k.tone + '">●</span></div>'
      + (k.isGrowth
        ? '<div style="display:flex; align-items:baseline; gap:8px; margin:8px 0 4px;"><span class="kpi-val" style="margin:0;">' + k.val + '</span><span class="kpi-growth ' + (k.pos ? 'positive' : 'negative') + '">' + (k.pos ? '▲ Growth' : '▼ Decline') + '</span></div>'
        : '<div class="kpi-val">' + k.val + '</div>')
      + '<div class="kpi-sub">' + esc(k.sub) + '</div>'
    + '</div>').join('')
  + '</div>'

  // Modality & Category Breakdown Cards
  + renderCategoryCardsHTML(catSummary, '', 'overview')

  // Top Charts Grid: Daily Trend & Hourly Production
  + '<div class="ux-panels" style="margin-top:20px;">'
    // Chart 1: Daily Submission Trend Line
    + '<section class="ux-panel" style="flex:1.6;">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">'
        + '<div><h3 style="margin:0 0 4px;">📈 Daily Submission Trend</h3><p style="margin:0;">Recent 21 active dates. Select a bar/point to filter.</p></div>'
        + '<span class="ux-note">' + last21.length + ' active days</span>'
      + '</div>'
      + '<div class="ux-bars">'
        + (last21.length
          ? last21.map(([d, c]) => '<button class="ux-bar" style="height:' + Math.max(6, (c / maxDay) * 100) + '%;" data-date="' + d + '" data-count="' + c + '" aria-label="' + d + ': ' + c + ' submissions"></button>').join('')
          : '<div class="ux-empty">No dated submissions in current view.</div>')
      + '</div>'
      + '<div style="display:flex; justify-content:space-between; margin-top:8px; font-size:11px; color:var(--text-soft);">'
        + '<span>' + (last21.length ? last21[0][0] : '') + '</span>'
        + '<span>Peak: ' + maxDay.toLocaleString() + ' tasks</span>'
        + '<span>' + (last21.length ? last21[last21.length - 1][0] : '') + '</span>'
      + '</div>'
    + '</section>'

    // Chart 2: Hourly Production Distribution (00 to 23)
    + '<section class="ux-panel" style="flex:1;">'
      + '<h3>⏱️ Hourly Production (24h Distribution)</h3>'
      + '<p>Submission volume across operating hours of the day.</p>'
      + '<div style="display:flex; align-items:flex-end; gap:2px; height:140px; margin-top:14px; padding-bottom:18px; position:relative; border-bottom:1px solid var(--border);">'
        + hourCounts.map((cnt, h) => '<div title="' + String(h).padStart(2,'0') + ':00 · ' + cnt.toLocaleString() + ' tasks" style="flex:1; height:' + Math.max(3, (cnt / maxHour) * 100) + '%; background:' + (cnt === maxHour ? 'var(--primary)' : 'rgba(13,148,136,0.4)') + '; border-radius:2px 2px 0 0; transition:height 0.2s;"></div>').join('')
      + '</div>'
      + '<div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-soft); margin-top:6px;">'
        + '<span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>'
      + '</div>'
    + '</section>'
  + '</div>'

  // Mid Charts Grid: Modality Donut, Pass Donut, Shift & Floor comparison
  + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-top:20px;">'
    // Chart 3 & 4: Modality & Pass Visual Distribution
    + '<div class="ux-panel">'
      + '<h3>📦 Modality & Pass Share</h3>'
      + '<p>Distribution across work types and validation stages.</p>'
      + '<div style="display:flex; flex-direction:column; gap:12px; margin-top:14px;">'
        + '<div>'
          + '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><b>Lidar vs Lane Line</b><span>' + (totalSubmissions ? ((totalLidar/totalSubmissions)*100).toFixed(1) : 0) + '% / ' + (totalSubmissions ? ((totalLane/totalSubmissions)*100).toFixed(1) : 0) + '%</span></div>'
          + '<div style="display:flex; height:12px; border-radius:6px; overflow:hidden; background:var(--border);">'
            + '<div style="width:' + (totalSubmissions ? (totalLidar/totalSubmissions)*100 : 50) + '%; background:#0d9488;"></div>'
            + '<div style="width:' + (totalSubmissions ? (totalLane/totalSubmissions)*100 : 50) + '%; background:#ed9a35;"></div>'
          + '</div>'
          + '<div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-soft); margin-top:3px;">'
            + '<span><span style="color:#0d9488">●</span> Lidar: ' + totalLidar.toLocaleString() + '</span>'
            + '<span><span style="color:#ed9a35">●</span> Lane Line: ' + totalLane.toLocaleString() + '</span>'
          + '</div>'
        + '</div>'
        + '<div style="margin-top:6px;">'
          + '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><b>First Pass vs QA</b><span>' + (totalSubmissions ? ((totalFP/totalSubmissions)*100).toFixed(1) : 0) + '% / ' + (totalSubmissions ? ((totalQA/totalSubmissions)*100).toFixed(1) : 0) + '%</span></div>'
          + '<div style="display:flex; height:12px; border-radius:6px; overflow:hidden; background:var(--border);">'
            + '<div style="width:' + (totalSubmissions ? (totalFP/totalSubmissions)*100 : 50) + '%; background:#3b82f6;"></div>'
            + '<div style="width:' + (totalSubmissions ? (totalQA/totalSubmissions)*100 : 50) + '%; background:#8b5cf6;"></div>'
          + '</div>'
          + '<div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-soft); margin-top:3px;">'
            + '<span><span style="color:#3b82f6">●</span> FP: ' + totalFP.toLocaleString() + '</span>'
            + '<span><span style="color:#8b5cf6">●</span> QA: ' + totalQA.toLocaleString() + '</span>'
          + '</div>'
        + '</div>'
      + '</div>'
    + '</div>'

    // Chart 5: Shift Productivity
    + '<div class="ux-panel">'
      + '<h3>☀️ Shift Productivity Comparison</h3>'
      + '<p>Volume of submissions contributed by each shift.</p>'
      + '<div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">'
        + ([...shiftMap.entries()].sort((a,b)=>b[1]-a[1]).map(([s, cnt]) => {
          const maxS = Math.max(1, ...shiftMap.values());
          const pct = ((cnt / Math.max(1, totalSubmissions)) * 100).toFixed(1);
          return '<div>'
            + '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;"><span>' + esc(s) + '</span><b>' + cnt.toLocaleString() + ' (' + pct + '%)</b></div>'
            + '<div style="height:8px; border-radius:4px; background:var(--border); overflow:hidden;">'
              + '<div style="height:100%; width:' + ((cnt/maxS)*100) + '%; background:var(--primary);"></div>'
            + '</div>'
          + '</div>';
        }).join('') || '<div class="ux-empty">No shift data available.</div>')
      + '</div>'
    + '</div>'

    // Chart 6: Floor Productivity (Floor 01, Floor 02, Floor 03, Floor 04)
    + '<div class="ux-panel">'
      + '<h3>🏢 Floor Productivity Comparison</h3>'
      + '<p>Throughput by floor based on operational room mapping.</p>'
      + '<div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">'
        + (([...floorMap.keys()].sort().map(fl => {
          const cnt = floorMap.get(fl) || 0;
          const maxF = Math.max(1, ...floorMap.values());
          const pct = totalSubmissions ? ((cnt / totalSubmissions) * 100).toFixed(1) : 0;
          return '<div>'
            + '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;"><span>' + esc(fl) + '</span><b>' + cnt.toLocaleString() + ' (' + pct + '%)</b></div>'
            + '<div style="height:8px; border-radius:4px; background:var(--border); overflow:hidden;">'
              + '<div style="height:100%; width:' + ((cnt/maxF)*100) + '%; background:#df8b24;"></div>'
            + '</div>'
          + '</div>';
        }).join('')) || '<div class="ux-empty">No floor/unit records available.</div>')
      + '</div>'
    + '</div>'
  + '</div>'

  // Bottom Rankings: Top 10 Queues, Top 10 QTCs, Top 10 Labelers
  + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:16px; margin-top:20px;">'
    // Chart 7: Top 10 Queues
    + '<div class="ux-panel">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">'
        + '<h3 style="margin:0;">🗂️ Top 10 Queues</h3>'
        + '<span class="ux-note">By Submissions</span>'
      + '</div>'
      + '<div style="display:flex; flex-direction:column; gap:6px;">'
        + (topQueues.map(([q, cnt], idx) => {
          const maxQ = topQueues[0][1] || 1;
          return '<div style="padding:4px 0; border-bottom:1px solid var(--border-light);">'
            + '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:2px;">'
              + '<span style="font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:200px;">' + (idx+1) + '. ' + esc(q) + '</span>'
              + '<b style="color:var(--primary);">' + cnt.toLocaleString() + '</b>'
            + '</div>'
            + '<div style="height:5px; border-radius:3px; background:var(--border); overflow:hidden;">'
              + '<div style="height:100%; width:' + ((cnt/maxQ)*100) + '%; background:var(--primary);"></div>'
            + '</div>'
          + '</div>';
        }).join('') || '<div class="ux-empty">No queue data.</div>')
      + '</div>'
    + '</div>'

    // Chart 8: Top 10 QTCs
    + '<div class="ux-panel">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">'
        + '<h3 style="margin:0;">👥 Top 10 QTC Teams</h3>'
        + '<span class="ux-note">By Team Output</span>'
      + '</div>'
      + '<div style="display:flex; flex-direction:column; gap:6px;">'
        + (topQtcs.map(([qc, cnt], idx) => {
          const maxQC = topQtcs[0][1] || 1;
          return '<div style="padding:4px 0; border-bottom:1px solid var(--border-light);">'
            + '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:2px;">'
              + '<span style="font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:200px;">' + (idx+1) + '. ' + esc(qc) + '</span>'
              + '<b style="color:#df8b24;">' + cnt.toLocaleString() + '</b>'
            + '</div>'
            + '<div style="height:5px; border-radius:3px; background:var(--border); overflow:hidden;">'
              + '<div style="height:100%; width:' + ((cnt/maxQC)*100) + '%; background:#df8b24;"></div>'
            + '</div>'
          + '</div>';
        }).join('') || '<div class="ux-empty">No QTC data.</div>')
      + '</div>'
    + '</div>'

    // Chart 9: Top 10 Labelers
    + '<div class="ux-panel">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">'
        + '<h3 style="margin:0;">🏆 Top 10 Labelers</h3>'
        + '<span class="ux-note">By Total Submits</span>'
      + '</div>'
      + '<div style="display:flex; flex-direction:column; gap:6px;">'
        + (topLabelers.map(([lab, cnt], idx) => {
          const maxL = topLabelers[0][1] || 1;
          return '<div style="padding:4px 0; border-bottom:1px solid var(--border-light);">'
            + '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:2px;">'
              + '<span style="font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:200px;">' + (idx < 3 ? ['🥇','🥈','🥉'][idx] + ' ' : (idx+1) + '. ') + esc(lab) + '</span>'
              + '<b style="color:#0a9d8c;">' + cnt.toLocaleString() + '</b>'
            + '</div>'
            + '<div style="height:5px; border-radius:3px; background:var(--border); overflow:hidden;">'
              + '<div style="height:100%; width:' + ((cnt/maxL)*100) + '%; background:#0a9d8c;"></div>'
            + '</div>'
          + '</div>';
        }).join('') || '<div class="ux-empty">No labeler data.</div>')
      + '</div>'
    + '</div>'
  + '</div>'

  // Personal Target Progress Box
  + '<div class="ux-panel" style="margin-top:20px;">'
    + '<h3>🎯 Personal Submission Target</h3>'
    + '<p>Set a custom target for the current selection, saved on your local browser.</p>'
    + '<div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap; margin-top:12px;">'
      + '<label class="ux-note" style="display:flex; align-items:center; gap:8px;">Target Rows:<input class="ux-target" id="uxTarget" type="number" min="1" step="1" placeholder="e.g. 500" value="' + (target || '') + '" style="padding:6px 12px; border-radius:8px; border:1px solid var(--border); width:140px;"></label>'
      + '<div id="uxProgress" style="flex:1; min-width:200px;"></div>'
    + '</div>'
  + '</div>';

  bindHeaderControls(overview, 'ov');

  // Event handlers
  $('uxCSV').onclick = exportCSV;
  $('uxPrint').onclick = () => window.print();
  $('uxCompare').onclick = () => { if (!cmpMode) toggleCompare(); $('cmpBar').scrollIntoView({ behavior: reduced() ? 'instant' : 'smooth' }); };
  $('ovDrilldownBtn').onclick = () => {
    const cols = ['Task ID', 'Timestamp', 'Labeler Name', 'Employee ID', 'Shift', 'Unit', 'QTC Name', 'Queue Name', 'Modality', 'Pass'];
    const ni = hdrs.findIndex(h => h.toLowerCase() === 'national id');
    const ti = hdrs.findIndex(h => ['task id', 'id'].includes(h.toLowerCase()));
    const drillRows = rows.map(r => [
      ti >= 0 ? esc(r[ti]) : '—',
      tsIdx >= 0 ? esc(r[tsIdx]) : '—',
      li >= 0 ? esc(r[li]) : '—',
      maskEmployeeId(ni >= 0 ? r[ni] : '', r[li]),
      si >= 0 ? esc(r[si]) : '—',
      fi >= 0 ? esc(r[fi]) : '—',
      qcI >= 0 ? esc(r[qcI]) : '—',
      qi >= 0 ? esc(r[qi]) : '—',
      esc(r[hdrs.findIndex(h => h.toLowerCase() === 'modality')] || ''),
      esc(r[hdrs.findIndex(h => h.toLowerCase() === 'pass')] || '')
    ]);
    openDrilldownModal({
      title: 'Current Selection Records',
      subtitle: 'Drill-down view of ' + rows.length.toLocaleString() + ' filtered submissions (National IDs masked)',
      badge: 'Live Data',
      columns: cols,
      rows: drillRows
    });
  };

  overview.querySelectorAll('.an-cat-card[data-cat]').forEach(card => {
    const cat = card.dataset.cat;
    card.onclick = () => { analysisFilters.category = cat; location.hash = 'analysis-overview'; };
  });

  overview.querySelectorAll('.ux-bar').forEach(b => {
    const d = b.dataset.date;
    const count = Number(b.dataset.count || 0);
    const pct = Math.max(1, maxDay) ? ((count / maxDay) * 100).toFixed(1) : '0';
    MeegTooltip.attach(b, () => ({
      title: d,
      badge: 'Daily Volume',
      desc: 'Operational submissions for this date',
      rows: [
        { label: 'Submissions', value: count.toLocaleString(), color: 'var(--accent)' },
        { label: '% of Peak Day', value: pct + '%', color: '#15b8a6' }
      ],
      note: 'Click to filter entire dashboard to this date'
    }));
    b.onclick = () => {
      selD.clear(); selWeeks.clear(); selD.add(d); buildStrip(); applyAll();
    };
  });

  $('uxTarget').onchange = e => {
    target = Math.max(0, Math.floor(Number(e.target.value) || 0));
    try { localStorage.setItem('meeg_personal_target', String(target)); } catch(e){}
    progress(rows.length);
  };

  progress(rows.length);
  applyView();
  bindUniversalFilterBar(overview, 'overview');
}
function progress(count){const pct=target?count/target*100:0;$('uxProgress').innerHTML=target?'<div class="ux-track" role="progressbar" aria-label="Submission target" aria-valuenow="'+Math.min(100,Math.round(pct))+'" aria-valuemin="0" aria-valuemax="100"><div class="ux-fill" style="width:'+Math.min(100,pct)+'%"></div></div><b>'+Math.round(pct)+'%</b><p>'+count.toLocaleString()+' of '+target.toLocaleString()+' submissions</p>':'<p style="margin-top:18px">Set a target to see your progress.</p>';}
function exportCSV(){const rows=rowsInView();if(!rows.length){showToast('No matching rows to export.');return;}const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';const csv=[hdrs,...rows].map(r=>r.map(cell).join(',')).join('\r\n');downloadBlob(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}),'MEEG_filtered_'+cairoToday()+'.csv');}
function labelerSubmissionMetrics(rows){
 const idx=name=>hdrs.findIndex(h=>String(h).trim().toLowerCase()===name);
 const ni=idx('national id'),mi=idx('modality'),pi=idx('pass');
 const names=new Set();let missingNames=0;
 const totals={lidarFP:0,lidarQA:0,laneFP:0,laneQA:0};
 const categoryIds=Object.fromEntries(Object.keys(totals).map(k=>[k,new Set()]));
 rows.forEach(r=>{
  const name=ni<0?'':String(r[ni]??'').trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/\.0+$/,'').replace(/[\s-]/g,'');
  if(/^\d{14}$/.test(name))names.add(name);else missingNames++;
  const modality=mi<0?'':String(r[mi]??'').trim().toLowerCase().replace(/[\s_-]+/g,'');
  const pass=pi<0?'':String(r[pi]??'').trim().toUpperCase();
  const prefix=modality==='lidar'?'lidar':modality==='laneline'?'lane':'';
  if(prefix&&(pass==='FP'||pass==='QA')){const key=prefix+pass;totals[key]++;if(/^\d{14}$/.test(name))categoryIds[key].add(name);}
 });
 return {unique:ni<0?null:names.size,missingNames,totals,categoryUnique:Object.fromEntries(Object.entries(categoryIds).map(([k,ids])=>[k,ni<0?null:ids.size])),categoryColumns:mi>=0&&pi>=0};
}

function uniqueQtcCount(rows){const i=hdrs.findIndex(h=>String(h).trim().toLowerCase()==='qtc name');if(i<0)return null;return new Set(rows.map(r=>String(r[i]||'').normalize('NFC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('en')).filter(Boolean)).size;}

function categoryGroups(rows,field){
 const idx=hdrs.findIndex(h=>String(h).trim().toLowerCase()===field.toLowerCase());if(idx<0)return null;
 const map=new Map();rows.forEach(r=>{const name=String(r[idx]||'').trim()||'Unknown';if(!map.has(name))map.set(name,[]);map.get(name).push(r);});
 return [...map].map(([name,group])=>({name,rows:group,totals:labelerSubmissionMetrics(group).totals})).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
}
function floorComparisonRows(dimension='unit'){
 const excluded=new Set(dimension==='unit'?['floor','unit','location','modality','pass']:['qtc name','modality','pass']);const idIdx=hdrs.findIndex(h=>h.trim().toLowerCase()==='id');
 const rows=rawRows.filter(r=>{if(!isRowAllowed(r)||!timeOk(r))return false;const date=rDate(r);if(selD.size&&!selD.has(date))return false;if(selWeeks.size&&!selWeeks.has(getWeekLabel(date)))return false;if(idFilter&&idIdx>=0&&!String(r[idIdx]||'').toLowerCase().includes(idFilter.toLowerCase()))return false;for(const [key,values]of Object.entries(sel)){if(excluded.has(key.toLowerCase())||!values.size)continue;const ci=sIdx[key];if(ci!==undefined&&!values.has(String(r[ci]||'').trim()))return false;}return true;});
 const scoped=dimension==='qtc'&&activeLoc&&!activeLoc.startsWith('__')&&locColIdx>=0?rows.filter(r=>String(r[locColIdx]||'').trim()===activeLoc):rows;
 return analysisAggregate(scoped,{...analysisFilters,[dimension]:'',category:'',modality:'all'}).selected;
}

function addAnalysisCharts(a){
 const defs=[['Lidar FP','lidarFP','#0d9488'],['Lidar QA','lidarQA','#15b8a6'],['Lane Line FP','laneFP','#ed9a35'],['Lane Line QA','laneQA','#e9689e']];
 const container=document.createElement('div');container.className='an-extra-charts';
 const floorField=hdrs.some(h=>h.trim().toLowerCase()==='floor')?'Floor':'Unit';
 [[floorField,'Floor / Unit','horizontal','unit'],['Qtc Name','QC','vertical','qtc']].forEach(([field,label,layout,key])=>{
 const floorMode=key==='unit';const comparisonStage=analysisFilters[floorMode?'floorStage':'qcStage']||'lidarFP';const chartDefs=defs.filter(d=>d[1]===comparisonStage);
 const groups=categoryGroups(floorComparisonRows(key),field),panel=document.createElement('section');panel.className='ux-panel';
 if(groups){const idx=hdrs.findIndex(h=>h.trim().toLowerCase()===field.toLowerCase());const allFloors=[...new Set(rawRows.map(r=>String(r[idx]||'').trim()||'Unknown'))];allFloors.forEach(name=>{if(!groups.some(g=>g.name===name))groups.push({name,totals:{lidarFP:0,lidarQA:0,laneFP:0,laneQA:0}});});groups.sort((a,b)=>b.totals[comparisonStage]-a.totals[comparisonStage]||a.name.localeCompare(b.name));}
 if(!floorMode&&groups){const ranked=rankQcGroups(groups,comparisonStage,!!analysisFilters.qcLower);groups.splice(0,groups.length,...ranked);}
 panel.innerHTML='<h3>'+ (floorMode?'Compare all Floors · '+chartDefs[0][0]:(analysisFilters.qcLower?'Lower 15 QCs · ':'Top 15 QCs · ')+chartDefs[0][0])+'</h3><p>'+(floorMode?'Same category across every floor. Floor selection is ignored in this comparison; date, shift, QTC and email filters still apply.':'Switch Top / Lower 15 by Total Submit. QCs with zero submits in this category are excluded. Date, shift, floor and email filters apply.')+'</p><div class="an-chart-key">'+chartDefs.map(([name,,color])=>'<span><i style="background:'+color+'"></i>'+name+'</span>').join('')+'</div>';
 if(groups===null){panel.insertAdjacentHTML('beforeend','<div class="ux-empty">Required column unavailable: '+esc(field)+'</div>');container.appendChild(panel);return;}
 {const stageSelect=document.createElement('select');stageSelect.className='an-stage-select';stageSelect.setAttribute('aria-label',floorMode?'Floor comparison category':'QC comparison category');defs.forEach(([name,key])=>stageSelect.add(new Option(name,key)));stageSelect.value=comparisonStage;stageSelect.onchange=()=>{analysisFilters[floorMode?'floorStage':'qcStage']=stageSelect.value;renderAnalysis();};panel.insertBefore(stageSelect,panel.querySelector('.an-chart-key'));}
 if(!floorMode){const toggle=document.createElement('button');toggle.className='btn btn-c';toggle.classList.add('an-qc-switch');toggle.setAttribute('role','switch');toggle.setAttribute('aria-checked',String(!!analysisFilters.qcLower));toggle.textContent=analysisFilters.qcLower?'Lower 15 · switch to Top 15':'Top 15 · switch to Lower 15';toggle.onclick=()=>{analysisFilters.qcLower=!analysisFilters.qcLower;renderAnalysis();};const controls=document.createElement('div');controls.className='an-qc-controls';const categorySelect=panel.querySelector('.an-stage-select');panel.insertBefore(controls,panel.querySelector('.an-chart-key'));controls.append(categorySelect,toggle);}
 const max=Math.max(1,...groups.flatMap(g=>chartDefs.map(d=>g.totals[d[1]])));
 const chart=document.createElement('div');chart.className='an-group-chart '+layout;chart.setAttribute('aria-label','Total Submit by '+label);
 groups.forEach(g=>{const group=document.createElement('div');group.className='an-bar-group';const title=document.createElement('strong');title.textContent=g.name;title.className='an-group-name';group.appendChild(title);const bars=document.createElement('div');bars.className='an-category-bars';chartDefs.forEach(([name,cat,color])=>{const bar=document.createElement('button');bar.className='an-category-bar';const value=g.totals[cat];bar.style.setProperty('--bar-color',color);bar.style.setProperty('--bar-size',Math.max(value?2:0,value/max*100)+'%');bar.setAttribute('aria-label',g.name+' · '+name+': '+value+' submissions. Select to filter.');const mi=hdrs.findIndex(h=>h.trim().toLowerCase()==='modality'),pi=hdrs.findIndex(h=>h.trim().toLowerCase()==='pass');bar._tooltipRows=(g.rows||[]).filter(r=>{const mod=String(r[mi]||'').toLowerCase().replace(/[\s_-]+/g,'');return (mod==='lidar'?'lidar':mod==='laneline'?'lane':'')+String(r[pi]||'').trim().toUpperCase()===cat;});bar._tooltipTitle=g.name+' · '+name;bar.setAttribute('aria-description','Total Unique QTC: '+(uniqueQtcCount(bar._tooltipRows)??'Unavailable'));bar.innerHTML='<span>'+value.toLocaleString()+'</span>';bar.onclick=()=>{analysisFilters[key]=g.name;analysisFilters.category=cat;renderAnalysis();};bars.appendChild(bar);});group.appendChild(bars);chart.appendChild(group);});
 panel.appendChild(chart);if(!groups.length)chart.innerHTML='<div class="ux-empty">No matching submissions.</div>';container.appendChild(panel);
 });analysis.querySelector('.ux-overview').appendChild(container);
 const hint=document.createElement('p');hint.className='an-context';hint.textContent='Chart filters: '+[analysisFilters.unit,analysisFilters.qtc,defs.find(d=>d[1]===analysisFilters.category)?.[0]].filter(Boolean).join(' · ');const clear=document.createElement('button');clear.className='btn';clear.textContent='Clear chart filters';clear.onclick=()=>{Object.assign(analysisFilters,{unit:'',qtc:'',category:''});renderAnalysis();};hint.append(' ',clear);container.prepend(hint);
 function show(rows,title,event){
  const totals=labelerSubmissionMetrics(rows).totals;
  const qtc=uniqueQtcCount(rows);
  MeegTooltip.show({
   title: title,
   badge: 'Stage Breakdown',
   desc: 'Submissions & Quality Controllers',
   rows: [
    { label: 'Submissions', value: rows.length.toLocaleString(), color: 'var(--accent)' },
    { label: 'Total Unique QTC', value: (qtc ?? 'Unavailable').toLocaleString(), color: '#ed9a35' },
    { label: 'Lidar FP', value: totals.lidarFP.toLocaleString(), color: '#0d9488' },
    { label: 'Lidar QA', value: totals.lidarQA.toLocaleString(), color: '#15b8a6' },
    { label: 'Lane Line FP', value: totals.laneFP.toLocaleString(), color: '#ed9a35' },
    { label: 'Lane Line QA', value: totals.laneQA.toLocaleString(), color: '#e9689e' }
   ],
   note: 'Click to filter analysis by this selection'
  }, event);
 }
 function bind(el,rows,title,select){
  el.setAttribute('role','button');
  const display=e=>show(rows,title,e);
  el.addEventListener('pointermove',display);
  el.addEventListener('focus',display);
  el.addEventListener('pointerleave',()=>MeegTooltip.hide());
  el.addEventListener('blur',()=>MeegTooltip.hide());
  el.addEventListener('click',()=>{MeegTooltip.hide();select();});
  el.addEventListener('keydown',e=>{
   if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}
   if(e.key==='Escape')MeegTooltip.hide();
  });
 }
 container.querySelectorAll('.an-category-bar').forEach(bar=>{
  const display=e=>show(bar._tooltipRows,bar._tooltipTitle,e);
  bar.addEventListener('pointermove',display);
  bar.addEventListener('focus',display);
  bar.addEventListener('pointerleave',()=>MeegTooltip.hide());
  bar.addEventListener('blur',()=>MeegTooltip.hide());
  bar.addEventListener('click',()=>MeegTooltip.hide());
 });
 const line=$('anLine').querySelector('svg');
 if(line){const circles=line.querySelectorAll('circle');circles.forEach((el,i)=>{const date=a.points[i][0];bind(el,a.selected.filter(r=>rDate(r)===date),date,()=>{analysisFilters.from=date;analysisFilters.to=date;renderAnalysis();});});
 line.addEventListener('click',e=>{if(e.target.closest('circle'))return;const rect=line.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*760;const index=Math.min(a.points.length-1,Math.max(0,Math.round((x-55)/(760-55-20)*Math.max(0,a.points.length-1))));const d=a.points[index]?.[0];if(d){analysisFilters.from=d;analysisFilters.to=d;MeegTooltip.hide();renderAnalysis();}});
 line.addEventListener('pointermove',e=>{if(e.target.closest('circle'))return;const rect=line.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*760;const i=Math.min(a.points.length-1,Math.max(0,Math.round((x-55)/685*Math.max(0,a.points.length-1))));const date=a.points[i]?.[0];if(date)show(a.selected.filter(r=>rDate(r)===date),date,e);});line.addEventListener('pointerleave',()=>tooltip.hidden=true);
 }
 const si=hdrs.findIndex(h=>h.trim().toLowerCase()==='shift');const shiftName=r=>si>=0?String(r[si]||'').trim()||'Unknown':'Unknown';
 $('anDonut').querySelectorAll('circle[tabindex]').forEach((el,i)=>{const shift=a.shifts[i][0];el.style.pointerEvents='stroke';bind(el,a.selected.filter(r=>shiftName(r)===shift),shift,()=>{analysisFilters.shift=shift;renderAnalysis();});});
 $('anLegend').querySelectorAll(':scope > div').forEach((el,i)=>{el.tabIndex=0;const shift=a.shifts[i][0];bind(el,a.selected.filter(r=>shiftName(r)===shift),shift,()=>{analysisFilters.shift=shift;renderAnalysis();});});
}

function analysisAggregate(rows,filters){
 const idx=name=>hdrs.findIndex(h=>h.toLowerCase()===name.toLowerCase());const mi=idx('Modality'),si=idx('Shift');
 const lane=r=>mi>=0&&String(r[mi]||'').toLowerCase().replace(/[\s_-]+/g,'')==='laneline';
 const fi=idx(hdrs.some(h=>h.trim().toLowerCase()==='floor')?'Floor':'Unit'),qi=idx('Qtc Name'),passIdx=idx('Pass');
 const selected=rows.filter(r=>{const date=rDate(r);const mod=mi<0?'':String(r[mi]||'').toLowerCase().replace(/[\s_-]+/g,'');const pass=passIdx<0?'':String(r[passIdx]||'').trim().toUpperCase();const category=(mod==='lidar'?'lidar':mod==='laneline'?'lane':'')+pass;return (!filters.unit||(fi>=0&&(String(r[fi]||'').trim()||'Unknown')===filters.unit))&&(!filters.qtc||(qi>=0&&(String(r[qi]||'').trim()||'Unknown')===filters.qtc))&&(!filters.category||category===filters.category)&& (!filters.from||date>=filters.from)&&(!filters.to||date&&date<=filters.to)&&(filters.modality!=='lane'||lane(r))&&(!filters.shift||(si>=0?String(r[si]||'').trim()||'Unknown':'Unknown')===filters.shift);});
 const dates=new Map(),shifts=new Map();selected.forEach(r=>{const d=rDate(r);if(d)dates.set(d,(dates.get(d)||0)+1);const shift=si<0?'Unknown':String(r[si]||'').trim()||'Unknown';shifts.set(shift,(shifts.get(shift)||0)+1);});
 const dated=[...dates.keys()].sort();const points=[];
 if(dated.length){const from=filters.from||dated[0],to=filters.to||dated[dated.length-1];let d=new Date(from+'T00:00:00Z');const end=new Date(to+'T00:00:00Z');while(d<=end){const key=d.toISOString().slice(0,10);points.push([key,dates.get(key)||0]);d.setUTCDate(d.getUTCDate()+1);}}
 return {selected,points,shifts:[...shifts].sort((a,b)=>b[1]-a[1]),lane:mi<0?null:selected.filter(lane).length,undated:selected.length-[...dates.values()].reduce((a,b)=>a+b,0)};
}
const slicerQueries={};
const slicerDropdownOpen={};
const slicerValueCache=new WeakMap();function slicerValues(rows,column){if(column<0)return [];let columns=slicerValueCache.get(rows);if(!columns){columns=new Map();slicerValueCache.set(rows,columns);}if(!columns.has(column))columns.set(column,[...new Set(rows.map(r=>String(r[column]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})));return columns.get(column);}
function createListSlicers(){
 const host=document.createElement('div');host.className='an-list-slicers';
 [['Shift','Shift'],['Floor',hdrs.some(h=>h.trim().toLowerCase()==='floor')?'Floor':'Unit'],['QTC','Qtc Name'],['Email','Yubikey Email']].forEach(([label,key])=>{
 const ci=hdrs.findIndex(h=>h.trim().toLowerCase()===key.toLowerCase());const apiKey={'Shift':'shift','Unit':'unit','Floor':'unit','Qtc Name':'qtc','Yubikey Email':'email'}[key];const values=protectedOptions&&apiKey?(protectedOptions[apiKey]||[]):slicerValues(rawRows,ci);
 if(ci>=0)sIdx[key]=ci;
 const clearChartSelection=()=>{if(key==='Shift')analysisFilters.shift='';if(label==='Floor')analysisFilters.unit='';if(label==='QTC')analysisFilters.qtc='';};
 const panel=document.createElement('section');panel.className='an-slicer';const title=document.createElement('div');title.className='an-slicer-head';const heading=document.createElement('b');heading.textContent=label;const clear=document.createElement('button');clear.type='button';clear.className='btn';clear.textContent='Clear All';clear.setAttribute('aria-label','Clear '+label+' selections');clear.onclick=()=>{clearChartSelection();sel[key]?.clear();if(key==='Shift')setShiftsUI(null);applyAll();refreshOpenSlicers();};const selectAll=document.createElement('button');selectAll.type='button';selectAll.className='btn';selectAll.textContent='Select All';selectAll.disabled=values.length===0;selectAll.setAttribute('aria-label','Select all '+label+' values');selectAll.onclick=()=>{clearChartSelection();sel[key]=new Set(values);if(key==='Shift')setShiftsUI(null);applyAll();refreshOpenSlicers();};const actions=document.createElement('div');actions.className='an-slicer-actions';actions.append(selectAll,clear);title.append(heading,actions);panel.appendChild(title);
 const search=document.createElement('input');search.type='search';search.placeholder='Search '+label+'…';search.setAttribute('aria-label','Search '+label);search.value=slicerQueries[key]||'';panel.appendChild(search);
 const list=document.createElement('div');list.className='an-slicer-options';list.setAttribute('role','group');list.setAttribute('aria-label',label+' filter options');panel.appendChild(list);
 function draw(){list.replaceChildren();const q=search.value.trim().toLowerCase();const visible=values.filter(v=>v.toLowerCase().includes(q));visible.forEach(value=>{const row=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=!!sel[key]?.has(value);const text=document.createElement('span');text.textContent=value;row.append(checkbox,text);checkbox.onchange=()=>{clearChartSelection();if(!sel[key])sel[key]=new Set();if(key==='Shift')setShiftsUI(null);checkbox.checked?sel[key].add(value):sel[key].delete(value);applyAll();refreshOpenSlicers();};list.appendChild(row);});if(!visible.length){const empty=document.createElement('p');empty.className='ux-note';empty.textContent=ci<0?'Column unavailable':'No matching values';list.appendChild(empty);}}
 search.oninput=()=>{slicerQueries[key]=search.value;draw();};draw();
 const dropdown=document.createElement('details');dropdown.className='an-slicer-dropdown';dropdown.dataset.slicerKey=key;dropdown.open=!!slicerDropdownOpen[key];
 const summary=document.createElement('summary');summary.setAttribute('aria-label',label+' filter');const selected=[...(sel[key]||[])];summary.textContent=selected.length===0?label+' · All':label+' · '+(selected.length===1?selected[0]:selected.length+' selected');summary.title=selected.length?selected.join(', '):'All '+label;dropdown.append(summary,panel);
 dropdown.addEventListener('toggle',()=>{if(!dropdown.isConnected)return;slicerDropdownOpen[key]=dropdown.open;if(dropdown.open){document.querySelectorAll('.an-slicer-dropdown[open]').forEach(other=>{if(other!==dropdown){other.open=false;slicerDropdownOpen[other.dataset.slicerKey]=false;}});}});
 dropdown.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();dropdown.open=false;slicerDropdownOpen[key]=false;summary.focus();}});
 host.appendChild(dropdown);
 });return host;
}
function refreshOpenSlicers(){if(filterDrawer.open)renderDrawerAnalysis();}

function enableAnalysisFlips(rows){
 const flipCache=new Map();
 analysis.querySelectorAll('.an-metrics > article').forEach(card=>{
 const label=card.querySelector('.ux-label')?.textContent||'Metric';const note=card.querySelector('p')?.textContent||'';
 const category=[['Lidar FP','lidarFP'],['Lidar QA','lidarQA'],['Lane Line FP','laneFP'],['Lane Line QA','laneQA']].find(([name])=>label.includes(name));
 const cacheKey=category?category[1]:'all';let cached=flipCache.get(cacheKey);if(!cached){const mi=hdrs.findIndex(h=>h.trim().toLowerCase()==='modality'),pi=hdrs.findIndex(h=>h.trim().toLowerCase()==='pass');const relevant=category?rows.filter(r=>{const mod=String(r[mi]||'').toLowerCase().replace(/[\s_-]+/g,'');return (mod==='lidar'?'lidar':mod==='laneline'?'lane':'')+String(r[pi]||'').trim().toUpperCase()===category[1];}):rows;const metrics=labelerSubmissionMetrics(relevant);cached={relevant,metrics,qtc:uniqueQtcCount(relevant)};flipCache.set(cacheKey,cached);}
 const {relevant,metrics,qtc}=cached;
 const front=document.createElement('div');front.className='an-flip-front';while(card.firstChild)front.appendChild(card.firstChild);
 const back=document.createElement('div');back.className='an-flip-back';back.inert=true;const title=document.createElement('b');title.textContent=label;const description=document.createElement('p');description.textContent=note;back.append(title,description);
 [['Total Submit',relevant.length],['Unique Labelers',metrics.unique??'—'],['Unique QTC',qtc??'—']].forEach(([key,value])=>{const line=document.createElement('p');line.textContent=key+': '+(typeof value==='number'?value.toLocaleString():value);back.appendChild(line);});
 const hint=document.createElement('span');hint.className='ux-note';hint.textContent='Current filters · click to return';back.appendChild(hint);
 const inner=document.createElement('div');inner.className='an-flip-inner';inner.append(front,back);card.appendChild(inner);card.classList.add('an-flip-card');card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',label+' — flip for filtered details');card.setAttribute('aria-pressed','false');
 const cue=document.createElement('span');cue.className='an-flip-cue';cue.textContent='↻';cue.setAttribute('aria-hidden','true');card.appendChild(cue);
 const toggle=()=>{const flipped=card.classList.toggle('an-is-flipped');front.inert=flipped;back.inert=!flipped;card.setAttribute('aria-pressed',String(flipped));};card.onclick=toggle;card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}if(e.key==='Escape'&&card.classList.contains('an-is-flipped'))toggle();};
 });
}

function renderAnalysis(){
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
    return mi >= 0 && String(r[mi] || '').toLowerCase().replace(/[\s_-]+/g,'') === 'lidar';
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
    const m = String(r[mi] || '').toLowerCase().replace(/[\s_-]+/g,'');
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

  // 8 KPI Cards
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
        + '<div class="ux-eyebrow">Modality & Attribute Operations</div>'
        + '<h2>Modality & Attribute Analysis</h2>'
        + '<p>Deep operational distribution across Lidar, Lane Line, and verified quality assessments.</p>'
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

    // Category cards row
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
          + '<h3 style="margin:0;">⭐ Attribute & Verified Quality Analysis</h3>'
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

    // Charts: Modality Trends & Shift Share
    + '<div class="ux-panels" style="margin-top:20px;">'
      + '<section class="ux-panel">'
        + '<div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:12px;">'
          + '<div><h3>Daily Submission Area Trend</h3><p>Select category tab below to filter trend.</p></div>'
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

  // Render SVG Area Line chart
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
      const mod = mi < 0 ? '' : String(r[mi] || '').toLowerCase().replace(/[\s_-]+/g, '');
      const pass = pi < 0 ? '' : String(r[pi] || '').trim().toUpperCase();
      const prefix = mod === 'lidar' ? 'lidar' : (mod === 'laneline' || mod === 'lane') ? 'lane' : '';
      return (prefix + pass) === chartCat;
    });
  }

  const catDates = new Map();
  catRows.forEach(r => { const d = rDate(r); if (d) catDates.set(d, (catDates.get(d) || 0) + 1); });
  const chartPoints = a.points.map(([d]) => [d, catDates.get(d) || 0]);

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
  chartPoints.forEach(([d, c], i) => {
    svg += '<circle tabindex="0" role="img" cx="' + x(i) + '" cy="' + y(c) + '" r="4.5" fill="' + strokeColor + '" stroke="var(--bg-3)" stroke-width="1.5"><title>' + d + ' (' + chartCat + '): ' + c.toLocaleString() + ' submissions</title></circle>';
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
}

/* Named local filter bookmarks, isolated by signed-in account. */
function bookmarkKey(){return 'meeg_filter_bookmarks_v1:'+String(getLoggedInEmail()||'guest').toLowerCase();}
function readBookmarks(){try{const data=JSON.parse(localStorage.getItem(bookmarkKey())||'[]');return Array.isArray(data)?data.filter(b=>b&&typeof b.id==='string'&&typeof b.name==='string'&&b.state):[];}catch(e){return [];}}
function writeBookmarks(items){try{localStorage.setItem(bookmarkKey(),JSON.stringify(items));return true;}catch(e){showToast('Bookmarks could not be saved. Check browser storage.');return false;}}
function captureBookmark(){const input=$('idFilterInput');return {sel:Object.fromEntries(Object.entries(sel).map(([k,v])=>[k,[...v]])),selD:[...selD],selWeeks:[...selWeeks],idFilter:input?input.value.trim():idFilter,timeFrom,timeTo,timePreset,shifts:Object.fromEntries(Object.entries(shiftState).map(([k,v])=>[k,!!v.on])),activeLoc,analysis:{...analysisFilters},view,page:location.hash==='#analysis-overview'?'analysis-overview':location.hash==='#queues-analysis'?'queues-analysis':location.hash==='#performance-labelers'?'performance-labelers':location.hash==='#performance-qtc-floor'?'performance-qtc-floor':location.hash==='#daily-report'?'daily-report':'dashboard'};}
function applyBookmark(state){
 clearTimeout(_idFilterDebounce);
 Object.keys(sel).forEach(k=>sel[k].clear());Object.entries(state.sel||{}).forEach(([k,values])=>{if(Array.isArray(values))sel[k]=new Set(values);});
 selD=new Set(state.selD||[]);selWeeks=new Set(state.selWeeks||[]);idFilter=state.idFilter||'';timeFrom=state.timeFrom||'';timeTo=state.timeTo||'';timePreset=TIME_SHIFTS[state.timePreset]?state.timePreset:'';
 setShiftsUI(state.shifts||{});activeLoc=['__all__','__totalsubmit__','__topperf__','__quality__',...locations].includes(state.activeLoc)?state.activeLoc:'__all__';
 Object.assign(analysisFilters,{from:'',to:'',modality:'all',shift:'',unit:'',qtc:'',category:''},state.analysis||{});view=['summary','details','both'].includes(state.view)?state.view:'both';
 closeAll();buildStrip();applyAll();location.hash=['analysis-overview','queues-analysis','performance-labelers','performance-qtc-floor','daily-report'].includes(state.page)?state.page:'dashboard';route();
}
const bookmarks=document.createElement('section');bookmarks.className='ux-bookmarks';bookmarks.setAttribute('aria-label','Saved filter bookmarks');bookmarks.innerHTML='<span class="ux-bookmark-icon" aria-hidden="true">☆</span><label for="uxBookmarkList">Filter bookmarks</label><select id="uxBookmarkList" aria-label="Saved filter bookmark"><option value="">Choose a bookmark…</option></select><button class="btn" id="uxBookmarkApply">Apply</button><button class="btn" id="uxBookmarkDelete">Delete</button><form id="uxBookmarkForm"><input id="uxBookmarkName" aria-label="New bookmark name" placeholder="Name this filter selection…" maxlength="60" required><button class="btn btn-c" type="submit">☆ Save bookmark</button></form><span class="ux-note">Saved on this browser</span>';
if (!isUnified) document.body.appendChild(bookmarks);
function renderBookmarkList(selected){const list=$('uxBookmarkList'),items=readBookmarks();if(!list)return;list.replaceChildren(new Option(items.length?'Choose a bookmark…':'No saved bookmarks yet',''));items.forEach(b=>list.add(new Option(b.name,b.id)));if(selected&&items.some(b=>b.id===selected))list.value=selected;const disabled=!list.value;if($('uxBookmarkApply'))$('uxBookmarkApply').disabled=disabled;if($('uxBookmarkDelete'))$('uxBookmarkDelete').disabled=disabled;}
if($('uxBookmarkList')) $('uxBookmarkList').onchange=()=>{const disabled=!$('uxBookmarkList').value;if($('uxBookmarkApply'))$('uxBookmarkApply').disabled=disabled;if($('uxBookmarkDelete'))$('uxBookmarkDelete').disabled=disabled;};
if($('uxBookmarkForm')) $('uxBookmarkForm').onsubmit=e=>{e.preventDefault();const name=$('uxBookmarkName')?.value.trim();if(!name){$('uxBookmarkName')?.focus();return;}const items=readBookmarks();if(items.some(b=>b.name.toLowerCase()===name.toLowerCase())){showToast('This name already exists. Choose another bookmark name.');return;}const id=typeof crypto.randomUUID==='function'?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);items.push({id,name,state:captureBookmark(),createdAt:new Date().toISOString()});if(writeBookmarks(items)){renderBookmarkList(id);if($('uxBookmarkName'))$('uxBookmarkName').value='';showToast('Filter bookmark saved: '+name);}};
if($('uxBookmarkApply')) $('uxBookmarkApply').onclick=()=>{if(!window._firstDataReady){showToast('Wait for dashboard data to load before applying a bookmark.');return;}const item=readBookmarks().find(b=>b.id===$('uxBookmarkList')?.value);if(!item)return;applyBookmark(item.state);showToast('Bookmark applied: '+item.name);};
if($('uxBookmarkDelete')) $('uxBookmarkDelete').onclick=()=>{const items=readBookmarks(),id=$('uxBookmarkList')?.value,item=items.find(b=>b.id===id);if(!item)return;if(writeBookmarks(items.filter(b=>b.id!==id))){renderBookmarkList();showToastUndo('Bookmark deleted: '+item.name,'Undo',()=>{const latest=readBookmarks();if(!latest.some(b=>b.id===item.id)){latest.push(item);if(writeBookmarks(latest))renderBookmarkList(item.id);}});}};
let bookmarkAccount=bookmarkKey();const bookmarkUserObserver=typeof MutationObserver!=='undefined'?new MutationObserver(()=>{const key=bookmarkKey();if(key!==bookmarkAccount){bookmarkAccount=key;renderBookmarkList();}}):null;if($('userName')&&bookmarkUserObserver)bookmarkUserObserver.observe($('userName'),{childList:true,subtree:true});window.addEventListener('storage',e=>{if(e.key===bookmarkKey())renderBookmarkList();});renderBookmarkList();

/* A single filter drawer shared by every page. */
const filterButton=document.createElement('button');filterButton.className='ux-nav';filterButton.id='uxOpenFilters';filterButton.textContent='☆  Bookmark / Filters';filterButton.setAttribute('aria-expanded','false');filterButton.setAttribute('aria-controls','uxFilterDrawer');aside.insertBefore(filterButton,aside.querySelector('footer'));
const filterDrawer=document.createElement('section');filterDrawer.hidden=true;filterDrawer.open=false;filterDrawer.id='uxFilterDrawer';filterDrawer.setAttribute('aria-labelledby','uxDrawerTitle');filterDrawer.innerHTML='<div class="ux-drawer-head"><div><div class="ux-eyebrow">Saved views & selection</div><h2 id="uxDrawerTitle">Bookmarks & filters</h2></div><div style="display:flex;align-items:center;gap:6px"><button class="btn btn-c" id="uxDrawerApplyFilters" style="padding:6px 14px;font-weight:700">✓ Apply</button><button class="btn" id="uxCloseFilters" aria-label="Close filters">✕ Close</button></div></div><div class="ux-drawer-body"><div class="ux-drawer-apply-banner"><div><strong>Pending filter selections?</strong><div class="ux-note">Click Apply to push all filters and bookmarks to the dashboard</div></div><button class="btn btn-c" id="uxDrawerApplyBanner" style="padding:6px 14px;font-weight:700">✓ Apply Filters</button></div><h3>Saved bookmarks</h3><div id="uxDrawerBookmarks"></div><h3>Dashboard filters</h3><div id="uxDrawerGlobal"></div><h3>Analysis Overview filters</h3><div id="uxDrawerAnalysis"></div></div>';
aside.appendChild(filterDrawer);if($('uxDrawerBookmarks'))$('uxDrawerBookmarks').appendChild(bookmarks);
const onDrawerApply=()=>{applyAll();renderAllSections();showToast('✓ Filters applied successfully');closeSidebarFilters();};
$('uxDrawerApplyFilters')?.addEventListener('click',onDrawerApply);
$('uxDrawerApplyBanner')?.addEventListener('click',onDrawerApply);
if($('uxDrawerGlobal')) {
  $('uxDrawerGlobal').hidden=true;
  if($('uxDrawerGlobal').previousElementSibling) $('uxDrawerGlobal').previousElementSibling.hidden=true;
}
if($('uxDrawerAnalysis') && $('uxDrawerAnalysis').previousElementSibling) {
  $('uxDrawerAnalysis').previousElementSibling.textContent='List slicers · apply immediately';
}
const globalFilters=$('uxDrawerGlobal');
if(globalFilters) {
  ['.shift-banner','#fstrip','.pills-row','#locTabs'].forEach(selector=>{const el=document.querySelector(selector);if(el)globalFilters.appendChild(el);});
}
function closeSidebarFilters(){filterDrawer.hidden=true;filterDrawer.open=false;aside.classList.remove('ux-filters-mode');[...aside.children].forEach(el=>{if(el!==filterDrawer)el.inert=false;});filterButton.setAttribute('aria-expanded','false');filterButton.focus();}
filterButton.onclick=()=>{renderDrawerAnalysis();renderBookmarkList();filterDrawer.hidden=false;filterDrawer.open=true;aside.classList.add('ux-filters-mode');[...aside.children].forEach(el=>{if(el!==filterDrawer&&!el.classList.contains('ux-brand'))el.inert=true;});filterButton.setAttribute('aria-expanded','true');let periodSlot=$('uxSidebarPeriods');if(!periodSlot){periodSlot=document.createElement('div');periodSlot.id='uxSidebarPeriods';filterDrawer.querySelector('.ux-drawer-body').prepend(periodSlot);}periodSlot.appendChild(sharedPeriods);$('uxCloseFilters').focus();};$('uxCloseFilters').textContent='← Pages';$('uxCloseFilters').setAttribute('aria-label','Return to page navigation');$('uxCloseFilters').onclick=closeSidebarFilters;filterDrawer.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();closeSidebarFilters();}});

function renderDrawerAnalysis(){const box=$('uxDrawerAnalysis');box.replaceChildren(createListSlicers());}

document.addEventListener('click',e=>{if(!e.target.closest('.an-slicer-dropdown'))document.querySelectorAll('.an-slicer-dropdown[open]').forEach(el=>{el.open=false;slicerDropdownOpen[el.dataset.slicerKey]=false;});});
function performanceWeek(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;const d=new Date(date+'T00:00:00Z');if(!Number.isFinite(d.getTime()))return null;d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+1)%7);const start=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);return {start,end:d.toISOString().slice(0,10)};
}
function performanceData(rows,filters){
 const index=name=>hdrs.findIndex(h=>h.trim().toLowerCase()===name.toLowerCase());
 const columns={name:index('Labeler Name'),national:index('National Id'),objects:index('Object Count'),shift:index('Shift'),qtc:index('Qtc Name'),id:index('Id'),link:index('Task Link'),mod:index('Modality'),pass:index('Pass')};
 const value=(r,key)=>columns[key]<0?'':String(r[columns[key]]||'').trim();
 const tasks=rows.map((r,i)=>{const raw=value(r,'objects').replace(/,/g,'');const objects=raw!==''&&/^\d+(?:\.\d+)?$/.test(raw)&&Number.isFinite(Number(raw))?Number(raw):null;const name=value(r,'name')||'Unknown labeler';const nid=value(r,'national').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/\.0+$/,'').replace(/[\s-]/g,'');const person=/^\d{14}$/.test(nid)?'id:'+nid:'name:'+name.normalize('NFC').replace(/\s+/g,' ').toLowerCase();return {person,name,objects,shift:value(r,'shift')||'Unknown',qtc:value(r,'qtc')||'Unknown',date:rDate(r),id:value(r,'id')||'—',link:value(r,'link'),mod:value(r,'mod'),pass:value(r,'pass'),row:i,fallback:!/^\d{14}$/.test(nid)};}).filter(t=>{
 const category=t.mod.toLowerCase().replace(/[\s_-]+/g,'')+' '+t.pass.toUpperCase();
 return (!filters.day||t.date===filters.day)&&(!filters.week||performanceWeek(t.date)?.start===filters.week)&&(!filters.from||t.date>=filters.from)&&(!filters.to||t.date&&t.date<=filters.to)&&(!filters.category||category===filters.category)&&(!filters.query||[t.name,t.shift,t.qtc,t.id].some(v=>v.toLowerCase().includes(filters.query.toLowerCase())));
 });
 tasks.sort((a,b)=>(b.objects??-1)-(a.objects??-1)||a.row-b.row);
 const map=new Map();tasks.forEach(t=>{if(!map.has(t.person))map.set(t.person,{person:t.person,name:t.name,total:0,count:0,largest:null,shifts:new Set(),qtcs:new Set(),fallback:t.fallback});const p=map.get(t.person);p.total+=t.objects??0;p.count++;if(t.objects!==null)p.largest=Math.max(p.largest??0,t.objects);p.shifts.add(t.shift);p.qtcs.add(t.qtc);});
 return {columns,tasks,people:[...map.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name)),invalid:tasks.filter(t=>t.objects===null).length};
}
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

  // Aggregate people
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
        floors: new Set(),
        qtcs: new Set(),
        dates: new Set(),
        tasks: [],
        total: 0,
        lidarFP: 0,
        lidarQA: 0,
        laneFP: 0,
        laneQA: 0
      });
    }

    const p = peopleMap.get(key);
    p.total++;
    if (si >= 0 && r[si]) p.shifts.add(r[si]);
    if (fi >= 0 && r[fi]) { p.units.add(r[fi]); p.floors.add(deriveFloor(r[fi])); }
    if (qcI >= 0 && r[qcI]) p.qtcs.add(r[qcI]);
    const d = rDate(r);
    if (d) p.dates.add(d);

    const mod = mi < 0 ? '' : String(r[mi] || '').toLowerCase().replace(/[\s_-]+/g, '');
    const pass = pi < 0 ? '' : String(r[pi] || '').trim().toUpperCase();
    const prefix = mod === 'lidar' ? 'lidar' : (mod === 'laneline' || mod === 'lane') ? 'lane' : '';
    if (prefix && (pass === 'FP' || pass === 'QA')) {
      const cat = prefix + pass;
      if (cat === 'lidarFP') p.lidarFP++;
      else if (cat === 'lidarQA') p.lidarQA++;
      else if (cat === 'laneFP') p.laneFP++;
      else if (cat === 'laneQA') p.laneQA++;
    }

    p.tasks.push({
      id: ti >= 0 ? r[ti] : '—',
      date: d || 'Unknown',
      shift: si >= 0 ? r[si] : '—',
      unit: fi >= 0 ? r[fi] : '—',
      qtc: qcI >= 0 ? r[qcI] : '—',
      mod: r[mi] || '—',
      pass: r[pi] || '—'
    });
  });

  const people = [...peopleMap.values()].map(p => {
    const activeDays = Math.max(1, p.dates.size);
    const avgPerDay = (p.total / activeDays).toFixed(1);
    const avgPerHour = (p.total / (activeDays * 8)).toFixed(1);
    const qData = getLabelerQuality(p.name, '');
    const verifiedScore = qData && qData.totalAccuracy !== null ? qData.totalAccuracy : null;
    const targetAch = targetSimState.dailyTarget > 0 ? Math.round((Number(avgPerDay) / targetSimState.dailyTarget) * 100) : null;

    return {
      ...p,
      activeDays,
      avgPerDay: Number(avgPerDay) || 0,
      avgPerDayStr: avgPerDay,
      avgPerHour: Number(avgPerHour) || 0,
      avgPerHourStr: avgPerHour,
      verifiedScore,
      verifiedScoreStr: verifiedScore !== null ? (typeof window.qFmt === 'function' ? window.qFmt(verifiedScore) : (verifiedScore*100).toFixed(1)+'%') : '—',
      targetAch,
      targetAchStr: targetAch !== null ? targetAch + '%' : '—'
    };
  });

  // Calculate 10 KPI Cards
  const totalPeople = people.length;
  const totalSubmits = rows.length;
  const avgSubmit = totalPeople ? (totalSubmits / totalPeople).toFixed(1) : '0';

  const counts = people.map(p => p.total).sort((a,b) => a - b);
  const medianSubmit = counts.length ? (counts.length % 2 === 0 ? Math.round((counts[counts.length/2 - 1] + counts[counts.length/2]) / 2) : counts[Math.floor(counts.length/2)]) : 0;
  const maxSubmit = counts.length ? counts[counts.length - 1] : 0;
  const minSubmit = counts.length ? counts[0] : 0;

  const lidarFPTot = people.reduce((s, p) => s + p.lidarFP, 0);
  const lidarQATot = people.reduce((s, p) => s + p.lidarQA, 0);
  const laneFPTot = people.reduce((s, p) => s + p.laneFP, 0);
  const laneQATot = people.reduce((s, p) => s + p.laneQA, 0);

  // Filter people by query
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
      if (!mName && !mId && !mShift && !mQtc) return false;
    }
    return true;
  });

  // Sort people
  const sortCol = perfFilters.sortCol || 'total';
  const sortAsc = !!perfFilters.sortAsc;
  filteredPeople.sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol];
    if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    va = Number(va) || 0; vb = Number(vb) || 0;
    return sortAsc ? (va - vb) : (vb - va);
  });

  // Pagination
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(filteredPeople.length / pageSize));
  perfFilters.page = Math.min(perfFilters.page || 0, totalPages - 1);
  const visiblePeople = filteredPeople.slice(perfFilters.page * pageSize, (perfFilters.page + 1) * pageSize);

  // Target Simulator Calculations
  targetSimState.workforceSize = targetSimState.workforceSize || Math.max(1, totalPeople);
  const simExpected = targetSimState.workforceSize * targetSimState.dailyTarget;
  const simActual = totalSubmits;
  const simAchPct = simExpected > 0 ? ((simActual / simExpected) * 100).toFixed(1) : 0;
  const simRequired = Math.max(0, simExpected - simActual);
  const simProjected = Math.round((simActual / Math.max(1, 4)) * targetSimState.workHours);
  const simWorkforceReq = targetSimState.dailyTarget > 0 ? Math.ceil(simRequired / targetSimState.dailyTarget) : 0;

  // 10 KPI Cards
  const kpi10 = [
    { title: 'Total Active Labelers', val: totalPeople.toLocaleString(), sub: 'Distinct contributors', tone: '#0a9d8c' },
    { title: 'Total Submissions', val: totalSubmits.toLocaleString(), sub: 'Total task volume', tone: '#0d9488' },
    { title: 'Average / Labeler', val: avgSubmit, sub: 'Mean throughput', tone: '#3b82f6' },
    { title: 'Median Submissions', val: medianSubmit.toLocaleString(), sub: 'Median throughput', tone: '#8b5cf6' },
    { title: 'Highest Count', val: maxSubmit.toLocaleString(), sub: 'Top individual submit', tone: '#10b981' },
    { title: 'Lowest Count', val: minSubmit.toLocaleString(), sub: 'Minimum individual submit', tone: '#f59e0b' },
    { title: 'Lidar FP Total', val: lidarFPTot.toLocaleString(), sub: 'Lidar first pass volume', tone: '#0d9488' },
    { title: 'Lidar QA Total', val: lidarQATot.toLocaleString(), sub: 'Lidar QA volume', tone: '#14b8a6' },
    { title: 'Lane Line FP Total', val: laneFPTot.toLocaleString(), sub: 'Lane Line first pass', tone: '#ed9a35' },
    { title: 'Lane Line QA Total', val: laneQATot.toLocaleString(), sub: 'Lane Line QA volume', tone: '#ec4899' }
  ];

  page.innerHTML = '<div class="ux-overview">'
    + '<div class="ux-heading">'
      + '<div>'
        + '<div class="ux-eyebrow">Workforce Performance · Capacity & Ranking</div>'
        + '<h2>Performance per Labelers</h2>'
        + '<p>Comprehensive individual metrics, target achievement, capacity forecasting, and fair evaluation.</p>'
      + '</div>'
      + renderHeaderControlsHTML('perf')
    + '</div>'

    + renderUniversalFilterBar('performance')

    // Controls
    + '<div class="ux-panel perf-controls" style="margin-top:14px;">'
      + '<label>Search Labeler / ID / Shift / QTC<input id="perfQuery" placeholder="Type labeler name, masked ID, QTC…" value="' + esc(perfFilters.query || '') + '"></label>'
      + '<label>Category Filter<select id="perfCategory"><option value="">All Categories</option><option value="lidarFP" ' + (perfFilters.category==='lidarFP'?'selected':'') + '>Lidar FP</option><option value="lidarQA" ' + (perfFilters.category==='lidarQA'?'selected':'') + '>Lidar QA</option><option value="laneFP" ' + (perfFilters.category==='laneFP'?'selected':'') + '>Lane Line FP</option><option value="laneQA" ' + (perfFilters.category==='laneQA'?'selected':'') + '>Lane Line QA</option></select></label>'
      + '<div style="margin-left:auto; display:flex; gap:8px; align-items:flex-end;">'
        + '<button class="btn btn-c" id="perfExportCSV">↓ Export CSV (Masked IDs)</button>'
        + '<button class="btn" id="perfReset">Reset Filters</button>'
      + '</div>'
    + '</div>'

    // 10 KPI Grid
    + '<div class="ux-grid-10" style="margin-top:16px;">'
      + kpi10.map(k => '<div class="kpi-mini-card" style="--tone:' + k.tone + '">'
        + '<div class="kpi-title"><span>' + esc(k.title) + '</span><span style="color:' + k.tone + '">●</span></div>'
        + '<div class="kpi-val">' + k.val + '</div>'
        + '<div class="kpi-sub">' + esc(k.sub) + '</div>'
      + '</div>').join('')
    + '</div>'

    // TARGET SIMULATOR & CAPACITY FORECASTER
    + '<div class="target-sim-box">'
      + '<div class="sim-header">'
        + '<div>'
          + '<h3 style="margin:0; font-size:16px; font-weight:700;">🎯 Target Simulator & Capacity Forecaster</h3>'
          + '<p style="margin:3px 0 0; font-size:12px; color:var(--text-soft);">Model scenario targets and estimate workforce requirements. Forecast calculations are clearly distinguished from actual observations.</p>'
        + '</div>'
        + '<span class="sim-forecast-badge">MODEL SIMULATION · FORECAST ONLY</span>'
      + '</div>'
      + '<div class="sim-inputs-grid">'
        + '<label>Daily Target (tasks/person)<input type="number" id="simDaily" value="' + targetSimState.dailyTarget + '" min="1" step="5"></label>'
        + '<label>Shift Target (tasks/shift)<input type="number" id="simShift" value="' + targetSimState.shiftTarget + '" min="1" step="5"></label>'
        + '<label>Modality Focus<select id="simMod"><option value="all">All Modalities</option><option value="lidar">Lidar</option><option value="lane">Lane Line</option></select></label>'
        + '<label>Working Hours<input type="number" id="simHours" value="' + targetSimState.workHours + '" min="1" max="24" step="1"></label>'
        + '<label>Expected Workforce Size<input type="number" id="simWorkforce" value="' + targetSimState.workforceSize + '" min="1" step="5"></label>'
      + '</div>'
      + '<div class="sim-results-grid">'
        + '<div class="sim-res-card"><span>Expected Submissions</span><strong>' + simExpected.toLocaleString() + '</strong></div>'
        + '<div class="sim-res-card"><span>Current Achievement</span><strong style="color:' + (simAchPct >= 100 ? 'var(--success)' : '#df8b24') + ';">' + simAchPct + '%</strong></div>'
        + '<div class="sim-res-card"><span>Required Submissions</span><strong style="color:var(--danger);">' + simRequired.toLocaleString() + '</strong></div>'
        + '<div class="sim-res-card"><span>Projected End-of-Shift</span><strong style="color:var(--accent);">' + simProjected.toLocaleString() + '</strong></div>'
        + '<div class="sim-res-card"><span>Addl. Workforce Needed</span><strong>' + simWorkforceReq.toLocaleString() + ' people</strong></div>'
      + '</div>'
    + '</div>'

    // Fair Ranking Notice
    + '<div class="ux-panel" style="margin-top:20px; padding:12px 18px; border-left:4px solid #f59e0b; background:rgba(245,158,11,0.06); font-size:12px; line-height:1.6; color:var(--text);">'
      + '<b>⚖️ Fair Assessment & Compliance Notice:</b> Do not use raw submission counts alone for punitive employee rankings; account for task difficulty, verified quality, shift length, and data completeness. National IDs are permanently masked (<code>EMP-***XXXX</code>) across all tables and exports.'
    + '</div>'

    // MAIN LABELER TABLE
    + '<section class="ux-panel" style="margin-top:20px;">'
      + '<div class="ux-heading" style="margin-bottom:12px;">'
        + '<div><h3>Labeler Performance Rankings (' + filteredPeople.length.toLocaleString() + ' labelers)</h3><p>Click any column header with ↕ to sort. Click labeler name to view detailed profile.</p></div>'
        + '<span class="ux-note">Showing ' + (visiblePeople.length ? (perfFilters.page*pageSize+1) : 0) + ' – ' + Math.min((perfFilters.page+1)*pageSize, filteredPeople.length) + ' of ' + filteredPeople.length + ' labelers</span>'
      + '</div>'
      + '<div class="perf-table">'
        + '<table>'
          + '<thead><tr>'
            + '<th style="width:40px;">Rank</th>'
            + '<th data-sort="name">Labeler Name ↕</th>'
            + '<th>Employee ID</th>'
            + '<th>Shift(s)</th>'
            + '<th>Floor</th>'
            + '<th>QTC / Supervisor</th>'
            + '<th data-sort="total" style="color:var(--primary);">Total Submit ↕</th>'
            + '<th data-sort="lidarFP" style="color:#0d9488;">Lidar FP ↕</th>'
            + '<th data-sort="lidarQA" style="color:#14b8a6;">Lidar QA ↕</th>'
            + '<th data-sort="laneFP" style="color:#ed9a35;">Lane Line FP ↕</th>'
            + '<th data-sort="laneQA" style="color:#ec4899;">Lane Line QA ↕</th>'
            + '<th data-sort="activeDays">Active Days ↕</th>'
            + '<th data-sort="avgPerDay">Avg / Day ↕</th>'
            + '<th data-sort="avgPerHour">Avg / Hour ↕</th>'
            + '<th>Verified Quality</th>'
            + '<th>Target Ach. %</th>'
          + '</tr></thead>'
          + '<tbody>'
            + visiblePeople.map((p, idx) => {
              const rank = perfFilters.page * pageSize + idx + 1;
              const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : ('#' + rank);
              const tierClass = p.verifiedScore !== null ? (p.verifiedScore >= 0.95 ? 'tier-high' : p.verifiedScore >= 0.85 ? 'tier-mid' : 'tier-low') : '';
              return '<tr>'
                + '<td style="font-weight:700; color:var(--text-soft);">' + medal + '</td>'
                + '<td><button class="perf-person" data-person-key="' + esc(p.key) + '" style="background:none; border:none; color:var(--primary); font-weight:700; cursor:pointer; text-decoration:underline;">' + esc(p.name) + '</button></td>'
                + '<td><span class="q-badge" style="background:var(--bg-3); border:1px solid var(--border); font-family:var(--mono);">' + esc(p.maskedId) + '</span></td>'
                + '<td>' + ([...p.shifts].slice(0,2).map(s=>'<span class="q-badge q-shift">' + esc(s) + '</span>').join('') || '—') + '</td>'
                + '<td>' + ([...p.floors].map(esc).join(', ') || '—') + '</td>'
                + '<td>' + ([...p.qtcs].slice(0,2).join(', ') || '—') + '</td>'
                + '<td><strong style="color:var(--primary); font-size:14px;">' + p.total.toLocaleString() + '</strong></td>'
                + '<td>' + p.lidarFP.toLocaleString() + '</td>'
                + '<td>' + p.lidarQA.toLocaleString() + '</td>'
                + '<td>' + p.laneFP.toLocaleString() + '</td>'
                + '<td>' + p.laneQA.toLocaleString() + '</td>'
                + '<td><b>' + p.activeDays + '</b></td>'
                + '<td>' + p.avgPerDayStr + '</td>'
                + '<td>' + p.avgPerHourStr + '</td>'
                + '<td>' + (p.verifiedScore !== null ? '<span class="tier-badge ' + tierClass + '">' + p.verifiedScoreStr + '</span>' : '<span class="ux-note">—</span>') + '</td>'
                + '<td><b style="color:' + (p.targetAch >= 100 ? 'var(--success)' : 'var(--text)') + ';">' + p.targetAchStr + '</b></td>'
              + '</tr>';
            }).join('')
          + '</tbody>'
        + '</table>'
        + (!filteredPeople.length ? '<div class="ux-empty">No labelers match your filters.</div>' : '')
      + '</div>'
      + '<div class="perf-pagination" style="display:flex; justify-content:space-between; align-items:center; margin-top:14px;">'
        + '<button class="btn" id="perfPrev" ' + (perfFilters.page === 0 ? 'disabled' : '') + '>Previous</button>'
        + '<span class="ux-note">Page ' + (perfFilters.page + 1) + ' of ' + totalPages + '</span>'
        + '<button class="btn" id="perfNext" ' + (perfFilters.page >= totalPages - 1 ? 'disabled' : '') + '>Next</button>'
      + '</div>'
    + '</section>'
  + '</div>';

  bindHeaderControls(page, 'perf'); bindUniversalFilterBar(page, 'performance');
  const slicersEl = page.querySelector('#perfSlicers');
  if (slicersEl) slicersEl.appendChild(createListSlicers());

  // Search input
  const qInput = page.querySelector('#perfQuery');
  if (qInput) {
    qInput.oninput = (e) => {
      perfFilters.query = e.target.value;
      perfFilters.page = 0;
      renderPerformance();
    };
  }

  // Category select
  const catSel = page.querySelector('#perfCategory');
  if (catSel) {
    catSel.onchange = (e) => {
      perfFilters.category = e.target.value;
      perfFilters.page = 0;
      renderPerformance();
    };
  }

  // Sorter clicks
  page.querySelectorAll('th[data-sort]').forEach(th => {
    th.style.cursor = 'pointer';
    th.onclick = () => {
      const col = th.dataset.sort;
      if (perfFilters.sortCol === col) perfFilters.sortAsc = !perfFilters.sortAsc;
      else { perfFilters.sortCol = col; perfFilters.sortAsc = false; }
      renderPerformance();
    };
  });

  // Simulator live bindings
  const updateSim = () => {
    targetSimState.dailyTarget = Number($('simDaily').value) || 50;
    targetSimState.shiftTarget = Number($('simShift').value) || 25;
    targetSimState.workHours = Number($('simHours').value) || 8;
    targetSimState.workforceSize = Number($('simWorkforce').value) || totalPeople;
    renderPerformance();
  };
  $('simDaily').onchange = updateSim;
  $('simShift').onchange = updateSim;
  $('simHours').onchange = updateSim;
  $('simWorkforce').onchange = updateSim;

  // Pagination buttons
  $('perfPrev').onclick = () => { if (perfFilters.page > 0) { perfFilters.page--; renderPerformance(); } };
  $('perfNext').onclick = () => { if (perfFilters.page < totalPages - 1) { perfFilters.page++; renderPerformance(); } };
  $('perfReset').onclick = () => { perfFilters.query = ''; perfFilters.category = ''; perfFilters.page = 0; renderPerformance(); };

  // Export CSV with masked IDs
  $('perfExportCSV').onclick = () => {
    const headers = ['Rank', 'Labeler Name', 'Employee ID (Masked)', 'Shifts', 'Floors', 'QTCs', 'Total Submits', 'Lidar FP', 'Lidar QA', 'Lane Line FP', 'Lane Line QA', 'Active Days', 'Avg / Day', 'Avg / Hour', 'Verified Quality', 'Target Ach %'];
    const csvRows = filteredPeople.map((p, i) => [
      i + 1,
      p.name,
      p.maskedId,
      [...p.shifts].join('; '),
      [...p.floors].join('; '),
      [...p.qtcs].join('; '),
      p.total,
      p.lidarFP,
      p.lidarQA,
      p.laneFP,
      p.laneQA,
      p.activeDays,
      p.avgPerDayStr,
      p.avgPerHourStr,
      p.verifiedScoreStr,
      p.targetAchStr
    ]);
    const cell = v => '"' + String(v ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
    const csv = [headers, ...csvRows].map(r => r.map(cell).join(',')).join('\r\n');
    downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), 'MEEG_labelers_performance_' + cairoToday() + '.csv');
    showToast('✓ Exported labelers performance with masked IDs');
  };

  // Labeler Profile Modal click
  page.querySelectorAll('[data-person-key]').forEach(btn => {
    btn.onclick = () => {
      const k = btn.dataset.personKey;
      const p = peopleMap.get(k);
      if (!p) return;
      const qData = getLabelerQuality(p.name, '');
      const taskRows = p.tasks.map(t => [
        t.id,
        t.date,
        t.shift,
        t.unit,
        t.qtc,
        t.mod,
        t.pass
      ]);
      openDrilldownModal({
        title: p.name + ' · Detailed Profile',
        subtitle: p.maskedId + ' · ' + p.total.toLocaleString() + ' total submissions across ' + p.activeDays + ' active days',
        badge: qData ? 'Verified Quality: ' + (qData.totalAccuracy*100).toFixed(1)+'%' : 'Standard Contributor',
        columns: ['Task ID', 'Date', 'Shift', 'Unit', 'QTC', 'Modality', 'Pass'],
        rows: taskRows
      });
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
function renderDailyReport(){
  const page = $('uxDaily');
  if(!page || page.hidden) return;

  const rows = rowsInView();
  const cToday = cairoToday();
  const dateA = dailyReportDateA || cToday;
  const dateB = dailyReportDateB || _addDays(dateA, -1);

  // SECTION A: Quality Analytics Aggregations
  const qs = getQualityStore();
  const qsEntries = Object.entries(qs);
  let qTotal = 0, qSumTot = 0, qSumAtt = 0, qSumTva = 0, qSumArt = 0;
  let tierHighCount = 0, tierMidCount = 0, tierLowCount = 0;
  const qShiftMap = new Map();
  const qQtcMap = new Map();
  const qLabMap = new Map();

  qsEntries.forEach(([aid, q]) => {
    qTotal++;
    const tot = typeof window.qNum === 'function' ? window.qNum(q.totalAccuracy) : parseFloat(q.totalAccuracy);
    const att = typeof window.qNum === 'function' ? window.qNum(q.attribute) : parseFloat(q.attribute);
    const tva = typeof window.qNum === 'function' ? window.qNum(q.tvaF1) : parseFloat(q.tvaF1);
    const art = typeof window.qNum === 'function' ? window.qNum(q.artifacts) : parseFloat(q.artifacts);
    if(tot !== null && !isNaN(tot)) {
      qSumTot += tot;
      if (tot >= 0.95) tierHighCount++;
      else if (tot >= 0.85) tierMidCount++;
      else tierLowCount++;
    }
    if(att !== null && !isNaN(att)) qSumAtt += att;
    if(tva !== null && !isNaN(tva)) qSumTva += tva;
    if(art !== null && !isNaN(art)) qSumArt += art;

    const info = (window.idInfo && window.idInfo[aid]) || {};
    const sh = info.shift || 'Overnight';
    const qtc = info.qtc || 'Unassigned QTC';
    const lab = info.name || q.email || 'Unassigned Labeler';

    if(!qShiftMap.has(sh)) qShiftMap.set(sh, { count: 0, sum: 0 });
    qShiftMap.get(sh).count++;
    if(tot !== null && !isNaN(tot)) qShiftMap.get(sh).sum += tot;

    if(!qQtcMap.has(qtc)) qQtcMap.set(qtc, { count: 0, sum: 0 });
    qQtcMap.get(qtc).count++;
    if(tot !== null && !isNaN(tot)) qQtcMap.get(qtc).sum += tot;

    if(!qLabMap.has(lab)) qLabMap.set(lab, { count: 0, sum: 0, email: q.email || '' });
    qLabMap.get(lab).count++;
    if(tot !== null && !isNaN(tot)) qLabMap.get(lab).sum += tot;
  });

  const avgTot = qTotal ? (qSumTot / qTotal) : null;
  const avgAtt = qTotal ? (qSumAtt / qTotal) : null;
  const avgTva = qTotal ? (qSumTva / qTotal) : null;
  const avgArt = qTotal ? (qSumArt / qTotal).toFixed(1) : '—';

  // SECTION B: Daily Operational Breakdown for selected date
  const selectedDateRows = rows.filter(r => rDate(r) === dateA);
  const compareDateRows = rows.filter(r => rDate(r) === dateB);

  const getDayStats = (rList) => {
    const tot = rList.length;
    const lab = uniq(rList, 'Labeler Name') || 0;
    const qtc = uniq(rList, 'QTC Name') || 0;
    const q = uniq(rList, 'Queue Name') || 0;
    const lFP = rList.filter(r => isModPass(r, 'lidar', 'FP')).length;
    const lQA = rList.filter(r => isModPass(r, 'lidar', 'QA')).length;
    const lnFP = rList.filter(r => isModPass(r, 'laneline', 'FP')).length;
    const lnQA = rList.filter(r => isModPass(r, 'laneline', 'QA')).length;
    const vel = (tot / 18).toFixed(1);
    return { tot, lab, qtc, q, lFP, lQA, lnFP, lnQA, vel };
  };

  const statsA = getDayStats(selectedDateRows);
  const statsB = getDayStats(compareDateRows);
  const dodGrowth = statsB.tot > 0 ? (((statsA.tot - statsB.tot) / statsB.tot) * 100).toFixed(1) : '0.0';

  // Daily 6 breakdown tables for Date A
  const si = hdrs.findIndex(h => h.toLowerCase() === 'shift');
  const fi = hdrs.findIndex(h => ['floor', 'unit'].includes(h.toLowerCase()));
  const qi = hdrs.findIndex(h => h.toLowerCase() === 'queue name');
  const qcI = hdrs.findIndex(h => h.toLowerCase() === 'qtc name');
  const li = hdrs.findIndex(h => h.toLowerCase() === 'labeler name');

  const shiftDaily = new Map();
  const floorDaily = new Map();
  const queueDaily = new Map();
  const qtcDaily = new Map();
  const labelerDaily = new Map();

  selectedDateRows.forEach(r => {
    if(si >= 0 && r[si]) shiftDaily.set(r[si], (shiftDaily.get(r[si]) || 0) + 1);
    if(fi >= 0 && r[fi]) { const fl = deriveFloor(r[fi]); floorDaily.set(fl, (floorDaily.get(fl) || 0) + 1); }
    if(qi >= 0 && r[qi]) queueDaily.set(r[qi], (queueDaily.get(r[qi]) || 0) + 1);
    if(qcI >= 0 && r[qcI]) qtcDaily.set(r[qcI], (qtcDaily.get(r[qcI]) || 0) + 1);
    if(li >= 0 && r[li]) labelerDaily.set(r[li], (labelerDaily.get(r[li]) || 0) + 1);
  });

  // Render HTML
  page.innerHTML = '<div class="ux-overview">'
    + '<div class="ux-heading">'
      + '<div>'
        + '<div class="ux-eyebrow">Enterprise Operations · Comprehensive Reports</div>'
        + '<h2>Quality & Daily Operational Report</h2>'
        + '<p>Verified annotation quality scores and day-by-day operational production breakdowns.</p>'
      + '</div>'
      + renderHeaderControlsHTML('daily')
    + '</div>'

    + renderUniversalFilterBar('daily')

    // Segmented Section Toggle
    + '<div class="section-switch-wrap">'
      + '<button class="section-switch-btn ' + (dailyReportSection==='quality'?'active':'') + '" id="btnSecQuality">⭐ Section A — Quality Analytics</button>'
      + '<button class="section-switch-btn ' + (dailyReportSection==='daily'?'active':'') + '" id="btnSecDaily">📅 Section B — Daily Operational Report</button>'
    + '</div>'

    // ============================================================
    // SECTION A CONTENT: QUALITY ANALYTICS
    // ============================================================
    + '<div id="sectionA_Quality" style="display:' + (dailyReportSection==='quality'?'block':'none') + ';">'
      + '<div class="ux-panel" style="margin-bottom:18px; padding:12px 18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; background:var(--bg-2); border-left:4px solid var(--success);">'
        + '<div><b>Verified Quality Knowledgebase:</b> Strictly derived from quality assessment records in the Export tab.</div>'
        + '<div style="display:flex; gap:8px;">'
          + '<button class="btn btn-c" id="qualityRefreshBtn" style="font-size:12px;">📥 Import / Refresh Quality</button>'
          + '<button class="btn" id="qualityUnmatchedBtn" style="font-size:12px;">⚠️ Unmatched Records</button>'
        + '</div>'
      + '</div>'

      // 8 Quality KPI Cards
      + '<div class="ux-grid-8">'
        + '<div class="kpi-mini-card" style="--tone:var(--primary);"><div class="kpi-title">Total Reviews</div><div class="kpi-val">' + qTotal.toLocaleString() + '</div><div class="kpi-sub">Assessed tasks</div></div>'
        + '<div class="kpi-mini-card" style="--tone:var(--success);"><div class="kpi-title">Verified Accuracy</div><div class="kpi-val" style="color:var(--success);">' + (avgTot ? (avgTot*100).toFixed(1)+'%' : '—') + '</div><div class="kpi-sub">Weighted mean</div></div>'
        + '<div class="kpi-mini-card" style="--tone:var(--accent);"><div class="kpi-title">Attribute Accuracy</div><div class="kpi-val">' + (avgAtt ? (avgAtt*100).toFixed(1)+'%' : '—') + '</div><div class="kpi-sub">Attribute precision</div></div>'
        + '<div class="kpi-mini-card" style="--tone:#df8b24;"><div class="kpi-title">TVA F1 Score</div><div class="kpi-val">' + (avgTva ? (avgTva*100).toFixed(1)+'%' : '—') + '</div><div class="kpi-sub">Temporal volume</div></div>'
        + '<div class="kpi-mini-card" style="--tone:var(--danger);"><div class="kpi-title">Artifacts Reported</div><div class="kpi-val">' + avgArt + '</div><div class="kpi-sub">Mean artifacts / task</div></div>'
        + '<div class="kpi-mini-card" style="--tone:var(--success);"><div class="kpi-title">High Tier (≥95%)</div><div class="kpi-val" style="color:var(--success);">' + tierHighCount.toLocaleString() + '</div><div class="kpi-sub">' + (qTotal ? ((tierHighCount/qTotal)*100).toFixed(0) : 0) + '% of assessments</div></div>'
        + '<div class="kpi-mini-card" style="--tone:var(--warning);"><div class="kpi-title">Mid Tier (85-94%)</div><div class="kpi-val" style="color:var(--warning);">' + tierMidCount.toLocaleString() + '</div><div class="kpi-sub">' + (qTotal ? ((tierMidCount/qTotal)*100).toFixed(0) : 0) + '% of assessments</div></div>'
        + '<div class="kpi-mini-card" style="--tone:var(--danger);"><div class="kpi-title">Low Tier (<85%)</div><div class="kpi-val" style="color:var(--danger);">' + tierLowCount.toLocaleString() + '</div><div class="kpi-sub">' + (qTotal ? ((tierLowCount/qTotal)*100).toFixed(0) : 0) + '% of assessments</div></div>'
      + '</div>'

      // Quality Rankings Tables: Shift & QTC
      + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:18px; margin-top:20px;">'
        + '<div class="ux-panel">'
          + '<h3>Quality Accuracy by Shift</h3>'
          + '<div class="perf-table" style="margin-top:10px;">'
            + '<table>'
              + '<thead><tr><th>Shift</th><th>Assessed Tasks</th><th>Avg Accuracy</th><th>Tier</th></tr></thead>'
              + '<tbody>'
                + ([...qShiftMap.entries()].sort((a,b)=>(b[1].sum/b[1].count)-(a[1].sum/a[1].count)).map(([sh, d]) => {
                  const acc = d.count ? d.sum / d.count : 0;
                  const tier = acc >= 0.95 ? 'tier-high' : acc >= 0.85 ? 'tier-mid' : 'tier-low';
                  return '<tr><td><b>' + esc(sh) + '</b></td><td>' + d.count.toLocaleString() + '</td><td>' + (acc*100).toFixed(1) + '%</td><td><span class="tier-badge ' + tier + '">' + (acc >= 0.95 ? 'High' : acc >= 0.85 ? 'Mid' : 'Low') + '</span></td></tr>';
                }).join('') || '<tr><td colspan="4" class="ux-empty">No shift quality records</td></tr>')
              + '</tbody>'
            + '</table>'
          + '</div>'
        + '</div>'

        + '<div class="ux-panel">'
          + '<h3>Top QTC Quality Rankings</h3>'
          + '<div class="perf-table" style="margin-top:10px;">'
            + '<table>'
              + '<thead><tr><th>Rank</th><th>QTC Supervisor</th><th>Assessed Tasks</th><th>Accuracy</th><th>Tier</th></tr></thead>'
              + '<tbody>'
                + ([...qQtcMap.entries()].sort((a,b)=>(b[1].sum/b[1].count)-(a[1].sum/a[1].count)).slice(0, 10).map(([qc, d], i) => {
                  const acc = d.count ? d.sum / d.count : 0;
                  const tier = acc >= 0.95 ? 'tier-high' : acc >= 0.85 ? 'tier-mid' : 'tier-low';
                  return '<tr><td>' + (i < 3 ? ['🥇','🥈','🥉'][i] : '#' + (i+1)) + '</td><td><b>' + esc(qc) + '</b></td><td>' + d.count.toLocaleString() + '</td><td>' + (acc*100).toFixed(1) + '%</td><td><span class="tier-badge ' + tier + '">' + (acc >= 0.95 ? 'High' : acc >= 0.85 ? 'Mid' : 'Low') + '</span></td></tr>';
                }).join('') || '<tr><td colspan="5" class="ux-empty">No QTC quality records</td></tr>')
              + '</tbody>'
            + '</table>'
          + '</div>'
        + '</div>'
      + '</div>'

      // Main Quality Assessments Table
      + '<section class="ux-panel" style="margin-top:20px;">'
        + '<div class="ux-heading" style="margin-bottom:12px;">'
          + '<div><h3>Verified Quality Assessment Records (' + qTotal.toLocaleString() + ')</h3><p>Individual task accuracy scores from quality evaluations.</p></div>'
        + '</div>'
        + '<div class="perf-table">'
          + '<table>'
            + '<thead><tr>'
              + '<th>Task ID</th><th>Date</th><th>Labeler</th><th>QTC</th><th>Shift</th><th>Attribute Acc</th><th>TVA F1</th><th>Total Acc</th><th>Tier</th><th>Artifacts</th>'
            + '</tr></thead>'
            + '<tbody>'
              + (qsEntries.slice(0, 50).map(([aid, q]) => {
                const info = (window.idInfo && window.idInfo[aid]) || {};
                const tot = typeof window.qNum === 'function' ? window.qNum(q.totalAccuracy) : parseFloat(q.totalAccuracy);
                const tier = tot !== null ? (tot >= 0.95 ? 'tier-high' : tot >= 0.85 ? 'tier-mid' : 'tier-low') : '';
                return '<tr>'
                  + '<td><code>' + esc(aid) + '</code></td>'
                  + '<td>' + (q.actualDate || '—') + '</td>'
                  + '<td><b>' + esc(info.name || q.email || '—') + '</b></td>'
                  + '<td>' + esc(info.qtc || '—') + '</td>'
                  + '<td>' + esc(info.shift || '—') + '</td>'
                  + '<td>' + (typeof window.qFmt === 'function' ? window.qFmt(q.attribute) : (q.attribute || '—')) + '</td>'
                  + '<td>' + (typeof window.qFmt === 'function' ? window.qFmt(q.tvaF1) : (q.tvaF1 || '—')) + '</td>'
                  + '<td><b>' + (typeof window.qFmt === 'function' ? window.qFmt(tot) : (tot*100).toFixed(1)+'%') + '</b></td>'
                  + '<td>' + (tier ? '<span class="tier-badge ' + tier + '">' + (tot >= 0.95 ? 'High' : tot >= 0.85 ? 'Mid' : 'Low') + '</span>' : '—') + '</td>'
                  + '<td>' + (q.artifacts || '0') + '</td>'
                + '</tr>';
              }).join('') || '<tr><td colspan="10" class="ux-empty">No quality assessment records found. Click "Import / Refresh Quality" above.</td></tr>')
            + '</tbody>'
          + '</table>'
          + (qTotal > 50 ? '<div style="text-align:center; padding:12px; font-size:12px; color:var(--muted);">Showing first 50 of ' + qTotal.toLocaleString() + ' records</div>' : '')
        + '</div>'
      + '</section>'
    + '</div>'

    // ============================================================
    // SECTION B CONTENT: DAILY OPERATIONAL REPORT
    // ============================================================
    + '<div id="sectionB_Daily" style="display:' + (dailyReportSection==='daily'?'block':'none') + ';">'
      // Operational Date Picker Bar
      + '<div class="ux-panel" style="margin-bottom:18px; padding:14px 20px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:14px;">'
        + '<div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">'
          + '<label style="font-weight:700; font-size:13px; display:flex; align-items:center; gap:6px;">📅 Operational Date (Cairo):<input type="date" id="dailyDateAInput" value="' + dateA + '" style="padding:6px 10px; border-radius:8px; border:1px solid var(--border); font-size:13px; background:var(--bg-3); color:var(--text);"></label>'
          + '<button class="btn btn-c" id="btnDailyToday" style="font-size:12px; padding:5px 10px;">Today</button>'
          + '<button class="btn" id="btnDailyYesterday" style="font-size:12px; padding:5px 10px;">Yesterday</button>'
          + '<label style="font-size:12px; display:flex; align-items:center; gap:6px; margin-left:10px; cursor:pointer;"><input type="checkbox" id="dailyCompareToggle" ' + (dailyReportCompareMode?'checked':'') + '> <b>⚖️ Compare Two Dates</b></label>'
          + (dailyReportCompareMode ? '<label style="font-size:12px; display:flex; align-items:center; gap:6px;">Compare with Date B:<input type="date" id="dailyDateBInput" value="' + dateB + '" style="padding:5px 8px; border-radius:8px; border:1px solid var(--border); font-size:12px; background:var(--bg-3); color:var(--text);"></label>' : '')
        + '</div>'
        + '<div style="display:flex; gap:8px;">'
          + '<button class="btn btn-c" id="dailyExportCSV" style="font-size:12px;">↓ Export Daily CSV</button>'
          + '<button class="btn" id="dailyPrintBtn" style="font-size:12px;">🖨️ Print</button>'
        + '</div>'
      + '</div>'

      // 10 Daily KPI Cards
      + '<div class="ux-grid-10">'
        + '<div class="kpi-mini-card" style="--tone:var(--primary);"><div class="kpi-title">Day Submissions</div><div class="kpi-val">' + statsA.tot.toLocaleString() + '</div><div class="kpi-sub">' + dateA + ' output</div></div>'
        + '<div class="kpi-mini-card" style="--tone:#0a9d8c;"><div class="kpi-title">Active Labelers</div><div class="kpi-val">' + statsA.lab.toLocaleString() + '</div><div class="kpi-sub">On this date</div></div>'
        + '<div class="kpi-mini-card" style="--tone:#df8b24;"><div class="kpi-title">Active QTCs</div><div class="kpi-val">' + statsA.qtc.toLocaleString() + '</div><div class="kpi-sub">Supervising</div></div>'
        + '<div class="kpi-mini-card" style="--tone:#df5c99;"><div class="kpi-title">Active Queues</div><div class="kpi-val">' + statsA.q.toLocaleString() + '</div><div class="kpi-sub">Receiving work</div></div>'
        + '<div class="kpi-mini-card" style="--tone:#0d9488;"><div class="kpi-title">Lidar FP</div><div class="kpi-val">' + statsA.lFP.toLocaleString() + '</div><div class="kpi-sub">First pass</div></div>'
        + '<div class="kpi-mini-card" style="--tone:#14b8a6;"><div class="kpi-title">Lidar QA</div><div class="kpi-val">' + statsA.lQA.toLocaleString() + '</div><div class="kpi-sub">Quality review</div></div>'
        + '<div class="kpi-mini-card" style="--tone:#ed9a35;"><div class="kpi-title">Lane Line FP</div><div class="kpi-val">' + statsA.lnFP.toLocaleString() + '</div><div class="kpi-sub">First pass</div></div>'
        + '<div class="kpi-mini-card" style="--tone:#ec4899;"><div class="kpi-title">Lane Line QA</div><div class="kpi-val">' + statsA.lnQA.toLocaleString() + '</div><div class="kpi-sub">Quality review</div></div>'
        + '<div class="kpi-mini-card" style="--tone:#6366f1;"><div class="kpi-title">Hourly Velocity</div><div class="kpi-val">' + statsA.vel + ' /hr</div><div class="kpi-sub">Submits / hour</div></div>'
        + '<div class="kpi-mini-card" style="--tone:var(--success);"><div class="kpi-title">DoD Growth %</div><div class="kpi-val" style="color:' + (parseFloat(dodGrowth)>=0?'var(--success)':'var(--danger)') + ';">' + (parseFloat(dodGrowth)>=0?'+':'') + dodGrowth + '%</div><div class="kpi-sub">vs previous day</div></div>'
      + '</div>'

      // TWO-DATE COMPARISON MODE VIEW (When active)
      + (dailyReportCompareMode ? (
        '<div class="ux-panel" style="margin-top:20px; border-top:4px solid var(--accent);">'
          + '<div class="ux-heading" style="margin-bottom:12px;">'
            + '<div><h3>⚖️ Two-Date Period Comparison: ' + dateA + ' vs ' + dateB + '</h3><p>Side-by-side delta calculation between both selected operational dates.</p></div>'
          + '</div>'
          + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">'
            + [
              ['Total Submissions', statsA.tot, statsB.tot],
              ['Active Labelers', statsA.lab, statsB.lab],
              ['Active QTCs', statsA.qtc, statsB.qtc],
              ['Active Queues', statsA.q, statsB.q],
              ['Lidar FP', statsA.lFP, statsB.lFP],
              ['Lidar QA', statsA.lQA, statsB.lQA],
              ['Lane Line FP', statsA.lnFP, statsB.lnFP],
              ['Lane Line QA', statsA.lnQA, statsB.lnQA]
            ].map(([lbl, va, vb]) => {
              const diff = va - vb;
              const pct = vb > 0 ? ((diff / vb) * 100).toFixed(1) : '—';
              const isPos = diff >= 0;
              return '<div style="background:var(--bg-2); padding:12px; border-radius:10px; border:1px solid var(--border);">'
                + '<span class="ux-note">' + lbl + '</span>'
                + '<div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:4px;">'
                  + '<strong style="font-size:16px;">' + va.toLocaleString() + '</strong>'
                  + '<span style="font-size:12px; color:var(--text-soft);">vs ' + vb.toLocaleString() + '</span>'
                + '</div>'
                + '<div style="margin-top:6px; font-weight:700; font-size:11px; color:' + (isPos ? 'var(--success)' : 'var(--danger)') + ';">'
                  + (isPos ? '▲ +' : '▼ ') + diff.toLocaleString() + (pct !== '—' ? ' (' + (isPos ? '+' : '') + pct + '%)' : '')
                + '</div>'
              + '</div>';
            }).join('')
          + '</div>'
        + '</div>'
      ) : '')

      // 6 IN-DEPTH BREAKDOWN TABLES FOR DATE A
      + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:18px; margin-top:20px;">'
        // 1. Shift Breakdown
        + '<div class="ux-panel">'
          + '<h3>1. Shift Production Breakdown</h3>'
          + '<div class="perf-table" style="margin-top:10px;">'
            + '<table><thead><tr><th>Shift</th><th>Submissions</th><th>Share %</th></tr></thead><tbody>'
              + ([...shiftDaily.entries()].sort((a,b)=>b[1]-a[1]).map(([s,c])=>'<tr><td><b>' + esc(s) + '</b></td><td>' + c.toLocaleString() + '</td><td>' + (statsA.tot ? ((c/statsA.tot)*100).toFixed(1) : 0) + '%</td></tr>').join('') || '<tr><td colspan="3" class="ux-empty">No shift data</td></tr>')
            + '</tbody></table>'
          + '</div>'
        + '</div>'

        // 2. Floor Breakdown
        + '<div class="ux-panel">'
          + '<h3>2. Floor Breakdown</h3>'
          + '<div class="perf-table" style="margin-top:10px;">'
            + '<table><thead><tr><th>Floor</th><th>Submissions</th><th>Share %</th></tr></thead><tbody>'
              + (([...floorDaily.keys()].sort().map(fl=>{ const c = floorDaily.get(fl)||0; return '<tr><td><b>' + esc(fl) + '</b></td><td>' + c.toLocaleString() + '</td><td>' + (statsA.tot ? ((c/statsA.tot)*100).toFixed(1) : 0) + '%</td></tr>'; }).join('')) || '<tr><td colspan="3" class="ux-empty">No floor data</td></tr>')
            + '</tbody></table>'
          + '</div>'
        + '</div>'

        // 3. Queue Breakdown
        + '<div class="ux-panel">'
          + '<h3>3. Top Queues for ' + dateA + '</h3>'
          + '<div class="perf-table" style="margin-top:10px;">'
            + '<table><thead><tr><th>Queue</th><th>Submissions</th></tr></thead><tbody>'
              + ([...queueDaily.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([q,c])=>'<tr><td><b style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:200px; display:block;">' + esc(q) + '</b></td><td>' + c.toLocaleString() + '</td></tr>').join('') || '<tr><td colspan="2" class="ux-empty">No queue data</td></tr>')
            + '</tbody></table>'
          + '</div>'
        + '</div>'

        // 4. QTC Breakdown
        + '<div class="ux-panel">'
          + '<h3>4. Top QTC Teams for ' + dateA + '</h3>'
          + '<div class="perf-table" style="margin-top:10px;">'
            + '<table><thead><tr><th>QTC Supervisor</th><th>Team Submissions</th></tr></thead><tbody>'
              + ([...qtcDaily.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([qc,c])=>'<tr><td><b>' + esc(qc) + '</b></td><td>' + c.toLocaleString() + '</td></tr>').join('') || '<tr><td colspan="2" class="ux-empty">No QTC data</td></tr>')
            + '</tbody></table>'
          + '</div>'
        + '</div>'

        // 5. Top Labelers
        + '<div class="ux-panel">'
          + '<h3>5. Top Labelers for ' + dateA + '</h3>'
          + '<div class="perf-table" style="margin-top:10px;">'
            + '<table><thead><tr><th>Labeler</th><th>Submissions</th></tr></thead><tbody>'
              + ([...labelerDaily.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([l,c])=>'<tr><td><b>' + esc(l) + '</b></td><td>' + c.toLocaleString() + '</td></tr>').join('') || '<tr><td colspan="2" class="ux-empty">No labeler data</td></tr>')
            + '</tbody></table>'
          + '</div>'
        + '</div>'

        // 6. Modality x Pass Matrix
        + '<div class="ux-panel">'
          + '<h3>6. Modality × Pass Matrix</h3>'
          + '<div class="perf-table" style="margin-top:10px;">'
            + '<table><thead><tr><th>Modality</th><th>First Pass (FP)</th><th>Quality (QA)</th><th>Total</th></tr></thead><tbody>'
              + '<tr><td><b>Lidar</b></td><td>' + statsA.lFP.toLocaleString() + '</td><td>' + statsA.lQA.toLocaleString() + '</td><td><b>' + (statsA.lFP + statsA.lQA).toLocaleString() + '</b></td></tr>'
              + '<tr><td><b>Lane Line</b></td><td>' + statsA.lnFP.toLocaleString() + '</td><td>' + statsA.lnQA.toLocaleString() + '</td><td><b>' + (statsA.lnFP + statsA.lnQA).toLocaleString() + '</b></td></tr>'
            + '</tbody></table>'
          + '</div>'
        + '</div>'
      + '</div>'
    + '</div>'
  + '</div>';

  bindHeaderControls(page, 'daily'); bindUniversalFilterBar(page, 'daily');

  // Toggle Section A / Section B
  $('btnSecQuality').onclick = () => { dailyReportSection = 'quality'; renderDailyReport(); };
  $('btnSecDaily').onclick = () => { dailyReportSection = 'daily'; renderDailyReport(); };

  // Section A Buttons
  const qRefBtn = page.querySelector('#qualityRefreshBtn');
  if(qRefBtn) qRefBtn.onclick = () => {
    if(typeof fetchQualityData === 'function') fetchQualityData(false);
  };
  const qUnmBtn = page.querySelector('#qualityUnmatchedBtn');
  if(qUnmBtn) qUnmBtn.onclick = () => {
    const unList = [];
    qsEntries.forEach(([aid, q]) => {
      const match = rows.some(r => {
        const ti = hdrs.findIndex(h => ['task id', 'id'].includes(h.toLowerCase()));
        return ti >= 0 && String(r[ti]).trim() === aid;
      });
      if (!match) unList.push([aid, q.actualDate || '—', q.email || '—', q.totalAccuracy || '—']);
    });
    openDrilldownModal({
      title: 'Unmatched Quality Records (' + unList.length + ')',
      subtitle: 'Tasks in Quality Export tab not matched to active Turso DB rows',
      badge: 'Discrepancy Check',
      columns: ['Actual Task ID', 'Actual Date', 'Email', 'Total Accuracy'],
      rows: unList
    });
  };

  // Section B Buttons
  const dateAInp = page.querySelector('#dailyDateAInput');
  if(dateAInp) dateAInp.onchange = (e) => { dailyReportDateA = e.target.value; renderDailyReport(); };
  const dateBInp = page.querySelector('#dailyDateBInput');
  if(dateBInp) dateBInp.onchange = (e) => { dailyReportDateB = e.target.value; renderDailyReport(); };

  const cmpTgl = page.querySelector('#dailyCompareToggle');
  if(cmpTgl) cmpTgl.onchange = (e) => { dailyReportCompareMode = e.target.checked; renderDailyReport(); };

  const todayBtn = page.querySelector('#btnDailyToday');
  if(todayBtn) todayBtn.onclick = () => { dailyReportDateA = cToday; renderDailyReport(); };
  const yestBtn = page.querySelector('#btnDailyYesterday');
  if(yestBtn) yestBtn.onclick = () => { dailyReportDateA = _addDays(cToday, -1); renderDailyReport(); };

  const printBtn = page.querySelector('#dailyPrintBtn');
  if(printBtn) printBtn.onclick = () => window.print();

  const exportBtn = page.querySelector('#dailyExportCSV');
  if(exportBtn) exportBtn.onclick = () => {
    const headers = ['Category', 'Item Name', 'Count / Value', 'Share %'];
    const csvRows = [
      ['Date', dateA, statsA.tot + ' tasks', '100%'],
      ['Metrics', 'Active Labelers', statsA.lab, '—'],
      ['Metrics', 'Active QTCs', statsA.qtc, '—'],
      ['Metrics', 'Active Queues', statsA.q, '—'],
      ['Metrics', 'Lidar FP', statsA.lFP, '—'],
      ['Metrics', 'Lidar QA', statsA.lQA, '—'],
      ['Metrics', 'Lane Line FP', statsA.lnFP, '—'],
      ['Metrics', 'Lane Line QA', statsA.lnQA, '—'],
      ['Metrics', 'Hourly Velocity', statsA.vel + ' /hr', '—'],
      ...([...shiftDaily.entries()].map(([s,c]) => ['Shift', s, c, ((c/statsA.tot)*100).toFixed(1)+'%'])),
      ...([...floorDaily.entries()].map(([f,c]) => ['Floor', f, c, ((c/statsA.tot)*100).toFixed(1)+'%'])),
      ...([...queueDaily.entries()].slice(0, 15).map(([q,c]) => ['Queue', q, c, ((c/statsA.tot)*100).toFixed(1)+'%']))
    ];
    const cell = v => '"' + String(v ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
    const csv = [headers, ...csvRows].map(r => r.map(cell).join(',')).join('\r\n');
    downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), 'MEEG_daily_report_' + dateA + '.csv');
    showToast('✓ Daily operational report CSV exported');
  };
}

const sourceStateObserver=new MutationObserver(()=>{if(!window._firstDataReady){renderDailyReport();if(typeof renderQueuesAnalysis==='function')renderQueuesAnalysis();}});if($('mainContent'))sourceStateObserver.observe($('mainContent'),{childList:true,subtree:true});



/* Bound source requests and worker parsing; keep the same sheet and session. */

async function fetchSheetText(url,timeoutMs=45000){

 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);

 try{

   const response=await fetch(url,{cache:'no-store',signal:controller.signal});

   if(!response.ok)throw new Error('HTTP '+response.status);

   const text=await response.text();

   if(/^\s*</.test(text))throw new Error('Google returned a sign-in or error page instead of CSV');

   const firstLine=text.slice(0,text.indexOf('\n')>=0?text.indexOf('\n')+1:text.length);

   const first=parseCSV(firstLine)[0]||[];

   if(!first.some(h=>String(h).trim().toLowerCase()==='queue name')||!first.some(h=>String(h).trim().toLowerCase()==='pass'))throw new Error('The source response is missing Queue Name or Pass');

   return text;

 }catch(e){

   if(e.name==='AbortError')throw new Error('Source request timed out');

   throw e;

 }finally{clearTimeout(timer);}

}



const originalCsvParser=parseCSVAsync;

parseCSVAsync=function(text){

 return new Promise((resolve,reject)=>{

   const timer=setTimeout(()=>{

     try{resolve(parseCSV(text).filter(r=>r&&r.length&&r.some(c=>String(c||'').trim())));}catch(e){reject(e);}

   },15000);

   Promise.resolve().then(()=>originalCsvParser(text)).then(table=>{

     clearTimeout(timer);resolve(table);

   },error=>{

     clearTimeout(timer);

     try{resolve(parseCSV(text).filter(r=>r&&r.length&&r.some(c=>String(c||'').trim())));}catch(e){reject(error);}

   });

 });

};



// Source data uses the existing CSV transport; no layout or calendar changes.
function dashboardCsvSources(){
 const base='https://docs.google.com/spreadsheets/d/'+SHEET_ID;
 const query=encodeURIComponent('select * where A is not null');
 const backup='https://docs.google.com/spreadsheets/d/1vpsYtvoZSKLsUeKj-FTXVGJmyFygSSck8DUIODJha_A';
 const tab=encodeURIComponent('Backup Date Base');
 return [
  {name:'Main Data Base',urls:[base+'/gviz/tq?tqx=out:csv&headers=1&tq='+query+(SHEET_GID?'&gid='+encodeURIComponent(SHEET_GID):''),base+'/export?format=csv&gid='+encodeURIComponent(SHEET_GID),base+'/gviz/tq?tqx=out:csv&headers=1&gid='+encodeURIComponent(SHEET_GID)]},
  {name:'Backup Intake / Backup Date Base',urls:[backup+'/gviz/tq?tqx=out:csv&headers=1&sheet='+tab+'&tq='+query,backup+'/gviz/tq?tqx=out:csv&headers=1&sheet='+tab]}
 ];
}
async function fetchDashboardCsvSource(source){
 let failure;
 for(const url of source.urls){
  try{
   const table=await parseCSVAsync(await fetchSheetText(url,45000));
   if(!table.length)throw new Error('Empty CSV response');
   return table;
  }catch(e){failure=e;}
 }
 throw new Error(source.name+': '+(failure?.message||'Source unavailable'));
}
function mergeDashboardCsvSources(tables){
 const canonical=value=>{const key=String(value??'').trim().toLowerCase().replace(/\s+/g,' ');return key==='task id'?'id':key;};
 const headers=[],keys=[],positions=new Map();
 tables.forEach(table=>(table[0]||[]).forEach(header=>{
  const key=canonical(header);if(!key||positions.has(key))return;
  positions.set(key,headers.length);keys.push(key);headers.push(key==='id'?'Id':String(header).trim());
 }));
 const combined=[headers],priorCounts=new Map();
 const context=['timestamp','shift','unit','qtc name','yubikey email','labeler name','national id','pc no','modality','queue name','task link','id','object count','pass','stage'];
 const get=(row,key)=>row[positions.get(key)]||'';
 tables.forEach(table=>{
  const mapping=(table[0]||[]).map(h=>positions.get(canonical(h)));
  const counts=new Map();
  table.slice(1).forEach(input=>{
   const row=headers.map(()=>'');
   input.forEach((value,index)=>{const to=mapping[index];if(to!==undefined)row[to]=String(value??'').trim();});
   if(!row.some(Boolean))return;
   // Exact matching submission context across sources only. Keep repeated tasks,
   // FP versus QA and different timestamps. Preserve within-source multiplicity.
   if(get(row,'id')||get(row,'task link')){
    const key=JSON.stringify(context.map(k=>k==='timestamp'?(get(row,k)||get(row,'created at')):get(row,k)));
    const occurrence=(counts.get(key)||0)+1;counts.set(key,occurrence);
    if(occurrence<=(priorCounts.get(key)||0))return;
   }
   combined.push(row);
  });
  counts.forEach((count,key)=>priorCounts.set(key,Math.max(count,priorCounts.get(key)||0)));
 });
 return combined;
}
function dashboardCsvText(table){return table.map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');}

let sheetLoadPromise=null;

let _instantCacheAttempted=false;



loadData=function(){

 if(sheetLoadPromise)return sheetLoadPromise;

 if(!getLoggedInEmail()){showToast('Sign in to load dashboard data.');return Promise.resolve();}

 const button=$('refreshBtn');setSyncActive(true);setTrafficLight('yellow');if(button)button.disabled=true;



 // Fast cache hydration: immediately render from IndexedDB if memory is empty

 if(!rawRows.length&&!_instantCacheAttempted){

   _instantCacheAttempted=true;

   idbGet('csv-two-sources-v1').then(cached=>{

     if(cached&&cached.v===AUTH_VER&&cached.text&&!rawRows.length){

       parseCSVAsync(cached.text).then(table=>{

         if(!rawRows.length&&table&&table.length){

           onCsvTable(table);

           setTrafficLight('yellow');

           showToast('⚡ Showing cached data — syncing latest updates…');

         }

       }).catch(()=>{});

     }

   }).catch(()=>{});

 }



 if(!rawRows.length)$('mainContent').innerHTML='<div class="loader"><div class="spin"></div><span class="ltxt">Loading source data…</span></div>';

 

 sheetLoadPromise=(async()=>{
    let failure;
    try{
      const token = (typeof getAuthToken === "function" ? getAuthToken() : (sessionStorage.getItem("meeg_auth_token") || ""));
      const apiBase = window.MEEG_API_URL || localStorage.getItem("meeg_api_url") || (window.location.hostname.includes("github.io") ? "https://meeg-secure-api.islamyasser424.workers.dev" : "");
      const res = await (typeof apiFetch === "function" ? apiFetch("/api/analytics/dataset?limit=25000") : fetch(apiBase + "/api/analytics/dataset?limit=25000", {
        headers: token ? { "Authorization": "Bearer " + token } : {},
        credentials: "include"
      }));
      if(!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const dbRows = data.rows || [];
      const headers = ['Timestamp', 'Shift', 'Unit', 'Qtc Name', 'Yubikey Email', 'Labeler Name', 'National ID', 'Pc No', 'Modality', 'Queue Name', 'Task Link', 'Id', 'Object Count', 'Pass', 'Stage', 'Created At'];
      const table = [headers];
      for (let i = 0; i < dbRows.length; i++) {
        const row = dbRows[i];
        table.push([
          row.timestamp != null ? String(row.timestamp) : '',
          row.shift != null ? String(row.shift) : '',
          row.unit != null ? String(row.unit) : '',
          row.qtc_name != null ? String(row.qtc_name) : '',
          row.yubikey_email != null ? String(row.yubikey_email) : '',
          row.labeler_name != null ? String(row.labeler_name) : '',
          row.national_id != null ? String(row.national_id) : '',
          row.pc_no != null ? String(row.pc_no) : '',
          row.modality != null ? String(row.modality) : '',
          row.queue_name != null ? String(row.queue_name) : '',
          row.task_link != null ? String(row.task_link) : '',
          row.id != null ? String(row.id) : '',
          row.object_count != null ? String(row.object_count) : '0',
          row.pass != null ? String(row.pass) : '',
          row.stage != null ? String(row.stage) : '',
          row.created_at != null ? String(row.created_at) : ''
        ]);
      }
      onCsvTable(table);
      setTrafficLight('green');
      return;;
   }catch(e){failure=e;}

   if(!rawRows.length){

     const cached=await idbGet('csv-two-sources-v1');

     if(cached&&cached.v===AUTH_VER&&cached.text){

       try{

         onCsvTable(await parseCSVAsync(cached.text));

         setTrafficLight('yellow');

         showToast('Showing saved combined data. '+(failure?.message||'A source could not be reached.'));

         return;

       }catch(e){}

     }

     showErr('Could not load both Google Sheets: '+(failure?.message||'Network error')+'. Check source viewing access, then retry.');

   }else{

     setTrafficLight('red');

     showToast('Refresh failed — keeping the last combined data. '+(failure?.message||''));

   }

 })().finally(()=>{

   sheetLoadPromise=null;

   setSyncActive(false);

   if(button)button.disabled=false;

   renderAllSections();

 });



 return sheetLoadPromise;

};



const rowDates=new WeakMap();

const uncachedRowDate=rDate;

rDate=function(row){

 const source=tsIdx>=0?row[tsIdx]:undefined;

 const hit=rowDates.get(row);

 if(hit&&hit.column===tsIdx&&hit.source===source)return hit.value;

 const value=uncachedRowDate(row);

 rowDates.set(row,{column:tsIdx,source,value});

 return value;

};



const oldRender=renderAllSections;


/* ============ Queues Analysis Logic ============ */
/* queuesFilters declared at top */

function queuesAggregateData(rows){
 const idx=name=>hdrs.findIndex(h=>String(h).trim().toLowerCase()===name);
 const qi=idx('queue name'),si=idx('shift'),fi=hdrs.findIndex(h=>['floor','unit'].includes(String(h).trim().toLowerCase()));
 const qci=idx('qtc name'),mi=idx('modality'),pi=idx('pass'),ni=idx('national id'),li=idx('labeler name');

 const queueMap=new Map();

 rows.forEach(r=>{
  const qName=qi>=0?String(r[qi]||'').trim():'';
  if(!qName)return;

  if(!queueMap.has(qName)){
   queueMap.set(qName,{
    name:qName,
    shifts:new Set(),
    floors:new Set(),
    qtcs:new Set(),
    labelers:new Set(),
    totalSubmit:0,
    lidarFP:0,
    lidarQA:0,
    laneFP:0,
    laneQA:0
   });
  }

  const item=queueMap.get(qName);

  const shift=si>=0?String(r[si]||'').trim():'';
  if(shift)item.shifts.add(shift);

  const floor=fi>=0?String(r[fi]||'').trim():'';
  if(floor)item.floors.add(floor);

  const qtc=qci>=0?String(r[qci]||'').normalize('NFC').trim().replace(/\s+/gu,' '):'';
  if(qtc)item.qtcs.add(qtc);

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
  if(lid)item.labelers.add(lid);

  item.totalSubmit++;

  const mod=mi<0?'':String(r[mi]??'').trim().toLowerCase().replace(/[\s_-]+/g,'');
  const pass=pi<0?'':String(r[pi]??'').trim().toUpperCase();
  const prefix=mod==='lidar'?'lidar':(mod==='laneline'||mod==='lane')?'lane':'';
  if(prefix&&(pass==='FP'||pass==='QA')){
   const key=prefix+pass;
   if(item[key]!==undefined)item[key]++;
  }
 });

 return [...queueMap.values()].map(q=>{
  const uniqueLabelers=q.labelers.size;
  const avgSubmit=uniqueLabelers>0?(q.totalSubmit/uniqueLabelers).toFixed(1):'0';
  return {
   name:q.name,
   shifts:[...q.shifts].sort(),
   floors:[...q.floors].sort(),
   qtcs:[...q.qtcs].sort(),
   totalSubmit:q.totalSubmit,
   lidarFP:q.lidarFP,
   lidarQA:q.lidarQA,
   laneFP:q.laneFP,
   laneQA:q.laneQA,
   uniqueLabelers,
   avgSubmit:Number(avgSubmit),
   avgSubmitStr:avgSubmit,
   uniqueQtc:q.qtcs.size
  };
 });
}

function exportQueuesCSV(queues){
 if(!queues.length){showToast('No queues to export.');return;}
 const headers=['Queue Name','Shifts','Floors / Units','QTC Names','Total Unique QTC','Lidar FP Submit','Lidar QA Submit','Lane Line FP Submit','Lane Line QA Submit','Total Submit','Unique Labelers','Avg Submit / Labeler'];
 const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
 const rows=queues.map(q=>[
  q.name,
  q.shifts.join('; '),
  q.floors.join('; '),
  q.qtcs.join('; '),
  q.uniqueQtc,
  q.lidarFP,
  q.lidarQA,
  q.laneFP,
  q.laneQA,
  q.totalSubmit,
  q.uniqueLabelers,
  q.avgSubmitStr
 ]);
 const csv=[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n');
 downloadBlob(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}),'MEEG_queues_analysis_'+cairoToday()+'.csv');
 showToast('Queues analysis exported to CSV.');
}

function renderQueuesAnalysis(){
  const page = $('uxQueues');
  if(!page || page.hidden) return;

  if(!window._firstDataReady && !hdrs.length){
    const error = $('mainContent')?.querySelector('.errbox');
    page.innerHTML = '<div class="ux-overview"><div class="ux-heading"><div><div class="ux-eyebrow">Queue breakdown · Shifts & Floors & QTCs</div><h2>Queues Analysis</h2><p>Submission volume, shifts, floors, and QTC distribution per queue</p></div>' + renderHeaderControlsHTML('queues') + '</div><div class="ux-panel"><h3>' + (error ? 'Data could not be loaded' : 'Waiting for source data') + '</h3><p>' + esc(error ? error.textContent.replace('↻ Retry','').trim() : 'Queues analysis will appear once dashboard data is loaded.') + '</p><button class="btn btn-c" id="qRetry" style="margin-top:16px">↻ Retry data load</button></div></div>';
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
  const totalLidarFP = filtered.reduce((n,q) => n + q.lidarFP, 0);
  const totalLidarQA = filtered.reduce((n,q) => n + q.lidarQA, 0);
  const totalLaneFP = filtered.reduce((n,q) => n + q.laneFP, 0);
  const totalLaneQA = filtered.reduce((n,q) => n + q.laneQA, 0);

  const totalUniqueQtcs = new Set(filtered.flatMap(q => q.qtcs)).size;
  const totalUniqueLabelers = new Set(filtered.flatMap(q => [...(q.labelerSet || [])])).size;
  const avgSubmit = totalUniqueLabelers > 0 ? (totalTasks / totalUniqueLabelers).toFixed(1) : '0';

  const sortedByVol = [...filtered].sort((a,b) => b.totalSubmit - a.totalSubmit);
  const topQueue = sortedByVol.length ? sortedByVol[0] : null;
  const lowestQueue = sortedByVol.length ? sortedByVol[sortedByVol.length - 1] : null;
  const decliningQueues = filtered.filter(q => q.totalSubmit <= 5);

  // Pagination
  const pageSize = queuesFilters.pageSize || 25;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  queuesFilters.page = Math.min(queuesFilters.page || 0, totalPages - 1);
  const visible = filtered.slice(queuesFilters.page * pageSize, (queuesFilters.page + 1) * pageSize);

  // 8 KPI Cards
  const kpi8 = [
    { title: 'Total Active Queues', val: filtered.length.toLocaleString(), sub: 'Receiving submissions', tone: '#df5c99' },
    { title: 'Queue Submissions', val: totalTasks.toLocaleString(), sub: 'Total task entries', tone: '#0d9488' },
    { title: 'Unique Labelers', val: totalUniqueLabelers.toLocaleString(), sub: 'Active contributors', tone: '#0a9d8c' },
    { title: 'Unique QTCs', val: totalUniqueQtcs.toLocaleString(), sub: 'Distinct QA reviewers', tone: '#df8b24' },
    { title: 'Avg Submissions / Labeler', val: avgSubmit, sub: 'Average productivity', tone: '#3b82f6' },
    { title: 'Highest Performing Queue', val: (topQueue ? topQueue.name : '—'), sub: (topQueue ? topQueue.totalSubmit.toLocaleString() + ' tasks' : '—'), tone: '#10b981' },
    { title: 'Lowest Volume Queue', val: (lowestQueue ? lowestQueue.name : '—'), sub: (lowestQueue ? lowestQueue.totalSubmit.toLocaleString() + ' tasks' : '—'), tone: '#f59e0b' },
    { title: 'Declining Activity Queues', val: decliningQueues.length.toLocaleString(), sub: 'Volume <= 5 submissions', tone: '#ef4444' }
  ];

  page.innerHTML = '<div class="ux-overview">'
    + '<div class="ux-heading">'
      + '<div>'
        + '<div class="ux-eyebrow">Queue Operations · Velocity & Workload</div>'
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

    // Operational Notice Banner
    + '<div class="ux-panel" style="margin-top:16px; padding:12px 18px; border-left:4px solid #3b82f6; background:rgba(59,130,246,0.06); font-size:12px; color:var(--text);">'
      + '<b>ℹ️ Operational Queue Notice:</b> Queues with low submission volume are flagged as <i>Declining Activity</i>. Do not label low submission volume as a backlog unless task assignment, pending-task status, or queue inventory data confirms it.'
    + '</div>'

    // MAIN 13-COLUMN QUEUE TABLE
    + '<section class="ux-panel" style="margin-top:20px;">'
      + '<div class="ux-heading" style="margin-bottom:12px;">'
        + '<div><h3>Queues Breakdown Table (' + filtered.length.toLocaleString() + ' queues)</h3><p>Click any column header with ↕ to sort. Click any queue row to inspect full drill-down records.</p></div>'
        + '<span class="ux-note">Showing ' + (visible.length ? (queuesFilters.page*pageSize+1) : 0) + ' – ' + Math.min((queuesFilters.page+1)*pageSize, filtered.length) + ' of ' + filtered.length + ' queues</span>'
      + '</div>'
      + '<div class="perf-table">'
        + '<table>'
          + '<thead><tr>'
            + '<th data-sort="name">Queue Name ↕</th>'
            + '<th>Modality</th>'
            + '<th>Stage</th>'
            + '<th data-sort="lidarFP" style="color:#0d9488;">Lidar FP ↕</th>'
            + '<th data-sort="lidarQA" style="color:#14b8a6;">Lidar QA ↕</th>'
            + '<th data-sort="laneFP" style="color:#ed9a35;">Lane Line FP ↕</th>'
            + '<th data-sort="laneQA" style="color:#ec4899;">Lane Line QA ↕</th>'
            + '<th data-sort="totalSubmit" style="color:var(--primary);">Total Submit ↕</th>'
            + '<th data-sort="uniqueLabelers">Unique Labelers ↕</th>'
            + '<th data-sort="uniqueQtc">Unique QTCs ↕</th>'
            + '<th data-sort="avgSubmit">Avg / Labeler ↕</th>'
            + '<th>Production Share %</th>'
            + '<th>Latest Activity</th>'
          + '</tr></thead>'
          + '<tbody>'
            + visible.map(q => {
              const isDeclining = q.totalSubmit <= 5;
              const sharePct = totalTasks ? ((q.totalSubmit / totalTasks) * 100).toFixed(1) + '%' : '0%';
              const modBadge = q.lidarFP || q.lidarQA ? (q.laneFP || q.laneQA ? 'Mixed' : 'Lidar') : 'Lane Line';
              const stageBadge = (q.lidarFP || q.laneFP) && (q.lidarQA || q.laneQA) ? 'FP / QA' : (q.lidarQA || q.laneQA ? 'QA' : 'FP');
              return '<tr class="queue-row-item" data-queue-name="' + esc(q.name) + '" style="cursor:pointer;" title="Click to view detailed queue drill-down">'
                + '<td><b>' + esc(q.name) + '</b>' + (isDeclining ? ' <span class="q-badge" style="background:rgba(239,68,68,0.12); color:var(--danger); border:1px solid rgba(239,68,68,0.3); font-size:9px;">📉 Declining Activity</span>' : '') + '</td>'
                + '<td><span class="q-badge" style="background:var(--bg-3);">' + modBadge + '</span></td>'
                + '<td><span class="q-badge" style="background:var(--bg-3);">' + stageBadge + '</span></td>'
                + '<td><b style="color:#0d9488;">' + q.lidarFP.toLocaleString() + '</b></td>'
                + '<td><b style="color:#14b8a6;">' + q.lidarQA.toLocaleString() + '</b></td>'
                + '<td><b style="color:#ed9a35;">' + q.laneFP.toLocaleString() + '</b></td>'
                + '<td><b style="color:#ec4899;">' + q.laneQA.toLocaleString() + '</b></td>'
                + '<td><strong style="color:var(--primary); font-size:14px;">' + q.totalSubmit.toLocaleString() + '</strong></td>'
                + '<td><b>' + q.uniqueLabelers.toLocaleString() + '</b></td>'
                + '<td><b>' + q.uniqueQtc.toLocaleString() + '</b></td>'
                + '<td><span class="q-val-avg">' + q.avgSubmitStr + '</span></td>'
                + '<td><b>' + sharePct + '</b></td>'
                + '<td><span class="ux-note">' + (q.latestTimestamp || 'Recent') + '</span></td>'
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

  // Search input
  const qSearch = page.querySelector('#qSearch');
  if(qSearch){
    qSearch.oninput = (e) => {
      queuesFilters.query = e.target.value;
      queuesFilters.page = 0;
      renderQueuesAnalysis();
    };
  }

  // Filter dropdowns
  $('qShift').onchange = (e) => { queuesFilters.shift = e.target.value; queuesFilters.page = 0; renderQueuesAnalysis(); };
  $('qFloor').onchange = (e) => { queuesFilters.floor = e.target.value; queuesFilters.page = 0; renderQueuesAnalysis(); };
  $('qCategory').onchange = (e) => { queuesFilters.category = e.target.value; queuesFilters.page = 0; renderQueuesAnalysis(); };
  $('qReset').onclick = () => { queuesFilters.query = ''; queuesFilters.shift = ''; queuesFilters.floor = ''; queuesFilters.category = ''; queuesFilters.page = 0; renderQueuesAnalysis(); };

  // Sorting
  page.querySelectorAll('th[data-sort]').forEach(th => {
    th.style.cursor = 'pointer';
    th.onclick = () => {
      const col = th.dataset.sort;
      if (queuesFilters.sortCol === col) queuesFilters.sortAsc = !queuesFilters.sortAsc;
      else { queuesFilters.sortCol = col; queuesFilters.sortAsc = false; }
      renderQueuesAnalysis();
    };
  });

  // Pagination
  $('qPrev').onclick = () => { if(queuesFilters.page > 0){ queuesFilters.page--; renderQueuesAnalysis(); } };
  $('qNext').onclick = () => { if(queuesFilters.page < totalPages - 1){ queuesFilters.page++; renderQueuesAnalysis(); } };

  // Export CSV
  $('qExportCSV').onclick = () => {
    const headers = ['Queue Name', 'Modality', 'Stage', 'Lidar FP', 'Lidar QA', 'Lane Line FP', 'Lane Line QA', 'Total Submits', 'Unique Labelers', 'Unique QTCs', 'Avg Submit / Labeler', 'Production Share %', 'Latest Timestamp'];
    const csvRows = filtered.map(q => [
      q.name,
      q.lidarFP || q.lidarQA ? (q.laneFP || q.laneQA ? 'Mixed' : 'Lidar') : 'Lane Line',
      (q.lidarFP || q.laneFP) && (q.lidarQA || q.laneQA) ? 'FP / QA' : (q.lidarQA || q.laneQA ? 'QA' : 'FP'),
      q.lidarFP,
      q.lidarQA,
      q.laneFP,
      q.laneQA,
      q.totalSubmit,
      q.uniqueLabelers,
      q.uniqueQtc,
      q.avgSubmitStr,
      totalTasks ? ((q.totalSubmit / totalTasks) * 100).toFixed(1) + '%' : '0%',
      q.latestTimestamp || 'Recent'
    ]);
    const cell = v => '"' + String(v ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
    const csv = [headers, ...csvRows].map(r => r.map(cell).join(',')).join('\r\n');
    downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), 'MEEG_queues_analysis_' + cairoToday() + '.csv');
    showToast('✓ Queues analysis CSV exported');
  };

  // Row-click drilldown modal
  page.querySelectorAll('.queue-row-item').forEach(tr => {
    tr.onclick = () => {
      const qName = tr.dataset.queueName;
      const qRows = base.filter(r => {
        const qi = hdrs.findIndex(h => h.toLowerCase() === 'queue name');
        return qi >= 0 && r[qi] === qName;
      });
      const ti = hdrs.findIndex(h => ['task id', 'id'].includes(h.toLowerCase()));
      const li = hdrs.findIndex(h => h.toLowerCase() === 'labeler name');
      const ni = hdrs.findIndex(h => h.toLowerCase() === 'national id');
      const si = hdrs.findIndex(h => h.toLowerCase() === 'shift');
      const fi = hdrs.findIndex(h => ['floor', 'unit'].includes(h.toLowerCase()));
      const qcI = hdrs.findIndex(h => h.toLowerCase() === 'qtc name');
      const mi = hdrs.findIndex(h => h.toLowerCase() === 'modality');
      const pi = hdrs.findIndex(h => h.toLowerCase() === 'pass');

      const drillRows = qRows.map(r => [
        ti >= 0 ? esc(r[ti]) : '—',
        rDate(r) || '—',
        li >= 0 ? esc(r[li]) : '—',
        maskEmployeeId(ni >= 0 ? r[ni] : '', r[li]),
        si >= 0 ? esc(r[si]) : '—',
        fi >= 0 ? esc(r[fi]) : '—',
        qcI >= 0 ? esc(r[qcI]) : '—',
        esc(r[mi] || ''),
        esc(r[pi] || '')
      ]);

      openDrilldownModal({
        title: qName + ' · Queue Drill-Down',
        subtitle: qRows.length.toLocaleString() + ' total submissions on this queue',
        badge: 'Queue Records',
        columns: ['Task ID', 'Date', 'Labeler Name', 'Employee ID', 'Shift', 'Unit', 'QTC', 'Modality', 'Pass'],
        rows: drillRows
      });
    };
  });

  // Render trend chart
  renderQueueTrendChart('qTrendChart', base);
}

function renderQueueTrendChart(containerId, rows){
 const qi=hdrs.findIndex(h=>h.trim().toLowerCase()==='queue name');
 const mi=hdrs.findIndex(h=>h.trim().toLowerCase()==='modality');
 const pi=hdrs.findIndex(h=>h.trim().toLowerCase()==='pass');

 let chartRows=rows;
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

function renderGmReport(){
  const page = $('uxGmReport');
  if(!page || page.hidden) return;

  const baseRows = rowsInView();
  const sourceUniverse = (typeof rawRows !== 'undefined' && rawRows.length) ? rawRows : baseRows;
  const report = gmQueueReport(baseRows, sourceUniverse);

  // Filter groups
  let visibleGroups = report.groups;

  // Zero-submissions toggle (hidden by default matching reference image)
  if (gmReportFilters.hideZero !== false) {
    visibleGroups = visibleGroups.filter(g => g.fp > 0 || g.qa > 0);
  }

  // Modality filter
  if (gmReportFilters.modality && gmReportFilters.modality !== 'all') {
    if (gmReportFilters.modality === 'relabel') {
      visibleGroups = visibleGroups.filter(g => g.isRelabel);
    } else if (gmReportFilters.modality === 'lidar') {
      visibleGroups = visibleGroups.filter(g => g.mod === 'Lidar' && !g.isRelabel);
    } else if (gmReportFilters.modality === 'laneline') {
      visibleGroups = visibleGroups.filter(g => g.mod === 'Lane Line' && !g.isRelabel);
    }
  }

  // Search query
  const qSearch = (gmReportFilters.query || '').toLowerCase().trim();
  if (qSearch) {
    visibleGroups = visibleGroups.filter(g => g.name.toLowerCase().includes(qSearch));
  }

  // Sort
  const sortCol = gmReportFilters.sortCol || 'name';
  const sortAsc = gmReportFilters.sortAsc !== undefined ? gmReportFilters.sortAsc : (sortCol === 'name');
  visibleGroups.sort((a, b) => {
    let va = (sortCol === 'name') ? a.name : (sortCol === 'fpLabelers') ? a.fpIds.size : (sortCol === 'fp') ? a.fp : (sortCol === 'qaLabelers') ? a.qaIds.size : a.qa;
    let vb = (sortCol === 'name') ? b.name : (sortCol === 'fpLabelers') ? b.fpIds.size : (sortCol === 'fp') ? b.fp : (sortCol === 'qaLabelers') ? b.qaIds.size : b.qa;
    if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    va = Number(va) || 0; vb = Number(vb) || 0;
    return sortAsc ? (va - vb) : (vb - va);
  });

  // Calculate grand totals across visible queues
  let grandTotalFp = 0;
  let grandTotalQa = 0;
  const grandFpIds = new Set();
  const grandQaIds = new Set();
  let totalMissing = 0;

  visibleGroups.forEach(g => {
    grandTotalFp += g.fp;
    grandTotalQa += g.qa;
    g.fpIds.forEach(id => grandFpIds.add(id));
    g.qaIds.forEach(id => grandQaIds.add(id));
    totalMissing += g.missing;
  });

  const activeDateDisplay = globalUnifiedFilters.date 
    ? globalUnifiedFilters.date 
    : (globalUnifiedFilters.from && globalUnifiedFilters.to)
      ? (globalUnifiedFilters.from + ' → ' + globalUnifiedFilters.to)
      : (cairoToday() + ' (All Dates)');

  page.innerHTML = `
    <div class="ux-overview">
      <div class="ux-heading">
        <div>
          <div class="ux-eyebrow">Queue activity · FP / QA</div>
          <h2>📊 GM Report — Daily Queue Activity</h2>
          <p>${esc(activeDateDisplay)}</p>
        </div>
        <div class="ux-tools">
          ${renderHeaderControlsHTML('gm')}
          <button class="btn btn-c" id="gmExportCsvBtn" title="Export GM Report to CSV">↓ Export CSV</button>
        </div>
      </div>

      ${renderUniversalFilterBar('gm_report')}

      <!-- Main Queue Daily Summary Card (Matching Reference UI) -->
      <section class="daily-queue-card">
        <div class="daily-queue-card-head">
          <div>
            <h3>Queue daily summary</h3>
            <p>Unique Labelers use valid National Id, once per Queue + Modality + Pass. Queues with zero FP and QA submissions are hidden.</p>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <label style="font-size: 12px; color: var(--text-soft); display: flex; align-items: center; gap: 6px; cursor: pointer;">
              <input type="checkbox" id="gmHideZeroToggle" ${gmReportFilters.hideZero !== false ? 'checked' : ''}>
              إخفاء الكيوهات الصفرية (Hide zero activity)
            </label>
          </div>
        </div>

        <!-- Filter Toolbar -->
        <div class="daily-toolbar-row">
          <div class="daily-search-box">
            <input type="text" id="gmSearchInput" class="daily-search-input" placeholder="🔍 Search queue name..." value="${esc(gmReportFilters.query || '')}">
          </div>
          <div class="daily-mod-pills">
            <button type="button" class="daily-pill-btn ${(!gmReportFilters.modality || gmReportFilters.modality === 'all') ? 'active' : ''}" data-gm-mod="all">All Queues (${visibleGroups.length})</button>
            <button type="button" class="daily-pill-btn ${gmReportFilters.modality === 'lidar' ? 'active' : ''}" data-gm-mod="lidar">📡 Lidar</button>
            <button type="button" class="daily-pill-btn ${gmReportFilters.modality === 'laneline' ? 'active' : ''}" data-gm-mod="laneline">🛣️ Lane Line</button>
            <button type="button" class="daily-pill-btn ${gmReportFilters.modality === 'relabel' ? 'active' : ''}" data-gm-mod="relabel">🔄 Relabeling</button>
          </div>
        </div>

        <!-- Table matching screenshot exactly -->
        <div class="daily-table-wrap">
          <table class="daily-queue-table">
            <thead>
              <tr>
                <th class="sortable" data-sort="name">QUEUE ${sortCol==='name'?(sortAsc?'▲':'▼'):''}</th>
                <th class="sortable" data-sort="fpLabelers">UNIQUE LABELERS (FP) ${sortCol==='fpLabelers'?(sortAsc?'▲':'▼'):''}</th>
                <th class="sortable" data-sort="fp">TOTAL SUBMIT (FP) ${sortCol==='fp'?(sortAsc?'▲':'▼'):''}</th>
                <th class="sortable" data-sort="qaLabelers">UNIQUE LABELERS (QA) ${sortCol==='qaLabelers'?(sortAsc?'▲':'▼'):''}</th>
                <th class="sortable" data-sort="qa">TOTAL SUBMIT (QA) ${sortCol==='qa'?(sortAsc?'▲':'▼'):''}</th>
              </tr>
            </thead>
            <tbody>
              ${visibleGroups.map(g => {
                let badges = '';
                if (g.isRelabel) {
                  badges += '<span class="daily-mod daily-relabel">(Relabeling)</span> ';
                }
                if (g.mod === 'Lidar') {
                  badges += '<span class="daily-mod daily-lidar">(Lidar)</span>';
                } else if (g.mod === 'Lane Line') {
                  badges += '<span class="daily-mod daily-lane">(Lane Line)</span>';
                } else if (g.mod && g.mod !== 'Unspecified') {
                  badges += '<span class="daily-mod daily-lidar">(' + esc(g.mod) + ')</span>';
                }

                return `
                  <tr class="daily-queue-row">
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
              ${!visibleGroups.length ? '<tr><td colspan="5" class="ux-empty" style="text-align:center; padding:36px;">No queue submissions match the current filters.</td></tr>' : ''}
            </tbody>
            <tfoot>
              <tr class="daily-total-row">
                <td style="padding:14px 18px; font-weight:800; color:var(--text);">
                  TOTAL (${visibleGroups.length} queues):
                </td>
                <td class="daily-num-cell"><b>${grandFpIds.size.toLocaleString()}</b></td>
                <td class="daily-num-cell highlight-fp"><b>${grandTotalFp.toLocaleString()}</b></td>
                <td class="daily-num-cell"><b>${grandQaIds.size.toLocaleString()}</b></td>
                <td class="daily-num-cell highlight-qa"><b>${grandTotalQa.toLocaleString()}</b></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p class="an-context" style="margin-top:14px; font-size:11px; color:var(--muted);">
          ${totalMissing > 0 ? (totalMissing + ' FP/QA entries have missing or non-standard National ID; included in submit totals, de-duplicated by name. ') : ''}
          Unique Labelers use valid National Id, once per Queue + Modality + Pass. Queues with zero FP and QA submissions are hidden.
        </p>
      </section>
    </div>
  `;

  bindHeaderControls(page, 'gm');
  bindUniversalFilterBar(page, 'gm_report');

  // Search input binding
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

  // Table header sorting binding
  page.querySelectorAll('th.sortable[data-sort]').forEach(th => {
    th.onclick = () => {
      const col = th.dataset.sort;
      if (gmReportFilters.sortCol === col) {
        gmReportFilters.sortAsc = !gmReportFilters.sortAsc;
      } else {
        gmReportFilters.sortCol = col;
        gmReportFilters.sortAsc = (col === 'name');
      }
      renderGmReport();
    };
  });

  // Export CSV binding
  const exportBtn = page.querySelector('#gmExportCsvBtn');
  if (exportBtn) {
    exportBtn.onclick = () => {
      if (!visibleGroups.length) {
        showToast('No queue rows to export');
        return;
      }
      const cell = v => '"' + String(v ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
      const csvHeaders = ['Queue Name', 'Modality', 'Is Relabeling', 'Unique Labelers (FP)', 'Total Submit (FP)', 'Unique Labelers (QA)', 'Total Submit (QA)', 'Total Submissions'];
      const csvRows = visibleGroups.map(g => [
        g.name,
        g.mod,
        g.isRelabel ? 'Yes' : 'No',
        g.fpIds.size,
        g.fp,
        g.qaIds.size,
        g.qa,
        g.fp + g.qa
      ]);
      const csvContent = [csvHeaders, ...csvRows].map(r => r.map(cell).join(',')).join('\r\n');
      downloadBlob(new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' }), 'MEEG_GM_Queue_Report_' + cairoToday() + '.csv');
      showToast('✓ GM Report exported to CSV');
    };
  }
}


function renderShiftComparison(){
  const page = $('uxShiftComparison');
  if(!page || page.hidden) return;

  const baseRows = rowsInView();
  const idx = name => hdrs.findIndex(h => h.trim().toLowerCase() === name.toLowerCase());
  const si = idx('shift');
  const fi = hdrs.findIndex(h => ['floor', 'unit'].includes(h.trim().toLowerCase()));
  const qi = idx('qtc name');
  const li = idx('labeler name');
  const ni = idx('national id');
  const mi = idx('modality');

  // Filter base rows
  const filteredRows = baseRows.filter(r => {
    const floor = fi >= 0 ? deriveFloor(r[fi]) : 'Unknown';
    const mod = mi < 0 ? '' : String(r[mi] || '').toLowerCase().replace(/[\s_-]+/g, '');
    const d = rDate(r);

    if (shiftCompFilters.floor && floor !== shiftCompFilters.floor) return false;
    if (shiftCompFilters.modality && shiftCompFilters.modality !== 'all') {
      const isLidar = mod === 'lidar';
      const isLane = mod === 'laneline' || mod === 'lane';
      if (shiftCompFilters.modality === 'lidar' && !isLidar) return false;
      if (shiftCompFilters.modality === 'laneline' && !isLane) return false;
    }
    if (shiftCompFilters.from && d && d < shiftCompFilters.from) return false;
    if (shiftCompFilters.to && d && d > shiftCompFilters.to) return false;
    return true;
  });

  const distinctShifts = [...new Set(baseRows.map(r => si >= 0 ? String(r[si] || '').trim() : '').filter(Boolean))].sort();
  const distinctFloors = [...new Set(baseRows.map(r => fi >= 0 ? deriveFloor(r[fi]) : '').filter(Boolean))].sort();

  // Shift-by-Shift Aggregations
  const shiftAggs = {};
  distinctShifts.forEach(sh => {
    const shRows = filteredRows.filter(r => si >= 0 && String(r[si] || '').trim() === sh);
    const labSet = new Set();
    const qtcSet = new Set();
    let fp = 0, qa = 0;
    shRows.forEach(r => {
      const lab = li >= 0 ? String(r[li] || '').trim() : '';
      if (lab) labSet.add(lab);
      const qtc = qi >= 0 ? String(r[qi] || '').trim() : '';
      if (qtc) qtcSet.add(qtc);
      if (isModPass(r, 'any', 'FP')) fp++;
      if (isModPass(r, 'any', 'QA')) qa++;
    });
    shiftAggs[sh] = {
      shift: sh,
      total: shRows.length,
      fp,
      qa,
      labelers: labSet.size,
      qtcs: qtcSet.size,
      avgPerLabeler: labSet.size > 0 ? (shRows.length / labSet.size).toFixed(1) : '0'
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
    distinctShifts.forEach(sh => {
      const cellRows = flRows.filter(r => si >= 0 && String(r[si] || '').trim() === sh);
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

  // TAB 2: QTC Supervisor Breakdown
  const qtcMap = new Map();
  filteredRows.forEach(r => {
    const qtc = qi >= 0 ? String(r[qi] || '').normalize('NFC').trim().replace(/\s+/gu, ' ') : '';
    if (!qtc) return;
    const sh = si >= 0 ? String(r[si] || '').trim() : 'Unknown';
    const fl = fi >= 0 ? deriveFloor(r[fi]) : 'Unknown';
    const key = qtc + '__' + sh;
    if (!qtcMap.has(key)) {
      qtcMap.set(key, { qtc, shift: sh, floor: fl, total: 0, fp: 0, qa: 0, labSet: new Set(), queueSet: new Set() });
    }
    const item = qtcMap.get(key);
    item.total++;
    if (isModPass(r, 'any', 'FP')) item.fp++;
    if (isModPass(r, 'any', 'QA')) item.qa++;
    const lab = li >= 0 ? String(r[li] || '').trim() : '';
    if (lab) item.labSet.add(lab);
    const qn = idx('queue name') >= 0 ? String(r[idx('queue name')] || '').trim() : '';
    if (qn) item.queueSet.add(qn);
  });
  const qtcRows = [...qtcMap.values()].sort((a,b) => b.total - a.total);

  // TAB 3: Labelers Breakdown
  const labMap = new Map();
  filteredRows.forEach(r => {
    const lab = li >= 0 ? String(r[li] || '').trim() : '';
    if (!lab) return;
    const rawId = ni >= 0 ? String(r[ni] || '').trim() : '';
    const sh = si >= 0 ? String(r[si] || '').trim() : 'Unknown';
    const fl = fi >= 0 ? deriveFloor(r[fi]) : 'Unknown';
    const qtc = qi >= 0 ? String(r[qi] || '').trim() : 'Unknown';
    const d = rDate(r);
    const key = lab + '__' + sh;
    if (!labMap.has(key)) {
      labMap.set(key, { name: lab, rawId, maskedId: maskEmployeeId(rawId, lab), shift: sh, floor: fl, qtc, total: 0, fp: 0, qa: 0, dates: new Set() });
    }
    const item = labMap.get(key);
    item.total++;
    if (isModPass(r, 'any', 'FP')) item.fp++;
    if (isModPass(r, 'any', 'QA')) item.qa++;
    if (d) item.dates.add(d);
  });
  const labelerRows = [...labMap.values()].sort((a,b) => b.total - a.total);

  page.innerHTML = `
    <div class="ux-overview">
      <div class="ux-heading">
        <div>
          <div class="ux-eyebrow">Workforce &amp; Facility Shift Diagnostics</div>
          <h2>⚖️ Detailed Shift Comparison</h2>
          <p>Multi-dimensional operational comparison across shifts by Facility Floor (= Unit), QTC Supervisors, and Labelers.</p>
        </div>
        ${renderHeaderControlsHTML('sc')}
      </div>

      ${renderUniversalFilterBar('shift_comparison')}

      <!-- Shift Summary KPI Cards -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-bottom: 20px;">
        ${distinctShifts.map((sh, idx) => {
          const sData = shiftAggs[sh] || { total: 0, fp: 0, qa: 0, labelers: 0, qtcs: 0, avgPerLabeler: '0' };
          const share = totalSubmissions > 0 ? ((sData.total / totalSubmissions) * 100).toFixed(1) : 0;
          const colors = ['#0d9488', '#ed9a35', '#3b82f6', '#8b5cf6', '#ec4899', '#10b981'];
          const tone = colors[idx % colors.length];
          return `
            <div class="ux-panel" style="border-top: 4px solid ${tone}; padding: 16px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                <h3 style="margin:0; font-size: 15px; color:${tone};">⏱️ ${esc(sh)}</h3>
                <span class="q-badge" style="background:${tone}22; color:${tone}; font-weight:700;">${share}% share</span>
              </div>
              <div style="font-size: 24px; font-weight: 800; color: var(--text); margin-bottom: 6px;">${sData.total.toLocaleString()} <span style="font-size:12px; font-weight:500; color:var(--text-soft);">tasks</span></div>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px; color: var(--text-soft); background: var(--bg-2); padding: 8px; border-radius: 8px;">
                <div><b>FP:</b> ${sData.fp.toLocaleString()}</div>
                <div><b>QA:</b> ${sData.qa.toLocaleString()}</div>
                <div><b>Labelers:</b> ${sData.labelers}</div>
                <div><b>QTCs:</b> ${sData.qtcs}</div>
              </div>
              <div style="margin-top: 8px; font-size: 11px; color: var(--muted); text-align: right;">Avg: <b>${sData.avgPerLabeler}</b> tasks/labeler</div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Navigation Sub-Tabs & Filter Bar -->
      <div class="ux-panel" style="padding: 14px 18px; margin-bottom: 18px;">
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px;">
          <!-- Tabs -->
          <div style="display: flex; gap: 6px; background: var(--bg-2); padding: 4px; border-radius: 10px; border: 1px solid var(--border);">
            <button class="btn ${activeSubTab === 'floor' ? 'btn-c' : ''}" id="scTabFloor" style="padding: 6px 14px; font-size: 12px; font-weight: 600;">🏢 Floor (= Unit) Breakdown</button>
            <button class="btn ${activeSubTab === 'qtc' ? 'btn-c' : ''}" id="scTabQtc" style="padding: 6px 14px; font-size: 12px; font-weight: 600;">👥 QTC Supervisors</button>
            <button class="btn ${activeSubTab === 'labelers' ? 'btn-c' : ''}" id="scTabLabelers" style="padding: 6px 14px; font-size: 12px; font-weight: 600;">👤 Labelers Breakdown</button>
            <button class="btn ${activeSubTab === 'chart' ? 'btn-c' : ''}" id="scTabChart" style="padding: 6px 14px; font-size: 12px; font-weight: 600;">📊 Shift Volume Chart</button>
          </div>
          <!-- Quick filters & export -->
          <div style="display: flex; gap: 8px; align-items: center;">
            <select id="scFloorSelect" style="padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-3); color: var(--text); font-size: 12px;">
              <option value="">All Floors (Units)</option>
              ${distinctFloors.map(f => `<option value="${esc(f)}" ${shiftCompFilters.floor === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}
            </select>
            <button class="btn btn-c" id="scExportBtn" style="padding: 7px 14px; font-size: 12px; font-weight: 600;">↓ Export CSV</button>
          </div>
        </div>
      </div>

      <!-- SUB-TAB CONTENT -->
      ${activeSubTab === 'floor' ? `
        <!-- TAB 1: Floor Comparison Matrix -->
        <div class="ux-panel" style="padding: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 12px;">
          <div style="padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin:0;">🏢 Floor (= Unit) Production by Shift</h3>
            <span class="ux-note">Direct comparison of operational units across shifts</span>
          </div>
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
              <thead>
                <tr style="background: var(--bg-2); border-bottom: 1px solid var(--border);">
                  <th style="padding: 10px 14px;">Floor / Unit</th>
                  ${distinctShifts.map(sh => `<th style="padding: 10px 12px; text-align: center;">${esc(sh)} Tasks</th><th style="padding: 10px 12px; text-align: center; color: var(--text-soft); font-size: 11px;">Labelers</th>`).join('')}
                  <th style="padding: 10px 14px; text-align: center;">Total Submits</th>
                  <th style="padding: 10px 14px; text-align: center;">Floor Share %</th>
                </tr>
              </thead>
              <tbody>
                ${floorMatrix.map(item => {
                  const pct = totalSubmissions > 0 ? ((item.total / totalSubmissions) * 100).toFixed(1) : 0;
                  return `
                    <tr style="border-bottom: 1px solid var(--border);" onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background='transparent'">
                      <td style="padding: 10px 14px; font-weight: 700; color: var(--accent);"><span style="display:flex; align-items:center; gap:6px;">🏢 ${esc(item.floor)}</span></td>
                      ${distinctShifts.map(sh => {
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
      ` : activeSubTab === 'qtc' ? `
        <!-- TAB 2: QTC Supervisors Comparison -->
        <div class="ux-panel" style="padding: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 12px;">
          <div style="padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin:0;">👥 QTC Supervisor Performance Across Shifts</h3>
            <span class="ux-note">Team sizes, queue coverage, and volume per shift</span>
          </div>
          <div style="overflow-x: auto; max-height: 60vh;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
              <thead>
                <tr style="background: var(--bg-2); border-bottom: 1px solid var(--border); position: sticky; top:0; z-index:1;">
                  <th style="padding: 10px 14px;">QTC Supervisor</th>
                  <th style="padding: 10px 12px;">Shift</th>
                  <th style="padding: 10px 12px;">Floor (Unit)</th>
                  <th style="padding: 10px 12px; text-align: center;">Team Size (Labelers)</th>
                  <th style="padding: 10px 12px; text-align: center;">Queues Covered</th>
                  <th style="padding: 10px 12px; text-align: center;">FP Tasks</th>
                  <th style="padding: 10px 12px; text-align: center;">QA Tasks</th>
                  <th style="padding: 10px 14px; text-align: center;">Total Submits</th>
                  <th style="padding: 10px 12px; text-align: center;">Avg / Labeler</th>
                </tr>
              </thead>
              <tbody>
                ${qtcRows.map(item => {
                  const avg = item.labSet.size > 0 ? (item.total / item.labSet.size).toFixed(1) : '0';
                  return `
                    <tr style="border-bottom: 1px solid var(--border);" onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background='transparent'">
                      <td style="padding: 9px 14px; font-weight: 700; color: var(--primary);">👤 ${esc(item.qtc)}</td>
                      <td style="padding: 9px 12px;"><span class="q-badge q-shift">${esc(item.shift)}</span></td>
                      <td style="padding: 9px 12px;">${esc(item.floor)}</td>
                      <td style="padding: 9px 12px; text-align: center; font-weight: 700;">${item.labSet.size}</td>
                      <td style="padding: 9px 12px; text-align: center;">${item.queueSet.size}</td>
                      <td style="padding: 9px 12px; text-align: center; color: #10b981;">${item.fp.toLocaleString()}</td>
                      <td style="padding: 9px 12px; text-align: center; color: #8b5cf6;">${item.qa.toLocaleString()}</td>
                      <td style="padding: 9px 14px; text-align: center; font-weight: 800; font-size: 13px; color: var(--text);">${item.total.toLocaleString()}</td>
                      <td style="padding: 9px 12px; text-align: center; font-weight: 600;">${avg}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            ${!qtcRows.length ? '<div class="ux-empty" style="padding: 24px; text-align:center;">No supervisor records found.</div>' : ''}
          </div>
        </div>
      ` : activeSubTab === 'labelers' ? `
        <!-- TAB 3: Labelers Breakdown -->
        <div class="ux-panel" style="padding: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 12px;">
          <div style="padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin:0;">👤 Individual Labeler Output by Shift</h3>
            <span class="ux-note">Showing ${labelerRows.length.toLocaleString()} active labelers across shifts</span>
          </div>
          <div style="overflow-x: auto; max-height: 60vh;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
              <thead>
                <tr style="background: var(--bg-2); border-bottom: 1px solid var(--border); position: sticky; top:0; z-index:1;">
                  <th style="padding: 10px 14px;">Labeler Name</th>
                  <th style="padding: 10px 12px;">ID</th>
                  <th style="padding: 10px 12px;">Shift</th>
                  <th style="padding: 10px 12px;">Floor (Unit)</th>
                  <th style="padding: 10px 12px;">QTC Supervisor</th>
                  <th style="padding: 10px 12px; text-align: center;">FP Tasks</th>
                  <th style="padding: 10px 12px; text-align: center;">QA Tasks</th>
                  <th style="padding: 10px 14px; text-align: center;">Total Tasks</th>
                  <th style="padding: 10px 12px; text-align: center;">Active Days</th>
                  <th style="padding: 10px 12px; text-align: center;">Avg / Day</th>
                </tr>
              </thead>
              <tbody>
                ${labelerRows.slice(0, 100).map(item => {
                  const avg = item.dates.size > 0 ? (item.total / item.dates.size).toFixed(1) : item.total;
                  return `
                    <tr style="border-bottom: 1px solid var(--border);" onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background='transparent'">
                      <td style="padding: 8px 14px; font-weight: 700; color: var(--text);">${esc(item.name)}</td>
                      <td style="padding: 8px 12px;"><span class="q-badge" style="font-family:var(--mono);">${esc(item.maskedId)}</span></td>
                      <td style="padding: 8px 12px;"><span class="q-badge q-shift">${esc(item.shift)}</span></td>
                      <td style="padding: 8px 12px;">${esc(item.floor)}</td>
                      <td style="padding: 8px 12px; color: var(--text-soft);">${esc(item.qtc)}</td>
                      <td style="padding: 8px 12px; text-align: center; color: #10b981;">${item.fp.toLocaleString()}</td>
                      <td style="padding: 8px 12px; text-align: center; color: #8b5cf6;">${item.qa.toLocaleString()}</td>
                      <td style="padding: 8px 14px; text-align: center; font-weight: 800; color: var(--primary);">${item.total.toLocaleString()}</td>
                      <td style="padding: 8px 12px; text-align: center;">${item.dates.size}</td>
                      <td style="padding: 8px 12px; text-align: center; font-weight: 600;">${avg}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            ${labelerRows.length > 100 ? `<div style="padding: 10px 18px; text-align: center; color: var(--muted); font-size: 11px;">Showing top 100 labelers of ${labelerRows.length.toLocaleString()}. Use CSV export for full dataset.</div>` : ''}
            ${!labelerRows.length ? '<div class="ux-empty" style="padding: 24px; text-align:center;">No labeler records found.</div>' : ''}
          </div>
        </div>
      ` : `
        <!-- TAB 4: Shift Comparison Chart -->
        <div class="ux-panel" style="padding: 20px;">
          <h3 style="margin-top:0;">📊 Shift Productivity Distribution by Floor (Unit)</h3>
          <p>Visual comparison of shift throughput across operational floors.</p>
          <div style="display: flex; flex-direction: column; gap: 14px; margin-top: 20px;">
            ${floorMatrix.map(flItem => {
              return `
                <div style="background: var(--bg-2); padding: 12px 16px; border-radius: 10px; border: 1px solid var(--border);">
                  <div style="display:flex; justify-content:space-between; margin-bottom: 8px; font-weight: 700;">
                    <span>🏢 ${esc(flItem.floor)}</span>
                    <span>${flItem.total.toLocaleString()} tasks</span>
                  </div>
                  <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    ${distinctShifts.map((sh, sIdx) => {
                      const count = flItem.perShift[sh]?.total || 0;
                      const colors = ['#0d9488', '#ed9a35', '#3b82f6', '#8b5cf6', '#ec4899', '#10b981'];
                      const c = colors[sIdx % colors.length];
                      const pct = flItem.total > 0 ? ((count / flItem.total) * 100).toFixed(0) : 0;
                      return `
                        <div style="flex: 1; min-width: 110px; background: var(--bg-3); padding: 8px 10px; border-radius: 8px; border-left: 3px solid ${c};">
                          <div style="font-size: 11px; color: var(--text-soft);">${esc(sh)}</div>
                          <div style="font-size: 14px; font-weight: 800; color: ${c}; margin-top: 2px;">${count.toLocaleString()} <span style="font-size:10px; color:var(--muted);">(${pct}%)</span></div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `}
    </div>
  `;

  bindHeaderControls(page, 'sc'); bindUniversalFilterBar(page, 'shift_comparison');

  page.querySelector('#scTabFloor')?.addEventListener('click', () => { shiftCompFilters.subTab = 'floor'; renderShiftComparison(); });
  page.querySelector('#scTabQtc')?.addEventListener('click', () => { shiftCompFilters.subTab = 'qtc'; renderShiftComparison(); });
  page.querySelector('#scTabLabelers')?.addEventListener('click', () => { shiftCompFilters.subTab = 'labelers'; renderShiftComparison(); });
  page.querySelector('#scTabChart')?.addEventListener('click', () => { shiftCompFilters.subTab = 'chart'; renderShiftComparison(); });

  const floorSel = page.querySelector('#scFloorSelect');
  if (floorSel) {
    floorSel.onchange = (e) => { shiftCompFilters.floor = e.target.value; renderShiftComparison(); };
  }

  const expBtn = page.querySelector('#scExportBtn');
  if (expBtn) {
    expBtn.onclick = () => {
      let headers = [], dataRows = [];
      if (activeSubTab === 'floor') {
        headers = ['Floor', ...distinctShifts.map(s => s + ' Tasks'), 'Total Submissions'];
        dataRows = floorMatrix.map(f => [f.floor, ...distinctShifts.map(s => f.perShift[s]?.total || 0), f.total]);
      } else if (activeSubTab === 'qtc') {
        headers = ['QTC Supervisor', 'Shift', 'Floor', 'Team Size', 'Queues Covered', 'FP Tasks', 'QA Tasks', 'Total Submissions'];
        dataRows = qtcRows.map(q => [q.qtc, q.shift, q.floor, q.labSet.size, q.queueSet.size, q.fp, q.qa, q.total]);
      } else {
        headers = ['Labeler Name', 'Employee ID', 'Shift', 'Floor', 'QTC Supervisor', 'FP Tasks', 'QA Tasks', 'Total Tasks', 'Active Days'];
        dataRows = labelerRows.map(l => [l.name, l.maskedId, l.shift, l.floor, l.qtc, l.fp, l.qa, l.total, l.dates.size]);
      }
      const csv = [headers, ...dataRows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), `Shift_Comparison_${activeSubTab}_${cairoToday()}.csv`);
    };
  }
}

function qtcFloorAggregateData(rows){
 const idx=name=>hdrs.findIndex(h=>h.trim().toLowerCase()===name.toLowerCase());
 const qi=idx('qtc name'), fi=hdrs.findIndex(h=>['floor','unit'].includes(h.trim().toLowerCase()));
 const si=idx('shift'), mi=idx('modality'), pi=idx('pass');
 const ni=idx('national id'), li=idx('labeler name');

 const groups=new Map();
 rows.forEach(r=>{
  const qtc=qi>=0?(String(r[qi]||'').normalize('NFC').trim().replace(/\s+/gu,' ')||'Unknown QTC'):'Unknown QTC';
  const floor=fi>=0?(String(r[fi]||'').trim()||'Unknown Floor'):'Unknown Floor';
  const key=qtc+'|||'+floor;
  if(!groups.has(key)){
   groups.set(key,{
    qtc,
    floor,
    shifts:new Set(),
    lidarFP:0,
    lidarQA:0,
    laneFP:0,
    laneQA:0,
    totalSubmit:0,
    labelerSet:new Set()
   });
  }
  const g=groups.get(key);
  g.totalSubmit++;
  if(si>=0){
   const s=String(r[si]||'').trim();
   if(s)g.shifts.add(s);
  }
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
  if(lid)g.labelerSet.add(lid);

  const mod=mi<0?'':String(r[mi]||'').toLowerCase().replace(/[\s_-]+/g,'');
  const pass=pi<0?'':String(r[pi]||'').trim().toUpperCase();
  const prefix=mod==='lidar'?'lidar':(mod==='laneline'||mod==='lane')?'lane':'';
  if(prefix&&(pass==='FP'||pass==='QA')){
   const cat=prefix+pass;
   if(cat==='lidarFP')g.lidarFP++;
   else if(cat==='lidarQA')g.lidarQA++;
   else if(cat==='laneFP')g.laneFP++;
   else if(cat==='laneQA')g.laneQA++;
  }
 });

 return [...groups.values()].map(g=>{
  const uniqueLabelers=g.labelerSet.size;
  const avgSubmit=uniqueLabelers>0?(g.totalSubmit/uniqueLabelers):0;
  return {
   ...g,
   shifts:[...g.shifts].sort(),
   uniqueLabelers,
   avgSubmit,
   avgSubmitStr:avgSubmit.toFixed(1)
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
 const idx=name=>hdrs.findIndex(h=>h.trim().toLowerCase()===name.toLowerCase());
 const qi=idx('qtc name'), fi=hdrs.findIndex(h=>['floor','unit'].includes(h.trim().toLowerCase()));
 const si=idx('shift'), mi=idx('modality'), pi=idx('pass');
 const ni=idx('national id'), li=idx('labeler name');

 const groups=new Map();
 rows.forEach(r=>{
  const floor=fi>=0?(String(r[fi]||'').trim()||'Unknown Floor'):'Unknown Floor';
  const qtc=qi>=0?(String(r[qi]||'').normalize('NFC').trim().replace(/\s+/gu,' ')||'Unknown QTC'):'Unknown QTC';
  if(!groups.has(floor)){
   groups.set(floor,{
    floor,
    shifts:new Set(),
    qtcs:new Set(),
    lidarFP:0,
    lidarQA:0,
    laneFP:0,
    laneQA:0,
    totalSubmit:0,
    labelerSet:new Set()
   });
  }
  const g=groups.get(floor);
  g.totalSubmit++;
  if(si>=0){
   const s=String(r[si]||'').trim();
   if(s)g.shifts.add(s);
  }
  if(qtc&&qtc!=='Unknown QTC')g.qtcs.add(qtc);

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
  if(lid)g.labelerSet.add(lid);

  const mod=mi<0?'':String(r[mi]||'').toLowerCase().replace(/[\s_-]+/g,'');
  const pass=pi<0?'':String(r[pi]||'').trim().toUpperCase();
  const prefix=mod==='lidar'?'lidar':(mod==='laneline'||mod==='lane')?'lane':'';
  if(prefix&&(pass==='FP'||pass==='QA')){
   const cat=prefix+pass;
   if(cat==='lidarFP')g.lidarFP++;
   else if(cat==='lidarQA')g.lidarQA++;
   else if(cat==='laneFP')g.laneFP++;
   else if(cat==='laneQA')g.laneQA++;
  }
 });

 const overallTotal=rows.length||1;

 return [...groups.values()].map(g=>{
  const uniqueLabelers=g.labelerSet.size;
  const avgSubmit=uniqueLabelers>0?(g.totalSubmit/uniqueLabelers):0;
  const sharePct=((g.totalSubmit/overallTotal)*100).toFixed(1);
  return {
   ...g,
   shifts:[...g.shifts].sort(),
   qtcs:[...g.qtcs].sort(),
   uniqueQtcs:g.qtcs.size,
   uniqueLabelers,
   avgSubmit,
   avgSubmitStr:avgSubmit>0?avgSubmit.toFixed(1):'—',
   sharePct:Number(sharePct)||0,
   sharePctStr:sharePct+'%'
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

  const distinctQtcs = [...new Set(baseRows.map(r => qi >= 0 ? String(r[qi] || '').normalize('NFC').trim().replace(/\s+/gu, ' ') : '').filter(Boolean))].sort();
  const distinctFloors = [...new Set(baseRows.map(r => fi >= 0 ? deriveFloor(r[fi]) : '').filter(Boolean))].sort();
  const distinctShifts = [...new Set(baseRows.map(r => si >= 0 ? String(r[si] || '').trim() : '').filter(Boolean))].sort();

  // Filter baseRows by page filters
  const q = (qtcFloorFilters.query || '').toLowerCase().trim();
  const filteredRows = baseRows.filter(r => {
    const qtc = qi >= 0 ? String(r[qi] || '').normalize('NFC').trim().replace(/\s+/gu, ' ') : '';
    const floor = fi >= 0 ? deriveFloor(r[fi]) : 'Floor 01';
    const shift = si >= 0 ? String(r[si] || '').trim() : '';
    const mod = mi < 0 ? '' : String(r[mi] || '').toLowerCase().replace(/[\s_-]+/g, '');
    const pass = pi < 0 ? '' : String(r[pi] || '').trim().toUpperCase();
    const cat = (mod === 'lidar' ? 'lidar' : (mod === 'laneline' || mod === 'lane') ? 'lane' : '') + pass;

    if (qtcFloorFilters.qtc && qtc !== qtcFloorFilters.qtc) return false;
    if (qtcFloorFilters.floor && floor !== qtcFloorFilters.floor) return false;
    if (qtcFloorFilters.shift && shift !== qtcFloorFilters.shift) return false;
    if (qtcFloorFilters.category && cat !== qtcFloorFilters.category) return false;

    if (q) {
      const matchQ = qtc.toLowerCase().includes(q);
      const matchF = floor.toLowerCase().includes(q);
      const matchS = shift.toLowerCase().includes(q);
      if (!matchQ && !matchF && !matchS) return false;
    }
    return true;
  });

  // Table 1: QTC & Floor aggregation
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

  // Table 2: Floor Performance aggregation
  const allFloorGroups = floorAggregateData(filteredRows);
  allFloorGroups.sort((a,b) => {
    const col = floorPerformanceFilters.sortCol || 'totalSubmit';
    let va = a[col], vb = b[col];
    if (typeof va === 'string') return floorPerformanceFilters.sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    va = Number(va) || 0; vb = Number(vb) || 0;
    return floorPerformanceFilters.sortAsc ? (va - vb) : (vb - va);
  });

  // Summary Metrics for 8 KPI Cards
  const totalSubmissions = filteredRows.length;
  const totalActiveLabelers = uniq(filteredRows, 'Labeler Name') || 0;
  const totalActiveQtcs = distinctQtcs.length;
  const totalFloorsCount = distinctFloors.length;
  const avgSubmitsPerQtcTeam = totalActiveQtcs > 0 ? (totalSubmissions / totalActiveQtcs).toFixed(1) : '0';
  const avgLabelersPerQtc = totalActiveQtcs > 0 ? (totalActiveLabelers / totalActiveQtcs).toFixed(1) : '0';
  const totalQaReviewVolume = filteredRows.filter(r => isModPass(r, 'lidar', 'QA') || isModPass(r, 'laneline', 'QA')).length;
  const avgFloorProductivity = totalFloorsCount > 0 ? (totalSubmissions / totalFloorsCount).toFixed(0) : '0';

  // Heatmap Matrix: Floor (Unit) x Shift
  const heatmapData = {};
  distinctFloors.forEach(fl => {
    heatmapData[fl] = {};
    distinctShifts.forEach(sh => { heatmapData[fl][sh] = 0; });
  });
  filteredRows.forEach(r => {
    const fl = fi >= 0 ? deriveFloor(r[fi]) : 'Unknown';
    const sh = si >= 0 ? String(r[si] || '').trim() : '';
    if (heatmapData[fl] && sh) {
      heatmapData[fl][sh] = (heatmapData[fl][sh] || 0) + 1;
    }
  });

  // 8 KPI Cards
  const kpi8 = [
    { title: 'Total Active QTCs', val: totalActiveQtcs.toLocaleString(), sub: 'Supervising reviewers', tone: '#df8b24' },
    { title: 'Total Active Labelers', val: totalActiveLabelers.toLocaleString(), sub: 'Supervised workforce', tone: '#0a9d8c' },
    { title: 'Operational Floors (Units)', val: totalFloorsCount + ' Units', sub: distinctFloors.slice(0, 2).join(', ') + (distinctFloors.length > 2 ? '...' : ''), tone: '#3b82f6' },
    { title: 'Total Submissions', val: totalSubmissions.toLocaleString(), sub: 'Workforce output', tone: '#0d9488' },
    { title: 'Avg Submissions / QTC Team', val: avgSubmitsPerQtcTeam, sub: 'Team throughput', tone: '#8b5cf6' },
    { title: 'Avg Labelers / QTC', val: avgLabelersPerQtc, sub: 'Team capacity', tone: '#10b981' },
    { title: 'QA Review Volume', val: totalQaReviewVolume.toLocaleString(), sub: 'QA validation volume', tone: '#ec4899' },
    { title: 'Avg Floor Productivity', val: avgFloorProductivity, sub: 'Submissions per floor', tone: '#f59e0b' }
  ];

  page.innerHTML = '<div class="ux-overview">'
    + '<div class="ux-heading">'
      + '<div>'
        + '<div class="ux-eyebrow">Supervisory & Facility Intelligence</div>'
        + '<h2>Performance per QTC & Floor</h2>'
        + '<p>Supervisor team throughput, floor capacity utilization, and operational room balance.</p>'
      + '</div>'
      + renderHeaderControlsHTML('qtcfloor')
    + '</div>'

    + renderUniversalFilterBar('qtcfloor')

    // 8 KPI Grid
    + '<div class="ux-grid-8">'
      + kpi8.map(k => '<div class="kpi-mini-card" style="--tone:' + k.tone + '">'
        + '<div class="kpi-title"><span>' + esc(k.title) + '</span><span style="color:' + k.tone + '">●</span></div>'
        + '<div class="kpi-val">' + k.val + '</div>'
        + '<div class="kpi-sub">' + esc(k.sub) + '</div>'
      + '</div>').join('')
    + '</div>'

    // Distinction Notice
    + '<div class="ux-panel" style="margin-top:16px; padding:12px 18px; border-left:4px solid #8b5cf6; background:rgba(139,92,246,0.06); font-size:12px; color:var(--text);">'
      + '<b>📌 Distinction Notice:</b> Individual QTC review counts (QA Review Volume) are clearly distinguished from overall team submissions. Team submissions reflect the cumulative output of all labelers reporting to that supervisor.'
    + '</div>'

    // Filters
    + '<div class="queues-controls" style="margin-top:16px;">'
      + '<label>Search QTC / Floor / Shift<input id="qfQuery" placeholder="Type QTC name, floor, shift…" value="' + esc(qtcFloorFilters.query || '') + '"></label>'
      + '<label>QTC Supervisor<select id="qfQtcSelect"><option value="">All QTCs (' + distinctQtcs.length + ')</option>' + distinctQtcs.map(q => '<option value="' + esc(q) + '" ' + (qtcFloorFilters.qtc===q?'selected':'') + '>' + esc(q) + '</option>').join('') + '</select></label>'
      + '<label>Floor<select id="qfFloorSelect"><option value="">All Floors</option>' + distinctFloors.map(f => '<option value="' + esc(f) + '" ' + (qtcFloorFilters.floor===f?'selected':'') + '>' + esc(f) + '</option>').join('') + '</select></label>'
      + '<label>Shift<select id="qfShiftSelect"><option value="">All Shifts</option>' + distinctShifts.map(s => '<option value="' + esc(s) + '" ' + (qtcFloorFilters.shift===s?'selected':'') + '>' + esc(s) + '</option>').join('') + '</select></label>'
      + '<div style="margin-left:auto; display:flex; gap:8px; align-items:flex-end;">'
        + '<button class="btn btn-c" id="qfExportCSV">↓ Export QTC CSV</button>'
        + '<button class="btn" id="qfReset">Reset Filters</button>'
      + '</div>'
    + '</div>'

    // SHIFT x FLOOR HEATMAP MATRIX
    + '<section class="ux-panel" style="margin-top:20px;">'
      + '<div class="ux-heading" style="margin-bottom:12px;">'
        + '<div><h3>Shift × Floor Throughput Heatmap</h3><p>Task submissions across operating shifts and facility floors.</p></div>'
        + '<span class="ux-note">Live Floor Cross-Matrix</span>'
      + '</div>'
      + '<div style="overflow-x:auto;">'
        + '<table class="heatmap-table">'
          + '<thead><tr>'
            + '<th>Floor</th>'
            + distinctShifts.map(s => '<th>' + esc(s) + '</th>').join('')
            + '<th>Floor Total</th>'
          + '</tr></thead>'
          + '<tbody>'
            + distinctFloors.map(fl => {
              let fTot = 0;
              return '<tr>'
                + '<td><b>' + fl + '</b></td>'
                + distinctShifts.map(sh => {
                  const val = (heatmapData[fl] && heatmapData[fl][sh]) || 0;
                  fTot += val;
                  const intensity = Math.min(1, val / Math.max(1, (totalSubmissions / 10)));
                  const bg = val > 0 ? ('rgba(13,148,136,' + Math.max(0.12, intensity * 0.45) + ')') : 'transparent';
                  return '<td style="background:' + bg + ';" class="heatmap-cell">' + (val > 0 ? '<b>' + val.toLocaleString() + '</b>' : '<span style="color:var(--muted);">—</span>') + '</td>';
                }).join('')
                + '<td><strong style="color:var(--primary);">' + fTot.toLocaleString() + '</strong></td>'
              + '</tr>';
            }).join('')
          + '</tbody>'
        + '</table>'
      + '</div>'
    + '</section>'

    // TABLE 1: QTC PERFORMANCE TABLE
    + '<section class="ux-panel" style="margin-top:20px;">'
      + '<div class="ux-heading" style="margin-bottom:12px;">'
        + '<div><h3>QTC Team Performance Table (' + allQTCFloorGroups.length.toLocaleString() + ' supervisor records)</h3><p>Click column headers with ↕ to sort. Click any QTC to drill down to team labelers.</p></div>'
        + '<span class="ux-note">Showing ' + (qfVisible.length ? (qtcFloorFilters.page*qfPageSize+1) : 0) + ' – ' + Math.min((qtcFloorFilters.page+1)*qfPageSize, allQTCFloorGroups.length) + ' of ' + allQTCFloorGroups.length + ' teams</span>'
      + '</div>'
      + '<div class="perf-table">'
        + '<table>'
          + '<thead><tr>'
            + '<th data-qf-sort="qtc">QTC Name ↕</th>'
            + '<th>Shift(s)</th>'
            + '<th>Assigned Floor</th>'
            + '<th data-qf-sort="uniqueLabelers">Team Labelers ↕</th>'
            + '<th data-qf-sort="totalSubmit" style="color:var(--primary);">Team Submits ↕</th>'
            + '<th data-qf-sort="lidarFP" style="color:#0d9488;">Lidar FP ↕</th>'
            + '<th data-qf-sort="lidarQA" style="color:#14b8a6;">Lidar QA ↕</th>'
            + '<th data-qf-sort="laneFP" style="color:#ed9a35;">Lane Line FP ↕</th>'
            + '<th data-qf-sort="laneQA" style="color:#ec4899;">Lane Line QA ↕</th>'
            + '<th data-qf-sort="avgSubmit">Avg / Labeler ↕</th>'
            + '<th>Verified Quality</th>'
          + '</tr></thead>'
          + '<tbody>'
            + qfVisible.map(q => {
              const qScore = getQtcQuality(q.qtc);
              const qStr = qScore ? (qScore.totalAccuracy*100).toFixed(1)+'%' : '—';
              const tierClass = qScore ? (qScore.totalAccuracy >= 0.95 ? 'tier-high' : qScore.totalAccuracy >= 0.85 ? 'tier-mid' : 'tier-low') : '';
              return '<tr class="qtc-row-item" data-qtc-name="' + esc(q.qtc) + '" style="cursor:pointer;" title="Click to view labelers under this QTC">'
                + '<td><b style="color:var(--primary);">' + esc(q.qtc) + '</b></td>'
                + '<td>' + (q.shifts.map(s => '<span class="q-badge q-shift">' + esc(s) + '</span>').join('') || '—') + '</td>'
                + '<td>' + esc(q.floor) + '</td>'
                + '<td><b>' + q.uniqueLabelers.toLocaleString() + '</b></td>'
                + '<td><strong style="color:var(--primary); font-size:14px;">' + q.totalSubmit.toLocaleString() + '</strong></td>'
                + '<td>' + q.lidarFP.toLocaleString() + '</td>'
                + '<td>' + q.lidarQA.toLocaleString() + '</td>'
                + '<td>' + q.laneFP.toLocaleString() + '</td>'
                + '<td>' + q.laneQA.toLocaleString() + '</td>'
                + '<td><span class="q-val-avg">' + q.avgSubmitStr + '</span></td>'
                + '<td>' + (qScore ? '<span class="tier-badge ' + tierClass + '">' + qStr + '</span>' : '<span class="ux-note">—</span>') + '</td>'
              + '</tr>';
            }).join('')
          + '</tbody>'
        + '</table>'
        + (!allQTCFloorGroups.length ? '<div class="ux-empty">No QTC team records match filters.</div>' : '')
      + '</div>'
      + '<div class="perf-pagination" style="display:flex; justify-content:space-between; align-items:center; margin-top:14px;">'
        + '<button class="btn" id="qfPrev" ' + (qtcFloorFilters.page === 0 ? 'disabled' : '') + '>Previous</button>'
        + '<span class="ux-note">Page ' + (qtcFloorFilters.page + 1) + ' of ' + qfTotalPages + '</span>'
        + '<button class="btn" id="qfNext" ' + (qtcFloorFilters.page >= qfTotalPages - 1 ? 'disabled' : '') + '>Next</button>'
      + '</div>'
    + '</section>'

    // TABLE 2: FLOOR PERFORMANCE TABLE
    + '<section class="ux-panel" style="margin-top:20px;">'
      + '<div class="ux-heading" style="margin-bottom:12px;">'
        + '<div><h3>Floor Performance Analysis (Units)</h3><p>Production, capacity, and workforce distribution per operational floor unit.</p></div>'
        + '<button class="btn btn-c" id="floorExportCSV">↓ Export Floor CSV</button>'
      + '</div>'
      + '<div class="perf-table">'
        + '<table>'
          + '<thead><tr>'
            + '<th>Floor</th>'
            + '<th>Total Submissions</th>'
            + '<th>Active Labelers</th>'
            + '<th>Active QTCs</th>'
            + '<th>Lidar FP</th>'
            + '<th>Lidar QA</th>'
            + '<th>Lane Line FP</th>'
            + '<th>Lane Line QA</th>'
            + '<th>Floor Share %</th>'
            + '<th>Avg / Labeler</th>'
            + '<th>Operating Shifts</th>'
          + '</tr></thead>'
          + '<tbody>'
            + distinctFloors.map(fl => {
              const g = allFloorGroups.find(x => x.floor === fl) || { floor: fl, totalSubmit: 0, uniqueLabelers: 0, uniqueQtcs: 0, lidarFP: 0, lidarQA: 0, laneFP: 0, laneQA: 0, shifts: [], sharePctStr: '0%' };
              const avg = g.uniqueLabelers > 0 ? (g.totalSubmit / g.uniqueLabelers).toFixed(1) : '—';
              const share = totalSubmissions ? ((g.totalSubmit / totalSubmissions) * 100).toFixed(1) + '%' : '0%';
              return '<tr class="floor-row-item" data-floor-name="' + fl + '" style="cursor:pointer;" title="Click to view rooms on this floor">'
                + '<td><b>' + fl + '</b></td>'
                + '<td><strong style="color:var(--primary);">' + g.totalSubmit.toLocaleString() + '</strong></td>'
                + '<td><b>' + g.uniqueLabelers.toLocaleString() + '</b></td>'
                + '<td><b>' + g.uniqueQtcs.toLocaleString() + '</b></td>'
                + '<td>' + g.lidarFP.toLocaleString() + '</td>'
                + '<td>' + g.lidarQA.toLocaleString() + '</td>'
                + '<td>' + g.laneFP.toLocaleString() + '</td>'
                + '<td>' + g.laneQA.toLocaleString() + '</td>'
                + '<td><b>' + share + '</b></td>'
                + '<td>' + avg + '</td>'
                + '<td>' + (g.shifts.slice(0, 3).map(s => '<span class="q-badge q-shift">' + esc(s) + '</span>').join('') || '—') + '</td>'
              + '</tr>';
            }).join('')
          + '</tbody>'
        + '</table>'
      + '</div>'
    + '</section>'
  + '</div>';

  bindHeaderControls(page, 'qtcfloor'); bindUniversalFilterBar(page, 'qtcfloor');

  // Input & Dropdowns
  const qfSearch = page.querySelector('#qfQuery');
  if(qfSearch){
    qfSearch.oninput = (e) => {
      qtcFloorFilters.query = e.target.value;
      qtcFloorFilters.page = 0;
      renderQtcFloorPerformance();
    };
  }

  $('qfQtcSelect').onchange = (e) => { qtcFloorFilters.qtc = e.target.value; qtcFloorFilters.page = 0; renderQtcFloorPerformance(); };
  $('qfFloorSelect').onchange = (e) => { qtcFloorFilters.floor = e.target.value; qtcFloorFilters.page = 0; renderQtcFloorPerformance(); };
  $('qfShiftSelect').onchange = (e) => { qtcFloorFilters.shift = e.target.value; qtcFloorFilters.page = 0; renderQtcFloorPerformance(); };
  $('qfReset').onclick = () => { qtcFloorFilters.query = ''; qtcFloorFilters.qtc = ''; qtcFloorFilters.floor = ''; qtcFloorFilters.shift = ''; qtcFloorFilters.page = 0; renderQtcFloorPerformance(); };

  // Sorting
  page.querySelectorAll('th[data-qf-sort]').forEach(th => {
    th.style.cursor = 'pointer';
    th.onclick = () => {
      const col = th.dataset.qfSort;
      if (qtcFloorFilters.sortCol === col) qtcFloorFilters.sortAsc = !qtcFloorFilters.sortAsc;
      else { qtcFloorFilters.sortCol = col; qtcFloorFilters.sortAsc = false; }
      renderQtcFloorPerformance();
    };
  });

  // Pagination
  $('qfPrev').onclick = () => { if(qtcFloorFilters.page > 0){ qtcFloorFilters.page--; renderQtcFloorPerformance(); } };
  $('qfNext').onclick = () => { if(qtcFloorFilters.page < qfTotalPages - 1){ qtcFloorFilters.page++; renderQtcFloorPerformance(); } };

  // Export CSVs
  $('qfExportCSV').onclick = () => exportQtcFloorCSV(allQTCFloorGroups);
  $('floorExportCSV').onclick = () => exportFloorPerformanceCSV(allFloorGroups);

  // Drilldown to QTC labelers
  page.querySelectorAll('.qtc-row-item').forEach(tr => {
    tr.onclick = () => {
      const qtcName = tr.dataset.qtcName;
      const teamRows = filteredRows.filter(r => qi >= 0 && String(r[qi] || '').normalize('NFC').trim() === qtcName);
      const li = hdrs.findIndex(h => h.toLowerCase() === 'labeler name');
      const ni = hdrs.findIndex(h => h.toLowerCase() === 'national id');
      const ti = hdrs.findIndex(h => ['task id', 'id'].includes(h.toLowerCase()));
      const si = hdrs.findIndex(h => h.toLowerCase() === 'shift');
      const fi = hdrs.findIndex(h => ['floor', 'unit'].includes(h.toLowerCase()));

      const drillRows = teamRows.map(r => [
        ti >= 0 ? esc(r[ti]) : '—',
        rDate(r) || '—',
        li >= 0 ? esc(r[li]) : '—',
        maskEmployeeId(ni >= 0 ? r[ni] : '', r[li]),
        si >= 0 ? esc(r[si]) : '—',
        fi >= 0 ? esc(r[fi]) : '—',
        esc(r[hdrs.findIndex(h => h.toLowerCase() === 'queue name')] || ''),
        esc(r[hdrs.findIndex(h => h.toLowerCase() === 'pass')] || '')
      ]);

      openDrilldownModal({
        title: qtcName + ' · Team Submissions',
        subtitle: teamRows.length.toLocaleString() + ' submissions under this supervisor',
        badge: 'Supervisor Team',
        columns: ['Task ID', 'Date', 'Labeler Name', 'Employee ID', 'Shift', 'Unit', 'Queue', 'Pass'],
        rows: drillRows
      });
    };
  });

  // Drilldown to Floor rooms
  page.querySelectorAll('.floor-row-item').forEach(tr => {
    tr.onclick = () => {
      const flName = tr.dataset.floorName;
      const flRows = filteredRows.filter(r => fi >= 0 && deriveFloor(r[fi]) === flName);
      const ti = hdrs.findIndex(h => ['task id', 'id'].includes(h.toLowerCase()));
      const li = hdrs.findIndex(h => h.toLowerCase() === 'labeler name');
      const ni = hdrs.findIndex(h => h.toLowerCase() === 'national id');

      const drillRows = flRows.map(r => [
        ti >= 0 ? esc(r[ti]) : '—',
        rDate(r) || '—',
        esc(r[fi] || '—'),
        li >= 0 ? esc(r[li]) : '—',
        maskEmployeeId(ni >= 0 ? r[ni] : '', r[li]),
        esc(r[hdrs.findIndex(h => h.toLowerCase() === 'shift')] || ''),
        esc(r[hdrs.findIndex(h => h.toLowerCase() === 'queue name')] || '')
      ]);

      openDrilldownModal({
        title: flName + ' · Facility Records',
        subtitle: flRows.length.toLocaleString() + ' total submissions across this floor',
        badge: 'Facility Operations',
        columns: ['Task ID', 'Date', 'Room / Unit', 'Labeler Name', 'Employee ID', 'Shift', 'Queue'],
        rows: drillRows
      });
    };
  });
}

renderAllSections=function(){
  document.querySelectorAll('#shiftBanner, #fstrip, .pills-row, #locTabs, #mainContent, #cmpBar').forEach(el => {
    el.style.setProperty('display', 'none', 'important');
  });
  renderSharedPeriods();
  renderOverview();
  renderAnalysis();
  renderQueuesAnalysis();
  renderGmReport();
  renderShiftComparison();
  renderPerformance();
  renderQtcFloorPerformance();
  renderDailyReport();
};



// Immediate instant hydration check on script load

try{

 idbGet('csv-two-sources-v1').then(cached=>{

   if(cached&&cached.v===AUTH_VER&&cached.text&&!rawRows.length){

     parseCSVAsync(cached.text).then(table=>{

       if(!rawRows.length&&table&&table.length){

         onCsvTable(table);

         renderAllSections();

       }

     }).catch(()=>{});

   }

 }).catch(()=>{});

}catch(e){}



route();
renderSharedPeriods();
})();


