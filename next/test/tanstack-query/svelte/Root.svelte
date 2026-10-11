<script lang="ts">
  import { QueryClientProvider, type QueryClient } from '@tanstack/svelte-query';
  import type { Component } from 'svelte';
  import type { TRPCClient } from 'trpcdev/client';
  import type { AppRouter } from '../fixtures/app.ts';
  import { setTRPCContext } from './trpc.ts';

  let {
    queryClient,
    client,
    app: App,
    props = {},
  }: {
    queryClient: QueryClient;
    client: TRPCClient<AppRouter>;
    app: Component<any>;
    props?: Record<string, unknown>;
  } = $props();

  // svelte-ignore state_referenced_locally
  setTRPCContext(client);
</script>

<QueryClientProvider client={queryClient}>
  <App {...props} />
</QueryClientProvider>
