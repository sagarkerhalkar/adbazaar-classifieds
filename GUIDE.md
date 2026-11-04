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
- [ ] Admin → **Settings** → change the prices (Plans tab), upload your UPI QR (Site & payments tab). Admin → **Categories** → add a sub-category.
- [ ] Admin → **Reports** → look at the charts and the Rejected sellers / Rejected payments tabs, and download a CSV.
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
4. In AdBazaar go to **Admin → Settings** and click the **Email & SMS** tab.
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
4. In AdBazaar **Admin → Settings → Email & SMS** tab:
   - **Email service:** *Brevo*
   - **Login / username:** the Brevo **Login** from step 3
   - **Password:** the **SMTP key** from step 3
   - **Send emails as:** your Gmail address (the one you confirmed in step 2)
5. Click **Save email settings**, then **📧 Send test email to me**. ✅

### 15.2 SMS OTP — the free way (Android phone)
No company gives free SMS forever. The free way is to let **your own Android phone** send the SMS, using your SIM plan's free SMS.
1. On a spare Android phone with a SIM, install **SMS Gateway for Android** (free, open source, from sms-gate.app or the Play Store).
2. Open the app, turn on **Cloud server**, and note the **username** and **password** it shows.
3. In Admin → **Settings → Email & SMS**, choose *Android phone — free*, paste the username and password, and click **Save SMS settings**.
4. Click **📱 Send test SMS**.
5. Keep that phone charged and online. Every OTP is sent from its SIM.

**Paid alternatives** (more reliable, a few paise per SMS): choose *Fast2SMS* or *MSG91* in the same box. Indian telecom rules (DLT) apply to these providers; they guide you through it.

While SMS is **off**, sellers confirm only their email; the mobile number is still compulsory, just not verified by code. Once you turn SMS on, the mobile code becomes compulsory too. You can change that with the checkbox in Settings → **Approvals**.

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
- **Delete:** click the 🗑 bin. If it has ads, choose where they move in the window. Deleting a main category also deletes its sub-categories.

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

**Search and category pages.** Results have a **filter panel** (sub-category, type, city) and a **sort** menu (best match, newest, price low→high, price high→low). TOP ads always stay first. The home page itself is described in Part 18.

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

---

## Part 18 — Marketplace home page, Home page editor, video call any seller (3 Nov, evening)

**Home page (like OLX).** From top to bottom:
- an optional **notice bar**
- the search bar, and a **category bar** with *All categories* (a full menu of every category and sub-category)
- **sliding banners**
- **category tiles**
- the **TOP ads** strip
- **popular cities**
- **Fresh recommendations**, with a *Load more ads* button
- a *Have something to sell?* band, and a full footer

Visitors can tap the ♡ on any ad to **save** it. Saved ads are kept in their own browser; open them with **Saved** at the top.

**Change the home page yourself: Admin → Home page.**
- **Banners tab:** up to 8 banners that slide every 5 seconds.
  - Click **Edit banner** to change the headline, small text, button text and the page the button opens (for example `/?cat=vehicles`), plus the colour and a big emoji.
  - You can also upload your own wide picture (about 1600 × 400). Switch **Show on site** on or off, move banners up or down, or delete them.
  - **Add a banner** creates a new one, hidden until you switch it on.
- **Sections & texts tab:**
  - turn the category tiles, TOP strip, popular cities and sell band on or off
  - write the notice bar text (leave it empty to hide the bar)
  - change the headings, the list of popular cities and the footer text

**Delete the default categories.** In Admin → Categories, the 🗑 bin now works on a **main** category too. It deletes the main category **with all its sub-categories**; if they have ads, you choose where those ads move. Categories you delete never come back by themselves.

**Video call any seller, any time.** Open a client in Admin → Clients and click **📹 Video call now**. Then:
- If the seller has the site open (logged in, or on their status page), their screen **rings** with a pop-up: *Join call* / *Not now*.
- They also get an **email** with the join link.
- When they join, you see and hear each other.
- Click **End call** when you're done, and their phone stops ringing.
- The call link works for 15 minutes after you click.

> The camera needs `localhost` or your `https://` domain (not the `http://192.168…` Wi-Fi address).

