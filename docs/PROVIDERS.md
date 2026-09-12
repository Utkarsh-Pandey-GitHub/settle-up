# Provider configuration

## OTP

`OtpProvider` has one operation: `send(phone, code)`. The development adapter returns generated codes through the auth response only for `DEV_PHONE_ALLOWLIST`. Production startup refuses that adapter and sample secrets.

Set:

```dotenv
NODE_ENV=production
OTP_PROVIDER=gateway
OTP_GATEWAY_URL=https://your-otp-gateway.example/send
OTP_GATEWAY_TOKEN=<secret>
JWT_SECRET=<unique 32+ character secret>
OTP_PEPPER=<different unique 32+ character secret>
```

The gateway receives an authenticated HTTPS JSON POST `{phone,code,expiresInSeconds:300}` and must return 2xx only when delivery is accepted. Implement this endpoint using your regional SMS provider's SDK and registered sender/template. The gateway should redact bodies, enforce timeouts, deduplicate delivery retries, and surface failure status. Store provider credentials in a secret manager, never `EXPO_PUBLIC_*` variables. The gateway does not verify codes: SettleUp verifies its own HMAC-protected challenge and attempt limit.

## Storage and malware scanning

`AttachmentProvider` supports `upload`, `download`, and `inspect`. Production uses:

```dotenv
STORAGE_PROVIDER=gateway
STORAGE_GATEWAY_URL=https://your-private-storage-gateway.example
STORAGE_GATEWAY_TOKEN=<secret>
```

Endpoints accept the same gateway Bearer token:

- POST `/upload`: `{objectKey,contentType,size,expiresInSeconds:300}` → `{url}`. Sign a private object upload constrained to this key, maximum size and exact content type. Object keys are random and do not reveal users.
- POST `/inspect`: `{objectKey}` → `{state:"READY"|"REJECTED"|"QUARANTINED"}`. Validate actual size, decode/signature consistency, and malware scanning. Never return READY before a clean verdict.
- POST `/download`: `{objectKey,expiresInSeconds:60}` → `{url}`. Private signed GET with safe content disposition and no active-content execution.

The development adapter stores files under the OS temp directory in `settleup-receipts`, checks file signatures and sizes, rejects reused uploads, and serves downloads as attachments. Files are temporary and are not a production backup strategy. There is no external upload in demo mode.

## Notifications

The worker implements the Expo push gateway adapter and a retrying notification outbox. Native permission is requested only from Settings. Configure your Expo project, APNs credentials and FCM credentials through your deployment process, set `EXPO_PUBLIC_EAS_PROJECT_ID` in the native app. Enabling notifications registers the Expo push token with `PATCH /notifications`. Without a project ID, local threshold reminders run on foreground data refresh. No credentials are embedded in the app.

Budget thresholds default to 50/80/100. Outbox keys include goal, period, and threshold to prevent creating duplicate jobs. Gateway acceptance is not a delivery receipt; production operations must process Expo push receipts and revoke invalid device tokens. Run one worker instance until a distributed claim/lease implementation is added.

## Native references used

- [Expo local native modules](https://docs.expo.dev/modules/get-started/)
- [Expo custom native code and development builds](https://docs.expo.dev/workflow/customizing/)
- [Expo permissions](https://docs.expo.dev/guides/permissions/)
- [Expo SDK 54 camera API](https://docs.expo.dev/versions/v54.0.0/sdk/camera/)

The repository's installed Expo SDK provides the authoritative compatible package list in `node_modules/expo/bundledNativeModules.json`. Native verification should use that matrix rather than installing unrelated latest peer versions.

## Free receipt OCR

No API keys: Tesseract.js runs in a browser worker, bundled ML Kit handles Android, and Apple's Vision framework handles iOS. The bill image is processed locally. Web downloads OCR code/WASM/English data from the engine's default CDN locations on first use; self-host those engine assets if deployment policy requires it. This is separate from attaching the photo to a saved expense, which uploads in API mode.

- [Tesseract.js and its Apache-2.0 license](https://github.com/naptha/tesseract.js)
- [Bundled Android ML Kit text recognition](https://developers.google.com/ml-kit/vision/text-recognition/v2/android)
- [Apple Vision text recognition](https://developer.apple.com/documentation/vision/recognizing-text-in-images)
- [Expo SDK 54 image picker](https://docs.expo.dev/versions/v54.0.0/sdk/imagepicker/)

The free local demo and local API need no new provider credentials. Existing production SMS and storage integrations may have operational costs; this change adds no paid OCR service.

## Truecaller onboarding

Optional Android consent-based sign-in lives in `apps/mobile/modules/truecaller`, with a reusable native bridge, Expo configuration plugin and standalone server verifier. See its README for registration, client ID, signing fingerprints and reuse instructions. The app always retains OTP fallback. Android is implemented; iOS, desktop web and unsupported devices use the form. The API accepts only a one-use authorization code and PKCE verifier, exchanges them server-side, and requires a verified phone from Truecaller before issuing its own session. New users then review their display name and currency. No new tables are introduced.
