# Every requirement, and where it is in the app

Built from every request in [CONVERSATION.md](CONVERSATION.md), 2–4 Nov 2026. Each line was tested in the running app with the automatic browser tests (phone, tablet, laptop, Mac and big-screen sizes).

**Status:** ✅ done · 🔁 done, changed by a later request · ⛔ not built (reason given)

## Sellers: joining and verification

| # | Requirement | Status | Where |
|---|---|---|---|
| 1 | Two portals: sellers post ads; the owner adds and verifies sellers | ✅ | `/client`, `/admin` |
| 2 | Buyers browse without logging in | ✅ | Home, search, ad pages |
| 3 | Verification with an ID and a live photo; the address is optional | 🔁 | Register → 4 steps |
| 4 | One ID of the seller's choice: Aadhaar, PAN or Passport | ✅ | Register → Your ID |
| 5 | Aadhaar: front and back. Passport: first and last page. PAN: front only | ✅ | Register → Your ID (the form asks for the right sides) |
| 6 | The live photo is taken by the camera; a video call is available | ✅ | Register → Live photo; Admin → Client → Video call now |
| 7 | Sellers log in only after verification | ✅ | Login is blocked until approved |
| 8 | Auto-approve after the email code if the admin does nothing (1 minute), with an email to both | 🔁 | Settings → Approvals |
| 9 | Sellers see "Login check takes about 1 minute" and "Payment confirmation 5 minutes to 24 hours" | ✅ | Register, payment page |
| 10 | Email code (OTP) once, free; SMS optional | ✅ | Settings → Email & SMS |
| 11 | Email and mobile compulsory | ✅ | Register |
| 12 | 18+ only | ✅ | Date of birth checked at registration and before posting |
| 13 | Password of 6 characters or more | ✅ | Everywhere |
| 14 | Registration with the same mobile number or ID as a blocked seller is refused | ✅ | Register |

## Ads and payments

| # | Requirement | Status | Where |
|---|---|---|---|
| 15 | Only the owner or staff confirm payments; never automatic | ✅ | Admin → Payments |
| 16 | Plans: 1, 7, 15 and 29 days, monthly and yearly, with a discount the admin sets (20%) | ✅ | Settings → Plans |
| 17 | TOP by 3-hour time slots (8 a day), priced by the admin | ✅ | Settings → TOP slots |
| 18 | Ranking: TOP → admin boost → money paid (more = higher); equal payments shuffled on every visit | ✅ | Home, search |
| 19 | The ad ends when the paid time ends | ✅ | Automatic |
| 20 | 5 photos and 2 videos (1 minute each), changeable at any time, including after payment; make cover, move, replace, delete | ✅ | My ads → Edit → Photos |
| 21 | An oversized or wrong file is flagged the moment it is chosen; big photos are shrunk by themselves | ✅ | Every upload box |
| 22 | Free ads: shown after all paid ads, in random order, never in TOP, with no approval needed; **text only** (no photos or videos for buyers) | 🔁 | Payment page → Free or paid?; Settings → Approvals |
| 23 | Deleting a paid ad keeps the unused days as balance; the new-ad form shows the balance | ✅ | My ads, Balance |
| 24 | Sellers can add money for later | ✅ | Balance → Add money (the admin confirms) |
| 25 | Messages to the seller: payment confirmed (with receipt), rejected, failed; ad ended or removed | ✅ | Seller → Messages (bell) |
| 26 | A payment that fails after confirmation → the admin moves the ad to unpaid; after paying again it is live and ranked | ✅ | Payments → Paid → More → Payment failed; Ads → More → Move to unpaid |
| 27 | The admin puts any ad in TOP for some days or until a date, in chosen slots | ✅ | Ads → Boost & TOP |
| 28 | Complaints from 500 different people block the seller from posting | ✅ | Settings → Approvals (number changeable) |
| 29 | "Post ad" asks: new or existing seller (quick login) | ✅ | `/post` |

