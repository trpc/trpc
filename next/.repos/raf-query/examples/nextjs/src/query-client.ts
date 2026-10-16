import { DEFAULT_STALE_TIME } from "@examples/db/types";
import { QueryClient, type QueryClientConfig } from "@raf-query/react";
import { cache } from "react";

/** The server render's client. The browser client's times come from the menu. */
const queryClientConfig = {
	defaults: { staleTime: DEFAULT_STALE_TIME },
} as const satisfies QueryClientConfig;

/** The server components' query client, one per request. */
export const getQueryClient = cache(() => new QueryClient(queryClientConfig));
