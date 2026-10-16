import { describe, expect, it, vi } from "@effect/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { type ReactNode, Suspense } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import {
	type QueryCache,
	QueryClient,
	QueryClientProvider,
	queryOptions,
	useIsFetching,
	useWaterfall,
} from "./index.ts";

function setup() {
	const client = new QueryClient({ isServer: false });
	const open: Array<() => void> = [];
	function later<T>(value: T) {
		return new Promise<T>((resolve) => {
			open.push(() => resolve(value));
		});
	}
	function issueQuery(input: { id: number }) {
		return queryOptions({
			queryFn: () => later(`Issue ${input.id}`),
			queryKey: ["issue", input.id],
		});
	}
	function userQuery(input: { id: number }) {
		return queryOptions({
			queryFn: () => later(`User ${input.id}`),
			queryKey: ["user", input.id],
		});
	}
	function Count(props: { readonly filter?: QueryCache.Filter }) {
		return <p>{`Fetching: ${useIsFetching(props.filter)}`}</p>;
	}
	function view(children: ReactNode) {
		return (
			<QueryClientProvider client={client}>
				<Suspense fallback={<p>Loading</p>}>{children}</Suspense>
			</QueryClientProvider>
		);
	}
	return {
		client,
		Count,
		issueQuery,
		/** Settle every open request, then let React render the results. */
		respond: () =>
			act(async () => {
				for (const settle of open.splice(0)) {
					settle();
				}
				await new Promise((resolve) => {
					setTimeout(resolve, 10);
				});
			}),
		userQuery,
		view,
	};
}

describe("useIsFetching", () => {
	it("re-renders as requests start and settle", async () => {
		const test = setup();
		await act(async () => render(test.view(<test.Count />)));
		expect(screen.getByText("Fetching: 0")).toBeDefined();

		await act(async () => {
			test.client.prefetch(test.issueQuery, { id: 1 });
			await Promise.resolve();
		});
		expect(screen.getByText("Fetching: 1")).toBeDefined();

		await test.respond();
		expect(screen.getByText("Fetching: 0")).toBeDefined();
		cleanup();
	});

	it("counts only queries matching the filter", async () => {
		const test = setup();
		await act(async () =>
			render(test.view(<test.Count filter={{ queryKey: ["user"] }} />)),
		);

		await act(async () => {
			test.client.prefetch(test.issueQuery, { id: 1 });
			test.client.prefetch(test.userQuery, { id: 1 });
			test.client.prefetch(test.userQuery, { id: 2 });
			await Promise.resolve();
		});
		expect(screen.getByText("Fetching: 2")).toBeDefined();

		await test.respond();
		expect(screen.getByText("Fetching: 0")).toBeDefined();
		cleanup();
	});

	it("hears about a fetch another component starts while rendering", async () => {
		using errors = vi.spyOn(console, "error").mockImplementation(() => {});
		const test = setup();
		function Author() {
			useWaterfall(test.userQuery, { id: 1 });
			return null;
		}

		const result = await act(async () => render(test.view(<test.Count />)));
		await act(async () => {
			result.rerender(
				test.view(
					<>
						<test.Count />
						<Author />
					</>,
				),
			);
		});

		expect(screen.getByText("Fetching: 1")).toBeDefined();
		expect(errors).not.toHaveBeenCalled();
		await test.respond();
		expect(screen.getByText("Fetching: 0")).toBeDefined();
		cleanup();
	});

	it("is 0 on the server and while hydrating, then catches up", async () => {
		using errors = vi.spyOn(console, "error").mockImplementation(() => {});
		const test = setup();
		test.client.prefetch(test.issueQuery, { id: 1 });
		const html = renderToString(test.view(<test.Count />));
		expect(html).toContain("Fetching: 0");

		const container = document.createElement("div");
		container.innerHTML = html;
		document.body.append(container);
		const root = await act(async () =>
			hydrateRoot(container, test.view(<test.Count />)),
		);

		expect(container.textContent).toBe("Fetching: 1");
		expect(errors).not.toHaveBeenCalled();
		await act(async () => {
			root.unmount();
		});
		container.remove();
	});
});
