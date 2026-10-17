import { describe, expect, expectTypeOf, it, vi } from "@effect/vitest";
import { Context, Effect, Layer, Schedule } from "effect";

import {
	dehydrate,
	hydrate,
	Query,
	QueryCache,
	QueryClient,
	queryOptions,
} from "./index.ts";
import { createBackend, flush } from "./test-utils.ts";

function fakeTimers(
	options?: Parameters<typeof vi.useFakeTimers>[0],
): Disposable {
	vi.useFakeTimers(options);
	return {
		[Symbol.dispose]() {
			vi.useRealTimers();
		},
	};
}

describe("prefetch", () => {
	it("returns a handle and starts one request per key", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });

		const handle = qc.prefetch(backend.issueQuery, { id: 1 });
		qc.prefetch(backend.issueQuery, { id: 1 });

		expect(handle).toEqual({ input: { id: 1 }, key: ["issue", 1] });
		expect(backend.requests).toHaveLength(1);
		expect(
			Query.getUnsafe(qc.getQuery(backend.issueQuery, { id: 1 })),
		).toMatchObject({ isFetching: true, status: "pending" });
	});

	it("reuses fresh data and refetches stale data in the background", async () => {
		const backend = createBackend();
		const qc = new QueryClient({
			defaults: { staleTime: 1000 },
			isServer: false,
		});
		using _timers = fakeTimers({ toFake: ["Date"] });

		qc.prefetch(backend.issueQuery, { id: 1 });
		backend.respondAll();
		await flush();
		qc.prefetch(backend.issueQuery, { id: 1 });
		expect(backend.requests).toHaveLength(0);

		vi.setSystemTime(Date.now() + 1000);
		qc.prefetch(backend.issueQuery, { id: 1 });
		expect(backend.requests).toHaveLength(1);
		expect(qc.getData(backend.issueQuery, { id: 1 })).toEqual({
			id: 1,
			title: "First",
		});
	});

	it("never throws, and reports failures to onError", async () => {
		const backend = createBackend();
		const onError = vi.fn();
		const qc = new QueryClient({ isServer: false, onError });

		qc.prefetch(backend.issueQuery, { id: 404 });
		backend.respondAll();
		await flush();

		expect(onError).toHaveBeenCalledOnce();
		const query = qc.getQuery(backend.issueQuery, { id: 404 });
		expect(Query.getUnsafe(query).status).toBe("error");
		await expect(Query.getUnsafe(query).promise).rejects.toThrow(
			"No issue 404",
		);
	});
});

describe("meta", () => {
	it("is on the query onError gets", async () => {
		const onError = vi.fn();
		const qc = new QueryClient({ isServer: false, onError });
		function failingQuery() {
			return queryOptions({
				meta: { errorMessage: "Couldn't load issues" },
				queryFn: () => Promise.reject(new Error("boom")),
				queryKey: ["meta", "failing"],
				retry: false,
			});
		}

		await expect(qc.fetch(failingQuery)).rejects.toThrow("boom");

		expect(onError).toHaveBeenCalledOnce();
		const query: Query.Query = onError.mock.calls[0]?.[1];
		expect(Query.metaUnsafe(query)).toEqual({
			errorMessage: "Couldn't load issues",
		});
	});

	it("comes from defaults for queries that set none", async () => {
		const onError = vi.fn();
		const qc = new QueryClient({
			defaults: { meta: { errorMessage: "Something went wrong" } },
			isServer: false,
			onError,
		});
		function failingQuery() {
			return queryOptions({
				queryFn: () => Promise.reject(new Error("boom")),
				queryKey: ["meta", "default"],
				retry: false,
			});
		}

		await expect(qc.fetch(failingQuery)).rejects.toThrow("boom");

		const query: Query.Query = onError.mock.calls[0]?.[1];
		expect(Query.metaUnsafe(query)).toEqual({
			errorMessage: "Something went wrong",
		});
	});
});

