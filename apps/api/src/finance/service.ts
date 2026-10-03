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
          "Personal expenses cannot create shared obligations.",
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
            "CONTACT_UNAVAILABLE",
            "A selected contact is unavailable.",
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
  async remove(userId: string, ids: string[]) {
    return atomic(async (tx) => {
      const uniqueIds = [...new Set(ids)];
      const records = await tx.transaction.findMany({
        where: { id: { in: uniqueIds }, deletedAt: null },
        include: { participants: true },
      });
      if (records.length !== uniqueIds.length)
        throw new DomainError(
          "NOT_FOUND",
          "One or more transactions are unavailable.",
          404,
        );
      if (
        records.some((record) =>
          ["SETTLEMENT", "LOAN_REPAYMENT"].includes(record.type),
        )
      )
        throw new DomainError(
          "DELETE_REQUIRES_CORRECTION",
          "Repayments must be corrected from their transaction details.",
          409,
        );
      for (const record of records) {
        if (record.ledgerId) {
          await requireMember(tx, record.ledgerId, userId, true);
          const people = [
            ...new Set([
              record.sourceId,
              ...(record.destinationId ? [record.destinationId] : []),
              ...record.participants.map((participant) => participant.userId),
            ]),
          ].filter((personId) => personId !== userId);
          if (
            await tx.userBlock.findFirst({
              where: {
                OR: people.flatMap((personId) => [
                  { blockerId: userId, blockedId: personId },
                  { blockerId: personId, blockedId: userId },
                ]),
              },
            })
          )
            throw new DomainError(
              "CONTACT_BLOCKED",
              "Sorry, looks like you are not allowed to delete this transaction.",
              403,
            );
        } else if (record.sourceId !== userId)
          throw new DomainError(
            "FORBIDDEN",
            "Only its author can delete a personal transaction.",
            403,
          );
      }
      await tx.transaction.updateMany({
        where: { id: { in: uniqueIds }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      for (const record of records)
        await audit(
          tx,
          userId,
          record.id,
          "TRANSACTION_DELETED",
          {},
          record.ledgerId,
          `${record.title} deleted`,
        );
      return { ok: true, deleted: records.length };
    });
  }
  async assignLedger(userId: string, ids: string[], ledgerId: string) {
    return atomic(async (tx) => {
      const uniqueIds = [...new Set(ids)];
      const membership = await requireMember(tx, ledgerId, userId, true);
      const records = await tx.transaction.findMany({
        where: { id: { in: uniqueIds }, sourceId: userId, deletedAt: null },
        include: { participants: true },
      });
      if (records.length !== uniqueIds.length)
        throw new DomainError(
          "NOT_FOUND",
          "You can only assign transactions that you created.",
          404,
        );
      if (
        records.some((record) =>
          ["SETTLEMENT", "LOAN_REPAYMENT", "REVERSAL"].includes(record.type),
        )
      )
        throw new DomainError(
          "GROUP_ASSIGNMENT",
          "Repayments and reversals keep their original group.",
          409,
        );
      if (
        records.some((record) => record.currency !== membership.ledger.currency)
      )
        throw new DomainError(
          "CURRENCY",
          "The selected group uses a different currency.",
        );
      for (const record of records) {
        if (record.ledgerId)
          await requireMember(tx, record.ledgerId, userId, true);
        const participantIds = [
          ...new Set([
            ...record.participants.map((participant) => participant.userId),
            record.sourceId,
            ...(record.destinationId ? [record.destinationId] : []),
          ]),
        ];
        const memberCount = await tx.ledgerMember.count({
          where: { ledgerId, userId: { in: participantIds }, leftAt: null },
        });
        if (memberCount !== participantIds.length)
          throw new DomainError(
            "GROUP_MEMBERS",
            "Every person in the transaction must belong to the group.",
            409,
          );
      }
      for (const record of records) {
        await tx.transaction.update({
          where: { id: record.id },
          data: { ledgerId, version: { increment: 1 } },
        });
        await tx.obligation.updateMany({
          where: { transactionId: record.id },
          data: { ledgerId },
        });
        await audit(
          tx,
          userId,
          record.id,
          "TRANSACTION_GROUP_ASSIGNED",
          { previousLedgerId: record.ledgerId, ledgerId },
          ledgerId,
          `${record.title} moved to ${membership.ledger.name}`,
        );
      }
      return { ok: true, assigned: records.length };
    });
  }
  async update(
    userId: string,
    id: string,
    input: CreateTransaction,
    version: number,
  ) {
    return atomic(async (tx) => {
      const record = await tx.transaction.findUnique({
        where: { id },
        include: { obligations: { include: { settlements: true } } },
      });
      if (!record || record.deletedAt)
        throw new DomainError("NOT_FOUND", "Transaction unavailable.", 404);
      if (record.version !== version)
        throw new DomainError(
          "VERSION",
          "This transaction changed. Refresh before editing.",
          409,
        );
      if (["SETTLEMENT", "LOAN_REPAYMENT", "REVERSAL"].includes(record.type))
        throw new DomainError(
          "TYPE",
          "This transaction cannot be edited.",
          409,
        );
      if (record.ledgerId)
        await requireMember(tx, record.ledgerId, userId, true);
      else if (record.sourceId !== userId)
        throw new DomainError(
          "FORBIDDEN",
          "Only its author can edit this transaction.",
          403,
        );
      if (input.ledgerId) {
        const membership = await requireMember(
          tx,
          input.ledgerId,
          userId,
          true,
        );
        if (membership.ledger.currency !== input.currency)
          throw new DomainError("CURRENCY", "Use the group currency.");
      }
      if (record.obligations.some((item) => item.settlements.length))
        throw new DomainError(
          "REPAID",
          "A transaction with repayments cannot be edited.",
          409,
        );
      const people = [
        ...new Set([
          record.sourceId,
          ...input.participants.map((participant) => participant.userId),
          ...(input.destinationId ? [input.destinationId] : []),
        ]),
      ];
      if (input.ledgerId) {
        const members = await tx.ledgerMember.count({
          where: {
            ledgerId: input.ledgerId,
            userId: { in: people },
            leftAt: null,
          },
        });
        if (members !== people.length)
          throw new DomainError(
            "GROUP_MEMBERS",
            "Every person in the transaction must belong to the group.",
            409,
          );
      }
      const otherPeople = people.filter((personId) => personId !== userId);
      const blocked = otherPeople.length
        ? await tx.userBlock.findFirst({
            where: {
              OR: otherPeople.flatMap((personId) => [
                { blockerId: userId, blockedId: personId },
                { blockerId: personId, blockedId: userId },
              ]),
            },
          })
        : null;
      if (blocked)
        throw new DomainError(
          "CONTACT_BLOCKED",
          "Sorry, looks like you are not allowed to edit this transaction.",
          403,
        );
      const distinctTagIds = [...new Set(input.tagIds)];
      const validTags = await tx.tag.count({
        where: {
          id: { in: distinctTagIds },
          ownerId: userId,
          archivedAt: null,
        },
      });
      if (
        validTags !== distinctTagIds.length ||
        distinctTagIds.length !== input.tagIds.length
      )
        throw new DomainError("TAG", "Select your own active tags.");
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
          ? obligations(record.sourceId, splits, input.currency)
          : [];
      await tx.obligation.deleteMany({ where: { transactionId: id } });
      await tx.expenseSplit.deleteMany({ where: { transactionId: id } });
      await tx.transactionParticipant.deleteMany({
        where: { transactionId: id },
      });
      await tx.transactionTag.deleteMany({ where: { transactionId: id } });
      await tx.transactionItem.deleteMany({ where: { transactionId: id } });
      await tx.transaction.update({
        where: { id },
        data: {
          title: input.title,
          amountMinor: input.amountMinor,
          currency: input.currency,
          type: input.type,
          status: input.status,
          occurredAt: new Date(input.occurredAt),
          notes: input.notes,
          icon: input.icon,
          destinationId: input.destinationId,
          ledgerId: input.ledgerId,
          version: { increment: 1 },
          participants: {
            create: people.map((personId) => ({ userId: personId })),
          },
          splits: {
            create: splits.map((split) => ({
              ...split,
              method: input.splitMethod,
              weight: input.participants.find((p) => p.userId === split.userId)
                ?.value,
            })),
          },
          obligations: {
            create: debts.map((debt) => ({
              ...debt,
              ledgerId: input.ledgerId!,
            })),
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
        id,
        "TRANSACTION_EDITED",
        {
          previous: {
            title: record.title,
            amountMinor: Number(record.amountMinor),
            ledgerId: record.ledgerId,
          },
          next: {
            title: input.title,
            amountMinor: input.amountMinor,
            ledgerId: input.ledgerId,
          },
        },
        input.ledgerId ?? record.ledgerId,
        `${record.title}: amount ${Number(record.amountMinor)} → ${input.amountMinor}; group ${record.ledgerId ?? "none"} → ${input.ledgerId ?? "none"}`,
      );
      return { ok: true };
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
          transaction: {
            status: { in: ["SETTLED", "PENDING_LOAN"] },
            deletedAt: null,
          },
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
    action: "complete",
    version: number,
    _reason: string,
  ) {
    return atomic(async (tx) => {
      const record = await tx.transaction.findFirst({
        where: { id, ...visibleTransaction(userId) },
      });
      if (!record)
        throw new DomainError("NOT_FOUND", "Transaction unavailable.", 404);
      if (record.version !== version)
        throw new DomainError(
          "VERSION",
          "This record changed. Refresh before trying again.",
          409,
        );
      if (record.sourceId !== userId)
        throw new DomainError(
          "FORBIDDEN",
          "Only the original author can complete a pending personal payment.",
          403,
        );
      if (record.status !== "PENDING" || record.type !== "PERSONAL_EXPENSE")
        throw new DomainError(
          "STATUS",
          "Only pending personal payments can be completed.",
        );
      await tx.transaction.update({
        where: { id },
        data: { status: "SETTLED", version: { increment: 1 } },
      });
      await audit(
        tx,
        userId,
        id,
        `TRANSACTION_${action.toUpperCase()}`,
        { previousVersion: version, previousStatus: record.status },
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
        const [transactions, ledgers, debts, tags, goals, activity] =
          await Promise.all([
            tx.transaction.findMany({
              where: visibleTransaction(userId),
              select: {
                id: true,
                title: true,
                amountMinor: true,
                currency: true,
                type: true,
                status: true,
                occurredAt: true,
                sourceId: true,
                destinationId: true,
                ledgerId: true,
                notes: true,
                icon: true,
                version: true,
                participants: { select: { userId: true } },
                splits: {
                  select: { userId: true, amountMinor: true },
                },
                items: {
                  orderBy: { position: "asc" },
                  select: { name: true, quantity: true, amountMinor: true },
                },
                tags: {
                  where: { tag: { ownerId: userId } },
                  select: { tagId: true },
                },
              },
              orderBy: { occurredAt: "desc" },
            }),
            tx.ledger.findMany({
              where: { members: { some: { userId, leftAt: null } } },
              select: {
                id: true,
                groupId: true,
                name: true,
                currency: true,
                group: { select: { description: true, deletedAt: true } },
                members: {
                  where: { leftAt: null },
                  select: {
                    userId: true,
                    role: true,
                    user: {
                      select: {
                        profile: { select: { name: true, avatar: true } },
                      },
                    },
                  },
                },
              },
            }),
            tx.obligation.findMany({
              where: {
                ledger: { members: { some: { userId, leftAt: null } } },
                transaction: { deletedAt: null },
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
              include: { actor: { include: { profile: true } } },
            }),
          ]);
        const savedContactIds = new Set<string>();
        for (const ledger of ledgers)
          for (const member of ledger.members)
            if (member.userId !== userId) savedContactIds.add(member.userId);
        for (const transaction of transactions) {
          if (transaction.sourceId !== userId)
            savedContactIds.add(transaction.sourceId);
          if (transaction.destinationId && transaction.destinationId !== userId)
            savedContactIds.add(transaction.destinationId);
          for (const participant of transaction.participants)
            if (participant.userId !== userId)
              savedContactIds.add(participant.userId);
        }
        const savedContacts = await tx.user.findMany({
          where: { id: { in: [...savedContactIds] }, deletedAt: null },
          select: {
            id: true,
            profile: { select: { name: true, avatar: true } },
            phone: { select: { phone: true, verifiedAt: true } },
          },
          orderBy: { profile: { name: "asc" } },
        });
        const contactPreferences = await tx.contactPreference.findMany({
          where: { ownerId: userId, contactId: { in: [...savedContactIds] } },
        });
        const preferences = new Map(
          contactPreferences.map((preference) => [
            preference.contactId,
            preference,
          ]),
        );
        const data: Dashboard = json({
          account: {
            id: userId,
            name: user.profile!.name,
            phone: user.phone!.phone,
            currency: user.profile!.currency,
            avatar: user.profile!.avatar ?? user.profile!.name.slice(0, 2),
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
            deleted: !!l.group.deletedAt,
            members: l.members.map((m) => ({
              id: m.userId,
              name:
                preferences.get(m.userId)?.alias ??
                m.user.profile?.name ??
                "Former member",
              role: m.role,
              avatar: m.user.profile?.avatar ?? undefined,
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
          activity: activity.map((entry) => ({
            id: entry.id,
            ledgerId: entry.ledgerId,
            event: entry.event,
            message: entry.message,
            actorId: entry.actorId,
            actorName:
              entry.actorId === userId
                ? "You"
                : (preferences.get(entry.actorId)?.alias ??
                  entry.actor.profile?.name ??
                  "A member"),
            createdAt: entry.createdAt,
          })),
          savedContacts: savedContacts
            .filter((contact) => !preferences.get(contact.id)?.hiddenAt)
            .map((contact) => ({
              id: contact.id,
              name:
                preferences.get(contact.id)?.alias ??
                contact.profile?.name ??
                "Saved contact",
              phone: contact.phone?.phone,
              verified: !!contact.phone?.verifiedAt,
              avatar: contact.profile?.avatar ?? undefined,
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
