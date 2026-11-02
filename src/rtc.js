'use strict';
// WebRTC signaling over Server-Sent Events for the 1:1 KYC video call (admin ⇄ client).
// Media flows peer-to-peer; the server only relays offer/answer/ICE messages.

const rooms = new Map(); // roomId -> { admin: Set<res>, client: Set<res> }

function room(id) {
  if (!rooms.has(id)) rooms.set(id, { admin: new Set(), client: new Set() });
  return rooms.get(id);
}

const other = (role) => (role === 'admin' ? 'client' : 'admin');

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data || {})}\n\n`);
}

function broadcast(roomId, role, event, data) {
  const r = rooms.get(roomId);
  if (!r) return 0;
  for (const res of r[role]) send(res, event, data);
  return r[role].size;
}

function openStream(req, res, roomId, role) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const r = room(roomId);
  r[role].add(res);
  // Tell both sides who is present so the admin (caller) can start the offer.
  if (r[other(role)].size > 0) send(res, 'peer-present', { role: other(role) });
  broadcast(roomId, other(role), 'peer-joined', { role });

  const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
  req.on('close', () => {
    clearInterval(ping);
    r[role].delete(res);
    broadcast(roomId, other(role), 'peer-left', { role });
    if (!r.admin.size && !r.client.size) rooms.delete(roomId);
  });
}

function relay(roomId, fromRole, payload) {
  const allowed = ['offer', 'answer', 'ice', 'hangup', 'snapshot-taken'];
  if (!payload || !allowed.includes(payload.type)) return false;
  broadcast(roomId, other(fromRole), 'signal', payload);
  return true;
}

function iceServers() {
  const list = [{ urls: (process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:global.stun.twilio.com:3478').split(',') }];
  if (process.env.TURN_URL) {
    list.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USERNAME || '', credential: process.env.TURN_PASSWORD || '' });
  }
  return list;
}

module.exports = { openStream, relay, iceServers, broadcast };
