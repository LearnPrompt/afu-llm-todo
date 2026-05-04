function stripTopicPrefix(title = '') {
  return String(title || '')
    .trim()
    .replace(/^【选题】\s*/u, '')
    .trim();
}

function normalizeDisplayTitle(title = '') {
  return stripTopicPrefix(title) || String(title || '').trim();
}

export {
  normalizeDisplayTitle,
  stripTopicPrefix,
};
