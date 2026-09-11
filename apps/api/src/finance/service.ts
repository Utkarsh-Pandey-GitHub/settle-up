import type {
  CreateTransaction,
  CreateSettlement,
  Dashboard,
} from "@settleup/contracts";
import {
  splitExpense,
  obligations,
  applyRepayment,
  DomainError,
} from "@settleup/domain";
import {
  db,
  atomic,
  digest,
  requireMember,
  audit,
  json,
  visibleTransaction,
  type Db,
} from "../infra/database";

async function idempotent(tx: Db, userId: string, key: string, hash: string) {
  const existing = await tx.transaction.findUnique({
    where: {
      sourceId_idempotencyKey: { sourceId: userId, idempotencyKey: key },
    },
  });
  if (existing && existing.requestDigest !== hash)
    throw new DomainError(
      "IDEMPOTENCY_CONFLICT",
      "This request key was already used for a different operation.",
      409,
    );
  return existing;
}
export class FinanceService {
  async create(userId: string, input: CreateTransaction) {
    return atomic(async (tx) => {
      const hash = digest(JSON.stringify(input));
      const existing = await idempotent(tx, userId, input.idempotencyKey, hash);
      if (existing) return json(existing);
      if (input.ledgerId) {
        const member = await requireMember(tx, input.ledgerId, userId, true);
        if (member.ledger.currency !== input.currency)
          throw new DomainError("CURRENCY", "Use the ledger currency.");
      }
      const requestedUsers = [
        ...new Set([
          ...input.participants.map((p) => p.userId),
          ...(input.destinationId ? [input.destinationId] : []),
        ]),
      ];
      if (
        ["PERSONAL_EXPENSE", "ADJUSTMENT"].includes(input.type) &&
        requestedUsers.length
      )
        throw new DomainError(
          "PARTICIPANTS",
          "Personal expenses cannot create peer obligations.",
        );
      for (const id of requestedUsers) {
        if (!input.ledgerId)
          throw new DomainError("LEDGER", "Shared records require a ledger.");
        await requireMember(tx, input.ledgerId, id, true);
        const blocked = await tx.userBlock.findFirst({
          where: {
            OR: [
              { blockerId: userId, blockedId: id },
              { blockerId: id, blockedId: userId },
            ],
          },
        });
        if (blocked)
          throw new DomainError(
            "PEER_UNAVAILABLE",
            "A selected peer is unavailable.",
            403,
          );
      }
      if (input.type === "LOAN" && input.destinationId === userId)
        throw new DomainError("SELF_LOAN", "Choose another borrower.");
      const validTags = await tx.tag.count({
        where: { id: { in: input.tagIds }, ownerId: userId, archivedAt: null },
      });
      if (
        validTags !== new Set(input.tagIds).size ||
        new Set(input.tagIds).size !== input.tagIds.length
      )
        throw new DomainError("TAG", "Select your own active tags.");
      if (
        input.type === "ADJUSTMENT" &&
        (input.status !== "SETTLED" || input.ledgerId)
      )
        throw new DomainError(
          "INCOME",
          "Income adjustments must be posted to your personal account.",
        );
      const splits =
        input.type === "SHARED_EXPENSE"
          ? splitExpense(
              input.amountMinor,
              input.participants,
              input.splitMethod,
            )
          : [];
      const debts =
        input.type === "SHARED_EXPENSE"
          ? obligations(userId, splits, input.currency)
          : input.type === "LOAN"
            ? [
                {
                  debtorId: input.destinationId!,
                  creditorId: userId,
                  amountMinor: input.amountMinor,
                  remainingMinor: input.amountMinor,
                  currency: input.currency,
                },
              ]
            : [];
      const record = await tx.transaction.create({
        data: {
          sourceId: userId,
          destinationId:
            input.type === "ADJUSTMENT" ? userId : input.destinationId,
          ledgerId: input.ledgerId,
          title: input.title,
          amountMinor: input.amountMinor,
          currency: input.currency,
          type: input.type,
          status: input.status,
          occurredAt: new Date(input.occurredAt),
          notes: input.notes,
          icon: input.icon,
          paymentReference: input.paymentReference,
          idempotencyKey: input.idempotencyKey,
          requestDigest: hash,
          participants: {
            create: [...new Set([userId, ...requestedUsers])].map((userId) => ({
              userId,
            })),
          },
          splits: {
            create: splits.map((s) => ({
              ...s,
              method: input.splitMethod,
              weight: input.participants.find((p) => p.userId === s.userId)
                ?.value,
            })),
          },
          obligations: {
            create: debts.map((d) => ({ ...d, ledgerId: input.ledgerId! })),
          },
          tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
          items: {
            create: (input.items ?? []).map((item, position) => ({
              ...item,
              position,
            })),
          },
        },
      });
      await audit(
        tx,
        userId,
        record.id,
        input.type === "LOAN" ? "LOAN_RAISED" : "EXPENSE_CREATED",
        { amountMinor: input.amountMinor, allocations: splits },
        input.ledgerId,
        `${input.title} added`,
      );
      return json(record);
    });
  }
  async settle(userId: string, input: CreateSettlement) {
    return atomic(async (tx) => {
      if (userId !== input.debtorId)
        throw new DomainError(
          "FORBIDDEN",
          "Only the paying account can record this repayment.",
          403,
        );
      const hash = digest(JSON.stringify(input));
      const existing = await idempotent(tx, userId, input.idempotencyKey, hash);
      if (existing) return json(existing);
      await requireMember(tx, input.ledgerId, userId, true);
      await requireMember(tx, input.ledgerId, input.creditorId, true);
      const debts = await tx.obligation.findMany({
        where: {
          ledgerId: input.ledgerId,
          debtorId: userId,
          creditorId: input.creditorId,
          currency: input.currency,
          remainingMinor: { gt: 0 },
          transaction: { status: { in: ["SETTLED", "PENDING_LOAN"] } },
        },
        orderBy: [{ transaction: { createdAt: "asc" } }, { id: "asc" }],
      });
      const payments = applyRepayment(
        json(debts),
        userId,
        input.creditorId,
        input.amountMinor,
        input.currency,
      );
      const record = await tx.transaction.create({
        data: {
          sourceId: userId,
          destinationId: input.creditorId,
          ledgerId: input.ledgerId,
          title: "Settlement",
          type: "SETTLEMENT",
          status: "SETTLED",
          amountMinor: input.amountMinor,
          currency: input.currency,
          occurredAt: new Date(),
          idempotencyKey: input.idempotencyKey,
          requestDigest: hash,
          paymentReference: input.reference,
          settlements: { create: payments },
          participants: { create: [{ userId }, { userId: input.creditorId }] },
        },
      });
      for (const p of payments)
        await tx.obligation.update({
          where: { id: p.obligationId },
          data: {
            remainingMinor: { decrement: p.amountMinor },
            version: { increment: 1 },
          },
        });
      for (const debt of debts)
        if (
          (await tx.obligation.count({
            where: {
              transactionId: debt.transactionId,
              remainingMinor: { gt: 0 },
            },
          })) === 0
        )
          await tx.transaction.updateMany({
            where: {
              id: debt.transactionId,
              type: "LOAN",
              status: "PENDING_LOAN",
            },
            data: { status: "SETTLED", version: { increment: 1 } },
          });
      await audit(
        tx,
        userId,
        record.id,
        "SETTLEMENT_COMPLETED",
        { payments },
        input.ledgerId,
        "A repayment was recorded",
      );
      return json(record);
    });
  }
  async action(
    userId: string,
    id: string,
    action: "complete" | "reverse" | "dispute" | "resolve",
    version: number,
    reason: string,
  ) {
    return atomic(async (tx) => {
      const record = await tx.transaction.findFirst({
        where: { id, ...visibleTransaction(userId) },
        include: {
          obligations: true,
          settlements: { include: { obligation: true } },
          disputes: true,
        },
      });
      if (!record)
        throw new DomainError("NOT_FOUND", "Transaction unavailable.", 404);
      if (record.version !== version)
        throw new DomainError(
          "VERSION",
          "This record changed. Refresh before trying again.",
          409,
        );
      if (action === "dispute") {
        if (!["SETTLED", "PENDING_LOAN"].includes(record.status))
          throw new DomainError(
            "STATUS",
            "Only posted records can be disputed.",
          );
        if (
          record.sourceId !== userId &&
          record.destinationId !== userId &&
          !(await tx.transactionParticipant.count({
            where: { transactionId: id, userId },
          }))
        )
          throw new DomainError(
            "FORBIDDEN",
            "Only participants can dispute a record.",
            403,
          );
        await tx.dispute.create({
          data: {
            transactionId: id,
            openedBy: userId,
            reason,
            previousStatus: record.status,
          },
        });
        await tx.transaction.update({
          where: { id },
          data: { status: "DISPUTED", version: { increment: 1 } },
        });
      } else if (action === "resolve") {
        const dispute = record.disputes.find((d) => !d.resolvedAt);
        if (!dispute) throw new DomainError("DISPUTE", "No open dispute.");
        // The person who raised the dispute confirms its resolution; the payer cannot dismiss it.
        if (dispute.openedBy !== userId)
          throw new DomainError(
            "FORBIDDEN",
            "The person who raised this dispute must confirm its resolution.",
            403,
          );
        await tx.dispute.update({
          where: { id: dispute.id },
          data: {
            resolvedBy: userId,
            resolvedAt: new Date(),
            resolution: reason,
          },
        });
        await tx.transaction.update({
          where: { id },
          data: { status: dispute.previousStatus, version: { increment: 1 } },
        });
      } else {
        if (record.sourceId !== userId)
          throw new DomainError(
            "FORBIDDEN",
            "Only the original author can perform this action.",
            403,
          );
        if (action === "complete") {
          if (record.status !== "PENDING" || record.type !== "PERSONAL_EXPENSE")
            throw new DomainError(
              "STATUS",
              "Only pending personal payments can be completed.",
            );
          await tx.transaction.update({
            where: { id },
            data: { status: "SETTLED", version: { increment: 1 } },
          });
        } else {
          if (
            ["REVERSED", "DISPUTED"].includes(record.status) ||
            record.type === "REVERSAL"
          )
            throw new DomainError(
              "STATUS",
              "Resolve disputes before reversing a record.",
            );
          if (
            record.obligations.some((o) => o.remainingMinor !== o.amountMinor)
          )
            throw new DomainError(
              "REPAID",
              "Reverse associated repayments before reversing this expense or loan.",
            );
          for (const s of record.settlements) {
            await tx.transaction.updateMany({
              where: {
                id: s.obligation.transactionId,
                type: "LOAN",
                status: "SETTLED",
              },
              data: { status: "PENDING_LOAN", version: { increment: 1 } },
            });
            if (
              s.obligation.remainingMinor + s.amountMinor >
              s.obligation.amountMinor
            )
              throw new DomainError(
                "BALANCE",
                "This repayment cannot be reversed.",
              );
            await tx.obligation.update({
              where: { id: s.obligationId },
              data: {
                remainingMinor: { increment: s.amountMinor },
                version: { increment: 1 },
              },
            });
          }
          await tx.obligation.updateMany({
            where: { transactionId: id },
            data: { remainingMinor: 0, version: { increment: 1 } },
          });
          await tx.transaction.create({
            data: {
              sourceId: userId,
              destinationId: record.destinationId,
              ledgerId: record.ledgerId,
              title: `Reversal: ${record.title}`.slice(0, 120),
              amountMinor: record.amountMinor,
              currency: record.currency,
              type: "REVERSAL",
              status: "SETTLED",
              occurredAt: new Date(),
              idempotencyKey: crypto.randomUUID(),
              requestDigest: digest(`reverse:${id}:${version}`),
              correctsId: id,
              notes: reason,
            },
          });
          await tx.transaction.update({
            where: { id },
            data: { status: "REVERSED", version: { increment: 1 } },
          });
        }
      }
      await audit(
        tx,
        userId,
        id,
        `TRANSACTION_${action.toUpperCase()}`,
        { reason, previousVersion: version, previousStatus: record.status },
        record.ledgerId,
      );
      return { ok: true };
    });
  }
}
export interface DashboardRepository {
  get(userId: string): Promise<Dashboard>;
}
export class PrismaDashboardRepository implements DashboardRepository {
  async get(userId: string): Promise<Dashboard> {
    return db.$transaction(
      async (tx) => {
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          include: { profile: true, phone: true },
        });
        const [transactions, ledgers, debts, tags, goals, activity, peers] =
          await Promise.all([
            tx.transaction.findMany({
              where: visibleTransaction(userId),
              include: {
                splits: true,
                items: { orderBy: { position: "asc" } },
                tags: { where: { tag: { ownerId: userId } } },
              },
              orderBy: { occurredAt: "desc" },
            }),
            tx.ledger.findMany({
              where: { members: { some: { userId, leftAt: null } } },
              include: {
                group: true,
                members: {
                  where: { leftAt: null },
                  include: { user: { include: { profile: true } } },
                },
              },
            }),
            tx.obligation.findMany({
              where: {
                ledger: { members: { some: { userId, leftAt: null } } },
              },
            }),
            tx.tag.findMany({ where: { ownerId: userId } }),
            tx.goal.findMany({
              where: { ownerId: userId },
              include: { scopes: true },
            }),
            tx.ledgerActivity.findMany({
              where: {
                ledger: { members: { some: { userId, leftAt: null } } },
              },
              orderBy: { createdAt: "desc" },
              take: 50,
            }),
            tx.contactPeer.findMany({ where: { ownerId: userId } }),
          ]);
        const data: Dashboard = json({
          account: {
            id: userId,
            name: user.profile!.name,
            phone: user.phone!.phone,
            currency: user.profile!.currency,
            avatar: user.profile!.name.slice(0, 2),
          },
          transactions: transactions.map((t) => ({
            id: t.id,
            title: t.title,
            amountMinor: t.amountMinor,
            currency: t.currency,
            type: t.type,
            status: t.status,
            occurredAt: t.occurredAt,
            sourceId: t.sourceId,
            destinationId: t.destinationId,
            ledgerId: t.ledgerId,
            notes: t.notes,
            icon: t.icon,
            version: t.version,
            tagIds: t.tags.map((t) => t.tagId),
            items: t.items.map((i) => ({
              name: i.name,
              quantity: Number(i.quantity),
              amountMinor: Number(i.amountMinor),
            })),
            allocations: t.splits.map((s) => ({
              userId: s.userId,
              amountMinor: s.amountMinor,
            })),
          })),
          ledgers: ledgers.map((l) => ({
            id: l.id,
            groupId: l.groupId,
            name: l.name,
            description: l.group.description ?? "",
            currency: l.currency,
            archived: !!l.archivedAt,
            members: l.members.map((m) => ({
              id: m.userId,
              name: m.user.profile?.name ?? "Former member",
              role: m.role,
            })),
          })),
          obligations: debts,
          tags: tags.map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color,
            archived: !!t.archivedAt,
          })),
          goals: goals.map((g) => ({
            id: g.id,
            name: g.name,
            amountMinor: g.amountMinor,
            currency: g.currency,
            start: g.start,
            end: g.end,
            period: g.period,
            thresholds: g.thresholds,
            tagIds: g.scopes.flatMap((s) => (s.tagId ? [s.tagId] : [])),
            ledgerIds: g.scopes.flatMap((s) =>
              s.ledgerId ? [s.ledgerId] : [],
            ),
            spentMinor: 0,
          })),
          activity,
          peers: peers.map((p) => ({
            id: p.linkedUserId ?? p.id,
            name: p.name,
            phone: p.phone,
          })),
        });
        const { analytics } = await import("@settleup/domain/src/analytics");
        data.goals.forEach((g) => {
          g.spentMinor = analytics(data, { ...g }).spendingMinor;
        });
        return data;
      },
      { isolationLevel: "RepeatableRead", timeout: 15000 },
    );
  }
}
