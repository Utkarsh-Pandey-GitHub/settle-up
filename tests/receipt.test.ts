import { describe, it, expect } from "vitest";
import { parseReceipt } from "../packages/domain/src/receipt";
import { createTransactionSchema } from "../packages/contracts/src/index";
describe("bill OCR review and itemisation", () => {
  it("extracts quantities, line totals, taxes and discounts without counting subtotals or change", () => {
    expect(
      parseReceipt(
        "Cafe\n2 x Coffee 160.00\nSandwich 1 120.00 120.00\nSubtotal 280.00\nCGST 7.00\nSGST 7.00\nDiscount 14.00\nGRAND TOTAL INR 280.00\nCash 300.00\nChange 20.00",
      ),
    ).toEqual({
      items: [
        { name: "Coffee", quantity: 2, amountMinor: 16000 },
        { name: "Sandwich", quantity: 1, amountMinor: 12000 },
        { name: "CGST", quantity: 1, amountMinor: 700 },
        { name: "SGST", quantity: 1, amountMinor: 700 },
        { name: "Discount", quantity: 1, amountMinor: -1400 },
      ],
      totalMinor: 28000,
    });
  });
  it("does not guess a missing grand total from a subtotal or payment amount", () => {
    expect(
      parseReceipt("Subtotal 140.00\nCash 200.00\nChange 60.00").totalMinor,
    ).toBeUndefined();
    expect(parseReceipt("Unreadable photograph").items).toEqual([]);
  });
  it("handles grouped amounts and fractional quantities", () => {
    expect(parseReceipt("Rice 1.250 x 100.00 125.00\nTotal 1,250.50")).toEqual({
      items: [{ name: "Rice", quantity: 1.25, amountMinor: 12500 }],
      totalMinor: 125050,
    });
  });
  const input = {
    idempotencyKey: "00000000-0000-4000-8000-000000000001",
    title: "Bill",
    amountMinor: 10000,
    currency: "INR",
    type: "PERSONAL_EXPENSE",
    occurredAt: new Date().toISOString(),
  };
  it("allows old clients without items and reconciled signed lines", () => {
    expect(createTransactionSchema.safeParse(input).success).toBe(true);
    expect(
      createTransactionSchema.safeParse({
        ...input,
        items: [
          { name: "Meal", quantity: 2, amountMinor: 11000 },
          { name: "Discount", quantity: 1, amountMinor: -1000 },
        ],
      }).success,
    ).toBe(true);
  });
  it("rejects mismatched totals, empty names and excessive quantity precision", () => {
    for (const item of [
      { name: "Meal", quantity: 1, amountMinor: 9999 },
      { name: " ", quantity: 1, amountMinor: 10000 },
      { name: "Meal", quantity: 0.1234, amountMinor: 10000 },
    ])
      expect(
        createTransactionSchema.safeParse({ ...input, items: [item] }).success,
      ).toBe(false);
  });
});
