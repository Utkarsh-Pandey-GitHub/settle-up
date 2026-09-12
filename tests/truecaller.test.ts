import { describe, it, expect, vi } from "vitest";
import { verifyTruecallerAuthorization } from "../apps/mobile/modules/truecaller/server";
const proof = { code: "one-use-code", codeVerifier: "a".repeat(43) };
const profile = {
  sub: "user-123",
  phone_number: "919876543210",
  phone_number_verified: true,
  given_name: "Sam",
};
function provider(value: unknown = profile) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ access_token: "provider-token", token_type: "Bearer" }),
    )
    .mockResolvedValueOnce(Response.json(value));
}
describe("Truecaller server verification", () => {
  it("exchanges the proof server-side and trusts only the verified provider phone", async () => {
    const fetcher = provider();
    expect(
      await verifyTruecallerAuthorization(proof, "registered-client", fetcher),
    ).toEqual({ phone: "+919876543210", suggestedName: "Sam" });
    const body = fetcher.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get("client_id")).toBe("registered-client");
    expect(body.get("code_verifier")).toBe(proof.codeVerifier);
    expect(fetcher.mock.calls[1][1]?.headers).toEqual({
      authorization: "Bearer provider-token",
    });
  });
  it.each([false, undefined, "true"])(
    "rejects an unverified or ambiguous phone flag (%s)",
    async (verified) => {
      await expect(
        verifyTruecallerAuthorization(
          proof,
          "client",
          provider({ ...profile, phone_number_verified: verified }),
        ),
      ).rejects.toThrow();
    },
  );
  it("rejects client-supplied profiles and malformed PKCE without making requests", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      verifyTruecallerAuthorization(
        { ...proof, phone: "+919876543210" },
        "client",
        fetcher,
      ),
    ).rejects.toThrow();
    await expect(
      verifyTruecallerAuthorization(
        { ...proof, codeVerifier: "short" },
        "client",
        fetcher,
      ),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("fails closed for expired or replayed authorization codes", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("", { status: 403 }));
    await expect(
      verifyTruecallerAuthorization(proof, "client", fetcher),
    ).rejects.toThrow("expired or failed");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not contact Truecaller without configuration", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      verifyTruecallerAuthorization(proof, "", fetcher),
    ).rejects.toThrow("not configured");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
