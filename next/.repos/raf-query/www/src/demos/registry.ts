import { queryOptions } from "@raf-query/react";

import type { DemoDefinition } from "~/demo-kit/define.ts";

const modules = import.meta.glob<{ default: DemoDefinition }>([
	"./*.tsx",
	"!./*.test.tsx",
	"!./registry.ts",
]);

/**
 * A demo's code, loaded on demand. Each page's loader prefetches the demos
 * it embeds next to the page itself, so they download in parallel instead
 * of after the page renders.
 */
export function demoQuery(input: { id: string }) {
	return queryOptions({
		gcTime: Number.POSITIVE_INFINITY,
		queryFn: async () => {
			const load = modules[`./${input.id}.tsx`];
			if (!load) {
				throw new Error(`Unknown demo "${input.id}"`);
			}
			const module = await load();
			return module.default;
		},
		queryKey: ["demo", input.id],
		staleTime: Number.POSITIVE_INFINITY,
	});
}
