function toAppleScriptString(value) {
  return `"${String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n|\r|\n/g, '" & linefeed & "')}"`;
}

function buildAppleScriptDate(variableName, date, time) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const monthName = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][month - 1];
  const secondsFromMidnight = hour * 3600 + minute * 60;
  return [
    `  set ${variableName} to current date`,
    `  set day of ${variableName} to 1`,
    `  set year of ${variableName} to ${year}`,
    `  set month of ${variableName} to ${monthName}`,
    `  set day of ${variableName} to ${day}`,
    `  set time of ${variableName} to ${secondsFromMidnight}`,
  ].join("\n");
}

// 事件描述里 topic_id 独占一行(见 syncTopicToMacOSCalendar 的 description 拼装),
// 所以 whose ... contains 只能当粗筛,删除前必须整行精确匹配,
// 否则 topic_id 为前缀关系时会误删(清理 "20" 连带删掉 "201")。
function buildDeleteEventsByTopicScript(topicId) {
  const targetLine = `topic_id: ${topicId}`;
  return `
tell application id "com.apple.iCal"
  set targetLine to ${toAppleScriptString(targetLine)}
  set deletedCount to 0
  repeat with candidateCalendar in calendars
    set matchingEvents to every event of candidateCalendar whose description contains targetLine
    repeat with candidateEvent in matchingEvents
      if (paragraphs of ((description of candidateEvent) as string)) contains targetLine then
        delete candidateEvent
        set deletedCount to deletedCount + 1
      end if
    end repeat
  end repeat
  return deletedCount as string
end tell
`;
}

// 撤回排期/作废时的清理计划。纯函数,便于单测。
// macos 兜底扫描的触发条件刻意收窄:只有卡片带过 macos 痕迹才全日历扫,
// 纯 lark / none 用户不付这个成本。
function planCalendarCleanup(topic = {}) {
  const actions = [];
  if (topic.lark_event_id) {
    actions.push({ type: "lark" });
  }
  if (topic.macos_event_id) {
    actions.push({ type: "macos-uid", eventUid: topic.macos_event_id });
  }
  const touchedMacOS = Boolean(
    topic.macos_event_id || topic.macos_calendar_name || topic.calendar_provider === "macos",
  );
  if (topic.topic_id && touchedMacOS) {
    actions.push({ type: "macos-topic-sweep", topicId: topic.topic_id });
  }
  return actions;
}

export {
  buildAppleScriptDate,
  buildDeleteEventsByTopicScript,
  planCalendarCleanup,
  toAppleScriptString,
};
