// 碰杠询问验证：打开麻将房间 → 等 #actionBar 出现 → 点「碰」→ 截图
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";

const url = process.argv[2];
const outFile = process.argv[3] || "mj-action.png";
const port = Number(process.argv[4] || 9290);
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
        "--user-data-dir=" + fs.mkdtempSync(process.env.TEMP + "/h5mja-"),
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
        console.log("打开麻将房间，等待碰杠询问…");

        let shown = false;
        for (let i = 0; i < 120; i++) {
            await sleep(1000);
            const st = await evalJs(`(function(){
                const bar = document.getElementById('actionBar');
                return {
                    visible: !!(bar && !bar.classList.contains('hidden') && bar.children.length),
                    text: bar ? bar.innerText.replace(/\\n/g, ' ') : '',
                    over: (document.getElementById('log') ? document.getElementById('log').innerText : '').indexOf('本局结束') >= 0
                };
            })()`);
            if (st && st.visible) {
                console.log("出现询问：" + st.text);
                const shot1 = await cmd("Page.captureScreenshot", { format: "png" });
                fs.writeFileSync(outFile, Buffer.from(shot1.result.data, "base64"));
                console.log("已截图询问界面: " + outFile);
                // 点「碰」（或第一个按钮）
                const clicked = await evalJs(`(function(){
                    const bar = document.getElementById('actionBar');
                    if (!bar || !bar.children.length) return 'none';
                    const btn = [...bar.querySelectorAll('button')].find((b) => b.textContent === '碰') || bar.querySelector('button');
                    btn.click();
                    return btn.textContent;
                })()`);
                console.log("点击: " + clicked);
                await sleep(2500);
                const shot2 = await cmd("Page.captureScreenshot", { format: "png" });
                fs.writeFileSync(outFile.replace(/\.png$/, "-after.png"), Buffer.from(shot2.result.data, "base64"));
                console.log("已截图操作后: " + outFile.replace(/\.png$/, "-after.png"));
                shown = true;
                break;
            }
            if (st && st.over) {
                console.log("本局已结束，重新等待下一局…");
            }
        }
        if (!shown) console.log("超时：未等到碰杠询问");

        ws.close();
    } finally {
        chrome.kill();
    }
}

main().catch((e) => { console.error("失败:", e.message); process.exit(1); });
