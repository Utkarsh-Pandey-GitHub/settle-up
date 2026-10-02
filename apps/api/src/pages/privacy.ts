/**
 * Public privacy policy page served at GET /privacy.
 * Designed to satisfy Google Play Store listing requirements:
 * - Publicly accessible HTML (not PDF)
 * - No login or geo-restrictions
 * - Covers all data collection, use, sharing, and permissions
 */
export function privacyPage(): string {
  const updated = "2 October 2026";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Privacy Policy — SettleUp</title>
<meta name="description" content="SettleUp privacy policy. Learn how SettleUp collects, uses, and protects your data.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#FAF9FC;--surface:#FFFFFF;--border:#EEEDF2;--text:#1C1922;--muted:#6B6578;--accent:#7C5CFC;--accent-soft:#F0ECFF;--radius:20px;--shadow:0 8px 40px rgba(28,25,34,.06)}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);line-height:1.7;font-size:16px;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}

.hero{background:linear-gradient(135deg,#7C5CFC 0%,#A78BFA 50%,#C4B5FD 100%);padding:60px 24px 48px;text-align:center;position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 30% 20%,rgba(255,255,255,.15) 0%,transparent 60%)}
.hero h1{font-size:clamp(28px,5vw,42px);font-weight:700;color:#fff;margin-bottom:8px;position:relative}
.hero .sub{color:rgba(255,255,255,.85);font-size:15px;font-weight:400;position:relative}
.badge{display:inline-block;background:rgba(255,255,255,.2);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.25);border-radius:100px;padding:6px 16px;font-size:13px;font-weight:500;color:#fff;margin-bottom:20px;position:relative}

main{max-width:720px;margin:-32px auto 60px;padding:0 16px;position:relative;z-index:1}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:clamp(24px,5vw,40px);box-shadow:var(--shadow);margin-bottom:24px}
.card+.card{margin-top:0}

h2{font-size:20px;font-weight:700;margin:32px 0 12px;color:var(--text);display:flex;align-items:center;gap:10px}
h2:first-child{margin-top:0}
h2 .icon{width:28px;height:28px;border-radius:10px;background:var(--accent-soft);display:inline-grid;place-items:center;font-size:15px;flex-shrink:0}
h3{font-size:16px;font-weight:600;margin:20px 0 8px}
p,ul{margin-bottom:14px}
ul{padding-left:20px}
li{margin-bottom:6px}
li::marker{color:var(--accent)}

.highlight{background:var(--accent-soft);border-radius:12px;padding:16px 20px;margin:16px 0;border-left:3px solid var(--accent)}
.highlight p{margin:0;font-size:15px}

.toc{list-style:none;padding:0;display:grid;gap:6px}
.toc li{display:flex;align-items:center;gap:8px}
.toc li::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--accent);flex-shrink:0}
.toc a{font-weight:500;font-size:15px}

footer{text-align:center;padding:32px 24px 48px;color:var(--muted);font-size:14px}
footer a{color:var(--accent);font-weight:500}

@media(prefers-color-scheme:dark){
:root{--bg:#121016;--surface:#1C1922;--border:#2A2735;--text:#F0EDF5;--muted:#9B93A8;--accent:#A78BFA;--accent-soft:rgba(124,92,252,.15);--shadow:0 8px 40px rgba(0,0,0,.3)}
.hero{background:linear-gradient(135deg,#4C2EA6 0%,#7C5CFC 50%,#A78BFA 100%)}
}
</style>
</head>
<body>

<div class="hero">
  <div class="badge">Last updated: ${updated}</div>
  <h1>Privacy Policy</h1>
  <p class="sub">SettleUp — Expense Splitting &amp; Shared Ledger App</p>
</div>

<main>
<nav class="card">
  <ul class="toc">
    <li><a href="#overview">Overview</a></li>
    <li><a href="#data-collected">Information We Collect</a></li>
    <li><a href="#how-used">How We Use Your Information</a></li>
    <li><a href="#permissions">Device Permissions</a></li>
    <li><a href="#sms">Bank SMS Review (Android)</a></li>
    <li><a href="#bill-scan">Bill Scanning</a></li>
    <li><a href="#sharing">How Information Is Shared</a></li>
    <li><a href="#storage">Data Storage &amp; Security</a></li>
    <li><a href="#retention">Data Retention &amp; Deletion</a></li>
    <li><a href="#third-party">Third-Party Services</a></li>
    <li><a href="#children">Children's Privacy</a></li>
    <li><a href="#changes">Changes to This Policy</a></li>
    <li><a href="#contact">Contact Us</a></li>
  </ul>
</nav>

<div class="card">

<h2 id="overview"><span class="icon">📋</span> Overview</h2>
<p>SettleUp ("we", "our", or "the app") is a personal finance tool that helps you record shared expenses, track debts, settle balances with friends, and set savings goals. SettleUp does <strong>not</strong> connect to your bank account, hold funds, or process payments directly. This policy explains what information SettleUp collects, how it is used, and what choices you have.</p>

<div class="highlight">
<p><strong>Key principle:</strong> SettleUp is designed to minimise data collection. We collect only what is necessary to provide the service. We do not sell your personal data. We do not include advertising SDKs or third-party behavioural analytics.</p>
</div>

<h2 id="data-collected"><span class="icon">📦</span> Information We Collect</h2>

<h3>Information you provide</h3>
<ul>
  <li><strong>Phone number</strong> — used for account verification via one-time password (OTP) or Truecaller verification. This is your primary identity.</li>
  <li><strong>Profile information</strong> — optional name, email address, avatar, preferred currency, and timezone.</li>
  <li><strong>Financial entries</strong> — expenses, splits, repayments, goals, tags, and notes you choose to create and save.</li>
  <li><strong>Selected contacts</strong> — phone numbers of people you explicitly choose to split with. We do <strong>not</strong> upload your entire address book.</li>
  <li><strong>UPI ID</strong> — optionally provided when creating payment request links.</li>
  <li><strong>Notification preferences</strong> — your choices about push notification delivery.</li>
</ul>

<h3>Information collected automatically</h3>
<ul>
  <li><strong>Session tokens</strong> — generated at sign-in to authenticate API requests. On native devices, tokens are stored in OS-level secure storage (Keychain / Android Keystore). In the browser, tokens are kept only in memory for the duration of the page session.</li>
  <li><strong>Shared-link access events</strong> — when someone accesses a shared analytics link, we record whether access was allowed and the timestamp. We do <strong>not</strong> store visitor IP addresses in this log.</li>
</ul>

<h3>Information we do NOT collect</h3>
<ul>
  <li>Bank account or card details</li>
  <li>Precise location or GPS data</li>
  <li>Device identifiers or advertising IDs</li>
  <li>Browsing history</li>
  <li>Email inbox contents</li>
  <li>Full contact list (only contacts you explicitly select)</li>
</ul>

<h2 id="how-used"><span class="icon">⚙️</span> How We Use Your Information</h2>
<ul>
  <li><strong>Authentication</strong> — verify your phone number to secure your account.</li>
  <li><strong>Core functionality</strong> — create and manage expenses, splits, repayments, obligations, goals, and analytics.</li>
  <li><strong>Group ledgers</strong> — show shared financial records to members of the same ledger group.</li>
  <li><strong>Payment links</strong> — generate shareable UPI payment request links containing your provided payee name and amount.</li>
  <li><strong>Notifications</strong> — send push notifications about activity in your ledgers, if you opt in.</li>
  <li><strong>Analytics snapshots</strong> — generate spending analytics you can optionally share via time-limited links.</li>
</ul>

<h2 id="permissions"><span class="icon">🔐</span> Device Permissions</h2>
<p>SettleUp requests device permissions only when you initiate a specific feature. Each permission can be declined — the app continues to function with manual alternatives.</p>
<ul>
  <li><strong>Camera</strong> — requested when you choose to scan a UPI QR code or capture a bill photo. Images captured for bill scanning are <strong>not</strong> stored.</li>
  <li><strong>Photo library</strong> — requested when you choose to select a bill photo for item extraction.</li>
  <li><strong>Contacts</strong> — requested when you choose to pick a contact for splitting. Only the selected contact's phone number is used. Manual phone number entry is always available.</li>
  <li><strong>Notifications</strong> — requested from Settings. Entirely optional.</li>
  <li><strong>SMS (Android only)</strong> — see the dedicated section below.</li>
</ul>

<h2 id="sms"><span class="icon">💬</span> Bank SMS Review (Android Only)</h2>
<div class="highlight">
<p><strong>Raw SMS messages never leave your device.</strong> All parsing and matching happen entirely on-device.</p>
</div>
<p>When you explicitly enable SMS review in Settings, the app reads a bounded set of recent SMS messages on your device to identify bank transaction notifications (debits and credits). OTPs, promotional messages, failures, and reversals are filtered out on-device.</p>
<ul>
  <li>You review each suggested transaction individually — accept, edit, or reject.</li>
  <li>Only the structured data you approve (amount, title, date) is saved to your ledger.</li>
  <li>On-device fingerprints (salted hashes) remember which messages you've already reviewed, expiring after seven days.</li>
  <li>The SMS inbox is not accessible on iOS or in the browser.</li>
  <li>SMS permission is requested only after an on-screen explanation and your explicit tap.</li>
</ul>

<h2 id="bill-scan"><span class="icon">📸</span> Bill Scanning</h2>
<p>When you choose to scan or photograph a bill, the image is sent to the SettleUp API, which forwards it to a configured AI vision model for one-time itemisation. The extracted items, taxes, discounts, and total are returned for your review and editing.</p>
<ul>
  <li>SettleUp does <strong>not</strong> store, attach, or retain the bill image in its database or storage.</li>
  <li>The configured AI model provider may process the image under its own terms. The current provider is specified in app settings.</li>
</ul>

<h2 id="sharing"><span class="icon">🤝</span> How Information Is Shared</h2>

<h3>With other SettleUp users</h3>
<p>Active members of a shared ledger can see the ledger's shared records (expenses, splits, repayments). Your unrelated personal entries are <strong>not</strong> visible to them.</p>

<h3>Via shared links</h3>
<ul>
  <li><strong>Public analytics links</strong> — contain a frozen snapshot of only the scope you chose. Anyone with the link token can view it.</li>
  <li><strong>Private analytics links</strong> — require the recipient to verify their phone number matches the intended recipient.</li>
  <li>All shared links expire automatically and can be revoked by you at any time. Downloaded copies or screenshots cannot be remotely erased.</li>
</ul>

<h3>With third parties</h3>
<ul>
  <li><strong>AI vision model provider</strong> — receives bill images (only when you use bill scanning). No other personal data is sent.</li>
  <li><strong>Truecaller</strong> — if you choose Truecaller verification, your verification proof is sent to Truecaller's API. This is entirely optional; OTP verification is always available.</li>
  <li><strong>Infrastructure providers</strong> — our hosting and database providers process data under standard data processing agreements. They do not have independent rights to use your data.</li>
</ul>

<div class="highlight">
<p><strong>We do not sell, rent, or trade your personal information.</strong> No advertising network, analytics SDK, or data broker receives your data.</p>
</div>

<h2 id="storage"><span class="icon">🛡️</span> Data Storage &amp; Security</h2>
<ul>
  <li>Server data is stored in PostgreSQL with encryption at rest and TLS in transit.</li>
  <li>Passwords are not used — authentication is via expiring OTP challenges with rate and attempt limits.</li>
  <li>JWT access tokens use short expiry with refresh rotation and replay revocation.</li>
  <li>On-device tokens use OS secure storage (Keychain / Android Keystore).</li>
  <li>API logging redacts authorization headers, request bodies, and share tokens.</li>
  <li>Application access is protected by role-based authorization and database-level isolation between accounts.</li>
</ul>

<h2 id="retention"><span class="icon">🗑️</span> Data Retention &amp; Deletion</h2>
<ul>
  <li><strong>Export</strong> — you can export your accessible data from Settings at any time.</li>
  <li><strong>Account deletion</strong> — deleting your account revokes all sessions and shared links, removes your phone identity, profile details, import records, and notification preferences.</li>
  <li><strong>Shared records</strong> — shared financial and audit entries are retained under an anonymised account so other participants do not lose their ledger history.</li>
  <li><strong>SMS fingerprints</strong> — device-local fingerprints expire and are purged after seven days. Server-side fingerprints are cleaned by a scheduled background worker.</li>
  <li><strong>Shared links</strong> — expire automatically per their configured duration and can be revoked early.</li>
  <li><strong>Unresolved obligations</strong> — must be settled or reversed before account deletion, to protect other users' records.</li>
</ul>

<h2 id="third-party"><span class="icon">🔗</span> Third-Party Services</h2>
<p>SettleUp may integrate with the following third-party services. Each operates under its own privacy policy:</p>
<ul>
  <li><strong>Truecaller</strong> (optional phone verification) — <a href="https://www.truecaller.com/privacy-policy" target="_blank" rel="noopener">Truecaller Privacy Policy</a></li>
  <li><strong>Expo / EAS Update</strong> (over-the-air updates) — <a href="https://expo.dev/privacy" target="_blank" rel="noopener">Expo Privacy Policy</a></li>
</ul>

<h2 id="children"><span class="icon">👶</span> Children's Privacy</h2>
<p>SettleUp is not directed at children under 13. We do not knowingly collect personal information from children. If you believe a child has provided us with personal data, please contact us and we will promptly delete it.</p>

<h2 id="changes"><span class="icon">📝</span> Changes to This Policy</h2>
<p>We may update this privacy policy from time to time. Changes will be reflected on this page with an updated date. Continued use of the app after changes constitutes acceptance of the revised policy.</p>

<h2 id="contact"><span class="icon">✉️</span> Contact Us</h2>
<p>If you have questions about this privacy policy or your data, please reach out:</p>
<ul>
  <li><strong>Email:</strong> <a href="mailto:theutkarshmail@gmail.com">theutkarshmail@gmail.com</a></li>
  <li><strong>Developer:</strong> Utkarsh Pandey</li>
</ul>

</div>
</main>

<footer>
  <p>&copy; ${new Date().getFullYear()} SettleUp. All rights reserved.</p>
  <p>Built with 💜 by <a href="mailto:theutkarshmail@gmail.com">Utkarsh Pandey</a></p>
</footer>

</body>
</html>`;
}
