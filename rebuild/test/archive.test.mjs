import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./helpers.mjs";
import { importArchive } from "../scripts/archive-import.mjs";
import { ArchiveService } from "../src/archive.mjs";
import { csvRows } from "../scripts/csv.mjs";

const csvCell = (value) => '"' + value.replaceAll('"', '""') + '"';
test("raw import preserves 26 columns, blank and repeated headers, Unicode and text IDs; resumes after failure", async () => {
  const f = await fixture();
  try {
    const path = join(f.dir, "synthetic.csv"),
      headers = Array.from({ length: 26 }, (_, i) =>
        i === 1
          ? ""
          : i === 2
            ? "Repeated"
            : i === 3
              ? "Repeated"
              : `header${i + 1}`,
      );
    const rows = Array.from({ length: 25 }, (_, i) =>
      Array.from({ length: 26 }, (_, j) =>
        j === 0
          ? `0000${i}`
          : j === 1
            ? ""
            : j === 2
              ? "قيمة أصلية"
              : j === 3
                ? "line1\r\nline2"
                : j === 4
                  ? ' a, "quote" '
                  : `${i}-${j}`,
      ),
    );
    await writeFile(
      path,
      "\ufeff" +
        [headers, ...rows]
          .map((row) => row.map(csvCell).join(","))
          .join("\r\n") +
        "\r\n",
    );
    const options = {
      db: f.databases["2025"],
      path,
      source: "2025-page",
      pageName: "Synthetic 2025",
      expectedRows: 25,
      expectedColumns: 26,
      batchSize: 7,
    };
    await assert.rejects(
      () => importArchive({ ...options, failAfterBatches: 2 }),
      /Injected interruption/,
    );
    const result = await importArchive(options);
    assert.equal(result.resumed_from, 14);
    assert.equal(result.rows, 25);
    assert.equal(result.verified, true);
    const service = new ArchiveService(f.databases),
      page = await service.list(
        "2025",
        new URL("http://localhost/api/archive/2025?page=2025-page&limit=10"),
        f.users.manager,
      );
    assert.equal(page.columns.length, 26);
    assert.equal(page.columns[1].original_header, "");
    assert.equal(
      page.columns[2].original_header,
      page.columns[3].original_header,
    );
    assert.notEqual(
      page.columns[2].technical_name,
      page.columns[3].technical_name,
    );
    assert.equal(page.rows[0].c001, "00000");
    assert.equal(page.rows[0].c004, "line1\r\nline2");
    assert.equal(page.rows[0].c005, ' a, "quote" ');
    assert.equal(page.rows[0].source_row, 2);
    assert.equal(page.has_more, true);
    const again = await importArchive(options);
    assert.equal(again.already_imported, true);
    await assert.rejects(() =>
      importArchive({ ...options, source: "same-file-other-source" }),
    );
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace("00000", "00099"),
    );
    await assert.rejects(
      () => importArchive(options),
      /Existing source differs/,
    );
    assert.equal((await service.report("2025", f.users.manager)).summary, null);
  } finally {
    await f.close();
  }
});
test("20-column January mapping is explicit; all uses only compatible, disjoint summaries", async () => {
  const f = await fixture({ cutover: "2026-02-01T00:00:00.000Z" });
  try {
    const mapping = {
      metric_version: "submission-v1",
      row_semantics: "one-row-per-submission",
      timestamp_format: "iso8601",
      object_count: "c002",
      occurred_at: "c001",
    };
    for (const year of ["2025", "2026"]) {
      const width = year === "2025" ? 26 : 20,
        path = join(f.dir, `${year}.csv`),
        headers = Array.from({ length: width }, (_, i) =>
          i < 2 ? "Duplicate" : "",
        );
      const rows = Array.from({ length: 4 }, (_, i) => [
        `${year}-01-0${i + 1}T12:00:00Z`,
        String(i + 1),
        ...Array(width - 2).fill("0007"),
      ]);
      await writeFile(
        path,
        [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n"),
      );
      await importArchive({
        db: f.databases[year],
        path,
        source: `page-${year}`,
        pageName: year,
        expectedRows: 4,
        expectedColumns: width,
        mapping,
      });
    }
    const svc = new ArchiveService(f.databases),
      live = { source: "new", summary: { task_count: 3, object_count: 9 } };
    assert.equal((await svc.all(live, f.users.manager)).compatible, false);
    await f.databases.live.execute(
      "UPDATE meti_live_config SET archive_boundary_confirmed=1 WHERE id=1",
    );
    const all = await svc.all(live, f.users.manager);
    assert.equal(all.compatible, true);
    assert.deepEqual(all.summary, { task_count: 11, object_count: 29 });
    await f.databases["2026"].execute(
      "UPDATE meti_archive_sources SET dataset_end='2026-03-01T00:00:00.000Z'",
    );
    assert.equal((await svc.all(live, f.users.manager)).summary, null);
  } finally {
    await f.close();
  }
});
test("CSV parser rejects malformed quotes; trailing empty cells and embedded LF survive", async () => {
  const f = await fixture();
  try {
    const path = join(f.dir, "synthetic.csv");
    await writeFile(path, 'A,A,,\n001,"a\nb",,\n');
    const rows = [];
    for await (const row of csvRows(path)) rows.push(row);
    assert.deepEqual(rows, [
      ["A", "A", "", ""],
      ["001", "a\nb", "", ""],
    ]);
    await writeFile(path, 'A\n"unfinished');
    await assert.rejects(async () => {
      for await (const _ of csvRows(path)) {
      }
    });
  } finally {
    await f.close();
  }
});
