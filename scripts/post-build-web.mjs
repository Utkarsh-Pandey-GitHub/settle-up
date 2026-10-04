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
        <li>Account deletion removes your phone and Google identities, profile, sessions, private links, preferences, personal-only transactions, goals, and tags.</li>
        <li>Shared records remain available to other participants under the non-identifying label &quot;Deleted member&quot;.</li>
        <li>A minimal deletion audit is retained for up to 12 months; encrypted backup remnants rotate out within 90 days.</li>
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
        <li>Email: up714279@gmail.com</li>
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

// 2. Generate Account & Data Deletion Request HTML (Google Play requirement)
const deleteAccountDir = path.join(distDir, "delete-account");
if (!fs.existsSync(deleteAccountDir)) {
  fs.mkdirSync(deleteAccountDir, { recursive: true });
}

const deleteAccountHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
  <title>Account &amp; Data Deletion - SettleUp</title>
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
      margin-bottom: 6px;
    }
    .subtitle {
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
    }
    h2:first-of-type {
      margin-top: 0;
    }
    h3 {
      font-size: 15px;
      font-weight: 700;
      margin-top: 16px;
      margin-bottom: 6px;
      color: var(--accent);
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
    .step-box {
      background: var(--bg);
      border-left: 3px solid var(--accent);
      border-radius: 12px;
      padding: 16px;
      margin: 12px 0 16px;
    }
    .step-box ol {
      padding-left: 20px;
      margin: 0;
    }
    .step-box li {
      font-size: 14px;
      line-height: 1.6;
      margin-bottom: 6px;
    }
    .step-box li:last-child {
      margin-bottom: 0;
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
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--accent);
      color: #FFFFFF;
      text-decoration: none;
      padding: 12px 22px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 700;
      margin: 10px 0 16px;
      transition: opacity 0.2s;
    }
    .btn:hover {
      opacity: 0.9;
    }
    .auth-panel {
      background: var(--accent-soft);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 18px;
      margin: 12px 0 18px;
    }
    .confirm-panel { margin-top: 16px; }
    .confirm-panel[hidden] { display: none; }
    label { display: block; font-size: 13px; font-weight: 700; margin: 12px 0 6px; }
    input {
      width: 100%; min-height: 48px; border: 1px solid var(--border);
      border-radius: 11px; padding: 12px; color: var(--text);
      background: var(--card-bg); font: inherit;
    }
    button.btn { border: 0; cursor: pointer; }
    button.btn:disabled { opacity: .45; cursor: not-allowed; }
    .status { color: var(--muted); font-size: 13px; margin: 8px 0 0; }
    .status.error { color: #A73748; }
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
      margin: 4px 6px;
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
      <h1>Delete your SettleUp account and data</h1>
      <p class="subtitle">App: <strong>SettleUp</strong> &bull; Developer: <strong>Utkarsh Pandey</strong></p>
    </header>

    <main class="card">
      <h2>Overview</h2>
      <p>
        At <strong>SettleUp</strong> (developed by <strong>Utkarsh Pandey</strong>), you can permanently delete your account in the app or request deletion here even if you no longer have the app installed.
      </p>
      <div class="highlight">
        In-app deletion is immediate. Online requests are verified with the Google account already linked to SettleUp.
      </div>

      <h2>How to Request Account &amp; Data Deletion</h2>

      <h3>Option 1: In the SettleUp App (Instant)</h3>
      <p>If you have the SettleUp app installed on your phone:</p>
      <div class="step-box">
        <ol>
          <li>Open the <strong>SettleUp</strong> app on your device.</li>
          <li>Navigate to <strong>Account</strong> / <strong>Settings</strong> (by tapping your profile avatar).</li>
          <li>Scroll to the <strong>&quot;Delete account&quot;</strong> section.</li>
          <li>Type <code>DELETE MY ACCOUNT</code> in the confirmation field.</li>
          <li>Tap <strong>&quot;Delete my account&quot;</strong>. The app signs you out and deletes your personal data immediately.</li>
        </ol>
      </div>

      <h3>Option 2: Delete online with Google</h3>
      <p>Use the Google account already linked to your SettleUp account. The sign-in is used only to verify ownership; credentials are not stored in this page.</p>
      <div class="auth-panel">
        <div id="google-delete-button"></div>
        <p id="delete-status" class="status" role="status" aria-live="polite"></p>
        <div id="delete-confirm" class="confirm-panel" hidden>
          <p id="signed-in-account"></p>
          <label for="delete-phrase">Type DELETE MY ACCOUNT to confirm</label>
          <input id="delete-phrase" autocomplete="off" spellcheck="false" />
          <button id="delete-button" class="btn" type="button" disabled>Permanently delete my account</button>
        </div>
      </div>

      <h3>Option 3: Email request (if Google is not linked)</h3>
      <p>If you have uninstalled the app, cannot log in, or prefer to submit a deletion request online:</p>
      <div class="step-box">
        <ol>
          <li>Send an email to our support email: <strong>up714279@gmail.com</strong></li>
          <li>Use the subject line: <code>SettleUp - Account Deletion Request</code></li>
          <li>In the body of the message, provide your <strong>registered phone number</strong> (with country code) or your <strong>associated Google account email</strong>.</li>
          <li>Our team will verify the request and complete the deletion within <strong>30 days</strong>, sending you a final confirmation email.</li>
        </ol>
      </div>

      <a class="btn" href="mailto:up714279@gmail.com?subject=SettleUp%20-%20Account%20Deletion%20Request&amp;body=Hello%2C%0A%0AI%20would%20like%20to%20request%20the%20deletion%20of%20my%20SettleUp%20account%20and%20associated%20data.%0A%0AMy%20registered%20phone%20number%20or%20Google%20email%20is%3A%20%0A%0AThank%20you.">
        Request deletion by email
      </a>

      <h2>What Data is Deleted</h2>
      <p>When your account deletion is processed, the following personal data is permanently erased:</p>
      <ul>
        <li><strong>Profile:</strong> Name, email, avatar, timezone, currency preference, and discoverability.</li>
        <li><strong>Authentication:</strong> Phone and Google associations, sessions, and refresh credentials.</li>
        <li><strong>Personal-only records:</strong> Transactions not shared with another person or group, goals, tags, and itemisation.</li>
        <li><strong>Private tools:</strong> Analytics links, payment links, SMS decisions, notification data, contact aliases you created, and block preferences.</li>
      </ul>

      <h2>What Data is Retained &amp; Why</h2>
      <p>Certain records are retained for specific operational or legal purposes:</p>
      <ul>
        <li><strong>Shared financial records:</strong> Transactions, splits, settlements, balances, and group history involving other people remain accurate. Your identity is replaced with &quot;Deleted member&quot;.</li>
        <li><strong>Pseudonymous record key:</strong> A random internal identifier remains only to connect shared records. No phone, Google identity, email, name, or avatar remains attached.</li>
        <li><strong>Deletion audit:</strong> A minimal deletion event is retained for security for up to 12 months.</li>
      </ul>

      <h2>Retention Period</h2>
      <ul>
        <li><strong>In-app deletion:</strong> Takes effect immediately.</li>
        <li><strong>Email/web deletion requests:</strong> Processed within 30 days of verification.</li>
        <li><strong>Shared records:</strong> Retained until a remaining participant deletes the relevant transaction or group, or until the service is discontinued.</li>
        <li><strong>Deletion audit:</strong> Deleted after 12 months.</li>
        <li><strong>Encrypted backups:</strong> Residual copies rotate out within 90 days and are used only for disaster recovery.</li>
      </ul>

      <h2>Contact Information</h2>
      <p>For questions or support regarding data deletion, contact:</p>
      <ul>
        <li>Developer: <strong>Utkarsh Pandey</strong></li>
        <li>Application: <strong>SettleUp</strong></li>
        <li>Email: <a href="mailto:up714279@gmail.com" style="color:var(--accent);">up714279@gmail.com</a></li>
      </ul>
    </main>

    <footer class="footer">
      <p>&copy; ${new Date().getFullYear()} SettleUp (Utkarsh Pandey). All rights reserved.</p>
      <div>
        <a href="/privacy">Privacy Policy</a> &bull;
        <a href="/terms">Terms of Service</a> &bull;
        <a href="/">Return to SettleUp</a>
      </div>
    </footer>
  </div>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <script>
    (() => {
      const clientId = ${JSON.stringify(
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
          "1006604995208-hchg9963bmq747pc4o7pqlun8o89agn6.apps.googleusercontent.com",
      )};
      const apiUrl = ${JSON.stringify(process.env.EXPO_PUBLIC_API_URL || "https://settleup-api-j248.onrender.com")};
      let accessToken = "";
      const status = document.getElementById("delete-status");
      const confirmPanel = document.getElementById("delete-confirm");
      const phrase = document.getElementById("delete-phrase");
      const deleteButton = document.getElementById("delete-button");
      const showStatus = (message, error = false) => {
        status.textContent = message;
        status.className = error ? "status error" : "status";
      };
      window.handleSettleUpGoogleDeletion = async ({ credential }) => {
        showStatus("Verifying your linked SettleUp account…");
        try {
          const response = await fetch(apiUrl + "/auth/google", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ idToken: credential }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || "Could not verify this Google account.");
          accessToken = result.accessToken;
          document.getElementById("signed-in-account").textContent =
            "Verified SettleUp account: " + (result.account.email || result.account.name);
          confirmPanel.hidden = false;
          showStatus("Account verified. Review the retention details below before confirming.");
        } catch (error) {
          showStatus(error.message || "Could not verify this Google account.", true);
        }
      };
      phrase.addEventListener("input", () => {
        deleteButton.disabled = phrase.value !== "DELETE MY ACCOUNT" || !accessToken;
      });
      deleteButton.addEventListener("click", async () => {
        deleteButton.disabled = true;
        showStatus("Deleting your account and personal data…");
        try {
          const response = await fetch(apiUrl + "/account", {
            method: "DELETE",
            headers: {
              authorization: "Bearer " + accessToken,
              "content-type": "application/json",
            },
            body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || "Deletion could not be completed.");
          accessToken = "";
          confirmPanel.hidden = true;
          showStatus("Your SettleUp account and personal data have been deleted.");
        } catch (error) {
          deleteButton.disabled = false;
          showStatus(error.message || "Deletion could not be completed.", true);
        }
      });
      const renderGoogle = () => {
        if (!clientId) return showStatus("Google deletion sign-in is not configured. Use the email option below.", true);
        if (!window.google?.accounts?.id) return setTimeout(renderGoogle, 100);
        google.accounts.id.initialize({ client_id: clientId, callback: window.handleSettleUpGoogleDeletion });
        google.accounts.id.renderButton(document.getElementById("google-delete-button"), {
          theme: "outline", size: "large", text: "signin_with", width: 280,
        });
      };
      renderGoogle();
    })();
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(distDir, "delete-account.html"), deleteAccountHtml);
fs.writeFileSync(path.join(deleteAccountDir, "index.html"), deleteAccountHtml);

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
console.log(
  "- Created dist/delete-account/index.html & dist/delete-account.html (Static Delete Account)",
);
console.log("- Created dist/terms/index.html & dist/terms.html (Static Terms)");
console.log("- Created dist/404.html & dist/+not-found.html (Pip Mascot 404)");
