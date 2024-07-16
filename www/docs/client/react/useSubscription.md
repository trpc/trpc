---
id: useSubscription
title: useSubscription()
sidebar_label: useSubscription()
slug: /client/react/useSubscription
---

```tsx
function useSubscription(
  input: TInput | SkipToken,
  opts?: UseTRPCSubscriptionOptions
) => TRPCSubscriptionResult;

interface UseTRPCSubscriptionOptions {
  enabled?: boolean;
  onData?: (data: TOutput) => void;
  onError?: (error: TError) => void;
  onStarted?: () => void;
  onStateChange?: (state: TRPCConnectionState<TError>) => void;
}

type TRPCSubscriptionResult<TOutput, TError> = {
  status: 'idle' | 'connecting' | 'pending' | 'error';
  data: TOutput | undefined;
  error: TError | undefined;
  connectionState: 'idle' | 'connecting' | 'pending' | 'error';
  connectionError: TError | null;
};
```

The `useSubscription` hook can be used to subscribe to a [subscription](../../server/subscriptions.md) procedure on the server.

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

- `status`
  - The current state of the subscription
  - Will be: `'idle'`, `'connecting'`, `'pending'`, or `'error'`
- `data`
  - The last data received from the subscription
- `error`
  - The error that caused the subscription to stop
- `connectionState`
  - The current state of the connection
  - Will be: `'idle'`, `'connecting'`, `'pending'`, or `'error'`
- `connectionError`
  - The error related to the connection, if any

## Example

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
