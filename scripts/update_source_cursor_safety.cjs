const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'dashboard.html');
let code = fs.readFileSync(filePath, 'utf8');

const targetCacheHit = `      // Check in-memory source cache for instant switching (0ms!)
      if (_sourceCache[filterSource] && _sourceCache[filterSource].length > 0) {
        _allSubmissions = _sourceCache[filterSource];
        _totalDbCount = _sourceCache[filterSource + "_total"] || _allSubmissions.length;
        calculateKPIs();
        _currentPage = 1;
        applyFilters();
        return;
      }`;

const replacementCacheHit = `      // Check in-memory source cache for instant switching (0ms!)
      if (_sourceCache[filterSource] && _sourceCache[filterSource].length > 0) {
        _allSubmissions = _sourceCache[filterSource];
        _totalDbCount = _sourceCache[filterSource + "_total"] || _allSubmissions.length;
        _deltaCursor = _sourceCache[filterSource + "_cursor"] || null;
        _submissionsMap.clear();
        _allSubmissions.forEach(function(row) {
          var itemKey = String(row.id || row.submission_key || row.task_id).trim();
          if (itemKey) _submissionsMap.set(itemKey, row);
        });
        calculateKPIs();
        _currentPage = 1;
        applyFilters();
        return;
      }`;

const targetNetHit = `          _allSubmissions = (data.tasks || []).map(mapSubmissionRow);

          // Save into cache for instant switching
          _sourceCache[filterSource] = _allSubmissions;
          _sourceCache[filterSource + "_total"] = _totalDbCount;`;

const replacementNetHit = `          _allSubmissions = (data.tasks || []).map(mapSubmissionRow);
          _submissionsMap.clear();
          _allSubmissions.forEach(function(row) {
            var itemKey = String(row.id || row.submission_key || row.task_id).trim();
            if (itemKey) _submissionsMap.set(itemKey, row);
          });
          _deltaCursor = data.cursor || (_allSubmissions[0] ? ((_allSubmissions[0].updated_at || _allSubmissions[0].created_at || _allSubmissions[0].timestamp) + ":" + _allSubmissions[0].id) : null);

          // Save into cache for instant switching
          _sourceCache[filterSource] = _allSubmissions;
          _sourceCache[filterSource + "_total"] = _totalDbCount;
          _sourceCache[filterSource + "_cursor"] = _deltaCursor;`;

const normalizedCode = code.replace(/\r\n/g, '\n');
const nTargetCacheHit = targetCacheHit.replace(/\r\n/g, '\n');
const nTargetNetHit = targetNetHit.replace(/\r\n/g, '\n');

if (!normalizedCode.includes(nTargetCacheHit)) {
  console.error("targetCacheHit not found in dashboard.html");
  process.exit(1);
}
if (!normalizedCode.includes(nTargetNetHit)) {
  console.error("targetNetHit not found in dashboard.html");
  process.exit(1);
}

let updated = normalizedCode.replace(nTargetCacheHit, replacementCacheHit.replace(/\r\n/g, '\n'));
updated = updated.replace(nTargetNetHit, replacementNetHit.replace(/\r\n/g, '\n'));

fs.writeFileSync(filePath, code.includes('\r\n') ? updated.replace(/\n/g, '\r\n') : updated, 'utf8');
console.log("Successfully updated dashboard.html: onSourceFilterChange now safely isolates _deltaCursor and _submissionsMap per source!");
