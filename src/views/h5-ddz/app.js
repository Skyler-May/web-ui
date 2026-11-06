// NiuMa H5 客户端（斗地主 / 跑得快 / 牛牛 / 浙江麻将）
// 协议：WebSocket + msgpack，签名 md5(playerId&timestamp&nonce&secret)
const { enc, decode } = window.MsgPack;

let token = "", vendorPlayerId = "", venueId = "", secret = "";
let ws = null, wsAddress = "";
let hbTimer = null, readyTimer = null, watchdogTimer = null, reconnectTimer = null;
let wantOnline = false, reconnectAttempt = 0, lastRecvAt = 0, connState = "idle";
let roomsTimer = null;
let mySeat = -1, gameType = 1031;
let hand = [], selected = new Set(), myTurn = false, mustPlay = false;
let tableCards = {};        // 各家出牌区（座位 -> cards）
let over = false;

const $ = (id) => document.getElementById(id);
const logEl = $("log");
function log(msg) {
    const t = new Date().toLocaleTimeString();
    logEl.innerHTML += `<div>[${t}] ${msg}</div>`;
    logEl.scrollTop = logEl.scrollHeight;
}

// 连接状态徽标：ok 绿色 / warn 等待 / bad 断开
function setConn(text, kind) {
    const el = $("connState");
    if (el) {
        el.textContent = text;
        el.className = "conn " + (kind || "ok");
    }
    connState = kind || "ok";
}

// ---------------- 牌面 ----------------
const RANKS = { 1: "A", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "J", 12: "Q", 13: "K", 14: "王" };
const SUITS = { 1: "♦", 2: "♣", 3: "♥", 4: "♠", 5: "小", 6: "大" };

function pokerCardEl(card, small) {
    const el = document.createElement("div");
    el.className = "card" + (small ? " small" : "");
    if ([1, 3, 6].includes(card.suit)) el.classList.add("red");
    if (card.point === 14) {
        el.innerHTML = `<div>${card.suit === 6 ? "大王" : "小王"}</div>`;
    } else {
        el.innerHTML = `<div>${RANKS[card.point] || "?"}</div><div class="suit">${SUITS[card.suit] || ""}</div>`;
    }
    el.dataset.id = card.id;
    return el;
}