**Test data pictures.** The test ads and banners use **real photos** that come with the app (see Part 22). You can also upload your own.

---

## Part 19 — Money, balance, subscriptions, alerts, sponsors (3 Nov, night)

**Messages for sellers.** Sellers see a 🔔 **Messages** bell. They get a message when a payment is confirmed (with a **receipt** to download), rejected (with your reason) or failed, when an ad ends or is removed, and when balance is added. Rejected and failed payments also show on top of their *My ads* page with a **Pay again** button.

**Who is responsible.** Before paying, the seller must tick that they accept the payment terms. A wrong UPI ID, amount or UTR, and failed or delayed bank payments, are the seller's responsibility. The Terms say that ads are published by the advertiser under their sole responsibility and that the site does not check ads in advance or mediate between users. Fill in Admin → Settings → **Business & legal** so your name, address and Grievance Officer appear on receipts and policy pages.

**Plans.** There are now **1 day**, 7, 15, 29 days, a **Monthly subscription** (30 days) and a **Yearly subscription** (365 days). Change any price and the **Discount %** in Admin → Settings → **Plans** (20% is set for monthly and yearly; it applies to the plan and its TOP slots). The payment screen shows the old price crossed out.

**How ads are ordered.**
1. TOP ads come first (TOP slots the seller paid for, or TOP you set yourself).
2. Then your boost.
3. Then **money paid**: more money = higher. A yearly plan is above a monthly plan, above 7 days, above 1 day.
4. Ads that paid **the same amount are shuffled on every new visit**, so each one gets a fair turn at the top.

**Boost & TOP (you).** Admin → **Ads** → **Boost & TOP** opens a small window. You can:
- put the ad in TOP for a number of days, or until a date and time, in the time slots you choose;
- set a boost from −10 to +10;
- add free days.

**Balance.**
- If a seller deletes a live ad, the **value of the unused days goes to their balance**.
- On the next ad they see *"You have ₹X balance waiting"*. On the payment screen they tick **Use my balance**. If it covers everything, the ad goes **live straight away**; otherwise they pay the rest by UPI.
- Sellers can also **add money** in *Balance*. You confirm it in Admin → **Payments** (top-ups are shown first).
- On a seller's page in Admin → Clients you can add or remove balance by hand.
- Balance is for ads only; it is not paid out as cash.

**Too many complaints = automatic block.** If one ad gets complaints from **500 different people** (change the number in Settings → **Approvals**; 0 = off), the ad is removed and the seller is **blocked**. They can't log in, and they can't register again with the same mobile number or PAN/passport number. You get an alert.

**Live updates.** Admin pages refresh their counters every 10 seconds. A new payment or new seller shows a pop-up with a soft sound, and the Dashboard, Payments and Clients pages reload by themselves (unless you are typing). Sellers' pages update their bell the same way.

**Alerts on your phone (Admin → Settings → Alerts).** Choose what you want (payments, new sellers, complaints, advertiser enquiries), then set up any of these:
- **WhatsApp on your own number (free):** open callmebot.com → WhatsApp, follow their steps to get an API key, and paste it with your number.
- **WhatsApp Business (Cloud API):** paste the access token and phone number ID from Meta for Developers.
- **Telegram (free):** create a bot with @BotFather, then paste the token and your chat ID.
- **Google Chat:** paste a space webhook URL (needs Google Workspace).

Click **Save & send a test alert**. Every alert is also listed in Admin → Messages.

**Reports.** Two new tabs:
- **Money:** total received, the split between UPI, online and balance, top-ups, plans sold, top paying sellers, and every confirmed payment (CSV download).
- **Live ads:** every running ad with its plan, amount paid, end date, views and how it is placed, plus a **Boost & TOP** button and a short guide to how ads move up.

**Sponsored ads (other websites and apps).** Admin → **Sponsors**: add an advertiser's ad with a picture, link, dates and where to show it:
- between listings (after every 8 ads; you can change this in Settings → Approvals);
- under the ad page;
- on the home page.

Views and clicks are counted. Businesses can ask for a slot on the public **Advertise with us** page (`/advertise`); their enquiries appear in Sponsors → Enquiries and as an alert.

**Post ad button.** It now asks: *I already sell here* (log in right there and go straight to the new ad) or *I'm new here* (register).

