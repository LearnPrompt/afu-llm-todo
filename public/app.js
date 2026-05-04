const BACKLOG_PAGE_SIZE_KEY = "topic-planner.backlog-page-size";
const INBOX_PAGE_SIZE_KEY = "topic-planner.inbox-page-size";
const DEFAULT_BACKLOG_PAGE_SIZE = 3;
const DEFAULT_INBOX_PAGE_SIZE = 20;
const DEFAULT_WIKI_TODO_PAGE_SIZE = 20;
const RECOMMENDED_DAILY_CAPACITY = 2;
const DEFAULT_SCHEDULE_TIME_SLOTS = [
  { label: "上午深度", start: "09:30", end: "11:00" },
  { label: "下午制作", start: "14:00", end: "15:30" },
  { label: "晚上发布", start: "20:00", end: "20:30" },
];

const state = {
  topics: [],
  inboxCandidates: [],
  inboxSummary: null,
  wikiTodos: [],
  diagnostics: null,
  diagnosticsExpanded: false,
  settings: null,
  configPath: "",
  lark: null,
  larkAuthFlow: null,
  weekOffset: 0,
  search: "",
  stageFilter: "",
  backlogPage: 1,
  backlogPageSize: readStoredBacklogPageSize(),
  inboxPage: 1,
  inboxPageSize: readStoredInboxPageSize(),
  selectedInboxPaths: new Set(),
  wikiBatchSourcePaths: [],
  wikiBatchTitles: [],
  wikiTodoPage: 1,
  wikiTodoPageSize: DEFAULT_WIKI_TODO_PAGE_SIZE,
  lastCreatedTopic: null,
  recentTopicPaths: [],
  toast: null,
  workspaceView: "inbox",
  scheduleTarget: null,
  disposeTarget: null,
};

const elements = {
  backlogPanel: document.querySelector(".backlog-panel"),
  workspaceTabs: document.querySelectorAll("[data-workspace-view]"),
  workspacePanels: document.querySelectorAll("[data-view-panel]"),
  backlogList: document.querySelector("#backlogList"),
  inboxCandidateList: document.querySelector("#inboxCandidateList"),
  inboxHint: document.querySelector("#inboxHint"),
  inboxPrevBtn: document.querySelector("#inboxPrevBtn"),
  inboxNextBtn: document.querySelector("#inboxNextBtn"),
  inboxPageInfo: document.querySelector("#inboxPageInfo"),
  inboxWindowInfo: document.querySelector("#inboxWindowInfo"),
  inboxPageSize: document.querySelector("#inboxPageSize"),
  inboxSelectPageBtn: document.querySelector("#inboxSelectPageBtn"),
  inboxImportBatchBtn: document.querySelector("#inboxImportBatchBtn"),
  inboxWikiBatchBtn: document.querySelector("#inboxWikiBatchBtn"),
  inboxBatchInfo: document.querySelector("#inboxBatchInfo"),
  backlogPrevBtn: document.querySelector("#backlogPrevBtn"),
  backlogNextBtn: document.querySelector("#backlogNextBtn"),
  backlogPageInfo: document.querySelector("#backlogPageInfo"),
  backlogWindowInfo: document.querySelector("#backlogWindowInfo"),
  backlogPageSize: document.querySelector("#backlogPageSize"),
  backlogHint: document.querySelector("#backlogHint"),
  calendarGrid: document.querySelector("#calendarGrid"),
  searchInput: document.querySelector("#searchInput"),
  stageFilter: document.querySelector("#stageFilter"),
  weekLabel: document.querySelector("#weekLabel"),
  larkStatus: document.querySelector("#larkStatus"),
  plannerSettingsForm: document.querySelector("#plannerSettingsForm"),
  plannerVaultRoot: document.querySelector("#plannerVaultRoot"),
  plannerTopicDir: document.querySelector("#plannerTopicDir"),
  plannerInboxDir: document.querySelector("#plannerInboxDir"),
  plannerArchiveDir: document.querySelector("#plannerArchiveDir"),
  plannerCalendarProvider: document.querySelector("#plannerCalendarProvider"),
  larkSetupPanel: document.querySelector("#larkSetupPanel"),
  larkSetupStatus: document.querySelector("#larkSetupStatus"),
  larkSetupBadge: document.querySelector("#larkSetupBadge"),
  larkSetupAccount: document.querySelector("#larkSetupAccount"),
  larkSetupAuthBtn: document.querySelector("#larkSetupAuthBtn"),
  larkSetupDetails: document.querySelector("#larkSetupDetails"),
  copyLarkConfigBtn: document.querySelector("#copyLarkConfigBtn"),
  copyLarkAuthBtn: document.querySelector("#copyLarkAuthBtn"),
  plannerMacosCalendarName: document.querySelector("#plannerMacosCalendarName"),
  plannerWikiMode: document.querySelector("#plannerWikiMode"),
  plannerWikiDir: document.querySelector("#plannerWikiDir"),
  plannerDailyCapacity: document.querySelector("#plannerDailyCapacity"),
  plannerSettingsHint: document.querySelector("#plannerSettingsHint"),
  diagnosticsBtn: document.querySelector("#diagnosticsBtn"),
  diagnosticsPanel: document.querySelector("#diagnosticsPanel"),
  wikiCompileBtn: document.querySelector("#wikiCompileBtn"),
  wikiTodoBtn: document.querySelector("#wikiTodoBtn"),
  wikiHint: document.querySelector("#wikiHint"),
  wikiResult: document.querySelector("#wikiResult"),
  wikiTodoList: document.querySelector("#wikiTodoList"),
  larkRepairBtn: document.querySelector("#larkRepairBtn"),
  workspaceKind: document.querySelector("#workspaceKind"),
  workspaceConfigPath: document.querySelector("#workspaceConfigPath"),
  backlogCount: document.querySelector("#backlogCount"),
  inboxCandidateCount: document.querySelector("#inboxCandidateCount"),
  weekScheduledCount: document.querySelector("#weekScheduledCount"),
  refreshBtn: document.querySelector("#refreshBtn"),
  prevWeekBtn: document.querySelector("#prevWeekBtn"),
  nextWeekBtn: document.querySelector("#nextWeekBtn"),
  scheduleDialog: document.querySelector("#scheduleDialog"),
  scheduleForm: document.querySelector("#scheduleForm"),
  scheduleTitle: document.querySelector("#scheduleTitle"),
  scheduleDate: document.querySelector("#scheduleDate"),
  scheduleStart: document.querySelector("#scheduleStart"),
  scheduleEnd: document.querySelector("#scheduleEnd"),
  scheduleSlotButtons: document.querySelector("#scheduleSlotButtons"),
  scheduleCalendarProvider: document.querySelector("#scheduleCalendarProvider"),
  scheduleCalendarHint: document.querySelector("#scheduleCalendarHint"),
  disposeDialog: document.querySelector("#disposeDialog"),
  disposeForm: document.querySelector("#disposeForm"),
  disposeTitle: document.querySelector("#disposeTitle"),
  disposeAction: document.querySelector("#disposeAction"),
  disposeReason: document.querySelector("#disposeReason"),
  disposeSync: document.querySelector("#disposeSync"),
  larkAuthDialog: document.querySelector("#larkAuthDialog"),
  larkAuthMessage: document.querySelector("#larkAuthMessage"),
  larkAuthCode: document.querySelector("#larkAuthCode"),
  larkAuthLink: document.querySelector("#larkAuthLink"),
  larkAuthExpires: document.querySelector("#larkAuthExpires"),
  larkAuthCompleteBtn: document.querySelector("#larkAuthCompleteBtn"),
  copyLarkAuthCodeBtn: document.querySelector("#copyLarkAuthCodeBtn"),
  topicCardTemplate: document.querySelector("#topicCardTemplate"),
  appToast: document.querySelector("#appToast"),
};

