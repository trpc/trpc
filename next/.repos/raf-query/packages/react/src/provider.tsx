"use client";

import { createContext, type ReactNode, use, useEffect } from "react";

import type { QueryClient } from "@raf-query/core";

/**
 * A hook can't know which services the provider's client has, so its verbs
 * take any factory here.
 */
const QueryClientContext = createContext<QueryClient<unknown> | null>(null);

/**
 * Provides a client to the tree, and refetches its read, stale queries on
 * window focus and reconnect while mounted.
 */
export function QueryClientProvider(props: {
	readonly children?: ReactNode;
	readonly client: QueryClient<unknown>;
}) {
	const client = props.client;
	useEffect(() => client.mount(), [client]);
	return (
		<QueryClientContext value={client}>{props.children}</QueryClientContext>
	);
}

/** The nearest provider's client, or `null` outside one. */
export function useOptionalQueryClient(): QueryClient<unknown> | null {
	return use(QueryClientContext);
}

/** The client from the nearest {@link QueryClientProvider}. */
export function useQueryClient(): QueryClient<unknown> {
	const client = use(QueryClientContext);
	if (!client) {
		throw new Error(
			"useQueryClient: no QueryClientProvider above this component",
		);
	}
	return client;
}