describe("ensure and fetch", () => {
	it("wait on a cache miss", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });

		const ensured = qc.ensure(backend.issueQuery, { id: 1 });
		const fetched = qc.fetch(backend.issueQuery, { id: 1 });
		backend.respondAll();

		const handle = {
			data: { id: 1, title: "First" },
			input: { id: 1 },
			key: ["issue", 1],
		};
		expect(await ensured).toEqual(handle);
		expect(await fetched).toEqual(handle);
		expect(backend.requests).toHaveLength(0);
	});

	it("hand out the cached data itself, not a copy", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "Cached" });

		const handle = await qc.ensure(backend.issueQuery, { id: 1 });

		expect(handle.data).toBe(qc.getData(backend.issueQuery, { id: 1 }));
	});

	it("ensure resolves immediately with stale data and revalidates", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "Cached" });

		const handle = await qc.ensure(backend.issueQuery, { id: 1 });

		expect(handle.data.title).toBe("Cached");

		expect(qc.getData(backend.issueQuery, { id: 1 })?.title).toBe("Cached");
		expect(backend.requests).toHaveLength(1);
	});

	it("fetch waits for stale data to refetch", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "Cached" });

		const issue = qc.fetch(backend.issueQuery, { id: 1 });
		const again = qc.fetch(backend.issueQuery, { id: 1 });
		expect(backend.requests).toHaveLength(1);
		backend.respondAll();

		expect((await issue).data.title).toBe("First");
		expect((await again).data.title).toBe("First");
	});

	it("fetch resolves immediately with fresh data", async () => {
		const backend = createBackend();
		const qc = new QueryClient({
			defaults: { staleTime: Infinity },
			isServer: false,
		});
		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "Cached" });

		const issue = await qc.fetch(backend.issueQuery, { id: 1 });

		expect(issue.data.title).toBe("Cached");
		expect(backend.requests).toHaveLength(0);
	});

	it("fetch joins a background refetch of stale data", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "Cached" });
		qc.prefetch(backend.issueQuery, { id: 1 });

		const issue = qc.fetch(backend.issueQuery, { id: 1 });
		expect(backend.requests).toHaveLength(1);
		backend.respondAll();

		expect((await issue).data.title).toBe("First");
	});

	it("reject when the request fails", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });

		const handle = qc.ensure(backend.issueQuery, { id: 404 });
		backend.respondAll();

		await expect(handle).rejects.toThrow("No issue 404");
	});

	it("accept factories without input", async () => {
		const qc = new QueryClient({ isServer: false });
		function countQuery() {
			return queryOptions({ queryFn: () => 42, queryKey: ["count"] });
		}

		expect((await qc.fetch(countQuery)).data).toBe(42);
		expect(qc.prefetch(countQuery)).toEqual({
			input: undefined,
			key: ["count"],
		});
	});
});

describe("undefined data", () => {
	function maybeQuery() {
		return queryOptions({
			queryFn: (): Promise<number | undefined> => Promise.resolve(undefined),
			queryKey: ["maybe"],
			staleTime: Infinity,
		});
	}

	it("is data like any other value", async () => {
		const queryFn = vi.fn(() => Promise.resolve(undefined));
		const qc = new QueryClient({ isServer: false });
		function noneQuery() {
			return queryOptions({ queryFn, queryKey: ["none"], staleTime: Infinity });
		}

		await expect(qc.fetch(noneQuery)).resolves.toHaveProperty(
			"data",
			undefined,
		);
		await expect(qc.ensure(noneQuery)).resolves.toHaveProperty(
			"data",
			undefined,
		);
		await expect(
			Query.readUnsafe(qc.getQuery(noneQuery)),
		).resolves.toBeUndefined();
		expect(Query.getUnsafe(qc.getQuery(noneQuery))).toMatchObject({
			data: undefined,
			hasData: true,
			status: "success",
		});
		expect(queryFn).toHaveBeenCalledOnce();
	});

	it("can be written with setData, and hasData tells it from no data", async () => {
		const qc = new QueryClient({ isServer: false });
		expect(qc.getData(maybeQuery)).toBeUndefined();
		expect(Query.getUnsafe(qc.getQuery(maybeQuery)).hasData).toBe(false);

		qc.setData(maybeQuery, undefined, undefined);

		expect(qc.getData(maybeQuery)).toBeUndefined();
		expect(Query.getUnsafe(qc.getQuery(maybeQuery)).hasData).toBe(true);
		await expect(qc.fetch(maybeQuery)).resolves.toHaveProperty(
			"data",
			undefined,
		);
	});

	it("types data from the queryFn, including undefined", () => {
		const fetchMaybe = async (qc: QueryClient) =>
			(await qc.fetch(maybeQuery)).data;
		expectTypeOf(fetchMaybe).returns.resolves.toEqualTypeOf<
			number | undefined
		>();
	});
});

describe("on the server", () => {
	it("verbs reuse cached data instead of revalidating it", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: true });

		const data = qc.fetch(backend.issueQuery, { id: 1 });
		backend.respondAll();
		expect((await data).data).toEqual({ id: 1, title: "First" });
		expect(
			Query.isStaleUnsafe(qc.getQuery(backend.issueQuery, { id: 1 })),
		).toBe(true);

		const handle = await qc.ensure(backend.issueQuery, { id: 1 });
		qc.prefetch(backend.issueQuery, { id: 1 });
		expect((await qc.fetch(backend.issueQuery, { id: 1 })).data).toEqual({
			id: 1,
			title: "First",
		});

		expect(handle.data.title).toBe("First");
		expect(backend.requests).toHaveLength(0);
	});

	it("invalidate refetches read entries", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: true });
		const data = qc.fetch(backend.issueQuery, { id: 1 });
		backend.respondAll();
		await data;
		Query.subscribeUnsafe(qc.getQuery(backend.issueQuery, { id: 1 }), () => {});

		const invalidated = qc.invalidate(backend.issueQuery, { id: 1 });
		expect(backend.requests).toHaveLength(1);
		backend.issues.set(1, { id: 1, title: "Edited" });
		backend.respondAll();
		await invalidated;

		expect(qc.getData(backend.issueQuery, { id: 1 })?.title).toBe("Edited");
	});

	it("verbs refetch unread entries invalidate marked", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: true });
		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "A" });

		await qc.invalidate(backend.issueQuery, { id: 1 });
		expect(backend.requests).toHaveLength(0);

		qc.prefetch(backend.issueQuery, { id: 1 });
		expect(backend.requests).toHaveLength(1);
	});
});

