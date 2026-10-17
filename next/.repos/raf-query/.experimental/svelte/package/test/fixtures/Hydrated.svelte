<script lang="ts">
	import type { DehydratedState, QueryHandle } from "@raf-query/core";

	import HydrationBoundary from "../../src/HydrationBoundary.svelte";
	import type { createBackend } from "../test-utils.ts";
	import Issue from "./Issue.svelte";

	type Backend = ReturnType<typeof createBackend>;

	const props: {
		readonly backend: Backend;
		readonly handle: QueryHandle<Backend["issueQuery"]>;
		readonly state: DehydratedState;
	} = $props();
</script>

<HydrationBoundary state={props.state}>
	<Issue backend={props.backend} handle={props.handle} />
</HydrationBoundary>
