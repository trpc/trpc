import type { AnyRouter } from "@tanstack/react-router";

import {
	handleRedirects,
	type RouterIntegrationOptions,
	setupClient,
} from "./tanstack-router-shared.ts";

export type { RouterIntegrationOptions } from "./tanstack-router-shared.ts";

/**
 * The browser build of `@raf-query/react/tanstack-router` (the `browser`
 * export condition): the client half only, so the server's dehydration
 * stream stays out of the app bundle.
 */
export function setupRouterIntegration<TRouter extends AnyRouter>(
	options: RouterIntegrationOptions<TRouter>,
): void {
	setupClient(options);
	handleRedirects(options);
}
