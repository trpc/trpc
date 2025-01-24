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

```tsx
function useSubscription<TOutput, TError>(
  input: TInput | SkipToken,
  opts?: UseTRPCSubscriptionOptions<TOutput, TError>,
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
   * Callback invoked when an **unrecoverable error** occurs and the subscription is stopped.
   */
  onError?: (error: TError) => void;
  /**
   * @deprecated Use a `skipToken` from `@tanstack/react-query` instead.
   * This will be removed in a future version.
   */
  enabled?: boolean;
}
```

### Return type

```ts
type TRPCSubscriptionResult<TOutput, TError> = {
  /**
   * The current status of the subscription.
   * Will be one of: `'idle'`, `'connecting'`, `'pending'`, or `'error'`.
   *
   * - `idle`: subscription is disabled
   * - `connecting`: trying to establish a connection
   * - `pending`: connected to the server, receiving data
   * - `error`: an error occurred and the subscription is stopped
   */
  status: 'idle' | 'connecting' | 'pending' | 'error';
  /**
   * The last data received from the subscription.
   */
  data: TOutput | undefined;
  /**
   * The last error received - will be `null` whenever the status is `'pending'` or `'idle'`
   * - has a value only when the status is `'error'`
   * - *may* have a value when the status is `'connecting'`
   */
  error: TRPCClientError | null;
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

  const result = trpc.onNumber.useSubscription(undefined, {
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

      {result.status === 'error' && (
        <button onClick={() => result.reset()}>
          Something went wrong - restart the subscription
        </button>
      )}
    </div>
  );
}
```
