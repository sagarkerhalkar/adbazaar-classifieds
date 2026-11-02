// 1:1 KYC video call over WebRTC. The admin is the caller; the client answers.
(function () {
  'use strict';
  const root = document.querySelector('[data-call]');
  if (!root) return;

  const role = root.dataset.role;
  const eventsUrl = root.dataset.eventsUrl;
  const signalUrl = root.dataset.signalUrl;
  const snapshotUrl = root.dataset.snapshotUrl;
  const iceServers = JSON.parse(root.dataset.ice || '[]');
  const csrf = document.querySelector('meta[name=csrf-token]').content;

  const remoteVideo = root.querySelector('[data-remote-video]');
  const localVideo = root.querySelector('[data-local-video]');
  const wait = root.querySelector('[data-call-wait]');
  const countEl = root.querySelector('[data-call-count]');
  const stateEl = document.querySelector('[data-call-state]');
  const snaps = document.querySelector('[data-call-snapshots]');
  const btn = (n) => document.querySelector(`[data-call-${n}]`);

  let pc = null;
  let localStream = null;
  let es = null;
  let pendingIce = [];
  let ended = false;

  const setState = (t, tone) => { stateEl.textContent = t; stateEl.className = 'pill pill-' + (tone || 'muted'); };

  async function signal(payload) {
    try {
      await fetch(signalUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(payload) });
    } catch (e) { console.warn('signal failed', e); }
  }

  function newPeer() {
    if (pc) { pc.ontrack = null; pc.close(); }
    pendingIce = [];
    pc = new RTCPeerConnection({ iceServers });
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    pc.ontrack = (e) => {
      if (remoteVideo.srcObject !== e.streams[0]) remoteVideo.srcObject = e.streams[0];
      wait.hidden = true;
    };
    pc.onicecandidate = (e) => { if (e.candidate) signal({ type: 'ice', candidate: e.candidate }); };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') setState('Connected', 'ok');
      else if (s === 'connecting') setState('Connecting…', 'info');
      else if (s === 'failed') { setState('Connection failed — retrying', 'bad'); if (role === 'admin') setTimeout(call, 1500); }
      else if (s === 'disconnected') setState('Reconnecting…', 'warn');
    };
    return pc;
  }

  async function flushIce() {
    for (const c of pendingIce) { try { await pc.addIceCandidate(c); } catch (e) { /* ignore */ } }
    pendingIce = [];
  }

  async function call() {
    if (ended) return;
    newPeer();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signal({ type: 'offer', sdp: pc.localDescription });
    setState('Calling…', 'info');
  }

  async function onSignal(m) {
    if (ended) return;
    if (m.type === 'offer') {
      newPeer();
      await pc.setRemoteDescription(m.sdp);
      await flushIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signal({ type: 'answer', sdp: pc.localDescription });
    } else if (m.type === 'answer' && pc) {
      await pc.setRemoteDescription(m.sdp);
      await flushIce();
    } else if (m.type === 'ice') {
      if (pc && pc.remoteDescription) { try { await pc.addIceCandidate(m.candidate); } catch (e) { /* ignore */ } } else pendingIce.push(m.candidate);
    } else if (m.type === 'hangup') {
      finish(role === 'client' ? 'The officer ended the call. You can close this page — check your status link for the result.' : 'The client left the call.');
    } else if (m.type === 'snapshot-taken' && role === 'client') {
      toast('📸 The officer captured your live photo.');
    }
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function finish(message) {
    ended = true;
    if (es) es.close();
    if (pc) pc.close();
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    remoteVideo.srcObject = null;
    wait.hidden = false; wait.textContent = message;
    setState('Call ended', 'muted');
  }

  async function snapshot() {
    if (!remoteVideo.videoWidth) { toast('No video from the client yet.'); return; }
    const canvas = document.createElement('canvas');
    canvas.width = remoteVideo.videoWidth; canvas.height = remoteVideo.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(remoteVideo, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, canvas.height - 28, canvas.width, 28);
    ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.fillText('KYC video call · ' + new Date().toLocaleString('en-IN'), 10, canvas.height - 9);
    const image = canvas.toDataURL('image/jpeg', 0.88);
    const r = await fetch(snapshotUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ image }) });
    const j = await r.json().catch(() => ({}));
    if (j.ok) {
      const a = document.createElement('a'); a.href = j.url; a.target = '_blank'; a.className = 'doc';
      const img = document.createElement('img'); img.src = j.url; a.appendChild(img);
      const s = document.createElement('span'); s.textContent = 'Saved ' + new Date().toLocaleTimeString('en-IN'); a.appendChild(s);
      snaps.prepend(a);
      toast('Live photo saved to client profile.');
    } else toast(j.error || 'Could not save photo.');
  }

  function autoSnap() {
    let n = 3; countEl.hidden = false; countEl.textContent = n;
    const t = setInterval(() => {
      n -= 1;
      if (n <= 0) { clearInterval(t); countEl.hidden = true; snapshot(); } else countEl.textContent = n;
    }, 1000);
  }

  async function start() {
    if (!window.isSecureContext) {
      setState('Needs https', 'bad');
      wait.textContent = 'Video calls only work on a secure address. Open this page on https:// (your domain) or http://localhost.';
      return;
    }
    if (!window.RTCPeerConnection || !navigator.mediaDevices) { setState('Browser not supported', 'bad'); wait.textContent = 'Please open this page in a recent Chrome, Edge, Firefox or Safari (HTTPS required).'; return; }
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
    } catch (e) {
      setState('Camera blocked', 'bad');
      wait.textContent = 'Please allow camera and microphone access, then reload this page.';
      return;
    }
    localVideo.srcObject = localStream;
    setState('Waiting for the other side…', 'warn');

    es = new EventSource(eventsUrl);
    const peerHere = () => { if (role === 'admin') call(); else setState('Officer is here — connecting…', 'info'); };
    es.addEventListener('peer-joined', peerHere);
    es.addEventListener('peer-present', peerHere);
    es.addEventListener('peer-left', () => {
      if (ended) return;
      setState('Other side disconnected', 'warn');
      wait.hidden = false; wait.textContent = role === 'admin' ? 'Client disconnected — waiting for them to rejoin…' : 'Officer disconnected — waiting…';
      remoteVideo.srcObject = null;
    });
    es.addEventListener('signal', (e) => { try { onSignal(JSON.parse(e.data)); } catch (err) { console.error(err); } });
    es.onerror = () => { if (!ended) setState('Reconnecting…', 'warn'); };
  }

  btn('mute').addEventListener('click', (e) => {
    const t = localStream && localStream.getAudioTracks()[0]; if (!t) return;
    t.enabled = !t.enabled; e.target.textContent = t.enabled ? '🎙️ Mute' : '🔇 Unmute';
  });
  btn('cam').addEventListener('click', (e) => {
    const t = localStream && localStream.getVideoTracks()[0]; if (!t) return;
    t.enabled = !t.enabled; e.target.textContent = t.enabled ? '📷 Camera off' : '📷 Camera on';
  });
  btn('hangup').addEventListener('click', () => { signal({ type: 'hangup' }); finish('You ended the call.'); });
  if (btn('snap')) btn('snap').addEventListener('click', snapshot);
  if (btn('autosnap')) btn('autosnap').addEventListener('click', autoSnap);
  window.addEventListener('beforeunload', () => { if (!ended) navigator.sendBeacon && signal({ type: 'hangup' }); });

  start();
})();
