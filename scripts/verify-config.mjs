import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  loadPlannerSettings,
  resolvePlannerPaths,
} from '../topic-planner-config.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const settings = await loadPlannerSettings({ projectRoot });
const paths = resolvePlannerPaths(settings);
const checks = [];

async function checkDir(label, dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    checks.push({ label, ok: true, path: dirPath, count: entries.length });
  } catch (error) {
    checks.push({ label, ok: false, path: dirPath, error: error.message });
  }
}

async function checkFile(label, filePath) {
  try {
    await fs.access(filePath);
    checks.push({ label, ok: true, path: filePath });
  } catch (error) {
    checks.push({ label, ok: false, path: filePath, error: error.message });
  }
}

await checkDir('Vault 根目录', paths.vaultRoot);
await checkDir('选题目录', paths.topicDir);
await checkDir('收件箱目录', paths.inboxDir);
await checkDir('归档目录', paths.archiveRoot);
await checkDir('Wiki 目录', paths.wikiRoot);
await checkFile('Wiki Index', paths.wikiIndexPath);
await checkFile('Wiki Log', paths.wikiLogPath);

const invalidCalendar = !['none', 'lark', 'macos'].includes(settings.calendarProvider);
const invalidWikiMode = !['off', 'agent'].includes(settings.wikiMode);
if (invalidCalendar) {
  checks.push({ label: '日历目标', ok: false, path: settings.calendarProvider, error: '必须是 none/lark/macos' });
}
if (invalidWikiMode) {
  checks.push({ label: 'Wiki Mode', ok: false, path: settings.wikiMode, error: '必须是 off/agent' });
}

const failed = checks.filter((item) => !item.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  settings,
  checks,
}, null, 2));

if (failed.length) {
  process.exitCode = 1;
}
