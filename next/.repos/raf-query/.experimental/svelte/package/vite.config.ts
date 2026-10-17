import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite-plus";

export default defineConfig({
	plugins: [svelte()],
	// Svelte's browser runtime for the happy-dom tests. Tests that render on
	// the server run in a node environment, which drops the condition.
	resolve: { conditions: ["module", "browser", "development|production"] },
	test: {
		clearMocks: true,
		coverage: {
			include: ["src"],
			reporter: ["html", "lcov"],
		},
		environment: "happy-dom",
		exclude: ["dist", "node_modules"],
		unstubGlobals: true,
	},
});
