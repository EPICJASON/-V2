// 휠체어RPG 온라인 마을 서버 (의존성 없음, Node 18+)
//   실행: node server.js   (PORT 환경변수 사용, 기본 8080)
// 기능: 마을에 있는 플레이어들의 위치/닉네임/레벨/칭호를 서로에게 보여 준다. 공격·거래 등 상호작용은 없다.
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const MAX_PLAYERS = 60;       // 동시 접속 상한
const WORLD_W = 2400, WORLD_H = 1200;
const VIEW_R = 1100;          // 이 거리 안의 플레이어만 보내 준다 (대역폭 절약)
const VIEW_MAX = 30;          // 한 번에 보내는 최대 인원
const TICK_MS = 100;          // 상태 전송 주기
const IDLE_MS = 15000;        // 이 시간 동안 메시지가 없으면 끊음
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const players = new Map();    // id -> {sock, id, n, lv, ti, w, x, y, f, v, last, msgs, buf}
let nextId = 1;

const fs = require('fs'), path = require('path');
// 같은 폴더의 index.html(게임)이 있으면 주소 "/" 에서 함께 제공합니다. 이때 서버 주소는 자동으로 이 서버로 설정됩니다.
const server = http.createServer((req, res) => {
  const u = (req.url || '/').split('?')[0];
  if (u === '/' || u === '/index.html') {
    try {
      let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      const proto = (req.headers['x-forwarded-proto'] || 'http') === 'https' ? 'wss' : 'ws';
      html = html.replace("const DEFAULT_SERVER='';", "const DEFAULT_SERVER='" + proto + "://" + req.headers.host + "';");
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    } catch (e) { /* index.html 없으면 아래 상태 메시지 */ }
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end('휠체어RPG 서버 정상 작동 중 / 접속자 ' + players.size);
});

// ---------- 최소 WebSocket 구현 ----------
function frame(opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}
function sendJson(p, obj) {
  if (p.sock.destroyed) return;
  try { p.sock.write(frame(0x1, Buffer.from(JSON.stringify(obj)))); } catch (e) {}
}
function drop(p) {
  if (!players.has(p.id)) return;
  players.delete(p.id);
  try { p.sock.destroy(); } catch (e) {}
}

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { sock.destroy(); return; }
  if (players.size >= MAX_PLAYERS) { sock.write('HTTP/1.1 503 Service Unavailable\r\n\r\n'); sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sock.setNoDelay(true);
  const p = { sock, id: nextId++, n: '손님', lv: 1, ti: '', w: 0, x: 0, y: 0, f: 1, v: false, last: Date.now(), msgs: 0, buf: Buffer.alloc(0), frag: null };
  players.set(p.id, p);
  sendJson(p, { t: 'welcome', id: p.id });
  sock.on('data', d => {
    p.buf = Buffer.concat([p.buf, d]);
    if (p.buf.length > 16384) { drop(p); return; }
    parse(p);
  });
  sock.on('close', () => drop(p));
  sock.on('error', () => drop(p));
});

function parse(p) {
  for (;;) {
    const b = p.buf;
    if (b.length < 2) return;
    const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; const big = b.readBigUInt64BE(2); if (big > 8192n) { drop(p); return; } len = Number(big); off = 10; }
    if (!masked) { drop(p); return; }          // 클라이언트 프레임은 반드시 마스크
    if (len > 4096) { drop(p); return; }
    if (b.length < off + 4 + len) return;
    const mask = b.slice(off, off + 4);
    const data = Buffer.from(b.slice(off + 4, off + 4 + len));
    for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
    p.buf = b.slice(off + 4 + len);
    if (op === 0x8) { drop(p); return; }                                 // close
    if (op === 0x9) { try { p.sock.write(frame(0xA, data)); } catch (e) {} continue; }   // ping -> pong
    if (op === 0xA) continue;
    if (op === 0x1 || op === 0x0) {
      if (op === 0x1) p.frag = [];
      if (!p.frag) continue;
      p.frag.push(data);
      if (fin) { const text = Buffer.concat(p.frag).toString('utf8'); p.frag = null; onMessage(p, text); }
    }
  }
}

const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v)) ? Math.min(hi, Math.max(lo, v)) : d;
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').slice(0, n);

function onMessage(p, text) {
  p.last = Date.now();
  if (++p.msgs > 40) return;                    // 초당 40개 초과는 무시 (tick에서 0으로 리셋)
  let m; try { m = JSON.parse(text); } catch (e) { return; }
  if (!m || typeof m !== 'object') return;
  if (m.t === 'join') { p.n = str(m.n, 12) || '손님'; }
  else if (m.t === 'pos') {
    p.x = num(m.x, 0, WORLD_W, p.x); p.y = num(m.y, 0, WORLD_H, p.y);
    p.f = m.f ? 1 : 0; p.w = num(m.w, 0, 20, 0) | 0; p.lv = num(m.lv, 1, 9999, 1) | 0;
    p.ti = str(m.ti, 12); p.v = true;
    if (m.n) p.n = str(m.n, 12) || p.n;
  }
  else if (m.t === 'away') { p.v = false; }
}

setInterval(() => {
  const now = Date.now();
  for (const p of players.values()) { p.msgs = 0; if (now - p.last > IDLE_MS) drop(p); }
  const vis = [...players.values()].filter(p => p.v);
  for (const p of players.values()) {
    if (!p.v) { sendJson(p, { t: 'state', p: [], n: vis.length }); continue; }
    const list = vis.filter(o => o !== p && Math.hypot(o.x - p.x, o.y - p.y) < VIEW_R)
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, VIEW_MAX)
      .map(o => ({ id: o.id, n: o.n, lv: o.lv, ti: o.ti, w: o.w, x: Math.round(o.x), y: Math.round(o.y), f: o.f }));
    sendJson(p, { t: 'state', p: list, n: vis.length });
  }
}, TICK_MS);

server.listen(PORT, () => console.log('휠체어RPG 서버 시작: 포트 ' + PORT));
