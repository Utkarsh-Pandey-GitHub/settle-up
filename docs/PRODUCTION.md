# Release gates and platform boundaries

## Android Play Store and OTA release runbook

The production Android application ID is `app.settleup.mobile`. Do not change it after the first Play Console upload. Production builds use an Android App Bundle, the `production` EAS environment, the `production` update channel, and the visible app version as the OTA runtime version. Preview builds remain installable APKs and receive only `preview` updates.

### One-time account setup

1. From `apps/mobile`, run `npx eas-cli@latest login`, then `npx eas-cli@latest whoami`. Confirm that project `1a6df8cb-0a63-48c1-9e5c-a1754f54f226` belongs to the intended Expo account.
2. In the Expo project dashboard, create the `production` environment values listed below. Client values are embedded in the application and must never contain server secrets.
3. In Play Console, create SettleUp with package name `app.settleup.mobile`. Enable Play App Signing.
4. Let EAS create and retain the Android upload keystore during the first production build. Download a backup with `npx eas-cli@latest credentials --platform android`; store it outside the repository.
5. Upload the first `.aab` manually to Play Console's Internal testing track. After Google has registered the application, create a Google Play service account, grant it release access, and upload its JSON key under the Expo project's Android service credentials. Never commit that JSON file.
6. Copy the SHA-1 of the **Play App Signing certificate** from Play Console → Setup → App integrity. Add it to the Truecaller app and the production Android Google OAuth client. The upload-key SHA-1 alone is insufficient for installations delivered by Play.

### EAS production environment

Set these in Expo Dashboard → Project → Environment variables → Production:

```text
EXPO_PUBLIC_API_URL=https://settleup-api-j248.onrender.com
EXPO_PUBLIC_DEMO=false
EXPO_PUBLIC_EAS_PROJECT_ID=1a6df8cb-0a63-48c1-9e5c-a1754f54f226
EXPO_PUBLIC_TRUECALLER_CLIENT_ID=<public Truecaller client ID>
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=<public Android OAuth client ID>
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<public web OAuth client ID, if Google sign-in uses it>
```

Do not put `JWT_SECRET`, `OTP_PEPPER`, database credentials, Supabase secret/service-role keys, Stytch secrets, Google service-account JSON, or `OPENROUTER_API_KEY` in any `EXPO_PUBLIC_` variable. Bill scanning sends the selected image through the authenticated API for one-time vision extraction; the app does not store it as a receipt.

### Production API gate

Before inviting Play testers, rotate every credential that has ever been pasted into chat or another public channel, including the database password, Supabase secret key, Stytch secret, OpenRouter key, `JWT_SECRET`, and `OTP_PEPPER`. Update Render with the rotated values, add `OPENROUTER_API_KEY` and `BILL_VISION_MODEL=openrouter/free`, and set `NODE_ENV=production`. Keep secrets only in Render's encrypted environment settings.

Use the Supabase session-pooler URL for `DATABASE_URL`, run `npm run db:migrate`, and verify `https://settleup-api-j248.onrender.com/health` after deployment. Set both `PUBLIC_APP_URL` and `CORS_ORIGIN` to `https://settleup.tinkrs.space`. Set `GOOGLE_CLIENT_IDS` to the comma-separated Android, iOS, and web OAuth client IDs; the web ID is required by the public deletion page. A sleeping free Render instance can delay account loading and Truecaller/OTP callbacks; use an always-on instance or another always-on host before a public launch.

### First store build

Run these commands locally from the repository root:

```bash
npx expo-doctor
cd apps/mobile/android
./gradlew :app:bundleRelease
```

The bundle is written to `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`. Upload it manually to Internal testing, complete App content and the store listing, and test authentication, Truecaller, Google sign-in, SMS review, bill vision, contacts, payment links, widgets, account deletion, and OTA delivery on the Play-installed build. Before each later Play upload, update `expo.version` and `expo.android.versionCode` in `apps/mobile/app.json`. The tracked `with-release-version.js` plugin makes local Gradle builds read the version name, version code, and generated `expo_runtime_version` from that file. Do not manually maintain a runtime string in Android resources. EAS uses local versioning with automatic increments disabled.

