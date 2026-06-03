const stateBag = {
  data: null,
  tab: localStorage.getItem("kokubayashi.tab") || "feed",
  actorId: localStorage.getItem("kokubayashi.actorId") || "",
  activeChatId: localStorage.getItem("kokubayashi.chatId") || "",
  selectedCalendarDayId: localStorage.getItem("kokubayashi.calendarDayId") || "",
  selectedCalendarMonth: Number(localStorage.getItem("kokubayashi.calendarMonth")) || 4,
  gmScheduleDayId: localStorage.getItem("kokubayashi.gmScheduleDayId") || "",
  profileId: "",
  privateChatOpen: false,
  chatMemberPanelChatId: "",
  memberDrawerChatId: "",
  openReplyPostId: "",
  actorSearch: "",
  quickActorSearch: "",
  quickActorSearchDraft: "",
  previewActorId: "",
  previewPickActorId: "",
  chatSearch: localStorage.getItem("kokubayashi.chatSearch") || "",
  feedFilter: normalizeFeedFilter(localStorage.getItem("kokubayashi.feedFilter") || "all"),
  feedSearch: localStorage.getItem("kokubayashi.feedSearch") || "",
  feedHashtag: normalizeHashtag(localStorage.getItem("kokubayashi.feedHashtag") || ""),
  rosterSearch: localStorage.getItem("kokubayashi.rosterSearch") || "",
  rosterTag: localStorage.getItem("kokubayashi.rosterTag") || "",
  pinnedChatIds: readLocalJson("kokubayashi.pinnedChatIds", []),
  chatReadTimes: readLocalJson("kokubayashi.chatReadTimes", {}),
  gmCollapsedSections: readLocalJson("kokubayashi.gmCollapsedSections", {}),
  chatNewPromptId: "",
  renderedChatId: "",
  renderedLatestMessageId: "",
  lastGmCreatedAccount: null,
  lastGmImportedAccounts: [],
  gmPin: localStorage.getItem("kokubayashi.gmPin") || "",
  accountTokens: readAccountTokens(),
  gmUnlocked: localStorage.getItem("kokubayashi.gmUnlocked") === "true",
  refreshInFlight: false
};

const els = {
  viewRoot: document.getElementById("view-root"),
  viewTitle: document.getElementById("view-title"),
  clockLine: document.getElementById("clock-line"),
  quickbar: document.getElementById("gm-quickbar"),
  actorSearch: document.getElementById("actor-search"),
  actorSelect: document.getElementById("actor-select"),
  actorPreview: document.getElementById("actor-preview"),
  gmBadge: document.getElementById("gm-badge"),
  notice: document.getElementById("notice"),
  brandSubtitle: document.getElementById("brand-subtitle"),
  accountTools: document.getElementById("account-tools")
};

const tabNames = {
  feed: "时间线",
  bulletins: "公告",
  chats: "聊天",
  calendar: "校历",
  gm: "GM"
};

const HASHTAG_PATTERN = /(^|[^A-Za-z0-9_])#([\p{L}\p{N}_][\p{L}\p{N}_-]{0,48})/gu;

async function boot() {
  bindGlobalEvents();
  await refresh(true);
  setInterval(() => {
    const tag = document.activeElement?.tagName;
    if (!["TEXTAREA", "INPUT", "SELECT"].includes(tag)) refresh(false);
  }, 2200);
}

function bindGlobalEvents() {
  document.body.addEventListener("click", async (event) => {
    try {
      const tabButton = event.target.closest("[data-tab]");
      if (tabButton) {
        setTab(tabButton.dataset.tab);
        return;
      }

      const action = event.target.closest("[data-action]");
      if (!action) return;
      await handleAction(action, event);
    } catch (error) {
      showNotice(error.message || "操作失败。");
    }
  });

  document.body.addEventListener("change", (event) => {
    const imageHints = {
      "post-image": "未选择图片",
      "message-image": "未选择图片",
      "account-avatar": "未选择头像",
      "avatar-update-file": "未选择头像",
      "gm-account-avatar": "未选择头像",
      "new-character-avatar": "未选择头像",
      "emoji-file": "未选择图片"
    };
    if (event.target?.id && imageHints[event.target.id]) {
      const hint = document.getElementById(`${event.target.id}-hint`);
      if (hint) hint.textContent = event.target.files?.[0]?.name || imageHints[event.target.id];
    }
    if (event.target?.classList?.contains("character-avatar-input")) {
      const hint = document.getElementById(`character-avatar-hint-${event.target.dataset.characterId}`);
      if (hint) hint.textContent = event.target.files?.[0]?.name || "未选择头像";
    }
    if (event.target?.id === "gm-schedule-day") {
      stateBag.gmScheduleDayId = event.target.value;
      localStorage.setItem("kokubayashi.gmScheduleDayId", stateBag.gmScheduleDayId);
      const day = getCalendarDay(stateBag.gmScheduleDayId);
      if (day) setSelectedCalendarMonth(day.month);
      renderGm();
    }
    if (event.target?.id === "quick-actor-select") {
      stateBag.actorId = event.target.value;
      localStorage.setItem("kokubayashi.actorId", stateBag.actorId);
      stateBag.openReplyPostId = "";
      render();
    }
    if (event.target?.id === "quick-preview-select") {
      stateBag.previewPickActorId = event.target.value;
      renderShell();
    }
    if (event.target?.id === "event-day") {
      stateBag.gmScheduleDayId = event.target.value;
      localStorage.setItem("kokubayashi.gmScheduleDayId", stateBag.gmScheduleDayId);
      const day = getCalendarDay(stateBag.gmScheduleDayId);
      if (day) setSelectedCalendarMonth(day.month);
      renderGm();
    }
    if (event.target?.id === "batch-template" || event.target?.id === "batch-copy-day") {
      populateBatchScheduleTemplate();
      updateBatchPreview();
    }
    if (event.target?.id?.startsWith("batch-") || event.target?.classList?.contains("batch-weekday")) {
      updateBatchPreview();
    }
  });

  document.body.addEventListener("input", (event) => {
    const target = event.target;
    if (!target) return;
    if (target.classList?.contains("member-filter-input")) {
      filterMemberPicker(target);
      return;
    }
    if (!target.id) return;
    if (target.id === "actor-search") {
      stateBag.actorSearch = target.value;
      renderShell();
      return;
    }
    if (target.id === "quick-actor-search") {
      stateBag.quickActorSearchDraft = target.value;
      return;
    }
    if (target.id === "chat-search") {
      stateBag.chatSearch = target.value;
      localStorage.setItem("kokubayashi.chatSearch", stateBag.chatSearch);
      renderChats();
      return;
    }
    if (target.id === "feed-search") {
      stateBag.feedSearch = target.value;
      localStorage.setItem("kokubayashi.feedSearch", stateBag.feedSearch);
      renderFeed();
      return;
    }
    if (target.id === "roster-search") {
      stateBag.rosterSearch = target.value;
      localStorage.setItem("kokubayashi.rosterSearch", stateBag.rosterSearch);
      renderGm();
      return;
    }
  });

  document.body.addEventListener("keydown", (event) => {
    if (event.target?.id === "quick-actor-search" && event.key === "Enter") {
      event.preventDefault();
      applyQuickActorSearch();
    }
    if (event.target?.id === "quick-game-time" && event.key === "Enter") {
      event.preventDefault();
      quickSaveTime().catch((error) => showNotice(error.message || "操作失败。"));
    }
  });

  els.actorSelect.addEventListener("change", () => {
    stateBag.actorId = els.actorSelect.value;
    localStorage.setItem("kokubayashi.actorId", stateBag.actorId);
    render();
  });
  els.actorSearch.addEventListener("input", () => {
    stateBag.actorSearch = els.actorSearch.value;
    renderShell();
  });
}

async function handleAction(target) {
  const action = target.dataset.action;
  if (isPreviewMode() && !isPreviewAllowedAction(action)) {
    showNotice("玩家视角预览是只读模式。退出预览后再执行 GM 或发言操作。");
    return;
  }
  if (action === "start-player-preview") return startPlayerPreview();
  if (action === "stop-player-preview") return stopPlayerPreview();
  if (action === "apply-quick-actor-search") return applyQuickActorSearch();
  if (action === "quick-adjust-time") return quickAdjustTime(target.dataset.minutes);
  if (action === "quick-save-time") return quickSaveTime();
  if (action === "publish-post") return publishPost();
  if (action === "like-post") return likePost(target.dataset.postId);
  if (action === "reply-post") return replyPost(target.dataset.postId);
  if (action === "toggle-reply-composer") return toggleReplyComposer(target.dataset.postId);
  if (action === "delete-reply") return deleteReply(target.dataset.postId, target.dataset.replyId);
  if (action === "save-post") return savePost(target.dataset.postId);
  if (action === "delete-post") return deletePost(target.dataset.postId);
  if (action === "delete-message") return deleteMessage(target.dataset.messageId);
  if (action === "delete-chat") return deleteChat(target.dataset.chatId);
  if (action === "open-gm-chat") return openGmChat(target.dataset.chatId);
  if (action === "open-gm-feed") return setTab("feed");
  if (action === "set-feed-filter") return setFeedFilter(target.dataset.filter);
  if (action === "filter-hashtag") return setFeedHashtag(target.dataset.hashtag);
  if (action === "clear-feed-hashtag") return setFeedHashtag("");
  if (action === "publish-bulletin") return publishBulletin();
  if (action === "delete-bulletin") return deleteBulletin(target.dataset.bulletinId);
  if (action === "select-chat") return selectChat(target.dataset.chatId);
  if (action === "toggle-pin-chat") return togglePinChat(target.dataset.chatId);
  if (action === "jump-latest") return jumpToLatest();
  if (action === "toggle-member-drawer") return toggleMemberDrawer(target.dataset.chatId);
  if (action === "send-message") return sendMessage();
  if (action === "select-calendar-month") return selectCalendarMonth(target.dataset.month);
  if (action === "select-calendar-day") return selectCalendarDay(target.dataset.dayId);
  if (action === "save-current-calendar-day") return saveCurrentCalendarDay();
  if (action === "save-calendar-schedule") return saveCalendarSchedule();
  if (action === "apply-calendar-batch") return applyCalendarBatch();
  if (action === "create-calendar-event") return createCalendarEvent();
  if (action === "trigger-calendar-event") return triggerCalendarEvent(target.dataset.dayId, target.dataset.eventId);
  if (action === "delete-calendar-event") return deleteCalendarEvent(target.dataset.dayId, target.dataset.eventId);
  if (action === "gm-undo") return gmUndo();
  if (action === "unlock-gm") return unlockGm();
  if (action === "lock-gm") return lockGm();
  if (action === "export-markdown") return downloadGmMarkdown("/api/export.md", "kunibayashi-export");
  if (action === "export-gm-chats") return downloadGmMarkdown("/api/gm/chats/export.md", "kunibayashi-chats");
  if (action === "save-settings") return saveSettings();
  if (action === "create-character") return createCharacter();
  if (action === "import-characters") return importCharacters();
  if (action === "create-gm-player-account") return createGmPlayerAccount();
  if (action === "import-player-accounts") return importPlayerAccounts();
  if (action === "select-all-player-accounts") return setPlayerAccountSelection(true);
  if (action === "clear-player-account-selection") return setPlayerAccountSelection(false);
  if (action === "delete-selected-player-accounts") return deleteSelectedPlayerAccounts();
  if (action === "delete-all-player-accounts") return deleteAllPlayerAccounts();
  if (action === "update-account-avatar" || action === "update-character-avatar") return updateCharacterAvatar(target.dataset.characterId);
  if (action === "save-character-profile") return saveCharacterProfile(target.dataset.characterId);
  if (action === "save-character-tags") return saveCharacterTags(target.dataset.characterId);
  if (action === "delete-character") return deleteCharacter(target.dataset.characterId);
  if (action === "delete-all-characters") return deleteAllCharacters();
  if (action === "create-chat") return createChat();
  if (action === "create-player-account") return createPlayerAccount();
  if (action === "login-player-account") return loginPlayerAccount();
  if (action === "switch-account") return switchAccount(target.dataset.characterId);
  if (action === "logout-account") return logoutAccount(target.dataset.characterId);
  if (action === "update-avatar") return updateAvatar();
  if (action === "upload-emoji") return uploadEmoji();
  if (action === "insert-emoji") return insertEmoji(target.dataset.target, target.dataset.value);
  if (action === "view-profile") return viewProfile(target.dataset.characterId);
  if (action === "close-profile") return closeProfile();
  if (action === "request-follow") return requestFollow(target.dataset.characterId);
  if (action === "approve-follow") return updateFollow(target.dataset.followId, "accepted");
  if (action === "reject-follow") return updateFollow(target.dataset.followId, "rejected");
  if (action === "request-chat-member-add") return requestChatMemberChange("add");
  if (action === "request-chat-member-remove") return requestChatMemberChange("remove");
  if (action === "toggle-chat-member-panel") return toggleChatMemberPanel(target.dataset.chatId);
  if (action === "approve-chat-member-request") return updateChatMemberRequest(target.dataset.requestId, "accepted");
  if (action === "reject-chat-member-request") return updateChatMemberRequest(target.dataset.requestId, "rejected");
  if (action === "open-direct-chat") return openDirectChat(target.dataset.characterId);
  if (action === "toggle-private-chat-form") return togglePrivateChatForm();
  if (action === "create-player-chat") return createPlayerPrivateChat();
  if (action === "toggle-gm-section") return toggleGmSection(target.dataset.sectionId);
  if (action === "set-roster-tag") return setRosterTag(target.dataset.tag || "");
}

async function refresh(forceRender) {
  if (stateBag.refreshInFlight && !forceRender) return;
  stateBag.refreshInFlight = true;
  const previousUpdatedAt = stateBag.data?.updatedAt;
  try {
    const path = !forceRender && previousUpdatedAt
      ? `/api/state?since=${encodeURIComponent(previousUpdatedAt)}`
      : "/api/state";
    const payload = await api(path);
    if (payload?.changed === false) return;
    const data = payload?.changed === true && payload.state ? payload.state : payload;
    if (!data?.updatedAt) return;
    stateBag.data = data;
    ensureActor();
    ensureChat();
    const changed = previousUpdatedAt !== data.updatedAt;
    if (forceRender || (changed && canAutoRender())) render();
  } finally {
    stateBag.refreshInFlight = false;
  }
}

function ensureActor() {
  if (isPreviewMode()) {
    const previewActor = getActor(stateBag.previewActorId);
    if (!previewActor || previewActor.active === false) {
      stateBag.previewActorId = "";
      if (stateBag.tab === "gm") stateBag.tab = "feed";
    }
    return;
  }
  const actors = availableActors();
  if (!actors.length) {
    stateBag.actorId = "";
    localStorage.removeItem("kokubayashi.actorId");
    return;
  }
  if (!stateBag.actorId || !actors.some((actor) => actor.id === stateBag.actorId)) {
    stateBag.actorId = actors[0].id;
    localStorage.setItem("kokubayashi.actorId", stateBag.actorId);
  }
}

function ensureChat() {
  const chats = visibleChats();
  if (!chats.length) {
    stateBag.activeChatId = "";
    return;
  }
  if (!stateBag.activeChatId || !chats.some((chat) => chat.id === stateBag.activeChatId)) {
    stateBag.activeChatId = chats[0].id;
    localStorage.setItem("kokubayashi.chatId", stateBag.activeChatId);
  }
}

function setTab(tab) {
  if (isPreviewMode() && tab === "gm") tab = "feed";
  stateBag.tab = tab;
  localStorage.setItem("kokubayashi.tab", tab);
  render();
}

function render() {
  if (!stateBag.data) return;
  renderShell();
  if (stateBag.tab === "feed") renderFeed();
  if (stateBag.tab === "bulletins") renderBulletins();
  if (stateBag.tab === "chats") renderChats();
  if (stateBag.tab === "calendar") renderCalendar();
  if (stateBag.tab === "gm") renderGm();
  renderProfileOverlay();
}

function canAutoRender() {
  const tag = document.activeElement?.tagName;
  if (["TEXTAREA", "INPUT", "SELECT"].includes(tag)) return false;
  if (hasPendingFileSelection()) return false;
  return !hasDraftText();
}

function hasPendingFileSelection() {
  return ["post-image", "message-image", "account-avatar", "avatar-update-file", "gm-account-avatar", "new-character-avatar", "emoji-file"]
    .some((id) => (document.getElementById(id)?.files?.length || 0) > 0)
    || Array.from(document.querySelectorAll(".character-avatar-input")).some((input) => (input.files?.length || 0) > 0);
}

function hasDraftText() {
  const draftSelector = [
    "#post-content",
    "#message-content",
    ".reply-composer textarea",
    "#private-chat-name",
    "#new-chat-name",
    "#new-character-name",
    "#character-import-text",
    "#account-name",
    "#account-handle",
    "#account-passcode",
    "#login-handle",
    "#login-passcode",
    "#gm-account-name",
    "#gm-account-username",
    "#gm-account-handle",
    "#gm-account-passcode",
    "#gm-account-tags",
    "#account-import-text",
    "#emoji-shortcode",
    "#calendar-date-label",
    "#calendar-note",
    "#calendar-schedule-text",
    "#bulletin-title",
    "#bulletin-content",
    "#event-title",
    "#event-detail"
  ].join(",");
  return Array.from(document.querySelectorAll(draftSelector))
    .some((element) => String(element.value || "").trim());
}