boot();

async function boot() {
  elements.backlogPageSize.value = String(state.backlogPageSize);
  elements.inboxPageSize.value = String(state.inboxPageSize);
  bindEvents();
  await loadTopics();
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    state.backlogPage = 1;
    render();
  });

  elements.stageFilter.addEventListener("change", (event) => {
    state.stageFilter = event.target.value;
    state.backlogPage = 1;
    render();
  });

  elements.backlogPrevBtn.addEventListener("click", () => {
    state.backlogPage = Math.max(1, state.backlogPage - 1);
    renderBacklog();
  });

  elements.backlogNextBtn.addEventListener("click", () => {
    state.backlogPage += 1;
    renderBacklog();
  });

  elements.backlogPageSize.addEventListener("change", (event) => {
    state.backlogPageSize = Number(event.target.value) || DEFAULT_BACKLOG_PAGE_SIZE;
    state.backlogPage = 1;
    window.localStorage.setItem(BACKLOG_PAGE_SIZE_KEY, String(state.backlogPageSize));
    renderBacklog();
  });

  elements.workspaceTabs.forEach((button) => {
    button.addEventListener("click", () => setWorkspaceView(button.dataset.workspaceView));
  });

  elements.inboxPrevBtn?.addEventListener("click", () => {
    state.inboxPage = Math.max(1, state.inboxPage - 1);
    renderInboxCandidates();
  });

  elements.inboxNextBtn?.addEventListener("click", () => {
    state.inboxPage += 1;
    renderInboxCandidates();
  });

  elements.inboxPageSize?.addEventListener("change", (event) => {
    state.inboxPageSize = readInboxPageSizeValue(event.target.value);
    state.inboxPage = 1;
    window.localStorage.setItem(INBOX_PAGE_SIZE_KEY, String(state.inboxPageSize));
    renderInboxCandidates();
  });

  elements.inboxSelectPageBtn?.addEventListener("click", () => toggleSelectCurrentInboxPage());
  elements.inboxImportBatchBtn?.addEventListener("click", () => importSelectedInboxCandidates());
  elements.inboxWikiBatchBtn?.addEventListener("click", () => captureWikiBatchFromInbox());

  elements.refreshBtn.addEventListener("click", () => loadTopics());
  elements.diagnosticsBtn?.addEventListener("click", () => toggleDiagnostics());
  elements.wikiCompileBtn?.addEventListener("click", () => compileWikiPacket());
  elements.wikiTodoBtn?.addEventListener("click", () => generateWikiTodos());
  elements.plannerSettingsForm?.addEventListener("submit", submitPlannerSettings);
  elements.prevWeekBtn.addEventListener("click", () => {
    state.weekOffset -= 1;
    render();
  });
  elements.nextWeekBtn.addEventListener("click", () => {
    state.weekOffset += 1;
    render();
  });
  elements.larkRepairBtn.addEventListener("click", () => handleLarkSetupAction());
  elements.larkSetupAuthBtn?.addEventListener("click", () => handleLarkConnectorPrimaryAction());
  elements.copyLarkConfigBtn?.addEventListener("click", () => copyTextFromButton(elements.copyLarkConfigBtn, "lark-cli config init --new"));
  elements.copyLarkAuthBtn?.addEventListener("click", () => copyTextFromButton(elements.copyLarkAuthBtn, "lark-cli auth login --domain calendar"));
  elements.plannerCalendarProvider?.addEventListener("change", () => {
    renderLarkSetupPanel();
    elements.plannerSettingsHint.textContent = getSettingsHint({
      ...(state.settings || {}),
      calendarProvider: elements.plannerCalendarProvider.value,
    });
  });

  elements.scheduleForm.addEventListener("submit", submitSchedule);
  elements.scheduleStart.addEventListener("input", clearActiveScheduleSlot);
  elements.scheduleEnd.addEventListener("input", clearActiveScheduleSlot);
  elements.scheduleCalendarProvider.addEventListener("change", () => {
    elements.scheduleCalendarHint.textContent = getCalendarHint(
      elements.scheduleCalendarProvider.value,
      state.lark,
      state.settings,
    );
  });
  elements.disposeForm.addEventListener("submit", submitDispose);
  elements.larkAuthCompleteBtn.addEventListener("click", () => finishLarkRepairFlow());
  elements.copyLarkAuthCodeBtn.addEventListener("click", () => copyLarkAuthCode());

  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = document.getElementById(button.dataset.close);
      dialog?.close();
    });
  });
}

async function loadTopics() {
  setBusy(true);
  try {
    const response = await fetch("/api/topics");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "加载失败");
    }
    state.topics = payload.topics || [];
    state.inboxCandidates = payload.inboxCandidates || [];
    state.inboxSummary = payload.inboxSummary || null;
    state.settings = payload.settings || null;
    state.configPath = payload.configPath || "";
    state.lark = payload.lark || null;
    if (isSampleWorkspace() && state.inboxPageSize !== 3) {
      state.inboxPageSize = 3;
      elements.inboxPageSize.value = "3";
    }
    pruneSelectedInboxPaths();
    render();
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
}

function render() {
  renderHero();
  renderPlannerSettings();
  renderWorkspaceView();
  renderBacklog();
  renderInboxCandidates();
  renderWikiTodos();
  renderCalendar();
  renderToast();
}

function setWorkspaceView(view) {
  state.workspaceView = ["backlog", "inbox", "wiki"].includes(view) ? view : "backlog";
  renderWorkspaceView();
}

function renderWorkspaceView() {
  elements.workspaceTabs.forEach((button) => {
    const active = button.dataset.workspaceView === state.workspaceView;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  elements.workspacePanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.viewPanel === state.workspaceView);
  });
}

function renderHero() {
  const weekDays = getCurrentWeekDays();
  const scheduledCount = state.topics.filter((topic) =>
    topic.scheduledDate && weekDays.some((day) => day.iso === topic.scheduledDate),
  ).length;
  const backlogCount = filteredBacklog().length;
  const inboxCandidateCount = state.inboxCandidates.length;

  elements.weekScheduledCount.textContent = String(scheduledCount);
  elements.backlogCount.textContent = String(backlogCount);
  elements.inboxCandidateCount.textContent = String(inboxCandidateCount);
  elements.weekLabel.textContent = `${weekDays[0].displayShort} - ${weekDays[6].displayShort}`;
  elements.workspaceKind.textContent = getWorkspaceKind(state.settings);
  if (elements.workspaceConfigPath) {
    elements.workspaceConfigPath.textContent = state.configPath || "配置文件未知";
    elements.workspaceConfigPath.title = state.configPath || "";
  }

  const provider = state.settings?.calendarProvider || "none";
  if (provider === "none") {
    elements.larkStatus.textContent = "只写 Markdown";
    elements.larkStatus.style.color = "#6c5b44";
    elements.larkRepairBtn.hidden = true;
    return;
  }

  if (provider === "macos") {
    elements.larkStatus.textContent = state.settings?.macosCalendarName
      ? `macOS · ${state.settings.macosCalendarName}`
      : "macOS · 默认日历";
    elements.larkStatus.style.color = "#1e6a36";
    elements.larkRepairBtn.hidden = true;
    return;
  }

  if (!state.lark) {
    elements.larkStatus.textContent = "飞书状态未知";
    elements.larkStatus.style.color = "#8f1d12";
    elements.larkRepairBtn.hidden = false;
    elements.larkRepairBtn.textContent = "查看配置步骤";
    return;
  }

  elements.larkRepairBtn.hidden = state.lark.available;

  if (state.lark.available) {
    const suffix = state.lark.calendarName ? ` · ${state.lark.calendarName}` : " · 可同步";
    elements.larkStatus.textContent = `${state.lark.userName || "已连接"}${suffix}`;
    elements.larkStatus.style.color = "#1e6a36";
    return;
  }

  if (state.lark.setupState === "auth_refresh_needed" || state.lark.tokenStatus === "needs_refresh") {
    elements.larkStatus.textContent = "授权待刷新";
    elements.larkStatus.style.color = "#b6522d";
    elements.larkRepairBtn.textContent = "查看飞书";
    return;
  }

  const label = state.lark.statusLabel || (state.lark.canRepair ? "待授权" : "待初始化");
  elements.larkStatus.textContent = label;
  elements.larkStatus.style.color = state.lark.setupState === "network_unavailable" ? "#b6522d" : "#8f1d12";
  elements.larkRepairBtn.textContent = "查看飞书";
}

