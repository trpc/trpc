import { describe, expect, it, vi } from "@effect/vitest";
import { Effect, Fiber, Stream } from "effect";

import { Query, QueryObserver } from "./index.ts";
import { createBackend, flush, makeCacheUnsafe } from "./test-utils.ts";

async function setup() {
	const backend = createBackend();
	const qc = makeCacheUnsafe({ isServer: false });
	Effect.runSync(qc.prefetch(backend.issueQuery, { id: 1 }));
	backend.respondAll();
	await flush();
	const query = qc.getQueryUnsafe(backend.issueQuery, { id: 1 });
	return { backend, qc, query };
}

function fakeTimers(): Disposable {
	vi.useFakeTimers();
	return {
		[Symbol.dispose]() {
			vi.useRealTimers();
		},
	};
}

describe("QueryObserver", () => {
	it("notifies on every result change while nothing is tracked", async () => {
		const test = await setup();
		const observer = QueryObserver.makeUnsafe(test.query);
		const listener = vi.fn();
		QueryObserver.subscribeUnsafe(observer, listener);

		Effect.runFork(Query.refetch(test.query));
		await flush();
		expect(listener).toHaveBeenCalledOnce();
		expect(QueryObserver.getUnsafe(observer).isFetching).toBe(true);
	});

	it("notifies only for tracked properties once one is read", async () => {
		const test = await setup();
		const observer = QueryObserver.makeUnsafe(test.query);
		const listener = vi.fn();
		QueryObserver.subscribeUnsafe(observer, listener);
		const result = QueryObserver.trackResult(
			observer,
			QueryObserver.getUnsafe(observer),
		);
		void result.promise;

		Effect.runFork(Query.refetch(test.query));
		await flush();
		expect(listener).not.toHaveBeenCalled();

		test.backend.issues.set(1, { id: 1, title: "Renamed" });
		test.backend.respondAll();
		await flush();
		expect(listener).toHaveBeenCalledOnce();

		void QueryObserver.trackResult(observer, QueryObserver.getUnsafe(observer))
			.isFetching;
		Effect.runFork(Query.refetch(test.query));
		await flush();
		expect(listener).toHaveBeenCalledTimes(2);
	});

	it("keeps the previous query's data with whilePending: previous", async () => {
		const test = await setup();
		const options = { whilePending: "previous" } as const;
		const observer = QueryObserver.makeUnsafe(test.query, options);
		QueryObserver.subscribeUnsafe(observer, () => {});
		const second = test.qc.getQueryUnsafe(test.backend.issueQuery, {
			id: 2,
		});
		Query.readUnsafe(second);

		QueryObserver.setOptionsUnsafe(observer, second, options);
		expect(QueryObserver.getUnsafe(observer)).toMatchObject({
			input: { id: 1 },
			isPending: true,
			isPrevious: true,
			key: ["issue", 1],
			promise: Query.getUnsafe(test.query).promise,
		});
		expect(Query.observerCountUnsafe(test.query)).toBe(0);
		expect(Query.observerCountUnsafe(second)).toBe(1);

		test.backend.respondAll();
		await flush();
		expect(QueryObserver.getUnsafe(observer)).toMatchObject({
			input: { id: 2 },
			isPrevious: false,
			promise: Query.getUnsafe(second).promise,
		});
	});

	it("refetches on refetchInterval while subscribed", async () => {
		const test = await setup();
		using _timers = fakeTimers();
		const observer = QueryObserver.makeUnsafe(test.query, {
			refetchInterval: 1000,
		});
		const unsubscribe = QueryObserver.subscribeUnsafe(observer, () => {});

		vi.advanceTimersByTime(1000);
		expect(test.backend.requests).toHaveLength(1);
		test.backend.respondAll();

		unsubscribe();
		expect(Query.observerCountUnsafe(test.query)).toBe(0);
		vi.advanceTimersByTime(5000);
		expect(test.backend.requests).toHaveLength(0);
	});

	it("restarts polling when refetchInterval changes", async () => {
		const test = await setup();
		using _timers = fakeTimers();
		const observer = QueryObserver.makeUnsafe(test.query, {
			refetchInterval: 1000,
		});
		QueryObserver.subscribeUnsafe(observer, () => {});

		QueryObserver.setOptionsUnsafe(observer, test.query, {
			refetchInterval: 3000,
		});
		vi.advanceTimersByTime(2000);
		expect(test.backend.requests).toHaveLength(0);
		vi.advanceTimersByTime(1000);
		expect(test.backend.requests).toHaveLength(1);
		test.backend.respondAll();

		QueryObserver.setOptionsUnsafe(observer, test.query, {});
		vi.advanceTimersByTime(10_000);
		expect(test.backend.requests).toHaveLength(0);
	});

	it("stops polling when its query leaves the cache", async () => {
		const test = await setup();
		using _timers = fakeTimers();
		const observer = QueryObserver.makeUnsafe(test.query, {
			refetchInterval: 1000,
		});
		QueryObserver.subscribeUnsafe(observer, () => {});

		Effect.runSync(test.qc.remove(test.backend.issueQuery, { id: 1 }));
		expect(Query.observerCountUnsafe(test.query)).toBe(0);
		vi.advanceTimersByTime(5000);
		expect(test.backend.requests).toHaveLength(0);
	});

	it.effect("changes streams the current result, then every change", () =>
		Effect.gen(function* () {
			const test = yield* Effect.promise(setup);
			const observer = yield* QueryObserver.make(test.query);
			const fiber = yield* Effect.forkChild(
				QueryObserver.changes(observer).pipe(
					Stream.map((result) => result.isFetching),
					Stream.take(3),
					Stream.runCollect,
				),
				{ startImmediately: true },
			);
			expect(Query.observerCountUnsafe(test.query)).toBe(1);

			yield* Effect.forkChild(Query.refetch(test.query), {
				startImmediately: true,
			});
			yield* Effect.promise(flush);
			test.backend.respondAll();

			expect(yield* Fiber.join(fiber)).toEqual([false, true, false]);
			expect(Query.observerCountUnsafe(test.query)).toBe(0);
		}),
	);
});
