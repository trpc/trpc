import type { QueryClient } from "@raf-query/core";
import {
	type App,
	defineComponent,
	inject,
	type InjectionKey,
	onMounted,
	onUnmounted,
	provide,
} from "vue";

/**
 * A composable can't know which services the provided client has, so its
 * verbs take any factory here.
 */
const queryClientKey: InjectionKey<QueryClient<unknown>> = Symbol(
	"@raf-query/experimental-vue QueryClient",
);

/**
 * Provide a client to this component's descendants, and refetch its read,
 * stale queries on window focus and reconnect while the component is
 * mounted. Call it in `setup`.
 */
export function provideQueryClient(client: QueryClient<unknown>): void {
	provide(queryClientKey, client);
	let unmount: (() => void) | undefined;
	onMounted(() => {
		unmount = client.mount();
	});
	onUnmounted(() => {
		unmount?.();
	});
}

/**
 * Provides a client to its slot, as {@link provideQueryClient} does:
 *
 * ```vue
 * <QueryClientProvider :client="queryClient">
 *   <RouterView />
 * </QueryClientProvider>
 * ```
 */
export const QueryClientProvider = defineComponent(
	(props: { readonly client: QueryClient<unknown> }, context) => {
		provideQueryClient(props.client);
		return () => context.slots.default?.();
	},
	{ name: "QueryClientProvider", props: ["client"] },
);

/**
 * Installs a client on a Vue app for every component, and in the browser
 * refetches read, stale queries on window focus and reconnect until the
 * app unmounts:
 *
 * ```ts
 * createApp(App).use(QueryPlugin, { client: new QueryClient() });
 * ```
 */
export const QueryPlugin = {
	install(app: App, options: { readonly client: QueryClient<unknown> }) {
		const client = options.client;
		app.provide(queryClientKey, client);
		if (!client.isServer) {
			app.onUnmount(client.mount());
		}
	},
};

/** The client from {@link QueryPlugin} or the nearest {@link provideQueryClient}. */
export function useQueryClient(): QueryClient<unknown> {
	const client = inject(queryClientKey, null);
	if (!client) {
		throw new Error(
			"useQueryClient: no QueryClient provided. Install QueryPlugin on the app, or wrap the component in QueryClientProvider",
		);
	}
	return client;
}
