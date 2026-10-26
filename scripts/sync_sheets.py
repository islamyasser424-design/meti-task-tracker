import json, urllib.request, urllib.error, re, urllib.parse, time, os

TURSO_URL = os.environ.get('TURSO_URL', 'https://meti-tasks-islamyasser424-design.aws-eu-west-1.turso.io/v2/pipeline')
TURSO_TOKEN = os.environ.get('TURSO_TOKEN', '')

if not TURSO_TOKEN:
    print("Warning: TURSO_TOKEN environment variable not set. Please set TURSO_TOKEN.")

def execute_pipeline(requests, retries=3):
    payload = json.dumps({'requests': requests}).encode('utf-8')
    req = urllib.request.Request(TURSO_URL, data=payload, headers={
        'Authorization': f'Bearer {TURSO_TOKEN}',
        'Content-Type': 'application/json'
    })
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                res = json.loads(resp.read().decode('utf-8'))
                if res and 'results' in res:
                    for r in res['results']:
                        if r.get('type') == 'error':
                            msg = r.get('error', {}).get('message', '').lower()
                            if 'quota' in msg or 'blocked' in msg or 'forbidden' in msg or 'limit' in msg:
                                print(f"CRITICAL: Quota exceeded or database blocked: {msg}")
                                print("Halting further requests immediately to protect quota.")
                                raise RuntimeError("QUOTA_BLOCKED: " + msg)
                return res
        except urllib.error.HTTPError as he:
            if he.code in (429, 403):
                print(f"CRITICAL: HTTP {he.code} Quota/Forbidden error from database service. Halting.")
                raise he
            if attempt == retries - 1:
                raise he
            time.sleep(2 + attempt * 2)
        except Exception as e:
            if 'QUOTA_BLOCKED' in str(e):
                raise e
            if attempt == retries - 1:
                raise e
            time.sleep(2 + attempt * 2)

def to_val(v, typ='text'):
    if typ == 'integer':
        try:
            return {'type': 'integer', 'value': str(int(float(str(v).strip() or 0)))}
        except:
            return {'type': 'integer', 'value': '0'}
    return {'type': 'text', 'value': str(v).strip() if v is not None else ''}

UPSERT_TS_SQL = """INSERT INTO task_submissions (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, source)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(task_id) DO UPDATE SET
  pass = excluded.pass,
  stage = excluded.stage,
  modality = excluded.modality,
  queue_name = excluded.queue_name,
  object_count = excluded.object_count,
  labeler_name = excluded.labeler_name,
  unit = excluded.unit,
  pc_no = excluded.pc_no,
  shift = excluded.shift
WHERE (
  task_submissions.pass IS NOT excluded.pass OR
  task_submissions.stage IS NOT excluded.stage OR
  task_submissions.modality IS NOT excluded.modality OR
  task_submissions.queue_name IS NOT excluded.queue_name OR
  task_submissions.object_count IS NOT excluded.object_count OR
  task_submissions.labeler_name IS NOT excluded.labeler_name OR
  task_submissions.unit IS NOT excluded.unit OR
  task_submissions.pc_no IS NOT excluded.pc_no OR
  task_submissions.shift IS NOT excluded.shift
)"""

UPSERT_A26_SQL = """INSERT INTO archive_2026 (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, source)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Archive 2026')
ON CONFLICT(task_id) DO UPDATE SET
  pass = excluded.pass,
  stage = excluded.stage,
  modality = excluded.modality,
  queue_name = excluded.queue_name,
  object_count = excluded.object_count,
  labeler_name = excluded.labeler_name
WHERE (
  archive_2026.pass IS NOT excluded.pass OR
  archive_2026.stage IS NOT excluded.stage OR
  archive_2026.modality IS NOT excluded.modality OR
  archive_2026.queue_name IS NOT excluded.queue_name OR
  archive_2026.object_count IS NOT excluded.object_count OR
  archive_2026.labeler_name IS NOT excluded.labeler_name
)"""

