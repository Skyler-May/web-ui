// 移动端截图：用 CDP 设置设备尺寸（默认 iPhone 13 390x844），打开页面并等待
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";

const url = process.argv[2];
const outFile = process.argv[3] || "mobile.png";
const waitSec = Number(process.argv[4] || 12);
const port = Number(process.argv[5] || 9260);
const W = Number(process.env.DEV_W || 390);
const H = Number(process.env.DEV_H || 844);
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
        `--remote-debugging-port=${port}`, `--window-size=${W},${H}`,
        "--user-data-dir=" + fs.mkdtempSync(process.env.TEMP + "/h5mob-"),
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

        await cmd("Page.enable");
        await cmd("Emulation.setDeviceMetricsOverride", {
            width: W, height: H, deviceScaleFactor: 2, mobile: true
        });
        await cmd("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
        await cmd("Page.navigate", { url });
        console.log(`已打开 ${url}（${W}x${H} 移动端）`);
        await sleep(waitSec * 1000);

        const shot = await cmd("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(outFile, Buffer.from(shot.result.data, "base64"));
        console.log("截图: " + outFile);
        ws.close();
    } finally {
        chrome.kill();
    }
}

main().catch((e) => { console.error("失败:", e.message); process.exit(1); });
