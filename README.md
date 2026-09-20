# SettleUp

A friendly expense and shared-ledger application built with Expo, React Native, TypeScript, Tamagui, Expo Router, TanStack Query, Zustand, React Hook Form, Zod, Fastify, PostgreSQL, and Prisma.

**Start here:** `npm install`, then `npm run dev`. Open [the local preview](http://localhost:8081). It starts in a clearly labeled, fictional demo mode and works without backend credentials.

## What works

- Adaptive dashboard, activity/search/tag/status filtering, group ledgers, exact split previews, loans, pairwise repayments, disputes, reversal/replacement flows, analytics, goals, tags, accounts, contacts, settings, and shared snapshots.
- Verified phone authentication with expiring hashed OTP challenges, rate/attempt limits, JWT access tokens, refresh rotation, family replay revocation, and independent saved native sessions.
- One original shared expense, exact allocations, three obligations for a four-person expense, and auditable partial/full repayments. Amounts are integer minor units; database checks reinforce service rules.
- Scoped, frozen analytics snapshots. Public links use 256-bit random tokens; private links require the intended verified phone. Links are read-only, expiring, revocable, and access-logged.
- Camera/UPI confirmation with pending records; an Android Kotlin SMS inbox module with on-device parsing, explicit permission, and seven-day salted deduplication. iOS/browser/Expo Go show honest limitations.
- One-time AI bill itemisation from camera or photo library, with editable items, taxes, discounts and total in a separate five-column `TransactionItem` table. Bill images are not stored.
- Purple/violet finance illustrations, a central mobile UPI scanner, Pip feedback for reading, saving, and corrections.
- PostgreSQL migrations, idempotent sample seed, domain tests, real-database integration tests, browser test specifications, background expiry cleanup and a notification outbox.

**Release status:** This is a runnable implementation and tested core vertical slice, not an app-store-ready or independently security-certified financial product. See [release gates and feature boundaries](docs/PRODUCTION.md). Native permission flows and delivery through your production providers still require device and staging verification. The dependency audit has unresolved upstream advisories.

## Structure and decisions

See [architecture, Mermaid diagrams, and entity relationships](docs/ARCHITECTURE.md), [API contract and authorization](docs/API.md), [provider setup](docs/PROVIDERS.md), and [privacy policy](docs/PRIVACY.md). The complete model is in [schema.prisma](prisma/schema.prisma).

The implementation keeps helpers consolidated around actual boundaries: financial domain logic, analytics, repositories, and device services. Compact interface rows expose only useful information; financial detail lives on the detail screen.

## Run the browser demo

Requires Node.js 22.13 or newer and npm 10+.

```sh
npm ci
npm run dev
```

Open [localhost:8081](http://localhost:8081). The demo starts with Utkarsh's personal account and a separate studio account. Create an expense, select "Split with friends", choose Goa, and preview a ₹100 expense as four ₹25 shares. Record a repayment from the paying account in the settlement screen. Switch accounts with the avatar to check isolation.

Demo data is fictional and stored under `settleup.demo.v1.<accountId>` in AsyncStorage. Tokens are never put in browser local storage. Browser API sessions last only as long as the page is open. Native API sessions use SecureStore. Native drafts use separate secure keys per account; browser drafts stay in memory for the current page session.

Demo public shares are in-memory previews for the current page session. Secure private links, durable shares, real authentication, and multiplayer consistency need API mode. Original seeded demo debt records are intentionally read-only for reversal experiments; create a new expense to test reversal.

## Run PostgreSQL and the API

Two database options:

```sh
# With Docker Compose installed and its daemon running:
docker compose up -d db
```

Or use the included isolated local PostgreSQL process (no Docker required):

```sh
npm run db:local
```

The local process listens on `127.0.0.1:55432`, stores development data in `/tmp/settleup-postgres`, and stops cleanly on Ctrl+C. Docker uses port 5432. Do not use either development credential set in production.

In another terminal:

```sh
cp -n .env.example .env
# Set DATABASE_URL to the chosen port.
# Replace JWT_SECRET and OTP_PEPPER with different random secrets (32+ characters).
npm run db:generate
npm run db:migrate
npm run db:seed
npm run api
```

A local `.env` with generated secrets and port 55432 was prepared during implementation. It is ignored by version control. Keep those values private.

To run the native or browser app against the API, create `apps/mobile/.env.local`:

```dotenv
EXPO_PUBLIC_DEMO=false
EXPO_PUBLIC_API_URL=http://localhost:4000
```

Restart Metro after changing public environment variables. For an Android emulator use `http://10.0.2.2:4000`; for a physical device use your machine's LAN address and configure an appropriate development bind address/firewall. Production must use HTTPS.

The seed provisions fictional development phone numbers ending in 3210, 3211, 3212, and 3213 (`+919876543210` through `+919876543213`). The development OTP adapter returns a freshly generated code in the API response and the auth screen displays it. It only accepts the explicit allowlist and is prohibited in production. There is no fixed bypass code.

Run background cleanup and notifications in another terminal:

```sh
npm run worker
```

## Native development builds

```sh
npm run android -w @settleup/mobile
npm run ios -w @settleup/mobile
```

Android requires Android Studio/SDK and a device/emulator; iOS requires macOS, Xcode and signing configuration. The app uses Expo SDK 54 and matching React Native 0.81.5/React 19.1.0. The lockfile and root overrides prevent incompatible optional-peer versions from being hoisted.

The SMS module is under `apps/mobile/modules/transaction-sms`. Expo autolinks local modules under `modules`. A native development build is necessary; Expo Go cannot contain this custom module. Do not request SMS permission at startup. Google Play SMS permission eligibility must be evaluated before distributing a build with `READ_SMS`; otherwise remove that permission/module from the production flavor.

The Android SMS module compiles in the ARM64 debug APK. Reading actual bank SMS still needs verification on a physical Android device.

## Verification

```sh
npm run typecheck
npm test                         # domain tests; database suite skipped by default
npm run test:integration         # requires migrated/seeded development DB
npm run build:web
npm run format:check
```

The integration suite writes fictional test ledger entries and uses the configured development OTP allowlist. Run it only on a dedicated local/staging test database, never production. Domain tests cover integer precision, all split methods, rounding, obligation generation, repayments, simplification, UPI validation, SMS parsing, private sharing, and timezone/goal boundaries. API integration tests exercise real serializable PostgreSQL transactions, duplicate requests, IDOR prevention, disputes, reversals, OTP attempt limits, session replay, and link access controls.

Browser E2E specifications are in `tests/browser.spec.ts`. With Playwright Chromium installed:

```sh
npx playwright install chromium
npm run test:e2e
```

`npm run build:web` exports the browser application to `apps/mobile/dist`. Host it with an SPA fallback to `index.html` for Router deep links. Do not publish the development database, `.env`, or dev OTP API.

## Bill scanning and design refresh

Set server-only `OPENROUTER_API_KEY` and optionally `BILL_VISION_MODEL` (default `openrouter/free`). Choose **Add expense → Take bill photo / Choose bill photo → Extract itemised bill**. The authenticated API sends the image once to the selected vision model and returns editable items, taxes, discounts, and total. SettleUp does not save or attach the image. A line total already includes its quantity, and saving rejects item totals that differ from the expense. Manual items remain available.

The second shared Figma finance kit is the primary visual inspiration: airy surfaces, pastel action tiles, and original outlined wallet illustrations. Pip's interaction feedback draws on the first reference. The finance reference's coin, wallet and privacy illustrations are bundled locally; see `apps/mobile/assets/finance/README.md` for source credits.


### Bank SMS review, contact groups, and payment links

- Open **Account switcher → Settings & permissions → Bank SMS review**. Access is requested only after the explanation and the user taps Enable. Today and the previous six device-local calendar days form the weekly inbox. Expense parsing is heuristic; OTPs, credits, failures, reversals and obvious reminders are ignored. Review/correct each suggestion before accepting. Raw SMS never goes to the server.
- Accepted/rejected records (fingerprint, parsed title/amount, message date and expiry) are encrypted in device storage, separately per account. Expiry is message-day midnight plus seven days, not seven days after review. Expired records are hidden and purged during app use/start/resume; no background reader runs while the app is closed. The weekly screen refreshes each minute and on resume. Saved transactions remain in the ledger.
- **Choose dates** searches the SMS inbox inclusively through the chosen day. It does not persist review decisions or apply weekly dismissals. Existing transaction idempotency still prevents importing the same message twice. Very large searches ask for a shorter range instead of silently truncating results. SMS access is Android-only and requires the rebuilt APK, not Expo Go. Play distribution requires the SMS money-management permissions declaration.
- Selecting phone contacts during group creation now atomically saves peers and adds members. Unknown numbers receive a pending user identity with `verifiedAt = null`, no session and no access. Actual OTP/Truecaller verification claims that same identity, preserving group history. Existing users, duplicate selections and blocked contacts are handled in the same transaction. No invitations or messages are sent automatically.
- **Settings → Payment links** creates an opaque seven-day request with a UPI ID, payee name and INR amount. Share the API-hosted `/p/:token` URL. Its landing page opens `settleup:///pay/:token`; the app requires sign-in and explicit confirmation before opening a UPI app. It never marks the request paid automatically. The payee name is user-entered; the payer verifies it in their UPI app.
- Payment links use the existing API/database and require no paid API or keys. Set optional server `APP_INSTALL_URL` to an HTTPS Play Store/APK URL to show an install button; without it the page asks the recipient to get the app from the sender. After installation, reopen the original link. The token obscures payment details in shared URLs, but a custom scheme is not cryptographic proof that a caller is SettleUp. Verified Android App Links would require a domain and assetlinks configuration.
- Deployment: apply `npm run db:migrate` and restart/redeploy the API before using the new mobile screens. The new schema change makes phone verification nullable for pending members and adds one four-column `PaymentLink` table. `npm run apk:android` rebuilds the ARM64 development APK (Metro is still required).
