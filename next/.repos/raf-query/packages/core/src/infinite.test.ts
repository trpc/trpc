import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { infiniteQueryOptions, QueryClient, Query } from "./index.ts";

interface Page {
	readonly items: ReadonlyArray<number>;
	readonly next: number | null;
	readonly previous: number | null;
}

/** Pages of 2 numbers out of 0..9, addressed by their first number. */
function numbersQuery(input: { maxPages?: number } = {}) {
	return infiniteQueryOptions({
		getNextPageParam: (lastPage: Page) => lastPage.next,
		getPreviousPageParam: (firstPage: Page) => firstPage.previous,
		initialPageParam: 4,
		maxPages: input.maxPages,
		queryFn: (context): Page => ({
			items: [context.pageParam, context.pageParam + 1],
			next: context.pageParam + 2 < 10 ? context.pageParam + 2 : null,
			previous: context.pageParam > 0 ? context.pageParam - 2 : null,
		}),
		queryKey: ["numbers", input.maxPages ?? null],
	});
}

function itemsOf(data: { readonly pages: ReadonlyArray<Page> } | undefined) {
	return data?.pages.flatMap((page) => page.items);
}

/** {@link numbersQuery}, whose pages load only once the test releases them. */
function heldNumbers() {
	const held = new Map<number, PromiseWithResolvers<void>>();
	function query() {
		return infiniteQueryOptions({
			getNextPageParam: (lastPage: Page) => lastPage.next,
			getPreviousPageParam: (firstPage: Page) => firstPage.previous,
			initialPageParam: 4,
			queryFn: async (context): Promise<Page> => {
				await held.get(context.pageParam)?.promise;
				return {
					items: [context.pageParam, context.pageParam + 1],
					next: context.pageParam + 2 < 10 ? context.pageParam + 2 : null,
					previous: context.pageParam > 0 ? context.pageParam - 2 : null,
				};
			},
			queryKey: ["held-numbers"],
		});
	}
	return {
		/** Hold the page at `pageParam`; returns its release. */
		hold(pageParam: number) {
			const gate = Promise.withResolvers<void>();
			held.set(pageParam, gate);
			return () => gate.resolve();
		},
		query,
	};
}

