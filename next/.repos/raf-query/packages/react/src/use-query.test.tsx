import { describe, expect, expectTypeOf, it, vi } from "@effect/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Context, Effect, Layer, Result, Schema } from "effect";
import { Component, type ReactNode, StrictMode, Suspense, use } from "react";

import {
	dehydrate,
	hydrate,
	type InfiniteData,
	infiniteQueryOptions,
	Query,
	QueryClient,
	QueryClientProvider,
	type QueryHandle,
	type QueryHandleWithData,
	queryOptions,
	type Thenable,
	useQuery,
	type UseQueryOptions,
	useWaterfall,
} from "./index.ts";

interface Issue {
	readonly assigneeId: number;
	readonly id: number;
	readonly title: string;
}

function createBackend() {
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
			act(async () => {
				for (const settle of open.splice(0)) {
					settle();
				}
				await new Promise((resolve) => {
					setTimeout(resolve, 10);
				});
			}),
		userQuery,
	};
}

class Greeting extends Context.Service<Greeting, string>()("test/Greeting") {}

function greetingQuery(input: { name: string }) {
	return queryOptions({
		queryFn: () =>
			Effect.map(
				Effect.service(Greeting),
				(greeting) => `${greeting}, ${input.name}`,
			),
		queryKey: ["greeting", input.name],
	});
}

