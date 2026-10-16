import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
	ensure,
	ensureData,
	getData,
	infiniteQueryOptions,
	invalidate,
	prefetch,
	QueryCache,
	QueryClient,
	queryOptions,
	setData,
} from "./index.ts";
import { createBackend, type Issue } from "./test-utils.tsx";

describe("prefetch", () => {
	it("returns a handle right away and never throws", async () => {
		const backend = createBackend();
		const errors: Array<unknown> = [];
		const client = new QueryClient({
			queryCache: new QueryCache({ onError: (error) => errors.push(error) }),
		});
		backend.issues.delete(1);

		const handle = prefetch(client, backend.issueQuery, { id: 1 });
		expect(handle).toEqual({ input: { id: 1 }, key: ["issue", 1] });
		await backend.respond();

		expect(errors).toHaveLength(1);
	});

	it("reuses fresh data and refetches stale data", async () => {
		let calls = 0;
		function countQuery(input: { staleTime: number }) {
			return queryOptions({
				queryFn: () => ++calls,
				queryKey: ["count", input.staleTime],
				staleTime: input.staleTime,
			});
		}
		const client = new QueryClient();
		await ensure(client, countQuery, { staleTime: Infinity });
		prefetch(client, countQuery, { staleTime: Infinity });
		await ensure(client, countQuery, { staleTime: 0 });
		prefetch(client, countQuery, { staleTime: 0 });
		await Promise.resolve();

		expect(calls).toBe(3);
	});
});

describe("ensure / ensureData", () => {
	it("wait on a cache miss and reject when that request fails", async () => {
		const backend = createBackend();
		const client = new QueryClient();
		backend.issues.delete(1);

		const failed = ensureData(client, backend.issueQuery, { id: 1 });
		const loaded = ensure(client, backend.issueQuery, { id: 2 });
		const outcome = failed.then(() => "resolved", String);
		await backend.respond();

		expect(await outcome).toBe("Error: No issue 1");
		expect(await loaded).toEqual({ input: { id: 2 }, key: ["issue", 2] });
	});

	it("resolve stale cached data immediately and revalidate it", async () => {
		const backend = createBackend();
		const client = new QueryClient();
		setData(
			client,
			backend.issueQuery,
			{ id: 1 },
			{
				assigneeId: 10,
				id: 1,
				title: "Cached",
			},
		);

		const issue = await ensureData(client, backend.issueQuery, { id: 1 });
		expect(issue.title).toBe("Cached");
		expect(backend.calls()).toBe(1);

		await backend.respond();
		expect(getData(client, backend.issueQuery, { id: 1 })?.title).toBe("First");
	});

	it("load more pages up front for paged factories", async () => {
		const client = new QueryClient();
		function numbersQuery() {
			return infiniteQueryOptions({
				getNextPageParam: (lastPage: number) => lastPage + 1,
				initialPageParam: 1,
				queryFn: (context) => context.pageParam,
				queryKey: ["numbers"],
			});
		}

		const data = await ensureData(client, numbersQuery, undefined, {
			pages: 3,
		});

		expect(data.pages).toEqual([1, 2, 3]);
		expectTypeOf(data.pages).toEqualTypeOf<Array<number>>();
	});

	it("retries like a read does", async () => {
		let calls = 0;
		function flakyQuery() {
			return queryOptions({
				queryFn: () => {
					calls++;
					if (calls < 2) {
						throw new Error("flaky");
					}
					return "ok";
				},
				queryKey: ["flaky"],
				retryDelay: 0,
			});
		}
		const client = new QueryClient();

		expect(await ensureData(client, flakyQuery)).toBe("ok");
		expect(calls).toBe(2);
	});
});

describe("invalidate", () => {
	it("only marks a query nobody reads stale", async () => {
		const backend = createBackend();
		const client = new QueryClient();
		const loading = ensure(client, backend.issueQuery, { id: 1 });
		await backend.respond();
		await loading;

		await invalidate(client, backend.issueQuery, { id: 1 });

		expect(client.getQueryState(["issue", 1])?.isInvalidated).toBe(true);
		expect(backend.calls()).toBe(1);
	});
});

describe("factories", () => {
	it("warns once when two inputs share a key", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		function postQuery(input: { locale: string; slug: string }) {
			return queryOptions({
				queryFn: () => `${input.slug} (${input.locale})`,
				queryKey: ["post", input.slug],
			});
		}
		const client = new QueryClient();

		prefetch(client, postQuery, { locale: "en", slug: "hello" });
		prefetch(client, postQuery, { locale: "sv", slug: "hello" });
		prefetch(client, postQuery, { locale: "de", slug: "hello" });

		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0]?.[0])).toContain('["post","hello"]');
		warn.mockRestore();
	});

	it("tag keys with their data type for TanStack's own APIs", () => {
		const backend = createBackend();
		const client = new QueryClient();
		const key = backend.issueQuery({ id: 1 }).queryKey;

		expectTypeOf(client.getQueryData(key)).toEqualTypeOf<Issue | undefined>();
	});

	it("reject a second factory parameter", () => {
		const client = new QueryClient();
		function twoArgs(id: number, slug: string) {
			return queryOptions({
				queryFn: () => `${id}${slug}`,
				queryKey: ["x", id, slug],
			});
		}
		// @ts-expect-error factories take at most one argument
		expect(() => prefetch(client, twoArgs, 1)).not.toThrow();
	});
});