---

## Part 20 — Hosting in Switzerland and running it from India

You can rent a server in a Swiss data centre and manage everything from India in your browser (your admin panel at your own domain).

1. **Pick a Swiss provider.** For example **Infomaniak** (Geneva; its *VPS Lite* with 4 vCPU and 4 GB RAM was listed at about €9/month in 2026), **Exoscale** (Zurich and Geneva) or **Hostpoint**. 2 vCPU and 4 GB RAM is plenty to start. Choose **Ubuntu 24.04** and a **Swiss** location.
2. **Log in from your Windows laptop.** Open PowerShell: `ssh root@YOUR-SERVER-IP` (the provider emails you the IP and password, or lets you add an SSH key).
3. **Install AdBazaar on the server.** Follow **"Deploy (VPS)"** in `README.md` (Node.js 22, `git clone`, `.env`, `pm2` so it starts by itself).
4. **Move your data.** Stop AdBazaar on your laptop and copy the `storage` folder and `.env` to the server (for example with WinSCP, or `scp -r D:\AdBazaar\storage root@IP:/opt/adbazaar/`).
5. **Point your domain.** Keep using Cloudflare: create a tunnel for the server (Part 9.2, choose *Linux*) and move the route of your subdomain to it (Part 14.3). Cloudflare also makes pages load faster in India.
6. **Backups.** Turn on the provider's daily snapshots, and download a copy of `storage` now and then.

Things to know:
- Pages travel India ↔ Switzerland, which adds about a tenth of a second. Cloudflare caches pictures and styles, so visitors hardly notice.
- India's data protection law (DPDP Act 2023) allows keeping data abroad, except in countries the government may restrict. Its main duties start on **13 May 2027**. Type the country of your server in Admin → Settings → **Business & legal → Where the server is**; the Privacy policy then shows it.
- Video calls work the same. If some mobile networks fail to connect, add a TURN server (Part 11, problems table).

---

## Part 21 — Opening it to the public (India) — checklist

1. **Domain and HTTPS:** done with Cloudflare (Parts 9 and 20).
2. **Business details:** run it in your own name as a proprietor, or as a company. Fill in Admin → Settings → **Business & legal** (name, address, GSTIN if you have one, Grievance Officer). Free **Udyam (MSME)** registration and a current bank account help with payment gateways.
3. **GST:** for services, registration is generally needed once yearly turnover crosses ₹20 lakh (lower in some states). Ask a CA.
4. **IT Rules 2021 (you are an "intermediary"):**
   - publish your Terms, Privacy policy and user rules (already at `/terms`, `/privacy`, `/refund-policy`);
   - show a **Grievance Officer** with contact details (at `/contact`);
   - acknowledge complaints within **24 hours** and resolve them within **15 days**;
   - remove illegal content when you receive a court order or a government notice.
5. **Online payments (Razorpay or another gateway):** they check your policy and contact pages, then ask for KYC (PAN, bank account, business proof). Put the keys in `.env`.
6. **Get found on Google (free):** add your domain to **Google Search Console** and submit `https://your-domain/sitemap.xml`. Make a free **Google Business Profile**.
7. **Before launch:** remove the test data (`npm run seed:remove`), set a strong admin password, set up email and alerts, and ask a lawyer to read the Terms, Privacy and Refund pages. They are good templates, not legal advice.

---

## Part 22 — Real photos, free ads, staff roles, your brand name, smarter search (3 Nov, late night)

**Update first:** double-click **Update AdBazaar**, then press **Ctrl+F5** in the browser. The update swaps the old test ads for new ones with real photos by itself. Your real sellers and ads are not touched.

**Real photos.** The banners, the category tiles, ads without a picture and the test ads now use real photos (people at work, phones, laptops, cars and more) that ship with the app, so nothing has to download. They are from Unsplash and free for commercial use; the list is in `public/photos/CREDITS.md`. Use your own instead at any time:
- Banners: Admin → **Home page** → Edit banner → upload a picture.
- Category tiles: Admin → **Categories** → **Use my own photo** on any main category.