### Play Console declarations

- Complete the SMS and Call Log Permissions Declaration for `READ_SMS`, selecting **SMS-based money management**. Explain that SettleUp reads a bounded seven-day window on-device, filters financial debit/credit messages, uploads no raw SMS, requires review before creating a transaction, and retains only a salted handled-message fingerprint for the seven-day window.
- Publish the operator-completed privacy policy from `docs/PRIVACY.md` at a public HTTPS URL. Add the operator identity, support email, deletion request route, retention periods, subprocessors, and jurisdiction before publishing.
- Complete Data safety for phone number/account data, user-created financial entries, selected contacts, one-time bill processing, notification tokens, and optional SMS access. Match the answers to actual production providers and retention.
- Complete App access with a working reviewer account or review instructions, Content rating, Target audience, Ads declaration, Financial features declaration where shown, and the account deletion URL.
- Use `https://settleup.tinkrs.space/delete-account` as the Google Play account-deletion URL. Add `https://settleup.tinkrs.space` to the Web OAuth client's Authorized JavaScript origins; the page lets an existing user sign in with the Google account already linked to SettleUp and delete the account directly.
- Add the store icon, feature graphic, phone screenshots, short/full descriptions, support email, and privacy-policy URL.
- Personal Play developer accounts created after 13 November 2023 must complete a closed test with at least 12 continuously opted-in testers for 14 days, then apply for production access.

`READ_SMS` approval is case-by-case. If Google rejects the declaration, create a Play build without `READ_SMS` and the SMS inbox module; do not attempt to disguise the permission or its purpose.

### OTA updates after the store build

The store build must include `expo-updates`; old APKs cannot gain OTA support retroactively. For JavaScript, styling, and bundled-image changes that do not alter native code:

```bash
npx eas-cli@latest update --channel preview --environment preview --message "Describe the change"
```

Test that update on a preview build. Then publish the reviewed code to production:

```bash
npx eas-cli@latest update --channel production --environment production --message "Describe the change" --rollout-percentage 10
```

Increase the rollout with `npx eas-cli@latest update:edit`. Roll back with `npx eas-cli@latest update:rollback` if needed.

Create a new Play Store build whenever native code or native configuration changes, including Expo SDK upgrades, installed native modules, permissions, widgets, package identifiers, app icons, notification configuration, Truecaller configuration, or Android resources. Increment `expo.version` and `expo.android.versionCode` in `app.json` before that build; the native runtime and version name follow automatically. Keep that version unchanged for subsequent compatible OTAs. Version 1.0.20 uses runtime 1.0.20; older installed bundles with the stale 1.0.16 runtime must install the new Play release to receive 1.0.20 updates.

## Verified in this environment

The project passes TypeScript checking, Prisma validation, domain tests, and API tests when an isolated test database is enabled. Bill camera and provider behavior still require staging verification on a real device with the production API configuration.

These checks are not a substitute for a signed Android/iOS build or an independent security review.

## Before handling real financial records

- [ ] Review and resolve the npm audit report. Compatible patches were applied; Expo SDK 54/build tooling and some transitive packages still report upstream advisories. Avoid `npm audit fix --force` without a planned Expo/Prisma upgrade and native regression run. The development server must never be public-facing.
- [ ] Compile the local Kotlin module and verify permission granted/denied/revoked flows on real Android devices. Validate SMS eligibility under current app-store policy; use a no-SMS release flavor when ineligible.
- [ ] Build and test iOS on devices. Confirm there is no SMS request. Test contacts, SecureStore, camera, fonts, Dynamic Type, VoiceOver, dark mode, keyboard behavior, and app switching after opening UPI.
- [ ] Configure a real OTP gateway, separate generated secrets, regional sender requirements, provider outage handling, and anti-abuse controls. Add stronger recovery/step-up checks for SIM swaps, recycled numbers, and account deletion before broad rollout.
- [ ] Use TLS, a private database with encryption at rest, a least-privilege application role, encrypted backups, point-in-time recovery, and a tested restore procedure. Use a separate migration role. Enforce append-only audit retention at the database/operator level.
- [ ] Configure and monitor the bill vision provider. Confirm its data-retention terms, rate limits, regional processing, failure behavior, and privacy disclosure.
- [ ] Configure APNs/FCM/Expo push credentials, register device tokens, process push receipts, monitor retries and invalid tokens. The initial worker is single-instance and bounded; add distributed job claims and fair cursor batches before scaling it.
- [ ] Move OTP/link/IP rate limits to shared infrastructure for multi-instance API deployment. Configure trusted proxy hops explicitly; do not blindly trust forwarded headers.
- [ ] Replace full-dashboard data reads with indexed aggregate queries and paginated activity once accounts become large. Preserve complete scoped snapshots and exact totals during that change.
- [ ] Add operational metrics/traces without phone numbers, bill images, SMS contents or descriptions; configure actionable alerts, incident response, retention and access review.
- [ ] Complete independent IDOR, concurrent money mutation, replay, bill-processing, and share-token security review; run load and fault-injection tests.
- [ ] Publish an operator-specific privacy policy and store disclosures; document legitimate shared-history retention, free-text redaction, account recovery and data deletion SLAs.

