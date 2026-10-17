import {
	type DehydratedState,
	type DehydrateOptions,
	hydrate,
	type HydrateOptions,
	type QueryClient,
	type QueryHandle,
} from "@raf-query/core";
import { type AnyRouter, isRedirect } from "@tanstack/react-router";
import { Predicate } from "effect";

declare module "@tanstack/react-router" {
	interface SerializableExtensions {
		/**
		 * Handles are `{ key, input, data? }`, which the router's serializer
		 * sends as is (`data` is dehydrated anyway, so it is serializable). Its
		 * type check can't see that on its own: keys are
		 * `ReadonlyArray<unknown>`, and the handle type names its factory.
		 * So `beforeLoad` can put handles in route context.
		 */
		rafQueryHandle: QueryHandle;
	}
}

export interface RouterIntegrationOptions<TRouter extends AnyRouter> {
	readonly dehydrateOptions?: DehydrateOptions;
	/** Navigate when a `queryFn` throws `redirect()`. Default `true`. */
	readonly handleRedirects?: boolean;
	readonly hydrateOptions?: HydrateOptions;
	readonly queryClient: QueryClient;
	readonly router: TRouter;
}

export interface DehydratedRouterQueries {
	readonly raf: {
		readonly initial: DehydratedState;
		readonly stream: ReadableStream<DehydratedState>;
	};
}

function hasRafQueries(value: unknown): value is DehydratedRouterQueries {
	return Predicate.hasProperty(value, "raf") && Predicate.isObject(value.raf);
}

/**
 * Hydrate each state as the server's stream delivers it. Reads the stream
 * directly: `Stream.fromReadableStream` + `QueryCache.hydrateStream` would
 * put Effect's `Stream` and `Queue` in the browser bundle.
 */
async function hydrateEach(
	client: QueryClient,
	stream: ReadableStream<DehydratedState>,
	options: HydrateOptions | undefined,
) {
	const reader = stream.getReader();
	for (;;) {
		const next = await reader.read();
		if (next.done) {
			return;
		}
		hydrate(client, next.value, options);
	}
}

export function setupClient<TRouter extends AnyRouter>(
	options: RouterIntegrationOptions<TRouter>,
): void {
	const router = options.router;
	const client = options.queryClient;
	const hydrateOptions = options.hydrateOptions;
	const originalHydrate = router.options.hydrate;
	router.options.hydrate = async (dehydrated: unknown) => {
		await originalHydrate?.(dehydrated);
		if (!hasRafQueries(dehydrated)) {
			return;
		}
		const raf = dehydrated.raf;
		hydrate(client, raf.initial, hydrateOptions);
		hydrateEach(client, raf.stream, hydrateOptions).catch((error: unknown) => {
			// Entries still pending stay pending; surface why. On the console:
			// `Effect.logError` would put Effect's logger in the app.
			// oxlint-disable-next-line eslint/no-console -- see above
			console.error("raf-query: reading the query stream failed", error);
		});
	};
}

export function handleRedirects<TRouter extends AnyRouter>(
	options: RouterIntegrationOptions<TRouter>,
): void {
	if (!(options.handleRedirects ?? true)) {
		return;
	}
	const router = options.router;
	options.queryClient.subscribe((event) => {
		if (event.type === "failed" && isRedirect(event.error)) {
			const redirect = event.error;
			// The router's own field for resolving a redirect relative to here.
			// oxlint-disable-next-line eslint/no-underscore-dangle
			redirect.options._fromLocation = router.stores.location.get();
			void router.navigate(router.resolveRedirect(redirect).options);
		}
	});
}
