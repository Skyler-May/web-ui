// 极简 msgpack 编解码（只覆盖本项目用到的类型）
(function (global) {
    function concat(parts) {
        let total = 0;
        for (const p of parts) total += p.length;
        const out = new Uint8Array(total);
        let off = 0;
        for (const p of parts) { out.set(p, off); off += p.length; }
        return out;
    }

    const enc = {
        nil: () => Uint8Array.of(0xc0),
        bool: (v) => Uint8Array.of(v ? 0xc3 : 0xc2),
        int: (v) => {
            if (v >= 0 && v < 128) return Uint8Array.of(v);
            if (v >= 0 && v < 256) return Uint8Array.of(0xcc, v);
            if (v >= 0 && v < 65536) return Uint8Array.of(0xcd, v >> 8, v & 0xff);
            if (v >= 0) {
                const b = new Uint8Array(5);
                b[0] = 0xce;
                b[1] = (v >>> 24) & 0xff; b[2] = (v >>> 16) & 0xff; b[3] = (v >>> 8) & 0xff; b[4] = v & 0xff;
                return b;
            }
            if (v >= -32) return Uint8Array.of(0xe0 | (v + 32));
            return Uint8Array.of(0xd2, (v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
        },
        str: (s) => {
            const bytes = new TextEncoder().encode(s);
            const n = bytes.length;
            let head;
            if (n < 32) head = Uint8Array.of(0xa0 | n);
            // 注意：服务端 msgpack-c 可能是 v1，不支持 str8(0xd9)，统一用 str16
            else head = Uint8Array.of(0xda, (n >> 8) & 0xff, n & 0xff);
            const out = new Uint8Array(head.length + n);
            out.set(head, 0); out.set(bytes, head.length);
            return out;
        },
        arr: (items) => {
            const n = items.length;
            let head = n < 16 ? Uint8Array.of(0x90 | n) : Uint8Array.of(0xdc, (n >> 8) & 0xff, n & 0xff);
            const parts = [head];
            for (const it of items) parts.push(it);
            return concat(parts);
        },
        map: (pairs) => {
            const n = pairs.length;
            let head = n < 16 ? Uint8Array.of(0x80 | n) : Uint8Array.of(0xde, (n >> 8) & 0xff, n & 0xff);
            const parts = [head];
            for (const [k, v] of pairs) { parts.push(enc.str(k)); parts.push(v); }
            return concat(parts);
        },
        concat: (parts) => concat(parts)
    };

    function decode(buf) {
        const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        let pos = 0;
        function u8() { return dv.getUint8(pos++); }
        function read(n) { const v = buf.subarray(pos, pos + n); pos += n; return v; }
        function parse() {
            const b = u8();
            if (b <= 0x7f) return b;
            if (b >= 0xe0) return b - 256;
            if ((b & 0xf0) === 0x80) return parseMap(b & 0x0f);
            if ((b & 0xf0) === 0x90) return parseArr(b & 0x0f);
            if ((b & 0xe0) === 0xa0) return new TextDecoder().decode(read(b & 0x1f));
            switch (b) {
                case 0xc0: return null;
                case 0xc2: return false;
                case 0xc3: return true;
                case 0xcc: return u8();
                case 0xcd: { const v = dv.getUint16(pos); pos += 2; return v; }
                case 0xce: { const v = dv.getUint32(pos); pos += 4; return v; }
                case 0xcf: { const v = Number(dv.getBigUint64(pos)); pos += 8; return v; }
                case 0xd0: { const v = dv.getInt8(pos); pos += 1; return v; }
                case 0xd1: { const v = dv.getInt16(pos); pos += 2; return v; }
                case 0xd2: { const v = dv.getInt32(pos); pos += 4; return v; }
                case 0xd9: { const n = u8(); return new TextDecoder().decode(read(n)); }
                case 0xda: { const n = dv.getUint16(pos); pos += 2; return new TextDecoder().decode(read(n)); }
                case 0xdc: { const n = dv.getUint16(pos); pos += 2; return parseArr(n); }
                case 0xde: { const n = dv.getUint16(pos); pos += 2; return parseMap(n); }
                case 0xc4: { const n = u8(); return read(n); }
                case 0xc5: { const n = dv.getUint16(pos); pos += 2; return read(n); }
                default: throw new Error("unsupported msgpack byte 0x" + b.toString(16));
            }
        }
        function parseArr(n) { const a = []; for (let i = 0; i < n; i++) a.push(parse()); return a; }
        function parseMap(n) {
            const o = {};
            for (let i = 0; i < n; i++) { const k = parse(); o[k] = parse(); }
            return o;
        }
        return parse();
    }

    global.MsgPack = { enc, decode };
})(window);
