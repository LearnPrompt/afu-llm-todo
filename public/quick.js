import {
  buildReviewQueue,
  buildScheduleSuggestion,
  buildWeekDays,
  findScheduleConflict,
  formatLocalDate,
  getDayScheduleSummary,
  getScheduleSlots,
  parseLocalDate,
  resolveCalendarProvider,
  shiftWeekAnchor,
  stripTopicPrefix,
  validateScheduleSelection,
} from "./quick-utils.mjs";

const state = {
  topics: [],
  queue: [],
  settings: null,
  lark: null,
  deferredPaths: new Set(),
  reviewedPaths: new Set(),
  processedCount: 0,
  initialCount: 0,
  busy: false,
  view: "review",
  workspaceTab: "scheduled",
  scheduleDraft: null,
  scheduleWeekAnchor: new Date(),
  votingTarget: null,
};

const elements = {
  loadingState: document.querySelector("#loadingState"),
  emptyState: document.querySelector("#emptyState"),
  emptyTitle: document.querySelector("#emptyTitle"),
  emptyCopy: document.querySelector("#emptyCopy"),
  cardDeck: document.querySelector("#cardDeck"),
  currentCard: document.querySelector("#currentCard"),
  nextCard: document.querySelector("#nextCard"),
  actionDock: document.querySelector("#actionDock"),
  priorityBadge: document.querySelector("#priorityBadge"),
  stageBadge: document.querySelector("#stageBadge"),
  topicTitle: document.querySelector("#topicTitle"),
  topicExcerpt: document.querySelector("#topicExcerpt"),
  topicReason: document.querySelector("#topicReason"),
  topicTags: document.querySelector("#topicTags"),
  voteBtn: document.querySelector("#voteBtn"),
  topicUpdated: document.querySelector("#topicUpdated"),
  queuePosition: document.querySelector("#queuePosition"),
  progressText: document.querySelector("#progressText"),
  progressBar: document.querySelector("#progressBar"),
  syncStatus: document.querySelector("#syncStatus"),
  todayHint: document.querySelector("#todayHint"),
  tomorrowHint: document.querySelector("#tomorrowHint"),
  weekHint: document.querySelector("#weekHint"),
  brandKicker: document.querySelector("#brandKicker"),
  brandTitle: document.querySelector("#brandTitle"),
  workspaceLink: document.querySelector("#workspaceLink"),
  workspaceLinkLabel: document.querySelector("#workspaceLinkLabel"),
  workspaceLinkIcon: document.querySelector("#workspaceLinkIcon"),
  workspaceView: document.querySelector("#workspaceView"),
  workspaceTabs: document.querySelectorAll("[data-mobile-workspace-tab]"),
  scheduledWorkspacePanel: document.querySelector("#scheduledWorkspacePanel"),
  pendingWorkspacePanel: document.querySelector("#pendingWorkspacePanel"),
  scheduledWorkspaceList: document.querySelector("#scheduledWorkspaceList"),
  pendingWorkspaceList: document.querySelector("#pendingWorkspaceList"),
  scheduledCount: document.querySelector("#scheduledCount"),
  pendingCount: document.querySelector("#pendingCount"),
  laterBtn: document.querySelector("#laterBtn"),
  rejectBtn: document.querySelector("#rejectBtn"),
  rejectDialog: document.querySelector("#rejectDialog"),
  rejectForm: document.querySelector("#rejectForm"),
  rejectTitle: document.querySelector("#rejectTitle"),
  customRejectReason: document.querySelector("#customRejectReason"),
  cancelRejectBtn: document.querySelector("#cancelRejectBtn"),
  voteDialog: document.querySelector("#voteDialog"),
  voteForm: document.querySelector("#voteForm"),
  voteTitle: document.querySelector("#voteTitle"),
  voteSummary: document.querySelector("#voteSummary"),
  cancelVoteBtn: document.querySelector("#cancelVoteBtn"),
  confirmVoteBtn: document.querySelector("#confirmVoteBtn"),
  reviewLaterBtn: document.querySelector("#reviewLaterBtn"),
  refreshEmptyBtn: document.querySelector("#refreshEmptyBtn"),
  connectionDot: document.querySelector("#connectionDot"),
  connectionText: document.querySelector("#connectionText"),
  toast: document.querySelector("#toast"),
  installHint: document.querySelector("#installHint"),
  dismissInstallHint: document.querySelector("#dismissInstallHint"),
  scheduleButtons: document.querySelectorAll("[data-schedule-kind]"),
  scheduleDialog: document.querySelector("#scheduleDialog"),
  scheduleForm: document.querySelector("#scheduleForm"),
  scheduleTitle: document.querySelector("#scheduleTitle"),
  closeScheduleBtn: document.querySelector("#closeScheduleBtn"),
  cancelScheduleBtn: document.querySelector("#cancelScheduleBtn"),
  prevScheduleWeekBtn: document.querySelector("#prevScheduleWeekBtn"),
  nextScheduleWeekBtn: document.querySelector("#nextScheduleWeekBtn"),
  scheduleWeekLabel: document.querySelector("#scheduleWeekLabel"),
  scheduleWeekDays: document.querySelector("#scheduleWeekDays"),
  scheduleDateJump: document.querySelector("#scheduleDateJump"),
  scheduleTimeSection: document.querySelector("#scheduleTimeSection"),
  selectedDateLabel: document.querySelector("#selectedDateLabel"),
  selectedDateCapacity: document.querySelector("#selectedDateCapacity"),
  scheduleSlotButtons: document.querySelector("#scheduleSlotButtons"),
  customTimeBtn: document.querySelector("#customTimeBtn"),
  customTimeFields: document.querySelector("#customTimeFields"),
  scheduleStart: document.querySelector("#scheduleStart"),
  scheduleEnd: document.querySelector("#scheduleEnd"),
  scheduleError: document.querySelector("#scheduleError"),
  confirmScheduleBtn: document.querySelector("#confirmScheduleBtn"),
};

