<template>
	<!-- #region app -->
	<RouterView v-slot="{ Component }">
		<Suspense>
			<component :is="Component" />
			<template #fallback>Loading…</template>
		</Suspense>
	</RouterView>
	<!-- #endregion app -->
</template>
