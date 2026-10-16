import { defineConfig } from "vite-plus";

export default defineConfig({
	pack: {
		entry: [
			"src/index.ts",
			"src/index-react-server.ts",
			"src/devtools.tsx",
			"src/tanstack-router.ts",
			"src/tanstack-router-browser.ts",
		],
		unbundle: true,
	},
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
