# AdBazaar — step-by-step setup guide (very simple)

This guide takes you from zero to:

1. ✅ AdBazaar running on **your computer**
2. ✅ Filled with **test sellers, ads and payments**, so you can try everything
3. ✅ Opening on **phones and laptops on your Wi-Fi**
4. ✅ Opening on **your own domain** (for example `https://test.yourdomain.com`) for free, through a Cloudflare Tunnel
5. ✅ **Starting by itself** whenever your computer turns on

Later, when everything works, you move it to a cloud server (Part 12).

> Written for **Windows 10/11**. Mac/Linux users: see Part 13.
> Words in `grey boxes` are things you type or click exactly.

---

## Part 1 — Install Node.js (one time, 5 minutes)

Node.js is the "engine" that runs AdBazaar.

1. Open **https://nodejs.org** in your browser.
2. Click the big button that says **LTS**. It downloads an installer.
3. Open the downloaded file and click **Next → Next → Install → Finish**. Keep all the default settings.
4. **Restart your computer.**

Check that it worked:
1. Press the **Windows key**, type `cmd`, and press **Enter**. A black window opens. This is the *Command Prompt*.
2. Type `node -v` and press **Enter**.
3. You should see something like `v22.x.x` or `v24.x.x`. If the first number is 22 or higher, you're good. ✅

> AdBazaar doesn't need any other installs. There's no `npm install` step and no database to set up.

---

## Part 2 — Download AdBazaar (one time)

**Easiest way (no Git needed):**
1. Open **https://github.com/sagarkerhalkar/adbazaar-classifieds**.
2. Click the green **`Code`** button, then **`Download ZIP`**.
3. Right-click the downloaded ZIP and choose **Extract All…**.
4. Move the extracted folder to `C:\AdBazaar`. A short path without spaces is best.

So you now have `C:\AdBazaar\server.js`, `C:\AdBazaar\windows\`, and so on.

**If you use Git:**
```
cd C:\
git clone https://github.com/sagarkerhalkar/adbazaar-classifieds.git AdBazaar
```
(Later, to get updates: `cd C:\AdBazaar` then `git pull`.)

---

## Part 3 — Settings and choosing a free port (one time)

A **port** is like a door number on your computer. Every program needs its own door. AdBazaar uses door **4780**, which other programs almost never use.

### 3.1 Check that port 4780 is free
In Command Prompt type:
```
netstat -ano | findstr :4780
```
- **Nothing printed** → the port is free. ✅ Use 4780.
- **Lines printed** → another program uses it. Try `:4781`, `:4790` and so on until nothing prints, and use that number below.

### 3.2 Create your settings file
1. Open `C:\AdBazaar\windows`.
2. Double-click **`1-setup.bat`**. It checks Node.js and opens your settings file (`.env`) in Notepad.
3. Change these lines:

```
ADMIN_EMAIL=your-real-email@gmail.com
ADMIN_PASSWORD=MyStrongPassword123
PORT=4780
UPI_ID=yourname@okhdfcbank
UPI_PAYEE_NAME=Your Name
```
4. Press **Ctrl + S** to save, then close Notepad.

> 🔒 `ADMIN_EMAIL` and `ADMIN_PASSWORD` are **your** owner login. They're created the first time the app starts. Changing them later in `.env` does **not** change the login; change your password inside the app (Admin → Settings) instead.

---

## Part 4 — Start AdBazaar and open it

1. Double-click **`windows\2-start.bat`**. A black window opens and shows something like:

```
AdBazaar is running
  This computer:       http://localhost:4780
  Admin panel:         http://localhost:4780/admin/login
  Other devices (LAN): http://192.168.1.25:4780
```
2. **Keep this window open.** Closing it stops the app.
3. Open your browser and go to **http://localhost:4780**. You'll see the website. 🎉
4. Go to **http://localhost:4780/admin/login** and log in with your `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

