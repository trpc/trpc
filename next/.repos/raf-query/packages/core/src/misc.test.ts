import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { Data, Effect, type Option } from "effect";

import {
	type DataOf,
	type ErrorOf,
	hashKey,
	type InfiniteData,
	type InfiniteQueryOptions,
	infiniteQueryOptions,
	matchesKey,
	type PageOf,
	Query,
	type QueryFunctionContext,
	type QueryHandle,
	type QueryHandleWithData,
	type QueryMeta,
	type QueryOptions,
	queryOptions,
	type ServicesOf,
} from "./index.ts";
import { makeCacheUnsafe } from "./test-utils.ts";

describe("keys", () => {
	it("hash plain objects independent of key order", () => {
		expect(hashKey(["a", { x: 1, y: 2 }])).toBe(hashKey(["a", { x: 1, y: 2 }]));
		expect(hashKey(["a", 1])).not.toBe(hashKey(["a", "1"]));
	});

	it("match by prefix and by partial object segments", () => {
		const key = ["issues", { page: 2, status: "open" }, "x"];

		expect(matchesKey(key, ["issues"])).toBe(true);
		expect(matchesKey(key, ["issues", { status: "open" }])).toBe(true);
		expect(matchesKey(key, ["issues", { status: "closed" }])).toBe(false);
		expect(matchesKey(key, [...key, "more"])).toBe(false);
	});
});

class NotFound extends Data.TaggedError("NotFound")<{ readonly id: number }> {}

function postQuery(input: { slug: string }) {
	return queryOptions({
		queryFn: () => Promise.resolve({ slug: input.slug, title: "Hello" }),
		queryKey: ["post", input.slug],
	});
}

function issueQuery(input: { id: number }) {
	return queryOptions({
		queryFn: () =>
			input.id > 0
				? Effect.succeed({ id: input.id })
				: Effect.fail(new NotFound({ id: input.id })),
		queryKey: ["issue", input.id],
	});
}

function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		getNextPageParam: (lastPage: { next: number | null }) => lastPage.next,
		initialPageParam: 0,
		queryFn: (context) => ({ next: context.pageParam + 1 }),
		queryKey: ["comments", input.slug],
	});
}

function meQuery() {
	return queryOptions({ queryFn: () => "me", queryKey: ["me"] });
}

