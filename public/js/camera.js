// Live photo capture from the webcam with an automatic countdown click.
(function () {
  'use strict';

  document.querySelectorAll('[data-camera]').forEach((root) => {
    const video = root.querySelector('[data-camera-video]');
    const preview = root.querySelector('[data-camera-preview]');
    const count = root.querySelector('[data-camera-count]');
    const btnStart = root.querySelector('[data-camera-start]');
    const btnSnap = root.querySelector('[data-camera-snap]');
    const btnRetake = root.querySelector('[data-camera-retake]');
    const status = root.querySelector('[data-camera-status]');
    const output = root.querySelector('[data-camera-output]');
    const autoSeconds = Number(root.dataset.auto || 0);
    let stream = null;
    let timer = null;

    const show = (el, on) => { el.hidden = !on; };
    const say = (msg, bad) => { status.textContent = msg; status.classList.toggle('bad', !!bad); };

    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      show(count, false);
      if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    }

    async function start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        say('Your browser cannot open the camera. Please use Chrome or Safari on HTTPS.', true);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch (e) {
        say('Camera permission was denied or no camera found. Allow camera access and try again.', true);
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});
      root.classList.add('live');
      show(video, true); show(preview, false);
      show(btnStart, false); show(btnSnap, true); show(btnRetake, false);
      if (autoSeconds > 0) countdown(autoSeconds); else say('Look at the camera and press Capture.');
    }

    function countdown(n) {
      let left = n;
      show(count, true); count.textContent = left;
      say('Hold still — photo will be taken automatically.');
      timer = setInterval(() => {
        left -= 1;
        if (left <= 0) { clearInterval(timer); timer = null; capture(); } else count.textContent = left;
      }, 1000);
    }

    function capture() {
      if (!stream || !video.videoWidth) { say('Camera is not ready yet.', true); return; }
      const maxW = 1024;
      const scale = Math.min(1, maxW / video.videoWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      // Reject an almost completely dark frame (camera covered / not started).
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0; for (let i = 0; i < px.length; i += 400) sum += px[i] + px[i + 1] + px[i + 2];
      if (sum / (px.length / 400) / 3 < 18) { say('The photo is too dark. Improve the lighting and retake.', true); stop(); show(btnRetake, true); show(btnSnap, false); return; }
      const ts = new Date().toLocaleString('en-IN');
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, canvas.height - 28, canvas.width, 28);
      ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.fillText('Live capture · ' + ts, 10, canvas.height - 9);
      output.value = canvas.toDataURL('image/jpeg', 0.85);
      preview.src = output.value;
      stop();
      root.classList.remove('live'); root.classList.add('done');
      show(video, false); show(preview, true);
      show(btnSnap, false); show(btnRetake, true);
      say('✔ Live photo captured.');
    }

    btnStart.addEventListener('click', start);
    btnSnap.addEventListener('click', () => { if (timer) { clearInterval(timer); timer = null; show(count, false); } capture(); });
    btnRetake.addEventListener('click', () => { output.value = ''; root.classList.remove('done'); start(); });

    const form = root.closest('form');
    if (form && form.hasAttribute('data-kyc-form')) {
      form.addEventListener('submit', (e) => {
        if (!output.value) {
          e.preventDefault();
          say('Please capture your live photo before submitting.', true);
          root.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }
  });
})();
