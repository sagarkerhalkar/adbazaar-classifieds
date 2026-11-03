'use strict';
// Standard policy pages: Terms of use, Privacy, Refund & cancellation (and delivery), About, Contact & grievances, Pricing.
// The business details come from Admin → Settings → Business & legal.
// NOTE: these are general templates for an Indian online classifieds platform — have them checked by a lawyer.

const { db } = require('../db');
const { html, rupees, slugify } = require('../lib/html');
const { renderPage } = require('../views/layout');
const { icon } = require('../views/icons');
const { slotPrices } = require('../slots');

const TERMS_VERSION = '2026-11-03.3';
const EFFECTIVE = '3 November 2026';

function biz(s) {
  const name = s.legal_name || s.site_name;
  return {
    site: s.site_name, name,
    address: s.legal_address || '',
    email: s.grievance_email || s.support_email || '',
    phone: s.grievance_phone || s.support_phone || '',
    officer: s.grievance_name || '',
    city: s.jurisdiction_city || '',
    gstin: s.gstin || '',
    dataLocation: s.data_location || '',
  };
}

const layout = (title, active, body) => html`
  <div class="legal">
    <nav class="legal-nav" aria-label="Policies">
      ${[['/terms', 'Terms of use'], ['/privacy', 'Privacy policy'], ['/refund-policy', 'Refund & cancellation'], ['/pricing', 'Pricing'], ['/contact', 'Contact & grievances'], ['/about', 'About us']]
    .map(([h, l]) => html`<a href="${h}" class="${h === active ? 'active' : ''}">${l}</a>`)}
    </nav>
    <article class="card prose legal-body">
      <h1>${title}</h1>
      <p class="muted small">Effective from ${EFFECTIVE} · Version ${TERMS_VERSION}</p>
      ${body}
    </article>
  </div>`;

function grievanceBlock(b) {
  return html`<div class="grievance">
    <h3>${icon('shield', { size: 18 })} Grievance Officer</h3>
    <p>${b.officer ? html`<strong>${b.officer}</strong>, ` : ''}Grievance Officer, ${b.name}<br>
    ${b.address ? html`${b.address}<br>` : ''}
    ${b.email ? html`Email: <a href="mailto:${b.email}">${b.email}</a><br>` : ''}
    ${b.phone ? html`Phone: ${b.phone}<br>` : ''}
    Hours: Monday–Saturday, 10 AM – 6 PM (India time)</p>
    <p class="small">We acknowledge every complaint within <strong>24 hours</strong> and resolve it within <strong>15 days</strong>. If you are not satisfied with the decision, you may appeal to the Grievance Appellate Committee at <a href="https://gac.gov.in" target="_blank" rel="noopener">gac.gov.in</a> within 30 days.</p>
  </div>`;
}