function renderShell() {
  const state = stateBag.data;
  els.viewTitle.textContent = tabNames[stateBag.tab] || "时间线";
  els.clockLine.textContent = `${state.settings.schoolDay || ""} ${state.settings.gameTime || ""}`.trim();
  els.brandSubtitle.textContent = state.settings.chatName || "K-LINE";
  const previewActor = currentPreviewActor();
  els.gmBadge.textContent = isPreviewMode() ? `玩家预览：${previewActor?.name || ""}` : (stateBag.gmUnlocked ? "GM 已解锁" : "玩家模式");
  els.gmBadge.classList.toggle("enabled", isGmAdminMode());
  els.gmBadge.classList.toggle("preview", isPreviewMode());

  document.querySelectorAll("[data-tab]").forEach((button) => {
    const label = tabNames[button.dataset.tab] || button.dataset.tab;
    const badge = navBadgeFor(button.dataset.tab);
    button.hidden = isPreviewMode() && button.dataset.tab === "gm";
    button.innerHTML = `<span>${escapeHtml(label)}</span>${badge ? `<span class="nav-badge">${badge}</span>` : ""}`;
    button.classList.toggle("active", button.dataset.tab === stateBag.tab);
  });

  const actors = availableActors();
  if (!isGmAdminMode() && !isPreviewMode() && stateBag.actorId && !actors.some((actor) => actor.id === stateBag.actorId)) {
    stateBag.actorId = "";
    localStorage.removeItem("kokubayashi.actorId");
  }
  const hideIdentityPicker = !isGmAdminMode();
  const identityLabel = document.querySelector("label[for='actor-select']");
  if (identityLabel) identityLabel.hidden = hideIdentityPicker;
  els.actorSearch.hidden = hideIdentityPicker;
  els.actorSelect.hidden = hideIdentityPicker;
  els.actorPreview.hidden = hideIdentityPicker;
  if (els.actorSearch.value !== stateBag.actorSearch) els.actorSearch.value = stateBag.actorSearch;
  const filteredActors = filterActorsForPicker(actors);
  els.actorSelect.innerHTML = actors.length
    ? `${isGmAdminMode() ? "" : `<option value="">未选择账号</option>`}${filteredActors.map((actor) => `<option value="${actor.id}">${escapeHtml(actor.name)} ${escapeHtml(actor.handle)}</option>`).join("")}`
    : `<option value="">创建玩家账号后使用</option>`;
  els.actorSelect.value = stateBag.actorId;
  els.actorPreview.innerHTML = renderActorPreview(getActor(stateBag.actorId));
  els.accountTools.innerHTML = renderAccountTools();
  els.quickbar.hidden = !stateBag.gmUnlocked;
  els.quickbar.innerHTML = stateBag.gmUnlocked ? renderGmQuickbar() : "";
}

function filterActorsForPicker(actors) {
  const query = normalizeSearch(stateBag.actorSearch);
  const filtered = query
    ? actors.filter((actor) => searchableText([actor.name, actor.handle, actor.username, characterTags(actor).join(" ")]).includes(query))
    : actors;
  const selected = actors.find((actor) => actor.id === stateBag.actorId);
  if (selected && !filtered.some((actor) => actor.id === selected.id)) return [selected, ...filtered];
  return filtered;
}

function filterMemberPicker(input) {
  const picker = input.parentElement?.querySelector(".member-picker");
  if (!picker) return;
  const query = normalizeSearch(input.value);
  Array.from(picker.querySelectorAll(".member-option")).forEach((option) => {
    option.hidden = query ? !normalizeSearch(option.textContent).includes(query) : false;
  });
}

function renderGmQuickbar() {
  const allCharacters = stateBag.data?.characters?.filter((item) => item.active !== false) || [];
  const previewCandidates = allCharacters;
  if (isPreviewMode()) {
    const actor = currentPreviewActor();
    return `
      <div class="quickbar-preview">
        <div class="quickbar-person">
          ${renderAvatar(actor)}
          <div class="name-block">
            <div class="name">玩家视角预览</div>
            <div class="handle">${escapeHtml(actor ? `${actor.name} ${actor.handle || ""}` : "未选择玩家")}</div>
          </div>
        </div>
        <div class="hint">当前为只读预览；聊天、公告、匿名内容会按该玩家权限过滤。</div>
        <button class="primary-button compact-action" type="button" data-action="stop-player-preview">退出预览</button>
      </div>
    `;
  }

  const roleOptions = filterActorsForQuickbar(allCharacters);
  const previewPick = previewCandidates.some((account) => account.id === stateBag.previewPickActorId)
    ? stateBag.previewPickActorId
    : (previewCandidates[0]?.id || "");
  stateBag.previewPickActorId = previewPick;

  return `
    <div class="quickbar-grid">
      <div class="quickbar-block role-block">
        <div class="mini-title">快速扮演</div>
        <div class="quick-search-row">
          <input id="quick-actor-search" value="${escapeAttr(stateBag.quickActorSearchDraft)}" placeholder="搜索角色 / @handle / 标签">
          <button class="secondary-button compact-action" type="button" data-action="apply-quick-actor-search">搜索</button>
        </div>
        <select id="quick-actor-select" aria-label="快速切换扮演角色">
          ${roleOptions.map((actor) => `<option value="${escapeAttr(actor.id)}" ${actor.id === stateBag.actorId ? "selected" : ""}>${escapeHtml(actor.name)} ${escapeHtml(actor.handle || "")}</option>`).join("")}
        </select>
      </div>
      <div class="quickbar-block time-block">
        <div class="mini-title">快速时间</div>
        <div class="quick-time-row">
          <select id="quick-current-day" aria-label="快速设置当前日期">
            ${renderDayOptions(calendarDays(), stateBag.data.settings.currentDayId)}
          </select>
          <input id="quick-game-time" value="${escapeAttr(stateBag.data.settings.gameTime || "")}" placeholder="08:20">
          <button class="secondary-button compact-action" type="button" data-action="quick-save-time">保存</button>
        </div>
        <div class="quick-time-steps" aria-label="快速调整游戏时间">
          <button class="ghost-button compact-action" type="button" data-action="quick-adjust-time" data-minutes="-60">-1h</button>
          <button class="ghost-button compact-action" type="button" data-action="quick-adjust-time" data-minutes="-15">-15m</button>
          <button class="ghost-button compact-action" type="button" data-action="quick-adjust-time" data-minutes="15">+15m</button>
          <button class="ghost-button compact-action" type="button" data-action="quick-adjust-time" data-minutes="60">+1h</button>
        </div>
      </div>
      <div class="quickbar-block preview-block">
        <div class="mini-title">玩家视角</div>
        <select id="quick-preview-select" aria-label="选择玩家预览">
          ${previewCandidates.map((account) => `<option value="${escapeAttr(account.id)}" ${account.id === previewPick ? "selected" : ""}>${escapeHtml(account.name)} ${escapeHtml(account.handle || "")}</option>`).join("")}
        </select>
        <button class="primary-button compact-action" type="button" data-action="start-player-preview" ${previewCandidates.length ? "" : "disabled"}>预览</button>
      </div>
    </div>
  `;
}

function filterActorsForQuickbar(actors) {
  const query = normalizeSearch(stateBag.quickActorSearch);
  const filtered = query
    ? actors.filter((actor) => searchableText([actor.name, actor.handle, actor.username, characterTags(actor).join(" ")]).includes(query))
    : actors;
  const selected = actors.find((actor) => actor.id === stateBag.actorId);
  if (selected && !filtered.some((actor) => actor.id === selected.id)) return [selected, ...filtered];
  return filtered;
}

function applyQuickActorSearch() {
  const input = document.getElementById("quick-actor-search");
  const query = input ? input.value : stateBag.quickActorSearchDraft;
  stateBag.quickActorSearchDraft = query;
  stateBag.quickActorSearch = query;
  renderShell();
}

function isPreviewMode() {
  return stateBag.gmUnlocked && Boolean(stateBag.previewActorId);
}

function isGmAdminMode() {
  return stateBag.gmUnlocked && !isPreviewMode();
}

function effectiveActorId() {
  return isPreviewMode() ? stateBag.previewActorId : stateBag.actorId;
}

function currentPreviewActor() {
  return stateBag.previewActorId ? getActor(stateBag.previewActorId) : null;
}

function isPreviewAllowedAction(action) {
  return [
    "set-feed-filter",
    "filter-hashtag",
    "clear-feed-hashtag",
    "select-chat",
    "toggle-pin-chat",
    "jump-latest",
    "toggle-member-drawer",
    "select-calendar-month",
    "select-calendar-day",
    "view-profile",
    "close-profile",
    "stop-player-preview"
  ].includes(action);
}

function navBadgeFor(tab) {
  if (!stateBag.data) return "";
  if (tab === "chats") {
    const count = unreadChatCount();
    return count ? String(Math.min(count, 99)) : "";
  }
  if (tab === "gm" && isGmAdminMode()) {
    const pending = pendingGmCount();
    return pending ? String(Math.min(pending, 99)) : "";
  }
  return "";
}

function pendingGmCount() {
  const follows = (stateBag.data?.relationships || []).filter((item) => item.status === "pending").length;
  const memberRequests = (stateBag.data?.chatMemberRequests || []).filter((item) => item.status === "pending").length;
  const events = (stateBag.data?.calendarDays || []).reduce((sum, day) => sum + (day.events || []).filter((event) => !event.triggeredAt).length, 0);
  return follows + memberRequests + events;
}

function unreadChatCount() {
  const chats = visibleChats();
  return chats.reduce((sum, chat) => sum + unreadMessagesForChat(chat).length, 0);
}

function unreadMessagesForChat(chat) {
  if (!chat) return [];
  const readTime = stateBag.chatReadTimes[chat.id] || "";
  const actorId = effectiveActorId();
  return (stateBag.data?.messages || []).filter((message) => (
    message.chatId === chat.id &&
    (!readTime || String(message.createdAt).localeCompare(String(readTime)) > 0) &&
    (!actorId || message.authorId !== actorId)
  ));
}

function renderFeed() {
  const posts = filteredFeedPosts(sortTimelinePosts(stateBag.data.posts || []));
  const actor = currentActor();
  const canPost = Boolean(actor) && !isPreviewMode();
  els.viewRoot.innerHTML = `
    <div class="feed-layout">
      ${isGmAdminMode() ? renderPostDayDatalist() : ""}
      <section class="composer">
        <textarea id="post-content" maxlength="280" placeholder="${isPreviewMode() ? "玩家视角预览为只读" : (actor ? "现在发生了什么？" : "先创建玩家账号")}" ${canPost ? "" : "disabled"}></textarea>
        <div class="message-tools post-tools">
          ${renderEmojiBar("post-content")}
          <label class="checkbox-line compact-checkbox">
            <input id="post-anonymous" type="checkbox" ${canPost ? "" : "disabled"}>
            <span>匿名发布</span>
          </label>
          <label class="file-picker">图片
            <input id="post-image" type="file" accept="image/*" ${canPost ? "" : "disabled"}>
          </label>
          <span id="post-image-hint" class="hint">未选择图片</span>
        </div>
        <div class="composer-actions">
          <div class="hint">${escapeHtml(stateBag.data.settings.gameTime)} · ${escapeHtml(actor?.name || "未选择账号")}</div>
          <button class="primary-button" type="button" data-action="publish-post" ${canPost ? "" : "disabled"}>发布</button>
        </div>
      </section>
      <section class="filter-strip" aria-label="时间线筛选">
        <input id="feed-search" value="${escapeAttr(stateBag.feedSearch)}" placeholder="搜索帖子 / 作者 / @handle">
        <div class="segmented-controls">
          ${feedFilterButtons()}
        </div>
        ${renderActiveHashtagFilter()}
        ${renderFeedHashtagCloud()}
      </section>
      <section class="post-list" aria-label="SNS 时间线">
        ${posts.map(renderPost).join("") || `<div class="panel empty-panel">时间线还是空的。</div>`}
      </section>
    </div>
  `;
}

function feedFilterButtons() {
  const filters = [
    ["all", "全部"],
    ["mine", "我的"],
    ["anonymous", "匿名"],
    ["images", "有图"]
  ];
  return filters.map(([value, label]) => `
    <button class="segment-button ${stateBag.feedFilter === value ? "active" : ""}" type="button" data-action="set-feed-filter" data-filter="${value}">${label}</button>
  `).join("");
}

function renderActiveHashtagFilter() {
  const tag = stateBag.feedHashtag;
  if (!tag) return "";
  return `
    <div class="active-hashtag-filter" aria-label="当前标签筛选">
      <span>#${escapeHtml(tag)}</span>
      <button class="ghost-button hashtag-clear-button" type="button" data-action="clear-feed-hashtag">清除</button>
    </div>
  `;
}

