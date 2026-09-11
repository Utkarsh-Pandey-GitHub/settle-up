import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DomainError } from "@settleup/domain";
import { db, visibleTransaction } from "./database";
import { AuthService } from "../auth/service";
const accepted = ["image/jpeg", "image/png", "application/pdf"] as const;
export interface AttachmentProvider {
  upload(objectKey: string, contentType: string, size: number): Promise<string>;
  download(objectKey: string): Promise<string>;
  inspect(objectKey: string): Promise<"READY" | "REJECTED" | "QUARANTINED">;
}
// A production gateway signs storage URLs and releases files only after malware scanning.
export class GatewayAttachmentProvider implements AttachmentProvider {
  private async call(operation: string, input: unknown) {
    const base = process.env.STORAGE_GATEWAY_URL;
    if (!base?.startsWith("https://") || !process.env.STORAGE_GATEWAY_TOKEN)
      throw new DomainError(
        "STORAGE_CONFIG",
        "Receipt storage is not configured.",
        503,
      );
    const response = await fetch(`${base}/${operation}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.STORAGE_GATEWAY_TOKEN}`,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new DomainError(
        "STORAGE",
        "Receipt storage is temporarily unavailable.",
        503,
      );
    return response.json() as Promise<{
      url: string;
      state: "READY" | "REJECTED" | "QUARANTINED";
    }>;
  }
  async upload(objectKey: string, contentType: string, size: number) {
    return (
      await this.call("upload", {
        objectKey,
        contentType,
        size,
        expiresInSeconds: 300,
      })
    ).url;
  }
  async download(objectKey: string) {
    return (await this.call("download", { objectKey, expiresInSeconds: 60 }))
      .url;
  }
  async inspect(objectKey: string) {
    return (await this.call("inspect", { objectKey })).state;
  }
}
const signature = (body: string) =>
  createHmac("sha256", process.env.JWT_SECRET!)
    .update(`attachment:${body}`)
    .digest("base64url");
function signed(key: string, operation: "upload" | "download") {
  const body = Buffer.from(
    JSON.stringify({
      key,
      operation,
      expires: Date.now() + (operation === "upload" ? 300000 : 60000),
    }),
  ).toString("base64url");
  return `${body}.${signature(body)}`;
}
function verify(token: string, operation: string) {
  const [body, sig = ""] = token.split(".");
  const expected = signature(body ?? "");
  if (
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
    throw new DomainError("UPLOAD_TOKEN", "Receipt link is unavailable.", 404);
  const data = z
    .object({
      key: z.string().uuid(),
      operation: z.literal(operation),
      expires: z.number(),
    })
    .parse(JSON.parse(Buffer.from(body, "base64url").toString()));
  if (data.expires <= Date.now())
    throw new DomainError("UPLOAD_TOKEN", "Receipt link expired.", 404);
  return data.key;
}
const directory = join(tmpdir(), "settleup-receipts");
export class DevelopmentAttachmentProvider implements AttachmentProvider {
  async upload(key: string) {
    return `${process.env.API_PUBLIC_URL ?? "http://localhost:4000"}/storage/upload/${signed(key, "upload")}`;
  }
  async download(key: string) {
    return `${process.env.API_PUBLIC_URL ?? "http://localhost:4000"}/storage/download/${signed(key, "download")}`;
  }
  async inspect(key: string) {
    try {
      await readFile(join(directory, key));
      return "READY" as const;
    } catch {
      return "QUARANTINED" as const;
    }
  }
}
export async function registerAttachments(
  app: FastifyInstance,
  auth: AuthService,
) {
  const dev =
    process.env.NODE_ENV !== "production" &&
    process.env.STORAGE_PROVIDER !== "gateway";
  const provider: AttachmentProvider = dev
    ? new DevelopmentAttachmentProvider()
    : new GatewayAttachmentProvider();
  app.post("/transactions/:id/attachments", async (req) => {
    const { userId } = await auth.authenticate(req.headers.authorization);
    const id = z
      .string()
      .uuid()
      .parse((req.params as { id: string }).id);
    if (!(await db.transaction.findFirst({ where: { id, sourceId: userId } })))
      throw new DomainError("NOT_FOUND", "Transaction unavailable.", 404);
    const b = z
      .object({
        contentType: z.enum(accepted),
        size: z
          .number()
          .int()
          .positive()
          .max(10 * 1024 * 1024),
      })
      .parse(req.body);
    if ((await db.attachment.count({ where: { transactionId: id } })) >= 5)
      throw new DomainError(
        "ATTACHMENTS",
        "At most five receipts per transaction.",
      );
    const record = await db.attachment.create({
      data: { transactionId: id, objectKey: randomUUID(), ...b },
    });
    return {
      id: record.id,
      uploadUrl: await provider.upload(record.objectKey, b.contentType, b.size),
    };
  });
  app.post("/attachments/:id/complete", async (req) => {
    const { userId } = await auth.authenticate(req.headers.authorization);
    const id = z
      .string()
      .uuid()
      .parse((req.params as { id: string }).id);
    const a = await db.attachment.findFirst({
      where: { id, transaction: { sourceId: userId } },
    });
    if (!a) throw new DomainError("NOT_FOUND", "Receipt unavailable.", 404);
    const state = await provider.inspect(a.objectKey);
    await db.attachment.update({ where: { id }, data: { state } });
    return { id, state };
  });
  app.get("/transactions/:id/attachments", async (req) => {
    const { userId } = await auth.authenticate(req.headers.authorization);
    const id = z
      .string()
      .uuid()
      .parse((req.params as { id: string }).id);
    if (
      !(await db.transaction.findFirst({
        where: { id, ...visibleTransaction(userId) },
      }))
    )
      throw new DomainError("NOT_FOUND", "Transaction unavailable.", 404);
    return db.attachment.findMany({
      where: { transactionId: id },
      select: { id: true, state: true, contentType: true, size: true },
    });
  });
  app.get("/attachments/:id/download", async (req) => {
    const { userId } = await auth.authenticate(req.headers.authorization);
    const id = z
      .string()
      .uuid()
      .parse((req.params as { id: string }).id);
    const a = await db.attachment.findFirst({
      where: { id, state: "READY", transaction: visibleTransaction(userId) },
    });
    if (!a)
      throw new DomainError(
        "NOT_FOUND",
        "Receipt unavailable or still being scanned.",
        404,
      );
    return { url: await provider.download(a.objectKey) };
  });
  if (dev) {
    app.addContentTypeParser(
      [...accepted],
      { parseAs: "buffer", bodyLimit: 10 * 1024 * 1024 },
      (_req, body, done) => done(null, body),
    );
    app.put(
      "/storage/upload/:token",
      { bodyLimit: 10 * 1024 * 1024 },
      async (req) => {
        const key = verify((req.params as { token: string }).token, "upload");
        const a = await db.attachment.findUnique({ where: { objectKey: key } });
        const body = req.body as Buffer;
        if (
          !a ||
          a.state !== "QUARANTINED" ||
          !Buffer.isBuffer(body) ||
          body.length !== a.size ||
          req.headers["content-type"] !== a.contentType
        )
          throw new DomainError(
            "RECEIPT",
            "Receipt size or type does not match.",
          );
        const magic =
          a.contentType === "image/jpeg"
            ? body.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
            : a.contentType === "image/png"
              ? body
                  .subarray(0, 8)
                  .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
              : body.subarray(0, 5).toString() === "%PDF-";
        if (!magic)
          throw new DomainError(
            "RECEIPT",
            "The receipt content does not match its declared format.",
          );
        await mkdir(directory, { recursive: true, mode: 0o700 });
        try {
          await writeFile(join(directory, key), body, {
            flag: "wx",
            mode: 0o600,
          });
        } catch {
          throw new DomainError(
            "REPLAY",
            "This upload link was already used.",
            409,
          );
        }
        return { ok: true };
      },
    );
    app.get("/storage/download/:token", async (req, reply) => {
      const key = verify((req.params as { token: string }).token, "download");
      const a = await db.attachment.findUnique({ where: { objectKey: key } });
      if (!a || a.state !== "READY")
        throw new DomainError("NOT_FOUND", "Receipt unavailable.", 404);
      return reply
        .header("content-type", "application/octet-stream")
        .header("content-disposition", 'attachment; filename="receipt"')
        .header("cache-control", "no-store")
        .send(await readFile(join(directory, key)));
    });
  }
}
