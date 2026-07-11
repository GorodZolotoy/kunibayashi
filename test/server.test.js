const test = require("node:test");
const assert = require("node:assert/strict");

const {
  advanceTimelineGameTime,
  buildPlayerAccount,
  normalizeState,
  publicState,
  publicStatePatch,
  verifyPasscode
} = require("../server");

function sampleState() {
  const now = "2026-04-01T00:00:00.000Z";
  const state = normalizeState({
    version: 8,
    updatedAt: now,
    sectionVersions: {},
    settings: {
      gameTime: "4月1日 18:00",
      schoolDay: "4月1日 周一",
      currentDayId: "day_001",
      feedName: "SNS",
      chatName: "K-LINE"
    },
    characters: [
      {
        id: "account_a",
        name: "A",
        handle: "@a",
        username: "login-a",
        type: "account",
        note: "GM only",
        tags: ["玩家账号", "1-A"],
        auth: { salt: "salt", passcodeHash: "hash", sessions: [] },
        active: true
      },
      {
        id: "account_b",
        name: "B",
        handle: "@b",
        username: "login-b",
        type: "account",
        tags: [],
        auth: { salt: "salt", passcodeHash: "hash", sessions: [] },
        active: true
      },
      {
        id: "npc_c",
        name: "C",
        handle: "@c",
        type: "npc",
        note: "Secret NPC note",
        tags: ["NPC", "学生会"],
        active: true
      }
    ],
    chats: [
      { id: "public", name: "Public", type: "group", memberIds: [], isPublic: true, createdAt: now },
      { id: "private_a", name: "Private A", type: "direct", memberIds: ["account_a", "account_b"], isPublic: false, createdAt: now },
      { id: "private_b", name: "Private B", type: "direct", memberIds: ["account_b", "npc_c"], isPublic: false, createdAt: now }
    ],
    messages: [
      { id: "m_public", chatId: "public", authorId: "npc_c", content: "public", createdAt: now },
      { id: "m_a", chatId: "private_a", authorId: "account_a", content: "visible to A", isAnonymous: true, createdAt: now },
      { id: "m_secret", chatId: "private_b", authorId: "account_b", content: "secret", createdAt: now }
    ],
    posts: [
      {
        id: "post_1",
        authorId: "account_b",
        content: "anonymous post",
        isAnonymous: true,
        likedBy: ["account_a"],
        metrics: { likes: 1, reposts: 0, views: 1 },
        replies: [{ id: "reply_1", authorId: "account_a", content: "reply", isAnonymous: true, createdAt: now }],
        createdAt: now
      }
    ],
    bulletins: [
      { id: "visible", title: "Visible", content: "", isPublic: true, createdAt: now },
      { id: "hidden", title: "Hidden", content: "", isPublic: false, createdAt: now }
    ],
    emojis: [],
    relationships: [
      { id: "rel_a", requesterId: "account_a", targetId: "account_b", status: "accepted", createdAt: now },
      { id: "rel_secret", requesterId: "account_b", targetId: "npc_c", status: "pending", createdAt: now }
    ],
    chatMemberRequests: [],
    auditLog: [],
    undoStack: []
  });
  for (const section of Object.keys(state.sectionVersions)) state.sectionVersions[section] = now;
  return state;
}

test("player state hides inaccessible chats, messages, and immersion metadata", () => {
  const view = publicState(sampleState(), { viewerId: "account_a", adminView: false });

  assert.deepEqual(view.chats.map((chat) => chat.id), ["public", "private_a"]);
  assert.deepEqual(view.messages.map((message) => message.id), ["m_public", "m_a"]);
  assert.equal(view.messages.find((message) => message.id === "m_a").authorId, "");
  assert.equal(view.messages.find((message) => message.id === "m_a").viewerOwnsMessage, true);
  assert.deepEqual(view.relationships.map((relationship) => relationship.id), ["rel_a"]);
  assert.deepEqual(view.bulletins.map((bulletin) => bulletin.id), ["visible"]);

  const account = view.characters.find((character) => character.id === "account_a");
  const npc = view.characters.find((character) => character.id === "npc_c");
  assert.equal(account.username, undefined);
  assert.equal(account.type, undefined);
  assert.equal(account.note, undefined);
  assert.deepEqual(account.tags, ["1-A"]);
  assert.deepEqual(npc.tags, ["学生会"]);

  assert.equal(view.posts[0].authorId, "");
  assert.equal(view.posts[0].likedBy, undefined);
  assert.equal(view.posts[0].viewerHasLiked, true);
  assert.equal(view.posts[0].replies[0].authorId, "");
  assert.equal(view.posts[0].replies[0].viewerOwnsReply, true);
});

test("logged-out state contains only public chat data", () => {
  const view = publicState(sampleState(), { viewerId: "", adminView: false });
  assert.deepEqual(view.chats.map((chat) => chat.id), ["public"]);
  assert.deepEqual(view.messages.map((message) => message.id), ["m_public"]);
  assert.deepEqual(view.relationships, []);
});

test("admin state keeps management metadata but strips credentials", () => {
  const view = publicState(sampleState(), { adminView: true });
  assert.equal(view.chats.length, 3);
  assert.equal(view.messages.length, 3);
  assert.equal(view.characters[0].type, "account");
  assert.equal(view.characters[0].username, "login-a");
  assert.equal(view.characters[0].auth, undefined);
});

