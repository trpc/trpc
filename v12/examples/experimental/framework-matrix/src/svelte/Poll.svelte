<script lang="ts">
  import {
    createMutation,
    createQuery,
    useQueryClient,
  } from '@tanstack/svelte-query';
  import { createSubscription } from '@trpc12/experimental-tanstack-svelte-query';
  import { frameworks } from '../frameworks.ts';
  import { ui } from '../ui.ts';
  import { useTrpc } from './trpc.ts';

  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const votes = createQuery(() => trpc.votes.list.queryOptions());
  const vote = createMutation(() =>
    trpc.votes.cast.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.votes.pathFilter()),
    }),
  );
  const clock = createSubscription(() => trpc.clock.subscriptionOptions());
</script>

<main class={ui.page}>
  <div class={ui.card}>
    <div class={ui.header}>
      <div>
        <div class={ui.title}>Svelte</div>
        <div class={ui.description}>@trpc12/experimental-tanstack-svelte-query</div>
      </div>
      <span class={ui.badge} data-testid="clock">
        {clock.data ? `tick ${clock.data.tick}` : 'connecting'}
      </span>
    </div>
    <ul class={ui.content}>
      {#each frameworks as framework (framework)}
        <li class={ui.row}>
          <span>{framework}</span>
          <span data-testid="votes-{framework}">
            {votes.data ? String(votes.data[framework]) : '…'}
          </span>
        </li>
      {/each}
    </ul>
    <div class={ui.footer}>
      <button
        class={ui.button}
        disabled={vote.isPending}
        onclick={() => vote.mutate({ framework: 'svelte' })}
      >
        Vote for Svelte
      </button>
      <a class={ui.link} href="/">All pages</a>
    </div>
  </div>
</main>
