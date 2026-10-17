import { describe, expect, it, vi } from "@effect/vitest";
import { Effect } from "effect";

import {
	dehydrate,
	type DehydratedResult,
	type DehydratedState,
	hydrate,
	QueryClient,
	queryOptions,
	Query,
} from "./index.ts";
import { createBackend } from "./test-utils.ts";

describe("dehydrate", () => {
	it("sends settled data and in-flight requests, nothing else", async () => {
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		server.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "A" });
		server.prefetch(backend.issueQuery, { id: 2 });
		server.getQuery(backend.issueQuery, { id: 3 });

		const state = dehydrate(server);

		expect(state.queries.map((query) => query.key)).toEqual([
			["issue", 1],
			["issue", 2],
		]);
		expect(state.queries[0]).toMatchObject({ data: { id: 1, title: "A" } });
		expect(state.queries[1]?.promise).toBeInstanceOf(Promise);
	});

	it("redacts errors of pending queries unless keepErrors", async () => {
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		server.prefetch(backend.issueQuery, { id: 404 });

		const redacted = dehydrate(server).queries[0]?.promise;
		const kept = dehydrate(server, { keepErrors: true }).queries[0]?.promise;
		backend.respondAll();

		await expect(redacted).rejects.toThrow('Query ["issue",404] failed');
		await expect(kept).rejects.toThrow("No issue 404");
	});

	it("sends whether each queryFn returned an Effect, once it has run", () => {
		const backend = createBackend();
		function countQuery() {
			return queryOptions({
				queryFn: () => Effect.succeed(1),
				queryKey: ["count"],
			});
		}
		const server = new QueryClient({ isServer: true });
		server.prefetch(backend.issueQuery, { id: 1 });
		server.prefetch(countQuery);
		server.setData(backend.issueQuery, { id: 2 }, { id: 2, title: "B" });

		const browser = new QueryClient({ isServer: false });
		const sent = dehydrate(server);
		hydrate(browser, sent);

		expect(sent.queries.map((query) => query.effect)).toEqual([
			false,
			true,
			undefined,
		]);
		expect(
			Query.returnsEffectUnsafe(
				browser.getQuery(backend.issueQuery, { id: 1 }),
			),
		).toBe(false);
		expect(Query.returnsEffectUnsafe(browser.getQuery(countQuery))).toBe(true);
		expect(
			Query.returnsEffectUnsafe(
				browser.getQuery(backend.issueQuery, { id: 2 }),
			),
		).toBeUndefined();
	});
});

