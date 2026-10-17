"use client";

import {
	type DehydratedState,
	hashKey,
	hydrate,
	type HydrateOptions,
	Query,
	type QueryClient,
} from "@raf-query/core";
import { type ReactNode, useEffect, useState } from "react";

import { useQueryClient } from "../provider.tsx";

/**
 * Entries the client has no data for, which children need during this
 * render, and entries it already shows, which must wait for a commit.
 */
function split(client: QueryClient, state: DehydratedState) {
	const shown = new Set(
		client
			.getAll()
			.filter((query) => Query.getUnsafe(query).hasData)
			.map((query) => query.hash),
	);
	const isShown = (query: DehydratedState["queries"][number]) =>
		shown.has(hashKey(query.key));
	return {
		deferred: { queries: state.queries.filter(isShown) },
		now: {
			queries: state.queries.filter((query) => !isShown(query)),
		},
	};
}

/**
 * Writes dehydrated entries into the provided client. Entries the client has
 * no data for are written before its children render, so their reads find
 * the data (or the server's pending request). Newer data for entries already
 * on screen is written after commit, so a render React throws away (an
 * interrupted navigation) doesn't change the current page.
 * Rendered by `HydrationBoundary`; apps don't use it directly.
 */
export function Hydrate(props: {
	readonly children?: ReactNode;
	readonly options?: HydrateOptions;
	readonly state: DehydratedState;
}) {
	const client = useQueryClient();
	const state = props.state;
	const options = props.options;
	const [hydrated, setHydrated] = useState<{
		readonly deferred: DehydratedState;
		readonly state: DehydratedState;
	}>();
	// Once per state. Cache notifications are deferred to a microtask, so
	// other components aren't updated mid-render.
	if (hydrated?.state !== state) {
		const parts = split(client, state);
		hydrate(client, parts.now, options);
		setHydrated({ deferred: parts.deferred, state });
	}
	const deferred = hydrated?.deferred;
	useEffect(() => {
		if (deferred && deferred.queries.length > 0) {
			hydrate(client, deferred, options);
		}
	}, [client, deferred, options]);
	return props.children;
}
