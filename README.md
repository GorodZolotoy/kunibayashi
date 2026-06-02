# TRPG SNS / LINE System

这是给跑团使用的轻量假 SNS 与 LINE 风格聊天系统。它不依赖 Misskey，也不需要数据库；第一版用 Node 内置模块运行，数据存在 `data/state.json`。

## 启动

```powershell
cd "C:\Users\leole\Documents\Obsidian Vault\sns-line-system"
npm start
```

打开：

```text
http://localhost:4173
```

默认 GM PIN 是：

```text
gm
```

正式给玩家用时建议设置环境变量：

```powershell
$env:GM_PIN="换成你的后台密码"; npm start
```

## 已有功能

- 玩家可自助创建账号，并用自己的账号发 SNS 帖子、回复和聊天消息。
- 玩家账号支持上传头像。
- 玩家端 SNS 时间线：发帖、发图片、回复、点赞。
- GM 后台：解锁后可切换任意角色身份。
- GM 可调整帖子时间、点赞、转发、浏览数。
- LINE 风格群聊：可用当前身份发消息，也可发送图片。
- 玩家可发起关注请求，GM 批准后双方可以开私聊。
- 玩家可用已批准联系人创建自己的私密群聊。
- 通用 emoji 栏：内置常用 emoji，并支持上传自定义图片 emoji。
- GM 可创建新角色、新群聊、调整游戏内时间。
- 可导出 Markdown：`/api/export.md`。
- 第一次启动会从 Vault 的 `玩家信息`、`玩家信息/NPC`、`NPC攻略文件`、`角色档案拆分版` 扫描角色名并生成初始名册。

## 部署到 Railway 的口径

这个目录可以直接作为 Railway 项目部署，仓库内已经包含 `railway.json`：

- Start command: `npm start`
- Node version: 18+
- Environment variables:
  - `GM_PIN`: GM 后台密码
  - `DATA_DIR`: 可选，若 Railway 挂载 Volume，把它设为 Volume 路径

如果不挂载持久化 Volume，Railway 重启后玩家账号、头像、关注审批、私聊/私密群聊、聊天图片、自定义 emoji 和 `data/state.json` 都可能丢失。
头像、时间线图片、聊天图片和自定义 emoji 会被浏览器压缩后以 data URL 存进 `state.json`；如果图片上传失败，通常是原图太大或 Railway 请求体限制过低，请优先使用较小图片并确认部署使用了当前版本。

第一次部署时，如果没有现成的 `data/state.json`，系统会使用 `seed/state.json` 生成初始角色名册。

建议 Railway 挂载 Volume 后设置：

```text
DATA_DIR=/data
```

然后在 Variables 设置：

```text
GM_PIN=换成你的后台密码
```

## 数据备份

核心数据文件：

```text
sns-line-system/data/state.json
```

每次重要团后可以复制这个文件，或打开 `/api/export.md` 导出到 Obsidian。
