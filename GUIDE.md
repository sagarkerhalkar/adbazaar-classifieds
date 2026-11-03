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

## ⚡ Fastest way: ONE command (installs everything on the D: drive)

1. Press the **Windows key**, type `cmd`, and press **Enter**.
2. Copy this whole line, paste it with **right-click**, and press **Enter**:

```
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; irm https://raw.githubusercontent.com/sagarkerhalkar/adbazaar-classifieds/main/windows/install.ps1 | iex"
```

3. Answer the questions: your admin email, password, UPI ID, test data (Y), and auto-start (Y). Click **Yes** if Windows asks for permission.

It installs Node.js and cloudflared if they're missing, downloads AdBazaar to **`D:\AdBazaar`** (or `C:\AdBazaar` if you have no D: drive), picks a **free port** by itself, adds the test data, allows your Wi-Fi devices through the firewall, turns on **auto-start**, puts an **AdBazaar** shortcut on your desktop, and opens the site. 🎉

**To update later** (every time I add something new on GitHub): double-click the **"Update AdBazaar"** icon on your desktop, or run the same line again. It downloads the newest version, keeps your settings and data, asks no questions, and restarts the app.
Then continue with **Part 8 / Part 9** below for the internet link and your domain. Parts 1–5 and 10 are the manual way to do what this command already did.

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
4. Move the extracted folder to `D:\AdBazaar`. A short path without spaces is best.

So you now have `D:\AdBazaar\server.js`, `D:\AdBazaar\windows\`, and so on.

**If you use Git:**
```
D:
cd \
git clone https://github.com/sagarkerhalkar/adbazaar-classifieds.git AdBazaar
```
(Later, to get updates: `cd D:\AdBazaar` then `git pull`.)

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
1. Open `D:\AdBazaar\windows`.
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

1. Open the folder `D:\AdBazaar`.
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
| neha.test@example.com | Registered but **did not confirm the email OTP** yet |
| karan.test@example.com | **Deactivated his own account.** Log in as him to see **Reactivate** |

TOP ads use time slots: Rahul's iPhone is TOP **all day**, Sneha's tuition **9 AM–6 PM**, and Fatima's makeup **6 PM–12 AM**. Open the home page at different times to see the TOP section change.

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
- [ ] Report an ad, then check that it appears in Admin → **Reports → Ad complaints**.

**As the owner (admin):**
- [ ] Admin → **Payments** → confirm Rahul's payment. His ad goes live on the home page.
- [ ] Admin → **Clients** → Vikram → **Approve**. Then log in as vikram.test@example.com. It works now.
- [ ] Admin → **Ads** → Block an ad, then Unblock it. Set a boost, and use "Make TOP".
- [ ] Admin → **Settings** → change the prices, upload your UPI QR, and add a category.
- [ ] Admin → **Clients** → **+ Add client**. Add a person yourself and take their photo with your webcam.

**As a new seller (do this on `http://localhost:4780`, because the camera needs it):**
- [ ] Click **Post your ad** → register with just name, mobile, email, password and **date of birth** (18 or older) → choose **one ID**: Aadhaar, PAN or Passport → type its number (test numbers: Aadhaar `2341 2341 2346`, PAN `ABCDE1234F`, Passport `K1234567`) and upload any photo as the ID → **Start camera**. It clicks automatically after 3 seconds. Address is optional, so you can leave it closed.
- [ ] Type the **6-digit email code**. If email isn't set up yet (Part 15), find the code in Admin → **Messages**.
- [ ] Do nothing for 1 minute: the client is **approved automatically** and both of you get an email. You can change the minutes in Admin → Settings → **Approvals**.
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
1. Open `D:\AdBazaar\.env` in Notepad and add this line (with your domain):
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

| I want to… | Do this (in `D:\AdBazaar\windows`) |
|---|---|
| Start, and see the messages | `2-start.bat` (keep the window open) |
| Start hidden in the background | `3-start-in-background.bat` |
| Stop | `stop.bat` |
| Open the site | `open-site.bat` |
| See all addresses (PC / Wi-Fi / domain) | `show-addresses.bat` |
| Let phones on Wi-Fi open it | `allow-lan-access.bat` (Run as administrator) |
| Get a temporary internet link | `cloudflare-quick-test.bat` |
| Start with Windows: on / off | `autostart-ON.bat` / `autostart-OFF.bat` |
| See errors | Open `D:\AdBazaar\storage\server.log` in Notepad |
| Back up everything | Stop the app, then copy the whole `D:\AdBazaar\storage` folder (database + uploaded files) |