describe("enabled", () => {
	function capabilityQuery(input: { enabled: boolean; id: number }) {
		const calls: Array<number> = [];
		return {
			calls,
			query: () =>
				queryOptions({
					enabled: input.enabled,
					queryFn: () => {
						calls.push(input.id);
						return "granted";
					},
					queryKey: ["capability", input.id],
				}),
		};
	}

	it("never runs or sends a disabled query on the server, and rejects its readers", async () => {
		const capability = capabilityQuery({ enabled: false, id: 1 });
		const qc = new QueryClient({ isServer: true });

		const handle = qc.prefetch(capability.query);
		expect(handle).toEqual({ input: undefined, key: ["capability", 1] });
		const query = qc.getQuery(capability.query);
		const promise = Query.readUnsafe(query);
		await qc.invalidate(capability.query);
		await Effect.runPromise(Query.refetch(query));
		await expect(qc.ensure(capability.query)).rejects.toBeInstanceOf(
			Query.DisabledError,
		);
		await expect(qc.fetch(capability.query)).rejects.toThrow(
			'Query ["capability",1] is disabled (enabled: false)',
		);

		expect(capability.calls).toEqual([]);
		const state = Query.getUnsafe(query);
		expect(state).toMatchObject({ hasData: false, isFetching: false });
		expect(promise.status).toBe("rejected");
		expect(dehydrate(qc, { filter: () => true }).queries).toEqual([]);
	});

	it("never runs a disabled query in the browser, and keeps its readers pending", async () => {
		const capability = capabilityQuery({ enabled: false, id: 1 });
		const qc = new QueryClient({ isServer: false });

		qc.prefetch(capability.query);
		const query = qc.getQuery(capability.query);
		const promise = Query.readUnsafe(query);
		const unsubscribe = Query.subscribeUnsafe(query, () => {});
		await qc.invalidate(capability.query);
		await Effect.runPromise(Query.refetch(query));
		await expect(qc.fetch(capability.query)).rejects.toThrow(
			'Query ["capability",1] is disabled (enabled: false)',
		);
		unsubscribe();

		expect(capability.calls).toEqual([]);
		expect(promise.status).toBe("pending");
		expect(Query.getUnsafe(query)).toMatchObject({
			hasData: false,
			isFetching: false,
			status: "pending",
		});
	});

	it("settles the pending promise once a factory call enables the query", async () => {
		let enabled = false;
		const calls: Array<string> = [];
		function permissionQuery() {
			return queryOptions({
				enabled,
				queryFn: async () => {
					calls.push("permission");
					return "granted";
				},
				queryKey: ["permission"],
			});
		}
		const qc = new QueryClient({ isServer: false });
		qc.prefetch(permissionQuery);
		const disabled = Query.readUnsafe(qc.getQuery(permissionQuery));

		enabled = true;
		qc.prefetch(permissionQuery);
		const query = qc.getQuery(permissionQuery);

		expect(Query.readUnsafe(query)).toBe(disabled);
		await expect(disabled).resolves.toBe("granted");
		expect(Query.getUnsafe(query)).toMatchObject({ data: "granted" });
		expect(calls).toEqual(["permission"]);
	});

	it("runs a query enabled by a browser-only check in the browser only", async () => {
		let browser = false;
		const calls: Array<string> = [];
		function tagQuery() {
			return queryOptions({
				enabled: browser,
				queryFn: async () => {
					calls.push(browser ? "browser" : "server");
					return "beta";
				},
				queryKey: ["tag"],
			});
		}
		const server = new QueryClient({ isServer: true });
		server.prefetch(tagQuery);
		const state = dehydrate(server, { filter: () => true });

		browser = true;
		const qc = new QueryClient({ isServer: false });
		hydrate(qc, state);
		await expect(qc.ensure(tagQuery)).resolves.toHaveProperty("data", "beta");

		expect(state.queries).toEqual([]);
		expect(calls).toEqual(["browser"]);
	});
});

