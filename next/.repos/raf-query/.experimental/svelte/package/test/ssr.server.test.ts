// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";
import type { ComponentProps } from "svelte";
import { render } from "svelte/server";

import { QueryClient, useIsFetching } from "../src/index.ts";
import { serverHtml } from "./fixtures/server-html.ts";
import Hydrated from "./fixtures/Hydrated.svelte";
import Probe from "./fixtures/Probe.svelte";
import WithClient from "./fixtures/WithClient.svelte";
import { createBackend } from "./test-utils.ts";

function renderPage(
	client: QueryClient,
	props: ComponentProps<typeof Hydrated>,
) {
	return render(WithClient<ComponentProps<typeof Hydrated>>, {
		props: { client, component: Hydrated, props },
	});
}

describe("server rendering", () => {
	it("renders the data of a handle from ensure into the HTML", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: true });
		const pending = client.ensure(backend.issueQuery, { id: 1 });
		await backend.respond();
		const handle = await pending;
		const page = renderPage(client, {
			backend,
			handle,
			state: { queries: [] },
		});
		expect(page.body).toBe(serverHtml);
	});

	it("renders a pending query as pending, without starting it again", () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: true });
		const handle = client.prefetch(backend.issueQuery, { id: 1 });
		const page = renderPage(client, {
			backend,
			handle,
			state: { queries: [] },
		});
		expect(page.body).toContain("<p>Loading</p>");
		expect(backend.calls()).toBe(1);
	});

	it("counts no requests in flight, like the browser's first render", () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: true });
		client.prefetch(backend.issueQuery, { id: 1 });
		const page = render(Probe<{ readonly current: number }>, {
			props: {
				client,
				text: (fetching: { readonly current: number }) =>
					String(fetching.current),
				use: () => useIsFetching(),
			},
		});
		expect(page.body).toContain("<p>0</p>");
	});
});
