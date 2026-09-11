import { requireOptionalNativeModule } from "expo-modules-core";
export async function recognizeReceipt(
  uri: string,
  onProgress: (progress: number) => void,
): Promise<string> {
  const module = requireOptionalNativeModule<{
    recognize(uri: string): Promise<string>;
  }>("ReceiptScanner");
  if (!module)
    throw new Error(
      "Bill scanning needs a development build of the app. You can still attach the photo and enter items manually.",
    );
  onProgress(0.2);
  const text = await module.recognize(uri);
  onProgress(1);
  return text;
}
