// supabase.js — Casino ULS
// Credenciales inyectadas desde index.html (window.SB_*)

const SB_URL  = () => window.SB_URL;
const SB_KEY  = () => window.SB_KEY;
const EVENTOS = 'eventos';
const SESSIONS = 'sessions';
const QUEUE_KEY = 'casino_queue_v1';

// ── HTTP helper ───────────────────────────────────────────────────
async function req(method, path, body) {
  const r = await fetch(`${SB_URL()}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SB_KEY(),
      'Authorization': `Bearer ${SB_KEY()}`,
      'Prefer': 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`SB ${r.status}: ${await r.text()}`);
  return r.json();
}

// ── Server timestamp ──────────────────────────────────────────────
export async function serverNow() {
  try {
    const r = await fetch(`${SB_URL()}/rest/v1/rpc/now_ms`, {
      method: 'POST',
      headers: { 'apikey': SB_KEY(), 'Authorization': `Bearer ${SB_KEY()}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (r.ok) {
      const d = await r.json();
      return typeof d === 'number' ? d : Date.now();
    }
  } catch {}
  return Date.now();
}

// ── Sessions ──────────────────────────────────────────────────────
export async function createSession(session) {
  const rows = await req('POST', SESSIONS, [session]);
  return rows[0];
}

export async function updateSession(id, patch) {
  await fetch(`${SB_URL()}/rest/v1/${SESSIONS}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SB_KEY(),
      'Authorization': `Bearer ${SB_KEY()}`,
    },
    body: JSON.stringify(patch),
  });
}

export async function fetchSessions() {
  return req('GET', `${SESSIONS}?order=created_at.desc&limit=20&select=*`);
}

// ── Offline queue ─────────────────────────────────────────────────
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
    try { await req('POST', EVENTOS, [row]); }
    catch { failed.push(row); }
  }
  qSave(failed);
  return q.length - failed.length;
}

// ── Eventos ───────────────────────────────────────────────────────
export async function insertEvento(row) {
  try {
    const flushed = await qFlush();
    const [inserted] = await req('POST', EVENTOS, [row]);
    return { ok: true, offline: false, row: inserted, flushed };
  } catch {
    const q = qLoad();
    q.push(row);
    qSave(q);
    return { ok: true, offline: true, row, flushed: 0 };
  }
}

export async function fetchSession(session_id) {
  return req('GET', `${EVENTOS}?session_id=eq.${encodeURIComponent(session_id)}&order=t_server.asc&select=*`);
}

export async function fetchOneSession(id) {
  const rows = await req('GET', `${SESSIONS}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  return rows[0] ?? null;
}

export async function deleteEvento(id) {
  await fetch(`${SB_URL()}/rest/v1/${EVENTOS}?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      'apikey': SB_KEY(),
      'Authorization': `Bearer ${SB_KEY()}`,
    },
  });
}

export function removeFromQueue(t_server, tipo) {
  const q = qLoad();
  for (let i = q.length - 1; i >= 0; i--) {
    if (q[i].t_server === t_server && q[i].tipo === tipo) {
      q.splice(i, 1);
      qSave(q);
      return true;
    }
  }
  return false;
}

export async function syncNow() {
  const flushed = await qFlush();
  return { flushed, remaining: qCount() };
}

// ── Realtime subscribe — Supabase Realtime v2 protocol ───────────
// filter: e.g. "session_id=eq.abc" or null for whole table
// onEvent(eventType, record) — eventType: 'INSERT' | 'UPDATE' | 'DELETE'
export function subscribeTable(table, filter, onEvent) {
  const wsUrl = SB_URL().replace('https://', 'wss://').replace('http://', 'ws://');
  // v2: arbitrary topic name (filter goes in postgres_changes config, not topic)
  const topic = `realtime:${table}-${Date.now()}`;
  const ws = new WebSocket(`${wsUrl}/realtime/v1/websocket?apikey=${SB_KEY()}&vsn=1.0.0`);
  let heartbeat;

  const pgChange = { event: '*', schema: 'public', table };
  if (filter) pgChange.filter = filter;

  ws.onopen = () => {
    ws.send(JSON.stringify({
      topic,
      event: 'phx_join',
      payload: { config: { postgres_changes: [pgChange] } },
      ref: '1',
    }));
    heartbeat = setInterval(() => {
      ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null }));
    }, 25000);
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      // Realtime v2: event='postgres_changes', type+record inside payload.data
      if (msg.event === 'postgres_changes' && msg.payload?.data) {
        const { type, record } = msg.payload.data;
        if (type && record) onEvent(type, record);
      }
    } catch {}
  };

  ws.onclose = () => clearInterval(heartbeat);
  ws.onerror = () => {};
  return () => { clearInterval(heartbeat); ws.close(); };
}
