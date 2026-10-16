import { queryOptions } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";

import { getCurrentOrg } from "~/api.ts";

declare function getCurrentUser(): Promise<{ orgId: string }>;

function currentUserQuery() {
	return queryOptions({
		queryKey: ["user", "current"],
		queryFn: () => getCurrentUser(),
	});
}

// #region settings-backend
export function currentOrgQuery() {
	return queryOptions({
		queryKey: ["org", "current"],
		queryFn: () => getCurrentOrg(),
	});
}

export const Route = createFileRoute("/settings")({
	loader: (args) => {
		const qc = args.context.queryClient;
		return {
			org: qc.prefetch(currentOrgQuery),
			user: qc.prefetch(currentUserQuery),
		};
	},
});
// #endregion
