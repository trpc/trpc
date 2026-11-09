<script lang="ts">
  import { QueryClientProvider, type QueryClient } from '@tanstack/svelte-query';
  import type { Component } from 'svelte';
  import type { AppClient } from '../../../tanstack-query/src/fixtures/app.ts';
  import { setTrpcContext } from './trpc.ts';

  let {
    queryClient,
    client,
    app: App,
    props = {},
  }: {
    queryClient: QueryClient;
    client: AppClient;
    app: Component<any>;
    props?: Record<string, unknown>;
  } = $props();

  // svelte-ignore state_referenced_locally
  setTrpcContext(client);
</script>

<QueryClientProvider client={queryClient}>
  <App {...props} />
</QueryClientProvider>
