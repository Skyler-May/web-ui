// 斗地主 H5 客户端（NiuMa 协议：msgpack + md5 签名 + WebSocket）
const { enc, decode } = window.MsgPack;

let token = "";
let vendorPlayerId = "";
let venueId = "";
let secret = "";
let ws = null;
let mySeat = -1;
let hand = [];              // PokerCard[]
let selected = new Set();   // card ids
let myTurn = false;
let mustPlay = false;
let landlord = -1;
let hbTimer = null;

const $ = (id) => document.getElementById(id);
const logEl = $("log");
function log(msg) {
    const t = new Date().toLocaleTimeString();
    logEl.innerHTML += `<div>[${t}] ${msg}</div>`;
    logEl.scrollTop = logEl.scrollHeight;
}

// ---------- 牌面渲染 ----------
const RANKS = { 1: "A", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "J", 12: "Q", 13: "K", 14: "王" };
const SUITS = { 1: "♦", 2: "♣", 3: "♥", 4: "♠", 5: "小", 6: "大" };

function cardEl(card, small) {
    const el = document.createElement("div");
    el.className = "card" + (small ? " small" : "");
    const red = card.suit === 1 || card.suit === 3 || card.suit === 6;
    if (red) el.classList.add("red");
    const rank = RANKS[card.point] || "?";
    const suit = SUITS[card.suit] || "";
    if (card.point === 14) {
        el.innerHTML = `<div>${card.suit === 6 ? "大王" : "小王"}</div>`;
    } else {
        el.innerHTML = `<div>${rank}</div><div class="suit">${suit}</div>`;
    }
    el.dataset.id = card.id;
    return el;
}

function renderHand() {
    const box = $("myHand");
    box.innerHTML = "";
    const sorted = [...hand].sort((a, b) => a.id - b.id);
    for (const c of sorted) {
        const el = cardEl(c, false);
        if (selected.has(c.id)) el.classList.add("selected");
        el.onclick = () => {
            if (!myTurn) return;
            if (selected.has(c.id)) selected.delete(c.id); else selected.add(c.id);
            renderHand();
        };
        box.appendChild(el);
    }
    $("btnPlay").disabled = !myTurn || selected.size === 0;
    $("btnPass").disabled = !myTurn || mustPlay;
}

function renderPlayed(cards) {
    const box = $("playedArea");
    box.innerHTML = "";
    for (const c of cards || []) box.appendChild(cardEl(c, true));
}

// ---------- 发送 ----------
function sendMsg(msgType, extraPairs = []) {
    if (!ws || ws.readyState !== WebSocket.OPEN) { log("（未连接，跳过 " + msgType + "，state=" + (ws ? ws.readyState : "null") + "）"); return; }
    try {
    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
    const sig = window.md5(`${vendorPlayerId}&${ts}&${nonce}&${secret}`);
    const pairs = [
        ["playerId", enc.str(vendorPlayerId)],
        ["timestamp", enc.str(ts)],
        ["nonce", enc.str(nonce)],
        ["signature", enc.str(sig)],
        ...extraPairs
    ];
    const inner = enc.map(pairs);
    let b64 = "";
    const bytes = inner;
    for (let i = 0; i < bytes.length; i++) b64 += String.fromCharCode(bytes[i]);
    b64 = btoa(b64);
    const wrapper = enc.map([
        ["msgType", enc.str(msgType)],
        ["msgPack", enc.str(b64)]
    ]);
    ws.send(wrapper);
    const hex = Array.from(wrapper.slice(0, 12)).map((b) => b.toString(16).padStart(2, "0")).join(" ");
    log("→ " + msgType + " len=" + wrapper.length + " head=" + hex);
    } catch (e) { log("发送异常 " + msgType + ": " + e.message); }
}

function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

