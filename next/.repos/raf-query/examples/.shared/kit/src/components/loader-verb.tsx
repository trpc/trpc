"use client";

import type { LoaderVerb } from "@examples/db/types";

/**
 * Where an app's loaders run after the first page load. `server`: every
 * navigation loads on the server with a new, empty client (React server
 * components, React Router loaders), so `ensure` waits like `fetch`.
 */
export type LoaderRuntime = "browser" | "server";

const prefetchHint =
	"Never waits: pages open at once, and each part shows a skeleton until its data lands.";

const hints = {
	browser: {
		ensure:
			"Waits for data the cache doesn't have. Cached data shows at once, even when stale, and refetches behind it.",
		fetch:
			"Waits for fresh data: on a cache miss, and when the cached data is stale.",
		prefetch: prefetchHint,
	},
	server: {
		ensure:
			"Waits for data the cache doesn't have. Every navigation loads on the server with an empty cache, so here it waits like fetch every time: use fetch.",
		fetch:
			"Waits for the data. Every navigation loads on the server with an empty cache, so it waits every time.",
		prefetch: prefetchHint,
	},
} satisfies Record<LoaderRuntime, Record<LoaderVerb, string>>;

/** What the loader verb in the URL does, under the top bar. */
export function LoaderVerbHint(props: {
	readonly loaders: LoaderRuntime;
	readonly verb: LoaderVerb;
}) {
	return (
		<p className="text-xs text-muted-foreground">
			<code className="font-mono font-medium text-foreground">
				{props.verb}
			</code>{" "}
			{hints[props.loaders][props.verb]}
		</p>
	);
}