boot();

async function boot() {
  bindEvents();
  renderInstallHint();
  updateConnectionStatus();
  setView(readViewFromLocation(), { updateHistory: false });
  await loadTopics({ resetSession: true });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/quick-sw.js").catch(() => {});
  }
}

function bindEvents() {
  elements.scheduleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.scheduleKind === "week") {
        openScheduleDialog(state.queue[0], { mode: "schedule" });
        return;
      }
      scheduleCurrentTopic(button.dataset.scheduleKind);
    });
  });
  elements.workspaceLink.addEventListener("click", (event) => {
    event.preventDefault();
    setView(state.view === "workspace" ? "review" : "workspace");
  });
  elements.workspaceTabs.forEach((button) => {
    button.addEventListener("click", () => setWorkspaceTab(button.dataset.mobileWorkspaceTab));
  });
  elements.laterBtn.addEventListener("click", deferCurrentTopic);
  elements.rejectBtn.addEventListener("click", openRejectDialog);
  elements.rejectForm.addEventListener("submit", rejectCurrentTopic);
  elements.cancelRejectBtn.addEventListener("click", () => elements.rejectDialog.close());
  elements.voteBtn.addEventListener("click", () => handleVotingAction(state.queue[0]));
  elements.voteForm.addEventListener("submit", submitVotingTopic);
  elements.cancelVoteBtn.addEventListener("click", closeVoteDialog);
  elements.voteDialog.addEventListener("cancel", (event) => {
    if (state.busy) event.preventDefault();
  });
  elements.voteDialog.addEventListener("close", () => {
    if (!state.busy) state.votingTarget = null;
  });
  elements.reviewLaterBtn.addEventListener("click", reviewDeferredTopics);
  elements.refreshEmptyBtn.addEventListener("click", () => loadTopics({ resetSession: true }));
  elements.dismissInstallHint.addEventListener("click", dismissInstallHint);
  elements.scheduleForm.addEventListener("submit", submitScheduleDialog);
  elements.scheduleDialog.addEventListener("close", () => {
    state.scheduleDraft = null;
  });
  elements.closeScheduleBtn.addEventListener("click", closeScheduleDialog);
  elements.cancelScheduleBtn.addEventListener("click", closeScheduleDialog);
  elements.prevScheduleWeekBtn.addEventListener("click", () => shiftScheduleWeek(-1));
  elements.nextScheduleWeekBtn.addEventListener("click", () => shiftScheduleWeek(1));
  elements.scheduleDateJump.addEventListener("change", selectJumpDate);
  elements.customTimeBtn.addEventListener("click", enableCustomTime);
  elements.scheduleStart.addEventListener("input", updateCustomTime);
  elements.scheduleEnd.addEventListener("input", updateCustomTime);
  bindWeekSwipe();
  window.addEventListener("popstate", () => setView(readViewFromLocation(), { updateHistory: false }));
  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);
}

function readViewFromLocation() {
  return new URL(window.location.href).searchParams.get("view") === "workspace"
    ? "workspace"
    : "review";
}

