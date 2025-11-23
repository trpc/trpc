import { useSuspenseQuery } from '@tanstack/react-query';
import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useTRPC } from '~/trpc/client';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  const trpc = useTRPC();
  /**
   * This will not make an HTTP request on initial load due to the `localLink` being used
   * to invoke the procedure resolver directly on the server during the SSR pass.
   * Consequent refetches will make HTTP requests.
   *
   * You can also
   * `queryClient.prefetchQuery(trpc.greeting.queryOptions({ name: 'world' }));`
   * higher up the tree to prefetch the query and avoid waterfalls if the component is
   * deeply nested within Suspense boundaries.
   */
  const greeting = useSuspenseQuery(
    trpc.greeting.queryOptions({ name: 'world' }),
  );

  return (
    <div className="p-2">
      <h3>Welcome Home!!!</h3>
      <div>
        {/**
         * The type is defined and can be autocompleted
         * 💡 Tip: Hover over `data` to see the result type
         * 💡 Tip: CMD+Click (or CTRL+Click) on `text` to go to the server definition
         * 💡 Tip: Secondary click on `text` and "Rename Symbol" to rename it both on the client & server
         */}
        <p>{greeting.data.text}</p>
      </div>
      <ClientOnly>
        <SubscriptionExample />
      </ClientOnly>
    </div>
  );
}

function SubscriptionExample() {
  const trpc = useTRPC();
  const subscription = useSubscription(trpc.loopData.subscriptionOptions());

  return (
    <table>
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
    </table>
  );
}