function termsBody(b) {
  const court = b.city ? `the courts at ${b.city}` : 'the courts at the place of our registered office';
  return html`
  <p>These Terms of use ("Terms") are an agreement between you and <strong>${b.name}</strong> ("${b.site}", "we", "us"), the operator of this website. By using the website, registering as a seller, posting an ad or making a payment, you agree to these Terms, our <a href="/privacy">Privacy policy</a> and our <a href="/refund-policy">Refund & cancellation policy</a>. If you do not agree, please do not use the website.</p>

  <h2 id="what-we-are">1. What ${b.site} is</h2>
  <p>${b.site} is an online classifieds platform. Sellers publish ads for products and services; buyers contact sellers directly. We are an <strong>intermediary</strong> under the Information Technology Act, 2000. We do not own, sell, buy, inspect, deliver or guarantee any product or service shown in an ad, and we are <strong>not a party</strong> to any deal between a buyer and a seller. Any price, quality, delivery, payment or warranty between a buyer and a seller is solely between them.</p>

  <h2 id="advertiser-responsibility">1A. Ads are the advertiser's own responsibility</h2>
  <ul>
    <li>By visiting or using the website you accept these Terms, and you agree to check this page for changes.</li>
    <li>Every ad is written and published by the advertiser on their own initiative and under their <strong>complete and sole responsibility</strong>. Ads are <strong>not verified by us</strong>. Any check we choose to make — of a seller's ID, of a payment, or of a free ad before it is shown — is only for our own internal purposes. It is <strong>not</strong> a verification, approval, guarantee or endorsement of the seller, the ad, the product, the service or the price, and nobody may rely on it.</li>
    <li>${b.site} is <strong>not responsible</strong> for whether any ad is true, legal, safe, or respects other people's rights (for example trademarks, copyright or privacy), or for anyone being offended by an ad, in any situation.</li>
    <li>${b.site} only provides a service to <strong>publish ads and browse them</strong>. We do not take part in, arrange, guarantee or mediate any contact or deal between the person browsing, the advertiser and anyone who replies to an ad.</li>
  </ul>

  <h2 id="eligibility">2. Who can use it</h2>
  <ul>
    <li>Anyone may browse ads. To post ads you must be <strong>18 years or older</strong> and able to enter a binding contract under Indian law.</li>
    <li>Sellers must register with true, complete and current details, one valid government ID and a live photo. We may verify you (including by video call) and may approve, reject, suspend or close any account at our discretion.</li>
    <li>You are responsible for everything done with your account. Keep your password secret and tell us at once if you think someone else has used it.</li>
  </ul>

  <h2 id="ads">3. Rules for ads and content</h2>
  <p>You are fully responsible for your ads (text, photos, videos, prices, phone numbers). Your ads must be true, legal and in the right category. You must not post anything that:</p>
  <ul>
    <li>is illegal, or offers illegal goods or services (for example drugs, weapons, explosives, wildlife, counterfeit or stolen goods, prescription medicines);</li>
    <li>is obscene, pornographic or paedophilic, or invades anyone's privacy or bodily privacy;</li>
    <li>offers, hints at or arranges <strong>sexual services of any kind</strong>, escort, "companion", dating-for-money or similar services, or explicit sexual products or images. Massage and spa ads are allowed only for genuine wellness or therapy services; any massage or spa ad that suggests anything else is removed and the account is blocked;</li>
    <li>is false, misleading, a scam, a pyramid or money-circulation scheme, or relates to gambling or betting;</li>
    <li>infringes a trademark, copyright, patent or other right of anyone, or impersonates another person;</li>
    <li>is defamatory, harassing, hateful, or threatens the unity, integrity, defence, security or sovereignty of India, friendly relations with other countries or public order;</li>
    <li>contains viruses or harmful code, or violates any law in force.</li>
  </ul>
  <p>We may remove any ad, or suspend any account, that breaks these rules or the law, with or without notice, and <strong>without refund</strong>. We act on court orders and lawful government notices as required by law, and we may share the details of an account with the police or other authorities when the law requires it or when we believe a crime is involved.</p>

  <h2 id="seller-duties">3A. Licences, taxes and the law are the seller's job</h2>
  <p>You confirm that you are allowed to sell or offer what you advertise, and that you hold every licence, registration and permission it needs (for example a shop and establishment registration for a spa or salon, a trade licence, FSSAI for food, RERA for property, or a professional registration). You alone are responsible for your own taxes (including GST), invoices, warranties, consumer-law duties and the way you deliver your product or service. We do not check any of this.</p>

  <h2 id="payments">4. Fees and payments</h2>
  <ul>
    <li>Ads can be posted with a paid plan, or — when we offer it — as a free ad (see section 4E). Current prices for plans (for example 7, 15 or 29 days) and TOP time slots are shown on the <a href="/pricing">Pricing</a> page and on the payment screen. Prices include applicable taxes unless shown otherwise.</li>
    <li>Your ad goes live only after your payment is <strong>confirmed by us</strong>. Confirmation usually takes 5 minutes to 24 hours.</li>
    <li><strong>You alone are responsible for your payment.</strong> You must pay the exact total shown to the UPI ID or payment link shown on our payment screen, from your own bank or UPI account, and enter the correct transaction reference (UTR).</li>
    <li>We are <strong>not responsible</strong> for any loss caused by: a payment sent to a wrong UPI ID, account or person; a wrong amount; a wrong or reused UTR; a payment that fails, is pending, delayed, reversed or charged twice by your bank, UPI app, card issuer or payment gateway; or any person who pretends to be us. We will <strong>never</strong> ask for your OTP, UPI PIN, card PIN or password.</li>
    <li>If money leaves your account but the payment does not reach us, the refund of that money is handled by your bank, UPI app or payment gateway under their rules and the rules of the Reserve Bank of India. We cannot refund money we have not received.</li>
    <li>If we cannot find your payment in our account, we will reject it. You may then pay again. A rejected payment is not proof that we received any money.</li>
    <li>Fees are for placing and ranking your ad for the chosen period only. We do not promise any number of views, calls, leads or sales.</li>
  </ul>

  <h2 id="balance">4A. Plans, subscriptions and balance</h2>
  <ul>
    <li>Plans run for the number of days shown (for example 1, 7, 15, 29, 30 or 365 days). Monthly and yearly subscriptions are paid in advance for the whole period and may carry a discount shown at checkout. They do not renew by themselves.</li>
    <li>Ads that paid more for the current period are shown higher; ads that paid the same are shown in a changing order. TOP time slots and any manual placement by us are shown first. We may change how ads are ordered at any time.</li>
    <li>If you delete a live ad that still has paid days, the unused value is kept as <strong>balance</strong> in your account. Balance and money you add to it can only be used for ads on ${b.site}; it cannot be withdrawn as cash, transferred, or exchanged, and it carries no interest. Balance of an account that is blocked or closed for breaking these Terms may be cancelled.</li>
  </ul>

  <h2 id="complaints-block">4B. Complaints and blocking</h2>
  <p>Visitors can report an ad. When an ad receives complaints from many different people (the number is set by us), the ad may be removed and the seller's account blocked from posting further ads <strong>automatically</strong>, without notice and without refund, and we may act as required by law. A blocked seller may not open a new account with the same mobile number or ID.</p>

  <h2 id="sponsored">4C. Sponsored content</h2>
  <p>Some cards marked "Sponsored" are ads from other businesses, websites or apps. Clicking them takes you to their site; their offers, terms and privacy practices are their own responsibility.</p>

  <h2 id="fraud">4D. Fraud, cheating and disputes between users</h2>
  <ul>
    <li>${b.site} is <strong>not responsible</strong> for any fraud, cheating, scam, fake or faulty product or service, non-delivery, advance-payment fraud, theft, loss, injury or other harm caused by any advertiser, seller, buyer, visitor or anyone else who uses the website — whether or not the person was verified, and whether the ad was free or paid.</li>
    <li>All dealings between users (calls, chats, meetings, payments, delivery) are <strong>entirely at the users' own risk</strong> and are solely between them. We do not collect, hold or release money for any deal between users, and we do not offer any refund, guarantee or compensation for such deals.</li>
    <li>If you are cheated, report it to the police or at <a href="https://cybercrime.gov.in" target="_blank" rel="noopener">cybercrime.gov.in</a> (helpline <strong>1930</strong>), and report the ad to us so that we can remove it. We help the authorities as the law requires.</li>
  </ul>

  <h2 id="free-ads">4E. Free ads</h2>
  <p>When we offer free ads, they run for a limited number of days, are shown <strong>after all paid ads</strong> in a changing order, and are not shown in TOP. We do not promise any place, views or calls for a free ad. We may limit the number of free ads per seller, check them before they are shown, refuse them, or stop offering free ads at any time, without giving a reason. These Terms apply to free ads in full.</p>

  <h2 id="refunds">5. Refunds and cancellation</h2>
  <p>Ad fees are <strong>non-refundable once your ad is live</strong>, including if you delete or deactivate the ad, or if we remove it for breaking these Terms. Exceptions are described in our <a href="/refund-policy">Refund & cancellation policy</a>.</p>

  <h2 id="buyers">6. For buyers</h2>
  <p>Deal directly with sellers at your own risk. Check the product or service before paying, meet in a safe public place, and never pay in advance to someone you do not know. We do not guarantee any seller, ad, product or service, even when the seller is verified.</p>

  <h2 id="disclaimer">7. No warranty</h2>
  <p>The website is provided "as is" and "as available". We do not promise that it will always be available, error-free or secure, or that any ad is accurate. We may change, pause or stop any part of the website at any time.</p>

  <h2 id="liability">8. Limitation of liability</h2>
  <p>To the maximum extent allowed by law, ${b.name}, its owners, staff and partners are <strong>not liable</strong> for any loss — direct, indirect, incidental, special or consequential, including loss of money, profit, business, data or goodwill — arising from your use of the website, any ad, any free ad, any deal or dispute between users, any fraud by another user, or any payment problem described in section 4. Where we are held liable for anything despite this, our total liability is limited to the fees you actually paid us for the ad concerned in the three months before the claim (zero for a free ad).</p>

  <h2 id="indemnity">9. Indemnity</h2>
  <p>You agree to indemnify and hold harmless ${b.name}, its owners and staff against any claim, loss, penalty or cost (including reasonable legal fees) arising from your ads, your dealings with other users, your payments, your breach of these Terms or your breach of any law or third-party right.</p>

  <h2 id="ip">10. Content licence and intellectual property</h2>
  <p>You keep ownership of your content but give us a free, non-exclusive licence to host, show, resize and promote it on the website while your ad runs. The ${b.site} name, logo and website design belong to us.</p>

  <h2 id="termination">11. Our right to block, remove or delete</h2>
  <p>You may deactivate or ask us to delete your account at any time.</p>
  <p>We have <strong>full authority</strong>, at our sole discretion, at any time and without having to give a reason or prior notice, to: refuse, hide, move, edit the category of, block or delete any ad; refuse any registration; and suspend, block or delete any account of any user. We do this in particular for breaking these Terms or the law, false details, complaints, suspected fraud or misuse, or to protect other users or ${b.site}. In such cases fees already paid are <strong>not refunded</strong>, no compensation is due, and the balance of an account blocked or deleted for breaking these Terms may be cancelled. You can ask us to review a decision through our Grievance Officer (section 12).</p>

  <h2 id="records">11A. Our records, and who can speak for us</h2>
  <ul>
    <li>Our system records (payments, UTR numbers, ad history, messages, logins and staff actions) are treated as correct unless you show otherwise.</li>
    <li>Please tell us about any payment problem within <strong>7 days</strong>; after that a payment may be impossible to trace.</li>
    <li>No staff member, payment checker or partner can change these Terms or make any promise, discount or guarantee on our behalf, except in writing from the owner of ${b.site}.</li>
  </ul>

  <h2 id="grievance">12. Complaints and Grievance Officer</h2>
  <p>To report an ad, use "Report this ad" on the ad page. For any other complaint, contact our Grievance Officer:</p>
  ${grievanceBlock(b)}

  <h2 id="law">13. Governing law and disputes</h2>
  <p>These Terms are governed by the laws of India. We will first try to settle any dispute with you amicably within 30 days. If that fails, the dispute will be referred to a sole arbitrator appointed by both sides together (or, if we cannot agree, as provided in the Arbitration and Conciliation Act, 1996); the seat of arbitration will be ${b.city || 'the city of our registered office'} and the language English. Subject to that, ${court} have exclusive jurisdiction. Nothing in these Terms takes away any right you have under the Consumer Protection Act, 2019 or any other law that cannot be excluded by agreement.</p>

  <h2 id="general">13A. General</h2>
  <ul>
    <li><strong>No partnership.</strong> Using the website does not make you our partner, agent, employee or franchisee, and you may not say or suggest that we endorse you.</li>
    <li><strong>Events outside our control.</strong> We are not responsible for delays or failures caused by events outside our reasonable control, such as outages of the internet, banks, UPI or hosting, power failures, cyber-attacks, government orders, strikes or natural disasters.</li>
    <li><strong>If one part is invalid,</strong> the rest of these Terms still applies, and the invalid part is read as closely to its purpose as the law allows.</li>
    <li><strong>No waiver.</strong> If we do not act on a breach at once, we can still act on it later.</li>
    <li><strong>Transfer.</strong> We may transfer this agreement to a new owner or operator of the website (including under a new name); you may not transfer your account.</li>
    <li><strong>Whole agreement and language.</strong> These Terms, the Privacy policy and the Refund policy are the whole agreement between you and us about the website. If a translation differs, the English version applies.</li>
  </ul>

  <h2 id="changes">14. Changes</h2>
  <p>We may update these Terms. The new version is posted on this page with a new effective date. Continuing to use the website after that means you accept the changes.</p>

  <h2 id="contact">15. Contact</h2>
  <p>${b.name}${b.address ? html`, ${b.address}` : ''}${b.email ? html` · <a href="mailto:${b.email}">${b.email}</a>` : ''}${b.phone ? html` · ${b.phone}` : ''}</p>`;
}

