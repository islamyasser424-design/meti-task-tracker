import assert from "node:assert/strict";
import { SourceTextModule } from "node:vm";
import { readFile } from "node:fs/promises";
import { JSDOM, CookieJar, VirtualConsole } from "jsdom";
import { runtime } from "./runtime.mjs";

const r = await runtime(),
  windows = [];
const until = async (check) => {
  for (let i = 0; i < 500; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("DOM integration timeout");
};
try {
  async function client(username) {
    const jar = new CookieJar(),
      logs = [];
    const vc = new VirtualConsole();
    vc.on("jsdomError", (e) => logs.push(e.message));
    const dom = new JSDOM(
      await readFile(new URL("../web/index.html", import.meta.url), "utf8"),
      {
        url: r.origin,
        pretendToBeVisual: true,
        runScripts: "outside-only",
        virtualConsole: vc,
      },
    );
    const w = dom.window;
    windows.push(w);
    let loseNext = false;
    w.fetch = async (path, options = {}) => {
      const cookie = await jar.getCookieString(r.origin),
        url = new URL(path, r.origin);
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          ...(cookie ? { Cookie: cookie } : {}),
          ...(options.method && options.method !== "GET"
            ? { Origin: r.origin }
            : {}),
        },
      });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) await jar.setCookie(setCookie, r.origin);
      if (path === "/api/tasks" && options.method === "POST" && loseNext) {
        loseNext = false;
        await response.text();
        throw new TypeError("Synthetic lost response");
      }
      return response;
    };
    const context = dom.getInternalVMContext(),
      modules = new Map();
    async function load(name) {
      if (modules.has(name)) return modules.get(name);
      const m = new SourceTextModule(
        await readFile(new URL(`../web/${name}`, import.meta.url), "utf8"),
        { context, identifier: name },
      );
      modules.set(name, m);
      await m.link((spec) => load(spec.replace("./", "")));
      return m;
    }
    await (await load("app.js")).evaluate();
    await until(
      () =>
        !w.document.getElementById("loginView").hidden &&
        !w.document.querySelector("#loginForm button").disabled,
    );
    const form = w.document.getElementById("loginForm");
    form.elements.username.value = username;
    form.elements.password.value = r.f.password;
    form.dispatchEvent(
      new w.SubmitEvent("submit", {
        bubbles: true,
        cancelable: true,
        submitter: form.querySelector("button"),
      }),
    );
    await until(
      () =>
        !w.document.getElementById("workspace").hidden &&
        w.document.getElementById("taskCount").textContent === "0",
    );
    return {
      w,
      logs,
      lose() {
        loseNext = true;
      },
      el: (id) => w.document.getElementById(id),
    };
  }
  const operator = await client("alpha"),
    manager = await client("manager");
  function fill(pass, objects) {
    const form = operator.el("taskForm"),
      values = {
        task_link: `https://labeling.robot.car/#/do/SellIvandar${pass === "QA" ? "QA" : ""}/queue/synthetic/id/001234567890`,
        task_id: "001234567890",
        stage: "Lidar Stage",
        shift: "Morning",
        unit: "Unit A",
        pc_no: "01",
        pass,
        modality: "Lidar",
        queue_name: "synthetic",
        object_count: String(objects),
        qtc_name: "",
      };
    for (const [k, v] of Object.entries(values)) form.elements[k].value = v;
  }
  function submit() {
    operator.el("taskForm").dispatchEvent(
      new operator.w.SubmitEvent("submit", {
        bubbles: true,
        cancelable: true,
        submitter: operator.el("saveTask"),
      }),
    );
  }
  fill("FP", 12);
  operator.lose();
  submit();
  await until(
    () =>
      !operator.el("saveTask").disabled &&
      operator.el("saveTask").textContent.includes("إعادة محاولة"),
  );
  assert.equal(operator.el("taskCount").textContent, "0");
  assert.equal(operator.el("taskFields").disabled, true);
  const pending = JSON.parse(
    operator.w.sessionStorage.getItem("meti.pending.v1"),
  );
  assert.ok(pending.key);
  assert.equal(pending.body.task_id, "001234567890");
  submit();
  await until(() => operator.el("saveStatus").classList.contains("success"));
  assert.equal(operator.el("taskCount").textContent, "1");
  assert.equal(operator.el("objectCount").textContent, "12");
  assert.equal(operator.el("tableBody").children.length, 1);
  assert.equal(operator.w.sessionStorage.getItem("meti.pending.v1"), null);
  manager.w.dispatchEvent(new manager.w.Event("online"));
  await until(() => manager.el("taskCount").textContent === "1");
  fill("QA", 5);
  submit();
  await until(() => operator.el("taskCount").textContent === "2");
  manager.w.dispatchEvent(new manager.w.Event("online"));
  await until(() => manager.el("taskCount").textContent === "2");
  assert.equal(manager.el("objectCount").textContent, "17");
  assert.equal(manager.el("tableBody").children.length, 2);
  assert.equal(
    operator.w.document.querySelector('[data-source="2025"]').hidden,
    true,
  );
  assert.equal(
    manager.w.document.querySelector('[data-source="2025"]').hidden,
    false,
  );
  assert.deepEqual([...operator.logs, ...manager.logs], []);
  console.log(
    JSON.stringify(
      {
        passed: true,
        environment:
          "real application DOM (jsdom) + workerd + DO SQLite + official libSQL HTTP + SQLite",
        tasks: 2,
        objects: 17,
        lost_commit_response_retry: true,
        confirmed_ui_update: true,
        second_user_cursor_catchup: true,
        role_visibility: true,
        visual_layout_verified: false,
      },
      null,
      2,
    ),
  );
} finally {
  for (const w of windows) w.close();
  await r.close();
}
