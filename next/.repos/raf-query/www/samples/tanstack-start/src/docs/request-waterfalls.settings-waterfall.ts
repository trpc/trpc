import { queryOptions } from "@raf-query/react";
import { createFileRoute } from "@tanstack/react-router";

declare function getCurrentUser(): Promise<{ orgId: string }>;
declare function getOrg(input: { orgId: string }): Promise<{ id: string }>;

function currentUserQuery() {
	return queryOptions({
		queryKey: ["user", "current"],
		queryFn: () => getCurrentUser(),
	});
}

function orgQuery(input: { orgId: string }) {
	return queryOptions({
		queryKey: ["org", input.orgId],
		queryFn: () => getOrg(input),
	});
}

// #region settings-waterfall
export const Route = createFileRoute("/settings")({
	loader: async (args) => {
		const qc = args.context.queryClient;
		const user = await qc.fetch(currentUserQuery);
		return {
			org: qc.prefetch(orgQuery, { orgId: user.data.orgId }),
			user,
		};
	},
});
// #endregion
