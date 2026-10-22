// NOCLIP co-op relay server.
//
// Serves the built game (dist/) and relays messages between a host and its
// clients over WebSocket at /ws. The host's browser runs the authoritative
// simulation; this server only routes messages, so it stays tiny and cheap.
//
//   npm start            build + serve on http://localhost:8787
//   PORT=9000 node server/server.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 8787);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const MAX_PLAYERS = 8;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (url.pathname === '/floors') {
    // the public floor directory: open rooms (no password) and the floor each host is on
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
    res.end(JSON.stringify(publicFloors()));
    return;
  }
  if (url.pathname === '/rooms') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify(publicRooms()));
    return;
  }
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    if (!fs.existsSync(path.join(ROOT, 'index.html'))) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Build the game first: npm run build'); return; }
    file = path.join(ROOT, 'index.html');
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

/** @type {Map<string, { code: string, name: string, host: any, peers: Map<string, any>, next: number, open: boolean, pass: string, floor: { zone: string, name: string, depth: number } | null, since: number }>} */
const rooms = new Map();

function publicRooms() {
  return [...rooms.values()].filter((r) => r.open).map((r) => ({ room: r.code, name: r.name, players: r.peers.size + 1, max: MAX_PLAYERS, locked: !!r.pass }));
}
function publicFloors() {
  return [...rooms.values()].filter((r) => r.open && !r.pass && r.peers.size + 1 < MAX_PLAYERS)
    .map((r) => ({ room: r.code, name: r.name, players: r.peers.size + 1, max: MAX_PLAYERS, zone: r.floor?.zone || '', zoneName: r.floor?.name || '', depth: r.floor?.depth ?? 0, since: r.since }));
}
function code() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) { let c = ''; for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)]; if (!rooms.has(c)) return c; }
}
function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); }

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 * 1024 });

wss.on('connection', (ws) => {
  ws.missed = 0;
  ws.on('pong', () => { ws.missed = 0; });
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    switch (m.t) {
      case 'host': {
        const room = { code: code(), name: String(m.name || 'Limbo Phobia').slice(0, 40), host: ws, peers: new Map(), next: 2, open: m.public !== false, pass: String(m.pass || ''), floor: null, since: Date.now() };
        rooms.set(room.code, room);
        ws.room = room; ws.pid = 'p1';
        send(ws, { t: 'hosted', room: room.code, id: 'p1' });
        break;
      }
      case 'join': {
        const room = rooms.get(String(m.room || '').toUpperCase());
        if (!room) { send(ws, { t: 'error', error: 'No such room.' }); return; }
        if (room.pass && room.pass !== m.pass) { send(ws, { t: 'error', error: 'Wrong password.' }); return; }
        if (room.peers.size + 1 >= MAX_PLAYERS) { send(ws, { t: 'error', error: 'Room is full.' }); return; }
        const id = 'p' + room.next++;
        room.peers.set(id, ws);
        ws.room = room; ws.pid = id;
        send(ws, { t: 'joined', room: room.code, id, host: 'p1' });
        send(room.host, { t: 'peerJoin', id, name: String(m.name || 'Survivor').slice(0, 24) });
        break;
      }
      case 'msg': {
        const room = ws.room; if (!room) return;
        const out = JSON.stringify({ t: 'msg', from: ws.pid, d: m.d });
        if (m.to === 'host') send(room.host, out);
        else if (m.to === 'all') { if (ws !== room.host) send(room.host, out); for (const [id, p] of room.peers) if (id !== ws.pid) send(p, out); }
        else if (m.to === 'p1') send(room.host, out);
        else send(room.peers.get(m.to), out);
        break;
      }
      case 'kick': {
        const room = ws.room; if (!room || room.host !== ws) return;
        const p = room.peers.get(m.id); if (p) { send(p, { t: 'error', error: 'Removed by the host.' }); p.close(); }
        break;
      }
      case 'floor': {
        // a host says which floor it is on (for the public floor directory)
        const room = ws.room; if (!room || room.host !== ws) return;
        room.floor = { zone: String(m.zone || '').slice(0, 40), name: String(m.name || '').slice(0, 60), depth: Number(m.depth) || 0 };
        break;
      }
      case 'ping': send(ws, { t: 'pong', at: m.at }); break;
    }
  });
  ws.on('close', () => {
    const room = ws.room; if (!room) return;
    if (room.host === ws) {
      for (const p of room.peers.values()) { send(p, { t: 'hostLeft' }); p.close(); }
      rooms.delete(room.code);
    } else {
      room.peers.delete(ws.pid);
      send(room.host, { t: 'peerLeave', id: ws.pid });
      for (const p of room.peers.values()) send(p, { t: 'msg', from: ws.pid, d: { k: 'left' } });
    }
  });
});

// heartbeat: a socket that has not answered for about a minute is gone. A tab that is busy
// building the world (shader compiles on a slow phone) can stall for tens of seconds and
// must not be dropped right after it was welcomed.
setInterval(() => {
  for (const ws of wss.clients) { if (ws.missed >= 4) { ws.terminate(); continue; } ws.missed++; ws.ping(); }
}, 15000);

server.listen(PORT, () => console.log(`Limbo Phobia server on http://localhost:${PORT}  (relay at ws://localhost:${PORT}/ws)`));
