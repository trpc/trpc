import { redirect } from "react-router";

import type { Route } from "./+types/issues.$";

/** `/issues…` without a verb: the same page under `/prefetch`. */
export function loader(args: Route.LoaderArgs) {
	const url = new URL(args.request.url);
	return redirect(`/prefetch${url.pathname}${url.search}`);
}
