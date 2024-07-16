---
id: useSubscription
title: useSubscription()
sidebar_label: useSubscription()
slug: /client/react/useSubscription
---

```tsx
function useSubscription(
  input: TInput,
  opts?: UseTRPCSubscriptionOptions
) => UseTRPCSubscriptionResult;

interface UseTRPCSubscriptionOptions {
  enabled?: boolean;
  onData?: (data: TOutput) => void;
  onError?: (error: TError) => void;
  onStarted?: () => void;
  onStateChange?: (state: ConnectionStateMessage) => void;
}

interface ConnectionStateMessage {
  state: 'idle' | 'connecting' | 'pending' | 'error';
  data: TError | null;
}

interface UseSubscriptionResult {
  connectionStartedAt: number,
  connectionAttemptCount: number,
  connectionError: TError | null,
  connectionErrorUpdatedAt: TError | null,
  data: TOutput | null,
  error: TError | null,
  errorUpdatedAt: number,
  initialConnectionStartedAt: number,
  isConnecting: boolean,
  isError: boolean,
  isReconnecting: boolean,
  isStarted : boolean,
  isStarting : boolean,
  status : 'idle' | 'connecting' | 'pending' | 'error';
}
```

The `useSubscription` hook can be used to subscribe to a [subscription](../../further/subscriptions.md) procedure on the server.

### Options

- `input`
  - The input as defined by the procedure
- `opts.enabled`
  - If `false`, the subscription will stay idle
  - Default: `true`
- `opts.onData`
  - Callback when data is received
- `opts.onError`
  - Callback when the subscription failed
- `opts.onStarted`
  - Callback when the subscription started
- `opts.onStateChange`
  - Callback when the connection state changes

:::tip
If you need to set any options but don't want to pass any input, you can pass `undefined` instead.
:::

You'll notice that you get autocompletion on the `input` based on what you have set in your `input` schema on your backend.

### Returns

- `data`
  - The last data received from the subscription
- `connectionStartedAt`
  - The timestamp for when the connection was last (re-)established
- `initialConnectionStartedAt`
  - The timestamp for when the connection was initially established
- `error`
  - The error that caused the subscription to stop
- `errorUpdatedAt`
  - The timestamp for when the last error was captured
- `connectionError`
  - The reason for the reconnection
  - Resets to `null` after the subscription is restarted and the connection is re-established
- `connectionAttemptCount`
  - Reconnection attempts since last successful connection
  - Resets to `0` after the subscription is restarted and the connection is re-established
- `connectionErrorUpdatedAt`
  - The timestamp for when the last reconnection error was captured
  - Resets to `0` after the subscription is restarted and the connection is re-established
- `isStarting`
  - Is `true` when the subscription is establishing the initial connection
  - Is `false` in all other states
- `isStarted`
  - Is `true` when the subscription has successfully connected at least once
    - Alias for `status === 'pending'`
- `isConnecting`
  - Is `true` if the subscription is (re-)establishing a connection
    - Alias for `status === 'connecting'`
- `isPending`
  - Is `true` when the subscription is connected and listening for data
    - Alias for `status === 'pending'`
- `isReconnecting`
  - Is `true` if the subscription is re-establishing a connection
    - Alias for `status === 'connecting' && isStarted === true`
- `isError`
  - Is `true` if the subscription ended in an error state
    - Alias for `status === 'error'`
- `status`
  - The current state of the subscription
  - Will be:
    - `'idle'` when the subscription is not enabled
    - `'connecting'` when the subscription is (re-)establishing the connection
    - `'pending'` when the subscription is connected and receiving data
    - `'error'` when the subscription has stopped due to an error

## Example

<details><summary>Backend code</summary>

```tsx title='server/routers/_app.ts'
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();

export const appRouter = t.router({
  // Create procedure at path 'onTimer'
  onTimer: t.procedure.subscription(() => {
    return observable<number>((emit) => {
      const interval = setInterval(() => {
        emit(Math.random());
      }, 1000);

      return () => {
        clearInterval(interval);
      };
    });
  }),
});
```

</details>

```tsx title='components/MyComponent.tsx'
import { trpc } from '../utils/trpc';

export function MyComponent() {
  const [numbers, setNumbers] = React.useState<number[]>([]);

  const { data, status } = trpc.onTimer.useSubscription(undefined, {
    onData: (num) => {
      setNumbers((prev) => [...prev, num]);
    },
  });

  return (
    <div>
      <h1>Subscription Example</h1>
      <p>
        {status}: <pre>{JSON.stringify(data, null, 2)}</pre>
      </p>
      <h2>Previous numbers:</h2>
      <ul>
        {numbers.map((num, i) => (
          <li key={i}>{num}</li>
        ))}
      </ul>
    </div>
  );
}
```
