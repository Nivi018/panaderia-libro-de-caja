import { QueryClient, queryOptions } from "@tanstack/react-query";
import { api } from "./api";

export const queryClient = new QueryClient();

export const currentUserQuery = queryOptions({
  queryKey: ["current-user"],
  retry: false,
  queryFn: async ({ signal }) => {
    const result = await api.api.me.$get(undefined, { init: { signal } });
    if (result.status === 200) return result.json();
    if (result.status === 401) return null;
    throw new Error((await result.json()).message);
  },
});
