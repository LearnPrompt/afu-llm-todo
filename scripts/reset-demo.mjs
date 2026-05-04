import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const vaultRoot = path.join(projectRoot, 'examples', 'sample-vault');

const files = {
  'topic-planner.config.json': JSON.stringify({
    vaultRoot,
    topicDir: '15_自媒体/选题库',
    inboxDir: '00_收件箱',
    archiveDir: '99_系统/归档/选题占位',
    calendarProvider: 'lark',
    macosCalendarName: '内容排期',
    wikiMode: 'agent',
    wikiDir: '30_研究/内容Wiki',
    wikiIndexPath: '30_研究/内容Wiki/index.md',
    wikiLogPath: '30_研究/内容Wiki/log.md',
    dailyCapacity: 4,
    scheduleTimeSlots: [
      { label: '上午深度', start: '09:30', end: '11:00' },
      { label: '下午制作', start: '14:00', end: '15:30' },
      { label: '晚上发布', start: '20:00', end: '20:30' },
    ],
  }, null, 2),
  '00_收件箱/2026-05-04/AI 浏览器开始接管资料整理.md': `---\nauthor: Demo\nsource: Web Clipper\nurl: https://example.com/ai-browser-research\nsaved: 2026-05-04 09:00:00\ntags:\n  - AI浏览器\n  - 内容选题\n---\n\nAI 浏览器开始把搜索、阅读、整理和行动串起来。值得做一条选题：普通人不需要更强的收藏夹，而需要能把资料变成下一步行动的工作流。\n\n案例可以对比传统书签、NotebookLM、Obsidian 和 Agent Browser。\n`,
  '00_收件箱/2026-05-04/Karpathy LLM Wiki 热度继续扩散.md': `---\nauthor: Demo\nsource: Newsletter\nurl: https://example.com/llm-wiki-trend\nsaved: 2026-05-04 10:20:00\ntags:\n  - LLM Wiki\n  - Karpathy\n---\n\nKarpathy 的 LLM Wiki 思路继续扩散。重点不是 RAG，而是让 LLM 持续维护一个会增长的 Markdown Wiki。这个思路可以连接内容排期：Wiki 里的研究结论应该长出 Todo。\n`,
  '00_收件箱/2026-05-04/内容创作者的收件箱不是垃圾堆.md': `---\nauthor: Demo\nsource: Note\nsaved: 2026-05-04 11:10:00\ntags:\n  - Obsidian\n  - LLM Todo\n---\n\n内容创作者每天收藏很多链接，但真正缺的是从素材到选题到排期的闭环。一个 Obsidian-first 的 LLM Todo 可以把收件箱变成周计划。\n`,
  '15_自媒体/选题库/README.md': '# 选题库\n\n这里存放 demo 生成的选题卡。\n',
  '30_研究/内容Wiki/index.md': `---\ntype: llm-wiki-index\nstatus: active\n---\n# 内容 Wiki Index\n\nDemo Wiki 的入口。点击“编译收件箱批次”后会生成 ingest packet。\n`,
  '30_研究/内容Wiki/log.md': `---\ntype: llm-wiki-log\nstatus: active\n---\n# 内容 Wiki Log\n\n`,
  '99_系统/归档/选题占位/README.md': '# 选题归档\n\n作废或归档选题会进入这里。\n',
};

await fs.rm(vaultRoot, { recursive: true, force: true });
for (const [relativePath, content] of Object.entries(files)) {
  const target = path.join(vaultRoot, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${content.trimEnd()}\n`, 'utf8');
}

console.log(`Demo vault reset: ${vaultRoot}`);
