import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, Suspense, use } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
	ensure,
	infiniteQueryOptions,
	invalidate,
	prefetch,
	QueryClient,
	QueryClientProvider,
	type QueryHandle,
	setData,
	useQuery,
	type UseQueryOptions,
	useWaterfall,
} from "./index.ts";
import {
	Boundary,
	createBackend,
	flush,
	type Issue,
	mount,
} from "./test-utils.tsx";

function setup() {
	const backend = createBackend();
	const client = new QueryClient();
	function IssueTitle(props: {
		readonly handle: QueryHandle<typeof backend.issueQuery>;
		readonly options?: UseQueryOptions;
	}) {
		const [issuePromise, issueState] = useQuery(
			backend.issueQuery,
			props.handle,
			props.options,
		);
		const issue = use(issuePromise);
		return (
			<p data-previous={issueState.isPrevious}>
				{issue.title}
				{issueState.isFetching ? " (fetching)" : ""}
			</p>
		);
	}
	function view(children: ReactNode) {
		return (
			<QueryClientProvider client={client}>
				<Boundary>
					<Suspense fallback={<p>Loading</p>}>{children}</Suspense>
				</Boundary>
			</QueryClientProvider>
		);
	}
	return { backend, client, IssueTitle, view };
}

describe("useQuery", () => {
	it("suspends until a prefetched query resolves", async () => {
		const test = setup();
		const handle = prefetch(test.client, test.backend.issueQuery, { id: 1 });

		await mount(test.view(<test.IssueTitle handle={handle} />));
		expect(screen.getByText("Loading")).toBeDefined();
		await test.backend.respond();

		expect(screen.getByText("First")).toBeDefined();
		expect(test.backend.calls()).toBe(1);
		cleanup();
	});

	it("renders cached data without suspending, and re-renders on setData", async () => {
		const test = setup();
		setData(
			test.client,
			test.backend.issueQuery,
			{ id: 1 },
			{ assigneeId: 10, id: 1, title: "Cached" },
		);
		const handle = prefetch(test.client, test.backend.issueQuery, { id: 1 });

		await mount(test.view(<test.IssueTitle handle={handle} />));
		expect(screen.getByText("Cached (fetching)")).toBeDefined();

		await test.backend.respond();
		expect(screen.getByText("First")).toBeDefined();

		await flush(() => {
			setData(test.client, test.backend.issueQuery, { id: 1 }, (issue) => ({
				assigneeId: 10,
				id: 1,
				title: `${issue?.title}!`,
			}));
		});
		expect(screen.getByText("First!")).toBeDefined();
		cleanup();
	});

	it("doesn't refetch data a loader just fetched, on mount or on a new handle", async () => {
		const test = setup();
		const first = ensure(test.client, test.backend.issueQuery, { id: 1 });
		await test.backend.respond();
		const result = await mount(
			test.view(<test.IssueTitle handle={await first} />),
		);
		expect(screen.getByText("First")).toBeDefined();

		const second = ensure(test.client, test.backend.issueQuery, { id: 2 });
		await test.backend.respond();
		await result.rerender(test.view(<test.IssueTitle handle={await second} />));

		expect(screen.getByText("Second")).toBeDefined();
		expect(test.backend.calls()).toBe(2);
		cleanup();
	});

	it("suspends on a new input by default", async () => {
		const test = setup();
		const first = prefetch(test.client, test.backend.issueQuery, { id: 1 });
		await test.backend.respond();
		const result = await mount(test.view(<test.IssueTitle handle={first} />));

		const second = prefetch(test.client, test.backend.issueQuery, { id: 2 });
		await result.rerender(test.view(<test.IssueTitle handle={second} />));

		expect(screen.getByText("Loading")).toBeDefined();
		await test.backend.respond();
		expect(screen.getByText("Second")).toBeDefined();
		cleanup();
	});

	it("keeps the previous input's data with whilePending: previous", async () => {
		const test = setup();
		const options: UseQueryOptions = { whilePending: "previous" };
		const first = prefetch(test.client, test.backend.issueQuery, { id: 1 });
		await test.backend.respond();
		const result = await mount(
			test.view(<test.IssueTitle handle={first} options={options} />),
		);

		const second = prefetch(test.client, test.backend.issueQuery, { id: 2 });
		await result.rerender(
			test.view(<test.IssueTitle handle={second} options={options} />),
		);

		const previous = screen.getByText("First (fetching)");
		expect(previous.dataset["previous"]).toBe("true");
		await test.backend.respond();
		expect(screen.getByText("Second").dataset["previous"]).toBe("false");
		expect(test.backend.calls()).toBe(2);
		cleanup();
	});

	it("throws a failed first load to the error boundary, and refetches on reset", async () => {
		const test = setup();
		test.backend.issues.delete(1);
		const handle = prefetch(test.client, test.backend.issueQuery, { id: 1 });
		await mount(test.view(<test.IssueTitle handle={handle} />));

		await test.backend.respond();
		const reset = await screen.findByText("Error: Error: No issue 1");

		test.backend.issues.set(1, { assigneeId: 10, id: 1, title: "Back" });
		await act(async () => {
			reset.click();
		});
		expect(screen.getByText("Loading")).toBeDefined();
		await test.backend.respond();
		expect(screen.getByText("Back")).toBeDefined();
		cleanup();
	});

	it("refetches on invalidate, which resolves once the new data is in", async () => {
		const test = setup();
		const handle = prefetch(test.client, test.backend.issueQuery, { id: 1 });
		await test.backend.respond();
		await mount(test.view(<test.IssueTitle handle={handle} />));

		test.backend.issues.set(1, { assigneeId: 10, id: 1, title: "Edited" });
		let invalidated = false;
		const done = invalidate(test.client, test.backend.issueQuery, {
			id: 1,
		}).then(() => {
			invalidated = true;
		});
		await flush();
		expect(screen.getByText("First (fetching)")).toBeDefined();
		expect(invalidated).toBe(false);

		await test.backend.respond();
		await done;
		expect(screen.getByText("Edited")).toBeDefined();
		cleanup();
	});

	it("fetches during render when the handle's entry is gone", async () => {
		const test = setup();
		const handle = prefetch(test.client, test.backend.issueQuery, { id: 1 });
		await test.backend.respond();
		test.client.removeQueries({ queryKey: handle.key });

		await mount(test.view(<test.IssueTitle handle={handle} />));
		expect(screen.getByText("Loading")).toBeDefined();
		await test.backend.respond();

		expect(screen.getByText("First")).toBeDefined();
		expect(test.backend.calls()).toBe(2);
		cleanup();
	});

	it("keeps the promise across re-renders while the data is unchanged", async () => {
		const test = setup();
		const handle = await (async () => {
			const pending = ensure(test.client, test.backend.issueQuery, { id: 1 });
			await test.backend.respond();
			return pending;
		})();
		const seen = new Set<Promise<Issue>>();
		function Probe(props: { readonly tick: number }) {
			const [promise] = useQuery(test.backend.issueQuery, handle);
			seen.add(promise);
			const issue = use(promise);
			return <p>{`${issue.title} ${props.tick}`}</p>;
		}
		const result = await mount(test.view(<Probe tick={1} />));
		await result.rerender(test.view(<Probe tick={2} />));

		expect(screen.getByText("First 2")).toBeDefined();
		expect(seen.size).toBe(1);
		cleanup();
	});

	it("exposes paging controls for paged factories", async () => {
		const client = new QueryClient();
		function numbersQuery() {
			return infiniteQueryOptions({
				getNextPageParam: (lastPage: number) =>
					lastPage < 3 ? lastPage + 1 : null,
				initialPageParam: 1,
				queryFn: (context) => context.pageParam,
				queryKey: ["numbers"],
			});
		}
		function Numbers(props: {
			readonly handle: QueryHandle<typeof numbersQuery>;
		}) {
			const [pagesPromise, numbers] = useQuery(numbersQuery, props.handle);
			const data = use(pagesPromise);
			return (
				<button
					disabled={!numbers.hasNextPage}
					onClick={() => {
						void numbers.fetchNextPage();
					}}
					type="button"
				>
					{data.pages.join(",")}
				</button>
			);
		}
		const handle = await ensure(client, numbersQuery);
		await mount(
			<QueryClientProvider client={client}>
				<Numbers handle={handle} />
			</QueryClientProvider>,
		);

		await act(async () => {
			screen.getByText("1").click();
		});
		await waitFor(() => screen.getByText("1,2"));
		await act(async () => {
			screen.getByText("1,2").click();
		});
		const button = await screen.findByText("1,2,3");
		expect(button.hasAttribute("disabled")).toBe(true);
		cleanup();
	});

	it("types data, input and paging controls from the factory", () => {
		const backend = createBackend();
		function numbersQuery(input: { from: number }) {
			return infiniteQueryOptions({
				getNextPageParam: (lastPage: number) => lastPage + 1,
				initialPageParam: input.from,
				queryFn: (context) => context.pageParam,
				queryKey: ["numbers", input.from],
			});
		}
		const useTypes = (
			issue: QueryHandle<typeof backend.issueQuery>,
			numbers: QueryHandle<typeof numbersQuery>,
		) => {
			const [issuePromise, issueControls] = useQuery(backend.issueQuery, issue);
			expectTypeOf(issuePromise).resolves.toEqualTypeOf<Issue>();
			expectTypeOf(issueControls.input).toEqualTypeOf<{ id: number }>();
			// @ts-expect-error plain factories have no paging controls
			void issueControls.fetchNextPage;

			const [pagesPromise, pageControls] = useQuery(numbersQuery, numbers);
			expectTypeOf(pagesPromise).resolves.toHaveProperty("pages");
			expectTypeOf(pageControls.fetchNextPage).toBeFunction();
		};
		expect(useTypes).toBeTypeOf("function");
	});
});

