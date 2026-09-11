import { parseMoney } from "@settleup/domain";

export const OPENROUTER_API_KEY =
  process.env.EXPO_PUBLIC_OPENROUTER_API_KEY ||
  "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";

export type ExtractedBillItem = {
  name: string;
  quantity: number;
  amountMinor: number;
};

export type ExtractedBillResult = {
  merchantName?: string;
  items: ExtractedBillItem[];
  totalMinor?: number;
  rawText?: string;
};

export async function uriToBase64(uri: string): Promise<string> {
  if (uri.startsWith("data:")) return uri;
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(blob);
  });
}

export async function extractBillWithOpenRouter(
  uri: string,
  currency = "INR",
  onStatus?: (msg: string) => void,
): Promise<ExtractedBillResult> {
  onStatus?.("Reading bill photo...");
  const base64DataUrl = await uriToBase64(uri);

  onStatus?.("Analyzing bill with OpenRouter AI...");

  // Primary model requested: luna-pro / gpt-4o-mini / gemini-flash with vision capabilities
  const openRouterModels = [
    "luna-pro",
    "openai/gpt-4o-mini",
    "openai/gpt-4o",
    "google/gemini-flash-1.5",
    "meta-llama/llama-3.2-11b-vision-instruct",
  ];

  let lastError: Error | null = null;

  for (const model of openRouterModels) {
    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "HTTP-Referer": "https://settleup.app",
            "X-Title": "SettleUp AI Bill Scanner",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Analyze this receipt bill photo. Extract all purchased items with quantities and amounts.
IMPORTANT INSTRUCTIONS FOR TAXES & FEES:
1. Extract every purchased item with its description, quantity, and amount.
2. Treat all taxes (such as GST, CGST, SGST, VAT, Sales Tax), service charges, tips, packing fees, or delivery charges as separate line items in the "items" list (e.g. name: "Tax (GST 18%)", quantity: 1, amount: "36.00").
3. Include discounts as line items with a negative amount (e.g. name: "Discount", quantity: 1, amount: "-50.00").
4. Extract the final grand total amount in "totalAmount".

Return ONLY a valid JSON object matching this exact structure with no markdown formatting or markdown code blocks:
{
  "merchantName": "Store or merchant name",
  "items": [
    {
      "name": "Item description or Tax name",
      "quantity": 1,
      "amount": "150.00"
    }
  ],
  "taxAmount": "0.00",
  "totalAmount": "450.00"
}`,
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: base64DataUrl,
                    },
                  },
                ],
              },
            ],
            temperature: 0.1,
            max_tokens: 1500,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(
          `OpenRouter AI model ${model} response status ${response.status}:`,
          errorText,
        );
        throw new Error(
          `OpenRouter API returned error ${response.status}: ${errorText}`,
        );
      }

      const json = await response.json();
      const content = json.choices?.[0]?.message?.content || "";
      if (!content) {
        throw new Error("No response content from OpenRouter AI model.");
      }

      // Remove markdown code fences if present
      const cleanJson = content
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      const parsed = JSON.parse(cleanJson);

      const items: ExtractedBillItem[] = [];
      let totalMinor: number | undefined;

      if (Array.isArray(parsed.items)) {
        for (const item of parsed.items) {
          if (!item.name || item.amount === undefined || item.amount === null)
            continue;
          try {
            const amountStr = String(item.amount).replace(/[^0-9.-]/g, "");
            const amountMinor = parseMoney(amountStr, currency, true);
            const quantity = Number(item.quantity) || 1;
            items.push({
              name: String(item.name).trim(),
              quantity,
              amountMinor,
            });
          } catch { }
        }
      }

      // If model provided a top-level tax or taxAmount field not already in items list, add it as a line item
      const taxVal = parsed.taxAmount || parsed.tax;
      if (taxVal !== undefined && taxVal !== null) {
        try {
          const taxStr = String(taxVal).replace(/[^0-9.-]/g, "");
          const taxMinor = parseMoney(taxStr, currency, true);
          if (taxMinor > 0) {
            const alreadyHasTax = items.some((i) =>
              /tax|gst|vat|cgst|sgst/i.test(i.name),
            );
            if (!alreadyHasTax) {
              items.push({
                name: "Tax (GST / VAT)",
                quantity: 1,
                amountMinor: taxMinor,
              });
            }
          }
        } catch { }
      }

      if (parsed.totalAmount !== undefined && parsed.totalAmount !== null) {
        try {
          const totalStr = String(parsed.totalAmount).replace(/[^0-9.-]/g, "");
          totalMinor = parseMoney(totalStr, currency, true);
        } catch { }
      }

      if (!totalMinor && items.length > 0) {
        totalMinor = items.reduce((sum, item) => sum + item.amountMinor, 0);
      }

      onStatus?.("Items extracted successfully!");
      return {
        merchantName: parsed.merchantName || undefined,
        items,
        totalMinor,
        rawText: content,
      };
    } catch (err) {
      lastError = err as Error;
      console.warn(`Extraction attempt with model ${model} failed:`, err);
    }
  }

  throw (
    lastError ||
    new Error(
      "Could not extract bill items with OpenRouter AI. Please try a clearer photo.",
    )
  );
}
