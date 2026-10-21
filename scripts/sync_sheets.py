import csv, json, urllib.request, time, sys, os, io

TURSO_URL = os.environ.get('TURSO_URL', 'https://meti-tasks-islamyasser424-design.aws-eu-west-1.turso.io/v2/pipeline')
TURSO_TOKEN = os.environ.get('TURSO_TOKEN', 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTI1NjMzNDUsImlkIjoiMDFhMTVkMTctNWIwMS03ZGIyLWE5NDItN2Q1NDA1NWZhNjE1Iiwia2lkIjoid3ZJZENGejZKbkhZV3k4cGJWUkQ4bFVSZjNsOURtdjczY0ZiTGVKYmVXdyIsInJpZCI6IjE4NTk2YzM5LTFjZDgtNDk3Ny1hMmEwLTE4ODVlOWU3Yjg4MSJ9.6DYE3efGgX6Hiw_GptXugwhY3DGBlnsIVDWO9vCLgouLJ6ck7hwDaIyzkuv6CpZcIvLNlTNVK54bruXDYJ0UBA')

SHEET_URLS = [
    # Daily Active Sheet
    ("Daily Sheet", "https://docs.google.com/spreadsheets/d/1vpsYtvoZSKLsUeKj-FTXVGJmyFygSSck8DUIODJha_A/export?format=csv&gid=0", "Task ID", "QTC Name", "National ID", "PC No"),
    # History Sheet
    ("History Sheet", "https://docs.google.com/spreadsheets/d/1g9mPKQMactJKC-BP0Ik3Cw72PLUXCb4VTKFbHYLjc5I/export?format=csv&gid=0", "Id", "Qtc Name", "National Id", "Pc No")
]

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

def build_multi_insert_stmt(rows_chunk):
    cols = ['timestamp', 'shift', 'unit', 'pc_no', 'labeler_name', 'national_id', 'qtc_shift', 
            'yubikey_email', 'qtc_name', 'stage', 'task_link', 'task_id', 'pass', 'modality', 
            'queue_name', 'object_count', 'created_at']
    row_clause = '(' + ', '.join(['?'] * 17) + ')'
    sql = f"INSERT OR IGNORE INTO task_submissions ({', '.join(cols)}) VALUES " + ', '.join([row_clause] * len(rows_chunk))
    args = []
    for r in rows_chunk:
        args.extend([
            to_val(r[0]), to_val(r[1]), to_val(r[2]), to_val(r[3]), to_val(r[4]),
            to_val(r[5]), to_val(r[6]), to_val(r[7]), to_val(r[8]), to_val(r[9]),
            to_val(r[10]), to_val(r[11]), to_val(r[12]), to_val(r[13]), to_val(r[14]),
            to_val(r[15], 'integer'), to_val(r[16])
        ])
    return {'type': 'execute', 'stmt': {'sql': sql, 'args': args}}

def fetch_sheet_csv(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return resp.read().decode('utf-8', errors='replace')

def sync():
    print("=== STARTING GOOGLE SHEETS SYNC ===")
    all_rows = []
    seen = set()
    new_queues = set()
    new_qtcs = set()

    for label, url, id_col, qtc_col, nat_col, pc_col in SHEET_URLS:
        print(f"Fetching {label}...")
        try:
            csv_text = fetch_sheet_csv(url)
            reader = csv.DictReader(io.StringIO(csv_text))
            count = 0
            for r in reader:
                tid = (r.get(id_col) or r.get('Task ID') or r.get('Id') or '').strip()
                pas = (r.get('Pass') or '').strip()
                em = (r.get('Yubikey Email') or '').strip().lower()
                key = (tid, pas, em)
                if tid and key not in seen:
                    seen.add(key)
                    count += 1
                    q_name = (r.get('Queue Name') or '').strip()
                    qtc_name = (r.get(qtc_col) or r.get('QTC Name') or r.get('Qtc Name') or '').strip()
                    if q_name: new_queues.add(q_name)
                    if qtc_name: new_qtcs.add(qtc_name)
                    all_rows.append((
                        r.get('Timestamp', '').strip(),
                        r.get('Shift', '').strip(),
                        r.get('Unit', '').strip(),
                        (r.get(pc_col) or r.get('PC No') or r.get('Pc No') or '').strip(),
                        r.get('Labeler Name', '').strip(),
                        (r.get(nat_col) or r.get('National ID') or r.get('National Id') or '').strip(),
                        r.get('Shift', '').strip(),
                        em,
                        qtc_name,
                        r.get('Stage', '').strip(),
                        r.get('Task Link', '').strip(),
                        tid,
                        pas,
                        r.get('Modality', '').strip(),
                        q_name,
                        r.get('Object Count', '0'),
                        r.get('Created At') or r.get('Timestamp', '').strip()
                    ))
            print(f"Loaded {count} rows from {label}")
        except Exception as e:
            print(f"Error reading {label}: {e}")

    # Insert any new custom queues or QTCs
    if new_queues:
        q_stmts = [{'type': 'execute', 'stmt': {'sql': 'INSERT OR IGNORE INTO custom_queues (queue_name, description) VALUES (?, ?)', 'args': [{'type': 'text', 'value': q}, {'type': 'text', 'value': 'Auto-synced from Google Sheets'}]}} for q in new_queues]
        for i in range(0, len(q_stmts), 50):
            execute_pipeline(q_stmts[i:i+50])
    
    if new_qtcs:
        qtc_stmts = [{'type': 'execute', 'stmt': {'sql': 'INSERT OR IGNORE INTO custom_qtc (qtc_name, shift) VALUES (?, ?)', 'args': [{'type': 'text', 'value': qtc}, {'type': 'text', 'value': 'General'}]}} for qtc in new_qtcs]
        for i in range(0, len(qtc_stmts), 50):
            execute_pipeline(qtc_stmts[i:i+50])

    BATCH_SIZE = 50
    STMTS_PER_REQ = 4
    CHUNK_SIZE = BATCH_SIZE * STMTS_PER_REQ

    total = len(all_rows)
    print(f"Total rows to ensure synced: {total}")
    for i in range(0, total, CHUNK_SIZE):
        chunk = all_rows[i:i+CHUNK_SIZE]
        req_stmts = []
        for j in range(0, len(chunk), BATCH_SIZE):
            sub_chunk = chunk[j:j+BATCH_SIZE]
            req_stmts.append(build_multi_insert_stmt(sub_chunk))
        execute_pipeline(req_stmts)

    # Check total in Turso
    res = execute_pipeline([{'type': 'execute', 'stmt': {'sql': 'SELECT count(*) FROM task_submissions'}}])
    cnt = res['results'][0]['response']['result']['rows'][0][0]['value']
    print(f"Sync complete. Total Turso submissions: {cnt}")

if __name__ == '__main__':
    sync()