If you see **"Port 4780 is already used by another program"**, go back to Part 3.1, pick another number, put it in `.env` as `PORT=…`, and start again.

---

## Part 5 — Add test data (sellers, ads, payments)

1. Open the folder `C:\AdBazaar`.
2. Click in the **address bar** at the top of the folder window, type `cmd`, and press **Enter**. A Command Prompt opens already in the right folder.
3. Type:
```
npm run seed:test
```
4. Refresh the website. It now has ads with pictures, TOP ads, and different cities.

**Test seller logins** (the password for all of them is `Test@1234`):

| Email | What you can test with this seller |
|---|---|
| rahul.test@example.com | 3 live ads, plus 1 payment waiting for **you** to confirm |
| sneha.test@example.com | TOP ad, plus 1 expired ad (try **Renew**) |
| amit.test@example.com | Car ads, one ending within a day |
| fatima.test@example.com | TOP ad, plus 1 unpaid ad (try **Pay**) |
| vikram.test@example.com | **Pending.** Approve him in Admin → Clients |
| pooja.test@example.com | **Video call** requested |
| ravi.test@example.com | **Rejected** |

To remove all the test data later (your real data stays):
```
npm run seed:remove
```

---

## Part 6 — Try everything (testing checklist)

Use **two browsers**, for example Chrome for the admin and Edge (or an Incognito window) for the seller. That way you can be logged in as both at once.

**As a customer (no login):**
- [ ] Open the home page. Search for "AC", filter by city, and open an ad.
- [ ] Click "Show phone number" and the WhatsApp button.
- [ ] Report an ad, then check that it appears in Admin → **Reports**.

**As the owner (admin):**
- [ ] Admin → **Payments** → confirm Rahul's payment. His ad goes live on the home page.
- [ ] Admin → **Clients** → Vikram → **Approve**. Then log in as vikram.test@example.com. It works now.
- [ ] Admin → **Ads** → Block an ad, then Unblock it. Set a boost, and use "Make TOP".
- [ ] Admin → **Settings** → change the prices, upload your UPI QR, and add a category.
- [ ] Admin → **Clients** → **+ Add client**. Add a person yourself and take their photo with your webcam.

**As a new seller (do this on `http://localhost:4780`, because the camera needs it):**
- [ ] Click **Post your ad** → register → upload any photo as the Aadhaar/PAN → **Start camera**. It clicks automatically after 3 seconds.
- [ ] Try to log in. It's blocked until you approve. ✅
- [ ] As admin: open that client → **Request video call** → **Start video call**. As the seller: open the status link → **Join video call**. As admin: click **Capture live photo**, then **Approve**.
- [ ] As the seller: log in → **Post ad** → choose 7/15/29 days, tick ★ TOP → enter any UTR number such as `123456789012` → submit.
- [ ] As admin: **Payments** → **Confirm**. The ad appears at the top of the home page.

---

## Part 7 — Open it on phones/laptops on the same Wi-Fi (LAN)

1. Right-click **`windows\allow-lan-access.bat`** and choose **Run as administrator**. This opens your port in the Windows Firewall for home/office Wi-Fi only.
2. Double-click **`windows\show-addresses.bat`**. Look for the line `Other devices (LAN): http://192.168.x.x:4780`.
3. On your phone, connected to the **same Wi-Fi**, open that address. ✅

> 📷 **Important:** phones and browsers only allow the **camera** on `https://` addresses (or on `localhost`). On the `http://192.168…` address everything works **except** the live photo and video call. To test those from a phone, use your domain (Part 9) or the quick link (Part 8).
>
> If your phone can't open the address, make sure Windows calls your Wi-Fi a **Private network**: Settings → Network & Internet → Wi-Fi → your network → **Private**.

---

## Part 8 — Quick free internet link (no domain needed, 2 minutes)

Good for a quick test on mobile data or for showing a friend.

1. Open Command Prompt and run (one time):
```
winget install --id Cloudflare.cloudflared
```
   Close and reopen Command Prompt afterwards.
