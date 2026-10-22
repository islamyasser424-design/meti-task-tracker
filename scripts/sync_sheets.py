import json, urllib.request, re, urllib.parse, time, os

TURSO_URL = os.environ.get('TURSO_URL', 'https://meti-tasks-islamyasser424-design.aws-eu-west-1.turso.io/v2/pipeline')
TURSO_TOKEN = os.environ.get('TURSO_TOKEN', '')

if not TURSO_TOKEN:
    # Read from local env or raise error if in CI
    print("Warning: TURSO_TOKEN environment variable not set. Please set TURSO_TOKEN.")

def execute_pipeline(requests, retries=4):
    payload = json.dumps({'requests': requests}).encode('utf-8')
    req = urllib.request.Request(TURSO_URL, data=payload, headers={
        'Authorization': f'Bearer {TURSO_TOKEN}',
        'Content-Type': 'application/json'
    })
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except Exception as e:
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
    print("=== STARTING GOOGLE SHEETS SYNC WORKFLOW ===")
    stmts = []
    new_queues = set()
    new_qtcs = set()

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
            for r in obj1['table']['rows']:
                vals = [(cell.get('f') or cell.get('v') or '') if cell else '' for cell in r['c']]
                if len(vals) < 15: continue
                ts, shift, unit, qtc_name, yk_email, lab_name, nat_id, pc_no, mod, queue, link, tid, obj_cnt, pas, stage = vals[:15]
                created = vals[15] if len(vals) > 15 and vals[15] else ts
                tid = str(tid).strip()
                if not tid: continue

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
            print(f"Sheet 1: prepared {len(stmts)} statements.")
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
                s2_count += 1
            print(f"Sheet 2: prepared {s2_count} statements.")
    except Exception as e:
        print(f"Error fetching Sheet 2: {e}")

    # Sync custom queues & QTCs if new ones detected
    if new_queues:
        q_stmts = [{'type': 'execute', 'stmt': {'sql': 'INSERT OR IGNORE INTO custom_queues (queue_name, description) VALUES (?, ?)', 'args': [{'type': 'text', 'value': q}, {'type': 'text', 'value': 'Auto-synced from Google Sheets'}]}} for q in new_queues]
        for i in range(0, len(q_stmts), 50):
            execute_pipeline(q_stmts[i:i+50])
    
    if new_qtcs:
        qtc_stmts = [{'type': 'execute', 'stmt': {'sql': 'INSERT OR IGNORE INTO custom_qtc (qtc_name, shift) VALUES (?, ?)', 'args': [{'type': 'text', 'value': qtc}, {'type': 'text', 'value': 'General'}]}} for qtc in new_qtcs]
        for i in range(0, len(qtc_stmts), 50):
            execute_pipeline(qtc_stmts[i:i+50])

    print(f"Executing {len(stmts)} statements into Turso...")
    for b in range(0, len(stmts), 50):
        execute_pipeline(stmts[b:b+50])

    # Check total in Turso
    res = execute_pipeline([{'type': 'execute', 'stmt': {'sql': 'SELECT count(*) FROM task_submissions'}}])
    cnt = res['results'][0]['response']['result']['rows'][0][0]['value']
    print(f"Sync complete. Total Turso submissions: {cnt}")

if __name__ == '__main__':
    sync_sheets()
