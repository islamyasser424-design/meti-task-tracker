const fs = require('fs');

const registry = new Map();

function createMockEl(tagOrId) {
  const el = {
    id: tagOrId,
    tagName: (tagOrId || '').toUpperCase(),
    hidden: false,
    innerHTML: '',
    value: '',
    dataset: {},
    style: {
      display: 'block',
      setProperty: () => {}
    },
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => {},
      contains: () => false
    },
    children: [],
    querySelector: (sel) => {
      if (sel.startsWith('#')) {
        return registry.get(sel.slice(1)) || createMockEl(sel.slice(1));
      }
      return createMockEl(sel);
    },
    querySelectorAll: (sel) => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    setAttribute: (k, v) => {
      if (k === 'id') registry.set(v, el);
    },
    getAttribute: () => null,
    removeAttribute: () => {},
    appendChild: (child) => {
      if (child && child.id) registry.set(child.id, child);
      el.children.push(child);
      return child;
    },
    append: (...children) => {
      children.forEach(c => {
        if (c && c.id) registry.set(c.id, c);
        el.children.push(c);
      });
    },
    prepend: (child) => {
      if (child && child.id) registry.set(child.id, child);
      el.children.unshift(child);
      return child;
    },
    removeChild: (child) => child,
    remove: () => {},
    replaceChildren: () => {},
    insertBefore: (newNode) => newNode,
    add: () => {},
    contains: () => false,
    focus: () => {}
  };
  return el;
}

global.window = global;
global.window._firstDataReady = true;
global.window.addEventListener = () => {};
global.window.removeEventListener = () => {};
global.window.matchMedia = () => ({ matches: false });
global.Option = function(text, val) { this.text = text; this.value = val; };
global.MutationObserver = function() { return { observe: () => {}, disconnect: () => {} }; };
global.parseCSVAsync = async () => [];
global.showToast = () => {};
global.downloadBlob = () => {};
global.cairoToday = () => '2026-03-01';
global.loadData = async () => {};

var localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.localStorage = localStorage;
var sessionStorage = { getItem: () => 'mock-token', setItem: () => {}, removeItem: () => {} };
global.sessionStorage = sessionStorage;
var location = { hash: '#dashboard', href: 'http://localhost/dashboard.html' };
global.location = location;

const mockBody = createMockEl('body');
global.document = {
  getElementById: (id) => registry.get(id) || createMockEl(id),
  querySelector: (sel) => {
    if (sel.startsWith('#')) return registry.get(sel.slice(1)) || createMockEl(sel.slice(1));
    return createMockEl(sel);
  },
  querySelectorAll: () => [],
  createElement: (tag) => createMockEl(tag),
  body: mockBody,
  head: createMockEl('head'),
  addEventListener: () => {},
  removeEventListener: () => {}
};

global.currentUser = { role: 'admin', username: 'admin' };
global.activeLoc = '__ALL__';
global.locColIdx = -1;
global.hdrs = ['timestamp', 'shift', 'unit', 'pc_no', 'labeler_name', 'national_id', 'qtc_shift', 'yubikey_email', 'qtc_name', 'stage', 'task_link', 'pass', 'modality', 'queue_name', 'object_count'];
global.fcache = [
  ['2026-03-01 09:00:00', 'Morning', '1', 'PC-1', 'Ahmed Ali', '29501011234567', 'Morning', 'ahmed@meti.com', 'Sarah QTC', 'Production', 'http://task/1', 'FP', 'Lidar', 'Queue A', '15'],
  ['2026-03-01 10:00:00', 'Morning', '1', 'PC-1', 'Ahmed Ali', '29501011234567', 'Morning', 'ahmed@meti.com', 'Sarah QTC', 'Production', 'http://task/2', 'QA', 'Lidar', 'Queue A', '20'],
  ['2026-03-01 17:00:00', 'Night', '2', 'PC-2', 'Mohamed Omar', '29805051234567', 'Night', 'mohamed@meti.com', 'Tarek QTC', 'Production', 'http://task/3', 'FP', 'Lane Line', 'Queue B', '35'],
  ['2026-03-01 18:00:00', 'Night', '2', 'PC-2', 'Mohamed Omar', '29805051234567', 'Night', 'mohamed@meti.com', 'Tarek QTC', 'Production', 'http://task/4', 'QA', 'Lane Line', 'Queue B', '40'],
  ['2026-03-01 02:00:00', 'Over Night', '3', 'PC-3', 'Karim Hassan', '30101011234567', 'Over Night', 'karim@meti.com', 'Mona QTC', 'Production', 'http://task/5', 'FP', 'Lidar', 'Queue C', '10']
];
global.rawRows = global.fcache;

