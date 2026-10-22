const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'dashboard-ui.js');
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  'renderQueueTrendChart(base);',
  "renderQueueTrendChart('qTrendChart', base);"
);

code = code.replace(
  /function renderQueueTrendChart\(containerId, rows\)\s*\{[\r\n]+(\s*)const qi=hdrs/,
  "function renderQueueTrendChart(containerId, rows) {\n  if (Array.isArray(containerId)) { rows = containerId; containerId = 'qTrendChart'; }\n  if (!containerId) containerId = 'qTrendChart';\n  let chartRows = rows || [];\n  const qi=hdrs"
);

code = code.replace(
  /let chartRows=rows;[\r\n]+(\s*)if\(queuesChartFilters/,
  'if(queuesChartFilters'
);

fs.writeFileSync(file, code, 'utf8');
console.log('Fixed renderQueueTrendChart successfully');
