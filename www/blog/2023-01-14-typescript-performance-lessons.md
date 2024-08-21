---
slug: typescript-performance-lessons
title: TypeScript performance lessons while refactoring for v10
author: Sachin Raja
author_title: tRPC Core Team Member
author_url: https://twitter.com/s4chinraja
author_image_url: https://avatars1.githubusercontent.com/u/58836760?s=460&v=4
---

As library authors, our goal is to provide the best possible developer experience (DX) for our peers. Reducing time-to-error and providing intuitive APIs removes mental overhead from the minds of developers so that they can focus on what's most important: great end user experience.

---

It's no secret that TypeScript is the driving force behind how tRPC ships its amazing DX. TypeScript adoption is the modern standard in delivering great JavaScript-based experiences today - but this improved certainty around types does have some tradeoffs.

Today, the TypeScript type checker is prone to becoming slow (although releases like [TS 4.9](https://devblogs.microsoft.com/typescript/announcing-typescript-4-9/#performance-improvements) are promising!). Libraries almost always contain the fanciest TypeScript incantations in your codebase, pressing your TS compiler to its limits. For this reason, library authors like us must be mindful of our contributions to that burden and do our best to keep your IDE working as fast as possible.

## Automating library performance

While tRPC was in `v9`, we began seeing reports from developers that their large tRPC routers were starting to have detrimental effects on their type checker. This was a new experience for tRPC as we saw tremendous adoption during the `v9` phase of tRPC's development. With more developers creating larger and larger products with tRPC, some cracks began to show.

Your library may not be slow _now_, but it's important to keep an eye on performance as your library grows and changes. Automated testing can remove an immense burden from your library authoring (and application building!) by _programmatically_ testing your library code on each commit.

For tRPC, we do our best to ensure this by [generating](https://github.com/trpc/trpc/blob/9fc2d06a8924da73e10b9d4497f3a1f53de706ed/scripts/generateBigBoi.ts) and [testing](https://github.com/trpc/trpc/blob/9fc2d06a8924da73e10b9d4497f3a1f53de706ed/packages/tests/server/react/bigBoi.test.tsx) a router with 3,500 procedures and 1,000 routers. But this only tests how far we can push the TS compiler before it breaks and not how long type-checking takes. We test all three pieces of the library (server, vanilla client, and the React client) because they all have different code paths. In the past, we have seen regressions that are isolated to one section of the library and rely on our tests to show us when those unexpected behaviors occur. (We still do [want to do more](https://github.com/trpc/trpc/issues/2892) to measure compilation times)

tRPC is not a runtime-heavy library so our performance metrics are centered around type-checking. Therefore, we stay mindful of:

- Being slow to type-check using `tsc`
- Having a large initial load time
- If the TypeScript language server takes a long time to respond to changes

The last point is one that the tRPC must pay attention to the most. You **never** want to your developers to have to wait for the language server to update after a change. This is where tRPC **must** maintain performance so that you can enjoy great DX.

## How I found performance opportunities in tRPC

There is always a tradeoff between TypeScript accuracy and compiler performance. Both are important concerns for other developers so we must be extremely conscious of how we write types. Will it be possible for an application to run into severe errors because a certain type is "too loose"? Is the performance gain worth it?

Is there even going to be a meaningful performance gain at all? Great question.

Let's have a look at _how_ to find moments for performance improvements in TypeScript code. We'll visit the process I went through to create [PR #2716](https://github.com/trpc/trpc/pull/2716), resulting in a 59% decrease in TS compilation time.

---

TypeScript has a built-in [tracing tool](https://github.com/microsoft/TypeScript/wiki/Performance-Tracing) that can help you find the bottleneck in your types. It's not perfect, but it's the best tool available.

It's ideal to test your library on a real-world app to simulate what your library is doing for real developers. For tRPC, I created a basic [T3 app](https://create.t3.gg/) resembling what many of our users work with.

Here's the steps I followed to trace tRPC:

1. [Locally link the library](https://docs.npmjs.com/cli/commands/npm-link) to the example app. This is so you can change your library code and immediately test changes locally.

2. Run this command in the example app:

   ```sh
   tsc --generateTrace ./trace --incremental false
   ```

3. You'll be given a `trace/trace.json` file on your machine. You can open that file in a trace analysis app (I use [Perfetto](https://ui.perfetto.dev/)) or `chrome://tracing`.

This is where things get interesting and we can start to learn about the performance profile of the types in the application. Here's what the first trace looked like:
![trace bar showing that src/pages/index.ts took 332ms to type-check](https://user-images.githubusercontent.com/58836760/190300723-5366674f-2fe0-48e9-8a00-7a8bc85b5c91.png)

A longer bar means more time spent performing that process. I've selected the top green bar for this screenshot, indicating that `src/pages/index.ts` is the bottleneck. Under the `Duration` field, you'll see that it took 332ms - an enormous amount of time to spend type-checking! The blue `checkVariableDeclaration` bar tells us the compiler spent most of its time on one variable.
Clicking on that bar will tell us which one it is:
![trace info showing the variable's position is 275](https://user-images.githubusercontent.com/58836760/212483649-65e30d0f-497b-4af4-a58d-57f83e92a273.png)
The `pos` field reveals the position of the variable in the file's text. Going to that position in `src/pages/index.ts` reveals that the culprit is `utils = trpc.useContext()`!

But how could this be? We're just using a simple hook! Let's look at the code:

```tsx
import type { AppRouter } from '~/server/trpc';

const trpc = createTRPCReact<AppRouter>();
const Home: NextPage = () => {
  const { data } = trpc.r0.greeting.useQuery({ who: 'from tRPC' });

  const utils = trpc.useContext();

  utils.r49.greeting.invalidate();
};

export default Home;
```

Okay, not much to see here. We only see a single `useContext` and a query invalidation. Nothing that _should be_ TypeScript heavy at face value, indicating that the problem must be deeper in the stack. Let's look at the types behind this variable:

```ts
type DecorateProcedure<
  TRouter extends AnyRouter,
  TProcedure extends Procedure<any>,
  TProcedure extends AnyQueryProcedure,
> = {
  /**
   * @link https://tanstack.com/query/v4/docs/framework/react/guides/query-invalidation
   */
  invalidate(
    input?: inferProcedureInput<TProcedure>,
    filters?: InvalidateQueryFilters,
    options?: InvalidateOptions,
  ): Promise<void>;
  // ... and so on for all the other React Query utilities
};

export type DecoratedProcedureUtilsRecord<TRouter extends AnyRouter> =
  OmitNeverKeys<{
    [TKey in keyof TRouter['_def']['record']]: TRouter['_def']['record'][TKey] extends LegacyV9ProcedureTag
      ? never
      : TRouter['_def']['record'][TKey] extends AnyRouter
      ? DecoratedProcedureUtilsRecord<TRouter['_def']['record'][TKey]>
      : TRouter['_def']['record'][TKey] extends AnyQueryProcedure
      ? DecorateProcedure<TRouter, TRouter['_def']['record'][TKey]>
      : never;
  }>;
```

Okay, now we have some things to unpack and learn about. Let's figure out what this code is doing first.

We have a recursive type `DecoratedProcedureUtilsRecord` that walks through all the procedures in the router and "decorates" (adds methods to) them with React Query utilities like [`invalidateQueries`](https://tanstack.com/query/v4/docs/framework/react/guides/query-invalidation).

In tRPC v10 we still support old `v9` routers, but `v10` clients cannot call procedures from `v9` routers. So for each procedure we check if it's a `v9` procedure (`extends LegacyV9ProcedureTag`) and strip it out if so. It's all a lot of work for TypeScript to do...**if it's not lazily evaluated**.

### Lazy evaluation

The problem here is that TypeScript is evaluating all of this code in the type system, even though it's not used immediately. Our code is only using `utils.r49.greeting.invalidate` so TypeScript should only need to unwrap the `r49` property (a router), then the `greeting` property (a procedure), and finally the `invalidate` function for that procedure. No other types are needed in that code and immediately finding the type for every React Query utility method for all your tRPC procedures would unnecessarily slow TypeScript down. TypeScript defers type evaluation of properties on **objects** until they are directly used, so theoretically our type above should get lazy evaluation...right?

Well, it's not _exactly_ an object. There's actually a type wrapping the entire thing: `OmitNeverKeys`. This type is a utility that removes keys that have the value `never` from an object. This is the part where we strip off the v9 procedures so those properties don't show up in Intellisense.

But this creates a huge performance issue. We forced TypeScript to evaluate the values of **all** types now to check if they are `never`.

How can we fix this? Let's change our types to _do less_.

### Get lazy

We need to find a way for the `v10` API to adapt to the legacy `v9` routers more gracefully. New tRPC projects should not suffer from the reduced TypeScript performance of [interop mode](/docs/v10/migrate-from-v9-to-v10#using-interop).

The idea is to rearrange the core types themselves. `v9` procedures are different entities than `v10` procedures so they shouldn't share the same space in our library code. On the tRPC server side, this means we had some work to do to store the types on different fields in the router instead of a single `record` field (see the `DecoratedProcedureUtilsRecord` from above).

We made a change so `v9` routers inject their procedures into a `legacy` field when they are converted to `v10` routers.

Old types:

```ts
export type V10Router<TProcedureRecord> = {
  record: TProcedureRecord;
};

// convert a v9 interop router to a v10 router
export type MigrateV9Router<TV9Router extends V9Router> = V10Router<{
  [TKey in keyof TV9Router['procedures']]: MigrateProcedure<
    TV9Router['procedures'][TKey]
  > &
    LegacyV9ProcedureTag;
}>;
```

If you recall the `DecoratedProcedureUtilsRecord` type above, you can see that we attached `LegacyV9ProcedureTag` here to differentiate between `v9` and `v10` procedures on the type level and enforce that `v9` procedures are not called from `v10` clients.

New types:

```ts
export type V10Router<TProcedureRecord> = {
  record: TProcedureRecord;
  // by default, no legacy procedures
  legacy: {};
};

export type MigrateV9Router<TV9Router extends V9Router> = {
  // v9 routers inject their procedures into a `legacy` field
  legacy: {
    // v9 clients require that we filter queries, mutations, subscriptions at the top-level
    queries: MigrateProcedureRecord<TV9Router['queries']>;
    mutations: MigrateProcedureRecord<TV9Router['mutations']>;
    subscriptions: MigrateProcedureRecord<TV9Router['subscriptions']>;
  };
} & V10Router</* empty object, v9 routers have no v10 procedures to pass */ {}>;
```

Now, we can remove `OmitNeverKeys` because the procedures are pre-sorted so a router's `record` property type will contain all the `v10` procedures and its `legacy` property type will contain all the `v9` procedures. We no longer force TypeScript to fully evaluate the huge `DecoratedProcedureUtilsRecord` type. We can also remove the filtering for`v9`procedures with `LegacyV9ProcedureTag`.

## Did it work?

Our new trace shows that the bottleneck has been removed:
![trace bar showing that src/pages/index.ts took 136ms to type-check](https://user-images.githubusercontent.com/58836760/190300687-ef85589e-a997-4fa0-be0f-547f12801b2c.png)

A substantial improvement! Type-checking time went from 332ms to 136ms 🤯! This may not seem like much in the big picture but it's a huge win. 200ms is a small amount once - but think about:

- how many other TS libraries are in a project
- how many developers are using tRPC today
- how many times their types re-evaluate in a work session

That's a lot of 200ms adding up to a very big number.

We're always looking for more opportunities to improve the experience of TypeScript developers, whether it's with tRPC or a TS-based problem to solve in another project. @ me on [Twitter](https://twitter.com/s4chinraja) if you want to talk TypeScript.

Thanks to [Anthony Shew](https://twitter.com/anthonysheww) for helping write this post and to [Alex](https://twitter.com/alexdotjs) for reviewing!