describe("read", () => {
	it("returns a thenable React can read synchronously once data exists", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(backend.issueQuery, { id: 1 });

		const first = Query.readUnsafe(query);
		expect(first).toMatchObject({ status: "pending" });
		backend.respondAll();
		await first;

		expect(first).toMatchObject({
			status: "fulfilled",
			value: { id: 1, title: "First" },
		});
		expect(Query.readUnsafe(query)).toBe(first);
	});

	it("creates a new fulfilled promise per data version", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "A" });
		const query = qc.getQuery(backend.issueQuery, { id: 1 });
		const before = Query.readUnsafe(query);

		qc.setData(backend.issueQuery, { id: 1 }, (issue) => ({
			id: 1,
			title: `${issue?.title}B`,
		}));

		expect(Query.readUnsafe(query)).not.toBe(before);
		expect(Query.readUnsafe(query)).toMatchObject({
			status: "fulfilled",
			value: { title: "AB" },
		});
	});

	it("retries a failed first load once its error has been shown", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		backend.issues.delete(1);
		const query = qc.getQuery(backend.issueQuery, { id: 1 });

		const failed = Query.readUnsafe(query);
		backend.respondAll();
		await expect(failed).rejects.toThrow("No issue 1");

		// Same task: React re-rendering the throwing component.
		expect(Query.readUnsafe(query)).toBe(failed);
		expect(backend.requests).toHaveLength(0);

		// A later task: the error boundary was reset.
		await flush();
		backend.issues.set(1, { id: 1, title: "Back" });
		const retried = Query.readUnsafe(query);
		expect(retried).not.toBe(failed);
		backend.respondAll();
		expect(await retried).toEqual({ id: 1, title: "Back" });
	});
});

describe("structural sharing", () => {
	function listQuery(options: { structuralSharing?: boolean } = {}) {
		return () =>
			queryOptions({
				queryFn: () => [
					{ id: 1, tags: ["a"], title: "First" },
					{ id: 2, tags: ["b"], title: "Second" },
				],
				queryKey: ["list"],
				...options,
			});
	}

	it("keeps the data and promise when a refetch returns equal data", async () => {
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(listQuery());
		await Effect.runPromise(Query.fetch(query));
		const before = Query.getUnsafe(query);

		await Effect.runPromise(Query.refetch(query));

		const after = Query.getUnsafe(query);
		expect(after.data).toBe(before.data);
		expect(after.promise).toBe(before.promise);
		expect(after.updatedAt).toBeGreaterThanOrEqual(before.updatedAt);
	});

	it("reuses unchanged parts of new data", async () => {
		const qc = new QueryClient({ isServer: false });
		const factory = listQuery();
		const { data } = await qc.fetch(factory);
		const promise = Query.getUnsafe(qc.getQuery(factory)).promise;

		qc.setData(factory, undefined, [
			{ id: 1, tags: ["a"], title: "First" },
			{ id: 2, tags: ["b"], title: "Renamed" },
		]);

		const next = qc.getData(factory);
		expect(next).not.toBe(data);
		expect(next?.[0]).toBe(data[0]);
		expect(next?.[1]).not.toBe(data[1]);
		expect(next?.[1]?.tags).toBe(data[1]?.tags);
		expect(Query.getUnsafe(qc.getQuery(factory)).promise).not.toBe(promise);
	});

	it("is skipped with structuralSharing: false", async () => {
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(listQuery({ structuralSharing: false }));
		await Effect.runPromise(Query.fetch(query));
		const before = Query.getUnsafe(query);

		await Effect.runPromise(Query.refetch(query));

		expect(Query.getUnsafe(query).data).not.toBe(before.data);
		expect(Query.getUnsafe(query).promise).not.toBe(before.promise);
	});
});

describe("subscriptions", () => {
	it("notify once per microtask batch", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(backend.issueQuery, { id: 1 });
		const listener = vi.fn();
		Query.subscribeUnsafe(query, listener);

		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "A" });
		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "B" });
		expect(listener).not.toHaveBeenCalled();

		await Promise.resolve();
		expect(listener).toHaveBeenCalledOnce();
	});

	it("emit cache events", () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		const events: Array<string> = [];
		qc.subscribe((event) => events.push(`${event.type} ${event.query.hash}`));

		qc.prefetch(backend.issueQuery, { id: 1 });
		qc.clear();

		expect(events).toEqual([
			'added ["issue",1]',
			'updated ["issue",1]',
			'removed ["issue",1]',
		]);
	});

	it("mark a read entry stale when its staleTime passes", async () => {
		using _timers = fakeTimers();
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(() =>
			queryOptions({ queryFn: () => 1, queryKey: ["n"], staleTime: 100 }),
		);
		Query.subscribeUnsafe(query, () => {});
		await Effect.runPromise(Query.fetch(query));
		expect(Query.getUnsafe(query).isStale).toBe(false);

		await vi.advanceTimersByTimeAsync(101);

		expect(Query.getUnsafe(query).isStale).toBe(true);
	});
});