function setView(view, { updateHistory = true } = {}) {
  state.view = view === "workspace" ? "workspace" : "review";
  const isWorkspace = state.view === "workspace";
  document.body.classList.toggle("is-workspace-view", isWorkspace);
  elements.workspaceView.hidden = !isWorkspace;
  elements.workspaceLinkLabel.textContent = isWorkspace ? "过卡" : "工作台";
  elements.workspaceLinkIcon.textContent = isWorkspace ? "←" : "↗";
  elements.workspaceLink.setAttribute("aria-label", isWorkspace ? "返回快速过卡" : "打开手机工作台");
  elements.brandKicker.textContent = isWorkspace ? "AFU · MOBILE WORKSPACE" : "AFU · QUICK REVIEW";
  elements.brandTitle.textContent = isWorkspace ? "手机工作台" : "快速过卡";
  document.title = isWorkspace ? "阿福 Quick · 手机工作台" : "阿福 Quick · 快速过卡";

  if (updateHistory) {
    const url = new URL(window.location.href);
    if (isWorkspace) url.searchParams.set("view", "workspace");
    else url.searchParams.delete("view");
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  if (isWorkspace) renderWorkspace();
}

function setWorkspaceTab(tab) {
  state.workspaceTab = tab === "pending" ? "pending" : "scheduled";
  elements.workspaceTabs.forEach((button) => {
    const active = button.dataset.mobileWorkspaceTab === state.workspaceTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  elements.scheduledWorkspacePanel.hidden = state.workspaceTab !== "scheduled";
  elements.pendingWorkspacePanel.hidden = state.workspaceTab !== "pending";
}

async function loadTopics({ resetSession = false } = {}) {
  setBusy(true);
  if (resetSession) {
    state.deferredPaths.clear();
    state.reviewedPaths.clear();
    state.processedCount = 0;
  }

  try {
    const response = await fetch("/api/topics", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "加载待排期卡片失败");

    state.topics = payload.topics || [];
    state.settings = payload.settings || null;
    state.lark = payload.lark || null;
    rebuildQueue();
    if (resetSession) state.initialCount = state.queue.length;
    render();
    setConnection(true, buildSyncLabel());
  } catch (error) {
    renderLoadError(error.message);
    setConnection(false, "连接不到 Afu 服务");
  } finally {
    setBusy(false);
  }
}

function rebuildQueue() {
  state.queue = buildReviewQueue(state.topics)
    .filter((topic) => !state.deferredPaths.has(topic.path) && !state.reviewedPaths.has(topic.path));
}

function render() {
  const current = state.queue[0];
  const hasCard = Boolean(current);
  renderWorkspace();
  elements.loadingState.hidden = true;
  elements.emptyState.hidden = hasCard;
  elements.cardDeck.hidden = !hasCard;
  elements.actionDock.hidden = !hasCard;
  renderProgress();

  if (!current) {
    renderEmptyState();
    return;
  }

  elements.currentCard.classList.remove("is-leaving");
  elements.priorityBadge.textContent = `优先 · ${current.priority || "普通"}`;
  elements.stageBadge.textContent = current.stage || "待排期";
  elements.topicTitle.textContent = stripTopicPrefix(current.title) || "未命名 Todo";
  elements.topicExcerpt.textContent = current.excerpt || "这张卡还没有摘要，先根据标题判断是否值得排进日历。";
  elements.topicUpdated.textContent = current.updated ? `更新于 ${current.updated}` : "等待判断";
  elements.queuePosition.textContent = `剩余 ${state.queue.length} 张`;
  elements.voteBtn.hidden = !hasLarkVotingPool() && !getVotingDestinationUrl(current);
  elements.voteBtn.textContent = hasSubmittedVoting(current) ? "打开团队投票 ↗" : "送团队投票";

  const reason = String(current.llmTodoReason || "").trim();
  elements.topicReason.hidden = !reason;
  elements.topicReason.querySelector("p").textContent = reason;

  elements.topicTags.innerHTML = "";
  const tags = [...(current.tags || []), ...(current.targetForms || [])]
    .filter(Boolean)
    .slice(0, 4);
  for (const tag of tags) {
    const chip = document.createElement("span");
    chip.textContent = tag;
    elements.topicTags.append(chip);
  }

  const next = state.queue[1];
  elements.nextCard.textContent = next ? stripTopicPrefix(next.title) : "";
  renderScheduleHints();
}

function renderProgress() {
  const remaining = state.queue.length;
  const deferred = state.deferredPaths.size;
  const total = Math.max(state.initialCount, state.processedCount + remaining + deferred);
  const finished = Math.min(total, state.processedCount + deferred);
  const progress = total ? Math.round((finished / total) * 100) : 100;

  elements.progressText.textContent = remaining
    ? `还剩 ${remaining} 张`
    : "本轮已过完";
  elements.progressBar.style.width = `${progress}%`;
}

function renderEmptyState() {
  const deferredCount = state.deferredPaths.size;
  elements.emptyTitle.textContent = deferredCount ? "先到这里" : "桌面清爽了";
  elements.emptyCopy.textContent = deferredCount
    ? `已处理 ${state.processedCount} 张，另有 ${deferredCount} 张在本轮跳过。`
    : state.processedCount
      ? `这轮处理了 ${state.processedCount} 张卡片。`
      : "没有待排期卡片。";
  elements.reviewLaterBtn.hidden = deferredCount === 0;
}

function renderWorkspace() {
  if (!elements.workspaceView) return;
  const today = formatLocalDate(new Date());
  const terminalStages = new Set(["已发布", "已拒绝", "已归档"]);
  const scheduled = state.topics
    .filter((topic) => (
      topic.scheduledDate
      && topic.scheduledDate >= today
      && !terminalStages.has(topic.stage)
    ))
    .sort((left, right) => (
      `${left.scheduledDate} ${left.scheduledStart || ""}`
        .localeCompare(`${right.scheduledDate} ${right.scheduledStart || ""}`)
    ));
  const pending = buildReviewQueue(state.topics);

  elements.scheduledCount.textContent = String(scheduled.length);
  elements.pendingCount.textContent = String(pending.length);
  elements.scheduledWorkspaceList.replaceChildren();
  elements.pendingWorkspaceList.replaceChildren();

  if (!scheduled.length) {
    elements.scheduledWorkspaceList.append(createWorkspaceEmpty("未来还没有已排期卡片。"));
  } else {
    let currentDate = "";
    for (const topic of scheduled) {
      if (topic.scheduledDate !== currentDate) {
        currentDate = topic.scheduledDate;
        const heading = document.createElement("h3");
        heading.className = "workspace-date-heading";
        heading.textContent = formatAgendaDate(currentDate);
        elements.scheduledWorkspaceList.append(heading);
      }
      elements.scheduledWorkspaceList.append(createWorkspaceTopicCard(topic, { scheduled: true }));
    }
  }

  if (!pending.length) {
    elements.pendingWorkspaceList.append(createWorkspaceEmpty("没有待处理卡片。"));
  } else {
    for (const topic of pending) {
      elements.pendingWorkspaceList.append(createWorkspaceTopicCard(topic, { scheduled: false }));
    }
  }

  setWorkspaceTab(state.workspaceTab);
}

function createWorkspaceEmpty(message) {
  const empty = document.createElement("div");
  empty.className = "workspace-empty";
  empty.textContent = message;
  return empty;
}

function createWorkspaceTopicCard(topic, { scheduled }) {
  const card = document.createElement("article");
  card.className = "workspace-topic-card";

  const top = document.createElement("div");
  top.className = "workspace-topic-top";
  const priority = document.createElement("span");
  priority.textContent = topic.priority ? `优先 · ${topic.priority}` : "普通优先级";
  const stage = document.createElement("span");
  stage.textContent = topic.stage || (scheduled ? "已排期" : "待排期");
  top.append(priority, stage);

  const title = document.createElement("h3");
  title.textContent = stripTopicPrefix(topic.title) || "未命名 Todo";
  const meta = document.createElement("p");
  meta.className = "workspace-topic-meta";
  meta.textContent = scheduled
    ? `${topic.scheduledStart || "未设时间"}${topic.scheduledEnd ? `–${topic.scheduledEnd}` : ""}`
    : (topic.excerpt || "等待排期");

  const actions = document.createElement("div");
  actions.className = "workspace-topic-actions";
  if (scheduled) {
    const reschedule = createWorkspaceAction("改期", "primary");
    reschedule.addEventListener("click", () => openScheduleDialog(topic, { mode: "reschedule" }));
    const unschedule = createWorkspaceAction("取消排期", "secondary");
    unschedule.addEventListener("click", () => unscheduleWorkspaceTopic(topic));
    actions.append(reschedule, unschedule);
  } else {
    const schedule = createWorkspaceAction("选择日期和时间", "primary");
    schedule.addEventListener("click", () => openScheduleDialog(topic, { mode: "schedule" }));
    actions.append(schedule);
  }

  if (hasLarkVotingPool() || getVotingDestinationUrl(topic)) {
    const vote = createWorkspaceAction(hasSubmittedVoting(topic) ? "打开投票" : "送团队投票", "secondary");
    vote.addEventListener("click", () => handleVotingAction(topic));
    actions.append(vote);
  }

  card.append(top, title, meta, actions);
  return card;
}

function createWorkspaceAction(label, tone) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `workspace-action is-${tone}`;
  button.textContent = label;
  button.disabled = state.busy;
  return button;
}

function formatAgendaDate(value) {
  const date = parseLocalDate(value);
  if (!date) return value;
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${weekday}`;
}

async function unscheduleWorkspaceTopic(topic) {
  if (state.busy) return;
  const confirmed = window.confirm(`取消“${stripTopicPrefix(topic.title)}”的排期？关联日历事件也会一并删除。`);
  if (!confirmed) return;

  setBusy(true);
  try {
    const data = await postJson("/api/topics/unschedule", {
      path: topic.path,
      removeFromCalendar: true,
    });
    await refreshAfterAction();
    showToast(withOperationWarnings("已取消排期", data.warnings));
    vibrate();
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

function hasLarkVotingPool() {
  return Boolean(String(state.settings?.larkVotingBaseUrl || "").trim());
}

function hasSubmittedVoting(topic) {
  return Boolean(topic?.larkVotingRecordId || topic?.larkVotingDocId || topic?.larkVotingDocUrl);
}

function getVotingDestinationUrl(topic) {
  return String(state.settings?.larkVotingBaseUrl || topic?.larkVotingDocUrl || "").trim();
}

function handleVotingAction(topic) {
  if (!topic || state.busy || elements.voteDialog.open) return;
  const destinationUrl = getVotingDestinationUrl(topic);
  if (hasSubmittedVoting(topic) && destinationUrl) {
    window.open(destinationUrl, "_blank", "noopener,noreferrer");
    return;
  }
  if (!hasLarkVotingPool()) {
    showToast("请先在桌面端工作区设置中配置团队投票池");
    return;
  }

  state.votingTarget = topic;
  const title = stripTopicPrefix(topic.title) || "未命名 Todo";
  const excerpt = String(topic.excerpt || "").trim();
  const suggestedSummary = excerpt && excerpt !== "选题判断" && excerpt !== "暂无摘要" ? excerpt : title;
  elements.voteTitle.textContent = title;
  elements.voteSummary.value = topic.larkVotingSummary || suggestedSummary;
  elements.voteDialog.showModal();
  elements.voteSummary.focus();
  elements.voteSummary.select();
}

function closeVoteDialog() {
  if (state.busy) return;
  elements.voteDialog.close();
  state.votingTarget = null;
}

async function submitVotingTopic(event) {
  event.preventDefault();
  const topic = state.votingTarget;
  const summary = elements.voteSummary.value.trim();
  if (!topic || state.busy) return;
  if (!summary) {
    elements.voteSummary.focus();
    return;
  }

  const wasCurrentReviewCard = state.queue[0]?.path === topic.path;
  setBusy(true);
  try {
    const data = await postJson("/api/topics/lark-voting", { path: topic.path, summary });
    if (wasCurrentReviewCard) {
      state.reviewedPaths.add(topic.path);
      await animateCardAway();
      state.processedCount += 1;
    }
    elements.voteDialog.close();
    state.votingTarget = null;
    await refreshAfterAction();
    showToast(withOperationWarnings("已送进团队投票池", data.warnings));
    vibrate();
  } catch (error) {
    elements.currentCard.classList.remove("is-leaving");
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

function renderScheduleHints() {
  const suggestions = {
    today: buildScheduleSuggestion("today", state.topics, state.settings, new Date()),
    tomorrow: buildScheduleSuggestion("tomorrow", state.topics, state.settings, new Date()),
  };

  renderSuggestion("today", suggestions.today, elements.todayHint, "今天无空档");
  renderSuggestion("tomorrow", suggestions.tomorrow, elements.tomorrowHint, "明天无空档");
  const weekButton = document.querySelector('[data-schedule-kind="week"]');
  weekButton.disabled = state.busy;
  elements.weekHint.textContent = "选择日期";
}

function renderSuggestion(kind, suggestion, hint, emptyLabel) {
  const button = document.querySelector(`[data-schedule-kind="${kind}"]`);
  button.disabled = state.busy || !suggestion;
  if (!suggestion) {
    hint.textContent = emptyLabel;
    return;
  }

  hint.textContent = suggestion.start;
}

function openScheduleDialog(topic, { mode = "schedule" } = {}) {
  if (!topic || state.busy) return;
  const isReschedule = mode === "reschedule" && Boolean(topic.scheduledDate);
  const slots = getScheduleSlots(state.settings);
  const selectedSlot = slots.find((slot) => (
    slot.start === topic.scheduledStart && slot.end === topic.scheduledEnd
  ));
  const selectedDate = isReschedule ? topic.scheduledDate : "";

  state.scheduleDraft = {
    path: topic.path,
    title: stripTopicPrefix(topic.title) || "未命名 Todo",
    mode: isReschedule ? "reschedule" : "schedule",
    date: selectedDate,
    start: isReschedule ? (topic.scheduledStart || "") : "",
    end: isReschedule ? (topic.scheduledEnd || "") : "",
    customTime: isReschedule && !selectedSlot,
    showError: false,
    serverError: "",
  };
  state.scheduleWeekAnchor = parseLocalDate(selectedDate) || new Date();
  elements.scheduleDateJump.min = formatLocalDate(new Date());
  elements.scheduleDateJump.value = selectedDate;
  elements.scheduleTitle.textContent = isReschedule ? `改期 · ${state.scheduleDraft.title}` : "先选日期，再选时间";
  renderScheduleDialog();
  elements.scheduleDialog.showModal();
}

function closeScheduleDialog() {
  if (elements.scheduleDialog.open) elements.scheduleDialog.close();
  state.scheduleDraft = null;
}

function shiftScheduleWeek(amount) {
  if (!state.scheduleDraft) return;
  const nextAnchor = shiftWeekAnchor(state.scheduleWeekAnchor, amount);
  const days = buildWeekDays(nextAnchor, new Date(), state.scheduleDraft.date);
  if (amount < 0 && days.every((day) => day.isPast)) return;
  state.scheduleWeekAnchor = nextAnchor;
  renderScheduleDialog();
}

function selectJumpDate() {
  if (!state.scheduleDraft) return;
  const date = parseLocalDate(elements.scheduleDateJump.value);
  if (!date || elements.scheduleDateJump.value < formatLocalDate(new Date())) return;
  state.scheduleWeekAnchor = date;
  selectScheduleDate(elements.scheduleDateJump.value);
}

function selectScheduleDate(date) {
  if (!state.scheduleDraft || date < formatLocalDate(new Date())) return;
  const changed = state.scheduleDraft.date !== date;
  state.scheduleDraft.date = date;
  state.scheduleDraft.showError = false;
  state.scheduleDraft.serverError = "";
  elements.scheduleDateJump.value = date;
  if (changed) {
    state.scheduleDraft.start = "";
    state.scheduleDraft.end = "";
    state.scheduleDraft.customTime = false;
  }
  renderScheduleDialog();
}

function renderScheduleDialog() {
  if (!state.scheduleDraft) return;
  const now = new Date();
  const days = buildWeekDays(state.scheduleWeekAnchor, now, state.scheduleDraft.date);
  const previousDays = buildWeekDays(shiftWeekAnchor(state.scheduleWeekAnchor, -1), now);
  elements.scheduleWeekLabel.textContent = `${days[0].month}月${days[0].day}日 – ${days[6].month}月${days[6].day}日`;
  elements.prevScheduleWeekBtn.disabled = previousDays.every((day) => day.isPast);
  elements.scheduleWeekDays.replaceChildren();

  for (const day of days) {
    const summary = getDayScheduleSummary(day.date, state.topics, state.settings, state.scheduleDraft.path);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "week-day";
    button.classList.toggle("is-today", day.isToday);
    button.classList.toggle("is-selected", day.isSelected);
    button.classList.toggle("is-full", summary.isFull);
    button.disabled = day.isPast;
    button.setAttribute("aria-pressed", String(day.isSelected));
    button.setAttribute("aria-label", `${day.weekday} ${day.month}月${day.day}日，已排 ${summary.count} 项`);

    const weekday = document.createElement("span");
    weekday.textContent = day.weekday.replace("周", "");
    const date = document.createElement("strong");
    date.textContent = String(day.day);
    const capacity = document.createElement("small");
    capacity.textContent = `${summary.count}/${summary.capacity}`;
    button.append(weekday, date, capacity);
    button.addEventListener("click", () => selectScheduleDate(day.date));
    elements.scheduleWeekDays.append(button);
  }

  renderScheduleTimeSection(now);
}

function renderScheduleTimeSection(now = new Date()) {
  const draft = state.scheduleDraft;
  if (!draft) return;
  elements.scheduleTimeSection.hidden = !draft.date;
  if (!draft.date) {
    updateScheduleValidation();
    return;
  }

  const summary = getDayScheduleSummary(draft.date, state.topics, state.settings, draft.path);
  elements.selectedDateLabel.textContent = formatAgendaDate(draft.date);
  elements.selectedDateCapacity.textContent = summary.isFull
    ? `已排 ${summary.count}/${summary.capacity} · 已满，可明确覆盖`
    : `已排 ${summary.count}/${summary.capacity}`;
  elements.selectedDateCapacity.classList.toggle("is-full", summary.isFull);
  elements.scheduleSlotButtons.replaceChildren();

  for (const slot of getScheduleSlots(state.settings)) {
    const selection = {
      date: draft.date,
      start: slot.start,
      end: slot.end,
      path: draft.path,
    };
    const conflict = findScheduleConflict(selection, state.topics);
    const validationError = validateScheduleSelection(selection, state.topics, now);
    const unavailable = Boolean(conflict) || validationError === "这个时间已经过去了";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "schedule-slot";
    button.classList.toggle("is-active", !draft.customTime && draft.start === slot.start && draft.end === slot.end);
    button.disabled = unavailable;
    button.textContent = unavailable
      ? `${slot.label} · 不可用`
      : `${slot.label} · ${slot.start}`;
    button.addEventListener("click", () => {
      draft.start = slot.start;
      draft.end = slot.end;
      draft.customTime = false;
      draft.showError = false;
      draft.serverError = "";
      renderScheduleTimeSection();
    });
    elements.scheduleSlotButtons.append(button);
  }

  elements.customTimeBtn.classList.toggle("is-active", draft.customTime);
  elements.customTimeFields.hidden = !draft.customTime;
  elements.scheduleStart.value = draft.start;
  elements.scheduleEnd.value = draft.end;
  updateScheduleValidation();
}

function enableCustomTime() {
  const draft = state.scheduleDraft;
  if (!draft) return;
  draft.customTime = true;
  draft.start = "";
  draft.end = "";
  draft.showError = false;
  draft.serverError = "";
  renderScheduleTimeSection();
  elements.scheduleStart.focus();
}

function updateCustomTime() {
  const draft = state.scheduleDraft;
  if (!draft) return;
  draft.start = elements.scheduleStart.value;
  draft.end = elements.scheduleEnd.value;
  draft.showError = false;
  draft.serverError = "";
  updateScheduleValidation();
}

function updateScheduleValidation() {
  const draft = state.scheduleDraft;
  if (!draft) return;
  const validationError = validateScheduleSelection(draft, state.topics, new Date());
  const displayError = draft.serverError || validationError;
  elements.confirmScheduleBtn.disabled = state.busy || Boolean(validationError);
  elements.scheduleError.hidden = !draft.showError || !displayError;
  elements.scheduleError.textContent = displayError;
}

async function submitScheduleDialog(event) {
  event.preventDefault();
  const draft = state.scheduleDraft;
  if (!draft || state.busy) return;
  const error = validateScheduleSelection(draft, state.topics, new Date());
  if (error) {
    draft.showError = true;
    updateScheduleValidation();
    return;
  }

  const wasCurrentReviewCard = state.queue[0]?.path === draft.path;
  const successLabel = `${formatAgendaDate(draft.date)} ${draft.start}`;
  draft.serverError = "";
  setBusy(true);
  try {
    const data = await postJson("/api/topics/schedule", {
      path: draft.path,
      scheduledDate: draft.date,
      scheduledStart: draft.start,
      scheduledEnd: draft.end,
      calendarProvider: resolveCalendarProvider(state.settings, state.lark),
    });
    if (wasCurrentReviewCard) {
      await animateCardAway();
      state.processedCount += 1;
    }
    closeScheduleDialog();
    await refreshAfterAction();
    showToast(withOperationWarnings(`已排到 ${successLabel}`, data.warnings));
    vibrate();
  } catch (submitError) {
    elements.currentCard.classList.remove("is-leaving");
    if (state.scheduleDraft) {
      state.scheduleDraft.showError = true;
      state.scheduleDraft.serverError = submitError.message;
    }
  } finally {
    setBusy(false);
    if (elements.scheduleDialog.open) renderScheduleDialog();
  }
}

function bindWeekSwipe() {
  let touchStartX = null;
  elements.scheduleWeekDays.addEventListener("touchstart", (event) => {
    touchStartX = event.changedTouches[0]?.clientX ?? null;
  }, { passive: true });
  elements.scheduleWeekDays.addEventListener("touchend", (event) => {
    if (touchStartX === null) return;
    const touchEndX = event.changedTouches[0]?.clientX ?? touchStartX;
    const delta = touchEndX - touchStartX;
    touchStartX = null;
    if (Math.abs(delta) < 55) return;
    shiftScheduleWeek(delta < 0 ? 1 : -1);
  }, { passive: true });
}

async function scheduleCurrentTopic(kind) {
  const topic = state.queue[0];
  const suggestion = buildScheduleSuggestion(kind, state.topics, state.settings, new Date());
  if (!topic || !suggestion || state.busy) return;

  setBusy(true);
  try {
    const data = await postJson("/api/topics/schedule", {
      path: topic.path,
      scheduledDate: suggestion.date,
      scheduledStart: suggestion.start,
      scheduledEnd: suggestion.end,
      calendarProvider: resolveCalendarProvider(state.settings, state.lark),
    });
    await animateCardAway();
    state.processedCount += 1;
    await refreshAfterAction();
    const capacityNote = suggestion.overRecommendedCapacity ? "，已超过推荐容量" : "";
    showToast(withOperationWarnings(`已排到${suggestion.dayLabel} ${suggestion.start}${capacityNote}`, data.warnings));
    vibrate();
  } catch (error) {
    elements.currentCard.classList.remove("is-leaving");
    showToast(error.message);
  } finally {
    setBusy(false);
    renderScheduleHints();
  }
}

function deferCurrentTopic() {
  const topic = state.queue[0];
  if (!topic || state.busy) return;

  state.deferredPaths.add(topic.path);
  state.queue.shift();
  render();
  showToast("已跳过，本轮不再出现");
  vibrate();
}

function reviewDeferredTopics() {
  state.deferredPaths.clear();
  rebuildQueue();
  state.initialCount = state.processedCount + state.queue.length;
  render();
}

function openRejectDialog() {
  const topic = state.queue[0];
  if (!topic || state.busy) return;
  elements.rejectTitle.textContent = stripTopicPrefix(topic.title);
  elements.customRejectReason.value = "";
  elements.rejectForm.querySelector('input[name="rejectReason"][value="现在不值得做"]').checked = true;
  elements.rejectDialog.showModal();
}

async function rejectCurrentTopic(event) {
  event.preventDefault();
  const topic = state.queue[0];
  if (!topic || state.busy) return;

  const customReason = elements.customRejectReason.value.trim();
  const selectedReason = new FormData(elements.rejectForm).get("rejectReason");
  const reason = customReason || selectedReason || "手机快速过卡：暂不采用";

  elements.rejectDialog.close();
  setBusy(true);
  try {
    await postJson("/api/topics/disposition", {
      path: topic.path,
      action: "拒绝",
      reason,
      removeFromCalendar: false,
    });
    await animateCardAway();
    state.processedCount += 1;
    await refreshAfterAction();
    showToast("已拒绝并写回原因");
    vibrate();
  } catch (error) {
    elements.currentCard.classList.remove("is-leaving");
    showToast(error.message);
  } finally {
    setBusy(false);
    renderScheduleHints();
  }
}

async function refreshAfterAction() {
  const response = await fetch("/api/topics", {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "刷新失败");
  state.topics = payload.topics || [];
  state.settings = payload.settings || null;
  state.lark = payload.lark || null;
  rebuildQueue();
  render();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "操作失败");
  return data;
}

function setBusy(busy) {
  state.busy = busy;
  if (busy) {
    elements.scheduleButtons.forEach((button) => {
      button.disabled = true;
    });
  } else if (state.queue.length) {
    renderScheduleHints();
  }
  elements.laterBtn.disabled = busy;
  elements.rejectBtn.disabled = busy;
  elements.voteBtn.disabled = busy;
  elements.confirmVoteBtn.disabled = busy;
  elements.workspaceView.querySelectorAll(".workspace-action").forEach((button) => {
    button.disabled = busy;
  });
  if (state.scheduleDraft) updateScheduleValidation();
}

function animateCardAway() {
  elements.currentCard.classList.add("is-leaving");
  return new Promise((resolve) => window.setTimeout(resolve, 180));
}

function renderLoadError(message) {
  elements.loadingState.hidden = true;
  elements.cardDeck.hidden = true;
  elements.actionDock.hidden = true;
  elements.emptyState.hidden = false;
  elements.emptyTitle.textContent = "阿福没接上";
  elements.emptyCopy.textContent = `${message}。确认 Mac mini 和 Tailscale 在线后再试。`;
  elements.reviewLaterBtn.hidden = true;
  elements.progressText.textContent = "连接失败";
  elements.syncStatus.textContent = "服务不可用";
}

function buildSyncLabel() {
  const provider = resolveCalendarProvider(state.settings, state.lark);
  if (provider === "lark") return "排期同步到飞书";
  if (provider === "macos") return "排期同步到 macOS 日历";
  if (state.settings?.calendarProvider === "lark") return "飞书未连接，仅写 Markdown";
  return "排期写回 Markdown";
}

function updateConnectionStatus() {
  if (!navigator.onLine) {
    setConnection(false, "手机当前离线");
    return;
  }
  elements.connectionDot.className = "connection-dot";
  elements.connectionText.textContent = "正在连接 Mac mini";
}

function setConnection(online, label) {
  elements.connectionDot.className = `connection-dot ${online ? "is-online" : "is-offline"}`;
  elements.connectionText.textContent = label;
  elements.syncStatus.textContent = label;
}

function renderInstallHint() {
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const dismissed = window.localStorage.getItem("afu.quick.install-hint-dismissed") === "1";
  elements.installHint.hidden = isStandalone || dismissed;
}

function dismissInstallHint() {
  window.localStorage.setItem("afu.quick.install-hint-dismissed", "1");
  elements.installHint.hidden = true;
}

let toastTimer = null;
function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 2200);
}

function withOperationWarnings(message, warnings) {
  return Array.isArray(warnings) && warnings.length
    ? `${message}；${warnings.join("；")}`
    : message;
}

function vibrate() {
  navigator.vibrate?.(12);
}
