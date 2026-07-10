const BACKLOG_PAGE_SIZE_KEY = "topic-planner.backlog-page-size";
const INBOX_PAGE_SIZE_KEY = "topic-planner.inbox-page-size";
const DEFAULT_BACKLOG_PAGE_SIZE = 3;
const DEFAULT_INBOX_PAGE_SIZE = 20;
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
  settings: null,
  hasSavedConfig: false,
  configPath: "",
  lark: null,
  larkCalendars: [],
  larkCalendarsLoaded: false,
  larkCalendarsLoading: false,
  larkCalendarsError: "",
  macosCalendars: [],
  macosCalendarsLoaded: false,
  macosCalendarsLoading: false,
  macosCalendarsError: "",
  larkAuthFlow: null,
  weekOffset: 0,
  search: "",
  stageFilter: "",
  backlogPage: 1,
  backlogPageSize: readStoredBacklogPageSize(),
  inboxPage: 1,
  inboxPageSize: readStoredInboxPageSize(),
  selectedInboxPaths: new Set(),
  lastCreatedTopic: null,
  recentTopicPaths: [],
  toast: null,
  workspaceView: "inbox",
  scheduleTarget: null,
  disposeTarget: null,
  scheduleSubmitting: false,
  dailyInboxDialogShown: false,
  dailyInboxDate: "",
  dailyInboxPendingPaths: null,
  scheduleQueue: [],
  importResultItems: [],
  vaultDirectoryStatus: null,
  vaultDirectoryEditing: false,
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
  plannerLarkCalendarField: document.querySelector("#plannerLarkCalendarField"),
  plannerLarkCalendarId: document.querySelector("#plannerLarkCalendarId"),
  plannerLarkCalendarStatus: document.querySelector("#plannerLarkCalendarStatus"),
  plannerMacosCalendarField: document.querySelector("#plannerMacosCalendarField"),
  plannerMacosCalendarName: document.querySelector("#plannerMacosCalendarName"),
  plannerMacosCalendarStatus: document.querySelector("#plannerMacosCalendarStatus"),
  plannerSettingsHint: document.querySelector("#plannerSettingsHint"),
  settingsDiagBanner: document.querySelector("#settingsDiagBanner"),
  vaultRootLabel: document.querySelector("#vaultRootLabel"),
  workspaceModeObsidian: document.querySelector("#modeObsidian"),
  workspaceModeStandalone: document.querySelector("#modeStandalone"),
  directoryPickerButtons: document.querySelectorAll("[data-directory-picker]"),
  directoryLinkIndicators: document.querySelectorAll("[data-directory-link]"),
  vaultLinkBanner: document.querySelector("#vaultLinkBanner"),
  vaultLinkMessage: document.querySelector("#vaultLinkMessage"),
  configureVaultDirsBtn: document.querySelector("#configureVaultDirsBtn"),
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
  scheduleSubmitBtn: document.querySelector("#scheduleSubmitBtn"),
  disposeDialog: document.querySelector("#disposeDialog"),
  disposeForm: document.querySelector("#disposeForm"),
  disposeTitle: document.querySelector("#disposeTitle"),
  disposeAction: document.querySelector("#disposeAction"),
  disposeActionHint: document.querySelector("#disposeActionHint"),
  disposeReason: document.querySelector("#disposeReason"),
  disposeReasonChips: document.querySelector("#disposeReasonChips"),
  disposeSync: document.querySelector("#disposeSync"),
  dailyInboxDialog: document.querySelector("#dailyInboxDialog"),
  dailyInboxTitle: document.querySelector("#dailyInboxTitle"),
  dailyInboxSummary: document.querySelector("#dailyInboxSummary"),
  dailyInboxList: document.querySelector("#dailyInboxList"),
  dailyInboxSelectAllBtn: document.querySelector("#dailyInboxSelectAllBtn"),
  dailyInboxImportBtn: document.querySelector("#dailyInboxImportBtn"),
  dailyInboxActions: document.querySelector("#dailyInboxActions"),
  dailyInboxConfirm: document.querySelector("#dailyInboxConfirm"),
  dailyInboxConfirmMsg: document.querySelector("#dailyInboxConfirmMsg"),
  dailyInboxConfirmCancelBtn: document.querySelector("#dailyInboxConfirmCancelBtn"),
  dailyInboxConfirmOkBtn: document.querySelector("#dailyInboxConfirmOkBtn"),
  scheduleDaySidebar: document.querySelector("#scheduleDaySidebar"),
  larkAuthDialog: document.querySelector("#larkAuthDialog"),
  larkAuthMessage: document.querySelector("#larkAuthMessage"),
  larkAuthCode: document.querySelector("#larkAuthCode"),
  larkAuthLink: document.querySelector("#larkAuthLink"),
  larkAuthExpires: document.querySelector("#larkAuthExpires"),
  larkAuthCompleteBtn: document.querySelector("#larkAuthCompleteBtn"),
  copyLarkAuthCodeBtn: document.querySelector("#copyLarkAuthCodeBtn"),
  importResultDialog: document.querySelector("#importResultDialog"),
  importResultTitle: document.querySelector("#importResultTitle"),
  importResultSummary: document.querySelector("#importResultSummary"),
  importResultList: document.querySelector("#importResultList"),
  importResultBacklogBtn: document.querySelector("#importResultBacklogBtn"),
  importResultScheduleBtn: document.querySelector("#importResultScheduleBtn"),
  topicCardTemplate: document.querySelector("#topicCardTemplate"),
  appToast: document.querySelector("#appToast"),
  themeToggleBtn: document.querySelector("#themeToggleBtn"),
  heroConfigBtn: document.querySelector("#heroConfigBtn"),
  plannerSettingsDetails: document.querySelector("#plannerSettingsDetails"),
};

boot();

async function boot() {
  elements.backlogPageSize.value = String(state.backlogPageSize);
  elements.inboxPageSize.value = String(state.inboxPageSize);
  initTheme();
  bindEvents();
  await loadTopics();
  if (state.settings?.calendarProvider === "lark" && state.lark?.available) {
    await loadLarkCalendars();
  }
  if (state.settings?.calendarProvider === "macos") {
    await loadMacOSCalendars();
  }
}

function initTheme() {
  const saved = window.localStorage.getItem("afu-theme");
  const isDark = saved === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  updateThemeToggle(isDark);
}

function toggleTheme() {
  const isDark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  window.localStorage.setItem("afu-theme", isDark ? "dark" : "light");
  updateThemeToggle(isDark);
}

