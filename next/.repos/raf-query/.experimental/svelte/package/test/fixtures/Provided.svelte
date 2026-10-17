<script lang="ts">
	import type { QueryClient } from "@raf-query/core";

	import QueryClientProvider from "../../src/QueryClientProvider.svelte";
	import Reader from "./Reader.svelte";

	const props: {
		readonly client: QueryClient<unknown>;
		readonly use: () => void;
	} = $props();
</script>

<QueryClientProvider client={props.client}>
	<Reader text={() => "provided"} use={props.use} />
</QueryClientProvider>
