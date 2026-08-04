import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReviewQueue,
  buildScheduleSuggestion,
  buildWeekDays,
  getDayScheduleSummary,
  getScheduleSlots,
  resolveCalendarProvider,
  shiftWeekAnchor,
  validateScheduleSelection,
} from "../public/quick-utils.mjs";

const settings = {
  dailyCapacity: 2,
  scheduleTimeSlots: [
    { label: "上午深度", start: "09:30", end: "11:00" },
    { label: "下午制作", start: "14:00", end: "15:30" },
    { label: "晚上发布", start: "20:00", end: "20:30" },
  ],
};

test("buildReviewQueue keeps only unscheduled, non-terminal cards and sorts priority first", () => {
  const topics = [
    { path: "low.md", title: "低", priority: "低", stage: "待排期", updated: "2026-07-31" },
    { path: "scheduled.md", title: "已排", priority: "高", stage: "已排期", scheduledDate: "2026-08-01" },
    { path: "rejected.md", title: "拒绝", priority: "高", stage: "已拒绝" },
    { path: "high.md", title: "高", priority: "高", stage: "待排期", updated: "2026-07-30" },
    { path: "medium.md", title: "中", priority: "中", stage: "去重中", updated: "2026-07-31" },
    { path: "stars.md", title: "四星", priority: "⭐⭐⭐⭐", stage: "待排期", updated: "2026-07-29" },
  ];

  assert.deepEqual(
    buildReviewQueue(topics).map((topic) => topic.path),
    ["high.md", "stars.md", "medium.md", "low.md"],
  );
});

test("today suggestion skips elapsed and overlapping slots", () => {
  const now = new Date(2026, 6, 31, 10, 53);
  const topics = [
    {
      scheduledDate: "2026-07-31",
      scheduledStart: "14:00",
      scheduledEnd: "15:30",
    },
  ];

  assert.deepEqual(
    buildScheduleSuggestion("today", topics, settings, now),
    {
      kind: "today",
      date: "2026-07-31",
      start: "20:00",
      end: "20:30",
      slotLabel: "晚上发布",
      dayLabel: "今天",
      overRecommendedCapacity: false,
    },
  );
});

test("tomorrow suggestion uses the first available configured slot", () => {
  const now = new Date(2026, 6, 31, 10, 53);
  const topics = [
    {
      scheduledDate: "2026-08-01",
      scheduledStart: "09:30",
      scheduledEnd: "11:00",
    },
  ];

  const suggestion = buildScheduleSuggestion("tomorrow", topics, settings, now);
  assert.equal(suggestion.date, "2026-08-01");
  assert.equal(suggestion.start, "14:00");
  assert.equal(suggestion.dayLabel, "明天");
});

test("week suggestion skips full days and stays inside the current week", () => {
  const now = new Date(2026, 6, 29, 10, 0);
  const topics = [
    { scheduledDate: "2026-07-31", scheduledStart: "09:30", scheduledEnd: "11:00" },
    { scheduledDate: "2026-07-31", scheduledStart: "14:00", scheduledEnd: "15:30" },
  ];

  const suggestion = buildScheduleSuggestion("week", topics, settings, now);
  assert.equal(suggestion.date, "2026-08-01");
  assert.equal(suggestion.dayLabel, "周六 8/1");
});

test("week suggestion is unavailable on Saturday and Sunday after tomorrow is excluded", () => {
  const saturday = new Date(2026, 7, 1, 10, 0);
  const sunday = new Date(2026, 7, 2, 10, 0);

  assert.equal(buildScheduleSuggestion("week", [], settings, saturday), null);
  assert.equal(buildScheduleSuggestion("week", [], settings, sunday), null);
});

test("resolveCalendarProvider falls back to markdown when Lark is unavailable", () => {
  assert.equal(resolveCalendarProvider({ calendarProvider: "lark" }, { available: false }), "none");
  assert.equal(resolveCalendarProvider({ calendarProvider: "lark" }, { available: true }), "lark");
  assert.equal(resolveCalendarProvider({ calendarProvider: "macos" }), "macos");
});

test("buildWeekDays starts on Monday without selecting a default date", () => {
  const now = new Date(2026, 7, 4, 10, 0);
  const days = buildWeekDays(now, now);

  assert.deepEqual(days.map((day) => day.date), [
    "2026-08-03",
    "2026-08-04",
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
    "2026-08-08",
    "2026-08-09",
  ]);
  assert.equal(days.some((day) => day.isSelected), false);
  assert.equal(days[0].isPast, true);
  assert.equal(days[1].isToday, true);
});

test("week navigation crosses month and year boundaries in local time", () => {
  const anchor = new Date(2026, 11, 31, 23, 30);
  const nextWeek = shiftWeekAnchor(anchor, 1);
  const days = buildWeekDays(nextWeek, anchor, "2027-01-05");

  assert.equal(days[0].date, "2027-01-04");
  assert.equal(days[6].date, "2027-01-10");
  assert.equal(days.find((day) => day.isSelected)?.date, "2027-01-05");
});

test("manual scheduling requires an explicit date and time", () => {
  const now = new Date(2026, 7, 4, 10, 0);

  assert.equal(validateScheduleSelection({}, [], now), "请先选择日期");
  assert.equal(
    validateScheduleSelection({ date: "2026-08-05" }, [], now),
    "请明确选择开始和结束时间",
  );
  assert.equal(
    validateScheduleSelection({ date: "2026-08-05", start: "14:00", end: "15:30" }, [], now),
    "",
  );
});

test("manual scheduling blocks elapsed and overlapping times but excludes the edited card", () => {
  const now = new Date(2026, 7, 4, 10, 0);
  const topics = [{
    path: "existing.md",
    scheduledDate: "2026-08-05",
    scheduledStart: "14:00",
    scheduledEnd: "15:30",
    stage: "已排期",
  }];

  assert.equal(
    validateScheduleSelection({ date: "2026-08-04", start: "09:30", end: "11:00" }, topics, now),
    "这个时间已经过去了",
  );
  assert.equal(
    validateScheduleSelection({ date: "2026-08-05", start: "14:30", end: "16:00" }, topics, now),
    "这个时段已经有排期",
  );
  assert.equal(
    validateScheduleSelection({
      path: "existing.md",
      date: "2026-08-05",
      start: "14:00",
      end: "15:30",
    }, topics, now),
    "",
  );
});

test("day capacity warns without removing configured time choices", () => {
  const topics = [
    { path: "one.md", scheduledDate: "2026-08-05", stage: "已排期" },
    { path: "two.md", scheduledDate: "2026-08-05", stage: "已排期" },
  ];

  assert.deepEqual(getDayScheduleSummary("2026-08-05", topics, settings), {
    count: 2,
    capacity: 2,
    isFull: true,
  });
  assert.equal(getScheduleSlots(settings).length, 3);
});