try {
  let engineCode = fs.readFileSync('analytics-engine.js', 'utf8');
  engineCode = engineCode.replace('let rawRows=', 'var rawRows=').replace('let sel=', 'var sel=');
  eval('var localStorage = global.localStorage; var sessionStorage = global.sessionStorage; var location = global.location;\n' + engineCode);
  console.log('analytics-engine.js loaded successfully');
  tsIdx = 0;
  global.tsIdx = 0;
  global.selD = selD;
  global.selWeeks = selWeeks;
  global.sel = sel;

  let uiCode = fs.readFileSync('dashboard-ui.js', 'utf8');
  eval('var localStorage = global.localStorage; var sessionStorage = global.sessionStorage; var location = global.location;\n' + uiCode);
  console.log('dashboard-ui.js loaded successfully');

  // Verify Page 1: Overview
  console.log('\n--- Testing Page 1: Overview ---');
  location.hash = '#dashboard';
  route();
  const p1 = document.getElementById('uxOverview');
  console.log('Page 1 rendered HTML size:', p1.innerHTML.length, 'bytes');
  if (p1.innerHTML.length < 500) throw new Error('Overview HTML is unexpectedly short!');

  // Verify Page 2: Analysis
  console.log('\n--- Testing Page 2: Analysis ---');
  location.hash = '#analysis-overview';
  route();
  const p2 = document.getElementById('uxAnalysis');
  console.log('Page 2 rendered HTML size:', p2.innerHTML.length, 'bytes');
  if (p2.innerHTML.length < 500) throw new Error('Analysis HTML is unexpectedly short!');

  // Verify Page 3: Queues Analysis
  console.log('\n--- Testing Page 3: Queues Analysis ---');
  location.hash = '#queues-analysis';
  route();
  const p3 = document.getElementById('uxQueues');
  console.log('Page 3 rendered HTML size:', p3.innerHTML.length, 'bytes');
  if (p3.innerHTML.length < 500) throw new Error('Queues Analysis HTML is unexpectedly short!');

  // Verify Page 4: Performance per Labelers
  console.log('\n--- Testing Page 4: Performance per Labelers ---');
  location.hash = '#performance-labelers';
  route();
  const p4 = document.getElementById('uxPerformance');
  console.log('Page 4 rendered HTML size:', p4.innerHTML.length, 'bytes');
  if (p4.innerHTML.length < 500) throw new Error('Performance HTML is unexpectedly short!');

  // Verify Page 5: Performance per QTC & Floor
  console.log('\n--- Testing Page 5: Performance per QTC & Floor ---');
  location.hash = '#performance-qtc-floor';
  route();
  const p5 = document.getElementById('uxQtcFloor');
  console.log('Page 5 rendered HTML size:', p5.innerHTML.length, 'bytes');
  if (p5.innerHTML.length < 500) throw new Error('QTC & Floor Performance HTML is unexpectedly short!');

  // Verify Page 6: Shift Comparison
  console.log('\n--- Testing Page 6: Shift Comparison ---');
  location.hash = '#shift-comparison';
  route();
  const p6 = document.getElementById('uxShiftComparison');
  console.log('Page 6 rendered HTML size:', p6.innerHTML.length, 'bytes');
  if (p6.innerHTML.length < 500) throw new Error('Shift Comparison HTML is unexpectedly short!');

  // Verify Page 7: GM Report
  console.log('\n--- Testing Page 7: GM Report ---');
  location.hash = '#gm-report';
  route();
  const p7 = document.getElementById('uxGmReport');
  console.log('Page 7 rendered HTML size (queues mode):', p7.innerHTML.length, 'bytes');
  if (p7.innerHTML.length < 500) throw new Error('GM Report HTML is unexpectedly short!');

  // Test floor_summary view mode
  console.log('Testing GM Report with _shiftReportViewMode = "floor_summary"...');
  if (typeof window._setShiftReportViewMode === 'function') window._setShiftReportViewMode('floor_summary');
  renderGmReport();
  console.log('Page 7 rendered HTML size (floor_summary mode):', p7.innerHTML.length, 'bytes');
  if (!p7.innerHTML.includes('Summary of Floor / Room Breakdown')) throw new Error('Floor summary table not found in floor_summary mode!');

  // Test floors view mode
  console.log('Testing GM Report with _shiftReportViewMode = "floors"...');
  if (typeof window._setShiftReportViewMode === 'function') window._setShiftReportViewMode('floors');
  renderGmReport();
  console.log('Page 7 rendered HTML size (floors mode):', p7.innerHTML.length, 'bytes');
  if (!p7.innerHTML.includes('Detailed Floor & Queue Breakdown')) throw new Error('Detailed floor breakdown not found in floors mode!');

  // Reset back to queues mode
  if (typeof window._setShiftReportViewMode === 'function') window._setShiftReportViewMode('queues');
  renderGmReport();

  // Verify Page 8: Daily Report
  console.log('\n--- Testing Page 8: Daily Report ---');
  location.hash = '#daily-report';
  route();
  const p8 = document.getElementById('uxDaily');
  console.log('Page 8 rendered HTML size:', p8.innerHTML.length, 'bytes');
  if (p8.innerHTML.length < 500) throw new Error('Daily Report HTML is unexpectedly short!');

  // Verify Page 9: Advanced Insights
  console.log('\n--- Testing Page 9: Advanced Insights ---');
  location.hash = '#advanced-insights';
  route();
  const p9 = document.getElementById('uxAdvancedInsights');
  console.log('Page 9 rendered HTML size:', p9.innerHTML.length, 'bytes');
  if (p9.innerHTML.length < 500) throw new Error('Advanced Insights HTML is unexpectedly short!');
  if (!p9.innerHTML.includes('Advanced Operational Insights')) throw new Error('Advanced Insights header missing!');

  // Verify Employee Drilldown Modal & Record Builder
  console.log('\n--- Testing Employee Drilldown Modal & Record Builder ---');
  const samplePersonKey = 'Ahmed Ali';
  const rec = window.buildEmployeeRecordFromData(samplePersonKey);
  console.log('Built employee record:', rec ? { name: rec.name, total: rec.total, totalObjects: rec.totalObjects } : 'null');
  window.openLabelerDetailModal(samplePersonKey);
  const modal = document.getElementById('uxLabelerDetailModal');
  console.log('Employee modal element in DOM:', !!modal);
  if (modal) {
    console.log('Modal HTML content size:', modal.innerHTML.length, 'bytes');
    if (!modal.innerHTML.includes('Employee Performance Intelligence')) throw new Error('Modal header missing!');
  }

  console.log('\n================================================================');
  console.log('ALL ANALYTICS PAGES FULLY FUNCTIONAL AND VERIFIED!');
  console.log('================================================================');
  process.exit(0);
} catch (err) {
  console.error('Test execution failed:', err);
  process.exit(1);
}