**Free ads.** Sellers can now post without paying. On the payment screen they see **Post it free**:
- Free ads show **after every paid ad**, in random order, and never in TOP. There is no guarantee of a high place.
- You set the rules in Admin → Settings → **Approvals → Free ads**: on or off, how many days a free ad runs (default 15), how many free ads one seller may have at a time (default 2), and whether you check each free ad first (default **off**: free ads go live at once; only payments need your approval).
- If you switch the check on, free ads wait in Admin → **Ads → Free ads to check**: **Approve** or **Turn down** (the seller sees your reason).
- A seller can **Upgrade to paid** any time; the ad then moves above every free ad.

**Staff roles and brand.** See Part 23: you now make your own roles, and you can change the name, logo and colours.

**Smarter search.** People can type the way they talk:

| They type | They find |
|---|---|
| `mob` | Mobile phones (part of a word is enough) |
| `iphnoe`, `speker` | iPhone, speaker (typing mistakes are corrected and shown) |
| `gadi`, `naukri`, `ghar`, `kiraya` | Cars, jobs, houses, rent (common Hinglish words) |
| `mobile` | Phones, including OnePlus, Redmi and other brands |
| `tuition` | Everything in Education › Tuition (category names count) |
| `spa nashik`, `flat in bombay` | Only Nashik, only Mumbai (city names in the search, old names too) |

- While typing, a list shows matching categories, ads and cities; use ↓ ↑ and Enter.
- Order of results: TOP ads first; then ads whose title has every word; then the rest. Inside each group, the normal order applies (more paid, higher).
- If nothing is found in a city, one click shows the same search in all cities.

**Terms (stronger).** On top of the earlier rules, the Terms now also say:
- licences, taxes (GST) and the law are the seller's own job;
- our payment and ad records are treated as correct, payment problems must be reported within 7 days, and no staff member can promise anything on your behalf;
- general clauses: no partnership, events outside our control, the English version applies.

The arbitration clause was changed to "an arbitrator chosen by both sides". Since a 2024 Supreme Court judgment, an arbitrator chosen by one side alone can make the clause fail.

**What the site does not allow.** Adult or sexual services, escort or "companion" ads are not allowed. In India, advertising them is a crime under the Immoral Traffic (Prevention) Act and the IT Act, and the site owner can be held responsible too. Massage and spa ads are welcome only for genuine wellness and therapy; there is a **Spa & Wellness** category for them. Toys, beauty, salons and every normal product or service are fine.

---

## Part 23 — Your own staff roles, logo and colours, failed payments, ads near you (4 Nov)

**Update first:** double-click **Update AdBazaar**, then press **Ctrl+F5**.

**Free ads go live at once.** Nothing to approve; only payments need you. Free ads that were waiting went live by themselves. To check free ads again, switch it on in Settings → **Approvals → Free ads**.

**Make your own roles (Admin → Settings → Staff & brand → Roles).**
1. Click **New role**, type a name (for example *Ad checker* or *Accountant*), tick what it may do, and click **Create role**.

   | Tick | Opens |
   |---|---|
   | Confirm payments | Payments and balance top-ups waiting to be confirmed |
   | See money totals | Money on the dashboard, payment history, money reports, CSV |
   | Sellers | Verify, approve, block, video call, balance |
   | Ads | Block, boost, TOP, extend, delete, move to unpaid |
   | Categories / Home page / Sponsors | Those pages |
   | Reports & complaints | Charts, rejected lists, complaints |
   | Messages log | Every email, SMS and alert sent |
   | Settings | Plans, prices, TOP slots, approvals, email, alerts, legal |

2. Under **Add a staff login**, type their name, email and a password, choose the role, and give them the login.

Two roles are ready: **Admin** (everything) and **Payment checker** (only confirm payments, no totals). Each person sees only their pages; anything else sends them back. Change a role at any time and it applies at once. **Remove** stops a login immediately.

Only **you, the owner**, can change staff, roles and the brand.

**Your name, logo and colours (owner only).** In **Staff & brand → Brand**:
- **Site name and tagline:** for example change *AdBazaar* to *BazaarNova*. The name shows everywhere: header, footer, emails, receipts, legal pages.
- **Logo:** upload a square PNG, JPG or WEBP (max 2 MB). Tick **Remove my logo** to go back to the tag symbol.
- **Colours:** pick one of 6 colour sets (Peacock & marigold, Indigo & saffron, Emerald & lime, Maroon & gold, Midnight & coral, Ocean & sunshine). The whole site changes colour.

