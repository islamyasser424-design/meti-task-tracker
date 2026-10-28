import { args, loadEnv, fail } from "./common.mjs";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
export function evaluateUsage(
  usage,
  {
    readLimit = 500000000,
    writeLimit = 10000000,
    storageLimit = 5000000000,
    threshold = 0.7,
  } = {},
) {
  const limits = {
    rows_read: readLimit,
    rows_written: writeLimit,
    storage_bytes: storageLimit,
  };
  return Object.entries(limits).map(([metric, limit]) => ({
    metric,
    used: Number(usage[metric]),
    limit,
    fraction: Number(usage[metric]) / limit,
    alert: Number(usage[metric]) / limit >= threshold,
  }));
}
export async function orgUsage({ org, token, fetcher = fetch }) {
  if (!/^[a-zA-Z0-9_-]+$/.test(org) || !token)
    throw new Error("Missing Turso management credentials");
  const response = await fetcher(
    `https://api.turso.tech/v1/organizations/${encodeURIComponent(org)}/usage`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error("Usage API unavailable");
  const body = await response.json(),
    usage = body.organization?.usage;
  if (
    !usage ||
    !["rows_read", "rows_written", "storage_bytes"].every((k) =>
      Number.isFinite(usage[k]),
    )
  )
    throw new Error("Unrecognized usage API response");
  return usage;
}
if (import.meta.url === new URL(process.argv[1], "file:").href) {
  const a = args({
    env: { type: "string" },
    output: { type: "string" },
    threshold: { type: "string", default: "0.7" },
  });
  try {
    await loadEnv(a.env);
    const threshold = Number(a.threshold);
    if (!(threshold > 0 && threshold <= 1))
      throw new Error("Invalid threshold");
    const usage = await orgUsage({
      org: process.env.TURSO_ORG,
      token: process.env.TURSO_MANAGEMENT_TOKEN,
    });
    const result = {
      measured_at: new Date().toISOString(),
      billing_scope:
        "entire Turso organization; includes ALL databases and other workloads",
      metrics: evaluateUsage(usage, { threshold }),
    };
    if (a.output) {
      await mkdir(dirname(a.output), { recursive: true });
      await writeFile(a.output, JSON.stringify(result, null, 2), {
        mode: 0o600,
      });
    }
    console.log(JSON.stringify(result));
    if (result.metrics.some((m) => m.alert)) {
      console.error(
        "::error::METI Turso usage threshold reached. Review usage and capacity before the quota blocks queries.",
      );
      process.exitCode = 2;
    }
  } catch (e) {
    fail(e);
  }
}
