const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "kunibayashi-api-"));
process.env.DATA_DIR = testDataDir;
process.env.PORT = "0";
process.env.HOST = "127.0.0.1";
process.env.GM_PIN = "api-test-pin";
process.env.NODE_ENV = "test";

const { startServer } = require("../server");

test("SNS, integrated chat, scheduling, presence, and session APIs work together", async (t) => {
  const server = startServer();
  if (!server.listening) await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(testDataDir, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const adminHeaders = { "Content-Type": "application/json", "X-GM-PIN": "api-test-pin" };
  const request = async (route, method = "GET", body) => {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: adminHeaders,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json();
    assert.equal(response.ok, true, `${method} ${route}: ${payload.error || response.status}`);
    return payload;
  };

  let state = await request("/api/state");
  const actors = state.characters.filter((character) => character.active !== false).slice(0, 2);
  assert.equal(actors.length, 2);
  const [author, participant] = actors;

  const postIdsBefore = new Set(state.posts.map((post) => post.id));
  state = await request("/api/feed/posts", "POST", {
    authorId: author.id,
    content: "API integration post #qa",
    poll: { question: "Choose", options: [{ text: "A" }, { text: "B" }] }
  });
  const post = state.posts.find((entry) => !postIdsBefore.has(entry.id));
  assert.ok(post?.poll);

  state = await request(`/api/feed/posts/${post.id}/bookmark`, "POST", { actorId: participant.id });
  assert.equal(state.bookmarks.some((bookmark) => bookmark.actorId === participant.id && bookmark.postId === post.id), true);

  const optionId = state.posts.find((entry) => entry.id === post.id).poll.options[0].id;
  state = await request(`/api/feed/posts/${post.id}/vote`, "POST", { actorId: participant.id, optionIds: [optionId] });
  assert.equal(state.posts.find((entry) => entry.id === post.id).poll.options[0].voterIds.includes(participant.id), true);

  const chatName = `API QA ${Date.now()}`;
  state = await request("/api/chats", "POST", { name: chatName, memberIds: actors.map((actor) => actor.id), isPublic: false });
  const chat = state.chats.find((entry) => entry.name === chatName);
  assert.ok(chat);

  const messageIdsBefore = new Set(state.messages.map((message) => message.id));
  state = await request("/api/messages", "POST", { chatId: chat.id, authorId: author.id, content: "First message" });
  const firstMessage = state.messages.find((message) => !messageIdsBefore.has(message.id));
  assert.ok(firstMessage);

  const currentMessageIds = new Set(state.messages.map((message) => message.id));
  state = await request("/api/messages", "POST", {
    chatId: chat.id,
    authorId: participant.id,
    content: "Quoted reply",
    replyToMessageId: firstMessage.id
  });
  const quotedMessage = state.messages.find((message) => !currentMessageIds.has(message.id));
  assert.equal(quotedMessage.replyToMessageId, firstMessage.id);

  state = await request(`/api/messages/${firstMessage.id}/reaction`, "POST", { actorId: participant.id, reaction: "👍" });
  assert.deepEqual(state.messages.find((message) => message.id === firstMessage.id).reactions["👍"], [participant.id]);

  state = await request(`/api/messages/${firstMessage.id}/pin`, "POST", { actorId: author.id });
  assert.equal(state.chats.find((entry) => entry.id === chat.id).pinnedMessageIds.includes(firstMessage.id), true);

  state = await request(`/api/messages/${firstMessage.id}`, "PATCH", { actorId: author.id, content: "Edited message" });
  assert.equal(state.messages.find((message) => message.id === firstMessage.id).content, "Edited message");

  const currentDayIndex = state.calendarDays.findIndex((day) => day.id === state.settings.currentDayId);
  const futureDay = state.calendarDays[Math.min(currentDayIndex + 1, state.calendarDays.length - 1)];
  state = await request("/api/gm/scheduled-items", "POST", {
    type: "post",
    dayId: futureDay.id,
    gameTime: state.settings.gameTime,
    payload: { authorId: author.id, content: "Scheduled post" }
  });
  const scheduledItem = state.scheduledItems.find((item) => item.status === "pending" && item.payload.content === "Scheduled post");
  assert.ok(scheduledItem);
  state = await request(`/api/gm/scheduled-items/${scheduledItem.id}/run`, "POST");
  assert.equal(state.scheduledItems.find((item) => item.id === scheduledItem.id).status, "completed");
  assert.equal(state.posts.some((entry) => entry.content === "Scheduled post"), true);

  state = await request(`/api/gm/presence/${author.id}`, "PATCH", { status: "online", statusText: "In session", typingChatId: chat.id });
  const presence = state.presence.find((entry) => entry.characterId === author.id);
  assert.equal(presence.status, "online");
  assert.equal(presence.typingChatId, chat.id);

  state = await request("/api/gm/platform-events", "POST", { type: "maintenance", title: "QA event", message: "Temporary", active: true });
  assert.equal(state.platformEvents.some((event) => event.title === "QA event" && event.active), true);

  state = await request("/api/gm/session-control", "PATCH", { slowModeSeconds: 3, messageEditWindowMinutes: 20, announcement: "QA session" });
  assert.equal(state.settings.sessionControl.slowModeSeconds, 3);
  assert.equal(state.settings.sessionControl.messageEditWindowMinutes, 20);
  assert.equal(state.settings.sessionControl.announcement, "QA session");
  assert.equal(state.notifications.some((notification) => notification.type === "message_reaction"), true);
});
