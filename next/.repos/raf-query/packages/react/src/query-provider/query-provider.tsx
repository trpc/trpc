"use client";

import { type ReactNode, useState } from "react";

import { requestInBrowserOnly } from "./browser-requests.ts";
import { QueryClient, type QueryClientConfig } from "@raf-query/core";
import { QueryClientProvider } from "../provider.tsx";

/**
 * The query client provider for React Server Components apps. Creates one
 * client per server render and one per browser tab. The server render
 * starts no request: client components read what `HydrationBoundary` sent,
 * and a query nothing sent renders its Suspense fallback there and loads in
 * the browser.
 *
 * ```tsx
 * // app/layout.tsx
 * <QueryProvider>{props.children}</QueryProvider>
 * ```
 */
export function QueryProvider(props: {
	readonly children?: ReactNode;
	/** Options for the client it creates. */
	readonly config?: QueryClientConfig;
}) {
	const config = props.config;
	const [client] = useState(() => {
		const created = new QueryClient(config);
		requestInBrowserOnly(created);
		return created;
	});
	return (
		<QueryClientProvider client={client}>{props.children}</QueryClientProvider>
	);
}