// 网狐麻将牌值：0x01-0x09 万 / 0x11-0x19 条 / 0x21-0x29 筒 / 0x31-0x37 字
const MJ_NUM = ["", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const MJ_WIND = ["", "东", "南", "西", "北", "中", "发", "白"];
const MJ_SUIT = ["万", "条", "筒"];

function mahjongTileText(tile) {
    const color = (tile & 0xf0) >> 4;
    const value = tile & 0x0f;
    if (color === 3) return MJ_WIND[value] || "?";
    return (MJ_NUM[value] || "?") + (MJ_SUIT[color] || "");
}

function mahjongTileEl(tile, small) {
    const el = document.createElement("div");
    const color = (tile & 0xf0) >> 4;
    el.className = "tile" + (small ? " small" : "");
    if (color === 3) el.classList.add("wind");
    if (color === 0) el.classList.add("wan");
    if (color === 1) el.classList.add("tiao");
    if (color === 2) el.classList.add("tong");
    el.textContent = mahjongTileText(tile);
    el.dataset.tile = tile;
    return el;
}

const NIU_GENRE = {
    1: "没牛", 2: "牛一", 3: "牛二", 4: "牛三", 5: "牛四", 6: "牛五", 7: "牛六", 8: "牛七", 9: "牛八", 10: "牛九",
    0x10: "牛牛", 0x20: "顺子牛", 0x40: "五花牛", 0x60: "同花牛", 0x80: "葫芦牛", 0xA0: "炸弹牛", 0xC0: "五小牛", 0xE0: "开心牛"
};

// ---------------- 消息发送 ----------------
function sendMsg(msgType, extraPairs = []) {
    if (!ws || ws.readyState !== WebSocket.OPEN) { log("（未连接，跳过 " + msgType + "）"); return; }
    try {
        const ts = String(Math.floor(Date.now() / 1000));
        const nonce = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
        const sig = window.md5(`${vendorPlayerId}&${ts}&${nonce}&${secret}`);
        const inner = enc.map([
            ["playerId", enc.str(vendorPlayerId)],
            ["timestamp", enc.str(ts)],
            ["nonce", enc.str(nonce)],
            ["signature", enc.str(sig)],
            ...extraPairs
        ]);
        let bin = "";
        for (let i = 0; i < inner.length; i++) bin += String.fromCharCode(inner[i]);
        const wrapper = enc.map([["msgType", enc.str(msgType)], ["msgPack", enc.str(btoa(bin))]]);
        ws.send(wrapper);
        if (msgType !== "MsgHeartbeat" && msgType !== "MsgPlayerReady") log("→ " + msgType);
    } catch (e) {
        log("发送异常 " + msgType + ": " + e.message);
    }
}

function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

// ---------------- 渲染 ----------------
function renderHand() {
    const box = $("myHand");
    box.innerHTML = "";
    const isMj = (gameType === 1033);
    const sorted = isMj ? [...hand].sort((a, b) => a - b) : [...hand].sort((a, b) => a.id - b.id);
    for (const item of sorted) {
        let el;
        if (isMj) {
            el = mahjongTileEl(item, false);
            const tile = item;
            if (selected.has(tile)) el.classList.add("selected");
            el.onclick = () => {
                if (!myTurn || over) return;
                selected.clear();
                selected.add(tile);
                renderHand();
            };
        } else {
            el = pokerCardEl(item, false);
            if (selected.has(item.id)) el.classList.add("selected");
            el.onclick = () => {
                if (!myTurn || over) return;
                if (selected.has(item.id)) selected.delete(item.id); else selected.add(item.id);
                renderHand();
            };
        }
        box.appendChild(el);
    }
    $("btnPlay").disabled = !myTurn || over || selected.size === 0;
    $("btnPass").disabled = !myTurn || over || mustPlay;
    $("btnPass").style.display = (gameType === 1024 || gameType === 1033) ? "none" : "";
    $("btnPlay").textContent = (gameType === 1033) ? "出牌（打出选中）" : "出牌";
}

// 同步/重连后，用当前已知状态刷新顶部提示（SyncResp 只带手牌，不带轮到谁）
function refreshStatusText() {
    if (over) return;
    if (myTurn) $("stateInfo").textContent = gameType === 1033 ? "轮到你出牌" : (mustPlay ? "轮到你（必须出牌）" : "轮到你");
    else $("stateInfo").textContent = "已同步，等待其他玩家";
}

function renderTableCards(seat, cards, small = true) {
    tableCards[seat] = cards;
    const box = $("playedArea");
    box.innerHTML = "";
    for (const c of cards || []) {
        box.appendChild(gameType === 1033 ? mahjongTileEl(c, small) : pokerCardEl(c, small));
    }
}

function renderOpponents(counts) {
    const opps = [1, 2, 3, 4].filter((s) => s !== mySeat);
    const ids = ["opp1", "opp2", "opp3", "opp4"];
    for (let i = 0; i < 4; i++) {
        const el = $(ids[i]);
        if (!el) continue;
        if (i < opps.length) {
            el.style.display = "";
            el.querySelector(".name").textContent = "座位" + opps[i];
            if (counts && counts[opps[i]] != null)
                el.querySelector(".cards").textContent = counts[opps[i]] + " 张";
        } else {
            el.style.display = "none";
        }
    }
}

// ---------------- 各游戏消息 ----------------
function onDdz(type, body) {
    switch (type) {
        case "MsgLandlordDealCard":
            $("stateInfo").textContent = "地主: 座位" + body.landlord;
            $("bottomCards").innerHTML = "<span>底牌：</span>";
            for (const c of body.bottomCards || []) $("bottomCards").appendChild(pokerCardEl(c, true));
            break;
        case "MsgLandlordSyncResp":
            if (body && body.handCards) { hand = body.handCards; selected.clear(); renderHand(); }
            log("同步：手牌 " + hand.length + " 张，状态 " + (body ? body.gameState : "?"));
            refreshStatusText();
            break;
        case "MsgLandlordHandCard":
            hand = body.cards || [];
            selected.clear();
            renderHand();
            break;
        case "MsgLandlordTurn":
            myTurn = (body.seat === mySeat);
            mustPlay = !!body.mustPlay;
            over = false;
            $("stateInfo").textContent = myTurn ? (mustPlay ? "轮到你（必须出牌）" : "轮到你") : ("等待座位 " + body.seat);
            renderHand();
            break;
        case "MsgLandlordPlayCardResp":
            if (!body.success) {
                log("出牌被拒: " + (body.errMsg || "?"));
                if (!body.passed) sendMsg("MsgLandlordPlayCard", [["venueId", enc.str(venueId)], ["cardIds", enc.arr([])]]);
                break;
            }
            if (body.passed) { renderTableCards(body.seat, []); log("座位 " + body.seat + " 不出"); }
            else {
                renderTableCards(body.seat, body.cards);
                for (const c of body.cards || []) hand = hand.filter((h) => h.id !== c.id);
                selected.clear();
                renderHand();
            }
            break;
        case "MsgLandlordGameOver":
            over = true;
            $("stateInfo").textContent = "本局结束，赢家 座位" + body.winner;
            log("本局结束：赢家座位 " + body.winner + "，地主" + (body.landlordWin ? "胜" : "负") + "，分数 " + (body.deltas || []).join("/"));
            renderHand();
            break;
    }
}

function onPdk(type, body) {
    switch (type) {
        case "MsgPaoDeKuaiDealCard":
            $("stateInfo").textContent = "首出: 座位" + body.landlord;
            break;
        case "MsgPaoDeKuaiSyncResp":
            if (body && body.handCards) { hand = body.handCards; selected.clear(); renderHand(); }
            log("同步：手牌 " + hand.length + " 张，状态 " + (body ? body.gameState : "?"));
            refreshStatusText();
            break;
        case "MsgPaoDeKuaiHandCard":
            hand = body.cards || [];
            selected.clear();
            renderHand();
            break;
        case "MsgPaoDeKuaiTurn":
            myTurn = (body.seat === mySeat);
            mustPlay = !!body.mustPlay;
            over = false;
            $("stateInfo").textContent = myTurn ? (mustPlay ? "轮到你（必须出牌）" : "轮到你") : ("等待座位 " + body.seat);
            renderHand();
            break;
        case "MsgPaoDeKuaiPlayCardResp":
            if (!body.success) {
                log("出牌被拒: " + (body.errMsg || "?"));
                if (!body.passed) sendMsg("MsgPaoDeKuaiPlayCard", [["venueId", enc.str(venueId)], ["cardIds", enc.arr([])]]);
                break;
            }
            if (body.passed) { renderTableCards(body.seat, []); log("座位 " + body.seat + " 不出"); }
            else {
                renderTableCards(body.seat, body.cards);
                for (const c of body.cards || []) hand = hand.filter((h) => h.id !== c.id);
                selected.clear();
                renderHand();
            }
            break;
        case "MsgPaoDeKuaiGameOver":
            over = true;
            $("stateInfo").textContent = "本局结束，赢家 座位" + body.winner;
            log("本局结束：赢家座位 " + body.winner + "，分数 " + (body.deltas || []).join("/"));
            renderHand();
            break;
    }
}

function onNiuNiu(type, body) {
    switch (type) {
        case "MsgNiuNiuDealCard":
            $("stateInfo").textContent = "庄家: 座位" + body.banker;
            log("发牌，庄家座位 " + body.banker);
            break;
        case "MsgNiuNiuSyncResp":
            if (body && body.handCards) { hand = body.handCards; selected.clear(); renderHand(); }
            log("同步：手牌 " + hand.length + " 张，状态 " + (body ? body.gameState : "?"));
            refreshStatusText();
            break;
        case "MsgNiuNiuHandCard":
            hand = body.cards || [];
            selected.clear();
            renderHand();
            $("bottomCards").innerHTML = `<span>我的牌型：${NIU_GENRE[body.genre] || body.genre}（${body.times}倍）</span>`;
            break;
        case "MsgNiuNiuCompare":
            renderTableCards(body.seat, body.cards, true);
            $("stateInfo").textContent = "座位" + body.seat + " " + (NIU_GENRE[body.genre] || body.genre);
            log("座位 " + body.seat + " 亮牌: " + (NIU_GENRE[body.genre] || body.genre));
            break;
        case "MsgNiuNiuGameOver":
            over = true;
            myTurn = false;
            $("stateInfo").textContent = "本局结束，赢家 座位" + body.winner + "（庄家 座位" + body.banker + "）";
            log("本局结束：赢家座位 " + body.winner + "，分数 " + (body.deltas || []).join("/"));
            renderHand();
            break;
    }
}

function onMahjong(type, body) {
    switch (type) {
        case "MsgZhejiangMahjongDealCard":
            $("stateInfo").textContent = "庄家: 座位" + body.dealer + "，财神: " + mahjongTileText(body.kingCard);
            $("bottomCards").innerHTML = `<span>财神：${mahjongTileText(body.kingCard)}</span>`;
            log("发牌，庄家座位 " + body.dealer + "，财神 " + mahjongTileText(body.kingCard));
            break;
        case "MsgZhejiangMahjongSyncResp":
            if (body && body.hand) { hand = body.hand; selected.clear(); renderHand(); }
            log("同步：手牌 " + hand.length + " 张，状态 " + (body ? body.gameState : "?"));
            refreshStatusText();
            break;
        case "MsgZhejiangMahjongHandCard":
            hand = body.hand || [];
            selected.clear();
            renderHand();
            break;
        case "MsgZhejiangMahjongDraw":
            log("座位 " + body.seat + " 摸牌 " + (body.seat === mySeat ? mahjongTileText(body.tile) : "") + "，余 " + body.leftNum);
            break;
        case "MsgZhejiangMahjongTurn":
            myTurn = (body.seat === mySeat);
            mustPlay = true;
            over = false;
            $("stateInfo").textContent = myTurn ? "轮到你出牌" : ("等待座位 " + body.seat);
            renderHand();
            break;
        case "MsgZhejiangMahjongDiscardResp":
            if (!body.success) {
                log("出牌被拒: " + (body.errMsg || "?"));
                break;
            }
            renderTableCards(body.seat, [body.tile]);
            hand = hand.filter((t) => t !== body.tile);
            selected.clear();
            renderHand();
            log("座位 " + body.seat + " 打出 " + mahjongTileText(body.tile));
            break;
        case "MsgZhejiangMahjongPong":
            log("座位 " + body.seat + " 碰 " + mahjongTileText(body.tile));
            renderTableCards(body.seat, [body.tile, body.tile, body.tile]);
            break;
        case "MsgZhejiangMahjongGang":
            log("座位 " + body.seat + " " + (body.concealed ? "暗杠" : "明杠") + " " + mahjongTileText(body.tile));
            break;
        case "MsgZhejiangMahjongGameOver":
            over = true;
            myTurn = false;
            $("stateInfo").textContent = "本局结束，赢家 座位" + body.winner;
            log("本局结束：赢家座位 " + body.winner + (body.zimo ? "(自摸)" : "(点炮)") +
                "，番 " + body.fan + "，得分 " + body.score + "，牌型 " + body.desc);
            renderHand();
            break;
    }
}

function onMessage(wrap) {
    const type = wrap.msgType;
    let body = null;
    if (wrap.msgPack) {
        try { body = decode(b64ToBytes(wrap.msgPack)); } catch (e) { log("解码失败: " + e.message); }
    }
    if (type !== "MsgHeartbeatResp") log("← " + type);

    if (type === "MsgPlayerConnectResp") {
        sendMsg("MsgEnterVenue", [["venueId", enc.str(venueId)], ["gameType", enc.int(gameType)], ["base64", enc.str("")]]);
        return;
    }
    if (type === "MsgEnterVenueResp") {
        sendMsg("MsgJoinGame", [["venueId", enc.str(venueId)], ["seat", enc.int(-1)]]);
        return;
    }
    if (type === "MsgJoinGameResp") {
        if (body && body.success) {
            mySeat = body.seat;
            $("seatInfo").textContent = "我是座位 " + mySeat;
            renderOpponents();
            setTimeout(() => {
                sendMsg("MsgPlayerReady", [["venueId", enc.str(venueId)]]);
                const t = { 1031: "MsgLandlordSync", 1032: "MsgPaoDeKuaiSync", 1024: "MsgNiuNiuSync", 1033: "MsgZhejiangMahjongSync" }[gameType];
                if (t) sendMsg(t, [["venueId", enc.str(venueId)]]);
            }, 300);
        } else if (body) {
            log("入座失败: " + (body.errMsg || "?"));
            setTimeout(() => sendMsg("MsgJoinGame", [["venueId", enc.str(venueId)], ["seat", enc.int(-1)]]), 1500);
        }
        return;
    }
    if (type === "MsgAvatarConnect" || type === "MsgAvatarLeave" || type === "MsgPlayerReadyResp") return;

    // 只处理当前游戏的消息（同一会话可能收到其它房间的消息）
    const GAME_OF = [
        ["MsgLandlord", 1031],
        ["MsgPaoDeKuai", 1032],
        ["MsgNiuNiu", 1024],
        ["MsgZhejiangMahjong", 1033]
    ];
    for (const [prefix, gt] of GAME_OF) {
        if (!type.startsWith(prefix)) continue;
        if (gt !== gameType) return;      // 非当前游戏，直接丢弃
        if (gt === 1031) onDdz(type, body || {});
        else if (gt === 1032) onPdk(type, body || {});
        else if (gt === 1024) onNiuNiu(type, body || {});
        else onMahjong(type, body || {});
        return;
    }
}

// ---------------- 连接与断线重连 ----------------
function startTimers() {
    stopTimers();
    hbTimer = setInterval(() => sendMsg("MsgHeartbeat", [["venueId", enc.str(venueId)]]), 3000);
    readyTimer = setInterval(() => sendMsg("MsgPlayerReady", [["venueId", enc.str(venueId)]]), 5000);
    // 假死检测：12 秒收不到任何消息就判定半开连接，强制重连
    watchdogTimer = setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        if (Date.now() - lastRecvAt > 12000) {
            log("12 秒未收到任何消息，判定连接假死，强制重连");
            try { ws.close(); } catch (e) { }
        }
    }, 2000);
}

