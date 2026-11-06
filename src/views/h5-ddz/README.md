# 斗地主 H5 客户端（NiuMa 协议直连）

浏览器端斗地主客户端：直接说 NiuMa 的 WebSocket + msgpack 协议，不依赖 Unity。

## 目录说明

| 文件 | 说明 |
|---|---|
| `index.html` / `style.css` | 页面与样式 |
| `app.js` | 主逻辑：登录 → 进房 → 入座 → 准备 → 发牌 → 出牌 → 结算 |
| `md5.js` | 消息签名 `md5(playerId&timestamp&nonce&secret)` |
| `msgpack.js` | 极简 msgpack 编解码（兼容服务端 msgpack-c） |
| `server.mjs` | 本地开发服务：静态文件 + 登录/进房代理 + 从 Redis 取消息密钥 |
| `shot.mjs` | CDP 无头浏览器截图工具 |
| `play-test.mjs` | 自动化：等到轮到我 → 出最小一张 → 截图 |
| `full-game.mjs` | 自动化：打完整一局直到结算 |

## 本地运行

```bash
# 1. 依赖：gaming-server 栈已启动（vendor web-server 18080、游戏服 10086/9098、Redis、MySQL）
cd vendor/web-ui/src/views/h5-ddz
node server.mjs
# 打开 http://127.0.0.1:18098/
```

页面填「玩家ID」（如 p1001）和「6 位房号」，点「登录并进房」。

自动化：

```bash
node full-game.mjs "http://127.0.0.1:18098/?auto=1&player=p1001&room=421053" full.png
```

## 协议要点（与服务端对齐）

- 外层：`{msgType, msgPack}`，其中 `msgPack` 是内层 msgpack 的 **base64 字符串**
- 内层：`playerId/timestamp/nonce/signature` + 各消息自有字段
- 签名：`md5(playerId & timestamp & nonce & secret)`，`timestamp` 为**秒**
- 密钥：Redis `player_message_secret:<vendorPlayerId>`
- 必须按序：`MsgPlayerConnect` → `MsgEnterVenue` → `MsgJoinGame` → `MsgPlayerReady`

## 实测（无头 Chrome 自动化）

- 进房入座、准备、发牌、底牌展示 ✅
- 手牌渲染、点击选牌、出牌、过牌 ✅
- 完整一局到结算：`本局结束：赢家座位 2，地主负，分数 -200/100/100` ✅

## 生产化待办

1. `server.mjs` 目前是**开发用**：商户密钥和玩家消息密钥都取自服务端环境/Redis。
   正式环境应由 `niuma-admin` 提供一个「已鉴权的登录+进房」接口，返回 token/venueId/一次性消息密钥；
2. 断线重连、超时提示、音效、动画；
3. 房号列表/快速匹配入口（目前靠输入房号）。
