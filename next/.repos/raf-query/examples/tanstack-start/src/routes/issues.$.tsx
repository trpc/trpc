import { createFileRoute, redirect } from "@tanstack/react-router";

/** `/issues…` without a verb: the same page under `/prefetch`. */
export const Route = createFileRoute("/issues/$")({
	beforeLoad: (args) => {
		throw redirect({ href: `/prefetch${args.location.href}` });
	},
});
