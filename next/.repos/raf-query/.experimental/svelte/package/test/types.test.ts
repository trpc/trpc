import { describe, expectTypeOf, it } from "vite-plus/test";
import { Data, Effect, type Result } from "effect";

import {
	infiniteQueryOptions,
	type InfiniteData,
	type QueryHandle,
	type QueryHandleWithData,
	queryOptions,
	useIsFetching,
	useQuery,
	useWaterfall,
} from "../src/index.ts";

function postQuery(input: { slug: string }) {
	return queryOptions({
		queryFn: () => Promise.resolve({ title: input.slug }),
		queryKey: ["post", input.slug],
	});
}

class NotFound extends Data.TaggedError("NotFound") {}

function effectPostQuery(input: { slug: string }) {
	return queryOptions({
		queryFn: () =>
			input.slug
				? Effect.succeed({ title: input.slug })
				: Effect.fail(new NotFound()),
		queryKey: ["effect-post", input.slug],
	});
}

function commentsQuery(input: { slug: string }) {
	return infiniteQueryOptions({
		getNextPageParam: (lastPage: { next: number | null }) => lastPage.next,
		initialPageParam: 0,
		queryFn: () => Promise.resolve({ next: null }),
		queryKey: ["comments", input.slug],
	});
}

declare const post: QueryHandle<typeof postQuery>;
declare const loadedPost: QueryHandleWithData<typeof postQuery>;
declare const effectPost: QueryHandle<typeof effectPostQuery>;
declare const comments: QueryHandle<typeof commentsQuery>;

describe("useQuery types", () => {
	it("types data as possibly undefined for a prefetched handle", () => {
		const read = () => useQuery(postQuery, () => post);
		expectTypeOf<ReturnType<typeof read>["data"]>().toEqualTypeOf<
			{ title: string } | undefined
		>();
		expectTypeOf<ReturnType<typeof read>["promise"]>().toEqualTypeOf<
			Promise<{ title: string }>
		>();
	});

	it("types data as defined for a handle with data", () => {
		const read = () => useQuery(postQuery, () => loadedPost);
		expectTypeOf<ReturnType<typeof read>["data"]>().toEqualTypeOf<{
			title: string;
		}>();
	});

	it("takes the handle as a getter", () => {
		// @ts-expect-error -- 2769: a handle as is wouldn't follow new ones
		const read = () => useQuery(postQuery, post);
		expectTypeOf(read).toBeFunction();
	});

	it("types typed errors as a Result unless throwOnError is true", () => {
		const asResult = () => useQuery(effectPostQuery, () => effectPost);
		const throwing = () =>
			useQuery(
				effectPostQuery,
				() => effectPost,
				() => ({ throwOnError: true }),
			);
		expectTypeOf<ReturnType<typeof asResult>["data"]>().toEqualTypeOf<
			Result.Result<{ title: string }, NotFound> | undefined
		>();
		expectTypeOf<ReturnType<typeof throwing>["data"]>().toEqualTypeOf<
			{ title: string } | undefined
		>();
	});

	it("takes throwOnError only for typed errors", () => {
		const read = () =>
			// @ts-expect-error -- 2322: promise factories always throw
			useQuery(
				postQuery,
				() => post,
				() => ({ throwOnError: false }),
			);
		expectTypeOf(read).toBeFunction();
	});

	it("adds paging controls for paged factories only", () => {
		const paged = () => useQuery(commentsQuery, () => comments);
		const plain = () => useQuery(postQuery, () => post);
		expectTypeOf<ReturnType<typeof paged>["data"]>().toEqualTypeOf<
			| InfiniteData<{ page: { next: number | null }; pageParam: number }>
			| undefined
		>();
		expectTypeOf<ReturnType<typeof paged>>().toHaveProperty("fetchNextPage");
		expectTypeOf<ReturnType<typeof plain>>().not.toHaveProperty(
			"fetchNextPage",
		);
	});
});

describe("composable types", () => {
	it("returns a handle getter from useWaterfall", () => {
		const start = () => useWaterfall(postQuery, () => ({ slug: "a" }));
		expectTypeOf<ReturnType<typeof start>>().toEqualTypeOf<
			() => QueryHandle<typeof postQuery>
		>();
		// @ts-expect-error -- 2554: the factory needs an input
		const missing = () => useWaterfall(postQuery);
		expectTypeOf(missing).toBeFunction();
	});

	it("returns a readonly current count from useIsFetching", () => {
		const count = () => useIsFetching();
		expectTypeOf<ReturnType<typeof count>>().toEqualTypeOf<{
			readonly current: number;
		}>();
	});
});
