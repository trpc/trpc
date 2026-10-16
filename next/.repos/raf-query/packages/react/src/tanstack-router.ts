import type { AnyRouter } from "@tanstack/react-router";
import { Effect, Exit, Scope, Stream } from "effect";

import {
	type DehydratedRouterQueries,
	handleRedirects,
	type RouterIntegrationOptions,
	setupClient,
} from "./tanstack-router-shared.ts";

export type { RouterIntegrationOptions } from "./tanstack-router-shared.ts";

const noop = () => {};

function setupServer<TRouter extends AnyRouter>(
	options: RouterIntegrationOptions<TRouter>,
) {
	const router = options.router;
	const queryClient = options.queryClient;
	const originalDehydrate = router.options.dehydrate;
	let finish = noop;
	let cleanedUp = false;

	const teardown = () => {
		cleanedUp = true;
		finish();
		queryClient.clear();
	};

	// Registered before `router.load()`, so redirects and errors thrown before
	// dehydration still clear the request's cache.
	router.serverSsrLifecycle = {
		...router.serverSsrLifecycle,
		onServerSsrAttach: [
			...(router.serverSsrLifecycle?.onServerSsrAttach ?? []),
			(serverSsr) => serverSsr.onCleanup(teardown),
		],
	};

	router.options.dehydrate = async (): Promise<
		DehydratedRouterQueries | undefined
	> => {
		const dehydrated = await originalDehydrate?.();
		if (cleanedUp) {
			queryClient.clear();
			return undefined;
		}

		const scope = Scope.makeUnsafe();
		const stream = Effect.runSync(
			queryClient.effect
				.dehydrateStream(options.dehydrateOptions)
				.pipe(Scope.provide(scope)),
		);
		finish = () => {
			finish = noop;
			Effect.runSync(Scope.close(scope, Exit.void));
		};
		router.serverSsr?.onRenderFinished(() => finish());

		return {
			...dehydrated,
			raf: {
				initial: stream.initial,
				stream: Stream.toReadableStream(stream.updates),
			},
		};
	};
}

/**
 * Connects a query client to a TanStack Router (and TanStack Start) router:
 *
 * - During SSR, sends the cache to the browser with the router's dehydrated
 *   state, then streams entries as they start or settle. Pending entries
 *   cross as promises, so the browser resumes them instead of refetching.
 * - Clears the request's cache when the response finishes.
 * - Turns `redirect()` thrown from a `queryFn` into a navigation.
 *
 * Call it in `getRouter`, which runs once per request on the server.
 */
export function setupRouterIntegration<TRouter extends AnyRouter>(
	options: RouterIntegrationOptions<TRouter>,
): void {
	if (options.router.isServer) {
		setupServer(options);
	} else {
		setupClient(options);
	}
	handleRedirects(options);
}
