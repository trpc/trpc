import { Query, type QueryClient, type QueryFactory } from "@raf-query/core";

/**
 * The digest Next.js gives a boundary that renders only in the browser
 * (`next/dynamic` with `ssr: false`); it doesn't report those errors.
 */
const clientRendering = "BAILOUT_TO_CLIENT_SIDE_RENDERING";

const browserOnly = new WeakSet<QueryClient<unknown>>();

/**
 * Make a server client's render start no request: it reads what a
 * `HydrationBoundary` sent, and anything else loads in the browser.
 */
export function requestInBrowserOnly(client: QueryClient<unknown>) {
	browserOnly.add(client);
}

/** Whether a render may start `client`'s requests (`useWaterfall`). */
export function startsRequests(client: QueryClient<unknown>): boolean {
	return !(client.isServer && browserOnly.has(client));
}

/**
 * Thrown by a server render's read of a query no `HydrationBoundary` sent.
 * React renders the nearest Suspense fallback, and the browser renders the
 * content.
 */
class BrowserRenderError extends Error {
	readonly digest = clientRendering;
	constructor(hash: string) {
		super(`Query ${hash} loads in the browser: no HydrationBoundary sent it`);
	}
}

/** Throw {@link BrowserRenderError} if reading `query` would start a request here. */
export function assertSent<TFactory extends QueryFactory>(
	client: QueryClient<unknown>,
	query: Query.Query<TFactory>,
) {
	if (startsRequests(client)) {
		return;
	}
	const state = Query.getUnsafe(query);
	if (!state.hasData && !state.isFetching && state.status !== "error") {
		throw new BrowserRenderError(query.hash);
	}
}
