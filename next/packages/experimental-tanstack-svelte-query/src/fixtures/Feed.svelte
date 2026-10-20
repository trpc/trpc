<script lang="ts">
  import {
    createInfiniteQuery,
    createMutation,
    useQueryClient,
  } from '@tanstack/svelte-query';
  import { useTrpc } from './trpc.ts';

  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const feed = createInfiniteQuery(() =>
    trpc.post.list.infiniteOptions({
      input: (cursor: number | undefined) => ({ limit: 2, cursor }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor,
    }),
  );
  const create = createMutation(() =>
    trpc.post.create.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.post.list.infiniteFilter()),
    }),
  );
  const posts = $derived(feed.data?.pages.flatMap((page) => page.items) ?? []);
</script>

<ul>
  {#each posts as post (post.id)}
    <li>{post.title}</li>
  {/each}
</ul>
<button class="more" onclick={() => feed.fetchNextPage()}>more</button>
<button class="add" onclick={() => create.mutate({ title: 'From Svelte' })}>
  add
</button>