function stopTimers() {
    if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
    if (readyTimer) { clearInterval(readyTimer); readyTimer = null; }
    if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
}

function scheduleReconnect(reason) {
    if (!wantOnline || !wsAddress || reconnectTimer) return;
    reconnectAttempt++;
    const delay = Math.min(8000, 600 * Math.pow(2, reconnectAttempt - 1)) + Math.floor(Math.random() * 250);
    setConn(`重连中 ${reconnectAttempt}`, "bad");
    log(`${reason}，${(delay / 1000).toFixed(1)}s 后重连（第 ${reconnectAttempt} 次）`);
    $("stateInfo").textContent = "连接断开，正在重连…";
    reconnectTimer = setTimeout(() => { reconnectTimer = null; openSocket(); }, delay);
}

function openSocket() {
    if (!wantOnline || !wsAddress) return;
    stopTimers();
    setConn(reconnectAttempt ? `重连中 ${reconnectAttempt}` : "连接中…", "warn");
    let sock;
    try { sock = new WebSocket(wsAddress); } catch (e) { scheduleReconnect("创建连接失败"); return; }
    ws = sock;
    sock.binaryType = "arraybuffer";
    sock.onopen = () => {
        if (ws !== sock) return;
        const wasReconnect = reconnectAttempt > 0;
        reconnectAttempt = 0;
        lastRecvAt = Date.now();
        setConn("已连接", "ok");
        log("WS 已连接 " + wsAddress);
        $("stateInfo").textContent = wasReconnect ? "重连成功，正在恢复…" : "已连接，等待牌局…";
        sendMsg("MsgPlayerConnect", []);
        startTimers();
    };
    sock.onmessage = (ev) => {
        if (ws !== sock) return;
        lastRecvAt = Date.now();
        try { onMessage(decode(new Uint8Array(ev.data))); } catch (e) { log("消息解析失败: " + e.message); }
    };
    sock.onerror = () => { if (ws === sock) log("WS 错误"); };
    sock.onclose = (ev) => {
        if (ws !== sock) return;
        stopTimers();
        if (!wantOnline) return;
        log("WS 断开" + (ev && ev.code ? "（code " + ev.code + "）" : ""));
        scheduleReconnect("连接断开");
    };
}

