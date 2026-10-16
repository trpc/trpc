import { createFileRoute, redirect } from "@tanstack/react-router";

import { firstDoc } from "~/content/docs.ts";

export const Route = createFileRoute("/docs/")({
	beforeLoad: () => {
		throw redirect({ params: { slug: firstDoc }, to: "/docs/$slug" });
	},
});
