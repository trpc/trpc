import { describe, expect, it, vi } from "@effect/vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";

import {
	QueryClient,
	QueryClientProvider,
	useIsFetching,
	useQueryClient,
} from "./index.ts";
import { createBackend, flush, render } from "./test-utils.ts";

describe("providing a client", () => {
	it("gives QueryPlugin's client to every component, and mounts it until the app unmounts", () => {
		const client = new QueryClient({ isServer: false });
		const mounted = vi.spyOn(client, "mount");
		let seen: unknown;
		const wrapper = render(
			defineComponent({
				setup() {
					seen = useQueryClient();
					return () => h("p");
				},
			}),
			client,
		);
		expect(seen).toBe(client);
		expect(mounted).toHaveBeenCalledTimes(1);
		wrapper.unmount();
	});

	it("gives QueryClientProvider's client to its slot", () => {
		const client = new QueryClient({ isServer: false });
		let seen: unknown;
		const Child = defineComponent({
			setup() {
				seen = useQueryClient();
				return () => h("p");
			},
		});
		using _wrapper = Object.assign(
			mount(
				defineComponent({
					setup: () => () =>
						h(QueryClientProvider, { client }, { default: () => h(Child) }),
				}),
			),
			{
				[Symbol.dispose]() {
					_wrapper.unmount();
				},
			},
		);
		expect(seen).toBe(client);
	});

	it("throws without a provided client", () => {
		using _warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(() =>
			mount(
				defineComponent({
					setup() {
						useQueryClient();
						return () => h("p");
					},
				}),
			),
		).toThrow("no QueryClient provided");
	});
});

describe("useIsFetching", () => {
	it("counts the requests in flight", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		using wrapper = render(
			defineComponent({
				setup() {
					const fetching = useIsFetching();
					return () => h("p", String(fetching.value));
				},
			}),
			client,
		);
		expect(wrapper.text()).toBe("0");
		client.prefetch(backend.issueQuery, { id: 1 });
		client.prefetch(backend.issueQuery, { id: 2 });
		await flush();
		expect(wrapper.text()).toBe("2");
		await backend.respond();
		expect(wrapper.text()).toBe("0");
	});

	it("counts only the queries matching its filter", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		using wrapper = render(
			defineComponent({
				setup() {
					const fetching = useIsFetching({ queryKey: ["user"] });
					return () => h("p", String(fetching.value));
				},
			}),
			client,
		);
		client.prefetch(backend.issueQuery, { id: 1 });
		client.prefetch(backend.userQuery, { id: 10 });
		await flush();
		expect(wrapper.text()).toBe("1");
	});

	it("is 0 on the server", () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: true });
		client.prefetch(backend.issueQuery, { id: 1 });
		using wrapper = render(
			defineComponent({
				setup() {
					const fetching = useIsFetching();
					return () => h("p", String(fetching.value));
				},
			}),
			client,
		);
		expect(wrapper.text()).toBe("0");
	});
});