## Owner, staff and admin

| # | Requirement | Status | Where |
|---|---|---|---|
| 30 | Main categories → sub-categories; add, rename, hide, delete (defaults too) | ✅ | Admin → Categories |
| 31 | Deactivate, block and delete for sellers and ads; sellers can deactivate themselves | ✅ | Clients, Ads, seller Account |
| 32 | Home page like OLX / Skokka, changeable by the owner | ✅ | Admin → Home page |
| 33 | Video call any seller from the admin portal | ✅ | Client → Video call now |
| 34 | Custom roles (owner ticks what each role may do) | ✅ | Settings → Staff & brand → Roles |
| 35 | A payment-only login without money totals | ✅ | Role "Payment checker" |
| 36 | Only the owner changes the site name (plus logo and colours) | ✅ | Settings → Staff & brand → Brand |
| 37 | Live updates on admin and seller pages, with sound | ✅ | All portals (every 10–15 s) |
| 38 | Payment alerts by WhatsApp (personal or Business), Telegram, email and Google Chat | ✅ | Settings → Alerts |
| 39 | Reports: money received, rejected sellers and payments, ad status, how to boost, CSV | ✅ | Admin → Reports |
| 40 | Third-party websites and apps can run ads between listings or lower on the page | ✅ | Admin → Sponsors; `/advertise` |
| 41a | Live updates without reloading the page; nothing runs while the tab is in the background | ✅ | Admin and seller lists |
| 41 | Every admin list fits the screen (phone, tablet, laptop, Mac, zoomed browser) | ✅ | All lists; rows become cards on small screens |

## Buyers and the look

| # | Requirement | Status | Where |
|---|---|---|---|
| 42 | International-level design, smooth, short pages, animation and 3D (TOP carousel, tilting tiles, scroll reveal), compact footer | ✅ | Whole site |
| 42a | Uploaded photos show in full on the ad page (arrows, swipe, full-size view) | ✅ | Ad page |
| 43 | Real photos (people, phones, laptops), not cartoons | ✅ | Banners, category tiles, test ads |
| 44 | Government ID never shown to buyers | ✅ | — |
| 45 | Search by any word: parts of words, typing mistakes, Hinglish, categories, cities; suggestions while typing | ✅ | Search box |
| 46 | Under each ad: ads from the same area or city first, TOP → paid → free | ✅ | Ad page |
| 47 | Categories for normal products and services, including massage/spa (wellness) and toys | ✅ | Spa & Wellness, Toys & Kids |
| 48 | Adult or sexual services | ⛔ | Not built: advertising them is a crime in India (Immoral Traffic (Prevention) Act, IT Act) and the site owner is liable too. The Terms forbid them, and such ads are removed. |

## Legal and running the site

| # | Requirement | Status | Where |
|---|---|---|---|
| 49 | Skokka-style Terms: acceptance by use, the advertiser is solely responsible, no prior check, no mediation | ✅ | `/terms` |
| 50 | No responsibility for payment problems, or fraud by sellers or buyers; full authority to block or delete | ✅ | `/terms` sections 4, 4D, 8, 9, 11 |
| 51 | Privacy, refund, contact and grievance pages (IT Rules 2021) | ✅ | `/privacy`, `/refund-policy`, `/contact` |
| 52 | Runs on my PC, my Wi-Fi and my domain (Cloudflare), with a fixed port and auto-start | ✅ | GUIDE Parts 3–10 |
| 53 | One install command, one update icon; never uninstalls Node.js or cloudflared | ✅ | GUIDE top, Part 14 |
| 54 | Remove from one computer, move to another laptop, keep the same subdomain | ✅ | GUIDE Part 14 |
| 55 | Hosting in Switzerland, run from India | ✅ | GUIDE Part 20 |
| 56 | How to open to the public in India | ✅ | GUIDE Part 21 |
| 57 | Everything saved on GitHub, with this conversation history | ✅ | `docs/CONVERSATION.md` |