/** Render inside an awaited `act`, so React resumes suspended trees later. */
async function mount(ui: ReactNode) {
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

class Boundary extends Component<
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

function setup() {
	const backend = createBackend();
	const client = new QueryClient({ isServer: false });
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
		const handle = test.client.prefetch(test.backend.issueQuery, { id: 1 });

		await mount(test.view(<test.IssueTitle handle={handle} />));
		expect(screen.getByText("Loading")).toBeDefined();
		await test.backend.respond();

		expect(screen.getByText("First")).toBeDefined();
		expect(test.backend.calls()).toBe(1);
		cleanup();
	});

	it("keeps a disabled query suspended, not at the error boundary, until a factory call enables it", async () => {
		const test = setup();
		let enabled = false;
		function permissionQuery() {
			return queryOptions({
				enabled,
				queryFn: async () => "granted",
				queryKey: ["permission"],
			});
		}
		const handle = test.client.prefetch(permissionQuery);
		function Permission() {
			const [permissionPromise] = useQuery(permissionQuery, handle);
			const permission = use(permissionPromise);
			return <p>{permission}</p>;
		}

		await mount(test.view(<Permission />));
		await test.backend.respond();
		expect(screen.getByText("Loading")).toBeDefined();

		enabled = true;
		await act(async () => {
			test.client.prefetch(permissionQuery);
			await new Promise((resolve) => {
				setTimeout(resolve, 10);
			});
		});
		expect(screen.getByText("granted")).toBeDefined();
		cleanup();
	});

	it("renders cached data without suspending, and re-renders on setData", async () => {
		const test = setup();
		test.client.setData(
			test.backend.issueQuery,
			{ id: 1 },
			{
				assigneeId: 10,
				id: 1,
				title: "Cached",
			},
		);
		const handle = test.client.prefetch(test.backend.issueQuery, { id: 1 });

		await mount(test.view(<test.IssueTitle handle={handle} />));
		expect(screen.getByText("Cached (fetching)")).toBeDefined();

		await test.backend.respond();
		expect(screen.getByText("First")).toBeDefined();

		await act(async () => {
			test.client.setData(test.backend.issueQuery, { id: 1 }, (issue) => ({
				assigneeId: 10,
				id: 1,
				title: `${issue?.title}!`,
			}));
			await Promise.resolve();
		});
		expect(screen.getByText("First!")).toBeDefined();
		cleanup();
	});

	it("suspends on a new input by default", async () => {
		const test = setup();
		const first = test.client.prefetch(test.backend.issueQuery, { id: 1 });
		await test.backend.respond();
		const result = await mount(test.view(<test.IssueTitle handle={first} />));

		const second = test.client.prefetch(test.backend.issueQuery, { id: 2 });
		await result.rerender(test.view(<test.IssueTitle handle={second} />));

		expect(screen.getByText("Loading")).toBeDefined();
		await test.backend.respond();
		expect(screen.getByText("Second")).toBeDefined();
		cleanup();
	});

	it("keeps the previous input's data with whilePending: previous", async () => {
		const test = setup();
		const options: UseQueryOptions = { whilePending: "previous" };
		const first = test.client.prefetch(test.backend.issueQuery, { id: 1 });
		await test.backend.respond();
		const result = await mount(
			test.view(<test.IssueTitle handle={first} options={options} />),
		);

		const second = test.client.prefetch(test.backend.issueQuery, { id: 2 });
		await result.rerender(
			test.view(<test.IssueTitle handle={second} options={options} />),
		);

		const previous = screen.getByText("First (fetching)");
		expect(previous.dataset["previous"]).toBe("true");
		await test.backend.respond();
		expect(screen.getByText("Second").dataset["previous"]).toBe("false");
		cleanup();
	});

	it("throws a failed first load to the error boundary, and refetches on reset", async () => {
		const test = setup();
		test.backend.issues.delete(1);
		const handle = test.client.prefetch(test.backend.issueQuery, { id: 1 });
		await mount(test.view(<test.IssueTitle handle={handle} />));

		await test.backend.respond();
		const reset = await screen.findByText("Error: Error: No issue 1");

		test.backend.issues.set(1, { assigneeId: 10, id: 1, title: "Back" });
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		await act(async () => {
			reset.click();
		});
		expect(screen.getByText("Loading")).toBeDefined();
		await test.backend.respond();
		expect(screen.getByText("Back")).toBeDefined();
		cleanup();
	});

	it("exposes paging controls for paged factories", async () => {
		const client = new QueryClient({ isServer: false });
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
			readonly handle: QueryHandleWithData<typeof numbersQuery>;
		}) {
			const [data, numbers] = useQuery(numbersQuery, props.handle);
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
		const handle = await client.ensure(numbersQuery);
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

	it("re-renders only for the controls a component reads", async () => {
		const test = setup();
		const renders = { all: 0, promiseOnly: 0 };
		function PromiseOnly(props: {
			readonly handle: QueryHandle<typeof test.backend.issueQuery>;
		}) {
			renders.promiseOnly++;
			const [issuePromise] = useQuery(test.backend.issueQuery, props.handle);
			const issue = use(issuePromise);
			return <p>{issue.title}</p>;
		}
		function ReadsFetching(props: {
			readonly handle: QueryHandle<typeof test.backend.issueQuery>;
		}) {
			renders.all++;
			const [issuePromise, issueState] = useQuery(
				test.backend.issueQuery,
				props.handle,
			);
			const issue = use(issuePromise);
			return <p>{`${issue.title}${issueState.isFetching ? "…" : ""}`}</p>;
		}
		const handle = test.client.prefetch(test.backend.issueQuery, { id: 1 });
		await test.backend.respond();
		await mount(
			test.view(
				<>
					<PromiseOnly handle={handle} />
					<ReadsFetching handle={handle} />
				</>,
			),
		);
		expect(renders).toEqual({ all: 1, promiseOnly: 1 });

		await act(async () => {
			void test.client.invalidate(test.backend.issueQuery, { id: 1 });
			await Promise.resolve();
		});
		expect(screen.getByText("First…")).toBeDefined();
		expect(renders).toEqual({ all: 2, promiseOnly: 1 });

		test.backend.issues.set(1, { assigneeId: 10, id: 1, title: "Renamed" });
		await test.backend.respond();
		expect(screen.getAllByText("Renamed")).toHaveLength(2);
		expect(renders).toEqual({ all: 3, promiseOnly: 2 });
		cleanup();
	});

	describe("a component that reads the promise's status, not use()", () => {
		function setupStatus() {
			const test = setup();
			function IssueStatus(props: {
				readonly handle: QueryHandle<typeof test.backend.issueQuery>;
			}) {
				const [issuePromise] = useQuery(test.backend.issueQuery, props.handle);
				if (issuePromise.status === "rejected") {
					return <p>{`Failed: ${String(issuePromise.reason)}`}</p>;
				}
				return (
					<p>
						{issuePromise.status === "fulfilled"
							? issuePromise.value.title
							: "…"}
					</p>
				);
			}
			return { ...test, IssueStatus };
		}

		it("re-renders when a prefetch's first load fulfills", async () => {
			const test = setupStatus();
			const handle = test.client.prefetch(test.backend.issueQuery, { id: 1 });

			await mount(test.view(<test.IssueStatus handle={handle} />));
			expect(screen.getByText("…")).toBeDefined();
			await test.backend.respond();
			expect(screen.getByText("First")).toBeDefined();
			cleanup();
		});

		it("re-renders when a prefetch's first load rejects", async () => {
			const test = setupStatus();
			test.backend.issues.delete(1);
			const handle = test.client.prefetch(test.backend.issueQuery, { id: 1 });

			await mount(test.view(<test.IssueStatus handle={handle} />));
			expect(screen.getByText("…")).toBeDefined();
			await test.backend.respond();
			expect(screen.getByText("Failed: Error: No issue 1")).toBeDefined();
			cleanup();
		});

		it("re-renders when the first load lands with throwOnError: false", async () => {
			const gate = Promise.withResolvers<string>();
			function nameQuery() {
				return queryOptions({
					queryFn: () => Effect.promise(() => gate.promise),
					queryKey: ["name"],
				});
			}
			const client = new QueryClient({ isServer: false, layer: Layer.empty });
			function Name(props: { readonly handle: QueryHandle<typeof nameQuery> }) {
				const [namePromise] = useQuery(nameQuery, props.handle);
				return (
					<p>
						{namePromise.status === "fulfilled"
							? Result.getOrThrow(namePromise.value)
							: "…"}
					</p>
				);
			}

			await mount(
				<QueryClientProvider client={client}>
					<Name handle={client.prefetch(nameQuery)} />
				</QueryClientProvider>,
			);
			expect(screen.getByText("…")).toBeDefined();
			await act(async () => {
				gate.resolve("Ada");
				await new Promise((resolve) => {
					setTimeout(resolve, 10);
				});
			});
			expect(screen.getByText("Ada")).toBeDefined();
			cleanup();
		});
	});

	it("resumes use() on a first load without suspending again", async () => {
		const test = setup();
		const renders = { fallback: 0, issue: 0 };
		const seen = new Set<Promise<unknown>>();
		function Fallback() {
			renders.fallback++;
			return <p>Loading</p>;
		}
		function Issue(props: {
			readonly handle: QueryHandle<typeof test.backend.issueQuery>;
		}) {
			renders.issue++;
			const [issuePromise] = useQuery(test.backend.issueQuery, props.handle);
			seen.add(issuePromise);
			const issue = use(issuePromise);
			return <p>{issue.title}</p>;
		}
		const handle = test.client.prefetch(test.backend.issueQuery, { id: 1 });

		await mount(
			<QueryClientProvider client={test.client}>
				<Suspense fallback={<Fallback />}>
					<Issue handle={handle} />
				</Suspense>
			</QueryClientProvider>,
		);
		// React renders a suspending mount twice before showing the fallback.
		expect(renders).toEqual({ fallback: 1, issue: 2 });
		await test.backend.respond();

		expect(screen.getByText("First")).toBeDefined();
		expect(renders).toEqual({ fallback: 1, issue: 3 });
		expect(seen.size).toBe(1);
		cleanup();
	});

	it("doesn't re-render for retries of a background refetch", async () => {
		const client = new QueryClient({ isServer: false });
		let attempt = 0;
		function flakyQuery() {
			return queryOptions({
				queryFn: async () => {
					attempt++;
					if (attempt > 1 && attempt < 4) {
						throw new Error("flaky");
					}
					return attempt;
				},
				queryKey: ["flaky"],
				retry: 3,
				retryDelay: 1,
			});
		}
		const renders = { count: 0 };
		function Value(props: {
			readonly handle: QueryHandleWithData<typeof flakyQuery>;
		}) {
			renders.count++;
			const [value] = useQuery(flakyQuery, props.handle);
			return <p>{`Value ${value}`}</p>;
		}
		const handle = await client.ensure(flakyQuery);
		await mount(
			<QueryClientProvider client={client}>
				<Value handle={handle} />
			</QueryClientProvider>,
		);

		await act(async () => {
			await client.invalidate(flakyQuery);
		});
		expect(screen.getByText("Value 4")).toBeDefined();
		expect(renders.count).toBe(2);
		cleanup();
	});

	describe("a background refetch that reads its signal", () => {
		function slowNote() {
			const client = new QueryClient({ isServer: false });
			const signals: Array<AbortSignal> = [];
			function noteQuery() {
				return queryOptions({
					queryFn: (context) => {
						signals.push(context.signal);
						return Promise.withResolvers<string>().promise;
					},
					queryKey: ["note"],
				});
			}
			function Note(props: { readonly handle: QueryHandle<typeof noteQuery> }) {
				const [notePromise] = useQuery(noteQuery, props.handle);
				return <p>{use(notePromise)}</p>;
			}
			client.setData(noteQuery, undefined, "Cached");
			const handle = client.prefetch(noteQuery);
			const ui = (
				<QueryClientProvider client={client}>
					<Note handle={handle} />
				</QueryClientProvider>
			);
			return { query: client.getQuery(noteQuery), signals, ui };
		}

		it("is aborted when its last reader unmounts", async () => {
			const test = slowNote();
			const result = await act(async () => render(test.ui));
			expect(screen.getByText("Cached")).toBeDefined();

			await act(async () => {
				result.unmount();
				await new Promise((resolve) => {
					setTimeout(resolve, 0);
				});
			});

			expect(test.signals[0]?.aborted).toBe(true);
			expect(Query.getUnsafe(test.query)).toMatchObject({
				data: "Cached",
				error: null,
				isFetching: false,
			});
		});

		it("survives StrictMode's remount", async () => {
			const test = slowNote();
			await act(async () => render(<StrictMode>{test.ui}</StrictMode>));
			await act(async () => {
				await new Promise((resolve) => {
					setTimeout(resolve, 0);
				});
			});

			expect(test.signals).toHaveLength(1);
			expect(test.signals[0]?.aborted).toBe(false);
			expect(Query.getUnsafe(test.query).isFetching).toBe(true);
			cleanup();
		});
	});

	it("returns the live entry's data for a handle from ensure", async () => {
		const test = setup();
		function EnsuredTitle(props: {
			readonly handle: QueryHandleWithData<typeof test.backend.issueQuery>;
		}) {
			const [issue] = useQuery(test.backend.issueQuery, props.handle);
			return <p>{issue.title}</p>;
		}
		const ensuring = test.client.ensure(test.backend.issueQuery, { id: 1 });
		await test.backend.respond();
		const handle = await ensuring;

		await mount(test.view(<EnsuredTitle handle={handle} />));
		expect(screen.getByText("First")).toBeDefined();

		await act(async () => {
			test.client.setData(
				test.backend.issueQuery,
				{ id: 1 },
				{
					assigneeId: 1,
					id: 1,
					title: "Renamed",
				},
			);
			await Promise.resolve();
		});
		expect(screen.getByText("Renamed")).toBeDefined();
		expect(handle.data.title).toBe("First");

		// The entry lost its data after the loader ran: the hook suspends.
		await act(async () => {
			void test.client.reset(test.backend.issueQuery, { id: 1 });
			await Promise.resolve();
		});
		expect(screen.getByText("Loading")).toBeDefined();
		await test.backend.respond();
		expect(screen.getByText("First")).toBeDefined();
		cleanup();
	});

	it("returns undefined data without suspending", async () => {
		const test = setup();
		function assigneeQuery() {
			return queryOptions({
				queryFn: (): Promise<string | undefined> => Promise.resolve(undefined),
				queryKey: ["assignee"],
				staleTime: Infinity,
			});
		}
		function Assignee(props: {
			readonly handle: QueryHandleWithData<typeof assigneeQuery>;
		}) {
			const [name] = useQuery(assigneeQuery, props.handle);
			return <p>{name ?? "Unassigned"}</p>;
		}
		const handle = await test.client.ensure(assigneeQuery);

		await mount(test.view(<Assignee handle={handle} />));

		expect(screen.getByText("Unassigned")).toBeDefined();
		cleanup();
	});

	describe("a root with no Suspense boundary", () => {
		function bare(test: ReturnType<typeof setup>) {
			const handle = test.client.prefetch(test.backend.issueQuery, { id: 1 });
			return (
				<QueryClientProvider client={test.client}>
					<test.IssueTitle handle={handle} />
				</QueryClientProvider>
			);
		}

		it("renders once the data lands, when rendered in an async act", async () => {
			const test = setup();
			await mount(bare(test));
			expect(document.body.textContent).toBe("");

			await test.backend.respond();
			expect(screen.getByText("First")).toBeDefined();
			cleanup();
		});

		// React queues the retry of a tree that suspended in a sync `act` (which
		// RTL's `render` uses) on that act's queue, which is then dropped. A
		// plain `use(promise)` stays suspended the same way, boundary or not.
		it("stays suspended when rendered in a sync act", async () => {
			const test = setup();
			render(bare(test));

			await test.backend.respond();
			expect(screen.queryByText("First")).toBeNull();
			cleanup();
		});
	});

	it("types reads of handles with data as data", () => {
		const backend = createBackend();
		expectTypeOf<QueryHandleWithData<typeof backend.issueQuery>>().toExtend<
			QueryHandle<typeof backend.issueQuery>
		>();
		expectTypeOf<QueryHandle<typeof backend.issueQuery>>().not.toExtend<
			QueryHandleWithData<typeof backend.issueQuery>
		>();
		const ensure = (client: QueryClient) =>
			client.ensure(backend.issueQuery, { id: 1 });
		expectTypeOf(ensure).returns.resolves.toEqualTypeOf<
			QueryHandleWithData<typeof backend.issueQuery>
		>();
		const useTypes = (
			withData: QueryHandleWithData<typeof backend.issueQuery>,
			handle: QueryHandle<typeof backend.issueQuery>,
		) => {
			expectTypeOf(withData.data).toEqualTypeOf<Issue>();
			const [issue] = useQuery(backend.issueQuery, withData);
			expectTypeOf(issue).toEqualTypeOf<Issue>();
			const [promise] = useQuery(backend.issueQuery, handle);
			expectTypeOf(promise).toEqualTypeOf<Thenable<Issue>>();
		};
		expect(useTypes).toBeTypeOf("function");
	});

	it("types paging controls only for paged factories", () => {
		const backend = createBackend();
		const useTypes = (handle: QueryHandle<typeof backend.issueQuery>) => {
			const [promise, controls] = useQuery(backend.issueQuery, handle);
			expectTypeOf(promise).resolves.toEqualTypeOf<Issue>();
			expectTypeOf(controls.input).toEqualTypeOf<{ id: number }>();
			// @ts-expect-error plain factories have no paging controls
			void controls.fetchNextPage;
		};
		expect(useTypes).toBeTypeOf("function");
	});

	it("rejects throwOnError on promise queryFns", () => {
		const backend = createBackend();
		const useTypes = (handle: QueryHandle<typeof backend.issueQuery>) => {
			useQuery(backend.issueQuery, handle, {
				// @ts-expect-error unknown ErrorOf: throwOnError is not an option
				throwOnError: false,
			});
		};
		expect(useTypes).toBeTypeOf("function");
	});

	it("starts a request with the client's layer services during render", async () => {
		const client = new QueryClient({
			isServer: false,
			layer: Layer.succeed(Greeting, "Hello"),
		});
		function Greet(props: {
			readonly handle: QueryHandle<typeof greetingQuery>;
		}) {
			// Layer ⇒ throwOnError false ⇒ Result; unwrap the success.
			const [greetingPromise] = useQuery(greetingQuery, props.handle);
			const greeting = use(greetingPromise);
			return <p>{Result.getOrThrow(greeting)}</p>;
		}

		await mount(
			<QueryClientProvider client={client}>
				<Suspense fallback={<p>Loading</p>}>
					<Greet
						handle={{ input: { name: "Ada" }, key: ["greeting", "Ada"] }}
					/>
				</Suspense>
			</QueryClientProvider>,
		);

		await waitFor(() => screen.getByText("Hello, Ada"));
		expect(screen.queryByText("Loading")).toBeNull();
		cleanup();
	});

	it("returns a Result for Effect queryFns when throwOnError is false", async () => {
		class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
			id: Schema.Number,
		}) {}
		class Api extends Context.Service<
			Api,
			{ get: (id: number) => Effect.Effect<string, NotFound> }
		>()("test/Api") {}
		function nameQuery(input: { id: number }) {
			return queryOptions({
				queryFn: () =>
					Effect.gen(function* () {
						const api = yield* Api;
						return yield* api.get(input.id);
					}),
				queryKey: ["name", input.id],
				retry: false,
			});
		}
		const client = new QueryClient({
			isServer: false,
			layer: Layer.succeed(Api, {
				get: (id) =>
					id === 1 ? Effect.succeed("Ada") : Effect.fail(new NotFound({ id })),
			}),
		});
		expect(client.throwOnError).toBe(false);
		function Name(props: { readonly handle: QueryHandle<typeof nameQuery> }) {
			const [namePromise] = useQuery(nameQuery, props.handle);
			const name = use(namePromise);
			expectTypeOf(namePromise).toEqualTypeOf<
				Thenable<Result.Result<string, NotFound>>
			>();
			expectTypeOf(name).toEqualTypeOf<Result.Result<string, NotFound>>();
			return (
				<p>
					{Result.match(name, {
						onFailure: (error) => `missing ${error.id}`,
						onSuccess: (value) => value,
					})}
				</p>
			);
		}

		const ok = client.prefetch(nameQuery, { id: 1 });
		await mount(
			<QueryClientProvider client={client}>
				<Suspense fallback={<p>Loading</p>}>
					<Name handle={ok} />
				</Suspense>
			</QueryClientProvider>,
		);
		await waitFor(() => screen.getByText("Ada"));
		cleanup();

		const missing = client.prefetch(nameQuery, { id: 404 });
		await mount(
			<QueryClientProvider client={client}>
				<Suspense fallback={<p>Loading</p>}>
					<Name handle={missing} />
				</Suspense>
			</QueryClientProvider>,
		);
		await waitFor(() => screen.getByText("missing 404"));
		cleanup();
	});

	it("returns the Result itself for a handle from ensure when throwOnError is false", async () => {
		const client = new QueryClient({
			isServer: false,
			layer: Layer.succeed(Greeting, "Hello"),
		});
		function Greet(props: {
			readonly handle: QueryHandleWithData<typeof greetingQuery>;
		}) {
			const [greeting] = useQuery(greetingQuery, props.handle);
			expectTypeOf(greeting).toEqualTypeOf<Result.Result<string, never>>();
			return <p>{Result.getOrThrow(greeting)}</p>;
		}
		const handle = await client.ensure(greetingQuery, { name: "Ada" });

		await mount(
			<QueryClientProvider client={client}>
				<Greet handle={handle} />
			</QueryClientProvider>,
		);

		expect(screen.getByText("Hello, Ada")).toBeDefined();
		cleanup();
	});

	it("throws Effect failures when throwOnError is true", async () => {
		class Boom extends Schema.TaggedError<Boom>()("Boom", {}) {}
		function boomQuery() {
			return queryOptions({
				queryFn: () => Effect.fail(new Boom()),
				queryKey: ["boom"],
				retry: false,
			});
		}
		const client = new QueryClient({
			isServer: false,
			layer: Layer.empty,
			throwOnError: true,
		});
		function BoomView(props: {
			readonly handle: QueryHandle<typeof boomQuery>;
		}) {
			const [boomPromise] = useQuery(boomQuery, props.handle, {
				throwOnError: true,
			});
			return <p>{use(boomPromise)}</p>;
		}
		await mount(
			<QueryClientProvider client={client}>
				<Boundary>
					<Suspense fallback={<p>Loading</p>}>
						<BoomView handle={client.prefetch(boomQuery)} />
					</Suspense>
				</Boundary>
			</QueryClientProvider>,
		);
		await waitFor(() => {
			expect(screen.getByText(/Error:/)).toBeTruthy();
		});
		cleanup();
	});

	describe("a promise queryFn on a client with a layer", () => {
		function layered() {
			const backend = createBackend();
			const client = new QueryClient({ isServer: false, layer: Layer.empty });
			expect(client.throwOnError).toBe(false);
			function Title(props: {
				readonly handle: QueryHandle<typeof backend.issueQuery>;
			}) {
				const [issuePromise] = useQuery(backend.issueQuery, props.handle);
				expectTypeOf(issuePromise).toEqualTypeOf<Thenable<Issue>>();
				const issue = use(issuePromise);
				return <p>{issue.title}</p>;
			}
			const view = (children: ReactNode) => (
				<QueryClientProvider client={client}>
					<Boundary>
						<Suspense fallback={<p>Loading</p>}>{children}</Suspense>
					</Boundary>
				</QueryClientProvider>
			);
			return { backend, client, Title, view };
		}

		it("returns plain data, not a Result", async () => {
			const app = layered();
			const handle = app.client.prefetch(app.backend.issueQuery, { id: 1 });
			await mount(app.view(<app.Title handle={handle} />));
			await app.backend.respond();
			expect(screen.getByText("First")).toBeDefined();
			cleanup();
		});

		it("returns plain data for a handle from ensure", async () => {
			const app = layered();
			const issueQuery = app.backend.issueQuery;
			function Title(props: {
				readonly handle: QueryHandleWithData<typeof issueQuery>;
			}) {
				const [issue] = useQuery(issueQuery, props.handle);
				expectTypeOf(issue).toEqualTypeOf<Issue>();
				return <p>{issue.title}</p>;
			}
			const loading = app.client.ensure(issueQuery, { id: 1 });
			await app.backend.respond();
			await mount(app.view(<Title handle={await loading} />));
			expect(screen.getByText("First")).toBeDefined();
			cleanup();
		});

		it("returns plain data hydrated from a server that ran the query", async () => {
			const app = layered();
			const server = new QueryClient({ isServer: true });
			const loading = server.ensure(app.backend.issueQuery, { id: 1 });
			await app.backend.respond();
			const loaded = await loading;
			hydrate(app.client, dehydrate(server));

			await mount(
				app.view(
					<app.Title handle={{ input: loaded.input, key: loaded.key }} />,
				),
			);
			expect(screen.getByText("First")).toBeDefined();
			expect(app.backend.calls()).toBe(1);
			cleanup();
		});

		it("throws a failure to the error boundary", async () => {
			const app = layered();
			const handle = app.client.prefetch(app.backend.issueQuery, { id: 404 });
			await mount(app.view(<app.Title handle={handle} />));
			await app.backend.respond();
			expect(screen.getByText("Error: Error: No issue 404")).toBeDefined();
			cleanup();
		});
	});

	describe("throwOnError on the query's options", () => {
		class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
			id: Schema.Number,
		}) {}
		function readName(id: number) {
			return Effect.gen(function* () {
				if (id !== 1) {
					return yield* Effect.fail(new NotFound({ id }));
				}
				return "Ada";
			});
		}
		function throwingNameQuery(input: { id: number }) {
			return queryOptions({
				queryFn: () => readName(input.id),
				queryKey: ["throwing-name", input.id],
				retry: false,
				throwOnError: true,
			});
		}
		function resultNameQuery(input: { id: number }) {
			return queryOptions({
				queryFn: () => readName(input.id),
				queryKey: ["result-name", input.id],
				retry: false,
				throwOnError: false,
			});
		}
		function view(client: QueryClient<unknown>, children: ReactNode) {
			return (
				<QueryClientProvider client={client}>
					<Boundary>
						<Suspense fallback={<p>Loading</p>}>{children}</Suspense>
					</Boundary>
				</QueryClientProvider>
			);
		}
		function Name(props: {
			readonly handle: QueryHandle<typeof throwingNameQuery>;
		}) {
			const [namePromise] = useQuery(throwingNameQuery, props.handle);
			expectTypeOf(namePromise).toEqualTypeOf<Thenable<string>>();
			return <p>{use(namePromise)}</p>;
		}

		it("reads as plain data on a client with a layer", async () => {
			const client = new QueryClient({ isServer: false, layer: Layer.empty });
			expect(client.throwOnError).toBe(false);
			const handle = client.prefetch(throwingNameQuery, { id: 1 });
			await mount(view(client, <Name handle={handle} />));
			await waitFor(() => screen.getByText("Ada"));
			cleanup();
		});

		it("throws a failure to the error boundary", async () => {
			const client = new QueryClient({ isServer: false, layer: Layer.empty });
			const handle = client.prefetch(throwingNameQuery, { id: 404 });
			await mount(view(client, <Name handle={handle} />));
			await waitFor(() => {
				expect(screen.getByText(/Error: NotFound/)).toBeDefined();
			});
			cleanup();
		});

		it("reads a handle from ensure as plain data", async () => {
			const client = new QueryClient({ isServer: false, layer: Layer.empty });
			function EnsuredName(props: {
				readonly handle: QueryHandleWithData<typeof throwingNameQuery>;
			}) {
				const [name] = useQuery(throwingNameQuery, props.handle);
				expectTypeOf(name).toEqualTypeOf<string>();
				return <p>{name}</p>;
			}
			const handle = await client.ensure(throwingNameQuery, { id: 1 });
			await mount(view(client, <EnsuredName handle={handle} />));
			expect(screen.getByText("Ada")).toBeDefined();
			cleanup();
		});

		it("is overridden by the call's throwOnError", async () => {
			const client = new QueryClient({ isServer: false, layer: Layer.empty });
			function MaybeName(props: {
				readonly handle: QueryHandle<typeof throwingNameQuery>;
			}) {
				const [namePromise] = useQuery(throwingNameQuery, props.handle, {
					throwOnError: false,
				});
				expectTypeOf(namePromise).toEqualTypeOf<
					Thenable<Result.Result<string, NotFound>>
				>();
				return (
					<p>
						{Result.match(use(namePromise), {
							onFailure: (error) => `missing ${error.id}`,
							onSuccess: (value) => value,
						})}
					</p>
				);
			}
			const handle = client.prefetch(throwingNameQuery, { id: 404 });
			await mount(view(client, <MaybeName handle={handle} />));
			await waitFor(() => screen.getByText("missing 404"));
			cleanup();
		});

		it("overrides the client's default", async () => {
			const client = new QueryClient({ isServer: false });
			expect(client.throwOnError).toBe(true);
			function MaybeName(props: {
				readonly handle: QueryHandle<typeof resultNameQuery>;
			}) {
				const [namePromise] = useQuery(resultNameQuery, props.handle);
				expectTypeOf(namePromise).toEqualTypeOf<
					Thenable<Result.Result<string, NotFound>>
				>();
				return (
					<p>
						{Result.match(use(namePromise), {
							onFailure: (error) => `missing ${error.id}`,
							onSuccess: (value) => value,
						})}
					</p>
				);
			}
			const handle = client.prefetch(resultNameQuery, { id: 404 });
			await mount(view(client, <MaybeName handle={handle} />));
			await waitFor(() => screen.getByText("missing 404"));
			cleanup();
		});

		it("types paged reads", () => {
			function pagesQuery() {
				return infiniteQueryOptions({
					getNextPageParam: () => null,
					initialPageParam: 0,
					queryFn: (context) => readName(context.pageParam),
					queryKey: ["name-pages"],
					throwOnError: true,
				});
			}
			const useTypes = (handle: QueryHandle<typeof pagesQuery>) => {
				const [pagesPromise] = useQuery(pagesQuery, handle);
				expectTypeOf(pagesPromise).toEqualTypeOf<
					Thenable<InfiniteData<{ page: string; pageParam: number }>>
				>();
				const [result] = useQuery(pagesQuery, handle, { throwOnError: false });
				expectTypeOf(result).toEqualTypeOf<
					Thenable<
						Result.Result<
							InfiniteData<{ page: string; pageParam: number }>,
							NotFound
						>
					>
				>();
			};
			expect(useTypes).toBeTypeOf("function");
		});
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
		const handle = test.client.prefetch(test.backend.issueQuery, { id: 2 });

		await mount(test.view(<IssuePage handle={handle} />));
		await test.backend.respond();
		await test.backend.respond();

		expect(screen.getByText("Assignee: Grace")).toBeDefined();
		expect(test.backend.calls()).toBe(2);
		cleanup();
	});

	it("doesn't refetch the first load it suspended on, in StrictMode", async () => {
		const test = setup();
		function Assignee() {
			const user = useWaterfall(test.backend.userQuery, { id: 10 });
			const [userPromise] = useQuery(test.backend.userQuery, user);
			return <p>{`Assignee: ${use(userPromise)}`}</p>;
		}

		await mount(
			<StrictMode>
				{test.view(
					<Suspense fallback={<p>Loading</p>}>
						<Assignee />
					</Suspense>,
				)}
			</StrictMode>,
		);
		await test.backend.respond();

		expect(screen.getByText("Assignee: Ada")).toBeDefined();
		expect(test.backend.calls()).toBe(1);
		cleanup();
	});

	it("refetches stale cached data once per mount, not per render", async () => {
		const test = setup();
		test.client.setData(test.backend.userQuery, { id: 20 }, "Old Grace");
		function Assignee(props: { readonly id: number; readonly label: string }) {
			const user = useWaterfall(test.backend.userQuery, { id: props.id });
			const [userPromise] = useQuery(test.backend.userQuery, user);
			return <p>{`${props.label}: ${use(userPromise)}`}</p>;
		}

		const view = await mount(test.view(<Assignee id={20} label="Assignee" />));
		expect(screen.getByText("Assignee: Old Grace")).toBeDefined();
		expect(test.backend.calls()).toBe(1);
		await test.backend.respond();
		expect(screen.getByText("Assignee: Grace")).toBeDefined();

		await view.rerender(test.view(<Assignee id={20} label="Owner" />));
		expect(screen.getByText("Owner: Grace")).toBeDefined();
		expect(test.backend.calls()).toBe(1);

		cleanup();
		await mount(test.view(<Assignee id={20} label="Assignee" />));
		expect(test.backend.calls()).toBe(2);
		cleanup();
	});
});

