import { type QueryClient, queryOptions } from "@raf-query/core";
import { render as renderComponent } from "@testing-library/svelte";
import { type Component, flushSync, tick } from "svelte";

import Probe from "./fixtures/Probe.svelte";
import WithClient from "./fixtures/WithClient.svelte";

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
		/** Settle every open request, then let Svelte render the results. */
		async respond() {
			for (const settle of open.splice(0)) {
				settle();
			}
			await flush();
		},
		userQuery,
	};
}

/** Let promise callbacks, the cache's notifications and Svelte's updates run. */
export async function flush() {
	await new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
	flushSync();
	await tick();
}

/**
 * Mount a component under `client` whose `<script>` calls `use`, and whose
 * markup is `text` of what it returned. Unmounts when disposed.
 */
export function render<T>(
	client: QueryClient<unknown>,
	use: () => T,
	text: (value: T) => string,
) {
	const result = renderComponent(Probe<T>, { props: { client, text, use } });
	return {
		[Symbol.dispose]() {
			result.unmount();
		},
		text: () => result.container.textContent.trim(),
		unmount: result.unmount,
	};
}

/** Mount `component` with `props` under `client`. Unmounts when disposed. */
export function mount<P extends object>(
	client: QueryClient<unknown>,
	component: Component<P>,
	props: P,
) {
	const result = renderComponent(WithClient<P>, {
		props: { client, component, props },
	});
	return {
		[Symbol.dispose]() {
			result.unmount();
		},
		text: () => result.container.textContent.trim(),
		unmount: result.unmount,
	};
}