describe("invalidate", () => {
	it("refetches read entries and resolves when they settle", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(backend.issueQuery, { id: 1 });
		Query.subscribeUnsafe(query, () => {});
		Query.readUnsafe(query);
		backend.respondAll();
		await flush();

		let settled = false;
		const invalidated = qc
			.invalidate(backend.issueQuery, { id: 1 })
			.then(() => {
				settled = true;
			});
		await flush();
		expect(settled).toBe(false);
		expect(backend.requests).toHaveLength(1);

		backend.issues.set(1, { id: 1, title: "Edited" });
		backend.respondAll();
		await invalidated;
		expect(Query.getUnsafe(query).data?.title).toBe("Edited");
		expect(Query.getUnsafe(query).isInvalidated).toBe(false);
	});

	it("only marks unread entries stale", async () => {
		const backend = createBackend();
		const qc = new QueryClient({
			defaults: { staleTime: Infinity },
			isServer: false,
		});
		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "A" });

		await qc.invalidate(backend.issueQuery, { id: 1 });
		expect(backend.requests).toHaveLength(0);

		qc.prefetch(backend.issueQuery, { id: 1 });
		expect(backend.requests).toHaveLength(1);
	});

	it("matches entries by key prefix, including partial object segments", async () => {
		const qc = new QueryClient({ isServer: false });
		function listQuery(input: { page: number; status: string }) {
			return queryOptions({
				queryFn: () => [],
				queryKey: ["issues", { page: input.page, status: input.status }],
				staleTime: Infinity,
			});
		}
		qc.setData(listQuery, { page: 1, status: "open" }, []);
		qc.setData(listQuery, { page: 2, status: "open" }, []);
		qc.setData(listQuery, { page: 1, status: "closed" }, []);

		await qc.invalidate({ queryKey: ["issues", { status: "open" }] });

		const invalidated = qc
			.getAll()
			.filter((query) => Query.getUnsafe(query).isInvalidated)
			.map((query) => query.hash);
		expect(invalidated).toEqual([
			'["issues",{"page":1,"status":"open"}]',
			'["issues",{"page":2,"status":"open"}]',
		]);
	});

	it("narrows a filter with predicate, and matches everything with {}", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		function labelsQuery() {
			return queryOptions({ queryFn: () => [], queryKey: ["labels"] });
		}
		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "A" });
		qc.setData(backend.issueQuery, { id: 2 }, { id: 2, title: "B" });
		qc.setData(labelsQuery, undefined, []);
		const invalidated = () =>
			qc
				.getAll()
				.filter((query) => Query.getUnsafe(query).isInvalidated)
				.map((query) => query.hash);

		await qc.invalidate({
			predicate: (query) => query.key[1] === 2,
			queryKey: ["issue"],
		});
		expect(invalidated()).toEqual(['["issue",2]']);

		await qc.invalidate({});
		expect(invalidated()).toHaveLength(3);
	});

	it("restarts an in-flight request and aborts the old one", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(backend.issueQuery, { id: 1 });
		Query.subscribeUnsafe(query, () => {});
		const first = Query.readUnsafe(query);
		const [oldRequest] = backend.requests;

		const invalidated = qc.invalidate(backend.issueQuery, { id: 1 });

		expect(oldRequest?.signal.aborted).toBe(true);
		backend.respondAll();
		await invalidated;
		expect(await first).toEqual({ id: 1, title: "First" });
	});
});

describe("observers", () => {
	it("are counted, and changes emit an observers event", () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(backend.issueQuery, { id: 1 });
		const events: Array<string> = [];
		qc.subscribe((event) => events.push(event.type));

		const first = Query.subscribeUnsafe(query, () => {});
		const second = Query.subscribeUnsafe(query, () => {});
		expect(Query.observerCountUnsafe(query)).toBe(2);
		first();
		first();
		second();

		expect(Query.observerCountUnsafe(query)).toBe(0);
		expect(events).toEqual([
			"observers",
			"observers",
			"observers",
			"observers",
		]);
	});
});

describe("reset", () => {
	it("drops data and refetches read entries behind a pending promise", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(backend.issueQuery, { id: 1 });
		Query.subscribeUnsafe(query, () => {});
		Query.readUnsafe(query);
		backend.respondAll();
		await flush();

		const reset = qc.reset(backend.issueQuery, { id: 1 });
		const state = Query.getUnsafe(query);
		expect(state).toMatchObject({
			data: undefined,
			hasData: false,
			isFetching: true,
			status: "pending",
		});

		backend.issues.set(1, { id: 1, title: "Again" });
		backend.respondAll();
		await reset;
		expect(await state.promise).toEqual({ id: 1, title: "Again" });
		expect(Query.getUnsafe(query).status).toBe("success");
	});

	it("leaves unread entries empty until they are read", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "A" });

		await qc.reset({ queryKey: ["issue"] });

		const query = qc.getQuery(backend.issueQuery, { id: 1 });
		expect(Query.getUnsafe(query).hasData).toBe(false);
		expect(backend.requests).toHaveLength(0);
		Query.readUnsafe(query);
		expect(backend.requests).toHaveLength(1);
	});

	it("restarts an in-flight request so its old response can't restore data", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "A" });
		void Effect.runPromise(
			Query.refetch(qc.getQuery(backend.issueQuery, { id: 1 })),
		);
		const [oldRequest] = backend.requests;

		const reset = qc.reset(backend.issueQuery, { id: 1 });

		expect(oldRequest?.signal.aborted).toBe(true);
		backend.respondAll();
		await reset;
		expect(qc.getData(backend.issueQuery, { id: 1 })).toEqual({
			id: 1,
			title: "First",
		});
	});
});

