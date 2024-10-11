---
id: useSubscription
title: useSubscription()
sidebar_label: useSubscription()
slug: /client/react/useSubscription
---

The `useSubscription` hook can be used to subscribe to a [subscription](../../server/subscriptions.md) procedure on the server.

## Options

:::tip

- If you need to set any options but don't want to pass any input, you can pass `undefined` instead.
- If you pass `skipToken` from `@tanstack/react-query`, the subscription will be paused.

:::

```tsx
function useSubscription<TOutput, TError>(
  input: TInput | SkipToken,
  opts?: UseTRPCSubscriptionOptions<TOutput, TError>
): TRPCSubscriptionResult<TOutput, TError>;

interface UseTRPCSubscriptionOptions<TOutput, TError> {
  /**
   * Callback invoked when the subscription starts.
   */
  onStarted?: () => void;
  /**
   * Callback invoked when new data is received from the subscription.
   * @param data - The data received.
   */
  onData?: (data: TOutput) => void;
  /**
   * Callback invoked when an **unrecoverable error** occurs
   * and the subscription is closed.
   * For recoverable errors, use `onConnectionStateChange`
   * or the `connectionState`/`connectionError` fields on the result.
   */
  onError?: (error: TError) => void;
  /**
   * Callback invoked when the connection state changes.
   */
  onConnectionStateChange?: (state: TRPCConnectionState<TError>) => void;
  /**
   * @deprecated Use a `skipToken` from `@tanstack/react-query` instead.
   * This will be removed in a future version.
   */
  enabled?: boolean;
}

```

## Return type

```ts
type TRPCSubscriptionResult<TOutput, TError> = {
  /**
   * The current status of the subscription.
   * Will be one of: `'idle'`, `'connecting'`, `'pending'`, or `'error'`.
   */
  status: 'idle' | 'connecting' | 'pending' | 'error';
  /**
   * The last data received from the subscription.
   */
  data: TOutput | undefined;
  /**
   * The error that caused the subscription to stop.
   */
  error: TError | undefined;
  /**
   * The current state of the connection.
   * Will be one of: `'idle'`, `'connecting'`, `'pending'`, or `'error'`.
   */
  connectionState: 'idle' | 'connecting' | 'pending' | 'error';
  /**
   * The error related to the connection, if any.
   */
  connectionError: TError | null;
  /**
   * Function to reset the subscription.
   */
  reset: () => void;
};
```

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