describe("hydrate", () => {
	it("keeps undefined data, even when JSON drops the field", async () => {
		const queryFn = vi.fn(() => Promise.resolve(undefined));
		function noneQuery() {
			return queryOptions({ queryFn, queryKey: ["none"], staleTime: Infinity });
		}
		const server = new QueryClient({ isServer: true });
		const browser = new QueryClient({ isServer: false });
		await server.fetch(noneQuery);

		// oxlint-disable-next-line unicorn/prefer-structured-clone -- structuredClone keeps `data: undefined`; JSON drops it, which is the case under test
		const sent: DehydratedState = JSON.parse(JSON.stringify(dehydrate(server)));
		expect(sent.queries[0]).not.toHaveProperty("data");
		hydrate(browser, sent);

		const query = browser.getQuery(noneQuery);
		expect(Query.getUnsafe(query)).toMatchObject({
			data: undefined,
			hasData: true,
		});
		await expect(Query.readUnsafe(query)).resolves.toBeUndefined();
		expect(queryFn).toHaveBeenCalledOnce();
	});

	it("writes data without fetching", async () => {
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		const browser = new QueryClient({ isServer: false });
		server.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "A" });

		hydrate(browser, dehydrate(server));

		const query = browser.getQuery(backend.issueQuery, { id: 1 });
		expect(Query.readUnsafe(query)).toMatchObject({ status: "fulfilled" });
		expect(backend.requests).toHaveLength(0);
	});

	it("resumes the server's request instead of starting one", async () => {
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		const browser = new QueryClient({ isServer: false });
		server.prefetch(backend.issueQuery, { id: 1 });

		hydrate(browser, dehydrate(server));
		const query = browser.getQuery(backend.issueQuery, { id: 1 });
		const promise = Query.readUnsafe(query);

		expect(backend.requests).toHaveLength(1);
		backend.respondAll();
		expect(await promise).toEqual({ id: 1, title: "First" });
		expect(Query.getUnsafe(query).status).toBe("success");
	});

	it("resumes one request from overlapping snapshots of one server client", async () => {
		const backend = createBackend();
		const server = new QueryClient({ isServer: true });
		const browser = new QueryClient({ isServer: false });
		// A layout's loader and a child route's loader, on the request's client.
		server.prefetch(backend.issueQuery, { id: 1 });
		const layout = dehydrate(server);
		server.prefetch(backend.issueQuery, { id: 1 });
		server.prefetch(backend.issueQuery, { id: 2 });
		const child = dehydrate(server);
		expect(child.queries.map((query) => query.key)).toEqual([
			["issue", 1],
			["issue", 2],
		]);

		hydrate(browser, layout);
		hydrate(browser, child);
		const first = Query.readUnsafe(
			browser.getQuery(backend.issueQuery, { id: 1 }),
		);
		const second = Query.readUnsafe(
			browser.getQuery(backend.issueQuery, { id: 2 }),
		);

		expect(backend.requests.map((request) => request.id)).toEqual([1, 2]);
		backend.respondAll();
		expect(await first).toEqual({ id: 1, title: "First" });
		expect(await second).toEqual({ id: 2, title: "Second" });
		expect(backend.requests).toHaveLength(0);
	});

	it("counts resumed data as fetched when the server got it", async () => {
		const backend = createBackend();
		const browser = new QueryClient({
			defaults: { staleTime: 60_000 },
			isServer: false,
		});
		const fetchedAt = Date.now() - 120_000;

		hydrate(browser, {
			queries: [
				{
					key: ["issue", 1],
					promise: Promise.resolve({
						data: { id: 1, title: "Server" },
						updatedAt: fetchedAt,
					}),
					updatedAt: 0,
				},
			],
		});
		const query = browser.getQuery(backend.issueQuery, { id: 1 });
		expect(await Query.readUnsafe(query)).toEqual({ id: 1, title: "Server" });

		expect(Query.getUnsafe(query)).toMatchObject({
			isStale: true,
			updatedAt: fetchedAt,
		});
		expect(backend.requests).toHaveLength(0);
	});

	it("keeps a request of its own in flight, and the newer result wins", async () => {
		const backend = createBackend();
		const browser = new QueryClient({ isServer: false });
		const query = browser.getQuery(backend.issueQuery, { id: 1 });
		const first = Query.readUnsafe(query);
		const server = Promise.withResolvers<DehydratedResult>();

		hydrate(browser, {
			queries: [{ key: ["issue", 1], promise: server.promise, updatedAt: 0 }],
		});
		server.resolve({ data: { id: 1, title: "Server" }, updatedAt: Date.now() });

		expect(await first).toEqual({ id: 1, title: "Server" });
		expect(Query.getUnsafe(query).isFetching).toBe(true);
		expect(backend.requests).toHaveLength(1);
		await new Promise((resolve) => {
			setTimeout(resolve, 2);
		});
		backend.respondAll();
		await vi.waitFor(() =>
			expect(Query.getUnsafe(query)).toMatchObject({
				data: { id: 1, title: "First" },
				isFetching: false,
			}),
		);
	});

	it("only replaces older data", async () => {
		const backend = createBackend();
		const browser = new QueryClient({ isServer: false });
		browser.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "New" });
		const updatedAt = Query.getUnsafe(
			browser.getQuery(backend.issueQuery, { id: 1 }),
		).updatedAt;

		hydrate(browser, {
			queries: [
				{ data: { id: 1, title: "Old" }, key: ["issue", 1], updatedAt: 1 },
				{
					data: { id: 2, title: "Newer" },
					key: ["issue", 2],
					updatedAt: updatedAt + 1,
				},
			],
		});

		expect(browser.getData(backend.issueQuery, { id: 1 })?.title).toBe("New");
		expect(browser.getData(backend.issueQuery, { id: 2 })?.title).toBe("Newer");
	});

	describe("data the browser keeps", () => {
		function setup(staleTime: number) {
			const backend = createBackend();
			const browser = new QueryClient({
				defaults: { staleTime },
				isServer: false,
			});
			browser.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "Kept" });
			const updatedAt = Query.getUnsafe(
				browser.getQuery(backend.issueQuery, { id: 1 }),
			).updatedAt;
			return { backend, browser, updatedAt };
		}

		it("revalidates when stale and the server's copy is no newer", async () => {
			const test = setup(0);

			hydrate(test.browser, {
				queries: [
					{
						data: { id: 1, title: "Replayed" },
						key: ["issue", 1],
						updatedAt: test.updatedAt,
					},
				],
			});

			expect(test.backend.requests.map((request) => request.id)).toEqual([1]);
			test.backend.respondAll();
			await vi.waitFor(() =>
				expect(
					test.browser.getData(test.backend.issueQuery, { id: 1 })?.title,
				).toBe("First"),
			);
		});

		function hydratePending(test: ReturnType<typeof setup>) {
			const server = Promise.withResolvers<DehydratedResult>();
			hydrate(test.browser, {
				queries: [{ key: ["issue", 1], promise: server.promise, updatedAt: 0 }],
			});
			return server;
		}

		it("waits for the server's pending request instead of fetching, and takes its newer data", async () => {
			const test = setup(0);
			const server = hydratePending(test);
			expect(test.backend.requests).toHaveLength(0);

			server.resolve({
				data: { id: 1, title: "Server" },
				updatedAt: test.updatedAt + 1,
			});

			await vi.waitFor(() =>
				expect(
					test.browser.getData(test.backend.issueQuery, { id: 1 })?.title,
				).toBe("Server"),
			);
			expect(test.backend.requests).toHaveLength(0);
		});

		it("revalidates when stale and the server's pending request is no newer", async () => {
			const test = setup(0);
			const server = hydratePending(test);

			server.resolve({
				data: { id: 1, title: "Replayed" },
				updatedAt: test.updatedAt,
			});

			await vi.waitFor(() =>
				expect(test.backend.requests.map((request) => request.id)).toEqual([1]),
			);
			expect(
				test.browser.getData(test.backend.issueQuery, { id: 1 })?.title,
			).toBe("Kept");
		});

		it("revalidates when stale and the server's pending request failed", async () => {
			const test = setup(0);
			const server = hydratePending(test);

			server.reject(new Error('Query ["issue",1] failed'));

			await vi.waitFor(() =>
				expect(test.backend.requests.map((request) => request.id)).toEqual([1]),
			);
		});

		it("is reused while fresh", () => {
			const test = setup(60_000);

			hydrate(test.browser, {
				queries: [
					{
						data: { id: 1, title: "Replayed" },
						key: ["issue", 1],
						updatedAt: test.updatedAt,
					},
					{ key: ["issue", 1], promise: new Promise(() => {}), updatedAt: 0 },
				],
			});

			expect(test.backend.requests).toHaveLength(0);
			expect(
				test.browser.getData(test.backend.issueQuery, { id: 1 })?.title,
			).toBe("Kept");
		});
	});

	it("round-trips data through serializeData and deserializeData", async () => {
		const server = new QueryClient({ isServer: true });
		const browser = new QueryClient({ isServer: false });
		function dateQuery() {
			return queryOptions({
				queryFn: () => new Date(0),
				queryKey: ["date"],
			});
		}
		await server.fetch(dateQuery);

		const state = dehydrate(server, { serializeData: JSON.stringify });
		hydrate(browser, state, {
			deserializeData: (data) => new Date(JSON.parse(String(data))),
		});

		expect(state.queries[0]?.data).toBe('"1970-01-01T00:00:00.000Z"');
		expect(browser.getData(dateQuery)?.getTime()).toBe(0);
	});
});
