import { describe, expect, it, vi } from "@effect/vitest";
import { createSSRApp, defineComponent, h, Suspense } from "vue";
import { renderToString } from "vue/server-renderer";

import {
	dehydrate,
	type DehydratedState,
	HydrationBoundary,
	QueryClient,
	type QueryHandle,
	QueryPlugin,
	useQuery,
} from "./index.ts";
import { createBackend, flush } from "./test-utils.ts";

function app(
	backend: ReturnType<typeof createBackend>,
	client: QueryClient,
	props: {
		readonly handle: QueryHandle<typeof backend.issueQuery>;
		readonly state: DehydratedState;
	},
) {
	const Issue = defineComponent({
		async setup() {
			const issue = useQuery(backend.issueQuery, props.handle);
			await issue.promise;
			return () => h("p", issue.data?.title);
		},
	});
	const page = () => h(Suspense, null, { default: () => h(Issue) });
	return createSSRApp({
		render: () =>
			h(HydrationBoundary, { state: props.state }, { default: page }),
	}).use(QueryPlugin, { client });
}

const none: DehydratedState = { queries: [] };

describe("server rendering", () => {
	it("renders the data an async setup awaited into the HTML", async () => {
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		const handle = server.prefetch(backend.issueQuery, { id: 1 });
		const html = renderToString(app(backend, server, { handle, state: none }));
		await backend.respond();
		expect(await html).toBe("<!--[--><p>First</p><!--]-->");
	});

	it("hydrates the server's HTML from its dehydrated cache without fetching again", async () => {
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		const handle = server.prefetch(backend.issueQuery, { id: 1 });
		const html = renderToString(app(backend, server, { handle, state: none }));
		await backend.respond();
		const state = dehydrate(server);
		const container = document.createElement("div");
		container.innerHTML = await html;

		using warnings = vi.spyOn(console, "warn");
		using errors = vi.spyOn(console, "error");
		const browser = new QueryClient({ isServer: false });
		const hydrated = app(backend, browser, { handle, state });
		hydrated.mount(container);
		await flush();
		expect(container.textContent).toBe("First");
		expect(backend.calls()).toBe(1);
		expect(warnings).not.toHaveBeenCalled();
		expect(errors).not.toHaveBeenCalled();
		hydrated.unmount();
	});

	it("resumes a request the server was still waiting on when it dehydrated", async () => {
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		const handle = server.prefetch(backend.issueQuery, { id: 2 });
		const state = dehydrate(server);

		const browser = new QueryClient({ isServer: false });
		const container = document.createElement("div");
		const hydrated = createSSRApp({
			render: () =>
				h(
					HydrationBoundary,
					{ state },
					{
						default: () =>
							h(
								defineComponent({
									setup() {
										const issue = useQuery(backend.issueQuery, handle);
										return () => h("p", issue.data?.title ?? "Loading");
									},
								}),
							),
					},
				),
		}).use(QueryPlugin, { client: browser });
		hydrated.mount(container);
		expect(container.textContent).toBe("Loading");
		await backend.respond();
		expect(container.textContent).toBe("Second");
		expect(backend.calls()).toBe(1);
		hydrated.unmount();
	});
});