// 立即重连（手动按钮 / 网络恢复 / 页面重新可见）
function forceReconnect() {
    if (!wantOnline) return;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    const old = ws;
    ws = null;                                   // 旧 socket 的 close 回调作废
    if (old) { try { old.close(); } catch (e) { } }
    reconnectAttempt = 0;
    log("手动重连");
    openSocket();
}

window.addEventListener("online", () => {
    if (wantOnline && (!ws || ws.readyState === WebSocket.CLOSED)) forceReconnect();
});
document.addEventListener("visibilitychange", () => {
    if (!document.hidden && wantOnline && (!ws || ws.readyState >= WebSocket.CLOSING)) forceReconnect();
});

// ---------------- 启动 ----------------
async function loginAndJoin() {
    const playerId = $("playerId").value.trim();
    const number = $("roomNumber").value.trim();
    const g = $("gameSelect") ? Number($("gameSelect").value) : 1031;
    gameType = g || 1031;
    if (!playerId || !number) { $("loginMsg").textContent = "请填写玩家ID与房号"; return; }
    $("loginMsg").textContent = "获取凭证中…";

    const lr = await fetch("/api/launch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, roomNumber: number, gameType })
    }).then((r) => r.json());
    if (!lr || lr.code !== 0) { $("loginMsg").textContent = "启动失败: " + JSON.stringify(lr).slice(0, 140); return; }
    token = lr.data.token;
    vendorPlayerId = lr.data.vendorPlayerId;
    secret = lr.data.secret || "";
    if (!secret) { $("loginMsg").textContent = "服务端未下发消息密钥"; return; }

    $("loginMsg").textContent = "进房中…";
    const er = await fetch("/api/enter", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, number, gameType })
    }).then((r) => r.json());
    if (!er.venueId) { $("loginMsg").textContent = "进房失败: " + JSON.stringify(er).slice(0, 140); return; }
    venueId = er.venueId;
    wsAddress = (er.wsAddress || "ws://127.0.0.1:9098").replace("10.0.2.2", "127.0.0.1");

    // 新的进房会话：清掉上一局残留状态
    hand = []; selected.clear(); tableCards = {}; mySeat = -1;
    myTurn = false; mustPlay = false; over = false; reconnectAttempt = 0;
    $("playedArea").innerHTML = "";
    $("bottomCards").innerHTML = "";
    renderHand();

    $("login").classList.add("hidden");
    $("table").classList.remove("hidden");
    $("roomInfo").textContent = `房号 ${number} | ${vendorPlayerId} | ${({ 1031: "斗地主", 1024: "牛牛", 1032: "跑得快", 1033: "浙江麻将" })[gameType] || gameType}`;

    stopRoomAutoRefresh();
    wantOnline = true;
    openSocket();
}

