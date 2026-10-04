import { DomainError, parseMoney } from "@settleup/domain";

export const BILL_EXTRACTION_SYSTEM_PROMPT = `You are SettleUp's document-vision extraction engine, optimized first for day-to-day consumer bills. Inspect the supplied image pixels and layout directly. Never use outside knowledge to fill obscured text, and never silently guess a digit, merchant, tax, quantity, or total.

Prioritize the common bills people scan every day: supermarket, kirana and grocery receipts; restaurant, cafe and food-delivery bills; fuel receipts; pharmacy and clinic bills; taxi/auto, parking and toll receipts; electricity, gas, water, broadband and mobile bills; e-commerce invoices; and ordinary handwritten cash memos. Also support GST tax invoices, bills of supply, hotel invoices, hospital bills, tickets, rent receipts, professional-service or wholesale invoices, credit/debit notes and international VAT receipts without letting their extra fields distract from purchased items and the amount actually payable.

Read the supplier/company separately from the customer, marketplace, payment processor, and delivery platform. Capture the printed supplier name, address, GSTIN/tax ID, invoice number and invoice date when visible. For Indian tax documents, keep HSN/SAC, taxable value, CGST, SGST, UTGST, IGST and cess separate. Also separate VAT, service charge, convenience fee, delivery, packing, tip, surcharge, late fee, fine/penalty, discount, coupon, refund and rounding. Never call a service charge or fine a tax. Never duplicate a tax that is already included in an item line.

For every purchased item, preserve the printed description, quantity, unit, unit price and printed full line amount. A line amount is quantity multiplied by unit price after any line-level discount. Use quantity 1 only when the bill truly has no quantity. Keep complimentary or zero-value lines only when clearly printed. Do not treat subtotals, tax summaries, payment-method lines, balances, change, tendered amounts, loyalty points, SKU headings, phone numbers, dates, invoice numbers or GSTINs as purchased items.

Before answering, silently reconcile the arithmetic: each quantity × unit price should agree with its line amount; item lines plus fees and taxes minus discounts should agree with the printed grand total. Prefer an explicitly labelled GRAND TOTAL, NET AMOUNT, AMOUNT DUE or TOTAL PAYABLE over subtotal, taxable value, MRP total, balance, cash tendered, amount paid, savings or change. Do not alter a clearly printed grand total merely to make uncertain lines add up. Report uncertainty in warnings.

Handwritten bills require extra care: follow ruled columns and baselines; distinguish quantity, rate and amount by column position; respect crossed-out values only when a clear replacement exists; use arithmetic only to validate a reading, never to invent unreadable digits; retain a short warning for ambiguous handwriting, merged digits, unclear decimal points, missing edges, shadows, folds or low contrast. If the image is not a bill/receipt/invoice or no monetary total can be read, return an empty items array and explain why in warnings.

Return exactly one JSON object and no prose. Use decimal monetary values in the requested currency. Use null for unreadable optional fields. The schema is:
{"documentType":string,"isHandwritten":boolean,"supplier":{"name":string|null,"address":string|null,"taxId":string|null},"invoice":{"number":string|null,"date":string|null,"currency":string|null},"items":[{"name":string,"quantity":number|null,"unit":string|null,"unitPrice":number|null,"lineAmount":number|null,"hsnSac":string|null,"taxInclusive":boolean|null}],"adjustments":[{"kind":"CGST"|"SGST"|"UTGST"|"IGST"|"CESS"|"VAT"|"SERVICE_CHARGE"|"DELIVERY"|"PACKING"|"TIP"|"SURCHARGE"|"LATE_FEE"|"FINE"|"DISCOUNT"|"COUPON"|"REFUND"|"ROUNDING"|"OTHER","label":string,"rate":number|null,"amount":number}],"totals":{"subtotal":number|null,"taxableValue":number|null,"totalTax":number|null,"grandTotal":number|null,"amountPaid":number|null},"confidence":number,"warnings":string[]}.`;

export function billExtractionRequest(currency: string) {
  return `Extract this ${currency} day-to-day bill using the required schema. Read the complete page in visual order, including small-print tax summaries and handwritten entries. Focus on the company, what the user bought, quantities, rates, line totals, discounts, charges, taxes and final payable amount. Return purchased items once each and adjustments once each. confidence must be between 0 and 1. Perform the arithmetic checks before emitting JSON.`;
}

export function billVisionModels(configured?: string) {
  const requested = configured?.trim();
  // Clef uses OpenRouter's Decisions API and cannot generate the bill JSON
  // expected by this chat-completions route.
  const generative = requested?.startsWith("cloudflare/clef")
    ? undefined
    : requested;
  return [
    ...new Set([generative, "openrouter/free"].filter(Boolean)),
  ] as string[];
}

type FlatLine = { name: string; quantity: number; amountMinor: number };

const taxKinds = new Set(["CGST", "SGST", "UTGST", "IGST", "CESS", "VAT"]);

