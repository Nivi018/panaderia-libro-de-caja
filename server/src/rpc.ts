import type { ApplyGlobalResponse } from "hono/client";
import type { createApp } from "./app.js";

export type AppType = ApplyGlobalResponse<ReturnType<typeof createApp>, {
  400: { json: { code: "INVALID_INPUT"; message: string } };
  401: { json: { code: "UNAUTHENTICATED"; message: string } };
  403: { json: { code: "FORBIDDEN"; message: string } };
  500: { json: { code: "INTERNAL_ERROR"; message: string } };
}>;
