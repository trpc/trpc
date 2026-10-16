"use client";

import {
	environmentManager,
	QueryClient,
	type QueryClientConfig,
	QueryClientProvider,
} from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

let browserClient: QueryClient | undefined;

/**
 * A new client per request on the server, and one per tab in the browser.
 * The browser's lives outside React: if the first render suspends with no
 * Suspense boundary above, React throws away the provider's state, and a
 * client kept in state would be lost with its cache.
 */
function clientFor(config: QueryClientConfig | undefined) {
	if (environmentManager.isServer()) {
		return new QueryClient(config);
	}
	browserClient ??= new QueryClient(config);
	return browserClient;
}

/**
 * The query client provider for Next.js App Router. Pair it with
 * `HydrationBoundary` from `@raf-query/experimental-tanstack-react-query/rsc` in the
 * server components that start queries.
 *
 * ```tsx
 * // app/layout.tsx
 * <QueryProvider>{props.children}</QueryProvider>
 * ```
 */
export function QueryProvider(props: {
	readonly children?: ReactNode;
	/** Options for the client it creates. Must be serializable. */
	readonly config?: QueryClientConfig;
}) {
	const config = props.config;
	const [client] = useState(() => clientFor(config));
	return (
		<QueryClientProvider client={client}>{props.children}</QueryClientProvider>
	);
}
