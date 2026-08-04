const TERMINAL_STAGES = new Set(["已发布", "已拒绝", "已归档"]);

const DEFAULT_SCHEDULE_TIME_SLOTS = [
  { label: "上午深度", start: "09:30", end: "11:00" },
  { label: "下午制作", start: "14:00", end: "15:30" },
  { label: "晚上发布", start: "20:00", end: "20:30" },
];

const PRIORITY_RANK = new Map([
  ["高", 0],
  ["high", 0],
  ["中", 1],
  ["medium", 1],
  ["低", 2],
  ["low", 2],
]);

function buildReviewQueue(topics = []) {
  return topics
    .filter((topic) => !topic.scheduledDate && !TERMINAL_STAGES.has(topic.stage))
    .sort((left, right) => {
      const priorityDelta = priorityRank(left.priority) - priorityRank(right.priority);
      if (priorityDelta !== 0) return priorityDelta;

      const updatedDelta = String(right.updated || "").localeCompare(String(left.updated || ""));
      if (updatedDelta !== 0) return updatedDelta;

      return String(left.title || "").localeCompare(String(right.title || ""), "zh-CN");
    });
}

function buildScheduleSuggestion(kind, topics = [], settings = {}, now = new Date()) {
  const offsets = getCandidateOffsets(kind, now);
  if (!offsets.length) return null;

  const slots = normalizeSlots(settings.scheduleTimeSlots);
  const capacity = normalizeCapacity(settings.dailyCapacity);

  for (const offset of offsets) {
    const date = addLocalDays(now, offset);
    const iso = formatLocalDate(date);
    const scheduled = topics.filter((topic) => (
      topic.scheduledDate === iso
      && !TERMINAL_STAGES.has(topic.stage)
    ));
    const enforceCapacity = kind === "week";
    if (enforceCapacity && scheduled.length >= capacity) continue;

    const slot = slots.find((candidate) => {
      if (scheduled.some((topic) => timeRangesOverlap(
        candidate.start,
        candidate.end,
        topic.scheduledStart,
        topic.scheduledEnd,
      ))) {
        return false;
      }

      if (offset === 0 && isPastSlot(candidate, now)) {
        return false;
      }

      return true;
    });

    if (!slot) continue;

    return {
      kind,
      date: iso,
      start: slot.start,
      end: slot.end,
      slotLabel: slot.label,
      dayLabel: formatDayLabel(date, now),
      overRecommendedCapacity: scheduled.length >= capacity,
    };
  }

  return null;
}

function buildWeekDays(anchor = new Date(), now = new Date(), selectedDate = "") {
  const monday = startOfLocalWeek(anchor);
  const today = formatLocalDate(now);

  return Array.from({ length: 7 }, (_, index) => {
    const date = addLocalDays(monday, index);
    const iso = formatLocalDate(date);
    return {
      date: iso,
      weekday: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()],
      day: date.getDate(),
      month: date.getMonth() + 1,
      isPast: iso < today,
      isToday: iso === today,
      isSelected: iso === selectedDate,
    };
  });
}

function shiftWeekAnchor(anchor, amount) {
  return addLocalDays(startOfLocalWeek(anchor), Number(amount || 0) * 7);
}

function parseLocalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return formatLocalDate(date) === value ? date : null;
}

function getScheduleSlots(settings = {}) {
  return normalizeSlots(settings.scheduleTimeSlots);
}

function getDayScheduleSummary(date, topics = [], settings = {}, excludePath = "") {
  const scheduled = topics.filter((topic) => (
    topic.scheduledDate === date
    && topic.path !== excludePath
    && !TERMINAL_STAGES.has(topic.stage)
  ));
  const capacity = normalizeCapacity(settings.dailyCapacity);
  return {
    count: scheduled.length,
    capacity,
    isFull: scheduled.length >= capacity,
  };
}

