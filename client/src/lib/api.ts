import type { AppType } from "@panaderia/server/rpc";
import { hc } from "hono/client";

export const api = hc<AppType>("/");
