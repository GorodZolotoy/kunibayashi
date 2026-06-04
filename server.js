const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const GM_PIN = process.env.GM_PIN || "gm";
const MAX_JSON_BODY_BYTES = 24 * 1024 * 1024;
const MAX_AVATAR_DATA_URL_LENGTH = 2500000;
const MAX_EMOJI_DATA_URL_LENGTH = 1000000;
const MAX_POST_IMAGE_DATA_URL_LENGTH = 9000000;
const MAX_CHAT_IMAGE_DATA_URL_LENGTH = 9000000;
const MAX_POST_CONTENT_LENGTH = 2000;
const MAX_REPLY_CONTENT_LENGTH = 1000;
const MAX_ACCOUNT_IMPORT_COUNT = 120;
const MAX_CHARACTER_IMPORT_COUNT = 200;

let cachedState = null;
const requestContext = new AsyncLocalStorage();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

const PALETTE = [
  "#2b6f6a",
  "#b44c43",
  "#4f6d7a",
  "#8a6f3f",
  "#6f7f51",
  "#8b5a65",
  "#3f7a99",
  "#9a6b3a"
];

const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const SCHOOL_YEAR_MONTHS = [
  { month: 4, days: 30 },
  { month: 5, days: 31 },
  { month: 6, days: 30 },
  { month: 7, days: 31 },
  { month: 8, days: 31 },
  { month: 9, days: 30 },
  { month: 10, days: 31 },
  { month: 11, days: 30 },
  { month: 12, days: 31 },
  { month: 1, days: 31 },
  { month: 2, days: 28 },
  { month: 3, days: 31 }
];

const LEGACY_DAY_IDS = {
  day_mon: "day_001",
  day_tue: "day_002",
  day_wed: "day_003",
  day_thu: "day_004",
  day_fri: "day_005",
  day_sat: "day_006",
  day_sun: "day_007"
};

function ensureState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STATE_FILE)) {
    writeState(createInitialState());
  }
}

function readState() {
  ensureState();
  if (cachedState) return cachedState;
  const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  cachedState = normalizeState(state);
  return cachedState;
}

function writeState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  cachedState = normalizeState(state);
  state = cachedState;
  state.updatedAt = new Date().toISOString();
  const tempFile = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tempFile, STATE_FILE);
}

function createInitialState() {
  const seedState = readSeedState();
  const characters = scanVaultCharacters();
  if (!characters.length && seedState?.characters?.length) {
    return normalizeState({ ...seedState, updatedAt: new Date().toISOString() });
  }

  const seededCharacters = characters.length ? characters : [
    makeCharacter("gm_kokubayashi", "国林学園 連絡網", "school", "npc"),
    makeCharacter("player_sample", "藤原 瀬央", "seao", "player"),
    makeCharacter("npc_kurokawa", "黒川 蓮司", "kurokawa", "npc"),
    makeCharacter("npc_chie", "花園 千绘", "chie", "npc")
  ];

  const playerIds = seededCharacters.filter((item) => item.type === "player").map((item) => item.id);
  const everyone = seededCharacters.map((item) => item.id);
  const firstNpc = seededCharacters.find((item) => item.type !== "player") || seededCharacters[0];
  const firstPlayer = seededCharacters.find((item) => item.type === "player") || seededCharacters[0];

  const firstGroupMembers = unique([
    ...playerIds,
    ...seededCharacters.filter((item) => /黒川|黑川|花園|千绘|千絵|逢坂|湊|渚|結菜|有栖|七海|秋人|真弥|瀬央|神久/.test(item.name)).map((item) => item.id)
  ]);

  const now = new Date().toISOString();

  return {
    version: 1,
    settings: {
      gameTime: "开学首日 18:12",
      schoolDay: "周一",
      currentDayId: "day_mon",
      feedName: "Kokubayashi SNS",
      chatName: "K-LINE"
    },
    characters: seededCharacters,
    chats: [
      {
        id: "chat_1a",
        name: "1-A 放课后群",
        type: "group",
        memberIds: firstGroupMembers.length ? firstGroupMembers : everyone,
        isPublic: true,
        createdAt: now
      },
      {
        id: "chat_dorm",
        name: "寮内闲聊",
        type: "group",
        memberIds: everyone.slice(0, Math.min(everyone.length, 16)),
        isPublic: false,
        createdAt: now
      }
    ],
    calendarDays: defaultCalendarDays(),
    posts: [
      {
        id: id("post"),
        authorId: firstNpc.id,
        content: "放课后の山道、風が少し冷たい。購買前の自販機だけまだ明るい。",
        gameTime: "开学首日 18:04",
        createdAt: now,
        metrics: { likes: 17, reposts: 2, views: 86 },
        replies: [
          {
            id: id("reply"),
            authorId: firstPlayer.id,
            content: "自动贩卖机这时候还有热饮吗？",
            gameTime: "开学首日 18:06",
            createdAt: now
          }
        ]
      }
    ],
    messages: [
      {
        id: id("msg"),
        chatId: "chat_1a",
        authorId: firstNpc.id,
        content: "今晚点名前，把明天体育课要用的运动服先拿出来。别到早上再翻。",
        gameTime: "开学首日 18:12",
        createdAt: now
      }
    ],
    bulletins: [],
    emojis: defaultEmojis(),
    relationships: [],
    auditLog: [],
    undoStack: [],
    updatedAt: now
  };
}

function normalizeState(state) {
  state.version = Math.max(Number(state.version || 1), 7);
  state.updatedAt ||= new Date().toISOString();
  state.settings ||= {};
  state.settings.gameTime ||= "开学首日 18:12";
  state.settings.schoolDay ||= "周一";
  state.settings.currentDayId ||= "day_mon";
  state.settings.feedName ||= "Kokubayashi SNS";
  state.settings.chatName ||= "K-LINE";
  state.settings.autoAdvanceTimelineTime = state.settings.autoAdvanceTimelineTime === true;
  state.characters ||= [];
  state.chats ||= [];
  state.calendarDays ||= defaultCalendarDays();
  state.posts ||= [];
  state.messages ||= [];
  state.bulletins ||= [];
  state.emojis ||= defaultEmojis();
  state.relationships ||= [];
  state.chatMemberRequests ||= [];
  state.auditLog ||= [];
  state.undoStack ||= [];

  for (const character of state.characters) {
    character.avatarText ||= avatarText(character.name);
    character.handle = `@${String(character.handle || makeHandle(character.name)).replace(/^@/, "")}`;
    character.type ||= "npc";
    if (character.type === "account") character.username = normalizeUsername(character.username || character.handle || character.name, character.handle || character.name);
    character.tags = normalizeTags(character.tags);
    character.active = character.active !== false;
  }

  for (const chat of state.chats) {
    chat.memberIds = unique(chat.memberIds || []);
    chat.type ||= "group";
    chat.createdBy ||= "";
    if (chat.id === "chat_1a") chat.isPublic = true;
  }

  state.relationships = state.relationships.map((relationship) => ({
    id: relationship.id || id("rel"),
    requesterId: relationship.requesterId,
    targetId: relationship.targetId,
    status: ["pending", "accepted", "rejected"].includes(relationship.status) ? relationship.status : "pending",
    createdAt: relationship.createdAt || new Date().toISOString(),
    updatedAt: relationship.updatedAt || relationship.createdAt || new Date().toISOString()
  })).filter((relationship) => relationship.requesterId && relationship.targetId);

  state.chatMemberRequests = state.chatMemberRequests.map((request) => ({
    id: request.id || id("chat_req"),
    chatId: request.chatId,
    requesterId: request.requesterId,
    targetId: request.targetId,
    action: request.action === "remove" ? "remove" : "add",
    status: ["pending", "accepted", "rejected"].includes(request.status) ? request.status : "pending",
    createdAt: request.createdAt || new Date().toISOString(),
    updatedAt: request.updatedAt || request.createdAt || new Date().toISOString()
  })).filter((request) => request.chatId && request.requesterId && request.targetId);

  state.settings.currentDayId = normalizeCalendarDayId(state.settings.currentDayId);
  state.calendarDays = normalizeCalendarDays(state.calendarDays);
  if (!state.calendarDays.some((day) => day.id === state.settings.currentDayId)) {
    state.settings.currentDayId = state.calendarDays[0]?.id || "day_001";
  }
  const currentDay = state.calendarDays.find((day) => day.id === state.settings.currentDayId);
  if (currentDay) state.settings.schoolDay = calendarDayDisplay(currentDay);

  for (const post of state.posts) {
    post.gameTime = String(post.gameTime || state.settings.gameTime || "").trim();
    post.createdAt ||= new Date().toISOString();
    post.dayId = inferTimelineDayId(state, post);
    post.timelineSortKey = buildTimelineSortKey(state, post.dayId, post.gameTime);
    post.metrics = normalizeMetrics(post.metrics);
    post.replies ||= [];
    post.isAnonymous = post.isAnonymous === true;
    for (const reply of post.replies) {
      reply.isAnonymous = reply.isAnonymous === true;
      reply.parentReplyId = String(reply.parentReplyId || "").trim();
      reply.gameTime = String(reply.gameTime || state.settings.gameTime || "").trim();
      reply.createdAt ||= new Date().toISOString();
    }
    if (post.imageData && !post.attachment) {
      post.attachment = { type: "image", dataUrl: post.imageData, name: "image" };
      delete post.imageData;
    }
  }

  for (const message of state.messages) {
    message.isAnonymous = message.isAnonymous === true;
    if (message.imageData && !message.attachment) {
      message.attachment = { type: "image", dataUrl: message.imageData, name: "image" };
      delete message.imageData;
    }
  }

  state.bulletins = normalizeBulletins(state.bulletins);
  state.auditLog = normalizeAuditLog(state.auditLog);
  state.undoStack = normalizeUndoStack(state.undoStack);

  return state;
}

function defaultEmojis() {
  return [];
}

function weeklyScheduleTemplates() {
  return [
    [
      ["08:20", "朝会", "1-A 教室", "出席确认"],
      ["09:00", "现代文", "1-A 教室", "课本第 1 章"],
      ["10:10", "数学", "1-A 教室", "小测验"],
      ["11:20", "英语", "1-A 教室", "听力练习"],
      ["12:20", "午休", "中庭 / 食堂", ""],
      ["13:20", "体育", "体育馆", "运动服"],
      ["14:30", "班会", "1-A 教室", "社团登记"]
    ],
    [
      ["08:20", "朝会", "1-A 教室", ""],
      ["09:00", "世界史", "1-A 教室", "古代文明"],
      ["10:10", "化学", "实验室", "安全说明"],
      ["11:20", "数学", "1-A 教室", ""],
      ["12:20", "午休", "食堂", ""],
      ["13:20", "美术", "美术室", "素描"],
      ["14:30", "社团时间", "各活动室", ""]
    ],
    [
      ["08:20", "朝会", "1-A 教室", ""],
      ["09:00", "英语", "1-A 教室", "单词测试"],
      ["10:10", "物理", "理科教室", "力学导入"],
      ["11:20", "现代文", "1-A 教室", ""],
      ["12:20", "午休", "中庭", ""],
      ["13:20", "音乐", "音乐室", "合唱练习"],
      ["14:30", "自习", "图书室", ""]
    ],
    [
      ["08:20", "朝会", "1-A 教室", ""],
      ["09:00", "数学", "1-A 教室", "函数"],
      ["10:10", "古典", "1-A 教室", ""],
      ["11:20", "生物", "理科教室", "观察记录"],
      ["12:20", "午休", "食堂", ""],
      ["13:20", "家庭科", "家庭科教室", ""],
      ["14:30", "社团时间", "各活动室", ""]
    ],
    [
      ["08:20", "朝会", "1-A 教室", ""],
      ["09:00", "现代文", "1-A 教室", "作文"],
      ["10:10", "英语", "1-A 教室", ""],
      ["11:20", "地理", "1-A 教室", "地图演习"],
      ["12:20", "午休", "中庭 / 食堂", ""],
      ["13:20", "体育", "操场", "雨天改体育馆"],
      ["14:30", "周末班会", "1-A 教室", "值日确认"]
    ],
    [
      ["10:00", "补习 / 社团", "校内", "参加者确认"],
      ["13:00", "自由活动", "校内", ""]
    ],
    [
      ["全天", "休校", "校外", "无正式课程"]
    ]
  ];
}