function updateThemeToggle(isDark) {
  if (elements.themeToggleBtn) {
    elements.themeToggleBtn.textContent = isDark ? "◑ 浅色" : "◑ 深色";
  }
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
  elements.dailyInboxSelectAllBtn?.addEventListener("click", () => toggleDailyInboxSelection());
  elements.dailyInboxImportBtn?.addEventListener("click", () => importDailyInboxSelection());
  elements.dailyInboxConfirmCancelBtn?.addEventListener("click", () => cancelDailyInboxConfirm());
  elements.dailyInboxConfirmOkBtn?.addEventListener("click", () => confirmDailyInboxImport());

  elements.refreshBtn.addEventListener("click", () => loadTopics());
  elements.themeToggleBtn?.addEventListener("click", () => toggleTheme());
  elements.heroConfigBtn?.addEventListener("click", () => {
    if (elements.plannerSettingsDetails) {
      elements.plannerSettingsDetails.open = true;
      elements.plannerSettingsDetails.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
  elements.plannerSettingsForm?.addEventListener("submit", submitPlannerSettings);
  elements.directoryPickerButtons.forEach((button) => {
    button.addEventListener("click", () => choosePlannerDirectory(button.dataset.directoryPicker));
  });
  ["vault", "topic", "inbox", "archive"].forEach((target) => {
    const input = getDirectoryPickerInput(target);
    input?.addEventListener("click", () => {
      const button = getDirectoryPickerButton(target);
      if (input.readOnly && button && !button.hidden) choosePlannerDirectory(target);
    });
    input?.addEventListener("keydown", (event) => {
      const button = getDirectoryPickerButton(target);
      if (input.readOnly && button && !button.hidden && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        choosePlannerDirectory(target);
      }
    });
  });
  document.querySelectorAll('input[name="workspaceMode"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (input.value === "obsidian") {
        const vaultRoot = getDirectoryPickerValue(elements.plannerVaultRoot);
        const profile = getSavedVaultProfile(vaultRoot);
        setVaultDirectoryStatus({
          vaultRoot,
          configured: Boolean(profile),
          directories: profile || { topicDir: "", inboxDir: "", archiveDir: "" },
        });
      } else {
        state.vaultDirectoryStatus = null;
        state.vaultDirectoryEditing = false;
        applyWorkspaceMode(input.value);
      }
    });
  });
  elements.configureVaultDirsBtn?.addEventListener("click", () => startVaultDirectoryConfiguration());
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
    if (elements.plannerCalendarProvider.value === "lark" && state.lark?.available) {
      loadLarkCalendars();
    }
    if (elements.plannerCalendarProvider.value === "macos") {
      loadMacOSCalendars();
    }
    renderLarkSetupPanel();
    renderLarkCalendarSelect();
    elements.plannerSettingsHint.textContent = getSettingsHint({
      ...(state.settings || {}),
      calendarProvider: elements.plannerCalendarProvider.value,
    });
  });

  elements.scheduleForm.addEventListener("submit", submitSchedule);
  elements.scheduleStart.addEventListener("input", () => { clearActiveScheduleSlot(); renderScheduleDaySidebar(); });
  elements.scheduleEnd.addEventListener("input", () => { clearActiveScheduleSlot(); renderScheduleDaySidebar(); });
  elements.scheduleDate?.addEventListener("input", () => renderScheduleDaySidebar());
  elements.scheduleCalendarProvider.addEventListener("change", () => {
    elements.scheduleCalendarHint.textContent = getCalendarHint(
      elements.scheduleCalendarProvider.value,
      state.lark,
      state.settings,
    );
  });
  elements.disposeForm.addEventListener("submit", submitDispose);
  elements.disposeAction?.addEventListener("change", () => renderDisposeActionHint());
  elements.disposeReasonChips?.addEventListener("click", (event) => {
    const chip = event.target.closest(".reason-chip");
    if (!chip) return;
    elements.disposeReason.value = chip.dataset.reason || "";
    elements.disposeReasonChips.querySelectorAll(".reason-chip").forEach((btn) => {
      btn.classList.toggle("is-active", btn === chip);
    });
  });
  elements.larkAuthCompleteBtn.addEventListener("click", () => finishLarkRepairFlow());
  elements.copyLarkAuthCodeBtn.addEventListener("click", () => copyLarkAuthCode());
  elements.importResultBacklogBtn?.addEventListener("click", () => keepImportedCardsInBacklog());
  elements.importResultScheduleBtn?.addEventListener("click", () => scheduleImportedCardsNow());

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
    state.hasSavedConfig = Boolean(payload.hasSavedConfig);
    state.configPath = payload.configPath || "";
    state.lark = payload.lark || null;
    if (isSampleWorkspace() && state.inboxPageSize > 5) {
      state.inboxPageSize = 5;
      elements.inboxPageSize.value = "5";
    }
    pruneSelectedInboxPaths();
    render();
    maybeOpenDailyInboxDialog();
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
}

async function loadMacOSCalendars() {
  if (state.macosCalendarsLoading) return;
  state.macosCalendarsLoading = true;
  state.macosCalendarsError = "";
  renderMacOSCalendarSelect();
  try {
    const response = await fetch("/api/macos/calendars");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "读取 macOS 日历失败");
    }
    state.macosCalendars = (payload.writableCalendars || payload.calendars || [])
      .filter((calendar) => calendar?.writable !== false && calendar?.name)
      .map((calendar) => ({ name: calendar.name }));
    state.macosCalendarsLoaded = true;
  } catch (error) {
    state.macosCalendarsError = error.message || "读取 macOS 日历失败";
  } finally {
    state.macosCalendarsLoading = false;
    renderMacOSCalendarSelect();
  }
}

async function loadLarkCalendars() {
  if (state.larkCalendarsLoading) return;
  state.larkCalendarsLoading = true;
  state.larkCalendarsError = "";
  renderLarkCalendarSelect();
  try {
    const response = await fetch("/api/lark/calendars");
    const payload = await response.json();
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || payload.message || "读取飞书日历失败");
    }
    state.larkCalendars = (payload.calendars || [])
      .filter((calendar) => calendar?.id && calendar?.name)
      .map((calendar) => ({
        id: calendar.id,
        name: calendar.name,
        type: calendar.type || "",
        role: calendar.role || "",
      }));
    state.larkCalendarsLoaded = true;
  } catch (error) {
    state.larkCalendarsError = error.message || "读取飞书日历失败";
  } finally {
    state.larkCalendarsLoading = false;
    renderLarkCalendarSelect();
  }
}

function render() {
  renderHero();
  renderPlannerSettings();
  renderWorkspaceView();
  renderBacklog();
  renderInboxCandidates();
  renderCalendar();
  renderToast();
}

function setWorkspaceView(view) {
  state.workspaceView = ["backlog", "inbox"].includes(view) ? view : "inbox";
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
    const vaultDisplay = state.settings?.workspaceMode === 'standalone'
      ? (state.settings?.topicDir || "未配置")
      : (state.settings?.vaultRoot || state.configPath || "未配置");
    elements.workspaceConfigPath.textContent = vaultDisplay;
    elements.workspaceConfigPath.title = vaultDisplay;
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
    const calendarName = state.settings?.larkCalendarName || state.lark.calendarName;
    const suffix = calendarName ? ` · ${calendarName}` : " · 可同步";
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
  const mode = state.settings.workspaceMode || 'obsidian';
  if (mode === 'standalone' && elements.workspaceModeStandalone) {
    elements.workspaceModeStandalone.checked = true;
  } else if (elements.workspaceModeObsidian) {
    elements.workspaceModeObsidian.checked = true;
  }
  setDirectoryPickerValue(elements.plannerVaultRoot, state.settings.vaultRoot || '', { resetFallback: true });
  setDirectoryPickerValue(elements.plannerTopicDir, state.settings.topicDir || '', { resetFallback: true });
  setDirectoryPickerValue(elements.plannerInboxDir, state.settings.inboxDir || '', { resetFallback: true });
  setDirectoryPickerValue(elements.plannerArchiveDir, state.settings.archiveDir || '', { resetFallback: true });
  if (mode === "obsidian") {
    const vaultRoot = state.settings.vaultRoot || "";
    const profile = getSavedVaultProfile(vaultRoot);
    const directories = profile || { topicDir: "", inboxDir: "", archiveDir: "" };
    state.vaultDirectoryStatus = { vaultRoot, configured: Boolean(profile), directories };
    state.vaultDirectoryEditing = !profile;
    setDirectoryPickerValue(elements.plannerTopicDir, directories.topicDir, { resetFallback: true });
    setDirectoryPickerValue(elements.plannerInboxDir, directories.inboxDir, { resetFallback: true });
    setDirectoryPickerValue(elements.plannerArchiveDir, directories.archiveDir, { resetFallback: true });
  } else {
    state.vaultDirectoryStatus = null;
    state.vaultDirectoryEditing = false;
  }
  applyWorkspaceMode(mode);
  elements.plannerCalendarProvider.value = state.settings.calendarProvider || 'none';
  renderLarkCalendarSelect();
  renderMacOSCalendarSelect();
  elements.plannerSettingsHint.textContent = getSettingsHint(state.settings);
  renderLarkSetupPanel();
  renderVaultLinkBanner();
}

