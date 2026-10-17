<script lang="ts">
	import type { createBackend } from "../test-utils.ts";
	import { useQuery } from "../../src/use-query.svelte.ts";
	import { useWaterfall } from "../../src/use-waterfall.svelte.ts";

	const props: {
		readonly assigneeId: number;
		readonly userQuery: ReturnType<typeof createBackend>["userQuery"];
	} = $props();

	// svelte-ignore state_referenced_locally
	const user = useWaterfall(props.userQuery, () => ({ id: props.assigneeId }));
	// svelte-ignore state_referenced_locally
	const name = useQuery(props.userQuery, user);
</script>

<span>{name.data ?? "…"}</span>
