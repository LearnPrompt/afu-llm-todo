// Builds a fake lark-cli shell script for tests: every invocation is logged
// (via $STUB_LOG, wired up by spawnPlannerServer) and dispatched by its first
// three args (e.g. "auth status", "calendar events create") to a canned JSON
// response. Pass the same key in `failures` to make that call exit non-zero
// instead, simulating a lark-cli command failure.
function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function buildLarkStubScript({ responses = {}, failures = [] } = {}) {
  const lines = [
    '#!/bin/bash',
    'LOG="${STUB_LOG:-/dev/null}"',
    'printf \'%s\\n\' "$*" >> "$LOG"',
    'key="$1 $2 $3"',
    'key="${key% }"',
    'case "$key" in',
  ];
  for (const [key, value] of Object.entries(responses)) {
    lines.push(`  ${shellSingleQuote(key)})`);
    if (failures.includes(key)) {
      lines.push(`    echo ${shellSingleQuote(value || `stub failure: ${key}`)} >&2`);
      lines.push('    exit 1');
    } else {
      lines.push(`    echo ${shellSingleQuote(value)}`);
    }
    lines.push('    ;;');
  }
  lines.push('  *)');
  lines.push("    echo '{}'");
  lines.push('    ;;');
  lines.push('esac');
  return `${lines.join('\n')}\n`;
}

export { buildLarkStubScript };
