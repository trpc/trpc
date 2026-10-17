<!--
@component
Provides a client to its children, as `setQueryClient` does:

```svelte
<QueryClientProvider client={queryClient}>
	{@render children()}
</QueryClientProvider>
```
-->
<script lang="ts">
	import type { QueryClient } from "@raf-query/core";
	import type { Snippet } from "svelte";

	import { setQueryClient } from "./provider.ts";

	const props: {
		readonly children: Snippet;
		readonly client: QueryClient<unknown>;
	} = $props();

	// svelte-ignore state_referenced_locally
	setQueryClient(props.client);
</script>

{@render props.children()}
