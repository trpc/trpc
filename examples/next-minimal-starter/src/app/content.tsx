'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useTRPC } from '../trpc/trpc-client';

function QueryExample() {
  const trpc = useTRPC();

  // 💡 Tip: CMD+Click (or CTRL+Click) on `greeting` to go to the server definition
  const options = trpc.greeting.queryOptions();
  const result = useSuspenseQuery(options);

  if (!result.data) {
    return (
      <div>
        <p>Loading...</p>
      </div>
    );
  }
  return (
    <div>
      {/**
       * The type is defined and can be autocompleted
       * 💡 Tip: Hover over `data` to see the result type
       * 💡 Tip: CMD+Click (or CTRL+Click) on `text` to go to the server definition
       * 💡 Tip: Secondary click on `text` and "Rename Symbol" to rename it both on the client & server
       */}
      <p>{result.data.text}</p>
    </div>
  );
}

function SubscriptionExample() {
  const trpc = useTRPC();
  const options = trpc.loopData.subscriptionOptions();
  const subscription = useSubscription(options);
  return (
    <table>
      <tbody>
        <tr>
          <th>Last data</th>
          <td>{subscription.data?.data}</td>
        </tr>
        <tr>
          <th>Last Event ID</th>
          <td>{subscription.data?.id}</td>
        </tr>
        <tr>
          <th>Status</th>
          <td>
            {subscription.status}
            {subscription.status === 'error' && (
              <div>
                <button onClick={() => subscription.reset()}>Reset</button>
              </div>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function Content() {
  return (
    <div>
      <h2>Query</h2>
      <QueryExample />
      <h2>Subscription</h2>

      <SubscriptionExample />
    </div>
  );
}