function renderPlannerSettings() {
  if (!state.settings || !elements.plannerSettingsForm) return;
  elements.plannerVaultRoot.value = state.settings.vaultRoot || '';
  elements.plannerTopicDir.value = state.settings.topicDir || '';
  elements.plannerInboxDir.value = state.settings.inboxDir || '';
  elements.plannerArchiveDir.value = state.settings.archiveDir || '';
  elements.plannerCalendarProvider.value = state.settings.calendarProvider || 'none';
  elements.plannerMacosCalendarName.value = state.settings.macosCalendarName || '';
  elements.plannerWikiMode.value = state.settings.wikiMode || 'off';
  elements.plannerWikiDir.value = state.settings.wikiDir || '30_研究/内容Wiki';
  elements.plannerDailyCapacity.value = String(getDailyCapacity());
  elements.plannerSettingsHint.textContent = getSettingsHint(state.settings);
  renderLarkSetupPanel();
}

function renderBacklog() {
  const topics = filteredBacklog();
  const totalPages = Math.max(1, Math.ceil(topics.length / state.backlogPageSize));
  const currentPage = Math.min(state.backlogPage, totalPages);
  const startIndex = topics.length === 0 ? 0 : (currentPage - 1) * state.backlogPageSize;
  const visibleTopics = topics.slice(startIndex, startIndex + state.backlogPageSize);

  state.backlogPage = currentPage;
  elements.backlogPrevBtn.disabled = currentPage === 1 || topics.length === 0;
  elements.backlogNextBtn.disabled = currentPage === totalPages || topics.length === 0;
  elements.backlogPageInfo.textContent = `第 ${currentPage} / ${totalPages} 页`;
  elements.backlogWindowInfo.textContent = topics.length
    ? `当前显示 ${startIndex + 1}-${startIndex + visibleTopics.length} / ${topics.length}`
    : "当前显示 0 / 0";
  elements.backlogHint.textContent =
    state.recentTopicPaths.length
      ? "最近转入的卡片已置顶；确认后再拖进日历。"
      : "筛选后挑一张，拖到右侧周历。";

  elements.backlogList.innerHTML = "";

  if (topics.length === 0) {
    elements.backlogList.innerHTML = `
      <div class="empty-state">
        <strong>当前筛选下没有待排期选题</strong>
        <span>搜索：${escapeHtml(state.search || '无')} · 阶段：${escapeHtml(state.stageFilter || '全部阶段')}</span>
        <button id="clearBacklogFilterBtn" class="mini-btn" type="button">清空筛选</button>
      </div>`;
    elements.backlogList.querySelector("#clearBacklogFilterBtn")?.addEventListener("click", () => {
      state.search = "";
      state.stageFilter = "";
      elements.searchInput.value = "";
      elements.stageFilter.value = "";
      state.backlogPage = 1;
      renderBacklog();
    });
    return;
  }

  for (const topic of visibleTopics) {
    const card = createTopicCard(topic, { showUnschedule: false, compact: false });
    elements.backlogList.append(card);
  }
}

function renderInboxCandidates() {
  const candidates = state.inboxCandidates || [];
  const summary = state.inboxSummary || {};
  const totalPages = Math.max(1, Math.ceil(candidates.length / state.inboxPageSize));
  const currentPage = Math.min(state.inboxPage, totalPages);
  const startIndex = candidates.length === 0 ? 0 : (currentPage - 1) * state.inboxPageSize;
  const visibleCandidates = candidates.slice(startIndex, startIndex + state.inboxPageSize);
  const selectedCount = state.selectedInboxPaths.size;
  const selectedOnPage = visibleCandidates.filter((candidate) => state.selectedInboxPaths.has(candidate.sourcePath)).length;

  state.inboxPage = currentPage;
  elements.inboxCandidateList.innerHTML = '';
  elements.inboxHint.textContent = candidates.length
    ? '直接转卡：单条素材快速进入题库；Wiki：批量素材先合并判断，再生成行动卡。'
    : `当前工作区：${getWorkspaceKind(state.settings)}；已扫描 ${summary.inboxMarkdownFiles ?? 0} 个收件箱 Markdown。`;
  elements.inboxPrevBtn.disabled = currentPage === 1 || candidates.length === 0;
  elements.inboxNextBtn.disabled = currentPage === totalPages || candidates.length === 0;
  elements.inboxPageInfo.textContent = `第 ${currentPage} / ${totalPages} 页`;
  elements.inboxWindowInfo.textContent = candidates.length
    ? `当前显示 ${startIndex + 1}-${startIndex + visibleCandidates.length} / ${candidates.length}`
    : '当前显示 0 / 0';
  elements.inboxBatchInfo.textContent = `已选 ${selectedCount} 条 · 候选 ${summary.inboxCandidateFiles ?? candidates.length}/${summary.inboxMarkdownFiles ?? 0} · 已转卡 ${summary.inboxSkippedAlreadyImported ?? 0} · 已处理 ${summary.inboxSkippedProcessed ?? 0} · 过短 ${summary.inboxSkippedShort ?? 0}`;
  elements.inboxSelectPageBtn.textContent = visibleCandidates.length && selectedOnPage === visibleCandidates.length ? '取消本页' : '本页全选';
  elements.inboxSelectPageBtn.disabled = visibleCandidates.length === 0;
  elements.inboxImportBatchBtn.disabled = selectedCount === 0;
  elements.inboxWikiBatchBtn.disabled = candidates.length === 0;

  if (!candidates.length) {
    elements.inboxCandidateList.innerHTML = `
      <div class="empty-state inbox-empty">
        <strong>没有新的可转候选</strong>
        <span>候选 ${summary.inboxCandidateFiles ?? 0} · 已转卡 ${summary.inboxSkippedAlreadyImported ?? 0} · 已处理 ${summary.inboxSkippedProcessed ?? 0} · 正文过短 ${summary.inboxSkippedShort ?? 0} · 系统文件 ${summary.inboxSkippedSystem ?? 0}</span>
        <span>如果 Obsidian 里还有很多素材，请先确认当前工作区是不是你的真实 Vault。</span>
      </div>`;
    return;
  }

  for (const candidate of visibleCandidates) {
    elements.inboxCandidateList.append(createInboxCandidateCard(candidate));
  }
}

