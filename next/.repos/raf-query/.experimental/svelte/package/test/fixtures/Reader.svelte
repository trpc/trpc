<script lang="ts" generics="T">
	const props: {
		readonly text: (value: T) => string;
		readonly use: () => T;
	} = $props();

	// svelte-ignore state_referenced_locally
	const value = props.use();
</script>

<p>{props.text(value)}</p>
