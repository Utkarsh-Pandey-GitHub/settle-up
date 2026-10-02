import {
  TruecallerVerificationError,
  truecallerProofSchema,
  verifyTruecallerAuthorization,
} from "../../mobile/modules/truecaller/server";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { z, ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import {
  createTransactionSchema,
  settlementSchema,
  shareSchema,
  goalSchema,
} from "@settleup/contracts";
import {
  DomainError,
  normalizePhone,
  SMS_TTL_MS,
  parseUpi,
  parseMoney,
} from "@settleup/domain";
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
  await app.register(websocket);
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof DomainError)
      return reply
        .code(error.status)
        .send({ code: error.code, message: error.message });
    const err = error as any;
    if (error instanceof ZodError || err?.name === "ZodError")
      return reply.code(400).send({
        code: "VALIDATION",
        message:
          err.issues?.map((i: any) => i.message).join(" ") ||
          "Invalid request body.",
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
  const liveSockets = new Set<{
    readyState: number;
    send(value: string): void;
    close(code?: number): void;
    on(event: "close", listener: () => void): void;
  }>();
  app.get("/realtime", { websocket: true }, (socket, req) => {
    const protocols = String(req.headers["sec-websocket-protocol"] ?? "")
      .split(",")
      .map((value) => value.trim());
    const accessToken = protocols[0] === "settleup" ? protocols[1] : undefined;
    void auth
      .authenticate(accessToken ? `Bearer ${accessToken}` : undefined)
      .then(() => {
        liveSockets.add(socket);
        socket.on("close", () => liveSockets.delete(socket));
        socket.send(JSON.stringify({ type: "connected" }));
      })
      .catch(() => socket.close(1008));
  });
  app.addHook("onResponse", async (req, reply) => {
    if (
      !["POST", "PATCH", "DELETE"].includes(req.method) ||
      reply.statusCode >= 400 ||
      req.routeOptions.url?.startsWith("/auth/") ||
      req.routeOptions.url === "/imports/handled"
    )
      return;
    const event = JSON.stringify({ type: "data_changed", at: Date.now() });
    for (const socket of liveSockets) {
      if (socket.readyState === 1) socket.send(event);
      else liveSockets.delete(socket);
    }
  });
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
        // Never log authorization proofs, provider tokens, or profile contents.
        req.log.warn(
          {
            code:
              error instanceof TruecallerVerificationError
                ? error.code
                : "TRUECALLER_INVALID_RESPONSE",
            clientId,
          },
          "Truecaller server verification failed",
        );
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
  app.post(
    "/auth/google",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    (req) =>
      auth.signInWithGoogle(
        z.object({ idToken: z.string().min(100).max(4096) }).parse(req.body)
          .idToken,
      ),
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
  app.post(
    "/bill/extract",
    {
      bodyLimit: 14 * 1024 * 1024,
      config: { rateLimit: { max: 12, timeWindow: "15 minutes" } },
    },
    async (req) => {
      await actor(req);
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey)
        throw new DomainError(
          "BILL_AI_DISABLED",
          "Bill scanning is not configured yet.",
          503,
        );
      const body = z
        .object({
          image: z
            .string()
            .max(14 * 1024 * 1024)
            .regex(/^data:image\/(jpeg|png);base64,/),
          currency: z.string().regex(/^[A-Z]{3}$/),
        })
        .parse(req.body);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 55_000);
      let response: Response;
      try {
        response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${apiKey}`,
              "content-type": "application/json",
              "http-referer":
                process.env.PUBLIC_APP_URL || "https://settleup.app",
              "x-title": "SettleUp bill scanner",
            },
            body: JSON.stringify({
              model: process.env.BILL_VISION_MODEL || "openrouter/free",
              messages: [
                {
                  role: "system",
                  content:
                    "You are a receipt-vision extraction engine. Inspect the supplied image pixels directly; do not use outside knowledge and do not invent obscured text. Return one JSON object only. Amounts must be decimal numbers in the receipt currency. An item's amount is the printed full line total, not the unit price. Preserve separate tax, fee, discount and rounding lines. Reconcile the printed grand total against subtotal plus adjustments, but always prefer the clearly printed grand total. If uncertain, omit the uncertain line instead of guessing.",
                },
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `Extract this ${body.currency} receipt from the image. Return {"merchantName":string,"items":[{"name":string,"quantity":number,"amount":number}],"taxAmount":number|null,"totalAmount":number|null}. Read every visible purchased item once. Use quantity 1 when no quantity is printed. Put GST, VAT, service charge, delivery, packing, tip, discount and rounding adjustments in their own lines; discounts must be negative. Check that the line amounts are plausible against the printed total before responding.`,
                    },
                    {
                      type: "image_url",
                      image_url: { url: body.image, detail: "high" },
                    },
                  ],
                },
              ],
              response_format: { type: "json_object" },
              provider: { data_collection: "deny" },
              temperature: 0.1,
              max_tokens: 2200,
            }),
            signal: controller.signal,
          },
        );
      } catch (error) {
        throw new DomainError(
          "BILL_AI_UNAVAILABLE",
          error instanceof Error && error.name === "AbortError"
            ? "Bill reading timed out. Please try again."
            : "The bill reader is unavailable. Please try again.",
          503,
        );
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok)
        throw new DomainError(
          "BILL_AI_UNAVAILABLE",
          "The bill reader could not process this image. Please try again.",
          503,
        );
      const providerResult = (await response.json()) as any;
      const rawContent = providerResult?.choices?.[0]?.message?.content;
      const content = Array.isArray(rawContent)
        ? rawContent.map((part: any) => part?.text || "").join("")
        : rawContent;
      if (typeof content !== "string" || !content.trim())
        throw new DomainError("BILL_AI_RESULT", "No bill details were found.");
      let parsed: any;
      try {
        parsed = JSON.parse(
          content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
        );
      } catch {
        throw new DomainError(
          "BILL_AI_RESULT",
          "The bill result was incomplete. Please try a clearer photo.",
        );
      }
      const amountMinor = (value: unknown) => {
        const cleaned = String(value ?? "").replace(/[^0-9.-]/g, "");
        if (!cleaned) return undefined;
        try {
          const negative = cleaned.startsWith("-");
          const parsedAmount = parseMoney(
            cleaned.replace(/^-/, ""),
            body.currency,
            true,
          );
          return negative ? -parsedAmount : parsedAmount;
        } catch {
          return undefined;
        }
      };
      const items = Array.isArray(parsed.items)
        ? parsed.items
            .map((item: any) => ({
              name: String(item?.name || "")
                .trim()
                .slice(0, 120),
              quantity: Math.max(0.01, Number(item?.quantity) || 1),
              amountMinor: amountMinor(item?.amount),
            }))
            .filter((item: any) => item.name && item.amountMinor !== undefined)
            .slice(0, 99)
        : [];
      const tax = amountMinor(parsed.taxAmount ?? parsed.tax);
      if (
        tax !== undefined &&
        tax !== 0 &&
        !items.some((item: any) => /tax|gst|vat|cgst|sgst/i.test(item.name))
      )
        items.push({ name: "Tax", quantity: 1, amountMinor: tax });
      const detectedTotal = amountMinor(
        parsed.totalAmount ?? parsed.grandTotal ?? parsed.total,
      );
      if (!items.length && detectedTotal === undefined)
        throw new DomainError(
          "BILL_AI_RESULT",
          "No clear items or total were found. Please try a clearer photo.",
        );
      return {
        merchantName:
          String(parsed.merchantName || "")
            .trim()
            .slice(0, 120) || undefined,
        items,
        totalMinor:
          detectedTotal ??
          items.reduce((sum: number, item: any) => sum + item.amountMinor, 0),
      };
    },
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
        contactId: idSchema.optional(),
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
  app.post("/transactions/delete", async (req) => {
    const { userId } = await actor(req);
    const { ids } = z
      .object({ ids: z.array(idSchema).min(1).max(100) })
      .parse(req.body);
    return finance.remove(userId, ids);
  });
  app.post("/transactions/assign-group", async (req) => {
    const { userId } = await actor(req);
    const body = z
      .object({ ids: z.array(idSchema).min(1).max(100), ledgerId: idSchema })
      .parse(req.body);
    return finance.assignLedger(userId, body.ids, body.ledgerId);
  });
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
        contacts: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(100),
              phone: z.string().max(30),
            }),
          )
          .max(99)
          .default([]),
      })
      .parse(req.body);
    return atomic(async (tx) => {
      const members = [userId];
      const contacts = [...b.contacts];
      for (const id of b.memberIds) {
        if (id === userId) continue;
        const savedContact = await tx.user.findFirst({
          where: {
            id,
            deletedAt: null,
            OR: [
              {
                ledgerMembers: {
                  some: {
                    leftAt: null,
                    ledger: {
                      members: { some: { userId, leftAt: null } },
                    },
                  },
                },
              },
              {
                participants: {
                  some: {
                    transaction: {
                      deletedAt: null,
                      participants: { some: { userId } },
                    },
                  },
                },
              },
            ],
          },
        });
        if (!savedContact)
          throw new DomainError(
            "CONTACT",
            "Choose one of your saved contacts.",
            403,
          );
        if (!members.includes(id)) members.push(id);
      }
      for (const contact of contacts) {
        const phone = normalizePhone(contact.phone);
        let identity = await tx.phoneIdentity.findUnique({
          where: { phone },
          include: { user: true },
        });
        if (identity?.user.deletedAt)
          throw new DomainError("CONTACT", "This contact is unavailable.", 403);
        if (!identity) {
          // Reserve a member identity, never a session or a verified phone number.
          const user = await tx.user.create({
            data: {
              profile: { create: { name: contact.name } },
              phone: { create: { phone, verifiedAt: null } },
            },
            include: { phone: true },
          });
          identity = { ...user.phone!, user };
        }
        const id = identity.userId;
        if (id === userId) continue;
        if (
          await tx.userBlock.findFirst({
            where: {
              OR: [
                { blockerId: userId, blockedId: id },
                { blockerId: id, blockedId: userId },
              ],
            },
          })
        )
          throw new DomainError(
            "CONTACT",
            "This contact cannot be added.",
            403,
          );
        if (!members.includes(id)) members.push(id);
      }
      if (members.length > 100)
        throw new DomainError("GROUP", "A group supports up to 100 people.");
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
  app.post("/groups/:id/members", async (req) => {
    const { userId } = await actor(req);
    const groupId = pathId(req);
    const b = z
      .object({
        memberIds: z.array(idSchema).max(20).default([]),
        contacts: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(100),
              phone: z.string().max(30),
            }),
          )
          .max(20)
          .default([]),
      })
      .parse(req.body);
    return atomic(async (tx) => {
      const actorMembership = await tx.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
      });
      if (
        !actorMembership ||
        actorMembership.leftAt ||
        !["OWNER", "ADMIN"].includes(actorMembership.role)
      )
        throw new DomainError(
          "FORBIDDEN",
          "Only group admins can add members.",
          403,
        );
      const memberIds = new Set<string>();
      for (const memberId of b.memberIds) {
        if (memberId === userId) continue;
        const savedContact = await tx.user.findFirst({
          where: {
            id: memberId,
            deletedAt: null,
            OR: [
              {
                ledgerMembers: {
                  some: {
                    leftAt: null,
                    ledger: {
                      members: { some: { userId, leftAt: null } },
                    },
                  },
                },
              },
              {
                participants: {
                  some: {
                    transaction: {
                      deletedAt: null,
                      participants: { some: { userId } },
                    },
                  },
                },
              },
            ],
          },
        });
        if (!savedContact)
          throw new DomainError(
            "CONTACT",
            "Choose one of your saved contacts.",
            403,
          );
        memberIds.add(memberId);
      }
      for (const contact of b.contacts) {
        const phone = normalizePhone(contact.phone);
        let identity = await tx.phoneIdentity.findUnique({
          where: { phone },
          include: { user: true },
        });
        if (identity?.user.deletedAt)
          throw new DomainError("CONTACT", "This contact is unavailable.", 403);
        if (!identity) {
          const user = await tx.user.create({
            data: {
              profile: { create: { name: contact.name } },
              phone: { create: { phone, verifiedAt: null } },
            },
            include: { phone: true },
          });
          identity = { ...user.phone!, user };
        }
        memberIds.add(identity.userId);
      }
      if (!memberIds.size)
        throw new DomainError("GROUP", "Choose someone to add.");
      const activeMembers = await tx.groupMember.findMany({
        where: { groupId, leftAt: null },
        select: { userId: true },
      });
      const activeMemberIds = new Set(
        activeMembers.map((member) => member.userId),
      );
      for (const memberId of activeMemberIds) memberIds.delete(memberId);
      if (!memberIds.size)
        throw new DomainError(
          "GROUP",
          "Everyone selected is already a member.",
        );
      if (activeMembers.length + memberIds.size > 100)
        throw new DomainError("GROUP", "A group supports up to 100 people.");
      const ledgers = await tx.ledger.findMany({
        where: { groupId },
        select: { id: true },
      });
      const addedMembers: {
        id: string;
        name: string;
        role: string;
        avatar?: string;
      }[] = [];
      for (const memberId of memberIds) {
        if (
          await tx.userBlock.findFirst({
            where: {
              OR: [
                { blockerId: userId, blockedId: memberId },
                { blockerId: memberId, blockedId: userId },
              ],
            },
          })
        )
          throw new DomainError(
            "CONTACT",
            "This contact cannot be added.",
            403,
          );
        await tx.groupMember.upsert({
          where: { groupId_userId: { groupId, userId: memberId } },
          create: { groupId, userId: memberId, role: "MEMBER" },
          update: { leftAt: null, role: "MEMBER" },
        });
        const member = await tx.user.findUniqueOrThrow({
          where: { id: memberId },
          include: { profile: true },
        });
        addedMembers.push({
          id: memberId,
          name: member.profile?.name ?? "Member",
          role: "MEMBER",
          avatar: member.profile?.avatar ?? undefined,
        });
        for (const ledger of ledgers) {
          await tx.ledgerMember.upsert({
            where: {
              ledgerId_userId: { ledgerId: ledger.id, userId: memberId },
            },
            create: { ledgerId: ledger.id, userId: memberId, role: "MEMBER" },
            update: { leftAt: null, role: "MEMBER" },
          });
          await audit(
            tx,
            userId,
            memberId,
            "GROUP_MEMBER_ADDED",
            { groupId, memberId },
            ledger.id,
            `${member.profile?.name ?? "A member"} joined the group`,
          );
        }
      }
      return { added: memberIds.size, members: addedMembers };
    });
  });
  app.delete("/groups/:id/members/:memberId", async (req) => {
    const { userId } = await actor(req);
    const groupId = pathId(req);
    const memberId = idSchema.parse(
      (req.params as { memberId: string }).memberId,
    );
    return atomic(async (tx) => {
      const actorMembership = await tx.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
      });
      if (
        !actorMembership ||
        actorMembership.leftAt ||
        !["OWNER", "ADMIN"].includes(actorMembership.role)
      )
        throw new DomainError(
          "FORBIDDEN",
          "Only active group admins can remove members.",
          403,
        );
      if (memberId === userId)
        throw new DomainError(
          "OWNER",
          "Transfer ownership before leaving this group.",
          409,
        );
      const member = await tx.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: memberId } },
        include: { user: { include: { profile: true } } },
      });
      if (!member || member.leftAt)
        throw new DomainError("NOT_FOUND", "Group member unavailable.", 404);
      if (member.role === "OWNER")
        throw new DomainError(
          "OWNER",
          "The group owner cannot be removed.",
          409,
        );
      const ledgers = await tx.ledger.findMany({
        where: { groupId },
        select: { id: true },
      });
      const ledgerIds = ledgers.map((ledger) => ledger.id);
      const outstanding = await tx.obligation.count({
        where: {
          ledgerId: { in: ledgerIds },
          remainingMinor: { gt: 0 },
          OR: [{ debtorId: memberId }, { creditorId: memberId }],
          transaction: { deletedAt: null },
        },
      });
      if (outstanding)
        throw new DomainError(
          "OUTSTANDING_BALANCE",
          "Settle this member's outstanding balances before removing them.",
          409,
        );
      const leftAt = new Date();
      await tx.groupMember.update({
        where: { groupId_userId: { groupId, userId: memberId } },
        data: { leftAt },
      });
      await tx.ledgerMember.updateMany({
        where: { userId: memberId, ledgerId: { in: ledgerIds }, leftAt: null },
        data: { leftAt },
      });
      const name = member.user.profile?.name ?? "A member";
      for (const ledger of ledgers)
        await audit(
          tx,
          userId,
          memberId,
          "GROUP_MEMBER_REMOVED",
          { groupId, memberId },
          ledger.id,
          `${name} was removed from the group`,
        );
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
    const b = z
      .object({
        upiId: z.string().trim().max(193),
        amountMinor: z.number().int().positive().max(100000000),
        payeeName: z.string().trim().min(1).max(100),
      })
      .parse(req.body);
    const params = new URLSearchParams({
      pa: b.upiId,
      pn: b.payeeName,
      am: (b.amountMinor / 100).toFixed(2),
      cu: "INR",
      // A stable reference avoids PSP apps treating repeated intent handling
      // as a new payment. UPI references are limited to 35 digits.
      tr: `${Date.now()}${BigInt(`0x${randomBytes(8).toString("hex")}`).toString()}`.slice(
        0,
        35,
      ),
    });
    const payment = parseUpi(`upi://pay?${params}`);
    const token = randomBytes(18).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 86400000);
    await db.paymentLink.create({
      data: {
        tokenDigest: digest(token),
        ownerId: userId,
        uri: payment.uri,
        expiresAt,
      },
    });
    return {
      id: digest(token),
      token,
      expiresAt,
      appUrl: `settleup:///pay/${token}`,
    };
  });
  app.get("/payment-links", async (req) => {
    const { userId } = await actor(req);
    const links = await db.paymentLink.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return links.map((link) => {
      const payment = parseUpi(link.uri);
      return {
        id: link.tokenDigest,
        payeeName: payment.payeeName,
        upiId: payment.payeeAddress,
        amountMinor: payment.amountMinor,
        createdAt: link.createdAt,
        expiresAt: link.expiresAt,
        revokedAt: link.revokedAt,
      };
    });
  });
  app.delete("/payment-links/:id", async (req) => {
    const { userId } = await actor(req);
    const id = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse((req.params as { id: string }).id);
    const updated = await db.paymentLink.updateMany({
      where: { tokenDigest: id, ownerId: userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!updated.count)
      throw new DomainError("NOT_FOUND", "Payment link unavailable.", 404);
    return { ok: true };
  });
  app.get("/payment-links/:token", async (req, reply) => {
    await actor(req);
    const token = z
      .string()
      .regex(/^[A-Za-z0-9_-]{24}$/)
      .parse((req.params as { token: string }).token);
    const link = await db.paymentLink.findUnique({
      where: { tokenDigest: digest(token) },
    });
    if (!link || link.revokedAt || link.expiresAt <= new Date())
      throw new DomainError(
        "NOT_FOUND",
        "This payment link has expired or is unavailable.",
        404,
      );
    reply.header("Cache-Control", "no-store");
    return { ...parseUpi(link.uri), expiresAt: link.expiresAt };
  });
  app.get("/p/:token", async (req, reply) => {
    const token = z
      .string()
      .regex(/^[A-Za-z0-9_-]{24}$/)
      .parse((req.params as { token: string }).token);
    const link = await db.paymentLink.findUnique({
      where: { tokenDigest: digest(token) },
    });
    if (!link || link.revokedAt || link.expiresAt <= new Date())
      return reply
        .code(404)
        .type("text/plain")
        .send("This payment link has expired or is unavailable.");
    reply.header("Cache-Control", "no-store");
    const installUrl = process.env.APP_INSTALL_URL;
    const install = installUrl?.startsWith("https://")
      ? `<p><a class="secondary" href="${installUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}">Install SettleUp</a></p>`
      : "<p class=hint>Need the app? Ask the sender for the SettleUp installation link, then return here.</p>";
    return reply
      .type("text/html")
      .send(
        `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SettleUp payment request</title><style>body{margin:0;background:#f7f7f2;color:#303a38;font:16px/1.6 system-ui;display:grid;place-items:center;min-height:100dvh}main{box-sizing:border-box;background:#fff;border:1px solid #e2e6df;border-radius:28px;padding:32px;width:min(92%,480px);box-shadow:0 18px 60px #303a380a}h1{line-height:1.2;font-size:30px}a{display:block;text-align:center;border-radius:14px;padding:14px;background:#3b5e55;color:white;text-decoration:none;font-weight:600}.secondary{background:#edf2ee;color:#3b5e55}.hint{font-size:14px;color:#66716b}</style><body><main><h1>A payment request for you</h1><p>Install SettleUp, then open this link on your phone to review the payee and amount.</p><p><a href="settleup:///pay/${token}">Open in SettleUp</a></p>${install}<p class="hint">Already installed? If the button does not open the app, copy this link and use “Open a payment link” in SettleUp.</p></main></body></html>`,
      );
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
        avatar: z
          .string()
          .regex(
            /^preset:(flower|cat|fox|bear|bunny|panda|owl|dog|man|boy|lady|girl|astronaut|artist|reader|cyclist|sun|moon|leaf|cloud)$/,
          )
          .optional(),
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
      await tx.smsImportRecord.deleteMany({ where: { ownerId: userId } });
      await tx.paymentLink.deleteMany({ where: { ownerId: userId } });
      await tx.notificationPreference.deleteMany({ where: { userId } });
      await audit(tx, userId, userId, "ACCOUNT_DELETED");
      return { ok: true };
    });
  });

  return app;
}
