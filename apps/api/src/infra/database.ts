import { PrismaClient, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { DomainError } from "@settleup/domain";
export const db = new PrismaClient();
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export type Db = Prisma.TransactionClient;
export async function atomic<T>(operation: (tx: Db) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(e.code) &&
        attempt < 3
      )
        continue;
      throw e;
    }
  }
}
export const json = <T>(value: T): any =>
  JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? Number(v) : v)),
  );
export async function requireMember(
  tx: Db,
  ledgerId: string,
  userId: string,
  writing = false,
) {
  const member = await tx.ledgerMember.findUnique({
    where: { ledgerId_userId: { ledgerId, userId } },
    include: { ledger: true },
  });
  if (!member || member.leftAt || (writing && member.ledger.archivedAt))
    throw new DomainError("NOT_FOUND", "Ledger unavailable.", 404);
  return member;
}
export const visibleTransaction = (
  userId: string,
): Prisma.TransactionWhereInput => ({
  AND: [
    { deletedAt: null },
    {
      OR: [
        { sourceId: userId },
        { destinationId: userId },
        { participants: { some: { userId } } },
        { ledger: { members: { some: { userId, leftAt: null } } } },
      ],
    },
  ],
});
export async function audit(
  tx: Db,
  actorId: string,
  resourceId: string,
  action: string,
  detail: Prisma.InputJsonValue = {},
  ledgerId?: string | null,
  message = action.toLowerCase().replace(/_/g, " "),
) {
  await tx.auditEvent.create({ data: { actorId, resourceId, action, detail } });
  if (ledgerId)
    await tx.ledgerActivity.create({
      data: { actorId, ledgerId, event: action, message },
    });
}