function renderWikiTodos() {
  elements.wikiTodoList.innerHTML = "";
  if (!state.wikiTodos.length) {
    return;
  }
  const totalPages = Math.max(1, Math.ceil(state.wikiTodos.length / state.wikiTodoPageSize));
  const currentPage = Math.min(state.wikiTodoPage, totalPages);
  const startIndex = (currentPage - 1) * state.wikiTodoPageSize;
  const visibleTodos = state.wikiTodos.slice(startIndex, startIndex + state.wikiTodoPageSize);
  state.wikiTodoPage = currentPage;

  const pager = document.createElement("div");
  pager.className = "wiki-result";
  pager.innerHTML = `
    <span>行动卡第 ${currentPage} / ${totalPages} 页 · 当前 ${startIndex + 1}-${startIndex + visibleTodos.length} / ${state.wikiTodos.length}</span>
    <div class="inline-pager">
      <button class="ghost-btn" data-action="wiki-prev" type="button">上一页</button>
      <button class="ghost-btn" data-action="wiki-next" type="button">下一页</button>
    </div>`;
  pager.querySelector('[data-action="wiki-prev"]').disabled = currentPage === 1;
  pager.querySelector('[data-action="wiki-next"]').disabled = currentPage === totalPages;
  pager.querySelector('[data-action="wiki-prev"]').addEventListener('click', () => {
    state.wikiTodoPage = Math.max(1, state.wikiTodoPage - 1);
    renderWikiTodos();
  });
  pager.querySelector('[data-action="wiki-next"]').addEventListener('click', () => {
    state.wikiTodoPage += 1;
    renderWikiTodos();
  });
  elements.wikiTodoList.append(pager);

  for (const todo of visibleTodos) {
    const card = document.createElement("article");
    card.className = "wiki-todo-card";
    card.innerHTML = `
      <div class="topic-top">
        <span class="topic-priority">LLM Todo</span>
        <span class="topic-stage">${todo.confidence}</span>
      </div>
      <h3>${escapeHtml(todo.title)}</h3>
      <p>${escapeHtml(todo.reason)}</p>
      <div class="topic-tags">${(todo.targetForms || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
      <div class="topic-actions">
        <button class="mini-btn" data-action="accept" type="button">生成选题卡</button>
        <button class="mini-btn" data-action="reject" type="button">拒绝</button>
      </div>
    `;
    card.querySelector('[data-action="accept"]').addEventListener("click", () => acceptWikiTodo(todo));
    card.querySelector('[data-action="reject"]').addEventListener("click", () => rejectWikiTodo(todo));
    elements.wikiTodoList.append(card);
  }
}

function renderCalendar() {
  const days = getCurrentWeekDays();
  const topicsByDate = new Map(days.map((day) => [day.iso, []]));
  const dailyCapacity = getDailyCapacity();

  for (const topic of state.topics) {
    if (!topic.scheduledDate) continue;
    if (!topicsByDate.has(topic.scheduledDate)) continue;
    if (!matchesFilter(topic)) continue;
    topicsByDate.get(topic.scheduledDate).push(topic);
  }

  elements.calendarGrid.innerHTML = "";

  for (const day of days) {
    const scheduled = topicsByDate.get(day.iso) || [];
    const overload = scheduled.length > dailyCapacity;
    const column = document.createElement("section");
    column.className = "day-column";
    column.dataset.date = day.iso;
    column.dataset.load = overload ? "overload" : "normal";

    column.innerHTML = `
      <div class="day-head">
        <div class="day-head-copy">
          <strong>${day.label}</strong>
          <span>${day.displayShort}</span>
        </div>
        <span class="day-load ${overload ? "overload" : ""}" title="每日推荐容量，不是硬限制">${scheduled.length} / ${dailyCapacity} 推荐</span>
      </div>
      <div class="day-list"></div>
    `;

    bindDropZone(column, day.iso);
    const list = column.querySelector(".day-list");

    if (scheduled.length === 0) {
      list.innerHTML = `<div class="empty-state">拖一张选题到这里，选择快捷时段后排进 ${day.label}。</div>`;
    } else {
      for (const topic of scheduled.sort((a, b) => (a.scheduledStart || "").localeCompare(b.scheduledStart || ""))) {
        list.append(createTopicCard(topic, { showUnschedule: true, compact: true }));
      }
    }

    elements.calendarGrid.append(column);
  }
}

function createTopicCard(topic, options = {}) {
  const fragment = elements.topicCardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".topic-card");
  const priority = fragment.querySelector(".topic-priority");
  const stage = fragment.querySelector(".topic-stage");
  const title = fragment.querySelector(".topic-title");
  const excerpt = fragment.querySelector(".topic-excerpt");
  const date = fragment.querySelector(".topic-date");
  const sync = fragment.querySelector(".topic-sync");
  const tags = fragment.querySelector(".topic-tags");

  card.dataset.path = topic.path;
  card.dataset.stage = topic.stage;
  card.dataset.density = options.compact ? "compact" : "focus";
  if (!options.compact && state.recentTopicPaths.includes(topic.path)) {
    card.classList.add("is-recent");
  }
  card.draggable = true;

  priority.textContent = topic.priority || "优先级";
  stage.textContent = topic.stage;
  title.textContent = stripTopicPrefix(topic.title);
  title.title = stripTopicPrefix(topic.title);
  excerpt.textContent = topic.excerpt || "暂无摘要";
  date.textContent = topic.scheduledDate
    ? `${topic.scheduledDate}${topic.scheduledStart ? ` · ${topic.scheduledStart}-${topic.scheduledEnd}` : ""}`
    : "尚未排期";
  sync.textContent = topic.calendarSyncStatus || "未同步";

  for (const item of [...(topic.targetForms || []), ...topic.platforms, ...topic.tags].slice(0, options.compact ? 2 : 3)) {
    const pill = document.createElement("span");
    pill.textContent = item;
    tags.append(pill);
  }

  card.addEventListener("dragstart", (event) => {
    card.classList.add("dragging");
    event.dataTransfer.setData("application/json", JSON.stringify(topic));
    event.dataTransfer.effectAllowed = "move";
  });

  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
  });

  const scheduleBtn = fragment.querySelector('[data-action="schedule"]');
  const unscheduleBtn = fragment.querySelector('[data-action="unschedule"]');
  const disposeBtn = fragment.querySelector('[data-action="dispose"]');

  scheduleBtn.addEventListener("click", () => openScheduleDialog(topic, topic.scheduledDate || getCurrentWeekDays()[0].iso));
  disposeBtn.addEventListener("click", () => openDisposeDialog(topic));

  if (options.showUnschedule) {
    unscheduleBtn.addEventListener("click", () => handleUnschedule(topic));
  } else {
    unscheduleBtn.remove();
  }

  return fragment;
}

function createInboxCandidateCard(candidate) {
  const card = document.createElement('article');
  card.className = 'inbox-card';
  card.dataset.sourcePath = candidate.sourcePath;

  const selectLine = document.createElement('label');
  selectLine.className = 'inbox-select-line';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = state.selectedInboxPaths.has(candidate.sourcePath);
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
      state.selectedInboxPaths.add(candidate.sourcePath);
    } else {
      state.selectedInboxPaths.delete(candidate.sourcePath);
    }
    renderInboxCandidates();
  });
  const source = document.createElement('span');
  source.textContent = candidate.sourcePath;
  selectLine.append(checkbox, source);
  card.append(selectLine);

  const title = document.createElement('h3');
  title.textContent = candidate.title;
  card.append(title);

  const meta = document.createElement('div');
  meta.className = 'inbox-meta';
  meta.innerHTML = `
    <span>${candidate.author || '未知作者'}</span>
    <span>${candidate.source || '收件箱'}</span>
    <span>${candidate.savedAt || '最近同步'}</span>
    <span>置信度：${formatCandidateConfidence(candidate.confidence)}</span>
  `;
  card.append(meta);

  const excerpt = document.createElement('p');
  excerpt.textContent = candidate.excerpt || '只有基础信息也没关系，先让阿福帮你转卡，再补判断。';
  card.append(excerpt);

  if ((candidate.reasons || []).length) {
    const reason = document.createElement('p');
    reason.className = 'inbox-warning';
    reason.textContent = `注意：${candidate.reasons.join('；')}`;
    card.append(reason);
  }

  const tags = document.createElement('div');
  tags.className = 'topic-tags';
  for (const item of (candidate.tags || []).slice(0, 4)) {
    const pill = document.createElement('span');
    pill.textContent = item;
    tags.append(pill);
  }
  card.append(tags);

  const actions = document.createElement('div');
  actions.className = 'topic-actions';
  const importBtn = document.createElement('button');
  importBtn.className = 'mini-btn';
  importBtn.type = 'button';
  importBtn.textContent = '让阿福转卡';
  importBtn.addEventListener('click', () => importInboxCandidate(candidate));
  actions.append(importBtn);
  card.append(actions);

  return card;
}

