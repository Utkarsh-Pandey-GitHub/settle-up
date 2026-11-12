import type {
  CreateTransaction,
  CreateSettlement,
  Dashboard,
} from "@settleup/contracts";
import {
  splitExpense,
  obligations,
  applyRepayment,
  applySimplifiedRepayment,
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
      createdById_idempotencyKey: { createdById: userId, idempotencyKey: key },
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
function expensePayer(
  input: CreateTransaction,
  creatorId: string,
  currentPayer = creatorId,
) {
  if (input.type !== "SHARED_EXPENSE") return creatorId;
  const payer = input.payerId ?? currentPayer;
  if (
    payer !== creatorId &&
    !input.participants.some((person) => person.userId === payer)
  )
    throw new DomainError(
      "PAYER",
      "Choose the creator or a participant as the payer.",
    );
  return payer;
}
function transactionDebts(
  input: CreateTransaction,
  payerId: string,
  splits: ReturnType<typeof splitExpense>,
) {
  if (input.type === "SHARED_EXPENSE")
    return obligations(payerId, splits, input.currency);
  if (input.type !== "LOAN") return [];
  if (input.destinationId === payerId)
    throw new DomainError("SELF_LOAN", "Choose another borrower.");
  return [
    {
      debtorId: input.destinationId!,
      creditorId: payerId,
      amountMinor: input.amountMinor,
      remainingMinor: input.amountMinor,
      currency: input.currency,
    },
  ];
}
export class FinanceService {
  async create(userId: string, input: CreateTransaction) {
    return atomic(async (tx) => {
      const hash = digest(JSON.stringify(input));
      const existing = await idempotent(tx, userId, input.idempotencyKey, hash);
      if (existing) return json(existing);
      const payerId = expensePayer(input, userId);
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
        if (id === userId) continue;
        if (input.ledgerId) await requireMember(tx, input.ledgerId, id, true);
        else {
          const savedContact = await tx.user.findFirst({
            where: {
              id,
              deletedAt: null,
              OR: [
                {
                  savedByPreferences: {
                    some: { ownerId: userId, hiddenAt: null },
                  },
                },
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
        }
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
      const debts = transactionDebts(input, payerId, splits);
      const record = await tx.transaction.create({
        data: {
          sourceId: payerId,
          createdById: userId,
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
            create: debts.map((d) => ({ ...d, ledgerId: input.ledgerId })),
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
        include: {
          participants: true,
          obligations: {
            select: { _count: { select: { settlements: true } } },
          },
        },
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
        if (record.obligations.some((debt) => debt._count.settlements > 0))
          throw new DomainError(
            "REPAID",
            "A transaction with repayments cannot be deleted.",
            409,
          );
        if (record.type === "PERSONAL_EXPENSE" && record.sourceId !== userId)
          throw new DomainError(
            "PERSONAL_EXPENSE_OWNER_ONLY",
            "Only the person who recorded this personal expense can change or delete it.",
            403,
          );
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
        } else if (record.createdById !== userId)
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
        where: { id: { in: uniqueIds }, createdById: userId, deletedAt: null },
        include: {
          participants: true,
          obligations: {
            select: { _count: { select: { settlements: true } } },
          },
        },
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
        if (record.ledgerId && record.ledgerId !== ledgerId)
          throw new DomainError(
            "GROUP_FIXED",
            "This transaction already belongs to a group.",
            409,
          );
        if (
          record.ledgerId !== ledgerId &&
          record.obligations.some((debt) => debt._count.settlements > 0)
        )
          throw new DomainError(
            "REPAID",
            "A transaction with repayments must stay in its original ledger.",
            409,
          );
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
        if (record.ledgerId === ledgerId) continue;
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
        include: {
          splits: true,
          obligations: { include: { settlements: true } },
        },
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
      if (record.type === "PERSONAL_EXPENSE" && record.sourceId !== userId)
        throw new DomainError(
          "PERSONAL_EXPENSE_OWNER_ONLY",
          "Only the person who recorded this personal expense can edit it or make it shared.",
          403,
        );
      if (record.ledgerId)
        await requireMember(tx, record.ledgerId, userId, true);
      else if (record.createdById !== userId)
        throw new DomainError(
          "FORBIDDEN",
          "Only its author can edit this transaction.",
          403,
        );
      if (
        record.ledgerId &&
        input.ledgerId &&
        input.ledgerId !== record.ledgerId
      )
        throw new DomainError(
          "GROUP_FIXED",
          "This transaction must stay in its original group.",
          409,
        );
      const ledgerId = record.ledgerId ?? input.ledgerId;
      if (ledgerId) {
        const membership = await requireMember(tx, ledgerId, userId, true);
        if (membership.ledger.currency !== input.currency)
          throw new DomainError("CURRENCY", "Use the group currency.");
      }
      if (record.obligations.some((item) => item.settlements.length))
        throw new DomainError(
          "REPAID",
          "A transaction with repayments cannot be edited.",
          409,
        );
      if (input.type === "PERSONAL_EXPENSE" && record.createdById !== userId)
        throw new DomainError(
          "PERSONAL_EXPENSE_OWNER_ONLY",
          "Only the creator can make this a personal expense.",
          403,
        );
      const payerId = expensePayer(input, record.createdById, record.sourceId);
      const people = [
        ...new Set([
          record.createdById,
          payerId,
          ...input.participants.map((participant) => participant.userId),
          ...(input.destinationId ? [input.destinationId] : []),
        ]),
      ];
      if (ledgerId) {
        const members = await tx.ledgerMember.count({
          where: {
            ledgerId,
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
      } else {
        for (const personId of people) {
          if (personId === userId) continue;
          const savedContact = await tx.user.findFirst({
            where: {
              id: personId,
              deletedAt: null,
              OR: [
                {
                  savedByPreferences: {
                    some: { ownerId: userId, hiddenAt: null },
                  },
                },
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
        }
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
      const priorSplits = new Map(
        record.splits.map((split) => [split.userId, split]),
      );
      const unchangedSplit =
        record.amountMinor === BigInt(input.amountMinor) &&
        priorSplits.size === input.participants.length &&
        new Set(input.participants.map((person) => person.userId)).size ===
          priorSplits.size &&
        input.participants.every((person) => {
          const prior = priorSplits.get(person.userId);
          return (
            prior &&
            prior.method === input.splitMethod &&
            (input.splitMethod === "EQUAL" ||
              Number(prior.weight) === person.value)
          );
        });
      const splits =
        input.type !== "SHARED_EXPENSE"
          ? []
          : unchangedSplit
            ? record.splits.map(({ userId, amountMinor }) => ({
                userId,
                amountMinor: Number(amountMinor),
              }))
            : splitExpense(
                input.amountMinor,
                input.participants,
                input.splitMethod,
              );
      const debts = transactionDebts(input, payerId, splits);
      await tx.obligation.deleteMany({ where: { transactionId: id } });
      await tx.expenseSplit.deleteMany({ where: { transactionId: id } });
      await tx.transactionParticipant.deleteMany({
        where: { transactionId: id },
      });
      await tx.transactionTag.deleteMany({
        where: { transactionId: id, tag: { ownerId: userId } },
      });
      await tx.transactionItem.deleteMany({ where: { transactionId: id } });
      await tx.transaction.update({
        where: { id },
        data: {
          sourceId: payerId,
          title: input.title,
          amountMinor: input.amountMinor,
          currency: input.currency,
          type: input.type,
          status: input.status,
          occurredAt: new Date(input.occurredAt),
          notes: input.notes,
          icon: input.icon,
          destinationId: input.destinationId,
          ledgerId,
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
              ledgerId,
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
            payerId: record.sourceId,
          },
          next: {
            title: input.title,
            amountMinor: input.amountMinor,
            ledgerId,
            payerId,
          },
        },
        ledgerId,
        `${record.title} was edited`,
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
      if (input.ledgerId) {
        const member = await requireMember(tx, input.ledgerId, userId, true);
        await requireMember(tx, input.ledgerId, input.creditorId, true);
        if (member.ledger.currency !== input.currency)
          throw new DomainError("CURRENCY", "Use the ledger currency.");
      }
      const debts = await tx.obligation.findMany({
        where: {
          ledgerId: input.ledgerId ?? null,
          ...(!input.simplified
            ? { debtorId: userId, creditorId: input.creditorId }
            : !input.ledgerId
              ? {
                  OR: [
                    { debtorId: userId, creditorId: input.creditorId },
                    { debtorId: input.creditorId, creditorId: userId },
                  ],
                }
              : {}),
          currency: input.currency,
          remainingMinor: { gt: 0 },
          transaction: {
            status: { in: ["SETTLED", "PENDING_LOAN"] },
            deletedAt: null,
          },
        },
        orderBy: [{ transaction: { createdAt: "asc" } }, { id: "asc" }],
      });
      const payments = (
        input.simplified ? applySimplifiedRepayment : applyRepayment
      )(
        json(debts),
        userId,
        input.creditorId,
        input.amountMinor,
        input.currency,
      );
      const record = await tx.transaction.create({
        data: {
          sourceId: userId,
          createdById: userId,
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
      const paidIds = new Set(payments.map((payment) => payment.obligationId));
      for (const transactionId of new Set(
        debts
          .filter((debt) => paidIds.has(debt.id))
          .map((debt) => debt.transactionId),
      ))
        if (
          (await tx.obligation.count({
            where: {
              transactionId,
              remainingMinor: { gt: 0 },
            },
          })) === 0
        )
          await tx.transaction.updateMany({
            where: {
              id: transactionId,
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
        const [
          transactions,
          ledgers,
          debts,
          tags,
          goals,
          activity,
          revision,
          contactPreferences,
        ] = await Promise.all([
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
              createdById: true,
              destinationId: true,
              ledgerId: true,
              notes: true,
              icon: true,
              version: true,
              participants: { select: { userId: true } },
              splits: {
                select: {
                  userId: true,
                  amountMinor: true,
                  method: true,
                  weight: true,
                },
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
              updatedAt: true,
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
              transaction: {
                deletedAt: null,
                status: { in: ["SETTLED", "PENDING_LOAN"] },
              },
              OR: [
                { ledger: { members: { some: { userId, leftAt: null } } } },
                {
                  ledgerId: null,
                  OR: [{ debtorId: userId }, { creditorId: userId }],
                },
              ],
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
          tx.dashboardRevision.findUnique({ where: { userId } }),
          tx.contactPreference.findMany({ where: { ownerId: userId } }),
        ]);
        const savedContactIds = new Set(
          contactPreferences
            .filter((contact) => !contact.hiddenAt)
            .map((contact) => contact.contactId),
        );
        for (const ledger of ledgers)
          for (const member of ledger.members)
            if (member.userId !== userId) savedContactIds.add(member.userId);
        for (const transaction of transactions) {
          if (transaction.sourceId !== userId)
            savedContactIds.add(transaction.sourceId);
          if (transaction.createdById !== userId)
            savedContactIds.add(transaction.createdById);
          if (transaction.destinationId && transaction.destinationId !== userId)
            savedContactIds.add(transaction.destinationId);
          for (const participant of transaction.participants)
            if (participant.userId !== userId)
              savedContactIds.add(participant.userId);
        }
        const savedContacts = await tx.user.findMany({
          where: {
            id: {
              in: [
                ...new Set([
                  ...savedContactIds,
                  ...activity.flatMap((entry) =>
                    entry.subjectId ? [entry.subjectId] : [],
                  ),
                ]),
              ],
            },
            deletedAt: null,
          },
          select: {
            id: true,
            profile: { select: { name: true, avatar: true } },
            phone: { select: { phone: true, verifiedAt: true } },
          },
          orderBy: { profile: { name: "asc" } },
        });
        const preferences = new Map(
          contactPreferences.map((preference) => [
            preference.contactId,
            preference,
          ]),
        );
        const aliasFor = (id: string) => {
          const preference = preferences.get(id);
          return preference?.hiddenAt
            ? undefined
            : preference?.alias?.trim() || undefined;
        };
        const profiles = new Map(
          savedContacts.map((contact) => [contact.id, contact.profile?.name]),
        );
        const data: Dashboard = json({
          revision: revision?.revision ?? null,
          account: {
            id: userId,
            name: user.profile!.name,
            phone: user.phone!.phone,
            email: user.profile!.email ?? undefined,
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
            createdById: t.createdById,
            createdByName: profiles.get(t.createdById),
            payerName: profiles.get(t.sourceId),
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
            splitMethod: t.splits[0]?.method,
            splitWeights: Object.fromEntries(
              t.splits.flatMap((split) =>
                split.weight == null
                  ? []
                  : [[split.userId, Number(split.weight)]],
              ),
            ),
          })),
          ledgers: ledgers.map((l) => ({
            id: l.id,
            groupId: l.groupId,
            name: l.name,
            description: l.group.description ?? "",
            currency: l.currency,
            deleted: !!l.group.deletedAt,
            updatedAt: l.updatedAt,
            members: l.members.map((m) => ({
              id: m.userId,
              name:
                aliasFor(m.userId) ?? m.user.profile?.name ?? "Former member",
              role: m.role,
              profileName: m.user.profile?.name,
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
            dailyLimitMinor: g.dailyLimitMinor,
            weeklyLimitMinor: g.weeklyLimitMinor,
            monthlyLimitMinor: g.monthlyLimitMinor,
            active: g.active,
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
            message:
              entry.subjectId &&
              (entry.event === "GROUP_MEMBER_ADDED" ||
                entry.event === "GROUP_MEMBER_REMOVED")
                ? `${entry.subjectId === userId ? "You" : (aliasFor(entry.subjectId) ?? profiles.get(entry.subjectId) ?? "A member")} ${entry.event === "GROUP_MEMBER_ADDED" ? "joined the group" : entry.subjectId === userId ? "were removed from the group" : "was removed from the group"}`
                : entry.message,
            actorId: entry.actorId,
            actorName:
              entry.actorId === userId
                ? "You"
                : (aliasFor(entry.actorId) ??
                  entry.actor.profile?.name ??
                  "A member"),
            createdAt: entry.createdAt,
          })),
          savedContacts: savedContacts
            .filter(
              (contact) =>
                savedContactIds.has(contact.id) &&
                !preferences.get(contact.id)?.hiddenAt,
            )
            .map((contact) => {
              const alias = aliasFor(contact.id);
              const profileName = contact.profile?.name?.trim();
              return {
                id: contact.id,
                name: alias || profileName || "Saved contact",
                profileName,
                contactName: alias,
                phone: contact.phone?.phone,
                verified: !!contact.phone?.verifiedAt,
                avatar: contact.profile?.avatar ?? undefined,
              };
            })
            .sort((a, b) => a.name.localeCompare(b.name)),
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