function defaultCalendarDays() {
  const templates = weeklyScheduleTemplates();
  const days = [];
  let dayNumber = 1;
  for (const { month, days: daysInMonth } of SCHOOL_YEAR_MONTHS) {
    for (let dayOfMonth = 1; dayOfMonth <= daysInMonth; dayOfMonth += 1) {
      const weekdayIndex = (dayNumber - 1) % WEEKDAY_LABELS.length;
      const dayId = `day_${String(dayNumber).padStart(3, "0")}`;
      days.push(makeCalendarDay(dayId, WEEKDAY_LABELS[weekdayIndex], `${month}月${dayOfMonth}日`, templates[weekdayIndex], {
        dayNumber,
        month,
        monthLabel: `${month}月`,
        dayOfMonth,
        weekdayIndex
      }));
      dayNumber += 1;
    }
  }
  return days;
}

function makeCalendarDay(idValue, label, dateLabel, rows, meta = {}) {
  return {
    id: idValue,
    label,
    dateLabel,
    ...meta,
    note: "",
    schedule: rows.map(([time, subject, location, note], index) => ({
      id: `${idValue}_${index + 1}`,
      time,
      subject,
      location,
      note
    })),
    events: []
  };
}

function normalizeCalendarDays(days) {
  const fallback = defaultCalendarDays();
  const source = Array.isArray(days) ? days : [];
  const byId = new Map(source.map((day) => [normalizeCalendarDayId(day.id), day]));
  const sourceIsYear = source.length >= 300;
  return fallback.map((fallbackDay, index) => {
    const legacyId = Object.entries(LEGACY_DAY_IDS).find(([, nextId]) => nextId === fallbackDay.id)?.[0] || "";
    const day = byId.get(fallbackDay.id) || (legacyId ? byId.get(legacyId) : null) || (sourceIsYear ? source[index] : null) || fallbackDay;
    const brokenDay = calendarDayLooksCorrupt(day);
    const keepIdentity = sourceIsYear && normalizeCalendarDayId(day.id) === fallbackDay.id && !brokenDay;
    const sourceDay = brokenDay ? fallbackDay : day;
    return {
      id: fallbackDay.id,
      label: String(keepIdentity ? (sourceDay.label || fallbackDay.label) : fallbackDay.label).trim(),
      dateLabel: String(keepIdentity ? (sourceDay.dateLabel || sourceDay.date || fallbackDay.dateLabel) : fallbackDay.dateLabel).trim(),
      dayNumber: fallbackDay.dayNumber,
      month: fallbackDay.month,
      monthLabel: fallbackDay.monthLabel,
      dayOfMonth: fallbackDay.dayOfMonth,
      weekdayIndex: fallbackDay.weekdayIndex,
      note: String(brokenDay ? "" : (day.note || "")).trim(),
      schedule: normalizeSchedule(sourceDay.schedule?.length ? sourceDay.schedule : fallbackDay.schedule),
      events: normalizeCalendarEvents(day.events).map((event) => ({ ...event, dayId: fallbackDay.id }))
    };
  });
}

function normalizeCalendarDayId(dayId) {
  const raw = String(dayId || "").trim();
  return LEGACY_DAY_IDS[raw] || raw || "day_001";
}

function calendarDayDisplay(day) {
  if (!day) return "";
  return `${day.dateLabel || ""} ${day.label || ""}`.trim();
}

function resolveTimelineDayId(state, value) {
  const input = String(value || "").trim();
  if (!input) return "";
  const normalized = normalizeCalendarDayId(input);
  const days = state.calendarDays || [];
  const direct = days.find((day) => day.id === normalized);
  if (direct) return direct.id;

  const folded = input.toLowerCase();
  const matched = days.find((day) => {
    const labels = [
      day.dateLabel,
      calendarDayDisplay(day),
      `${day.month}/${day.dayOfMonth}`,
      `${day.month}月${day.dayOfMonth}日`
    ];
    return labels.some((label) => String(label || "").trim().toLowerCase() === folded);
  });
  return matched?.id || "";
}

function inferTimelineDayId(state, post) {
  const existing = resolveTimelineDayId(state, post.dayId);
  if (existing) return existing;

  const text = String(post.gameTime || "").toLowerCase();
  if (!text) return "";
  const matched = (state.calendarDays || []).find((day) => {
    const labels = [day.dateLabel, calendarDayDisplay(day)].filter(Boolean);
    return labels.some((label) => text.includes(String(label).toLowerCase()));
  });
  return matched?.id || "";
}

function parseGameTimeMinutes(value) {
  const text = String(value || "");
  let match = text.match(/([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)/);
  if (!match) match = text.match(/([01]?\d|2[0-3])\s*(?:時|时|点|點)\s*([0-5]?\d)?\s*(?:分)?/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  const isPm = /午後|下午|pm/i.test(text);
  const isAm = /午前|上午|am/i.test(text);
  if (isPm && hour < 12) hour += 12;
  if (isAm && hour === 12) hour = 0;
  if (hour < 0 || hour > 23) return null;
  return hour * 60 + minute;
}

function advanceGameTimeString(value, minutes) {
  const text = String(value || "").trim();
  const match = text.match(/([01]?\d|2[0-3])\s*([:：])\s*([0-5]\d)/);
  if (!match) return text;

  const currentMinutes = Number(match[1]) * 60 + Number(match[3]);
  const nextMinutes = (currentMinutes + minutes) % 1440;
  const hour = String(Math.floor(nextMinutes / 60)).padStart(2, "0");
  const minute = String(nextMinutes % 60).padStart(2, "0");
  return `${text.slice(0, match.index)}${hour}${match[2]}${minute}${text.slice(match.index + match[0].length)}`;
}

function advanceTimelineGameTime(state) {
  const minutes = Math.floor(Math.random() * 5) + 1;
  state.settings.gameTime = advanceGameTimeString(state.settings.gameTime, minutes);
  return minutes;
}

function findPostReply(post, replyId) {
  return (post.replies || []).find((reply) => reply.id === replyId);
}

function removePostReply(post, replyId) {
  const replies = post.replies || [];
  const childIds = new Set([replyId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const reply of replies) {
      if (!childIds.has(reply.id) && childIds.has(reply.parentReplyId)) {
        childIds.add(reply.id);
        changed = true;
      }
    }
  }
  post.replies = replies.filter((reply) => !childIds.has(reply.id));
  return childIds.size;
}

function postReplyChildrenByParent(replies) {
  const ids = new Set((replies || []).map((reply) => reply.id));
  const byParent = new Map();
  for (const reply of replies || []) {
    const parentId = ids.has(reply.parentReplyId) ? reply.parentReplyId : "";
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId).push(reply);
  }
  return byParent;
}

function appendPostReplyMarkdown(lines, replies, byId) {
  const byParent = postReplyChildrenByParent(replies || []);
  const append = (reply, depth) => {
    const replyAuthor = byId.get(reply.authorId);
    const replyAuthorLabel = reply.isAnonymous
      ? `匿名${replyAuthor ? `（${replyAuthor.name}）` : ""}`
      : (replyAuthor?.name || "Unknown");
    const indent = "  ".repeat(depth);
    lines.push(`${indent}- ${reply.gameTime} | ${replyAuthorLabel}：${reply.content}`);
    for (const child of byParent.get(reply.id) || []) append(child, depth + 1);
  };
  for (const reply of byParent.get("") || []) append(reply, 0);
}

function buildTimelineSortKey(state, dayId, gameTime) {
  const minutes = parseGameTimeMinutes(gameTime);
  if (minutes === null) return null;
  const day = (state.calendarDays || []).find((item) => item.id === resolveTimelineDayId(state, dayId));
  const dayNumber = Number.isFinite(Number(day?.dayNumber)) ? Number(day.dayNumber) : 0;
  return dayNumber * 1440 + minutes;
}

function timelineSortValue(post) {
  const rawValue = post?.timelineSortKey;
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

function compareTimelinePosts(a, b) {
  const aSort = timelineSortValue(a);
  const bSort = timelineSortValue(b);
  if (aSort !== null && bSort !== null && aSort !== bSort) return bSort - aSort;
  if (aSort !== null && bSort === null) return -1;
  if (aSort === null && bSort !== null) return 1;
  return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
}

function calendarDayLooksCorrupt(day) {
  const fields = [
    day?.label,
    day?.dateLabel,
    ...(Array.isArray(day?.schedule) ? day.schedule.flatMap((item) => [item.time, item.subject, item.location, item.note]) : [])
  ].filter((value) => value !== undefined && value !== null).map(String);
  if (String(day?.label || "").includes("??") || String(day?.dateLabel || "").includes("??")) return true;
  return fields.filter((value) => value.includes("??")).length >= 3;
}

function normalizeSchedule(schedule) {
  if (!Array.isArray(schedule)) return [];
  return schedule.map((item, index) => ({
    id: item.id || id("period"),
    time: String(item.time || "").trim(),
    subject: String(item.subject || item.title || `Period ${index + 1}`).trim(),
    location: String(item.location || "").trim(),
    note: String(item.note || "").trim()
  })).filter((item) => item.time || item.subject || item.location || item.note);
}

function parseScheduleText(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split("|").map((part) => part.trim());
      if (parts.length === 1) {
        return { id: id("period"), time: "", subject: parts[0] || `Period ${index + 1}`, location: "", note: "" };
      }
      return {
        id: id("period"),
        time: parts[0] || "",
        subject: parts[1] || `Period ${index + 1}`,
        location: parts[2] || "",
        note: parts.slice(3).join(" | ")
      };
    });
}

function normalizeWeekdayIndexes(value) {
  const source = Array.isArray(value) ? value : [];
  const indexes = source
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
  return indexes.length ? Array.from(new Set(indexes)) : [0, 1, 2, 3, 4, 5, 6];
}

function calendarBatchTargets(calendarDays, body) {
  const days = Array.isArray(calendarDays) ? calendarDays : [];
  const startId = normalizeCalendarDayId(body.startDayId || days[0]?.id);
  const endId = normalizeCalendarDayId(body.endDayId || startId);
  const startIndex = days.findIndex((day) => day.id === startId);
  const endIndex = days.findIndex((day) => day.id === endId);
  if (startIndex < 0 || endIndex < 0) {
    return { error: "批量范围内包含不存在的日期。" };
  }
  const from = Math.min(startIndex, endIndex);
  const to = Math.max(startIndex, endIndex);
  const weekdayIndexes = normalizeWeekdayIndexes(body.weekdayIndexes);
  const targets = days
    .slice(from, to + 1)
    .filter((day) => weekdayIndexes.includes(Number(day.weekdayIndex)));
  return {
    targets,
    from,
    to,
    startDay: days[from],
    endDay: days[to],
    weekdayIndexes
  };
}

function normalizeCalendarEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.map((event, index) => ({
    id: event.id || id("event"),
    dayId: String(event.dayId || "").trim(),
    type: normalizeEventType(event.type),
    title: String(event.title || `事件 ${index + 1}`).trim(),
    detail: String(event.detail || event.content || "").trim(),
    triggerTarget: ["bulletin", "none"].includes(event.triggerTarget) ? event.triggerTarget : "bulletin",
    isPublic: event.isPublic === true,
    triggeredAt: event.triggeredAt || "",
    createdAt: event.createdAt || new Date().toISOString(),
    updatedAt: event.updatedAt || event.createdAt || new Date().toISOString()
  })).filter((event) => event.title || event.detail);
}

function normalizeEventType(value) {
  const type = String(value || "event").trim().toLowerCase();
  if (["event", "rumor", "exam", "club", "incident", "notice"].includes(type)) return type;
  return "event";
}

function normalizeBulletins(bulletins) {
  if (!Array.isArray(bulletins)) return [];
  return bulletins.map((bulletin, index) => ({
    id: bulletin.id || id("bulletin"),
    type: normalizeBulletinType(bulletin.type),
    title: String(bulletin.title || `公告 ${index + 1}`).trim(),
    content: String(bulletin.content || "").trim(),
    authorId: String(bulletin.authorId || "").trim(),
    dayId: String(bulletin.dayId || "").trim(),
    gameTime: String(bulletin.gameTime || "").trim(),
    isPublic: bulletin.isPublic !== false,
    sourceEventId: String(bulletin.sourceEventId || "").trim(),
    createdAt: bulletin.createdAt || new Date().toISOString(),
    updatedAt: bulletin.updatedAt || bulletin.createdAt || new Date().toISOString()
  })).filter((bulletin) => bulletin.title || bulletin.content);
}

function normalizeBulletinType(value) {
  const type = String(value || "bulletin").trim().toLowerCase();
  if (["bulletin", "rumor", "school", "club", "incident"].includes(type)) return type;
  return "bulletin";
}

function normalizeAuditLog(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry) => ({
    id: entry.id || id("log"),
    action: String(entry.action || "update").trim(),
    label: String(entry.label || "GM 更新").trim(),
    details: entry.details && typeof entry.details === "object" ? entry.details : {},
    createdAt: entry.createdAt || new Date().toISOString()
  })).slice(0, 80);
}

function normalizeUndoStack(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry) => ({
    id: entry.id || id("undo"),
    action: String(entry.action || "update").trim(),
    label: String(entry.label || "GM 更新").trim(),
    keys: Array.isArray(entry.keys) ? entry.keys.map(String) : [],
    snapshot: entry.snapshot && typeof entry.snapshot === "object" ? entry.snapshot : {},
    createdAt: entry.createdAt || new Date().toISOString()
  })).filter((entry) => entry.keys.length).slice(0, 12);
}

function readSeedState() {
  const seedFile = path.join(ROOT, "seed", "state.json");
  if (!fs.existsSync(seedFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(seedFile, "utf8"));
  } catch (error) {
    console.warn(`Seed state could not be read: ${error.message}`);
    return null;
  }
}

function scanVaultCharacters() {
  const vaultRoot = path.resolve(ROOT, "..");
  const sources = [
    { dir: path.join(vaultRoot, "玩家信息"), type: "player", recursive: false },
    { dir: path.join(vaultRoot, "玩家信息", "NPC"), type: "npc", recursive: false },
    { dir: path.join(vaultRoot, "NPC攻略文件"), type: "npc", recursive: false },
    { dir: path.join(vaultRoot, "角色档案拆分版"), type: "npc", folderNames: true }
  ];

  const byName = new Map();
  for (const source of sources) {
    if (source.folderNames) {
      if (!fs.existsSync(source.dir)) continue;
      for (const entry of fs.readdirSync(source.dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const name = cleanName(entry.name);
        if (!isLikelyCharacterName(name)) continue;
        const existing = byName.get(name);
        if (existing && existing.type === "player") continue;
        byName.set(name, makeCharacter(stableId(name), name, makeHandle(name), source.type));
      }
      continue;
    }

    for (const file of listMarkdownFiles(source.dir, source.recursive)) {
      const name = extractCharacterName(file);
      if (!isLikelyCharacterName(name)) continue;
      const existing = byName.get(name);
      if (existing && existing.type === "player") continue;
      byName.set(name, makeCharacter(stableId(name), name, makeHandle(name), source.type));
    }
  }

  return Array.from(byName.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === "player" ? -1 : 1;
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });
}

function isLikelyCharacterName(name) {
  if (!name || name.length > 44) return false;
  if (/^\d+$/.test(name)) return false;
  if (/^Untitled/i.test(name)) return false;
  if (/^(README|Recess)$/i.test(name)) return false;
  return true;
}

function listMarkdownFiles(dir, recursive) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive && !["assets", ".obsidian", ".git"].includes(entry.name)) {
        files.push(...listMarkdownFiles(fullPath, recursive));
      }
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(fullPath);
  }
  return files;
}

function extractCharacterName(file) {
  const baseName = path.basename(file, ".md")
    .replace(/^[♀♂]\s*/, "")
    .replace(/\s*角色(档案|攻略|卡档案).*$/, "")
    .replace(/\s*(完整档案|当前状态|秘密与成长线|RP运行卡).*$/, "")
    .trim();

  try {
    const text = fs.readFileSync(file, "utf8");
    const tableName = text.match(/\|\s*姓名\s*\|\s*([^|\r\n]+?)\s*\|/);
    if (tableName) return cleanName(tableName[1]);
    const heading = text.match(/^#\s+(.+)$/m);
    if (heading) return cleanName(heading[1]);
  } catch {
    return cleanName(baseName);
  }

  return cleanName(baseName);
}

function cleanName(value) {
  return String(value)
    .replace(/^[♀♂]\s*/, "")
    .replace(/\s*角色(档案|攻略|卡档案).*$/, "")
    .replace(/[「」]/g, "")
    .trim();
}

function makeCharacter(idValue, name, handle, type) {
  const colorIndex = Number.parseInt(hash(name).slice(0, 2), 16) % PALETTE.length;
  return {
    id: idValue,
    name,
    handle: `@${String(handle).replace(/^@/, "")}`,
    type,
    color: PALETTE[colorIndex],
    avatarText: avatarText(name),
    avatarData: "",
    tags: [],
    note: "",
    active: true,
    createdAt: new Date().toISOString()
  };
}

function avatarText(name) {
  const chars = Array.from(String(name).replace(/[^\p{L}\p{N}]/gu, ""));
  return chars.slice(0, 2).join("") || "GM";
}

function makeHandle(name) {
  const compact = Array.from(String(name).replace(/[^\p{L}\p{N}]+/gu, "")).join("");
  return compact || hash(name).slice(0, 8);
}

function stableId(name) {
  return `char_${hash(name).slice(0, 12)}`;
}

function hash(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function publicState(state) {
  const adminView = requestContext.getStore()?.adminView ?? Boolean(state.__adminView);
  const calendarDays = (state.calendarDays || []).map((day) => ({
    ...day,
    events: adminView
      ? (day.events || [])
      : (day.events || []).filter((event) => event.isPublic || event.triggeredAt)
  }));
  const messages = (state.messages || []).map((message) => (
    !adminView && message.isAnonymous
      ? { ...message, authorId: "" }
      : message
  ));
  const posts = (state.posts || []).map((post) => (
    !adminView && post.isAnonymous
      ? {
          ...post,
          authorId: "",
          replies: (post.replies || []).map((reply) => (
            reply.isAnonymous ? { ...reply, authorId: "" } : reply
          ))
        }
      : {
          ...post,
          replies: (post.replies || []).map((reply) => (
            !adminView && reply.isAnonymous ? { ...reply, authorId: "" } : reply
          ))
        }
  ));

  return {
    ...state,
    characters: state.characters.map(({ accessToken, auth, ...character }) => character),
    calendarDays,
    posts,
    messages,
    chatMemberRequests: adminView ? (state.chatMemberRequests || []) : [],
    bulletins: adminView ? state.bulletins : (state.bulletins || []).filter((bulletin) => bulletin.isPublic !== false),
    auditLog: adminView ? (state.auditLog || []) : [],
    undoStack: adminView
      ? (state.undoStack || []).map(({ snapshot, ...entry }) => entry)
      : []
  };
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_JSON_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function isAdmin(req) {
  return req.headers["x-gm-pin"] === GM_PIN;
}

function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  sendJson(res, 401, { error: "GM PIN is invalid." });
  return false;
}

function findCharacter(state, characterId) {
  return state.characters.find((character) => character.id === characterId && character.active !== false);
}

function authorizeAuthor(req, res, state, characterId) {
  const author = findCharacter(state, characterId);
  if (!author) {
    sendJson(res, 400, { error: "Author not found." });
    return null;
  }
  if (isAdmin(req)) return author;
  if (author.type !== "account") {
    sendJson(res, 403, { error: "Players can only post from their own account." });
    return null;
  }
  const token = req.headers["x-account-token"];
  if (!token || token !== author.accessToken) {
    sendJson(res, 403, { error: "Account token is invalid." });
    return null;
  }
  return author;
}

function ensureChatAccess(req, res, chat, author) {
  if (isAdmin(req)) return true;
  if (chat.isPublic || chat.memberIds.includes(author.id)) return true;
  sendJson(res, 403, { error: "This account cannot access that chat." });
  return false;
}

function canDirectMessage(state, sourceId, targetId) {
  if (sourceId === targetId) return true;
  return state.relationships.some((relationship) => (
    relationship.status === "accepted" &&
    (
      (relationship.requesterId === sourceId && relationship.targetId === targetId) ||
      (relationship.requesterId === targetId && relationship.targetId === sourceId)
    )
  ));
}

function canRequestChatMemberChange(req, state, chat, requester, target, action) {
  if (isAdmin(req)) return { ok: true };
  if (!chat.memberIds.includes(requester.id)) {
    return { ok: false, status: 403, error: "Only current chat members can request member changes." };
  }
  if (chat.type === "direct") {
    return { ok: false, status: 400, error: "Direct chat members cannot be changed." };
  }
  if (chat.isPublic) {
    return { ok: false, status: 400, error: "Public chat membership is managed by GM." };
  }
  if (action === "add" && !canDirectMessage(state, requester.id, target.id)) {
    return { ok: false, status: 403, error: "GM must approve the follow request before this account can be invited." };
  }
  return { ok: true };
}

function directChatFor(state, firstId, secondId) {
  return state.chats.find((chat) => (
    chat.type === "direct" &&
    chat.memberIds.length === 2 &&
    chat.memberIds.includes(firstId) &&
    chat.memberIds.includes(secondId)
  ));
}

function normalizeHandle(value, fallbackName) {
  const raw = String(value || makeHandle(fallbackName)).replace(/^@/, "").trim();
  const compact = raw || makeHandle(fallbackName);
  return `@${compact.slice(0, 32)}`;
}

function normalizeUsername(value, fallbackName) {
  const raw = String(value || "").replace(/^@/, "").trim();
  const compact = raw || makeHandle(fallbackName);
  return compact.slice(0, 40);
}

function loginKey(value) {
  return String(value || "").replace(/^@/, "").trim().toLowerCase();
}

function findAccountByLogin(state, value) {
  const key = loginKey(value);
  if (!key) return null;
  return state.characters.find((item) => (
    item.type === "account" &&
    item.active !== false &&
    (loginKey(item.handle) === key || loginKey(item.username) === key)
  ));
}

function isAccountLoginTaken(state, value, ignoreId = "") {
  const key = loginKey(value);
  if (!key) return false;
  return state.characters.some((item) => (
    item.id !== ignoreId &&
    item.type === "account" &&
    (loginKey(item.handle) === key || loginKey(item.username) === key)
  ));
}

function buildPlayerAccount(state, body, gmCreated) {
  const name = String(body.name || body.displayName || body.username || "").trim();
  if (!name) return { status: 400, error: "Account name is required." };
  if (name.length > 40) return { status: 400, error: "Account name is too long." };
  const passcode = normalizePasscode(body.passcode);
  if (!passcode) return { status: 400, error: "Passcode must be 4 to 80 characters." };
  const handle = normalizeHandle(body.handle, name);
  if (state.characters.some((character) => character.handle.toLowerCase() === handle.toLowerCase())) {
    return { status: 409, error: "That handle is already taken." };
  }
  if (isAccountLoginTaken(state, handle)) {
    return { status: 409, error: "That handle conflicts with an account username." };
  }
  const username = normalizeUsername(body.username || handle, handle);
  if (isAccountLoginTaken(state, username)) {
    return { status: 409, error: "That username is already taken." };
  }

  let avatarData = "";
  try {
    avatarData = validateDataUrl(body.avatarData, MAX_AVATAR_DATA_URL_LENGTH, "Avatar");
  } catch (error) {
    return { status: 400, error: error.message };
  }

  const accessToken = crypto.randomBytes(24).toString("hex");
  const salt = crypto.randomBytes(12).toString("hex");
  const accountId = id("acct");
  const character = makeCharacter(accountId, name, handle, "account");
  character.username = username;
  character.avatarData = avatarData;
  character.accessToken = accessToken;
  character.auth = { salt, passcodeHash: hashPasscode(passcode, salt) };
  character.note = gmCreated ? "GM-created player account" : "Self-created player account";
  if (gmCreated) character.tags = normalizeTags(body.tags);
  return { character, accessToken, account: { accountId, name, username, handle, passcode } };
}

function addAccountToPublicChats(state, character) {
  for (const chat of state.chats) {
    if (chat.isPublic && !chat.memberIds.includes(character.id)) {
      chat.memberIds.push(character.id);
    }
  }
}

function parseAccountImportText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  if (lines.length && isAccountImportHeader(lines[0])) lines.shift();

  return lines.map((line, index) => {
    const parts = parseDelimitedLine(line).map((part) => part.trim());
    if (parts.length < 4) {
      return { row: index + 1, error: "Each row needs display name, username, @handle, and password." };
    }
    return {
      row: index + 1,
      name: parts[0],
      username: parts[1],
      handle: parts[2],
      passcode: parts[3],
      tags: parts[4] ? parts[4].split(/[;；|]/).map((tag) => tag.trim()).filter(Boolean) : []
    };
  });
}

function buildGmCharacter(body) {
  const name = String(body.name || "").trim();
  if (!name) return { status: 400, error: "Character name is required." };
  if (name.length > 80) return { status: 400, error: "Character name is too long." };
  const character = makeCharacter(id("char"), name, body.handle || makeHandle(name), body.type === "player" ? "player" : "npc");
  if (body.avatarData) {
    try {
      character.avatarData = validateDataUrl(body.avatarData, MAX_AVATAR_DATA_URL_LENGTH, "Avatar");
    } catch (error) {
      return { status: 400, error: error.message };
    }
  }
  character.note = String(body.note || "").trim();
  character.tags = normalizeTags(body.tags);
  return { character };
}

function parseCharacterImportText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  if (lines.length && isCharacterImportHeader(lines[0])) lines.shift();

  return lines.map((line, index) => {
    const parts = parseDelimitedLine(line).map((part) => part.trim());
    if (!parts[0]) return { row: index + 1, error: "Character name is required." };
    return {
      row: index + 1,
      name: parts[0],
      handle: parts[1] || makeHandle(parts[0]),
      type: /^(player|pc|预设玩家角色|玩家)$/i.test(parts[2] || "") ? "player" : "npc",
      tags: parts[3] ? parts[3].split(/[;；|]/).map((tag) => tag.trim()).filter(Boolean) : []
    };
  });
}

