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
1. **Register** at `/client/register`. Only these are needed: name, mobile, email (confirmed with a one-time email code), date of birth (18+ only), **one ID document of their choice** (Aadhaar, PAN or Passport: its number plus a photo of it), and a **live photo** that the camera takes automatically after a 3-second countdown. Address is optional. For Aadhaar, the number is checked with the Verhoeff checksum and only the last 4 digits are stored.
2. The seller gets a private **status link**. Logging in is blocked until you approve them.
3. You review the application. Optionally you click **Request video call**, send the client the call link (there's a WhatsApp button for this), and do a **live in-browser video call**. During the call you can **capture live photos** of the client with one click or an automatic 3-second timer. The photos are saved to their profile.
4. **Approve.** The seller can now log in and post ads.
5. The seller creates an ad, then picks **7 / 15 / 29 days** and can add **★ TOP**. Two ways to pay:
   - **Razorpay** (UPI, card, netbanking): the payment is verified automatically and the ad is **live instantly**.
   - **Manual UPI**: the seller pays to your UPI ID or QR and enters the UTR. You click **Confirm & go live** in Admin → Payments.
6. When the paid period ends, the ad is removed from the site automatically. The seller can **Renew** it, or **Extend** a live ad, which adds days on top of the current period.

You can also **add clients yourself** (Admin → Clients → Add client). Upload their documents, take a webcam photo, and approve immediately. A temporary password is generated for you to share.

---

## Also included
- **One-time email OTP** (plus optional SMS OTP), confirmation emails, and admin notifications. Paste your Gmail App Password in Admin → Settings; SMS can be added later (free from your own Android phone). See GUIDE Part 15.
- **Auto-approve** sellers (after the email OTP) if the admin doesn't act within 1 minute (configurable), with an email to both sides. **Payments are always confirmed by an admin**; they are never automatic.
- **18+ only:** date of birth is checked at registration and before posting; the admin sees the age next to the KYC documents.
- **TOP ads by 3-hour time slots** (8 a day, price per slot per day, set by the admin).
- **5 photos + 2 videos** (up to 1 minute each) per ad, changeable any time.
- **Main categories → sub-categories**, managed by the admin (add, rename, move, deactivate, delete).
- **Deactivate / reactivate** accounts (by the seller or the admin, with paid days frozen), plus **block** and **delete** for clients and ads.

- **Design:** a 3D ring of TOP ads on the home page, a category rail, filters and sorting, a tabbed ad page, a 4-step KYC wizard, an admin sidebar with tabbed settings, card-based category management with pop-up editors, and Reports (charts, rejected sellers and payments, ad complaints, all sellers, CSV export). Uses system fonts, no external assets, and respects `prefers-reduced-motion`.

- **Home page editor** (Admin → Home page): sliding banners with your own pictures, a notice bar, show/hide sections, headings, popular cities and footer text. The home page is marketplace-style (category bar with an all-categories menu, banners, category tiles, a TOP strip, popular cities, fresh ads with Load more, and saved ads ♡).
- **Video call any seller** from the admin portal. The seller's open page rings (pop-up plus sound) and they get an email link (`src/rtc.js`, `public/js/ring.js`).

- **Money:** seller messages (bell) for confirmed, rejected and failed payments, receipts, a seller **balance** (`src/wallet.js`: unused days of deleted ads, UPI top-ups confirmed by the admin, admin credits; pay fully or partly from balance), 1-day, monthly and yearly plans with an admin-set discount %, admin **Boost & TOP** (days or until a date, chosen slots), automatic blocking after complaints from N different people, and **instant alerts** (WhatsApp via CallMeBot or the Cloud API, Telegram, Google Chat) plus live admin and seller counters (`public/js/live.js`).
- **Smart search** (`src/search.js`): part words, typo correction, same-meaning and Hinglish words, brands, category and city names, with suggestions while typing (`public/js/suggest.js`). Results: TOP → best match → amount paid.
- **Free ads** (`src/freeads.js`): shown after all paid ads, never in TOP; days, per-seller limit and admin check set by the admin.
- **Staff roles** (`src/staff.js`): the owner makes roles from 10 permissions (payments, money, sellers, ads, categories, home, sponsors, reports, messages, settings); pages, menu and figures follow the role. Brand name, logo and 6 colour themes are owner-only (`src/brand.js`).
- **Payment failed later:** mark a confirmed payment failed or move an ad to unpaid; the seller is told and it goes live again after the next confirmed payment.
- **Real photos** in `public/photos` (Unsplash License, see `CREDITS.md`) for banners, category tiles and test ads.
- **Sponsors** (`src/routes/sponsors.js`): third-party ads between listings, under ad pages and on the home page, with view and click counts and an `/advertise` enquiry form.

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
Expired ads are removed from the listing. Ads are ordered by TOP now → admin boost → **amount paid** for the current run, and ads that paid the same are shuffled per visit. Scores are recalculated every 5 minutes, whenever a payment is confirmed, and when you click **Re-run ranking** in Admin → Ads. All weights are at the top of `src/ranking.js`. Each plan's price, TOP price and ranking level can be edited in **Admin → Settings**.

---

## Run locally

> 👉 **New to this? Follow [GUIDE.md](GUIDE.md).** It's a step-by-step guide covering install, test data, Wi-Fi access, your domain through a free Cloudflare Tunnel, and auto-start.

**Windows — one command** (in Command Prompt; installs to `D:\AdBazaar`):
```
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; irm https://raw.githubusercontent.com/sagarkerhalkar/adbazaar-classifieds/main/windows/install.ps1 | iex"
```

**Windows (manual):** open the `windows` folder and double-click, in order:
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
- **One running copy works everywhere at once:** `http://localhost:4780`, your Wi-Fi address (`http://192.168.x.x:4780`, printed at startup), and your Cloudflare Tunnel domain. Secure cookies and real visitor IPs are detected automatically.
- Camera and video calls work only on `localhost` and on **HTTPS** addresses (your domain). See [GUIDE.md](GUIDE.md) Parts 8–9.

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