2. Make sure AdBazaar is running, then double-click **`windows\cloudflare-quick-test.bat`**.
3. Wait for a line like `https://blue-river-sunny-cat.trycloudflare.com` and open it on any phone. ✅ This is **https**, so the camera works.
4. Close the window to stop the link. You get a **new random link every time**. For a permanent address, use Part 9.

---

## Part 9 — Your own domain with Cloudflare Tunnel (free, permanent)

With this, `https://test.yourdomain.com` opens AdBazaar running on **your computer**. You don't need to open any ports on your router or pay for hosting, and you get free HTTPS.

### 9.1 Put your domain on Cloudflare (one time, free)
1. Sign up at **https://dash.cloudflare.com/sign-up**.
2. Click **Add a domain** (or **Onboard a domain**), type your domain, and choose the **Free** plan.
3. Cloudflare shows you **2 nameservers** (like `ana.ns.cloudflare.com`).
4. Log in where you bought the domain (GoDaddy, Hostinger, BigRock, Namecheap…), find **Nameservers**, choose **Custom**, paste the 2 Cloudflare nameservers, and save.
5. Wait until Cloudflare shows the domain as **Active**. This is usually 10 minutes to a few hours, and you'll get an email.

### 9.2 Create the tunnel
1. In the Cloudflare dashboard go to **Networking → Tunnels → Create Tunnel**.
2. Name it after this computer, for example `home-pc`, and click **Create Tunnel**.
3. Under **Setup Environment**, pick **Windows** and **64-bit**.
4. Cloudflare shows a command that starts with `cloudflared.exe service install eyJ…`. **Copy it.** The long `eyJ…` part is a secret key, so don't share it.
5. Press the Windows key, type `cmd`, **right-click** Command Prompt, and choose **Run as administrator**.
   - If you haven't installed cloudflared yet: run `winget install --id Cloudflare.cloudflared`, then close and reopen Command Prompt as administrator.
6. Paste the command and press Enter. This installs the tunnel as a Windows service, so it **starts automatically with Windows**.
7. Back in the dashboard, the tunnel turns **Healthy**. Click **Continue**.

### 9.3 Connect your domain to AdBazaar
1. In **Networking → Tunnels**, click your tunnel, then under **Routes** click **Add route** → **Published application**.
2. **Hostname:** type `test` as the subdomain and choose your domain from the drop-down.
3. **Service URL:** `http://localhost:4780` (use your own PORT number if you changed it).
4. Click **Add route**.

### 9.4 Tell AdBazaar its address
1. Open `C:\AdBazaar\.env` in Notepad and add this line (with your domain):
```
BASE_URL=https://test.yourdomain.com
```
2. Save. Then restart AdBazaar: double-click `windows\stop.bat`, then `windows\3-start-in-background.bat`.

### 9.5 Test it
- Open **https://test.yourdomain.com** on your phone **using mobile data** (Wi-Fi off). ✅
- The same running app now works at all three addresses at once: `http://localhost:4780`, your Wi-Fi address, and your domain. You don't need to change anything when switching between them.
- Video-call links that you send to clients now use your domain, so their camera works.

---

## Part 10 — Make it start by itself

1. Double-click **`windows\autostart-ON.bat`**. AdBazaar now starts hidden in the background every time you log in to Windows.
2. The Cloudflare tunnel already starts by itself (Part 9.2, step 6).
3. Make sure your PC doesn't sleep: **Settings → System → Power → Screen and sleep → "When plugged in, put my device to sleep after" → Never**.
4. Test it: restart the computer, log in, wait 30 seconds, then open your domain. ✅

To turn auto-start off: **`windows\autostart-OFF.bat`**.

> ⚠️ Auto-start runs when you **log in**. If the PC restarts and sits on the login screen, the site is down until you log in. For a 24×7 site, use a cloud server (Part 12).

---

## Part 11 — Everyday cheat sheet

