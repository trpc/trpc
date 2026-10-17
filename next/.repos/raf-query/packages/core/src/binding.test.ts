import { describe, expect, it } from "@effect/vitest";
import { Data, Effect, Layer, Result } from "effect";

import {
	QueryBinding,
	QueryClient,
	type QueryFactory,
	type QueryHandle,
	type QueryHandleWithData,
	queryOptions,
	type UseQueryOptions,
} from "./index.ts";
import { createBackend, flush } from "./test-utils.ts";

/** A framework stand-in: a version that reads track and changes bump. */
function bind<TFactory extends QueryFactory>(
	client: QueryClient<unknown>,
	factory: TFactory,
	initial: QueryHandle<TFactory>,
	initialOptions: UseQueryOptions & { readonly throwOnError?: boolean } = {},
) {
	const state = {
		handle: initial,
		options: initialOptions,
		reads: 0,
		version: 0,
	};
	const untracked: Array<string> = [];
	const binding = QueryBinding.makeUnsafe(
		client,
		factory,
		{ handle: () => state.handle, options: () => state.options },
		{
			notify: () => {
				state.version += 1;
			},
			track: () => {
				state.reads += 1;
			},
			untracked: (f) => {
				untracked.push("write");
				return f();
			},
		},
	);
	return { binding, state, untracked };
}

