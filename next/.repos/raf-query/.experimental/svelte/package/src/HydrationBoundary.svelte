<!--
@component
Writes a server's `dehydrate(qc)` into the provided client before its
children render, and again whenever `state` changes. Entries the client
already has only take newer data; pending entries resume the server's
request.

```svelte
<HydrationBoundary state={data.state}>
	<Post post={data.post} />
</HydrationBoundary>
```
-->
<script lang="ts">
	import {
		type DehydratedState,
		hydrate,
		type HydrateOptions,
	} from "@raf-query/core";
	import { type Snippet, untrack } from "svelte";

	import { useQueryClient } from "./provider.ts";

	const props: {
		readonly children: Snippet;
		readonly options?: HydrateOptions;
		readonly state: DehydratedState;
	} = $props();

	const client = useQueryClient();
	// svelte-ignore state_referenced_locally
	let hydrated = props.state;
	untrack(() => {
		hydrate(client, hydrated, props.options);
	});
	$effect.pre(() => {
		const state = props.state;
		if (state !== hydrated) {
			hydrated = state;
			untrack(() => {
				hydrate(client, state, props.options);
			});
		}
	});
</script>

{@render props.children()}