describe("lists", () => {
	interface ItemPage {
		readonly items: ReadonlyArray<number>;
		readonly next: number | null;
	}

	/** 25 items, 10 per page; `odd` keeps the odd ones. */
	function createListBackend() {
		const open: Array<() => void> = [];
		const requests: Array<string> = [];
		function select(filter: "all" | "odd") {
			return Array.from({ length: 25 }, (_, index) => index + 1).filter(
				(item) => filter === "all" || item % 2 === 1,
			);
		}
		function later<T>(request: string, produce: () => T) {
			requests.push(request);
			return new Promise<T>((resolve) => {
				open.push(() => {
					resolve(produce());
				});
			});
		}
		/** Pagination: the page is part of the input, one query per page. */
		function pageQuery(input: { filter: "all" | "odd"; page: number }) {
			return queryOptions({
				queryFn: () =>
					later(`${input.filter} page ${input.page}`, () =>
						select(input.filter).slice((input.page - 1) * 10, input.page * 10),
					),
				queryKey: ["items", input.filter, input.page],
			});
		}
		/** Infinite scroll: one paged query per filter. */
		function feedQuery(input: { filter: "all" | "odd" }) {
			return infiniteQueryOptions<ItemPage, number>({
				getNextPageParam: (lastPage) => lastPage.next,
				initialPageParam: 0,
				queryFn: (context) =>
					later(`${input.filter} from ${context.pageParam}`, () => {
						const all = select(input.filter);
						const end = context.pageParam + 10;
						return {
							items: all.slice(context.pageParam, end),
							next: end < all.length ? end : null,
						};
					}),
				queryKey: ["feed", input.filter],
			});
		}
		return {
			feedQuery,
			pageQuery,
			requests,
			respond: () =>
				act(async () => {
					for (const settle of open.splice(0)) {
						settle();
					}
					await new Promise((resolve) => {
						setTimeout(resolve, 10);
					});
				}),
		};
	}

	/**
	 * Stands in for `IntersectionObserver`. Like the real one, a new observer
	 * reports right away when its target is already in view.
	 */
	function stubViewport() {
		let atEnd = false;
		type Report = (entries: ReadonlyArray<{ isIntersecting: boolean }>) => void;
		const observers = new Map<object, Report>();
		class FakeIntersectionObserver {
			readonly #report: Report;
			constructor(report: Report) {
				this.#report = report;
			}
			observe() {
				observers.set(this, this.#report);
				if (atEnd) {
					queueMicrotask(() => {
						observers.get(this)?.([{ isIntersecting: true }]);
					});
				}
			}
			disconnect() {
				observers.delete(this);
			}
		}
		vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
		return {
			scrollToEnd: () =>
				act(async () => {
					atEnd = true;
					for (const report of observers.values()) {
						report([{ isIntersecting: true }]);
					}
					await Promise.resolve();
				}),
		};
	}

	it("paginate with the page in the input, keeping the previous page while the next loads", async () => {
		const backend = createListBackend();
		const client = new QueryClient({ isServer: false });
		function Page(props: {
			readonly handle: QueryHandle<typeof backend.pageQuery>;
		}) {
			const [itemsPromise, page] = useQuery(backend.pageQuery, props.handle, {
				whilePending: "previous",
			});
			const items = use(itemsPromise);
			return <p data-previous={page.isPrevious}>{items.join(",")}</p>;
		}
		function view(page: number) {
			const handle = client.prefetch(backend.pageQuery, {
				filter: "all",
				page,
			});
			return (
				<QueryClientProvider client={client}>
					<Suspense fallback={<p>Loading</p>}>
						<Page handle={handle} />
					</Suspense>
				</QueryClientProvider>
			);
		}
		const result = await mount(view(1));
		await backend.respond();
		expect(screen.getByText("1,2,3,4,5,6,7,8,9,10")).toBeDefined();

		await result.rerender(view(2));
		const previous = screen.getByText("1,2,3,4,5,6,7,8,9,10");
		expect(previous.dataset["previous"]).toBe("true");
		await backend.respond();
		expect(screen.getByText("11,12,13,14,15,16,17,18,19,20")).toBeDefined();

		await result.rerender(view(1));
		expect(screen.getByText("1,2,3,4,5,6,7,8,9,10")).toBeDefined();
		expect(backend.requests).toEqual([
			"all page 1",
			"all page 2",
			"all page 1",
		]);
		cleanup();
	});

	it("load the next page by infinite scroll, and start over on a new filter", async () => {
		const backend = createListBackend();
		const viewport = stubViewport();
		const client = new QueryClient({ isServer: false });
		function Feed(props: {
			readonly handle: QueryHandle<typeof backend.feedQuery>;
		}) {
			const [pagesPromise, feed] = useQuery(backend.feedQuery, props.handle, {
				whilePending: "previous",
			});
			const data = use(pagesPromise);
			return (
				<div data-previous={feed.isPrevious} data-testid="feed">
					<p>{data.pages.flatMap((page) => page.items).join(",")}</p>
					{feed.isFetchingNextPage ? <p>Loading more</p> : null}
					{feed.hasNextPage && !feed.isFetchingNextPage ? (
						<button
							onClick={() => {
								void feed.fetchNextPage();
							}}
							ref={(button) => {
								if (button === null) {
									return;
								}
								const observer = new IntersectionObserver((entries) => {
									if (entries.some((entry) => entry.isIntersecting)) {
										observer.disconnect();
										void feed.fetchNextPage();
									}
								});
								observer.observe(button);
								return () => {
									observer.disconnect();
								};
							}}
							type="button"
						>
							Load more
						</button>
					) : null}
				</div>
			);
		}
		function view(filter: "all" | "odd") {
			const handle = client.prefetch(backend.feedQuery, { filter });
			return (
				<QueryClientProvider client={client}>
					<Suspense fallback={<p>Loading</p>}>
						<Feed handle={handle} />
					</Suspense>
				</QueryClientProvider>
			);
		}
		const result = await mount(view("all"));
		await backend.respond();
		expect(screen.getByText("1,2,3,4,5,6,7,8,9,10")).toBeDefined();
		expect(backend.requests).toEqual(["all from 0"]);

		await viewport.scrollToEnd();
		expect(screen.getByText("Loading more")).toBeDefined();
		expect(screen.queryByText("Load more")).toBeNull();
		await backend.respond();
		// The button is back and still in view, so the last page loads too.
		await backend.respond();
		expect(screen.getByText(/^1,2,3,.*,24,25$/)).toBeDefined();
		expect(screen.queryByText("Load more")).toBeNull();
		expect(backend.requests).toEqual([
			"all from 0",
			"all from 10",
			"all from 20",
		]);

		await result.rerender(view("odd"));
		expect(screen.getByTestId("feed").dataset["previous"]).toBe("true");
		await backend.respond();
		expect(screen.getByText("1,3,5,7,9,11,13,15,17,19")).toBeDefined();
		expect(screen.getByTestId("feed").dataset["previous"]).toBe("false");
		cleanup();
	});
});
