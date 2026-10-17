import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { Context, Effect, Layer } from "effect";
import type { ComponentProps } from "react";

import {
	allKeyed,
	type DataOf,
	dehydrate,
	type ErrorOf,
	HydrationBoundary,
	type InfiniteData,
	infiniteQueryOptions,
	QueryClient,
	QueryClientProvider,
	type QueryHandle,
	type QueryHandleWithData,
	type QueryKey,
	type QueryOptions,
	queryOptions,
	type ServicesOf,
	type ThrowOnErrorOf,
	useQuery,
	useWaterfall,
} from "./index.ts";

describe("allKeyed", () => {
	it("awaits a record of promises, keeping keys", async () => {
		const result = await allKeyed({
			one: Promise.resolve(1),
			two: "two",
		});

		expect(result).toEqual({ one: 1, two: "two" });
		expectTypeOf(result).toEqualTypeOf<{ one: number; two: string }>();
	});

	it("rejects on the first failure", async () => {
		await expect(
			allKeyed({ bad: Promise.reject(new Error("no")), good: 1 }),
		).rejects.toThrow("no");
	});
});

function postQuery(input: { slug: string }) {
	return queryOptions({
		queryFn: () => ({ slug: input.slug, title: "Hello" }),
		queryKey: ["post", input.slug],
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

class Api extends Context.Service<
	Api,
	{ readonly user: (id: number) => Effect.Effect<string> }
>()("test/Api") {}

class Other extends Context.Service<Other, string>()("test/Other") {}

class NotFound {
	readonly _tag = "NotFound";
}

function readUser(id: number) {
	return Effect.gen(function* () {
		const api = yield* Api;
		if (id < 0) {
			return yield* Effect.fail(new NotFound());
		}
		return yield* api.user(id);
	});
}

function userQuery(input: { id: number }) {
	return queryOptions({
		queryFn: () => readUser(input.id),
		queryKey: ["user", input.id],
	});
}

function otherQuery() {
	return queryOptions({
		queryFn: () => Effect.service(Other),
		queryKey: ["other"],
	});
}

const apiLayer = Layer.succeed(Api, { user: (id) => Effect.succeed(`#${id}`) });

describe("types", () => {
	it("flow from the factory to every Promise verb", () => {
		const qc = new QueryClient({ isServer: true });

		expectTypeOf(qc.prefetch(postQuery, { slug: "a" })).toEqualTypeOf<
			QueryHandle<typeof postQuery>
		>();
		expectTypeOf(qc.prefetch(postQuery, { slug: "a" }).input).toEqualTypeOf<{
			slug: string;
		}>();
		expectTypeOf(qc.fetch(postQuery, { slug: "a" })).resolves.toEqualTypeOf<
			QueryHandleWithData<typeof postQuery>
		>();
		expectTypeOf(qc.ensure(postQuery, { slug: "a" })).resolves.toEqualTypeOf<
			QueryHandleWithData<typeof postQuery>
		>();
		expectTypeOf<
			QueryHandleWithData<typeof postQuery>["data"]
		>().toEqualTypeOf<{
			slug: string;
			title: string;
		}>();
		expectTypeOf<DataOf<typeof commentsQuery>>().toEqualTypeOf<
			InfiniteData<{ page: { next: number | null }; pageParam: number }>
		>();
		expectTypeOf(qc.prefetch(meQuery).input).toEqualTypeOf<undefined>();
	});

	it("reject wrong inputs and paging options on plain factories", () => {
		const qc = new QueryClient({ isServer: true });
		const typeOnly = () => {
			// @ts-expect-error the input is required
			qc.prefetch(postQuery);
			// @ts-expect-error wrong input shape
			qc.prefetch(postQuery, { id: 1 });
			// @ts-expect-error `pages` is only for paged factories
			void qc.ensure(postQuery, { slug: "a" }, { pages: 2 });
			void qc.ensure(commentsQuery, { slug: "a" }, { pages: 2 });
			// @ts-expect-error wrong input shape
			void qc.invalidate(postQuery, { id: 1 });
			void qc.invalidate({ queryKey: ["post"] });
			// @ts-expect-error factories take at most one argument
			qc.prefetch((a: string, b: string) => postQuery({ slug: a + b }), "a");
		};
		expect(typeOnly).toBeTypeOf("function");
	});

	it("keep handles of factories with the same signature apart", () => {
		function draftQuery(input: { slug: string }) {
			return queryOptions({
				queryFn: () => ({ slug: input.slug, title: "Draft" }),
				queryKey: ["draft", input.slug],
			});
		}
		function draftCommentsQuery(input: { slug: string }) {
			return infiniteQueryOptions({
				getNextPageParam: (lastPage: { next: number | null }) => lastPage.next,
				initialPageParam: 0,
				queryFn: (context) => ({ next: context.pageParam + 1 }),
				queryKey: ["draft-comments", input.slug],
			});
		}
		const qc = new QueryClient({ isServer: true });
		const post = qc.prefetch(postQuery, { slug: "a" });
		const comments = qc.prefetch(commentsQuery, { slug: "a" });
		expectTypeOf(post).not.toExtend<QueryHandle<typeof draftQuery>>();
		expectTypeOf(comments).not.toExtend<
			QueryHandle<typeof draftCommentsQuery>
		>();
		expectTypeOf(post).toExtend<QueryHandle>();

		function useTypeOnly() {
			// @ts-expect-error the handle is `postQuery`'s
			useQuery(draftQuery, post);
			// @ts-expect-error the handle is `commentsQuery`'s
			useQuery(draftCommentsQuery, comments);
			useQuery(postQuery, post);
		}
		expect(useTypeOnly).toBeTypeOf("function");
	});

	it("infer a queryFn Effect's services and error", () => {
		expectTypeOf(userQuery({ id: 1 })).toEqualTypeOf<
			QueryOptions<{
				data: string;
				error: NotFound;
				key: readonly ["user", number];
				services: Api;
			}>
		>();
		expectTypeOf(otherQuery()).toEqualTypeOf<
			QueryOptions<{
				data: string;
				error: never;
				key: readonly ["other"];
				services: Other;
			}>
		>();
		expectTypeOf(postQuery({ slug: "a" })).toEqualTypeOf<
			QueryOptions<{
				data: { slug: string; title: string };
				key: readonly ["post", string];
			}>
		>();
		expectTypeOf<ServicesOf<typeof userQuery>>().toEqualTypeOf<Api>();
		expectTypeOf<ErrorOf<typeof userQuery>>().toEqualTypeOf<NotFound>();
		expectTypeOf<DataOf<typeof userQuery>>().toEqualTypeOf<string>();
		expectTypeOf<ServicesOf<typeof postQuery>>().toEqualTypeOf<never>();
	});

	it("keep a literal throwOnError in the bag", () => {
		function throwingUserQuery(input: { id: number }) {
			return queryOptions({
				queryFn: () => readUser(input.id),
				queryKey: ["throwing-user", input.id],
				throwOnError: true,
			});
		}
		expectTypeOf(throwingUserQuery({ id: 1 })).toEqualTypeOf<
			QueryOptions<{
				data: string;
				error: NotFound;
				key: readonly ["throwing-user", number];
				services: Api;
				throwOnError: true;
			}>
		>();
		expectTypeOf<
			ThrowOnErrorOf<typeof throwingUserQuery>
		>().toEqualTypeOf<true>();
		expectTypeOf<ThrowOnErrorOf<typeof userQuery>>().toEqualTypeOf<undefined>();
	});

	it("take throwOnError in a factory type declared by hand", () => {
		type UserFactory = (input: { id: number }) => QueryOptions<{
			data: string;
			error: NotFound;
			services: Api;
			throwOnError: true;
		}>;
		const declaredUserQuery: UserFactory = (input) =>
			queryOptions<string, NotFound, Api, QueryKey, true>({
				queryFn: () => readUser(input.id),
				queryKey: ["declared-user", input.id],
				throwOnError: true,
			});
		const useTypes = (handle: QueryHandle<UserFactory>) => {
			const [userPromise] = useQuery(declaredUserQuery, handle);
			expectTypeOf(userPromise).resolves.toEqualTypeOf<string>();
		};
		expect(useTypes).toBeTypeOf("function");
	});

	it("take only factories whose services the client's layer provides", () => {
		const qc = new QueryClient({ isServer: true, layer: apiLayer });
		const plain = new QueryClient({ isServer: true });
		expectTypeOf(qc).toEqualTypeOf<QueryClient<Api>>();
		const typeOnly = () => {
			void qc.fetch(userQuery, { id: 1 });
			qc.prefetch(postQuery, { slug: "a" });
			// @ts-expect-error `Other` isn't in the client's layer
			void qc.ensure(otherQuery);
			// @ts-expect-error the client has no layer
			void plain.fetch(userQuery, { id: 1 });
			// @ts-expect-error the client has no layer
			plain.prefetch(userQuery, { id: 1 });
			// @ts-expect-error the client has no layer
			void plain.invalidate(userQuery, { id: 1 });
		};
		expect(typeOnly).toBeTypeOf("function");
	});

	it("infer generic factory makers passed inline", async () => {
		/** A typed endpoint name, as a generated API client would export. */
		interface Endpoint<TArgs, TData> {
			readonly args?: TArgs;
			readonly data?: TData;
			readonly name: string;
		}
		function endpointQuery<TArgs, TData>(endpoint: Endpoint<TArgs, TData>) {
			return (args: TArgs) =>
				queryOptions({
					queryFn: (): TData => {
						throw new Error(`${endpoint.name} isn't implemented`);
					},
					queryKey: [endpoint.name, args],
				});
		}
		function endpointPagesQuery<TArgs, TPage>(
			endpoint: Endpoint<TArgs, TPage>,
		) {
			return (args: TArgs) =>
				infiniteQueryOptions({
					getNextPageParam: () => null,
					initialPageParam: 0,
					queryFn: (): TPage => {
						throw new Error(`${endpoint.name} isn't implemented`);
					},
					queryKey: [endpoint.name, args],
				});
		}
		function apiQuery<TArgs>(name: string, _args?: TArgs) {
			return (args: TArgs) =>
				queryOptions({
					queryFn: () =>
						Effect.gen(function* () {
							const api = yield* Api;
							return yield* api.user(1);
						}),
					queryKey: [name, args],
				});
		}
		const getPost: Endpoint<{ slug: string }, { title: string }> = {
			name: "posts.get",
		};
		const listPosts: Endpoint<{ tag: string }, { items: Array<string> }> = {
			name: "posts.list",
		};
		const qc = new QueryClient({ isServer: true });
		qc.setData(endpointQuery(getPost), { slug: "a" }, { title: "Hello" });

		const handle = await qc.ensure(endpointQuery(getPost), { slug: "a" });
		expectTypeOf(handle.input).toEqualTypeOf<{ slug: string }>();
		expectTypeOf(handle.data).toEqualTypeOf<{ title: string }>();
		expectTypeOf(
			qc.getData(endpointQuery(getPost), { slug: "a" }),
		).toEqualTypeOf<{ title: string } | undefined>();
		expectTypeOf(
			qc.prefetch(endpointPagesQuery(listPosts), { tag: "news" }).input,
		).toEqualTypeOf<{ tag: string }>();
		expectTypeOf<
			DataOf<ReturnType<typeof endpointPagesQuery<{ tag: string }, number>>>
		>().toEqualTypeOf<InfiniteData<{ page: number; pageParam: number }>>();
		const withApi = new QueryClient({ isServer: true, layer: apiLayer });
		expectTypeOf(withApi.fetch(apiQuery<{ id: number }>("user"), { id: 1 }))
			.resolves.toHaveProperty("data")
			.toEqualTypeOf<string>();

		function useTypeOnly() {
			void qc.invalidate(endpointQuery(getPost), { slug: "a" });
			const [post] = useQuery(endpointQuery(getPost), handle);
			expectTypeOf(post).toEqualTypeOf<{ title: string }>();
			const pages = useWaterfall(endpointPagesQuery(listPosts), { tag: "a" });
			expectTypeOf(
				useQuery(endpointPagesQuery(listPosts), pages)[1],
			).toHaveProperty("fetchNextPage");
			expectTypeOf(
				qc.ensure(endpointPagesQuery(listPosts), { tag: "a" }, { pages: 2 }),
			).resolves.toHaveProperty("input");
			expectTypeOf(
				qc.fetch(endpointPagesQuery(listPosts), { tag: "a" }, { pages: 2 }),
			)
				.resolves.toHaveProperty("data")
				.toEqualTypeOf<
					InfiniteData<{ page: { items: Array<string> }; pageParam: number }>
				>();
			// @ts-expect-error the input is the endpoint's args
			void qc.ensure(endpointQuery(getPost), { tag: "a" });
			void qc.ensure(
				endpointPagesQuery(listPosts),
				// @ts-expect-error the input is the endpoint's args
				{ slug: "a" },
				{ pages: 2 },
			);
			// @ts-expect-error `pages` is only for paged factories
			void qc.ensure(endpointQuery(getPost), { slug: "a" }, { pages: 2 });
			// @ts-expect-error the client has no layer
			void qc.fetch(apiQuery<{ id: number }>("user"), { id: 1 });
		}
		expect(useTypeOnly).toBeTypeOf("function");
	});

	it("accept a client of any services where any client goes", () => {
		const qc = new QueryClient({ isServer: true, layer: apiLayer });
		expectTypeOf(qc).toExtend<
			ComponentProps<typeof QueryClientProvider>["client"]
		>();
		expectTypeOf(qc).toExtend<Parameters<typeof dehydrate>[0]>();
	});
});

describe("HydrationBoundary", () => {
	it("takes a client or a dehydrated state, not both", () => {
		type Props = ComponentProps<typeof HydrationBoundary>;
		const qc = new QueryClient({ isServer: true });
		expectTypeOf({ client: qc }).toExtend<Props>();
		expectTypeOf({ state: dehydrate(qc) }).toExtend<Props>();
		expectTypeOf({ client: qc, state: dehydrate(qc) }).not.toExtend<Props>();
		expectTypeOf({}).not.toExtend<Props>();
		expectTypeOf({
			client: qc,
			options: { keepErrors: true },
		}).toExtend<Props>();
		expectTypeOf({
			options: { keepErrors: true },
			state: dehydrate(qc),
		}).not.toExtend<Props>();
	});
});
