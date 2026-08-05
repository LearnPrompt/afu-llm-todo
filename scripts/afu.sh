#!/bin/bash
# afu — 快速唤醒/直达阿福
#
# 用法:
#   afu            打开今日视图(默认)
#   afu today      同上
#   afu inbox      打开每日收件箱 triage 弹窗
#   afu backlog    打开排期池(合并卡片在这)
#   afu status     只报状态不开浏览器
#   afu restart    强制重启服务
#   afu log        跟看服务日志
#
# 服务未运行时自动通过 launchd 拉起;launchd 不可用时直接 node 兜底。

set -euo pipefail

PORT="${AFU_PORT:-4317}"
BASE="http://localhost:${PORT}"
LABEL="com.afu.topic-planner"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

healthy() {
  curl -s --max-time 2 "${BASE}/api/health" 2>/dev/null | grep -q '"ok":true'
}

wake() {
  if healthy; then
    return 0
  fi
  echo "afu 未在监听,正在唤醒…"
  if [ -f "$PLIST" ]; then
    launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null \
      || launchctl kickstart -k "gui/$(id -u)/${LABEL}" 2>/dev/null \
      || true
  else
    # 没装 LaunchAgent 的机器(比如另一台 Mac):直接后台起 node
    (cd "$REPO" && nohup node server.mjs >/tmp/afu-manual.log 2>&1 &)
  fi
  for _ in $(seq 1 20); do
    healthy && { echo "afu 已就绪: ${BASE}"; return 0; }
    sleep 0.5
  done
  echo "唤醒失败。看日志: ~/Library/Logs/afu-topic-planner.err.log 或 /tmp/afu-manual.log" >&2
  return 1
}

cmd="${1:-today}"
case "$cmd" in
  today)   wake && open "${BASE}/?view=today" ;;
  inbox)   wake && open "${BASE}/?dailyInbox=1" ;;
  backlog) wake && open "${BASE}/?view=backlog" ;;
  status)
    if healthy; then
      echo "afu 运行中: ${BASE}"
      launchctl print "gui/$(id -u)/${LABEL}" 2>/dev/null | grep -E "state|pid" | head -2 || true
    else
      echo "afu 未运行(端口 ${PORT} 无响应)"
      exit 1
    fi
    ;;
  restart)
    if [ -f "$PLIST" ]; then
      launchctl kickstart -k "gui/$(id -u)/${LABEL}" && sleep 2 && "$0" status
    else
      echo "本机没有 LaunchAgent(${PLIST}),用 afu today 直接唤醒即可" >&2
      exit 1
    fi
    ;;
  log)     tail -f "$HOME/Library/Logs/afu-topic-planner.log" "$HOME/Library/Logs/afu-topic-planner.err.log" ;;
  *)
    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
