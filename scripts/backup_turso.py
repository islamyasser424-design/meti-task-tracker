import urllib.request
import json
import os
import time

TURSO_URL = os.environ.get('TURSO_URL', 'https://meti-tasks-islamyasser424-design.aws-eu-west-1.turso.io/v2/pipeline')
TURSO_TOKEN = os.environ.get('TURSO_TOKEN', '')

def run_query(sql, args=None):
    if args is None:
        args = []
    formatted_args = []
    for a in args:
        if a is None:
            formatted_args.append({"type": "null"})
        elif isinstance(a, int):
            formatted_args.append({"type": "integer", "value": str(a)})
        elif isinstance(a, float):
            formatted_args.append({"type": "float", "value": a})
        else:
            formatted_args.append({"type": "text", "value": str(a)})

    payload = {"requests": [{"type": "execute", "stmt": {"sql": sql, "args": formatted_args}}]}
    req = urllib.request.Request(
        TURSO_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Authorization': f'Bearer {TURSO_TOKEN}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as resp:
        body = json.loads(resp.read().decode('utf-8'))
        res = body['results'][0]['response']['result']
        cols = [c['name'] for c in res.get('cols', [])]
        rows = []
        for r in res.get('rows', []):
            row_dict = {}
            for i, c in enumerate(r):
                row_dict[cols[i]] = c.get('value')
            rows.append(row_dict)
        return rows

def backup():
    backup_dir = os.path.join(os.path.dirname(__file__), '..', 'backups')
    os.makedirs(backup_dir, exist_ok=True)
    ts = int(time.time())
    backup_path = os.path.join(backup_dir, f'turso_backup_{ts}.json')

    print("Backing up tables...")
    backup_data = {
        "timestamp": ts,
        "tables": {}
    }

    for tbl in ["dashboard_users", "custom_qtc", "custom_queues"]:
        rows = run_query(f"SELECT * FROM \"{tbl}\"")
        backup_data["tables"][tbl] = rows
        print(f"Backed up {tbl}: {len(rows)} rows")

    # For task_submissions, get schema, count, and latest 100 rows + stats
    count = run_query("SELECT COUNT(*) as c FROM task_submissions")[0]['c']
    latest = run_query("SELECT * FROM task_submissions ORDER BY id DESC LIMIT 50")
    backup_data["task_submissions_meta"] = {
        "total_count": count,
        "sample_latest_50": latest
    }
    print(f"Backed up task_submissions meta: {count} total rows")

    with open(backup_path, 'w', encoding='utf-8') as f:
        json.dump(backup_data, f, indent=2, ensure_ascii=False)
    print(f"Backup saved to: {backup_path}")

if __name__ == '__main__':
    backup()
