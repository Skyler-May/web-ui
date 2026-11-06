import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const VENDOR = process.env.VENDOR || "http://127.0.0.1:18080";
const MERCHANT = process.env.MERCHANT || "gc_test";
const MERCHANT_SECRET = process.env.MERCHANT_SECRET || "CHANGE_ME_TEST_SECRET_32_BYTES_MIN";
const PORT = Number(process.env.PORT || 18098);
const PUBLIC = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "public");

function hmac(msg, ts, nonce, body) {
    return crypto.createHmac("sha256", MERCHANT_SECRET).update(msg + ts + nonce + body, "utf8").digest("base64");
}

async function postJson(url, headers, body) {
    const res = await fetch(url, { method: "POST", headers, body });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
    return { status: res.status, json };
}

function send(res, code, obj, type = "application/json") {
    const body = type === "application/json" ? JSON.stringify(obj) : obj;
    res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(body);
}

function readBody(req) {
    return new Promise((resolve) => {
        let data = "";
        req.on("data", (c) => (data += c));
        req.on("end", () => {
            try { resolve(data ? JSON.parse(data) : {}); } catch (e) { resolve({}); }
        });
    });
}

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".ico": "image/x-icon"
};

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");

    // ---- API: 启动（转发到 niuma-admin 的 /api/h5/launch，服务端换 token + 下发消息密钥） ----
    if (url.pathname === "/api/launch" && req.method === "POST") {
        const body = await readBody(req);
        const r = await postJson(VENDOR + "/api/h5/launch", { "Content-Type": "application/json" }, JSON.stringify(body));
        return send(res, 200, r.json);
    }
    // ---- API: 按房号进房 ----
    if (url.pathname === "/api/enter" && req.method === "POST") {
        const body = await readBody(req);
        const r = await postJson(VENDOR + "/player/game/enter/number", {
            "Content-Type": "application/json",
            "PLAYER-AUTHORIZATION": body.token
        }, JSON.stringify({ number: body.number, gameType: body.gameType || 1031 }));
        return send(res, r.status, r.json);
    }

    // ---- 静态文件 ----
    let p = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[\/\\])+/, ""));
    fs.readFile(file, (err, data) => {
        if (err) { send(res, 404, "not found", "text/plain"); return; }
        const ext = path.extname(file).toLowerCase();
        send(res, 200, data, MIME[ext] || "application/octet-stream");
    });
});

server.listen(PORT, "127.0.0.1", () => {
    console.log(`H5 client: http://127.0.0.1:${PORT}/`);
    console.log(`vendor: ${VENDOR}, merchant: ${MERCHANT}`);
});