| I want to… | Do this (in `C:\AdBazaar\windows`) |
|---|---|
| Start, and see the messages | `2-start.bat` (keep the window open) |
| Start hidden in the background | `3-start-in-background.bat` |
| Stop | `stop.bat` |
| Open the site | `open-site.bat` |
| See all addresses (PC / Wi-Fi / domain) | `show-addresses.bat` |
| Let phones on Wi-Fi open it | `allow-lan-access.bat` (Run as administrator) |
| Get a temporary internet link | `cloudflare-quick-test.bat` |
| Start with Windows: on / off | `autostart-ON.bat` / `autostart-OFF.bat` |
| See errors | Open `C:\AdBazaar\storage\server.log` in Notepad |
| Back up everything | Stop the app, then copy the whole `C:\AdBazaar\storage` folder (database + uploaded files) |

### Problems and fixes
| Problem | Fix |
|---|---|
| "Port … is already used" | Pick another free port (Part 3.1), change `PORT=` in `.env` **and** the Service URL in the Cloudflare route (Part 9.3). |
| "AdBazaar is already running" | It's already on, so just open the site. To restart: `stop.bat`, then start again. |
| Domain shows **Error 1033** or the tunnel is **Down** | Your PC is off or asleep, or the cloudflared service stopped. Restart the PC. |
| Domain shows **502 Bad Gateway** | The tunnel works, but AdBazaar isn't running or the port is wrong. Start it, and check the Service URL port. |
| Camera doesn't start | You're on an `http://192.168…` address. Use `localhost` or your `https://` domain. Click **Allow** when the browser asks for the camera. |
| Video call stuck on "Connecting…" on some mobile networks | Add a free TURN server in `.env` (`TURN_URL`, `TURN_USERNAME`, `TURN_PASSWORD`, for example from metered.ca). |
| Forgot admin password | In `C:\AdBazaar` open cmd and run: `npm run create-admin -- you@gmail.com NewPassword123` |
| "Node.js is not installed" | Do Part 1 again, then restart the PC. |

---

## Part 12 — Moving to the cloud later

When testing is finished:
1. Run `npm run seed:remove` to delete the test data.
2. Copy the `storage` folder and your `.env` to the new server. Everything (clients, ads, payments, documents) moves with them.
3. Follow **"Deploy (VPS)"** in `README.md`. You can keep using the Cloudflare Tunnel there too: create a new tunnel for the server and point your **real** domain at it.

> ⚠️ **About "serverless" hosting (Vercel, Netlify, Cloudflare Pages/Workers, AWS Lambda):** AdBazaar **cannot run there as it is**. It keeps its database and uploaded documents in files, and the video call needs a server that stays on. Choose one of these instead:
> - a small **VPS** (any provider: DigitalOcean, Hetzner, AWS Lightsail, Hostinger VPS…), or
> - a **container host with a persistent disk/volume** (Railway, Render, Fly.io…) using the included `Dockerfile`.
>
> Your new domain works the same way with either one. If you really want serverless, the app would have to be changed to use a cloud database and cloud file storage. That's a bigger job, which we can do later.

---

## Part 13 — Mac / Linux (short version)

```bash
# 1. Install Node.js 22+ (Mac: from nodejs.org,  Ubuntu: see README "Deploy")
git clone https://github.com/sagarkerhalkar/adbazaar-classifieds.git adbazaar && cd adbazaar
cp .env.example .env && nano .env        # set ADMIN_EMAIL, ADMIN_PASSWORD, PORT
npm start                                # open http://localhost:4780
npm run seed:test                        # test data
# Auto-start:
sudo npm i -g pm2 && pm2 start ecosystem.config.js && pm2 save && pm2 startup   # run the command it prints
# Cloudflare Tunnel: same as Part 9, choose your OS in step 9.2 and run the shown "sudo cloudflared service install …"
# Quick link: cloudflared tunnel --url http://localhost:4780
```
