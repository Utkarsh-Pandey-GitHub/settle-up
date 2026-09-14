# Reusable Truecaller authentication

Self-contained Expo Android bridge and framework-independent Node verification adapter. The folder has no imports from SettleUp. Copy it into another Expo application's `modules/truecaller` folder, add `./modules/truecaller/app.plugin.js` to its Expo plugins, and rebuild Android. `server.ts` belongs in your server runtime, never a mobile entry point.

## What is implemented

- Android OAuth SDK 3.2.1, a real provider-owned consent bottom sheet, random state validation and SHA-256 PKCE.
- A non-exported host activity, single pending request, two-minute timeout and cleanup on cancellation/destruction.
- Only `openid`, `phone` and `profile` scopes. No address-book, SMS or call permissions added by this module.
- Server-side authorization-code exchange against fixed Truecaller URLs, a verified-phone check, and minimal returned profile fields.
- Unavailable, declined or interrupted verification falls back to the app's phone-code form. Web, iOS and Expo Go use that form in this implementation; they do not show a fake Truecaller popup.

## Credentials and resources needed

1. Create an Android OAuth application in the [Truecaller developer console](https://verification-sdk-console.truecaller.com/).
2. Register the application name and package. This project uses **SettleUp** / **app.settleup.mobile**.
3. Register the signing certificate SHA-1 for each build: development/debug and production Google Play app-signing certificate. Never send a keystore, signing password, OTP or Truecaller password. Obtain development fingerprints with `cd apps/mobile/android && ./gradlew :app:signingReport`; production fingerprints are in Play Console's App integrity section.
4. Enable `openid`, `phone`, `profile` scopes and obtain the OAuth **client ID**. Complete any provider production review and business/branding information requested by the console.
5. Set the same client ID in **EXPO_PUBLIC_TRUECALLER_CLIENT_ID** at mobile build time and **TRUECALLER_CLIENT_ID** on the API. This public client ID is not a client secret. The documented Android PKCE token exchange does not require a client secret.
6. Set **EXPO_PUBLIC_DEMO=false** and **EXPO_PUBLIC_API_URL** to your reachable HTTPS backend. Production OTP fallback needs **OTP_GATEWAY_URL**, **OTP_GATEWAY_TOKEN**, **OTP_PROVIDER=gateway**, and the existing unique **JWT_SECRET** and **OTP_PEPPER**. Keep gateway tokens and signing secrets server-side.

Export the mobile environment variables into the build shell or provide them through your build environment. Re-run Expo prebuild after configuring the plugin (`npx expo prebuild --platform android`) and rebuild. Merely changing an environment file does not update an already-installed Android manifest. Use an Android development/release build, not Expo Go.

No public callback URL is required by this implemented Android authorization-code flow. Mobile-web and iOS Truecaller integrations are separate provider flows and are not enabled here. Do not reuse an Android client registration for an unrelated app/package; register each app and certificate.

## Client integration

```ts
import {
  authorizeWithTruecaller,
  truecallerAvailable,
} from "./modules/truecaller/client";
// SettleUp opens this once when the sign-in screen mounts on supported Android builds.
// The provider-owned sheet still requires the user to consent; cancellation reveals SMS OTP.
const proof = await authorizeWithTruecaller();
// Send proof to your own HTTPS backend. Do not log or persist it.
```

## Server integration

```ts
import { verifyTruecallerAuthorization } from "./truecaller/server";
const { phone, suggestedName } = await verifyTruecallerAuthorization(
  body,
  configuredClientId,
);
// Now create or find an account using this verified phone and issue your own session.
// Ask users to review the suggested name. Never trust a phone/profile posted by the client.
```

The host app owns rate limits, account-deletion rules, session storage, privacy disclosures and onboarding. SettleUp exposes `POST /auth/truecaller` and uses its existing account/session service; no schema additions are required. Provider tokens are discarded after profile verification. Authorization codes are single-use at the provider; failures require a new consent attempt.

## Verification and cost

`npm test` covers the server trust boundary. `npm run test:onboarding` runs the fallback journey against mocked HTTP responses, without sending SMS. The Android bridge has been compiled locally. Live popup verification still requires registered credentials and a real Android device with a usable Truecaller account.

No paid account or service was purchased. Confirm Truecaller's current commercial terms and production approval with your developer account; do not assume production verification or SMS is free. Local development OTP testing uses the existing allowlisted development provider.

## Official references

- [Android setup and client ID](https://docs.truecaller.com/truecaller-sdk/android/latest-oauth-sdk-3.2.1/integration-steps/setup)
- [State, scopes and PKCE](https://docs.truecaller.com/truecaller-sdk/android/oauth-sdk-3.2.0/integration-steps/setting-up-oauth-parameters)
- [Token exchange](https://docs.truecaller.com/truecaller-sdk/android/oauth-sdk-3.2.0/integration-steps/integrating-with-your-backend/fetching-user-token)
- [Verified profile](https://docs.truecaller.com/truecaller-sdk/android/oauth-sdk-3.2.0/integration-steps/integrating-with-your-backend/fetching-user-profile)

SettleUp no longer asks users to choose a Truecaller button first. The sign-in screen automatically opens the real consent bottom sheet once, and never reopens it while the user fills the SMS fallback form. Supabase SMS fallback is supported with `OTP_PROVIDER=supabase`; see `docs/PROVIDERS.md`.
