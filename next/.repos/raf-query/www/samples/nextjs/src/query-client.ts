import { QueryClient, type QueryClientConfig } from "@raf-query/react";
import { cache } from "react";

export const queryClientConfig = {
	defaults: { staleTime: 5000 },
} as const satisfies QueryClientConfig;

export const getQueryClient = cache(() => new QueryClient(queryClientConfig));