// ---------- 消息处理 ----------
function onMessage(wrap) {
    const type = wrap.msgType;
    log("← " + type);
    let body = null;
    if (wrap.msgPack) {
        try { body = decode(b64ToBytes(wrap.msgPack)); } catch (e) { log("解码失败: " + e.message); }
    }

    switch (type) {
        case "MsgPlayerConnectResp":
            log("已连接，进入场地");
            sendMsg("MsgEnterVenue", [["venueId", enc.str(venueId)], ["gameType", enc.int(1031)], ["base64", enc.str("")]]);
            break;

        case "MsgEnterVenueResp":
            log("进场地成功，坐下");
            sendMsg("MsgJoinGame", [["venueId", enc.str(venueId)], ["seat", enc.int(-1)]]);
            break;

        case "MsgJoinGameResp":
            if (body && body.success) {
                mySeat = body.seat;
                $("seatInfo").textContent = "我是座位 " + mySeat;
                log("入座成功 seat=" + mySeat + "，准备");
                setTimeout(() => sendMsg("MsgPlayerReady", [["venueId", enc.str(venueId)]]), 300);
            } else if (body) {
                log("入座失败: " + (body.errMsg || "?"));
                setTimeout(() => sendMsg("MsgJoinGame", [["venueId", enc.str(venueId)], ["seat", enc.int(-1)]]), 1500);
            }
            break;

        case "MsgPlayerReadyResp":
            break;

        case "MsgLandlordDealCard":
            landlord = body.landlord;
            $("stateInfo").textContent = "地主: 座位" + landlord;
            $("bottomCards").innerHTML = "<span>底牌：</span>";
            for (const c of body.bottomCards || []) $("bottomCards").appendChild(cardEl(c, true));
            log("发牌，地主座位 " + landlord);
            break;

        case "MsgLandlordHandCard":
            hand = body.cards || [];
            selected.clear();
            renderHand();
            break;

        case "MsgLandlordTurn":
            myTurn = (body.seat === mySeat);
            mustPlay = !!body.mustPlay;
            $("stateInfo").textContent = myTurn ? (mustPlay ? "轮到你（必须出牌）" : "轮到你") : ("等待座位 " + body.seat);
            document.querySelectorAll(".opp").forEach((el) => el.classList.remove("active"));
            renderHand();
            break;

        case "MsgLandlordPlayCardResp":
            if (!body.success) {
                log("出牌被拒: " + (body.errMsg || "?"));
                if (!body.passed) {
                    // 被拒后自动过牌，避免卡住
                    sendMsg("MsgLandlordPlayCard", [["venueId", enc.str(venueId)], ["cardIds", enc.arr([])]]);
                }
                break;
            }
            if (body.passed) {
                log("座位 " + body.seat + " 不出");
                renderPlayed([]);
            } else {
                log("座位 " + body.seat + " 出牌，剩 " + body.leftNums + " 张");
                renderPlayed(body.cards);
                for (const c of body.cards || []) {
                    hand = hand.filter((h) => h.id !== c.id);
                }
                selected.clear();
                renderHand();
            }
            break;

        case "MsgLandlordGameOver":
            log("本局结束：赢家座位 " + body.winner + "，地主" + (body.landlordWin ? "胜" : "负") +
                "，分数 " + (body.deltas || []).join("/"));
            $("stateInfo").textContent = "本局结束，赢家 座位" + body.winner;
            myTurn = false;
            renderHand();
            break;

        case "MsgLandlordSyncResp":
            hand = body.handCards || [];
            renderHand();
            log("同步：手牌 " + hand.length + " 张，状态 " + body.gameState);
            break;
    }
}

// ---------- 连接 ----------
async function loginAndJoin() {
    const playerId = $("playerId").value.trim();
    const number = $("roomNumber").value.trim();
    if (!playerId || !number) {
        $("loginMsg").textContent = "请填写玩家ID与房号";
        return;
    }
    $("loginMsg").textContent = "登录中…";

    const lr = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId })
    }).then((r) => r.json());
    if (lr.code !== 0) {
        $("loginMsg").textContent = "登录失败: " + JSON.stringify(lr).slice(0, 120);
        return;
    }
    token = lr.data.token;
    vendorPlayerId = lr.data.vendorPlayerId || lr.data.playerId;
    $("loginMsg").textContent = "登录成功 " + vendorPlayerId + "，进房中…";

    const er = await fetch("/api/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, number, gameType: 1031 })
    }).then((r) => r.json());
    if (!er.venueId) {
        $("loginMsg").textContent = "进房失败: " + JSON.stringify(er).slice(0, 140);
        return;
    }
    venueId = er.venueId;
    let wsAddress = er.wsAddress || "ws://127.0.0.1:9098";
    wsAddress = wsAddress.replace("10.0.2.2", "127.0.0.1");

    const sr = await fetch("/api/secret?playerId=" + encodeURIComponent(vendorPlayerId)).then((r) => r.json());
    secret = sr.secret || "";
    if (!secret) {
        $("loginMsg").textContent = "没有消息密钥（玩家可能还没建立会话）";
        return;
    }

    $("login").classList.add("hidden");
    $("table").classList.remove("hidden");
    $("roomInfo").textContent = "房号 " + number + " | " + vendorPlayerId;

    ws = new WebSocket(wsAddress);
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
        log("WS 已连接 " + wsAddress);
        sendMsg("MsgPlayerConnect", []);
        if (hbTimer) clearInterval(hbTimer);
        hbTimer = setInterval(() => sendMsg("MsgHeartbeat", [["venueId", enc.str(venueId)]]), 3000);
        setInterval(() => sendMsg("MsgPlayerReady", [["venueId", enc.str(venueId)]]), 5000);
    };
    ws.onmessage = (ev) => {
        try {
            const buf = new Uint8Array(ev.data);
            const wrap = decode(buf);
            onMessage(wrap);
        } catch (e) {
            log("消息解析失败: " + e.message);
        }
    };
    ws.onerror = () => log("WS 错误");
    ws.onclose = () => log("WS 关闭");
}

$("btnLogin").onclick = loginAndJoin;
$("btnSync").onclick = () => sendMsg("MsgLandlordSync", [["venueId", enc.str(venueId)]]);
$("btnPlay").onclick = () => {
    if (selected.size === 0) return;
    const ids = [...selected];
    sendMsg("MsgLandlordPlayCard", [
        ["venueId", enc.str(venueId)],
        ["cardIds", enc.arr(ids.map((i) => enc.int(i)))]
    ]);
    selected.clear();
    renderHand();
};
$("btnPass").onclick = () => {
    sendMsg("MsgLandlordPlayCard", [["venueId", enc.str(venueId)], ["cardIds", enc.arr([])]]);
};

// ---------- 便于自动化测试：?player=p1001&room=739425&auto=1 ----------
(function autoLogin() {
    const q = new URLSearchParams(location.search);
    if (q.get("auto") !== "1") return;
    if (q.get("player")) $("playerId").value = q.get("player");
    if (q.get("room")) $("roomNumber").value = q.get("room");
    setTimeout(() => loginAndJoin(), 200);
})();
// 供自动化测试读取内部状态
window.__state = () => ({ myTurn, mustPlay, hand: hand.length, selected: selected.size, seat: mySeat });