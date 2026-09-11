import { parseMoney } from "./index";

/** OCR is a suggestion only. Keep signed line totals; never treat a subtotal as an item. */
export function parseReceipt(text: string, currency = "INR") {
  const items: { name: string; quantity: number; amountMinor: number }[] = [];
  let totalMinor: number | undefined;
  let totalRank = 0;
  for (const raw of text.slice(0, 30000).split(/\r?\n/)) {
    const line = raw
      .trim()
      .replace(/[₹$£€]/g, "")
      .replace(/\b(?:INR|Rs\.?|USD)\s*/gi, "")
      .trim();
    const match = line.match(/^(.*?)\s+(-?\d[\d,]*(?:\.\d{1,2})?)\s*$/);
    if (!match || !/[a-z]/i.test(match[1])) continue;
    let name = match[1].trim();
    let amountMinor: number;
    try {
      const value = match[2].replace(/,/g, "");
      amountMinor =
        parseMoney(value.replace(/^-/, ""), currency, true) *
        (value.startsWith("-") ? -1 : 1);
    } catch {
      continue;
    }
    if (
      /\b(?:sub\s*total|subtotal|total\s+(?:items|qty|quantity)|savings|cash|change|tendered|paid|balance|gstin|tin|invoice|phone|tel|date|time|bill\s*(?:no|number)|order\s*(?:no|number)|table|token)\b/i.test(
        name,
      )
    )
      continue;
    if (
      /\b(?:grand\s*total|net\s*(?:total|amount)|amount\s*(?:due|payable)|total)\b/i.test(
        name,
      )
    ) {
      const rank = /grand|payable|due|net/i.test(name) ? 2 : 1;
      if (amountMinor > 0 && rank >= totalRank) {
        totalMinor = amountMinor;
        totalRank = rank;
      }
      continue;
    }
    let quantity = 1;
    // Common formats: "2 x Coffee 160.00", "Coffee 2 x 80.00 160.00", "Coffee 2 80.00 160.00".
    const leading = name.match(/^(\d+(?:\.\d{1,3})?)\s*[x×]\s+(.+)$/i);
    const trailing = name.match(
      /^(.*?)\s+(\d+(?:\.\d{1,3})?)\s*(?:[x×]\s*)?(?:\d[\d,]*\.\d{2})$/i,
    );
    if (leading) {
      quantity = Number(leading[1]);
      name = leading[2];
    } else if (trailing) {
      quantity = Number(trailing[2]);
      name = trailing[1];
    }
    if (!name || quantity <= 0 || quantity > 9999999) continue;
    if (/\bdiscount\b/i.test(name)) amountMinor = -Math.abs(amountMinor);
    if (items.length < 100)
      items.push({ name: name.slice(0, 120), quantity, amountMinor });
  }
  return { items, totalMinor };
}