// ---------------- 房号列表 ----------------
async function loadRooms() {
    const box = $("roomList");
    if (!box) return;
    const g = $("gameSelect") ? Number($("gameSelect").value) || 1031 : 1031;
    try {
        const r = await fetch(`/api/rooms?gameType=${g}`).then((x) => x.json());
        const items = (r && r.data && r.data.items) || (r && r.items) || [];
        renderRooms(items, g);
    } catch (e) {
        box.innerHTML = `<div class="empty">房间列表不可用：${e.message}</div>`;
    }
}

function renderRooms(items, g) {
    const box = $("roomList");
    if (!items || !items.length) {
        box.innerHTML = `<div class="empty">暂无房间，先建房或换个游戏</div>`;
        return;
    }
    box.innerHTML = "";
    for (const it of items.slice(0, 30)) {
        const max = it.maxPlayerNums || 0;
        const count = it.playerCount || 0;
        const full = max > 0 && count >= max;
        const row = document.createElement("div");
        row.className = "room-item" + (full ? " full" : "");
        const info = document.createElement("div");
        info.innerHTML = `<div class="room-no">${it.number || "?"}</div>
            <div class="room-meta">${count}/${max || "?"} 人 · ${it.ownerName || "房主"}</div>`;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = full ? "已满" : "进入";
        btn.disabled = full;
        btn.onclick = () => {
            $("roomNumber").value = it.number || "";
            $("gameSelect").value = String(g);
            $("loginMsg").textContent = `已选房号 ${it.number}`;
        };
        row.appendChild(info);
        row.appendChild(btn);
        box.appendChild(row);
    }
}