function findScheduleConflict({ date, start, end, path = "" }, topics = []) {
  if (!date || !start || !end) return null;
  return topics.find((topic) => (
    topic.path !== path
    && topic.scheduledDate === date
    && !TERMINAL_STAGES.has(topic.stage)
    && timeRangesOverlap(start, end, topic.scheduledStart, topic.scheduledEnd)
  )) || null;
}

function validateScheduleSelection(selection = {}, topics = [], now = new Date()) {
  const date = parseLocalDate(selection.date);
  if (!date) return "请先选择日期";
  if (formatLocalDate(date) < formatLocalDate(now)) return "不能排到过去的日期";
  if (!/^\d{2}:\d{2}$/.test(selection.start || "") || !/^\d{2}:\d{2}$/.test(selection.end || "")) {
    return "请明确选择开始和结束时间";
  }
  if (selection.start >= selection.end) return "结束时间必须晚于开始时间";
  if (formatLocalDate(date) === formatLocalDate(now) && selection.start <= currentLocalTime(now)) {
    return "这个时间已经过去了";
  }
  if (findScheduleConflict(selection, topics)) return "这个时段已经有排期";
  return "";
}

function resolveCalendarProvider(settings = {}, lark = null) {
  const provider = settings.calendarProvider || "none";
  if (provider === "lark" && !lark?.available) return "none";
  return ["none", "lark", "macos"].includes(provider) ? provider : "none";
}

function stripTopicPrefix(title = "") {
  return String(title || "").replace(/^【选题】\s*/u, "").trim();
}

function getCandidateOffsets(kind, now) {
  if (kind === "today") return [0];
  if (kind === "tomorrow") return [1];
  if (kind !== "week") return [];

  const day = now.getDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  return Array.from(
    { length: Math.max(0, daysUntilSunday - 1) },
    (_, index) => index + 2,
  );
}

function normalizeSlots(value) {
  const slots = Array.isArray(value)
    ? value
      .map((slot) => ({
        label: String(slot?.label || "").trim(),
        start: String(slot?.start || "").trim(),
        end: String(slot?.end || "").trim(),
      }))
      .filter((slot) => (
        slot.label
        && /^\d{2}:\d{2}$/.test(slot.start)
        && /^\d{2}:\d{2}$/.test(slot.end)
        && slot.start < slot.end
      ))
    : [];

  return slots.length ? slots : DEFAULT_SCHEDULE_TIME_SLOTS;
}

function normalizeCapacity(value) {
  const capacity = Number(value);
  if (!Number.isFinite(capacity)) return 2;
  return Math.max(1, Math.min(12, Math.round(capacity)));
}

function priorityRank(value) {
  const normalized = String(value || "").toLowerCase();
  const namedRank = PRIORITY_RANK.get(normalized);
  if (namedRank !== undefined) return namedRank;

  const starCount = (normalized.match(/⭐/gu) || []).length;
  return starCount ? Math.max(0, 4 - starCount) : 4;
}

function addLocalDays(date, offset) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  result.setDate(result.getDate() + offset);
  return result;
}

function startOfLocalWeek(value) {
  const result = new Date(value);
  result.setHours(12, 0, 0, 0);
  const offsetFromMonday = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offsetFromMonday);
  return result;
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDayLabel(date, now) {
  const offset = Math.round((dateAtNoon(date) - dateAtNoon(now)) / 86_400_000);
  if (offset === 0) return "今天";
  if (offset === 1) return "明天";
  return `${["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`;
}

function dateAtNoon(date) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  return result;
}

function isPastSlot(slot, now) {
  return slot.start <= currentLocalTime(now);
}

function currentLocalTime(now) {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function timeRangesOverlap(startA, endA, startB, endB) {
  if (!startB || !endB) return false;
  return startA < endB && startB < endA;
}

export {
  buildWeekDays,
  buildReviewQueue,
  buildScheduleSuggestion,
  findScheduleConflict,
  formatLocalDate,
  getDayScheduleSummary,
  getScheduleSlots,
  parseLocalDate,
  resolveCalendarProvider,
  shiftWeekAnchor,
  stripTopicPrefix,
  validateScheduleSelection,
};
