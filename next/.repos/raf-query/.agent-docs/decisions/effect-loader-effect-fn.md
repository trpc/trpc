# Effect loaders that need Effect are a module-level `Effect.fn` (human asked)

- Human: `qc.runPromise(qc.effect.ensure(...).pipe(catchTag, map(() => ({ x: qc.prefetch(...) }))))` "doesn't feel very effect native with a bunch of repetition". It also waterfalled: the prefetches started only after `ensure` resolved.
- Shape: `const loadIssue = Effect.fn("loadIssue")(function* (id) { const cache = yield* QueryCache.QueryCache; return yield* Effect.all({ ...prefetches, issue: cache.ensure(...) }, { concurrency: "unbounded" }) }, Effect.catchTag(...))`, and the loader is `(args) => args.context.queryClient.runPromise(loadIssue(...))`. Same style as the form actions.
- `concurrency: "unbounded"` keeps the prefetches from waiting on `ensure` whatever the struct's key order (keys are lint-sorted).
- Loaders that only prefetch still use the Promise verbs ([effect-loader-promise-first.md](./effect-loader-promise-first.md)). The Effect example's issue page is one of those now ([examples-instant-navigation.md](./examples-instant-navigation.md)), so the docs' route example in `www/content/effect.md` is where this shape lives.
