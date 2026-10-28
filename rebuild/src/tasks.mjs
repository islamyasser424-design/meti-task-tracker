import {
  HttpError,
  integer,
  pageLimit,
  reportScope,
  normalizeTask,
  requireAdmin,
  isIsoDay,
} from "./security.mjs";

const COLUMNS =
  "t.id,t.owner_id,t.labeler_name,t.occurred_at,t.work_date,t.shift,t.unit,t.pc_no,t.qtc_name,t.task_link,t.task_id,t.pass,t.stage,t.modality,t.queue_name,t.object_count,t.created_at,c.seq";
const SCOPE_VERSION =
  "SELECT task_count,object_count,version FROM meti_report_totals WHERE scope=?";
const summary = (row) =>
  row
    ? {
        task_count: Number(row.task_count),
        object_count: Number(row.object_count),
        version: Number(row.version),
      }
    : { task_count: 0, object_count: 0, version: 0 };
const visible = (user) =>
  user.role === "operator" ? [" AND c.owner_id=?", [user.id]] : ["", []];

export class TaskService {
  constructor(db, { now = () => new Date() } = {}) {
    this.db = db;
    this.now = now;
  }
  async create(body, key, user) {
    if (!key || !/^[a-zA-Z0-9_-]{16,100}$/.test(key))
      throw new HttpError(400, "idempotency_key_required");
    const t = normalizeTask(body, user, this.now()),
      scope = reportScope(user);
    const fields = [
      "occurred_at",
      "work_date",
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
    ];
    let result;
    try {
      result = await this.db.batch(
        [
          {
            sql: `INSERT INTO meti_tasks(owner_id,labeler_name,idempotency_key,request_hash,business_key,${fields.join(",")}) SELECT ${Array(
              5 + fields.length,
            )
              .fill("?")
              .join(
                ",",
              )} WHERE ?>=(SELECT opened_at FROM meti_live_config WHERE id=1) ON CONFLICT(owner_id,idempotency_key) DO NOTHING`,
            args: [
              user.id,
              user.display_name,
              key,
              t.request_hash,
              t.business_key,
              ...fields.map((k) => t[k]),
              t.occurred_at,
            ],
          },
          {
            sql: `SELECT ${COLUMNS},t.request_hash FROM meti_tasks t JOIN meti_changes c ON c.task_pk=t.id WHERE t.owner_id=? AND t.idempotency_key=?`,
            args: [user.id, key],
          },
          { sql: SCOPE_VERSION, args: [scope] },
        ],
        "write",
      );
    } catch (err) {
      if (
        String(err.code).includes("CONSTRAINT") &&
        /business_key/.test(err.message)
      )
        throw new HttpError(
          409,
          "duplicate_submission",
          "The same task, actor, occurrence time and pass already exist",
        );
      throw err;
    }
    const task = { ...result[1].rows[0] };
    if (!task.id)
      throw new HttpError(
        400,
        "occurrence_before_live_cutover",
        "New submissions must be after the live database cutover",
      );
    if (task.request_hash !== t.request_hash)
      throw new HttpError(
        409,
        "idempotency_conflict",
        "This key was already used with different data",
      );
    delete task.request_hash;
    return {
      task,
      replayed: result[0].rowsAffected === 0,
      summary: summary(result[2].rows[0]),
      server_time: new Date().toISOString(),
    };
  }
  async list(url, user, { changes = false } = {}) {
    if (
      url.searchParams.get("source") &&
      !["new"].includes(url.searchParams.get("source"))
    )
      throw new HttpError(400, "source_must_be_new");
    const scope = reportScope(user),
      cursor = integer(url.searchParams.get("cursor")),
      limit = pageLimit(url),
      [scopeSql, scopeArgs] = visible(user);
    const direction = changes ? "ASC" : "DESC";
    const boundary = changes ? "c.seq>?" : cursor ? "c.seq<?" : "c.seq>0";
    const args = changes || cursor ? [cursor] : [];
    // Both statements share one read transaction / snapshot. Cursor never moves past unseen rows.
    const result = await this.db.batch(
      [
        { sql: SCOPE_VERSION, args: [scope] },
        {
          sql: `SELECT ${COLUMNS} FROM meti_changes c JOIN meti_tasks t ON t.id=c.task_pk WHERE ${boundary}${scopeSql} AND c.seq<=COALESCE((SELECT version FROM meti_report_totals WHERE scope=?),0) ORDER BY c.seq ${direction} LIMIT ?`,
          args: [...args, ...scopeArgs, scope, limit + 1],
        },
      ],
      "read",
    );
    const s = summary(result[0].rows[0]),
      has_more = result[1].rows.length > limit,
      tasks = result[1].rows.slice(0, limit).map((r) => ({ ...r }));
    return {
      tasks,
      summary: s,
      has_more,
      cursor: changes
        ? has_more
          ? Number(tasks.at(-1).seq)
          : Math.max(cursor, s.version)
        : has_more
          ? Number(tasks.at(-1).seq)
          : null,
      changes_cursor: s.version,
      server_time: new Date().toISOString(),
    };
  }
  async report(user, url) {
    const scope = reportScope(user);
    const to =
      url.searchParams.get("to") ||
      new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(
        new Date(),
      );
    const from = url.searchParams.get("from") || to;
    if (
      !isIsoDay(from) ||
      !isIsoDay(to) ||
      to < from ||
      (Date.parse(to) - Date.parse(from)) / 86400000 > 30
    )
      throw new HttpError(400, "date_range_max_31_days");
    const r = await this.db.batch(
      [
        { sql: SCOPE_VERSION, args: [scope] },
        {
          sql: "SELECT work_date,task_count,object_count FROM meti_report_daily WHERE scope=? AND work_date>=? AND work_date<=? ORDER BY work_date LIMIT 31",
          args: [scope, from, to],
        },
      ],
      "read",
    );
    return {
      source: "new",
      scope,
      summary: summary(r[0].rows[0]),
      daily: r[1].rows.map((r) => ({ ...r })),
      from,
      to,
      metric_version: "submission-v1",
    };
  }
  async export(url, user) {
    requireAdmin(user);
    return this.list(url, user);
  }
}
