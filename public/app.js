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
  lastGmCreatedAccount: null,
  lastGmImportedAccounts: [],
  gmPin: localStorage.getItem("kokubayashi.gmPin") || "",
  accountTokens: readAccountTokens(),
  gmUnlocked: localStorage.getItem("kokubayashi.gmUnlocked") === "true"
};

const els = {
  viewRoot: document.getElementById("view-root"),
  viewTitle: document.getElementById("view-title"),
  clockLine: document.getElementById("clock-line"),
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

  els.actorSelect.addEventListener("change", () => {
    stateBag.actorId = els.actorSelect.value;
    localStorage.setItem("kokubayashi.actorId", stateBag.actorId);
    render();
  });
}

async function handleAction(target) {
  const action = target.dataset.action;
  if (action === "publish-post") return publishPost();
  if (action === "like-post") return likePost(target.dataset.postId);
  if (action === "reply-post") return replyPost(target.dataset.postId);
  if (action === "delete-reply") return deleteReply(target.dataset.postId, target.dataset.replyId);
  if (action === "save-post") return savePost(target.dataset.postId);
  if (action === "delete-post") return deletePost(target.dataset.postId);
  if (action === "delete-message") return deleteMessage(target.dataset.messageId);
  if (action === "delete-chat") return deleteChat(target.dataset.chatId);
  if (action === "open-gm-chat") return openGmChat(target.dataset.chatId);
  if (action === "open-gm-feed") return setTab("feed");
  if (action === "publish-bulletin") return publishBulletin();
  if (action === "delete-bulletin") return deleteBulletin(target.dataset.bulletinId);
  if (action === "select-chat") return selectChat(target.dataset.chatId);
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
  if (action === "open-direct-chat") return openDirectChat(target.dataset.characterId);
  if (action === "toggle-private-chat-form") return togglePrivateChatForm();
  if (action === "create-player-chat") return createPlayerPrivateChat();
}

async function refresh(forceRender) {
  const previousUpdatedAt = stateBag.data?.updatedAt;
  const data = await api("/api/state");
  stateBag.data = data;
  ensureActor();
  ensureChat();
  const changed = previousUpdatedAt !== data.updatedAt;
  if (forceRender || (changed && canAutoRender())) render();
}

function ensureActor() {
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
  els.gmBadge.textContent = stateBag.gmUnlocked ? "GM 已解锁" : "玩家模式";
  els.gmBadge.classList.toggle("enabled", stateBag.gmUnlocked);

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === stateBag.tab);
  });

  const actors = availableActors();
  if (!stateBag.gmUnlocked && stateBag.actorId && !actors.some((actor) => actor.id === stateBag.actorId)) {
    stateBag.actorId = "";
    localStorage.removeItem("kokubayashi.actorId");
  }
  const hideIdentityPicker = !stateBag.gmUnlocked;
  const identityLabel = document.querySelector("label[for='actor-select']");
  if (identityLabel) identityLabel.hidden = hideIdentityPicker;
  els.actorSelect.hidden = hideIdentityPicker;
  els.actorPreview.hidden = hideIdentityPicker;
  els.actorSelect.innerHTML = actors.length
    ? `${stateBag.gmUnlocked ? "" : `<option value="">未选择账号</option>`}${actors.map((actor) => `<option value="${actor.id}">${escapeHtml(actor.name)} ${escapeHtml(actor.handle)}</option>`).join("")}`
    : `<option value="">创建玩家账号后使用</option>`;
  els.actorSelect.value = stateBag.actorId;
  els.actorPreview.innerHTML = renderActorPreview(getActor(stateBag.actorId));
  els.accountTools.innerHTML = renderAccountTools();
}

function renderFeed() {
  const posts = [...stateBag.data.posts].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const actor = currentActor();
  els.viewRoot.innerHTML = `
    <div class="feed-layout">
      <section class="composer">
        <textarea id="post-content" maxlength="280" placeholder="${actor ? "现在发生了什么？" : "先创建玩家账号"}" ${actor ? "" : "disabled"}></textarea>
        <div class="message-tools post-tools">
          ${renderEmojiBar("post-content")}
          <label class="file-picker">图片
            <input id="post-image" type="file" accept="image/*" ${actor ? "" : "disabled"}>
          </label>
          <span id="post-image-hint" class="hint">未选择图片</span>
        </div>
        <div class="composer-actions">
          <div class="hint">${escapeHtml(stateBag.data.settings.gameTime)} · ${escapeHtml(actor?.name || "未选择账号")}</div>
          <button class="primary-button" type="button" data-action="publish-post" ${actor ? "" : "disabled"}>发布</button>
        </div>
      </section>
      <section class="post-list" aria-label="SNS 时间线">
        ${posts.map(renderPost).join("") || `<div class="panel empty-panel">时间线还是空的。</div>`}
      </section>
    </div>
  `;
}