function bindDropZone(column, dateIso) {
  column.addEventListener("dragover", (event) => {
    event.preventDefault();
    column.classList.add("drag-over");
  });

  column.addEventListener("dragleave", () => {
    column.classList.remove("drag-over");
  });

  column.addEventListener("drop", (event) => {
    event.preventDefault();
    column.classList.remove("drag-over");
    const payload = event.dataTransfer.getData("application/json");
    if (!payload) return;
    const topic = JSON.parse(payload);
    openScheduleDialog(topic, dateIso);
  });
}

function openScheduleDialog(topic, dateIso) {
  state.scheduleTarget = topic;
  elements.scheduleTitle.textContent = `排期：${stripTopicPrefix(topic.title)}`;
  elements.scheduleDate.value = dateIso;
  elements.scheduleStart.value = topic.scheduledStart || "10:00";
  elements.scheduleEnd.value = topic.scheduledEnd || "11:00";
  renderScheduleSlots(topic);
  const provider = state.settings?.calendarProvider || "none";
  const larkAvailable = state.lark?.available ?? false;
  elements.scheduleCalendarProvider.querySelector('option[value="lark"]').disabled = !larkAvailable;
  elements.scheduleCalendarProvider.value = provider === "lark" && !larkAvailable ? "none" : provider;
  elements.scheduleCalendarHint.textContent = getCalendarHint(
    elements.scheduleCalendarProvider.value,
    state.lark,
    state.settings,
  );
  elements.scheduleDialog.showModal();
}

function renderScheduleSlots(topic = {}) {
  const slots = getScheduleTimeSlots();
  elements.scheduleSlotButtons.innerHTML = "";
  for (const slot of slots) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot-btn";
    button.textContent = `${slot.label} ${slot.start}-${slot.end}`;
    button.dataset.start = slot.start;
    button.dataset.end = slot.end;
    button.classList.toggle("is-active", topic.scheduledStart === slot.start && topic.scheduledEnd === slot.end);
    button.addEventListener("click", () => {
      elements.scheduleStart.value = slot.start;
      elements.scheduleEnd.value = slot.end;
      clearActiveScheduleSlot();
      button.classList.add("is-active");
    });
    elements.scheduleSlotButtons.append(button);
  }

  const custom = document.createElement("button");
  custom.type = "button";
  custom.className = "slot-btn";
  custom.textContent = "自定义";
  custom.addEventListener("click", clearActiveScheduleSlot);
  elements.scheduleSlotButtons.append(custom);
}

function clearActiveScheduleSlot() {
  elements.scheduleSlotButtons?.querySelectorAll(".slot-btn").forEach((button) => {
    button.classList.remove("is-active");
  });
}

async function submitSchedule(event) {
  event.preventDefault();
  if (!state.scheduleTarget) return;

  const payload = {
    path: state.scheduleTarget.path,
    scheduledDate: elements.scheduleDate.value,
    scheduledStart: elements.scheduleStart.value,
    scheduledEnd: elements.scheduleEnd.value,
    calendarProvider: elements.scheduleCalendarProvider.value,
  };

  await postAndReload("/api/topics/schedule", payload);
  elements.scheduleDialog.close();
}

function openDisposeDialog(topic) {
  state.disposeTarget = topic;
  elements.disposeTitle.textContent = `处理：${topic.title}`;
  elements.disposeAction.value = "拒绝";
  elements.disposeReason.value = "";
  elements.disposeSync.checked = Boolean(topic.larkEventId || topic.macosEventId);
  elements.disposeSync.disabled = !(topic.larkEventId || topic.macosEventId);
  elements.disposeDialog.showModal();
}

async function submitDispose(event) {
  event.preventDefault();
  if (!state.disposeTarget) return;

  const reason = elements.disposeReason.value.trim();
  if (!reason) {
    alert("原因不能为空");
    return;
  }

  await postAndReload("/api/topics/disposition", {
    path: state.disposeTarget.path,
    action: elements.disposeAction.value,
    reason,
    removeFromCalendar: elements.disposeSync.checked,
  });
  elements.disposeDialog.close();
}

async function handleUnschedule(topic) {
  const confirmed = window.confirm("把这个选题移回待排期池？默认保留已同步的外部日程。");
  if (!confirmed) return;

  await postAndReload("/api/topics/unschedule", {
    path: topic.path,
    removeFromCalendar: false,
  });
}

