const fs = require('fs');

const file = 'C:/Users/Eslam/Downloads/meti-task-tracker/dashboard.html';
let content = fs.readFileSync(file, 'utf8');

// 1. Move shared-theme.css after </style>
content = content.replace(/<link rel="stylesheet" href="shared-theme\.css">\s*/, '');
content = content.replace(/<\/style>\s*<\/head>/, '</style>\n  <link rel="stylesheet" href="shared-theme.css">\n</head>');

// 2. Add KPI Telemetry Grid inside #panelTelemetry before .filter-card
const kpiMarkup = `      <!-- Executive KPI Telemetry Grid -->
      <div class="dash-kpis" id="telemetryKpis">
        <div class="kpi-card" id="kpiCardTotal">
          <div class="kpi-card-header">
            <span class="kpi-lbl">Total Tasks (All Time)</span>
            <div class="kpi-icon-wrap icon-petrol">📋</div>
          </div>
          <div class="kpi-val" id="kpiTotalTasks">...</div>
          <div class="kpi-footer-sub">Verified in Edge Database</div>
        </div>

        <div class="kpi-card" id="kpiCardToday">
          <div class="kpi-card-header">
            <span class="kpi-lbl">Today's Tasks</span>
            <div class="kpi-icon-wrap icon-turquoise">⚡</div>
          </div>
          <div class="kpi-val" id="kpiTodayCount">0</div>
          <div class="kpi-footer-sub">Current Cairo Workday</div>
        </div>

        <div class="kpi-card" id="kpiCardObjects">
          <div class="kpi-card-header">
            <span class="kpi-lbl">Today's Objects</span>
            <div class="kpi-icon-wrap icon-blue">🎯</div>
          </div>
          <div class="kpi-val" id="kpiTodayObjects">0</div>
          <div class="kpi-footer-sub">Objects Processed & Labelled</div>
        </div>

        <div class="kpi-card" id="kpiCardLabelers">
          <div class="kpi-card-header">
            <span class="kpi-lbl">Active Workforce</span>
            <div class="kpi-icon-wrap icon-amber">👥</div>
          </div>
          <div class="kpi-val" id="kpiActiveLabelers">0</div>
          <div class="kpi-footer-sub">Active Labelers on Floor</div>
        </div>
      </div>\n\n`;

content = content.replace(/(<div id="panelTelemetry">\s*)(<!-- Filters & Actions Card -->)/, `$1${kpiMarkup}      $2`);

// 3. Update loading row in tableBody
const oldLoadingRow = /<tbody id="tableBody">\s*<tr><td colspan="16"[^>]*>Loading live records from Turso\.\.\.<\/td><\/tr>\s*<\/tbody>/;
const newLoadingRow = `<tbody id="tableBody">
              <tr>
                <td colspan="17" style="text-align:center; padding:48px 20px;">
                  <div class="table-state-box loading">
                    <div class="state-spinner"></div>
                    <div class="state-title">Loading Operations Telemetry...</div>
                    <div class="state-sub">Fetching edge records from Cloudflare D1</div>
                  </div>
                </td>
              </tr>
            </tbody>`;
content = content.replace(oldLoadingRow, newLoadingRow);

// 4. Update empty state in renderTable()
const oldEmptyState = /if \(!_filteredSubmissions\.length\) \{[\s\S]*?updatePaginationControls\(0, 0, 0\);\s*return;\s*\}/;
const newEmptyState = `if (!_filteredSubmissions.length) {
        tbody.innerHTML = '<tr><td colspan="' + totalCols + '" style="text-align:center; padding:48px 20px;">'
          + '<div class="table-state-box empty">'
          + '<div class="state-icon">🔍</div>'
          + '<div class="state-title">No Matching Task Submissions Found</div>'
          + '<div class="state-sub">No tasks match your selected date, shift, modality, or search filters.</div>'
          + '<div class="state-actions" style="margin-top:14px; display:flex; gap:8px; justify-content:center;">'
          + '<button class="btn-action secondary" onclick="resetAllFilters()">🧹 Reset All Filters</button>'
          + '<button class="btn-action" onclick="searchFullDatabase()">⚡ Full DB Search</button>'
          + '</div>'
          + '</div>'
          + '</td></tr>';
        updatePaginationControls(0, 0, 0);
        return;
      }`;
content = content.replace(oldEmptyState, newEmptyState);

// 5. Update fetchLiveDataOnly error handling
const oldCatch = /\.catch\(function\(err\) \{\s*if \(sync\) sync\.textContent = "API error: " \+ err\.message;\s*\}\);/;
const newCatch = `.catch(function(err) {
      if (sync) sync.textContent = "API error: " + err.message;
      var tbody = document.getElementById("tableBody");
      if (tbody && !_allSubmissions.length) {
        tbody.innerHTML = '<tr><td colspan="17" style="text-align:center; padding:48px 20px;">'
          + '<div class="table-state-box error">'
          + '<div class="state-icon">⚠️</div>'
          + '<div class="state-title">Failed to Load Telemetry</div>'
          + '<div class="state-sub">' + (err.message || "Database connection error") + '</div>'
          + '<div class="state-actions" style="margin-top:14px;">'
          + '<button class="btn-action" onclick="fetchLiveData()">🔄 Retry Connection</button>'
          + '</div>'
          + '</div>'
          + '</td></tr>';
      }
    });`;
content = content.replace(oldCatch, newCatch);

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully patched dashboard.html for Phase 3!');