## Implemented boundaries and follow-up scope

The core vertical slice is implemented: real OTP-backed authentication, isolated sessions, manual entries, shared allocations, obligations, settlements, disputes/reversals, account-scoped analytics, and scoped server snapshots. Secondary workflows include basic groups/tags/goals/contacts/settings and provider adapters.

The initial UI offers day/week/month/year goals, current-period sharing presets, group/tag filtering, manual incoming adjustments, cached dashboards, and retryable offline mutation queuing. The contract also accepts one-time/custom goal periods and share dates. A full recurrence editor, historical goal-period reporting, user-authored automatic-tag rules, translated catalogs, historical as-of debt analytics, conflict-resolution UI, and multi-device SMS deduplication are follow-up product work. Their absence is explicit; there are no fake successful buttons for unavailable providers.

The initial REST client uses shared TypeScript/Zod types for core requests and dashboard results. Metadata endpoints currently validate on the server and return inferred/simple JSON. Generate a complete OpenAPI/client SDK before exposing the API to third-party clients.

## Threat model notes

**Phone verification:** OTP guessing is limited per challenge/phone/IP. Digests are peppered, challenges expire, use is atomic, and tokens rotate with replay revocation. Residual risks include SIM swaps/recycled numbers and SMS provider compromise. A mobile phone number is a possession factor, not proof of a legal identity.

**Cross-account access:** The actor comes from the signed token and live session. Query predicates constrain financial rows. Mutations additionally check membership, ownership, currency, tags, version and user pairs. Device queries and storage keys contain the active account ID; switches cancel and clear prior query state.

**Shared links:** Use random 256-bit tokens, hashed lookup, generic denial messages, an explicit snapshot field allowlist, phone-bound private access, expiry checks on every read, revocation and access events. Read-only link holders may still copy what was intentionally shared.

**UPI:** Only `upi://pay` is accepted. Duplicate critical parameters, unsupported currencies, invalid addresses and untrusted schemes are rejected. The app reconstructs a minimal safe URI and requires confirmation. It never treats app launch as successful payment. Pending records use idempotency keys; the review locks after a processed code. Identical confirmed QRs reuse the request key and timestamp for two minutes across screen visits; native request metadata uses SecureStore. Longer-term merchant reconciliation still needs stable provider references.

**SMS:** Permission is explicit, scanning is bounded to recent messages, OTP messages are excluded, parsing is on-device, and every suggestion needs review. A salted fingerprint hides raw message text. Import suggestions are not authoritative bank records. Review must clearly distinguish income from a debt repayment.

**Receipts:** User ownership is checked before upload creation; file size/type, signature and single-use write are checked in the development adapter. Download authorization checks the associated transaction and ready state. Production must scan, quarantine, constrain storage presigns, and serve safe dispositions.

**Financial concurrency:** Serializability and idempotency guard duplicate writes and overpayment. Check constraints prohibit negative or self obligations. Partial unique indexes prevent duplicate reversals and open disputes. Services append corrections and audit events instead of destructively replacing posted amounts. Database superusers remain a privileged threat; operational controls must protect audit retention.
