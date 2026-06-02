const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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

function ensureState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STATE_FILE)) {
    writeState(createInitialState());
  }
}

function readState() {
  ensureState();
  const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  return normalizeState(state);
}

function writeState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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
  state.version = Math.max(Number(state.version || 1), 5);
  state.settings ||= {};
  state.settings.gameTime ||= "开学首日 18:12";
  state.settings.schoolDay ||= "周一";
  state.settings.currentDayId ||= "day_mon";
  state.settings.feedName ||= "Kokubayashi SNS";
  state.settings.chatName ||= "K-LINE";
  state.characters ||= [];
  state.chats ||= [];
  state.calendarDays ||= defaultCalendarDays();
  state.posts ||= [];
  state.messages ||= [];
  state.bulletins ||= [];
  state.emojis ||= defaultEmojis();
  state.relationships ||= [];
  state.auditLog ||= [];
  state.undoStack ||= [];

  for (const character of state.characters) {
    character.avatarText ||= avatarText(character.name);
    character.handle = `@${String(character.handle || makeHandle(character.name)).replace(/^@/, "")}`;
    character.type ||= "npc";
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

  state.calendarDays = normalizeCalendarDays(state.calendarDays);
  if (!state.calendarDays.some((day) => day.id === state.settings.currentDayId)) {
    state.settings.currentDayId = state.calendarDays[0]?.id || "day_mon";
  }
  const currentDay = state.calendarDays.find((day) => day.id === state.settings.currentDayId);
  if (currentDay) state.settings.schoolDay = currentDay.label;

  for (const post of state.posts) {
    post.metrics = normalizeMetrics(post.metrics);
    post.replies ||= [];
    if (post.imageData && !post.attachment) {
      post.attachment = { type: "image", dataUrl: post.imageData, name: "image" };
      delete post.imageData;
    }
  }

  for (const message of state.messages) {
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

function defaultCalendarDays() {
  return [
    makeCalendarDay("day_mon", "周一", "开学首日", [
      ["08:20", "朝会", "1-A 教室", "出席确认"],
      ["09:00", "现代文", "1-A 教室", "课本第 1 章"],
      ["10:10", "数学", "1-A 教室", "小测验"],
      ["11:20", "英语", "1-A 教室", "听力练习"],
      ["12:20", "午休", "中庭 / 食堂", ""],
      ["13:20", "体育", "体育馆", "运动服"],
      ["14:30", "班会", "1-A 教室", "社团登记"]
    ]),
    makeCalendarDay("day_tue", "周二", "开学第二日", [
      ["08:20", "朝会", "1-A 教室", ""],
      ["09:00", "世界史", "1-A 教室", "古代文明"],
      ["10:10", "化学", "实验室", "安全说明"],
      ["11:20", "数学", "1-A 教室", ""],
      ["12:20", "午休", "食堂", ""],
      ["13:20", "美术", "美术室", "素描"],
      ["14:30", "社团时间", "各活动室", ""]
    ]),
    makeCalendarDay("day_wed", "周三", "开学第三日", [
      ["08:20", "朝会", "1-A 教室", ""],
      ["09:00", "英语", "1-A 教室", "单词测试"],
      ["10:10", "物理", "理科教室", "力学导入"],
      ["11:20", "现代文", "1-A 教室", ""],
      ["12:20", "午休", "中庭", ""],
      ["13:20", "音乐", "音乐室", "合唱练习"],
      ["14:30", "自习", "图书室", ""]
    ]),
    makeCalendarDay("day_thu", "周四", "开学第四日", [
      ["08:20", "朝会", "1-A 教室", ""],
      ["09:00", "数学", "1-A 教室", "函数"],
      ["10:10", "古典", "1-A 教室", ""],
      ["11:20", "生物", "理科教室", "观察记录"],
      ["12:20", "午休", "食堂", ""],
      ["13:20", "家庭科", "家庭科教室", ""],
      ["14:30", "社团时间", "各活动室", ""]
    ]),
    makeCalendarDay("day_fri", "周五", "开学第五日", [
      ["08:20", "朝会", "1-A 教室", ""],
      ["09:00", "现代文", "1-A 教室", "作文"],
      ["10:10", "英语", "1-A 教室", ""],
      ["11:20", "地理", "1-A 教室", "地图演习"],
      ["12:20", "午休", "中庭 / 食堂", ""],
      ["13:20", "体育", "操场", "雨天改体育馆"],
      ["14:30", "周末班会", "1-A 教室", "值日确认"]
    ]),
    makeCalendarDay("day_sat", "周六", "周末", [
      ["10:00", "补习 / 社团", "校内", "参加者确认"],
      ["13:00", "自由活动", "校内", ""]
    ]),
    makeCalendarDay("day_sun", "周日", "休校日", [
      ["全天", "休校", "校外", "无正式课程"]
    ])
  ];
}

function makeCalendarDay(idValue, label, dateLabel, rows) {
  return {
    id: idValue,
    label,
    dateLabel,
    note: "",
    schedule: rows.map(([time, subject, location, note], index) => ({
      id: `${idValue}_${index + 1}`,
      time,
      subject,
      location,
      note
    }))
  };
}

function normalizeCalendarDays(days) {
  const fallback = defaultCalendarDays();
  const source = Array.isArray(days) && days.length ? days : fallback;
  return source.map((day, index) => {
    const fallbackDay = fallback[index] || fallback[0];
    return {
      id: String(day.id || fallbackDay.id || id("day")),
      label: String(day.label || fallbackDay.label || `Day ${index + 1}`).trim(),
      dateLabel: String(day.dateLabel || day.date || fallbackDay.dateLabel || "").trim(),
      note: String(day.note || "").trim(),
      schedule: normalizeSchedule(day.schedule),
      events: normalizeCalendarEvents(day.events).map((event) => ({ ...event, dayId: String(day.id || fallbackDay.id || "") }))
    };
  });
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

function normalizeCalendarEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.map((event, index) => ({
    id: event.id || id("event"),
    dayId: String(event.dayId || "").trim(),
    type: normalizeEventType(event.type),
    title: String(event.title || `Event ${index + 1}`).trim(),
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
    title: String(bulletin.title || `Bulletin ${index + 1}`).trim(),
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
    label: String(entry.label || "GM update").trim(),
    details: entry.details && typeof entry.details === "object" ? entry.details : {},
    createdAt: entry.createdAt || new Date().toISOString()
  })).slice(0, 80);
}

function normalizeUndoStack(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry) => ({
    id: entry.id || id("undo"),
    action: String(entry.action || "update").trim(),
    label: String(entry.label || "GM update").trim(),
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
  const adminView = Boolean(state.__adminView);
  const calendarDays = (state.calendarDays || []).map((day) => ({
    ...day,
    events: adminView
      ? (day.events || [])
      : (day.events || []).filter((event) => event.isPublic || event.triggeredAt)
  }));

  return {
    ...state,
    characters: state.characters.map(({ accessToken, auth, ...character }) => character),
    calendarDays,
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

function normalizeShortcode(value) {
  const shortcode = String(value || "").trim().replace(/^:+|:+$/g, "").toLowerCase();
  if (!/^[a-z0-9_\-]{1,24}$/.test(shortcode)) return "";
  return shortcode;
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
  pushAudit(state, "undo", `Undid ${entry.label}`, { undoId: entry.id, action: entry.action });
  return entry;
}

async function routeApi(req, res, url) {
  const state = readState();
  Object.defineProperty(state, "__adminView", { value: isAdmin(req), enumerable: false });

  if (req.method === "GET" && url.pathname === "/api/state") {
    sendJson(res, 200, publicState(state));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/gm/check") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/export.md") {
    sendText(res, 200, exportMarkdown(state), "text/markdown; charset=utf-8");
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
    if (!title && !content) return sendJson(res, 400, { error: "Bulletin title or content is required." });
    const author = body.authorId ? findCharacter(state, body.authorId) : null;
    const now = new Date().toISOString();
    pushUndo(state, "create_bulletin", title || "Create bulletin", ["bulletins"], { type: body.type || "bulletin" });
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
    if (!bulletin) return sendJson(res, 404, { error: "Bulletin not found." });

    if (req.method === "PATCH") {
      pushUndo(state, "edit_bulletin", `Edit bulletin: ${bulletin.title}`, ["bulletins"], { bulletinId });
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
      pushUndo(state, "delete_bulletin", `Delete bulletin: ${bulletin.title}`, ["bulletins"], { bulletinId });
      state.bulletins = state.bulletins.filter((item) => item.id !== bulletinId);
      writeState(state);
      sendJson(res, 200, publicState(state));
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/api/player-accounts") {
    const name = String(body.name || "").trim();
    if (!name) return sendJson(res, 400, { error: "Account name is required." });
    if (name.length > 40) return sendJson(res, 400, { error: "Account name is too long." });
    const passcode = normalizePasscode(body.passcode);
    if (!passcode) return sendJson(res, 400, { error: "Passcode must be 4 to 80 characters." });
    const handle = normalizeHandle(body.handle, name);
    if (state.characters.some((character) => character.handle.toLowerCase() === handle.toLowerCase())) {
      return sendJson(res, 409, { error: "That handle is already taken." });
    }

    let avatarData = "";
    try {
      avatarData = validateDataUrl(body.avatarData, MAX_AVATAR_DATA_URL_LENGTH, "Avatar");
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }

    const accessToken = crypto.randomBytes(24).toString("hex");
    const salt = crypto.randomBytes(12).toString("hex");
    const character = makeCharacter(id("acct"), name, handle, "account");
    character.avatarData = avatarData;
    character.accessToken = accessToken;
    character.auth = { salt, passcodeHash: hashPasscode(passcode, salt) };
    character.note = "Self-created player account";
    state.characters.push(character);

    for (const chat of state.chats) {
      if (chat.isPublic && !chat.memberIds.includes(character.id)) {
        chat.memberIds.push(character.id);
      }
    }

    writeState(state);
    sendJson(res, 201, {
      state: publicState(state),
      accountId: character.id,
      accountToken: accessToken
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/player-accounts/login") {
    const handle = String(body.handle || "").replace(/^@/, "").trim().toLowerCase();
    const passcode = normalizePasscode(body.passcode);
    if (!handle || !passcode) return sendJson(res, 400, { error: "Handle and passcode are required." });

    const character = state.characters.find((item) => item.type === "account" && item.handle.replace(/^@/, "").toLowerCase() === handle);
    if (!character?.auth?.salt || !character?.auth?.passcodeHash) {
      return sendJson(res, 401, { error: "Account not found or cannot be recovered." });
    }
    if (hashPasscode(passcode, character.auth.salt) !== character.auth.passcodeHash) {
      return sendJson(res, 401, { error: "Handle or passcode is incorrect." });
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
      character.handle = handle;
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

  if (req.method === "PATCH" && url.pathname === "/api/settings") {
    if (!requireAdmin(req, res)) return;
    pushUndo(state, "edit_settings", "Edit time and site settings", ["settings"]);
    state.settings.gameTime = String(body.gameTime || state.settings.gameTime).trim();
    state.settings.schoolDay = String(body.schoolDay || state.settings.schoolDay).trim();
    state.settings.feedName = String(body.feedName || state.settings.feedName).trim();
    state.settings.chatName = String(body.chatName || state.settings.chatName).trim();
    writeState(state);
    sendJson(res, 200, publicState(state));
    return;
  }

  if (req.method === "PATCH" && url.pathname === "/api/calendar/current") {
    if (!requireAdmin(req, res)) return;
    const day = state.calendarDays.find((item) => item.id === body.dayId);
    if (!day) return sendJson(res, 404, { error: "Calendar day not found." });
    pushUndo(state, "set_current_day", `Set current day: ${day.label}`, ["settings", "calendarDays"], { dayId: day.id });
    state.settings.currentDayId = day.id;
    state.settings.schoolDay = day.label;
    writeState(state);
    sendJson(res, 200, publicState(state));
    return;
  }

  const calendarEventMatch = url.pathname.match(/^\/api\/calendar\/days\/([^/]+)\/events(?:\/([^/]+)(?:\/([^/]+))?)?$/);
  if (calendarEventMatch) {
    if (!requireAdmin(req, res)) return;
    const dayId = decodeURIComponent(calendarEventMatch[1]);
    const eventId = calendarEventMatch[2] ? decodeURIComponent(calendarEventMatch[2]) : "";
    const action = calendarEventMatch[3];
    const day = state.calendarDays.find((item) => item.id === dayId);
    if (!day) return sendJson(res, 404, { error: "Calendar day not found." });
    day.events ||= [];

    if (req.method === "POST" && !eventId) {
      const title = String(body.title || "").trim();
      const detail = String(body.detail || body.content || "").trim();
      if (!title && !detail) return sendJson(res, 400, { error: "Event title or detail is required." });
      const now = new Date().toISOString();
      pushUndo(state, "create_calendar_event", `Create event: ${title || detail.slice(0, 32)}`, ["calendarDays"], { dayId });
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
      pushUndo(state, "edit_calendar_event", `Edit event: ${event.title}`, ["calendarDays"], { dayId, eventId });
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
      pushUndo(state, "trigger_calendar_event", `Trigger event: ${event.title}`, ["calendarDays", "bulletins"], { dayId, eventId });
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
      pushUndo(state, "delete_calendar_event", `Delete event: ${event.title}`, ["calendarDays"], { dayId, eventId });
      day.events = day.events.filter((item) => item.id !== eventId);
      writeState(state);
      sendJson(res, 200, publicState(state));
      return;
    }
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/calendar/days/")) {
    if (!requireAdmin(req, res)) return;
    const dayId = decodeURIComponent(url.pathname.split("/").pop());
    const day = state.calendarDays.find((item) => item.id === dayId);
    if (!day) return sendJson(res, 404, { error: "Calendar day not found." });
    pushUndo(state, "edit_calendar_day", `Edit schedule: ${day.label}`, ["settings", "calendarDays"], { dayId });
    if (body.label !== undefined) day.label = String(body.label || day.label).trim();
    if (body.dateLabel !== undefined) day.dateLabel = String(body.dateLabel || "").trim();
    if (body.note !== undefined) day.note = String(body.note || "").trim();
    if (body.scheduleText !== undefined) day.schedule = parseScheduleText(body.scheduleText);
    if (Array.isArray(body.schedule)) day.schedule = normalizeSchedule(body.schedule);
    if (state.settings.currentDayId === day.id) state.settings.schoolDay = day.label;
    writeState(state);
    sendJson(res, 200, publicState(state));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/characters") {
    if (!requireAdmin(req, res)) return;
    const name = String(body.name || "").trim();
    if (!name) return sendJson(res, 400, { error: "Character name is required." });
    pushUndo(state, "create_character", `Create character: ${name}`, ["characters"]);
    const character = makeCharacter(id("char"), name, body.handle || makeHandle(name), body.type === "player" ? "player" : "npc");
    if (body.avatarData) {
      try {
        character.avatarData = validateDataUrl(body.avatarData, MAX_AVATAR_DATA_URL_LENGTH, "Avatar");
      } catch (error) {
        return sendJson(res, 400, { error: error.message });
      }
    }
    character.note = String(body.note || "").trim();
    state.characters.push(character);
    writeState(state);
    sendJson(res, 201, publicState(state));
    return;
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/characters/")) {
    if (!requireAdmin(req, res)) return;
    const characterId = decodeURIComponent(url.pathname.split("/").pop());
    const character = state.characters.find((item) => item.id === characterId);
    if (!character) return sendJson(res, 404, { error: "Character not found." });
    pushUndo(state, "edit_character", `Edit character: ${character.name}`, ["characters"], { characterId });
    if (body.name !== undefined) character.name = String(body.name).trim() || character.name;
    if (body.handle !== undefined) character.handle = `@${String(body.handle).replace(/^@/, "").trim()}`;
    if (body.color !== undefined) character.color = String(body.color).trim() || character.color;
    if (body.avatarData !== undefined) {
      try {
        character.avatarData = validateDataUrl(body.avatarData, MAX_AVATAR_DATA_URL_LENGTH, "Avatar");
      } catch (error) {
        return sendJson(res, 400, { error: error.message });
      }
    }
    if (body.note !== undefined) character.note = String(body.note).trim();
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
      if (isAdmin(req)) pushUndo(state, "create_direct_chat", `Create direct chat: ${requester.name} / ${target.name}`, ["chats"], { requesterId: requester.id, targetId: target.id });
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
    if (isAdmin(req)) pushUndo(state, "create_private_chat", `Create private chat: ${name}`, ["chats"], { creatorId: creator.id, memberCount: memberIds.length });
    state.chats.push(chat);
    writeState(state);
    sendJson(res, 201, { state: publicState(state), chatId: chat.id });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/feed/posts") {
    const author = authorizeAuthor(req, res, state, body.authorId);
    const content = String(body.content || "").trim();
    if (!author) return;

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
    if (isAdmin(req)) pushUndo(state, "create_post", `Create post as ${author.name}`, ["posts"], { authorId: author.id });
    state.posts.push({
      id: id("post"),
      authorId: author.id,
      content,
      attachment,
      gameTime: String(body.gameTime || state.settings.gameTime).trim(),
      createdAt: new Date().toISOString(),
      metrics: normalizeMetrics(body.metrics),
      replies: []
    });
    writeState(state);
    sendJson(res, 201, publicState(state));
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
      if (isAdmin(req)) pushUndo(state, "create_reply", `Reply to post as ${author.name}`, ["posts"], { postId, authorId: author.id });
      post.replies.push({
        id: id("reply"),
        authorId: author.id,
        content,
        gameTime: String(body.gameTime || state.settings.gameTime).trim(),
        createdAt: new Date().toISOString()
      });
      writeState(state);
      sendJson(res, 201, publicState(state));
      return;
    }

    if (req.method === "PATCH" && !action) {
      if (!requireAdmin(req, res)) return;
      pushUndo(state, "edit_post", "Edit post metrics/time", ["posts"], { postId });
      if (body.authorId && findCharacter(state, body.authorId)) post.authorId = body.authorId;
      if (body.content !== undefined) post.content = String(body.content).trim();
      if (body.gameTime !== undefined) post.gameTime = String(body.gameTime).trim();
      if (body.metrics !== undefined) post.metrics = normalizeMetrics(body.metrics);
      writeState(state);
      sendJson(res, 200, publicState(state));
      return;
    }

    if (req.method === "DELETE" && !action) {
      if (!requireAdmin(req, res)) return;
      pushUndo(state, "delete_post", "Delete post", ["posts"], { postId });
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
    pushUndo(state, "create_chat", `Create chat: ${name}`, ["chats"], { memberCount: memberIds.length });
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

  if (req.method === "PATCH" && url.pathname.startsWith("/api/chats/")) {
    if (!requireAdmin(req, res)) return;
    const chatId = decodeURIComponent(url.pathname.split("/").pop());
    const chat = state.chats.find((item) => item.id === chatId);
    if (!chat) return sendJson(res, 404, { error: "Chat not found." });
    pushUndo(state, "edit_chat", `Edit chat: ${chat.name}`, ["chats"], { chatId });
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

    if (!content && !attachment) return sendJson(res, 400, { error: "Message content or image is required." });
    if (isAdmin(req)) pushUndo(state, "send_message", `Send message as ${author.name}`, ["messages"], { chatId: chat.id, authorId: author.id });
    state.messages.push({
      id: id("msg"),
      chatId: chat.id,
      authorId: author.id,
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
    if (!message) return sendJson(res, 404, { error: "Message not found." });
    pushUndo(state, "delete_message", "Delete message", ["messages"], { messageId, chatId: message.chatId });
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
    "",
    "## SNS 时间线",
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
      lines.push("Events:");
      for (const event of day.events) {
        const status = event.triggeredAt ? "triggered" : (event.isPublic ? "public" : "GM only");
        lines.push(`- [${event.type}] ${event.title} (${status})`);
        if (event.detail) lines.push(`  ${event.detail}`);
      }
    }
    lines.push("");
  }

  lines.push("## Bulletin / Rumor Board", "");
  for (const bulletin of [...(state.bulletins || [])].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
    const author = byId.get(bulletin.authorId);
    lines.push(`### ${bulletin.gameTime || ""} | ${bulletin.title}`.trim());
    lines.push("");
    lines.push(`Type: ${bulletin.type}${author ? ` / ${author.name}` : ""}${bulletin.isPublic ? "" : " / GM only"}`);
    if (bulletin.content) {
      lines.push("");
      lines.push(bulletin.content);
    }
    lines.push("");
  }

  for (const post of [...state.posts].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
    const author = byId.get(post.authorId);
    lines.push(`### ${post.gameTime} | ${author?.name || "Unknown"} ${author?.handle || ""}`);
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
      for (const reply of post.replies) {
        const replyAuthor = byId.get(reply.authorId);
        lines.push(`- ${reply.gameTime} | ${replyAuthor?.name || "Unknown"}：${reply.content}`);
      }
    }
    lines.push("");
  }

  lines.push("## 聊天记录", "");
  for (const chat of state.chats) {
    lines.push(`### ${chat.name}`, "");
    const messages = state.messages.filter((message) => message.chatId === chat.id).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    for (const message of messages) {
      const author = byId.get(message.authorId);
      lines.push(`- ${message.gameTime} | ${author?.name || "Unknown"}：${message.content}`);
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
  if (!url.pathname.startsWith("/api/")) {
    serveStatic(req, res, url);
    return;
  }
  routeApi(req, res, url).catch((error) => {
    console.error(error);
    sendJson(res, 500, { error: error.message || "Internal server error." });
  });
}).listen(PORT, HOST, () => {
  console.log(`TRPG SNS system running at http://localhost:${PORT}`);
  console.log(`GM PIN: ${GM_PIN === "gm" ? "gm (set GM_PIN for real sessions)" : "configured"}`);
});
