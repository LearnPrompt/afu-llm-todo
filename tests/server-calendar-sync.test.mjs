import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { request } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("scheduleTopic keeps Markdown saved when external calendar creation fails", { timeout: 15_000 }, async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(tmpdir(), "afu-calendar-sync-"));
  const vaultRoot = path.join(tempRoot, "vault");
  const topicDir = path.join(vaultRoot, "topics");
  const configPath = path.join(tempRoot, "topic-planner.config.json");
  const fakeLarkCliPath = path.join(tempRoot, "lark-cli");
  const topicPath = path.join(topicDir, "calendar-failure.md");

  await fs.mkdir(topicDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({
    workspaceMode: "obsidian",
    vaultRoot,
    topicDir: "topics",
    inboxDir: "inbox",
    archiveDir: "archive",
    calendarProvider: "none",
  }, null, 2), "utf8");
  await fs.writeFile(topicPath, [
    "---",
    "topic_id: topic-calendar-failure",
    "status: active",
    "stage: 待排期",
    "priority: ⭐⭐⭐",
    "created: 2026-07-01",
    "updated: 2026-07-01",
    "---",
    "# 外部日历失败回归",
    "",
    "即使外部日历失败，本地 Markdown 也必须保存。",
    "",
  ].join("\n"), "utf8");
  await fs.writeFile(fakeLarkCliPath, [
    "#!/bin/sh",
    "if [ \"$1\" = \"--version\" ]; then",
    "  printf '%s\\n' '1.0.0-test'",
    "  exit 0",
    "fi",
    "if [ \"$1\" = \"auth\" ] && [ \"$2\" = \"status\" ]; then",
    "  printf '%s\\n' '{\"identities\":{\"user\":{\"tokenStatus\":\"valid\",\"openId\":\"u-test\",\"userName\":\"Tester\",\"expiresAt\":\"2099-01-01T00:00:00Z\"}}}'",
    "  exit 0",
    "fi",
    "if [ \"$1\" = \"calendar\" ] && [ \"$2\" = \"calendars\" ] && [ \"$3\" = \"primary\" ]; then",
    "  printf '%s\\n' '{\"data\":{\"calendars\":[{\"calendar\":{\"calendar_id\":\"cal_primary\",\"summary\":\"Primary\"}}]}}'",
    "  exit 0",
    "fi",
    "if [ \"$1\" = \"calendar\" ] && [ \"$2\" = \"events\" ]; then",
    "  printf '%s\\n' 'forced calendar create failure' >&2",
    "  exit 42",
    "fi",
    "printf '%s\\n' \"unexpected lark-cli args: $*\" >&2",
    "exit 43",
    "",
  ].join("\n"), "utf8");
  await fs.chmod(fakeLarkCliPath, 0o755);

  const port = await getFreePort();
  const server = spawn(process.execPath, ["server.mjs"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempRoot,
      LARK_CLI_PATH: fakeLarkCliPath,
      PATH: tempRoot,
      PORT: String(port),
      TOPIC_PLANNER_CONFIG: configPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = collectChildOutput(server);
  t.after(async () => {
    await stopChild(server);
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await waitForHealth(server, port, logs);
  const response = await requestJson(port, "/api/topics/schedule", {
    path: "topics/calendar-failure.md",
    scheduledDate: "2026-07-10",
    scheduledStart: "10:00",
    scheduledEnd: "11:00",
    calendarProvider: "lark",
  });

  assert.equal(response.statusCode, 200, logs.text());
  assert.equal(response.body.ok, true);
  assert.equal(response.body.topic.calendarSyncStatus, "同步失败：forced calendar create failure");

  const saved = await fs.readFile(topicPath, "utf8");
  assert.match(saved, /scheduled_date: 2026-07-10/);
  assert.match(saved, /scheduled_start: "10:00"/);
  assert.match(saved, /scheduled_end: "11:00"/);
  assert.match(saved, /calendar_provider: lark/);
  assert.match(saved, /calendar_sync_status: "同步失败：forced calendar create failure"/);
});

test("scheduleTopic sends local planner timezone to Lark calendar", { timeout: 15_000 }, async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(tmpdir(), "afu-calendar-timezone-"));
  const vaultRoot = path.join(tempRoot, "vault");
  const topicDir = path.join(vaultRoot, "topics");
  const configPath = path.join(tempRoot, "topic-planner.config.json");
  const fakeLarkCliPath = path.join(tempRoot, "lark-cli");
  const capturePath = path.join(tempRoot, "lark-event-data.json");
  const captureParamsPath = path.join(tempRoot, "lark-event-params.json");
  const topicPath = path.join(topicDir, "timezone-check.md");

  await fs.mkdir(topicDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({
    workspaceMode: "obsidian",
    vaultRoot,
    topicDir: "topics",
    inboxDir: "inbox",
    archiveDir: "archive",
    calendarProvider: "lark",
    larkCalendarId: "cal_selected",
    larkCalendarName: "Selected",
  }, null, 2), "utf8");
  await fs.writeFile(topicPath, [
    "---",
    "topic_id: topic-timezone-check",
    "status: active",
    "stage: 待排期",
    "priority: ⭐⭐⭐",
    "created: 2026-07-01",
    "updated: 2026-07-01",
    "---",
    "# 本地时区同步检查",
    "",
  ].join("\n"), "utf8");
  await fs.writeFile(fakeLarkCliPath, [
    "#!/bin/sh",
    "if [ \"$1\" = \"--version\" ]; then",
    "  printf '%s\\n' '1.0.0-test'",
    "  exit 0",
    "fi",
    "if [ \"$1\" = \"auth\" ] && [ \"$2\" = \"status\" ]; then",
    "  printf '%s\\n' '{\"identities\":{\"user\":{\"tokenStatus\":\"valid\",\"openId\":\"u-test\",\"userName\":\"Tester\",\"expiresAt\":\"2099-01-01T00:00:00Z\"}}}'",
    "  exit 0",
    "fi",
    "if [ \"$1\" = \"calendar\" ] && [ \"$2\" = \"calendars\" ] && [ \"$3\" = \"primary\" ]; then",
    "  printf '%s\\n' '{\"data\":{\"calendars\":[{\"calendar\":{\"calendar_id\":\"cal_primary\",\"summary\":\"Primary\"}}]}}'",
    "  exit 0",
    "fi",
    "if [ \"$1\" = \"calendar\" ] && [ \"$2\" = \"events\" ] && [ \"$3\" = \"create\" ]; then",
    "  while [ \"$#\" -gt 0 ]; do",
    "    if [ \"$1\" = \"--params\" ]; then",
    "      shift",
    "      printf '%s' \"$1\" > \"$LARK_CLI_CAPTURE_PARAMS_PATH\"",
    "    fi",
    "    if [ \"$1\" = \"--data\" ]; then",
    "      shift",
    "      printf '%s' \"$1\" > \"$LARK_CLI_CAPTURE_PATH\"",
    "    fi",
    "    shift",
    "  done",
    "  printf '%s\\n' '{\"data\":{\"event\":{\"event_id\":\"evt_timezone_0\"}}}'",
    "  exit 0",
    "fi",
    "printf '%s\\n' \"unexpected lark-cli args: $*\" >&2",
    "exit 43",
    "",
  ].join("\n"), "utf8");
  await fs.chmod(fakeLarkCliPath, 0o755);

  const port = await getFreePort();
  const server = spawn(process.execPath, ["server.mjs"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempRoot,
      LARK_CLI_CAPTURE_PATH: capturePath,
      LARK_CLI_CAPTURE_PARAMS_PATH: captureParamsPath,
      LARK_CLI_PATH: fakeLarkCliPath,
      PATH: tempRoot,
      PORT: String(port),
      TOPIC_PLANNER_CONFIG: configPath,
      TOPIC_PLANNER_TIME_ZONE: "America/Vancouver",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = collectChildOutput(server);
  t.after(async () => {
    await stopChild(server);
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await waitForHealth(server, port, logs);
  const response = await requestJson(port, "/api/topics/schedule", {
    path: "topics/timezone-check.md",
    scheduledDate: "2026-07-10",
    scheduledStart: "10:00",
    scheduledEnd: "11:00",
    calendarProvider: "lark",
  });

  assert.equal(response.statusCode, 200, logs.text());
  assert.equal(response.body.topic.calendarSyncStatus, "已同步");

  const eventParams = JSON.parse(await fs.readFile(captureParamsPath, "utf8"));
  assert.deepEqual(eventParams, {
    calendar_id: "cal_selected",
  });

  const eventData = JSON.parse(await fs.readFile(capturePath, "utf8"));
  assert.deepEqual(eventData.start_time, {
    timestamp: "1783702800",
    timezone: "America/Vancouver",
  });
  assert.deepEqual(eventData.end_time, {
    timestamp: "1783706400",
    timezone: "America/Vancouver",
  });
});

function collectChildOutput(child) {
  const chunks = [];
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => chunks.push(chunk));
  child.stderr.on("data", (chunk) => chunks.push(chunk));
  return {
    text: () => chunks.join(""),
  };
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.equal(typeof address, "object");
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForHealth(child, port, logs) {
  const deadline = Date.now() + 5_000;
  let lastError = null;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited before health check passed\n${logs.text()}`);
    }
    try {
      const response = await requestJson(port, "/api/health");
      if (response.statusCode === 200 && response.body?.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`server did not become healthy: ${lastError?.message || "unknown error"}\n${logs.text()}`);
}

async function requestJson(port, pathname, body) {
  const payload = body ? JSON.stringify(body) : "";
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method: body ? "POST" : "GET",
      headers: body ? {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
      } : {},
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: raw ? JSON.parse(raw) : null,
            raw,
          });
        } catch (error) {
          reject(new Error(`invalid JSON response ${res.statusCode}: ${raw}`));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(1_500, () => {
      req.destroy(new Error("request timed out"));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  await new Promise((resolve) => {
    child.once("close", resolve);
    child.kill();
  });
}