async function startLarkRepairFlow() {
  if (state.lark && !state.lark.canRepair && !state.lark.available) {
    focusLarkSetupPanel();
    if (elements.larkSetupDetails) elements.larkSetupDetails.open = true;
    showToast(state.lark.message || "先完成 lark-cli 初始化，再回来连接飞书。");
    return;
  }
  setBusy(true);
  try {
    const response = await fetch("/api/lark/repair/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "无法启动授权修复");
    }

    if (data.lark?.available) {
      await loadTopics();
      return;
    }

    state.larkAuthFlow = data.flow || null;
    renderLarkAuthDialog();
    elements.larkAuthDialog.showModal();

    if (state.larkAuthFlow?.verificationUrl) {
      window.open(state.larkAuthFlow.verificationUrl, "_blank", "noopener,noreferrer");
    }
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
}

async function finishLarkRepairFlow() {
  setBusy(true);
  try {
    const response = await fetch("/api/lark/repair/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "授权修复失败");
    }

    state.larkAuthFlow = null;
    elements.larkAuthDialog.close();
    await loadTopics();
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
}

function renderLarkAuthDialog() {
  const flow = state.larkAuthFlow;
  if (!flow) return;

  elements.larkAuthCode.textContent = flow.userCode || "请直接打开授权页";
  elements.larkAuthLink.href = flow.verificationUrl || "#";
  elements.larkAuthLink.setAttribute("aria-disabled", flow.verificationUrl ? "false" : "true");
  elements.larkAuthMessage.textContent =
    "新窗口会打开飞书授权页。完成确认后，回到这里点击“我已完成授权”。";
  elements.larkAuthExpires.textContent = `本次授权会话将在 ${Math.round((flow.expiresIn || 600) / 60)} 分钟内失效。`;
}

function renderLarkSetupPanel() {
  if (!elements.larkSetupPanel) return;
  const provider = elements.plannerCalendarProvider?.value || state.settings?.calendarProvider || "none";
  const enabled = provider === "lark";
  elements.larkSetupPanel.hidden = !enabled;
  if (!enabled) return;

  const view = getLarkConnectorView(state.lark);
  elements.larkSetupStatus.textContent = view.message;
  elements.larkSetupBadge.textContent = view.badge;
  elements.larkSetupBadge.className = `status-badge ${view.tone}`;
  elements.larkSetupAccount.textContent = view.account;
  elements.larkSetupAuthBtn.disabled = view.disabled;
  elements.larkSetupAuthBtn.textContent = view.button;
  elements.larkSetupAuthBtn.dataset.action = view.action;
}

function handleLarkSetupAction() {
  focusLarkSetupPanel();
}

function focusLarkSetupPanel() {
  elements.plannerCalendarProvider.value = "lark";
  renderLarkSetupPanel();
  elements.larkSetupPanel?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function handleLarkConnectorPrimaryAction() {
  const action = elements.larkSetupAuthBtn?.dataset.action || "auth";
  if (action === "refresh") {
    await loadTopics();
    showToast("已重新检测飞书连接状态。");
    return;
  }
  if (action === "details") {
    if (elements.larkSetupDetails) elements.larkSetupDetails.open = true;
    showToast(state.lark?.message || "先按配置详情完成 lark-cli 初始化。");
    return;
  }
  if (action === "none") return;
  await startLarkRepairFlow();
}

function getLarkConnectorView(lark) {
  if (!lark) {
    return {
      badge: "检测中",
      tone: "is-neutral",
      message: "正在检测 lark-cli、用户授权和主日历。",
      account: "账号和主日历会在检测后显示。",
      button: "检测中",
      action: "none",
      disabled: true,
    };
  }

  if (lark.available) {
    return {
      badge: "已连接",
      tone: "is-ok",
      message: "飞书日历已可用，排期时可以同步到主日历。",
      account: `账号：${lark.userName || "当前用户"} · 主日历：${lark.calendarName || "主日历"}`,
      button: "已连接",
      action: "none",
      disabled: true,
    };
  }

  if (["cli_missing", "cli_uninitialized"].includes(lark.setupState)) {
    return {
      badge: "待初始化 CLI",
      tone: "is-warn",
      message: lark.message || "先完成 lark-cli 初始化，再回来连接飞书。",
      account: "需要在终端完成配置详情里的初始化命令。",
      button: "查看配置详情",
      action: "details",
      disabled: false,
    };
  }

  if (lark.setupState === "network_unavailable") {
    return {
      badge: "网络不可用",
      tone: "is-warn",
      message: lark.message || "当前网络无法访问飞书，网络恢复后重新检测。",
      account: "授权状态暂时无法确认。",
      button: "重新检测",
      action: "refresh",
      disabled: false,
    };
  }

  if (lark.setupState === "auth_refresh_needed" || lark.tokenStatus === "needs_refresh") {
    return {
      badge: "授权待刷新",
      tone: "is-warn",
      message: "飞书用户授权需要刷新。点击按钮后会打开授权页。",
      account: lark.userName ? `账号：${lark.userName}` : "账号存在，但需要重新授权日历权限。",
      button: "重新授权",
      action: "auth",
      disabled: false,
    };
  }

  return {
    badge: "待授权",
    tone: "is-danger",
    message: lark.message || "飞书 CLI 已就绪，但还没有用户日历授权。",
    account: "授权后会读取你的飞书主日历，不会创建额外数据库。",
    button: "连接飞书",
    action: "auth",
    disabled: false,
  };
}

async function copyLarkAuthCode() {
  const code = state.larkAuthFlow?.userCode || "";
  if (!code) return;

  try {
    await navigator.clipboard.writeText(code);
    elements.copyLarkAuthCodeBtn.textContent = "已复制";
    window.setTimeout(() => {
      elements.copyLarkAuthCodeBtn.textContent = "复制授权码";
    }, 1200);
  } catch {
    alert(`请手动复制授权码：${code}`);
  }
}

async function copyTextFromButton(button, text) {
  try {
    await navigator.clipboard.writeText(text);
    const previous = button.textContent;
    button.textContent = "已复制";
    window.setTimeout(() => {
      button.textContent = previous;
    }, 1200);
  } catch {
    alert(`请手动复制：${text}`);
  }
}

async function importInboxCandidate(candidate) {
  const topicDir = state.settings?.topicDir || '15_自媒体/选题库';
  const baseMessage = `要让阿福把「${candidate.title}」转成选题卡吗？系统会在 ${topicDir} 里创建一张可继续补写的卡片。`;
  const riskMessage = (candidate.reasons || []).length
    ? `\n\n这条素材目前判断为${formatCandidateConfidence(candidate.confidence)}，原因：${candidate.reasons.join('；')}。`
    : '';
  const finalMessage = candidate.confidence === 'low'
    ? `${baseMessage}${riskMessage}\n\n建议你转卡后先补“选题判断 / 可拍主张”，确认没跑偏再排期。`
    : `${baseMessage}${riskMessage}`;
  const confirmed = window.confirm(finalMessage);
  if (!confirmed) return;

  setBusy(true);
  try {
    const response = await fetch('/api/inbox/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath: candidate.sourcePath }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || '转卡失败');
    }
    const importedTitle = stripTopicPrefix(data.topic?.title || candidate.title);
    state.lastCreatedTopic = {
      path: data.topic?.path || data.created || "",
      title: importedTitle,
    };
    rememberCreatedTopics([state.lastCreatedTopic]);
    clearBacklogFilters();
    state.selectedInboxPaths.delete(candidate.sourcePath);
    await loadTopics();
    state.workspaceView = "inbox";
    setWorkspaceView("inbox");
    showTopicToast(`已转入题库：${importedTitle}`, state.lastCreatedTopic);
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
}

async function importSelectedInboxCandidates() {
  const sourcePaths = Array.from(state.selectedInboxPaths);
  if (!sourcePaths.length) return;
  const confirmed = window.confirm(`确认批量转卡 ${sourcePaths.length} 条素材吗？成功项会进入题库，当前页面继续停留在收件箱。`);
  if (!confirmed) return;

  setBusy(true);
  try {
    const response = await fetch('/api/inbox/import-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePaths }),
    });
    const data = await response.json();
    if (!response.ok && !(data.created || []).length) {
      throw new Error(data.error || '批量转卡失败');
    }

    for (const item of data.created || []) {
      state.selectedInboxPaths.delete(item.sourcePath);
    }
    const lastCreated = (data.created || []).at(-1);
    if (lastCreated) {
      state.lastCreatedTopic = {
        path: lastCreated.path || "",
        title: stripTopicPrefix(lastCreated.title || ""),
      };
    }
    rememberCreatedTopics((data.created || []).map((item) => ({
      path: item.path || "",
      title: stripTopicPrefix(item.title || ""),
    })));
    clearBacklogFilters();

    await loadTopics();
    state.workspaceView = "inbox";
    setWorkspaceView("inbox");
    const failedCount = (data.failed || []).length;
    const message = failedCount
      ? `已转入题库 ${data.created.length} 条，失败 ${failedCount} 条。`
      : `已转入题库 ${data.created.length} 条。`;
    showTopicToast(message, state.lastCreatedTopic);
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
}

async function toggleDiagnostics() {
  if (state.diagnostics) {
    state.diagnosticsExpanded = !state.diagnosticsExpanded;
    renderDiagnostics();
    return;
  }
  state.diagnosticsExpanded = true;
  await loadDiagnostics();
}

async function loadDiagnostics() {
  setBusy(true);
  try {
    const response = await fetch('/api/diagnostics');
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || '诊断失败');
    }
    state.diagnostics = data;
    renderDiagnostics();
    elements.wikiResult.textContent = `当前模式：${data.settings?.wikiMode || 'off'}；日历目标：${data.settings?.calendarProvider || 'none'}。`;
  } catch (error) {
    elements.diagnosticsPanel.innerHTML = `<div class="diagnostics-summary warn">${escapeHtml(error.message)}</div>`;
  } finally {
    setBusy(false);
  }
}

function renderDiagnostics() {
  const data = state.diagnostics;
  if (!data) {
    elements.diagnosticsPanel.innerHTML = "";
    elements.diagnosticsPanel.classList.add("is-collapsed");
    return;
  }
  const summary = data.summary || {};
  elements.diagnosticsPanel.classList.toggle("is-collapsed", !state.diagnosticsExpanded);
  elements.diagnosticsBtn.textContent = state.diagnosticsExpanded ? "收起配置" : "展开配置";
  elements.diagnosticsPanel.innerHTML = `
    <div class="diagnostics-summary ${data.ok ? 'ok' : 'warn'}">
      ${data.ok ? '配置可用' : '配置需要处理'} · 收件箱 ${summary.inboxCandidateFiles ?? 0}/${summary.inboxMarkdownFiles ?? 0} 可转
    </div>
    <div class="diagnostics-details">
      ${(data.checks || []).map((item) => `
        <div class="diagnostics-row ${item.ok ? 'ok' : 'warn'}">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${item.ok ? `OK · ${item.note ? escapeHtml(item.note) : (item.recursiveMarkdownCount ?? item.markdownCount ?? item.count ?? '')}` : escapeHtml(item.error || '失败')}</span>
        </div>
      `).join('')}
      <div class="diagnostics-row ok">
        <strong>收件箱过滤</strong>
        <span>候选 ${summary.inboxCandidateFiles ?? 0} · 已转卡 ${summary.inboxSkippedAlreadyImported ?? 0} · 已处理 ${summary.inboxSkippedProcessed ?? 0} · 正文过短 ${summary.inboxSkippedShort ?? 0} · 系统文件 ${summary.inboxSkippedSystem ?? 0}</span>
      </div>
    </div>
  `;
}

async function compileWikiPacket() {
  const sourcePaths = getWikiBatchSourcePaths();
  if (!sourcePaths.length) {
    elements.wikiResult.textContent = "当前没有可编译素材。回到收件箱选择素材，或先重置 demo。";
    return;
  }
  setBusy(true);
  try {
    const response = await fetch('/api/wiki/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePaths }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || '编译失败');
    }
    elements.wikiResult.innerHTML = `已生成 Wiki 编译包：<strong>${escapeHtml(data.packet.path)}</strong><br />本次批次 ${sourcePaths.length} 条 · 写入素材 ${data.packet.sourceCount}`;
  } catch (error) {
    elements.wikiResult.textContent = error.message;
  } finally {
    setBusy(false);
  }
}

async function generateWikiTodos() {
  const sourcePaths = getWikiBatchSourcePaths();
  if (!sourcePaths.length) {
    elements.wikiResult.textContent = "当前没有 Wiki 批次。回到收件箱选择素材，再生成行动卡。";
    return;
  }
  setBusy(true);
  try {
    const response = await fetch('/api/wiki/todos/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePaths }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || '生成行动卡失败');
    }
    state.wikiTodos = data.todos || [];
    state.wikiTodoPage = 1;
    elements.wikiResult.innerHTML = `当前 Wiki 批次 ${data.sourceCount ?? sourcePaths.length} 条素材 · 已生成 ${state.wikiTodos.length} 张行动卡：<strong>${escapeHtml(data.storePath || '')}</strong>`;
    renderWikiTodos();
  } catch (error) {
    elements.wikiResult.textContent = error.message;
  } finally {
    setBusy(false);
  }
}

async function acceptWikiTodo(todo) {
  setBusy(true);
  try {
    const response = await fetch('/api/wiki/todos/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ todo }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || '生成选题卡失败');
    }
    state.wikiTodos = state.wikiTodos.filter((item) => item.id !== todo.id);
    state.lastCreatedTopic = {
      path: data.topic?.path || data.created || "",
      title: stripTopicPrefix(data.topic?.title || todo.title),
    };
    rememberCreatedTopics([state.lastCreatedTopic]);
    clearBacklogFilters();
    elements.wikiResult.textContent = `已进入题库：${state.lastCreatedTopic.title}`;
    await loadTopics();
    state.workspaceView = "wiki";
    setWorkspaceView("wiki");
    showTopicToast(`已进入题库：${state.lastCreatedTopic.title}`, state.lastCreatedTopic);
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
}

async function rejectWikiTodo(todo) {
  const confirmed = window.confirm(`确认拒绝行动卡「${todo.title}」？`);
  if (!confirmed) return;
  setBusy(true);
  try {
    const response = await fetch('/api/wiki/todos/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ todo }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || '拒绝失败');
    }
    state.wikiTodos = state.wikiTodos.filter((item) => item.id !== todo.id);
    renderWikiTodos();
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
}

function getCurrentInboxPageCandidates() {
  const candidates = state.inboxCandidates || [];
  const totalPages = Math.max(1, Math.ceil(candidates.length / state.inboxPageSize));
  const currentPage = Math.min(state.inboxPage, totalPages);
  const startIndex = candidates.length === 0 ? 0 : (currentPage - 1) * state.inboxPageSize;
  return candidates.slice(startIndex, startIndex + state.inboxPageSize);
}

function getWikiBatchSourcePaths() {
  if (state.wikiBatchSourcePaths.length) return [...state.wikiBatchSourcePaths];
  const selected = Array.from(state.selectedInboxPaths);
  if (selected.length) return selected;
  return getCurrentInboxPageCandidates().map((candidate) => candidate.sourcePath);
}

function captureWikiBatchFromInbox() {
  const selected = Array.from(state.selectedInboxPaths);
  const candidates = selected.length
    ? (state.inboxCandidates || []).filter((candidate) => selected.includes(candidate.sourcePath))
    : getCurrentInboxPageCandidates();

  if (!candidates.length) {
    showToast("当前收件箱没有可加入 Wiki 的素材。可以先运行 demo:reset 还原 3 条样例。");
    return;
  }

  state.wikiBatchSourcePaths = candidates.map((candidate) => candidate.sourcePath);
  state.wikiBatchTitles = candidates.map((candidate) => candidate.title);
  state.workspaceView = "wiki";
  setWorkspaceView("wiki");
  elements.wikiResult.innerHTML = `当前 Wiki 批次已锁定 <strong>${state.wikiBatchSourcePaths.length}</strong> 条素材。下一步点击“编译收件箱批次”，再点“生成行动卡”。`;
  elements.wikiHint.textContent = `当前批次：${state.wikiBatchTitles.slice(0, 3).join(" / ")}`;
  showToast(`已把 ${state.wikiBatchSourcePaths.length} 条素材加入 Wiki 批次。`);
}

function toggleSelectCurrentInboxPage() {
  const pageCandidates = getCurrentInboxPageCandidates();
  if (!pageCandidates.length) return;
  const allSelected = pageCandidates.every((candidate) => state.selectedInboxPaths.has(candidate.sourcePath));
  for (const candidate of pageCandidates) {
    if (allSelected) {
      state.selectedInboxPaths.delete(candidate.sourcePath);
    } else {
      state.selectedInboxPaths.add(candidate.sourcePath);
    }
  }
  renderInboxCandidates();
}

function pruneSelectedInboxPaths() {
  const available = new Set((state.inboxCandidates || []).map((candidate) => candidate.sourcePath));
  for (const sourcePath of Array.from(state.selectedInboxPaths)) {
    if (!available.has(sourcePath)) {
      state.selectedInboxPaths.delete(sourcePath);
    }
  }
}

function showTopicToast(message, topic) {
  showToast(message, topic?.title ? {
    label: '查看题库',
    onClick: () => openBacklogWithRecent(topic),
  } : null);
}

function showToast(message, action = null) {
  state.toast = { message, action };
  renderToast();
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    state.toast = null;
    renderToast();
  }, 6000);
}

function renderToast() {
  if (!elements.appToast) return;
  if (!state.toast) {
    elements.appToast.hidden = true;
    elements.appToast.innerHTML = '';
    return;
  }
  elements.appToast.hidden = false;
  elements.appToast.innerHTML = `<span>${escapeHtml(state.toast.message)}</span>`;
  if (state.toast.action) {
    const button = document.createElement('button');
    button.className = 'mini-btn';
    button.type = 'button';
    button.textContent = state.toast.action.label;
    button.addEventListener('click', state.toast.action.onClick);
    elements.appToast.append(button);
  }
}

function openBacklogWithRecent(topic) {
  if (topic?.path) {
    rememberCreatedTopics([topic]);
  }
  clearBacklogFilters();
  state.backlogPage = 1;
  state.workspaceView = 'backlog';
  setWorkspaceView('backlog');
  renderBacklog();
}

function rememberCreatedTopics(topics = []) {
  const next = [];
  for (const topic of topics) {
    const path = String(topic?.path || '').trim();
    if (path && !next.includes(path)) {
      next.push(path);
    }
  }
  for (const path of state.recentTopicPaths) {
    if (!next.includes(path)) {
      next.push(path);
    }
  }
  state.recentTopicPaths = next.slice(0, 20);
}

function clearBacklogFilters() {
  state.search = '';
  state.stageFilter = '';
  state.backlogPage = 1;
  elements.searchInput.value = '';
  elements.stageFilter.value = '';
}

async function submitPlannerSettings(event) {
  event.preventDefault();
  const payload = {
    vaultRoot: elements.plannerVaultRoot.value.trim(),
    topicDir: elements.plannerTopicDir.value.trim(),
    inboxDir: elements.plannerInboxDir.value.trim(),
    archiveDir: elements.plannerArchiveDir.value.trim(),
    calendarProvider: elements.plannerCalendarProvider.value,
    macosCalendarName: elements.plannerMacosCalendarName.value.trim(),
    wikiMode: elements.plannerWikiMode.value,
    wikiDir: elements.plannerWikiDir.value.trim(),
    wikiIndexPath: `${elements.plannerWikiDir.value.trim() || '30_研究/内容Wiki'}/index.md`,
    wikiLogPath: `${elements.plannerWikiDir.value.trim() || '30_研究/内容Wiki'}/log.md`,
    dailyCapacity: Number(elements.plannerDailyCapacity.value) || RECOMMENDED_DAILY_CAPACITY,
    scheduleTimeSlots: getScheduleTimeSlots(),
  };

  setBusy(true);
  try {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || '保存目录设置失败');
    }
    state.settings = data.settings || payload;
    state.diagnostics = null;
    state.diagnosticsExpanded = false;
    renderDiagnostics();
    elements.plannerSettingsHint.textContent = '目录设置已保存，当前页面会按新路径重新加载。';
    await loadTopics();
  } catch (error) {
    elements.plannerSettingsHint.textContent = error.message;
  } finally {
    setBusy(false);
  }
}

