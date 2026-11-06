// 全自动打完一局：轮到我 → 出最小一张 / 跟牌失败则过 → 直到结算
// 用法：node full-game.mjs <url> <outFile> [port]
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";

const url = process.argv[2];
const outFile = process.argv[3] || "full.png";
const port = Number(process.argv[4] || 9225);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(path) {
    return new Promise((resolve, reject) => {
        http.get({ host: "127.0.0.1", port, path }, (res) => {
            let d = "";
            res.on("data", (c) => (d += c));
            res.on("end", () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
        }).on("error", reject);
    });
}

async function main() {
    const chrome = spawn(CHROME, [
        "--headless=new", "--disable-gpu", "--no-sandbox",
        `--remote-debugging-port=${port}`, "--window-size=1280,800",
        "--user-data-dir=" + fs.mkdtempSync(process.env.TEMP + "/h5full-"),
        "about:blank"
    ], { stdio: "ignore" });

    try {
        let targets = null;
        for (let i = 0; i < 40; i++) {
            try { targets = await getJson("/json/list"); break; } catch (e) { await sleep(250); }
        }
        const page = targets.find((t) => t.type === "page");
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        let id = 0;
        const pending = new Map();
        ws.addEventListener("message", (ev) => {
            const m = JSON.parse(String(ev.data));
            if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
        });
        await new Promise((r) => ws.addEventListener("open", r));
        const cmd = (method, params = {}) => new Promise((resolve) => {
            const myId = ++id;
            pending.set(myId, resolve);
            ws.send(JSON.stringify({ id: myId, method, params }));
        });
        const evalJs = async (expr) => {
            const r = await cmd("Runtime.evaluate", { expression: expr, returnByValue: true });
            return r.result && r.result.result ? r.result.result.value : undefined;
        };

        await cmd("Page.enable");
        await cmd("Page.navigate", { url });
        console.log("开始自动对局…");

        let over = false;
        for (let i = 0; i < 150; i++) {
            await sleep(1200);
            const st = await evalJs(`(function(){
                const s = window.__state ? window.__state() : null;
                const logText = document.getElementById('log') ? document.getElementById('log').innerText : '';
                return { s, over: logText.indexOf('本局结束') >= 0 };
            })()`);
            if (!st) continue;
            if (st.over) { console.log("本局结束"); over = true; break; }
            if (st.s && st.s.myTurn) {
                const r = await evalJs(`(function(){
                    const s = window.__state();
                    const cards = [...document.querySelectorAll('#myHand .card, #myHand .tile')];
                    if (!cards.length) return 'no-card';
                    if (s.mustPlay) {
                        cards[0].click();
                        document.getElementById('btnPlay').click();
                        return 'play';
                    }
                    // 跟牌：先试最小一张，被拒会自动过牌
                    cards[0].click();
                    document.getElementById('btnPlay').click();
                    return 'try';
                })()`);
                console.log("回合 " + i + " -> " + r);
            }
        }
        await sleep(2000);
        const shot = await cmd("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(outFile, Buffer.from(shot.result.data, "base64"));
        console.log("截图: " + outFile + (over ? "（已结算）" : "（未结算，可能仍在进行）"));
        ws.close();
    } finally {
        chrome.kill();
    }
}

main().catch((e) => { console.error("失败:", e.message); process.exit(1); });
