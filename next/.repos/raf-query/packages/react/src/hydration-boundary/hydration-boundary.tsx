"use client";

import type {
	DehydratedState,
	DehydrateOptions,
	HydrateOptions,
	QueryClient,
} from "@raf-query/core";
import type { ReactNode } from "react";

import { Hydrate } from "./hydrate.tsx";

export type HydrationBoundaryProps =
	| {
			readonly children?: ReactNode;
			/**
			 * The request's server client (e.g. from React's `cache()`). Server
			 * components only.
			 */
			readonly client: QueryClient;
			readonly options?: DehydrateOptions;
			readonly state?: never;
	  }
	| {
			readonly children?: ReactNode;
			readonly client?: never;
			readonly options?: HydrateOptions;
			/** A loader's `dehydrate(qc)`. */
			readonly state: DehydratedState;
	  };

/**
 * Writes server data into the browser (or SSR) client.
 *
 * In a server component, pass the request's `client`. Its entries go
 * through the RSC payload: pending entries cross as promises and stream in
 * as they settle, and entries an earlier boundary already sent in this
 * request are skipped. Server components get that build of the component
 * through the package's `react-server` export condition.
 *
 * ```tsx
 * const qc = getQueryClient();
 * const comments = qc.prefetch(commentsQuery, { slug });
 * return (
 *   <HydrationBoundary client={qc}>
 *     <Comments handle={comments} />
 *   </HydrationBoundary>
 * );
 * ```
 *
 * With loaders, such as React Router Framework Mode, pass the `state` the
 * loader dehydrated:
 *
 * ```tsx
 * export async function loader(args: Route.LoaderArgs) {
 *   const qc = new QueryClient();
 *   const post = await qc.ensure(postQuery, { slug: args.params.slug });
 *   return { dehydratedState: dehydrate(qc), post };
 * }
 *
 * export default function Page(props: Route.ComponentProps) {
 *   const { dehydratedState, post } = props.loaderData;
 *   return (
 *     <HydrationBoundary state={dehydratedState}>
 *       <Post handle={post} />
 *     </HydrationBoundary>
 *   );
 * }
 * ```
 *
 * Pending entries cross as promises when the framework's serializer
 * supports them (React Router's Single Fetch does). Nested boundaries
 * are fine: each only writes what its `state` holds.
 */
export function HydrationBoundary(props: HydrationBoundaryProps) {
	// The types allow `client` here: TypeScript can't tell which build a file
	// gets, since it doesn't see the `react-server` condition.
	if (props.state === undefined) {
		throw new Error(
			"HydrationBoundary needs `state` here. `client` works only in server components.",
		);
	}
	return (
		<Hydrate options={props.options} state={props.state}>
			{props.children}
		</Hydrate>
	);
}