function privacyBody(b) {
  return html`
  <p>This policy explains how <strong>${b.name}</strong> ("${b.site}", "we") collects and uses personal data, in line with the Digital Personal Data Protection Act, 2023, its Rules, and the Information Technology Act, 2000.</p>

  <h2>1. What we collect</h2>
  <ul>
    <li><strong>Visitors and buyers:</strong> no account is needed. We keep basic technical data (IP address, browser, pages visited) for security and to stop misuse. If you report an ad, we keep the report and your IP address. Ads you save with ♡ are stored only in your own browser.</li>
    <li><strong>Sellers:</strong> name, business name (optional), mobile number, email, password (stored only as a secure hash), date of birth, one ID document (type, number and photo — for Aadhaar we keep only the last 4 digits of the number), a live photo, photos taken during a verification video call, address (optional), your ads, and your payment details (amount, UTR or payment ID, screenshot if you upload one).</li>
    <li><strong>Cookies:</strong> one essential cookie keeps you logged in and protects forms. We do not use advertising cookies.</li>
  </ul>

  <h2>2. Why we use it</h2>
  <ul>
    <li>To verify that sellers are real adults (KYC) and to prevent fraud;</li>
    <li>to run your account, publish and rank your ads, and confirm payments;</li>
    <li>to send you one-time codes, account messages, receipts and important notices by email, SMS or inside your account;</li>
    <li>to keep accounting and tax records, handle complaints, and meet legal duties (for example court or government orders).</li>
  </ul>
  <p>We process seller data on the basis of your consent, which you give when you register, and for legal duties. You can withdraw consent at any time by deleting your account; we then stop processing, except what the law requires us to keep.</p>

  <h2>3. What is public</h2>
  <p>Your ad content, the business or seller name shown on the ad, the city and the contact number you enter on the ad are public. <strong>Your ID document, ID number, date of birth, live photo and address are never shown publicly.</strong></p>

  <h2>4. Who we share it with</h2>
  <p>We do <strong>not sell</strong> personal data. We share only what is needed with service providers who work for us: email and SMS providers (to send codes and messages), the payment gateway (for online payments) and our hosting/network provider. We disclose data to government or law-enforcement agencies only when the law requires it.</p>
  <p><strong>Where data is stored:</strong> ${b.dataLocation ? html`on servers in ${b.dataLocation}` : 'on servers chosen by us, which may be in India or abroad'}. Wherever it is stored, we protect it as described here and follow Indian law on transfers of personal data outside India.</p>

  <h2>5. How long we keep it</h2>
  <p>We keep your data while your account is active. When you delete your account, or we delete it, we erase your ID documents, photos, videos and personal details. We keep payment records (amount, date, reference) in anonymised form for as long as tax and accounting laws require.</p>

  <h2>6. Security</h2>
  <p>We use reasonable security safeguards: HTTPS, hashed passwords, access only for authorised staff, private storage for ID documents and regular backups. If a personal data breach happens, we will inform affected users and the Data Protection Board of India as the law requires.</p>

  <h2>7. Your rights</h2>
  <p>You can ask to access a summary of your data, correct or update it, erase it, withdraw consent, and nominate a person to exercise your rights. Most details can be changed in your account; for anything else, write to our Grievance Officer. We respond within the time limits set by law. If you are not satisfied, you may complain to the Data Protection Board of India.</p>

  <h2>8. Children</h2>
  <p>Seller accounts are only for people aged 18 or older. We do not knowingly collect personal data of children.</p>

  <h2>9. Contact and grievances</h2>
  ${grievanceBlock(b)}

  <h2>10. Changes</h2>
  <p>We may update this policy. The new version is posted here with a new effective date.</p>`;
}

