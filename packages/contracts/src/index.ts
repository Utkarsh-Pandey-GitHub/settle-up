import { z } from "zod";
export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine((c) => {
    try {
      new Intl.NumberFormat("en", { style: "currency", currency: c });
      return true;
    } catch {
      return false;
    }
  }, "Use an ISO 4217 currency");
export const amountSchema = z.number().int().positive().max(1_000_000_000_000);
export const types = [
  "PERSONAL_EXPENSE",
  "SHARED_EXPENSE",
  "LOAN",
  "LOAN_REPAYMENT",
  "SETTLEMENT",
  "ADJUSTMENT",
  "REVERSAL",
] as const;
export const statuses = [
  "PENDING",
  "SETTLED",
  "DISPUTED",
  "REVERSED",
  "PENDING_LOAN",
] as const;
export const transactionItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z
    .number()
    .positive()
    .max(9999999)
    .refine(
      (n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 0.000001,
      "Use up to three decimal places for quantity.",
    ),
  amountMinor: z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000),
});
export type TransactionItem = z.infer<typeof transactionItemSchema>;
export const createTransactionSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    amountMinor: amountSchema,
    currency: currencySchema.default("INR"),
    type: z.enum(["PERSONAL_EXPENSE", "SHARED_EXPENSE", "LOAN", "ADJUSTMENT"]),
    status: z.enum(["PENDING", "SETTLED", "PENDING_LOAN"]).default("SETTLED"),
    occurredAt: z.string().datetime(),
    notes: z.string().max(2000).optional(),
    icon: z.string().max(16).optional(),
    destinationId: z.string().uuid().optional(),
    ledgerId: z.string().uuid().optional(),
    tagIds: z.array(z.string().uuid()).max(20).default([]),
    paymentReference: z.string().max(128).optional(),
    items: z.array(transactionItemSchema).max(100).optional(),
    splitMethod: z
      .enum(["EQUAL", "EXACT", "PERCENTAGE", "SHARES"])
      .default("EQUAL"),
    participants: z
      .array(
        z.object({
          userId: z.string().uuid(),
          value: z
            .number()
            .int()
            .nonnegative()
            .max(1_000_000_000_000)
            .optional(),
        }),
      )
      .max(100)
      .default([]),
  })
  .superRefine((d, ctx) => {
    if (d.items?.length) {
      if (!["PERSONAL_EXPENSE", "SHARED_EXPENSE"].includes(d.type))
        ctx.addIssue({
          code: "custom",
          path: ["items"],
          message: "Itemisation is available for expenses.",
        });
      if (
        d.items.reduce((sum, item) => sum + item.amountMinor, 0) !==
        d.amountMinor
      )
        ctx.addIssue({
          code: "custom",
          path: ["items"],
          message:
            "Item totals must match the expense. Add tax or discount lines if needed.",
        });
    }
    if (
      d.type === "SHARED_EXPENSE" &&
      (!d.ledgerId || d.participants.length < 1 || d.status !== "SETTLED")
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Shared expenses need a ledger, participants, and posted status.",
      });
    if (
      d.type === "LOAN" &&
      (!d.destinationId || !d.ledgerId || d.status !== "PENDING_LOAN")
    )
      ctx.addIssue({
        code: "custom",
        message: "Loans need a ledger, a borrower, and pending-loan status.",
      });
  });
export type CreateTransaction = z.infer<typeof createTransactionSchema>;
export const settlementSchema = z.object({
  idempotencyKey: z.string().uuid(),
  ledgerId: z.string().uuid(),
  debtorId: z.string().uuid(),
  creditorId: z.string().uuid(),
  amountMinor: amountSchema,
  currency: currencySchema,
  reference: z.string().max(128).optional(),
});
export type CreateSettlement = z.infer<typeof settlementSchema>;
export const shareSchema = z
  .object({
    start: z.string().datetime(),
    end: z.string().datetime(),
    period: z.enum(["DAY", "WEEK", "MONTH", "LAST_30", "YEAR"]).optional(),
    currency: currencySchema,
    ledgerIds: z.array(z.string().uuid()).max(30).default([]),
    tagIds: z.array(z.string().uuid()).max(30).default([]),
    includeTransactions: z.boolean().default(false),
    showDescriptions: z.boolean().default(false),
    recipientPhone: z.string().max(30).optional(),
    expiresInHours: z.number().int().min(1).max(168).default(24),
  })
  .refine(
    (s) => Date.parse(s.end) > Date.parse(s.start),
    "End must follow start",
  );
export type CreateShare = z.infer<typeof shareSchema>;
export const goalSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    amountMinor: amountSchema,
    currency: currencySchema,
    start: z.string().datetime(),
    end: z.string().datetime(),
    period: z
      .enum(["DAY", "WEEK", "MONTH", "YEAR", "CUSTOM", "ONCE"])
      .default("MONTH"),
    tagIds: z.array(z.string().uuid()).default([]),
    ledgerIds: z.array(z.string().uuid()).default([]),
    thresholds: z
      .array(z.number().int().min(1).max(100))
      .default([50, 80, 100]),
  })
  .refine(
    (s) => Date.parse(s.end) > Date.parse(s.start),
    "End must follow start",
  );
export type CreateGoal = z.infer<typeof goalSchema>;
export type Account = {
  id: string;
  name: string;
  phone: string;
  currency: string;
  avatar: string;
};
export type Session = {
  account: Account;
  accessToken: string;
  refreshToken: string;
};
export type TransactionView = {
  id: string;
  title: string;
  amountMinor: number;
  currency: string;
  type: (typeof types)[number];
  status: (typeof statuses)[number];
  occurredAt: string;
  sourceId: string;
  destinationId?: string | null;
  ledgerId?: string | null;
  notes?: string | null;
  icon?: string | null;
  tagIds: string[];
  version: number;
  items?: TransactionItem[];
  allocations: { userId: string; amountMinor: number }[];
};
export type LedgerView = {
  id: string;
  groupId: string;
  name: string;
  description: string;
  currency: string;
  members: { id: string; name: string; role: string }[];
  archived: boolean;
};
export type TagView = {
  id: string;
  name: string;
  color: string;
  archived: boolean;
};
export type GoalView = CreateGoal & { id: string; spentMinor: number };
export type ActivityView = {
  id: string;
  message: string;
  createdAt: string;
  ledgerId?: string | null;
};
export type Dashboard = {
  account: Account;
  transactions: TransactionView[];
  ledgers: LedgerView[];
  obligations: {
    id: string;
    debtorId: string;
    creditorId: string;
    amountMinor: number;
    remainingMinor: number;
    currency: string;
    ledgerId: string;
  }[];
  tags: TagView[];
  goals: GoalView[];
  activity: ActivityView[];
  peers: { id: string; name: string; phone?: string }[];
};
export type Analytics = {
  spendingMinor: number;
  incomingMinor: number;
  outgoingMinor: number;
  owedMinor: number;
  receivableMinor: number;
  byTag: { id: string; amountMinor: number }[];
  byDay: { date: string; amountMinor: number }[];
  byPeer: { id: string; amountMinor: number }[];
  byLedger: { id: string; amountMinor: number }[];
  previousSpendingMinor: number;
  currency: string;
};
