import { render as renderComponent } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vite-plus/test";

import { QueryClient, useIsFetching, useQueryClient } from "../src/index.ts";
import Provided from "./fixtures/Provided.svelte";
import Reader from "./fixtures/Reader.svelte";
import { createBackend, flush, render } from "./test-utils.ts";

describe("QueryClientProvider", () => {
	it("provides its client to its children", () => {
		const client = new QueryClient({ isServer: false });
		let provided: QueryClient<unknown> | undefined;
		const view = renderComponent(Provided, {
			props: {
				client,
				use: () => {
					provided = useQueryClient();
				},
			},
		});
		expect(provided).toBe(client);
		expect(view.container.textContent).toBe("provided");
		view.unmount();
	});

	it("watches focus and reconnect while it's mounted", () => {
		const client = new QueryClient({ isServer: false });
		const unmount = vi.fn<() => void>();
		using _mount = vi.spyOn(client, "mount").mockReturnValue(unmount);
		const view = render(
			client,
			() => null,
			() => "",
		);
		expect(client.mount).toHaveBeenCalledTimes(1);
		expect(unmount).not.toHaveBeenCalled();
		view.unmount();
		expect(unmount).toHaveBeenCalledTimes(1);
	});
});

describe("useQueryClient", () => {
	it("throws without a provided client", () => {
		expect(() =>
			renderComponent(Reader, {
				props: { text: () => "", use: () => useQueryClient() },
			}),
		).toThrow("useQueryClient: no QueryClient provided");
	});
});

describe("useIsFetching", () => {
	it("counts the queries with a request in flight", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		using view = render(
			client,
			() => useIsFetching(),
			(fetching) => String(fetching.current),
		);
		await flush();
		expect(view.text()).toBe("0");
		client.prefetch(backend.issueQuery, { id: 1 });
		client.prefetch(backend.userQuery, { id: 10 });
		await flush();
		expect(view.text()).toBe("2");
		await backend.respond();
		expect(view.text()).toBe("0");
	});

	it("counts only the queries matching its filter", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		using view = render(
			client,
			() => useIsFetching(() => ({ queryKey: ["user"] })),
			(fetching) => String(fetching.current),
		);
		client.prefetch(backend.issueQuery, { id: 1 });
		client.prefetch(backend.userQuery, { id: 10 });
		await flush();
		expect(view.text()).toBe("1");
		await backend.respond();
		expect(view.text()).toBe("0");
	});
});