export function normalizeBillExtraction(raw: any, currency: string) {
  const warnings = Array.isArray(raw?.warnings)
    ? raw.warnings
        .map((warning: unknown) => String(warning).trim().slice(0, 180))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const amountMinor = (value: unknown) => {
    if (value === null || value === undefined || value === "") return undefined;
    const cleaned = String(value).replace(/[^0-9.-]/g, "");
    if (!cleaned || !/^-?\d+(?:\.\d+)?$/.test(cleaned)) return undefined;
    try {
      const negative = cleaned.startsWith("-");
      const amount = parseMoney(cleaned.replace(/^-/, ""), currency, true);
      return negative ? -amount : amount;
    } catch {
      return undefined;
    }
  };
  const inputItems = Array.isArray(raw?.items) ? raw.items : [];
  const items: FlatLine[] = [];
  for (const item of inputItems.slice(0, 80)) {
    const name = String(item?.name ?? item?.description ?? "")
      .trim()
      .slice(0, 120);
    if (!name) continue;
    const quantityValue = Number(item?.quantity);
    const quantity =
      Number.isFinite(quantityValue) && quantityValue > 0
        ? Math.min(quantityValue, 1_000_000)
        : 1;
    const unitPrice = amountMinor(item?.unitPrice);
    let lineAmount = amountMinor(item?.lineAmount ?? item?.amount);
    if (lineAmount === undefined && unitPrice !== undefined)
      lineAmount = Math.round(unitPrice * quantity);
    if (lineAmount === undefined) {
      warnings.push(`${name}: amount could not be read.`);
      continue;
    }
    if (
      unitPrice !== undefined &&
      Math.abs(Math.round(unitPrice * quantity) - lineAmount) > 1
    )
      warnings.push(
        `${name}: printed line amount does not match quantity × rate.`,
      );
    items.push({ name, quantity, amountMinor: lineAmount });
  }

  const taxes: {
    type: string;
    label: string;
    rate?: number;
    amountMinor: number;
  }[] = [];
  const adjustments = Array.isArray(raw?.adjustments) ? raw.adjustments : [];
  for (const adjustment of adjustments.slice(0, 18)) {
    const kind = String(adjustment?.kind ?? "OTHER").toUpperCase();
    const label = String(adjustment?.label || kind)
      .trim()
      .slice(0, 100);
    let amount = amountMinor(adjustment?.amount);
    if (!label || amount === undefined || amount === 0) continue;
    if (["DISCOUNT", "COUPON", "REFUND"].includes(kind))
      amount = -Math.abs(amount);
    else if (kind !== "ROUNDING") amount = Math.abs(amount);
    const rate =
      adjustment?.rate === null || adjustment?.rate === undefined
        ? Number.NaN
        : Number(adjustment.rate);
    const rateLabel = Number.isFinite(rate) && rate >= 0 ? ` ${rate}%` : "";
    items.push({
      name: `${label}${rateLabel}`,
      quantity: 1,
      amountMinor: amount,
    });
    if (taxKinds.has(kind))
      taxes.push({
        type: kind,
        label,
        ...(Number.isFinite(rate) && rate >= 0 ? { rate } : {}),
        amountMinor: amount,
      });
  }

  // Backward-compatible fallback for models that ignored the richer schema.
  const legacyTax = amountMinor(raw?.taxAmount ?? raw?.tax);
  if (
    legacyTax !== undefined &&
    legacyTax !== 0 &&
    !taxes.length &&
    !items.some((item) => /tax|gst|vat|cgst|sgst|igst/i.test(item.name))
  ) {
    items.push({ name: "Tax", quantity: 1, amountMinor: legacyTax });
    taxes.push({ type: "TAX", label: "Tax", amountMinor: legacyTax });
  }

  const totals = raw?.totals ?? {};
  const detectedTotal = amountMinor(
    totals?.grandTotal ?? raw?.totalAmount ?? raw?.grandTotal ?? raw?.total,
  );
  if (detectedTotal !== undefined && detectedTotal <= 0)
    throw new DomainError(
      "BILL_AI_RESULT",
      "This document does not show a positive amount payable.",
    );
  if (!items.length && detectedTotal !== undefined) {
    items.push({
      name: "Bill total · itemisation needs review",
      quantity: 1,
      amountMinor: detectedTotal,
    });
    warnings.push("Individual bill lines could not be read confidently.");
  }
  if (!items.length && detectedTotal === undefined)
    throw new DomainError(
      "BILL_AI_RESULT",
      warnings[0] || "No clear items or total were found. Try a clearer photo.",
    );

  let lineTotal = items.reduce((sum, item) => sum + item.amountMinor, 0);
  if (detectedTotal !== undefined && lineTotal !== detectedTotal) {
    const difference = detectedTotal - lineTotal;
    const smallRounding = Math.abs(difference) <= 100;
    items.push({
      name: smallRounding
        ? "Rounding adjustment"
        : "Unallocated bill difference · review",
      quantity: 1,
      amountMinor: difference,
    });
    if (!smallRounding)
      warnings.push(
        "Extracted lines did not match the printed total; review the unallocated difference.",
      );
    lineTotal += difference;
  }

  const supplier = raw?.supplier ?? {};
  const invoice = raw?.invoice ?? {};
  const confidence = Number(raw?.confidence);
  return {
    merchantName:
      String(supplier?.name ?? raw?.merchantName ?? "")
        .trim()
        .slice(0, 120) || undefined,
    merchantAddress:
      String(supplier?.address ?? "")
        .trim()
        .slice(0, 240) || undefined,
    taxId:
      String(supplier?.taxId ?? "")
        .trim()
        .slice(0, 40) || undefined,
    invoiceNumber:
      String(invoice?.number ?? "")
        .trim()
        .slice(0, 80) || undefined,
    invoiceDate:
      String(invoice?.date ?? "")
        .trim()
        .slice(0, 40) || undefined,
    documentType:
      String(raw?.documentType ?? "Bill")
        .trim()
        .slice(0, 80) || "Bill",
    isHandwritten: raw?.isHandwritten === true,
    items,
    taxes,
    subtotalMinor: amountMinor(totals?.subtotal),
    taxableValueMinor: amountMinor(totals?.taxableValue),
    totalTaxMinor: amountMinor(totals?.totalTax),
    totalMinor: detectedTotal ?? lineTotal,
    confidence:
      Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
        ? confidence
        : undefined,
    warnings: [...new Set(warnings)].slice(0, 8),
  };
}
