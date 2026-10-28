import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";
import { fixture } from "./helpers.mjs";
import { startHrana } from "./hrana-server.mjs";
export async function runtime() {
  const f = await fixture(),
    hrana = await startHrana(f.paths);
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: new URL("../.build/worker.js", import.meta.url).pathname,
      compatibilityDate: "2026-10-28",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: {
        METI: { className: "MetiCoordinator", useSQLite: true },
      },
      bindings: {
        APP_ENV: "test",
        AUTH_PEPPER: f.env.AUTH_PEPPER,
        LIVE_DB_URL: `${hrana.origin}/live/`,
        LIVE_DB_TOKEN: "local-fixture",
        ARCHIVE_2025_URL: `${hrana.origin}/2025/`,
        ARCHIVE_2025_TOKEN: "local-fixture",
        ARCHIVE_2026_URL: `${hrana.origin}/2026/`,
        ARCHIVE_2026_TOKEN: "local-fixture",
      },
      serviceBindings: {
        ASSETS: async (request) => {
          const path = new URL(request.url).pathname;
          if (
            ![
              "/",
              "/index.html",
              "/app.css",
              "/app.js",
              "/poller.js",
              "/task-link.js",
            ].includes(path)
          )
            return new Response("Not found", { status: 404 });
          const contents = await readFile(
            new URL(
              `../web/${path === "/" ? "index.html" : path.slice(1)}`,
              import.meta.url,
            ),
          );
          return new Response(contents, {
            headers: {
              "Content-Type": path.endsWith(".css")
                ? "text/css"
                : path.endsWith(".js")
                  ? "application/javascript"
                  : "text/html; charset=utf-8",
            },
          });
        },
      },
    }),
  );
  const url = await mf.ready;
  return {
    f,
    mf,
    hrana,
    origin: url.origin,
    close: async () => {
      await mf.dispose();
      await hrana.close();
      await f.close();
    },
  };
}
