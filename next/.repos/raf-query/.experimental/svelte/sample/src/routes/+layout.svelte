<script lang="ts">
	import { QueryClient, QueryClientProvider } from "@raf-query/experimental-svelte";

	import type { LayoutProps } from "./$types";

	const props: LayoutProps = $props();
	const queryClient = new QueryClient();
</script>

<QueryClientProvider client={queryClient}>
	{@render props.children()}
</QueryClientProvider>
