import { NextResponse } from "next/server";

import { createExecutionId } from "@/lib/engine/events";

export type ApiRequestContext = {
  requestId: string;
  startedAt: string;
};

type JsonRecord = Record<string, unknown>;

function firstHeader(req: Request, names: string[]) {
  for (const name of names) {
    const value = req.headers.get(name);
    if (value && value.trim()) return value.trim();
  }
  return null;
}

export function buildApiRequestContext(req: Request): ApiRequestContext {
  return {
    requestId:
      firstHeader(req, ["x-request-id", "x-correlation-id"]) ?? createExecutionId("req"),
    startedAt: new Date().toISOString(),
  };
}

export function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  const message = String(error ?? "").trim();
  return message || fallback;
}

export function logApiEvent(args: {
  scope: string;
  level?: "log" | "warn" | "error";
  context: ApiRequestContext;
  details?: Record<string, unknown>;
}) {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    level: args.level ?? "log",
    scope: args.scope,
    requestId: args.context.requestId,
    ...args.details,
  });
  console[args.level ?? "log"](line);
}

export function jsonWithRequestContext(
  context: ApiRequestContext,
  body: JsonRecord,
  init: ResponseInit = {},
) {
  const headers = new Headers(init.headers);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  headers.set("X-Request-Id", context.requestId);

  return NextResponse.json(
    {
      generatedAt: body.generatedAt ?? new Date().toISOString(),
      requestId: context.requestId,
      ...body,
    },
    {
      ...init,
      headers,
    },
  );
}