function stopRoomAutoRefresh() {
    if (roomsTimer) { clearInterval(roomsTimer); roomsTimer = null; }
}

function startRoomAutoRefresh() {
    stopRoomAutoRefresh();
    roomsTimer = setInterval(() => {
        const panel = $("login");
        if (panel && !panel.classList.contains("hidden")) loadRooms();
        else stopRoomAutoRefresh();
    }, 6000);
}

$("btnLogin").onclick = loginAndJoin;
$("btnReconnect").onclick = forceReconnect;
$("btnRefreshRooms").onclick = loadRooms;
if ($("gameSelect")) $("gameSelect").addEventListener("change", loadRooms);
$("btnSync").onclick = () => {
    const t = { 1031: "MsgLandlordSync", 1032: "MsgPaoDeKuaiSync", 1024: "MsgNiuNiuSync", 1033: "MsgZhejiangMahjongSync" }[gameType];
    if (t) sendMsg(t, [["venueId", enc.str(venueId)]]);
};
$("btnPlay").onclick = () => {
    if (selected.size === 0) return;
    if (gameType === 1031) {
        const ids = [...selected];
        sendMsg("MsgLandlordPlayCard", [["venueId", enc.str(venueId)], ["cardIds", enc.arr(ids.map((i) => enc.int(i)))]]);
    } else if (gameType === 1032) {
        const ids = [...selected];
        sendMsg("MsgPaoDeKuaiPlayCard", [["venueId", enc.str(venueId)], ["cardIds", enc.arr(ids.map((i) => enc.int(i)))]]);
    } else if (gameType === 1033) {
        const tile = [...selected][0];
        sendMsg("MsgZhejiangMahjongDiscard", [["venueId", enc.str(venueId)], ["tile", enc.int(tile)]]);
    }
    selected.clear();
    renderHand();
};
$("btnPass").onclick = () => {
    if (gameType === 1031) sendMsg("MsgLandlordPlayCard", [["venueId", enc.str(venueId)], ["cardIds", enc.arr([])]]);
    else if (gameType === 1032) sendMsg("MsgPaoDeKuaiPlayCard", [["venueId", enc.str(venueId)], ["cardIds", enc.arr([])]]);
};

// ---------------- 自动化测试钩子 ----------------
window.__state = () => ({
    myTurn, mustPlay, hand: hand.length, selected: selected.size, seat: mySeat, gameType, over,
    conn: connState, attempts: reconnectAttempt, rooms: document.querySelectorAll("#roomList .room-item").length
});

// 自动登录：?auto=1&player=p1001&room=xxxx&game=1031
(function autoLogin() {
    const q = new URLSearchParams(location.search);
    if (q.get("auto") !== "1") {
        loadRooms();
        startRoomAutoRefresh();
        return;
    }
    if (q.get("player")) $("playerId").value = q.get("player");
    if (q.get("room")) $("roomNumber").value = q.get("room");
    if (q.get("game") && $("gameSelect")) $("gameSelect").value = q.get("game");
    setTimeout(() => loginAndJoin(), 200);
})();