### Problems and fixes
| Problem | Fix |
|---|---|
| "Port … is already used" | Pick another free port (Part 3.1), change `PORT=` in `.env` **and** the Service URL in the Cloudflare route (Part 9.3). |
| "AdBazaar is already running" | It's already on, so just open the site. To restart: `stop.bat`, then start again. |
| Domain shows **Error 1033** or the tunnel is **Down** | Your PC is off or asleep, or the cloudflared service stopped. Restart the PC. |
| Domain shows **502 Bad Gateway** | The tunnel works, but AdBazaar isn't running or the port is wrong. Start it, and check the Service URL port. |
| Camera doesn't start | You're on an `http://192.168…` address. Use `localhost` or your `https://` domain. Click **Allow** when the browser asks for the camera. |
| Video call stuck on "Connecting…" on some mobile networks | Add a free TURN server in `.env` (`TURN_URL`, `TURN_USERNAME`, `TURN_PASSWORD`, for example from metered.ca). |
| Forgot admin password | In `D:\AdBazaar` open cmd and run: `npm run create-admin -- you@gmail.com NewPassword123` |
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

---

## Part 14 — Remove AdBazaar completely / move it to another laptop

### 14.1 Remove it from the old computer (one command)
On the **old** computer, open Command Prompt and paste:
```
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; irm https://raw.githubusercontent.com/sagarkerhalkar/adbazaar-classifieds/main/windows/uninstall.ps1 | iex"
```
Type `YES` when it asks. It:
- stops **only** AdBazaar. It checks that the program on AdBazaar's port really is AdBazaar before stopping it, so your other Node apps keep running.
- removes AdBazaar's auto-start, firewall rule and desktop shortcut.
- deletes the `D:\AdBazaar` folder.
- **does NOT uninstall** Node.js or cloudflared, and does not touch your Cloudflare Tunnel service. Your other running apps are not disturbed.
- **optional:** if you answer **Y** to "Make a backup", it saves `AdBazaar-backup-<date>.zip` to your Desktop with all clients, ads, payments, documents and settings. Skip this if you want a fresh start.

### 14.2 Install on the new laptop
1. *(Only if you made a backup)* Copy the `AdBazaar-backup-….zip` to the new laptop's **Desktop** or **Downloads** folder using a pen drive, Google Drive or similar.
2. On the new laptop, run the normal one-command installer (top of this guide).
3. If it finds the backup, it asks **"Restore your old data?"**. Type `Y`, and your admin login, clients and ads come back. Without a backup, it asks for a new admin email and password as usual.
4. At the end, note the **port** it shows (for example `http://localhost:4780`).

### 14.3 Point the same subdomain to the new laptop (Cloudflare)
Your domain stays the same (for example `test.yourdomain.com`). You only move it from the old computer's tunnel to a new tunnel on the laptop.

1. **Remove the route from the old tunnel** (do **not** delete the tunnel itself if other apps use it):
   Cloudflare dashboard → **Networking → Tunnels** → click the **old** tunnel → **Routes** → find `test.yourdomain.com` → **⋯ → Delete**.
2. **Create a tunnel for the laptop:** **Networking → Tunnels → Create Tunnel** → name it `laptop` → choose **Windows 64-bit** → copy the `cloudflared.exe service install eyJ…` command.
3. On the **laptop**, open Command Prompt **as administrator** and paste that command. The installer already installed cloudflared. Wait until the dashboard shows **Healthy**, then click **Continue**.
4. **Add the same subdomain to the new tunnel:** click the `laptop` tunnel → **Routes → Add route → Published application** → Hostname `test` + your domain → Service URL `http://localhost:4780` (use the port from step 14.2) → **Add route**.
   - If Cloudflare says a DNS record **already exists**: go to your domain → **DNS → Records**, delete the `test` record (type CNAME), then add the route again.
5. On the laptop, check that `D:\AdBazaar\.env` has `BASE_URL=https://test.yourdomain.com`. A restored backup already has it; otherwise add it. If you changed it, restart: `windows\stop.bat`, then `windows\3-start-in-background.bat`.
6. Open `https://test.yourdomain.com` on your phone using mobile data. It is now served from the laptop. ✅

> ⚠️ Run the uninstaller only on the **old** computer, and only for AdBazaar. Never run `cloudflared service uninstall` there if other apps use that tunnel. Removing the route (step 1) is enough.

---

## Part 15 — Email & SMS codes (OTP) and notifications

Each new seller confirms their **email** (and their **mobile**, if SMS is turned on) **once** with a 6-digit code. After that they never need a code again. The site also emails them when they are approved, when their ad goes live, and so on, and emails **you** about new sellers and UPI payments.

