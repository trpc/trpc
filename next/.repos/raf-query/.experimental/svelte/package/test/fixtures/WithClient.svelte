<script lang="ts" generics="P extends object">
	import type { QueryClient } from "@raf-query/core";
	import type { Component } from "svelte";

	import { setQueryClient } from "../../src/provider.ts";

	const props: {
		readonly client: QueryClient<unknown>;
		readonly component: Component<P>;
		readonly props: P;
	} = $props();

	// svelte-ignore state_referenced_locally
	setQueryClient(props.client);
</script>

<props.component {...props.props} />