function renderBulletins() {
  const bulletins = [...(stateBag.data.bulletins || [])]
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
  const adminTools = stateBag.gmUnlocked ? `
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
  const author = getActor(post.authorId);
  const replies = post.replies || [];
  const admin = stateBag.gmUnlocked ? `
    <div class="admin-box">
      <div class="admin-row">
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
        <button class="profile-link author-line" type="button" data-action="view-profile" data-character-id="${author?.id || ""}" ${author ? "" : "disabled"}>
          ${renderAvatar(author)}
          <div class="name-block">
            <div class="name">${escapeHtml(author?.name || "未知")}</div>
            <div class="handle">${escapeHtml(author?.handle || "")} · ${escapeHtml(post.gameTime)}</div>
          </div>
        </button>
      </header>
      <div class="post-content">${formatText(post.content)}</div>
      ${post.attachment?.type === "image" ? renderImageAttachment(post.attachment, "post-image") : ""}
      <div class="post-actions">
        <button class="metric-button" type="button" data-action="like-post" data-post-id="${post.id}">喜欢 ${post.metrics.likes}</button>
        <span>转发 ${post.metrics.reposts}</span>
        <span>浏览 ${post.metrics.views}</span>
      </div>
      ${replies.length ? `<div class="reply-list">${replies.map((reply) => renderReply(post.id, reply)).join("")}</div>` : ""}
      <div class="reply-composer">
        <textarea id="reply-${post.id}" maxlength="240" placeholder="回复"></textarea>
        ${renderEmojiBar(`reply-${post.id}`)}
        <div class="reply-actions">
          <button class="secondary-button" type="button" data-action="reply-post" data-post-id="${post.id}">回复</button>
        </div>
      </div>
      ${admin}
    </article>
  `;
}

function renderReply(postId, reply) {
  const author = getActor(reply.authorId);
  return `
    <div class="reply">
      <button class="profile-avatar-button" type="button" data-action="view-profile" data-character-id="${author?.id || ""}" ${author ? "" : "disabled"}>
        ${renderAvatar(author)}
      </button>
      <div class="reply-body">
        <div class="meta">
          <button class="inline-profile-link" type="button" data-action="view-profile" data-character-id="${author?.id || ""}" ${author ? "" : "disabled"}>
            <strong>${escapeHtml(author?.name || "未知")}</strong>
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
  if (stateBag.gmUnlocked) return "";
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

  els.viewRoot.innerHTML = `
    <div class="chat-layout">
      <aside class="room-list">
        ${renderPlayerChatTools()}
        ${chats.map((chat) => `
          <button class="room-button ${chat.id === stateBag.activeChatId ? "active" : ""}" type="button" data-action="select-chat" data-chat-id="${chat.id}">
            <div class="name">${escapeHtml(chat.name)}</div>
            <div class="meta">${chat.memberIds.length} 人 · ${chat.type === "direct" ? "私聊" : "群聊"}</div>
          </button>
        `).join("") || `<div class="hint">没有可见聊天。</div>`}
      </aside>
      <section class="thread">
        <header class="thread-header">
          <div>
            <div class="section-title">${escapeHtml(active?.name || "聊天")}</div>
            <div class="meta member-links">${renderMemberProfileLinks(active)}</div>
          </div>
          ${canDeleteChat(active) ? `<button class="danger-button compact-action" type="button" data-action="delete-chat" data-chat-id="${escapeAttr(active.id)}">删除聊天</button>` : ""}
        </header>
        <div class="messages" id="messages">
          ${messages.map(renderMessage).join("") || `<div class="hint">这里还没有消息。</div>`}
        </div>
        <div class="message-form">
          <textarea id="message-content" maxlength="500" placeholder="发送消息"></textarea>
          <div class="message-tools">
            ${renderEmojiBar("message-content")}
            <label class="checkbox-line compact-checkbox">
              <input id="message-anonymous" type="checkbox">
              <span>匿名发送</span>
            </label>
            <label class="file-picker">图片
              <input id="message-image" type="file" accept="image/*">
            </label>
            <span id="message-image-hint" class="hint">未选择图片</span>
          </div>
          <button class="primary-button" type="button" data-action="send-message">发送</button>
        </div>
      </section>
    </div>
  `;

  const messageBox = document.getElementById("messages");
  if (messageBox) messageBox.scrollTop = messageBox.scrollHeight;
}