function renderLarkCalendarSelect() {
  const field = elements.plannerLarkCalendarField;
  const select = elements.plannerLarkCalendarId;
  if (!field || !select) return;

  const provider = elements.plannerCalendarProvider?.value || state.settings?.calendarProvider || "none";
  field.hidden = provider !== "lark";
  if (provider !== "lark") return;

  const selectedId = state.settings?.larkCalendarId || select.value || state.lark?.calendarId || "";
  select.innerHTML = "";

  if (!state.lark?.available) {
    select.append(new Option("先连接飞书日历", selectedId));
    select.disabled = true;
    if (elements.plannerLarkCalendarStatus) {
      elements.plannerLarkCalendarStatus.textContent = "完成飞书授权后会读取可用日历。";
    }
    return;
  }

  select.disabled = state.larkCalendarsLoading;
  if (state.larkCalendarsLoading) {
    select.append(new Option("正在读取飞书日历…", selectedId));
    select.value = selectedId;
    if (elements.plannerLarkCalendarStatus) {
      elements.plannerLarkCalendarStatus.textContent = "正在读取当前账号可用的飞书日历。";
    }
    return;
  }

  if (state.larkCalendarsError) {
    select.append(new Option(state.settings?.larkCalendarName ? `保留当前：${state.settings.larkCalendarName}` : "读取失败，保存后仍使用主日历", selectedId));
    select.value = selectedId;
    if (elements.plannerLarkCalendarStatus) {
      elements.plannerLarkCalendarStatus.textContent = `读取失败：${state.larkCalendarsError}`;
    }
    return;
  }

  if (!state.larkCalendarsLoaded) {
    select.append(new Option("点击同步目标后自动读取", selectedId));
    select.value = selectedId;
    if (elements.plannerLarkCalendarStatus) {
      elements.plannerLarkCalendarStatus.textContent = "选择排期要写入的飞书日历。";
    }
    return;
  }

  if (!state.larkCalendars.length) {
    select.append(new Option("没有读取到飞书日历", ""));
    select.value = "";
    if (elements.plannerLarkCalendarStatus) {
      elements.plannerLarkCalendarStatus.textContent = "当前飞书账号没有返回可用日历。";
    }
    return;
  }

  for (const calendar of state.larkCalendars) {
    const label = calendar.type === "primary" ? `${calendar.name}（主日历）` : calendar.name;
    select.append(new Option(label, calendar.id));
  }
  if (selectedId && !state.larkCalendars.some((calendar) => calendar.id === selectedId)) {
    select.prepend(new Option(`当前配置：${state.settings?.larkCalendarName || selectedId}`, selectedId));
  }
  select.value = selectedId || state.larkCalendars[0].id;
  const selectedCalendar = state.larkCalendars.find((calendar) => calendar.id === select.value);
  if (elements.plannerLarkCalendarStatus) {
    elements.plannerLarkCalendarStatus.textContent = selectedCalendar
      ? `排期会写入飞书日历「${selectedCalendar.name}」。`
      : `已读取 ${state.larkCalendars.length} 个飞书日历。`;
  }
}

function renderMacOSCalendarSelect() {
  if (elements.plannerMacosCalendarField) {
    const provider = elements.plannerCalendarProvider?.value || state.settings?.calendarProvider || "none";
    elements.plannerMacosCalendarField.hidden = provider !== "macos";
  }
  const select = elements.plannerMacosCalendarName;
  if (!select) return;

  const selectedName = state.settings?.macosCalendarName || select.value || "";
  select.innerHTML = "";

  const provider = elements.plannerCalendarProvider?.value || state.settings?.calendarProvider || "none";
  if (provider !== "macos") {
    select.append(new Option("选择同步到 macOS 后自动读取", ""));
    select.disabled = true;
    if (elements.plannerMacosCalendarStatus) {
      elements.plannerMacosCalendarStatus.textContent = "只显示 Calendar.app 里可写入的日历。";
    }
    return;
  }

  select.disabled = state.macosCalendarsLoading;
  if (state.macosCalendarsLoading) {
    select.append(new Option("正在读取 Calendar.app…", selectedName));
    select.value = selectedName;
    if (elements.plannerMacosCalendarStatus) {
      elements.plannerMacosCalendarStatus.textContent = "正在向 macOS 请求可写日历列表。";
    }
    return;
  }

  if (state.macosCalendarsError) {
    select.append(new Option(selectedName ? `保留当前：${selectedName}` : "读取失败，请检查系统日历权限", selectedName));
    select.value = selectedName;
    if (elements.plannerMacosCalendarStatus) {
      elements.plannerMacosCalendarStatus.textContent = `读取失败：${state.macosCalendarsError}`;
    }
    return;
  }

  if (!state.macosCalendarsLoaded) {
    select.append(new Option("点击同步目标后自动读取", selectedName));
    select.value = selectedName;
    if (elements.plannerMacosCalendarStatus) {
      elements.plannerMacosCalendarStatus.textContent = "只显示 Calendar.app 里可写入的日历。";
    }
    return;
  }

  if (!state.macosCalendars.length) {
    select.append(new Option("没有找到可写日历", ""));
    select.value = "";
    if (elements.plannerMacosCalendarStatus) {
      elements.plannerMacosCalendarStatus.textContent = "Calendar.app 没有返回可写日历，请先新建一个本地/iCloud 日历。";
    }
    return;
  }

  for (const calendar of state.macosCalendars) {
    select.append(new Option(calendar.name, calendar.name));
  }
  if (selectedName && !state.macosCalendars.some((calendar) => calendar.name === selectedName)) {
    select.prepend(new Option(`当前配置：${selectedName}`, selectedName));
  }
  select.value = selectedName || state.macosCalendars[0].name;
  if (elements.plannerMacosCalendarStatus) {
    elements.plannerMacosCalendarStatus.textContent = `已读取 ${state.macosCalendars.length} 个可写日历。`;
  }
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
    ? '直接转卡：单条素材快速进入排期池；勾选多条可批量转卡，相同内容自动合并。'
    : `当前工作区：${getWorkspaceKind(state.settings)}；已扫描 ${summary.inboxMarkdownFiles ?? 0} 个收件箱 Markdown。`;
  elements.inboxPrevBtn.disabled = currentPage === 1 || candidates.length === 0;
  elements.inboxNextBtn.disabled = currentPage === totalPages || candidates.length === 0;
  elements.inboxPageInfo.textContent = `第 ${currentPage} / ${totalPages} 页`;
  elements.inboxWindowInfo.textContent = candidates.length
    ? `当前显示 ${startIndex + 1}-${startIndex + visibleCandidates.length} / ${candidates.length}`
    : '当前显示 0 / 0';
  elements.inboxBatchInfo.textContent = `已选 ${selectedCount} 条 · 候选 ${summary.inboxCandidateFiles ?? candidates.length}/${summary.inboxMarkdownFiles ?? 0} · 已转卡 ${summary.inboxSkippedAlreadyImported ?? 0} · 已处理 ${summary.inboxSkippedProcessed ?? 0} · 低信息量 ${summary.inboxLowInformation ?? summary.inboxSkippedShort ?? 0}`;
  elements.inboxSelectPageBtn.textContent = visibleCandidates.length && selectedOnPage === visibleCandidates.length ? '取消本页' : '本页全选';
  elements.inboxSelectPageBtn.disabled = visibleCandidates.length === 0;
  elements.inboxImportBatchBtn.disabled = selectedCount === 0;
  if (elements.inboxWikiBatchBtn) elements.inboxWikiBatchBtn.disabled = candidates.length === 0;

  if (!candidates.length) {
    elements.inboxCandidateList.innerHTML = `
      <div class="empty-state inbox-empty">
        <strong>没有新的可转候选</strong>
        <span>候选 ${summary.inboxCandidateFiles ?? 0} · 已转卡 ${summary.inboxSkippedAlreadyImported ?? 0} · 已处理 ${summary.inboxSkippedProcessed ?? 0} · 低信息量 ${summary.inboxLowInformation ?? summary.inboxSkippedShort ?? 0} · 系统文件 ${summary.inboxSkippedSystem ?? 0}</span>
        <span>如果 Obsidian 里还有很多素材，请先确认当前工作区是不是你的真实 Vault。</span>
      </div>`;
    return;
  }

  for (const candidate of visibleCandidates) {
    elements.inboxCandidateList.append(createInboxCandidateCard(candidate));
  }
}

