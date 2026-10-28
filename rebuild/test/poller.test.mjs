import test from "node:test";
import assert from "node:assert/strict";
import { Poller } from "../web/poller.js";
import { parseTaskLink } from "../web/task-link.js";
test("polling pauses when hidden and backs off with Retry-After; reconnect resumes", async () => {
  let hidden = false,
    scheduled = [],
    cleared = [],
    calls = 0,
    fail = false;
  const p = new Poller(
    async () => {
      calls++;
      if (fail) throw { retryAfterMs: 3600000 };
    },
    {
      isHidden: () => hidden,
      setTimer: (cb, ms) => {
        scheduled.push({ cb, ms });
        return scheduled.length;
      },
      clearTimer: (id) => cleared.push(id),
      random: () => 0,
    },
  );
  p.start();
  assert.equal(scheduled.at(-1).ms, 15000);
  await p.tick();
  assert.equal(calls, 1);
  hidden = true;
  p.schedule(0);
  const n = scheduled.length;
  await p.tick();
  assert.equal(calls, 1);
  assert.equal(scheduled.length, n);
  hidden = false;
  fail = true;
  p.wake();
  assert.equal(scheduled.at(-1).ms, 0);
  await p.tick();
  assert.equal(scheduled.at(-1).ms, 3600000);
  fail = false;
  await p.tick();
  assert.equal(scheduled.at(-1).ms, 15000);
  p.stop();
  const count = calls;
  await p.tick();
  assert.equal(calls, count);
  assert.ok(cleared.length);
});
test("existing URL stage/pass rules retain leading zeros and known queue exceptions", () => {
  const p = parseTaskLink(
    "https://labeling.robot.car/#/do/SellIvandarQA/queue/sc3_full_scene_highway_lanes_first_lidar_labeling/id/001234567890",
  );
  assert.equal(p.task_id, "001234567890");
  assert.equal(p.pass, "QA");
  assert.equal(p.modality, "Lane Line");
  assert.equal(p.stage, "Lidar Stage");
  assert.deepEqual(parseTaskLink("javascript:alert(1)"), {});
});
