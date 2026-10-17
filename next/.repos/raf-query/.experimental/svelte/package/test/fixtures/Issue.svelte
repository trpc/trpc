<script lang="ts">
	import type { QueryHandle } from "@raf-query/core";

	import type { createBackend } from "../test-utils.ts";
	import { useQuery } from "../../src/use-query.svelte.ts";

	type Backend = ReturnType<typeof createBackend>;

	const props: {
		readonly backend: Backend;
		readonly handle: QueryHandle<Backend["issueQuery"]>;
	} = $props();

	// svelte-ignore state_referenced_locally
	const issue = useQuery(props.backend.issueQuery, () => props.handle);
</script>

<p>{issue.data?.title ?? "Loading"}</p>