function renderMessage(message) {
  const isAnonymous = message.isAnonymous === true;
  const author = getActor(message.authorId);
  const profileId = isAnonymous && !stateBag.gmUnlocked ? "" : author?.id || "";
  const displayName = isAnonymous
    ? (stateBag.gmUnlocked && author ? `匿名（${author.name}）` : "匿名")
    : (author?.name || "未知");
  const mine = !isAnonymous && author?.id === stateBag.actorId;
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
        ${stateBag.gmUnlocked ? `<button class="danger-button message-delete" type="button" data-action="delete-message" data-message-id="${message.id}">删除</button>` : ""}
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
            const eventCount = (day.events || []).length;
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
  const events = day?.events || [];
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
  if (stateBag.gmUnlocked) {
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
  if (stateBag.gmUnlocked) {
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

function renderGmInbox() {
  const pendingFollows = (stateBag.data.relationships || []).filter((item) => item.status === "pending");
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

function renderGm() {
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
            <div class="hint">${chars.length} 个 active 角色</div>
          </div>
          <button class="danger-button compact-action" type="button" data-action="delete-all-characters" ${chars.length ? "" : "disabled"}>删除全部角色</button>
        </div>
        <div class="roster">
          ${chars.map((character) => `
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
          `).join("")}
        </div>
      </section>
    </div>
  `;
}

async function publishPost() {
  if (!currentActor()) return showNotice("请先创建或选择玩家账号。");
  const textarea = document.getElementById("post-content");
  const content = textarea?.value.trim();
  const imageInput = document.getElementById("post-image");
  const imageFile = imageInput?.files?.[0];
  const attachment = imageFile
    ? { type: "image", dataUrl: await fileToImageDataUrl(imageFile, 1400, 0.86, 8500000), name: imageFile.name }
    : null;
  if (!content && !attachment) return showNotice("帖子内容或图片为空。");
  await api("/api/feed/posts", {
    method: "POST",
    body: { authorId: stateBag.actorId, content, attachment }
  });
  textarea.value = "";
  if (imageInput) imageInput.value = "";
  const hint = document.getElementById("post-image-hint");
  if (hint) hint.textContent = "未选择图片";
  await refresh(true);
}

async function likePost(postId) {
  await api(`/api/feed/posts/${encodeURIComponent(postId)}/like`, { method: "POST" });
  await refresh(true);
}

async function replyPost(postId) {
  if (!currentActor()) return showNotice("请先创建或选择玩家账号。");
  const textarea = document.getElementById(`reply-${postId}`);
  const content = textarea?.value.trim();
  if (!content) return showNotice("回复内容为空。");
  await api(`/api/feed/posts/${encodeURIComponent(postId)}/replies`, {
    method: "POST",
    body: { authorId: stateBag.actorId, content }
  });
  textarea.value = "";
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
  await api(`/api/feed/posts/${encodeURIComponent(postId)}`, {
    method: "PATCH",
    body: { gameTime, metrics: { likes, reposts, views } },
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
  if ((stateBag.gmUnlocked || options.admin) && stateBag.gmPin) headers["X-GM-PIN"] = stateBag.gmPin;
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
  if (stateBag.gmUnlocked) return chars;
  const ownedIds = new Set(Object.keys(stateBag.accountTokens));
  return chars.filter((item) => item.type === "account" && ownedIds.has(item.id));
}

function visibleChats() {
  const chats = stateBag.data?.chats || [];
  if (stateBag.gmUnlocked) return chats;
  if (!stateBag.actorId) return chats.filter((chat) => chat.isPublic);
  return chats.filter((chat) => chat.isPublic || chat.memberIds.includes(stateBag.actorId));
}

function canDeleteChat(chat) {
  if (!chat) return false;
  if (stateBag.gmUnlocked) return true;
  return chat.isPublic !== true && chat.createdBy === stateBag.actorId;
}

function canDeleteReply(reply) {
  if (!reply) return false;
  if (stateBag.gmUnlocked) return true;
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
  if (!stateBag.actorId) return null;
  if (stateBag.gmUnlocked) return getActor(stateBag.actorId);
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

function formatText(value) {
  let text = escapeHtml(value);
  const emojis = stateBag.data?.emojis || [];
  for (const emoji of emojis) {
    const token = `:${emoji.shortcode}:`;
    const escapedToken = escapeRegExp(escapeHtml(token));
    text = text.replace(new RegExp(escapedToken, "g"), `<img class="inline-emoji" src="${escapeAttr(emoji.imageData)}" alt="${escapeAttr(token)}">`);
  }
  return text.replace(/\n/g, "<br>");
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
  const tags = characterTags(actor);
  if (!tags.length) return "";
  return `<span class="tag-list">${tags.map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("")}</span>`;
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
  try {
    return JSON.parse(localStorage.getItem("kokubayashi.accountTokens") || "{}");
  } catch {
    return {};
  }
}

function saveAccountTokens() {
  localStorage.setItem("kokubayashi.accountTokens", JSON.stringify(stateBag.accountTokens));
}

function currentAccountToken() {
  return stateBag.accountTokens[stateBag.actorId] || "";
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
