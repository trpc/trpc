import { defineConfig } from "vite-plus";

// Separate from `vite.config.ts`, whose Start and markdown plugins compile the
// whole site.
export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		include: ["build/**/*.test.ts"],
		unstubGlobals: true,
	},
});