UPSERT_A25_SQL = """INSERT INTO archive_2025 (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, source)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Archive 2025')
ON CONFLICT(task_id) DO UPDATE SET
  pass = excluded.pass,
  stage = excluded.stage,
  modality = excluded.modality,
  queue_name = excluded.queue_name,
  object_count = excluded.object_count,
  labeler_name = excluded.labeler_name
WHERE (
  archive_2025.pass IS NOT excluded.pass OR
  archive_2025.stage IS NOT excluded.stage OR
  archive_2025.modality IS NOT excluded.modality OR
  archive_2025.queue_name IS NOT excluded.queue_name OR
  archive_2025.object_count IS NOT excluded.object_count OR
  archive_2025.labeler_name IS NOT excluded.labeler_name
)"""

def sync_sheets():
    print("=== STARTING TARGETED DELTA GOOGLE SHEETS SYNC (INSERTS & UPDATES) ===")
    candidate_items = []
    new_queues = set()
    new_qtcs = set()

    # 1. Fetch Sheet 1 (Main/History)
    print("Fetching newest 300 rows from Sheet 1 via GViz...")
    try:
        q1 = "select * order by A desc limit 300"
        url1 = 'https://docs.google.com/spreadsheets/d/1g9mPKQMactJKC-BP0Ik3Cw72PLUXCb4VTKFbHYLjc5I/gviz/tq?tqx=responseHandler:cb1&tq=' + urllib.parse.quote(q1)
        req1 = urllib.request.Request(url1, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req1, timeout=30) as resp:
            txt1 = resp.read().decode('utf-8')
        m1 = re.search(r'cb1\((.*)\);?\s*$', txt1, re.DOTALL)
        if m1:
            obj1 = json.loads(m1.group(1))
            for r in obj1['table']['rows']:
                vals = [(cell.get('f') or cell.get('v') or '') if cell else '' for cell in r['c']]
                if len(vals) < 15: continue
                ts, shift, unit, qtc_name, yk_email, lab_name, nat_id, pc_no, mod, queue, link, tid, obj_cnt, pas, stage = vals[:15]
                created = vals[15] if len(vals) > 15 and vals[15] else ts
                tid = str(tid).strip()
                if not tid: continue
                if queue: new_queues.add(queue)
                if qtc_name: new_qtcs.add(qtc_name)

                args = [
                    to_val(ts), to_val(shift), to_val(unit), to_val(pc_no), to_val(lab_name),
                    to_val(nat_id), to_val(shift), to_val(str(yk_email).lower()), to_val(qtc_name),
                    to_val(stage), to_val(link), to_val(tid), to_val(str(pas).upper()), to_val(mod),
                    to_val(queue), to_val(obj_cnt, 'integer'), to_val(created), to_val('Live')
                ]
                candidate_items.append({
                    'type': 'sheet1',
                    'tid': tid,
                    'pas': str(pas).strip().upper(),
                    'stage': str(stage).strip(),
                    'mod': str(mod).strip(),
                    'queue': str(queue).strip(),
                    'cnt': str(obj_cnt).strip(),
                    'lab': str(lab_name).strip(),
                    'stmts': [{'sql': UPSERT_TS_SQL, 'args': args}]
                })
            print(f"Sheet 1: collected {len([c for c in candidate_items if c['type'] == 'sheet1'])} candidate rows.")
    except Exception as e:
        print(f"Error fetching Sheet 1: {e}")

    # 2. Fetch Sheet 2 (Daily Active)
    print("Fetching newest 100 rows from Sheet 2 via GViz...")
    try:
        q2 = "select * order by A desc limit 100"
        url2 = 'https://docs.google.com/spreadsheets/d/1vpsYtvoZSKLsUeKj-FTXVGJmyFygSSck8DUIODJha_A/gviz/tq?tqx=responseHandler:cb2&tq=' + urllib.parse.quote(q2)
        req2 = urllib.request.Request(url2, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req2, timeout=30) as resp:
            txt2 = resp.read().decode('utf-8')
        m2 = re.search(r'cb2\((.*)\);?\s*$', txt2, re.DOTALL)
        if m2:
            obj2 = json.loads(m2.group(1))
            s2_before = len(candidate_items)
            for r in obj2['table']['rows']:
                vals = [(cell.get('f') or cell.get('v') or '') if cell else '' for cell in r['c']]
                if len(vals) < 15: continue
                ts, shift, unit, qtc_name, yk_email, lab_name, nat_id, pc_no, mod, queue, link, tid, obj_cnt, pas, stage = vals[:15]
                tid = str(tid).strip()
                if not tid: continue
                if queue: new_queues.add(queue)
                if qtc_name: new_qtcs.add(qtc_name)

                args = [
                    to_val(ts), to_val(shift), to_val(unit), to_val(pc_no), to_val(lab_name),
                    to_val(nat_id), to_val(shift), to_val(str(yk_email).lower()), to_val(qtc_name),
                    to_val(stage), to_val(link), to_val(tid), to_val(str(pas).upper()), to_val(mod),
                    to_val(queue), to_val(obj_cnt, 'integer'), to_val(ts), to_val('Live')
                ]
                candidate_items.append({
                    'type': 'sheet2',
                    'tid': tid,
                    'pas': str(pas).strip().upper(),
                    'stage': str(stage).strip(),
                    'mod': str(mod).strip(),
                    'queue': str(queue).strip(),
                    'cnt': str(obj_cnt).strip(),
                    'lab': str(lab_name).strip(),
                    'stmts': [{'sql': UPSERT_TS_SQL, 'args': args}]
                })
            print(f"Sheet 2: collected {len(candidate_items) - s2_before} candidate rows.")
    except Exception as e:
        print(f"Error fetching Sheet 2: {e}")

    # 3. Fetch Archive 2026 (Live additions & edits)
    print("Fetching newest 150 rows from Archive 2026 Sheet...")
    try:
        q26 = "select * order by A desc limit 150"
        url26 = 'https://docs.google.com/spreadsheets/d/1gDtM7ykuYLFRoOUtV7WVHpOrbCusL1fSaT6nOOm67Cc/gviz/tq?tqx=responseHandler:cbArch2026&gid=231409283&tq=' + urllib.parse.quote(q26)
        req26 = urllib.request.Request(url26, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req26, timeout=30) as resp:
            txt26 = resp.read().decode('utf-8')
        m26 = re.search(r'cbArch2026\((.*)\);?\s*$', txt26, re.DOTALL)
        if m26:
            obj26 = json.loads(m26.group(1))
            s26_before = len(candidate_items)
            for r in obj26['table']['rows']:
                vals = [(cell.get('f') or cell.get('v') or '') if cell else '' for cell in r['c']]
                if len(vals) < 12: continue
                ts, shift, unit, qtc_name, yk_email, lab_name, pc_no, stage, mod, queue, link, obj_cnt = vals[:12]
                pas = vals[18] if len(vals) > 18 and vals[18] else ('FP' if 'sellivandar2d' in str(link).lower() else 'QA')
                tid = ''
                if link:
                    m = re.search(r'/id/(\d+)', str(link))
                    if m: tid = m.group(1)
                if not tid: continue

                args26 = [
                    to_val(ts), to_val(shift), to_val(unit), to_val(pc_no), to_val(lab_name or 'Labeler'),
                    to_val(''), to_val(shift), to_val(str(yk_email).lower()), to_val(qtc_name),
                    to_val(stage), to_val(link), to_val(tid), to_val(str(pas).upper()), to_val(mod),
                    to_val(queue), to_val(obj_cnt, 'integer'), to_val(ts), to_val('Archive 2026')
                ]
                candidate_items.append({
                    'type': 'arch2026',
                    'tid': tid,
                    'pas': str(pas).strip().upper(),
                    'stage': str(stage).strip(),
                    'mod': str(mod).strip(),
                    'queue': str(queue).strip(),
                    'cnt': str(obj_cnt).strip(),
                    'lab': str(lab_name or 'Labeler').strip(),
                    'stmts': [
                        {'sql': UPSERT_A26_SQL, 'args': args26},
                        {'sql': UPSERT_TS_SQL, 'args': args26}
                    ]
                })
            print(f"Archive 2026: collected {len(candidate_items) - s26_before} candidate rows.")
    except Exception as e:
        print(f"Error fetching Archive 2026: {e}")

    # 4. Fetch Archive 2025 (Live additions & edits)
    print("Fetching newest 150 rows from Archive 2025 Sheet...")
    try:
        q25 = "select * order by A desc limit 150"
        url25 = 'https://docs.google.com/spreadsheets/d/15PtvFZIJbtsj1_cxvOtUDSQdQ7liHZcHRG3hClSZKpA/gviz/tq?tqx=responseHandler:cbArch2025&gid=260304689&tq=' + urllib.parse.quote(q25)
        req25 = urllib.request.Request(url25, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req25, timeout=30) as resp:
            txt25 = resp.read().decode('utf-8')
        m25 = re.search(r'cbArch2025\((.*)\);?\s*$', txt25, re.DOTALL)
        if m25:
            obj25 = json.loads(m25.group(1))
            s25_before = len(candidate_items)
            for r in obj25['table']['rows']:
                vals = [(cell.get('f') or cell.get('v') or '') if cell else '' for cell in r['c']]
                if len(vals) < 15: continue
                ts, shift, unit, qtc_name, raw_id, pc_no, stage = vals[:7]
                queue = vals[12] if len(vals) > 12 else ''
                mod = vals[13] if len(vals) > 13 else ''
                pas = vals[14] if len(vals) > 14 else 'QA'
                link = vals[15] if len(vals) > 15 else ''
                obj_cnt = vals[16] if len(vals) > 16 else 0
                tid = vals[25] if len(vals) > 25 and vals[25] else ''
                if not tid and link:
                    m = re.search(r'/id/(\d+)', str(link))
                    if m: tid = m.group(1)
                if not tid: continue
                yk_email = f"me{raw_id}@meti.ai" if raw_id and '@' not in str(raw_id) else str(raw_id).lower()

                args25 = [
                    to_val(ts), to_val(shift), to_val(unit), to_val(pc_no), to_val(raw_id or 'Labeler'),
                    to_val(''), to_val(shift), to_val(yk_email), to_val(qtc_name),
                    to_val(stage), to_val(link), to_val(tid), to_val(str(pas).upper()), to_val(mod),
                    to_val(queue), to_val(obj_cnt, 'integer'), to_val(ts), to_val('Archive 2025')
                ]
                candidate_items.append({
                    'type': 'arch2025',
                    'tid': tid,
                    'pas': str(pas).strip().upper(),
                    'stage': str(stage).strip(),
                    'mod': str(mod).strip(),
                    'queue': str(queue).strip(),
                    'cnt': str(obj_cnt).strip(),
                    'lab': str(raw_id or 'Labeler').strip(),
                    'stmts': [
                        {'sql': UPSERT_A25_SQL, 'args': args25},
                        {'sql': UPSERT_TS_SQL, 'args': args25}
                    ]
                })
            print(f"Archive 2025: collected {len(candidate_items) - s25_before} candidate rows.")
    except Exception as e:
        print(f"Error fetching Archive 2025: {e}")

    # 5. Targeted State Pre-loading: Query ONLY the specific candidate Task IDs
    # Regardless of how old the task is (today or 2 years ago), its current state is fetched with index accuracy
    unique_tids = list({item['tid'] for item in candidate_items})
    print(f"Total candidate tasks across all sheets: {len(candidate_items)} ({len(unique_tids)} unique Task IDs).")

    existing_states = {}
    if unique_tids:
        # Query in chunks of 100 to avoid statement size limits while minimizing network roundtrips
        chunk_size = 100
        for i in range(0, len(unique_tids), chunk_size):
            chunk = unique_tids[i:i + chunk_size]
            placeholders = ','.join(['?'] * len(chunk))
            sql = f"SELECT task_id, pass, stage, modality, queue_name, object_count, labeler_name FROM task_submissions WHERE task_id IN ({placeholders})"
            args = [{'type': 'text', 'value': tid} for tid in chunk]
            try:
                res = execute_pipeline([{'type': 'execute', 'stmt': {'sql': sql, 'args': args}}])
                if res and 'results' in res and res['results']:
                    rows = res['results'][0].get('response', {}).get('result', {}).get('rows', [])
                    for r in rows:
                        if r and r[0] and r[0].get('value'):
                            db_tid = str(r[0]['value']).strip()
                            db_pas = str(r[1].get('value', '') if r[1] else '').strip().upper()
                            db_stg = str(r[2].get('value', '') if r[2] else '').strip()
                            db_mod = str(r[3].get('value', '') if r[3] else '').strip()
                            db_que = str(r[4].get('value', '') if r[4] else '').strip()
                            db_cnt = str(r[5].get('value', 0) if r[5] else 0).strip()
                            db_lab = str(r[6].get('value', '') if r[6] else '').strip()
                            existing_states[db_tid] = (db_pas, db_stg, db_mod, db_que, db_cnt, db_lab)
            except Exception as e:
                print(f"Notice: fingerprint batch query failed ({e}); falling back to direct UPSERT for chunk {i//chunk_size + 1}")

    print(f"Pre-loaded fingerprints for {len(existing_states)} existing database tasks (index-targeted query).")

    # 6. Smart Delta Classification (New Inserts vs Genuine Field Modifications vs Unchanged)
    stmts = []
    new_inserts = 0
    modifications = 0
    unmodified_skipped = 0

    for item in candidate_items:
        tid = item['tid']
        incoming_fp = (item['pas'], item['stage'], item['mod'], item['queue'], item['cnt'], item['lab'])

        if tid not in existing_states:
            # Genuinely new task -> Insert via UPSERT
            for s in item['stmts']:
                stmts.append({'type': 'execute', 'stmt': s})
            existing_states[tid] = incoming_fp
            new_inserts += 1
        elif existing_states[tid] != incoming_fp:
            # Existing task with modified fields (e.g. stage changed from Labeling to QA, pass changed to FP) -> Update
            for s in item['stmts']:
                stmts.append({'type': 'execute', 'stmt': s})
            existing_states[tid] = incoming_fp
            modifications += 1
        else:
            # Existing task with 100% identical data -> SKIP (0 SQL writes)
            unmodified_skipped += 1

    print(f"Delta Analysis: {new_inserts} new inserts, {modifications} modified tasks, {unmodified_skipped} unmodified skipped.")

    # 7. Sync custom queues & QTCs if new ones detected
    if new_queues:
        q_stmts = [{'type': 'execute', 'stmt': {'sql': 'INSERT OR IGNORE INTO custom_queues (queue_name, description) VALUES (?, ?)', 'args': [{'type': 'text', 'value': q}, {'type': 'text', 'value': 'Auto-synced from Google Sheets'}]}} for q in new_queues]
        for i in range(0, len(q_stmts), 50):
            execute_pipeline(q_stmts[i:i+50])

    if new_qtcs:
        qtc_stmts = [{'type': 'execute', 'stmt': {'sql': 'INSERT OR IGNORE INTO custom_qtc (qtc_name, shift) VALUES (?, ?)', 'args': [{'type': 'text', 'value': qtc}, {'type': 'text', 'value': 'General'}]}} for qtc in new_qtcs]
        for i in range(0, len(qtc_stmts), 50):
            execute_pipeline(qtc_stmts[i:i+50])

    if not stmts:
        print("✓ All records are up to date. 0 write statements sent to database.")
        return

    print(f"Executing {len(stmts)} statements into database...")
    for b in range(0, len(stmts), 50):
        execute_pipeline(stmts[b:b+50])

    print(f"✓ Sync complete successfully. Write statements: {len(stmts)}.")

if __name__ == '__main__':
    sync_sheets()
