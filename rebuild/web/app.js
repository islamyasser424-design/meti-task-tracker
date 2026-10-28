import { Poller } from "./poller.js";
import { parseTaskLink } from "./task-link.js";
const $ = (id) => document.getElementById(id),
  number = new Intl.NumberFormat("en-US");
let user = null,
  csrf = "",
  version = "",
  changesCursor = 0,
  olderCursor = null,
  source = "new",
  records = new Map(),
  summaryVersion = 0,
  pending = null,
  saving = false,
  syncing = false,
  baselineReady = false,
  sessionGeneration = 0;
const pendingKey = "meti.pending.v1";
try {
  pending = JSON.parse(sessionStorage.getItem(pendingKey) || "null");
} catch {
  sessionStorage.removeItem(pendingKey);
}
const channel =
  "BroadcastChannel" in window
    ? new BroadcastChannel("meti-invalidation-v1")
    : null;
function notice(text, error = false) {
  $("notice").textContent = text;
  $("notice").classList.toggle("error", error);
  $("notice").hidden = !text;
}
function connected(text, offline = false) {
  $("connectionStatus").textContent = text;
  $("connectionDot").classList.toggle("offline", offline);
}
async function api(path, options = {}) {
  const generation = sessionGeneration;
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body
        ? { "Content-Type": "application/json", "X-CSRF-Token": csrf }
        : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (generation !== sessionGeneration) {
    const error = new Error("Session changed");
    error.code = "session_changed";
    throw error;
  }
  if (!response.ok) {
    const e = new Error(data.message || data.error || "تعذر إتمام الطلب");
    e.code = data.error;
    e.status = response.status;
    e.retryAfterMs = Number(response.headers.get("Retry-After") || 0) * 1000;
    if (response.status === 401 && user) showLogin();
    throw e;
  }
  return data;
}
function showLogin() {
  sessionGeneration++;
  user = null;
  csrf = "";
  poller.stop();
  $("workspace").hidden = true;
  $("loginView").hidden = false;
  $("loginForm").elements.password.value = "";
}
function setSummary(s) {
  if (!s || Number(s.version) < summaryVersion) return;
  summaryVersion = Number(s.version || 0);
  $("taskCount").textContent = number.format(s.task_count);
  $("objectCount").textContent = number.format(s.object_count);
}
function syncTime() {
  const now = new Date();
  $("lastSync").textContent = now.toLocaleTimeString("en-GB", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  connected("متصل · متابعة التغييرات");
}
function cell(text, className) {
  const td = document.createElement("td");
  td.textContent = text ?? "";
  if (className) td.className = className;
  return td;
}
function head(titles) {
  $("tableHead").replaceChildren();
  const tr = document.createElement("tr");
  for (const title of titles) {
    const th = document.createElement("th");
    th.textContent = title;
    tr.append(th);
  }
  $("tableHead").append(tr);
}
function renderLive() {
  head(["Task ID / Queue", "المسجّل", "النوع", "العناصر", "وقت التسجيل"]);
  $("tableBody").replaceChildren();
  const tasks = [...records.values()]
    .sort((a, b) => Number(b.seq) - Number(a.seq))
    .slice(0, 100);
  records = new Map(tasks.map((t) => [t.id, t]));
  for (const task of tasks) {
    const tr = document.createElement("tr"),
      first = cell("");
    const link = document.createElement("a");
    link.textContent = task.task_id;
    link.href = task.task_link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    first.append(link);
    const queue = document.createElement("small");
    queue.className = "cell-sub";
    queue.textContent = task.queue_name;
    first.append(queue);
    tr.append(first, cell(task.labeler_name));
    const pass = cell(""),
      badge = document.createElement("span");
    badge.textContent = task.pass;
    badge.className = "pass-badge" + (task.pass === "QA" ? " qa" : "");
    pass.append(badge);
    tr.append(
      pass,
      cell(number.format(task.object_count)),
      cell(
        new Date(task.created_at).toLocaleString("ar-EG", {
          timeZone: "Africa/Cairo",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      ),
    );
    $("tableBody").append(tr);
  }
  $("loadedCount").textContent = `${tasks.length} معروضة`;
  $("emptyState").hidden = tasks.length > 0;
  $("tableWrap").hidden = tasks.length === 0;
  $("older").disabled = !olderCursor;
}
async function initial() {
  const data = await api("/api/tasks?source=new&limit=50");
  const rows = new Map(data.tasks.map((t) => [t.id, t]));
  for (const t of records.values())
    if (Number(t.seq) > data.changes_cursor) rows.set(t.id, t);
  records = rows;
  changesCursor = data.changes_cursor;
  olderCursor = data.cursor;
  version = data.version;
  baselineReady = true;
  if (source === "new") {
    setSummary(data.summary);
    renderLive();
  }
  syncTime();
}
async function syncChanges() {
  if (!user || syncing || document.hidden) return;
  syncing = true;
  try {
    if (!baselineReady) {
      await initial();
      return;
    }
    const marker = await api("/api/tasks/version");
    if (marker.version === version) {
      syncTime();
      return;
    }
    // Bounded catch-up; cursor only advances after a page is applied. If more
    // than 2,000 changes accumulated, subsequent ticks continue the same cursor.
    for (let i = 0; i < 20; i++) {
      const data = await api(
        `/api/tasks/changes?cursor=${changesCursor}&limit=100`,
      );
      for (const task of data.tasks) records.set(task.id, task);
      records = new Map(
        [...records.values()]
          .sort((a, b) => Number(b.seq) - Number(a.seq))
          .slice(0, 100)
          .map((t) => [t.id, t]),
      );
      changesCursor = data.cursor;
      if (source === "new") {
        setSummary(data.summary);
        renderLive();
      }
      if (!data.has_more) {
        version = data.version;
        break;
      }
    }
    syncTime();
  } catch (error) {
    connected("الاتصال متقطع · ستتم إعادة المحاولة", true);
    throw error;
  } finally {
    syncing = false;
  }
}
const poller = new Poller(syncChanges);
function restorePending() {
  const own = pending && pending.owner_id === user?.id;
  if (own) {
    for (const [key, value] of Object.entries(pending.body)) {
      const el = $("taskForm").elements[key];
      if (el) el.value = value;
    }
  }
  $("taskFields").disabled = !!pending;
  $("saveTask").disabled = !!pending && !own;
  $("saveTask").textContent = own
    ? "إعادة محاولة نفس التسجيل"
    : "＋ حفظ المهمة";
  if (pending) {
    $("saveStatus").textContent = own
      ? "تسجيل بانتظار التأكيد. أعد المحاولة بنفس المفتاح."
      : "يوجد تسجيل معلّق لحساب آخر في هذا التبويب. سجّل الدخول بالحساب نفسه لتأكيده.";
    $("saveStatus").className = "save-status error";
  }
}
async function enter(data) {
  sessionGeneration++;
  user = data.user;
  csrf = data.csrf_token;
  summaryVersion = 0;
  version = "";
  source = "new";
  baselineReady = false;
  records = new Map();
  $("tableBody").replaceChildren();
  $("taskCount").textContent = "—";
  $("objectCount").textContent = "—";
  $("loadedCount").textContent = "0 معروضة";
  $("archivePages").hidden = true;
  $("loginView").hidden = true;
  $("workspace").hidden = false;
  $("userName").textContent = user.display_name;
  $("avatar").textContent = user.display_name.slice(0, 1);
  $("userRole").textContent = {
    operator: "مسجّل مهام",
    supervisor: "مشرف",
    admin: "مسؤول النظام",
  }[user.role];
  $("scopeNote").textContent =
    user.role === "operator"
      ? "تسجيلاتك في قاعدة البيانات الجديدة"
      : "تسجيلات الفريق في قاعدة البيانات الجديدة";
  document.querySelectorAll("[data-source]").forEach((b) => {
    b.hidden = b.dataset.source !== "new" && user.role === "operator";
    b.classList.toggle("selected", b.dataset.source === "new");
  });
  $("today").textContent = new Date().toLocaleDateString("ar-EG", {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  restorePending();
  try {
    await initial();
    notice("");
  } catch {
    notice("تعذر جلب المهام. ستتم إعادة المحاولة تلقائيًا.", true);
  }
  poller.start();
}
$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const btn = event.submitter;
  btn.disabled = true;
  $("loginError").textContent = "";
  try {
    const f = new FormData(event.target);
    await enter(
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: f.get("username"),
          password: f.get("password"),
        }),
      }),
    );
    event.target.elements.password.value = "";
  } catch (e) {
    $("loginError").textContent =
      e.status === 429
        ? "محاولات كثيرة. حاول لاحقًا."
        : "تعذر تسجيل الدخول. تحقق من بياناتك والاتصال.";
  } finally {
    btn.disabled = false;
  }
});
$("logout").addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
    showLogin();
  } catch {
    notice("تعذر تأكيد تسجيل الخروج. حاول مجددًا.", true);
  }
});
$("taskLink").addEventListener("change", () => {
  const fields = parseTaskLink($("taskLink").value);
  for (const [key, value] of Object.entries(fields))
    if (value && $("taskForm").elements[key])
      $("taskForm").elements[key].value = value;
});
$("taskForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (saving || !user) return;
  if (pending && pending.owner_id !== user.id) return;
  if (!pending) {
    const fields = Object.fromEntries(new FormData(event.target));
    fields.object_count = Number(fields.object_count);
    fields.occurred_at = new Date().toISOString();
    pending = { owner_id: user.id, key: crypto.randomUUID(), body: fields };
    try {
      sessionStorage.setItem(pendingKey, JSON.stringify(pending));
    } catch {
      pending = null;
      notice(
        "تعذر حفظ مفتاح إعادة المحاولة في هذا التبويب. اسمح بتخزين الجلسة أولًا.",
        true,
      );
      return;
    }
  }
  saving = true;
  restorePending();
  $("saveTask").disabled = true;
  $("saveStatus").textContent = "جارٍ حفظ المهمة…";
  $("saveStatus").className = "save-status";
  try {
    const data = await api("/api/tasks", {
      method: "POST",
      headers: { "Idempotency-Key": pending.key },
      body: JSON.stringify(pending.body),
    });
    if (!data.task?.id || !data.server_time)
      throw new Error("Missing commit confirmation");
    records.set(data.task.id, data.task);
    if (source === "new") {
      setSummary(data.summary);
      renderLive();
    }
    syncTime();
    pending = null;
    sessionStorage.removeItem(pendingKey);
    $("taskFields").disabled = false;
    event.target.reset();
    $("saveStatus").textContent =
      `تم تأكيد حفظ التسجيل #${data.task.id}${data.replayed ? " · تم تأكيد المحاولة السابقة" : ""}`;
    $("saveStatus").className = "save-status success";
    notice("تم حفظ المهمة بنجاح.");
    channel?.postMessage("refresh");
    // Do not move the catch-up cursor to this task: other users' changes may precede it.
  } catch (e) {
    if (
      [400, 415, 422].includes(e.status) ||
      e.code === "duplicate_submission"
    ) {
      pending = null;
      sessionStorage.removeItem(pendingKey);
      $("taskFields").disabled = false;
    }
    $("saveStatus").textContent = pending
      ? "لم يصل تأكيد الحفظ. أعد المحاولة بنفس التسجيل؛ لن يتكرر الحفظ."
      : `لم يُحفظ التسجيل: ${e.message}`;
    $("saveStatus").className = "save-status error";
  } finally {
    saving = false;
    $("saveTask").disabled = false;
    $("saveTask").textContent = pending
      ? "إعادة محاولة نفس التسجيل"
      : "＋ حفظ المهمة";
  }
});
$("newest").addEventListener("click", async () => {
  try {
    await chooseSource(source);
  } catch {
    notice("تعذر تحديث العرض.", true);
  }
});
$("liveNav").addEventListener("click", () =>
  chooseSource("new").catch(() => notice("تعذر جلب المهام.", true)),
);
$("older").addEventListener("click", async () => {
  if (!olderCursor || source !== "new") return;
  $("older").disabled = true;
  try {
    const data = await api(
      `/api/tasks?source=new&cursor=${olderCursor}&limit=50`,
    );
    records = new Map(data.tasks.map((t) => [t.id, t]));
    olderCursor = data.cursor;
    setSummary(data.summary);
    renderLive();
  } catch {
    notice("تعذر جلب الصفحة التالية.", true);
  } finally {
    $("older").disabled = !olderCursor;
  }
});
async function archivePage(year, page, cursor = 0) {
  const data = await api(
    `/api/archive/${year}?page=${encodeURIComponent(page)}&cursor=${cursor}&limit=50`,
  );
  head([
    "صف المصدر",
    ...data.columns.map(
      (c) => `${c.original_header || "بلا عنوان"} · ${c.technical_name}`,
    ),
  ]);
  $("tableBody").replaceChildren();
  for (const row of data.rows) {
    const tr = document.createElement("tr");
    tr.append(cell(row.source_row));
    for (const c of data.columns) tr.append(cell(row[c.technical_name]));
    $("tableBody").append(tr);
  }
  $("tableWrap").hidden = false;
  $("loadedCount").textContent = `${data.rows.length} معروضة`;
  $("archivePages").replaceChildren();
  if (data.has_more) {
    const btn = document.createElement("button");
    btn.textContent = "الصفحة التالية ←";
    btn.onclick = () =>
      archivePage(year, page, data.cursor).catch(() =>
        notice("تعذر جلب صفحة الأرشيف.", true),
      );
    $("archivePages").append(btn);
  }
}
async function chooseSource(next) {
  source = next;
  document
    .querySelectorAll("[data-source]")
    .forEach((b) =>
      b.classList.toggle("selected", b.dataset.source === source),
    );
  $("archivePages").hidden = true;
  $("archivePages").replaceChildren();
  $("emptyState").hidden = true;
  $("older").disabled = true;
  if (source === "new") {
    await initial();
    notice("");
    return;
  }
  const data = await api(`/api/reports/summary?source=${source}`);
  $("taskCount").textContent = data.summary
    ? number.format(data.summary.task_count)
    : "—";
  $("objectCount").textContent = data.summary
    ? number.format(data.summary.object_count)
    : "—";
  $("tableWrap").hidden = true;
  $("loadedCount").textContent = "أرشيف";
  $("archivePages").hidden = false;
  const info = document.createElement("p");
  info.textContent = data.compatible
    ? "ملخص متوافق ومحسوب مسبقًا."
    : "الملخص الموحّد ينتظر اعتماد معاني الأعمدة وحدود المصادر. لا يتم تخمينها.";
  $("archivePages").append(info);
  if (source !== "all") {
    const pages = await api(`/api/archive/${source}`);
    if (!pages.pages.length) {
      const p = document.createElement("p");
      p.textContent = "لم تُستورد صفحات إلى هذا المصدر بعد.";
      $("archivePages").append(p);
    }
    for (const page of pages.pages) {
      const btn = document.createElement("button");
      btn.textContent = `${page.page_name} · ${number.format(page.imported_rows)} صف`;
      btn.disabled = page.status !== "complete";
      btn.onclick = () =>
        archivePage(source, page.source_id).catch(() =>
          notice("تعذر عرض الأرشيف.", true),
        );
      $("archivePages").append(btn);
    }
  }
}
$("sources").addEventListener("click", (event) => {
  const source = event.target.dataset.source;
  if (source)
    chooseSource(source).catch(() =>
      notice("تعذر جلب المصدر. تحقق من إعداده وصلاحياتك.", true),
    );
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) poller.schedule(0);
  else poller.wake();
});
window.addEventListener("online", () => poller.wake());
channel?.addEventListener("message", () => poller.wake());
api("/api/me")
  .then(enter)
  .catch(() => showLogin())
  .finally(() => {
    $("loginForm").querySelector("button").disabled = false;
  });
