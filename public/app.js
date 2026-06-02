const stateBag = {
  data: null,
  tab: localStorage.getItem("kokubayashi.tab") || "feed",
  actorId: localStorage.getItem("kokubayashi.actorId") || "",
  activeChatId: localStorage.getItem("kokubayashi.chatId") || "",
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
  chats: "聊天",
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
    if (event.target?.id === "message-image") {
      const hint = document.getElementById("message-image-hint");
      if (hint) hint.textContent = event.target.files?.[0]?.name || "未选择图片";
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
  if (action === "save-post") return savePost(target.dataset.postId);
  if (action === "delete-post") return deletePost(target.dataset.postId);
  if (action === "select-chat") return selectChat(target.dataset.chatId);
  if (action === "send-message") return sendMessage();
  if (action === "unlock-gm") return unlockGm();
  if (action === "lock-gm") return lockGm();
  if (action === "save-settings") return saveSettings();
  if (action === "create-character") return createCharacter();
  if (action === "create-chat") return createChat();
  if (action === "create-player-account") return createPlayerAccount();
  if (action === "login-player-account") return loginPlayerAccount();
  if (action === "update-avatar") return updateAvatar();
  if (action === "upload-emoji") return uploadEmoji();
  if (action === "insert-emoji") return insertEmoji(target.dataset.target, target.dataset.value);
  if (action === "request-follow") return requestFollow();
  if (action === "approve-follow") return updateFollow(target.dataset.followId, "accepted");
  if (action === "reject-follow") return updateFollow(target.dataset.followId, "rejected");
  if (action === "open-direct-chat") return openDirectChat();
  if (action === "create-player-chat") return createPlayerPrivateChat();
}

async function refresh(forceRender) {
  const data = await api("/api/state");
  stateBag.data = data;
  ensureActor();
  ensureChat();
  if (forceRender || true) render();
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
  if (stateBag.tab === "chats") renderChats();
  if (stateBag.tab === "gm") renderGm();
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
  els.actorSelect.innerHTML = actors.length
    ? actors.map((actor) => `<option value="${actor.id}">${escapeHtml(actor.name)} ${escapeHtml(actor.handle)}</option>`).join("")
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
        ${renderEmojiBar("post-content")}
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
        <div class="author-line">
          ${renderAvatar(author)}
          <div class="name-block">
            <div class="name">${escapeHtml(author?.name || "Unknown")}</div>
            <div class="handle">${escapeHtml(author?.handle || "")} · ${escapeHtml(post.gameTime)}</div>
          </div>
        </div>
      </header>
      <div class="post-content">${formatText(post.content)}</div>
      <div class="post-actions">
        <button class="metric-button" type="button" data-action="like-post" data-post-id="${post.id}">喜欢 ${post.metrics.likes}</button>
        <span>转发 ${post.metrics.reposts}</span>
        <span>浏览 ${post.metrics.views}</span>
      </div>
      ${replies.length ? `<div class="reply-list">${replies.map(renderReply).join("")}</div>` : ""}
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

function renderReply(reply) {
  const author = getActor(reply.authorId);
  return `
    <div class="reply">
      ${renderAvatar(author)}
      <div>
        <div class="meta"><strong>${escapeHtml(author?.name || "Unknown")}</strong> · ${escapeHtml(reply.gameTime)}</div>
        <div class="reply-content">${formatText(reply.content)}</div>
      </div>
    </div>
  `;
}

function renderPlayerChatTools() {
  if (stateBag.gmUnlocked) return "";
  const actor = currentActor();
  if (!actor) {
    return `
      <div class="chat-tools-panel">
        <div class="mini-title">私聊 / 关注</div>
        <div class="hint">先创建或登录玩家账号。</div>
      </div>
    `;
  }

  const candidates = contactCandidates();
  const contacts = acceptedContacts();
  const targetOptions = candidates.map((character) => `
    <option value="${character.id}">${escapeHtml(character.name)} ${escapeHtml(character.handle)} - ${relationshipLabel(character.id)}</option>
  `).join("");
  const memberOptions = contacts.map((character) => `
    <label class="member-option compact">
      <input type="checkbox" class="private-member-checkbox" value="${character.id}">
      <span>${escapeHtml(character.name)}</span>
      <span class="type-pill">${typeLabel(character)}</span>
    </label>
  `).join("");

  return `
    <div class="chat-tools-panel">
      <div class="mini-title">私聊 / 关注</div>
      <select id="follow-target" ${candidates.length ? "" : "disabled"}>
        ${targetOptions || `<option value="">没有可关注账号</option>`}
      </select>
      <div class="form-row tight">
        <button class="secondary-button" type="button" data-action="request-follow" ${candidates.length ? "" : "disabled"}>请求关注</button>
        <button class="primary-button" type="button" data-action="open-direct-chat" ${candidates.length ? "" : "disabled"}>打开私聊</button>
      </div>
      <div class="hint">私聊需要 GM 批准关注后才能开启。</div>
      <div class="mini-title">玩家私密群聊</div>
      <input id="private-chat-name" maxlength="80" placeholder="群聊名称">
      <div class="member-picker compact-picker">
        ${memberOptions || `<div class="hint padded">暂无已批准联系人。</div>`}
      </div>
      <button class="secondary-button" type="button" data-action="create-player-chat" ${contacts.length ? "" : "disabled"}>创建私密群聊</button>
    </div>
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
            <div class="meta">${escapeHtml(memberNames(active).join("、"))}</div>
          </div>
        </header>
        <div class="messages" id="messages">
          ${messages.map(renderMessage).join("") || `<div class="hint">这里还没有消息。</div>`}
        </div>
        <div class="message-form">
          <textarea id="message-content" maxlength="500" placeholder="发送消息"></textarea>
          <div class="message-tools">
            ${renderEmojiBar("message-content")}
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
  const author = getActor(message.authorId);
  const mine = author?.id === stateBag.actorId;
  return `
    <div class="message-row ${mine ? "mine" : ""}">
      ${renderAvatar(author)}
      <div class="message-bubble">
        <div class="meta"><strong>${escapeHtml(author?.name || "Unknown")}</strong> · ${escapeHtml(message.gameTime)}</div>
        ${formatText(message.content)}
        ${message.attachment?.type === "image" ? renderImageAttachment(message.attachment) : ""}
      </div>
    </div>
  `;
}

function renderAccountTools() {
  if (stateBag.gmUnlocked) {
    return `<div class="hint">GM 模式可使用全部角色。</div>`;
  }

  const actor = currentActor();
  const accountForm = `
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
    <div class="mini-form">
      <div class="mini-title">登录已有账号</div>
      <input id="login-handle" maxlength="32" placeholder="@handle">
      <input id="login-passcode" maxlength="80" type="password" placeholder="登录码">
      <button class="secondary-button" type="button" data-action="login-player-account">登录账号</button>
    </div>
  `;

  if (!actor) return accountForm;

  return `
    <div class="mini-form">
      <div class="mini-title">账号设置</div>
      <label class="file-picker">更换头像
        <input id="avatar-update-file" type="file" accept="image/*">
      </label>
      <button class="secondary-button" type="button" data-action="update-avatar">更新头像</button>
    </div>
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
          <div class="name">${escapeHtml(requester?.name || "Unknown")} → ${escapeHtml(target?.name || "Unknown")}</div>
          <div class="handle">${escapeHtml(requester?.handle || "")} wants to follow ${escapeHtml(target?.handle || "")}</div>
        </div>
      </div>
      <div class="form-row tight">
        <button class="primary-button" type="button" data-action="approve-follow" data-follow-id="${relationship.id}">批准</button>
        <button class="danger-button" type="button" data-action="reject-follow" data-follow-id="${relationship.id}">拒绝</button>
      </div>
    </div>
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
          <a class="secondary-button export-link" href="/api/export.md" target="_blank" rel="noreferrer">导出 Markdown</a>
        </div>
      </section>

      <section>
        <div class="section-title">新增角色</div>
        <div class="form-grid">
          <div class="two-col">
            <label>名称 <input id="new-character-name"></label>
            <label>Handle <input id="new-character-handle" placeholder="@handle"></label>
          </div>
          <label>类型
            <select id="new-character-type">
              <option value="npc">NPC</option>
              <option value="player">玩家</option>
            </select>
          </label>
          <button class="primary-button" type="button" data-action="create-character">创建角色</button>
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
                <span class="type-pill">${typeLabel(character)}</span>
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

      <section>
        <div class="section-title">角色名册</div>
        <div class="roster">
          ${chars.map((character) => `
            <div class="roster-row">
              ${renderAvatar(character)}
              <div class="name-block">
                <div class="name">${escapeHtml(character.name)}</div>
                <div class="handle">${escapeHtml(character.handle)}</div>
              </div>
              <span class="type-pill">${typeLabel(character)}</span>
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
  if (!content) return showNotice("帖子内容为空。");
  await api("/api/feed/posts", {
    method: "POST",
    body: { authorId: stateBag.actorId, content }
  });
  textarea.value = "";
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

function selectChat(chatId) {
  stateBag.activeChatId = chatId;
  localStorage.setItem("kokubayashi.chatId", chatId);
  renderChats();
}

async function sendMessage() {
  if (!currentActor()) return showNotice("请先创建或选择玩家账号。");
  const textarea = document.getElementById("message-content");
  const content = textarea?.value.trim();
  const imageInput = document.getElementById("message-image");
  const imageFile = imageInput?.files?.[0];
  const attachment = imageFile
    ? { type: "image", dataUrl: await fileToImageDataUrl(imageFile, 1400, 0.86, 8500000), name: imageFile.name }
    : null;
  if (!content && !attachment) return showNotice("消息内容或图片为空。");
  await api("/api/messages", {
    method: "POST",
    body: { chatId: stateBag.activeChatId, authorId: stateBag.actorId, content, attachment }
  });
  textarea.value = "";
  if (imageInput) imageInput.value = "";
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

async function createCharacter() {
  const name = document.getElementById("new-character-name")?.value.trim();
  if (!name) return showNotice("角色名为空。");
  await api("/api/characters", {
    method: "POST",
    admin: true,
    body: {
      name,
      handle: document.getElementById("new-character-handle")?.value,
      type: document.getElementById("new-character-type")?.value
    }
  });
  await refresh(true);
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
  const handle = document.getElementById("login-handle")?.value.trim();
  const passcode = document.getElementById("login-passcode")?.value.trim();
  if (!handle || !passcode) return showNotice("请输入 handle 和登录码。");
  const result = await api("/api/player-accounts/login", {
    method: "POST",
    body: { handle, passcode }
  });
  stateBag.accountTokens[result.accountId] = result.accountToken;
  saveAccountTokens();
  stateBag.actorId = result.accountId;
  localStorage.setItem("kokubayashi.actorId", stateBag.actorId);
  stateBag.data = result.state;
  showNotice("账号已登录。");
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

async function requestFollow() {
  if (!currentActor()) return showNotice("请先创建或登录玩家账号。");
  const targetId = document.getElementById("follow-target")?.value;
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

async function openDirectChat() {
  if (!currentActor()) return showNotice("请先创建或登录玩家账号。");
  const targetId = document.getElementById("follow-target")?.value;
  if (!targetId) return showNotice("请选择私聊对象。");
  const result = await api("/api/direct-chats", {
    method: "POST",
    body: { requesterId: stateBag.actorId, targetId }
  });
  stateBag.data = result.state;
  stateBag.activeChatId = result.chatId;
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

function contactCandidates() {
  const actor = currentActor();
  if (!actor) return [];
  return (stateBag.data?.characters || [])
    .filter((character) => character.active !== false && character.id !== actor.id);
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
  const actor = currentActor();
  if (!actor || !targetId) return "未关注";
  const relationships = stateBag.data?.relationships || [];
  if (canDirectMessageClient(actor.id, targetId)) return "已批准";
  const outgoing = relationships.find((item) => item.requesterId === actor.id && item.targetId === targetId && item.status === "pending");
  if (outgoing) return "等待 GM";
  const incoming = relationships.find((item) => item.requesterId === targetId && item.targetId === actor.id && item.status === "pending");
  if (incoming) return "对方请求中";
  const rejected = relationships.find((item) => (
    item.status === "rejected" &&
    (
      (item.requesterId === actor.id && item.targetId === targetId) ||
      (item.requesterId === targetId && item.targetId === actor.id)
    )
  ));
  return rejected ? "曾被拒绝" : "未关注";
}

function currentActor() {
  return getActor(stateBag.actorId);
}

function getActor(id) {
  return stateBag.data?.characters?.find((item) => item.id === id);
}

function memberNames(chat) {
  if (!chat) return [];
  return chat.memberIds.map((id) => getActor(id)?.name).filter(Boolean).slice(0, 8);
}

function renderAvatar(actor) {
  const color = actor?.color || "#687075";
  const text = actor?.avatarText || "?";
  if (actor?.avatarData) {
    return `<div class="avatar" style="background:${escapeAttr(color)}"><img class="avatar-img" src="${escapeAttr(actor.avatarData)}" alt="${escapeAttr(actor.name)}"></div>`;
  }
  return `<div class="avatar" style="background:${escapeAttr(color)}">${escapeHtml(text)}</div>`;
}

function renderActorPreview(actor) {
  if (!actor) return "";
  return `
    ${renderAvatar(actor)}
      <div class="name-block">
        <div class="name">${escapeHtml(actor.name)}</div>
      <div class="handle">${escapeHtml(actor.handle)} · ${typeLabel(actor)}</div>
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

function renderImageAttachment(attachment) {
  return `
    <figure class="chat-image">
      <img src="${escapeAttr(attachment.dataUrl)}" alt="${escapeAttr(attachment.name || "image")}">
      <figcaption>${escapeHtml(attachment.name || "image")}</figcaption>
    </figure>
  `;
}

function typeLabel(actor) {
  if (actor?.type === "account") return "账号";
  if (actor?.type === "player") return "PC";
  return "NPC";
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