function maybeOpenDailyInboxDialog() {
  if (!elements.dailyInboxDialog || state.dailyInboxDialogShown || !shouldOpenDailyInboxReminder()) return;
  state.dailyInboxDialogShown = true;
  state.dailyInboxDate = getInboxReminderDate();
  const candidates = getDailyInboxCandidates();

  for (const candidate of candidates) {
    state.selectedInboxPaths.add(candidate.sourcePath);
  }

  renderInboxCandidates();
  renderDailyInboxDialog();
  if (!elements.dailyInboxDialog.open) {
    elements.dailyInboxDialog.showModal();
  }
}

function renderDailyInboxDialog() {
  if (!elements.dailyInboxDialog) return;
  const date = state.dailyInboxDate || getInboxReminderDate();
  const candidates = getDailyInboxCandidates(date);
  const selected = getSelectedDailyInboxCandidates(date);
  const allSelected = candidates.length > 0 && selected.length === candidates.length;

  elements.dailyInboxTitle.textContent = `处理 ${date} 收件箱`;
  elements.dailyInboxSummary.textContent = candidates.length
    ? `发现 ${candidates.length} 条当天候选，已选 ${selected.length} 条。勾选后批量转卡，重复内容会自动合并。`
    : `没有在 ${getInboxFolderPrefix(date)} 下发现新的可转候选。可能已经转卡、标记 processed，或当前 Vault 配置不对。`;
  elements.dailyInboxSelectAllBtn.textContent = allSelected ? "取消全选" : "全选当天";
  elements.dailyInboxSelectAllBtn.disabled = candidates.length === 0;
  elements.dailyInboxImportBtn.disabled = selected.length === 0;
  elements.dailyInboxList.innerHTML = "";

  if (!candidates.length) {
    elements.dailyInboxList.innerHTML = `<div class="empty-state">当天没有可处理候选。</div>`;
    return;
  }

  for (const candidate of candidates) {
    elements.dailyInboxList.append(createDailyInboxItem(candidate));
  }
}

function createDailyInboxItem(candidate) {
  const item = document.createElement("label");
  item.className = "daily-inbox-item";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = state.selectedInboxPaths.has(candidate.sourcePath);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      state.selectedInboxPaths.add(candidate.sourcePath);
    } else {
      state.selectedInboxPaths.delete(candidate.sourcePath);
    }
    renderInboxCandidates();
    renderDailyInboxDialog();
  });

  const body = document.createElement("span");
  body.className = "daily-inbox-item-body";
  const title = document.createElement("strong");
  title.textContent = candidate.title;
  const meta = document.createElement("small");
  meta.textContent = candidate.sourcePath;
  const excerpt = document.createElement("span");
  excerpt.textContent = candidate.excerpt || "暂无摘要";
  body.append(title, meta, excerpt);
  item.append(checkbox, body);
  return item;
}

function toggleDailyInboxSelection() {
  const candidates = getDailyInboxCandidates();
  const allSelected = candidates.length > 0 && candidates.every((candidate) => state.selectedInboxPaths.has(candidate.sourcePath));
  for (const candidate of candidates) {
    if (allSelected) {
      state.selectedInboxPaths.delete(candidate.sourcePath);
    } else {
      state.selectedInboxPaths.add(candidate.sourcePath);
    }
  }
  renderInboxCandidates();
  renderDailyInboxDialog();
}

function importDailyInboxSelection() {
  const sourcePaths = getSelectedDailyInboxCandidates().map((c) => c.sourcePath);
  if (!sourcePaths.length) return;
  showDailyInboxConfirm(sourcePaths);
}

function showDailyInboxConfirm(sourcePaths) {
  state.dailyInboxPendingPaths = sourcePaths;
  const preview = sourcePaths.slice(0, 3).map((p) => {
    const c = (state.inboxCandidates || []).find((x) => x.sourcePath === p);
    return c ? c.title : p.split("/").pop().replace(/\.md$/, "");
  });
  const suffix = sourcePaths.length > 3 ? `…等共 ${sourcePaths.length} 条` : `共 ${sourcePaths.length} 条`;
  elements.dailyInboxConfirmMsg.textContent = `即将转卡：${preview.join("、")}${sourcePaths.length > 3 ? "、" : "，"}${suffix}`;
  elements.dailyInboxConfirm.hidden = false;
  elements.dailyInboxList.hidden = true;
  elements.dailyInboxSummary.hidden = true;
  elements.dailyInboxActions.hidden = true;
}

function cancelDailyInboxConfirm() {
  state.dailyInboxPendingPaths = null;
  elements.dailyInboxConfirm.hidden = true;
  elements.dailyInboxList.hidden = false;
  elements.dailyInboxSummary.hidden = false;
  elements.dailyInboxActions.hidden = false;
}

async function confirmDailyInboxImport() {
  const sourcePaths = state.dailyInboxPendingPaths;
  if (!sourcePaths?.length) return;
  cancelDailyInboxConfirm();
  elements.dailyInboxDialog?.close();
  await importSelectedInboxCandidates(sourcePaths, true);
}


function renderCalendar() {
  const days = getCurrentWeekDays();
  const topicsByDate = new Map(days.map((day) => [day.iso, []]));
  const dailyCapacity = getDailyCapacity();

  for (const topic of state.topics) {
    if (!topic.scheduledDate) continue;
    if (["已拒绝", "已归档", "已发布"].includes(topic.stage)) continue;
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
        list.append(createTopicCard(topic, { showUnschedule: true, calendar: true }));
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
  card.dataset.density = options.calendar ? "mini" : options.compact ? "compact" : "focus";
  if (!options.compact && !options.calendar && state.recentTopicPaths.includes(topic.path)) {
    card.classList.add("is-recent");
  }
  card.draggable = true;

  priority.textContent = topic.priority || "优先级";
  const overdue = isTopicOverdue(topic);
  if (overdue) {
    card.dataset.overdue = "true";
    stage.textContent = "已过期";
  } else {
    stage.textContent = topic.stage;
  }
  title.textContent = stripTopicPrefix(topic.title);
  title.title = stripTopicPrefix(topic.title);
  excerpt.textContent = topic.excerpt || "暂无摘要";
  date.textContent = topic.scheduledDate
    ? `${topic.scheduledDate}${topic.scheduledStart ? ` · ${topic.scheduledStart}-${topic.scheduledEnd}` : ""}`
    : "尚未排期";
  const hasExternalCal = state.settings?.calendarProvider && state.settings.calendarProvider !== "none";
  const isScheduled = !!topic.scheduledDate;
  if (hasExternalCal && isScheduled) {
    sync.textContent = topic.calendarSyncStatus || "未同步";
  } else {
    sync.textContent = "";
    sync.hidden = true;
  }

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
  const revertImportBtn = fragment.querySelector('[data-action="revert-import"]');
  const disposeBtn = fragment.querySelector('[data-action="dispose"]');

  if (topic.scheduledDate) {
    scheduleBtn.textContent = "重新排期";
  }

  scheduleBtn.addEventListener("click", () => openScheduleDialog(topic, topic.scheduledDate || getCurrentWeekDays()[0].iso));
  if (topic.sourceInboxPath) {
    revertImportBtn.addEventListener("click", () => handleRevertImportedTopic(topic));
  } else {
    revertImportBtn.remove();
  }
  disposeBtn.addEventListener("click", () => openDisposeDialog(topic));

  if (options.calendar) {
    card.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      card.classList.toggle("is-expanded");
    });
  }

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
  importBtn.addEventListener('click', () => {
    const existing = actions.querySelector('.inline-confirm');
    if (existing) { existing.remove(); return; }
    const bar = document.createElement('div');
    bar.className = 'inline-confirm';
    const msg = document.createElement('span');
    msg.textContent = candidate.confidence === 'low' ? '低置信度，确认转卡？' : '确认转卡？';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'mini-btn';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => bar.remove());
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'mini-btn accent-btn';
    okBtn.textContent = '确认';
    okBtn.addEventListener('click', () => { bar.remove(); importInboxCandidate(candidate); });
    bar.append(msg, cancelBtn, okBtn);
    actions.append(bar);
  });
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
  setScheduleSubmitting(false);
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
  renderScheduleDaySidebar();
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
  if (!state.scheduleTarget || state.scheduleSubmitting) return;

  const payload = {
    path: state.scheduleTarget.path,
    scheduledDate: elements.scheduleDate.value,
    scheduledStart: elements.scheduleStart.value,
    scheduledEnd: elements.scheduleEnd.value,
    calendarProvider: elements.scheduleCalendarProvider.value,
  };

  setScheduleSubmitting(true);
  const data = await postAndReload("/api/topics/schedule", payload);
  setScheduleSubmitting(false);
  if (!data) return;
  showToast(getScheduleResultMessage(data.topic, payload.calendarProvider));
  elements.scheduleDialog.close();
  if (state.scheduleQueue.length) {
    advanceScheduleQueue();
  }
}

