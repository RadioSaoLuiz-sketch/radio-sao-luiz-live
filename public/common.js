/* Rádio São Luiz — utilitários compartilhados (sinalização e ajustes de SDP) */

/** Conexão de sinalização com reconexão automática (backoff exponencial). */
class Signaling {
  constructor({ room, key, role, onMessage, onStatus }) {
    Object.assign(this, { room, key, role, onMessage, onStatus });
    this.retry = 0;
    this.closedByUser = false;
    this.connect();
  }
  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const q = new URLSearchParams({ room: this.room, key: this.key, role: this.role });
    this.ws = new WebSocket(`${proto}://${location.host}/ws?${q}`);
    this.ws.onopen = () => { this.retry = 0; this.onStatus?.('online'); };
    this.ws.onmessage = (e) => { try { this.onMessage(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    this.ws.onclose = (e) => {
      if (e.code === 4001) { this.onStatus?.('unauthorized'); return; }
      if (this.closedByUser) return;
      if (e.code === 4000) { this.onStatus?.('replaced'); return; }
      this.onStatus?.('offline');
      const wait = Math.min(10000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), wait);
    };
  }
  send(msg) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  close() { this.closedByUser = true; this.ws?.close(); }
}

async function getIceConfig() {
  try {
    const r = await fetch('/config', { cache: 'no-store' });
    return await r.json();
  } catch {
    return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  }
}

/**
 * Ajusta o SDP da resposta antes de aplicá-lo no emissor:
 *  - Opus: FEC (recupera perdas de pacote), sem DTX (voz de rádio contínua), bitrate alvo.
 *  - Vídeo: começa já no bitrate alvo (sem os primeiros segundos borrados).
 */
function tuneSdp(sdp, { audioKbps, videoKbps }) {
  const lines = sdp.split('\r\n');
  let section = '';
  const opusPt = new Set();
  const videoPts = new Set();
  for (const l of lines) {
    if (l.startsWith('m=')) section = l.split(' ')[0].slice(2);
    const m = l.match(/^a=rtpmap:(\d+) ([\w-]+)\//);
    if (!m) continue;
    if (section === 'audio' && m[2].toLowerCase() === 'opus') opusPt.add(m[1]);
    if (section === 'video' && /^(VP8|VP9|H264|AV1|H265)$/i.test(m[2])) videoPts.add(m[1]);
  }
  return lines.map((l) => {
    const f = l.match(/^a=fmtp:(\d+) (.*)$/);
    if (!f) return l;
    const [, pt, params] = f;
    const p = new Map(params.split(';').map((kv) => kv.split('=').map((s) => s.trim())));
    if (opusPt.has(pt)) {
      p.set('useinbandfec', '1');
      p.set('usedtx', '0');
      p.set('maxaveragebitrate', String(audioKbps * 1000));
      p.set('maxplaybackrate', '48000');
    } else if (videoPts.has(pt)) {
      p.set('x-google-start-bitrate', String(Math.round(videoKbps * 0.7)));
      p.set('x-google-max-bitrate', String(videoKbps));
    } else {
      return l;
    }
    return `a=fmtp:${pt} ${[...p].map(([k, v]) => (v === undefined ? k : `${k}=${v}`)).join(';')}`;
  }).join('\r\n');
}

function fmtKbps(bps) { return bps >= 1e6 ? (bps / 1e6).toFixed(2) + ' Mbps' : Math.round(bps / 1e3) + ' kbps'; }
