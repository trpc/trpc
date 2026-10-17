<script lang="ts">
  import { createSubscription } from '@trpc12/tanstack-svelte-query';
  import { useTrpc, useTrpcClient } from './trpc.ts';

  let { onClient }: { onClient: (client: unknown) => void } = $props();

  // svelte-ignore state_referenced_locally
  onClient(useTrpcClient());
  const trpc = useTrpc();
  const failing = createSubscription(() =>
    trpc.clock.countdown.subscriptionOptions({ input: { from: 0 } }),
  );
</script>

<p class="error">{failing.error?.code}</p>