test("incremental state response includes only changed sections", () => {
  const state = sampleState();
  const old = "2026-04-01T00:00:00.000Z";
  const next = "2026-04-01T00:01:00.000Z";
  for (const section of Object.keys(state.sectionVersions)) state.sectionVersions[section] = old;
  state.sectionVersions.messages = next;
  state.updatedAt = next;

  const response = publicStatePatch(state, "2026-04-01T00:00:30.000Z", { viewerId: "account_a", adminView: false });
  assert.equal(response.changed, true);
  assert.ok(Array.isArray(response.patch.messages));
  assert.equal(response.patch.calendarDays, undefined);
  assert.equal(response.patch.characters, undefined);
});

test("player polling ignores GM-only section changes", () => {
  const state = sampleState();
  const next = "2026-04-01T00:01:00.000Z";
  state.sectionVersions.auditLog = next;
  state.updatedAt = next;

  const playerResponse = publicStatePatch(state, "2026-04-01T00:00:30.000Z", { viewerId: "account_a", adminView: false });
  const adminResponse = publicStatePatch(state, "2026-04-01T00:00:30.000Z", { adminView: true });

  assert.equal(playerResponse.changed, false);
  assert.equal(adminResponse.changed, true);
  assert.ok(Array.isArray(adminResponse.patch.auditLog));
});

test("timeline auto-advance rolls over to the next calendar day", () => {
  const state = sampleState();
  state.settings.gameTime = "4月1日 23:59";
  state.settings.currentDayId = "day_001";
  advanceTimelineGameTime(state);
  assert.equal(state.settings.currentDayId, "day_002");
  assert.match(state.settings.gameTime, /00:0[0-4]/);
});

test("new accounts use scrypt and retain a hashed multi-device session", () => {
  const state = sampleState();
  const result = buildPlayerAccount(state, {
    name: "New Player",
    username: "new-player",
    handle: "@new_player",
    passcode: "correct horse battery staple"
  }, false);

  assert.equal(result.error, undefined);
  assert.equal(result.character.accessToken, undefined);
  assert.equal(result.character.auth.algorithm, "scrypt");
  assert.equal(result.character.auth.sessions.length, 1);
  assert.equal(result.character.auth.sessions[0].tokenHash.length, 64);
  assert.equal(verifyPasscode("correct horse battery staple", result.character.auth), true);
  assert.equal(verifyPasscode("wrong password", result.character.auth), false);
});

test("version 9 normalization adds SNS and session-control collections", () => {
  const state = normalizeState({ settings: {}, characters: [], chats: [], posts: [], messages: [] });

  assert.equal(state.version, 9);
  assert.equal(state.settings.sessionControl.signupEnabled, true);
  assert.equal(state.settings.sessionControl.messageEditWindowMinutes, 15);
  for (const key of ["notifications", "scheduledItems", "presence", "moderation", "bookmarks", "gmNotes", "platformEvents"]) {
    assert.ok(Array.isArray(state[key]), `${key} should be an array`);
  }
  assert.equal(typeof state.systemStatus.offsiteBackup.configured, "boolean");
});

test("player view projects private SNS data without leaking GM queues or voter identities", () => {
  const state = sampleState();
  state.messages[0].reactions = { "👍": ["account_a", "account_b"] };
  state.posts[0].poll = {
    question: "Lunch?",
    multiple: false,
    closed: false,
    options: [
      { id: "rice", text: "Rice", voterIds: ["account_a"] },
      { id: "bread", text: "Bread", voterIds: ["account_b"] }
    ]
  };
  state.notifications = [
    { id: "for_a", recipientId: "account_a", type: "mention", text: "A notification", createdAt: state.updatedAt },
    { id: "for_b", recipientId: "account_b", type: "mention", text: "B notification", createdAt: state.updatedAt }
  ];
  state.moderation = [
    { id: "mute_a", actorId: "account_a", targetId: "unknown_a", type: "mute", createdAt: state.updatedAt },
    { id: "mute_b", actorId: "account_b", targetId: "unknown_b", type: "mute", createdAt: state.updatedAt }
  ];
  state.bookmarks = [
    { id: "bookmark_a", actorId: "account_a", postId: "post_1", createdAt: state.updatedAt },
    { id: "bookmark_b", actorId: "account_b", postId: "post_1", createdAt: state.updatedAt }
  ];
  state.scheduledItems = [{ id: "scheduled", type: "post", status: "pending", payload: { content: "secret" } }];
  state.gmNotes = [{ id: "note", targetType: "character", targetId: "account_a", content: "secret" }];
  state.platformEvents = [
    { id: "all", type: "notice", title: "All", message: "Visible", active: true, affectedActorIds: [] },
    { id: "only_b", type: "notice", title: "B", message: "Hidden", active: true, affectedActorIds: ["account_b"] }
  ];

  const view = publicState(state, { viewerId: "account_a", adminView: false });
  const publicMessage = view.messages.find((message) => message.id === "m_public");
  const poll = view.posts[0].poll;

  assert.deepEqual(view.notifications.map((notification) => notification.id), ["for_a"]);
  assert.deepEqual(view.moderation.map((entry) => entry.id), ["mute_a"]);
  assert.deepEqual(view.bookmarks.map((entry) => entry.bookmarkId), ["bookmark_a"]);
  assert.deepEqual(view.scheduledItems, []);
  assert.deepEqual(view.gmNotes, []);
  assert.deepEqual(view.systemStatus, {});
  assert.deepEqual(view.platformEvents.map((event) => event.id), ["all"]);
  assert.deepEqual(publicMessage.reactions["👍"], { count: 2, viewerReacted: true });
  assert.equal(poll.options[0].count, 1);
  assert.equal(poll.options[0].viewerVoted, true);
  assert.equal(poll.options[0].voterIds, undefined);
});
