// @vitest-environment-options {"settings":{"enableJavaScriptEvaluation":true,"suppressInsecureJavaScriptEnvironmentWarning":true}}
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import {
	createRootRoute,
	createRoute,
	createRouter,
	HeadContent,
	Outlet,
	Scripts,
	type Serializable,
} from "@tanstack/react-router";
import {
	createRequestHandler,
	defaultStreamHandler,
} from "@tanstack/react-router/ssr/server";
import { act } from "@testing-library/react";
import { Predicate } from "effect";
import { type ReactNode, Suspense, use } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToReadableStream } from "react-dom/server.edge";

import {
	type DehydratedState,
	dehydrate,
	hydrate,
	HydrationBoundary,
	Query,
	QueryClient,
	QueryClientProvider,
	QueryProvider,
	type QueryHandle,
	type QueryHandleWithData,
	queryOptions,
	useQuery,
	useWaterfall,
} from "./index.ts";
import { HydrationBoundary as ServerHydrationBoundary } from "./index-react-server.ts";
import type { DehydratedRouterQueries } from "./tanstack-router-shared.ts";
import { setupRouterIntegration } from "./tanstack-router.ts";
import { flush } from "./test-utils.ts";

declare global {
	/** Set by TanStack Router's inline scripts. */
	var $_TSR:
		| {
				readonly router: {
					readonly dehydratedData: DehydratedRouterQueries;
					/** Each match's `beforeLoad` context (`b`), root first. */
					readonly matches: ReadonlyArray<{
						readonly b?: Record<string, unknown>;
					}>;
				};
		  }
		| undefined;
}

/** Requests that settle after `id` × 5 ms; a negative id fails. */
function createBackend() {
	const calls: Array<number> = [];
	function issueQuery(input: { id: number }) {
		return queryOptions({
			queryFn: async () => {
				calls.push(input.id);
				await new Promise((resolve) => {
					setTimeout(resolve, Math.abs(input.id) * 5);
				});
				if (input.id < 0) {
					throw new Error("Database password is hunter2");
				}
				return { createdAt: new Date(input.id), title: `Issue ${input.id}` };
			},
			queryKey: ["issue", input.id],
			retry: false,
		});
	}
	return { calls, issueQuery };
}

type Backend = ReturnType<typeof createBackend>;

function Issue(props: { readonly backend: Backend; readonly id: number }) {
	const handle = useWaterfall(props.backend.issueQuery, { id: props.id });
	const [issuePromise] = useQuery(props.backend.issueQuery, handle);
	const issue = use(issuePromise);
	return <p>{issue.title}</p>;
}

/** Starts a query during render that nothing on the server reads. */
function Prefetch(props: { readonly backend: Backend; readonly id: number }) {
	useWaterfall(props.backend.issueQuery, { id: props.id });
	return null;
}

