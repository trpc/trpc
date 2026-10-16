import {
	applyStaleTime,
	DEFAULT_STALE_TIME,
	queryTimeDefaults,
} from "@examples/db/types";
import { QueryClient } from "@raf-query/react";
import { createContext } from "react-router";

import { readStaleTime } from "./settings.ts";

/** A query client for one server request (or the browser tab), with the bar's stale time. */
export function createAppQueryClient() {
	const staleTime = readStaleTime() ?? DEFAULT_STALE_TIME;
	const queryDefaults = queryTimeDefaults(staleTime);
	const queryClient = new QueryClient({ defaults: queryDefaults });
	// The cache reads this object live. A server client leaves `gcTime` unset.
	if (!queryClient.isServer) {
		applyStaleTime(queryDefaults, staleTime);
	}
	return { queryClient, queryDefaults };
}

/**
 * The request's query client. The root route's `middleware` sets it, so every
 * loader of one request shares a cache.
 */
export const queryClientContext = createContext<QueryClient>();
