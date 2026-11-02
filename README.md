# AdBazaar — verified-seller classifieds

A classifieds web app (in the style of Skokka / OLX) where **verified sellers pay to run ads for a fixed period** (7 / 15 / 29 days). When the period ends the ad disappears automatically. Paying more and for longer ranks an ad higher, and sellers can pay extra to pin an ad to the **TOP ads** section.

**No npm packages are needed.** It runs on plain Node.js 22.13+ and uses Node's built-in SQLite.

---

## The three parts

| Portal | Who | What they can do |
|---|---|---|
| **Public site** `/` | Anyone, no login | Browse and search live ads by category, city or type, open an ad, call or WhatsApp the seller, report an ad |
| **Seller portal** `/client` | Your clients (advertisers) | Register with KYC, then **log in only after you approve them**. Post or edit ads, choose a plan, and pay. Ads go live as soon as payment is confirmed, without needing your approval of the ad itself |
| **Admin portal** `/admin` | You | Verify clients, run KYC video calls, confirm payments, block/boost ads, set prices, see revenue |

### Seller flow
1. **Register** at `/client/register`: name, phone, email, address, Aadhaar number (checked with the Verhoeff checksum, and only the last 4 digits are stored), PAN, and uploads of the Aadhaar (front/back), PAN, address proof and a photo. The camera then **takes a live photo automatically** after a 3-second countdown.
2. The seller gets a private **status link**. Logging in is blocked until you approve them.
3. You review the application. Optionally you click **Request video call**, send the client the call link (there's a WhatsApp button for this), and do a **live in-browser video call**. During the call you can **capture live photos** of the client with one click or an automatic 3-second timer. The photos are saved to their profile.
4. **Approve.** The seller can now log in and post ads.
5. The seller creates an ad, then picks **7 / 15 / 29 days** and can add **★ TOP**. Two ways to pay:
   - **Razorpay** (UPI, card, netbanking): the payment is verified automatically and the ad is **live instantly**.
   - **Manual UPI**: the seller pays to your UPI ID or QR and enters the UTR. You click **Confirm & go live** in Admin → Payments.
6. When the paid period ends, the ad is removed from the site automatically. The seller can **Renew** it, or **Extend** a live ad, which adds days on top of the current period.

You can also **add clients yourself** (Admin → Clients → Add client). Upload their documents, take a webcam photo, and approve immediately. A temporary password is generated for you to share.

---

## Ranking algorithm (`src/ranking.js`)

```
score = TOP bonus (1000)                  ← paid "Show on top" add-on
      + plan ranking level × 60           ← 29-day (3) > 15-day (2) > 7-day (1)
      + log10(₹ paid) × 40                ← paid more → higher
      + freshness (100, halves every 72h) ← ads slowly drift down over time
      + log10(views) × 6                  ← small popularity effect
      + admin boost × 10                  ← your manual nudge (-10…+10)
      − 30 in the last 24h of the period
```
Expired ads are removed from the listing. Scores are recalculated every 5 minutes, whenever a payment is confirmed, and when you click **Re-run ranking** in Admin → Ads. All weights are at the top of `src/ranking.js`. Each plan's price, TOP price and ranking level can be edited in **Admin → Settings**.

---

## Run locally

**Windows (easiest):** open the `windows` folder and double-click, in order:
1. `1-setup.bat`: checks Node.js, creates your `.env` settings file and opens it in Notepad.
2. `2-start.bat`: starts the app in a window (close the window to stop it).
3. Optional: `autostart-ON.bat` starts AdBazaar hidden in the background every time you log in to Windows. `autostart-OFF.bat` turns that off.

Other helpers: `3-start-in-background.bat`, `stop.bat`, `open-site.bat`. Logs go to `storage\server.log`.

**Any OS (terminal):**
```bash
git clone https://github.com/sagarkerhalkar/adbazaar-classifieds.git
cd adbazaar-classifieds
cp .env.example .env          # set ADMIN_EMAIL / ADMIN_PASSWORD / PORT
npm start                     # → http://localhost:4780
npm run seed:test             # test clients, ads & payments (password Test@1234)
npm run seed:remove           # remove only the test data
npm test                      # unit tests
```
**Auto-start on Linux/Mac:** `npm i -g pm2 && pm2 start ecosystem.config.js && pm2 save && pm2 startup`. Then run the command that `pm2 startup` prints.

- **Ports:** set `PORT` in `.env` (default 4780). If that port is busy, the app stops with a clear message so you can pick another one. Without a `PORT` setting, it tries 3000, 3001 and so on. It never starts twice.
- **Admin login:** `http://localhost:4780/admin/login`, using the email and password from `.env`.
- Camera and video calls work on `localhost` and on **HTTPS** sites. To test on your own domain from this computer, use a Cloudflare Tunnel. See the setup guide.

## Deploy (VPS, e.g. Ubuntu)

```bash
# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs nginx
git clone https://github.com/sagarkerhalkar/adbazaar-classifieds.git /opt/adbazaar && cd /opt/adbazaar
cp .env.example .env && nano .env            # COOKIE_SECURE=1, TRUST_PROXY=1, BASE_URL=https://…
sudo npm i -g pm2 && pm2 start server.js --name adbazaar && pm2 save && pm2 startup
```
Nginx reverse proxy (then run `sudo certbot --nginx` for free HTTPS):
```nginx
server {
  server_name ads.yourdomain.com;
  client_max_body_size 30m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;              # needed for the video-call signaling stream
    proxy_read_timeout 1h;
  }
}
```
**Docker:** `docker build -t adbazaar . && docker run -d -p 3000:3000 -v adbazaar-data:/data --env-file .env adbazaar`

**Back up the `storage/` folder** (or `/data` in Docker). It contains the database and all uploaded documents.

## Configuration
See `.env.example`. Key items:
- `UPI_ID`, `UPI_PAYEE_NAME`: these can also be set in Admin → Settings, along with your UPI **QR image**.
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`: turn on instant online payments. Add the webhook `https://yourdomain/webhooks/razorpay` for the `payment.captured` and `order.paid` events.
- `TURN_URL`, `TURN_USERNAME`, `TURN_PASSWORD`: the video call is peer-to-peer. The default public STUN servers work for most users. Add a TURN server (coturn, Metered, Twilio) for users on strict mobile networks.

## Security built in
- Passwords are hashed with scrypt. Sessions are HttpOnly and SameSite. Every form has CSRF protection, and logins are rate-limited.
- **KYC documents are private.** They're stored outside the public folder and served only to logged-in admins. Uploads are checked by their real file type (magic bytes), not by file extension.
- Prices are always calculated on the server, and Razorpay payments are verified by HMAC signature.
- Content-Security-Policy and other security headers are set. All HTML output is escaped.

## Important — legal / compliance (India)
- **Aadhaar:** UIDAI rules restrict storing full Aadhaar numbers, so this app keeps only the last 4 digits. Ask sellers to upload a **masked Aadhaar** (downloadable from the UIDAI site). For fully compliant e-KYC, use a licensed provider such as DigiLocker, or a KYC API like Signzy, IDfy or Karza.
- **DPDP Act 2023:** you are the data fiduciary for this personal data. Publish a privacy policy, collect only what you need, and delete data on request.
- Keep the **prohibited-content rules** in `/terms`. Classifieds sites are held responsible for illegal ads (adult/escort services, weapons, drugs, counterfeit goods, and so on). Use the Reports and Block tools.
- GST: invoices for ad fees are not generated yet. Add an invoice step if you are GST-registered.

## Project structure
```
server.js              entry point & middleware
src/db.js              SQLite schema + seed (plans, categories, settings)
src/ranking.js         ranking algorithm + expiry scheduler
src/payments.js        pricing, Razorpay, payment confirmation → ad goes live
src/rtc.js             WebRTC signaling (Server-Sent Events) for KYC video calls
src/routes/public.js   public site
src/routes/client.js   seller portal (registration, KYC status, ads, payments)
src/routes/admin.js    admin portal
src/lib/*              tiny router, body/multipart parser, sessions, security, files
public/                CSS + browser JS (camera, video call, payments)
scripts/               create-admin, seed-demo
```
