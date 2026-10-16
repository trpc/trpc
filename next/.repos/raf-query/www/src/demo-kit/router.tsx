import { Skeleton } from "@examples/ui/components/skeleton";
import { useQueryClient } from "@raf-query/react";
import {
	type AnyRoute,
	createMemoryHistory,
	createRouter,
	RouterProvider,
	useRouterState,
} from "@tanstack/react-router";
import { useState } from "react";

import { BrowserWindow } from "./browser.tsx";
import { useDemoSession } from "./session.ts";

/** A page's first load, before its loader has data to render. */
function PageSkeleton() {
	return (
		<div aria-label="Loading page" className="grid gap-2" role="status">
			<Skeleton className="h-8 w-full" />
			<Skeleton className="h-8 w-full" />
			<Skeleton className="h-8 w-2/3" />
		</div>
	);
}

/**
 * A TanStack Router app in a browser window, on its own memory history.
 * Loaders get the session's query client as `context.queryClient`, as in an
 * app. Reload starts the variant over on the same URL: a new client and
 * router, and an emptied server.
 */
export function DemoRouter(props: {
	readonly initial: string;
	readonly routeTree: AnyRoute;
}) {
	const queryClient = useQueryClient();
	const session = useDemoSession();
	const [router] = useState(() =>
		createRouter({
			context: { queryClient },
			// A stale loader reruns before the page renders, instead of the router
			// showing its last loader data meanwhile, so what each verb waits for
			// is what the page waits for.
			defaultStaleReloadMode: "blocking",
			history: createMemoryHistory({
				initialEntries: [session.location ?? props.initial],
			}),
			routeTree: props.routeTree,
			// The router scrolls the window to the top after each navigation, its
			// first load included, unless this returns false. The window is the
			// docs page, not the demo.
			scrollRestoration: () => false,
		}),
	);
	const href = useRouterState({
		router,
		select: (state) => state.location.href,
	});
	const canGoBack = useRouterState({
		router,
		select: () => router.history.canGoBack(),
	});
	const isNavigating = useRouterState({
		router,
		select: (state) => state.status === "pending",
	});
	// Until its first load resolves, the router renders nothing.
	const isFirstLoad = useRouterState({
		router,
		select: (state) => state.resolvedLocation === undefined,
	});
	return (
		<BrowserWindow
			canGoBack={canGoBack}
			href={href}
			isNavigating={isNavigating}
			onBack={() => {
				router.history.back();
			}}
			onReload={() => {
				session.reload(href);
			}}
		>
			{isFirstLoad ? <PageSkeleton /> : null}
			<RouterProvider router={router} />
		</BrowserWindow>
	);
}
