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

## Stytch and hosted login

The current SMS adapter uses `OTP_PROVIDER=stytch`, with server-only `STYTCH_PROJECT_ID` and `STYTCH_SECRET`. A `project-test-` ID selects the test environment; live credentials select production. Stytch generates and verifies the code; SettleUp reserves a five-minute challenge before sending and enforces its attempt and request limits. Do not configure Supabase Auth when using this adapter.

Stytch enables only US and Canada SMS by default. For Indian numbers, check the project's Country Code Allowlist for +91 and its messaging billing settings. Authentication pricing does not mean SMS delivery is free. See [messaging policy](https://stytch.com/docs/resources/policies/messaging/overview).

For Render, deploy this repository's API, then check `<service-url>/health` returns HTTP 200 with `{"status":"ok"}`. An HTML `Cannot GET /health` response is not the health route from this application. Set `EXPO_PUBLIC_API_URL` to the actual service URL, restart Metro (or rebuild the bundled app), and keep the mobile/server Truecaller client IDs identical. Running the local API has no effect while the app points at Render.

The blueprint uses generated signing secrets, Stytch credentials supplied through Render's secret environment settings, and an explicitly supplied `DATABASE_URL`. Existing services need their environment settings updated too; editing the blueprint alone does not change a live service. Keep the database password in environment settings and use the intended database/schema; this configuration does not copy local data. Redeploy after setting the variables. Never use development OTP or the sample signing secrets in production.

## Notifications

The worker implements the Expo push gateway adapter and a retrying notification outbox. Native permission is requested only from Settings. Configure your Expo project, APNs credentials and FCM credentials through your deployment process, set `EXPO_PUBLIC_EAS_PROJECT_ID` in the native app. Enabling notifications registers the Expo push token with `PATCH /notifications`. Without a project ID, local threshold reminders run on foreground data refresh. No credentials are embedded in the app.

Budget thresholds default to 50/80/100. Outbox keys include goal, period, and threshold to prevent creating duplicate jobs. Gateway acceptance is not a delivery receipt; production operations must process Expo push receipts and revoke invalid device tokens. Run one worker instance until a distributed claim/lease implementation is added.

## Native references used

- [Expo local native modules](https://docs.expo.dev/modules/get-started/)
- [Expo custom native code and development builds](https://docs.expo.dev/workflow/customizing/)
- [Expo permissions](https://docs.expo.dev/guides/permissions/)
- [Expo SDK 54 camera API](https://docs.expo.dev/versions/v54.0.0/sdk/camera/)

The repository's installed Expo SDK provides the authoritative compatible package list in `node_modules/expo/bundledNativeModules.json`. Native verification should use that matrix rather than installing unrelated latest peer versions.

## Bill vision

Set `OPENROUTER_API_KEY` only on the API server. `BILL_VISION_MODEL` defaults to `openrouter/free`, which routes to currently available free models that support the request. Free routing is rate-limited and availability can vary. The mobile app sends an authenticated JPEG or PNG data URL to `/bill/extract`; the server forwards it once with provider data collection disabled, returns company and invoice metadata, structured quantity-aware items, separated CGST/SGST/IGST/cess/VAT/fees/discounts, confidence and reconciliation warnings, and does not persist the image. Printed and handwritten bills use the same schema with stricter uncertainty rules for handwriting. Rotate any OpenRouter key that was ever embedded in or shipped with a mobile build.

The same server key can power SMS classification. Set `SMS_CLASSIFIER_MODEL=openrouter/free`. After Android permission is granted, monetary SMS candidates (excluding OTP messages) are sent in authenticated batches to `/sms/classify`. The model returns only confirmed debits/expenses; credits, reversals, failures, pending payments and promotions are discarded. OpenRouter data collection is disabled, the API does not persist message bodies, and local parsing is used when the free route is unavailable.

## Truecaller onboarding

Optional Android consent-based sign-in lives in `apps/mobile/modules/truecaller`, with a reusable native bridge, Expo configuration plugin and standalone server verifier. See its README for registration, client ID, signing fingerprints and reuse instructions. The app always retains OTP fallback. Android is implemented; iOS, desktop web and unsupported devices use the form. The API accepts only a one-use authorization code and PKCE verifier, exchanges them server-side, and requires a verified phone from Truecaller before issuing its own session. New users then review their display name and currency. No new tables are introduced.
