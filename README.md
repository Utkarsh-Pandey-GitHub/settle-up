# SettleUp

A friendly expense and shared-ledger application built with Expo, React Native, TypeScript, Tamagui, Expo Router, TanStack Query, Zustand, React Hook Form, Zod, Fastify, PostgreSQL, and Prisma.

**Start here:** `npm install`, then `npm run dev`. Open [the local preview](http://localhost:8081). It starts in a clearly labeled, fictional demo mode and works without backend credentials.

## What works

- Adaptive dashboard, activity/search/tag/status filtering, group ledgers, exact split previews, loans, pairwise repayments, disputes, reversal/replacement flows, analytics, goals, tags, accounts, contacts, settings, and shared snapshots.
- Verified phone authentication with expiring hashed OTP challenges, rate/attempt limits, JWT access tokens, refresh rotation, family replay revocation, and independent saved native sessions.
- One original shared expense, exact allocations, three obligations for a four-person expense, and auditable partial/full repayments. Amounts are integer minor units; database checks reinforce service rules.
- Scoped, frozen analytics snapshots. Public links use 256-bit random tokens; private links require the intended verified phone. Links are read-only, expiring, revocable, and access-logged.
- Camera/UPI confirmation with pending records; an Android Kotlin SMS inbox module with on-device parsing, explicit permission, and seven-day salted deduplication. iOS/browser/Expo Go show honest limitations.
- Bill photos from camera or photo library, free local OCR with editable total/item suggestions, and a separate five-column `TransactionItem` table. Item totals must match the expense; quantities, taxes, and discounts are supported.
- Purple/violet finance illustrations, a central mobile UPI scanner, Pip feedback for reading, saving, and corrections.
- Receipt upload/download endpoints with authorization, signed URLs, size/type validation, and quarantine. A real storage/scanning gateway plugs into the production adapter.
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

Demo public shares are in-memory previews for the current page session. Secure private links, durable shares, real authentication, synchronized receipt storage, and multiplayer consistency need API mode. Original seeded demo debt records are intentionally read-only for reversal experiments; create a new expense to test reversal.

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

The Android SMS module was authored but not compiled or tested on a device in this environment. Do not infer native build success from the successful web export.

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

No OCR API key or paid OCR provider is required. Choose **Add expense → Take bill photo / Choose bill photo → Read total & items**. Review suggestions, apply them, correct missing taxes/discounts, then save. A line total already includes its quantity. Saving rejects item totals that differ from the expense. Photos are optional; manual items also work.

Web OCR uses Tesseract.js locally and downloads the engine and English language data on first use. Native OCR uses bundled Android ML Kit and Apple Vision via the local `receipt-scanner` Expo module. Native scanning needs a rebuilt development app (`npm run android -w @settleup/mobile` or `npm run ios -w @settleup/mobile`), not Expo Go. Camera capture needs permission and browser HTTPS or localhost. Native hardware OCR and permission flows still need device verification.

Demo photos persist in account-scoped local storage (subject to device/browser quota); clearing demo account data removes them. API photos use the existing private storage adapter. If the expense saves but uploading the photo fails, retry attachment or open the saved expense without creating a duplicate. Drafts keep items but do not retain photo files. OCR is tuned for English/Latin printed bills and can misread complex layouts, blurry images or handwriting; review is required.

The second shared Figma finance kit is the primary visual inspiration: airy surfaces, pastel action tiles, and original outlined wallet illustrations. Pip's interaction feedback draws on the first reference. The finance reference's coin, wallet and privacy illustrations are bundled locally; see `apps/mobile/assets/finance/README.md` for source credits.
