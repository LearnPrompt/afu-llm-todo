function stripTopicPrefix(title = '') {
  return String(title || '')
    .trim()
    .replace(/^【选题】\s*/u, '')
    .trim();
}

function normalizeDisplayTitle(title = '') {
  return stripTopicPrefix(title) || String(title || '').trim();
}

function formatCalendarSyncError(error) {
  const raw = String(error?.message ?? error ?? '').trim();
  const firstLine = raw.split(/\r\n|\r|\n/, 1)[0].trim();
  if (!firstLine) return '未知错误';
  return firstLine.length > 200 ? `${firstLine.slice(0, 200)}…` : firstLine;
}

export {
  formatCalendarSyncError,
  normalizeDisplayTitle,
  stripTopicPrefix,
};
