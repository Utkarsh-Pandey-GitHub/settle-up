import { createWorker } from "tesseract.js";
export async function recognizeReceipt(
  uri: string,
  onProgress: (progress: number) => void,
): Promise<string> {
  const worker = await createWorker("eng", 1, {
    logger: (message) => {
      if (message.status === "recognizing text") onProgress(message.progress);
    },
  });
  try {
    const result = await worker.recognize(uri);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}
