# TRPG SNS / LINE System

这是给跑团使用的轻量假 SNS 与 LINE 风格聊天系统。它不依赖 Misskey，也不需要数据库；服务用 Node 内置模块运行，结构化数据存在 `data/state.json`，上传图片存在 `data/media/`。

## 启动

```powershell
cd "C:\Users\leole\Documents\Obsidian Vault\sns-line-system"
npm start
```

打开：

```text
http://localhost:4173
```

本地开发的默认 GM PIN 是：

```text
gm
```

正式给玩家用时必须设置环境变量；当 `NODE_ENV=production` 时，服务会拒绝使用默认 PIN 启动：

```powershell
$env:GM_PIN="换成你的后台密码"; npm start
```

## 已有功能

- 玩家可自助创建账号，并用自己的账号发 SNS 帖子、回复和聊天消息。
- 玩家可在同一浏览器中保存多个账号登录状态，并随时切换或退出当前账号。
- GM 可在后台代建玩家账号，并设置显示名、登录用户名、@handle 和初始密码；玩家可用用户名或 @handle 登录。
- GM 后台会列出所有玩家账号，并在代建成功后显示可交给玩家的登录信息。
- GM 可批量导入玩家账号，也可在账号管理中批量删除选中账号或全部账号。
- GM 可批量创建角色，并可在角色名册中修改显示名、@handle 或头像。
- GM 可在角色名册中删除单个非登录角色，或一键删除全部非登录角色。玩家账号只能从账号管理删除，避免误删登录资料。
- 玩家账号支持上传头像；GM 也可在后台为玩家账号设置或更换头像。
- 玩家端 SNS 时间线：发帖/回复（可匿名）、发图片、点赞、投票、收藏、转发、引用和多层回复。
- 通知中心会集中显示提及、喜欢、回复、投票、关注审批、群邀请和新聊天消息，并提供未读状态。
- 账号资料页支持头像、封面、简介、所在地、生日、关注/粉丝列表、曾用名与置顶帖子。
- 聊天支持引用回复、消息回应、限时编辑/撤回、群消息置顶、未读分界和新消息跳转。
- 玩家可在资料页静音或屏蔽账号；屏蔽后双方无法关注或私信。
- 玩家可查看校历并点击日期查看当天课程表。
- 玩家可查看公告 / 传闻板，GM 可发布学校公告、社团公告、事件通报或传闻。
- GM 后台：解锁后可切换任意角色身份。
- GM 可调整当前日期、每日课程表、帖子时间、点赞、转发、浏览数。
- GM 后台包含统一收件箱，可集中查看关注请求、最新聊天消息和时间线回复。
- GM 场次控制台可切换全站只读、时间线/聊天锁定、自助注册、慢速模式、编辑时限、指定角色禁言和指定聊天锁定。
- GM 可建立按游戏日期与时间自动执行的帖子、聊天消息、公告和平台事件队列，也可取消、恢复或立即执行。
- GM 可临时模拟维护、断网、紧急通知或账号限制，并决定是否阻断平台及影响哪些角色。
- GM 可控制每个角色的在线、离开、忙碌、离线、状态文字和聊天输入提示。
- GM 可为角色、聊天与帖子保存仅后台可见的关联笔记。
- GM 可在校历中添加事件触发器，并一键触发成玩家可见公告。
- GM 可查看关系图，快速确认哪些账号已批准关注、哪些还在等待审批。
- GM 的删除和编辑操作会写入日志，并支持撤销最近的 GM 操作。
- LINE 风格群聊：可用当前身份发消息，也可发送图片。
- 玩家可发起关注请求，GM 批准后双方可以开私聊。
- 玩家可用已批准联系人创建自己的私密群聊，并可申请邀请或移除群成员，等待 GM 审批。
- 通用 emoji 栏：内置常用 emoji，并支持上传自定义图片 emoji。
- GM 可创建新角色、新群聊、调整游戏内时间。
- GM 后台可导出完整 Markdown，也可单独导出聊天 Markdown。
- GM 可导出包含图片的完整 JSON 备份，并从该备份恢复；恢复前会再自动保存一份当前状态。
- 第一次启动会从 Vault 的 `玩家信息`、`玩家信息/NPC`、`NPC攻略文件`、`角色档案拆分版` 扫描角色名并生成初始名册。

## 部署到 Railway 的口径

这个目录可以直接作为 Railway 项目部署，仓库内已经包含 `railway.json`：

- Start command: `npm start`
- Node version: 18+
- Environment variables:
  - `GM_PIN`: GM 后台密码
  - `DATA_DIR`: 可选，若 Railway 挂载 Volume，把它设为 Volume 路径
  - `NODE_ENV=production`: 正式部署建议设置；同时禁止默认 GM PIN
  - `OFFSITE_BACKUP_URL`: 可选，接收压缩 JSON 备份的站外 HTTP 地址
  - `OFFSITE_BACKUP_TOKEN`: 可选，以 Bearer Token 发送给备份地址
  - `OFFSITE_BACKUP_METHOD`: 可选，`PUT` 或 `POST`，默认 `PUT`
  - `OFFSITE_BACKUP_INTERVAL_MINUTES`: 可选，自动备份间隔；默认 `1440`（每天）

如果不挂载持久化 Volume，Railway 重启后玩家账号、头像、关注审批、公告/传闻、校历事件、私聊/私密群聊、聊天图片、自定义 emoji 和 `data/state.json` 都可能丢失。Volume 必须挂载到与 `DATA_DIR` 相同的目录。

头像、时间线图片、聊天图片和自定义 emoji 会先由浏览器压缩，再由服务端验证图片签名并保存到 `DATA_DIR/media/`。旧版 `state.json` 中的 data URL 图片会在启动时自动迁移，迁移前会建立备份。

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

持久化目录：

```text
sns-line-system/data/
├── state.json
├── media/
└── backups/
```

服务会在写入前按小时建立滚动备份，并在危险的批量删除、数据迁移和恢复前额外备份。GM 后台的“完整备份”会下载一个可移植 JSON 文件，其中包含图片；“恢复备份”需要明确输入确认文字。

若设置 `OFFSITE_BACKUP_URL`，服务会按 `OFFSITE_BACKUP_INTERVAL_MINUTES` 自动把同一种可恢复备份 gzip 压缩后发送到站外，并可在 GM 后台查看结果或立即执行。URL 可包含 `{date}` 与 `{timestamp}`，例如：

```text
OFFSITE_BACKUP_URL=https://backup.example/kunibayashi/{timestamp}.json.gz
OFFSITE_BACKUP_TOKEN=endpoint-secret
OFFSITE_BACKUP_METHOD=PUT
OFFSITE_BACKUP_INTERVAL_MINUTES=1440
```

接收端需要保存请求体原样，并接受 `Content-Encoding: gzip`；备份包含账号认证资料与所有图片，应使用私有存储。Railway Volume 仍是运行数据的第一层持久化，站外备份用于灾难恢复，不能替代 Volume。

每次重要团后建议在 GM 后台下载完整 JSON 备份；Markdown 导出适合归档阅读，但不能用于完整恢复。

## 校验

```powershell
npm run check
```

该命令会检查服务端和前端语法，并运行状态权限、增量同步、时间推进及账户会话测试。
