import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { Context, Data, Effect, Layer, Result } from "effect";
import { flushSync } from "svelte";

import {
	infiniteQueryOptions,
	Query,
	QueryClient,
	type QueryHandle,
	queryOptions,
	useQuery,
} from "../src/index.ts";
import IssueWithAssignee from "./fixtures/IssueWithAssignee.svelte";
import { createBackend, flush, mount, render } from "./test-utils.ts";

// Svelte compiles this file, and warns about classes declared in functions.
class Greeting extends Context.Service<Greeting, string>()("test/Greeting") {}
class Missing extends Data.TaggedError("Missing") {}
function greetingQuery(input: { name: string }) {
	return queryOptions({
		queryFn: () =>
			input.name === ""
				? Effect.fail(new Missing())
				: Effect.map(
						Effect.service(Greeting),
						(greeting) => `${greeting}, ${input.name}`,
					),
		queryKey: ["greeting", input.name],
		retry: false,
	});
}

describe("useQuery", () => {
	it("is pending until the request settles, then has the data", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle = client.prefetch(backend.issueQuery, { id: 1 });
		using view = render(
			client,
			() => useQuery(backend.issueQuery, () => handle),
			(issue) => (issue.isPending ? "Loading" : (issue.data?.title ?? "")),
		);
		expect(view.text()).toBe("Loading");
		await backend.respond();
		expect(view.text()).toBe("First");
	});

	it("has cached data on the first render", () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		client.setData(
			backend.issueQuery,
			{ id: 1 },
			{ assigneeId: 10, id: 1, title: "Cached" },
		);
		using view = render(
			client,
			() =>
				useQuery(
					backend.issueQuery,
					() => client.getQuery(backend.issueQuery, { id: 1 }).handle,
				),
			(issue) => issue.data?.title ?? "",
		);
		expect(view.text()).toBe("Cached");
		expect(backend.calls()).toBe(0);
	});

	it("starts the request a handle points at when nothing has", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle: QueryHandle<typeof backend.issueQuery> = {
			input: { id: 2 },
			key: ["issue", 2],
		};
		using view = render(
			client,
			() => useQuery(backend.issueQuery, () => handle),
			(issue) => issue.data?.title ?? "Loading",
		);
		expect(backend.calls()).toBe(1);
		await backend.respond();
		expect(view.text()).toBe("Second");
	});

	it("types data as defined for a handle from ensure, and holds it at once", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const pending = client.ensure(backend.issueQuery, { id: 1 });
		await backend.respond();
		const handle = await pending;
		using view = render(
			client,
			() => {
				const issue = useQuery(backend.issueQuery, () => handle);
				expectTypeOf(issue.data).toEqualTypeOf<{
					readonly assigneeId: number;
					readonly id: number;
					readonly title: string;
				}>();
				return issue;
			},
			(issue) => issue.data.title,
		);
		expect(view.text()).toBe("First");
	});

	it("shows the handle's data while a reset entry refetches", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const pending = client.ensure(backend.issueQuery, { id: 1 });
		await backend.respond();
		const handle = await pending;
		using view = render(
			client,
			() => useQuery(backend.issueQuery, () => handle),
			(issue) => `${issue.data.title}${issue.isFetching ? " …" : ""}`,
		);
		backend.issues.set(1, { assigneeId: 10, id: 1, title: "Renamed" });
		const reset = client.reset(backend.issueQuery, { id: 1 });
		await flush();
		expect(view.text()).toBe("First …");
		await backend.respond();
		await reset;
		await flush();
		expect(view.text()).toBe("Renamed");
	});

	it("follows writes to the cache", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		client.setData(
			backend.issueQuery,
			{ id: 1 },
			{ assigneeId: 10, id: 1, title: "Before" },
		);
		const handle = client.prefetch(backend.issueQuery, { id: 1 });
		using view = render(
			client,
			() => useQuery(backend.issueQuery, () => handle),
			(issue) => issue.data?.title ?? "",
		);
		client.setData(backend.issueQuery, { id: 1 }, (issue) => ({
			assigneeId: 10,
			id: 1,
			title: `${issue?.title ?? ""} and after`,
		}));
		await flush();
		expect(view.text()).toBe("Before and after");
	});

	it("refetches what it reads when invalidated", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle = client.prefetch(backend.issueQuery, { id: 1 });
		await backend.respond();
		using view = render(
			client,
			() => useQuery(backend.issueQuery, () => handle),
			(issue) => `${issue.data?.title}${issue.isFetching ? " …" : ""}`,
		);
		backend.issues.set(1, { assigneeId: 10, id: 1, title: "Fresh" });
		const invalidated = client.invalidate(backend.issueQuery, { id: 1 });
		await flush();
		expect(view.text()).toBe("First …");
		await backend.respond();
		await invalidated;
		await flush();
		expect(view.text()).toBe("Fresh");
	});

	it("follows a handle getter to the new input", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		let handle = $state.raw(client.prefetch(backend.issueQuery, { id: 1 }));
		using view = render(
			client,
			() => useQuery(backend.issueQuery, () => handle),
			(issue) => issue.data?.title ?? "Loading",
		);
		await backend.respond();
		expect(view.text()).toBe("First");
		handle = client.prefetch(backend.issueQuery, { id: 2 });
		flushSync();
		expect(view.text()).toBe("Loading");
		await backend.respond();
		expect(view.text()).toBe("Second");
	});

	it('keeps the previous input\'s data with whilePending: "previous"', async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		let handle = $state.raw(client.prefetch(backend.issueQuery, { id: 1 }));
		using view = render(
			client,
			() =>
				useQuery(
					backend.issueQuery,
					() => handle,
					() => ({
						whilePending: "previous",
					}),
				),
			(issue) =>
				`${issue.data?.title ?? "Loading"}${issue.isPrevious ? " (previous)" : ""}`,
		);
		await backend.respond();
		handle = client.prefetch(backend.issueQuery, { id: 2 });
		await flush();
		expect(view.text()).toBe("First (previous)");
		await backend.respond();
		expect(view.text()).toBe("Second");
	});

	it("has the first load's error, and a promise that rejects with it", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle = client.prefetch(backend.issueQuery, { id: 3 });
		let promise: Promise<unknown> | undefined;
		using view = render(
			client,
			() => {
				const issue = useQuery(backend.issueQuery, () => handle);
				promise = issue.promise;
				return issue;
			},
			(issue) =>
				issue.error ? String(issue.error) : (issue.data?.title ?? ""),
		);
		await backend.respond();
		expect(view.text()).toBe("Error: No issue 3");
		await expect(promise).rejects.toThrow("No issue 3");
	});

	it("stops observing the query when the component unmounts", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle = client.prefetch(backend.issueQuery, { id: 1 });
		const view = render(
			client,
			() => useQuery(backend.issueQuery, () => handle),
			(issue) => issue.data?.title ?? "",
		);
		const query = client.getQuery(backend.issueQuery, { id: 1 });
		expect(Query.observerCountUnsafe(query)).toBe(1);
		view.unmount();
		await flush();
		expect(Query.observerCountUnsafe(query)).toBe(0);
	});

	it("only updates for properties it read", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle = client.prefetch(backend.issueQuery, { id: 1 });
		await backend.respond();
		let renders = 0;
		using _view = render(
			client,
			() => useQuery(backend.issueQuery, () => handle),
			(issue) => {
				renders++;
				return issue.data?.title ?? "";
			},
		);
		const before = renders;
		void client.invalidate(backend.issueQuery, { id: 1 });
		await flush();
		expect(renders).toBe(before);
		await backend.respond();
		expect(renders).toBe(before);
	});

	it("loads more pages of a paged query", async () => {
		const client = new QueryClient({ isServer: false });
		function pagesQuery() {
			return infiniteQueryOptions({
				getNextPageParam: (lastPage: {
					items: Array<number>;
					next: number | null;
				}) => lastPage.next,
				initialPageParam: 0,
				queryFn: (context) =>
					Promise.resolve({
						items: [context.pageParam],
						next: context.pageParam < 2 ? context.pageParam + 1 : null,
					}),
				queryKey: ["pages"],
			});
		}
		let more: (() => Promise<void>) | undefined;
		using view = render(
			client,
			() => {
				const handle = client.prefetch(pagesQuery);
				const pages = useQuery(pagesQuery, () => handle);
				more = () => pages.fetchNextPage();
				return pages;
			},
			(pages) =>
				`${pages.data?.pages.flatMap((page) => page.items).join(",")}${pages.hasNextPage ? " +" : ""}`,
		);
		await flush();
		expect(view.text()).toBe("0 +");
		await more?.();
		await flush();
		expect(view.text()).toBe("0,1 +");
		await more?.();
		await flush();
		expect(view.text()).toBe("0,1,2");
	});

	it("holds a Result for an Effect queryFn on a client with a layer", async () => {
		const client = new QueryClient({
			isServer: false,
			layer: Layer.succeed(Greeting, "Hello"),
		});
		const show = (result: Result.Result<string, Missing> | undefined) =>
			result === undefined
				? "…"
				: Result.match(result, {
						onFailure: (error) => error._tag,
						onSuccess: (value) => value,
					});
		using view = render(
			client,
			() => {
				const greeting = client.prefetch(greetingQuery, { name: "Ada" });
				const missing = client.prefetch(greetingQuery, { name: "" });
				const ok = useQuery(greetingQuery, () => greeting);
				const failed = useQuery(greetingQuery, () => missing);
				expectTypeOf(ok.data).toEqualTypeOf<
					Result.Result<string, Missing> | undefined
				>();
				return { failed, ok };
			},
			(both) => `${show(both.ok.data)} / ${show(both.failed.data)}`,
		);
		await flush();
		expect(view.text()).toBe("Hello, Ada / Missing");
	});
});

describe("useWaterfall", () => {
	it("starts a query whose input comes from another query's data", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle = client.prefetch(backend.issueQuery, { id: 1 });
		using view = mount(client, IssueWithAssignee, { backend, handle });
		await backend.respond();
		expect(view.text()).toBe("First by …");
		await backend.respond();
		expect(view.text()).toBe("First by Ada");
	});
});
