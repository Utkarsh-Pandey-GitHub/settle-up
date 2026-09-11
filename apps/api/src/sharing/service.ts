import { randomBytes } from "node:crypto";
import type { CreateShare } from "@settleup/contracts";
import {
  assertShareAccess,
  normalizePhone,
  DomainError,
} from "@settleup/domain";
import {
  analytics,
  filterTransactions,
  personalSpend,
} from "@settleup/domain/src/analytics";
import { PrismaDashboardRepository } from "../finance/service";
import { atomic, digest, audit, requireMember } from "../infra/database";
export class SharingService {
  async create(userId: string, input: CreateShare) {
    const data = await new PrismaDashboardRepository().get(userId);
    if (
      input.ledgerIds.some((id) => !data.ledgers.some((l) => l.id === id)) ||
      input.tagIds.some((id) => !data.tags.some((t) => t.id === id))
    )
      throw new DomainError(
        "SCOPE",
        "Only your own accessible records can be shared.",
        403,
      );
    const summary = analytics(data, input);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + input.expiresInHours * 3600000);
    // Deliberately project every public field; never serialize a database record.
    const payload = {
      owner: data.account.name,
      coverage: { start: input.start, end: input.end },
      expiresAt: expiresAt.toISOString(),
      currency: input.currency,
      spendingMinor: summary.spendingMinor,
      outgoingMinor: summary.outgoingMinor,
      incomingMinor: summary.incomingMinor,
      categories: summary.byTag.map((t) => ({
        name: data.tags.find((tag) => tag.id === t.id)?.name ?? "Uncategorized",
        amountMinor: t.amountMinor,
      })),
      transactions: input.includeTransactions
        ? filterTransactions(data, input).map((t) => ({
            date: t.occurredAt,
            amountMinor: personalSpend(t, userId),
            status: t.status,
            ...(input.showDescriptions ? { description: t.title } : {}),
          }))
        : undefined,
    };
    const record = await atomic(async (tx) => {
      for (const id of input.ledgerIds) await requireMember(tx, id, userId);
      const link = await tx.sharedAnalyticsLink.create({
        data: {
          ownerId: userId,
          tokenDigest: digest(token),
          privatePhone: input.recipientPhone
            ? normalizePhone(input.recipientPhone)
            : null,
          expiresAt,
          snapshot: {
            create: { payload: JSON.parse(JSON.stringify(payload)) },
          },
        },
      });
      await audit(tx, userId, link.id, "SHARED_LINK_CREATED", {
        expiresAt: expiresAt.toISOString(),
        private: !!input.recipientPhone,
      });
      return link;
    });
    return {
      id: record.id,
      url: `${process.env.PUBLIC_APP_URL}/shared/${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  }
  async read(token: string, userId?: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new DomainError(
        "LINK_UNAVAILABLE",
        "This link is unavailable.",
        404,
      );
    const result = await atomic(async (tx) => {
      const link = await tx.sharedAnalyticsLink.findUnique({
        where: { tokenDigest: digest(token) },
        include: { snapshot: true },
      });
      if (!link) return null;
      const identity = userId
        ? await tx.phoneIdentity.findUnique({ where: { userId } })
        : null;
      let allowed = true;
      try {
        assertShareAccess(link, identity?.phone ?? null);
        if (
          userId &&
          (await tx.userBlock.findFirst({
            where: {
              OR: [
                { blockerId: link.ownerId, blockedId: userId },
                { blockerId: userId, blockedId: link.ownerId },
              ],
            },
          }))
        )
          allowed = false;
      } catch {
        allowed = false;
      }
      await tx.sharedLinkAccessEvent.create({
        data: { linkId: link.id, allowed },
      });
      return allowed ? (link.snapshot?.payload ?? null) : null;
    });
    if (!result)
      throw new DomainError(
        "LINK_UNAVAILABLE",
        "This link is unavailable or requires an authorized account.",
        404,
      );
    return result;
  }
  async revoke(userId: string, id: string) {
    return atomic(async (tx) => {
      const link = await tx.sharedAnalyticsLink.findFirst({
        where: { id, ownerId: userId },
      });
      if (!link) throw new DomainError("NOT_FOUND", "Link unavailable.", 404);
      await tx.sharedAnalyticsLink.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      await audit(tx, userId, id, "SHARED_LINK_REVOKED");
      return { ok: true };
    });
  }
}
