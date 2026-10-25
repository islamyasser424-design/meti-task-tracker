const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', 'backend', '.env');
const env = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(l => {
    const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  });
}

const tursoUrl = env.TURSO_URL || process.env.TURSO_URL;
const tursoToken = env.TURSO_TOKEN || process.env.TURSO_TOKEN;

function parseGViz(text, callbackName) {
  const prefix = callbackName + "(";
  const start = text.indexOf(prefix);
  if (start === -1) return null;
  const end = text.lastIndexOf(")");
  if (end === -1) return null;
  try {
    return JSON.parse(text.slice(start + prefix.length, end));
  } catch {
    return null;
  }
}

async function sendStatements(stmts, retries = 3) {
  if (!stmts.length) return;
  for (let i = 0; i < stmts.length; i += 50) {
    const chunk = stmts.slice(i, i + 50);
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(tursoUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + tursoToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ requests: chunk })
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`Turso HTTP ${res.status}: ${t.slice(0, 100)}`);
        }
        break;
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }
}

async function syncArchive2026(limit = 1000) {
  console.log(`[Archive 2026] Syncing newest ${limit} rows from Google Sheet...`);
  const sheetId = '1gDtM7ykuYLFRoOUtV7WVHpOrbCusL1fSaT6nOOm67Cc';
  const gid = '231409283';
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=responseHandler:cbArch2026&tq=` + encodeURIComponent(`select * order by A desc limit ${limit}`) + `&gid=${gid}`;
  
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const text = await res.text();
  const obj = parseGViz(text, 'cbArch2026');
  if (!obj || !obj.table || !obj.table.rows) {
    console.warn('[Archive 2026] Could not parse GViz response');
    return 0;
  }

  const stmts = [];
  for (const row of obj.table.rows) {
    if (!row.c) continue;
    const vals = row.c.map(cell => cell ? (cell.f || cell.v || '') : '');
    if (vals.length < 12) continue;

    const ts = String(vals[0] || '').trim();
    const shift = String(vals[1] || '').trim();
    const unit = String(vals[2] || '').trim();
    const qtc_name = String(vals[3] || '').trim();
    const yk_email = String(vals[4] || '').trim().toLowerCase();
    const lab_name = String(vals[5] || '').trim();
    const pc_no = String(vals[6] || '').trim();
    const stage = String(vals[7] || '').trim();
    const mod = String(vals[8] || '').trim();
    const queue = String(vals[9] || '').trim();
    const link = String(vals[10] || '').trim();
    const obj_cnt = parseInt(vals[11] || 0, 10) || 0;
    const pass = String(vals[18] || '').trim().toUpperCase() || (link.toLowerCase().includes('sellivandar2d') ? 'FP' : 'QA');

    let tid = '';
    if (link) {
      const m = link.match(/\/id\/(\d+)/i);
      if (m) tid = m[1];
    }
    if (!tid) continue;

    const args = [
      { type: 'text', value: ts },
      { type: 'text', value: shift },
      { type: 'text', value: unit },
      { type: 'text', value: pc_no },
      { type: 'text', value: lab_name || 'Labeler' },
      { type: 'text', value: '' },
      { type: 'text', value: shift },
      { type: 'text', value: yk_email },
      { type: 'text', value: qtc_name },
      { type: 'text', value: stage },
      { type: 'text', value: link },
      { type: 'text', value: tid },
      { type: 'text', value: pass },
      { type: 'text', value: mod },
      { type: 'text', value: queue },
      { type: 'integer', value: String(obj_cnt) },
      { type: 'text', value: ts },
      { type: 'text', value: 'Archive 2026' }
    ];

    // Insert into archive_2026
    stmts.push({
      type: 'execute',
      stmt: {
        sql: `INSERT OR IGNORE INTO archive_2026 (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args
      }
    });

    // Insert into task_submissions
    stmts.push({
      type: 'execute',
      stmt: {
        sql: `INSERT OR IGNORE INTO task_submissions (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args
      }
    });
  }

  console.log(`[Archive 2026] Executing ${stmts.length} insert statements into Turso...`);
  await sendStatements(stmts);
  console.log(`✓ [Archive 2026] Successfully processed ${obj.table.rows.length} rows.`);
  return obj.table.rows.length;
}

async function syncArchive2025(limit = 1000) {
  console.log(`[Archive 2025] Syncing newest ${limit} rows from Google Sheet...`);
  const sheetId = '15PtvFZIJbtsj1_cxvOtUDSQdQ7liHZcHRG3hClSZKpA';
  const gid = '260304689';
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=responseHandler:cbArch2025&tq=` + encodeURIComponent(`select * order by A desc limit ${limit}`) + `&gid=${gid}`;
  
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const text = await res.text();
  const obj = parseGViz(text, 'cbArch2025');
  if (!obj || !obj.table || !obj.table.rows) {
    console.warn('[Archive 2025] Could not parse GViz response');
    return 0;
  }

  const stmts = [];
  for (const row of obj.table.rows) {
    if (!row.c) continue;
    const vals = row.c.map(cell => cell ? (cell.f || cell.v || '') : '');
    if (vals.length < 15) continue;

    const ts = String(vals[0] || '').trim();
    const shift = String(vals[1] || '').trim();
    const unit = String(vals[2] || '').trim();
    const qtc_name = String(vals[3] || '').trim();
    const rawId = String(vals[4] || '').trim();
    const yk_email = rawId ? (rawId.includes('@') ? rawId.toLowerCase() : `me${rawId}@meti.ai`) : '';
    const pc_no = String(vals[5] || '').trim();
    const stage = String(vals[6] || '').trim();
    const queue = String(vals[12] || '').trim();
    const mod = String(vals[13] || '').trim();
    const pass = String(vals[14] || '').trim().toUpperCase();
    const link = String(vals[15] || '').trim();
    const obj_cnt = parseInt(vals[16] || 0, 10) || 0;

    let tid = String(vals[25] || '').trim();
    if (!tid && link) {
      const m = link.match(/\/id\/(\d+)/i);
      if (m) tid = m[1];
    }
    if (!tid) continue;

    const args = [
      { type: 'text', value: ts },
      { type: 'text', value: shift },
      { type: 'text', value: unit },
      { type: 'text', value: pc_no },
      { type: 'text', value: rawId || 'Labeler' },
      { type: 'text', value: '' },
      { type: 'text', value: shift },
      { type: 'text', value: yk_email },
      { type: 'text', value: qtc_name },
      { type: 'text', value: stage },
      { type: 'text', value: link },
      { type: 'text', value: tid },
      { type: 'text', value: pass },
      { type: 'text', value: mod },
      { type: 'text', value: queue },
      { type: 'integer', value: String(obj_cnt) },
      { type: 'text', value: ts },
      { type: 'text', value: 'Archive 2025' }
    ];

    // Insert into archive_2025
    stmts.push({
      type: 'execute',
      stmt: {
        sql: `INSERT OR IGNORE INTO archive_2025 (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args
      }
    });

    // Insert into task_submissions
    stmts.push({
      type: 'execute',
      stmt: {
        sql: `INSERT OR IGNORE INTO task_submissions (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args
      }
    });
  }

  console.log(`[Archive 2025] Executing ${stmts.length} insert statements into Turso...`);
  await sendStatements(stmts);
  console.log(`✓ [Archive 2025] Successfully processed ${obj.table.rows.length} rows.`);
  return obj.table.rows.length;
}

async function run() {
  await syncArchive2026(2500);
  await syncArchive2025(2500);
  console.log('✅ Archive synchronization completed!');
}

run().catch(console.error);
