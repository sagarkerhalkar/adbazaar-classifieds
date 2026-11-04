// Consent layer: 18+ age gate, cookie consent, notification permission.
// Shown only on public (buyer) pages. Each one is shown once and remembered in localStorage.
(function () {
  'use strict';
  if (document.body.classList.contains('portal-admin')) return; // not on admin

  var KEY_AGE = 'adbazaar_age18';
  var KEY_COOKIE = 'adbazaar_cookies';
  var KEY_NOTIF = 'adbazaar_notif_asked';

  // ---- Helpers ----
  function overlay(id, inner) {
    var d = document.createElement('div');
    d.id = id;
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:16px;';
    d.innerHTML = inner;
    document.body.appendChild(d);
    return d;
  }

  // ---- 1. 18+ Age Gate ----
  if (!localStorage.getItem(KEY_AGE)) {
    var siteName = document.querySelector('.logo-text') ? document.querySelector('.logo-text').textContent : 'This website';
    var gate = overlay('age-gate',
      '<div style="background:#fff;border-radius:12px;max-width:420px;width:100%;padding:32px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.25);">' +
        '<div style="font-size:48px;margin-bottom:12px;">🔞</div>' +
        '<h2 style="margin:0 0 8px;font-size:22px;color:#111;">Age Verification Required</h2>' +
        '<p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.5;">' + siteName + ' may contain ads for products and services intended for adults. You must be <strong>18 years or older</strong> to continue.</p>' +
        '<button id="age-yes" style="display:inline-block;padding:12px 32px;font-size:16px;font-weight:600;color:#fff;background:var(--main,#e74c3c);border:none;border-radius:8px;cursor:pointer;margin:0 8px 8px;">I am 18 or older</button>' +
        '<button id="age-no" style="display:inline-block;padding:12px 32px;font-size:16px;font-weight:600;color:#555;background:#eee;border:none;border-radius:8px;cursor:pointer;margin:0 8px 8px;">I am under 18</button>' +
        '<p style="margin:12px 0 0;color:#999;font-size:12px;">By clicking "I am 18 or older", you confirm that you are of legal age to access this website.</p>' +
      '</div>'
    );
    gate.querySelector('#age-yes').addEventListener('click', function () {
      localStorage.setItem(KEY_AGE, '1');
      gate.remove();
      showCookieBanner();
    });
    gate.querySelector('#age-no').addEventListener('click', function () {
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:20px;"><div><h1 style="font-size:24px;color:#333;">Access Denied</h1><p style="color:#666;font-size:16px;">You must be 18 or older to visit this website.</p><a href="https://www.google.com" style="color:#2196f3;font-size:15px;">Leave this site</a></div></div>';
    });
    // Block scrolling until verified
    document.body.style.overflow = 'hidden';
    var obs = new MutationObserver(function () { if (!document.getElementById('age-gate')) { document.body.style.overflow = ''; obs.disconnect(); } });
    obs.observe(document.body, { childList: true });
  } else {
    showCookieBanner();
  }

  // ---- 2. Cookie Consent Banner ----
  function showCookieBanner() {
    if (localStorage.getItem(KEY_COOKIE)) { askNotification(); return; }
    var bar = document.createElement('div');
    bar.id = 'cookie-bar';
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99998;background:#1a1a2e;color:#fff;padding:16px 20px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;box-shadow:0 -2px 12px rgba(0,0,0,.2);font-size:14px;line-height:1.5;';
    bar.innerHTML =
      '<span style="flex:1;min-width:240px;">🍪 We use cookies to improve your experience. By continuing to browse, you agree to our <a href="/privacy" style="color:#64b5f6;text-decoration:underline;">Privacy Policy</a> and use of cookies.</span>' +
      '<button id="cookie-ok" style="padding:10px 24px;font-size:14px;font-weight:600;color:#fff;background:var(--main,#2196f3);border:none;border-radius:6px;cursor:pointer;white-space:nowrap;">Accept All</button>' +
      '<button id="cookie-ess" style="padding:10px 24px;font-size:14px;font-weight:600;color:#ccc;background:#333;border:none;border-radius:6px;cursor:pointer;white-space:nowrap;">Essential Only</button>';
    document.body.appendChild(bar);
    bar.querySelector('#cookie-ok').addEventListener('click', function () {
      localStorage.setItem(KEY_COOKIE, 'all');
      bar.remove(); askNotification();
    });
    bar.querySelector('#cookie-ess').addEventListener('click', function () {
      localStorage.setItem(KEY_COOKIE, 'essential');
      bar.remove(); askNotification();
    });
  }

  // ---- 3. Notification Permission ----
  function askNotification() {
    if (localStorage.getItem(KEY_NOTIF)) return;
    if (!('Notification' in window) || Notification.permission !== 'default') {
      localStorage.setItem(KEY_NOTIF, '1');
      return;
    }
    // Wait 3 seconds so the page loads first
    setTimeout(function () {
      var box = document.createElement('div');
      box.id = 'notif-ask';
      box.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99997;background:#fff;border-radius:12px;padding:20px 24px;box-shadow:0 4px 24px rgba(0,0,0,.18);max-width:340px;width:calc(100% - 40px);animation:slideIn .3s ease;';
      box.innerHTML =
        '<div style="display:flex;align-items:flex-start;gap:12px;">' +
          '<span style="font-size:28px;">🔔</span>' +
          '<div>' +
            '<h3 style="margin:0 0 6px;font-size:16px;color:#111;">Stay Updated!</h3>' +
            '<p style="margin:0 0 14px;color:#666;font-size:13px;line-height:1.4;">Get notified about new ads, price drops and messages.</p>' +
            '<div style="display:flex;gap:8px;">' +
              '<button id="notif-yes" style="padding:8px 18px;font-size:13px;font-weight:600;color:#fff;background:var(--main,#2196f3);border:none;border-radius:6px;cursor:pointer;">Allow</button>' +
              '<button id="notif-no" style="padding:8px 18px;font-size:13px;font-weight:600;color:#666;background:#f0f0f0;border:none;border-radius:6px;cursor:pointer;">Not now</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(box);
      box.querySelector('#notif-yes').addEventListener('click', function () {
        localStorage.setItem(KEY_NOTIF, '1');
        Notification.requestPermission();
        box.remove();
      });
      box.querySelector('#notif-no').addEventListener('click', function () {
        localStorage.setItem(KEY_NOTIF, '1');
        box.remove();
      });
      // Auto-dismiss after 15 seconds
      setTimeout(function () { if (document.getElementById('notif-ask')) { localStorage.setItem(KEY_NOTIF, '1'); box.remove(); } }, 15000);
    }, 3000);
  }
})();
