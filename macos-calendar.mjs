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

// 批量清理:多张卡的 UID 删除 + topic_id 兜底扫描合成一次 osascript,
// 只遍历一遍日历,避免 N 张卡付 N 次进程启动 + Calendar.app IPC 的成本。
function buildBatchCalendarCleanupScript({ eventUids = [], topicIds = [] } = {}) {
  const uidList = eventUids.filter(Boolean).map(toAppleScriptString).join(", ");
  const lineList = topicIds
    .filter(Boolean)
    .map((topicId) => toAppleScriptString(`topic_id: ${topicId}`))
    .join(", ");
  return `
tell application id "com.apple.iCal"
  set targetUids to {${uidList}}
  set targetLines to {${lineList}}
  set deletedCount to 0
  repeat with candidateCalendar in calendars
    repeat with targetUid in targetUids
      set matchingEvents to every event of candidateCalendar whose uid is (targetUid as string)
      repeat with candidateEvent in matchingEvents
        delete candidateEvent
        set deletedCount to deletedCount + 1
      end repeat
    end repeat
    repeat with targetLine in targetLines
      set matchingEvents to every event of candidateCalendar whose description contains (targetLine as string)
      repeat with candidateEvent in matchingEvents
        if (paragraphs of ((description of candidateEvent) as string)) contains (targetLine as string) then
          delete candidateEvent
          set deletedCount to deletedCount + 1
        end if
      end repeat
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

// 纯日期字符串("YYYY-MM-DD")加一天,只做日历分量算术,不涉及时区换算。
function addOneDay(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 只读聚合:按日历名批量列出窗口内(重叠判定,覆盖跨天/跨周事件)的事件。
// 输出每行一个 TSV,字段固定 15 列,便于 parseMacOSEventLines 解析。
// 总行数硬顶 300,避免用户误配一个巨型日历时脚本长时间卡住 Calendar.app。
function buildListEventsScript({ calendarNames = [], startDate, endDate } = {}) {
  const names = (calendarNames || []).filter(Boolean);
  const windowEndDate = addOneDay(endDate);
  const windowStartScript = buildAppleScriptDate("windowStart", startDate, "00:00");
  const windowEndScript = buildAppleScriptDate("windowEnd", windowEndDate, "00:00");
  const nameList = names.map(toAppleScriptString).join(", ");
  return `
on sanitizeListField(sourceText)
  set prevDelims to AppleScript's text item delimiters
  set AppleScript's text item delimiters to tab
  set sourceText to (text items of sourceText) as string
  set AppleScript's text item delimiters to " "
  set sourceText to (text items of sourceText) as string
  set AppleScript's text item delimiters to linefeed
  set sourceText to (text items of sourceText) as string
  set AppleScript's text item delimiters to " "
  set sourceText to (text items of sourceText) as string
  set AppleScript's text item delimiters to return
  set sourceText to (text items of sourceText) as string
  set AppleScript's text item delimiters to " "
  set sourceText to (text items of sourceText) as string
  set AppleScript's text item delimiters to prevDelims
  return sourceText
end sanitizeListField

tell application id "com.apple.iCal"
${windowStartScript}
${windowEndScript}
  set targetNames to {${nameList}}
  set outputLines to {}
  set lineCount to 0
  set maxLines to 300
  repeat with targetName in targetNames
    if lineCount >= maxLines then exit repeat
    set targetCalendar to missing value
    repeat with candidateCalendar in calendars
      if name of candidateCalendar is (targetName as string) then
        set targetCalendar to candidateCalendar
        exit repeat
      end if
    end repeat
    if targetCalendar is not missing value then
      set matchingEvents to every event of targetCalendar whose start date < windowEnd and end date > windowStart
      repeat with candidateEvent in matchingEvents
        if lineCount >= maxLines then exit repeat
        set eventUid to uid of candidateEvent
        set eventSummary to my sanitizeListField((summary of candidateEvent) as string)
        set isAllDay to (allday event of candidateEvent)
        set eventStart to start date of candidateEvent
        set eventEnd to end date of candidateEvent
        set eventDescription to ""
        try
          set eventDescription to (description of candidateEvent) as string
        end try
        set hasMarker to eventDescription contains "topic_id: "
        set lineText to (targetName as string) & tab & (eventUid as string) & tab & eventSummary & tab & (isAllDay as string) & tab & (year of eventStart as string) & tab & (month of eventStart as integer as string) & tab & (day of eventStart as string) & tab & (hours of eventStart as string) & tab & (minutes of eventStart as string) & tab & (year of eventEnd as string) & tab & (month of eventEnd as integer as string) & tab & (day of eventEnd as string) & tab & (hours of eventEnd as string) & tab & (minutes of eventEnd as string) & tab & (hasMarker as string)
        set end of outputLines to lineText
        set lineCount to lineCount + 1
      end repeat
    end if
  end repeat
  set prevDelims to AppleScript's text item delimiters
  set AppleScript's text item delimiters to linefeed
  set outputText to outputLines as string
  set AppleScript's text item delimiters to prevDelims
  return outputText
end tell
`;
}

// buildListEventsScript 输出的反解析。字段数不对的行(如脚本被打断、手工造的坏数据)整行跳过,
// 不让单行脏数据拖垮整个响应。
function parseMacOSEventLines(output) {
  const lines = String(output || "").split(/\r?\n/);
  const events = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const fields = line.split("\t");
    if (fields.length !== 15) continue;
    const [
      calendarName,
      uid,
      title,
      alldayText,
      startYear,
      startMonth,
      startDay,
      startHours,
      startMinutes,
      endYear,
      endMonth,
      endDay,
      endHours,
      endMinutes,
      hasTopicMarkerText,
    ] = fields;
    const allDay = alldayText === "true";
    const startDate = `${startYear}-${String(startMonth).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;
    const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
    events.push({
      calendarName,
      uid,
      title,
      allDay,
      startDate,
      startTime: allDay ? "" : `${String(startHours).padStart(2, "0")}:${String(startMinutes).padStart(2, "0")}`,
      endDate,
      endTime: allDay ? "" : `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`,
      hasTopicMarker: hasTopicMarkerText === "true",
    });
  }
  return events;
}

export {
  buildAppleScriptDate,
  buildBatchCalendarCleanupScript,
  buildDeleteEventsByTopicScript,
  buildListEventsScript,
  parseMacOSEventLines,
  planCalendarCleanup,
  toAppleScriptString,
};
