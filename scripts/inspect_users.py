import urllib.request
import json
import os

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

users = run_query("SELECT id, username, full_name, role, status, email, recovery_pin, reset_status, reset_code, length(password) as pw_len, substr(password, 1, 15) as pw_prefix FROM dashboard_users;")
print("Users:")
for u in users:
    print(u)
