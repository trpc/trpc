<script lang="ts">
  import { QueryClientProvider, type QueryClient } from '@tanstack/svelte-query';
  import type { Component } from 'svelte';
  import type { TrpcClient } from 'trpcdev/client';
  import type { AppRouter } from '../fixtures/app.ts';
  import { setTrpcContext } from './trpc.ts';

  let {
    queryClient,
    client,
    app: App,
    props = {},
  }: {
    queryClient: QueryClient;
    client: TrpcClient<AppRouter>;
    app: Component<any>;
    props?: Record<string, unknown>;
  } = $props();

  // svelte-ignore state_referenced_locally
  setTrpcContext(client);
</script>

<QueryClientProvider client={queryClient}>
  <App {...props} />
</QueryClientProvider>