function refundBody(b) {
  return html`
  <h2>1. What you pay for</h2>
  <p>You pay ${b.site} to place your ad on the website for the plan period you choose (and, if chosen, to show it in TOP time slots). This is a digital service; nothing is shipped.</p>

  <h2 id="delivery">2. Delivery of the service</h2>
  <p>Your ad goes live on the website as soon as your payment is confirmed — usually within 5 minutes to 24 hours. You get a message in your account and an email, and you can download a receipt from <em>My payments</em>. The paid period starts when the ad goes live.</p>

  <h2>3. Cancellation</h2>
  <p>You can delete or deactivate your ad at any time. Deactivating saves the remaining paid days so you can reactivate later; deleting ends the ad. Neither gives a refund.</p>

  <h2>4. Refunds</h2>
  <p>Ad fees are <strong>non-refundable once the ad is live</strong>. We refund only in these cases, after checking our bank statement:</p>
  <ul>
    <li>the <strong>same payment reached our account twice</strong>; or</li>
    <li>your payment reached our account but we <strong>could not publish your ad because of a technical fault on our side</strong>; or</li>
    <li>we rejected your registration or ad <strong>before</strong> it went live, after your payment had reached our account.</li>
  </ul>
  <p>Write to us within 7 days with your receipt number or UTR. Approved refunds are sent to the original payment method within 7–10 working days.</p>
  <p><strong>No refund</strong> is given for ads removed for breaking our <a href="/terms">Terms of use</a>, for a lack of calls or sales, or for payments that never reached our account (see section 5).</p>

  <h2>5. Failed or wrong payments</h2>
  <p>If a payment fails, is pending or is charged but does not reach us, it is handled by your bank, UPI app or payment gateway, which normally returns the money automatically. Payments sent to a wrong UPI ID or a wrong amount, or submitted with a wrong UTR, are the payer's responsibility. See section 4 of our <a href="/terms#payments">Terms of use</a>.</p>

  <h2>6. Contact</h2>
  ${grievanceBlock(b)}`;
}