describe("remove", () => {
	it("drops matching entries and aborts their requests", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		const events: Array<string> = [];
		qc.subscribe((event) => events.push(`${event.type} ${event.query.hash}`));
		const pending = qc.fetch(backend.issueQuery, { id: 1 });
		qc.setData(backend.issueQuery, { id: 2 }, { id: 2, title: "B" });

		qc.remove(backend.issueQuery, { id: 1 });

		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
		expect(backend.requests[0]?.signal.aborted).toBe(true);
		expect(qc.getAll().map((query) => query.hash)).toEqual(['["issue",2]']);
		expect(events).toContain('removed ["issue",1]');

		qc.remove({ queryKey: ["issue"] });
		expect(qc.getAll()).toHaveLength(0);
	});

	it("leaves removed entries cancelled instead of fetching", async () => {
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		qc.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "A" });
		const removed = qc.getQuery(backend.issueQuery, { id: 1 });

		qc.remove(backend.issueQuery, { id: 1 });

		await expect(
			Effect.runPromise(Query.fetch(removed, { restart: true })),
		).rejects.toBeInstanceOf(Query.CancelledError);
		await Effect.runPromise(Query.refetch(removed));
		expect(backend.requests).toHaveLength(0);
	});
});

describe("retry", () => {
	it("retries the configured number of times", async () => {
		const queryFn = vi.fn(() => Promise.reject(new Error("down")));
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(() =>
			queryOptions({ queryFn, queryKey: ["flaky"], retry: 2, retryDelay: 0 }),
		);

		await expect(Effect.runPromise(Query.fetch(query))).rejects.toThrow("down");

		expect(queryFn).toHaveBeenCalledTimes(3);
		expect(Query.getUnsafe(query).failureCount).toBe(3);
	});

	it("backs off exponentially by default", async () => {
		using _timers = fakeTimers();
		let calls = 0;
		const qc = new QueryClient({ isServer: false });
		const result = qc.fetch(() =>
			queryOptions({
				queryFn: () => {
					calls++;
					return calls < 3 ? Promise.reject(new Error("down")) : "ok";
				},
				queryKey: ["backoff"],
			}),
		);

		await vi.advanceTimersByTimeAsync(999);
		expect(calls).toBe(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(calls).toBe(2);
		await vi.advanceTimersByTimeAsync(2000);
		expect((await result).data).toBe("ok");
	});

	it("waits retryDelay(failureCount, error) between attempts", async () => {
		using _timers = fakeTimers();
		const retryDelay = vi.fn((failureCount: number) => failureCount * 100);
		let calls = 0;
		const qc = new QueryClient({ isServer: false });
		const result = qc.fetch(() =>
			queryOptions({
				queryFn: () => {
					calls++;
					return calls < 3 ? Promise.reject(new Error("down")) : "ok";
				},
				queryKey: ["delay"],
				retryDelay,
			}),
		);

		await vi.advanceTimersByTimeAsync(99);
		expect(calls).toBe(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(calls).toBe(2);
		await vi.advanceTimersByTimeAsync(200);
		expect((await result).data).toBe("ok");
		expect(retryDelay.mock.calls).toEqual([
			[1, new Error("down")],
			[2, new Error("down")],
		]);
	});

	it("accepts a predicate and an Effect schedule", async () => {
		const qc = new QueryClient({ isServer: false });
		const byPredicate = vi.fn(() => Promise.reject(new Error("down")));
		const bySchedule = vi.fn(() => Promise.reject(new Error("down")));

		await expect(
			qc.fetch(() =>
				queryOptions({
					queryFn: byPredicate,
					queryKey: ["predicate"],
					retry: (failureCount) => failureCount < 2,
					retryDelay: 0,
				}),
			),
		).rejects.toThrow("down");
		await expect(
			qc.fetch(() =>
				queryOptions({
					queryFn: bySchedule,
					queryKey: ["schedule"],
					retry: Schedule.recurs(4),
				}),
			),
		).rejects.toThrow("down");

		expect(byPredicate).toHaveBeenCalledTimes(2);
		expect(bySchedule).toHaveBeenCalledTimes(5);
	});

	describe("offline", () => {
		function goOffline() {
			const target = new EventTarget();
			const network = { onLine: false };
			vi.stubGlobal("window", target);
			vi.stubGlobal("navigator", network);
			return {
				goOnline() {
					network.onLine = true;
					target.dispatchEvent(new Event("online"));
				},
				target,
			};
		}

		function failingOnce() {
			let calls = 0;
			return vi.fn(() => {
				calls++;
				return calls === 1 ? Promise.reject(new Error("down")) : "ok";
			});
		}

		it("waits for the browser to come back online before retrying", async () => {
			using _timers = fakeTimers();
			const browser = goOffline();
			const queryFn = failingOnce();
			const qc = new QueryClient({ isServer: false });
			const query = qc.getQuery(() =>
				queryOptions({ queryFn, queryKey: ["offline"] }),
			);
			const result = Effect.runPromise(Query.fetch(query));

			await vi.advanceTimersByTimeAsync(60_000);
			expect(queryFn).toHaveBeenCalledOnce();
			expect(Query.getUnsafe(query)).toMatchObject({
				failureCount: 1,
				isFetching: true,
				status: "pending",
			});

			browser.goOnline();
			await vi.advanceTimersByTimeAsync(0);

			expect(await result).toBe("ok");
			expect(queryFn).toHaveBeenCalledTimes(2);
		});

		it("still waits for the retry delay", async () => {
			using _timers = fakeTimers();
			const browser = goOffline();
			const queryFn = failingOnce();
			const qc = new QueryClient({ isServer: false });
			const result = qc.fetch(() =>
				queryOptions({ queryFn, queryKey: ["offline"], retryDelay: 1000 }),
			);

			await vi.advanceTimersByTimeAsync(500);
			browser.goOnline();
			await vi.advanceTimersByTimeAsync(499);
			expect(queryFn).toHaveBeenCalledOnce();
			await vi.advanceTimersByTimeAsync(1);

			expect((await result).data).toBe("ok");
		});

		it("pauses Schedule retries too", async () => {
			using _timers = fakeTimers();
			const browser = goOffline();
			const queryFn = failingOnce();
			const qc = new QueryClient({ isServer: false });
			const result = qc.fetch(() =>
				queryOptions({
					queryFn,
					queryKey: ["offline"],
					retry: Schedule.recurs(3),
				}),
			);

			await vi.advanceTimersByTimeAsync(60_000);
			expect(queryFn).toHaveBeenCalledOnce();

			browser.goOnline();

			expect((await result).data).toBe("ok");
		});

		it("stops waiting when the query is removed", async () => {
			using _timers = fakeTimers();
			const browser = goOffline();
			const removeListener = vi.spyOn(browser.target, "removeEventListener");
			const queryFn = vi.fn(() => Promise.reject(new Error("down")));
			const qc = new QueryClient({ isServer: false });
			const factory = () => queryOptions({ queryFn, queryKey: ["offline"] });
			const result = qc.fetch(factory);
			await vi.advanceTimersByTimeAsync(60_000);

			qc.remove(factory);

			await expect(result).rejects.toMatchObject({ name: "AbortError" });
			expect(removeListener).toHaveBeenCalledWith(
				"online",
				expect.any(Function),
			);
			browser.goOnline();
			await vi.advanceTimersByTimeAsync(60_000);
			expect(queryFn).toHaveBeenCalledOnce();
		});

		it("doesn't delay retries while online", async () => {
			const browser = goOffline();
			browser.goOnline();
			const queryFn = vi.fn(() => Promise.reject(new Error("down")));
			const qc = new QueryClient({ isServer: false });

			await expect(
				qc.fetch(() =>
					queryOptions({ queryFn, queryKey: ["online"], retryDelay: 0 }),
				),
			).rejects.toThrow("down");
			expect(queryFn).toHaveBeenCalledTimes(4);
		});

		it("doesn't wait on the server", async () => {
			goOffline();
			const queryFn = vi.fn(() => Promise.reject(new Error("down")));
			const qc = new QueryClient({ isServer: true });

			await expect(
				qc.fetch(() =>
					queryOptions({
						queryFn,
						queryKey: ["server"],
						retry: 1,
						retryDelay: 0,
					}),
				),
			).rejects.toThrow("down");
			expect(queryFn).toHaveBeenCalledTimes(2);
		});
	});

	it("is off on the server", async () => {
		const queryFn = vi.fn(() => Promise.reject(new Error("down")));
		const qc = new QueryClient({ isServer: true });

		await expect(
			qc.fetch(() => queryOptions({ queryFn, queryKey: ["server"] })),
		).rejects.toThrow("down");
		expect(queryFn).toHaveBeenCalledOnce();
	});
});

describe("Effect queryFn", () => {
	it("runs the effect and interrupts it on abort", async () => {
		let interrupted = false;
		const qc = new QueryClient({ isServer: false });
		function slowQuery() {
			return queryOptions({
				queryFn: () =>
					Effect.sleep(1000).pipe(
						Effect.as("slow"),
						Effect.onInterrupt(() =>
							Effect.sync(() => {
								interrupted = true;
							}),
						),
					),
				queryKey: ["slow"],
			});
		}
		function fastQuery() {
			return queryOptions({
				queryFn: () => Effect.succeed("fast"),
				queryKey: ["fast"],
			});
		}

		expect((await qc.fetch(fastQuery)).data).toBe("fast");
		const slow = qc.fetch(slowQuery);
		await flush();
		qc.clear();

		await expect(slow).rejects.toMatchObject({ name: "AbortError" });
		await flush();
		expect(interrupted).toBe(true);
	});
});

describe("garbage collection", () => {
	it("removes unread entries after gcTime", async () => {
		using _timers = fakeTimers();
		const backend = createBackend();
		const qc = new QueryClient({ defaults: { gcTime: 50 }, isServer: false });
		const query = qc.getQuery(backend.issueQuery, { id: 1 });
		const unsubscribe = Query.subscribeUnsafe(query, () => {});
		Query.readUnsafe(query);
		backend.respondAll();
		await vi.advanceTimersByTimeAsync(100);
		expect(qc.getAll()).toHaveLength(1);

		unsubscribe();
		await vi.advanceTimersByTimeAsync(50);

		expect(qc.getAll()).toHaveLength(0);
	});

	it("keeps everything on the server", async () => {
		using _timers = fakeTimers();
		const qc = new QueryClient({ isServer: true });
		await qc.fetch(() => queryOptions({ queryFn: () => 1, queryKey: ["n"] }));

		await vi.advanceTimersByTimeAsync(10 * 60_000);

		expect(qc.getAll()).toHaveLength(1);
	});
});

describe("window events", () => {
	it("refetch read, stale entries on focus and reconnect", async () => {
		const target = new EventTarget();
		vi.stubGlobal("window", target);
		vi.stubGlobal("document", { visibilityState: "visible" });
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		const unmount = qc.mount();
		const query = qc.getQuery(backend.issueQuery, { id: 1 });
		Query.subscribeUnsafe(query, () => {});
		Query.readUnsafe(query);
		backend.respondAll();
		await flush();

		target.dispatchEvent(new Event("visibilitychange"));
		expect(backend.requests).toHaveLength(1);
		backend.respondAll();
		await flush();

		const unread = qc.fetch(backend.issueQuery, { id: 2 });
		backend.respondAll();
		await unread;
		target.dispatchEvent(new Event("online"));
		expect(backend.requests.map((request) => request.id)).toEqual([1]);
		backend.respondAll();
		await flush();

		unmount();
		target.dispatchEvent(new Event("online"));
		expect(backend.requests).toHaveLength(0);
	});

	it("respect per-reader opt-outs", async () => {
		const target = new EventTarget();
		vi.stubGlobal("window", target);
		vi.stubGlobal("document", { visibilityState: "visible" });
		const backend = createBackend();
		const qc = new QueryClient({ isServer: false });
		const unmount = qc.mount();
		const query = qc.getQuery(backend.issueQuery, { id: 1 });
		Query.subscribeUnsafe(query, () => {}, { refetchOnWindowFocus: false });
		Query.readUnsafe(query);
		backend.respondAll();
		await flush();

		target.dispatchEvent(new Event("visibilitychange"));

		expect(backend.requests).toHaveLength(0);
		unmount();
	});
});

class Api extends Context.Service<
	Api,
	{ readonly user: (id: number) => Effect.Effect<string, NotFound> }
>()("test/Api") {}

class Other extends Context.Service<Other, { readonly name: string }>()(
	"test/Other",
) {}

class NotFound extends Error {
	readonly _tag = "NotFound";
}

function userQuery(input: { id: number }) {
	return queryOptions({
		queryFn: () =>
			Effect.flatMap(Effect.service(Api), (api) => api.user(input.id)),
		queryKey: ["user", input.id],
		retry: false,
	});
}

function apiLayer(released: Array<string>) {
	return Layer.effect(
		Api,
		Effect.acquireRelease(
			Effect.succeed({
				user: (id: number) =>
					id > 0 ? Effect.succeed(`#${id}`) : Effect.fail(new NotFound()),
			}),
			() =>
				Effect.sync(() => {
					released.push("api");
				}),
		),
	);
}

describe("layer", () => {
	it("provides services to queryFn Effects", async () => {
		const qc = new QueryClient({ isServer: false, layer: apiLayer([]) });

		expect((await qc.fetch(userQuery, { id: 1 })).data).toBe("#1");
		const query = qc.getQuery(userQuery, { id: 2 });
		expect(await Query.readUnsafe(query)).toBe("#2");
	});

	it("rejects with a queryFn Effect's typed failure", async () => {
		const qc = new QueryClient({ isServer: false, layer: apiLayer([]) });

		await expect(qc.ensure(userQuery, { id: 0 })).rejects.toBeInstanceOf(
			NotFound,
		);
	});

	it("runs an app's Effects with the cache and the layer's services", async () => {
		const qc = new QueryClient({ isServer: false, layer: apiLayer([]) });
		const program = Effect.gen(function* () {
			const api = yield* Api;
			const cache = yield* QueryCache.QueryCache;
			const handle = yield* cache.ensure(userQuery, { id: 1 });
			return [yield* api.user(2), handle.key] as const;
		});

		expect(await qc.runPromise(program)).toEqual(["#2", ["user", 1]]);
		expect(qc.getData(userQuery, { id: 1 })).toBe("#1");
		await expect(
			qc.runPromise(Effect.flatMap(Effect.service(Api), (api) => api.user(0))),
		).rejects.toBeInstanceOf(NotFound);
		// @ts-expect-error: the client's layer doesn't provide `Other`.
		expectTypeOf(() => qc.runPromise(Effect.service(Other))).toBeFunction();
	});

	it("dispose runs the layer's finalizers and interrupts requests", async () => {
		const backend = createBackend();
		const released: Array<string> = [];
		const qc = new QueryClient({ isServer: false, layer: apiLayer(released) });
		await qc.fetch(userQuery, { id: 1 });
		qc.prefetch(backend.issueQuery, { id: 1 });

		await qc.dispose();

		expect(released).toEqual(["api"]);
		expect(backend.requests[0]?.signal.aborted).toBe(true);
	});
});
