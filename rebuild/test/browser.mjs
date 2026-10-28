import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { runtime } from "./runtime.mjs";
const r = await runtime();
let browser;
const diagnosticPages = [];
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.METI_BROWSER_EXECUTABLE
      ? {
          executablePath: process.env.METI_BROWSER_EXECUTABLE,
          args: JSON.parse(process.env.METI_BROWSER_ARGS || "[]"),
        }
      : { channel: "chromium" }),
  });
  const errors = [];
  const context = await browser.newContext({
      viewport: { width: 1512, height: 1050 },
    }),
    managerContext = await browser.newContext({
      viewport: { width: 1512, height: 1050 },
    });
  const page = await context.newPage(),
    manager = await managerContext.newPage();
  diagnosticPages.push(page, manager);
  for (const p of [page, manager])
    p.on("pageerror", (error) => errors.push(error.message));
  async function login(p, username) {
    await p.goto(r.origin);
    await p.locator("[name=username]").fill(username);
    await p.locator("[name=password]").fill(r.f.password);
    await p.getByRole("button", { name: /تسجيل الدخول/ }).click();
    await p.locator("#workspace").waitFor({ state: "visible" });
    await p.waitForFunction(
      () => document.getElementById("taskCount").textContent === "0",
    );
  }
  await login(page, "alpha");
  await login(manager, "manager");
  await page
    .locator("#taskLink")
    .fill(
      "https://labeling.robot.car/#/do/SellIvandar/queue/synthetic/id/001234567890",
    );
  await page.locator("#taskLink").blur();
  await page.locator("[name=shift]").selectOption("Morning");
  await page.locator("[name=unit]").fill("Unit A");
  await page.locator("[name=pc_no]").fill("01");
  await page.locator("[name=object_count]").fill("12");
  // Drop the response AFTER the real Worker/SQLite transaction commits.
  let dropped = false;
  await page.route("**/api/tasks", async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.locator("#saveTask").click();
  await page.waitForFunction(
    () =>
      !document.getElementById("saveTask").disabled &&
      document.getElementById("saveTask").textContent.includes("إعادة محاولة"),
  );
  assert.equal(await page.locator("#taskLink").isDisabled(), true);
  assert.equal(await page.locator("#taskCount").textContent(), "0");
  await page.reload();
  await page.locator("#workspace").waitFor({ state: "visible" });
  await page.waitForFunction(() =>
    document.getElementById("saveTask").textContent.includes("إعادة محاولة"),
  );
  await page.locator("#saveTask").click();
  await page.waitForFunction(() =>
    document.getElementById("saveStatus").classList.contains("success"),
  );
  assert.equal(await page.locator("#taskCount").textContent(), "1");
  assert.equal(await page.locator("#objectCount").textContent(), "12");
  assert.equal(await page.locator("#tableBody tr").count(), 1);
  // Offline second user keeps its cursor; reconnect catches up from the log.
  await managerContext.setOffline(true);
  assert.equal(await manager.locator("#taskCount").textContent(), "0");
  await managerContext.setOffline(false);
  await manager.evaluate(() => window.dispatchEvent(new Event("online")));
  await manager.waitForFunction(
    () => document.getElementById("taskCount").textContent === "1",
  );
  // Second confirmed task, second user learns through the 15-second version poll.
  await page
    .locator("#taskLink")
    .fill(
      "https://labeling.robot.car/#/do/SellIvandarQA/queue/synthetic/id/001234567890",
    );
  await page.locator("#taskLink").blur();
  await page.locator("[name=shift]").selectOption("Morning");
  await page.locator("[name=unit]").fill("Unit A");
  await page.locator("[name=pc_no]").fill("01");
  await page.locator("[name=object_count]").fill("5");
  const start = Date.now();
  await page.locator("#saveTask").click();
  await page.waitForFunction(
    () => document.getElementById("taskCount").textContent === "2",
  );
  await manager.waitForFunction(
    () => document.getElementById("taskCount").textContent === "2",
    null,
    { timeout: 22000 },
  );
  const propagation = Date.now() - start;
  assert.equal(await manager.locator("#objectCount").textContent(), "17");
  // Role-restricted archive summary and responsive layout.
  assert.equal(await page.locator('[data-source="2025"]').isVisible(), false);
  assert.equal(await manager.locator('[data-source="2025"]').isVisible(), true);
  await mkdir(new URL("../.local/screenshots/", import.meta.url), {
    recursive: true,
  });
  await manager.screenshot({
    path: new URL(
      "../.local/screenshots/dashboard-desktop.png",
      import.meta.url,
    ).pathname,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: new URL("../.local/screenshots/dashboard-mobile.png", import.meta.url)
      .pathname,
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  const count = (
    await r.f.databases.live.execute("SELECT COUNT(*) n FROM meti_tasks")
  ).rows[0].n;
  assert.equal(count, 2);
  console.log(
    JSON.stringify(
      {
        passed: true,
        runtime:
          "Cloudflare workerd/Miniflare + official libSQL HTTP client + real SQLite",
        tasks: count,
        objects: 17,
        lost_response_retry: "passed",
        second_user_poll_latency_ms: propagation,
        browser_errors: errors.length,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await mkdir(new URL("../.local/screenshots/", import.meta.url), {
    recursive: true,
  });
  for (let i = 0; i < diagnosticPages.length; i++) {
    await diagnosticPages[i]
      .screenshot({
        path: new URL(`../.local/screenshots/failure-${i}.png`, import.meta.url)
          .pathname,
        fullPage: true,
      })
      .catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  await r.close();
}