function setScheduleSubmitting(isSubmitting) {
  state.scheduleSubmitting = Boolean(isSubmitting);
  if (!elements.scheduleSubmitBtn) return;
  elements.scheduleSubmitBtn.disabled = state.scheduleSubmitting;
  elements.scheduleSubmitBtn.textContent = state.scheduleSubmitting ? "保存中…" : "保存排期";
}

function openDisposeDialog(topic) {
  state.disposeTarget = topic;
  elements.disposeTitle.textContent = `处理：${topic.title}`;
  elements.disposeAction.value = "拒绝";
  elements.disposeReason.value = "";
  elements.disposeReasonChips?.querySelectorAll(".reason-chip").forEach((btn) => btn.classList.remove("is-active"));
  elements.disposeSync.checked = Boolean(topic.larkEventId || topic.macosEventId);
  elements.disposeSync.disabled = !(topic.larkEventId || topic.macosEventId);
  renderDisposeActionHint();
  elements.disposeDialog.showModal();
}

function renderDisposeActionHint() {
  if (!elements.disposeActionHint) return;
  const action = elements.disposeAction?.value || "拒绝";
  const topic = state.disposeTarget;
  const hasInboxSource = Boolean(topic?.sourceInboxPath);
  if (action === "拒绝") {
    elements.disposeActionHint.className = "dispose-action-hint";
    elements.disposeActionHint.innerHTML = `
      <strong>会保留在 Vault 里</strong>
      <span>行动卡片仍在「${escapeHtml(state.settings?.topicDir || "行动卡片目录")}」，只是标记为已拒绝，并从排期池/周历隐藏。原始收件箱素材不删除。</span>
    `;
    return;
  }

  elements.disposeActionHint.className = "dispose-action-hint is-danger";
  elements.disposeActionHint.innerHTML = `
    <strong>会从活动区移走</strong>
    <span>行动卡片会移动到「${escapeHtml(state.settings?.archiveDir || "归档目录")}」。${hasInboxSource ? `关联的原始收件箱素材「${escapeHtml(topic.sourceInboxPath)}」也会从 Vault 删除。` : "这张卡没有关联原始收件箱素材，因此只移动行动卡片。"}这不是移到系统废纸篓。</span>
  `;
}

async function submitDispose(event) {
  event.preventDefault();
  if (!state.disposeTarget) return;

  const reason = elements.disposeReason.value.trim();
  if (!reason) {
    alert("原因不能为空");
    return;
  }

  const data = await postAndReload("/api/topics/disposition", {
    path: state.disposeTarget.path,
    action: elements.disposeAction.value,
    reason,
    removeFromCalendar: elements.disposeSync.checked,
  });
  if (!data) return;
  elements.disposeDialog.close();
}

async function handleUnschedule(topic) {
  const hasExternalEvent = Boolean(topic.larkEventId || topic.macosEventId);
  const confirmed = window.confirm(
    hasExternalEvent
      ? "把这个选题移回待排期池，并删除已经同步的外部日程？"
      : "把这个选题移回待排期池？",
  );
  if (!confirmed) return;

  const data = await postAndReload("/api/topics/unschedule", {
    path: topic.path,
    removeFromCalendar: hasExternalEvent,
  });
  if (data) {
    showToast(hasExternalEvent ? "已撤回排期，并删除对应日历事件。" : "已撤回排期。");
  }
}

async function handleRevertImportedTopic(topic) {
  const source = topic.sourceInboxPath || "原收件箱素材";
  const confirmed = window.confirm(`撤回这张卡，并让「${source}」重新回到收件箱候选？\n\n这会删除当前行动卡，但不会删除原始收件箱素材。`);
  if (!confirmed) return;

  const data = await postAndReload("/api/topics/revert-import", {
    path: topic.path,
  });
  if (data) {
    showToast("已撤回转卡，原素材会重新出现在候选里。");
  }
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
    "点下方按钮打开飞书授权页（只需打开一次）。完成确认后回到这里点“我已完成授权”。如果页面提示链接已失效，多半是 lark-cli 版本过旧，请更新后重试。";
  elements.larkAuthExpires.textContent = `本次授权会话将在 ${Math.round((flow.expiresIn || 600) / 60)} 分钟内失效。`;
}

