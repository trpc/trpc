import { QueryClient } from "@raf-query/react";
import { postQuery } from "~/queries.ts";
import { Platform, QueryCache } from "@raf-query/react";
import { Effect, Layer, Option } from "effect";
import { expect, it } from "@effect/vitest";
import { TestClock } from "effect/testing";
import { todosQuery } from "~/queries.ts";

const queryClient = new QueryClient();

// #region seeding-the-cache
queryClient.setData(
	postQuery,
	{ slug: "hello" },
	{ slug: "hello", title: "Hello", body: "", authorId: "" },
);
const handle = await queryClient.ensure(postQuery, { slug: "hello" });
// #endregion

declare const server: {
	use(...handlers: ReadonlyArray<unknown>): void;
};

declare const http: {
	get(path: string, resolver: () => unknown): unknown;
};

declare const HttpResponse: {
	json(body: unknown): unknown;
};

// #region mocking-the-network
server.use(
	http.get("/api/posts/:slug", () =>
		HttpResponse.json({ slug: "hello", title: "Hello" }),
	),
);
// #endregion

const listeners = new Set<(event: "focus" | "online") => void>();

const FakePlatform = Layer.succeed(Platform.Platform, {
	isOnlineUnsafe: () => true,
	isServer: false,
	isVisibleUnsafe: () => true,
	subscribeUnsafe(listener) {
		listeners.add(listener);
		return () => listeners.delete(listener);
	},
});

// #region time-focus-and-the-network
it.effect("garbage-collects unread entries", () =>
	Effect.gen(function* () {
		const cache = yield* QueryCache.QueryCache;
		yield* cache.fetch(todosQuery);
		yield* TestClock.adjust("5 minutes");
		expect(Option.isNone(yield* cache.getData(todosQuery))).toBe(true);
	}).pipe(Effect.provide(QueryCache.layer()), Effect.provide(FakePlatform)),
);
// #endregion
