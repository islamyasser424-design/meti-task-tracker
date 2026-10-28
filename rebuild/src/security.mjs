import {
  scrypt,
  randomBytes,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

export class HttpError extends Error {
  constructor(status, code, message = code, headers = {}) {
    super(message);
    Object.assign(this, { status, code, headers });
  }
}
export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");
export const digestKey = (pepper, value) =>
  createHmac("sha256", pepper).update(value).digest("hex");
const derive = (value, salt) =>
  new Promise((resolve, reject) =>
    scrypt(
      value,
      salt,
      32,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)),
    ),
  );
export async function hashPassword(password, pepper) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 256
  )
    throw new Error("Password must contain 12..256 characters");
  if (!pepper || pepper.length < 32)
    throw new Error("AUTH_PEPPER must contain at least 32 characters");
  const salt = randomBytes(16);
  const key = await derive(digestKey(pepper, password), salt);
  return `scrypt-v1$32768$8$3$${salt.toString("base64url")}$${key.toString("base64url")}`;
}
export async function verifyPassword(password, stored, pepper) {
  const parts = String(stored).split("$");
  if (
    parts.length !== 6 ||
    parts.slice(0, 4).join("$") !== "scrypt-v1$32768$8$3"
  )
    return false;
  const salt = Buffer.from(parts[4], "base64url"),
    expected = Buffer.from(parts[5], "base64url");
  if (salt.length !== 16 || expected.length !== 32) return false;
  const actual = await derive(digestKey(pepper, password), salt);
  return timingSafeEqual(actual, expected);
}
export function integer(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)))
    throw new HttpError(400, "invalid_cursor");
  return Number(value);
}
export function pageLimit(url) {
  return Math.max(1, Math.min(100, integer(url.searchParams.get("limit"), 50)));
}
export function reportScope(user) {
  return user.role === "operator" ? `user:${user.id}` : "all";
}
export function isIsoDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\d$/.test(value))
    return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}
export function requireManager(user) {
  if (user.role === "operator") throw new HttpError(403, "forbidden");
}
export function requireAdmin(user) {
  if (user.role !== "admin") throw new HttpError(403, "forbidden");
}

export async function readJson(request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new HttpError(415, "json_required");
  if (Number(request.headers.get("content-length")) > 16384)
    throw new HttpError(413, "body_too_large");
  // Bound chunked bodies too, before decoding or parsing.
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "invalid_json");
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 16384) {
      await reader.cancel();
      throw new HttpError(413, "body_too_large");
    }
    chunks.push(value);
  }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const body = JSON.parse(new TextDecoder().decode(data));
    if (!body || Array.isArray(body) || typeof body !== "object") throw 0;
    return body;
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

export function normalizeTask(body, user, now = new Date()) {
  // Actor identity is server-owned. National IDs and Yubikey credentials are not needed here.
  const allowed = new Set([
    "occurred_at",
    "shift",
    "unit",
    "pc_no",
    "qtc_name",
    "task_link",
    "task_id",
    "pass",
    "stage",
    "modality",
    "queue_name",
    "object_count",
  ]);
  if (Object.keys(body).some((k) => !allowed.has(k)))
    throw new HttpError(400, "unknown_task_field");
  const text = (key, max = 160, optional = false) => {
    const value = body[key];
    if (
      typeof value !== "string" ||
      value.length > max ||
      (!optional && !value.trim()) ||
      /[\u0000-\u001f]/.test(value)
    )
      throw new HttpError(400, "invalid_field", `Invalid ${key}`);
    return value.trim();
  };
  const t = {
    occurred_at: text("occurred_at", 30),
    shift: text("shift", 40),
    unit: text("unit", 60),
    pc_no: text("pc_no", 20),
    qtc_name: body.qtc_name === undefined ? "" : text("qtc_name", 160, true),
    task_link: text("task_link", 2048),
    task_id: text("task_id", 80),
    pass: text("pass", 10),
    stage: text("stage", 80),
    modality: text("modality", 80),
    queue_name: text("queue_name", 240),
  };
  const date = new Date(t.occurred_at);
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(t.occurred_at) ||
    !Number.isFinite(+date) ||
    date.toISOString() !== t.occurred_at ||
    +date > +now + 300000
  )
    throw new HttpError(400, "invalid_occurred_at");
  if (!["FP", "QA"].includes(t.pass) || !/^\d{10,80}$/.test(t.task_id))
    throw new HttpError(400, "invalid_task_identity");
  let link;
  try {
    link = new URL(t.task_link);
  } catch {
    throw new HttpError(400, "invalid_task_link");
  }
  if (
    link.origin !== "https://labeling.robot.car" ||
    link.username ||
    link.password ||
    link.search ||
    !link.hash.startsWith("#")
  )
    throw new HttpError(400, "invalid_task_link");
  const id = link.hash.match(/\/id\/(\d+)(?:\/|$|[?&])/);
  if (!id || id[1] !== t.task_id)
    throw new HttpError(400, "task_link_id_mismatch");
  if (
    !Number.isSafeInteger(body.object_count) ||
    body.object_count < 0 ||
    body.object_count > 1000000
  )
    throw new HttpError(400, "invalid_object_count");
  t.object_count = body.object_count;
  t.work_date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  t.labeler_name = user.display_name;
  // Legacy migration 0002: task + labeler + occurrence time + pass. No task-ID-only uniqueness.
  // Stable account ID replaces mutable display name; JSON encoding avoids delimiter collisions.
  t.business_key = sha256(
    JSON.stringify([t.task_id, user.id, t.occurred_at, t.pass]),
  );
  t.request_hash = sha256(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(t).filter(([k]) => k !== "labeler_name"),
      ),
    ),
  );
  return t;
}
