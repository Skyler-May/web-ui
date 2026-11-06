// 横幅动效验证：打开页面 → 调 showBanner → 截图
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";

const url = process.argv[2];
const outFile = process.argv[3] || "banner.png";
const port = Number(process.argv[4] || 9262);
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
        `--remote-debugging-port=${port}`, "--window-size=390,844",
        "--user-data-dir=" + fs.mkdtempSync(process.env.TEMP + "/h5banner-"),
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
        await cmd("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
        await cmd("Page.navigate", { url });
        await sleep(9000);

        await evalJs(`showBanner('🎉 你赢了', '赢家 座位0 · 地主胜 · 200 / -100 / -100')`);
        await sleep(400);

        const shot = await cmd("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(outFile, Buffer.from(shot.result.data, "base64"));
        console.log("截图: " + outFile);
        ws.close();
    } finally {
        chrome.kill();
    }
}

main().catch((e) => { console.error("失败:", e.message); process.exit(1); });
