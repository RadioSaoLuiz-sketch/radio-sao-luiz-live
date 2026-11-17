/**
 * Rádio São Luiz — Servidor de sinalização WebRTC
 *
 * O vídeo/áudio NÃO passa por este servidor: ele só apresenta o celular ao OBS
 * (troca de SDP/ICE). A mídia vai direto (P2P) entre celular e OBS, por isso o
 * atraso é mínimo. Se a rede bloquear o P2P, configure um servidor TURN (ver README).
 */
const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const STREAM_KEY = process.env.STREAM_KEY || 'saoluiz2026';

const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));

app.get('/', (_req, res) => res.redirect('/camera.html'));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

// Servidores ICE entregues aos clientes (TURN opcional via variáveis de ambiente)
app.get('/config', (_req, res) => {
  const iceServers = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  ];
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL.split(',').map((s) => s.trim()),
      username: process.env.TURN_USER,
      credential: process.env.TURN_PASS,
    });
  }
  res.set('Cache-Control', 'no-store').json({ iceServers });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 });

/** rooms: Map<nomeSala, { camera?: WebSocket, obs?: WebSocket }> */
const rooms = new Map();

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const room = (url.searchParams.get('room') || 'estudio').slice(0, 64);
  const role = url.searchParams.get('role');
  const key = url.searchParams.get('key');

  if (key !== STREAM_KEY || !['camera', 'obs'].includes(role)) {
    send(ws, { type: 'error', message: 'Chave inválida' });
    ws.close(4001, 'unauthorized');
    return;
  }

  if (!rooms.has(room)) rooms.set(room, {});
  const r = rooms.get(room);

  // Uma conexão por papel: a nova substitui a antiga (ex.: celular recarregou a página)
  if (r[role] && r[role] !== ws) {
    try { r[role].close(4000, 'replaced'); } catch (_) {}
  }
  r[role] = ws;
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  const other = role === 'camera' ? 'obs' : 'camera';
  console.log(`[${room}] ${role} conectou`);
  send(ws, { type: 'joined', role, peerOnline: !!r[other] });

  // Quando os dois lados estão presentes, a câmera inicia a negociação
  if (r.camera && r.obs) send(r.camera, { type: 'peer-ready' });

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!['offer', 'answer', 'candidate', 'request-restart'].includes(msg.type)) return;
    send(r[other], msg);
  });

  ws.on('close', () => {
    if (r[role] !== ws) return;
    delete r[role];
    console.log(`[${room}] ${role} saiu`);
    send(r[other], { type: 'peer-left' });
    if (!r.camera && !r.obs) rooms.delete(room);
  });
});

// Mantém conexões vivas atrás de proxies e derruba conexões mortas
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch (_) {}
  });
}, 15000);

server.listen(PORT, () => {
  console.log(`Rádio São Luiz Live rodando na porta ${PORT}`);
  console.log(`Câmera: /camera.html   |   OBS: /obs.html?key=SUA_CHAVE`);
});
