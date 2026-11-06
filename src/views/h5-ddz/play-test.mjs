// 自动化对局：打开页面 → 等到轮到我 → 出最小的一张牌 → 截图
// 用法：node play-test.mjs <url> <outFile> [port]
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";

const url = process.argv[2];
const outFile = process.argv[3] || "play.png";
const port = Number(process.argv[4] || 9223);
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
        "--user-data-dir=" + fs.mkdtempSync(process.env.TEMP + "/h5play-"),
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
            const msg = JSON.parse(String(ev.data));
            if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
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
        console.log("打开页面…");

        let played = false;
        for (let i = 0; i < 40; i++) {
            await sleep(1000);
            const state = await evalJs(`(function(){
                const s = window.__state ? window.__state() : null;
                return s || { myTurn: false, hand: 0 };
            })()`);
            if (state && state.myTurn) {
                console.log("轮到我，手牌 " + state.hand + " 张，尝试出最小一张");
                await evalJs(`(function(){
                    const cards = [...document.querySelectorAll('#myHand .card')];
                    if (!cards.length) return 'no-card';
                    cards[0].click();
                    document.getElementById('btnPlay').click();
                    return 'played';
                })()`);
                played = true;
                await sleep(5000);
                break;
            }
        }
        if (!played) console.log("等待超时，未轮到我");

        const shot = await cmd("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(outFile, Buffer.from(shot.result.data, "base64"));
        console.log("截图: " + outFile);
        ws.close();
    } finally {
        chrome.kill();
    }
}

main().catch((e) => { console.error("失败:", e.message); process.exit(1); });