function inlineScripts(html: string, includes: (source: string) => boolean) {
	return [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
		.map((match) => match[1] ?? "")
		.filter(includes);
}

/** Execute scripts in the page, in order, as the HTML parser would. */
function runScripts(sources: ReadonlyArray<string>) {
	for (const source of sources) {
		const script = document.createElement("script");
		script.textContent = source;
		document.body.append(script);
		script.remove();
	}
}

describe("TanStack Router setupRouterIntegration", () => {
	/** A TanStack Start-like server render of `page`, through the router's own serializer. */
	async function renderHtml(
		backend: Backend,
		client: QueryClient,
		page: () => ReactNode,
	) {
		const handler = createRequestHandler({
			createRouter: () => {
				const rootRoute = createRootRoute({
					component: () => (
						<html lang="en">
							<head>
								<HeadContent />
							</head>
							<body>
								{page()}
								<Scripts />
							</body>
						</html>
					),
				});
				const indexRoute = createRoute({
					getParentRoute: () => rootRoute,
					loader: () => {
						client.prefetch(backend.issueQuery, { id: 1 });
					},
					path: "/",
				});
				const router = createRouter({
					isServer: true,
					routeTree: rootRoute.addChildren([indexRoute]),
					Wrap: (props) => (
						<QueryClientProvider client={client}>
							{props.children}
						</QueryClientProvider>
					),
				});
				setupRouterIntegration({ queryClient: client, router });
				return router;
			},
			request: new Request("http://localhost/"),
		});
		const response = await handler(defaultStreamHandler);
		return response.text();
	}

	/** Run the router's scripts and take what they deserialize. */
	function receiveRouter(html: string) {
		runScripts(
			inlineScripts(
				html,
				(source) => source.includes("$_TSR") || source.includes("($R=>"),
			),
		);
		const router = globalThis.$_TSR?.router;
		Reflect.deleteProperty(globalThis, "$_TSR");
		Reflect.deleteProperty(globalThis, "$R");
		if (!router) {
			throw new Error("The HTML has no router payload");
		}
		return router;
	}

	/** The query payload of the router's dehydrated state. */
	function receivePayload(html: string): DehydratedRouterQueries {
		return receiveRouter(html).dehydratedData;
	}

	async function readAll(stream: ReadableStream<DehydratedState>) {
		const reader = stream.getReader();
		const states: Array<DehydratedState> = [];
		for (;;) {
			const next = await reader.read();
			if (next.done) {
				return states;
			}
			states.push(next.value);
		}
	}

	it("sends pending entries as promises through the router's serializer, each entry once", async () => {
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		server.setData(
			backend.issueQuery,
			{ id: 3 },
			{
				createdAt: new Date(3),
				title: "Cached",
			},
		);
		const html = await renderHtml(backend, server, () => (
			<>
				<Suspense fallback={<p>Loading</p>}>
					<Issue backend={backend} id={1} />
				</Suspense>
				<Suspense fallback={<p>Loading</p>}>
					<Issue backend={backend} id={2} />
				</Suspense>
				<Suspense fallback={<p>Loading</p>}>
					<Issue backend={backend} id={1} />
				</Suspense>
				<Prefetch backend={backend} id={-1} />
			</>
		));
		expect(html).not.toContain("hunter2");

		const payload = receivePayload(html);
		const [streamed, forBrowser] = payload.raf.stream.tee();
		const browser = new QueryClient({ isServer: false });
		const browserRouter = createRouter({
			isServer: false,
			routeTree: createRootRoute(),
		});
		setupRouterIntegration({ queryClient: browser, router: browserRouter });
		await browserRouter.options.hydrate?.({
			raf: { initial: payload.raf.initial, stream: forBrowser },
		});
		const sent = [payload.raf.initial, ...(await readAll(streamed))].flatMap(
			(state) => state.queries,
		);
		await flush();

		expect(sent.map((query) => query.key)).toEqual([
			["issue", 3],
			["issue", 1],
			["issue", 2],
			["issue", -1],
		]);
		expect(sent.map((query) => Predicate.isPromise(query.promise))).toEqual([
			false,
			true,
			true,
			true,
		]);
		expect(browser.getData(backend.issueQuery, { id: 1 })).toEqual({
			createdAt: new Date(1),
			title: "Issue 1",
		});
		expect(browser.getData(backend.issueQuery, { id: 2 })).toEqual({
			createdAt: new Date(2),
			title: "Issue 2",
		});
		expect(browser.getData(backend.issueQuery, { id: 3 })?.title).toBe(
			"Cached",
		);
		const failed = Query.getUnsafe(
			browser.getQuery(backend.issueQuery, { id: -1 }),
		);
		expect(String(failed.error)).toBe('Error: Query ["issue",-1] failed');
		expect(backend.calls).toEqual([1, 2, -1]);
	});

	it("carries handles in beforeLoad context to child routes and the browser", async () => {
		expectTypeOf<
			QueryHandleWithData<Backend["issueQuery"]>
		>().toExtend<Serializable>();
		expectTypeOf<QueryHandle<Backend["issueQuery"]>>().toExtend<Serializable>();

		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		const handler = createRequestHandler({
			createRouter: () => {
				const rootRoute = createRootRoute({
					beforeLoad: async () => ({
						issue: await server.ensure(backend.issueQuery, { id: 1 }),
					}),
					component: () => (
						<html lang="en">
							<head>
								<HeadContent />
							</head>
							<body>
								<Outlet />
								<Scripts />
							</body>
						</html>
					),
				});
				const indexRoute = createRoute({
					component: function IssueTitle() {
						const context = indexRoute.useRouteContext();
						const [issue] = useQuery(backend.issueQuery, context.issue);
						return <p>{issue.title}</p>;
					},
					getParentRoute: () => rootRoute,
					loader: async (args) => {
						const issue = await server.ensure(
							backend.issueQuery,
							args.context.issue.input,
						);
						return { issue };
					},
					path: "/",
				});
				const router = createRouter({
					isServer: true,
					routeTree: rootRoute.addChildren([indexRoute]),
					Wrap: (props) => (
						<QueryClientProvider client={server}>
							{props.children}
						</QueryClientProvider>
					),
				});
				setupRouterIntegration({ queryClient: server, router });
				return router;
			},
			request: new Request("http://localhost/"),
		});
		const html = await (await handler(defaultStreamHandler)).text();
		expect(html).toContain("<p>Issue 1</p>");

		const received = receiveRouter(html);
		const handle = received.matches[0]?.b?.issue;
		expect(handle).toEqual({
			data: { createdAt: new Date(1), title: "Issue 1" },
			input: { id: 1 },
			key: ["issue", 1],
		});
		// The handles' data is the cache entry's object, which the router's
		// serializer sends once and references from the context, the loader
		// data and the dehydrated cache.
		const payload = inlineScripts(html, (source) =>
			source.includes("Issue 1"),
		).join("");
		expect(payload.split("Issue 1")).toHaveLength(2);

		const browser = new QueryClient({ isServer: false });
		hydrate(browser, received.dehydratedData.raf.initial);
		expect(browser.getData(backend.issueQuery, { id: 1 })?.title).toBe(
			"Issue 1",
		);
		expect(backend.calls).toEqual([1]);
	});
});

describe("RSC QueryProvider", () => {
	interface ServerError {
		readonly digest: unknown;
		readonly message: string;
	}

	/**
	 * Server-render `ui` as Next.js's HTML pass does: an error's `digest` is
	 * sent to the browser.
	 */
	async function renderHtml(ui: ReactNode) {
		const errors: Array<ServerError> = [];
		const stream = await renderToReadableStream(ui, {
			onError: (error) => {
				const digest = Predicate.hasProperty(error, "digest")
					? String(error.digest)
					: undefined;
				errors.push({ digest, message: String(error) });
				return digest;
			},
		});
		await stream.allReady;
		return { errors, html: await new Response(stream).text() };
	}

	function Show(props: {
		readonly backend: Backend;
		readonly handle: QueryHandle<Backend["issueQuery"]>;
	}) {
		const [issuePromise] = useQuery(props.backend.issueQuery, props.handle);
		const issue = use(issuePromise);
		return <p>{issue.title}</p>;
	}

	it("renders what HydrationBoundary sent, pending entries through their promises, and starts nothing", async () => {
		const backend = createBackend();
		const rsc = new QueryClient({ isServer: true });
		rsc.setData(
			backend.issueQuery,
			{ id: 2 },
			{
				createdAt: new Date(2),
				title: "Cached",
			},
		);
		const pending = rsc.prefetch(backend.issueQuery, { id: 1 });

		const result = await renderHtml(
			<QueryProvider config={{ isServer: true }}>
				<ServerHydrationBoundary client={rsc}>
					<Suspense fallback={<p>Loading</p>}>
						<Show backend={backend} handle={pending} />
					</Suspense>
					<Show
						backend={backend}
						handle={{ input: { id: 2 }, key: ["issue", 2] }}
					/>
				</ServerHydrationBoundary>
			</QueryProvider>,
		);

		expect(result.errors).toEqual([]);
		expect(result.html).toContain("Issue 1</p>");
		expect(result.html).toContain("Cached</p>");
		expect(backend.calls).toEqual([1]);
	});

	it("takes a dehydrated state in a server component too", async () => {
		const backend = createBackend();
		const loader = new QueryClient({ isServer: true });
		await loader.ensure(backend.issueQuery, { id: 1 });

		const result = await renderHtml(
			<QueryProvider config={{ isServer: true }}>
				<ServerHydrationBoundary state={dehydrate(loader)}>
					<Show
						backend={backend}
						handle={{ input: { id: 1 }, key: ["issue", 1] }}
					/>
				</ServerHydrationBoundary>
			</QueryProvider>,
		);

		expect(result.errors).toEqual([]);
		expect(result.html).toContain("Issue 1</p>");
		expect(backend.calls).toEqual([1]);
	});

	it("renders a query nothing sent as its fallback on the server, and loads it once in the browser", async () => {
		const backend = createBackend();
		/** Starts the query above the boundary that reads it. */
		function Page() {
			const handle = useWaterfall(backend.issueQuery, { id: 1 });
			return (
				<Suspense fallback={<p>Loading</p>}>
					<Show backend={backend} handle={handle} />
				</Suspense>
			);
		}

		const server = await renderHtml(
			<QueryProvider config={{ isServer: true }}>
				<Page />
			</QueryProvider>,
		);
		expect(server.errors).toEqual([
			{
				digest: "BAILOUT_TO_CLIENT_SIDE_RENDERING",
				message:
					'Error: Query ["issue",1] loads in the browser: no HydrationBoundary sent it',
			},
		]);
		expect(server.html).toContain("Loading</p>");
		expect(backend.calls).toEqual([]);

		const container = document.createElement("div");
		container.innerHTML = server.html;
		document.body.append(container);
		const recoverable: Array<unknown> = [];
		const root = await act(async () =>
			hydrateRoot(
				container,
				<QueryProvider config={{ isServer: false }}>
					<Page />
				</QueryProvider>,
				{ onRecoverableError: (error) => recoverable.push(error) },
			),
		);
		await act(async () => {
			await new Promise((resolve) => {
				setTimeout(resolve, 20);
			});
		});

		expect(container.textContent).toBe("Issue 1");
		expect(backend.calls).toEqual([1]);
		// Next.js reports no recoverable error with this digest.
		expect(recoverable).toMatchObject([
			{ digest: "BAILOUT_TO_CLIENT_SIDE_RENDERING" },
		]);
		act(() => root.unmount());
		container.remove();
	});
});

describe("HydrationBoundary with a loader's state (React Router)", () => {
	it("hydrates a loader's dehydrated state into the browser client", async () => {
		const backend = createBackend();
		const loader = new QueryClient({ isServer: true });
		const handle = await loader.ensure(backend.issueQuery, { id: 1 });
		const state = dehydrate(loader);

		function Show() {
			const [issue] = useQuery(backend.issueQuery, handle);
			return <p>{issue.title}</p>;
		}

		const stream = await renderToReadableStream(
			<QueryClientProvider client={new QueryClient({ isServer: true })}>
				<HydrationBoundary state={state}>
					<Show />
				</HydrationBoundary>
			</QueryClientProvider>,
		);
		await stream.allReady;
		const html = await new Response(stream).text();
		expect(html).toContain("Issue 1</p>");
		expect(backend.calls).toEqual([1]);

		const container = document.createElement("div");
		container.innerHTML = html;
		document.body.append(container);
		const browser = new QueryClient({ isServer: false });
		const root = await act(async () =>
			hydrateRoot(
				container,
				<QueryClientProvider client={browser}>
					<HydrationBoundary state={state}>
						<Show />
					</HydrationBoundary>
				</QueryClientProvider>,
			),
		);
		await act(flush);

		expect(container.textContent).toBe("Issue 1");
		expect(backend.calls).toEqual([1]);
		expect(
			Query.getUnsafe(browser.getQuery(backend.issueQuery, { id: 1 })).hasData,
		).toBe(true);
		act(() => root.unmount());
		container.remove();
	});

	it("throws a clear error when a client component passes `client`", async () => {
		const server = new QueryClient({ isServer: true });
		await expect(
			renderToReadableStream(
				<QueryClientProvider client={new QueryClient({ isServer: true })}>
					<HydrationBoundary client={server}>
						<p>Page</p>
					</HydrationBoundary>
				</QueryClientProvider>,
				{ onError: () => {} },
			),
		).rejects.toThrow(
			"HydrationBoundary needs `state` here. `client` works only in server components.",
		);
	});
});

describe("enabled: false on the server", () => {
	it("renders pending on the server, then runs once in the browser", async () => {
		// Stands in for `typeof window !== "undefined"`, which happy-dom sets on both sides.
		let browser = false;
		const calls: Array<string> = [];
		function permissionQuery() {
			return queryOptions({
				enabled: browser,
				queryFn: async () => {
					calls.push("permission");
					return "granted";
				},
				queryKey: ["permission"],
				staleTime: Infinity,
			});
		}
		function Permission() {
			const handle = useWaterfall(permissionQuery);
			const [promise, state] = useQuery(permissionQuery, handle);
			return <p>{state.isPending ? "Detecting" : use(promise)}</p>;
		}
		function SuspendedPermission() {
			const handle = useWaterfall(permissionQuery);
			const [promise] = useQuery(permissionQuery, handle);
			return <p>{use(promise)}</p>;
		}
		function Page(props: { readonly client: QueryClient }) {
			return (
				<QueryClientProvider client={props.client}>
					<Permission />
					<Suspense fallback={<p>Waiting</p>}>
						<SuspendedPermission />
					</Suspense>
				</QueryClientProvider>
			);
		}

		const errors: Array<unknown> = [];
		const stream = await renderToReadableStream(
			<Page client={new QueryClient({ isServer: true })} />,
			{ onError: (error) => void errors.push(error) },
		);
		await stream.allReady;
		const html = await new Response(stream).text();
		expect(html).toContain("<p>Detecting</p>");
		expect(html).toContain("<p>Waiting</p>");
		expect(errors).toHaveLength(1);
		expect(errors[0]).toBeInstanceOf(Query.DisabledError);
		expect(calls).toEqual([]);

		const container = document.createElement("div");
		container.innerHTML = html;
		document.body.append(container);
		browser = true;
		const recoverable: Array<unknown> = [];
		const root = await act(async () =>
			hydrateRoot(
				container,
				<Page client={new QueryClient({ isServer: false })} />,
				{
					onRecoverableError: (error) => recoverable.push(error),
				},
			),
		);
		await act(flush);

		expect(container.textContent).toBe("grantedgranted");
		expect(calls).toEqual(["permission"]);
		// The Suspense boundary the server gave up on; nothing else mismatched.
		expect(recoverable).toHaveLength(1);
		act(() => root.unmount());
		container.remove();
	});

	it("re-renders a reader of the promise's status once the browser loads it", async () => {
		let browser = false;
		function tagQuery() {
			return queryOptions({
				enabled: browser,
				queryFn: async () => "beta",
				queryKey: ["tag"],
			});
		}
		const loader = new QueryClient({ isServer: true });
		const handle = loader.prefetch(tagQuery);
		const state = dehydrate(loader);
		function Tag() {
			const [promise] = useQuery(tagQuery, handle);
			return (
				<span>{promise.status === "fulfilled" ? promise.value : "…"}</span>
			);
		}
		function Page(props: { readonly client: QueryClient }) {
			return (
				<QueryClientProvider client={props.client}>
					<HydrationBoundary state={state}>
						<Tag />
					</HydrationBoundary>
				</QueryClientProvider>
			);
		}

		const stream = await renderToReadableStream(
			<Page client={new QueryClient({ isServer: true })} />,
		);
		await stream.allReady;
		const html = await new Response(stream).text();
		expect(html).toContain("<span>…</span>");

		browser = true;
		const container = document.createElement("div");
		container.innerHTML = html;
		document.body.append(container);
		const recoverable: Array<unknown> = [];
		const root = await act(async () =>
			hydrateRoot(
				container,
				<Page client={new QueryClient({ isServer: false })} />,
				{
					onRecoverableError: (error) => recoverable.push(error),
				},
			),
		);
		await act(flush);

		expect(container.textContent).toBe("beta");
		expect(recoverable).toEqual([]);
		act(() => root.unmount());
		container.remove();
	});
});
