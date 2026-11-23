import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "@/lib/api";

export const ledgers = api.api.ledgers;
export type Cut = InferResponseType<typeof ledgers[":id"]["$get"], 200>;
export type Today = InferResponseType<typeof ledgers.today.$get, 200>;

export class CaptureError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export function failure(status: number, body: { message?: string }) {
  return new CaptureError(status, body.message ?? "No se pudo completar la operación.");
}

export const todayQuery = queryOptions({
  queryKey: ["ledgers", "today"],
  queryFn: async ({ signal }) => {
    const res = await ledgers.today.$get(undefined, { init: { signal } });
    if (res.status !== 200) throw failure(res.status, await res.json());
    return res.json();
  },
});

export const cutQuery = (id: string) => queryOptions({
  queryKey: ["ledgers", "cut", id],
  queryFn: async ({ signal }) => {
    const res = await ledgers[":id"].$get({ param: { id } }, { init: { signal } });
    if (res.status !== 200) throw failure(res.status, await res.json());
    return res.json();
  },
});
