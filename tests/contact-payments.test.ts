import "dotenv/config";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createApp } from "../apps/api/src/app";
import { db, digest } from "../apps/api/src/infra/database";
import { AuthService } from "../apps/api/src/auth/service";
import type { Session } from "@settleup/contracts";
// Run only against the isolated schema created by the validation command.
describe.runIf(process.env.RUN_FEATURE_DB_TESTS === "1")("contact groups and app payment links", () => {
  let app: Awaited<ReturnType<typeof createApp>>, owner: Session, other: Session;
  const call = (url: string, payload: Record<string, unknown>, session = owner) => app.inject({ method: "POST", url, payload, headers: { authorization: `Bearer ${session.accessToken}` } });
  beforeAll(async () => {
    app = await createApp();
    owner = await new AuthService().signInWithVerifiedPhone("+919876540001");
    other = await new AuthService().signInWithVerifiedPhone("+919876540002");
  });
  afterAll(async () => { await app?.close(); await db.$disconnect(); });
  it("creates peer and pending member atomically, deduplicates, and claims only after verification", async () => {
    const contact = { name: "My friend", phone: "+919876540003" };
    const result = await call("/groups", { name: "Trip", currency: "INR", contacts: [contact, contact] });
    expect(result.statusCode).toBe(200);
    const identity = await db.phoneIdentity.findUniqueOrThrow({ where: { phone: contact.phone } });
    expect(identity.verifiedAt).toBeNull();
    expect(await db.deviceSession.count({ where: { userId: identity.userId } })).toBe(0);
    expect(await db.groupMember.count({ where: { groupId: result.json().id } })).toBe(2);
    expect(await db.contactPeer.count({ where: { ownerId: owner.account.id, linkedUserId: identity.userId } })).toBe(1);
    const session = await new AuthService().signInWithVerifiedPhone(contact.phone);
    expect(session.account.id).toBe(identity.userId);
    expect(session.account.name).toBe("New friend");
    expect((await db.phoneIdentity.findUniqueOrThrow({ where: { phone: contact.phone } })).verifiedAt).not.toBeNull();
    expect(await db.tag.count({ where: { ownerId: identity.userId } })).toBe(6);
  });
  it("supports an existing unlinked peer selected by its contact ID", async () => {
    const peer = await db.contactPeer.create({ data: { ownerId: owner.account.id, name: "Existing contact", phone: "+919876540004" } });
    const result = await call("/groups", { name: "Weekend", currency: "INR", memberIds: [peer.id] });
    expect(result.statusCode).toBe(200);
    expect((await db.contactPeer.findUniqueOrThrow({ where: { id: peer.id } })).linkedUserId).toBeTruthy();
  });
  it("refuses blocks and rolls back other contacts when any member fails", async () => {
    await db.userBlock.create({ data: { blockerId: other.account.id, blockedId: owner.account.id } });
    const result = await call("/groups", { name: "Blocked", currency: "INR", contacts: [{ name: "Rollback", phone: "+919876540005" }, { name: "Other", phone: other.account.phone }] });
    expect(result.statusCode).toBe(403);
    expect(await db.phoneIdentity.findUnique({ where: { phone: "+919876540005" } })).toBeNull();
  });
  it("concurrent group creators reuse one pending phone identity", async () => {
    const contact = { name: "Shared contact", phone: "+919876540006" };
    const results = await Promise.all([
      call("/groups", { name: "First", currency: "INR", contacts: [contact] }, owner),
      call("/groups", { name: "Second", currency: "INR", contacts: [contact] }, other),
    ]);
    expect(results.map(r => r.statusCode)).toEqual([200, 200]);
    const identity = await db.phoneIdentity.findUniqueOrThrow({ where: { phone: contact.phone } });
    expect(await db.contactPeer.count({ where: { linkedUserId: identity.userId } })).toBe(2);
    expect(identity.verifiedAt).toBeNull();
  });
  it("Supabase OTP claims a local challenge once even under simultaneous verification", async () => {
    vi.stubEnv("OTP_PROVIDER", "supabase");
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test");
    const phone = "+919876540007";
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) =>
      Response.json(String(url).endsWith("/otp") ? {} : { user: { id: "verified-user", phone, phone_confirmed_at: new Date().toISOString() } }));
    vi.stubGlobal("fetch", fetcher);
    try {
      const auth = new AuthService();
      const challenge = await auth.requestOtp(phone);
      expect(challenge).not.toHaveProperty("developmentCode");
      const results = await Promise.allSettled([auth.verifyOtp(challenge.challengeId, "123456"), auth.verifyOtp(challenge.challengeId, "123456")]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      const identity = await db.phoneIdentity.findUniqueOrThrow({ where: { phone } });
      expect(await db.deviceSession.count({ where: { userId: identity.userId } })).toBe(1);
      const calls = fetcher.mock.calls.length;
      await expect(auth.verifyOtp(challenge.challengeId, "123456")).rejects.toMatchObject({ code: "OTP_INVALID" });
      expect(fetcher).toHaveBeenCalledTimes(calls);
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });
  it("Supabase OTP enforces the five-attempt limit without sending extra verification requests", async () => {
    vi.stubEnv("OTP_PROVIDER", "supabase"); vi.stubEnv("SUPABASE_URL", "https://test.supabase.co"); vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test");
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async url => String(url).endsWith("/otp") ? Response.json({}) : Response.json({}, { status: 400 }));
    vi.stubGlobal("fetch", fetcher);
    try {
      const auth = new AuthService(), challenge = await auth.requestOtp("+919876540008");
      for (let i = 0; i < 6; i++) await expect(auth.verifyOtp(challenge.challengeId, "000000")).rejects.toMatchObject({ code: "OTP_INVALID" });
      expect(fetcher).toHaveBeenCalledTimes(6); // One send, five verifications.
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });
  it("requires auth, validates amounts/UPI, stores a hashed token, hides details on landing, and expires", async () => {
    expect((await app.inject({ method: "POST", url: "/payment-links", payload: {} })).statusCode).toBe(401);
    for (const body of [{ upiId: "bad", amountMinor: 100, payeeName: "Sam" }, { upiId: "sam@bank", amountMinor: -1, payeeName: "Sam" }])
      expect((await call("/payment-links", body)).statusCode).toBe(400);
    const created = await call("/payment-links", { upiId: "sam@bank", amountMinor: 12550, payeeName: "Sam" });
    expect(created.statusCode).toBe(200);
    const { token, appUrl } = created.json();
    expect(appUrl).toBe(`settleup:///pay/${token}`);
    expect(appUrl).not.toContain("sam");
    expect(await db.paymentLink.findUnique({ where: { tokenDigest: digest(token) } })).toBeTruthy();
    expect((await app.inject(`/payment-links/${token}`)).statusCode).toBe(401);
    const resolved = await app.inject({ url: `/payment-links/${token}`, headers: { authorization: `Bearer ${other.accessToken}` } });
    expect(resolved.json().amountMinor).toBe(12550);
    expect(resolved.json().payeeAddress).toBe("sam@bank");
    const landing = await app.inject(`/p/${token}`);
    expect(landing.body).toContain("Open in SettleUp");
    expect(landing.body).not.toContain("sam@bank");
    await db.paymentLink.update({ where: { tokenDigest: digest(token) }, data: { expiresAt: new Date(0) } });
    expect((await app.inject({ url: `/payment-links/${token}`, headers: { authorization: `Bearer ${owner.accessToken}` } })).statusCode).toBe(404);
    expect((await app.inject(`/p/${token}`)).statusCode).toBe(404);
  });
});
