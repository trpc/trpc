import { app } from "@examples/api";
import type { Route } from "./+types/api.$";

function handler(args: Route.LoaderArgs | Route.ActionArgs) {
	return app.fetch(args.request);
}

export const loader = handler;
export const action = handler;
