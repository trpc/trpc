<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { createSubscription } from '@trpc12/experimental-tanstack-svelte-query';
  import { useTrpc } from './trpc.ts';

  const trpc = useTrpc();
  const post = createQuery(() =>
    trpc.post.byId.queryOptions({ input: { id: '3' } }),
  );
  const added = createSubscription(() => trpc.post.onAdd.subscriptionOptions());
</script>

<h1>{post.data?.createdAt.toISOString().slice(0, 10)}</h1>
<p>{added.status}</p>
