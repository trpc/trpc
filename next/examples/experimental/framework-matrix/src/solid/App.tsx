import {
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/solid-query';
import {
  createTrpcContext,
  useSubscription,
} from '@trpc12/tanstack-solid-query';
import { For } from 'solid-js';
import { frameworks } from '../frameworks.ts';
import type { Client, makeClient } from '../trpc.ts';
import { ui } from '../ui.ts';

export const [TrpcProvider, useTrpc] = createTrpcContext<typeof makeClient>();

function Poll() {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const votes = useQuery(() => trpc.votes.list.queryOptions());
  const vote = useMutation(() =>
    trpc.votes.cast.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.votes.pathFilter()),
    }),
  );
  const clock = useSubscription(() => trpc.clock.subscriptionOptions());

  return (
    <main class={ui.page}>
      <div class={ui.card}>
        <div class={ui.header}>
          <div>
            <div class={ui.title}>Solid</div>
            <div class={ui.description}>@trpc12/tanstack-solid-query</div>
          </div>
          <span class={ui.badge} data-testid="clock">
            {clock.data ? `tick ${clock.data.tick}` : 'connecting'}
          </span>
        </div>
        <ul class={ui.content}>
          <For each={frameworks}>
            {(framework) => (
              <li class={ui.row}>
                <span>{framework}</span>
                <span data-testid={`votes-${framework}`}>
                  {votes.data ? String(votes.data[framework]) : '…'}
                </span>
              </li>
            )}
          </For>
        </ul>
        <div class={ui.footer}>
          <button
            class={ui.button}
            disabled={vote.isPending}
            onClick={() => vote.mutate({ framework: 'solid' })}
          >
            Vote for Solid
          </button>
          <a class={ui.link} href="/">
            All pages
          </a>
        </div>
      </div>
    </main>
  );
}

export function App(props: { client: Client; queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={props.queryClient}>
      <TrpcProvider client={props.client}>
        <Poll />
      </TrpcProvider>
    </QueryClientProvider>
  );
}