function renderFeedHashtagCloud() {
  const tags = rankedFeedHashtags();
  if (!tags.length) return "";
  return `
    <div class="hashtag-strip" aria-label="热门标签">
      ${tags.map(([tag, count]) => `
        <button class="hashtag-chip ${stateBag.feedHashtag === tag ? "active" : ""}" type="button" data-action="filter-hashtag" data-hashtag="${escapeAttr(tag)}">
          #${escapeHtml(tag)} <span>${count}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function rankedFeedHashtags() {
  const counts = new Map();
  for (const post of stateBag.data?.posts || []) {
    for (const tag of postHashtags(post)) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .slice(0, 12);
}

function renderPostDayDatalist() {
  return `
    <datalist id="post-day-options">
      ${calendarDays().map((day) => `<option value="${escapeAttr(dayOptionLabel(day))}">${escapeHtml(day.id)}</option>`).join("")}
    </datalist>
  `;
}

function sortTimelinePosts(posts) {
  return [...posts].sort((a, b) => {
    const aSort = timelineSortValue(a);
    const bSort = timelineSortValue(b);
    if (aSort !== null && bSort !== null && aSort !== bSort) return bSort - aSort;
    if (aSort !== null && bSort === null) return -1;
    if (aSort === null && bSort !== null) return 1;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
}

function timelineSortValue(post) {
  const rawValue = post?.timelineSortKey;
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

function filteredFeedPosts(posts) {
  const query = normalizeSearch(stateBag.feedSearch);
  const actorId = effectiveActorId();
  return posts.filter((post) => {
    const author = getActor(post.authorId);
    if (stateBag.feedFilter === "mine" && post.authorId !== actorId) return false;
    if (stateBag.feedFilter === "anonymous" && post.isAnonymous !== true) return false;
    if (stateBag.feedFilter === "images" && post.attachment?.type !== "image") return false;
    if (stateBag.feedHashtag && !postMatchesHashtag(post, stateBag.feedHashtag)) return false;
    if (!query) return true;
    const replyText = (post.replies || []).map((reply) => reply.content).join(" ");
    return searchableText([post.content, author?.name, author?.handle, replyText, postHashtags(post).join(" ")]).includes(query);
  });
}

function renderBulletins() {
  const bulletins = visibleBulletins()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  els.viewRoot.innerHTML = `
    <div class="bulletin-layout">
      <section class="bulletin-board">
        <div class="board-heading">
          <div>
            <div class="section-title">学校公告栏</div>
            <div class="meta">学校通知、传闻、社团消息和已触发的校历事件。</div>
          </div>
        </div>
        <div class="bulletin-list">
          ${bulletins.map(renderBulletinCard).join("") || `<div class="panel empty-panel">公告栏还没有内容。</div>`}
        </div>
      </section>
    </div>
  `;
}

function renderBulletinCard(bulletin) {
  const author = getActor(bulletin.authorId);
  const day = getCalendarDay(bulletin.dayId);
  const adminTools = isGmAdminMode() ? `
    <div class="admin-row">
      <button class="danger-button" type="button" data-action="delete-bulletin" data-bulletin-id="${bulletin.id}">删除</button>
    </div>
  ` : "";
  return `
    <article class="bulletin-card ${bulletin.type}">
      <div class="bulletin-type">${escapeHtml(typeLabelForBulletin(bulletin.type))}</div>
      <h2>${escapeHtml(bulletin.title || "未命名公告")}</h2>
      <div class="meta">
        ${escapeHtml(bulletin.gameTime || stateBag.data.settings.gameTime || "")}
        ${day ? ` · ${escapeHtml(day.label)} ${escapeHtml(day.dateLabel || "")}` : ""}
        ${author ? ` · ${escapeHtml(author.name)}` : ""}
        ${bulletin.isPublic === false ? " · 仅 GM 可见" : ""}
      </div>
      ${bulletin.content ? `<div class="bulletin-content">${formatText(bulletin.content)}</div>` : ""}
      ${adminTools}
    </article>
  `;
}

function renderPost(post) {
  const isAnonymous = post.isAnonymous === true;
  const author = getActor(post.authorId);
  const profileId = isAnonymous && !isGmAdminMode() ? "" : author?.id || "";
  const displayName = isAnonymous
    ? (isGmAdminMode() && author ? `匿名（${author.name}）` : "匿名")
    : (author?.name || "未知");
  const timelineLabel = postTimelineLabel(post);
  const handleLine = [
    isAnonymous && isGmAdminMode() && author ? author.handle : (!isAnonymous ? author?.handle : ""),
    timelineLabel
  ].filter(Boolean).join(" · ");
  const replies = post.replies || [];
  const replyOpen = !isPreviewMode() && stateBag.openReplyPostId === post.id;
  const postDayValue = dayOptionLabel(getCalendarDay(post.dayId));
  const admin = isGmAdminMode() ? `
    <div class="admin-box">
      <div class="admin-row">
        <label>日期 <input class="time-input" id="post-day-${post.id}" list="post-day-options" value="${escapeAttr(postDayValue)}" placeholder="未指定"></label>
        <label>时间 <input class="time-input" id="post-time-${post.id}" value="${escapeAttr(post.gameTime)}"></label>
        <label>赞 <input id="post-likes-${post.id}" type="number" min="0" value="${post.metrics.likes}"></label>
        <label>转 <input id="post-reposts-${post.id}" type="number" min="0" value="${post.metrics.reposts}"></label>
        <label>看 <input id="post-views-${post.id}" type="number" min="0" value="${post.metrics.views}"></label>
      </div>
      <div class="admin-row">
        <button class="secondary-button" type="button" data-action="save-post" data-post-id="${post.id}">保存调整</button>
        <button class="danger-button" type="button" data-action="delete-post" data-post-id="${post.id}">删除</button>
      </div>
    </div>
  ` : "";

  return `
    <article class="post">
      <header class="post-header">
        <button class="profile-link author-line" type="button" data-action="view-profile" data-character-id="${profileId}" ${profileId ? "" : "disabled"}>
          ${isAnonymous ? renderAnonymousAvatar() : renderAvatar(author)}
          <div class="name-block">
            <div class="name">${escapeHtml(displayName)}</div>
            <div class="handle">${escapeHtml(handleLine)}</div>
          </div>
        </button>
      </header>
      <div class="post-content">${formatText(post.content, { hashtags: true })}</div>
      ${post.attachment?.type === "image" ? renderImageAttachment(post.attachment, "post-image") : ""}
      <div class="post-actions">
        <button class="metric-button" type="button" data-action="like-post" data-post-id="${post.id}" ${isPreviewMode() ? "disabled" : ""}>喜欢 ${post.metrics.likes}</button>
        <button class="metric-button" type="button" data-action="toggle-reply-composer" data-post-id="${post.id}" ${isPreviewMode() ? "disabled" : ""}>${replyOpen ? "收起回复" : `回复${replies.length ? ` ${replies.length}` : ""}`}</button>
        <span>转发 ${post.metrics.reposts}</span>
        <span>浏览 ${post.metrics.views}</span>
      </div>
      ${replies.length ? `<div class="reply-list">${replies.map((reply) => renderReply(post.id, reply)).join("")}</div>` : ""}
      ${replyOpen ? `
        <div class="reply-composer expanded">
          <textarea id="reply-${post.id}" maxlength="240" placeholder="回复"></textarea>
          ${renderEmojiBar(`reply-${post.id}`)}
          <div class="reply-actions">
            <label class="checkbox-line compact-checkbox">
              <input id="reply-anonymous-${post.id}" type="checkbox">
              <span>匿名回复</span>
            </label>
            <button class="secondary-button" type="button" data-action="reply-post" data-post-id="${post.id}">发送回复</button>
            <button class="ghost-button" type="button" data-action="toggle-reply-composer" data-post-id="${post.id}">收起</button>
          </div>
        </div>
      ` : ""}
      ${admin}
    </article>
  `;
}

function renderReply(postId, reply) {
  const isAnonymous = reply.isAnonymous === true;
  const author = getActor(reply.authorId);
  const profileId = isAnonymous && !isGmAdminMode() ? "" : author?.id || "";
  const displayName = isAnonymous
    ? (isGmAdminMode() && author ? `匿名（${author.name}）` : "匿名")
    : (author?.name || "未知");
  return `
    <div class="reply">
      <button class="profile-avatar-button" type="button" data-action="view-profile" data-character-id="${profileId}" ${profileId ? "" : "disabled"}>
        ${isAnonymous ? renderAnonymousAvatar() : renderAvatar(author)}
      </button>
      <div class="reply-body">
        <div class="meta">
          <button class="inline-profile-link" type="button" data-action="view-profile" data-character-id="${profileId}" ${profileId ? "" : "disabled"}>
            <strong>${escapeHtml(displayName)}</strong>
          </button>
          · ${escapeHtml(reply.gameTime)}
          ${canDeleteReply(reply) ? `
            <button class="danger-button reply-delete" type="button" data-action="delete-reply" data-post-id="${escapeAttr(postId)}" data-reply-id="${escapeAttr(reply.id)}">删除</button>
          ` : ""}
        </div>
        <div class="reply-content">${formatText(reply.content)}</div>
      </div>
    </div>
  `;
}

function renderPlayerChatTools() {
  if (stateBag.gmUnlocked || isPreviewMode()) return "";
  const actor = currentActor();
  if (!actor) return "";
  const contacts = acceptedContacts();
  const memberOptions = contacts.map((character) => `
    <label class="member-option compact">
      <input type="checkbox" class="private-member-checkbox" value="${character.id}">
      <span>${escapeHtml(character.name)}</span>
      ${renderCharacterTags(character)}
    </label>
  `).join("");

  return `
    <div class="room-list-header">
      <div class="mini-title">聊天</div>
      <button class="secondary-button compact-action" type="button" data-action="toggle-private-chat-form" ${contacts.length ? "" : "disabled"}>私密群聊</button>
    </div>
    ${stateBag.privateChatOpen ? `
      <div class="private-chat-panel">
        <input id="private-chat-name" maxlength="80" placeholder="群聊名称">
        <input class="member-filter-input" placeholder="搜索可邀请角色 / @handle / 标签">
        <div class="member-picker compact-picker">
          ${memberOptions || `<div class="hint padded">暂无已批准联系人。</div>`}
        </div>
        <button class="primary-button" type="button" data-action="create-player-chat" ${contacts.length ? "" : "disabled"}>创建</button>
      </div>
    ` : ""}
  `;
}

function renderChats() {
  const chats = visibleChats();
  const active = chats.find((chat) => chat.id === stateBag.activeChatId);
  const messages = active ? stateBag.data.messages.filter((message) => message.chatId === active.id).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))) : [];
  const roomChats = filteredAndSortedChats(chats);
  const canSendMessage = Boolean(active && currentActor()) && !isPreviewMode();
  const previousBox = document.getElementById("messages");
  const previousChatId = stateBag.renderedChatId;
  const wasNearBottom = isNearBottom(previousBox);
  const previousScrollTop = previousBox?.scrollTop || 0;
  const latestMessage = messages[messages.length - 1];
  const latestMessageId = latestMessage?.id || "";
  if (active?.id && previousChatId === active.id && stateBag.renderedLatestMessageId && stateBag.renderedLatestMessageId !== latestMessageId && !wasNearBottom) {
    stateBag.chatNewPromptId = active.id;
  }

  els.viewRoot.innerHTML = `
    <div class="chat-layout ${stateBag.memberDrawerChatId === active?.id ? "with-drawer" : ""}">
      <aside class="room-list">
        ${renderPlayerChatTools()}
        <input id="chat-search" class="room-search" value="${escapeAttr(stateBag.chatSearch)}" placeholder="搜索聊天 / 成员">
        ${roomChats.map((chat) => {
          const unread = unreadMessagesForChat(chat).length;
          return `
            <div class="room-entry">
              <button class="pin-chat-button ${isChatPinned(chat.id) ? "active" : ""}" type="button" data-action="toggle-pin-chat" data-chat-id="${escapeAttr(chat.id)}">${isChatPinned(chat.id) ? "已置顶" : "置顶"}</button>
              <button class="room-button ${chat.id === stateBag.activeChatId ? "active" : ""}" type="button" data-action="select-chat" data-chat-id="${chat.id}">
                <div class="name">${escapeHtml(chat.name)}</div>
                <div class="room-meta-row">
                  <span class="meta">${chat.memberIds.length} 人 · ${chat.type === "direct" ? "私聊" : "群聊"}</span>
                  ${unread ? `<span class="room-unread">${Math.min(unread, 99)}</span>` : ""}
                </div>
              </button>
            </div>
          `;
        }).join("") || `<div class="hint">没有符合条件的聊天。</div>`}
      </aside>
      <section class="thread">
        <header class="thread-header">
          <div>
            <div class="section-title">${escapeHtml(active?.name || "聊天")}</div>
            <div class="meta member-links">${renderMemberProfileLinks(active)}</div>
          </div>
          <div class="row-actions">
            ${active ? `<button class="secondary-button compact-action" type="button" data-action="toggle-member-drawer" data-chat-id="${escapeAttr(active.id)}">${stateBag.memberDrawerChatId === active.id ? "收起成员" : "成员"}</button>` : ""}
            ${canDeleteChat(active) ? `<button class="danger-button compact-action" type="button" data-action="delete-chat" data-chat-id="${escapeAttr(active.id)}">删除聊天</button>` : ""}
          </div>
        </header>
        <div class="messages" id="messages">
          ${messages.map(renderMessage).join("") || `<div class="hint">这里还没有消息。</div>`}
        </div>
        ${active && stateBag.chatNewPromptId === active.id ? `<button class="jump-latest-button" type="button" data-action="jump-latest">有新消息，跳到最新</button>` : ""}
        <div class="message-form">
          <textarea id="message-content" maxlength="500" placeholder="${isPreviewMode() ? "玩家视角预览为只读" : "发送消息"}" ${canSendMessage ? "" : "disabled"}></textarea>
          <div class="message-tools">
            ${renderEmojiBar("message-content")}
            <label class="checkbox-line compact-checkbox">
              <input id="message-anonymous" type="checkbox" ${canSendMessage ? "" : "disabled"}>
              <span>匿名发送</span>
            </label>
            <label class="file-picker">图片
              <input id="message-image" type="file" accept="image/*" ${canSendMessage ? "" : "disabled"}>
            </label>
            <span id="message-image-hint" class="hint">未选择图片</span>
          </div>
          <button class="primary-button" type="button" data-action="send-message" ${canSendMessage ? "" : "disabled"}>发送</button>
        </div>
      </section>
      ${renderChatMemberDrawer(active)}
    </div>
  `;

  const messageBox = document.getElementById("messages");
  if (messageBox && active) {
    if (stateBag.chatNewPromptId === active.id && previousChatId === active.id) {
      messageBox.scrollTop = previousScrollTop;
    } else {
      messageBox.scrollTop = messageBox.scrollHeight;
      markChatRead(active.id, latestMessage?.createdAt);
      renderShell();
    }
    messageBox.addEventListener("scroll", () => {
      if (isNearBottom(messageBox)) {
        markChatRead(active.id, latestMessage?.createdAt);
        if (stateBag.chatNewPromptId === active.id) {
          stateBag.chatNewPromptId = "";
          renderChats();
        } else {
          renderShell();
        }
      }
    });
  }
  stateBag.renderedChatId = active?.id || "";
  stateBag.renderedLatestMessageId = latestMessageId;
}

function renderChatMemberRequestPanel(chat) {
  const actor = currentActor();
  if (!chat || !actor || stateBag.gmUnlocked) return "";
  if (chat.type === "direct" || chat.isPublic || !chat.memberIds.includes(actor.id)) return "";
  const isOpen = stateBag.chatMemberPanelChatId === chat.id;

  const inviteCandidates = acceptedContacts().filter((character) => !chat.memberIds.includes(character.id));
  const removeCandidates = chat.memberIds
    .map((memberId) => getActor(memberId))
    .filter((member) => member && member.id !== actor.id);
  const inviteOptions = inviteCandidates.map((character) => `<option value="${escapeAttr(character.id)}">${escapeHtml(character.name)} ${escapeHtml(character.handle || "")}</option>`).join("");
  const removeOptions = removeCandidates.map((character) => `<option value="${escapeAttr(character.id)}">${escapeHtml(character.name)} ${escapeHtml(character.handle || "")}</option>`).join("");

  return `
    <div class="chat-member-panel ${isOpen ? "expanded" : "collapsed"}">
      <button class="chat-member-toggle" type="button" data-action="toggle-chat-member-panel" data-chat-id="${escapeAttr(chat.id)}">
        <span>成员申请</span>
        <span class="hint">${isOpen ? "收起" : "邀请 / 移除"}</span>
      </button>
      ${isOpen ? `
        <div class="member-change-grid">
          <label>邀请角色
            <select id="chat-add-member" ${inviteCandidates.length ? "" : "disabled"}>
              ${inviteOptions || `<option value="">暂无可邀请联系人</option>`}
            </select>
          </label>
          <button class="secondary-button compact-action" type="button" data-action="request-chat-member-add" ${inviteCandidates.length ? "" : "disabled"}>申请邀请</button>
          <label>移除角色
            <select id="chat-remove-member" ${removeCandidates.length ? "" : "disabled"}>
              ${removeOptions || `<option value="">暂无可移除成员</option>`}
            </select>
          </label>
          <button class="danger-button compact-action" type="button" data-action="request-chat-member-remove" ${removeCandidates.length ? "" : "disabled"}>申请移除</button>
        </div>
        <div class="hint">GM 批准后成员变化才会生效。</div>
      ` : ""}
    </div>
  `;
}

function renderChatMemberDrawer(chat) {
  if (!chat || stateBag.memberDrawerChatId !== chat.id) return "";
  const members = (chat.memberIds || []).map((memberId) => getActor(memberId)).filter(Boolean);
  return `
    <aside class="member-drawer">
      <div class="drawer-header">
        <div>
          <div class="section-title">群成员</div>
          <div class="meta">${escapeHtml(chat.name)} · ${members.length} 人</div>
        </div>
        <button class="ghost-button compact-action" type="button" data-action="toggle-member-drawer" data-chat-id="${escapeAttr(chat.id)}">收起</button>
      </div>
      <div class="member-drawer-list">
        ${members.map((member) => `
          <button class="member-drawer-row" type="button" data-action="view-profile" data-character-id="${escapeAttr(member.id)}">
            ${renderAvatar(member)}
            <span class="name-block">
              <span class="name">${escapeHtml(member.name)}</span>
              <span class="handle">${escapeHtml(member.handle || "")}</span>
              ${renderCharacterTags(member)}
            </span>
          </button>
        `).join("") || `<div class="hint padded">暂无成员。</div>`}
      </div>
      ${renderChatMemberRequestPanel(chat)}
    </aside>
  `;
}

function renderMessage(message) {
  const isAnonymous = message.isAnonymous === true;
  const author = getActor(message.authorId);
  const profileId = isAnonymous && !isGmAdminMode() ? "" : author?.id || "";
  const displayName = isAnonymous
    ? (isGmAdminMode() && author ? `匿名（${author.name}）` : "匿名")
    : (author?.name || "未知");
  const mine = !isAnonymous && author?.id === effectiveActorId();
  const hasImage = message.attachment?.type === "image";
  const hasText = Boolean(String(message.content || "").trim());
  return `
    <div class="message-row ${mine ? "mine" : ""} ${hasImage ? "with-image" : ""}">
      <button class="profile-avatar-button" type="button" data-action="view-profile" data-character-id="${profileId}" ${profileId ? "" : "disabled"}>
        ${isAnonymous ? renderAnonymousAvatar() : renderAvatar(author)}
      </button>
      <div class="message-bubble ${hasImage ? "has-attachment" : ""} ${hasImage && !hasText ? "image-only" : ""}">
        <div class="meta">
          <button class="inline-profile-link" type="button" data-action="view-profile" data-character-id="${profileId}" ${profileId ? "" : "disabled"}>
            <strong>${escapeHtml(displayName)}</strong>
          </button>
          · ${escapeHtml(message.gameTime)}
        </div>
        ${hasText ? `<div class="message-text">${formatText(message.content)}</div>` : ""}
        ${message.attachment?.type === "image" ? renderImageAttachment(message.attachment) : ""}
        ${isGmAdminMode() ? `<button class="danger-button message-delete" type="button" data-action="delete-message" data-message-id="${message.id}">删除</button>` : ""}
      </div>
    </div>
  `;
}

function renderCalendar() {
  const days = calendarDays();
  const selected = selectedCalendarDay();
  const months = calendarMonths();
  const month = selectedCalendarMonth();
  const selectedMonth = months.find((item) => item.month === month) || months[0];
  const monthDays = days.filter((day) => Number(day.month) === Number(selectedMonth?.month));
  const leadingBlanks = Array.from({ length: Number(monthDays[0]?.weekdayIndex || 0) });
  const currentDayId = stateBag.data.settings.currentDayId;
  els.viewRoot.innerHTML = `
    <div class="calendar-layout">
      <section class="calendar-days" aria-label="校历">
        <div class="month-strip" aria-label="月份">
          ${months.map((item) => {
            const isCurrentMonth = days.some((day) => Number(day.month) === item.month && day.id === currentDayId);
            return `
              <button class="month-button ${item.month === Number(selectedMonth?.month) ? "active" : ""} ${isCurrentMonth ? "current" : ""}" type="button" data-action="select-calendar-month" data-month="${item.month}">
                <span>${escapeHtml(item.label)}</span>
                <small>${item.count}天</small>
              </button>
            `;
          }).join("")}
        </div>
        <div class="calendar-month-head">
          <div>
            <div class="mini-title">国林学园年度校历</div>
            <div class="section-title">${escapeHtml(selectedMonth?.label || "校历")}</div>
          </div>
          <div class="meta">${days.length} 天</div>
        </div>
        <div class="calendar-month-grid" role="grid" aria-label="${escapeAttr(selectedMonth?.label || "校历")}">
          ${["一", "二", "三", "四", "五", "六", "日"].map((label) => `<div class="weekday-cell">${label}</div>`).join("")}
          ${leadingBlanks.map(() => `<div class="calendar-day blank" aria-hidden="true"></div>`).join("")}
          ${monthDays.map((day) => {
            const scheduleCount = (day.schedule || []).length;
            const eventCount = visibleCalendarEvents(day).length;
            const countText = [
              scheduleCount ? `${scheduleCount} 节` : "休",
              eventCount ? `${eventCount} 事件` : ""
            ].filter(Boolean).join(" · ");
            return `
          <button class="calendar-day ${day.id === selected?.id ? "selected" : ""} ${day.id === currentDayId ? "current" : ""} ${eventCount ? "has-events" : ""}" type="button" data-action="select-calendar-day" data-day-id="${day.id}" aria-label="${escapeAttr(dayOptionLabel(day))}">
            <span class="day-number">${escapeHtml(String(day.dayOfMonth || ""))}</span>
            <span class="day-weekday">${escapeHtml(day.label || "")}</span>
            <span class="day-count">${escapeHtml(countText)}</span>
          </button>
            `;
          }).join("")}
        </div>
      </section>
      <section class="schedule-panel">
        <header class="schedule-header">
          <div>
            <div class="section-title">${escapeHtml(selected?.dateLabel || selected?.label || "校历")}</div>
            <div class="meta">${escapeHtml([selected?.label || "", selected?.id === stateBag.data.settings.currentDayId ? "当前日" : ""].filter(Boolean).join(" · "))}</div>
          </div>
        </header>
        ${selected?.note ? `<div class="schedule-note">${escapeHtml(selected.note)}</div>` : ""}
        <div class="schedule-list">
          ${(selected?.schedule || []).map(renderScheduleItem).join("") || `<div class="hint">这一天还没有课程。</div>`}
        </div>
        ${renderCalendarEvents(selected)}
      </section>
    </div>
  `;
}

function renderCalendarEvents(day) {
  const events = visibleCalendarEvents(day);
  if (!events.length) return "";
  return `
    <div class="event-list">
      <div class="mini-title">当日事件</div>
      ${events.map((event) => `
        <div class="event-card ${event.triggeredAt ? "triggered" : ""}">
          <div class="event-type">${escapeHtml(typeLabelForEvent(event.type))}${event.triggeredAt ? " · 已触发" : ""}</div>
          <div class="event-title">${escapeHtml(event.title)}</div>
          ${event.detail ? `<div class="meta">${escapeHtml(event.detail)}</div>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function renderScheduleItem(item) {
  return `
    <div class="schedule-item">
      <div class="schedule-time">${escapeHtml(item.time || "—")}</div>
      <div class="schedule-body">
        <div class="schedule-subject">${escapeHtml(item.subject || "未命名课程")}</div>
        <div class="meta">${[item.location, item.note].filter(Boolean).map(escapeHtml).join(" · ")}</div>
      </div>
    </div>
  `;
}

function renderProfileOverlay() {
  if (!stateBag.profileId) return;
  const profile = getActor(stateBag.profileId);
  if (!profile) {
    stateBag.profileId = "";
    return;
  }
  const postCount = (stateBag.data.posts || []).filter((post) => post.authorId === profile.id).length;
  const messageCount = (stateBag.data.messages || []).filter((message) => message.authorId === profile.id).length;
  const status = relationshipStatus(profile.id);

  els.viewRoot.insertAdjacentHTML("beforeend", `
    <div class="profile-backdrop" role="presentation">
      <section class="profile-modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(profile.name)} profile">
        <button class="profile-close" type="button" data-action="close-profile" aria-label="Close profile">×</button>
        <div class="profile-hero">
          ${renderAvatar(profile)}
          <div class="profile-heading">
            <div class="profile-name">${escapeHtml(profile.name)}</div>
            <div class="profile-handle">${escapeHtml(profile.handle)}</div>
            ${renderCharacterTags(profile)}
          </div>
        </div>
        <div class="profile-stats">
          <div><strong>${postCount}</strong><span>posts</span></div>
          <div><strong>${messageCount}</strong><span>messages</span></div>
          <div><strong>${escapeHtml(relationshipLabel(profile.id))}</strong><span>status</span></div>
        </div>
        <div class="profile-actions">
          ${renderProfileActions(profile, status)}
        </div>
      </section>
    </div>
  `);
}

function renderProfileActions(profile, status) {
  const actor = currentActor();
  if (!actor) return `<div class="hint">创建或登录玩家账号后可以关注与私信。</div>`;
  if (actor.id === profile.id) return `<div class="hint">这是你当前使用的账号。</div>`;
  if (isPreviewMode()) {
    return `<div class="hint">玩家视角预览为只读。当前关系状态：${escapeHtml(relationshipLabel(profile.id))}</div>`;
  }
  if (isGmAdminMode()) {
    return `<button class="primary-button" type="button" data-action="open-direct-chat" data-character-id="${profile.id}">以当前身份打开私聊</button>`;
  }
  if (status === "accepted") {
    return `
      <button class="secondary-button" type="button" disabled>已关注</button>
      <button class="primary-button" type="button" data-action="open-direct-chat" data-character-id="${profile.id}">私信</button>
    `;
  }
  if (status === "outgoing_pending") {
    return `<button class="secondary-button" type="button" disabled>等待 GM 批准</button>`;
  }
  if (status === "incoming_pending") {
    return `<button class="secondary-button" type="button" disabled>对方请求等待 GM 批准</button>`;
  }
  return `<button class="primary-button" type="button" data-action="request-follow" data-character-id="${profile.id}">关注</button>`;
}

function renderAccountTools() {
  if (isPreviewMode()) {
    const actor = currentPreviewActor();
    return `
      <div class="mini-form">
        <div class="mini-title">玩家视角预览</div>
        <div class="account-session-card">
          ${renderAvatar(actor)}
          <div class="name-block">
            <div class="name">${escapeHtml(actor?.name || "未选择玩家")}</div>
            <div class="handle">${escapeHtml(actor?.handle || "")}</div>
          </div>
        </div>
        <button class="primary-button" type="button" data-action="stop-player-preview">退出预览</button>
      </div>
    `;
  }
  if (isGmAdminMode()) {
    return `<div class="hint">GM 模式可使用全部角色。</div>`;
  }

  const actor = currentActor();
  const savedActors = availableActors();
  const accountCreateForm = `
    <div class="mini-form">
      <div class="mini-title">创建玩家账号</div>
      <input id="account-name" maxlength="40" placeholder="显示名">
      <input id="account-handle" maxlength="32" placeholder="@handle">
      <input id="account-passcode" maxlength="80" type="password" placeholder="登录码">
      <label class="file-picker">头像
        <input id="account-avatar" type="file" accept="image/*">
      </label>
      <button class="secondary-button" type="button" data-action="create-player-account">创建账号</button>
    </div>
  `;
  const loginForm = `
    <div class="mini-form">
      <div class="mini-title">登录已有账号</div>
      <input id="login-handle" maxlength="40" placeholder="用户名或 @handle">
      <input id="login-passcode" maxlength="80" type="password" placeholder="登录码">
      <button class="secondary-button" type="button" data-action="login-player-account">登录账号</button>
    </div>
  `;
  const switcher = renderAccountSwitcher(savedActors);

  if (!actor) return `${switcher}${accountCreateForm}${loginForm}`;

  return `
    <div class="mini-form">
      <div class="mini-title">当前账号</div>
      <div class="account-session-card">
        ${renderAvatar(actor)}
        <div class="name-block">
          <div class="name">${escapeHtml(actor.name)}</div>
          <div class="handle">${escapeHtml(actor.handle)}</div>
        </div>
      </div>
      <button class="danger-button" type="button" data-action="logout-account" data-character-id="${escapeAttr(actor.id)}">退出当前账号</button>
    </div>
    ${switcher}
    <div class="mini-form">
      <div class="mini-title">账号设置</div>
      <label class="file-picker">更换头像
        <input id="avatar-update-file" type="file" accept="image/*">
      </label>
      <button class="secondary-button" type="button" data-action="update-avatar">更新头像</button>
    </div>
    ${loginForm}
    <div class="mini-form">
      <div class="mini-title">自定义 Emoji</div>
      <input id="emoji-shortcode" maxlength="24" placeholder="shortcode">
      <label class="file-picker">上传图片
        <input id="emoji-file" type="file" accept="image/*">
      </label>
      <button class="secondary-button" type="button" data-action="upload-emoji">上传 Emoji</button>
    </div>
  `;
}

function renderAccountSwitcher(savedActors) {
  if (!savedActors.length) return "";
  return `
    <div class="mini-form">
      <div class="mini-title">切换账号</div>
      <div class="saved-account-list">
        ${savedActors.map((account) => {
          const active = account.id === stateBag.actorId;
          return `
            <button class="saved-account-button ${active ? "active" : ""}" type="button" data-action="switch-account" data-character-id="${escapeAttr(account.id)}" ${active ? "disabled" : ""}>
              ${renderAvatar(account)}
              <span class="name-block">
                <span class="name">${escapeHtml(account.name)}</span>
                <span class="handle">${escapeHtml(account.handle)}${active ? " · 当前" : ""}</span>
              </span>
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderEmojiBar(targetId) {
  const builtin = ["😀", "😂", "🥹", "😳", "👍", "🙏", "❤️", "✨", "🎵", "☕"];
  const custom = stateBag.data?.emojis || [];
  return `
    <div class="emoji-bar" aria-label="Emoji">
      ${builtin.map((emoji) => `<button class="emoji-button" type="button" data-action="insert-emoji" data-target="${escapeAttr(targetId)}" data-value="${escapeAttr(emoji)}">${emoji}</button>`).join("")}
      ${custom.map((emoji) => `<button class="emoji-button custom-emoji-button" type="button" title=":${escapeAttr(emoji.shortcode)}:" data-action="insert-emoji" data-target="${escapeAttr(targetId)}" data-value=":${escapeAttr(emoji.shortcode)}:"><img src="${escapeAttr(emoji.imageData)}" alt=":${escapeAttr(emoji.shortcode)}:"></button>`).join("")}
    </div>
  `;
}

function renderFollowRequest(relationship) {
  const requester = getActor(relationship.requesterId);
  const target = getActor(relationship.targetId);
  return `
    <div class="follow-row">
      <div class="follow-people">
        ${renderAvatar(requester)}
        <div class="name-block">
          <div class="name">${escapeHtml(requester?.name || "未知")} → ${escapeHtml(target?.name || "未知")}</div>
          <div class="handle">${escapeHtml(requester?.handle || "")} 请求关注 ${escapeHtml(target?.handle || "")}</div>
        </div>
      </div>
      <div class="form-row tight">
        <button class="primary-button" type="button" data-action="approve-follow" data-follow-id="${relationship.id}">批准</button>
        <button class="danger-button" type="button" data-action="reject-follow" data-follow-id="${relationship.id}">拒绝</button>
      </div>
    </div>
  `;
}

function renderChatMemberRequest(request) {
  const requester = getActor(request.requesterId);
  const target = getActor(request.targetId);
  const chat = getChat(request.chatId);
  const actionLabel = request.action === "remove" ? "移除" : "邀请";
  return `
    <div class="follow-row">
      <div class="follow-people">
        ${renderAvatar(requester)}
        <div class="name-block">
          <div class="name">${escapeHtml(requester?.name || "未知")} 申请${actionLabel} ${escapeHtml(target?.name || "未知角色")}</div>
          <div class="handle">${escapeHtml(chat?.name || "未知群聊")} · ${escapeHtml(requester?.handle || "")} → ${escapeHtml(target?.handle || "")}</div>
        </div>
      </div>
      <div class="form-row tight">
        <button class="primary-button" type="button" data-action="approve-chat-member-request" data-request-id="${escapeAttr(request.id)}">批准</button>
        <button class="danger-button" type="button" data-action="reject-chat-member-request" data-request-id="${escapeAttr(request.id)}">拒绝</button>
      </div>
    </div>
  `;
}

function renderGmInbox() {
  const pendingFollows = (stateBag.data.relationships || []).filter((item) => item.status === "pending");
  const pendingChatMemberRequests = (stateBag.data.chatMemberRequests || []).filter((item) => item.status === "pending");
  const recentMessages = [...(stateBag.data.messages || [])]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 8);
  const recentReplies = (stateBag.data.posts || [])
    .flatMap((post) => (post.replies || []).map((reply) => ({ ...reply, postId: post.id, postContent: post.content })))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 5);

  return `
    <section class="gm-wide">
      <div class="section-title">GM 统一收件箱</div>
      <div class="inbox-grid">
        <div class="inbox-column">
          <div class="mini-title">关注请求</div>
          ${pendingFollows.map(renderFollowRequest).join("") || `<div class="hint padded">No pending follows.</div>`}
        </div>
        <div class="inbox-column">
          <div class="mini-title">群成员申请</div>
          ${pendingChatMemberRequests.map(renderChatMemberRequest).join("") || `<div class="hint padded">No pending chat member requests.</div>`}
        </div>
        <div class="inbox-column">
          <div class="mini-title">最新聊天</div>
          ${recentMessages.map((message) => {
            const author = getActor(message.authorId);
            const chat = getChat(message.chatId);
            return `
              <div class="inbox-item">
                <div>
                  <div class="name">${escapeHtml(author?.name || "未知")} → ${escapeHtml(chat?.name || "未知聊天")}</div>
                  <div class="meta">${escapeHtml(message.gameTime || "")} · ${escapeHtml(message.content || (message.attachment ? "[image]" : ""))}</div>
                </div>
                <button class="secondary-button compact-action" type="button" data-action="open-gm-chat" data-chat-id="${message.chatId}">Open</button>
              </div>
            `;
          }).join("") || `<div class="hint padded">No messages yet.</div>`}
        </div>
        <div class="inbox-column">
          <div class="mini-title">时间线回复</div>
          ${recentReplies.map((reply) => {
            const author = getActor(reply.authorId);
            return `
              <div class="inbox-item">
                <div>
                  <div class="name">${escapeHtml(author?.name || "未知")}</div>
                  <div class="meta">${escapeHtml(reply.gameTime || "")} · ${escapeHtml(reply.content || "")}</div>
                </div>
                <button class="secondary-button compact-action" type="button" data-action="open-gm-feed">Open</button>
              </div>
            `;
          }).join("") || `<div class="hint padded">No replies yet.</div>`}
        </div>
      </div>
    </section>
  `;
}

function renderBulletinComposer(chars, days) {
  const recent = [...(stateBag.data.bulletins || [])]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 5);
  return `
    <section>
      <div class="section-title">公告 / 传闻板</div>
      <div class="form-grid">
        <div class="two-col">
          <label>类型
            <select id="bulletin-type">
              <option value="bulletin">公告</option>
              <option value="rumor">传闻</option>
              <option value="school">学校通知</option>
              <option value="club">社团通知</option>
              <option value="incident">事件通报</option>
            </select>
          </label>
          <label>发布者
            <select id="bulletin-author">
              <option value="">不显示发布者</option>
              ${chars.map((character) => `<option value="${character.id}">${escapeHtml(character.name)}</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="two-col">
          <label>关联日期
            <select id="bulletin-day">
              <option value="">不关联日期</option>
              ${renderDayOptions(days, "")}
            </select>
          </label>
          <label>可见性
            <select id="bulletin-public">
              <option value="true">玩家可见</option>
              <option value="false">仅 GM 可见</option>
            </select>
          </label>
        </div>
        <input id="bulletin-title" maxlength="100" placeholder="标题">
        <textarea id="bulletin-content" maxlength="1200" placeholder="传闻、学校通知、社团消息或事件通报"></textarea>
        <button class="primary-button" type="button" data-action="publish-bulletin">发布公告</button>
        <div class="compact-list">
          ${recent.map((bulletin) => `
            <div class="compact-row">
              <div>
                <div class="name">${escapeHtml(bulletin.title)}</div>
                <div class="meta">${escapeHtml(typeLabelForBulletin(bulletin.type))} · ${escapeHtml(bulletin.gameTime || "")}${bulletin.isPublic === false ? " · 仅 GM 可见" : ""}</div>
              </div>
              <button class="danger-button compact-action" type="button" data-action="delete-bulletin" data-bulletin-id="${bulletin.id}">删除</button>
            </div>
          `).join("") || `<div class="hint padded">还没有公告。</div>`}
        </div>
      </div>
    </section>
  `;
}

function renderCalendarEventManager(days, gmDay) {
  const day = gmDay || days[0];
  return `
    <section>
      <div class="section-title">校历事件触发器</div>
      <div class="form-grid">
        <label>编辑日期
          <select id="event-day">
            ${renderDayOptions(days, day?.id)}
          </select>
        </label>
        <div class="two-col">
          <label>类型
            <select id="event-type">
              <option value="event">事件</option>
              <option value="rumor">传闻</option>
              <option value="exam">考试</option>
              <option value="club">社团</option>
              <option value="incident">事件通报</option>
              <option value="notice">通知</option>
            </select>
          </label>
          <label>可见性
            <select id="event-public">
              <option value="false">触发前仅 GM 可见</option>
              <option value="true">现在就玩家可见</option>
            </select>
          </label>
        </div>
        <input id="event-title" maxlength="100" placeholder="事件标题">
        <textarea id="event-detail" maxlength="900" placeholder="会发生什么、解锁什么线索、或投放什么传闻"></textarea>
        <button class="primary-button" type="button" data-action="create-calendar-event">添加事件触发器</button>
        <div class="compact-list">
          ${(day?.events || []).map((event) => `
            <div class="compact-row event-row">
              <div>
                <div class="name">${escapeHtml(event.title)}</div>
                <div class="meta">${escapeHtml(typeLabelForEvent(event.type))} · ${event.triggeredAt ? "已触发" : (event.isPublic ? "玩家可见" : "仅 GM 可见")}</div>
                ${event.detail ? `<div class="meta">${escapeHtml(event.detail)}</div>` : ""}
              </div>
              <div class="row-actions">
                <button class="secondary-button compact-action" type="button" data-action="trigger-calendar-event" data-day-id="${day.id}" data-event-id="${event.id}" ${event.triggeredAt ? "disabled" : ""}>触发</button>
                <button class="danger-button compact-action" type="button" data-action="delete-calendar-event" data-day-id="${day.id}" data-event-id="${event.id}">删除</button>
              </div>
            </div>
          `).join("") || `<div class="hint padded">这一天还没有事件。</div>`}
        </div>
      </div>
    </section>
  `;
}

function renderCalendarBatchComposer(days) {
  const current = currentCalendarDay() || days[0];
  const monthDays = days.filter((day) => Number(day.month) === Number(current?.month));
  const defaultEnd = monthDays[monthDays.length - 1] || current || days[days.length - 1];
  const previewCount = calendarBatchTargetDays(days, current?.id, defaultEnd?.id, [0, 1, 2, 3, 4, 5, 6]).length;
  return `
    <section class="gm-wide">
      <div>
        <div class="section-title">批量编制课程表</div>
        <div class="meta">按日期范围和星期一次套用课程表；批量操作会进入 GM 撤销。</div>
      </div>
      <div class="form-grid">
        <div class="two-col">
          <label>开始日期
            <select id="batch-start-day">
              ${renderDayOptions(days, current?.id)}
            </select>
          </label>
          <label>结束日期
            <select id="batch-end-day">
              ${renderDayOptions(days, defaultEnd?.id)}
            </select>
          </label>
        </div>
        <div class="batch-weekdays" role="group" aria-label="适用星期">
          ${["一", "二", "三", "四", "五", "六", "日"].map((label, index) => `
            <label class="weekday-option">
              <input class="batch-weekday" type="checkbox" value="${index}" checked>
              <span>周${label}</span>
            </label>
          `).join("")}
        </div>
        <div class="two-col">
          <label>课程模板
            <select id="batch-template">
              <option value="custom">手动输入</option>
              <option value="copy_day">复制指定日期</option>
              <option value="holiday">休校日</option>
              <option value="exam">考试日</option>
              <option value="club">社团 / 自由活动日</option>
              <option value="empty">清空课程表</option>
            </select>
          </label>
          <label>复制来源
            <select id="batch-copy-day">
              ${renderDayOptions(days, current?.id)}
            </select>
          </label>
        </div>
        <label class="checkbox-line">
          <input id="batch-update-schedule" type="checkbox" checked>
          <span>覆盖目标日期的课程表</span>
        </label>
        <textarea id="batch-schedule-text" class="schedule-editor compact-editor" placeholder="08:20 | 朝会 | 1-A 教室 | 出席确认"></textarea>
        <div class="two-col">
          <label>备注处理
            <select id="batch-note-mode">
              <option value="keep">不改备注</option>
              <option value="replace">替换备注</option>
              <option value="append">追加备注</option>
            </select>
          </label>
          <label>备注内容 <input id="batch-note" placeholder="例如：期中考试周"></label>
        </div>
        <div class="form-row batch-actions">
          <button class="primary-button" type="button" data-action="apply-calendar-batch">批量套用</button>
          <div id="batch-preview" class="hint">预计影响 ${previewCount} 天</div>
        </div>
      </div>
    </section>
  `;
}

function renderRelationshipGraph(chars) {
  const relationships = stateBag.data.relationships || [];
  const counts = chars.map((character) => {
    const accepted = relationships.filter((item) => item.status === "accepted" && (item.requesterId === character.id || item.targetId === character.id)).length;
    const pending = relationships.filter((item) => item.status === "pending" && (item.requesterId === character.id || item.targetId === character.id)).length;
    return { character, accepted, pending };
  }).sort((a, b) => (b.accepted + b.pending) - (a.accepted + a.pending)).slice(0, 12);

  return `
    <section class="gm-wide">
      <div class="section-title">关系图</div>
      <div class="relationship-grid">
        <div class="relationship-nodes">
          ${counts.map(({ character, accepted, pending }) => `
            <div class="relationship-node">
              ${renderAvatar(character)}
              <div>
                <div class="name">${escapeHtml(character.name)}</div>
                <div class="meta">${accepted} DM-ready · ${pending} pending</div>
              </div>
            </div>
          `).join("") || `<div class="hint padded">No active characters.</div>`}
        </div>
        <div class="relationship-edges">
          ${relationships.map((relationship) => {
            const requester = getActor(relationship.requesterId);
            const target = getActor(relationship.targetId);
            return `
              <div class="relationship-edge ${relationship.status}">
                <span>${escapeHtml(requester?.name || "未知")}</span>
                <strong>${escapeHtml(relationship.status)}</strong>
                <span>${escapeHtml(target?.name || "未知")}</span>
              </div>
            `;
          }).join("") || `<div class="hint padded">No follow relationships yet.</div>`}
        </div>
      </div>
    </section>
  `;
}

function renderGmEditLog() {
  const undo = stateBag.data.undoStack?.[0];
  const logs = stateBag.data.auditLog || [];
  return `
    <section class="gm-wide">
      <div class="section-title">撤销 / 删除 / 编辑记录</div>
      <div class="log-toolbar">
        <button class="primary-button" type="button" data-action="gm-undo" ${undo ? "" : "disabled"}>撤销上一步 GM 操作</button>
        <div class="hint">${undo ? escapeHtml(`可撤销：${undo.label}`) : "还没有可撤销的 GM 操作。"}</div>
      </div>
      <div class="log-list">
        ${logs.slice(0, 12).map((entry) => `
          <div class="log-row">
            <span class="type-pill">${escapeHtml(entry.action)}</span>
            <div>
              <div class="name">${escapeHtml(entry.label)}</div>
              <div class="meta">${escapeHtml(formatDateTime(entry.createdAt))}</div>
            </div>
          </div>
        `).join("") || `<div class="hint padded">No GM edits logged yet.</div>`}
      </div>
    </section>
  `;
}

function renderGmPlayerAccountManager(chars) {
  const accounts = chars.filter((character) => character.type === "account");
  const recent = stateBag.lastGmCreatedAccount;
  const imported = stateBag.lastGmImportedAccounts || [];
  return `
    <section class="gm-wide">
      <div class="section-title">玩家账号管理</div>
      <div class="account-manager-grid">
        <div class="form-grid">
          <div class="mini-title">代建玩家账号</div>
          <div class="two-col">
            <label>显示名 <input id="gm-account-name" maxlength="40"></label>
            <label>登录用户名 <input id="gm-account-username" maxlength="40" autocomplete="off"></label>
          </div>
          <div class="two-col">
            <label>@handle <input id="gm-account-handle" maxlength="32" placeholder="@handle"></label>
            <label>初始密码 <input id="gm-account-passcode" maxlength="80" type="text" autocomplete="off"></label>
          </div>
          <label>标签 <input id="gm-account-tags" placeholder="1-A, 学生会, 社团"></label>
          <div class="form-row">
            <label class="file-picker">头像
              <input id="gm-account-avatar" type="file" accept="image/*">
            </label>
            <span id="gm-account-avatar-hint" class="hint">未选择头像</span>
          </div>
          <button class="primary-button" type="button" data-action="create-gm-player-account">创建玩家账号</button>
          ${recent ? `
            <div class="credential-card">
              <div class="mini-title">刚创建的登录信息</div>
              <div><strong>${escapeHtml(recent.name)}</strong></div>
              <div>用户名：<code>${escapeHtml(recent.username)}</code></div>
              <div>@handle：<code>${escapeHtml(recent.handle)}</code></div>
              <div>初始密码：<code>${escapeHtml(recent.passcode)}</code></div>
            </div>
          ` : ""}
          ${imported.length ? `
            <div class="credential-card">
              <div class="mini-title">刚批量导入的登录信息</div>
              <div class="credential-list">
                ${imported.map((account) => `
                  <div class="credential-row">
                    <strong>${escapeHtml(account.name)}</strong>
                    <span>用户名：<code>${escapeHtml(account.username)}</code></span>
                    <span>@handle：<code>${escapeHtml(account.handle)}</code></span>
                    <span>初始密码：<code>${escapeHtml(account.passcode)}</code></span>
                  </div>
                `).join("")}
              </div>
            </div>
          ` : ""}
          <div class="account-import-box">
            <div class="mini-title">批量导入</div>
            <textarea id="account-import-text" class="account-import-text" placeholder="显示名,登录用户名,@handle,初始密码,标签&#10;三渡 七海,nanami,@nanami,pass123,1-A;新闻部"></textarea>
            <div class="hint">每行一个账号。可加表头；标签可选，用分号分隔。</div>
            <button class="secondary-button" type="button" data-action="import-player-accounts">批量导入账号</button>
          </div>
        </div>
        <div class="account-list-panel">
          <div class="account-list-toolbar">
            <div class="mini-title">所有玩家账号</div>
            <div class="row-actions">
              <button class="secondary-button compact-action" type="button" data-action="select-all-player-accounts" ${accounts.length ? "" : "disabled"}>全选</button>
              <button class="secondary-button compact-action" type="button" data-action="clear-player-account-selection" ${accounts.length ? "" : "disabled"}>清空</button>
              <button class="danger-button compact-action" type="button" data-action="delete-selected-player-accounts" ${accounts.length ? "" : "disabled"}>删除选中</button>
              <button class="danger-button compact-action" type="button" data-action="delete-all-player-accounts" ${accounts.length ? "" : "disabled"}>删除全部</button>
            </div>
          </div>
          <div class="account-list">
            ${accounts.map((account) => `
              <div class="account-list-row">
                <input class="account-delete-checkbox" type="checkbox" value="${escapeAttr(account.id)}" aria-label="选择 ${escapeAttr(account.name)}">
                ${renderAvatar(account)}
                <div class="name-block">
                  <div class="name">${escapeHtml(account.name)}</div>
                  <div class="handle">${escapeHtml(account.handle)} · ${escapeHtml(account.username || "")}</div>
                  ${renderCharacterTags(account)}
                </div>
              </div>
            `).join("") || `<div class="hint padded">还没有玩家账号。</div>`}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderGmSection(idValue, title, content, options = {}) {
  const collapsed = stateBag.gmCollapsedSections[idValue] === true;
  return `
    <section class="gm-section ${options.wide ? "gm-wide" : ""} ${collapsed ? "collapsed" : "expanded"}">
      <button class="gm-section-toggle" type="button" data-action="toggle-gm-section" data-section-id="${escapeAttr(idValue)}">
        <span>${escapeHtml(title)}</span>
        <span class="hint">${collapsed ? "展开" : "收起"}</span>
      </button>
      ${collapsed ? "" : `<div class="gm-section-body">${content}</div>`}
    </section>
  `;
}

function decorateGmSections() {
  const grid = els.viewRoot.querySelector(".gm-grid");
  if (!grid) return;

  Array.from(grid.children)
    .filter((section) => section.tagName === "SECTION")
    .forEach((section, index) => {
      const titleNode = section.querySelector(".section-title");
      const title = titleNode?.textContent?.trim() || `GM ${index + 1}`;
      const sectionId = section.dataset.sectionId || gmSectionId(title, index);
      const collapsed = stateBag.gmCollapsedSections[sectionId] === true;
      const firstChild = section.firstElementChild;
      let header = firstChild;

      section.dataset.sectionId = sectionId;
      section.classList.add("gm-section");

      if (header?.classList.contains("section-title")) {
        const wrapper = document.createElement("div");
        wrapper.className = "gm-section-head";
        section.replaceChild(wrapper, header);
        wrapper.appendChild(header);
        header = wrapper;
      } else if (!header || !header.querySelector?.(".section-title")) {
        header = document.createElement("div");
        header.className = "gm-section-head";
        header.innerHTML = `<div class="section-title">${escapeHtml(title)}</div>`;
        section.prepend(header);
      } else {
        header.classList.add("gm-section-head");
      }

      const toggle = document.createElement("button");
      toggle.className = "gm-section-toggle";
      toggle.type = "button";
      toggle.dataset.action = "toggle-gm-section";
      toggle.dataset.sectionId = sectionId;
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      toggle.textContent = collapsed ? "展开" : "收起";
      header.appendChild(toggle);

      const body = document.createElement("div");
      body.className = "gm-section-body";
      Array.from(section.children)
        .filter((child) => child !== header)
        .forEach((child) => body.appendChild(child));
      body.hidden = collapsed;
      body.style.display = collapsed ? "none" : "";
      section.appendChild(body);
      section.classList.toggle("collapsed", collapsed);
    });
}

function gmSectionId(title, index) {
  const base = normalizeSearch(title)
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `gm-${base || index + 1}`;
}

function renderGm() {
  if (isPreviewMode()) {
    els.viewRoot.innerHTML = `
      <div class="feed-layout">
        <section class="composer">
          <div class="section-title">玩家视角预览中</div>
          <div class="hint">退出预览后可以返回 GM 后台。</div>
          <button class="primary-button" type="button" data-action="stop-player-preview">退出预览</button>
        </section>
      </div>
    `;
    return;
  }
  if (!stateBag.gmUnlocked) {
    els.viewRoot.innerHTML = `
      <div class="feed-layout">
        <section class="composer">
          <div class="section-title">GM 后台</div>
          <input id="gm-pin" type="password" placeholder="GM PIN" value="${escapeAttr(stateBag.gmPin)}">
          <button class="primary-button" type="button" data-action="unlock-gm">解锁</button>
        </section>
      </div>
    `;
    return;
  }

  const chars = stateBag.data.characters.filter((item) => item.active !== false);
  const rosterTags = [...new Set(chars.flatMap((character) => characterTags(character)))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
  if (stateBag.rosterTag && !rosterTags.includes(stateBag.rosterTag)) {
    stateBag.rosterTag = "";
    localStorage.removeItem("kokubayashi.rosterTag");
  }
  const rosterChars = filteredRosterCharacters(chars);
  const pendingFollows = (stateBag.data.relationships || []).filter((item) => item.status === "pending");
  const days = calendarDays();
  const gmDay = getCalendarDay(stateBag.gmScheduleDayId) || currentCalendarDay() || days[0];
  els.viewRoot.innerHTML = `
    <div class="gm-grid">
      <section>
        <div class="section-title">时间与站点</div>
        <div class="form-grid">
          <label>游戏时间 <input id="setting-game-time" value="${escapeAttr(stateBag.data.settings.gameTime)}"></label>
          <label>星期/日程 <input id="setting-school-day" value="${escapeAttr(stateBag.data.settings.schoolDay)}"></label>
          <label>SNS 名称 <input id="setting-feed-name" value="${escapeAttr(stateBag.data.settings.feedName)}"></label>
          <label>聊天名称 <input id="setting-chat-name" value="${escapeAttr(stateBag.data.settings.chatName)}"></label>
          <div class="form-row">
            <button class="primary-button" type="button" data-action="save-settings">保存时间</button>
            <button class="ghost-button" type="button" data-action="lock-gm">锁定 GM</button>
          </div>
          <div class="form-row">
            <button class="secondary-button export-link" type="button" data-action="export-markdown">导出完整 Markdown</button>
            <button class="secondary-button export-link" type="button" data-action="export-gm-chats">导出聊天 Markdown</button>
          </div>
        </div>
      </section>

      ${renderGmInbox()}
      ${renderBulletinComposer(chars, days)}
      ${renderCalendarEventManager(days, gmDay)}

      <section>
        <div class="section-title">校历 / 课程表</div>
        <div class="form-grid">
          <label>当前日
            <select id="gm-current-day">
              ${renderDayOptions(days, stateBag.data.settings.currentDayId)}
            </select>
          </label>
          <button class="primary-button" type="button" data-action="save-current-calendar-day">设为当前日</button>
          <label>编辑日程
            <select id="gm-schedule-day">
              ${renderDayOptions(days, gmDay?.id)}
            </select>
          </label>
          <div class="two-col">
            <label>日期标签 <input id="calendar-date-label" value="${escapeAttr(gmDay?.dateLabel || "")}"></label>
            <label>备注 <input id="calendar-note" value="${escapeAttr(gmDay?.note || "")}"></label>
          </div>
          <textarea id="calendar-schedule-text" class="schedule-editor" placeholder="08:20 | 朝会 | 1-A 教室 | 出席确认">${escapeHtml(scheduleToText(gmDay?.schedule || []))}</textarea>
          <button class="primary-button" type="button" data-action="save-calendar-schedule">保存课程表</button>
        </div>
      </section>

      ${renderCalendarBatchComposer(days)}
      ${renderRelationshipGraph(chars)}
      ${renderGmEditLog()}

      ${renderGmPlayerAccountManager(chars)}

      <section>
        <div class="section-title">新增角色</div>
        <div class="form-grid">
          <div class="two-col">
            <label>名称 <input id="new-character-name"></label>
            <label>Handle <input id="new-character-handle" placeholder="@handle"></label>
          </div>
          <label>标签 <input id="new-character-tags" placeholder="1-A, 风纪委员, 可攻略"></label>
          <label>类型
            <select id="new-character-type">
              <option value="npc">GM 扮演角色</option>
              <option value="player">预设玩家角色</option>
            </select>
          </label>
          <div class="form-row">
            <label class="file-picker">头像
              <input id="new-character-avatar" type="file" accept="image/*">
            </label>
            <span id="new-character-avatar-hint" class="hint">未选择头像</span>
          </div>
          <button class="primary-button" type="button" data-action="create-character">创建角色</button>
          <div class="account-import-box">
            <div class="mini-title">批量创建角色</div>
            <textarea id="character-import-text" class="account-import-text" placeholder="名称,@handle,类型,标签&#10;三渡 七海,@nanami,npc,1-A;新闻部&#10;玩家预设A,@pc_a,player,PC;1-A"></textarea>
            <div class="hint">每行一个角色。类型填 npc 或 player；标签可选，用分号分隔。</div>
            <button class="secondary-button" type="button" data-action="import-characters">批量创建角色</button>
          </div>
        </div>
      </section>

      <section>
        <div class="section-title">新建群聊</div>
        <div class="form-grid">
          <label>群名 <input id="new-chat-name"></label>
          <input class="member-filter-input" placeholder="搜索角色 / @handle / 标签">
          <div class="member-picker">
            ${chars.map((character) => `
              <label class="member-option">
                <input type="checkbox" class="member-checkbox" value="${character.id}">
                <span>${escapeHtml(character.name)}</span>
                ${renderCharacterTags(character)}
              </label>
            `).join("")}
          </div>
          <button class="primary-button" type="button" data-action="create-chat">创建群聊</button>
        </div>
      </section>

      <section>
        <div class="section-title">关注审批</div>
        <div class="follow-list">
          ${pendingFollows.map(renderFollowRequest).join("") || `<div class="hint">暂无待审批关注。</div>`}
        </div>
      </section>

      <section class="gm-wide">
        <div class="roster-heading">
          <div>
            <div class="section-title">角色名册</div>
            <div class="hint">${rosterChars.length} / ${chars.length} 个 active 角色</div>
          </div>
          <button class="danger-button compact-action" type="button" data-action="delete-all-characters" ${chars.length ? "" : "disabled"}>删除全部角色</button>
        </div>
        <div class="roster-tools">
          <input id="roster-search" value="${escapeAttr(stateBag.rosterSearch)}" placeholder="搜索角色 / @handle / 标签 / 登录名">
          <div class="tag-filter-row">
            <button class="segment-button ${stateBag.rosterTag ? "" : "active"}" type="button" data-action="set-roster-tag" data-tag="">全部标签</button>
            ${rosterTags.map((tag) => `
              <button class="segment-button tag-filter-button ${stateBag.rosterTag === tag ? "active" : ""}" type="button" data-action="set-roster-tag" data-tag="${escapeAttr(tag)}">${escapeHtml(tag)}</button>
            `).join("") || `<span class="hint">还没有标签。</span>`}
          </div>
        </div>
        <div class="roster">
          ${rosterChars.map((character) => `
            <div class="roster-row">
              <div class="roster-identity">
                ${renderAvatar(character)}
                <div class="name-block">
                  <div class="name">${escapeHtml(character.name)}</div>
                  <div class="handle">${escapeHtml(character.handle)}${character.type === "account" && character.username ? ` · ${escapeHtml(character.username)}` : ""}</div>
                  ${renderCharacterTags(character)}
                </div>
              </div>
              <div class="tag-editor">
                <div class="roster-control-row roster-profile-row">
                  <label class="compact-field">显示名
                    <input id="character-name-${escapeAttr(character.id)}" value="${escapeAttr(character.name)}" maxlength="40">
                  </label>
                  <label class="compact-field">@handle
                    <input id="character-handle-${escapeAttr(character.id)}" value="${escapeAttr(character.handle)}" maxlength="32">
                  </label>
                  <button class="secondary-button compact-action" type="button" data-action="save-character-profile" data-character-id="${escapeAttr(character.id)}">保存资料</button>
                </div>
                <div class="roster-control-row">
                  <input id="character-tags-${escapeAttr(character.id)}" value="${escapeAttr(characterTagInputValue(character))}" placeholder="标签，用逗号分隔">
                  <button class="secondary-button compact-action" type="button" data-action="save-character-tags" data-character-id="${escapeAttr(character.id)}">保存标签</button>
                  <button class="danger-button compact-action" type="button" data-action="delete-character" data-character-id="${escapeAttr(character.id)}">删除</button>
                </div>
                <div class="avatar-editor">
                  <label class="file-picker compact-file-picker">头像
                    <input id="character-avatar-${escapeAttr(character.id)}" class="character-avatar-input" data-character-id="${escapeAttr(character.id)}" type="file" accept="image/*">
                  </label>
                  <span id="character-avatar-hint-${escapeAttr(character.id)}" class="hint avatar-hint">未选择头像</span>
                  <button class="secondary-button compact-action" type="button" data-action="update-character-avatar" data-character-id="${escapeAttr(character.id)}">更新头像</button>
                </div>
              </div>
            </div>
          `).join("") || `<div class="hint padded">没有符合筛选条件的角色。</div>`}
        </div>
      </section>
    </div>
  `;
  decorateGmSections();
}

async function publishPost() {
  if (!currentActor()) return showNotice("请先创建或选择玩家账号。");
  const textarea = document.getElementById("post-content");
  const content = textarea?.value.trim();
  const imageInput = document.getElementById("post-image");
  const anonymousInput = document.getElementById("post-anonymous");
  const imageFile = imageInput?.files?.[0];
  const attachment = imageFile
    ? { type: "image", dataUrl: await fileToImageDataUrl(imageFile, 1400, 0.86, 8500000), name: imageFile.name }
    : null;
  if (!content && !attachment) return showNotice("帖子内容或图片为空。");
  await api("/api/feed/posts", {
    method: "POST",
    body: { authorId: stateBag.actorId, content, attachment, isAnonymous: anonymousInput?.checked === true }
  });
  textarea.value = "";
  if (imageInput) imageInput.value = "";
  if (anonymousInput) anonymousInput.checked = false;
  const hint = document.getElementById("post-image-hint");
  if (hint) hint.textContent = "未选择图片";
  await refresh(true);
}

async function likePost(postId) {
  await api(`/api/feed/posts/${encodeURIComponent(postId)}/like`, { method: "POST" });
  await refresh(true);
}

function toggleReplyComposer(postId) {
  if (!postId) return;
  stateBag.openReplyPostId = stateBag.openReplyPostId === postId ? "" : postId;
  render();
}

function setFeedFilter(filter) {
  stateBag.feedFilter = normalizeFeedFilter(filter);
  localStorage.setItem("kokubayashi.feedFilter", stateBag.feedFilter);
  renderFeed();
}

function normalizeFeedFilter(filter) {
  return ["all", "mine", "anonymous", "images"].includes(filter) ? filter : "all";
}

function setFeedHashtag(hashtag) {
  stateBag.feedHashtag = normalizeHashtag(hashtag);
  if (stateBag.feedHashtag) {
    localStorage.setItem("kokubayashi.feedHashtag", stateBag.feedHashtag);
  } else {
    localStorage.removeItem("kokubayashi.feedHashtag");
  }
  renderFeed();
}

async function replyPost(postId) {
  if (!currentActor()) return showNotice("请先创建或选择玩家账号。");
  const textarea = document.getElementById(`reply-${postId}`);
  const anonymousInput = document.getElementById(`reply-anonymous-${postId}`);
  const content = textarea?.value.trim();
  if (!content) return showNotice("回复内容为空。");
  await api(`/api/feed/posts/${encodeURIComponent(postId)}/replies`, {
    method: "POST",
    body: { authorId: stateBag.actorId, content, isAnonymous: anonymousInput?.checked === true }
  });
  textarea.value = "";
  if (anonymousInput) anonymousInput.checked = false;
  stateBag.openReplyPostId = "";
  await refresh(true);
}

async function deleteReply(postId, replyId) {
  if (!postId || !replyId) return;
  await api(`/api/feed/posts/${encodeURIComponent(postId)}/replies/${encodeURIComponent(replyId)}`, {
    method: "DELETE",
    body: { actorId: stateBag.actorId }
  });
  showNotice("回复已删除。需要的话可以用 GM 撤销。");
  await refresh(true);
}

async function savePost(postId) {
  const likes = document.getElementById(`post-likes-${postId}`)?.value;
  const reposts = document.getElementById(`post-reposts-${postId}`)?.value;
  const views = document.getElementById(`post-views-${postId}`)?.value;
  const gameTime = document.getElementById(`post-time-${postId}`)?.value;
  const dayValue = document.getElementById(`post-day-${postId}`)?.value || "";
  const dayId = resolveCalendarDayInput(dayValue);
  if (dayValue.trim() && !dayId) return showNotice("请选择有效的帖子日期。");
  await api(`/api/feed/posts/${encodeURIComponent(postId)}`, {
    method: "PATCH",
    body: { dayId, gameTime, metrics: { likes, reposts, views } },
    admin: true
  });
  showNotice("帖子数据已保存。");
  await refresh(true);
}

async function deletePost(postId) {
  await api(`/api/feed/posts/${encodeURIComponent(postId)}`, {
    method: "DELETE",
    admin: true
  });
  await refresh(true);
}

async function deleteMessage(messageId) {
  if (!messageId) return;
  await api(`/api/messages/${encodeURIComponent(messageId)}`, {
    method: "DELETE",
    admin: true
  });
  showNotice("消息已删除。需要的话可以用 GM 撤销。");
  await refresh(true);
}

async function deleteChat(chatId) {
  const chat = getChat(chatId);
  if (!chat) return;
  if (!window.confirm(`删除聊天「${chat.name}」？这个聊天里的消息也会被删除。`)) return;
  stateBag.data = await api(`/api/chats/${encodeURIComponent(chatId)}`, {
    method: "DELETE",
    body: { actorId: stateBag.actorId }
  });
  if (stateBag.activeChatId === chatId) {
    stateBag.activeChatId = "";
    localStorage.removeItem("kokubayashi.chatId");
  }
  ensureChat();
  showNotice("聊天已删除。");
  render();
}

function openGmChat(chatId) {
  if (!chatId) return;
  stateBag.activeChatId = chatId;
  localStorage.setItem("kokubayashi.chatId", chatId);
  setTab("chats");
}

function selectChat(chatId) {
  stateBag.activeChatId = chatId;
  localStorage.setItem("kokubayashi.chatId", chatId);
  renderChats();
}

function selectCalendarMonth(month) {
  const selectedMonth = setSelectedCalendarMonth(month);
  const monthDays = calendarDays().filter((day) => Number(day.month) === selectedMonth);
  if (monthDays.length && !monthDays.some((day) => day.id === stateBag.selectedCalendarDayId)) {
    const currentInMonth = monthDays.find((day) => day.id === stateBag.data?.settings?.currentDayId);
    const nextDay = currentInMonth || monthDays[0];
    stateBag.selectedCalendarDayId = nextDay.id;
    localStorage.setItem("kokubayashi.calendarDayId", nextDay.id);
  }
  renderCalendar();
}

function selectCalendarDay(dayId) {
  const day = getCalendarDay(dayId);
  if (!day) return;
  stateBag.selectedCalendarDayId = day.id;
  localStorage.setItem("kokubayashi.calendarDayId", day.id);
  setSelectedCalendarMonth(day.month);
  renderCalendar();
}

async function sendMessage() {
  if (!currentActor()) return showNotice("请先创建或选择玩家账号。");
  if (!stateBag.activeChatId) return showNotice("请选择聊天。");
  const textarea = document.getElementById("message-content");
  const content = textarea?.value.trim();
  const imageInput = document.getElementById("message-image");
  const imageFile = imageInput?.files?.[0];
  const anonymousInput = document.getElementById("message-anonymous");
  const attachment = imageFile
    ? { type: "image", dataUrl: await fileToImageDataUrl(imageFile, 1400, 0.86, 8500000), name: imageFile.name }
    : null;
  if (!content && !attachment) return showNotice("消息内容或图片为空。");
  await api("/api/messages", {
    method: "POST",
    body: { chatId: stateBag.activeChatId, authorId: stateBag.actorId, content, attachment, isAnonymous: anonymousInput?.checked === true }
  });
  textarea.value = "";
  if (imageInput) imageInput.value = "";
  if (anonymousInput) anonymousInput.checked = false;
  const hint = document.getElementById("message-image-hint");
  if (hint) hint.textContent = "未选择图片";
  await refresh(true);
}

async function unlockGm() {
  const input = document.getElementById("gm-pin");
  stateBag.gmPin = input?.value || "";
  try {
    await api("/api/gm/check", { method: "POST", admin: true });
    stateBag.gmUnlocked = true;
    localStorage.setItem("kokubayashi.gmPin", stateBag.gmPin);
    localStorage.setItem("kokubayashi.gmUnlocked", "true");
    showNotice("GM 后台已解锁。");
    await refresh(true);
  } catch {
    stateBag.gmUnlocked = false;
    localStorage.setItem("kokubayashi.gmUnlocked", "false");
    showNotice("GM PIN 不正确。");
  }
}

function lockGm() {
  stateBag.gmUnlocked = false;
  stateBag.previewActorId = "";
  localStorage.setItem("kokubayashi.gmUnlocked", "false");
  render();
}

async function downloadGmMarkdown(path, filenamePrefix) {
  if (!stateBag.gmPin) return showNotice("请先解锁 GM。");
  const response = await fetch(path, {
    headers: { "X-GM-PIN": stateBag.gmPin }
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || response.statusText || "导出失败。");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  showNotice("Markdown 导出已开始下载。");
}

async function saveSettings() {
  await api("/api/settings", {
    method: "PATCH",
    admin: true,
    body: {
      gameTime: document.getElementById("setting-game-time")?.value,
      schoolDay: document.getElementById("setting-school-day")?.value,
      feedName: document.getElementById("setting-feed-name")?.value,
      chatName: document.getElementById("setting-chat-name")?.value
    }
  });
  showNotice("时间已更新。");
  await refresh(true);
}

async function quickSaveTime() {
  if (!isGmAdminMode()) return showNotice("请先退出玩家预览再修改时间。");
  const dayId = document.getElementById("quick-current-day")?.value || stateBag.data.settings.currentDayId;
  const day = getCalendarDay(dayId);
  if (!day) return showNotice("请选择有效的当前日期。");
  await api("/api/settings", {
    method: "PATCH",
    admin: true,
    body: {
      gameTime: document.getElementById("quick-game-time")?.value,
      currentDayId: day.id,
      feedName: stateBag.data.settings.feedName,
      chatName: stateBag.data.settings.chatName
    }
  });
  showNotice("快速时间已保存。");
  await refresh(true);
}

function quickAdjustTime(minutes) {
  const input = document.getElementById("quick-game-time");
  if (!input) return;
  const next = shiftedGameTime(input.value || stateBag.data?.settings?.gameTime || "", Number(minutes));
  if (!next) {
    showNotice("先输入 08:20 这样的时间，再用快捷按钮调整。");
    return;
  }
  input.value = next;
  input.focus();
}

function shiftedGameTime(value, deltaMinutes) {
  if (!Number.isFinite(deltaMinutes)) return "";
  const text = String(value || "");
  const parsed = findClockTime(text);
  if (!parsed) return "";
  const total = (parsed.hour * 60 + parsed.minute + deltaMinutes + 1440) % 1440;
  const nextClock = formatClockTime(total);
  return `${text.slice(0, parsed.start)}${nextClock}${text.slice(parsed.end)}`.trim();
}

function findClockTime(value) {
  const text = String(value || "");
  const patterns = [
    /([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)/,
    /([01]?\d|2[0-3])\s*(?:時|时|点|點)\s*([0-5]?\d)?\s*(?:分)?/
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) continue;
    const isPm = /午後|下午|pm/i.test(text);
    const isAm = /午前|上午|am/i.test(text);
    if (isPm && hour < 12) hour += 12;
    if (isAm && hour === 12) hour = 0;
    if (hour < 0 || hour > 23) continue;
    return { hour, minute, start: match.index, end: match.index + match[0].length };
  }
  return null;
}

function formatClockTime(totalMinutes) {
  const minutes = ((totalMinutes % 1440) + 1440) % 1440;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function startPlayerPreview() {
  if (!stateBag.gmUnlocked) return showNotice("请先解锁 GM。");
  const actorId = document.getElementById("quick-preview-select")?.value || stateBag.previewPickActorId;
  const actor = getActor(actorId);
  if (!actor || actor.active === false) return showNotice("请选择要预览的玩家账号。");
  stateBag.previewActorId = actor.id;
  stateBag.profileId = "";
  stateBag.openReplyPostId = "";
  if (stateBag.tab === "gm") {
    stateBag.tab = "feed";
    localStorage.setItem("kokubayashi.tab", stateBag.tab);
  }
  showNotice(`正在以 ${actor.name} 的玩家视角预览。`);
  render();
}

function stopPlayerPreview(show = true) {
  stateBag.previewActorId = "";
  stateBag.profileId = "";
  if (show) showNotice("已退出玩家视角预览。");
  render();
}

async function saveCurrentCalendarDay() {
  const dayId = document.getElementById("gm-current-day")?.value;
  if (!dayId) return showNotice("请选择当前日。");
  stateBag.data = await api("/api/calendar/current", {
    method: "PATCH",
    admin: true,
    body: { dayId }
  });
  stateBag.selectedCalendarDayId = dayId;
  stateBag.gmScheduleDayId = dayId;
  const day = getCalendarDay(dayId);
  if (day) setSelectedCalendarMonth(day.month);
  localStorage.setItem("kokubayashi.calendarDayId", dayId);
  localStorage.setItem("kokubayashi.gmScheduleDayId", dayId);
  showNotice("当前日已更新。");
  render();
}

async function saveCalendarSchedule() {
  const dayId = document.getElementById("gm-schedule-day")?.value;
  if (!dayId) return showNotice("请选择要编辑的日期。");
  stateBag.data = await api(`/api/calendar/days/${encodeURIComponent(dayId)}`, {
    method: "PATCH",
    admin: true,
    body: {
      dateLabel: document.getElementById("calendar-date-label")?.value,
      note: document.getElementById("calendar-note")?.value,
      scheduleText: document.getElementById("calendar-schedule-text")?.value
    }
  });
  stateBag.selectedCalendarDayId = dayId;
  stateBag.gmScheduleDayId = dayId;
  const day = getCalendarDay(dayId);
  if (day) setSelectedCalendarMonth(day.month);
  localStorage.setItem("kokubayashi.calendarDayId", dayId);
  localStorage.setItem("kokubayashi.gmScheduleDayId", dayId);
  showNotice("课程表已保存。");
  render();
}

async function applyCalendarBatch() {
  const startDayId = document.getElementById("batch-start-day")?.value;
  const endDayId = document.getElementById("batch-end-day")?.value;
  const weekdayIndexes = selectedBatchWeekdayIndexes();
  const updateSchedule = document.getElementById("batch-update-schedule")?.checked !== false;
  const noteMode = document.getElementById("batch-note-mode")?.value || "keep";
  if (!startDayId || !endDayId) return showNotice("请选择批量范围。");
  if (!weekdayIndexes.length) return showNotice("请至少选择一个适用星期。");
  if (!updateSchedule && noteMode === "keep") return showNotice("请选择要批量修改的内容。");

  const template = document.getElementById("batch-template")?.value || "custom";
  const scheduleText = resolveBatchScheduleText();
  if (updateSchedule && !scheduleText.trim() && template !== "empty") {
    return showNotice("请填写课程表，或选择“清空课程表”模板。");
  }
  stateBag.data = await api("/api/calendar/batch", {
    method: "PATCH",
    admin: true,
    body: {
      startDayId,
      endDayId,
      weekdayIndexes,
      updateSchedule,
      scheduleText,
      noteMode,
      note: document.getElementById("batch-note")?.value
    }
  });
  const result = stateBag.data.batchResult;
  showNotice(`批量编制已完成：${result?.updatedCount || 0} 天。`);
  render();
}

async function publishBulletin() {
  const title = document.getElementById("bulletin-title")?.value.trim();
  const content = document.getElementById("bulletin-content")?.value.trim();
  if (!title && !content) return showNotice("请填写公告标题或内容。");
  stateBag.data = await api("/api/bulletins", {
    method: "POST",
    admin: true,
    body: {
      type: document.getElementById("bulletin-type")?.value,
      title,
      content,
      authorId: document.getElementById("bulletin-author")?.value,
      dayId: document.getElementById("bulletin-day")?.value,
      isPublic: document.getElementById("bulletin-public")?.value !== "false"
    }
  });
  showNotice("公告已发布。");
  render();
}

async function deleteBulletin(bulletinId) {
  if (!bulletinId) return;
  stateBag.data = await api(`/api/bulletins/${encodeURIComponent(bulletinId)}`, {
    method: "DELETE",
    admin: true
  });
  showNotice("公告已删除。需要的话可以用 GM 撤销。");
  render();
}

async function createCalendarEvent() {
  const dayId = document.getElementById("event-day")?.value;
  const title = document.getElementById("event-title")?.value.trim();
  const detail = document.getElementById("event-detail")?.value.trim();
  if (!dayId) return showNotice("请选择日期。");
  if (!title && !detail) return showNotice("请填写事件标题或内容。");
  stateBag.data = await api(`/api/calendar/days/${encodeURIComponent(dayId)}/events`, {
    method: "POST",
    admin: true,
    body: {
      type: document.getElementById("event-type")?.value,
      title,
      detail,
      isPublic: document.getElementById("event-public")?.value === "true",
      triggerTarget: "bulletin"
    }
  });
  stateBag.gmScheduleDayId = dayId;
  stateBag.selectedCalendarDayId = dayId;
  const day = getCalendarDay(dayId);
  if (day) setSelectedCalendarMonth(day.month);
  localStorage.setItem("kokubayashi.calendarDayId", dayId);
  localStorage.setItem("kokubayashi.gmScheduleDayId", dayId);
  showNotice("校历事件已添加。");
  render();
}

async function triggerCalendarEvent(dayId, eventId) {
  if (!dayId || !eventId) return;
  stateBag.data = await api(`/api/calendar/days/${encodeURIComponent(dayId)}/events/${encodeURIComponent(eventId)}/trigger`, {
    method: "POST",
    admin: true
  });
  stateBag.selectedCalendarDayId = dayId;
  const day = getCalendarDay(dayId);
  if (day) setSelectedCalendarMonth(day.month);
  localStorage.setItem("kokubayashi.calendarDayId", dayId);
  showNotice("事件已触发，并已发布到公告栏。");
  render();
}

async function deleteCalendarEvent(dayId, eventId) {
  if (!dayId || !eventId) return;
  stateBag.data = await api(`/api/calendar/days/${encodeURIComponent(dayId)}/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    admin: true
  });
  const day = getCalendarDay(dayId);
  if (day) setSelectedCalendarMonth(day.month);
  showNotice("校历事件已删除。需要的话可以用 GM 撤销。");
  render();
}

async function gmUndo() {
  stateBag.data = await api("/api/gm/undo", {
    method: "POST",
    admin: true
  });
  showNotice("Last GM action undone.");
  render();
}

async function createCharacter() {
  const name = document.getElementById("new-character-name")?.value.trim();
  if (!name) return showNotice("角色名为空。");
  const avatarFile = document.getElementById("new-character-avatar")?.files?.[0];
  const avatarData = avatarFile ? await fileToImageDataUrl(avatarFile, 384, 0.88, 2300000) : "";
  await api("/api/characters", {
    method: "POST",
    admin: true,
    body: {
      name,
      handle: document.getElementById("new-character-handle")?.value,
      type: document.getElementById("new-character-type")?.value,
      tags: parseTagInput(document.getElementById("new-character-tags")?.value),
      avatarData
    }
  });
  await refresh(true);
}

async function importCharacters() {
  const text = document.getElementById("character-import-text")?.value.trim();
  if (!text) return showNotice("批量创建角色内容为空。");
  const result = await api("/api/characters/import", {
    method: "POST",
    admin: true,
    body: { text }
  });
  stateBag.data = result.state;
  showNotice(`已创建 ${result.created?.length || 0} 个角色。`);
  render();
}

async function createGmPlayerAccount() {
  const name = document.getElementById("gm-account-name")?.value.trim();
  const username = document.getElementById("gm-account-username")?.value.trim();
  const handle = document.getElementById("gm-account-handle")?.value.trim();
  const passcode = document.getElementById("gm-account-passcode")?.value.trim();
  if (!name) return showNotice("玩家账号显示名为空。");
  if (!username) return showNotice("请设置登录用户名。");
  if (!handle) return showNotice("请设置 @handle。");
  if (!passcode || passcode.length < 4) return showNotice("初始密码至少 4 个字符。");
  const avatarFile = document.getElementById("gm-account-avatar")?.files?.[0];
  const avatarData = avatarFile ? await fileToImageDataUrl(avatarFile, 384, 0.88, 2300000) : "";

  const result = await api("/api/player-accounts", {
    method: "POST",
    admin: true,
    body: {
      name,
      username,
      handle,
      passcode,
      avatarData,
      tags: parseTagInput(document.getElementById("gm-account-tags")?.value)
    }
  });

  stateBag.data = result.state;
  stateBag.lastGmCreatedAccount = {
    name,
    username,
    handle: handle.startsWith("@") ? handle : `@${handle}`,
    passcode
  };
  stateBag.lastGmImportedAccounts = [];
  showNotice(`玩家账号已创建：${username} / ${handle.startsWith("@") ? handle : `@${handle}`}`);
  render();
}

async function importPlayerAccounts() {
  const text = document.getElementById("account-import-text")?.value.trim();
  if (!text) return showNotice("批量导入内容为空。");
  const result = await api("/api/player-accounts/import", {
    method: "POST",
    admin: true,
    body: { text }
  });
  stateBag.data = result.state;
  stateBag.lastGmCreatedAccount = null;
  stateBag.lastGmImportedAccounts = result.created || [];
  showNotice(`已导入 ${result.created?.length || 0} 个玩家账号。`);
  render();
}

function setPlayerAccountSelection(selected) {
  document.querySelectorAll(".account-delete-checkbox").forEach((checkbox) => {
    checkbox.checked = selected;
  });
}

function selectedPlayerAccountIds() {
  return Array.from(document.querySelectorAll(".account-delete-checkbox:checked"))
    .map((checkbox) => checkbox.value)
    .filter(Boolean);
}

async function deleteSelectedPlayerAccounts() {
  const ids = selectedPlayerAccountIds();
  if (!ids.length) return showNotice("请选择要删除的玩家账号。");
  if (!window.confirm(`删除选中的 ${ids.length} 个玩家账号？历史消息会保留，GM 撤销可以恢复。`)) return;
  const result = await api("/api/player-accounts", {
    method: "DELETE",
    admin: true,
    body: { ids }
  });
  stateBag.data = result.state;
  stateBag.lastGmCreatedAccount = null;
  stateBag.lastGmImportedAccounts = [];
  showNotice(`已删除 ${result.deleted?.length || ids.length} 个玩家账号。`);
  render();
}

async function deleteAllPlayerAccounts() {
  const accounts = (stateBag.data?.characters || []).filter((character) => character.type === "account" && character.active !== false);
  if (!accounts.length) return showNotice("没有可删除的玩家账号。");
  if (!window.confirm(`删除全部 ${accounts.length} 个玩家账号？历史消息会保留，GM 撤销可以恢复。`)) return;
  const result = await api("/api/player-accounts", {
    method: "DELETE",
    admin: true,
    body: { all: true }
  });
  stateBag.data = result.state;
  stateBag.lastGmCreatedAccount = null;
  stateBag.lastGmImportedAccounts = [];
  showNotice(`已删除 ${result.deleted?.length || accounts.length} 个玩家账号。`);
  render();
}

async function updateCharacterAvatar(characterId) {
  if (!characterId) return;
  const character = getActor(characterId);
  if (!character) return;
  const file = document.getElementById(`character-avatar-${characterId}`)?.files?.[0];
  if (!file) return showNotice("请选择头像图片。");
  const avatarData = await fileToImageDataUrl(file, 384, 0.88, 2300000);
  stateBag.data = await api(`/api/characters/${encodeURIComponent(characterId)}`, {
    method: "PATCH",
    admin: true,
    body: { avatarData }
  });
  showNotice(`头像已更新：${character.name}`);
  render();
}

async function saveCharacterProfile(characterId) {
  if (!characterId) return;
  const name = document.getElementById(`character-name-${characterId}`)?.value.trim();
  const handle = document.getElementById(`character-handle-${characterId}`)?.value.trim();
  if (!name) return showNotice("显示名不能为空。");
  if (!handle) return showNotice("@handle 不能为空。");
  stateBag.data = await api(`/api/characters/${encodeURIComponent(characterId)}`, {
    method: "PATCH",
    admin: true,
    body: { name, handle }
  });
  const updated = getActor(characterId);
  showNotice(`角色资料已保存：${updated?.name || name}`);
  render();
}

async function saveCharacterTags(characterId) {
  if (!characterId) return;
  const input = document.getElementById(`character-tags-${characterId}`);
  stateBag.data = await api(`/api/characters/${encodeURIComponent(characterId)}`, {
    method: "PATCH",
    admin: true,
    body: {
      tags: parseTagInput(input?.value)
    }
  });
  showNotice("标签已保存。");
  render();
}

async function deleteCharacter(characterId) {
  const character = getActor(characterId);
  if (!character) return;
  if (!window.confirm(`删除角色「${character.name}」？历史消息会保留，GM 撤销可以恢复。`)) return;
  stateBag.data = await api(`/api/characters/${encodeURIComponent(characterId)}`, {
    method: "DELETE",
    admin: true
  });
  if (stateBag.actorId === characterId) {
    stateBag.actorId = "";
    localStorage.removeItem("kokubayashi.actorId");
  }
  showNotice("角色已删除。需要的话可以用 GM 撤销。");
  render();
}

async function deleteAllCharacters() {
  const chars = (stateBag.data?.characters || []).filter((character) => character.active !== false);
  if (!chars.length) return showNotice("没有可删除的角色。");
  if (!window.confirm(`删除全部 ${chars.length} 个 active 角色？历史消息会保留，GM 撤销可以恢复。`)) return;
  const result = await api("/api/characters", {
    method: "DELETE",
    admin: true
  });
  stateBag.data = result.state;
  stateBag.actorId = "";
  stateBag.profileId = "";
  localStorage.removeItem("kokubayashi.actorId");
  showNotice(`已删除 ${result.deleted?.length || chars.length} 个角色。需要的话可以用 GM 撤销。`);
  render();
}

async function createPlayerAccount() {
  const name = document.getElementById("account-name")?.value.trim();
  if (!name) return showNotice("账号显示名为空。");
  const passcode = document.getElementById("account-passcode")?.value.trim();
  if (!passcode || passcode.length < 4) return showNotice("登录码至少 4 个字符。");
  const avatarFile = document.getElementById("account-avatar")?.files?.[0];
  const avatarData = avatarFile ? await fileToImageDataUrl(avatarFile, 384, 0.88, 2300000) : "";
  const result = await api("/api/player-accounts", {
    method: "POST",
    body: {
      name,
      handle: document.getElementById("account-handle")?.value,
      passcode,
      avatarData
    }
  });

  stateBag.accountTokens[result.accountId] = result.accountToken;
  saveAccountTokens();
  stateBag.actorId = result.accountId;
  localStorage.setItem("kokubayashi.actorId", stateBag.actorId);
  stateBag.data = result.state;
  showNotice("玩家账号已创建。");
  render();
}

async function loginPlayerAccount() {
  const login = document.getElementById("login-handle")?.value.trim();
  const passcode = document.getElementById("login-passcode")?.value.trim();
  if (!login || !passcode) return showNotice("请输入用户名或 @handle 和登录码。");
  const result = await api("/api/player-accounts/login", {
    method: "POST",
    body: { login, handle: login, passcode }
  });
  stateBag.accountTokens[result.accountId] = result.accountToken;
  saveAccountTokens();
  stateBag.actorId = result.accountId;
  localStorage.setItem("kokubayashi.actorId", stateBag.actorId);
  stateBag.data = result.state;
  showNotice("账号已登录。");
  render();
}

function switchAccount(characterId) {
  if (!characterId) return;
  const account = getActor(characterId);
  if (!account || !stateBag.accountTokens[characterId]) return showNotice("这个账号需要重新登录。");
  stateBag.actorId = characterId;
  stateBag.profileId = "";
  localStorage.setItem("kokubayashi.actorId", stateBag.actorId);
  showNotice(`已切换到 ${account.name}。`);
  render();
}

function logoutAccount(characterId = stateBag.actorId) {
  const accountId = characterId || stateBag.actorId;
  if (!accountId) return;
  const account = getActor(accountId);
  delete stateBag.accountTokens[accountId];
  saveAccountTokens();
  if (stateBag.actorId === accountId) {
    stateBag.actorId = "";
    stateBag.profileId = "";
    localStorage.removeItem("kokubayashi.actorId");
  }
  showNotice(account ? `已退出 ${account.name}。` : "已退出账号。");
  render();
}

async function updateAvatar() {
  if (!currentActor()) return showNotice("请先选择玩家账号。");
  const file = document.getElementById("avatar-update-file")?.files?.[0];
  if (!file) return showNotice("请选择头像图片。");
  const avatarData = await fileToImageDataUrl(file, 384, 0.88, 2300000);
  await api(`/api/player-accounts/${encodeURIComponent(stateBag.actorId)}`, {
    method: "PATCH",
    body: { avatarData }
  });
  showNotice("头像已更新。");
  await refresh(true);
}

async function uploadEmoji() {
  if (!currentActor()) return showNotice("请先选择玩家账号。");
  const shortcode = document.getElementById("emoji-shortcode")?.value.trim();
  const file = document.getElementById("emoji-file")?.files?.[0];
  if (!shortcode) return showNotice("请输入 emoji shortcode。");
  if (!file) return showNotice("请选择 emoji 图片。");
  const imageData = await fileToImageDataUrl(file, 128, 0.9, 900000);
  await api("/api/emojis", {
    method: "POST",
    body: {
      ownerId: stateBag.actorId,
      shortcode,
      imageData
    }
  });
  showNotice(`Emoji :${shortcode.replace(/^:+|:+$/g, "")}: 已上传。`);
  await refresh(true);
}

function insertEmoji(targetId, value) {
  const target = document.getElementById(targetId);
  if (!target) return;
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? target.value.length;
  target.value = `${target.value.slice(0, start)}${value}${target.value.slice(end)}`;
  const next = start + value.length;
  target.focus();
  target.setSelectionRange(next, next);
}

async function createChat() {
  const name = document.getElementById("new-chat-name")?.value.trim();
  const memberIds = Array.from(document.querySelectorAll(".member-checkbox:checked")).map((item) => item.value);
  if (!name) return showNotice("群名为空。");
  await api("/api/chats", {
    method: "POST",
    admin: true,
    body: { name, memberIds, type: "group" }
  });
  await refresh(true);
}

function toggleGmSection(sectionId) {
  if (!sectionId) return;
  stateBag.gmCollapsedSections[sectionId] = !stateBag.gmCollapsedSections[sectionId];
  saveLocalJson("kokubayashi.gmCollapsedSections", stateBag.gmCollapsedSections);
  updateGmSectionCollapse(sectionId);
}

function updateGmSectionCollapse(sectionId) {
  const section = Array.from(els.viewRoot.querySelectorAll(".gm-section"))
    .find((item) => item.dataset.sectionId === sectionId);
  if (!section) {
    renderGm();
    return;
  }
  const collapsed = stateBag.gmCollapsedSections[sectionId] === true;
  const body = section.querySelector(":scope > .gm-section-body");
  const toggle = section.querySelector(":scope > .gm-section-head .gm-section-toggle");
  section.classList.toggle("collapsed", collapsed);
  if (body) {
    body.hidden = collapsed;
    body.style.display = collapsed ? "none" : "";
  }
  if (toggle) {
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    toggle.textContent = collapsed ? "展开" : "收起";
  }
}

function setRosterTag(tag) {
  stateBag.rosterTag = tag || "";
  localStorage.setItem("kokubayashi.rosterTag", stateBag.rosterTag);
  renderGm();
}

function viewProfile(characterId) {
  if (!characterId || !getActor(characterId)) return;
  stateBag.profileId = characterId;
  render();
}

function closeProfile() {
  stateBag.profileId = "";
  render();
}

function togglePrivateChatForm() {
  stateBag.privateChatOpen = !stateBag.privateChatOpen;
  render();
}

function toggleChatMemberPanel(chatId) {
  if (!chatId) return;
  stateBag.chatMemberPanelChatId = stateBag.chatMemberPanelChatId === chatId ? "" : chatId;
  renderChats();
}

function toggleMemberDrawer(chatId) {
  if (!chatId) return;
  stateBag.memberDrawerChatId = stateBag.memberDrawerChatId === chatId ? "" : chatId;
  renderChats();
}

function togglePinChat(chatId) {
  if (!chatId) return;
  const ids = new Set(stateBag.pinnedChatIds);
  if (ids.has(chatId)) ids.delete(chatId);
  else ids.add(chatId);
  stateBag.pinnedChatIds = Array.from(ids);
  saveLocalJson("kokubayashi.pinnedChatIds", stateBag.pinnedChatIds);
  renderChats();
}

function jumpToLatest() {
  const box = document.getElementById("messages");
  const chat = getChat(stateBag.activeChatId);
  const latest = latestMessageForChat(chat);
  if (box) box.scrollTop = box.scrollHeight;
  if (chat) markChatRead(chat.id, latest?.createdAt);
  stateBag.chatNewPromptId = "";
  renderChats();
}

async function requestFollow(targetIdOverride = "") {
  if (!currentActor()) return showNotice("请先创建或登录玩家账号。");
  const targetId = targetIdOverride || document.getElementById("follow-target")?.value;
  if (!targetId) return showNotice("请选择想要关注的账号。");
  stateBag.data = await api("/api/follows", {
    method: "POST",
    body: { requesterId: stateBag.actorId, targetId }
  });
  showNotice("关注请求已发送，等待 GM 批准。");
  render();
}

async function updateFollow(followId, status) {
  if (!followId) return;
  stateBag.data = await api(`/api/follows/${encodeURIComponent(followId)}`, {
    method: "PATCH",
    admin: true,
    body: { status }
  });
  showNotice(status === "accepted" ? "关注已批准，可以私聊了。" : "关注请求已拒绝。");
  render();
}

async function requestChatMemberChange(action) {
  if (!currentActor()) return showNotice("请先创建或登录玩家账号。");
  const chat = getChat(stateBag.activeChatId);
  if (!chat) return showNotice("请选择群聊。");
  const selectId = action === "remove" ? "chat-remove-member" : "chat-add-member";
  const targetId = document.getElementById(selectId)?.value;
  if (!targetId) return showNotice(action === "remove" ? "请选择要移除的角色。" : "请选择要邀请的角色。");
  const result = await api(`/api/chats/${encodeURIComponent(chat.id)}/member-requests`, {
    method: "POST",
    body: {
      requesterId: stateBag.actorId,
      targetId,
      action
    }
  });
  stateBag.data = result.state;
  stateBag.chatMemberPanelChatId = "";
  showNotice(result.existing ? "已有相同申请在等待 GM 审批。" : "申请已发送，等待 GM 批准。");
  render();
}

async function updateChatMemberRequest(requestId, status) {
  if (!requestId) return;
  stateBag.data = await api(`/api/chat-member-requests/${encodeURIComponent(requestId)}`, {
    method: "PATCH",
    admin: true,
    body: { status }
  });
  showNotice(status === "accepted" ? "群成员申请已批准。" : "群成员申请已拒绝。");
  render();
}

async function openDirectChat(targetIdOverride = "") {
  if (!currentActor()) return showNotice("请先创建或登录玩家账号。");
  const targetId = targetIdOverride || document.getElementById("follow-target")?.value;
  if (!targetId) return showNotice("请选择私聊对象。");
  const result = await api("/api/direct-chats", {
    method: "POST",
    body: { requesterId: stateBag.actorId, targetId }
  });
  stateBag.data = result.state;
  stateBag.activeChatId = result.chatId;
  stateBag.profileId = "";
  localStorage.setItem("kokubayashi.chatId", stateBag.activeChatId);
  setTab("chats");
  showNotice("私聊已打开。");
}

async function createPlayerPrivateChat() {
  if (!currentActor()) return showNotice("请先创建或登录玩家账号。");
  const name = document.getElementById("private-chat-name")?.value.trim();
  const memberIds = Array.from(document.querySelectorAll(".private-member-checkbox:checked")).map((item) => item.value);
  if (!name) return showNotice("请输入群聊名称。");
  if (!memberIds.length) return showNotice("请选择至少一个已批准联系人。");
  const result = await api("/api/player-chats", {
    method: "POST",
    body: { creatorId: stateBag.actorId, name, memberIds }
  });
  stateBag.data = result.state;
  stateBag.activeChatId = result.chatId;
  stateBag.privateChatOpen = false;
  localStorage.setItem("kokubayashi.chatId", stateBag.activeChatId);
  setTab("chats");
  showNotice("私密群聊已创建。");
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if ((isGmAdminMode() || options.admin) && stateBag.gmPin) headers["X-GM-PIN"] = stateBag.gmPin;
  if (!stateBag.gmUnlocked && stateBag.actorId && stateBag.accountTokens[stateBag.actorId]) {
    headers["X-Account-Token"] = stateBag.accountTokens[stateBag.actorId];
  }
  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || response.statusText);
  }
  return response.json();
}

function availableActors() {
  const chars = stateBag.data?.characters?.filter((item) => item.active !== false) || [];
  if (isPreviewMode()) {
    const actor = currentPreviewActor();
    return actor ? [actor] : [];
  }
  if (isGmAdminMode()) return chars;
  const ownedIds = new Set(Object.keys(stateBag.accountTokens));
  return chars.filter((item) => item.type === "account" && ownedIds.has(item.id));
}

function visibleChats() {
  const chats = stateBag.data?.chats || [];
  if (isGmAdminMode()) return chats;
  const actorId = effectiveActorId();
  if (!actorId) return chats.filter((chat) => chat.isPublic);
  return chats.filter((chat) => chat.isPublic || chat.memberIds.includes(actorId));
}

function visibleBulletins() {
  const bulletins = stateBag.data?.bulletins || [];
  return isGmAdminMode() ? [...bulletins] : bulletins.filter((bulletin) => bulletin.isPublic !== false);
}

function filteredAndSortedChats(chats) {
  const query = normalizeSearch(stateBag.chatSearch);
  return [...chats]
    .filter((chat) => {
      if (!query) return true;
      return searchableText([chat.name, chatMemberNames(chat).join(" ")]).includes(query);
    })
    .sort((a, b) => {
      const pinDelta = Number(isChatPinned(b.id)) - Number(isChatPinned(a.id));
      if (pinDelta) return pinDelta;
      const aLatest = latestMessageForChat(a)?.createdAt || a.createdAt || "";
      const bLatest = latestMessageForChat(b)?.createdAt || b.createdAt || "";
      return String(bLatest).localeCompare(String(aLatest));
    });
}

function filteredRosterCharacters(chars) {
  const query = normalizeSearch(stateBag.rosterSearch);
  const tag = stateBag.rosterTag;
  return chars.filter((character) => {
    if (tag && !characterTags(character).includes(tag)) return false;
    if (!query) return true;
    return searchableText([
      character.name,
      character.handle,
      character.username,
      character.type,
      characterTags(character).join(" ")
    ]).includes(query);
  });
}

function isChatPinned(chatId) {
  return stateBag.pinnedChatIds.includes(chatId);
}

function latestMessageForChat(chat) {
  if (!chat) return null;
  return [...(stateBag.data?.messages || [])]
    .filter((message) => message.chatId === chat.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
}

function markChatRead(chatId, createdAt) {
  if (!chatId || !createdAt) return;
  if (String(stateBag.chatReadTimes[chatId] || "").localeCompare(String(createdAt)) >= 0) return;
  stateBag.chatReadTimes[chatId] = createdAt;
  saveLocalJson("kokubayashi.chatReadTimes", stateBag.chatReadTimes);
}

function isNearBottom(element) {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight < 80;
}

function canDeleteChat(chat) {
  if (!chat) return false;
  if (isGmAdminMode()) return true;
  return chat.isPublic !== true && chat.createdBy === stateBag.actorId;
}

function canDeleteReply(reply) {
  if (!reply) return false;
  if (isGmAdminMode()) return true;
  return reply.authorId === stateBag.actorId;
}

function contactCandidates() {
  const actor = currentActor();
  if (!actor) return [];
  return (stateBag.data?.characters || [])
    .filter((character) => character.active !== false && character.id !== actor.id);
}

function calendarDays() {
  return stateBag.data?.calendarDays || [];
}

function visibleCalendarEvents(day) {
  const events = day?.events || [];
  return isGmAdminMode() ? events : events.filter((event) => event.isPublic || event.triggeredAt);
}

function normalizeCalendarDayIdClient(dayId) {
  const legacyIds = {
    day_mon: "day_001",
    day_tue: "day_002",
    day_wed: "day_003",
    day_thu: "day_004",
    day_fri: "day_005",
    day_sat: "day_006",
    day_sun: "day_007"
  };
  const raw = String(dayId || "").trim();
  return legacyIds[raw] || raw;
}

function getCalendarDay(dayId) {
  const normalizedDayId = normalizeCalendarDayIdClient(dayId);
  return calendarDays().find((day) => day.id === normalizedDayId);
}

function currentCalendarDay() {
  return getCalendarDay(stateBag.data?.settings?.currentDayId) || calendarDays()[0];
}

function selectedCalendarDay() {
  const selected = getCalendarDay(stateBag.selectedCalendarDayId);
  const current = currentCalendarDay();
  const next = selected || current || calendarDays()[0];
  if (next?.id && stateBag.selectedCalendarDayId !== next.id) {
    stateBag.selectedCalendarDayId = next.id;
    localStorage.setItem("kokubayashi.calendarDayId", next.id);
  }
  if (next?.month) setSelectedCalendarMonth(next.month);
  return next;
}

function calendarMonths() {
  const months = [];
  for (const day of calendarDays()) {
    const month = Number(day.month);
    if (!month) continue;
    let entry = months.find((item) => item.month === month);
    if (!entry) {
      entry = { month, label: day.monthLabel || `${month}月`, count: 0 };
      months.push(entry);
    }
    entry.count += 1;
  }
  return months;
}

function selectedCalendarMonth() {
  const months = calendarMonths();
  const savedMonth = Number(stateBag.selectedCalendarMonth);
  if (months.some((item) => item.month === savedMonth)) return savedMonth;
  const fallbackMonth = Number(selectedCalendarDay()?.month || currentCalendarDay()?.month || months[0]?.month || 4);
  return setSelectedCalendarMonth(fallbackMonth);
}

function setSelectedCalendarMonth(month) {
  const months = calendarMonths();
  const numericMonth = Number(month);
  const nextMonth = months.some((item) => item.month === numericMonth)
    ? numericMonth
    : Number(months[0]?.month || 4);
  stateBag.selectedCalendarMonth = nextMonth;
  localStorage.setItem("kokubayashi.calendarMonth", String(nextMonth));
  return nextMonth;
}

function dayOptionLabel(day) {
  return `${day?.dateLabel || ""} ${day?.label || ""}`.trim() || day?.id || "";
}

function resolveCalendarDayInput(value) {
  const input = String(value || "").trim();
  if (!input) return "";
  const normalized = normalizeCalendarDayIdClient(input);
  const folded = input.toLowerCase();
  const day = calendarDays().find((item) => (
    item.id === normalized ||
    dayOptionLabel(item).toLowerCase() === folded ||
    String(item.dateLabel || "").trim().toLowerCase() === folded ||
    `${item.month}/${item.dayOfMonth}` === input ||
    `${item.month}月${item.dayOfMonth}日` === input
  ));
  return day?.id || "";
}

function postTimelineLabel(post) {
  const time = String(post?.gameTime || "").trim();
  const day = getCalendarDay(post?.dayId);
  if (!day) return time;

  const dayLabel = dayOptionLabel(day);
  if (!time) return dayLabel;
  const foldedTime = time.toLowerCase();
  const alreadyIncludesDay = [day.dateLabel, day.label, dayLabel]
    .filter(Boolean)
    .some((label) => foldedTime.includes(String(label).toLowerCase()));
  return alreadyIncludesDay ? time : `${dayLabel} · ${time}`;
}

function renderDayOptions(days, selectedId) {
  const selectedDayId = getCalendarDay(selectedId)?.id || normalizeCalendarDayIdClient(selectedId);
  return calendarMonths().map((month) => {
    const options = days
      .filter((day) => Number(day.month) === month.month)
      .map((day) => `<option value="${escapeAttr(day.id)}" ${day.id === selectedDayId ? "selected" : ""}>${escapeHtml(dayOptionLabel(day))}</option>`)
      .join("");
    return `<optgroup label="${escapeAttr(month.label)}">${options}</optgroup>`;
  }).join("");
}

function calendarBatchTargetDays(days, startDayId, endDayId, weekdayIndexes) {
  const startIndex = days.findIndex((day) => day.id === normalizeCalendarDayIdClient(startDayId));
  const endIndex = days.findIndex((day) => day.id === normalizeCalendarDayIdClient(endDayId));
  if (startIndex < 0 || endIndex < 0) return [];
  const from = Math.min(startIndex, endIndex);
  const to = Math.max(startIndex, endIndex);
  const allowed = new Set(weekdayIndexes.length ? weekdayIndexes.map(Number) : [0, 1, 2, 3, 4, 5, 6]);
  return days.slice(from, to + 1).filter((day) => allowed.has(Number(day.weekdayIndex)));
}

function selectedBatchWeekdayIndexes() {
  return [...document.querySelectorAll(".batch-weekday:checked")]
    .map((item) => Number(item.value))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
}

function batchTemplateText(template) {
  const templates = {
    holiday: "全天 | 休校 | 校外 | 无正式课程",
    exam: [
      "08:20 | 朝会 | 1-A 教室 | 考试说明",
      "09:00 | 第一节考试 | 指定教室 |",
      "10:30 | 第二节考试 | 指定教室 |",
      "12:00 | 午休 | 食堂 |",
      "13:00 | 第三节考试 | 指定教室 |"
    ].join("\n"),
    club: [
      "10:00 | 社团活动 | 校内 | 参加者确认",
      "13:00 | 自由活动 | 校内 |",
      "15:30 | 归寮确认 | 宿舍 / 校门 |"
    ].join("\n"),
    empty: ""
  };
  return templates[template] ?? "";
}

function resolveBatchScheduleText() {
  const template = document.getElementById("batch-template")?.value || "custom";
  if (template === "copy_day") {
    const sourceDay = getCalendarDay(document.getElementById("batch-copy-day")?.value);
    return scheduleToText(sourceDay?.schedule || []);
  }
  if (template !== "custom") return batchTemplateText(template);
  return document.getElementById("batch-schedule-text")?.value || "";
}

function populateBatchScheduleTemplate() {
  const textarea = document.getElementById("batch-schedule-text");
  if (!textarea) return;
  const template = document.getElementById("batch-template")?.value || "custom";
  if (template === "custom") return;
  textarea.value = resolveBatchScheduleText();
}

function updateBatchPreview() {
  const preview = document.getElementById("batch-preview");
  if (!preview) return;
  const weekdayIndexes = selectedBatchWeekdayIndexes();
  const targets = weekdayIndexes.length
    ? calendarBatchTargetDays(
      calendarDays(),
      document.getElementById("batch-start-day")?.value,
      document.getElementById("batch-end-day")?.value,
      weekdayIndexes
    )
    : [];
  preview.textContent = `预计影响 ${targets.length} 天`;
}

function scheduleToText(schedule) {
  return (schedule || []).map((item) => [
    item.time || "",
    item.subject || "",
    item.location || "",
    item.note || ""
  ].join(" | ").replace(/(?:\s*\|\s*)+$/g, "")).join("\n");
}

function acceptedContacts() {
  const actor = currentActor();
  if (!actor) return [];
  return contactCandidates().filter((character) => canDirectMessageClient(actor.id, character.id));
}

function canDirectMessageClient(sourceId, targetId) {
  if (sourceId === targetId) return true;
  return (stateBag.data?.relationships || []).some((relationship) => (
    relationship.status === "accepted" &&
    (
      (relationship.requesterId === sourceId && relationship.targetId === targetId) ||
      (relationship.requesterId === targetId && relationship.targetId === sourceId)
    )
  ));
}

function relationshipLabel(targetId) {
  const labels = {
    self: "本人",
    accepted: "已关注",
    outgoing_pending: "等待 GM",
    incoming_pending: "对方请求中",
    rejected: "曾被拒绝",
    none: "未关注"
  };
  return labels[relationshipStatus(targetId)] || labels.none;
}

function relationshipStatus(targetId) {
  const actor = currentActor();
  if (!actor || !targetId) return "none";
  if (actor.id === targetId) return "self";
  const relationships = stateBag.data?.relationships || [];
  if (canDirectMessageClient(actor.id, targetId)) return "accepted";
  if (relationships.some((item) => item.requesterId === actor.id && item.targetId === targetId && item.status === "pending")) {
    return "outgoing_pending";
  }
  if (relationships.some((item) => item.requesterId === targetId && item.targetId === actor.id && item.status === "pending")) {
    return "incoming_pending";
  }
  const rejected = relationships.some((item) => (
    item.status === "rejected" &&
    (
      (item.requesterId === actor.id && item.targetId === targetId) ||
      (item.requesterId === targetId && item.targetId === actor.id)
    )
  ));
  return rejected ? "rejected" : "none";
}

function currentActor() {
  if (isPreviewMode()) return currentPreviewActor();
  if (!stateBag.actorId) return null;
  if (isGmAdminMode()) return getActor(stateBag.actorId);
  return availableActors().find((actor) => actor.id === stateBag.actorId) || null;
}

function getActor(id) {
  return stateBag.data?.characters?.find((item) => item.id === id);
}

function getChat(id) {
  return stateBag.data?.chats?.find((item) => item.id === id);
}

function memberNames(chat) {
  if (!chat) return [];
  return chat.memberIds.map((id) => getActor(id)?.name).filter(Boolean).slice(0, 8);
}

function chatMemberNames(chat) {
  return (chat?.memberIds || [])
    .map((memberId) => getActor(memberId))
    .filter(Boolean)
    .flatMap((member) => [member.name, member.handle, member.username, ...characterTags(member)]);
}

function renderMemberProfileLinks(chat) {
  if (!chat) return "";
  const members = chat.memberIds.map((id) => getActor(id)).filter(Boolean).slice(0, 10);
  if (!members.length) return "";
  return members.map((member) => `
    <button class="member-link" type="button" data-action="view-profile" data-character-id="${member.id}">
      ${escapeHtml(member.name)}
    </button>
  `).join("");
}

function renderAvatar(actor) {
  const color = actor?.color || "#687075";
  const text = actor?.avatarText || "?";
  if (actor?.avatarData) {
    return `<div class="avatar" style="background:${escapeAttr(color)}"><img class="avatar-img" src="${escapeAttr(actor.avatarData)}" alt="${escapeAttr(actor.name)}"></div>`;
  }
  return `<div class="avatar" style="background:${escapeAttr(color)}">${escapeHtml(text)}</div>`;
}

function renderAnonymousAvatar() {
  return `<div class="avatar anonymous-avatar">匿</div>`;
}

function renderActorPreview(actor) {
  if (!actor) return "";
  return `
    ${renderAvatar(actor)}
      <div class="name-block">
        <div class="name">${escapeHtml(actor.name)}</div>
      <div class="handle">${escapeHtml(actor.handle)}</div>
      ${renderCharacterTags(actor)}
    </div>
  `;
}

function showNotice(message) {
  els.notice.textContent = message;
  els.notice.hidden = false;
  setTimeout(() => {
    els.notice.hidden = true;
  }, 2600);
}

function formatText(value, options = {}) {
  let text = escapeHtml(value);
  const emojis = stateBag.data?.emojis || [];
  for (const emoji of emojis) {
    const token = `:${emoji.shortcode}:`;
    const escapedToken = escapeRegExp(escapeHtml(token));
    text = text.replace(new RegExp(escapedToken, "g"), `<img class="inline-emoji" src="${escapeAttr(emoji.imageData)}" alt="${escapeAttr(token)}">`);
  }
  if (options.hashtags) text = linkHashtags(text);
  return text.replace(/\n/g, "<br>");
}

function linkHashtags(text) {
  HASHTAG_PATTERN.lastIndex = 0;
  return text.replace(HASHTAG_PATTERN, (match, prefix, tag) => {
    const normalized = normalizeHashtag(tag);
    if (!normalized) return match;
    return `${prefix}<button class="hashtag-link" type="button" data-action="filter-hashtag" data-hashtag="${escapeAttr(normalized)}">#${escapeHtml(tag)}</button>`;
  });
}

function normalizeHashtag(value) {
  const tag = String(value || "").trim().replace(/^#+/, "").toLowerCase();
  const match = tag.match(/^[\p{L}\p{N}_][\p{L}\p{N}_-]{0,48}/u);
  return match ? match[0] : "";
}

function postHashtags(post) {
  const tags = [];
  HASHTAG_PATTERN.lastIndex = 0;
  for (const match of String(post?.content || "").matchAll(HASHTAG_PATTERN)) {
    const tag = normalizeHashtag(match[2]);
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function postMatchesHashtag(post, hashtag) {
  const target = normalizeHashtag(hashtag);
  if (!target) return true;
  return postHashtags(post).includes(target);
}

function renderImageAttachment(attachment, className = "chat-image") {
  const mediaClass = className === "post-image" ? "post-image" : "chat-image";
  return `
    <figure class="${mediaClass}">
      <img src="${escapeAttr(attachment.dataUrl)}" alt="${escapeAttr(attachment.name || "image")}">
      <figcaption>${escapeHtml(attachment.name || "image")}</figcaption>
    </figure>
  `;
}

function parseTagInput(value) {
  return String(value || "")
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.slice(0, 24))
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 12);
}

function characterTags(actor) {
  return Array.isArray(actor?.tags) ? actor.tags.filter(Boolean) : [];
}

function characterTagInputValue(actor) {
  return characterTags(actor).join(", ");
}

function renderCharacterTags(actor) {
  const tags = visibleCharacterTags(actor);
  if (!tags.length) return "";
  return `<span class="tag-list">${tags.map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("")}</span>`;
}

function visibleCharacterTags(actor) {
  const tags = characterTags(actor);
  if (isGmAdminMode()) return tags;
  return tags.filter((tag) => !isImmersionBreakingTag(tag));
}

function isImmersionBreakingTag(tag) {
  const value = normalizeSearch(tag).replace(/[\s_\-・/／|｜]+/g, "");
  return ["npc", "pc", "player", "account", "gm", "gm角色", "gm扮演角色", "玩家", "玩家角色", "玩家账号"].includes(value);
}

function typeLabelForBulletin(type) {
  const labels = {
    bulletin: "公告",
    rumor: "传闻",
    school: "学校通知",
    club: "社团通知",
    incident: "事件通报"
  };
  return labels[type] || "公告";
}

function typeLabelForEvent(type) {
  const labels = {
    event: "事件",
    rumor: "传闻",
    exam: "考试",
    club: "社团",
    incident: "事件通报",
    notice: "通知"
  };
  return labels[type] || "事件";
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function readAccountTokens() {
  return readLocalJson("kokubayashi.accountTokens", {});
}

function saveAccountTokens() {
  saveLocalJson("kokubayashi.accountTokens", stateBag.accountTokens);
}

function currentAccountToken() {
  return stateBag.accountTokens[stateBag.actorId] || "";
}

function readLocalJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocalJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function searchableText(values) {
  return values.filter(Boolean).join(" ").toLowerCase();
}

function fileToImageDataUrl(file, maxEdge, quality, maxLength = Infinity) {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件。");
  }
  if (file.type === "image/gif") return readFileAsDataUrl(file, maxLength);

  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      try {
        let edge = maxEdge;
        let currentQuality = quality;
        let result = "";

        for (let attempt = 0; attempt < 14; attempt += 1) {
          const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
          const width = Math.max(1, Math.round(image.naturalWidth * scale));
          const height = Math.max(1, Math.round(image.naturalHeight * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          result = canvas.toDataURL("image/jpeg", currentQuality);
          if (result.length <= maxLength) {
            URL.revokeObjectURL(objectUrl);
            resolve(result);
            return;
          }
          if (currentQuality > 0.58) {
            currentQuality = Math.max(0.58, currentQuality - 0.1);
          } else {
            edge = Math.max(240, Math.round(edge * 0.78));
            currentQuality = Math.max(0.72, quality - 0.08);
          }
        }

        URL.revokeObjectURL(objectUrl);
        reject(new Error("图片太大，请换一张较小的图片。"));
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("图片读取失败。"));
    };
    image.src = objectUrl;
  });
}

function readFileAsDataUrl(file, maxLength = Infinity) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      if (result.length > maxLength) {
        reject(new Error("图片太大，请换一张较小的图片。"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("文件读取失败。"));
    reader.readAsDataURL(file);
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

boot().catch((error) => {
  console.error(error);
  showNotice(error.message || "启动失败。");
});
