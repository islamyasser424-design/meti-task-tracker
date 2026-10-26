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

def sync_sheets():
    print("=== STARTING OPTIMIZED GOOGLE SHEETS DELTA SYNC ===")
    stmts = []
    new_queues = set()
    new_qtcs = set()

    # Pre-fetch recent task IDs from database to eliminate redundant INSERT queries
    existing_tids = set()
    try:
        res = execute_pipeline([{'type': 'execute', 'stmt': {'sql': 'SELECT task_id FROM task_submissions ORDER BY id DESC LIMIT 1000'}}])
        if res and 'results' in res and res['results']:
            rows = res['results'][0].get('response', {}).get('result', {}).get('rows', [])
            for r in rows:
                if r and r[0] and r[0].get('value'):
                    existing_tids.add(str(r[0]['value']).strip())
        print(f"Pre-loaded {len(existing_tids)} recent task IDs from database to prevent redundant re-processing.")
    except Exception as e:
        print(f"Notice: proceeding without recent ID cache ({e})")

    # 1. Fetch Sheet 1 (Main/History with 51k+ rows)
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
            new_s1 = 0
            for r in obj1['table']['rows']:
                vals = [(cell.get('f') or cell.get('v') or '') if cell else '' for cell in r['c']]
                if len(vals) < 15: continue
                ts, shift, unit, qtc_name, yk_email, lab_name, nat_id, pc_no, mod, queue, link, tid, obj_cnt, pas, stage = vals[:15]
                created = vals[15] if len(vals) > 15 and vals[15] else ts
                tid = str(tid).strip()
                if not tid: continue
                if tid in existing_tids: continue

                if queue: new_queues.add(queue)
                if qtc_name: new_qtcs.add(qtc_name)

                sql = "INSERT OR IGNORE INTO task_submissions (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                args = [
                    to_val(ts), to_val(shift), to_val(unit), to_val(pc_no), to_val(lab_name),
                    to_val(nat_id), to_val(shift), to_val(str(yk_email).lower()), to_val(qtc_name),
                    to_val(stage), to_val(link), to_val(tid), to_val(pas), to_val(mod),
                    to_val(queue), to_val(obj_cnt, 'integer'), to_val(created)
                ]
                stmts.append({'type': 'execute', 'stmt': {'sql': sql, 'args': args}})
                existing_tids.add(tid)
                new_s1 += 1
            print(f"Sheet 1: {new_s1} new rows detected (skipped {len(obj1['table']['rows']) - new_s1} existing).")
    except Exception as e:
        print(f"Error fetching Sheet 1: {e}")

    # 2. Fetch Sheet 2 (Daily Active)
    print("Fetching newest 100 rows from Sheet 2 via GViz...")
    try:
        s2_count = 0
        q2 = "select * order by A desc limit 100"
        url2 = 'https://docs.google.com/spreadsheets/d/1vpsYtvoZSKLsUeKj-FTXVGJmyFygSSck8DUIODJha_A/gviz/tq?tqx=responseHandler:cb2&tq=' + urllib.parse.quote(q2)
        req2 = urllib.request.Request(url2, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req2, timeout=30) as resp:
            txt2 = resp.read().decode('utf-8')

        m2 = re.search(r'cb2\((.*)\);?\s*$', txt2, re.DOTALL)
        if m2:
            obj2 = json.loads(m2.group(1))
            for r in obj2['table']['rows']:
                vals = [(cell.get('f') or cell.get('v') or '') if cell else '' for cell in r['c']]
                if len(vals) < 15: continue
                ts, shift, unit, qtc_name, yk_email, lab_name, nat_id, pc_no, mod, queue, link, tid, obj_cnt, pas, stage = vals[:15]
                tid = str(tid).strip()
                if not tid: continue
                if tid in existing_tids: continue

                if queue: new_queues.add(queue)
                if qtc_name: new_qtcs.add(qtc_name)

                sql = "INSERT OR IGNORE INTO task_submissions (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                args = [
                    to_val(ts), to_val(shift), to_val(unit), to_val(pc_no), to_val(lab_name),
                    to_val(nat_id), to_val(shift), to_val(str(yk_email).lower()), to_val(qtc_name),
                    to_val(stage), to_val(link), to_val(tid), to_val(pas), to_val(mod),
                    to_val(queue), to_val(obj_cnt, 'integer'), to_val(ts)
                ]
                stmts.append({'type': 'execute', 'stmt': {'sql': sql, 'args': args}})
                existing_tids.add(tid)
                s2_count += 1
            print(f"Sheet 2: {s2_count} new rows detected (skipped {len(obj2['table']['rows']) - s2_count} existing).")
    except Exception as e:
        print(f"Error fetching Sheet 2: {e}")

    # 3. Fetch Archive 2026 (Live additions)
    print("Fetching newest 150 rows from Archive 2026 Sheet...")
    try:
        s26_count = 0
        q26 = "select * order by A desc limit 150"
        url26 = 'https://docs.google.com/spreadsheets/d/1gDtM7ykuYLFRoOUtV7WVHpOrbCusL1fSaT6nOOm67Cc/gviz/tq?tqx=responseHandler:cbArch2026&gid=231409283&tq=' + urllib.parse.quote(q26)
        req26 = urllib.request.Request(url26, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req26, timeout=30) as resp:
            txt26 = resp.read().decode('utf-8')
        m26 = re.search(r'cbArch2026\((.*)\);?\s*$', txt26, re.DOTALL)
        if m26:
            obj26 = json.loads(m26.group(1))
            for r in obj26['table']['rows']:
                vals = [(cell.get('f') or cell.get('v') or '') if cell else '' for cell in r['c']]
                if len(vals) < 12: continue
                ts, shift, unit, qtc_name, yk_email, lab_name, pc_no, stage, mod, queue, link, obj_cnt = vals[:12]
                pas = vals[18] if len(vals) > 18 and vals[18] else ('FP' if 'sellivandar2d' in str(link).lower() else 'QA')
                tid = ''
                if link:
                    m = re.search(r'/id/(\d+)', str(link))
                    if m: tid = m.group(1)
                if not tid or tid in existing_tids: continue

                # Insert into archive_2026
                sql_a26 = "INSERT OR IGNORE INTO archive_2026 (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Archive 2026')"
                # Insert into task_submissions
                sql_ts26 = "INSERT OR IGNORE INTO task_submissions (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Archive 2026')"
                args26 = [
                    to_val(ts), to_val(shift), to_val(unit), to_val(pc_no), to_val(lab_name or 'Labeler'),
                    to_val(''), to_val(shift), to_val(str(yk_email).lower()), to_val(qtc_name),
                    to_val(stage), to_val(link), to_val(tid), to_val(str(pas).upper()), to_val(mod),
                    to_val(queue), to_val(obj_cnt, 'integer'), to_val(ts)
                ]
                stmts.append({'type': 'execute', 'stmt': {'sql': sql_a26, 'args': args26}})
                stmts.append({'type': 'execute', 'stmt': {'sql': sql_ts26, 'args': args26}})
                existing_tids.add(tid)
                s26_count += 1
            print(f"Archive 2026: {s26_count} new rows detected (skipped {len(obj26['table']['rows']) - s26_count} existing).")
    except Exception as e:
        print(f"Error fetching Archive 2026: {e}")

    # 4. Fetch Archive 2025 (Live additions)
    print("Fetching newest 150 rows from Archive 2025 Sheet...")
    try:
        s25_count = 0
        q25 = "select * order by A desc limit 150"
        url25 = 'https://docs.google.com/spreadsheets/d/15PtvFZIJbtsj1_cxvOtUDSQdQ7liHZcHRG3hClSZKpA/gviz/tq?tqx=responseHandler:cbArch2025&gid=260304689&tq=' + urllib.parse.quote(q25)
        req25 = urllib.request.Request(url25, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req25, timeout=30) as resp:
            txt25 = resp.read().decode('utf-8')
        m25 = re.search(r'cbArch2025\((.*)\);?\s*$', txt25, re.DOTALL)
        if m25:
            obj25 = json.loads(m25.group(1))
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
                if not tid or tid in existing_tids: continue
                yk_email = f"me{raw_id}@meti.ai" if raw_id and '@' not in str(raw_id) else str(raw_id).lower()

                sql_a25 = "INSERT OR IGNORE INTO archive_2025 (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Archive 2025')"
                sql_ts25 = "INSERT OR IGNORE INTO task_submissions (timestamp, shift, unit, pc_no, labeler_name, national_id, qtc_shift, yubikey_email, qtc_name, stage, task_link, task_id, pass, modality, queue_name, object_count, created_at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Archive 2025')"
                args25 = [
                    to_val(ts), to_val(shift), to_val(unit), to_val(pc_no), to_val(raw_id or 'Labeler'),
                    to_val(''), to_val(shift), to_val(yk_email), to_val(qtc_name),
                    to_val(stage), to_val(link), to_val(tid), to_val(str(pas).upper()), to_val(mod),
                    to_val(queue), to_val(obj_cnt, 'integer'), to_val(ts)
                ]
                stmts.append({'type': 'execute', 'stmt': {'sql': sql_a25, 'args': args25}})
                stmts.append({'type': 'execute', 'stmt': {'sql': sql_ts25, 'args': args25}})
                existing_tids.add(tid)
                s25_count += 1
            print(f"Archive 2025: {s25_count} new rows detected (skipped {len(obj25['table']['rows']) - s25_count} existing).")
    except Exception as e:
        print(f"Error fetching Archive 2025: {e}")

    # Sync custom queues & QTCs if new ones detected
    if new_queues:
        q_stmts = [{'type': 'execute', 'stmt': {'sql': 'INSERT OR IGNORE INTO custom_queues (queue_name, description) VALUES (?, ?)', 'args': [{'type': 'text', 'value': q}, {'type': 'text', 'value': 'Auto-synced from Google Sheets'}]}} for q in new_queues]
        for i in range(0, len(q_stmts), 50):
            execute_pipeline(q_stmts[i:i+50])
    
    if new_qtcs:
        qtc_stmts = [{'type': 'execute', 'stmt': {'sql': 'INSERT OR IGNORE INTO custom_qtc (qtc_name, shift) VALUES (?, ?)', 'args': [{'type': 'text', 'value': qtc}, {'type': 'text', 'value': 'General'}]}} for qtc in new_qtcs]
        for i in range(0, len(qtc_stmts), 50):
            execute_pipeline(qtc_stmts[i:i+50])

    if not stmts:
        print("✓ All records are already up to date in database. 0 statements to execute. Zero quota consumed!")
        return

    print(f"Executing {len(stmts)} statements into database...")
    for b in range(0, len(stmts), 50):
        execute_pipeline(stmts[b:b+50])

    # Fast 1-row check of latest ID instead of full-table scan COUNT(*)
    try:
        res = execute_pipeline([{'type': 'execute', 'stmt': {'sql': 'SELECT MAX(id) FROM task_submissions'}}])
        cnt = res['results'][0]['response']['result']['rows'][0][0]['value']
        print(f"Sync complete. Latest task ID in database: {cnt}")
    except Exception as e:
        print(f"Sync complete. {len(stmts)} statements executed.")

if __name__ == '__main__':
    sync_sheets()
