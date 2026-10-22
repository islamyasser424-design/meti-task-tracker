import urllib.request
import json
import os
import hashlib
import base64

TURSO_URL = os.environ.get('TURSO_URL', 'https://meti-tasks-islamyasser424-design.aws-eu-west-1.turso.io/v2/pipeline')
TURSO_TOKEN = os.environ.get('TURSO_TOKEN', '')

def b64url(data: bytes) -> str:
    return base64.b64encode(data).decode('utf-8').replace('+', '-').replace('/', '_').rstrip('=')

def b64url_decode(s: str) -> bytes:
    padding = '=' * (-len(s) % 4)
    return base64.b64decode(s.replace('-', '+').replace('_', '/') + padding)

def hash_password(password: str, iterations: int = 100000) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, iterations, dklen=32)
    return f"pbkdf2-sha256${iterations}${b64url(salt)}${b64url(dk)}"

def verify_password(password: str, stored_hash: str) -> bool:
    parts = stored_hash.split('$')
    if len(parts) != 4 or parts[0] != 'pbkdf2-sha256':
        return False
    iterations = int(parts[1])
    salt = b64url_decode(parts[2])
    expected = b64url_decode(parts[3])
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, iterations, dklen=32)
    return hashlib.sha256(dk).digest() == hashlib.sha256(expected).digest()

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

def migrate():
    users = run_query("SELECT id, username, password, status FROM dashboard_users")
    print(f"Loaded {len(users)} users from Turso.")
    migrated_count = 0
    for u in users:
        uid = u['id']
        uname = u['username']
        pw = u['password'] or ''
        status = u['status']

        if not pw:
            print(f"User {uname} (ID: {uid}) has empty password (status: {status}). Skipping hash migration.")
            continue

        if pw.startswith('pbkdf2-sha256$'):
            print(f"User {uname} (ID: {uid}) already hashed. Skipping.")
            continue

        # Hash legacy plaintext password
        hashed = hash_password(pw)
        assert verify_password(pw, hashed), f"Self-check failed for user {uname}"
        run_query("UPDATE dashboard_users SET password = ? WHERE id = ?", [hashed, uid])
        print(f"Successfully migrated user {uname} (ID: {uid}) to PBKDF2-SHA256 salted hash.")
        migrated_count += 1

    print(f"\nMigration complete! Total accounts migrated: {migrated_count}")

    # Verify all accounts
    verified_users = run_query("SELECT id, username, status, substr(password, 1, 20) as pfx FROM dashboard_users")
    for vu in verified_users:
        print(f" - {vu['username']} ({vu['status']}): password prefix = {vu['pfx']}")

if __name__ == '__main__':
    migrate()

