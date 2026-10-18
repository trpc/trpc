<script lang="ts">
  import { QueryClientProvider, type QueryClient } from '@tanstack/svelte-query';
  import type { Client } from '../trpc.ts';
  import Poll from './Poll.svelte';
  import { setTrpcContext } from './trpc.ts';

  let { client, queryClient }: { client: Client; queryClient: QueryClient } =
    $props();
  // Context is set once, at init; a new client means a new App.
  // svelte-ignore state_referenced_locally
  setTrpcContext(client);
</script>

<QueryClientProvider client={queryClient}>
  <Poll />
</QueryClientProvider>
