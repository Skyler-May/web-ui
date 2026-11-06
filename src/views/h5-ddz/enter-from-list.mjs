// 房号列表点「进入」测试：打开首页 → 点第一个房间的进入 → 等待开局 → 截图
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";

const outFile = process.argv[2] || "enter.png";
const port = Number(process.argv[3] || 9254);
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
        `--remote-debugging-port=${port}`, "--window-size=1280,900",
        "--user-data-dir=" + fs.mkdtempSync(process.env.TEMP + "/h5enter-"),
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
        await cmd("Page.navigate", { url: "http://127.0.0.1:18098/" });
        await sleep(6000);

        const clicked = await evalJs(`(function(){
            const btns = [...document.querySelectorAll('#roomList .room-item button')];
            if (!btns.length) return 'no-room';
            btns[0].click();
            return 'clicked:' + (btns[0].textContent || '').trim();
        })()`);
        console.log("点击房间: " + clicked);

        // 若点的是房间卡片，再点一次「登录并进房」
        await sleep(1500);
        await evalJs(`(function(){
            const b = document.getElementById('btnLogin');
            if (b && b.offsetParent !== null) b.click();
            return 'login-clicked';
        })()`);

        await sleep(16000);
        const logs = String(await evalJs(`document.getElementById('log') ? document.getElementById('log').innerText : ''`));
        console.log("---- 日志 ----");
        console.log(logs.split("\n").slice(-10).join("\n"));

        const shot = await cmd("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(outFile, Buffer.from(shot.result.data, "base64"));
        console.log("截图: " + outFile);
        ws.close();
    } finally {
        chrome.kill();
    }
}

main().catch((e) => { console.error("失败:", e.message); process.exit(1); });