> Until you set this up, nothing is lost: every code and email is shown in **Admin → Messages**, so you can test everything right away.

### 15.1 Email — free with Gmail (10 minutes)
1. Use (or create) a Gmail account for the site, for example `adbazaar.help@gmail.com`.
2. Turn on **2-Step Verification**: open https://myaccount.google.com/security → *2-Step Verification* → turn it on.
3. Open **https://myaccount.google.com/apppasswords**, type `AdBazaar`, and click **Create**. Google shows a 16-letter password, like `abcd efgh ijkl mnop`. Copy it.
4. In AdBazaar go to **Admin → Settings**. The first box at the top is **📧 Email & 📱 SMS setup**.
5. Type your **Gmail address**, paste the **16-letter App Password** (spaces are fine), and click **Save email settings**.
6. Click **📧 Send test email to me** and check your inbox (and the Spam folder). ✅

That's it, and no restart is needed. From now on every new seller gets the 6-digit code by email straight away. Gmail allows about 500 emails a day for free.

> If the test says *"Gmail refused the login"*: you pasted your normal Gmail password, or 2-Step Verification is off. Use the 16-letter App Password.

**Google says "The setting you are looking for is not available for your account"?** That happens when:
- **2-Step Verification is not ON yet.** Turn it on with your **phone** (SMS code or Google prompt) at https://myaccount.google.com/signinoptions/twosv, wait a minute, then open the App passwords page again.
- 2-Step Verification uses **only a security key or passkey**. Add your phone number as a second step too.
- The account has **Advanced Protection**, or it is a **work/school (Google Workspace)** account. Google never gives App Passwords there. Use a normal personal @gmail.com account, or use Brevo below.
- You are signed in with **another account**. Check the round picture at the top right.

### 15.1b Email with Brevo — free, no Google settings needed
Use this if App Passwords don't work for you. It's free for **300 emails a day**, and emails still come **from your Gmail address**.
1. Sign up at **https://www.brevo.com** (free plan, no card needed).
2. Go to **Senders, domains & IPs → Senders → Add a sender**, type your Gmail address, and click the confirmation link that Brevo emails to you.
3. Go to **SMTP & API → SMTP** and click **Generate a new SMTP key**. Copy the key, and the **Login** shown on that page (it looks like `xxxxxx@smtp-brevo.com`).
4. In AdBazaar **Admin → Settings → 📧 Email & 📱 SMS setup**:
   - **Email service:** *Brevo*
   - **Login / username:** the Brevo **Login** from step 3
   - **Password:** the **SMTP key** from step 3
   - **Send emails as:** your Gmail address (the one you confirmed in step 2)
5. Click **Save email settings**, then **📧 Send test email to me**. ✅

### 15.2 SMS OTP — the free way (Android phone)
No company gives free SMS forever. The free way is to let **your own Android phone** send the SMS, using your SIM plan's free SMS.
1. On a spare Android phone with a SIM, install **SMS Gateway for Android** (free, open source, from sms-gate.app or the Play Store).
2. Open the app, turn on **Cloud server**, and note the **username** and **password** it shows.
3. In Admin → **Settings → Email & SMS setup**, choose *Android phone — free*, paste the username and password, and click **Save SMS settings**.
4. Click **📱 Send test SMS**.
5. Keep that phone charged and online. Every OTP is sent from its SIM.

**Paid alternatives** (more reliable, a few paise per SMS): choose *Fast2SMS* or *MSG91* in the same box. Indian telecom rules (DLT) apply to these providers; they guide you through it.

While SMS is **off**, sellers confirm only their email; the mobile number is still compulsory, just not verified by code. Once you turn SMS on, the mobile code becomes compulsory too. You can change that with the checkbox in *Approvals & notifications*.

---

## Part 16 — Using the newer features

**★ TOP ads by time slot.** The day (India time) has 8 slots: 12–3 AM, 3–6 AM, 6–9 AM, 9 AM–12 PM, 12–3 PM, 3–6 PM, 6–9 PM and 9 PM–12 AM. When paying, a seller ticks the slots they want. During those hours, every day of their plan, their ad sits in the **TOP ads** section. You set the price per slot per day in Admin → **Settings → TOP slots**, and you can stop selling a slot there too.

**Auto-approve.** After a seller confirms their email code, if you don't approve or reject them within **1 minute**, they are approved automatically and you get an email. Sellers see "Login verification takes about 1 minute", and after paying, "Payment confirmation takes 5 minutes to 24 hours". Change the minutes (or set 0 to turn it off) in Admin → Settings → **Approvals**.

