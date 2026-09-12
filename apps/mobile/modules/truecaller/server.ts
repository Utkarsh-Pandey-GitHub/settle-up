import { z } from "zod";
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
  const tokenResponse = await fetcher(
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
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!tokenResponse.ok)
    throw new Error(
      "Truecaller verification expired or failed. Please try again.",
    );
  const token = z
    .object({
      access_token: z.string().min(1),
      token_type: z.literal("Bearer"),
    })
    .parse(await tokenResponse.json());
  const profileResponse = await fetcher(
    "https://oauth-account-noneu.truecaller.com/v1/userinfo",
    {
      headers: { authorization: `Bearer ${token.access_token}` },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!profileResponse.ok)
    throw new Error(
      "Could not verify your Truecaller profile. Use phone verification.",
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