function formatCandidateConfidence(level = 'medium') {
  if (level === 'high') return '高';
  if (level === 'low') return '低';
  return '中';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getSettingsHint(settings) {
  if (!settings) return '确认目录和同步目标，保存后刷新数据。';
  if (settings.calendarProvider === 'lark') {
    if (state.lark?.available) {
      return '飞书已连接，排期时会同步到你的飞书主日历。';
    }
    if (state.lark?.canRepair) {
      return '选择飞书后，先点击下方“开始飞书授权”完成用户日历授权。';
    }
    return '选择飞书后，先按下方步骤初始化 lark-cli，再完成用户日历授权。';
  }
  if (settings.calendarProvider === 'macos') {
    return settings.macosCalendarName
      ? `排期时会写入 macOS 日历「${settings.macosCalendarName}」。`
      : '排期时会写入 macOS 的第一个本地日历。';
  }
  return '排期只回写 Markdown，适合先试用或不需要外部日历的场景。';
}

function getCalendarHint(provider, lark, settings) {
  if (provider === 'lark') {
    return lark?.available
      ? '会同步到飞书主日历，同时回写选题卡。'
      : '飞书还没连上。先在首次配置里选择“同步到飞书日历”，按步骤完成初始化和授权。';
  }
  if (provider === 'macos') {
    return settings?.macosCalendarName
      ? `会写入 macOS 日历「${settings.macosCalendarName}」，首次使用可能弹出系统授权。`
      : '会写入 macOS 的第一个本地日历，首次使用可能弹出系统授权。';
  }
  return '只写入 Obsidian 选题卡，不创建外部日程。';
}

function getDailyCapacity() {
  const value = Number(state.settings?.dailyCapacity);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : RECOMMENDED_DAILY_CAPACITY;
}

function getScheduleTimeSlots() {
  const slots = Array.isArray(state.settings?.scheduleTimeSlots) ? state.settings.scheduleTimeSlots : [];
  const normalized = slots
    .map((slot) => ({
      label: String(slot?.label || "").trim(),
      start: String(slot?.start || "").trim(),
      end: String(slot?.end || "").trim(),
    }))
    .filter((slot) => slot.label && /^\d{2}:\d{2}$/.test(slot.start) && /^\d{2}:\d{2}$/.test(slot.end) && slot.start < slot.end);
  return normalized.length ? normalized : DEFAULT_SCHEDULE_TIME_SLOTS;
}

function getWorkspaceKind(settings) {
  const root = String(settings?.vaultRoot || "");
  if (!root) return "未配置";
  return root.includes("/examples/sample-vault") ? "Sample Vault" : "真实 Vault";
}

function isSampleWorkspace() {
  return getWorkspaceKind(state.settings) === "Sample Vault";
}

function stripTopicPrefix(title = "") {
  return String(title || "").replace(/^【选题】\s*/u, "").trim();
}

async function postAndReload(url, payload) {
  setBusy(true);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "操作失败");
    }
    await loadTopics();
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
}

