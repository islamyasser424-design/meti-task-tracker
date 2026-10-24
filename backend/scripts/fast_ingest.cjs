const fs = require('fs');
const path = require('path');
const readline = require('readline');

const envLines = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n');
const env = {};
envLines.forEach(l => {
  const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
});

function parseCSVLine(str) {
  const arr = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '"') {
      if (inQuotes && str[i+1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (c === ',' && !inQuotes) {
      arr.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  arr.push(cur);
  return arr;
}

// Builds multi-row execute statement (50 rows per stmt)
function buildMultiRowStmt(rowItems) {
  const valueClauses = [];
  const args = [];
  for (const item of rowItems) {
    valueClauses.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    args.push(
      { type: 'text', value: item.timestamp },
      { type: 'text', value: item.shift },
      { type: 'text', value: item.unit },
      { type: 'text', value: item.pc_no },
      { type: 'text', value: item.labeler_name },
      { type: 'text', value: item.national_id || '' },
      { type: 'text', value: item.qtc_shift || item.shift },
      { type: 'text', value: item.yubikey_email },
      { type: 'text', value: item.qtc_name },
      { type: 'text', value: item.stage },
      { type: 'text', value: item.task_link },
      { type: 'text', value: item.task_id },
      { type: 'text', value: item.pass },
      { type: 'text', value: item.modality },
      { type: 'text', value: item.queue_name },
      { type: 'integer', value: String(item.object_count || 0) },
      { type: 'text', value: item.timestamp },
      { type: 'text', value: item.source }
    );
  }
  const sql = `INSERT OR IGNORE INTO task_submissions (
    timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift,
    yubikey_email, qtc_name, stage, task_link, task_id, pass, modality,
    queue_name, object_count, created_at, source
  ) VALUES ` + valueClauses.join(', ');
  return { type: 'execute', stmt: { sql, args } };
}

async function sendBatch(items, retries = 3) {
  if (!items.length) return;
  // Split into chunks of 50 rows per statement, up to 2 statements per HTTP request (100 rows)
  const statements = [];
  for (let i = 0; i < items.length; i += 50) {
    statements.push(buildMultiRowStmt(items.slice(i, i + 50)));
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000); // 20s safety timeout
    try {
      const res = await fetch(env.TURSO_URL, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + env.TURSO_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests: statements }),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Turso HTTP ${res.status}: ${text.slice(0, 120)}`);
      }
      return;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

async function downloadFile(url, destPath, label) {
  console.log(`[${label}] Downloading data file from Google Sheets...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${label}`);
  const fileStream = fs.createWriteStream(destPath);
  await new Promise((resolve, reject) => {
    res.body.pipeTo(new WritableStream({
      write(chunk) { fileStream.write(chunk); },
      close() { fileStream.end(); resolve(); },
      abort(err) { fileStream.destroy(); reject(err); }
    })).catch(reject);
  });
  const stat = fs.statSync(destPath);
  console.log(`[${label}] Download completed: ${(stat.size / (1024 * 1024)).toFixed(2)} MB saved to ${destPath}`);
}

async function ingestArchive1() {
  const localFile = path.resolve(__dirname, 'temp_archive1.csv');
  const url = 'https://docs.google.com/spreadsheets/d/1oYBQ0pBqdre60Ds14sTbSijBxOBDsbCZ_kurYrdX_1o/export?format=csv&gid=260304689';

  if (!fs.existsSync(localFile) || fs.statSync(localFile).size < 1000) {
    await downloadFile(url, localFile, 'ارشيف 1');
  } else {
    console.log('[ارشيف 1] Using cached file: ' + localFile);
  }

  console.log('\n========================================');
  console.log('INGESTING: ارشيف 1 (Archive 1)');
  console.log('========================================');

  const fileStream = fs.createReadStream(localFile);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineCount = 0;
  let items = [];
  let pendingPromises = [];
  let totalProcessed = 0;

  for await (const line of rl) {
    lineCount++;
    if (lineCount === 1) continue;

    const c = parseCSVLine(line);
    if (c.length < 15) continue;

    const ts = (c[0] || '').trim();
    const shift = (c[1] || '').trim();
    const unit = (c[2] || '').trim();
    const qtc_name = (c[3] || '').trim();
    const rawId = (c[4] || '').trim();
    const yk_email = rawId ? (rawId.includes('@') ? rawId.toLowerCase() : `me${rawId}@meti.ai`) : '';
    const pc_no = (c[5] || '').trim();
    const stage = (c[6] || '').trim();
    const queue = (c[12] || '').trim();
    const mod = (c[13] || '').trim();
    const pass = (c[14] || '').trim().toUpperCase();
    const link = (c[15] || '').trim();
    const obj_cnt = parseInt(c[16] || '0', 10) || 0;
    
    let tid = (c[25] || '').trim();
    if (!tid && link) {
      const m = link.match(/\/id\/(\d+)/i);
      if (m) tid = m[1];
    }
    if (!tid) continue;

    items.push({
      timestamp: ts,
      shift,
      unit,
      pc_no,
      labeler_name: rawId || 'Labeler',
      national_id: '',
      qtc_shift: shift,
      yubikey_email: yk_email,
      qtc_name,
      stage,
      task_link: link,
      task_id: tid,
      pass,
      modality: mod,
      queue_name: queue,
      object_count: obj_cnt,
      source: 'ارشيف 1'
    });

    if (items.length >= 100) {
      const currentItems = items;
      items = [];
      pendingPromises.push(sendBatch(currentItems));
      totalProcessed += currentItems.length;

      // Keep up to 3 concurrent requests (300 rows at once)
      if (pendingPromises.length >= 3) {
        await Promise.all(pendingPromises);
        pendingPromises = [];
      }

      if (totalProcessed % 5000 === 0) {
        console.log(`[ارشيف 1] Processed ${totalProcessed} records... (line ${lineCount})`);
      }
    }
  }

  if (items.length > 0) {
    pendingPromises.push(sendBatch(items));
    totalProcessed += items.length;
  }
  if (pendingPromises.length > 0) {
    await Promise.all(pendingPromises);
  }

  console.log(`✅ [ارشيف 1] Successfully processed ${totalProcessed} records!`);
}

async function ingestArchive2() {
  const localFile = path.resolve(__dirname, 'temp_archive2.csv');
  const url = 'https://docs.google.com/spreadsheets/d/1BSeiRLiRTSmH_Et0B8TQAPKsuY98CVSB-gcg6ai51YQ/gviz/tq?tqx=out:csv&gid=231409283';

  if (!fs.existsSync(localFile) || fs.statSync(localFile).size < 1000) {
    await downloadFile(url, localFile, 'ارشيف 2');
  } else {
    console.log('[ارشيف 2] Using cached file: ' + localFile);
  }

  console.log('\n========================================');
  console.log('INGESTING: ارشيف 2 (Archive 2)');
  console.log('========================================');

  const fileStream = fs.createReadStream(localFile);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineCount = 0;
  let items = [];
  let pendingPromises = [];
  let totalProcessed = 0;

  for await (const line of rl) {
    lineCount++;
    if (lineCount === 1) continue;

    const c = parseCSVLine(line);
    if (c.length < 12) continue;

    const ts = (c[0] || '').trim();
    const shift = (c[1] || '').trim();
    const unit = (c[2] || '').trim();
    const qtc_name = (c[3] || '').trim();
    const yk_email = (c[4] || '').trim().toLowerCase();
    const lab_name = (c[5] || '').trim();
    const pc_no = (c[6] || '').trim();
    const stage = (c[7] || '').trim();
    const mod = (c[8] || '').trim();
    const queue = (c[9] || '').trim();
    const link = (c[10] || '').trim();
    const obj_cnt = parseInt(c[11] || '0', 10) || 0;
    const pass = (c[18] || '').trim().toUpperCase() || (link.toLowerCase().includes('sellivandar2d') ? 'FP' : 'QA');

    let tid = '';
    if (link) {
      const m = link.match(/\/id\/(\d+)/i);
      if (m) tid = m[1];
    }
    if (!tid) continue;

    items.push({
      timestamp: ts,
      shift,
      unit,
      pc_no,
      labeler_name: lab_name || 'Labeler',
      national_id: '',
      qtc_shift: shift,
      yubikey_email: yk_email,
      qtc_name,
      stage,
      task_link: link,
      task_id: tid,
      pass,
      modality: mod,
      queue_name: queue,
      object_count: obj_cnt,
      source: 'ارشيف 2'
    });

    if (items.length >= 100) {
      const currentItems = items;
      items = [];
      pendingPromises.push(sendBatch(currentItems));
      totalProcessed += currentItems.length;

      // Keep up to 3 concurrent requests (300 rows at once)
      if (pendingPromises.length >= 3) {
        await Promise.all(pendingPromises);
        pendingPromises = [];
      }

      if (totalProcessed % 5000 === 0) {
        console.log(`[ارشيف 2] Processed ${totalProcessed} records... (line ${lineCount})`);
      }
    }
  }

  if (items.length > 0) {
    pendingPromises.push(sendBatch(items));
    totalProcessed += items.length;
  }
  if (pendingPromises.length > 0) {
    await Promise.all(pendingPromises);
  }

  console.log(`✅ [ارشيف 2] Successfully processed ${totalProcessed} records!`);
}

async function main() {
  const startTime = Date.now();
  console.log('========================================================');
  console.log('TURSO ULTRA-FAST MULTI-ROW INGESTION PIPELINE');
  console.log('========================================================');

  await ingestArchive1();
  await ingestArchive2();

  console.log('\n========================================================');
  console.log(`ALL INGESTION COMPLETED IN ${((Date.now() - startTime) / 1000).toFixed(1)}s!`);
  console.log('========================================================');
}

main().catch(err => {
  console.error('Fatal ingestion error:', err);
  process.exit(1);
});
