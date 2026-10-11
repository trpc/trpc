<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { createSubscription } from '@trpcdev/tanstack-svelte-query';
  import { useTRPC } from './trpc.ts';

  let { onCountdown }: { onCountdown: (n: number) => void } = $props();

  const trpc = useTRPC();
  let from = $state(2);
  const countdown = createSubscription(() =>
    trpc.clock.countdown.subscriptionOptions({
      input: { from },
      onData: onCountdown,
    }),
  );
  const added = createSubscription(() => trpc.post.onAdd.subscriptionOptions());
  const tick = createQuery(() =>
    trpc.clock.ticks.liveOptions({ input: { from: 40 } }),
  );
</script>

<p class="status">{countdown.status}</p>
<p class="added">{added.data?.title}</p>
<p class="tick">{tick.data}</p>
<button class="again" onclick={() => (from = 1)}>again</button>
