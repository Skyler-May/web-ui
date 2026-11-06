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

## 实测截图

| 游戏 | 截图 |
|---|---|
| 斗地主 | `screenshot-ddz.png` |
| 跑得快 | `screenshot-pdk.png` |
| 牛牛 | `screenshot-niuniu.png` |
| 浙江麻将 | `screenshot-mahjong.png` |

## 待办

1. 断线重连、超时提示、音效、动画
2. 房号列表 / 快速匹配入口（目前靠输入房号）
3. 麻将的碰/杠选择（当前服务端自动决策）
