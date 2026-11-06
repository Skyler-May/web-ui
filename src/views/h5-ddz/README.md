# 鏂楀湴涓?H5 瀹㈡埛绔紙NiuMa 鍗忚鐩磋繛锛?
娴忚鍣ㄧ鏂楀湴涓诲鎴风锛氱洿鎺ヨ NiuMa 鐨?WebSocket + msgpack 鍗忚锛屼笉渚濊禆 Unity銆?
## 鐩綍璇存槑

| 鏂囦欢 | 璇存槑 |
|---|---|
| `index.html` / `style.css` | 椤甸潰涓庢牱寮?|
| `app.js` | 涓婚€昏緫锛氱櫥褰?鈫?杩涙埧 鈫?鍏ュ骇 鈫?鍑嗗 鈫?鍙戠墝 鈫?鍑虹墝 鈫?缁撶畻 |
| `md5.js` | 娑堟伅绛惧悕 `md5(playerId&timestamp&nonce&secret)` |
| `msgpack.js` | 鏋佺畝 msgpack 缂栬В鐮侊紙鍏煎鏈嶅姟绔?msgpack-c锛?|
| `server.mjs` | 鏈湴寮€鍙戞湇鍔★細闈欐€佹枃浠?+ 鐧诲綍/杩涙埧浠ｇ悊 + 浠?Redis 鍙栨秷鎭瘑閽?|
| `shot.mjs` | CDP 鏃犲ご娴忚鍣ㄦ埅鍥惧伐鍏?|
| `play-test.mjs` | 鑷姩鍖栵細绛夊埌杞埌鎴?鈫?鍑烘渶灏忎竴寮?鈫?鎴浘 |
| `full-game.mjs` | 鑷姩鍖栵細鎵撳畬鏁翠竴灞€鐩村埌缁撶畻 |

## 鏈湴杩愯

```bash
# 1. 渚濊禆锛歡aming-server 鏍堝凡鍚姩锛坴endor web-server 18080銆佹父鎴忔湇 10086/9098銆丷edis銆丮ySQL锛?cd vendor/web-ui/src/views/h5-ddz
node server.mjs
# 鎵撳紑 http://127.0.0.1:18098/
```

椤甸潰濉€岀帺瀹禝D銆嶏紙濡?p1001锛夊拰銆? 浣嶆埧鍙枫€嶏紝鐐广€岀櫥褰曞苟杩涙埧銆嶃€?
鑷姩鍖栵細

```bash
node full-game.mjs "http://127.0.0.1:18098/?auto=1&player=p1001&room=421053" full.png
```

## 鍗忚瑕佺偣锛堜笌鏈嶅姟绔榻愶級

- 澶栧眰锛歚{msgType, msgPack}`锛屽叾涓?`msgPack` 鏄唴灞?msgpack 鐨?**base64 瀛楃涓?*
- 鍐呭眰锛歚playerId/timestamp/nonce/signature` + 鍚勬秷鎭嚜鏈夊瓧娈?- 绛惧悕锛歚md5(playerId & timestamp & nonce & secret)`锛宍timestamp` 涓?*绉?*
- 瀵嗛挜锛歊edis `player_message_secret:<vendorPlayerId>`
- 蹇呴』鎸夊簭锛歚MsgPlayerConnect` 鈫?`MsgEnterVenue` 鈫?`MsgJoinGame` 鈫?`MsgPlayerReady`

## 瀹炴祴锛堟棤澶?Chrome 鑷姩鍖栵級

- 杩涙埧鍏ュ骇銆佸噯澶囥€佸彂鐗屻€佸簳鐗屽睍绀?鉁?- 鎵嬬墝娓叉煋銆佺偣鍑婚€夌墝銆佸嚭鐗屻€佽繃鐗?鉁?- 瀹屾暣涓€灞€鍒扮粨绠楋細`鏈眬缁撴潫锛氳耽瀹跺骇浣?2锛屽湴涓昏礋锛屽垎鏁?-200/100/100` 鉁?
## 鐢熶骇鍖栧緟鍔?
1. `server.mjs` 鐩墠鏄?*寮€鍙戠敤**锛氬晢鎴峰瘑閽ュ拰鐜╁娑堟伅瀵嗛挜閮藉彇鑷湇鍔＄鐜/Redis銆?   姝ｅ紡鐜搴旂敱 `niuma-admin` 鎻愪緵涓€涓€屽凡閴存潈鐨勭櫥褰?杩涙埧銆嶆帴鍙ｏ紝杩斿洖 token/venueId/涓€娆℃€ф秷鎭瘑閽ワ紱
2. 鏂嚎閲嶈繛銆佽秴鏃舵彁绀恒€侀煶鏁堛€佸姩鐢伙紱
3. 鎴垮彿鍒楄〃/蹇€熷尮閰嶅叆鍙ｏ紙鐩墠闈犺緭鍏ユ埧鍙凤級銆?
## 生产化接口（niuma-admin）

`POST /api/h5/launch`

```json
// 请求
{ "playerId": "p1001", "roomNumber": "403982", "gameType": 1031 }
// 响应
{ "code": 0, "data": { "vendorPlayerId": "4e3dd1774d", "token": "Bearer ...", "secret": "@R%j#wIA4", "gameType": 1031 } }
```

- token：复用商户登录的 token 机制（`merchantService.login`）
- secret：从 Redis `player_message_secret:<vendorPlayerId>` 读取后一次性下发
- 进房仍由客户端带 token 调 `/player/game/enter/number`（`server.mjs` 转发）

实测：`/?auto=1&player=p1001&room=403982` 打完整局，结算 `赢家座位 0，地主负，分数 100/-200/100`。