function renderLarkSetupPanel() {
  if (!elements.larkSetupPanel) return;
  const provider = elements.plannerCalendarProvider?.value || state.settings?.calendarProvider || "none";
  const enabled = provider === "lark";
  elements.larkSetupPanel.hidden = !enabled;
  if (!enabled) return;

  const view = getLarkConnectorView(state.lark);
  const cliVersion = state.lark?.cliVersion;
  const versionNote = cliVersion === undefined
    ? ""
    : cliVersion
      ? ` · lark-cli ${cliVersion}`
      : " · 未检测到 lark-cli 版本，建议更新到最新版（npm i -g @larksuite/lark-cli）";
  elements.larkSetupStatus.textContent = `${view.message}${versionNote}`;
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
    const calendarName = state.settings?.larkCalendarName || lark.calendarName || "主日历";
    return {
      badge: "已连接",
      tone: "is-ok",
      message: `飞书日历已可用，排期时可以同步到「${calendarName}」。授权来自本机 lark-cli 已登录的账号，请核对下方是不是你本人。`,
      account: `账号：${lark.userName || "当前用户"}（本机 lark-cli 登录）· 当前日历：${calendarName}`,
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
    const topicPath = data.topic?.path || data.mergedInto || data.created || "";
    state.lastCreatedTopic = { path: topicPath, title: importedTitle };
    rememberCreatedTopics([state.lastCreatedTopic]);
    clearBacklogFilters();
    state.selectedInboxPaths.delete(candidate.sourcePath);
    await loadTopics();
    state.workspaceView = "inbox";
    renderWorkspaceView();
    showImportResultDialog([{ path: topicPath, title: importedTitle }], {
      merged: Boolean(data.merged),
      message: data.merged
        ? `已合并到「${stripTopicPrefix(data.mergedTitle)}」，可以现在排期，也可以先回到排期池。`
        : "新卡片已经放入排期池。你可以继续处理收件箱，也可以现在安排到日历。",
    });
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
}

async function importSelectedInboxCandidates(sourcePaths = Array.from(state.selectedInboxPaths), noConfirm = false) {
  sourcePaths = Array.from(new Set(sourcePaths)).filter(Boolean);
  if (!sourcePaths.length) return;

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
    renderWorkspaceView();
    const failedCount = (data.failed || []).length;
    const message = failedCount
      ? `已转入排期池 ${data.created.length} 条，失败 ${failedCount} 条。`
      : `已转入排期池 ${data.created.length} 条。`;

    if ((data.created || []).length) {
      showImportResultDialog((data.created || []).map((item) => ({
        path: item.path,
        title: stripTopicPrefix(item.title || ""),
      })), {
        failedCount,
        message: failedCount
          ? `${message} 可以先处理成功的卡片，失败项稍后再看。`
          : `${message} 你可以继续处理收件箱，也可以现在逐条排期。`,
      });
    } else {
      showTopicToast(message, state.lastCreatedTopic);
    }
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
}

function showImportResultDialog(items, options = {}) {
  const cleanItems = (items || []).filter((item) => item?.path || item?.title);
  state.importResultItems = cleanItems;
  if (!elements.importResultDialog) {
    state.scheduleQueue = cleanItems;
    advanceScheduleQueue();
    return;
  }

  const count = cleanItems.length;
  elements.importResultTitle.textContent = count > 1 ? `已转入 ${count} 张卡` : "已转入 1 张卡";
  elements.importResultSummary.textContent = options.message || "新卡片已经放入排期池。";
  elements.importResultList.innerHTML = "";

  for (const item of cleanItems.slice(0, 5)) {
    const row = document.createElement("div");
    row.className = "import-result-item";
    const title = document.createElement("strong");
    title.textContent = stripTopicPrefix(item.title || "未命名卡片");
    const meta = document.createElement("span");
    meta.textContent = item.path || "已写入本地 Markdown";
    row.append(title, meta);
    elements.importResultList.append(row);
  }

  if (cleanItems.length > 5) {
    const more = document.createElement("div");
    more.className = "import-result-more";
    more.textContent = `还有 ${cleanItems.length - 5} 张已放入排期池`;
    elements.importResultList.append(more);
  }

  elements.importResultScheduleBtn.textContent = count > 1 ? "逐条排期" : "现在排期";
  elements.importResultScheduleBtn.disabled = count === 0;
  elements.importResultDialog.showModal();
}

function keepImportedCardsInBacklog() {
  elements.importResultDialog?.close();
  state.workspaceView = "backlog";
  setWorkspaceView("backlog");
  showToast("已放入排期池，确认后再拖进日历。");
}

function scheduleImportedCardsNow() {
  const items = state.importResultItems.slice();
  elements.importResultDialog?.close();
  state.workspaceView = "backlog";
  setWorkspaceView("backlog");
  state.scheduleQueue = items;
  advanceScheduleQueue();
}

function advanceScheduleQueue() {
  const next = state.scheduleQueue.shift();
  if (!next) {
    showToast(`排期队列已完成`);
    return;
  }
  const topic = (state.topics || []).find((t) => t.path === next.path)
    || (next.title
      ? (state.topics || []).find((t) => stripTopicPrefix(t.title) === stripTopicPrefix(next.title))
      : null);
  if (!topic) {
    advanceScheduleQueue();
    return;
  }
  const defaultDate = state.dailyInboxDate || formatDate(new Date());
  openScheduleDialog(topic, topic.scheduledDate || defaultDate);
}

function renderScheduleDaySidebar() {
  if (!elements.scheduleDaySidebar) return;
  const date = elements.scheduleDate?.value;
  if (!date) {
    elements.scheduleDaySidebar.innerHTML = "";
    return;
  }
  const sameDay = (state.topics || []).filter((t) => t.scheduledDate === date && t.path !== state.scheduleTarget?.path);
  if (!sameDay.length) {
    elements.scheduleDaySidebar.innerHTML = `<p class="schedule-day-sidebar-title">${date} 当天还没有安排</p>`;
    return;
  }
  const newStart = elements.scheduleStart?.value;
  const newEnd = elements.scheduleEnd?.value;

  const items = sameDay.map((t) => {
    const hasConflict = newStart && newEnd && t.scheduledStart && t.scheduledEnd
      && newStart < t.scheduledEnd && newEnd > t.scheduledStart;
    const item = document.createElement("div");
    item.className = `schedule-day-item${hasConflict ? " conflict" : ""}`;
    item.innerHTML = `<strong>${stripTopicPrefix(t.title)}</strong><span>${t.scheduledStart || ""}${t.scheduledEnd ? "–" + t.scheduledEnd : ""}</span>`;
    return item;
  });

  const hasAnyConflict = items.some((el) => el.classList.contains("conflict"));
  elements.scheduleDaySidebar.innerHTML = "";
  elements.scheduleDaySidebar.append(
    Object.assign(document.createElement("p"), { className: "schedule-day-sidebar-title", textContent: `${date} 已有 ${sameDay.length} 条安排` }),
    ...items,
    ...(hasAnyConflict ? [Object.assign(document.createElement("p"), { className: "schedule-conflict-warn", textContent: "时间段与已有排期重叠，请注意调整。" })] : []),
  );
}

function getCurrentInboxPageCandidates() {
  const candidates = state.inboxCandidates || [];
  const totalPages = Math.max(1, Math.ceil(candidates.length / state.inboxPageSize));
  const currentPage = Math.min(state.inboxPage, totalPages);
  const startIndex = candidates.length === 0 ? 0 : (currentPage - 1) * state.inboxPageSize;
  return candidates.slice(startIndex, startIndex + state.inboxPageSize);
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
    label: '查看排期池',
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
  const workspaceMode = document.querySelector('input[name="workspaceMode"]:checked')?.value || 'obsidian';
  const plannerDirectories = getPlannerDirectoryValues();
  if (workspaceMode === "obsidian" && Object.values(plannerDirectories).some((value) => !value)) {
    elements.plannerSettingsHint.textContent = "首次使用这个 Vault 时，请先选择选题、收件箱和归档目录。";
    renderVaultLinkBanner();
    return;
  }
  const payload = {
    workspaceMode,
    vaultRoot: workspaceMode === 'standalone' ? '' : getDirectoryPickerValue(elements.plannerVaultRoot),
    ...plannerDirectories,
    calendarProvider: elements.plannerCalendarProvider.value,
    larkCalendarId: elements.plannerLarkCalendarId?.value || "",
    larkCalendarName: getSelectedLarkCalendarName(),
    macosCalendarName: elements.plannerMacosCalendarName.value.trim(),
    ...getPlannerWikiValues(workspaceMode, workspaceMode === 'standalone' ? '' : getDirectoryPickerValue(elements.plannerVaultRoot)),
    dailyCapacity: state.settings?.dailyCapacity || RECOMMENDED_DAILY_CAPACITY,
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
    if (workspaceMode === "obsidian") {
      const directories = getSavedVaultProfile(payload.vaultRoot) || {
        ...plannerDirectories,
        ...getPlannerWikiValues(workspaceMode, payload.vaultRoot),
      };
      state.vaultDirectoryStatus = {
        vaultRoot: payload.vaultRoot,
        configured: true,
        directories,
      };
      state.vaultDirectoryEditing = false;
    }
    elements.plannerSettingsHint.textContent = '目录设置已保存。';
    await loadTopics();
    await loadSettingsDiagnostics();
  } catch (error) {
    elements.plannerSettingsHint.textContent = error.message;
  } finally {
    setBusy(false);
  }
}

function formatDirectoryDisplayName(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";
  if (rawValue === ".") return "Vault 根目录";
  const withoutTrailingSlashes = rawValue.replace(/[\\/]+$/g, "");
  if (!withoutTrailingSlashes) return rawValue;
  return withoutTrailingSlashes.split(/[\\/]/).filter(Boolean).pop() || rawValue;
}

function setDirectoryPickerValue(input, value, { resetFallback = false } = {}) {
  if (!input) return;
  const pathValue = String(value || "").trim();
  if (resetFallback) delete input.dataset.manualFallback;
  input.dataset.pathValue = pathValue;
  input.value = formatDirectoryDisplayName(pathValue);
  input.title = pathValue;
}

function getDirectoryPickerValue(input) {
  if (!input) return "";
  if (input.dataset.manualFallback === "true") {
    return input.value.trim();
  }
  return String(input.dataset.pathValue || input.value || "").trim();
}

function getDirectoryPickerInput(target) {
  return {
    vault: elements.plannerVaultRoot,
    topic: elements.plannerTopicDir,
    inbox: elements.plannerInboxDir,
    archive: elements.plannerArchiveDir,
  }[target] || null;
}

function getDirectoryPickerLabel(target) {
  return {
    vault: "Vault 根目录",
    topic: "选题目录",
    inbox: "收件箱目录",
    archive: "归档目录",
  }[target] || "目录";
}

function getDirectoryPickerButton(target) {
  return Array.from(elements.directoryPickerButtons)
    .find((item) => item.dataset.directoryPicker === target) || null;
}

function getPlannerDirectoryValues() {
  return {
    topicDir: getDirectoryPickerValue(elements.plannerTopicDir),
    inboxDir: getDirectoryPickerValue(elements.plannerInboxDir),
    archiveDir: getDirectoryPickerValue(elements.plannerArchiveDir),
  };
}

function getPlannerWikiValues(workspaceMode, vaultRoot) {
  const profile = workspaceMode === "obsidian"
    ? (state.vaultDirectoryStatus?.directories || getSavedVaultProfile(vaultRoot))
    : null;
  const wikiDir = profile?.wikiDir || state.settings?.wikiDir || "30_整理Wiki";
  return {
    wikiMode: state.settings?.wikiMode || "agent",
    wikiDir,
    wikiIndexPath: profile?.wikiIndexPath || `${wikiDir}/index.md`,
    wikiLogPath: profile?.wikiLogPath || `${wikiDir}/log.md`,
  };
}

function getSavedVaultProfile(vaultRoot) {
  const normalizedRoot = String(vaultRoot || "").trim().replace(/[\\/]+$/g, "");
  if (!normalizedRoot) return null;
  const savedProfile = state.settings?.vaultProfiles?.[normalizedRoot];
  if (savedProfile) return { ...savedProfile };
  const activeRoot = String(state.settings?.vaultRoot || "").trim().replace(/[\\/]+$/g, "");
  if (state.hasSavedConfig && state.settings?.workspaceMode === "obsidian" && activeRoot === normalizedRoot) {
    return {
      topicDir: state.settings.topicDir || "",
      inboxDir: state.settings.inboxDir || "",
      archiveDir: state.settings.archiveDir || "",
      wikiDir: state.settings.wikiDir || "",
      wikiIndexPath: state.settings.wikiIndexPath || "",
      wikiLogPath: state.settings.wikiLogPath || "",
    };
  }
  return null;
}

function setVaultDirectoryStatus(data, message = "") {
  state.vaultDirectoryStatus = data;
  state.vaultDirectoryEditing = !data?.configured;
  if (data?.directories) {
    setDirectoryPickerValue(elements.plannerTopicDir, data.directories.topicDir || "", { resetFallback: true });
    setDirectoryPickerValue(elements.plannerInboxDir, data.directories.inboxDir || "", { resetFallback: true });
    setDirectoryPickerValue(elements.plannerArchiveDir, data.directories.archiveDir || "", { resetFallback: true });
  }
  applyWorkspaceMode("obsidian");
  if (message) elements.plannerSettingsHint.textContent = message;
}

function renderVaultLinkBanner() {
  const banner = elements.vaultLinkBanner;
  if (!banner) return;
  const mode = document.querySelector('input[name="workspaceMode"]:checked')?.value || state.settings?.workspaceMode;
  if (mode !== "obsidian") {
    banner.hidden = true;
    return;
  }

  banner.hidden = false;
  const status = state.vaultDirectoryStatus;
  if (!status) {
    banner.hidden = true;
    return;
  }

  if (status.configured && !state.vaultDirectoryEditing) {
    banner.className = "settings-diag-banner vault-link-banner is-ok";
    elements.vaultLinkMessage.textContent = "已加载这个 Vault 保存的选题、收件箱和归档目录。";
    elements.configureVaultDirsBtn.hidden = false;
    return;
  }

  const selectedCount = Object.values(getPlannerDirectoryValues()).filter(Boolean).length;
  banner.className = "settings-diag-banner vault-link-banner is-warn";
  elements.vaultLinkMessage.textContent = status.configured
    ? `正在重新配置这个 Vault 的目录，已选择 ${selectedCount} / 3。`
    : `第一次使用这个 Vault，请选择三个目录后保存。已选择 ${selectedCount} / 3。`;
  elements.configureVaultDirsBtn.hidden = true;
}

function startVaultDirectoryConfiguration() {
  if (!state.vaultDirectoryStatus) return;
  state.vaultDirectoryEditing = true;
  applyWorkspaceMode("obsidian");
  elements.plannerSettingsHint.textContent = "请选择这个 Vault 的三个目录，保存后会更新联动配置。";
}

async function choosePlannerDirectory(target) {
  const input = getDirectoryPickerInput(target);
  const button = getDirectoryPickerButton(target);
  if (!input || !button || button.disabled || button.hidden) return;

  const label = getDirectoryPickerLabel(target);
  button.disabled = true;
  input.setAttribute("aria-busy", "true");
  elements.plannerSettingsHint.textContent = `正在打开${label}选择器…`;

  try {
    const workspaceMode = document.querySelector('input[name="workspaceMode"]:checked')?.value || "obsidian";
    const response = await fetch("/api/system/select-directory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target,
        currentPath: getDirectoryPickerValue(input),
        vaultRoot: getDirectoryPickerValue(elements.plannerVaultRoot),
        workspaceMode,
        directories: getPlannerDirectoryValues(),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      const pickerError = new Error(data.error || `无法选择${label}`);
      pickerError.status = response.status;
      throw pickerError;
    }
    if (data.canceled) {
      elements.plannerSettingsHint.textContent = `已取消选择，${label}保持不变。`;
      return;
    }
    setDirectoryPickerValue(input, data.path || getDirectoryPickerValue(input), { resetFallback: true });
    if (target === "vault" && data.vault) {
      setVaultDirectoryStatus(
        data.vault,
        data.vault.configured
          ? "Vault 已切换，已恢复它保存的三个目录。"
          : "这是第一次使用这个 Vault，请选择三个目录后保存。",
      );
      return;
    }
    if (workspaceMode === "obsidian") {
      const existingDirectories = state.vaultDirectoryStatus?.directories || {};
      state.vaultDirectoryStatus = {
        vaultRoot: getDirectoryPickerValue(elements.plannerVaultRoot),
        configured: Boolean(state.vaultDirectoryStatus?.configured),
        directories: { ...existingDirectories, ...getPlannerDirectoryValues() },
      };
      state.vaultDirectoryEditing = true;
      renderVaultLinkBanner();
    }
    const convertedHint = workspaceMode === "obsidian" && target !== "vault"
      ? "，已转换为 Vault 内相对路径"
      : "";
    elements.plannerSettingsHint.textContent = `${label}已选择${convertedHint}，保存后生效。`;
  } catch (error) {
    if (error.status === 400 || error.status === 403) {
      elements.plannerSettingsHint.textContent = error.message;
      return;
    }
    const fallbackPathValue = getDirectoryPickerValue(input);
    input.dataset.manualFallback = "true";
    input.value = fallbackPathValue;
    input.readOnly = false;
    input.classList.remove("is-picker-trigger");
    input.title = input.value;
    input.focus();
    elements.plannerSettingsHint.textContent = `${error.message} 已切换为手动输入。`;
  } finally {
    button.disabled = false;
    input.removeAttribute("aria-busy");
  }
}

function applyWorkspaceMode(mode) {
  const isStandalone = mode === 'standalone';
  const isLinkedVault = !isStandalone
    && state.vaultDirectoryStatus?.configured
    && !state.vaultDirectoryEditing;
  if (elements.vaultRootLabel) {
    elements.vaultRootLabel.hidden = isStandalone;
  }
  if (elements.plannerTopicDir) {
    elements.plannerTopicDir.placeholder = isStandalone ? '行动卡片' : '40_行动卡片';
  }
  if (elements.plannerInboxDir) {
    elements.plannerInboxDir.placeholder = isStandalone ? '收件箱' : '00_收件箱';
  }
  if (elements.plannerArchiveDir) {
    elements.plannerArchiveDir.placeholder = isStandalone ? '归档' : '行动卡片';
  }
  elements.directoryPickerButtons.forEach((button) => {
    const target = button.dataset.directoryPicker;
    button.hidden = target === "vault" ? isStandalone : (!isStandalone && isLinkedVault);
  });
  elements.directoryLinkIndicators.forEach((indicator) => {
    indicator.hidden = !isLinkedVault;
  });
  [
    ["vault", elements.plannerVaultRoot],
    ["topic", elements.plannerTopicDir],
    ["inbox", elements.plannerInboxDir],
    ["archive", elements.plannerArchiveDir],
  ].forEach(([target, input]) => {
    if (!input) return;
    const isActivePicker = target === "vault"
      ? !isStandalone
      : (isStandalone || !isLinkedVault);
    const isLinkedDirectory = isLinkedVault && target !== "vault";
    if (isLinkedDirectory) delete input.dataset.manualFallback;
    input.readOnly = isLinkedDirectory || (isActivePicker && input.dataset.manualFallback !== "true");
    input.classList.toggle("is-picker-trigger", isActivePicker && input.readOnly);
    input.classList.toggle("is-linked-directory", isLinkedDirectory);
    if (isActivePicker && input.readOnly) {
      input.setAttribute("aria-haspopup", "dialog");
    } else {
      input.removeAttribute("aria-haspopup");
    }
  });
  if (elements.plannerSettingsHint) {
    elements.plannerSettingsHint.textContent = isStandalone
      ? '独立模式：点击路径框或文件夹按钮，直接选择本机目录。'
      : (isLinkedVault
        ? 'Obsidian 模式：三个目录已跟随当前 Vault 自动接入。'
        : 'Obsidian 模式：首次使用这个 Vault，请选择三个目录并保存。');
  }
  renderVaultLinkBanner();
}

async function loadSettingsDiagnostics() {
  const banner = elements.settingsDiagBanner;
  if (!banner) return;
  banner.hidden = false;
  banner.className = 'settings-diag-banner is-checking';
  banner.textContent = '正在验证路径…';
  try {
    const response = await fetch('/api/diagnostics');
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || '诊断失败');
    }
    const failed = (data.checks || []).filter((c) => !c.ok);
    if (data.ok && failed.length === 0) {
      banner.className = 'settings-diag-banner is-ok';
      banner.textContent = '✓ 路径验证通过，已准备就绪';
    } else {
      banner.className = 'settings-diag-banner is-warn';
      banner.textContent = failed.length
        ? `⚠ 有 ${failed.length} 个路径无法访问：${failed.map((c) => c.label).join('、')}`
        : '⚠ 配置需要处理，请检查目录设置';
    }
  } catch (error) {
    banner.className = 'settings-diag-banner is-warn';
    banner.textContent = `⚠ 路径验证失败：${error.message}`;
  }
}