function isCharacterImportHeader(line) {
  const parts = parseDelimitedLine(line).map((part) => part.trim().replace(/^@/, "").toLowerCase());
  const first = parts[0] || "";
  const second = parts[1] || "";
  return (
    first.includes("名称") ||
    first.includes("名字") ||
    first.includes("name") ||
    second.includes("handle")
  );
}

function isAccountImportHeader(line) {
  const parts = parseDelimitedLine(line).map((part) => part.trim().replace(/^@/, "").toLowerCase());
  const first = parts[0] || "";
  const second = parts[1] || "";
  const third = parts[2] || "";
  const fourth = parts[3] || "";
  if (third === "handle" || third.includes("handle")) return true;
  return (
    (first.includes("显示") || first.includes("name") || first.includes("display")) &&
    (second.includes("用户名") || second.includes("username") || second.includes("login")) &&
    (third.includes("handle") || third.includes("账号")) &&
    (fourth.includes("密码") || fourth.includes("password") || fourth.includes("passcode"))
  );
}

function parseDelimitedLine(line) {
  const delimiter = line.includes("\t") ? "\t" : ",";
  const parts = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (quoted && line[index + 1] === "\"") {
        value += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && (char === delimiter || (delimiter === "," && char === "，"))) {
      parts.push(value);
      value = "";
      continue;
    }
    value += char;
  }

  parts.push(value);
  return parts;
}

function normalizeShortcode(value) {
  const shortcode = String(value || "").trim().replace(/^:+|:+$/g, "").toLowerCase();
  if (!/^[a-z0-9_\-]{1,24}$/.test(shortcode)) return "";
  return shortcode;
}

function normalizeTags(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "").split(/[,，、\n]/);
  const tags = source
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => item.slice(0, 24));
  return Array.from(new Set(tags)).slice(0, 12);
}

function validateDataUrl(value, maxLength, label) {
  const dataUrl = String(value || "").trim();
  if (!dataUrl) return "";
  if (dataUrl.length > maxLength) {
    throw new Error(`${label} is too large.`);
  }
  if (!/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\r\n]+$/i.test(dataUrl)) {
    throw new Error(`${label} must be a PNG, JPG, WebP, or GIF data URL.`);
  }
  return dataUrl.replace(/\s/g, "");
}

function hashPasscode(passcode, salt) {
  return crypto.createHash("sha256").update(`${salt}:${String(passcode)}`).digest("hex");
}

function normalizePasscode(value) {
  const passcode = String(value || "").trim();
  if (passcode.length < 4) return "";
  if (passcode.length > 80) return "";
  return passcode;
}

function normalizeMetrics(metrics) {
  return {
    likes: clampInt(metrics?.likes, 0),
    reposts: clampInt(metrics?.reposts, 0),
    views: clampInt(metrics?.views, 0)
  };
}

function clampInt(value, min) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, number);
}

function snapshotKeys(state, keys) {
  const snapshot = {};
  for (const key of keys) {
    snapshot[key] = JSON.parse(JSON.stringify(state[key]));
  }
  return snapshot;
}

function pushAudit(state, action, label, details = {}) {
  state.auditLog ||= [];
  state.auditLog.unshift({
    id: id("log"),
    action,
    label,
    details,
    createdAt: new Date().toISOString()
  });
  state.auditLog = state.auditLog.slice(0, 80);
}

function pushUndo(state, action, label, keys, details = {}) {
  state.undoStack ||= [];
  state.undoStack.unshift({
    id: id("undo"),
    action,
    label,
    keys,
    snapshot: snapshotKeys(state, keys),
    createdAt: new Date().toISOString()
  });
  state.undoStack = state.undoStack.slice(0, 12);
  pushAudit(state, action, label, { ...details, undoable: true });
}

function restoreLastUndo(state) {
  const entry = state.undoStack.shift();
  if (!entry) return null;
  for (const key of entry.keys) {
    state[key] = JSON.parse(JSON.stringify(entry.snapshot[key]));
  }
  normalizeState(state);
  pushAudit(state, "undo", `已撤销：${entry.label}`, { undoId: entry.id, action: entry.action });
  return entry;
}

