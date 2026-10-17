<script lang="ts" generics="T">
	import type { QueryClient } from "@raf-query/core";

	import { setQueryClient } from "../../src/provider.ts";
	import Reader from "./Reader.svelte";

	const props: {
		readonly client: QueryClient<unknown>;
		readonly text: (value: T) => string;
		readonly use: () => T;
	} = $props();

	// svelte-ignore state_referenced_locally
	setQueryClient(props.client);
</script>

<Reader text={props.text} use={props.use} />
