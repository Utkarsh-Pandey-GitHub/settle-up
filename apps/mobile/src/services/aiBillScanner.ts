import { request } from "../data/repository";

export type ExtractedBillItem = {
  name: string;
  quantity: number;
  amountMinor: number;
};

export type ExtractedBillResult = {
  merchantName?: string;
  items: ExtractedBillItem[];
  totalMinor?: number;
};

async function uriToBase64(uri: string): Promise<string> {
  if (uri.startsWith("data:")) return uri;
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function extractBillWithOpenRouter(
  accountId: string,
  uri: string,
  currency = "INR",
  onStatus?: (message: string) => void,
): Promise<ExtractedBillResult> {
  onStatus?.("Preparing your bill…");
  const image = await uriToBase64(uri);
  onStatus?.("Reading items, taxes and total…");
  return request<ExtractedBillResult>("/bill/extract", {
    accountId,
    body: { image, currency },
  });
}
