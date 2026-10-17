import { type QueryClient, queryOptions } from "@raf-query/core";
import { flushPromises, mount } from "@vue/test-utils";
import { type Component, defineComponent, h, Suspense } from "vue";

import { QueryPlugin } from "./provider.ts";

export interface Issue {
	readonly assigneeId: number;
	readonly id: number;
	readonly title: string;
}

/**
 * An in-memory backend whose requests settle only when the test calls
 * `respond`, so tests can see what renders while they're in flight.
 */
export function createBackend() {
	const issues = new Map<number, Issue>([
		[1, { assigneeId: 10, id: 1, title: "First" }],
		[2, { assigneeId: 20, id: 2, title: "Second" }],
	]);
	const users = new Map([
		[10, "Ada"],
		[20, "Grace"],
	]);
	const open: Array<() => void> = [];
	let calls = 0;
	function later<T>(produce: () => T) {
		calls++;
		return new Promise<T>((resolve, reject) => {
			open.push(() => {
				try {
					resolve(produce());
				} catch (error) {
					reject(error);
				}
			});
		});
	}
	function issueQuery(input: { id: number }) {
		return queryOptions({
			queryFn: () =>
				later(() => {
					const issue = issues.get(input.id);
					if (!issue) {
						throw new Error(`No issue ${input.id}`);
					}
					return issue;
				}),
			queryKey: ["issue", input.id],
			retry: false,
		});
	}
	function userQuery(input: { id: number }) {
		return queryOptions({
			queryFn: () => later(() => users.get(input.id) ?? "nobody"),
			queryKey: ["user", input.id],
		});
	}
	return {
		calls: () => calls,
		issueQuery,
		issues,
		/** Settle every open request, then let Vue render the results. */
		async respond() {
			for (const settle of open.splice(0)) {
				settle();
			}
			await flush();
		},
		userQuery,
	};
}

/** Let promise callbacks, the cache's notifications and Vue's updates run. */
export async function flush() {
	await new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
	await flushPromises();
}

/**
 * Mount `component` in an app with `client` installed, under `<Suspense>`
 * so it may have an async `setup`. Unmounts when disposed.
 */
export function render(
	component: Component,
	client: QueryClient<unknown>,
	props: Record<string, unknown> = {},
) {
	const wrapper = mount(
		defineComponent({
			setup: () => () =>
				h(Suspense, null, {
					default: () => h(component, props),
					fallback: () => h("p", "Loading"),
				}),
		}),
		{ global: { plugins: [[QueryPlugin, { client }]] } },
	);
	return Object.assign(wrapper, {
		[Symbol.dispose]() {
			wrapper.unmount();
		},
	});
}
