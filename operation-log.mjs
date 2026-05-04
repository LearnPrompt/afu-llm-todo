import path from 'node:path';
import { promises as fs } from 'node:fs';

const PLANNER_TIME_ZONE = process.env.TOPIC_PLANNER_TIME_ZONE || 'Asia/Shanghai';

function todayString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PLANNER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDetailLines(details = {}) {
  return Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `  - ${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`);
}

async function appendOperationLog({ vaultRoot, action, title = '', details = {}, now = new Date() }) {
  const date = todayString(now);
  const logDir = path.join(vaultRoot, '99_系统', 'topic-planner-log');
  const logPath = path.join(logDir, `${date}.md`);
  await fs.mkdir(logDir, { recursive: true });

  const exists = await fs.access(logPath).then(() => true).catch(() => false);
  const header = exists
    ? ''
    : `---\ntype: topic-planner-log\ndate: ${date}\n---\n# Topic Planner Log ${date}\n`;
  const lines = [
    header,
    `## ${now.toISOString()} | ${action}`,
    title ? `- 标题: ${title}` : '',
    ...formatDetailLines(details),
    '',
  ].filter((line) => line !== '');

  await fs.appendFile(logPath, `${lines.join('\n')}\n`, 'utf8');
  return path.relative(vaultRoot, logPath);
}

export {
  appendOperationLog,
};