function formatCandidateConfidence(level = 'medium') {
  if (level === 'high') return '高';
  if (level === 'low') return '低';
  return '中';
}

function shouldOpenDailyInboxReminder() {
  const params = new URLSearchParams(window.location.search);
  return params.has("inboxDate") || ["1", "true"].includes(String(params.get("dailyInbox") || "").toLowerCase());
}

function getInboxReminderDate() {
  const params = new URLSearchParams(window.location.search);
  const explicitDate = String(params.get("inboxDate") || params.get("date") || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(explicitDate) ? explicitDate : formatDate(new Date());
}

function normalizeSourcePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/g, "");
}

function normalizeInboxDir(value) {
  return normalizeSourcePath(value || "00_收件箱").replace(/\/+$/g, "");
}

function getInboxFolderPrefix(date = state.dailyInboxDate || getInboxReminderDate()) {
  return `${normalizeInboxDir(state.settings?.inboxDir)}/${date}/`;
}

function getDailyInboxCandidates(date = state.dailyInboxDate || getInboxReminderDate()) {
  const prefix = getInboxFolderPrefix(date);
  return (state.inboxCandidates || []).filter((candidate) =>
    normalizeSourcePath(candidate.sourcePath).startsWith(prefix),
  );
}

function getSelectedDailyInboxCandidates(date = state.dailyInboxDate || getInboxReminderDate()) {
  return getDailyInboxCandidates(date).filter((candidate) => state.selectedInboxPaths.has(candidate.sourcePath));
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
      const calendarName = settings.larkCalendarName || state.lark.calendarName || "主日历";
      return `飞书已连接，排期时会同步到「${calendarName}」。`;
    }
    if (state.lark?.canRepair) {
      return '选择飞书后，先点击下方“开始飞书授权”完成用户日历授权。';
    }
    return '选择飞书后，先按下方步骤初始化 lark-cli，再完成用户日历授权。';
  }
  if (settings.calendarProvider === 'macos') {
    return settings.macosCalendarName
      ? `排期时会写入 macOS 日历「${settings.macosCalendarName}」。`
      : '排期时会写入 macOS 的第一个可写日历；建议填写 Home 或 Work 这类明确日历名。';
  }
  return '排期只回写 Markdown，适合先试用或不需要外部日历的场景。';
}

