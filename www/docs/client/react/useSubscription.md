---
id: useSubscription
title: useSubscription()
sidebar_label: useSubscription()
slug: /client/react/useSubscription
---

The `useSubscription` hook can be used to subscribe to a [subscription](../../server/subscriptions.md) procedure on the server.

## Signature

### Options

:::tip

- If you need to set any options but don't want to pass any input, you can pass `undefined` instead.
- If you pass `skipToken` from `@tanstack/react-query`, the subscription will be paused.
- Have a look at our [SSE example](https://github.com/trpc/examples-next-sse-chat) for a complete example of how to use subscriptions

:::

```tsx twoslash
// @errors: 2391 2304

interface UseTRPCSubscriptionOptions<TOutput, TError> {
  /**
   * Called when the subscription is started.
   */
  onStarted?: () => void;
  /**
   * Called when new data is received from the subscription.
   */
  onData?: (data: TOutput) => void;
  /**
   * Called when an **unrecoverable error** occurs and the subscription is stopped.
   */
  onError?: (error: TError) => void;
  /**
   * Called when the subscription is completed on the server.
   * The state will transition to `'idle'` with `data: undefined`.
   */
  onComplete?: () => void;
  /**
   * @deprecated Use a `skipToken` from `@tanstack/react-query` instead.
   * This will be removed in v12.
   */
  enabled?: boolean;
}
```

### Return type

The return type is a discriminated union on `status`:

```ts twoslash
// @errors: 2304

type TRPCSubscriptionResult<TOutput, TError> =
  | TRPCSubscriptionIdleResult<TOutput>
  | TRPCSubscriptionConnectingResult<TOutput, TError>
  | TRPCSubscriptionPendingResult<TOutput>
  | TRPCSubscriptionErrorResult<TOutput, TError>;

interface TRPCSubscriptionIdleResult<TOutput> {
  /** Subscription is disabled or has ended */
  status: 'idle';
  data: undefined;
  error: null;
  reset: () => void;
}

interface TRPCSubscriptionConnectingResult<TOutput, TError> {
  /** Trying to establish a connection (may have a previous error from a reconnection attempt) */
  status: 'connecting';
  data: TOutput | undefined;
  error: TError | null;
  reset: () => void;
}

interface TRPCSubscriptionPendingResult<TOutput> {
  /** Connected to the server, receiving data */
  status: 'pending';
  data: TOutput | undefined;
  error: null;
  reset: () => void;
}

interface TRPCSubscriptionErrorResult<TOutput, TError> {
  /** An unrecoverable error occurred and the subscription is stopped */
  status: 'error';
  data: TOutput | undefined;
  error: TError;
  reset: () => void;
}
```

## Example Procedure

```tsx twoslash title='server/routers/_app.ts'
// @target: esnext
// @types: node
import EventEmitter, { on } from 'events';
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create();

type Post = { id: string; title: string };
const ee = new EventEmitter();

export const appRouter = t.router({
  onPostAdd: t.procedure.subscription(async function* (opts) {
    for await (const [data] of on(ee, 'add', {
      signal: opts.signal,
    })) {
      const post = data as Post;
      yield post;
    }
  }),
});

export type AppRouter = typeof appRouter;
```

## Example React Component

```tsx twoslash title='components/PostFeed.tsx'
// @target: esnext
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
type Post = { id: string; title: string };
const appRouter = t.router({
  onPostAdd: t.procedure.subscription(async function* () {
    yield { id: '1', title: 'Hello' } as Post;
  }),
});
export type AppRouter = typeof appRouter;

// @filename: utils/trpc.tsx
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server';
export const trpc = createTRPCReact<AppRouter>();

// @filename: components/PostFeed.tsx
import React from 'react';
// ---cut---
import { trpc } from '../utils/trpc';

type Post = { id: string; title: string };

export function PostFeed() {
  const [posts, setPosts] = React.useState<Post[]>([]);

  const subscription = trpc.onPostAdd.useSubscription(undefined, {
    onData: (post) => {
      setPosts((prev) => [...prev, post]);
    },
  });

  return (
    <div>
      <h1>Live Feed</h1>
      {subscription.status === 'connecting' && <p>Connecting...</p>}
      {subscription.status === 'error' && (
        <div>
          <p>Error: {subscription.error.message}</p>
          <button onClick={() => subscription.reset()}>Reconnect</button>
        </div>
      )}
      <ul>
        {posts.map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </div>
  );
}
```
