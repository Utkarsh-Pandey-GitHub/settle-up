# Bill extraction rules

SettleUp treats bill scanning as document understanding followed by deterministic accounting checks. It is tuned primarily for day-to-day consumer bills. The image is sent once to the server-selected vision model and is not stored as a receipt attachment.

## Layout coverage

The highest-priority layouts are supermarket, kirana and grocery receipts; restaurant, cafe and food-delivery bills; fuel receipts; pharmacy and clinic bills; taxi/auto, parking and toll receipts; electricity, gas, water, broadband and mobile bills; e-commerce invoices; and handwritten cash memos. The extractor also handles GST tax invoices, bills of supply, hotel and hospital invoices, tickets, rent receipts, professional-service and wholesale invoices, credit and debit notes, and international VAT receipts.

## Required separation

- Supplier/company details stay separate from customer, marketplace, payment processor, and delivery-platform details.
- Purchased items retain description, quantity, unit, unit price, printed line amount, HSN/SAC, and whether tax is included when visible.
- CGST, SGST, UTGST, IGST, cess, VAT, service charge, delivery, packing, tip, surcharge, late fee, fine or penalty, discount, coupon, refund, and rounding remain separate adjustments.
- Subtotal, taxable value, total tax, grand total, and amount paid are distinct totals. The payable grand total takes precedence over cash tendered, savings, balance, or change.

## Accuracy and reconciliation

The server validates quantity multiplied by unit price against the printed line amount while preserving the printed value. It also compares all extracted item and adjustment lines against the printed grand total. Differences up to one currency unit become an explicit rounding line. Larger differences become an `Unallocated bill difference · review` line and a visible warning, so the result remains arithmetically valid without silently hiding uncertain extraction.

Handwritten documents are read by column and baseline. Crossed-out values are ignored only when a clear replacement exists. Arithmetic can validate a reading but cannot invent an unreadable digit. Ambiguous handwriting, decimal points, cropped edges, shadows, folds, faded thermal print, and low contrast are surfaced as review warnings.

The design follows the official CBIC invoice fields for supplier identity, HSN/SAC, quantity, taxable value, tax rate and separate tax amounts. It also accounts for the receipt-image problems documented by SROIE research: poor paper and print quality, folds, distortion, small text, complex layouts, and the need to preserve reading order.

## Server configuration

```ini
OPENROUTER_API_KEY=<server-only key>
BILL_VISION_MODEL=openrouter/free
```

`openrouter/free` keeps the workflow free but model availability and handwriting quality can vary. `BILL_VISION_MODEL` can later be changed to a stronger vision model without a mobile release.

## References

- CBIC, [Tax Invoice, Credit and Debit Notes](https://cbic-gst.gov.in/gst-invoice-rules.html)
- ICDAR/SROIE, [Scanned Receipt OCR and Information Extraction](https://arxiv.org/abs/2103.10213)
- [Extending TrOCR for full-page scanned receipt OCR](https://arxiv.org/abs/2212.05525)
