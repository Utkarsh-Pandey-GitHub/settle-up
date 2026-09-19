import { z } from "zod";
export class TruecallerVerificationError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}
export const truecallerProofSchema = z
  .object({
    code: z.string().min(1).max(4096),
    codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
  })
  .strict();
/** Server-only. No app/database dependencies; the caller owns account/session creation. */
export async function verifyTruecallerAuthorization(
  input: unknown,
  clientId: string,
  fetcher: (url: string, options: RequestInit) => Promise<Response> = fetch,
): Promise<{ phone: string; suggestedName: string }> {
  if (!clientId.trim())
    throw new Error("Truecaller is not configured. Use phone verification.");
  const proof = truecallerProofSchema.parse(input);
  const providerRequest = async (url: string, options: RequestInit) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetcher(url, { ...options, signal: controller.signal });
      if (response.status === 429) throw new TruecallerVerificationError("TRUECALLER_RATE_LIMIT", "Truecaller is receiving too many attempts. Please wait or use an SMS code.", 429);
      if (response.status >= 500) throw new TruecallerVerificationError("TRUECALLER_UNAVAILABLE", "Truecaller is temporarily unavailable. Try again or use an SMS code.", 503);
      return response;
    } catch (error) {
      if (error instanceof TruecallerVerificationError) throw error;
      throw new TruecallerVerificationError("TRUECALLER_UNAVAILABLE", "Could not connect to Truecaller. Try again or use an SMS code.", 503);
    } finally { clearTimeout(timer); }
  };
  const tokenResponse = await providerRequest(
    "https://oauth-account-noneu.truecaller.com/v1/token",
    {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code: proof.code,
        code_verifier: proof.codeVerifier,
      }),
    },
  );
  if (!tokenResponse.ok)
    throw new TruecallerVerificationError(
      "TRUECALLER_TOKEN_REJECTED",
      "Truecaller verification expired or failed. Please try again.",
      401,
    );
  const token = z
    .object({
      access_token: z.string().min(1),
      token_type: z.literal("Bearer"),
    })
    .parse(await tokenResponse.json());
  const profileResponse = await providerRequest(
    "https://oauth-account-noneu.truecaller.com/v1/userinfo",
    {
      headers: { authorization: `Bearer ${token.access_token}` },
      redirect: "error",
    },
  );
  if (!profileResponse.ok)
    throw new TruecallerVerificationError(
      "TRUECALLER_PROFILE_REJECTED",
      "Could not verify your Truecaller profile. Use phone verification.",
      401,
    );
  const profile = z
    .object({
      sub: z.string().min(1),
      phone_number: z.string().regex(/^\+?[1-9]\d{6,14}$/),
      phone_number_verified: z.literal(true),
      given_name: z.string().max(100).optional(),
      family_name: z.string().max(100).optional(),
    })
    .parse(await profileResponse.json());
  return {
    phone: "+" + profile.phone_number.replace(/^\+/, ""),
    suggestedName: [profile.given_name, profile.family_name]
      .filter(Boolean)
      .join(" ")
      .slice(0, 100),
  };
}
