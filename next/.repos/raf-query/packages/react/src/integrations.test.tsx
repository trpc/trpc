import { describe, expect, it, vi } from "@effect/vitest";
import {
	createRootRoute,
	createRoute,
	createRouter,
	redirect,
} from "@tanstack/react-router";
import { act, cleanup, render, screen } from "@testing-library/react";
import { type ReactNode, Suspense, use } from "react";

import {
	QueryClient,
	QueryClientProvider,
	type QueryHandle,
	queryOptions,
	useQuery,
} from "./index.ts";
import { Hydrate } from "./hydration-boundary/hydrate.tsx";
import { HydrationBoundary } from "./index-react-server.ts";
import { setupRouterIntegration } from "./tanstack-router.ts";

function createBackend() {
	const open: Array<() => void> = [];
	let calls = 0;
	function issueQuery(input: { id: number }) {
		return queryOptions({
			queryFn: () => {
				calls++;
				return new Promise<string>((resolve) => {
					open.push(() => resolve(`Issue ${input.id}`));
				});
			},
			queryKey: ["issue", input.id],
		});
	}
	return {
		calls: () => calls,
		issueQuery,
		respond: () =>
			act(async () => {
				for (const settle of open.splice(0)) {
					settle();
				}
				await new Promise((resolve) => {
					setTimeout(resolve, 10);
				});
			}),
	};
}

async function mount(ui: ReactNode) {
	return act(async () => render(ui));
}

function routerFor(isServer: boolean) {
	const rootRoute = createRootRoute();
	const loginRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/login",
	});
	return createRouter({
		isServer,
		routeTree: rootRoute.addChildren([loginRoute]),
	});
}

describe("HydrationBoundary", () => {
	it("hands server entries to the browser cache, pending ones as promises", async () => {
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		const browser = new QueryClient({ isServer: false });
		server.setData(backend.issueQuery, { id: 1 }, "Cached");
		const pending = server.prefetch(backend.issueQuery, { id: 2 });
		function Issue(props: {
			readonly handle: QueryHandle<typeof backend.issueQuery>;
		}) {
			const [issuePromise] = useQuery(backend.issueQuery, props.handle);
			return <p>{use(issuePromise)}</p>;
		}

		await mount(
			<QueryClientProvider client={browser}>
				<HydrationBoundary client={server}>
					<Issue handle={{ input: { id: 1 }, key: ["issue", 1] }} />
					<Suspense fallback={<p>Loading</p>}>
						<Issue handle={pending} />
					</Suspense>
				</HydrationBoundary>
			</QueryClientProvider>,
		);
		expect(screen.getByText("Cached")).toBeDefined();
		expect(screen.getByText("Loading")).toBeDefined();

		await backend.respond();
		expect(screen.getByText("Issue 2")).toBeDefined();
		expect(backend.calls()).toBe(1);
		cleanup();
	});

	it("skips entries an earlier boundary of the request sent", async () => {
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		const browser = new QueryClient({ isServer: false });
		server.setData(backend.issueQuery, { id: 1 }, "First");
		function Issue() {
			const [issuePromise] = useQuery(backend.issueQuery, {
				input: { id: 1 },
				key: ["issue", 1],
			});
			return <p>{use(issuePromise)}</p>;
		}
		const boundary = () => (
			<QueryClientProvider client={browser}>
				<HydrationBoundary client={server}>
					<Issue />
				</HydrationBoundary>
			</QueryClientProvider>
		);

		await mount(boundary());
		cleanup();
		await new Promise((resolve) => {
			setTimeout(resolve, 1);
		});
		server.setData(backend.issueQuery, { id: 1 }, "Second");
		await mount(boundary());

		expect(screen.getByText("First")).toBeDefined();
		cleanup();
	});

	it("writes new entries during render, newer data for shown ones after commit", async () => {
		const backend = createBackend();
		const browser = new QueryClient({ isServer: false });
		browser.setData(backend.issueQuery, { id: 1 }, "Old");
		const rendered: Array<string> = [];
		function Issue(props: { readonly id: number }) {
			const [issuePromise] = useQuery(backend.issueQuery, {
				input: { id: props.id },
				key: ["issue", props.id],
			});
			const issue = use(issuePromise);
			rendered.push(issue);
			return <p>{issue}</p>;
		}
		const later = Date.now() + 1000;

		await mount(
			<QueryClientProvider client={browser}>
				<Suspense fallback={<p>Loading</p>}>
					<Hydrate
						state={{
							queries: [
								{ data: "New", key: ["issue", 1], updatedAt: later },
								{ data: "Three", key: ["issue", 3], updatedAt: later },
							],
						}}
					>
						<Issue id={1} />
						<Issue id={3} />
					</Hydrate>
				</Suspense>
			</QueryClientProvider>,
		);

		expect(rendered.slice(0, 2)).toEqual(["Old", "Three"]);
		expect(screen.getByText("New")).toBeDefined();
		expect(backend.calls()).toBe(0);
		cleanup();
	});
});

describe("setupRouterIntegration", () => {
	it("sends the cache with the router state, then streams later entries", async () => {
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		const browser = new QueryClient({ isServer: false });
		const serverRouter = routerFor(true);
		const renderFinished: Array<() => void> = [];
		Object.assign(serverRouter, {
			serverSsr: {
				onRenderFinished: (listener: () => void) => {
					renderFinished.push(listener);
				},
			},
		});
		setupRouterIntegration({ queryClient: server, router: serverRouter });
		const browserRouter = routerFor(false);
		setupRouterIntegration({ queryClient: browser, router: browserRouter });

		server.setData(backend.issueQuery, { id: 1 }, "Cached");
		server.prefetch(backend.issueQuery, { id: 2 });
		const dehydrated = await serverRouter.options.dehydrate?.();
		server.prefetch(backend.issueQuery, { id: 3 });
		await browserRouter.options.hydrate?.(dehydrated ?? {});

		await backend.respond();
		for (const finish of renderFinished) {
			finish();
		}
		await backend.respond();

		expect(browser.getData(backend.issueQuery, { id: 1 })).toBe("Cached");
		expect(browser.getData(backend.issueQuery, { id: 2 })).toBe("Issue 2");
		expect(browser.getData(backend.issueQuery, { id: 3 })).toBe("Issue 3");
		expect(backend.calls()).toBe(2);
	});

	it("navigates when a queryFn throws redirect()", async () => {
		const browser = new QueryClient({ isServer: false });
		const router = routerFor(false);
		const navigate = vi.spyOn(router, "navigate").mockResolvedValue();
		setupRouterIntegration({ queryClient: browser, router });

		browser.prefetch(() =>
			queryOptions({
				queryFn: () => {
					throw redirect({ to: "/login" });
				},
				queryKey: ["private"],
				retry: false,
			}),
		);
		await act(async () => {
			await new Promise((resolve) => {
				setTimeout(resolve, 10);
			});
		});

		expect(navigate).toHaveBeenCalledOnce();
		expect(navigate.mock.calls[0]?.[0]).toMatchObject({ to: "/login" });
	});
});