describe("types", () => {
	it("flow from the factory to every verb", () => {
		const cache = makeCacheUnsafe({ isServer: true });

		expectTypeOf(cache.prefetch(postQuery, { slug: "a" })).toEqualTypeOf<
			Effect.Effect<QueryHandle<typeof postQuery>>
		>();
		expectTypeOf(cache.fetch(postQuery, { slug: "a" })).toEqualTypeOf<
			Effect.Effect<QueryHandleWithData<typeof postQuery>, unknown>
		>();
		expectTypeOf<QueryHandleWithData<typeof postQuery>>().toExtend<
			QueryHandle<typeof postQuery>
		>();
		expectTypeOf<
			QueryHandleWithData<typeof postQuery>["data"]
		>().toEqualTypeOf<{
			slug: string;
			title: string;
		}>();
		expectTypeOf(cache.getData(postQuery, { slug: "a" })).toEqualTypeOf<
			Effect.Effect<Option.Option<{ slug: string; title: string }>>
		>();
		expectTypeOf<DataOf<typeof commentsQuery>>().toEqualTypeOf<
			InfiniteData<{ page: { next: number | null }; pageParam: number }>
		>();
		expectTypeOf(
			Effect.runSync(cache.prefetch(meQuery)).input,
		).toEqualTypeOf<undefined>();
	});

	it("keep an Effect queryFn's error type", () => {
		const cache = makeCacheUnsafe({ isServer: true });

		expectTypeOf<DataOf<typeof issueQuery>>().toEqualTypeOf<{ id: number }>();
		expectTypeOf<ErrorOf<typeof issueQuery>>().toEqualTypeOf<NotFound>();
		expectTypeOf<ErrorOf<typeof postQuery>>().toEqualTypeOf<unknown>();
		expectTypeOf(cache.fetch(issueQuery, { id: 1 })).toEqualTypeOf<
			Effect.Effect<
				QueryHandleWithData<typeof issueQuery>,
				NotFound | Query.CancelledError
			>
		>();
		expectTypeOf(
			Query.fetch(cache.getQueryUnsafe(issueQuery, { id: 1 })),
		).toEqualTypeOf<
			Effect.Effect<{ id: number }, NotFound | Query.CancelledError>
		>();
	});

	it("name options by a types bag, defaulting error, services and key", () => {
		interface Post {
			readonly slug: string;
			readonly title: string;
		}
		const promiseFactory = (): QueryOptions<{ data: Post }> =>
			queryOptions({
				queryFn: () => Promise.resolve({ slug: "a", title: "A" }),
				queryKey: ["post"],
			});
		expectTypeOf(postQuery({ slug: "a" })).toEqualTypeOf<
			QueryOptions<{
				data: { slug: string; title: string };
				key: readonly ["post", string];
			}>
		>();
		expectTypeOf(issueQuery({ id: 1 })).toEqualTypeOf<
			QueryOptions<{
				data: { id: number };
				error: NotFound;
				key: readonly ["issue", number];
			}>
		>();
		expectTypeOf(commentsQuery({ slug: "a" })).toEqualTypeOf<
			InfiniteQueryOptions<{
				key: readonly ["comments", string];
				page: { next: number | null };
				pageParam: number;
			}>
		>();
		expectTypeOf(
			queryOptions({
				queryFn: () => Effect.succeed("ok"),
				queryKey: ["ok"],
			}),
		).toEqualTypeOf<
			QueryOptions<{ data: string; error: never; key: readonly ["ok"] }>
		>();
		function failWith<E>(error: E) {
			return () =>
				queryOptions({
					queryFn: () => Effect.fail(error),
					queryKey: ["fail"],
				});
		}
		const notFoundQuery = failWith(new NotFound({ id: 1 }));
		expectTypeOf(notFoundQuery()).toEqualTypeOf<
			QueryOptions<{ data: never; error: NotFound; key: readonly ["fail"] }>
		>();
		expectTypeOf<ErrorOf<typeof notFoundQuery>>().toEqualTypeOf<NotFound>();
		const issuePagesQuery = (input: { id: number }) =>
			infiniteQueryOptions({
				getNextPageParam: () => null,
				initialPageParam: 0,
				queryFn: () =>
					input.id > 0
						? Effect.succeed({ id: input.id })
						: Effect.fail(new NotFound({ id: input.id })),
				queryKey: ["issue-pages", input.id],
			});
		expectTypeOf(issuePagesQuery({ id: 1 })).toEqualTypeOf<
			InfiniteQueryOptions<{
				error: NotFound;
				key: readonly ["issue-pages", number];
				page: { id: number };
				pageParam: number;
			}>
		>();
		const effectFactory = (): QueryOptions<{
			data: { id: number };
			error: NotFound;
		}> => issueQuery({ id: 1 });
		const pagedFactory = (): InfiniteQueryOptions<{
			page: { next: number | null };
			pageParam: number;
		}> => commentsQuery({ slug: "a" });

		expectTypeOf<DataOf<typeof promiseFactory>>().toEqualTypeOf<Post>();
		expectTypeOf<ErrorOf<typeof promiseFactory>>().toEqualTypeOf<unknown>();
		expectTypeOf<ServicesOf<typeof promiseFactory>>().toEqualTypeOf<never>();
		expectTypeOf<ErrorOf<typeof effectFactory>>().toEqualTypeOf<NotFound>();
		expectTypeOf<DataOf<typeof pagedFactory>>().toEqualTypeOf<
			InfiniteData<{ page: { next: number | null }; pageParam: number }>
		>();
		expectTypeOf<PageOf<typeof pagedFactory>>().toEqualTypeOf<{
			next: number | null;
		}>();
	});

	it("infer the page type for a getNextPageParam after queryFn", () => {
		const unsortedQuery = () =>
			infiniteQueryOptions({
				queryFn: (context) => Promise.resolve({ next: context.pageParam + 1 }),
				// After `queryFn`: its page type reaches `lastPage`.
				getNextPageParam: (lastPage) => lastPage.next,
				initialPageParam: 0,
				queryKey: ["unsorted"],
			});

		expectTypeOf<PageOf<typeof unsortedQuery>>().toEqualTypeOf<{
			next: number;
		}>();
	});

	it("type a query by its factory alone", () => {
		const cache = makeCacheUnsafe({ isServer: true });
		const query = cache.getQueryUnsafe(postQuery, { slug: "a" });

		expectTypeOf(query).toEqualTypeOf<Query.Query<typeof postQuery>>();
		expectTypeOf(Query.getUnsafe(query).data).toEqualTypeOf<
			{ slug: string; title: string } | undefined
		>();
		expectTypeOf(
			(erased: Query.Query) => Query.getUnsafe(erased).data,
		).returns.toEqualTypeOf<unknown>();
	});

	it("type meta as a string-keyed record unless Register declares queryMeta", () => {
		expectTypeOf<QueryMeta>().toEqualTypeOf<Record<string, unknown>>();
		expectTypeOf<QueryFunctionContext["meta"]>().toEqualTypeOf<
			QueryMeta | undefined
		>();
		expectTypeOf(Query.metaUnsafe).returns.toEqualTypeOf<
			QueryMeta | undefined
		>();
		queryOptions({
			// @ts-expect-error meta is an object, not a string
			meta: "label",
			queryFn: () => 1,
			queryKey: ["meta", "typed"],
		});
	});

	it("reject wrong inputs and paging options on plain factories", () => {
		const cache = makeCacheUnsafe({ isServer: true });
		const typeOnly = () => {
			// @ts-expect-error the input is required
			cache.prefetch(postQuery);
			// @ts-expect-error wrong input shape
			cache.prefetch(postQuery, { id: 1 });
			// @ts-expect-error `pages` is only for paged factories
			cache.ensure(postQuery, { slug: "a" }, { pages: 2 });
			cache.ensure(commentsQuery, { slug: "a" }, { pages: 2 });
			// @ts-expect-error wrong input shape
			cache.invalidate(postQuery, { id: 1 });
			cache.invalidate({ queryKey: ["post"] });
			// @ts-expect-error factories take at most one argument
			cache.prefetch((a: string, b: string) => postQuery({ slug: a + b }), "a");
		};
		expect(typeOnly).toBeTypeOf("function");
	});
});
