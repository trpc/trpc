# @raf-query/core

The framework-agnostic cache behind [raf-query](https://raf-query.katt.dev), written in and for [Effect](https://effect.website): every verb is an Effect with typed errors and services, and entries can be watched as Streams. It also holds `QueryClient`, the same cache with Promise methods, which the framework bindings re-export.

**[Documentation](https://raf-query.katt.dev/docs/effect)** · [API reference](https://raf-query.katt.dev/docs/api-reference#raf-querycore) · [GitHub](https://github.com/KATT/raf-query)

> [!NOTE]
> raf-query is early. The API can still change between minor releases, and you use it at your own risk.

React apps install [`@raf-query/react`](https://www.npmjs.com/package/@raf-query/react) instead: it re-exports this package, so you never import core directly. Install core on its own for Effect programs and for bindings to other frameworks.

## Install

```bash
npm install @raf-query/core effect
```

## Usage

```ts
import { QueryCache, queryOptions } from "@raf-query/core";
import { Effect, Schedule, Stream } from "effect";

export function issueQuery(input: { id: number }) {
	return queryOptions({
		queryKey: ["issue", input.id],
		queryFn: () => IssueRepo.get(input.id), // Effect<Issue, IssueNotFound>
		retry: Schedule.exponential("200 millis").pipe(Schedule.upTo({ times: 3 })),
	});
}

const program = Effect.gen(function* () {
	const cache = yield* QueryCache.QueryCache;
	yield* cache.fetch(issueQuery, { id: 1 }); // fails with IssueNotFound
	yield* cache.watch(issueQuery, { id: 1 }).pipe(
		Stream.map((state) => state.data?.title),
		Stream.runForEach((title) => Effect.log(title)),
	);
});

Effect.runFork(program.pipe(Effect.provide(QueryCache.layer())));
```

[Effect](https://raf-query.katt.dev/docs/effect) and [services](https://raf-query.katt.dev/docs/effect-services) in the docs cover the rest.

## License

MIT