async function routeApi(req, res, url) {
  const state = readState();

  if (req.method === "GET" && url.pathname === "/api/state") {
    const since = String(url.searchParams.get("since") || "");
    if (since && since === String(state.updatedAt || "")) {
      sendJson(res, 200, { changed: false, updatedAt: state.updatedAt });
      return;
    }
    if (since) {
      sendJson(res, 200, { changed: true, updatedAt: state.updatedAt, state: publicState(state) });
      return;
    }
    sendJson(res, 200, publicState(state));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/gm/check") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/export.md") {
    if (!requireAdmin(req, res)) return;
    sendText(res, 200, exportMarkdown(state), "text/markdown; charset=utf-8");
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/gm/chats/export.md") {
    if (!requireAdmin(req, res)) return;
    sendText(res, 200, exportChatMarkdown(state), "text/markdown; charset=utf-8");
    return;
  }

  const body = ["POST", "PATCH", "DELETE"].includes(req.method) ? await readBody(req) : {};

  if (req.method === "POST" && url.pathname === "/api/gm/undo") {
    if (!requireAdmin(req, res)) return;
    const entry = restoreLastUndo(state);
    if (!entry) return sendJson(res, 400, { error: "There is no GM action to undo." });
    writeState(state);
    sendJson(res, 200, publicState(state));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/bulletins") {
    if (!requireAdmin(req, res)) return;
    const title = String(body.title || "").trim();
    const content = String(body.content || "").trim();
    if (!title && !content) return sendJson(res, 400, { error: "请填写公告标题或内容。" });
    const author = body.authorId ? findCharacter(state, body.authorId) : null;
    const now = new Date().toISOString();
    pushUndo(state, "create_bulletin", title || "创建公告", ["bulletins"], { type: body.type || "bulletin" });
    state.bulletins.unshift({
      id: id("bulletin"),
      type: normalizeBulletinType(body.type),
      title: title || "Untitled bulletin",
      content,
      authorId: author?.id || "",
      dayId: String(body.dayId || "").trim(),
      gameTime: String(body.gameTime || state.settings.gameTime).trim(),
      isPublic: body.isPublic !== false,
      sourceEventId: String(body.sourceEventId || "").trim(),
      createdAt: now,
      updatedAt: now
    });
    writeState(state);
    sendJson(res, 201, publicState(state));
    return;
  }

  const bulletinMatch = url.pathname.match(/^\/api\/bulletins\/([^/]+)$/);
  if (bulletinMatch) {
    if (!requireAdmin(req, res)) return;
    const bulletinId = decodeURIComponent(bulletinMatch[1]);
    const bulletin = state.bulletins.find((item) => item.id === bulletinId);
    if (!bulletin) return sendJson(res, 404, { error: "公告不存在。" });

    if (req.method === "PATCH") {
      pushUndo(state, "edit_bulletin", `编辑公告：${bulletin.title}`, ["bulletins"], { bulletinId });
      if (body.type !== undefined) bulletin.type = normalizeBulletinType(body.type);
      if (body.title !== undefined) bulletin.title = String(body.title || bulletin.title).trim();
      if (body.content !== undefined) bulletin.content = String(body.content || "").trim();
      if (body.authorId !== undefined) bulletin.authorId = findCharacter(state, body.authorId)?.id || "";
      if (body.dayId !== undefined) bulletin.dayId = String(body.dayId || "").trim();
      if (body.gameTime !== undefined) bulletin.gameTime = String(body.gameTime || state.settings.gameTime).trim();
      if (body.isPublic !== undefined) bulletin.isPublic = body.isPublic !== false;
      bulletin.updatedAt = new Date().toISOString();
      writeState(state);
      sendJson(res, 200, publicState(state));
      return;
    }

    if (req.method === "DELETE") {
      pushUndo(state, "delete_bulletin", `删除公告：${bulletin.title}`, ["bulletins"], { bulletinId });
      state.bulletins = state.bulletins.filter((item) => item.id !== bulletinId);
      writeState(state);
      sendJson(res, 200, publicState(state));
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/api/player-accounts/import") {
    if (!requireAdmin(req, res)) return;
    const rows = Array.isArray(body.accounts)
      ? body.accounts.map((account, index) => ({ ...account, row: index + 1 }))
      : parseAccountImportText(body.text);
    if (!rows.length) return sendJson(res, 400, { error: "Import list is empty." });
    if (rows.length > MAX_ACCOUNT_IMPORT_COUNT) return sendJson(res, 400, { error: `Import up to ${MAX_ACCOUNT_IMPORT_COUNT} accounts at a time.` });

    const workingState = JSON.parse(JSON.stringify(state));
    const created = [];
    for (const row of rows) {
      if (row.error) return sendJson(res, 400, { error: `Row ${row.row}: ${row.error}` });
      const built = buildPlayerAccount(workingState, row, true);
      if (built.error) return sendJson(res, built.status, { error: `Row ${row.row}: ${built.error}` });
      workingState.characters.push(built.character);
      addAccountToPublicChats(workingState, built.character);
      created.push(built.account);
    }

    pushUndo(state, "import_player_accounts", `批量导入玩家账号：${created.length} 个`, ["characters", "chats"], { count: created.length });
    state.characters = workingState.characters;
    state.chats = workingState.chats;

    writeState(state);
    sendJson(res, 201, {
      state: publicState(state),
      created
    });
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/player-accounts") {
    if (!requireAdmin(req, res)) return;
    const requestedIds = body.all === true
      ? state.characters.filter((character) => character.type === "account" && character.active !== false).map((character) => character.id)
      : unique(Array.isArray(body.ids) ? body.ids.map(String) : []);
    const accounts = requestedIds
      .map((accountId) => state.characters.find((character) => character.id === accountId && character.type === "account" && character.active !== false))
      .filter(Boolean);
    if (!accounts.length) return sendJson(res, 400, { error: "No active player accounts selected." });

    pushUndo(state, "delete_player_accounts", `批量删除玩家账号：${accounts.length} 个`, ["characters", "chats", "relationships", "chatMemberRequests"], { count: accounts.length, accountIds: accounts.map((account) => account.id) });
    const accountIds = new Set(accounts.map((account) => account.id));
    const now = new Date().toISOString();
    for (const account of accounts) {
      account.active = false;
      account.deletedAt = now;
    }
    for (const chat of state.chats) {
      chat.memberIds = (chat.memberIds || []).filter((memberId) => !accountIds.has(memberId));
    }
    state.relationships = (state.relationships || []).filter((relationship) => (
      !accountIds.has(relationship.requesterId) && !accountIds.has(relationship.targetId)
    ));
    state.chatMemberRequests = (state.chatMemberRequests || []).filter((request) => (
      !accountIds.has(request.requesterId) && !accountIds.has(request.targetId)
    ));

    writeState(state);
    sendJson(res, 200, {
      state: publicState(state),
      deleted: accounts.map((account) => ({ id: account.id, name: account.name, handle: account.handle, username: account.username }))
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/player-accounts") {
    const gmCreated = isAdmin(req);
    const built = buildPlayerAccount(state, body, gmCreated);
    if (built.error) return sendJson(res, built.status, { error: built.error });

    if (gmCreated) {
      pushUndo(state, "create_player_account", `创建玩家账号：${built.character.name}`, ["characters", "chats"], { accountId: built.character.id, handle: built.character.handle, username: built.character.username });
    }

    state.characters.push(built.character);
    addAccountToPublicChats(state, built.character);

    writeState(state);
    sendJson(res, 201, {
      state: publicState(state),
      accountId: built.character.id,
      accountToken: built.accessToken
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/player-accounts/login") {
    const login = String(body.login || body.username || body.handle || "").trim();
    const passcode = normalizePasscode(body.passcode);
    if (!login || !passcode) return sendJson(res, 400, { error: "Username/@handle and passcode are required." });

    const character = findAccountByLogin(state, login);
    if (!character?.auth?.salt || !character?.auth?.passcodeHash) {
      return sendJson(res, 401, { error: "Account not found or cannot be recovered." });
    }
    if (hashPasscode(passcode, character.auth.salt) !== character.auth.passcodeHash) {
      return sendJson(res, 401, { error: "Username/@handle or passcode is incorrect." });
    }

    character.accessToken = crypto.randomBytes(24).toString("hex");
    writeState(state);
    sendJson(res, 200, {
      state: publicState(state),
      accountId: character.id,
      accountToken: character.accessToken
    });
    return;
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/player-accounts/")) {
    const characterId = decodeURIComponent(url.pathname.split("/").pop());
    const character = authorizeAuthor(req, res, state, characterId);
    if (!character) return;

    if (body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name) return sendJson(res, 400, { error: "Account name is required." });
      if (name.length > 40) return sendJson(res, 400, { error: "Account name is too long." });
      character.name = name;
      character.avatarText = avatarText(name);
    }
    if (body.handle !== undefined) {
      const handle = normalizeHandle(body.handle, character.name);
      if (state.characters.some((item) => item.id !== character.id && item.handle.toLowerCase() === handle.toLowerCase())) {
        return sendJson(res, 409, { error: "That handle is already taken." });
      }
      if (isAccountLoginTaken(state, handle, character.id)) {
        return sendJson(res, 409, { error: "That handle conflicts with an account username." });
      }
      character.handle = handle;
    }
    if (body.username !== undefined) {
      const username = normalizeUsername(body.username, character.handle || character.name);
      if (isAccountLoginTaken(state, username, character.id)) {
        return sendJson(res, 409, { error: "That username is already taken." });
      }
      character.username = username;
    }
    if (body.avatarData !== undefined) {
      try {
        character.avatarData = validateDataUrl(body.avatarData, MAX_AVATAR_DATA_URL_LENGTH, "Avatar");
      } catch (error) {
        return sendJson(res, 400, { error: error.message });
      }
    }

    writeState(state);
    sendJson(res, 200, publicState(state));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/emojis") {
    const shortcode = normalizeShortcode(body.shortcode);
    if (!shortcode) return sendJson(res, 400, { error: "Emoji shortcode must use letters, numbers, dash, or underscore." });

    let imageData = "";
    try {
      imageData = validateDataUrl(body.imageData, MAX_EMOJI_DATA_URL_LENGTH, "Emoji image");
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
    if (!imageData) return sendJson(res, 400, { error: "Emoji image is required." });

    let ownerId = "";
    if (!isAdmin(req)) {
      const owner = authorizeAuthor(req, res, state, body.ownerId);
      if (!owner) return;
      ownerId = owner.id;
    } else {
      ownerId = body.ownerId && findCharacter(state, body.ownerId) ? body.ownerId : "";
    }

    state.emojis = state.emojis.filter((emoji) => emoji.shortcode !== shortcode);
    state.emojis.push({
      id: id("emoji"),
      shortcode,
      name: String(body.name || shortcode).trim().slice(0, 40),
      imageData,
      ownerId,
      createdAt: new Date().toISOString()
    });
    writeState(state);
    sendJson(res, 201, publicState(state));
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/emojis/")) {
    if (!requireAdmin(req, res)) return;
    const emojiId = decodeURIComponent(url.pathname.split("/").pop());
    const emoji = (state.emojis || []).find((item) => item.id === emojiId);
    if (!emoji) return sendJson(res, 404, { error: "Emoji not found." });
    pushUndo(state, "delete_emoji", `Delete emoji :${emoji.shortcode}:`, ["emojis"], { emojiId, shortcode: emoji.shortcode });
    state.emojis = (state.emojis || []).filter((item) => item.id !== emoji.id);
    writeState(state);
    sendJson(res, 200, publicState(state));
    return;
  }

  if (req.method === "PATCH" && url.pathname === "/api/settings") {
    if (!requireAdmin(req, res)) return;
    pushUndo(state, "edit_settings", "编辑时间和站点设置", ["settings"]);
    state.settings.gameTime = String(body.gameTime || state.settings.gameTime).trim();
    if (body.currentDayId !== undefined) {
      const requestedDayId = normalizeCalendarDayId(body.currentDayId);
      const day = state.calendarDays.find((item) => item.id === requestedDayId);
      if (!day) return sendJson(res, 404, { error: "Calendar day not found." });
      state.settings.currentDayId = day.id;
      state.settings.schoolDay = calendarDayDisplay(day);
    } else {
      state.settings.schoolDay = String(body.schoolDay || state.settings.schoolDay).trim();
    }
    state.settings.feedName = String(body.feedName || state.settings.feedName).trim();
    state.settings.chatName = String(body.chatName || state.settings.chatName).trim();
    if (body.autoAdvanceTimelineTime !== undefined) {
      state.settings.autoAdvanceTimelineTime = body.autoAdvanceTimelineTime === true;
    }
    writeState(state);
    sendJson(res, 200, publicState(state));
    return;
  }

  if (req.method === "PATCH" && url.pathname === "/api/calendar/current") {
    if (!requireAdmin(req, res)) return;
    const requestedDayId = normalizeCalendarDayId(body.dayId);
    const day = state.calendarDays.find((item) => item.id === requestedDayId);
    if (!day) return sendJson(res, 404, { error: "Calendar day not found." });
    pushUndo(state, "set_current_day", `设置当前日：${day.label}`, ["settings", "calendarDays"], { dayId: day.id });
    state.settings.currentDayId = day.id;
    state.settings.schoolDay = calendarDayDisplay(day);
    writeState(state);
    sendJson(res, 200, publicState(state));
    return;
  }

  if (req.method === "PATCH" && url.pathname === "/api/calendar/batch") {
    if (!requireAdmin(req, res)) return;
    const batch = calendarBatchTargets(state.calendarDays, body);
    if (batch.error) return sendJson(res, 400, { error: batch.error });
    if (!batch.targets.length) return sendJson(res, 400, { error: "没有日期符合这次批量条件。" });

    const updateSchedule = body.updateSchedule !== false;
    const noteMode = ["keep", "replace", "append"].includes(body.noteMode) ? body.noteMode : "keep";
    const note = String(body.note || "").trim();
    if (!updateSchedule && noteMode === "keep") {
      return sendJson(res, 400, { error: "请选择要批量修改的内容。" });
    }

    const nextSchedule = updateSchedule ? parseScheduleText(body.scheduleText) : null;
    const label = `${calendarDayDisplay(batch.startDay)} - ${calendarDayDisplay(batch.endDay)}`;
    pushUndo(state, "batch_calendar_schedule", `批量编制课程表：${batch.targets.length} 天`, ["calendarDays"], {
      startDayId: batch.startDay.id,
      endDayId: batch.endDay.id,
      weekdayIndexes: batch.weekdayIndexes,
      updateSchedule,
      noteMode
    });

    for (const day of batch.targets) {
      if (updateSchedule) {
        day.schedule = nextSchedule.map((item, index) => ({
          ...item,
          id: `${day.id}_${index + 1}`
        }));
      }
      if (noteMode === "replace") {
        day.note = note;
      } else if (noteMode === "append" && note) {
        day.note = [day.note, note].filter(Boolean).join(" / ");
      }
    }

    writeState(state);
    const payload = publicState(state);
    payload.batchResult = {
      updatedCount: batch.targets.length,
      rangeLabel: label,
      updatedDayIds: batch.targets.map((day) => day.id)
    };
    sendJson(res, 200, payload);
    return;
  }

  const calendarEventMatch = url.pathname.match(/^\/api\/calendar\/days\/([^/]+)\/events(?:\/([^/]+)(?:\/([^/]+))?)?$/);
  if (calendarEventMatch) {
    if (!requireAdmin(req, res)) return;
    const dayId = normalizeCalendarDayId(decodeURIComponent(calendarEventMatch[1]));
    const eventId = calendarEventMatch[2] ? decodeURIComponent(calendarEventMatch[2]) : "";
    const action = calendarEventMatch[3];
    const day = state.calendarDays.find((item) => item.id === dayId);
    if (!day) return sendJson(res, 404, { error: "Calendar day not found." });
    day.events ||= [];

    if (req.method === "POST" && !eventId) {
      const title = String(body.title || "").trim();
      const detail = String(body.detail || body.content || "").trim();
      if (!title && !detail) return sendJson(res, 400, { error: "请填写事件标题或内容。" });
      const now = new Date().toISOString();
      pushUndo(state, "create_calendar_event", `创建事件：${title || detail.slice(0, 32)}`, ["calendarDays"], { dayId });
      day.events.push({
        id: id("event"),
        dayId: day.id,
        type: normalizeEventType(body.type),
        title: title || "Untitled event",
        detail,
        triggerTarget: ["bulletin", "none"].includes(body.triggerTarget) ? body.triggerTarget : "bulletin",
        isPublic: body.isPublic === true,
        triggeredAt: "",
        createdAt: now,
        updatedAt: now
      });
      writeState(state);
      sendJson(res, 201, publicState(state));
      return;
    }

    const event = day.events.find((item) => item.id === eventId);
    if (!event) return sendJson(res, 404, { error: "Calendar event not found." });

    if (req.method === "PATCH" && !action) {
      pushUndo(state, "edit_calendar_event", `编辑事件：${event.title}`, ["calendarDays"], { dayId, eventId });
      if (body.type !== undefined) event.type = normalizeEventType(body.type);
      if (body.title !== undefined) event.title = String(body.title || event.title).trim();
      if (body.detail !== undefined) event.detail = String(body.detail || "").trim();
      if (body.triggerTarget !== undefined) event.triggerTarget = ["bulletin", "none"].includes(body.triggerTarget) ? body.triggerTarget : event.triggerTarget;
      if (body.isPublic !== undefined) event.isPublic = body.isPublic === true;
      event.updatedAt = new Date().toISOString();
      writeState(state);
      sendJson(res, 200, publicState(state));
      return;
    }

    if (req.method === "POST" && action === "trigger") {
      pushUndo(state, "trigger_calendar_event", `触发事件：${event.title}`, ["calendarDays", "bulletins"], { dayId, eventId });
      const now = new Date().toISOString();
      event.triggeredAt = now;
      event.isPublic = true;
      event.updatedAt = now;
      if (event.triggerTarget !== "none") {
        state.bulletins.unshift({
          id: id("bulletin"),
          type: event.type === "rumor" ? "rumor" : "bulletin",
          title: event.title,
          content: event.detail,
          authorId: "",
          dayId: day.id,
          gameTime: String(body.gameTime || state.settings.gameTime).trim(),
          isPublic: true,
          sourceEventId: event.id,
          createdAt: now,
          updatedAt: now
        });
      }
      writeState(state);
      sendJson(res, 200, publicState(state));
      return;
    }

    if (req.method === "DELETE" && !action) {
      pushUndo(state, "delete_calendar_event", `删除事件：${event.title}`, ["calendarDays"], { dayId, eventId });
      day.events = day.events.filter((item) => item.id !== eventId);
      writeState(state);
      sendJson(res, 200, publicState(state));
      return;
    }
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/calendar/days/")) {
    if (!requireAdmin(req, res)) return;
    const dayId = normalizeCalendarDayId(decodeURIComponent(url.pathname.split("/").pop()));
    const day = state.calendarDays.find((item) => item.id === dayId);
    if (!day) return sendJson(res, 404, { error: "Calendar day not found." });
    pushUndo(state, "edit_calendar_day", `编辑课程表：${day.label}`, ["settings", "calendarDays"], { dayId });
    if (body.label !== undefined) day.label = String(body.label || day.label).trim();
    if (body.dateLabel !== undefined) day.dateLabel = String(body.dateLabel || "").trim();
    if (body.note !== undefined) day.note = String(body.note || "").trim();
    if (body.scheduleText !== undefined) day.schedule = parseScheduleText(body.scheduleText);
    if (Array.isArray(body.schedule)) day.schedule = normalizeSchedule(body.schedule);
    if (state.settings.currentDayId === day.id) state.settings.schoolDay = calendarDayDisplay(day);
    writeState(state);
    sendJson(res, 200, publicState(state));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/characters/import") {
    if (!requireAdmin(req, res)) return;
    const rows = Array.isArray(body.characters)
      ? body.characters.map((character, index) => ({ ...character, row: index + 1 }))
      : parseCharacterImportText(body.text);
    if (!rows.length) return sendJson(res, 400, { error: "Import list is empty." });
    if (rows.length > MAX_CHARACTER_IMPORT_COUNT) return sendJson(res, 400, { error: `Import up to ${MAX_CHARACTER_IMPORT_COUNT} characters at a time.` });

    const created = [];
    const newCharacters = [];
    for (const row of rows) {
      if (row.error) return sendJson(res, 400, { error: `Row ${row.row}: ${row.error}` });
      const built = buildGmCharacter(row);
      if (built.error) return sendJson(res, built.status, { error: `Row ${row.row}: ${built.error}` });
      newCharacters.push(built.character);
      created.push({ id: built.character.id, name: built.character.name, handle: built.character.handle, type: built.character.type, tags: built.character.tags });
    }

    pushUndo(state, "import_characters", `批量创建角色：${created.length} 个`, ["characters"], { count: created.length });
    state.characters.push(...newCharacters);
    writeState(state);
    sendJson(res, 201, { state: publicState(state), created });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/characters") {
    if (!requireAdmin(req, res)) return;
    const built = buildGmCharacter(body);
    if (built.error) return sendJson(res, built.status, { error: built.error });
    pushUndo(state, "create_character", `创建角色：${built.character.name}`, ["characters"]);
    state.characters.push(built.character);
    writeState(state);
    sendJson(res, 201, publicState(state));
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/characters") {
    if (!requireAdmin(req, res)) return;
    const characters = state.characters.filter((character) => character.active !== false);
    if (!characters.length) return sendJson(res, 400, { error: "No active characters to delete." });

    pushUndo(state, "delete_all_characters", `删除全部角色：${characters.length} 个`, ["characters", "chats", "relationships", "chatMemberRequests"], { count: characters.length });
    const characterIds = new Set(characters.map((character) => character.id));
    const now = new Date().toISOString();
    for (const character of characters) {
      character.active = false;
      character.deletedAt = now;
    }
    for (const chat of state.chats) {
      chat.memberIds = (chat.memberIds || []).filter((memberId) => !characterIds.has(memberId));
    }
    state.relationships = (state.relationships || []).filter((relationship) => (
      !characterIds.has(relationship.requesterId) && !characterIds.has(relationship.targetId)
    ));
    state.chatMemberRequests = (state.chatMemberRequests || []).filter((request) => (
      !characterIds.has(request.requesterId) && !characterIds.has(request.targetId)
    ));
    writeState(state);
    sendJson(res, 200, {
      state: publicState(state),
      deleted: characters.map((character) => ({ id: character.id, name: character.name, handle: character.handle, type: character.type }))
    });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/characters/")) {
    if (!requireAdmin(req, res)) return;
    const characterId = decodeURIComponent(url.pathname.split("/").pop());
    const character = state.characters.find((item) => item.id === characterId);
    if (!character) return sendJson(res, 404, { error: "Character not found." });
    if (character.active === false) {
      sendJson(res, 200, publicState(state));
      return;
    }

    pushUndo(state, "delete_character", `删除角色：${character.name}`, ["characters", "chats", "relationships", "chatMemberRequests"], { characterId });
    character.active = false;
    character.deletedAt = new Date().toISOString();
    for (const chat of state.chats) {
      chat.memberIds = (chat.memberIds || []).filter((memberId) => memberId !== character.id);
    }
    state.relationships = (state.relationships || []).filter((relationship) => (
      relationship.requesterId !== character.id && relationship.targetId !== character.id
    ));
    state.chatMemberRequests = (state.chatMemberRequests || []).filter((request) => (
      request.requesterId !== character.id && request.targetId !== character.id
    ));
    writeState(state);
    sendJson(res, 200, publicState(state));
    return;
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/characters/")) {
    if (!requireAdmin(req, res)) return;
    const characterId = decodeURIComponent(url.pathname.split("/").pop());
    const character = state.characters.find((item) => item.id === characterId);
    if (!character) return sendJson(res, 404, { error: "Character not found." });
    pushUndo(state, "edit_character", `编辑角色：${character.name}`, ["characters"], { characterId });
    if (body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name) return sendJson(res, 400, { error: "Character name is required." });
      if (name.length > 40) return sendJson(res, 400, { error: "Character name is too long." });
      character.name = name;
      character.avatarText = avatarText(name);
    }
    if (body.handle !== undefined) {
      const handle = normalizeHandle(body.handle, character.name);
      if (state.characters.some((item) => item.id !== character.id && item.handle.toLowerCase() === handle.toLowerCase())) {
        return sendJson(res, 409, { error: "That handle is already taken." });
      }
      if (isAccountLoginTaken(state, handle, character.id)) {
        return sendJson(res, 409, { error: "That handle conflicts with an account username." });
      }
      character.handle = handle;
    }
    if (body.color !== undefined) character.color = String(body.color).trim() || character.color;
    if (body.avatarData !== undefined) {
      try {
        character.avatarData = validateDataUrl(body.avatarData, MAX_AVATAR_DATA_URL_LENGTH, "Avatar");
      } catch (error) {
        return sendJson(res, 400, { error: error.message });
      }
    }
    if (body.note !== undefined) character.note = String(body.note).trim();
    if (body.tags !== undefined) character.tags = normalizeTags(body.tags);
    if (body.active !== undefined) character.active = Boolean(body.active);
    writeState(state);
    sendJson(res, 200, publicState(state));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/follows") {
    const requester = authorizeAuthor(req, res, state, body.requesterId);
    const target = findCharacter(state, body.targetId);
    if (!requester) return;
    if (!target) return sendJson(res, 400, { error: "Target account not found." });
    if (requester.id === target.id) return sendJson(res, 400, { error: "You cannot follow yourself." });

    const existing = state.relationships.find((relationship) => (
      relationship.requesterId === requester.id &&
      relationship.targetId === target.id &&
      relationship.status !== "rejected"
    ));
    if (existing) {
      sendJson(res, 200, publicState(state));
      return;
    }

    state.relationships.push({
      id: id("rel"),
      requesterId: requester.id,
      targetId: target.id,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    writeState(state);
    sendJson(res, 201, publicState(state));
    return;
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/follows/")) {
    if (!requireAdmin(req, res)) return;
    const relationshipId = decodeURIComponent(url.pathname.split("/").pop());
    const relationship = state.relationships.find((item) => item.id === relationshipId);
    if (!relationship) return sendJson(res, 404, { error: "Follow request not found." });
    if (!["accepted", "rejected"].includes(body.status)) {
      return sendJson(res, 400, { error: "Follow status must be accepted or rejected." });
    }
    pushUndo(state, "update_follow", `Set follow ${body.status}`, ["relationships"], { relationshipId });
    relationship.status = body.status;
    relationship.updatedAt = new Date().toISOString();
    writeState(state);
    sendJson(res, 200, publicState(state));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/direct-chats") {
    const requester = authorizeAuthor(req, res, state, body.requesterId);
    const target = findCharacter(state, body.targetId);
    if (!requester) return;
    if (!target) return sendJson(res, 400, { error: "Target account not found." });
    if (requester.id === target.id) return sendJson(res, 400, { error: "Choose another account for a direct chat." });
    if (!isAdmin(req) && !canDirectMessage(state, requester.id, target.id)) {
      return sendJson(res, 403, { error: "GM must approve the follow request before private messages are allowed." });
    }

    let chat = directChatFor(state, requester.id, target.id);
    if (!chat) {
      if (isAdmin(req)) pushUndo(state, "create_direct_chat", `创建私聊：${requester.name} / ${target.name}`, ["chats"], { requesterId: requester.id, targetId: target.id });
      chat = {
        id: id("chat"),
        name: `${requester.name} / ${target.name}`,
        type: "direct",
        memberIds: [requester.id, target.id],
        isPublic: false,
        createdBy: requester.id,
        createdAt: new Date().toISOString()
      };
      state.chats.push(chat);
      writeState(state);
    }

    sendJson(res, 201, { state: publicState(state), chatId: chat.id });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/player-chats") {
    const creator = authorizeAuthor(req, res, state, body.creatorId);
    if (!creator) return;

    const name = String(body.name || "").trim().slice(0, 80);
    if (!name) return sendJson(res, 400, { error: "Chat name is required." });

    const requestedMembers = unique(Array.isArray(body.memberIds) ? body.memberIds : []);
    const memberIds = unique([creator.id, ...requestedMembers]);
    const invalidMember = memberIds.find((memberId) => !findCharacter(state, memberId));
    if (invalidMember) return sendJson(res, 400, { error: "One or more chat members could not be found." });

    if (!isAdmin(req)) {
      const blockedMember = memberIds.find((memberId) => memberId !== creator.id && !canDirectMessage(state, creator.id, memberId));
      if (blockedMember) {
        return sendJson(res, 403, { error: "GM must approve follows before those accounts can join a private chat." });
      }
    }

    const chat = {
      id: id("chat"),
      name,
      type: "group",
      memberIds,
      isPublic: false,
      createdBy: creator.id,
      createdAt: new Date().toISOString()
    };
    if (isAdmin(req)) pushUndo(state, "create_private_chat", `创建私密群聊：${name}`, ["chats"], { creatorId: creator.id, memberCount: memberIds.length });
    state.chats.push(chat);
    writeState(state);
    sendJson(res, 201, { state: publicState(state), chatId: chat.id });
    return;
  }

  const chatMemberRequestMatch = url.pathname.match(/^\/api\/chats\/([^/]+)\/member-requests$/);
  if (req.method === "POST" && chatMemberRequestMatch) {
    const chatId = decodeURIComponent(chatMemberRequestMatch[1]);
    const chat = state.chats.find((item) => item.id === chatId);
    if (!chat) return sendJson(res, 404, { error: "Chat not found." });
    const requester = authorizeAuthor(req, res, state, body.requesterId);
    if (!requester) return;
    const target = findCharacter(state, body.targetId);
    if (!target) return sendJson(res, 400, { error: "Target character not found." });
    const action = body.action === "remove" ? "remove" : "add";

    if (action === "add" && chat.memberIds.includes(target.id)) {
      return sendJson(res, 400, { error: "That character is already in this chat." });
    }
    if (action === "remove" && !chat.memberIds.includes(target.id)) {
      return sendJson(res, 400, { error: "That character is not in this chat." });
    }
    if (action === "remove" && chat.memberIds.length <= 1) {
      return sendJson(res, 400, { error: "A chat needs at least one member." });
    }

    const allowed = canRequestChatMemberChange(req, state, chat, requester, target, action);
    if (!allowed.ok) return sendJson(res, allowed.status, { error: allowed.error });

    const existing = (state.chatMemberRequests || []).find((request) => (
      request.chatId === chat.id &&
      request.targetId === target.id &&
      request.action === action &&
      request.status === "pending"
    ));
    if (existing) {
      sendJson(res, 200, { state: publicState(state), requestId: existing.id, existing: true });
      return;
    }

    const request = {
      id: id("chat_req"),
      chatId: chat.id,
      requesterId: requester.id,
      targetId: target.id,
      action,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state.chatMemberRequests.push(request);
    writeState(state);
    sendJson(res, 201, { state: publicState(state), requestId: request.id });
    return;
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/chat-member-requests/")) {
    if (!requireAdmin(req, res)) return;
    const requestId = decodeURIComponent(url.pathname.split("/").pop());
    const request = state.chatMemberRequests.find((item) => item.id === requestId);
    if (!request) return sendJson(res, 404, { error: "Chat member request not found." });
    if (request.status !== "pending") {
      return sendJson(res, 400, { error: "This request has already been handled." });
    }
    if (!["accepted", "rejected"].includes(body.status)) {
      return sendJson(res, 400, { error: "Request status must be accepted or rejected." });
    }

    const chat = state.chats.find((item) => item.id === request.chatId);
    if (!chat) return sendJson(res, 404, { error: "Chat not found." });
    const target = findCharacter(state, request.targetId);
    if (body.status === "accepted" && request.action === "add" && !target) {
      return sendJson(res, 400, { error: "Target character is no longer active." });
    }

    const targetName = target?.name || request.targetId;
    const actionLabel = request.action === "add" ? "邀请" : "移除";
    pushUndo(state, "update_chat_member_request", `${body.status === "accepted" ? "批准" : "拒绝"}群聊${actionLabel}：${chat.name} / ${targetName}`, ["chats", "chatMemberRequests"], { requestId, chatId: chat.id, targetId: request.targetId });
    request.status = body.status;
    request.updatedAt = new Date().toISOString();
    if (body.status === "accepted") {
      if (request.action === "add" && !chat.memberIds.includes(request.targetId)) {
        chat.memberIds.push(request.targetId);
      }
      if (request.action === "remove") {
        chat.memberIds = chat.memberIds.filter((memberId) => memberId !== request.targetId);
      }
    }
    writeState(state);
    sendJson(res, 200, publicState(state));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/feed/posts") {
    const author = authorizeAuthor(req, res, state, body.authorId);
    const content = String(body.content || "").trim();
    if (!author) return;
    if (content.length > MAX_POST_CONTENT_LENGTH) return sendJson(res, 400, { error: `Post content can be up to ${MAX_POST_CONTENT_LENGTH} characters.` });

    let attachment = null;
    if (body.attachment?.dataUrl) {
      try {
        attachment = {
          type: "image",
          dataUrl: validateDataUrl(body.attachment.dataUrl, MAX_POST_IMAGE_DATA_URL_LENGTH, "Post image"),
          name: String(body.attachment.name || "image").trim().slice(0, 80)
        };
      } catch (error) {
        return sendJson(res, 400, { error: error.message });
      }
    }

    if (!content && !attachment) return sendJson(res, 400, { error: "Post content or image is required." });
    const requestedDayId = body.dayId !== undefined ? resolveTimelineDayId(state, body.dayId) : "";
    if (body.dayId && !requestedDayId) return sendJson(res, 400, { error: "Timeline day was not found." });
    const dayId = requestedDayId || state.settings.currentDayId || "";
    const explicitGameTime = body.gameTime !== undefined ? String(body.gameTime || "").trim() : "";
    if (!explicitGameTime && state.settings.autoAdvanceTimelineTime === true) advanceTimelineGameTime(state);
    const gameTime = explicitGameTime || String(state.settings.gameTime).trim();
    const createdAt = new Date().toISOString();
    if (isAdmin(req)) pushUndo(state, "create_post", `以 ${author.name} 发布帖子`, ["posts"], { authorId: author.id });
    state.posts.push({
      id: id("post"),
      authorId: author.id,
      content,
      attachment,
      isAnonymous: body.isAnonymous === true,
      dayId,
      gameTime,
      timelineSortKey: buildTimelineSortKey(state, dayId, gameTime),
      createdAt,
      metrics: normalizeMetrics(body.metrics),
      replies: []
    });
    writeState(state);
    sendJson(res, 201, publicState(state));
    return;
  }

  const replyMatch = url.pathname.match(/^\/api\/feed\/posts\/([^/]+)\/replies\/([^/]+)$/);
  if (replyMatch) {
    const postId = decodeURIComponent(replyMatch[1]);
    const replyId = decodeURIComponent(replyMatch[2]);
    const post = state.posts.find((item) => item.id === postId);
    if (!post) return sendJson(res, 404, { error: "Post not found." });
    if (req.method !== "DELETE") return sendJson(res, 404, { error: "API route not found." });

    post.replies ||= [];
    const reply = findPostReply(post, replyId);
    if (!reply) return sendJson(res, 404, { error: "Reply not found." });

    if (!isAdmin(req)) {
      const actor = authorizeAuthor(req, res, state, body.actorId || body.authorId || body.requesterId);
      if (!actor) return;
      if (reply.authorId !== actor.id) return sendJson(res, 403, { error: "Only the reply author or GM can delete this reply." });
    }

    const author = findCharacter(state, reply.authorId);
    pushUndo(state, "delete_reply", `删除回复：${author?.name || "Unknown"}`, ["posts"], { postId, replyId, authorId: reply.authorId });
    removePostReply(post, replyId);
    writeState(state);
    sendJson(res, 200, publicState(state));
    return;
  }

  const postMatch = url.pathname.match(/^\/api\/feed\/posts\/([^/]+)(?:\/([^/]+))?$/);
  if (postMatch) {
    const postId = decodeURIComponent(postMatch[1]);
    const action = postMatch[2];
    const post = state.posts.find((item) => item.id === postId);
    if (!post) return sendJson(res, 404, { error: "Post not found." });

    if (req.method === "POST" && action === "like") {
      post.metrics.likes = clampInt(post.metrics.likes, 0) + 1;
      writeState(state);
      sendJson(res, 200, publicState(state));
      return;
    }

    if (req.method === "POST" && action === "replies") {
      const author = authorizeAuthor(req, res, state, body.authorId);
      const content = String(body.content || "").trim();
      if (!author) return;
      if (!content) return sendJson(res, 400, { error: "Reply content is required." });
      if (content.length > MAX_REPLY_CONTENT_LENGTH) return sendJson(res, 400, { error: `Reply content can be up to ${MAX_REPLY_CONTENT_LENGTH} characters.` });
      post.replies ||= [];
      const parentReplyId = String(body.parentReplyId || "").trim();
      if (parentReplyId && !findPostReply(post, parentReplyId)) return sendJson(res, 404, { error: "Parent reply not found." });
      if (isAdmin(req)) pushUndo(state, "create_reply", `Reply to post as ${author.name}`, ["posts"], { postId, authorId: author.id });
      post.replies.push({
        id: id("reply"),
        authorId: author.id,
        content,
        parentReplyId,
        isAnonymous: body.isAnonymous === true,
        gameTime: String(body.gameTime || state.settings.gameTime).trim(),
        createdAt: new Date().toISOString()
      });
      writeState(state);
      sendJson(res, 201, publicState(state));
      return;
    }

    if (req.method === "PATCH" && !action) {
      if (!requireAdmin(req, res)) return;
      pushUndo(state, "edit_post", "编辑帖子数据 / 时间", ["posts"], { postId });
      if (body.authorId && findCharacter(state, body.authorId)) post.authorId = body.authorId;
      if (body.content !== undefined) {
        const nextContent = String(body.content).trim();
        if (nextContent.length > MAX_POST_CONTENT_LENGTH) return sendJson(res, 400, { error: `Post content can be up to ${MAX_POST_CONTENT_LENGTH} characters.` });
        post.content = nextContent;
      }
      if (body.gameTime !== undefined) post.gameTime = String(body.gameTime).trim();
      if (body.dayId !== undefined) {
        const nextDayId = resolveTimelineDayId(state, body.dayId);
        if (body.dayId && !nextDayId) return sendJson(res, 400, { error: "Timeline day was not found." });
        post.dayId = nextDayId;
      }
      if (body.gameTime !== undefined || body.dayId !== undefined) {
        post.timelineSortKey = buildTimelineSortKey(state, post.dayId, post.gameTime);
      }
      if (body.metrics !== undefined) post.metrics = normalizeMetrics(body.metrics);
      writeState(state);
      sendJson(res, 200, publicState(state));
      return;
    }

    if (req.method === "DELETE" && !action) {
      if (!requireAdmin(req, res)) return;
      pushUndo(state, "delete_post", "删除帖子", ["posts"], { postId });
      state.posts = state.posts.filter((item) => item.id !== postId);
      writeState(state);
      sendJson(res, 200, publicState(state));
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/api/chats") {
    if (!requireAdmin(req, res)) return;
    const name = String(body.name || "").trim();
    if (!name) return sendJson(res, 400, { error: "Chat name is required." });
    const memberIds = unique(Array.isArray(body.memberIds) ? body.memberIds : []);
    pushUndo(state, "create_chat", `创建群聊：${name}`, ["chats"], { memberCount: memberIds.length });
    state.chats.push({
      id: id("chat"),
      name,
      type: body.type === "direct" ? "direct" : "group",
      memberIds,
      isPublic: Boolean(body.isPublic),
      createdBy: "",
      createdAt: new Date().toISOString()
    });
    writeState(state);
    sendJson(res, 201, publicState(state));
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/chats/")) {
    const chatId = decodeURIComponent(url.pathname.split("/").pop());
    const chat = state.chats.find((item) => item.id === chatId);
    if (!chat) return sendJson(res, 404, { error: "Chat not found." });

    let actor = null;
    if (!isAdmin(req)) {
      actor = authorizeAuthor(req, res, state, body.actorId || body.authorId || body.requesterId);
      if (!actor) return;
      if (chat.isPublic || chat.createdBy !== actor.id) {
        return sendJson(res, 403, { error: "Only the creator or GM can delete this chat." });
      }
    }

    pushUndo(state, "delete_chat", `删除聊天：${chat.name}`, ["chats", "messages", "chatMemberRequests"], { chatId, actorId: actor?.id || "" });
    state.chats = state.chats.filter((item) => item.id !== chat.id);
    state.messages = state.messages.filter((message) => message.chatId !== chat.id);
    state.chatMemberRequests = (state.chatMemberRequests || []).filter((request) => request.chatId !== chat.id);
    writeState(state);
    sendJson(res, 200, publicState(state));
    return;
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/chats/")) {
    if (!requireAdmin(req, res)) return;
    const chatId = decodeURIComponent(url.pathname.split("/").pop());
    const chat = state.chats.find((item) => item.id === chatId);
    if (!chat) return sendJson(res, 404, { error: "Chat not found." });
    pushUndo(state, "edit_chat", `编辑群聊：${chat.name}`, ["chats"], { chatId });
    if (body.name !== undefined) chat.name = String(body.name).trim() || chat.name;
    if (body.memberIds !== undefined) chat.memberIds = unique(Array.isArray(body.memberIds) ? body.memberIds : []);
    if (body.isPublic !== undefined) chat.isPublic = Boolean(body.isPublic);
    if (body.type !== undefined) chat.type = body.type === "direct" ? "direct" : "group";
    writeState(state);
    sendJson(res, 200, publicState(state));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/messages") {
    const author = authorizeAuthor(req, res, state, body.authorId);
    const chat = state.chats.find((item) => item.id === body.chatId);
    const content = String(body.content || "").trim();
    if (!author) return;
    if (!chat) return sendJson(res, 400, { error: "Chat not found." });
    if (!ensureChatAccess(req, res, chat, author)) return;

    let attachment = null;
    if (body.attachment?.dataUrl) {
      try {
        attachment = {
          type: "image",
          dataUrl: validateDataUrl(body.attachment.dataUrl, MAX_CHAT_IMAGE_DATA_URL_LENGTH, "Chat image"),
          name: String(body.attachment.name || "image").trim().slice(0, 80)
        };
      } catch (error) {
        return sendJson(res, 400, { error: error.message });
      }
    }

    if (!content && !attachment) return sendJson(res, 400, { error: "消息内容或图片不能为空。" });
    if (isAdmin(req)) pushUndo(state, "send_message", `Send message as ${author.name}`, ["messages"], { chatId: chat.id, authorId: author.id });
    state.messages.push({
      id: id("msg"),
      chatId: chat.id,
      authorId: author.id,
      isAnonymous: body.isAnonymous === true,
      content,
      attachment,
      gameTime: String(body.gameTime || state.settings.gameTime).trim(),
      createdAt: new Date().toISOString()
    });
    writeState(state);
    sendJson(res, 201, publicState(state));
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/messages/")) {
    if (!requireAdmin(req, res)) return;
    const messageId = decodeURIComponent(url.pathname.split("/").pop());
    const message = state.messages.find((item) => item.id === messageId);
    if (!message) return sendJson(res, 404, { error: "消息不存在。" });
    pushUndo(state, "delete_message", "删除消息", ["messages"], { messageId, chatId: message.chatId });
    state.messages = state.messages.filter((item) => item.id !== messageId);
    writeState(state);
    sendJson(res, 200, publicState(state));
    return;
  }

  sendJson(res, 404, { error: "API route not found." });
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.resolve(PUBLIC_DIR, `.${requested}`);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallbackData) => {
        if (fallbackError) return sendText(res, 404, "Not found");
        res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-store" });
        res.end(fallbackData);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
}

function exportMarkdown(state) {
  const byId = new Map(state.characters.map((character) => [character.id, character]));
  const lines = [
    "# SNS / K-LINE 导出",
    "",
    `- 游戏时间：${state.settings.gameTime}`,
    `- 导出时间：${new Date().toLocaleString("zh-CN")}`,
    ""
  ];

  lines.push("## 校历 / 课程表", "");
  for (const day of state.calendarDays || []) {
    const current = day.id === state.settings.currentDayId ? "（当前日）" : "";
    lines.push(`### ${day.label} ${day.dateLabel || ""} ${current}`.trim(), "");
    if (day.note) lines.push(day.note, "");
    for (const item of day.schedule || []) {
      const details = [item.location, item.note].filter(Boolean).join(" / ");
      lines.push(`- ${item.time || ""} ${item.subject || ""}${details ? `：${details}` : ""}`.trim());
    }
    if (day.events?.length) {
      lines.push("");
      lines.push("事件：");
      for (const event of day.events) {
        const status = event.triggeredAt ? "已触发" : (event.isPublic ? "玩家可见" : "仅 GM 可见");
        lines.push(`- [${event.type}] ${event.title} (${status})`);
        if (event.detail) lines.push(`  ${event.detail}`);
      }
    }
    lines.push("");
  }

  lines.push("## 公告 / 传闻板", "");
  for (const bulletin of [...(state.bulletins || [])].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
    const author = byId.get(bulletin.authorId);
    lines.push(`### ${bulletin.gameTime || ""} | ${bulletin.title}`.trim());
    lines.push("");
    lines.push(`类型：${bulletin.type}${author ? ` / ${author.name}` : ""}${bulletin.isPublic ? "" : " / 仅 GM 可见"}`);
    if (bulletin.content) {
      lines.push("");
      lines.push(bulletin.content);
    }
    lines.push("");
  }

  lines.push("## SNS 时间线", "");
  for (const post of [...state.posts].sort(compareTimelinePosts)) {
    const author = byId.get(post.authorId);
    const authorLabel = post.isAnonymous
      ? `匿名${author ? `（${author.name} ${author.handle || ""}）` : ""}`
      : `${author?.name || "Unknown"} ${author?.handle || ""}`;
    lines.push(`### ${post.gameTime} | ${authorLabel}`);
    lines.push("");
    lines.push(post.content);
    if (post.attachment?.type === "image") {
      lines.push("");
      lines.push(`[图片] ${post.attachment.name || "image"}`);
    }
    lines.push("");
    lines.push(`点赞 ${post.metrics.likes} / 转发 ${post.metrics.reposts} / 浏览 ${post.metrics.views}`);
    if (post.replies?.length) {
      lines.push("");
      lines.push("回复：");
      appendPostReplyMarkdown(lines, post.replies, byId);
    }
    lines.push("");
  }

  lines.push("## 聊天记录", "");
  for (const chat of state.chats) {
    lines.push(`### ${chat.name}`, "");
    const messages = state.messages.filter((message) => message.chatId === chat.id).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    for (const message of messages) {
      const author = byId.get(message.authorId);
      const authorLabel = message.isAnonymous
        ? `匿名${author ? `（${author.name}）` : ""}`
        : (author?.name || "Unknown");
      lines.push(`- ${message.gameTime} | ${authorLabel}：${message.content}`);
      if (message.attachment?.type === "image") {
        lines.push(`  - [图片] ${message.attachment.name || "image"}`);
      }
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function exportChatMarkdown(state) {
  const byId = new Map(state.characters.map((character) => [character.id, character]));
  const currentDay = (state.calendarDays || []).find((day) => day.id === state.settings.currentDayId);
  const lines = [
    "# K-LINE 聊天导出",
    "",
    `- 游戏时间：${state.settings.gameTime || ""}`,
    `- 当前日期：${currentDay ? `${currentDay.label} ${currentDay.dateLabel || ""}`.trim() : state.settings.schoolDay || ""}`,
    `- 导出时间：${new Date().toLocaleString("zh-CN")}`,
    ""
  ];

  const messagesByChat = new Map();
  for (const message of [...(state.messages || [])].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
    const list = messagesByChat.get(message.chatId) || [];
    list.push(message);
    messagesByChat.set(message.chatId, list);
  }

  const chats = [...(state.chats || [])].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const chat of chats) {
    const chatType = chat.type === "direct" ? "私聊" : (chat.isPublic ? "公开群聊" : "私密群聊");
    const members = (chat.memberIds || []).map((memberId) => byId.get(memberId)?.name || memberId).filter(Boolean);
    lines.push(`## ${chat.name}`, "");
    lines.push(`- 类型：${chatType}`);
    lines.push(`- 成员：${members.length ? members.join("、") : "未设置"}`, "");

    const messages = messagesByChat.get(chat.id) || [];
    if (!messages.length) {
      lines.push("_没有消息记录。_", "");
      continue;
    }

    for (const message of messages) {
      const author = byId.get(message.authorId);
      const authorLabel = message.isAnonymous
        ? `匿名${author ? `（${author.name}）` : ""}`
        : (author?.name || "Unknown");
      const content = String(message.content || "").trim() || "[空消息]";
      lines.push(`- ${message.gameTime || ""} | ${authorLabel}：${content}`);
      if (message.attachment?.type === "image") {
        lines.push(`  - [图片] ${message.attachment.name || "image"}`);
      }
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

ensureState();

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && (url.pathname === "/healthz" || url.pathname === "/api/health")) {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (!url.pathname.startsWith("/api/")) {
    serveStatic(req, res, url);
    return;
  }
  const forceAccountView = String(req.headers["x-view-mode"] || "").toLowerCase() === "account";
  requestContext.run({ adminView: isAdmin(req) && !forceAccountView }, () => {
    routeApi(req, res, url).catch((error) => {
      console.error(error);
      sendJson(res, 500, { error: error.message || "Internal server error." });
    });
  });
}).listen(PORT, HOST, () => {
  console.log(`TRPG SNS system running at http://localhost:${PORT}`);
  console.log(`GM PIN: ${GM_PIN === "gm" ? "gm (set GM_PIN for real sessions)" : "configured"}`);
});
