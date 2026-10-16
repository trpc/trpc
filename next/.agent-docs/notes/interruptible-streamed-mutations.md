# Interruptible streamed mutations

2026-10-15. Question (Alex, issues review Q7, #5846): can a streamed mutation be stopped from the UI, and should it hand back a subscription instead? Measured against `@tanstack/query-core` 5.104.1 and trpcdev `httpLink`, in a throwaway test (deleted after; the prototype is below).

## What TanStack gives us

- `mutationFn(variables, context)` gets `{ client, meta, mutationKey }`: no `AbortSignal`.
- `MutationObserver.reset()` and unmounting drop the observer but leave the mutation running; nothing tells `mutationFn`.
- A pending mutation's `data` can't be updated from outside: `Mutation#dispatch` is private. So `streamedMutationOptions()` writes the chunks so far to a query (`streamedMutationKey()`), and `data` is set once, when the stream ends.
- Public and usable: `queryClient.getQueryCache().subscribe()` emits `observerRemoved`, and `query.getObserversCount()`.

## What trpcdev gives us

- `client.x.mutate(input, { signal })` over `httpLink`: aborting the signal mid-stream ends the response, the server's generator `finally` runs (checked: 3 values yielded, then `finally`), and the client's iterator rejects with `CLIENT_CLOSED_REQUEST`.
- Before this spike the rejection was inconsistent (sometimes a quiet end, sometimes a `DansonError('Stream failed')` wrapping the abort). `serializer/stream.ts` now passes the source's typed failure through as is. Locked by `test/integration/batching-and-streaming.test.ts` ("aborting a streamed output ...").

## Option 1: abort when nobody reads the chunks

Works with public API only. Checked: data was `[0, 1, 2]` and the server stopped.

```ts
mutationFn: async (variables, { client }) => {
  const controller = new AbortController();
  const hash = hashKey(queryKey);
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (
      event.type === 'observerRemoved' &&
      event.query.queryHash === hash &&
      event.query.getObserversCount() === 0
    ) {
      controller.abort();
    }
  });
  const chunks = [];
  try {
    for await (const chunk of await mutate(variables, {
      signal: controller.signal,
    })) {
      chunks.push(chunk);
      client.setQueryData(queryKey, [...chunks]);
    }
  } catch (cause) {
    if (!controller.signal.aborted) throw cause;
  } finally {
    unsubscribe();
  }
  return chunks;
};
```

- Ties "stop" to the last `chunksOptions()` reader unmounting, which is implicit; a component that never reads the chunks can't stop it this way.
- An explicit `stop()` would need a handle outside TanStack: `streamedMutationOptions({ signal })` per call, or a `trpc.x.abortStreamedMutation()` that aborts the controller kept per key.

## Option 2: return a subscription

The mutation starts a job and returns its id; a `tracked()` subscription streams the job's progress.

- Resumable (`lastEventId`), survives reloads, and many tabs can watch one job.
- Unsubscribing stops watching, not the job; stopping needs a `cancel` mutation.
- Needs somewhere to keep jobs (a publisher), so it's an app pattern, not a helper.

## Rejected

- Patching `Mutation` state or its observers: private API, breaks on upgrade.

## Suggestion

Ship option 1 behind `streamedMutationOptions({ abortWhenUnobserved: true })` plus a `signal` per call, and document option 2 as the pattern for long jobs.

Built since: both options are in `packages/tanstack-query/src/utils.ts` and `docs/tanstack-query.md`, tested in `test/tanstack-query/core.test.ts` ([decision](../decisions/interruptible-streamed-mutations.md)).
