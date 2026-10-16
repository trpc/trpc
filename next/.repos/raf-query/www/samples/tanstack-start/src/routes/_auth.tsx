import { createFileRoute, redirect } from "@tanstack/react-router";

import { meQuery } from "~/queries.ts";

export const Route = createFileRoute("/_auth")({
	beforeLoad: async (args) => {
		const qc = args.context.queryClient;
		const me = await qc.ensure(meQuery);
		if (!qc.getData(meQuery)) {
			throw redirect({ to: "/login" });
		}
		return { me };
	},
});
