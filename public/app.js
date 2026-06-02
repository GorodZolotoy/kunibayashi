const stateBag = {
  data: null,
  tab: localStorage.getItem("kokubayashi.tab") || "feed",
  actorId: localStorage.getItem("kokubayashi.actorId") || "",
  activeChatId: localStorage.getItem("kokubayashi.chatId") || "",
  gmPin: localStorage.getItem("kokubayashi.gmPin") || "",
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
  brandSubtitle: document.getElementById("brand-subtitle")
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
    const tabButton = event.target.closest("[data-tab]");
    if (tabButton) {
      setTab(tabButton.dataset.tab);
      return;
    }

    const action = event.target.closest("[data-action]");
    if (!action) return;
    await handleAction(action, event);
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
  if (!actors.length) return;
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
  els.actorSelect.innerHTML = actors.map((actor) => `<option value="${actor.id}">${escapeHtml(actor.name)} ${escapeHtml(actor.handle)}</option>`).join("");
  els.actorSelect.value = stateBag.actorId;
  els.actorPreview.innerHTML = renderActorPreview(getActor(stateBag.actorId));
}

function renderFeed() {
  const posts = [...stateBag.data.posts].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  els.viewRoot.innerHTML = `
    <div class="feed-layout">
      <section class="composer">
        <textarea id="post-content" maxlength="280" placeholder="现在发生了什么？"></textarea>
        <div class="composer-actions">
          <div class="hint">${escapeHtml(stateBag.data.settings.gameTime)} · ${escapeHtml(currentActor()?.name || "")}</div>
          <button class="primary-button" type="button" data-action="publish-post">发布</button>
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

function renderChats() {
  const chats = visibleChats();
  const active = chats.find((chat) => chat.id === stateBag.activeChatId);
  const messages = active ? stateBag.data.messages.filter((message) => message.chatId === active.id).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))) : [];

  els.viewRoot.innerHTML = `
    <div class="chat-layout">
      <aside class="room-list">
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
                <span class="type-pill">${character.type === "player" ? "PC" : "NPC"}</span>
              </label>
            `).join("")}
          </div>
          <button class="primary-button" type="button" data-action="create-chat">创建群聊</button>
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
              <span class="type-pill">${character.type === "player" ? "PC" : "NPC"}</span>
            </div>
          `).join("")}
        </div>
      </section>
    </div>
  `;
}

async function publishPost() {
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
  const textarea = document.getElementById("message-content");
  const content = textarea?.value.trim();
  if (!content) return showNotice("消息内容为空。");
  await api("/api/messages", {
    method: "POST",
    body: { chatId: stateBag.activeChatId, authorId: stateBag.actorId, content }
  });
  textarea.value = "";
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

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (options.admin) headers["X-GM-PIN"] = stateBag.gmPin;
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
  const players = chars.filter((item) => item.type === "player");
  return players.length ? players : chars;
}

function visibleChats() {
  const chats = stateBag.data?.chats || [];
  if (stateBag.gmUnlocked) return chats;
  if (!stateBag.actorId) return chats.filter((chat) => chat.isPublic);
  return chats.filter((chat) => chat.isPublic || chat.memberIds.includes(stateBag.actorId));
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
  return `<div class="avatar" style="background:${escapeAttr(color)}">${escapeHtml(text)}</div>`;
}

function renderActorPreview(actor) {
  if (!actor) return "";
  return `
    ${renderAvatar(actor)}
    <div class="name-block">
      <div class="name">${escapeHtml(actor.name)}</div>
      <div class="handle">${escapeHtml(actor.handle)} · ${actor.type === "player" ? "PC" : "NPC"}</div>
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
  return escapeHtml(value).replace(/\n/g, "<br>");
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
