import { httpServerHandler } from "cloudflare:node";
import type { Server } from "node:http";
import { createApp } from "./app";

const app = await createApp();

await app.ready();

export default httpServerHandler(
  app.server as Server & { address(): { port?: number | null } | null },
);