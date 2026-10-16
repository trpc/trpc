import { act, render } from "@testing-library/react";
import { Component, type ReactNode } from "react";

import { queryOptions } from "./options.ts";

export interface Issue {
	readonly assigneeId: number;
	readonly id: number;
	readonly title: string;
}

/** Fake requests that stay open until `respond()`. */
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
		/** Settle every open request, then let React render the results. */
		respond: () =>
			flush(() => {
				for (const settle of open.splice(0)) {
					settle();
				}
			}),
		userQuery,
	};
}

/**
 * Run `update`, then let React render what it caused. TanStack batches
 * observer notifications onto a timer, so a microtask isn't enough.
 */
export function flush(update: () => void = () => {}) {
	return act(async () => {
		update();
		await new Promise((resolve) => {
			setTimeout(resolve, 10);
		});
	});
}

/** Render inside an awaited `act`, so React resumes suspended trees later. */
export async function mount(ui: ReactNode) {
	const result = await act(async () => render(ui));
	return {
		rerender: (next: ReactNode) =>
			act(async () => {
				result.rerender(next);
			}),
	};
}

interface BoundaryState {
	readonly error: unknown;
}

/** Shows the error with a button that resets the boundary. */
export class Boundary extends Component<
	{ readonly children: ReactNode },
	BoundaryState
> {
	override state: BoundaryState = { error: null };
	static getDerivedStateFromError(error: unknown) {
		return { error };
	}
	override render() {
		if (this.state.error !== null) {
			return (
				<button
					onClick={() => {
						this.setState({ error: null });
					}}
					type="button"
				>
					{`Error: ${String(this.state.error)}`}
				</button>
			);
		}
		return this.props.children;
	}
}
