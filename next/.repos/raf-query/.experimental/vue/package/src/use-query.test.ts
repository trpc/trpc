import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { Context, Data, Effect, Layer, Result } from "effect";
import { defineComponent, h, ref } from "vue";

import {
	infiniteQueryOptions,
	Query,
	QueryClient,
	type QueryHandle,
	queryOptions,
	useQuery,
	useWaterfall,
} from "./index.ts";
import { createBackend, flush, render } from "./test-utils.ts";

describe("useQuery", () => {
	it("is pending until the request settles, then has the data", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle = client.prefetch(backend.issueQuery, { id: 1 });
		using wrapper = render(
			defineComponent({
				setup() {
					const issue = useQuery(backend.issueQuery, handle);
					return () =>
						h("p", issue.isPending ? "Loading" : (issue.data?.title ?? ""));
				},
			}),
			client,
		);
		expect(wrapper.text()).toBe("Loading");
		await backend.respond();
		expect(wrapper.text()).toBe("First");
	});

	it("has cached data on the first render", () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		client.setData(
			backend.issueQuery,
			{ id: 1 },
			{
				assigneeId: 10,
				id: 1,
				title: "Cached",
			},
		);
		using wrapper = render(
			defineComponent({
				setup() {
					const issue = useQuery(
						backend.issueQuery,
						client.getQuery(backend.issueQuery, { id: 1 }).handle,
					);
					return () => h("p", issue.data?.title);
				},
			}),
			client,
		);
		expect(wrapper.text()).toBe("Cached");
		expect(backend.calls()).toBe(0);
	});

	it("starts the request a handle points at when nothing has", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle: QueryHandle<typeof backend.issueQuery> = {
			input: { id: 2 },
			key: ["issue", 2],
		};
		using wrapper = render(
			defineComponent({
				setup() {
					const issue = useQuery(backend.issueQuery, handle);
					return () => h("p", issue.data?.title ?? "Loading");
				},
			}),
			client,
		);
		expect(backend.calls()).toBe(1);
		await backend.respond();
		expect(wrapper.text()).toBe("Second");
	});

	it("types data as defined for a handle from ensure, and holds it at once", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const pending = client.ensure(backend.issueQuery, { id: 1 });
		await backend.respond();
		const handle = await pending;
		using wrapper = render(
			defineComponent({
				setup() {
					const issue = useQuery(backend.issueQuery, handle);
					expectTypeOf(issue.data).toEqualTypeOf<{
						readonly assigneeId: number;
						readonly id: number;
						readonly title: string;
					}>();
					return () => h("p", issue.data.title);
				},
			}),
			client,
		);
		expect(wrapper.text()).toBe("First");
	});

	it("shows the handle's data while a reset entry refetches", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const pending = client.ensure(backend.issueQuery, { id: 1 });
		await backend.respond();
		const handle = await pending;
		using wrapper = render(
			defineComponent({
				setup() {
					const issue = useQuery(backend.issueQuery, handle);
					return () =>
						h("p", `${issue.data.title}${issue.isFetching ? " …" : ""}`);
				},
			}),
			client,
		);
		backend.issues.set(1, { assigneeId: 10, id: 1, title: "Renamed" });
		const reset = client.reset(backend.issueQuery, { id: 1 });
		await flush();
		expect(wrapper.text()).toBe("First …");
		await backend.respond();
		await reset;
		expect(wrapper.text()).toBe("Renamed");
	});

	it("follows writes to the cache", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		client.setData(
			backend.issueQuery,
			{ id: 1 },
			{
				assigneeId: 10,
				id: 1,
				title: "Before",
			},
		);
		using wrapper = render(
			defineComponent({
				setup() {
					const issue = useQuery(
						backend.issueQuery,
						client.prefetch(backend.issueQuery, { id: 1 }),
					);
					return () => h("p", issue.data?.title);
				},
			}),
			client,
		);
		client.setData(backend.issueQuery, { id: 1 }, (issue) => ({
			assigneeId: 10,
			id: 1,
			title: `${issue?.title ?? ""} and after`,
		}));
		await flush();
		expect(wrapper.text()).toBe("Before and after");
	});

	it("refetches what it reads when invalidated", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle = client.prefetch(backend.issueQuery, { id: 1 });
		await backend.respond();
		using wrapper = render(
			defineComponent({
				setup() {
					const issue = useQuery(backend.issueQuery, handle);
					return () =>
						h("p", `${issue.data?.title}${issue.isFetching ? " …" : ""}`);
				},
			}),
			client,
		);
		backend.issues.set(1, { assigneeId: 10, id: 1, title: "Fresh" });
		const invalidated = client.invalidate(backend.issueQuery, { id: 1 });
		await flush();
		expect(wrapper.text()).toBe("First …");
		await backend.respond();
		await invalidated;
		expect(wrapper.text()).toBe("Fresh");
	});

	it("follows a handle in a ref to the new input", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle = ref(client.prefetch(backend.issueQuery, { id: 1 }));
		using wrapper = render(
			defineComponent({
				setup() {
					const issue = useQuery(backend.issueQuery, handle);
					return () => h("p", issue.data?.title ?? "Loading");
				},
			}),
			client,
		);
		await backend.respond();
		expect(wrapper.text()).toBe("First");
		handle.value = client.prefetch(backend.issueQuery, { id: 2 });
		await flush();
		expect(wrapper.text()).toBe("Loading");
		await backend.respond();
		expect(wrapper.text()).toBe("Second");
	});

	it('keeps the previous input\'s data with whilePending: "previous"', async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle = ref(client.prefetch(backend.issueQuery, { id: 1 }));
		using wrapper = render(
			defineComponent({
				setup() {
					const issue = useQuery(backend.issueQuery, handle, {
						whilePending: "previous",
					});
					return () =>
						h(
							"p",
							`${issue.data?.title ?? "Loading"}${issue.isPrevious ? " (previous)" : ""}`,
						);
				},
			}),
			client,
		);
		await backend.respond();
		handle.value = client.prefetch(backend.issueQuery, { id: 2 });
		await flush();
		expect(wrapper.text()).toBe("First (previous)");
		await backend.respond();
		expect(wrapper.text()).toBe("Second");
	});

	it("has the first load's error, and a promise that rejects with it", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle = client.prefetch(backend.issueQuery, { id: 3 });
		let promise: Promise<unknown> | undefined;
		using wrapper = render(
			defineComponent({
				setup() {
					const issue = useQuery(backend.issueQuery, handle);
					promise = issue.promise;
					return () =>
						h(
							"p",
							issue.error ? String(issue.error) : (issue.data?.title ?? ""),
						);
				},
			}),
			client,
		);
		await backend.respond();
		expect(wrapper.text()).toBe("Error: No issue 3");
		await expect(promise).rejects.toThrow("No issue 3");
	});

	it("renders the data in the first render after awaiting the promise in setup", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle = client.prefetch(backend.issueQuery, { id: 1 });
		using wrapper = render(
			defineComponent({
				async setup() {
					const issue = useQuery(backend.issueQuery, handle);
					const first = await issue.promise;
					expect(first.title).toBe("First");
					return () => h("p", issue.data?.title);
				},
			}),
			client,
		);
		expect(wrapper.text()).toBe("Loading");
		await backend.respond();
		expect(wrapper.text()).toBe("First");
	});

	it("stops observing the query when the component unmounts", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle = client.prefetch(backend.issueQuery, { id: 1 });
		const wrapper = render(
			defineComponent({
				setup() {
					const issue = useQuery(backend.issueQuery, handle);
					return () => h("p", issue.data?.title);
				},
			}),
			client,
		);
		const query = client.getQuery(backend.issueQuery, { id: 1 });
		expect(Query.observerCountUnsafe(query)).toBe(1);
		wrapper.unmount();
		await flush();
		expect(Query.observerCountUnsafe(query)).toBe(0);
	});

	it("only re-renders for properties it read", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle = client.prefetch(backend.issueQuery, { id: 1 });
		await backend.respond();
		let renders = 0;
		using _wrapper = render(
			defineComponent({
				setup() {
					const issue = useQuery(backend.issueQuery, handle);
					return () => {
						renders++;
						return h("p", issue.data?.title);
					};
				},
			}),
			client,
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
		using wrapper = render(
			defineComponent({
				setup() {
					const pages = useQuery(pagesQuery, client.prefetch(pagesQuery));
					more = () => pages.fetchNextPage();
					return () =>
						h(
							"p",
							`${pages.data?.pages.flatMap((page) => page.items).join(",")}${pages.hasNextPage ? " +" : ""}`,
						);
				},
			}),
			client,
		);
		await flush();
		expect(wrapper.text()).toBe("0 +");
		await more?.();
		await flush();
		expect(wrapper.text()).toBe("0,1 +");
		await more?.();
		await flush();
		expect(wrapper.text()).toBe("0,1,2");
	});

	it("holds a Result for an Effect queryFn on a client with a layer", async () => {
		class Greeting extends Context.Service<Greeting, string>()(
			"test/Greeting",
		) {}
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
		const client = new QueryClient({
			isServer: false,
			layer: Layer.succeed(Greeting, "Hello"),
		});
		using wrapper = render(
			defineComponent({
				setup() {
					const ok = useQuery(
						greetingQuery,
						client.prefetch(greetingQuery, { name: "Ada" }),
					);
					const failed = useQuery(
						greetingQuery,
						client.prefetch(greetingQuery, { name: "" }),
					);
					expectTypeOf(ok.data).toEqualTypeOf<
						Result.Result<string, Missing> | undefined
					>();
					const show = (result: Result.Result<string, Missing> | undefined) =>
						result === undefined
							? "…"
							: Result.match(result, {
									onFailure: (error) => error._tag,
									onSuccess: (value) => value,
								});
					return () => h("p", `${show(ok.data)} / ${show(failed.data)}`);
				},
			}),
			client,
		);
		await flush();
		expect(wrapper.text()).toBe("Hello, Ada / Missing");
	});
});

describe("useWaterfall", () => {
	it("starts a query whose input comes from another query's data", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle = client.prefetch(backend.issueQuery, { id: 1 });
		using wrapper = render(
			defineComponent({
				setup() {
					const issue = useQuery(backend.issueQuery, handle);
					const Assignee = defineComponent({
						props: { assigneeId: { required: true, type: Number } },
						setup(props) {
							const user = useWaterfall(backend.userQuery, () => ({
								id: props.assigneeId,
							}));
							const name = useQuery(backend.userQuery, user);
							return () => h("span", name.data ?? "…");
						},
					});
					return () =>
						issue.data
							? h("p", [
									`${issue.data.title} by `,
									h(Assignee, { assigneeId: issue.data.assigneeId }),
								])
							: h("p", "Loading");
				},
			}),
			client,
		);
		await backend.respond();
		expect(wrapper.text()).toBe("First by …");
		await backend.respond();
		expect(wrapper.text()).toBe("First by Ada");
	});
});
