// 用 CDP 驱动无头 Chrome：打开页面 → 等待 N 秒（真实时间）→ 截图
// 用法：node shot.mjs <url> <outFile> <waitSeconds> [port]
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";

const url = process.argv[2];
const outFile = process.argv[3] || "shot.png";
const waitSec = Number(process.argv[4] || 20);
const port = Number(process.argv[5] || 9222);

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

function getJson(path) {
    return new Promise((resolve, reject) => {
        http.get({ host: "127.0.0.1", port, path }, (res) => {
            let data = "";
            res.on("data", (c) => (data += c));
            res.on("end", () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
        }).on("error", reject);
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
    const chrome = spawn(CHROME, [
        "--headless=new", "--disable-gpu", "--no-sandbox",
        `--remote-debugging-port=${port}`,
        "--window-size=1280,800",
        "--user-data-dir=" + fs.mkdtempSync(process.env.TEMP + "/h5cdp-"),
        "about:blank"
    ], { stdio: "ignore" });

    try {
        let targets = null;
        for (let i = 0; i < 40; i++) {
            try { targets = await getJson("/json/list"); break; } catch (e) { await sleep(250); }
        }
        if (!targets) throw new Error("chrome devtools 未就绪");
        const page = targets.find((t) => t.type === "page");
        if (!page) throw new Error("没有页面 target");

        // Node 22+ 自带全局 WebSocket（undici），无需第三方模块

        const ws = new WebSocket(page.webSocketDebuggerUrl);
        let id = 0;
        const pending = new Map();
        ws.addEventListener("message", (ev) => {
            const msg = JSON.parse(String(ev.data));
            if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
        });
        await new Promise((r) => ws.addEventListener("open", r));
        const cmd = (method, params = {}) => new Promise((resolve) => {
            const myId = ++id;
            pending.set(myId, resolve);
            ws.send(JSON.stringify({ id: myId, method, params }));
        });

        await cmd("Page.enable");
        await cmd("Page.navigate", { url });
        console.log("已打开页面，等待 " + waitSec + " 秒…");
        await sleep(waitSec * 1000);

        const shot = await cmd("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(outFile, Buffer.from(shot.data, "base64"));
        console.log("截图已保存: " + outFile);
        ws.close();
    } finally {
        chrome.kill();
    }
}

main().catch((e) => { console.error("失败:", e.message); process.exit(1); });