describe("useWaterfall", () => {
	it("starts a query whose input comes from another query's data", async () => {
		const test = setup();
		function Assignee(props: { readonly issue: Issue }) {
			const user = useWaterfall(test.backend.userQuery, {
				id: props.issue.assigneeId,
			});
			const [userPromise] = useQuery(test.backend.userQuery, user);
			return <p>{`Assignee: ${use(userPromise)}`}</p>;
		}
		function IssuePage(props: {
			readonly handle: QueryHandle<typeof test.backend.issueQuery>;
		}) {
			const [issuePromise] = useQuery(test.backend.issueQuery, props.handle);
			return <Assignee issue={use(issuePromise)} />;
		}
		const handle = prefetch(test.client, test.backend.issueQuery, { id: 2 });

		await mount(test.view(<IssuePage handle={handle} />));
		await test.backend.respond();
		await test.backend.respond();

		expect(screen.getByText("Assignee: Grace")).toBeDefined();
		expect(test.backend.calls()).toBe(2);
		cleanup();
	});
});

describe("QueryClientProvider", () => {
	it("is TanStack's, so TanStack hooks and this API share one cache", async () => {
		const test = setup();
		const handle = prefetch(test.client, test.backend.issueQuery, { id: 1 });
		await test.backend.respond();

		await act(async () =>
			render(test.view(<test.IssueTitle handle={handle} />)),
		);
		expect(
			test.client.getQueryData(test.backend.issueQuery({ id: 1 }).queryKey),
		).toEqual({ assigneeId: 10, id: 1, title: "First" });
		cleanup();
	});
});
