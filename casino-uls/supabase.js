// ================================================================
//  supabase.js
//  Cliente Supabase: insert, realtime subscribe, cola offline
//  Las credenciales se inyectan desde index.html (window.SB_*)
// ================================================================

const URL  = () => window.SB_URL;
const KEY  = () => window.SB_KEY;
const TABLE = 'eventos';
const QUEUE_KEY = 'casino_queue_v1';

// ── Helpers HTTP ─────────────────────────────────────────────────────────────

async function req(method, path, body) {
  const r = await fetch(`${URL()}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': KEY(),
      'Authorization': `Bearer ${KEY()}`,
      'Prefer': 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`SB ${r.status}: ${await r.text()}`);
  return r.json();
}

// ── Timestamp del servidor via Supabase RPC ───────────────────────────────────
// Para evitar desync entre teléfonos usamos el tiempo del servidor.
// Si falla (offline) usamos Date.now() local como fallback.
export async function serverNow() {
  try {
    const r = await fetch(`${URL()}/rest/v1/rpc/now_ms`, {
      method: 'POST',
      headers: { 'apikey': KEY(), 'Authorization': `Bearer ${KEY()}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (r.ok) {
      const d = await r.json();
      return typeof d === 'number' ? d : Date.now();
    }
  } catch {}
  return Date.now();   // fallback offline
}

// ── Cola offline ──────────────────────────────────────────────────────────────

function qLoad() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function qSave(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
}
export function qCount() { return qLoad().length; }

async function qFlush() {
  const q = qLoad();
  if (!q.length) return 0;
  const failed = [];
  for (const row of q) {
    try { await req('POST', TABLE, [row]); }
    catch { failed.push(row); }
  }
  qSave(failed);
  return q.length - failed.length;
}

// ── Insert con fallback offline ───────────────────────────────────────────────

export async function insertEvento(row) {
  // Intenta vaciar cola primero, luego insertar
  try {
    await qFlush();
    const [inserted] = await req('POST', TABLE, [row]);
    return { ok: true, offline: false, row: inserted };
  } catch {
    qLoad(); // vacía posible corrupción
    const q = qLoad();
    q.push(row);
    qSave(q);
    return { ok: true, offline: true, row };
  }
}

// ── Cargar sesión completa ────────────────────────────────────────────────────

export async function fetchSession(session_id) {
  return req('GET', `${TABLE}?session_id=eq.${encodeURIComponent(session_id)}&order=t_server.asc&select=*`);
}

// ── Realtime subscription ─────────────────────────────────────────────────────
// Usa el websocket nativo de Supabase (sin SDK, implementación mínima)

export function subscribeSession(session_id, onInsert) {
  const wsUrl = URL().replace('https://', 'wss://').replace('http://', 'ws://');
  const ws = new WebSocket(`${wsUrl}/realtime/v1/websocket?apikey=${KEY()}&vsn=1.0.0`);
  let heartbeat;

  ws.onopen = () => {
    // Unirse al canal de la tabla
    ws.send(JSON.stringify({
      topic: `realtime:public:${TABLE}:session_id=eq.${session_id}`,
      event: 'phx_join',
      payload: { config: { broadcast: { self: false }, presence: { key: '' } } },
      ref: '1',
    }));
    // Heartbeat cada 25s para mantener conexión viva
    heartbeat = setInterval(() => {
      ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null }));
    }, 25000);
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.event === 'INSERT' && msg.payload?.record) {
        onInsert(msg.payload.record);
      }
    } catch {}
  };

  ws.onclose = () => clearInterval(heartbeat);
  ws.onerror = () => {}; // silencioso, la app funciona sin realtime

  return () => { clearInterval(heartbeat); ws.close(); };  // retorna función para desuscribir
}

// ── Sync manual (para botón en UI) ───────────────────────────────────────────
export async function syncNow() {
  const flushed = await qFlush();
  return { flushed, remaining: qCount() };
}
