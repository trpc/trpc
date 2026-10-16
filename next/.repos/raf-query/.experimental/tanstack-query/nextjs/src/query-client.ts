import {
	QueryClient,
	type QueryClientConfig,
} from "@raf-query/experimental-tanstack-react-query";
import { cache } from "react";

export const queryClientConfig = {
	defaultOptions: { queries: { staleTime: 5000 } },
} as const satisfies QueryClientConfig;

/** The server components' query client, one per request. */
export const getQueryClient = cache(() => new QueryClient(queryClientConfig));
