import {
	type DehydratedState,
	hydrate,
	type HydrateOptions,
} from "@raf-query/core";
import { defineComponent, watch } from "vue";

import { useQueryClient } from "./provider.ts";

/**
 * Writes a server's `dehydrate(qc)` into the provided client before its
 * slot renders, and again whenever `state` changes. Entries the client
 * already has only take newer data; pending entries resume the server's
 * request.
 *
 * ```vue
 * <HydrationBoundary :state="dehydratedState">
 *   <PostPage :post="post" />
 * </HydrationBoundary>
 * ```
 */
export const HydrationBoundary = defineComponent(
	(
		props: {
			readonly options?: HydrateOptions;
			readonly state: DehydratedState;
		},
		context,
	) => {
		const client = useQueryClient();
		watch(
			() => props.state,
			(state) => {
				hydrate(client, state, props.options);
			},
			{ flush: "sync", immediate: true },
		);
		return () => context.slots.default?.();
	},
	{ name: "HydrationBoundary", props: ["options", "state"] },
);
