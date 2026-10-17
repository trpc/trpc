import {
	type ComponentProps,
	hydrate as hydrateComponent,
	unmount,
} from "svelte";
import { describe, expect, it, vi } from "vite-plus/test";

import { dehydrate, type DehydratedState, QueryClient } from "../src/index.ts";
import Hydrated from "./fixtures/Hydrated.svelte";
import { serverHtml } from "./fixtures/server-html.ts";
import WithClient from "./fixtures/WithClient.svelte";
import { createBackend, flush, mount } from "./test-utils.ts";

describe("hydration", () => {
	it("hydrates the server's HTML from its dehydrated cache without fetching again", async () => {
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		const pending = server.ensure(backend.issueQuery, { id: 1 });
		await backend.respond();
		const handle = await pending;
		const state = dehydrate(server);
		const target = document.createElement("div");
		target.innerHTML = serverHtml;

		using warnings = vi.spyOn(console, "warn");
		using errors = vi.spyOn(console, "error");
		const browser = new QueryClient({ isServer: false });
		const app = hydrateComponent(WithClient<ComponentProps<typeof Hydrated>>, {
			props: {
				client: browser,
				component: Hydrated,
				props: { backend, handle, state },
			},
			target,
		});
		await flush();
		expect(target.textContent).toBe("First");
		expect(backend.calls()).toBe(1);
		expect(warnings).not.toHaveBeenCalled();
		expect(errors).not.toHaveBeenCalled();
		await unmount(app);
	});

	it("resumes a request the server was still waiting on when it dehydrated", async () => {
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		const handle = server.prefetch(backend.issueQuery, { id: 2 });
		const state = dehydrate(server);

		const browser = new QueryClient({ isServer: false });
		using view = mount(browser, Hydrated, { backend, handle, state });
		expect(view.text()).toBe("Loading");
		await backend.respond();
		expect(view.text()).toBe("Second");
		expect(backend.calls()).toBe(1);
	});

	it("hydrates new state passed to the boundary", async () => {
		const backend = createBackend();
		const browser = new QueryClient({ isServer: false });
		browser.setData(
			backend.issueQuery,
			{ id: 1 },
			{ assigneeId: 10, id: 1, title: "Old" },
		);
		const handle = browser.getQuery(backend.issueQuery, { id: 1 }).handle;
		let state = $state.raw<DehydratedState>({ queries: [] });
		using view = mount(browser, Hydrated, {
			backend,
			handle,
			get state() {
				return state;
			},
		});
		expect(view.text()).toBe("Old");
		await new Promise((resolve) => {
			setTimeout(resolve, 5);
		});
		const server = new QueryClient({ isServer: true });
		server.setData(
			backend.issueQuery,
			{ id: 1 },
			{ assigneeId: 10, id: 1, title: "Newer" },
		);
		state = dehydrate(server);
		await flush();
		expect(view.text()).toBe("Newer");
	});
});
