import { randomBytes } from "node:crypto";
import type { CreateShare, Dashboard } from "@settleup/contracts";
import {
  assertShareAccess,
  normalizePhone,
  DomainError,
  periodRange,
} from "@settleup/domain";
import {
  analytics,
  filterTransactions,
  personalSpend,
} from "@settleup/domain/src/analytics";
import { PrismaDashboardRepository } from "../finance/service";
import { atomic, digest, audit, requireMember } from "../infra/database";

type ShareScope = Pick<
  CreateShare,
  | "start"
  | "end"
  | "period"
  | "currency"
  | "ledgerIds"
  | "tagIds"
  | "includeTransactions"
  | "showDescriptions"
>;

const currentScope = (scope: ShareScope) => ({
  ...(scope.period
    ? periodRange(scope.period, "Asia/Kolkata")
    : { start: scope.start, end: scope.end }),
  currency: scope.currency,
  ledgerIds: scope.ledgerIds,
  tagIds: scope.tagIds,
});

function livePayload(data: Dashboard, scope: ShareScope, expiresAt: string) {
  const filter = currentScope(scope);
  const summary = analytics(data, filter);
  const weekly = analytics(data, {
    ...periodRange("WEEK", "Asia/Kolkata"),
    currency: scope.currency,
    ledgerIds: scope.ledgerIds,
    tagIds: scope.tagIds,
  });
  const monthly = analytics(data, {
    ...periodRange("MONTH", "Asia/Kolkata"),
    currency: scope.currency,
    ledgerIds: scope.ledgerIds,
    tagIds: scope.tagIds,
  });
  return {
    owner: data.account.name,
    coverage: { start: filter.start, end: filter.end },
    period: scope.period,
    updatedAt: new Date().toISOString(),
    expiresAt,
    currency: scope.currency,
    spendingMinor: summary.spendingMinor,
    outgoingMinor: summary.outgoingMinor,
    incomingMinor: summary.incomingMinor,
    weeklySpendingMinor: weekly.spendingMinor,
    monthlySpendingMinor: monthly.spendingMinor,
    byDay: summary.byDay,
    categories: summary.byTag.map((entry) => ({
      name:
        data.tags.find((tag) => tag.id === entry.id)?.name ?? "Uncategorized",
      amountMinor: entry.amountMinor,
    })),
    transactions: scope.includeTransactions
      ? filterTransactions(data, filter).map((transaction) => ({
          date: transaction.occurredAt,
          amountMinor: personalSpend(transaction, data.account.id),
          status: transaction.status,
          ...(scope.showDescriptions ? { description: transaction.title } : {}),
        }))
      : undefined,
  };
}

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
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + input.expiresInHours * 3600000);
    const scope: ShareScope = {
      start: input.start,
      end: input.end,
      period: input.period,
      currency: input.currency,
      ledgerIds: input.ledgerIds,
      tagIds: input.tagIds,
      includeTransactions: input.includeTransactions,
      showDescriptions: input.showDescriptions,
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
            create: {
              payload: JSON.parse(
                JSON.stringify({ version: 2, scope, owner: data.account.name }),
              ),
            },
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
      return allowed
        ? {
            ownerId: link.ownerId,
            expiresAt: link.expiresAt.toISOString(),
            payload: link.snapshot?.payload as any,
          }
        : null;
    });
    if (!result)
      throw new DomainError(
        "LINK_UNAVAILABLE",
        "This link is unavailable or requires an authorized account.",
        404,
      );
    if (result.payload?.version === 2 && result.payload.scope) {
      const data = await new PrismaDashboardRepository().get(result.ownerId);
      return livePayload(data, result.payload.scope, result.expiresAt);
    }
    return result.payload;
  }

  async revoke(userId: string, id: string) {
    return atomic(async (tx) => {
      const link = await tx.sharedAnalyticsLink.findFirst({
        where: { id, ownerId: userId, revokedAt: null },
      });
      if (!link)
        throw new DomainError("NOT_FOUND", "Link is already unavailable.", 404);
      await tx.sharedAnalyticsLink.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      await audit(tx, userId, id, "SHARED_LINK_REVOKED");
      return { ok: true };
    });
  }
}