function filteredBacklog() {
  const recentRank = new Map(state.recentTopicPaths.map((topicPath, index) => [topicPath, index]));
  return state.topics.filter((topic) => {
    if (["已发布", "已拒绝", "已归档"].includes(topic.stage)) return false;
    if (topic.scheduledDate) return false;
    return matchesFilter(topic);
  }).sort((left, right) => {
    const leftRank = recentRank.has(left.path) ? recentRank.get(left.path) : Number.POSITIVE_INFINITY;
    const rightRank = recentRank.has(right.path) ? recentRank.get(right.path) : Number.POSITIVE_INFINITY;
    return leftRank - rightRank;
  });
}

function matchesFilter(topic) {
  if (state.stageFilter && topic.stage !== state.stageFilter) {
    return false;
  }
  if (!state.search) return true;

  const haystack = [topic.title, topic.excerpt, ...(topic.tags || []), ...(topic.targetForms || []), ...(topic.platforms || [])]
    .join(" ")
    .toLowerCase();
  return haystack.includes(state.search);
}

function getCurrentWeekDays() {
  const today = new Date();
  const monday = startOfWeek(today);
  monday.setDate(monday.getDate() + state.weekOffset * 7);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      iso: formatDate(date),
      label: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][index],
      displayShort: `${date.getMonth() + 1}/${date.getDate()}`,
    };
  });
}

function startOfWeek(date) {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  const day = clone.getDay() || 7;
  clone.setDate(clone.getDate() - day + 1);
  return clone;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readStoredBacklogPageSize() {
  const value = Number(window.localStorage.getItem(BACKLOG_PAGE_SIZE_KEY));
  return [2, 3, 4, 6].includes(value) ? value : DEFAULT_BACKLOG_PAGE_SIZE;
}

function readInboxPageSizeValue(value) {
  const pageSize = Number(value);
  return [3, 20, 50, 100].includes(pageSize) ? pageSize : DEFAULT_INBOX_PAGE_SIZE;
}

function readStoredInboxPageSize() {
  return readInboxPageSizeValue(window.localStorage.getItem(INBOX_PAGE_SIZE_KEY));
}

function setBusy(busy) {
  document.body.style.cursor = busy ? "progress" : "";
}
