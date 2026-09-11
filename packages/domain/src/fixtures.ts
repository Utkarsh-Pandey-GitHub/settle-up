import type { Dashboard, TransactionView } from "@settleup/contracts";
import { periodRange } from "./index";
export const ids = {
  Utkarsh: "10000000-0000-4000-8000-000000000001",
  rohan: "10000000-0000-4000-8000-000000000002",
  meera: "10000000-0000-4000-8000-000000000003",
  kabir: "10000000-0000-4000-8000-000000000004",
  studio: "10000000-0000-4000-8000-000000000005",
  goa: "20000000-0000-4000-8000-000000000001",
  home: "20000000-0000-4000-8000-000000000002",
  dinner: "20000000-0000-4000-8000-000000000003",
  food: "30000000-0000-4000-8000-000000000001",
  transport: "30000000-0000-4000-8000-000000000002",
  shopping: "30000000-0000-4000-8000-000000000003",
  travel: "30000000-0000-4000-8000-000000000004",
  utilities: "30000000-0000-4000-8000-000000000005",
};
export function demoDashboard(
  accountId = ids.Utkarsh,
  now = new Date(),
): Dashboard {
  const studio = accountId === ids.studio;
  const account = {
    id: accountId,
    name: studio ? "Utkarsh · Studio" : "Utkarsh Mehta",
    phone: studio ? "+919876543214" : "+919876543210",
    currency: "INR",
    avatar: "AM",
  };
  const date = (days: number, hour = 12) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    d.setHours(hour, 30, 0, 0);
    return d.toISOString();
  };
  const tx = (
    n: number,
    title: string,
    amountMinor: number,
    tag: string,
    days: number,
    extra: Partial<TransactionView> = {},
  ): TransactionView => ({
    id: `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    title,
    amountMinor,
    currency: "INR",
    type: "PERSONAL_EXPENSE",
    status: "SETTLED",
    occurredAt: date(days),
    sourceId: accountId,
    tagIds: [tag],
    version: 1,
    allocations: [],
    ...extra,
  });
  const transactions = studio
    ? [
        tx(21, "Design software", 249900, ids.utilities, 0),
        tx(22, "Client coffee", 48000, ids.food, 1),
        tx(23, "Desk essentials", 169000, ids.shopping, 3),
      ]
    : [
        tx(1, "Blue Tokai Coffee", 38000, ids.food, 0, {
          notes: "A little afternoon pick-me-up.",
        }),
        tx(2, "Goa stay · final booking", 840000, ids.travel, 0, {
          type: "SHARED_EXPENSE",
          ledgerId: ids.goa,
          allocations: [accountId, ids.rohan, ids.meera, ids.kabir].map(
            (userId) => ({ userId, amountMinor: 210000 }),
          ),
        }),
        tx(3, "Uber ride home", 24500, ids.transport, 0),
        tx(4, "Sunday ramen", 186000, ids.food, 1, {
          ledgerId: ids.dinner,
          type: "SHARED_EXPENSE",
          allocations: [
            { userId: accountId, amountMinor: 62000 },
            { userId: ids.rohan, amountMinor: 62000 },
            { userId: ids.meera, amountMinor: 62000 },
          ],
        }),
        tx(5, "Weekly groceries", 164000, ids.food, 2, { ledgerId: ids.home }),
        tx(6, "Uniqlo essentials", 249000, ids.shopping, 3),
        tx(7, "Metro top-up", 50000, ids.transport, 4),
        tx(8, "Electricity bill", 128000, ids.utilities, 5),
        tx(9, "Dinner at home", 87000, ids.food, 6),
        tx(10, "Weekend lunch", 94000, ids.food, 7),
        tx(11, "Bookshop stop", 69900, ids.shopping, 8),
        tx(12, "Last month’s essentials", 1490000, ids.shopping, 35),
        tx(13, "Rohan’s train tickets", 250000, ids.travel, 2, {
          type: "LOAN",
          status: "PENDING_LOAN",
          ledgerId: ids.goa,
          destinationId: ids.rohan,
        }),
      ];
  const names = [
    { id: accountId, name: account.name, role: "OWNER" },
    { id: ids.rohan, name: "Rohan Shah", role: "MEMBER" },
    { id: ids.meera, name: "Meera Iyer", role: "MEMBER" },
    { id: ids.kabir, name: "Kabir Sethi", role: "MEMBER" },
  ];
  const range = periodRange("MONTH", "Asia/Kolkata", now);
  return {
    account,
    transactions,
    ledgers: studio
      ? []
      : [
          {
            id: ids.goa,
            groupId: ids.goa,
            name: "Goa, here we come",
            description: "Sun, sea & shared memories",
            currency: "INR",
            members: names,
            archived: false,
          },
          {
            id: ids.home,
            groupId: ids.home,
            name: "Our little home",
            description: "Making adulting a team sport",
            currency: "INR",
            members: names.slice(0, 3),
            archived: false,
          },
          {
            id: ids.dinner,
            groupId: ids.dinner,
            name: "The dinner club",
            description: "Good food. Better company.",
            currency: "INR",
            members: names.slice(0, 3),
            archived: false,
          },
        ],
    obligations: studio
      ? []
      : [
          ...[ids.rohan, ids.meera, ids.kabir].map((debtorId, i) => ({
            id: `50000000-0000-4000-8000-00000000000${i + 1}`,
            debtorId,
            creditorId: accountId,
            amountMinor: 210000,
            remainingMinor: i === 0 ? 110000 : 210000,
            currency: "INR",
            ledgerId: ids.goa,
          })),
          {
            id: "50000000-0000-4000-8000-000000000004",
            debtorId: accountId,
            creditorId: ids.meera,
            amountMinor: 145000,
            remainingMinor: 145000,
            currency: "INR",
            ledgerId: ids.home,
          },
          {
            id: "50000000-0000-4000-8000-000000000005",
            debtorId: ids.rohan,
            creditorId: accountId,
            amountMinor: 250000,
            remainingMinor: 250000,
            currency: "INR",
            ledgerId: ids.goa,
          },
        ],
    tags: [
      {
        id: ids.food,
        name: "Food & drinks",
        color: "#8252E3",
        archived: false,
      },
      {
        id: ids.transport,
        name: "Transport",
        color: "#ECA54C",
        archived: false,
      },
      { id: ids.shopping, name: "Shopping", color: "#8994D6", archived: false },
      { id: ids.travel, name: "Travel", color: "#5EB69B", archived: false },
      {
        id: ids.utilities,
        name: "Utilities",
        color: "#E8898C",
        archived: false,
      },
    ],
    goals: [
      {
        id: "60000000-0000-4000-8000-000000000001",
        name: studio ? "Studio spending" : "Monthly mindful spending",
        amountMinor: studio ? 1500000 : 2500000,
        currency: "INR",
        ...range,
        period: "MONTH",
        tagIds: [],
        ledgerIds: [],
        thresholds: [50, 80, 100],
        spentMinor: 0,
      },
      {
        id: "60000000-0000-4000-8000-000000000002",
        name: "Food & little treats",
        amountMinor: 800000,
        currency: "INR",
        ...range,
        period: "MONTH",
        tagIds: [ids.food],
        ledgerIds: [],
        thresholds: [50, 80, 100],
        spentMinor: 0,
      },
    ],
    activity: studio
      ? []
      : [
          {
            id: "a1",
            message: "You added Goa stay · final booking",
            createdAt: date(0),
            ledgerId: ids.goa,
          },
          {
            id: "a2",
            message: "Rohan recorded a repayment",
            createdAt: date(1),
            ledgerId: ids.goa,
          },
          {
            id: "a3",
            message: "Meera joined Our little home",
            createdAt: date(2),
            ledgerId: ids.home,
          },
        ],
    peers: names.slice(1).map((m) => ({ id: m.id, name: m.name })),
  };
}
