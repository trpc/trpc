import { createContext, use } from "react";
import { Link, type LinkProps } from "react-router";

import { DEFAULT_PREFETCH, type Prefetch, toLinkPrefetch } from "~/settings.ts";

/** The top bar's "Prefetch links" choice, for every link in the app. */
export const PrefetchContext = createContext<Prefetch>(DEFAULT_PREFETCH);

/** A `Link` that prefetches the way the settings say. */
export function AppLink(props: LinkProps) {
	const prefetch = use(PrefetchContext);
	return <Link prefetch={toLinkPrefetch(prefetch)} {...props} />;
}