describe("QueryBinding", () => {
	it("reads the query on creation, and has its data once it settles", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle = client.getQuery(backend.issueQuery, { id: 1 }).handle;
		const bound = bind(client, backend.issueQuery, handle);
		using _subscription = {
			[Symbol.dispose]: QueryBinding.subscribeUnsafe(bound.binding),
		};

		expect(backend.requests).toHaveLength(1);
		expect(bound.binding.result.isPending).toBe(true);
		expect(bound.binding.result.data).toBeUndefined();
		const before = bound.state.version;
		backend.respondAll();
		await flush();

		expect(bound.state.version).toBeGreaterThan(before);
		expect(bound.binding.result.data).toEqual({ id: 1, title: "First" });
		expect(bound.state.reads).toBeGreaterThan(0);
	});

	it("announces a read pending promise settling, without a subscription", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle = client.prefetch(backend.issueQuery, { id: 1 });
		const bound = bind(client, backend.issueQuery, handle);

		void bound.binding.result.promise;
		backend.respondAll();
		await flush();

		expect(bound.state.version).toBe(1);
		await expect(bound.binding.result.promise).resolves.toEqual({
			id: 1,
			title: "First",
		});
	});

	it("follows a new handle on the next read, writing outside tracking", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		client.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "One" });
		client.setData(backend.issueQuery, { id: 2 }, { id: 2, title: "Two" });
		const bound = bind(
			client,
			backend.issueQuery,
			client.getQuery(backend.issueQuery, { id: 1 }).handle,
		);
		expect(bound.binding.result.data?.title).toBe("One");
		const writes = bound.untracked.length;

		bound.state.handle = client.getQuery(backend.issueQuery, { id: 2 }).handle;

		expect(bound.binding.result.data?.title).toBe("Two");
		expect(bound.binding.result.input).toEqual({ id: 2 });
		expect(bound.untracked.length).toBe(writes + 1);
		void bound.binding.result.hash;
		expect(bound.untracked.length).toBe(writes + 1);
		expect(backend.requests).toHaveLength(0);
	});

	it("keeps its query for an equal handle, and takes the new handle's data", () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle = client.getQuery(backend.issueQuery, { id: 1 }).handle;
		const bound = bind(client, backend.issueQuery, handle);
		const query = bound.binding.observer.query;
		const writes = bound.untracked.length;

		const sent: QueryHandleWithData<typeof backend.issueQuery> = {
			...handle,
			data: { id: 1, title: "Sent" },
		};
		bound.state.handle = sent;

		expect(bound.binding.result.data).toEqual({ id: 1, title: "Sent" });
		expect(bound.binding.observer.query).toBe(query);
		expect(bound.untracked.length).toBe(writes);
	});

	it("updates the observer only when an observer option changed", () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const bound = bind(
			client,
			backend.issueQuery,
			client.prefetch(backend.issueQuery, { id: 1 }),
			{ refetchInterval: 1000 },
		);
		const writes = bound.untracked.length;

		bound.state.options = { refetchInterval: 1000 };
		QueryBinding.syncUnsafe(bound.binding);
		expect(bound.untracked.length).toBe(writes);

		bound.state.options = { refetchInterval: 2000 };
		QueryBinding.syncUnsafe(bound.binding);
		expect(bound.untracked.length).toBe(writes + 1);
		expect(bound.binding.observer.options.refetchInterval).toBe(2000);
	});

	it("shows a handle's data while its entry has none", () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		const handle = {
			...client.getQuery(backend.issueQuery, { id: 1 }).handle,
			data: { id: 1, title: "From the server" },
		};
		const bound = bind(client, backend.issueQuery, handle);

		expect(bound.binding.result.isPending).toBe(true);
		expect(bound.binding.result.data).toEqual({
			id: 1,
			title: "From the server",
		});
	});

	it("derives server reads from the cache, without a subscription", () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: true });
		const handle = client.getQuery(backend.issueQuery, { id: 1 }).handle;
		const bound = bind(client, backend.issueQuery, handle);
		expect(bound.binding.result.data).toBeUndefined();

		client.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "Later" });

		expect(bound.binding.result.data).toEqual({ id: 1, title: "Later" });
	});

	it("wraps typed errors in a Result unless throwOnError", async () => {
		class NotFound extends Data.TaggedError("NotFound")<{
			readonly id: number;
		}> {}
		const missing = (input: { id: number }) =>
			queryOptions({
				queryFn: () => Effect.fail(new NotFound({ id: input.id })),
				queryKey: ["missing", input.id],
				retry: false,
			});
		const client = new QueryClient({ layer: Layer.empty });
		const handle = client.getQuery(missing, { id: 1 }).handle;
		const asResult = bind(client, missing, handle);
		const throwing = bind(client, missing, handle, { throwOnError: true });
		void asResult.binding.result.promise;
		await flush();

		const settled = await asResult.binding.result.promise;
		expect(Result.isFailure(settled)).toBe(true);
		await expect(throwing.binding.result.promise).rejects.toBeInstanceOf(
			NotFound,
		);
	});

	it("takes throwOnError from the query's options, unless the read sets it", async () => {
		class NotFound extends Data.TaggedError("NotFound")<{
			readonly id: number;
		}> {}
		const missing = (input: { id: number }) =>
			queryOptions({
				queryFn: () => Effect.fail(new NotFound({ id: input.id })),
				queryKey: ["missing", input.id],
				retry: false,
				throwOnError: true,
			});
		const client = new QueryClient({ layer: Layer.empty });
		const handle = client.getQuery(missing, { id: 1 }).handle;
		const throwing = bind(client, missing, handle);
		const asResult = bind(client, missing, handle, { throwOnError: false });
		void asResult.binding.result.promise;
		await flush();

		await expect(throwing.binding.result.promise).rejects.toBeInstanceOf(
			NotFound,
		);
		const settled = await asResult.binding.result.promise;
		expect(Result.isFailure(settled)).toBe(true);
	});

	it("reads a promise queryFn as plain data on a client with a layer", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false, layer: Layer.empty });
		const handle = client.prefetch(backend.issueQuery, { id: 1 });
		const bound = bind(client, backend.issueQuery, handle);
		backend.respondAll();
		await flush();

		expect(bound.binding.result.data).toEqual({ id: 1, title: "First" });
		await expect(bound.binding.result.promise).resolves.toEqual({
			id: 1,
			title: "First",
		});
	});

	it("runs the observer's commands as promises", async () => {
		const backend = createBackend();
		const client = new QueryClient({ isServer: false });
		client.setData(backend.issueQuery, { id: 1 }, { id: 1, title: "Old" });
		const bound = bind(
			client,
			backend.issueQuery,
			client.getQuery(backend.issueQuery, { id: 1 }).handle,
		);
		using _subscription = {
			[Symbol.dispose]: QueryBinding.subscribeUnsafe(bound.binding),
		};

		const refetched = bound.binding.result.refetch();
		await flush();
		expect(bound.binding.result.isFetching).toBe(true);
		backend.respondAll();
		await refetched;

		expect(bound.binding.result.data).toEqual({ id: 1, title: "First" });
	});
});