function register(app) {
  const page = (req, title, active, body, description) => renderPage(req, { title, body: layout(title, active, body), description });

  app.get('/terms', (req, res) => res.html(page(req, 'Terms of use', '/terms', termsBody(biz(req.settings)))));
  app.get('/privacy', (req, res) => res.html(page(req, 'Privacy policy', '/privacy', privacyBody(biz(req.settings)))));
  app.get('/refund-policy', (req, res) => res.html(page(req, 'Refund & cancellation policy', '/refund-policy', refundBody(biz(req.settings)))));
  app.get('/shipping-policy', (req, res) => res.redirect('/refund-policy#delivery'));

  app.get('/about', (req, res) => {
    const b = biz(req.settings);
    res.html(page(req, `About ${b.site}`, '/about', html`
      <p><strong>${b.site}</strong> is an Indian online classifieds marketplace operated by <strong>${b.name}</strong>${b.address ? html`, ${b.address}` : ''}. People browse ads for free and contact sellers directly — no sign-up needed.</p>
      <p>Every seller is checked before they can post: we confirm their email (and mobile), their age (18+) with one government ID, and a live photo. Sellers pay a small fee to show an ad for 7, 15 or 29 days, and can choose TOP time slots to be seen first.</p>
      <p>We do not sell products ourselves and are not a party to deals between buyers and sellers. Read our <a href="/terms">Terms of use</a> and <a href="/safety">Safety tips</a>.</p>
      ${b.gstin ? html`<p class="small muted">GSTIN: ${b.gstin}</p>` : ''}`));
  });

  app.get('/contact', (req, res) => {
    const b = biz(req.settings);
    res.html(page(req, 'Contact & grievances', '/contact', html`
      <div class="contact-cards">
        ${b.email ? html`<a class="contact-card" href="mailto:${b.email}">${icon('mail', { size: 22 })}<strong>Email</strong><span>${b.email}</span></a>` : ''}
        ${b.phone ? html`<a class="contact-card" href="tel:${b.phone.replace(/\s/g, '')}">${icon('phone', { size: 22 })}<strong>Phone</strong><span>${b.phone}</span></a>` : ''}
        ${b.address ? html`<div class="contact-card">${icon('pin', { size: 22 })}<strong>Address</strong><span>${b.address}</span></div>` : ''}
      </div>
      <p>Business name: <strong>${b.name}</strong>${b.gstin ? html` · GSTIN ${b.gstin}` : ''}</p>
      <p>To report a wrong or suspicious ad, open the ad and use <em>Report this ad</em> in the Safety tab.</p>
      ${grievanceBlock(b)}`));
  });

  // For Google / Bing: what to index, and a list of every live ad.
  app.get('/robots.txt', (req, res) => {
    res.send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /client\nDisallow: /kyc\nDisallow: /media/kyc\nSitemap: ${req.origin}/sitemap.xml\n`);
  });
  app.get('/sitemap.xml', (req, res) => {
    const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const ads = db.prepare("SELECT id, title, updated_at FROM ads WHERE status = 'active' AND expires_at > ? AND client_id IN (SELECT id FROM clients WHERE status = 'approved') ORDER BY id DESC LIMIT 5000").all(Date.now());
    const cats = db.prepare('SELECT slug FROM categories WHERE is_active = 1').all();
    const urls = ['/', '/pricing', '/about', '/contact', '/terms', '/privacy', '/refund-policy', ...cats.map((c) => `/?cat=${encodeURIComponent(c.slug)}`)]
      .map((u) => `<url><loc>${esc(req.origin + u)}</loc></url>`)
      .concat(ads.map((a) => `<url><loc>${esc(`${req.origin}/ad/${a.id}-${slugify(a.title)}`)}</loc><lastmod>${new Date(a.updated_at).toISOString().slice(0, 10)}</lastmod></url>`));
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`, 'application/xml; charset=utf-8');
  });

  app.get('/pricing', (req, res) => {
    const plans = db.prepare('SELECT * FROM plans WHERE is_active = 1 ORDER BY days').all();
    const slots = slotPrices().filter((sl) => sl.is_active);
    res.html(page(req, 'Pricing', '/pricing', html`
      <p>Browsing and contacting sellers is free. Sellers pay only to show an ad. Prices are in Indian Rupees and include applicable taxes.</p>
      <h2>Ad plans</h2>
      <div class="plans">${plans.map((p) => html`<div class="plan-box"><span class="plan-days">${p.days} days</span><span class="plan-name">${p.name}</span><span class="plan-price">${rupees(p.price_paise)}</span><span class="muted small">${rupees(Math.round(p.price_paise / p.days))}/day · ranking level ${p.priority}</span></div>`)}</div>
      ${slots.length ? html`<h2>★ TOP time slots (optional)</h2><p>Show your ad at the very top during the 3-hour slots you choose (India time). Price per slot per day, for every day of your plan.</p>
      <div class="slots">${slots.map((sl) => html`<div class="slot"><span><b>${sl.label}</b><small>${rupees(sl.price_per_day_paise)}/day</small></span></div>`)}</div>` : ''}
      <p class="small muted">Fees are non-refundable once an ad is live — see the <a href="/refund-policy">Refund policy</a>.</p>`));
  });
}

module.exports = { register, TERMS_VERSION };
