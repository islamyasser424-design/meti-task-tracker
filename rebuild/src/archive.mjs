import { HttpError, requireManager, integer, pageLimit } from "./security.mjs";
export function safeTable(value) {
  if (!/^meti_raw_[a-f0-9]{24}$/.test(value))
    throw new Error("Invalid archive table");
  return value;
}
export class ArchiveService {
  constructor(databases) {
    this.databases = databases;
  }
  async list(year, url, user) {
    requireManager(user);
    const db = this.databases[year];
    const source = url.searchParams.get("page");
    if (!source) {
      const r = await db.execute(
        "SELECT source_id,page_name,column_count,expected_rows,imported_rows,status FROM meti_archive_sources ORDER BY source_id LIMIT 100",
      );
      return {
        source: year,
        pages: r.rows.map((r) => ({ ...r })),
        message: "Choose page=source_id for raw details",
      };
    }
    const cursor = integer(url.searchParams.get("cursor")),
      limit = pageLimit(url);
    const meta = (
      await db.execute({
        sql: "SELECT table_name,column_count,status FROM meti_archive_sources WHERE source_id=?",
        args: [source],
      })
    ).rows[0];
    if (!meta || meta.status !== "complete")
      throw new HttpError(404, "archive_page_not_ready");
    const table = safeTable(meta.table_name);
    const columns = Array.from(
      { length: Number(meta.column_count) },
      (_, i) => `c${String(i + 1).padStart(3, "0")}`,
    );
    const r = await db.batch(
      [
        {
          sql: "SELECT ordinal,technical_name,original_header FROM meti_archive_columns WHERE source_id=? ORDER BY ordinal",
          args: [source],
        },
        {
          sql: `SELECT source_row,${columns.join(",")} FROM ${table} WHERE source_row>? ORDER BY source_row LIMIT ?`,
          args: [cursor, limit + 1],
        },
      ],
      "read",
    );
    const rows = r[1].rows.slice(0, limit).map((r) => ({ ...r }));
    return {
      source: year,
      page: source,
      columns: r[0].rows.map((r) => ({ ...r })),
      rows,
      has_more: r[1].rows.length > limit,
      cursor: rows.at(-1)?.source_row ?? cursor,
    };
  }
  async report(year, user) {
    requireManager(user);
    const r = await this.databases[year].execute(
      `SELECT a.source_id,a.page_name,a.status,a.dataset_start,a.dataset_end,s.raw_rows,s.task_count,s.object_count,s.metric_version FROM meti_archive_sources a LEFT JOIN meti_archive_summary s ON s.source_id=a.source_id ORDER BY a.source_id LIMIT 100`,
    );
    const pages = r.rows.map((r) => ({ ...r }));
    const compatible =
      pages.length > 0 &&
      pages.every(
        (p) =>
          p.status === "complete" &&
          p.metric_version === "submission-v1" &&
          p.task_count !== null &&
          p.dataset_start &&
          p.dataset_end,
      );
    return {
      source: year,
      compatible,
      pages,
      raw_rows: pages.reduce((n, p) => n + Number(p.raw_rows || 0), 0),
      summary: compatible
        ? {
            task_count: pages.reduce((n, p) => n + Number(p.task_count), 0),
            object_count: pages.reduce((n, p) => n + Number(p.object_count), 0),
          }
        : null,
    };
  }
  async all(live, user) {
    requireManager(user);
    const parts = [
      await this.report("2025", user),
      await this.report("2026", user),
    ];
    const config = (
      await this.databases.live.execute(
        "SELECT opened_at,archive_boundary_confirmed FROM meti_live_config WHERE id=1",
      )
    ).rows[0];
    const pages = parts.flatMap((p) => p.pages);
    // Operator must confirm disjoint import pages; the time ranges must ALSO not overlap.
    const ranges = pages
      .map((p) => [p.dataset_start, p.dataset_end])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const disjoint = ranges.every(
      ([start, end], i) =>
        start &&
        end &&
        start <= end &&
        end < config.opened_at &&
        (!i || ranges[i - 1][1] < start),
    );
    const compatible =
      parts.every((p) => p.compatible) &&
      Number(config.archive_boundary_confirmed) === 1 &&
      disjoint;
    return {
      source: "all",
      compatible,
      metric_version: "submission-v1",
      sources: [...parts, live],
      summary: compatible
        ? {
            task_count:
              live.summary.task_count +
              parts.reduce((n, p) => n + p.summary.task_count, 0),
            object_count:
              live.summary.object_count +
              parts.reduce((n, p) => n + p.summary.object_count, 0),
          }
        : null,
      message: compatible
        ? "Compatible disjoint summaries combined"
        : "Combined totals withheld until archive mappings and non-overlap boundaries are verified",
    };
  }
}
