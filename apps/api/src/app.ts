import {
  TruecallerVerificationError,
  truecallerProofSchema,
  verifyTruecallerAuthorization,
} from "../../mobile/modules/truecaller/server";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { registerAttachments } from "./infra/attachments";
import { z, ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import {
  createTransactionSchema,
  settlementSchema,
  shareSchema,
  goalSchema,
} from "@settleup/contracts";
import { DomainError, normalizePhone, SMS_TTL_MS, parseUpi } from "@settleup/domain";
import { analytics } from "@settleup/domain/src/analytics";
import { AuthService, validateConfig } from "./auth/service";
import { FinanceService, PrismaDashboardRepository } from "./finance/service";
import { SharingService } from "./sharing/service";
import {
  db,
  atomic,
  audit,
  digest,
  requireMember,
  json,
  visibleTransaction,
} from "./infra/database";
const idSchema = z.string().uuid();
export async function createApp() {
  validateConfig();
  const app = Fastify({
    routerOptions: { maxParamLength: 512 },
    bodyLimit: 64 * 1024,
    logger: {
      level: process.env.NODE_ENV === "test" ? "silent" : "info",
      redact: [
        "req.headers.authorization",
        "req.body",
        "res.headers.set-cookie",
      ],
      serializers: {
        req: (req) => ({
          method: req.method,
          route: req.routeOptions?.url ?? "unmatched",
        }),
      },
    },
  });
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:8081"],
  });
  await app.register(helmet);
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof DomainError)
      return reply
        .code(error.status)
        .send({ code: error.code, message: error.message });
    const err = error as any;
    if (error instanceof ZodError || err?.name === "ZodError")
      return reply.code(400).send({
        code: "VALIDATION",
        message: err.issues?.map((i: any) => i.message).join(" ") || "Invalid request body.",
        issues: typeof err.flatten === "function" ? err.flatten() : err,
      });
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(error.code)
    )
      return reply.code(409).send({
        code: "CONFLICT",
        message: "This record changed or already exists. Refresh and retry.",
      });
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500)
      return reply.code(status).send({
        code: "REQUEST",
        message:
          status === 429
            ? "Too many requests. Please wait."
            : "Invalid request.",
      });
    req.log.error(
      {
        errorType:
          error instanceof Error ? error.constructor.name : "UnknownError",
        requestId: req.id,
      },
      "Request failed",
    );
    return reply.code(500).send({
      code: "INTERNAL",
      message: "Something went wrong. Please try again.",
      requestId: req.id,
    });
  });
  const auth = new AuthService(),
    finance = new FinanceService(),
    sharing = new SharingService(),
    dashboard = new PrismaDashboardRepository();
  const actor = async (req: { headers: { authorization?: string } }) =>
    auth.authenticate(req.headers.authorization);
  const pathId = (req: { params: unknown }) =>
    idSchema.parse((req.params as { id: string }).id);
  app.get("/health", async () => {
    await db.$queryRaw`SELECT 1`;
    return { status: "ok" };
  });
  app.post(
    "/auth/otp",
    { config: { rateLimit: { max: 6, timeWindow: "15 minutes" } } },
    (req) =>
      auth.requestOtp(
        z.object({ phone: z.string().max(30) }).parse(req.body).phone,
      ),
  );
  app.post(
    "/auth/verify",
    { config: { rateLimit: { max: 15, timeWindow: "15 minutes" } } },
    (req) => {
      const b = z
        .object({ challengeId: idSchema, code: z.string().regex(/^\d{6}$/) })
        .parse(req.body);
      return auth.verifyOtp(b.challengeId, b.code);
    },
  );
  app.post(
    "/auth/truecaller",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req) => {
      const clientId = process.env.TRUECALLER_CLIENT_ID;
      if (!clientId)
        throw new DomainError(
          "TRUECALLER_DISABLED",
          "Use phone verification to continue.",
          503,
        );
      const proof = truecallerProofSchema.parse(req.body);
      let verified;
      try {
        verified = await verifyTruecallerAuthorization(proof, clientId);
      } catch (error) {
        if (error instanceof TruecallerVerificationError)
          throw new DomainError(error.code, error.message, error.status);
        throw new DomainError(
          "TRUECALLER_FAILED",
          "Truecaller verification failed. Please try again or use a phone code.",
          401,
        );
      }
      const session = await auth.signInWithVerifiedPhone(verified.phone);
      return { ...session, suggestedName: verified.suggestedName };
    },
  );
  app.post("/auth/refresh", async (req) =>
    auth.refresh(
      z.object({ refreshToken: z.string().min(40).max(200) }).parse(req.body)
        .refreshToken,
    ),
  );
  app.post("/auth/logout", async (req) => {
    const a = await actor(req);
    await auth.revoke(a.userId, a.sessionId);
    return { ok: true };
  });
  app.get("/dashboard", async (req) =>
    dashboard.get((await actor(req)).userId),
  );
  app.get("/analytics", async (req) => {
    const a = await actor(req);
    const q = z
      .object({
        start: z.string().datetime(),
        end: z.string().datetime(),
        currency: z.string().length(3),
        zone: z.string().default("Asia/Kolkata"),
        ledgerId: idSchema.optional(),
        tagId: idSchema.optional(),
        peerId: idSchema.optional(),
        type: z.string().optional(),
        status: z.string().optional(),
      })
      .parse(req.query);
    return analytics(await dashboard.get(a.userId), {
      ...q,
      ledgerIds: q.ledgerId ? [q.ledgerId] : [],
      tagIds: q.tagId ? [q.tagId] : [],
    });
  });
  app.post("/transactions", async (req) =>
    finance.create(
      (await actor(req)).userId,
      createTransactionSchema.parse(req.body),
    ),
  );
  app.post("/settlements", async (req) =>
    finance.settle((await actor(req)).userId, settlementSchema.parse(req.body)),
  );
  app.post("/transactions/:id/actions", async (req) => {
    const a = await actor(req);
    const b = z
      .object({
        action: z.enum(["complete", "reverse", "dispute", "resolve"]),
        version: z.number().int().positive(),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(req.body);
    return finance.action(a.userId, pathId(req), b.action, b.version, b.reason);
  });
  app.get("/transactions/:id/history", async (req) => {
    const { userId } = await actor(req);
    const id = pathId(req);
    if (
      !(await db.transaction.findFirst({
        where: { id, ...visibleTransaction(userId) },
      }))
    )
      throw new DomainError("NOT_FOUND", "Transaction unavailable.", 404);
    return json(
      await db.auditEvent.findMany({
        where: { resourceId: id },
        orderBy: { createdAt: "asc" },
      }),
    );
  });
  app.post("/groups", async (req) => {
    const { userId } = await actor(req);
    const b = z
      .object({
        name: z.string().trim().min(1).max(100),
        description: z.string().max(500).default(""),
        currency: z.string().regex(/^[A-Z]{3}$/),
        memberIds: z.array(idSchema).max(99).default([]),
        contacts: z.array(z.object({ name: z.string().trim().min(1).max(100), phone: z.string().max(30) })).max(99).default([]),
      })
      .parse(req.body);
    return atomic(async (tx) => {
      const members = [userId];
      const contacts = [...b.contacts];
      for (const id of b.memberIds) {
        if (id === userId) continue;
        const peer = await tx.contactPeer.findFirst({ where: { ownerId: userId, OR: [{ id }, { linkedUserId: id }] } });
        if (!peer) throw new DomainError("PEER", "Choose one of your contacts.", 403);
        contacts.push({ name: peer.name, phone: peer.phone });
      }
      for (const contact of contacts) {
        const phone = normalizePhone(contact.phone);
        let identity = await tx.phoneIdentity.findUnique({ where: { phone }, include: { user: true } });
        if (identity?.user.deletedAt) throw new DomainError("PEER", "This contact is unavailable.", 403);
        if (!identity) {
          // Reserve a member identity, never a session or a verified phone number.
          const user = await tx.user.create({ data: {
            profile: { create: { name: "New friend" } },
            phone: { create: { phone, verifiedAt: null } },
          }, include: { phone: true } });
          identity = { ...user.phone!, user };
        }
        const id = identity.userId;
        if (id === userId) continue;
        if (await tx.userBlock.findFirst({ where: { OR: [
          { blockerId: userId, blockedId: id }, { blockerId: id, blockedId: userId },
        ] } })) throw new DomainError("PEER", "This contact cannot be added.", 403);
        await tx.contactPeer.upsert({ where: { ownerId_phone: { ownerId: userId, phone } },
          create: { ownerId: userId, phone, name: contact.name, linkedUserId: id },
          update: { linkedUserId: id },
        });
        if (!members.includes(id)) members.push(id);
      }
      if (members.length > 100) throw new DomainError("GROUP", "A group supports up to 100 people.");
      const group = await tx.group.create({
        data: {
          name: b.name,
          description: b.description,
          members: {
            create: members.map((id) => ({
              userId: id,
              role: id === userId ? "OWNER" : "MEMBER",
            })),
          },
          ledgers: {
            create: {
              name: b.name,
              currency: b.currency,
              members: {
                create: members.map((id) => ({
                  userId: id,
                  role: id === userId ? "OWNER" : "MEMBER",
                })),
              },
            },
          },
        },
        include: { ledgers: true },
      });
      await audit(
        tx,
        userId,
        group.id,
        "GROUP_CREATED",
        {},
        group.ledgers[0].id,
        `${b.name} created`,
      );
      return json(group);
    });
  });
  app.patch("/ledgers/:id", async (req) => {
    const { userId } = await actor(req);
    const id = pathId(req);
    const b = z.object({ archived: z.boolean() }).parse(req.body);
    return atomic(async (tx) => {
      const m = await requireMember(tx, id, userId);
      if (!["OWNER", "ADMIN"].includes(m.role))
        throw new DomainError(
          "FORBIDDEN",
          "Only group admins can archive a ledger.",
          403,
        );
      await tx.ledger.update({
        where: { id },
        data: { archivedAt: b.archived ? new Date() : null },
      });
      await audit(tx, userId, id, "LEDGER_ARCHIVE_CHANGED", b, id);
      return { ok: true };
    });
  });
  app.post("/peers", async (req) => {
    const { userId } = await actor(req);
    const b = z
      .object({
        name: z.string().trim().min(1).max(100),
        phone: z.string().max(30),
      })
      .parse(req.body);
    const phone = normalizePhone(b.phone);
    return db.contactPeer.upsert({
      where: { ownerId_phone: { ownerId: userId, phone } },
      create: { ownerId: userId, name: b.name, phone },
      update: { name: b.name },
    });
  });
  app.post("/peers/:id/invite", async (req) => {
    const { userId } = await actor(req);
    const id = pathId(req);
    const token = randomBytes(32).toString("base64url");
    const result = await db.contactPeer.updateMany({
      where: { id, ownerId: userId },
      data: {
        inviteDigest: digest(token),
        inviteExpiresAt: new Date(Date.now() + 86400000),
      },
    });
    if (!result.count)
      throw new DomainError("NOT_FOUND", "Peer unavailable.", 404);
    return { url: `${process.env.PUBLIC_APP_URL}/invite/${token}` };
  });
  app.post("/invites/claim", async (req) => {
    const { userId } = await actor(req);
    const { token } = z
      .object({ token: z.string().length(43) })
      .parse(req.body);
    return atomic(async (tx) => {
      const phone = await tx.phoneIdentity.findUniqueOrThrow({
        where: { userId },
      });
      const p = await tx.contactPeer.findFirst({
        where: {
          inviteDigest: digest(token),
          inviteExpiresAt: { gt: new Date() },
          phone: phone.phone,
        },
      });
      if (!p || p.ownerId === userId)
        throw new DomainError("INVITE", "Invitation unavailable.", 404);
      await tx.contactPeer.update({
        where: { id: p.id },
        data: {
          linkedUserId: userId,
          inviteDigest: null,
          inviteExpiresAt: null,
        },
      });
      await audit(tx, userId, p.id, "PEER_VERIFIED");
      return { ok: true };
    });
  });
  app.post("/tags", async (req) => {
    const { userId } = await actor(req);
    const b = z
      .object({
        name: z.string().trim().min(1).max(40),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      })
      .parse(req.body);
    return db.tag.create({ data: { ...b, ownerId: userId } });
  });
  app.patch("/tags/:id", async (req) => {
    const { userId } = await actor(req);
    const b = z
      .object({
        name: z.string().trim().min(1).max(40).optional(),
        color: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .optional(),
        archived: z.boolean().optional(),
      })
      .parse(req.body);
    const result = await db.tag.updateMany({
      where: { id: pathId(req), ownerId: userId },
      data: {
        name: b.name,
        color: b.color,
        ...(b.archived !== undefined
          ? { archivedAt: b.archived ? new Date() : null }
          : {}),
      },
    });
    if (!result.count)
      throw new DomainError("NOT_FOUND", "Tag unavailable.", 404);
    return { ok: true };
  });
  app.post("/goals", async (req) => {
    const { userId } = await actor(req);
    const b = goalSchema.parse(req.body);
    return atomic(async (tx) => {
      for (const id of b.ledgerIds) await requireMember(tx, id, userId);
      if (
        (await tx.tag.count({
          where: { id: { in: b.tagIds }, ownerId: userId },
        })) !== new Set(b.tagIds).size
      )
        throw new DomainError("SCOPE", "Use your own tags.");
      const { tagIds, ledgerIds, ...fields } = b;
      return json(
        await tx.goal.create({
          data: {
            ...fields,
            start: new Date(b.start),
            end: new Date(b.end),
            ownerId: userId,
            scopes: {
              create: [
                ...tagIds.map((tagId) => ({ tagId })),
                ...ledgerIds.map((ledgerId) => ({ ledgerId })),
              ],
            },
          },
        }),
      );
    });
  });
  app.delete("/goals/:id", async (req) => {
    const { userId } = await actor(req);
    await db.goal.deleteMany({ where: { id: pathId(req), ownerId: userId } });
    return { ok: true };
  });
  app.post("/imports/handled", async (req) => {
    const { userId } = await actor(req);
    const b = z
      .object({
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        decision: z.enum(["ACCEPTED", "REJECTED"]),
      })
      .parse(req.body);
    return db.smsImportRecord.upsert({
      where: {
        ownerId_fingerprint: { ownerId: userId, fingerprint: b.fingerprint },
      },
      create: {
        ownerId: userId,
        ...b,
        expiresAt: new Date(Date.now() + SMS_TTL_MS),
      },
      update: {},
    });
  });
  app.get("/imports/handled", async (req) =>
    db.smsImportRecord.findMany({
      where: {
        ownerId: (await actor(req)).userId,
        expiresAt: { gt: new Date() },
      },
      select: { fingerprint: true, expiresAt: true },
    }),
  );
  app.post("/payment-links", async (req) => {
    const { userId } = await actor(req);
    const b = z.object({ upiId: z.string().trim().max(193), amountMinor: z.number().int().positive().max(100000000), payeeName: z.string().trim().min(1).max(100) }).parse(req.body);
    const params = new URLSearchParams({ pa: b.upiId, pn: b.payeeName, am: (b.amountMinor / 100).toFixed(2), cu: "INR" });
    const payment = parseUpi(`upi://pay?${params}`);
    const token = randomBytes(18).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 86400000);
    await db.paymentLink.create({ data: { tokenDigest: digest(token), ownerId: userId, uri: payment.uri, expiresAt } });
    return { token, expiresAt, appUrl: `settleup:///pay/${token}` };
  });
  app.get("/payment-links/:token", async (req, reply) => {
    await actor(req);
    const token = z.string().regex(/^[A-Za-z0-9_-]{24}$/).parse((req.params as { token: string }).token);
    const link = await db.paymentLink.findUnique({ where: { tokenDigest: digest(token) } });
    if (!link || link.expiresAt <= new Date()) throw new DomainError("NOT_FOUND", "This payment link has expired or is unavailable.", 404);
    reply.header("Cache-Control", "no-store");
    return { ...parseUpi(link.uri), expiresAt: link.expiresAt };
  });
  app.get("/p/:token", async (req, reply) => {
    const token = z.string().regex(/^[A-Za-z0-9_-]{24}$/).parse((req.params as { token: string }).token);
    const link = await db.paymentLink.findUnique({ where: { tokenDigest: digest(token) } });
    if (!link || link.expiresAt <= new Date()) return reply.code(404).type("text/plain").send("This payment link has expired or is unavailable.");
    reply.header("Cache-Control", "no-store");
    const installUrl = process.env.APP_INSTALL_URL;
    const install = installUrl?.startsWith("https://")
      ? `<p><a class="secondary" href="${installUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}">Install SettleUp</a></p>`
      : "<p class=hint>Need the app? Ask the sender for the SettleUp installation link, then return here.</p>";
    return reply.type("text/html").send(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SettleUp payment request</title><style>body{margin:0;background:#f7f7f2;color:#303a38;font:16px/1.6 system-ui;display:grid;place-items:center;min-height:100dvh}main{box-sizing:border-box;background:#fff;border:1px solid #e2e6df;border-radius:28px;padding:32px;width:min(92%,480px);box-shadow:0 18px 60px #303a380a}h1{line-height:1.2;font-size:30px}a{display:block;text-align:center;border-radius:14px;padding:14px;background:#3b5e55;color:white;text-decoration:none;font-weight:600}.secondary{background:#edf2ee;color:#3b5e55}.hint{font-size:14px;color:#66716b}</style><body><main><h1>A payment request for you</h1><p>Install SettleUp, then open this link on your phone to review the payee and amount.</p><p><a href="settleup:///pay/${token}">Open in SettleUp</a></p>${install}<p class="hint">Already installed? If the button does not open the app, copy this link and use “Open a payment link” in SettleUp.</p></main></body></html>`);
  });
  app.post("/shares", async (req) =>
    sharing.create((await actor(req)).userId, shareSchema.parse(req.body)),
  );
  app.get("/shares", async (req) =>
    db.sharedAnalyticsLink.findMany({
      where: { ownerId: (await actor(req)).userId },
      select: { id: true, expiresAt: true, revokedAt: true, createdAt: true },
    }),
  );
  app.delete("/shares/:id", async (req) =>
    sharing.revoke((await actor(req)).userId, pathId(req)),
  );
  app.get(
    "/shared/:token",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req) => {
      const a = req.headers.authorization ? await actor(req) : undefined;
      return sharing.read((req.params as { token: string }).token, a?.userId);
    },
  );
  app.patch("/profile", async (req) => {
    const { userId } = await actor(req);
    const b = z
      .object({
        name: z.string().trim().min(1).max(100).optional(),
        email: z.string().email().optional(),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .optional(),
        discoverable: z.boolean().optional(),
        timezone: z.string().max(64).optional(),
      })
      .parse(req.body);
    return db.userProfile.update({ where: { userId }, data: b });
  });
  app.post("/blocks", async (req) => {
    const { userId } = await actor(req);
    const b = z.object({ userId: idSchema }).parse(req.body);
    if (b.userId === userId)
      throw new DomainError("SELF", "Choose another user.");
    await db.userBlock.upsert({
      where: {
        blockerId_blockedId: { blockerId: userId, blockedId: b.userId },
      },
      create: { blockerId: userId, blockedId: b.userId },
      update: {},
    });
    return { ok: true };
  });
  app.get("/sessions", async (req) =>
    db.deviceSession.findMany({
      where: { userId: (await actor(req)).userId, revokedAt: null },
      select: { id: true, createdAt: true, expiresAt: true },
    }),
  );
  app.delete("/sessions/:id", async (req) => {
    await auth.revoke((await actor(req)).userId, pathId(req));
    return { ok: true };
  });
  app.patch("/notifications", async (req) => {
    const { userId } = await actor(req);
    const b = z
      .object({
        goals: z.boolean().optional(),
        activity: z.boolean().optional(),
        pushToken: z.string().max(250).nullable().optional(),
      })
      .parse(req.body);
    return db.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...b },
      update: b,
    });
  });
  app.get("/notifications", async (req) =>
    db.notificationJob.findMany({
      where: { userId: (await actor(req)).userId },
      select: { id: true, message: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  );
  app.get("/account/export", async (req) => {
    const { userId } = await actor(req);
    return {
      exportedAt: new Date().toISOString(),
      data: await dashboard.get(userId),
      profile: await db.userProfile.findUnique({ where: { userId } }),
      audit: await db.auditEvent.findMany({ where: { actorId: userId } }),
    };
  });
  app.delete("/account", async (req) => {
    const { userId } = await actor(req);
    z.object({ confirmation: z.literal("DELETE MY ACCOUNT") }).parse(req.body);
    return atomic(async (tx) => {
      const outstanding = await tx.obligation.count({
        where: {
          remainingMinor: { gt: 0 },
          OR: [{ debtorId: userId }, { creditorId: userId }],
        },
      });
      if (outstanding)
        throw new DomainError(
          "OUTSTANDING",
          "Settle or reverse outstanding obligations before deleting your account.",
        );
      await tx.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          profile: {
            update: {
              name: "Deleted account",
              email: null,
              avatar: null,
              discoverable: false,
            },
          },
        },
      });
      await tx.phoneIdentity.delete({ where: { userId } });
      await tx.deviceSession.updateMany({
        where: { userId },
        data: { revokedAt: new Date() },
      });
      await tx.sharedAnalyticsLink.updateMany({
        where: { ownerId: userId },
        data: { revokedAt: new Date() },
      });
      await tx.contactPeer.deleteMany({ where: { ownerId: userId } });
      await tx.contactPeer.updateMany({
        where: { linkedUserId: userId },
        data: { linkedUserId: null },
      });
      await tx.smsImportRecord.deleteMany({ where: { ownerId: userId } });
      await tx.paymentLink.deleteMany({ where: { ownerId: userId } });
      await tx.notificationPreference.deleteMany({ where: { userId } });
      await audit(tx, userId, userId, "ACCOUNT_DELETED");
      return { ok: true };
    });
  });
  await registerAttachments(app, auth);
  return app;
}
