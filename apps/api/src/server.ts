import "dotenv/config";
import { createApp } from "./app";
import { db } from "./infra/database";
const app = await createApp();
await app.listen({
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "0.0.0.0",
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    await db.$disconnect();
    process.exit(0);
  });// API Server initialized