function getCalendarHint(provider, lark, settings) {
  if (provider === 'lark') {
    return lark?.available
      ? `会同步到飞书日历「${settings?.larkCalendarName || lark.calendarName || "主日历"}」，同时回写选题卡。`
      : '飞书还没连上。先在首次配置里选择“同步到飞书日历”，按步骤完成初始化和授权。';
  }
  if (provider === 'macos') {
    return settings?.macosCalendarName
      ? `会写入 macOS 日历「${settings.macosCalendarName}」，首次使用可能弹出系统授权。`
      : '会写入 macOS 的第一个可写日历，首次使用可能弹出系统授权；建议先填明确日历名。';
  }
  return '只写入 Obsidian 选题卡，不创建外部日程。';
}

function getScheduleResultMessage(topic, requestedProvider) {
  const status = topic?.calendarSyncStatus || "";
  const provider = topic?.calendarProvider || requestedProvider || "none";
  if (provider === "none") {
    return "排期已保存到 Markdown。";
  }
  if (status.startsWith("同步失败")) {
    return `排期已保存，但外部日历同步失败：${status.replace(/^同步失败：?/, "") || "请检查日历权限"}`;
  }
  if (provider === "macos") {
    const calendarName = topic?.macosCalendarName || state.settings?.macosCalendarName || "macOS 日历";
    return `排期已保存，并同步到 macOS「${calendarName}」。`;
  }
  if (provider === "lark") {
    const calendarName = topic?.larkCalendarName || state.settings?.larkCalendarName || state.lark?.calendarName || "飞书日历";
    return `排期已保存，并同步到飞书「${calendarName}」。`;
  }
  return "排期已保存。";
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

function getSelectedLarkCalendarName() {
  const selectedId = elements.plannerLarkCalendarId?.value || "";
  if (!selectedId) return "";
  const selectedCalendar = state.larkCalendars.find((calendar) => calendar.id === selectedId);
  if (selectedCalendar?.name) return selectedCalendar.name;
  if (selectedId === state.lark?.calendarId) return state.lark.calendarName || "";
  return state.settings?.larkCalendarName || "";
}

function getWorkspaceKind(settings) {
  if (settings?.workspaceMode === 'standalone') return "独立模式";
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
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : { error: await response.text() };
    if (!response.ok) {
      const fallback = response.status === 404
        ? "接口不存在。请重启 npm run dev 后刷新页面。"
        : "操作失败";
      throw new Error(data.error || fallback);
    }
    await loadTopics();
    return data;
  } catch (error) {
    alert(error.message);
    return null;
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

function isTopicOverdue(topic) {
  if (!topic.scheduledDate) return false;
  if (["已拒绝", "已归档", "已发布"].includes(topic.stage)) return false;
  const now = new Date();
  if (topic.scheduledEnd && /^\d{2}:\d{2}$/.test(topic.scheduledEnd)) {
    const end = new Date(`${topic.scheduledDate}T${topic.scheduledEnd}`);
    return !Number.isNaN(end.getTime()) && end < now;
  }
  return topic.scheduledDate < formatDate(now);
}

function readStoredBacklogPageSize() {
  const value = Number(window.localStorage.getItem(BACKLOG_PAGE_SIZE_KEY));
  return [2, 3, 4, 6].includes(value) ? value : DEFAULT_BACKLOG_PAGE_SIZE;
}

function readInboxPageSizeValue(value) {
  const pageSize = Number(value);
  return [5, 10, 20].includes(pageSize) ? pageSize : DEFAULT_INBOX_PAGE_SIZE;
}

function readStoredInboxPageSize() {
  return readInboxPageSizeValue(window.localStorage.getItem(INBOX_PAGE_SIZE_KEY));
}

function setBusy(busy) {
  document.body.style.cursor = busy ? "progress" : "";
}
