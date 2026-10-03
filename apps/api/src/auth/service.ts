import {
  randomInt,
  randomBytes,
  randomUUID,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { SignJWT, createRemoteJWKSet, jwtVerify } from "jose";
import { SupabaseOtpProvider } from "./supabase";
import { StytchOtpProvider } from "./stytch";
import { DomainError, normalizePhone } from "@settleup/domain";
import type { Account, Session } from "@settleup/contracts";
import { db, atomic, digest, audit, type Db } from "../infra/database";

export interface OtpProvider {
  send(phone: string, code: string): Promise<void>;
}
export class GatewayOtpProvider implements OtpProvider {
  async send(phone: string, code: string) {
    const endpoint = process.env.OTP_GATEWAY_URL;
    if (!endpoint?.startsWith("https://") || !process.env.OTP_GATEWAY_TOKEN)
      throw new Error("Configure a secure OTP gateway.");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OTP_GATEWAY_TOKEN}`,
      },
      body: JSON.stringify({ phone, code, expiresInSeconds: 300 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new DomainError(
        "OTP_DELIVERY",
        "Unable to deliver a code. Please try again later.",
        503,
      );
  }
}
class DevelopmentOtpProvider implements OtpProvider {
  async send() {}
}

const secret = () =>
  new TextEncoder().encode(
    process.env.JWT_SECRET ||
      "settleup_jwt_secret_production_key_min_32_characters_long_123",
  );
const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const otpHash = (id: string, code: string) =>
  createHmac(
    "sha256",
    process.env.OTP_PEPPER ||
      "settleup_otp_pepper_production_key_min_32_characters_long_456",
  )
    .update(`${id}:${code}`)
    .digest("hex");
export function validateConfig() {
  const production = process.env.NODE_ENV === "production";
  if (production) {
    if (
      !process.env.JWT_SECRET ||
      /production_key_min_32|replace-with/.test(process.env.JWT_SECRET)
    )
      throw new Error(
        "Configure a unique JWT_SECRET before starting production.",
      );
  }
  if (!process.env.JWT_SECRET)
    process.env.JWT_SECRET =
      "settleup_jwt_secret_production_key_min_32_characters_long_123";
  for (const key of ["JWT_SECRET"])
    if ((process.env[key]?.length ?? 0) < 32)
      throw new Error(`${key} must contain at least 32 characters.`);
}
export class AuthService {
  async signInWithGoogle(
    idToken: string,
    rawPhone?: string,
    linkUserId?: string,
  ) {
    const audiences = (process.env.GOOGLE_CLIENT_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!audiences.length)
      throw new DomainError(
        "GOOGLE_DISABLED",
        "Google sign-in is not configured yet. Use phone verification.",
        503,
      );
    let claims;
    try {
      ({ payload: claims } = await jwtVerify(idToken, googleKeys, {
        audience: audiences,
        issuer: ["accounts.google.com", "https://accounts.google.com"],
        algorithms: ["RS256"],
      }));
    } catch {
      throw new DomainError(
        "GOOGLE_INVALID",
        "Google could not verify this sign-in. Please try again.",
        401,
      );
    }
    if (!claims.sub || claims.email_verified !== true)
      throw new DomainError(
        "GOOGLE_INVALID",
        "Use a verified Google account to continue.",
        401,
      );
    const suggestedName =
      typeof claims.name === "string" ? claims.name.trim().slice(0, 100) : "";
    const email =
      typeof claims.email === "string" ? claims.email.slice(0, 254) : null;
    const avatar =
      typeof claims.picture === "string" ? claims.picture.slice(0, 500) : null;
    const phone = rawPhone ? normalizePhone(rawPhone) : undefined;
    const session = await atomic(async (tx) => {
      let identity = await tx.googleIdentity.findUnique({
        where: { subject: claims.sub! },
        include: { user: { include: { phone: true } } },
      });
      if (identity?.user.deletedAt) return null;
      if (linkUserId) {
        if (identity && identity.userId !== linkUserId)
          throw new DomainError(
            "GOOGLE_IN_USE",
            "This Google account is already linked to another SettleUp account.",
            409,
          );
        if (!identity)
          await tx.user.update({
            where: { id: linkUserId },
            data: {
              google: { create: { subject: claims.sub! } },
              profile: { update: { email } },
            },
          });
        return this.newSession(tx, linkUserId, randomUUID());
      }
      if (identity && phone) {
        if (identity.user.phone && identity.user.phone.phone !== phone)
          throw new DomainError(
            "PHONE_LOCKED",
            "This Google account is already tied to another phone number.",
            409,
          );
        if (!identity.user.phone) {
          const occupied = await tx.phoneIdentity.findUnique({
            where: { phone },
          });
          if (occupied && occupied.userId !== identity.userId)
            throw new DomainError(
              "PHONE_IN_USE",
              "This phone number already belongs to another account.",
              409,
            );
          await tx.phoneIdentity.create({
            data: { userId: identity.userId, phone, verifiedAt: null },
          });
        }
      }
      if (!identity) {
        if (!phone)
          throw new DomainError(
            "PHONE_REQUIRED",
            "Enter your phone number before continuing with Google.",
          );
        const occupied = await tx.phoneIdentity.findUnique({
          where: { phone },
          include: { user: { include: { google: true } } },
        });
        if (occupied?.verifiedAt)
          throw new DomainError(
            "PHONE_VERIFICATION_REQUIRED",
            "This number is already verified. Continue with Truecaller once, then link Google from Settings.",
            409,
          );
        if (occupied?.user.google)
          throw new DomainError(
            "PHONE_IN_USE",
            "This phone number is already tied to another Google account.",
            409,
          );
        const user = occupied
          ? await tx.user.update({
              where: { id: occupied.userId },
              data: {
                google: { create: { subject: claims.sub! } },
                profile: { update: { email, avatar } },
              },
            })
          : await tx.user.create({
              data: {
                profile: { create: { name: "New friend", email, avatar } },
                phone: { create: { phone, verifiedAt: null } },
                google: { create: { subject: claims.sub! } },
                notifications: { create: {} },
                tags: {
                  create: [
                    { name: "Food", color: "#8576AA" },
                    { name: "Transport", color: "#8576AA" },
                    { name: "Shopping", color: "#8576AA" },
                    { name: "Travel", color: "#8576AA" },
                    { name: "Utilities", color: "#8576AA" },
                    { name: "Rent", color: "#8576AA" },
                  ],
                },
              },
            });
        identity = await tx.googleIdentity.findUniqueOrThrow({
          where: { userId: user.id },
          include: { user: { include: { phone: true } } },
        });
      }
      return this.newSession(tx, identity!.userId, randomUUID());
    });
    if (!session)
      throw new DomainError(
        "UNAUTHORIZED",
        "This account is unavailable.",
        401,
      );
    return { ...session, suggestedName };
  }

  async requestOtp(rawPhone: string) {
    const phone = normalizePhone(rawPhone);
    if (process.env.OTP_PROVIDER === "disabled")
      throw new DomainError(
        "OTP_DISABLED",
        "SMS sign-in is not enabled. Continue with Truecaller.",
        503,
      );
    const supabase = process.env.OTP_PROVIDER === "supabase";
    const stytch = process.env.OTP_PROVIDER === "stytch";
    const dev = process.env.OTP_PROVIDER === "development";
    if (
      dev &&
      !(process.env.DEV_PHONE_ALLOWLIST ?? "").split(",").includes(phone)
    )
      throw new DomainError(
        "DEVELOPMENT_PHONE",
        "Use a configured development phone number.",
      );
    const code = randomInt(100000, 1000000).toString();
    const id = randomUUID();
    await atomic(async (tx) => {
      const recent = await tx.otpChallenge.count({
        where: { phone, createdAt: { gt: new Date(Date.now() - 15 * 60000) } },
      });
      if (recent >= 4)
        throw new DomainError(
          "RATE_LIMIT",
          "Please wait before requesting another code.",
          429,
        );
      await tx.otpChallenge.create({
        data: {
          id,
          phone,
          digest: supabase
            ? "supabase"
            : stytch
              ? "stytch-pending"
              : otpHash(id, code),
          expiresAt: new Date(Date.now() + 300000),
        },
      });
    });
    try {
      if (supabase) await new SupabaseOtpProvider().send(phone);
      else if (stytch) {
        const methodId = await new StytchOtpProvider().send(phone);
        await db.otpChallenge.update({
          where: { id },
          data: { digest: `stytch:${methodId}` },
        });
      } else
        await (
          dev ? new DevelopmentOtpProvider() : new GatewayOtpProvider()
        ).send(phone, code);
    } catch (e) {
      await db.otpChallenge.update({
        where: { id },
        data: { consumedAt: new Date() },
      });
      throw e;
    }
    return {
      challengeId: id,
      expiresInSeconds: 300,
      ...(dev ? { developmentCode: code } : {}),
    };
  }
  async verifyOtp(id: string, code: string): Promise<Session> {
    if (process.env.OTP_PROVIDER === "supabase")
      return this.verifySupabaseOtp(id, code);
    if (process.env.OTP_PROVIDER === "stytch")
      return this.verifyStytchOtp(id, code);
    if (process.env.OTP_PROVIDER === "disabled")
      throw new DomainError(
        "OTP_DISABLED",
        "SMS sign-in is not enabled. Continue with Truecaller.",
        503,
      );
    const result = await atomic(async (tx) => {
      const c = await tx.otpChallenge.findUnique({ where: { id } });
      if (
        !c ||
        !/^[a-f0-9]{64}$/.test(c.digest) ||
        c.consumedAt ||
        c.expiresAt <= new Date() ||
        c.attempts >= 5
      )
        return null;
      await tx.otpChallenge.update({
        where: { id },
        data: { attempts: { increment: 1 } },
      });
      if (
        !timingSafeEqual(
          Buffer.from(c.digest, "hex"),
          Buffer.from(otpHash(id, code), "hex"),
        )
      )
        return null;
      await tx.otpChallenge.update({
        where: { id },
        data: { consumedAt: new Date() },
      });
      return this.verifiedPhoneSession(tx, c.phone);
    });
    if (!result)
      throw new DomainError(
        "OTP_INVALID",
        "The code is invalid or expired.",
        401,
      );
    return result;
  }
  private async verifySupabaseOtp(id: string, code: string): Promise<Session> {
    const invalid = () =>
      new DomainError("OTP_INVALID", "The code is invalid or expired.", 401);
    const challenge = await atomic(async (tx) => {
      const c = await tx.otpChallenge.findUnique({ where: { id } });
      if (
        !c ||
        c.digest !== "supabase" ||
        c.consumedAt ||
        c.expiresAt <= new Date() ||
        c.attempts >= 5
      )
        return null;
      await tx.otpChallenge.update({
        where: { id },
        data: { attempts: { increment: 1 } },
      });
      return c;
    });
    if (!challenge) throw invalid();
    // Do not hold a database transaction open while contacting the provider.
    const phone = await new SupabaseOtpProvider().verify(challenge.phone, code);
    const session = await atomic(async (tx) => {
      const claimed = await tx.otpChallenge.updateMany({
        where: {
          id,
          digest: "supabase",
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (claimed.count !== 1) return null;
      return this.verifiedPhoneSession(tx, phone);
    });
    if (!session) throw invalid();
    return session;
  }
  private async verifyStytchOtp(id: string, code: string): Promise<Session> {
    const invalid = () =>
      new DomainError("OTP_INVALID", "The code is invalid or expired.", 401);
    const challenge = await atomic(async (tx) => {
      const c = await tx.otpChallenge.findUnique({ where: { id } });
      if (
        !c ||
        !c.digest.startsWith("stytch:") ||
        c.consumedAt ||
        c.expiresAt <= new Date() ||
        c.attempts >= 5
      )
        return null;
      await tx.otpChallenge.update({
        where: { id },
        data: { attempts: { increment: 1 } },
      });
      return c;
    });
    if (!challenge) throw invalid();
    // Extract the Stytch phone_id stored during requestOtp.
    const methodId = challenge.digest.slice("stytch:".length);
    // Do not hold a database transaction open while contacting the provider.
    const phone = await new StytchOtpProvider().verify(methodId, code);
    if (phone !== challenge.phone) throw invalid();
    const session = await atomic(async (tx) => {
      const claimed = await tx.otpChallenge.updateMany({
        where: { id, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      if (claimed.count !== 1) return null;
      return this.verifiedPhoneSession(tx, phone);
    });
    if (!session) throw invalid();
    return session;
  }
  // Only call after OTP consumption or server-side provider verification.
  async verifiedPhoneSession(
    tx: Db,
    rawPhone: string,
  ): Promise<Session | null> {
    const phone = normalizePhone(rawPhone);
    let identity = await tx.phoneIdentity.findUnique({
      where: { phone: phone },
      include: { user: { include: { profile: true } } },
    });
    if (identity?.user.deletedAt) return null;
    if (!identity) {
      const user = await tx.user.create({
        data: {
          profile: { create: { name: "New friend" } },
          phone: { create: { phone: phone, verifiedAt: new Date() } },
          notifications: { create: {} },
          tags: {
            create: [
              { name: "Food", color: "#D946EF" },
              { name: "Transport", color: "#F59E0B" },
              { name: "Shopping", color: "#6D7CE0" },
              { name: "Travel", color: "#22A381" },
              { name: "Utilities", color: "#FB7185" },
              { name: "Rent", color: "#A78BFA" },
            ],
          },
        },
      });
      identity = await tx.phoneIdentity.findUniqueOrThrow({
        where: { userId: user.id },
        include: { user: { include: { profile: true } } },
      });
    }
    const newlyVerified = !identity.verifiedAt;
    if (newlyVerified) {
      // Reached only after OTP or Truecaller proof has been verified.
      await tx.phoneIdentity.update({
        where: { userId: identity.userId },
        data: { verifiedAt: new Date() },
      });
      await tx.notificationPreference.upsert({
        where: { userId: identity.userId },
        create: { userId: identity.userId },
        update: {},
      });
      await tx.tag.createMany({
        skipDuplicates: true,
        data: [
          "Food",
          "Transport",
          "Shopping",
          "Travel",
          "Utilities",
          "Rent",
        ].map((name) => ({
          ownerId: identity!.userId,
          name,
          color: "#8576AA",
        })),
      });
    }
    const needsOnboarding = identity.user.profile?.name === "New friend";
    const session = await this.newSession(tx, identity.userId, randomUUID());
    return needsOnboarding ? { ...session, needsOnboarding: true } : session;
  }
  async signInWithVerifiedPhone(phone: string): Promise<Session> {
    const session = await atomic((tx) => this.verifiedPhoneSession(tx, phone));
    if (!session)
      throw new DomainError(
        "UNAUTHORIZED",
        "This account is unavailable.",
        401,
      );
    return session;
  }
  async newSession(tx: Db, userId: string, familyId: string): Promise<Session> {
    const refreshToken = randomBytes(48).toString("base64url");
    const session = await tx.deviceSession.create({
      data: {
        userId,
        familyId,
        refreshDigest: digest(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      include: { profile: true, phone: true },
    });
    const accessToken = await new SignJWT({ sid: session.id })
      .setSubject(userId)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("settleup")
      .setAudience("settleup-mobile")
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(secret());
    const account: Account = {
      id: userId,
      name: user.profile!.name,
      phone: user.phone?.phone ?? "",
      currency: user.profile!.currency,
      avatar:
        user.profile!.avatar ?? user.profile!.name.slice(0, 2).toUpperCase(),
    };
    return { accessToken, refreshToken, account };
  }
  async refresh(token: string) {
    const result = await atomic(async (tx) => {
      const old = await tx.deviceSession.findUnique({
        where: { refreshDigest: digest(token) },
        include: { user: true },
      });
      if (!old || old.expiresAt <= new Date() || old.user.deletedAt)
        return null;
      if (old.rotatedAt || old.revokedAt) {
        await tx.deviceSession.updateMany({
          where: { familyId: old.familyId },
          data: { revokedAt: new Date() },
        });
        return null;
      }
      await tx.deviceSession.update({
        where: { id: old.id },
        data: { rotatedAt: new Date(), revokedAt: new Date() },
      });
      return this.newSession(tx, old.userId, old.familyId);
    });
    if (!result)
      throw new DomainError(
        "SESSION_EXPIRED",
        "Sign in again to continue.",
        401,
      );
    return result;
  }
  async authenticate(bearer?: string) {
    try {
      if (!bearer?.startsWith("Bearer ")) throw new Error();
      const { payload } = await jwtVerify(bearer.slice(7), secret(), {
        issuer: "settleup",
        audience: "settleup-mobile",
        algorithms: ["HS256"],
      });
      if (!payload.sub || typeof payload.sid !== "string") throw new Error();
      const session = await db.deviceSession.findFirst({
        where: {
          id: payload.sid,
          userId: payload.sub,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { deletedAt: null },
        },
      });
      if (!session) throw new Error();
      return { userId: payload.sub, sessionId: session.id };
    } catch {
      throw new DomainError("UNAUTHORIZED", "Sign in to continue.", 401);
    }
  }
  async revoke(userId: string, sessionId: string) {
    await atomic(async (tx) => {
      await tx.deviceSession.updateMany({
        where: { id: sessionId, userId },
        data: { revokedAt: new Date() },
      });
      await audit(tx, userId, sessionId, "SESSION_REVOKED");
    });
  }
}
