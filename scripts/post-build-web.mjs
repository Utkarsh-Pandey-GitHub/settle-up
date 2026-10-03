import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.resolve(rootDir, "apps/mobile/dist");

if (!fs.existsSync(distDir)) {
  console.log("dist directory does not exist, skipping post-build.");
  process.exit(0);
}

const privacyDir = path.join(distDir, "privacy");
if (!fs.existsSync(privacyDir)) {
  fs.mkdirSync(privacyDir, { recursive: true });
}

// 1. Generate standalone, beautiful static Privacy Policy HTML
const privacyHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
  <title>Privacy Policy - SettleUp</title>
  <link rel="icon" href="/favicon.ico" />
  <style>
    :root {
      --bg: #F5F4F7;
      --card-bg: #FFFFFF;
      --text: #211D29;
      --muted: #716B7B;
      --accent: #6652A3;
      --accent-soft: #F0ECF8;
      --border: #E1DDE7;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #1C1922;
        --card-bg: #25212E;
        --text: #F6F4FA;
        --muted: #9E97A9;
        --accent: #A58CE2;
        --accent-soft: #2E263E;
        --border: #3A3247;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 40px 20px 60px;
    }
    .container {
      max-width: 720px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      margin-bottom: 28px;
    }
    .logo-row {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      text-decoration: none;
      color: var(--text);
    }
    .brand-title {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -1px;
    }
    .brand-accent {
      color: var(--accent);
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.35px;
      margin-bottom: 4px;
    }
    .updated {
      font-size: 13px;
      color: var(--muted);
    }
    .card {
      background: var(--card-bg);
      border-radius: 20px;
      padding: 32px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
      border: 1px solid var(--border);
    }
    h2 {
      font-size: 18px;
      font-weight: 700;
      margin-top: 24px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    h2:first-of-type {
      margin-top: 0;
    }
    h3 {
      font-size: 15px;
      font-weight: 700;
      margin-top: 14px;
      margin-bottom: 6px;
    }
    p {
      font-size: 14px;
      margin-bottom: 12px;
      line-height: 1.6;
    }
    .highlight {
      background: var(--accent-soft);
      border-left: 3px solid var(--accent);
      border-radius: 12px;
      padding: 14px;
      margin: 16px 0;
      font-weight: 600;
      color: var(--accent);
      font-size: 14px;
      line-height: 1.5;
    }
    ul {
      list-style: none;
      margin-bottom: 12px;
    }
    li {
      position: relative;
      padding-left: 20px;
      margin-bottom: 8px;
      font-size: 14px;
      line-height: 1.5;
    }
    li::before {
      content: "•";
      position: absolute;
      left: 6px;
      color: var(--accent);
      font-weight: bold;
    }
    .footer {
      text-align: center;
      margin-top: 32px;
      font-size: 13px;
      color: var(--muted);
    }
    .footer a {
      color: var(--accent);
      text-decoration: underline;
      display: inline-block;
      margin-top: 8px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <a href="/" class="logo-row">
        <svg width="40" height="40" viewBox="36 8 134 150">
          <g transform="rotate(0)" transform-origin="100 100">
            <rect x="45" y="39" width="113" height="114" rx="36" fill="#9F6DE4" />
            <path d="M58 60q30-24 80-4" fill="none" stroke="#C1A0F0" stroke-width="8" stroke-linecap="round" />
            <ellipse cx="83" cy="94" rx="7" ry="10" fill="#38255E" />
            <ellipse cx="125" cy="94" rx="7" ry="10" fill="#38255E" />
            <circle cx="85" cy="91" r="2" fill="#FFF" />
            <circle cx="127" cy="91" r="2" fill="#FFF" />
            <path d="M92 113q12 15 24-1" stroke="#38255E" stroke-width="4" stroke-linecap="round" fill="none" />
            <ellipse cx="68" cy="111" rx="10" ry="5" fill="#B691EA" />
            <ellipse cx="139" cy="111" rx="10" ry="5" fill="#B691EA" />
            <g transform="rotate(10)" transform-origin="111 31">
              <rect x="91" y="15" width="40" height="32" rx="11" fill="#F3BC5A" />
              <path d="m104 26 5 7 10-8" stroke="#9A651E" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" />
            </g>
          </g>
        </svg>
        <span class="brand-title">settle<span class="brand-accent">up.</span></span>
      </a>
      <h1>Privacy Policy</h1>
      <p class="updated">Last updated: 2 October 2026</p>
    </header>

    <main class="card">
      <h2>Overview</h2>
      <p>
        SettleUp (&quot;we&quot;, &quot;our&quot;, or &quot;the app&quot;) is a personal finance tool that
        helps you record shared expenses, track debts, settle balances with friends,
        and set savings goals. SettleUp does not connect to your bank account, hold
        funds, or process payments directly.
      </p>
      <div class="highlight">
        Key principle: SettleUp is designed to minimise data collection. We collect only what is necessary. We do not sell your personal data. We do not include advertising SDKs or third-party behavioural analytics.
      </div>

      <h2>Information We Collect</h2>
      <h3>Information you provide</h3>
      <ul>
        <li>Phone number — used with Truecaller or Google sign-in to identify your account.</li>
        <li>Profile information — optional name, email, avatar, currency, and timezone.</li>
        <li>Financial entries — expenses, splits, repayments, goals, tags, and notes you create.</li>
        <li>Selected contacts — phone numbers of people you choose to split with. We do not upload your full address book.</li>
        <li>UPI ID — optionally provided for payment request links.</li>
        <li>Notification preferences — your push notification choices.</li>
      </ul>

      <h3>Information collected automatically</h3>
      <ul>
        <li>Session tokens — stored in OS-level secure storage on native devices. In the browser, tokens are kept only in memory.</li>
        <li>Shared-link access events — whether access was allowed and the timestamp. We do not store visitor IP addresses.</li>
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

      <h2>How We Use Your Information</h2>
      <ul>
        <li>Authentication — verify your phone number.</li>
        <li>Core functionality — manage expenses, splits, repayments, goals, and analytics.</li>
        <li>Group ledgers — show shared records to ledger members.</li>
        <li>Payment links — generate shareable UPI payment requests.</li>
        <li>Notifications — push notifications about ledger activity (opt-in).</li>
        <li>Analytics snapshots — spending analytics you can share via time-limited links.</li>
      </ul>

      <h2>Device Permissions</h2>
      <p>
        Permissions are requested only when you initiate a specific feature. Each can be declined — the app continues to function.
      </p>
      <ul>
        <li>Camera — UPI QR scanning or bill photo capture.</li>
        <li>Photo library — select a bill photo for item extraction.</li>
        <li>Contacts — pick a contact for splitting. Manual entry always available.</li>
        <li>Notifications — optional, requested from Settings.</li>
        <li>SMS (Android only) — see below.</li>
      </ul>

      <h2>Bank SMS Review (Android Only)</h2>
      <div class="highlight">
        Raw SMS messages never leave your device. All parsing and matching happen entirely on-device.
      </div>
      <ul>
        <li>You review each suggested transaction individually — accept, edit, or reject.</li>
        <li>Only the structured data you approve is saved to your ledger.</li>
        <li>On-device fingerprints expire after seven days.</li>
        <li>SMS permission is requested only after an on-screen explanation and your tap.</li>
      </ul>

      <h2>Bill Scanning</h2>
      <p>
        When you scan a bill, the image is forwarded to a configured AI vision model for one-time itemisation. SettleUp does not store, attach, or retain the bill image. The provider may process images under its own terms.
      </p>

      <h2>How Information Is Shared</h2>
      <ul>
        <li>With other users — ledger members see shared records only. Your personal entries are not visible.</li>
        <li>Public analytics links — frozen snapshots viewable by anyone with the token.</li>
        <li>Private analytics links — require the recipient's verified phone.</li>
        <li>AI vision model provider — receives bill images only during scanning.</li>
        <li>Truecaller — optional; Google sign-in remains available.</li>
        <li>Infrastructure providers — process data under standard agreements.</li>
      </ul>
      <div class="highlight">
        We do not sell, rent, or trade your personal information. No advertising network, analytics SDK, or data broker receives your data.
      </div>

      <h2>Data Storage & Security</h2>
      <ul>
        <li>PostgreSQL with encryption at rest and TLS in transit.</li>
        <li>No app passwords — authentication uses Truecaller or Google identity tokens.</li>
        <li>JWT tokens with short expiry, refresh rotation, and replay revocation.</li>
        <li>On-device tokens use OS secure storage.</li>
        <li>API logging redacts sensitive headers, bodies, and tokens.</li>
      </ul>

      <h2>Data Retention & Deletion</h2>
      <ul>
        <li>Export your data from Settings at any time.</li>
        <li>Account deletion revokes sessions and links, removes your identity, profile, and preferences.</li>
        <li>Shared records are retained under an anonymised account for other participants.</li>
        <li>Unresolved obligations must be settled before deletion.</li>
      </ul>

      <h2>Third-Party Services</h2>
      <ul>
        <li>Truecaller (optional verification) — truecaller.com/privacy-policy</li>
        <li>Expo / EAS Update (OTA updates) — expo.dev/privacy</li>
      </ul>

      <h2>Children's Privacy</h2>
      <p>
        SettleUp is not directed at children under 13. We do not knowingly collect personal information from children.
      </p>

      <h2>📝 Changes to This Policy</h2>
      <p>
        We may update this policy from time to time. Changes are reflected on this page with an updated date. Continued use constitutes acceptance.
      </p>

      <h2>Contact Us</h2>
      <p>Questions about this policy or your data? Reach out:</p>
      <ul>
        <li>Email: theutkarshmail@gmail.com</li>
        <li>Developer: Utkarsh Pandey</li>
      </ul>
    </main>

    <footer class="footer">
      <p>© ${new Date().getFullYear()} SettleUp. All rights reserved.</p>
      <a href="/">Return to SettleUp</a>
    </footer>
  </div>
</body>
</html>`;

// Write to both /privacy.html and /privacy/index.html so all URLs work
fs.writeFileSync(path.join(distDir, "privacy.html"), privacyHtml);
fs.writeFileSync(path.join(privacyDir, "index.html"), privacyHtml);

const termsDir = path.join(distDir, "terms");
fs.mkdirSync(termsDir, { recursive: true });
const termsSections = [
  [
    "Using SettleUp",
    "You must provide accurate account information and use the service only for lawful personal expense tracking and payment requests.",
  ],
  [
    "Financial records",
    "SettleUp records information you enter. It is not a bank, wallet, lender, payment processor, or financial adviser. Confirm amounts before paying through another app.",
  ],
  [
    "Shared groups",
    "Group members can see and update shared transactions. Changes are logged. Deleted groups remain read-only so their financial history is preserved.",
  ],
  [
    "Availability",
    "Network, provider, and maintenance interruptions may occur. Keep independent records when required.",
  ],
  [
    "Your responsibility",
    "You are responsible for your device, sign-in methods, entries, payment decisions, and compliance with applicable law.",
  ],
  [
    "Changes and contact",
    "These terms may be updated as the service changes. The effective date identifies the version that applies.",
  ],
];
const termsHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Terms and conditions - SettleUp</title><link rel="icon" href="/favicon.ico">
<style>*{box-sizing:border-box}body{margin:0;background:#f7f6f9;color:#24222b;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.page{max-width:760px;margin:auto;padding:48px 20px 72px}a{color:#6652a3;text-decoration:none;font-weight:700}h1{font-size:40px;letter-spacing:-1px;margin:28px 0 8px}p{color:#55515e;line-height:1.65}.date{color:#6b6874;margin-bottom:30px}.section{border-top:1px solid #e5e2ea;padding:22px 0}.section h2{font-size:20px;margin:0 0 8px}@media(max-width:560px){.page{padding-top:28px}h1{font-size:32px}}</style></head>
<body><main class="page"><a href="/">settleup.</a><h1>Terms and conditions</h1><p class="date">Effective 3 October 2026</p>
${termsSections.map(([title, text]) => `<section class="section"><h2>${title}</h2><p>${text}</p></section>`).join("\n")}
</main></body></html>`;
fs.writeFileSync(path.join(distDir, "terms.html"), termsHtml);
fs.writeFileSync(path.join(termsDir, "index.html"), termsHtml);

// 2. Generate cute Pip mascot 404.html for Vercel static error handling
const notFoundHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
  <title>Page Not Found - SettleUp</title>
  <link rel="icon" href="/favicon.ico" />
  <style>
    :root {
      --bg: #F5F4F7;
      --card-bg: #FFFFFF;
      --text: #211D29;
      --muted: #716B7B;
      --accent: #6652A3;
      --accent-soft: #F0ECF8;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #1C1922;
        --card-bg: #25212E;
        --text: #F6F4FA;
        --muted: #9E97A9;
        --accent: #A58CE2;
        --accent-soft: #2E263E;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }
    .wrapper {
      max-width: 420px;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .card {
      background: var(--card-bg);
      border-radius: 24px;
      padding: 32px;
      width: 100%;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
    }
    .bubble {
      background: var(--accent-soft);
      border-left: 3px solid var(--accent);
      border-radius: 16px;
      padding: 12px 18px;
      margin-bottom: 16px;
      font-size: 14px;
      font-weight: 700;
      color: var(--accent);
    }
    .code {
      font-size: 72px;
      font-weight: 800;
      color: var(--accent);
      opacity: 0.18;
      line-height: 80px;
      letter-spacing: -3px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    p {
      font-size: 14px;
      color: var(--muted);
      margin-bottom: 24px;
      line-height: 1.5;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: var(--accent);
      color: #FFFFFF;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 700;
      width: 100%;
      transition: opacity 0.2s;
    }
    .btn:hover {
      opacity: 0.9;
    }
    .privacy-link {
      display: inline-block;
      margin-top: 16px;
      font-size: 13px;
      color: var(--accent);
      text-decoration: underline;
      opacity: 0.75;
    }
    .brand-row {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
      color: var(--text);
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .brand-accent {
      color: var(--accent);
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <svg width="160" height="160" viewBox="0 0 200 200">
      <ellipse cx="109" cy="175" rx="60" ry="10" fill="#D9CEE8" opacity="0.55" />
      <g transform="rotate(-9)" transform-origin="100 100">
        <path d="M55 140 41 160M142 140l14 23" stroke="#502A9C" stroke-width="12" stroke-linecap="round" />
        <path d="M50 105 27 105M154 97l19 8" stroke="#7B51D0" stroke-width="12" stroke-linecap="round" />
        <rect x="45" y="39" width="113" height="114" rx="36" fill="#9F6DE4" />
        <path d="M58 60q30-24 80-4" fill="none" stroke="#C1A0F0" stroke-width="8" stroke-linecap="round" />
        <ellipse cx="83" cy="94" rx="7" ry="10" fill="#38255E" />
        <ellipse cx="125" cy="94" rx="7" ry="10" fill="#38255E" />
        <circle cx="85" cy="91" r="2" fill="#FFF" />
        <circle cx="127" cy="91" r="2" fill="#FFF" />
        <path d="M92 117q12-5 24 0" stroke="#38255E" stroke-width="4" stroke-linecap="round" fill="none" />
        <ellipse cx="68" cy="111" rx="10" ry="5" fill="#B691EA" />
        <ellipse cx="139" cy="111" rx="10" ry="5" fill="#B691EA" />
        <g transform="rotate(10)" transform-origin="111 31">
          <rect x="91" y="15" width="40" height="32" rx="11" fill="#F3BC5A" />
          <path d="m104 26 5 7 10-8" stroke="#9A651E" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </g>
      </g>
      <path d="m174 32 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="#B090DE" />
      <circle cx="28" cy="44" r="4" fill="#F3BA69" />
    </svg>

    <div class="card">
      <div class="bubble">
        Hmm, I looked everywhere but couldn't find this page! 🤔
      </div>
      <div class="code">404</div>
      <h1>Page not found</h1>
      <p>This page doesn't exist, was moved, or maybe the link was wrong.</p>
      <a href="/" class="btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
        </svg>
        Go Home
      </a>
      <a href="/privacy" class="privacy-link">Privacy Policy</a>
    </div>

    <a href="/" class="brand-row">
      <svg width="28" height="28" viewBox="36 8 134 150">
        <g transform="rotate(0)" transform-origin="100 100">
          <rect x="45" y="39" width="113" height="114" rx="36" fill="#9F6DE4" />
          <path d="M58 60q30-24 80-4" fill="none" stroke="#C1A0F0" stroke-width="8" stroke-linecap="round" />
          <ellipse cx="83" cy="94" rx="7" ry="10" fill="#38255E" />
          <ellipse cx="125" cy="94" rx="7" ry="10" fill="#38255E" />
          <circle cx="85" cy="91" r="2" fill="#FFF" />
          <circle cx="127" cy="91" r="2" fill="#FFF" />
          <path d="M92 113q12 15 24-1" stroke="#38255E" stroke-width="4" stroke-linecap="round" fill="none" />
          <ellipse cx="68" cy="111" rx="10" ry="5" fill="#B691EA" />
          <ellipse cx="139" cy="111" rx="10" ry="5" fill="#B691EA" />
          <g transform="rotate(10)" transform-origin="111 31">
            <rect x="91" y="15" width="40" height="32" rx="11" fill="#F3BC5A" />
            <path d="m104 26 5 7 10-8" stroke="#9A651E" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" />
          </g>
        </g>
      </svg>
      <span>settle<span class="brand-accent">up.</span></span>
    </a>
  </div>
</body>
</html>`;

fs.writeFileSync(path.join(distDir, "404.html"), notFoundHtml);
fs.writeFileSync(path.join(distDir, "+not-found.html"), notFoundHtml);

console.log("Post-build completed successfully:");
console.log(
  "- Created dist/privacy/index.html & dist/privacy.html (Static Privacy Policy)",
);
console.log("- Created dist/terms/index.html & dist/terms.html (Static Terms)");
console.log("- Created dist/404.html & dist/+not-found.html (Pip Mascot 404)");
