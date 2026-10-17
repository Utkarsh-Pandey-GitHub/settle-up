import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

type Handler = (request: any, reply: WorkerReply) => unknown;
type ErrorHandler = (error: Error, request: any, reply: WorkerReply) => unknown;
type ResponseHook = (request: any, reply: WorkerReply) => unknown;

class WorkerReply {
  statusCode = 200;
  private contentType = "application/json; charset=utf-8";
  private readonly headers = new Headers();
  response?: Response;

  code(status: number) {
    this.statusCode = status;
    return this;
  }

  header(name: string, value: string) {
    this.headers.set(name, value);
    return this;
  }

  type(value: string) {
    this.contentType = value;
    return this;
  }

  send(value: unknown) {
    this.response = this.toResponse(value);
    return this.response;
  }

  toResponse(value: unknown) {
    if (value instanceof Response) return value;
    const body = this.contentType.startsWith("application/json")
      ? JSON.stringify(value ?? null, (_key, item) =>
          typeof item === "bigint" ? Number(item) : item,
        )
      : String(value ?? "");
    this.headers.set("content-type", this.contentType);
    return new Response(body, { status: this.statusCode, headers: this.headers });
  }
}

const log = {
  error: (details: unknown, message?: string) =>
    console.error(message ?? "Request failed", details),
  warn: (details: unknown, message?: string) =>
    console.warn(message ?? "Request warning", details),
  info: (details: unknown, message?: string) =>
    console.info(message ?? "Request info", details),
};

export class WorkerRouter {
  private readonly app = new Hono();
  private errorHandler?: ErrorHandler;
  private readonly responseHooks: ResponseHook[] = [];
  private readonly rateLimits = new Map<
    string,
    { count: number; expiresAt: number }
  >();

  constructor() {
    const origins = process.env.CORS_ORIGIN?.split(",").map((item) => item.trim())
      .filter(Boolean) ?? ["https://settleup.tinkrs.space", "http://localhost:8081"];
    this.app.use("*", cors({ origin: origins }));
    this.app.use("*", secureHeaders());
  }

  register() {
    return this;
  }

  ready() {
    return Promise.resolve(this);
  }

  close() {
    return Promise.resolve();
  }

  setErrorHandler(handler: ErrorHandler) {
    this.errorHandler = handler;
    return this;
  }

  addHook(name: string, hook: ResponseHook) {
    if (name === "onResponse") this.responseHooks.push(hook);
    return this;
  }

  get(path: string, options: unknown, handler?: Handler) {
    return this.route("get", path, options, handler);
  }

  post(path: string, options: unknown, handler?: Handler) {
    return this.route("post", path, options, handler);
  }

  patch(path: string, options: unknown, handler?: Handler) {
    return this.route("patch", path, options, handler);
  }

  delete(path: string, options: unknown, handler?: Handler) {
    return this.route("delete", path, options, handler);
  }

  fetch(request: Request, env?: unknown, ctx?: ExecutionContext) {
    return this.app.fetch(request, env, ctx);
  }

  private route(
    method: "get" | "post" | "patch" | "delete",
    path: string,
    options: unknown,
    handler?: Handler,
  ) {
    const routeHandler = (handler ?? options) as Handler;
    const routeOptions = handler ? (options as any) : undefined;
    (this.app as any)[method](path, async (context: any) => {
      const reply = new WorkerReply();
      const request = await this.toRequest(context, path);
      try {
        this.enforceRateLimit(request, path, routeOptions);
        const result = await routeHandler(request, reply);
        const response = reply.response ?? reply.toResponse(result);
        reply.statusCode = response.status;
        for (const hook of this.responseHooks) {
          try {
            await hook(request, reply);
          } catch (error) {
            log.warn(
              { errorType: error instanceof Error ? error.name : "unknown" },
              "Response hook failed",
            );
          }
        }
        return response;
      } catch (caught) {
        const error = caught instanceof Error ? caught : new Error(String(caught));
        if (!this.errorHandler)
          return Response.json({ error: "internal_error" }, { status: 500 });
        const handled = await this.errorHandler(error, request, reply);
        return reply.response ?? reply.toResponse(handled);
      }
    });
    return this;
  }

  private async toRequest(context: any, route: string) {
    const raw = context.req.raw as Request;
    let body: unknown;
    if (raw.method !== "GET" && raw.method !== "HEAD") {
      const contentType = raw.headers.get("content-type") ?? "";
      const text = await raw.text();
      if (text)
        body = contentType.includes("application/json") ? JSON.parse(text) : text;
    }
    return {
      body,
      headers: Object.fromEntries(raw.headers.entries()),
      log,
      method: raw.method,
      params: context.req.param(),
      query: context.req.query(),
      routeOptions: { url: route },
    };
  }

  private enforceRateLimit(request: any, route: string, options?: any) {
    const setting = options?.config?.rateLimit;
    const max = setting?.max ?? 100;
    const duration = String(setting?.timeWindow ?? "1 minute").startsWith("15")
      ? 15 * 60_000
      : 60_000;
    const client = request.headers["cf-connecting-ip"] ?? "local";
    const key = `${route}:${client}`;
    const now = Date.now();
    let record = this.rateLimits.get(key);
    if (!record || record.expiresAt <= now) {
      record = { count: 0, expiresAt: now + duration };
      this.rateLimits.set(key, record);
    }
    record.count += 1;
    if (this.rateLimits.size > 10_000)
      for (const [item, value] of this.rateLimits)
        if (value.expiresAt <= now) this.rateLimits.delete(item);
    if (record.count > max) {
      const error = new Error("Too many requests.") as Error & {
        statusCode?: number;
      };
      error.statusCode = 429;
      throw error;
    }
  }
}
