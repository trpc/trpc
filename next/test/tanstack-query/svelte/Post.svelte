<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { useTRPC } from './trpc.ts';

  const trpc = useTRPC();
  let id = $state('1');
  const post = createQuery(() =>
    trpc.post.byId.queryOptions({ input: { id } }),
  );
</script>

<h1>{post.data?.title}</h1>
<p>{post.error?.defined ? post.error.code : ''}</p>
<button class="three" onclick={() => (id = '3')}>3</button>
<button class="nope" onclick={() => (id = 'nope')}>nope</button>