**Simple registration with ONE ID.** A seller needs only: name, mobile, email (confirmed by email code), date of birth, **one** ID document of their choice (**Aadhaar, PAN or Passport**: its number and a photo of it), and a **live photo** from the camera. Address is optional. The ID number is checked for the right format (Aadhaar `XXXX XXXX XXXX`, PAN `ABCDE1234F`, Passport `A1234567`). For Aadhaar, only the last 4 digits are stored. On the client's page you see the ID type, the number, the ID photo and the live photo side by side. Clients who registered earlier with Aadhaar + PAN keep everything; their Aadhaar is shown as their ID.

**Only 18+ can post ads.** Sellers enter their date of birth when registering and tick "I am 18 years or older"; anyone younger is refused. Sellers who registered before this check are asked for their date of birth once, before they can post or pay. On each client's page you see the date of birth and age, so you can match it with the Aadhaar.

**Payments are never automatic.** Every UPI payment waits in Admin → **Payments** until you (or another admin) click **Confirm & go live**.

**Photos & videos.** Each ad can have **5 photos** and **2 videos**, each up to **1 minute** (MP4/MOV from a phone, up to 90 MB). Sellers can change them any time: My ads → Edit.

**Main category → sub-category.** Admin → **Categories** shows one card per main category.
- **Add a main category:** type the name (and an emoji) at the top and click *Add main category*.
- **Add a sub-category:** type its name in the box at the bottom of the card and click **+**.
- **Rename, reorder, move:** click the ✏️ pencil. A small window opens.
- **Hide / show:** click the 👁 eye (hidden = not in menus or new ads; running ads stay live).
- **Delete:** click the 🗑 bin. If it has ads, choose where they move in the window. A main category can be deleted only after its sub-categories.

Sellers must pick a sub-category when one exists.

**Deactivate / block / delete.**
| Who | What | Result |
|---|---|---|
| Seller | Account → **Deactivate my account** (password needed) | Profile and live ads are hidden. **Remaining paid days are saved.** Logging in again offers **Reactivate**, and the ads come back with those days. |
| You | Client → **Deactivate / Reactivate** | Same as above, but only you can reactivate. |
| You | Client → **Block / Unblock** | The seller can't log in and all their ads are hidden. Unblock brings them back. |
| You | Client → **Delete client permanently** | ID documents, photos, videos and personal details are erased. Payment records stay (anonymised) so your revenue numbers stay correct. |
| You | Ads → **Deactivate / Reactivate** | Hides one ad; its remaining paid days are saved. |
| You | Ads → **Block / Unblock** | Hides one ad (for example, after a report); the clock keeps running. |
| You | Ads → **Delete** | Removes the ad and its photos and videos. |


---

## Part 17 — The new look (3 Nov)

**Home page.** At the top, a turning **3D ring** shows the ads that are TOP right now (drag it, swipe it on a phone, or use the ‹ › buttons). Below it are round category icons, then the ads with a **filter panel** (sub-category, type, city) and a **sort** menu (best match, newest, price low→high, price high→low). TOP ads always stay first.

**Ad page.** Photos on the left. On the right, a box that stays in view with the price, the seller, **Show phone number** and **WhatsApp**. Description, videos, details and safety tips are in **tabs**, so the page stays short.

**Registration (seller and Admin → Add client).** It is now **4 short steps** with a progress bar: *About you → Your ID → Live photo → Finish*. Pick Aadhaar, PAN or Passport by tapping its card; the number box and the labels change to match. **Next** checks each step before moving on.

**Admin.** The menu is on the left (on a phone, tap ☰). **Settings** has 6 tabs: *Plans, TOP slots, Approvals, Email & SMS, Site & payments, Admins*. Each tab saves on its own and comes back to the same tab.

**Reports (Admin → Reports).** Choose *Last 7 / 30 / 90 days* at the top.
- **Overview:** revenue per day (point at the line to see each day), new sellers per day, and sellers and payments by status.
- **Rejected sellers:** who was rejected, when, by whom and why.
- **Rejected payments:** seller, ad, amount, UTR and your reason.
- **Ad complaints:** reports from visitors. Block the ad or dismiss the report.
- **All sellers:** every seller with their ads and the total they paid.

Every list has a **Download CSV** button that opens in Excel.

**Pop-ups instead of grey boxes.** "Are you sure?" questions now open a small window. Messages slide in at the top right and close by themselves.

**If something still looks old,** press **Ctrl + F5** once. After this update the browser always picks up new files by itself.