describe("paged queries", () => {
	it("load the first page, or `pages` pages up front", async () => {
		const qc = new QueryClient({ isServer: true });

		const one = await qc.fetch(numbersQuery, {});
		expect(one.data.pageParams).toEqual([4]);

		const fresh = new QueryClient({ isServer: true });
		const three = await fresh.fetch(numbersQuery, {}, { pages: 3 });
		expect(itemsOf(three.data)).toEqual([4, 5, 6, 7, 8, 9]);
	});

	it("stop loading up front at the last page", async () => {
		const qc = new QueryClient({ isServer: true });

		const ten = await qc.fetch(numbersQuery, {}, { pages: 10 });

		expect(ten.data.pageParams).toEqual([4, 6, 8]);
	});

	it("page forward and backward until the ends", async () => {
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(numbersQuery, {});
		await Effect.runPromise(Query.fetch(query));

		await Effect.runPromise(Query.fetchNextPage(query));
		expect(itemsOf(Query.getUnsafe(query).data)).toEqual([4, 5, 6, 7]);
		await Effect.runPromise(Query.fetchPreviousPage(query));
		await Effect.runPromise(Query.fetchPreviousPage(query));
		expect(itemsOf(Query.getUnsafe(query).data)).toEqual([
			0, 1, 2, 3, 4, 5, 6, 7,
		]);

		expect(Query.hasPreviousPageUnsafe(query)).toBe(false);
		expect(Query.hasNextPageUnsafe(query)).toBe(true);
		await Effect.runPromise(Query.fetchNextPage(query));
		expect(Query.hasNextPageUnsafe(query)).toBe(false);
		await Effect.runPromise(Query.fetchNextPage(query));
		expect(Query.getUnsafe(query).data?.pages).toHaveLength(5);
	});

	it("set fetchDirection while a page loads", async () => {
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(numbersQuery, {});
		await Effect.runPromise(Query.fetch(query));

		const next = Effect.runPromise(Query.fetchNextPage(query));
		expect(Query.getUnsafe(query).fetchDirection).toBe("forward");
		await next;
		expect(Query.getUnsafe(query).fetchDirection).toBeUndefined();
	});

	it("queue a page request behind the one in flight", async () => {
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(numbersQuery, {});

		const first = Effect.runPromise(Query.fetch(query));
		const next = Effect.runPromise(Query.fetchNextPage(query));
		await first;
		await next;

		expect(Query.getUnsafe(query).data?.pageParams).toEqual([4, 6]);
	});

	it("drop pages at the far end past maxPages", async () => {
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(numbersQuery, { maxPages: 2 });
		await Effect.runPromise(Query.fetch(query));

		await Effect.runPromise(Query.fetchNextPage(query));
		await Effect.runPromise(Query.fetchNextPage(query));
		expect(Query.getUnsafe(query).data?.pageParams).toEqual([6, 8]);

		await Effect.runPromise(Query.fetchPreviousPage(query));
		expect(Query.getUnsafe(query).data?.pageParams).toEqual([4, 6]);
	});

	it("refetch every loaded page from the first param", async () => {
		const qc = new QueryClient({ isServer: false });
		const query = qc.getQuery(numbersQuery, {});
		await Effect.runPromise(Query.fetch(query));
		await Effect.runPromise(Query.fetchNextPage(query));
		await Effect.runPromise(Query.fetchPreviousPage(query));

		await Effect.runPromise(Query.refetch(query));

		expect(Query.getUnsafe(query).data?.pageParams).toEqual([2, 4, 6]);
	});

	it("add a page to data written while it loaded", async () => {
		const numbers = heldNumbers();
		const qc = new QueryClient({ isServer: false });
		await qc.fetch(numbers.query);
		const edited = (previous: Page | undefined): Page => ({
			items: [40, 50],
			next: previous?.next ?? null,
			previous: previous?.previous ?? null,
		});

		const releaseNext = numbers.hold(6);
		const next = qc.getQuery(numbers.query);
		const nextPage = Effect.runPromise(Query.fetchNextPage(next));
		qc.setData(numbers.query, undefined, (data) => ({
			pageParams: data?.pageParams ?? [],
			pages: (data?.pages ?? []).with(0, edited(data?.pages[0])),
		}));
		releaseNext();
		await nextPage;
		expect(itemsOf(qc.getData(numbers.query))).toEqual([40, 50, 6, 7]);

		const releasePrevious = numbers.hold(2);
		const previousPage = Effect.runPromise(Query.fetchPreviousPage(next));
		qc.setData(numbers.query, undefined, (data) => ({
			pageParams: data?.pageParams ?? [],
			pages: (data?.pages ?? []).with(1, edited(data?.pages[1])),
		}));
		releasePrevious();
		await previousPage;
		expect(itemsOf(qc.getData(numbers.query))).toEqual([2, 3, 40, 50, 40, 50]);
	});

	it("keep a page written during a refetch, after the refetch read it", async () => {
		const numbers = heldNumbers();
		const qc = new QueryClient({ isServer: false });
		await qc.fetch(numbers.query, undefined, { pages: 2 });

		const release = numbers.hold(6);
		const refetch = Effect.runPromise(
			Query.refetch(qc.getQuery(numbers.query)),
		);
		qc.setData(numbers.query, undefined, (data) => ({
			pageParams: data?.pageParams ?? [],
			pages: (data?.pages ?? []).with(0, {
				items: [40, 50],
				next: 6,
				previous: 2,
			}),
		}));
		release();
		await refetch;

		expect(itemsOf(qc.getData(numbers.query))).toEqual([40, 50, 6, 7]);
	});

	it("replace a page written during a refetch before the refetch read it", async () => {
		const numbers = heldNumbers();
		const qc = new QueryClient({ isServer: false });
		await qc.fetch(numbers.query, undefined, { pages: 2 });

		const release = numbers.hold(4);
		const refetch = Effect.runPromise(
			Query.refetch(qc.getQuery(numbers.query)),
		);
		qc.setData(numbers.query, undefined, (data) => ({
			pageParams: data?.pageParams ?? [],
			pages: (data?.pages ?? []).with(1, {
				items: [60, 70],
				next: 8,
				previous: 4,
			}),
		}));
		release();
		await refetch;

		expect(itemsOf(qc.getData(numbers.query))).toEqual([4, 5, 6, 7]);
	});

	it("drop a loaded page when data written meanwhile ends elsewhere", async () => {
		const numbers = heldNumbers();
		const qc = new QueryClient({ isServer: false });
		await qc.fetch(numbers.query, undefined, { pages: 2 });

		const release = numbers.hold(8);
		const nextPage = Effect.runPromise(
			Query.fetchNextPage(qc.getQuery(numbers.query)),
		);
		qc.setData(numbers.query, undefined, (data) => ({
			pageParams: data?.pageParams.slice(0, 1) ?? [],
			pages: data?.pages.slice(0, 1) ?? [],
		}));
		release();
		await nextPage;

		expect(qc.getData(numbers.query)?.pageParams).toEqual([4]);
		expect(Query.getUnsafe(qc.getQuery(numbers.query)).isFetching).toBe(false);
	});
});
