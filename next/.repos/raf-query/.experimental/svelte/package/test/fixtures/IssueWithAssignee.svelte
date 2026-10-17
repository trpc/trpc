<script lang="ts">
	import type { QueryHandle } from "@raf-query/core";

	import type { createBackend } from "../test-utils.ts";
	import { useQuery } from "../../src/use-query.svelte.ts";
	import Assignee from "./Assignee.svelte";

	type Backend = ReturnType<typeof createBackend>;

	const props: {
		readonly backend: Backend;
		readonly handle: QueryHandle<Backend["issueQuery"]>;
	} = $props();

	// svelte-ignore state_referenced_locally
	const issue = useQuery(props.backend.issueQuery, () => props.handle);
</script>

{#if issue.data}
	<p>
		{issue.data.title} by
		<Assignee
			assigneeId={issue.data.assigneeId}
			userQuery={props.backend.userQuery}
		/>
	</p>
{:else}
	<p>Loading</p>
{/if}
