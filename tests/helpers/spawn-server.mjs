import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function waitForHealth(port, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`server on port ${port} did not become healthy in ${timeoutMs}ms`);
}

// Spawns a real server.mjs against a throwaway vault. Returns helpers + cleanup.
async function spawnPlannerServer({ calendarProvider = 'none', larkStub, settings, extraEnv } = {}) {
  const workRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'afu-test-'));
  const vaultRoot = path.join(workRoot, 'vault');
  const topicDir = '40_行动卡片';
  const inboxDir = '00_收件箱';
  const archiveDir = '99_系统/归档/行动卡片';
  await fs.mkdir(path.join(vaultRoot, topicDir), { recursive: true });
  await fs.mkdir(path.join(vaultRoot, inboxDir), { recursive: true });
  await fs.mkdir(path.join(vaultRoot, archiveDir), { recursive: true });

  // lark-cli stub that always fails fast — keeps the calendar-failure path
  // deterministic even on machines with a real lark-cli installed.
  // Tests can override this via `larkStub` (a full shell script) to simulate
  // specific lark-cli command responses; every invocation is appended to
  // `stubLogPath` (via $STUB_LOG) so tests can assert on call order/args.
  const larkStubPath = path.join(workRoot, 'lark-cli');
  const stubLogPath = path.join(workRoot, 'lark-stub.log');
  await fs.writeFile(larkStubPath, larkStub || '#!/bin/sh\necho "lark-cli stub: simulated failure" >&2\nexit 1\n');
  await fs.chmod(larkStubPath, 0o755);

  const configPath = path.join(workRoot, 'topic-planner.config.json');
  await fs.writeFile(configPath, JSON.stringify({
    workspaceMode: 'obsidian',
    vaultRoot,
    topicDir,
    inboxDir,
    archiveDir,
    calendarProvider,
    macosCalendarName: '',
    wikiMode: 'off',
    ...(settings || {}),
  }, null, 2));

  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [path.join(PROJECT_ROOT, 'server.mjs')], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      TOPIC_PLANNER_VAULT_ROOT: vaultRoot,
      TOPIC_PLANNER_CONFIG: configPath,
      LARK_CLI_PATH: larkStubPath,
      STUB_LOG: stubLogPath,
      HOME: workRoot,
      DEEPSEEK_API_KEY: '',
      ...(extraEnv || {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  try {
    await waitForHealth(port);
  } catch (error) {
    child.kill('SIGKILL');
    throw new Error(`${error.message}\nserver stderr:\n${stderr}`);
  }

  return {
    port,
    vaultRoot,
    topicDir,
    inboxDir,
    stubLogPath,
    async readStubLog() {
      try {
        return await fs.readFile(stubLogPath, 'utf8');
      } catch {
        return '';
      }
    },
    async writeTopicCard(fileName, frontmatterLines, body = '正文') {
      const filePath = path.join(vaultRoot, topicDir, fileName);
      const content = ['---', ...frontmatterLines, '---', '', body, ''].join('\n');
      await fs.writeFile(filePath, content);
      return path.join(topicDir, fileName);
    },
    async readTopicCard(fileName) {
      return fs.readFile(path.join(vaultRoot, topicDir, fileName), 'utf8');
    },
    async request(pathname, options = {}) {
      const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
        ...options,
        headers: { 'content-type': 'application/json', ...(options.headers || {}) },
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* non-JSON error body */ }
      return { status: res.status, json, text };
    },
    async close() {
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        child.on('exit', resolve);
        setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000);
      });
      await fs.rm(workRoot, { recursive: true, force: true });
    },
  };
}

export { spawnPlannerServer };
