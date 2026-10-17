import { createApp } from "./app";
import type { WorkerRouter } from "./infra/worker-router";
import { configureDatabaseUrl } from "./infra/database";

const app = createApp() as unknown as WorkerRouter;

export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/favicon.ico") return new Response(null, { status: 204 });

    try {
      const hyperdrive = (env as {
        HYPERDRIVE?: { connectionString?: string };
      })?.HYPERDRIVE;
      if (hyperdrive?.connectionString)
        configureDatabaseUrl(hyperdrive.connectionString);
      return await app.fetch(request as any, env, ctx);
    } catch (error) {
      console.error("Worker error:", error);
      return Response.json({ error: "internal_error" }, { status: 500 });
    }
  },
};