**A payment failed after you confirmed it** (bounced, reversed, charge-back, fake UTR):
- **Admin → Payments → Paid**, type why, and click **Payment failed**.
- **Or Admin → Ads → More → Move to unpaid**, for any live ad.

What happens next:
1. The ad leaves the site at once, its paid days and TOP are cleared, and the payment stops counting as money received. Any part paid from balance goes back to the seller's balance.
2. The seller gets a message with a **Try again** button.
3. When they pay again and you confirm, the ad goes live and is ranked by the new amount, as usual.

Failed payments are listed under **Payments → Failed later**.

**Ads near you, under every ad.** Under each ad, visitors now see:
- **Similar ads near {area, city}:** the same category in the same city, same area first. Then TOP ads, paid ads (more paid = higher) and free ads last. If the category has nothing in that city, they see other ads from the same city.
- **More {category} in other cities**, in the same order.

**Cleaner admin.**
- The **Dashboard** greets you, shows what needs you today, and has coloured cards (each staff member only sees the cards their role allows).
- The **Ads** list shows a photo, and one **Boost & TOP** button plus a **More** menu (deactivate, move to unpaid, block, delete) instead of a long row of buttons.

**Checked on every screen size.** Every page was tested at seven sizes: Android phone (360), iPhone (390), iPad portrait and landscape, laptop (1366), MacBook (1512) and a big monitor (1920). The fixes:
- the ad page no longer goes wider than a phone screen;
- links and buttons are bigger on touch screens;
- the phone footer is shorter;
- the settings tabs wrap instead of being cut off.

---

## Part 24 — Lists that fit every screen, instant photo checks, both sides of the ID (4 Nov, evening)

**Update first:** double-click **Update AdBazaar**, then press **Ctrl+F5**.

**Admin lists fit on every screen.** Payments, top-ups, clients, ads, reports and messages now fit on a laptop, a Mac, a tablet, a phone and a zoomed-in browser. Nothing is cut off at the right any more.
- **Payments:** each row shows the amount, the payment number and a short date on one line ("2 Nov, 4:42 pm"), the seller and the ad, the plan, how it was paid and the status.
- **Buttons:** one main button per row (**Confirm & go live** or **Receipt**). **Reject** and **Payment failed** (with the reason box) are in the **More** menu.
- **Smaller screens** (tablet, phone, or a browser zoomed in): each row becomes a small card with labels.

**Photos are checked the moment they are chosen** (seller photos, ID, payment screenshot, banners, logo, sponsors, category photos):
- **A big photo is made smaller by itself**, before uploading. For example, 19.8 MB becomes 616 KB, so the upload is fast and still sharp.
- **A wrong file** (not a photo, a PDF where only photos are allowed, too many photos) shows a red message at once and is removed.
- **Videos:** length (max 1 minute) and size (max 90 MB) are checked as before.
- The chosen photos appear as small previews under the box; the first one is marked **Cover**.

**ID photos.**

| ID | What the seller uploads |
|---|---|
| **Aadhaar** | Front side (photo, name, date of birth) **and** back side (address) |
| **Passport** | First page (photo, name, date of birth) **and** last page (address) |
| **PAN** | Front side only |

The form changes by itself when the seller picks the ID, and the server refuses an Aadhaar or passport without both sides. Admin → **Add client** works the same way. On a client's page you see both sides labelled.

**New category: Toys & Kids** (Toys & games, Baby products, School & study). Rename or delete it in Admin → Categories.

**Every requirement checked.** The file `docs/REQUIREMENTS.md` (also in your project) lists all 57 things you asked for since the start, with where each one is in the app.

Phone fixes in this round:
- the payment page no longer goes wider than a small phone (long button text now wraps);
- the **More** menu stays open while you type a reason on a phone.

---

## Part 25 — Free ads text-only, photo tools, full photos, smooth live updates, small footer, 3D (4 Nov, evening)

**Update first:** double-click **Update AdBazaar**, then press **Ctrl+F5**.

