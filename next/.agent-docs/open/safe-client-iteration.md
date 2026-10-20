---
title: Should `createSafeClient` make a streamed output's iteration safe on its own?
summary: Today a safe client's streamed output and `subscribe()` still need `safe()` to iterate without throwing; it could yield `[item, error]` itself.
area: errors
recommended: B
links:
  - kind: decision
    label: streamed-output-errors
    url: ../decisions/streamed-output-errors.md
  - kind: docs
    label: Streamed outputs and subscriptions (errors)
    url: https://v12.trpc.io/v12/docs/client/errors#streamed-outputs-and-subscriptions
  - kind: code
    label: createSafeClient and safe()
    url: ../../packages/trpc/src/client/client.ts
---

# Should `createSafeClient` make a streamed output's iteration safe on its own?

## Why it matters

The human's answer on streamed-output errors was "yes for safe client of safe calls i think". What shipped is `safe()` taking an iterable, while `createSafeClient` still only wraps `query` and `mutate`: a streamed query resolves to `[iterable, error]`, and iterating that iterable throws on a failure unless it goes through `safe()` again. If "safe client" meant "nothing on it throws", this is half done.

## Options

### A) Keep it as it is: `safe()` on each iteration

The safe client settles the call; iterating is the plain `TrpcIterable`, made safe with `safe()`.

```ts twoslash
// ---cut-start---
import { createSafeClient, matchError, safe } from '@trpc12/trpc/client';
import { client } from './client.ts';
declare function render(title: string): void;
// ---cut-end---
const safeClient = createSafeClient(client);

async function titles() {
  const [posts, err] = await safeClient.post.list.query();
  //     ^?
  if (err) return err.message;
  for await (const [post, streamErr] of safe(posts)) {
    if (streamErr) return streamErr.message;
    render(post.title);
  }
}

// subscribe() isn't wrapped either
for await (const [post, subErr] of safe(
  safeClient.post.onCreated.subscribe(),
)) {
}
```

- ✅ Built, documented and tested; one rule: `safe()` is what makes anything safe
- ✅ A plain `for await` still works on the safe client's iterable, for code that wants to throw
- ❌ A safe client whose iterables throw surprises people who picked it so nothing throws
- ❌ Two `safe` layers to remember for one streamed call

### B) The safe client iterates safely too

`createSafeClient` wraps a streamed output's iterable and `subscribe()` with `safe()`, so both yield `[item, error]`.

```ts twoslash
// @errors: 2345
// ---cut-start---
import { matchError } from '@trpc12/trpc/client';
import { createSafeClientB as createSafeClient } from '../open/safe-client-iteration.ts';
import { client } from './client.ts';
declare function render(title: string): void;
// ---cut-end---
const safeClient = createSafeClient(client);

async function titles() {
  const [posts, err] = await safeClient.post.list.query();
  //     ^?
  if (err) return err.message;
  for await (const [post, streamErr] of posts) {
    if (streamErr) {
      // Doesn't compile: the stream can fail with STREAM_INTERRUPTED too
      return matchError(streamErr, {
        NETWORK_ERROR: () => 'You are offline',
        BAD_RESPONSE: () => 'Try again later',
        unexpected: (e) => e.message,
      });
    }
    render(post.title);
  }
}

for await (const [post, subErr] of safeClient.post.onCreated.subscribe()) {
}
```

- ✅ Matches the answer's wording: everything on a safe client is safe
- ✅ No second wrapper; TanStack and the Effect client are unaffected
- ❌ `SafeClient`'s types change for streamed procedures and subscriptions: one more conditional per streamed procedure, to measure with `pnpm bench shapes` (`streamed`)
- ❌ The safe client's iterable differs from the plain client's, so code moving between them changes

### C) A separate safe iteration method

Keep the iterable as it is and add `.safe()` on it, or a `safeSubscribe()`, so iteration opts in per call site.

```ts twoslash
// ---cut-start---
import { createSafeClientC as createSafeClient } from '../open/safe-client-iteration.ts';
import { client } from './client.ts';
const safeClient = createSafeClient(client);
// ---cut-end---
const [posts, err] = await safeClient.post.list.query();
if (posts) {
  for await (const [post, streamErr] of posts.safe()) {
  }
}

for await (const [post, subErr] of safeClient.post.onCreated.safeSubscribe()) {
}
```

- ✅ Explicit at the loop, and the plain iterable stays the same type everywhere
- ❌ A new method on every streamed iterable, and a second subscribe verb, for what `safe()` already does
- ❌ More public surface than either A or B

## Recommendation

**B.** It's the reading of "safe client of safe calls" that makes the safe client predictable: nothing on it throws, as with oRPC's `createSafeClient`. The type cost lands only on streamed procedures and subscriptions, and is measured before landing.

## Blocked until answered

- Nothing is blocked; the streamed-output docs describe A today and would change with B.

## Details

Two related points from the same review stay open in [`streamed-output-errors.md`](../decisions/streamed-output-errors.md), and can be answered with this one:

- One error union for the call and its iteration, as today, or separate ones. Today a streamed call's promise lists the stream's codes though it never rejects with them, so `matchError()` on the call's error needs their keys.
- A generator's `return error()` is the stream's final value today, as in a subscription. Making it fail the stream, as a resolver's return does, would make the two kinds of procedure behave alike.
