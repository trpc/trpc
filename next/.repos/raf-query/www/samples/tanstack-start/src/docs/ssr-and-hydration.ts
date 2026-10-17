import { queryOptions } from "@raf-query/react";
import { canDehydrate, QueryClient } from "@raf-query/react";
import { setupRouterIntegration } from "@raf-query/react/tanstack-router";

declare function detectPushState(channel: string): Promise<"on" | "off">;

// #region browser-only-queries
export function pushStateQuery(input: { channel: string }) {
	return queryOptions({
		queryKey: ["pushState", input.channel],
		queryFn: () => detectPushState(input.channel),
		enabled: typeof window !== "undefined",
	});
}
// #endregion

declare const queryClient: QueryClient;

declare const router: Parameters<typeof setupRouterIntegration>[0]["router"];

// #region serialization
setupRouterIntegration({
	dehydrateOptions: {
		filter: (query) => query.key[0] === "doc" && canDehydrate(query),
	},
	queryClient,
	router,
});
// #endregion
