# Release gates and platform boundaries

## Verified in this environment

The project passes TypeScript checking, PostgreSQL migration execution, 17 API integration tests, 35 domain/parser/contract tests, and an Expo web export. Browser verification covers desktop/phone journeys, photo persistence, itemisation, actual local Tesseract OCR, and JPEG camera capture with a simulated webcam. Native autolinking discovers the receipt scanner on Android and Apple and the SMS module on Android. Native OCR and hardware permission behavior still require a compiled development build and real-device verification.

These checks are not a substitute for a signed Android/iOS build or an independent security review.

## Before handling real financial records

- [ ] Review and resolve the npm audit report. Compatible patches were applied; Expo SDK 54/build tooling and some transitive packages still report upstream advisories. Avoid `npm audit fix --force` without a planned Expo/Prisma upgrade and native regression run. The development server must never be public-facing.
- [ ] Compile the local Kotlin module and verify permission granted/denied/revoked flows on real Android devices. Validate SMS eligibility under current app-store policy; use a no-SMS release flavor when ineligible.
- [ ] Build and test iOS on devices. Confirm there is no SMS request. Test contacts, SecureStore, camera, fonts, Dynamic Type, VoiceOver, dark mode, keyboard behavior, and app switching after opening UPI.
- [ ] Configure a real OTP gateway, separate generated secrets, regional sender requirements, provider outage handling, and anti-abuse controls. Add stronger recovery/step-up checks for SIM swaps, recycled numbers, and account deletion before broad rollout.
- [ ] Use TLS, a private database with encryption at rest, a least-privilege application role, encrypted backups, point-in-time recovery, and a tested restore procedure. Use a separate migration role. Enforce append-only audit retention at the database/operator level.
- [ ] Configure receipt storage and malware scanning. Never treat the development file-signature mock as a scanner. Add orphan cleanup, retention and privacy redaction processes.
- [ ] Configure APNs/FCM/Expo push credentials, register device tokens, process push receipts, monitor retries and invalid tokens. The initial worker is single-instance and bounded; add distributed job claims and fair cursor batches before scaling it.
- [ ] Move OTP/link/IP rate limits to shared infrastructure for multi-instance API deployment. Configure trusted proxy hops explicitly; do not blindly trust forwarded headers.
- [ ] Replace full-dashboard data reads with indexed aggregate queries and paginated activity once accounts become large. Preserve complete scoped snapshots and exact totals during that change.
- [ ] Add operational metrics/traces without phone numbers, receipt URLs, SMS contents or descriptions; configure actionable alerts, incident response, retention and access review.
- [ ] Complete independent IDOR, concurrent money mutation, replay, attachment, and share-token security review; run load and fault-injection tests.
- [ ] Publish an operator-specific privacy policy and store disclosures; document legitimate shared-history retention, free-text redaction, account recovery and data deletion SLAs.

## Implemented boundaries and follow-up scope

The core vertical slice is implemented: real OTP-backed authentication, isolated sessions, manual entries, shared allocations, obligations, settlements, disputes/reversals, account-scoped analytics, and scoped server snapshots. Secondary workflows include basic groups/tags/goals/contacts/settings and provider adapters.

The initial UI offers day/week/month/year goals, current-period sharing presets, group/tag filtering, and manual incoming adjustments. The contract also accepts one-time/custom goal periods and share dates. A full recurrence editor, historical goal-period reporting, richer group membership administration, user-authored automatic-tag rules, translated catalogs, historical as-of debt analytics, full offline queued synchronization, and multi-device SMS deduplication are follow-up product work. Their absence is explicit; there are no fake successful buttons for unavailable providers.

The initial REST client uses shared TypeScript/Zod types for core requests and dashboard results. Metadata endpoints currently validate on the server and return inferred/simple JSON. Generate a complete OpenAPI/client SDK before exposing the API to third-party clients.

## Threat model notes

**Phone verification:** OTP guessing is limited per challenge/phone/IP. Digests are peppered, challenges expire, use is atomic, and tokens rotate with replay revocation. Residual risks include SIM swaps/recycled numbers and SMS provider compromise. A mobile phone number is a possession factor, not proof of a legal identity.

**Cross-account access:** The actor comes from the signed token and live session. Query predicates constrain financial rows. Mutations additionally check membership, ownership, currency, tags, version and user pairs. Device queries and storage keys contain the active account ID; switches cancel and clear prior query state.

**Shared links:** Use random 256-bit tokens, hashed lookup, generic denial messages, an explicit snapshot field allowlist, phone-bound private access, expiry checks on every read, revocation and access events. Read-only link holders may still copy what was intentionally shared.

**UPI:** Only `upi://pay` is accepted. Duplicate critical parameters, unsupported currencies, invalid addresses and untrusted schemes are rejected. The app reconstructs a minimal safe URI and requires confirmation. It never treats app launch as successful payment. Pending records use idempotency keys; the review locks after a processed code. Identical confirmed QRs reuse the request key and timestamp for two minutes across screen visits; native request metadata uses SecureStore. Longer-term merchant reconciliation still needs stable provider references.

**SMS:** Permission is explicit, scanning is bounded to recent messages, OTP messages are excluded, parsing is on-device, and every suggestion needs review. A salted fingerprint hides raw message text. Import suggestions are not authoritative bank records. Review must clearly distinguish income from a debt repayment.

**Receipts:** User ownership is checked before upload creation; file size/type, signature and single-use write are checked in the development adapter. Download authorization checks the associated transaction and ready state. Production must scan, quarantine, constrain storage presigns, and serve safe dispositions.

**Financial concurrency:** Serializability and idempotency guard duplicate writes and overpayment. Check constraints prohibit negative or self obligations. Partial unique indexes prevent duplicate reversals and open disputes. Services append corrections and audit events instead of destructively replacing posted amounts. Database superusers remain a privileged threat; operational controls must protect audit retention.
