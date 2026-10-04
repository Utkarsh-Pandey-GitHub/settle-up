import { describe, expect, it } from "vitest";
import { normalizeBillExtraction } from "../apps/api/src/bill/extraction";

describe("bill extraction reconciliation", () => {
  it("keeps company details, quantities, CGST and SGST separate", () => {
    const result = normalizeBillExtraction(
      {
        documentType: "GST tax invoice",
        isHandwritten: false,
        supplier: {
          name: "Sample Foods Private Limited",
          address: "New Delhi",
          taxId: "07ABCDE1234F1Z5",
        },
        invoice: { number: "INV-42", date: "2026-10-04" },
        items: [
          {
            name: "Rice bowl",
            quantity: 2,
            unitPrice: 50,
            lineAmount: 100,
          },
          {
            name: "Tea",
            quantity: 1,
            unitPrice: 50,
            lineAmount: 50,
          },
        ],
        adjustments: [
          { kind: "CGST", label: "CGST", rate: 3, amount: 4.5 },
          { kind: "SGST", label: "SGST", rate: 3, amount: 4.5 },
        ],
        totals: {
          subtotal: 150,
          taxableValue: 150,
          totalTax: 9,
          grandTotal: 159,
        },
        confidence: 0.96,
        warnings: [],
      },
      "INR",
    );
    expect(result).toMatchObject({
      merchantName: "Sample Foods Private Limited",
      taxId: "07ABCDE1234F1Z5",
      invoiceNumber: "INV-42",
      totalMinor: 15900,
      totalTaxMinor: 900,
      confidence: 0.96,
    });
    expect(result.taxes.map((tax) => tax.type)).toEqual(["CGST", "SGST"]);
    expect(result.items.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(
      result.totalMinor,
    );
  });

  it("validates quantity times rate without replacing the printed line amount", () => {
    const result = normalizeBillExtraction(
      {
        documentType: "Handwritten cash memo",
        isHandwritten: true,
        supplier: { name: "Corner Store" },
        items: [
          { name: "Notebook", quantity: 3, unitPrice: 20, lineAmount: 70 },
        ],
        adjustments: [],
        totals: { grandTotal: 100 },
        confidence: 0.55,
        warnings: ["One handwritten digit is unclear."],
      },
      "INR",
    );
    expect(result.items[0].amountMinor).toBe(7000);
    expect(result.items.at(-1)).toMatchObject({
      name: "Unallocated bill difference · review",
      amountMinor: 3000,
    });
    expect(result.warnings.join(" ")).toContain("quantity × rate");
    expect(result.warnings.join(" ")).toContain("unallocated difference");
  });

  it("normalizes discounts as negative and reconciles rounding", () => {
    const result = normalizeBillExtraction(
      {
        items: [{ name: "Medicine", quantity: 1, lineAmount: 100 }],
        adjustments: [
          { kind: "DISCOUNT", label: "Discount", rate: null, amount: 10 },
        ],
        totals: { grandTotal: 89.99 },
        warnings: [],
      },
      "INR",
    );
    expect(
      result.items.find((item) => item.name === "Discount")?.amountMinor,
    ).toBe(-1000);
    expect(result.items.at(-1)).toMatchObject({
      name: "Rounding adjustment",
      amountMinor: -1,
    });
  });
});
