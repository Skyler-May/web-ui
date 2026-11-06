# NiuMa H5 客户端（斗地主 / 跑得快 / 牛牛 / 浙江麻将）

浏览器端游戏客户端：直接说 NiuMa 的 WebSocket + msgpack 协议，一套代码支持四款游戏，不依赖 Unity。

## 支持的游戏

| 游戏 | gameType | 交互 | 状态 |
|---|---|---|---|
| 斗地主 | 1031 | 选牌出牌 / 不出 | ✅ 完整对局到结算 |
| 跑得快 | 1032 | 选牌出牌 / 不出 | ✅ 完整对局到结算 |
| 牛牛 | 1024 | 全自动（发牌→比牌→结算） | ✅ |
| 浙江麻将 | 1033 | 点牌打出（碰杠由服务端自动处理） | ✅ 完整对局到结算 |

## 目录说明

| 文件 | 说明 |
|---|---|
| `index.html` / `style.css` | 页面、牌面样式（扑克牌 + 麻将牌） |
| `app.js` | 主逻辑：启动 → 进房 → 入座 → 准备 → 自动同步 → 各游戏消息处理与渲染 |
| `md5.js` | 消息签名 `md5(playerId&timestamp&nonce&secret)` |
| `msgpack.js` | 极简 msgpack 编解码（兼容服务端 msgpack-c） |
| `server.mjs` | 本地开发服务：静态文件 + `/api/launch`、`/api/enter` 转发 |
| `shot.mjs` / `play-test.mjs` / `full-game.mjs` | CDP 自动化：截图 / 单步出牌 / 打完整一局 |
| `reconnect-test.mjs` | CDP 自动化：点「重连」验证断线重连与状态恢复 |
| `enter-from-list.mjs` | CDP 自动化：从房号列表一键进房 |

## 本地运行

```bash
cd vendor/web-ui/src/views/h5-ddz
node server.mjs
# 打开 http://127.0.0.1:18098/ ，选择游戏、填玩家ID与房号
```

自动化（以跑得快为例）：

```bash
node full-game.mjs "http://127.0.0.1:18098/?auto=1&player=p1001&game=1032&room=420678" pdk.png
```

## 协议要点

- 外层：`{msgType, msgPack}`，`msgPack` 是内层 msgpack 的 **base64 字符串**
- 内层：`playerId/timestamp/nonce/signature` + 各消息自有字段
- 签名：`md5(playerId & timestamp & nonce & secret)`，`timestamp` 为**秒**
- 必须按序：`MsgPlayerConnect` → `MsgEnterVenue` → `MsgJoinGame` → `MsgPlayerReady`
- 入座后自动发一次 `<Game>Sync` 拉取当前状态（中途加入也能拿到手牌）
- **消息过滤**：同一会话可能收到其它房间/其它游戏的消息，客户端按前缀只处理当前 gameType

## 生产化接口（niuma-admin）

`POST /api/h5/launch`

```json
// 请求
{ "playerId": "p1001", "roomNumber": "420678", "gameType": 1032 }
// 响应
{ "code": 0, "data": { "vendorPlayerId": "4e3dd1774d", "token": "Bearer ...", "secret": "@R%j#wIA4", "gameType": 1032 } }
```

- token：复用商户登录的 token 机制（`merchantService.login`）
- secret：从 Redis `player_message_secret:<vendorPlayerId>` 读取后一次性下发
- 进房由客户端带 token 调 `/player/game/enter/number`（`server.mjs` 转发）

`GET /api/h5/rooms?gameType=1031`

```json
{ "code": 0, "data": { "items": [
  { "venueId": "JhV6t1ozdX", "number": "420678", "gameType": 1031,
    "ownerId": "znJ4T5oU55", "ownerName": "老王", "playerCount": 2, "maxPlayerNums": 3 }
] } }
```

- 数据源：`game_<game>` 表 join `venue`（`status < 2`，即未结束），最多 100 条
- `playerCount` 读 Redis `venue_player_count:<venueId>`，按人数降序
- `maxPlayerNums`：斗地主 3 / 跑得快 3 / 牛牛 5 / 浙江麻将 4（与各游戏 `_maxPlayerNums` 配置一致）
- 接口 `@Anonymous`，登录前即可拉取；客户端每 6 秒刷新一次

## 断线重连

- 心跳 3 秒一次；12 秒收不到任何消息判定半开连接，主动断开重连
- 断线后指数退避重连（0.6s → 1.2s → 2.4s → 4.8s → 8s 封顶，带抖动），顶部徽标显示重连次数
- 重连成功后复用同一 `venueId` 重新走 `MsgPlayerConnect → MsgEnterVenue → MsgJoinGame → Ready → Sync`，手牌/座位由 Sync 恢复
- 浏览器恢复联网（`online`）或标签页重新可见时立即重连；头部「重连」按钮可手动触发

## 实测截图

| 游戏 | 截图 |
|---|---|
| 斗地主 | `screenshot-ddz.png` |
| 跑得快 | `screenshot-pdk.png` |
| 牛牛 | `screenshot-niuniu.png` |
| 浙江麻将 | `screenshot-mahjong.png` |
| 大厅（房号列表） | `screenshot-rooms.png` |

## 待办

1. 音效、动画、出牌超时提示
2. 快速匹配：自动挑一个人最多的未满房间并一键进房（现在是手动点列表）
3. 麻将的碰/杠选择（当前服务端自动决策）

## 可用性特性

### 1. 房号列表（大厅）

- 登录面板内置「可用房间」列表，按当前游戏筛选，展示 `房号 / 在线人数/上限 / 房主`；
- 支持手动「刷新」，并每 10 秒自动刷新（切到牌桌后自动停止）；
- 点「进入」自动填房号，再点「登录并进房」即可；满员房间按钮置灰「已满」；
- 数据来源：`GET /api/h5/rooms?gameType=1031`（niuma-admin，含 venueId/人数/上限）。

### 2. 断线重连

- 顶部右侧有连接状态灯（`已连接` / `重连中 N`）与手动「重连」按钮；
- `onclose` 自动重连，指数退避（1s→2s→4s→8s→10s 封顶）；
- **假死检测**：12 秒收不到任何消息即判定半开连接，强制重连；
- 重连成功后走 `<Game>Sync` 拉取手牌与状态，不重新进房（避免「本局尚未结束」）。

### 3. 观感修正

- 对手位按游戏人数渲染：斗地主/跑得快 3 人、浙江麻将 4 人、牛牛 5 人（此前固定 4 个空位）。

## 验收记录

| 场景 | 结果 | 截图 |
|---|---|---|
| 房号列表 + 刷新 | ✅ 列出房间、人数、进入按钮 | `screenshot-rooms.png` |
| 列表一键进房 | ✅ 点「进入」→ 自动进房并发牌 | `screenshot-enter-from-list.png` |
| 断线重连 | ✅ 点「重连」→ WS 重连 → 同步恢复手牌 | `screenshot-reconnect.png` |