**Free ads are text only.** Buyers see a clean text card (category, title, "Free ad") instead of photos, and no videos.
- The seller's photos and videos are kept and appear as soon as the ad is upgraded to a paid plan.
- The payment screen shows a **Free or paid?** table: text only vs photos and videos, after all paid ads vs above them, never TOP vs TOP time slots.
- When a seller opens their own free ad, a note tells them buyers don't see the photos, with an **Upgrade** link.

**Photo tools for sellers** (My ads → Edit → Photos). Each photo has **Make cover**, **move left / right**, **Replace** (choose a new photo; big ones are made smaller by themselves) and **Delete**. Every button saves at once.

**Photos on the ad page show in full.** Before, an upright phone photo was cut off and only its top part showed. Now:
- the whole photo always shows, with a soft blurred copy of it filling the sides;
- **arrows** and a **"2 / 5" counter**;
- **swipe** on phones, ← → keys on a computer;
- **Full size** (or a click on the photo) opens it full screen.

**Live updates are smoother.** When a new payment, seller or message arrives, the list updates **in place**: no page reload, and the scroll position is kept. Nothing runs while the tab is in the background; it checks at once when you come back to it.

**Smaller footer.** One line for the brand and the **Post your ad** button, three short rows of links (Categories, Cities, Help), and one line of legal text. On phones each row slides sideways.

**Motion and 3D** (switched off for people who turn off animations on their device):
- **TOP ads** are a 3D carousel: cards turn as they move, the middle one comes forward, and it moves slowly by itself (it stops when you touch it).
- Sections, category tiles and ads **float up into place** as you scroll.
- **Category tiles tilt in 3D** with a light shine under the mouse.
- The **banner** has depth: text and photo move apart with the mouse.
- A **numbers band** under the banner (ads live, verified sellers, cities, categories) counts up. The admin dashboard numbers count up too.

**A note on category names.** The category name *Adult Services* says "sexual services" to buyers, to the police and to payment companies, even when the ads are genuine massage. Rename it in Admin → Categories, for example to *Spa & Wellness*, which already exists.

---

## Part 26 — A 3D globe for the whole world, nothing internal shown to buyers, blocked words (4 Nov, evening)

**Update first:** double-click **Update AdBazaar**, then press **Ctrl+F5**.

**A moving 3D globe at the top of the home page.** A dot-drawn Earth with every continent that turns slowly; you can drag it to spin. Cities with live ads on your site glow in gold, and big world cities (London, New York, Dubai, Singapore, Tokyo…) glow softly. Lights travel in arcs between cities, and a ring orbits the globe. Next to it:
- a big heading (default *"Buy and sell anything, anywhere."*) and a short text;
- a search box, city chips, and **Post your ad** / **Browse ads**.

Change the heading and text, or switch the globe off, in Admin → **Home page → Sections & texts**. The banners now come after the categories (when the globe is off they stay at the top). On phones the globe sits above the text. It stops when it is off screen, and shows a still picture for people who turn off animations.

**Nothing internal is shown to buyers:**
- no numbers band (ads live, sellers, cities, categories) and no ad totals on the home page;
- no view counts on ad pages (only the seller sees their own);
- free ads show a coloured text card (category, title) and never the word "free";
- the city box says **All cities**, the footer text is worldwide, and the ad-page safety note says "report it to the police and to us".

The legal pages still say the site is run under Indian law, and prices are in Indian rupees, because your business and UPI payments are in India.

**Blocked words** (Admin → Settings → **Approvals → Blocked words**). A starting list of words for sexual or adult services (escort, call girl, call boy, gigolo, happy ending, body to body, adult services…) is already filled in.
- A seller **cannot post or save an ad** that uses them. They see why.
- A **category** whose name uses one (for example *Call Boy*) is **hidden from buyers and sellers**; its sub-categories too. In Admin → Categories it is marked red, with the reason.
- **Older ads** with these words, or in such a category, are hidden from buyers and marked **Hidden: blocked word** in Admin → Ads. When the seller removes the words, the ad shows again.
- Edit the list at any time (one word or phrase per line). Matching is by whole words, so "unisex salon" is not blocked by "sex".

Advertising sexual services is a crime in India (and in many other countries), and the website owner can be prosecuted too. These words protect you.
