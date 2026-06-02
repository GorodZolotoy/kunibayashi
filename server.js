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
    emojis: defaultEmojis(),
    relationships: [],
    updatedAt: now
  };
}

function normalizeState(state) {
  state.version = Math.max(Number(state.version || 1), 3);
  state.settings ||= {};
  state.settings.gameTime ||= "开学首日 18:12";
  state.settings.schoolDay ||= "周一";
  state.settings.feedName ||= "Kokubayashi SNS";
  state.settings.chatName ||= "K-LINE";
  state.characters ||= [];
  state.chats ||= [];
  state.posts ||= [];
  state.messages ||= [];
  state.emojis ||= defaultEmojis();
  state.relationships ||= [];

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

  return state;
}

function defaultEmojis() {
  return [];
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
  return {
    ...state,
    characters: state.characters.map(({ accessToken, auth, ...character }) => character)
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

async function routeApi(req, res, url) {
  const state = readState();

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
    state.settings.gameTime = String(body.gameTime || state.settings.gameTime).trim();
    state.settings.schoolDay = String(body.schoolDay || state.settings.schoolDay).trim();
    state.settings.feedName = String(body.feedName || state.settings.feedName).trim();
    state.settings.chatName = String(body.chatName || state.settings.chatName).trim();
    writeState(state);
    sendJson(res, 200, publicState(state));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/characters") {
    if (!requireAdmin(req, res)) return;
    const name = String(body.name || "").trim();
    if (!name) return sendJson(res, 400, { error: "Character name is required." });
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
