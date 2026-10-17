// #region meta
import type { RouteLocationNormalized } from "vue-router";

declare module "vue-router" {
	interface RouteMeta {
		/** Starts the queries the route renders, before its component loads. */
		prefetch?: (to: RouteLocationNormalized) => void;
	}
}
// #endregion meta

// #region router
import type { QueryClient } from "@raf-query/experimental-vue";
import {
	createMemoryHistory,
	createRouter,
	createWebHistory,
	type RouteLocationNormalizedLoaded,
} from "vue-router";

import { commentsQuery, postQuery } from "./queries.ts";

function postInput(to: RouteLocationNormalizedLoaded) {
	return { slug: String(to.params.slug) };
}

export function createAppRouter(qc: QueryClient) {
	const router = createRouter({
		history: import.meta.env.SSR ? createMemoryHistory() : createWebHistory(),
		routes: [
			{
				path: "/posts/:slug",
				component: () => import("./PostPage.vue"),
				meta: {
					prefetch: (to) => {
						qc.prefetch(postQuery, postInput(to));
						qc.prefetch(commentsQuery, postInput(to));
					},
				},
				props: (to) => ({
					comments: qc.getQuery(commentsQuery, postInput(to)).handle,
					post: qc.getQuery(postQuery, postInput(to)).handle,
				}),
			},
		],
	});
	router.beforeEach((to) => {
		for (const record of to.matched) {
			record.meta.prefetch?.(to);
		}
	});
	return router;
}
// #endregion router
