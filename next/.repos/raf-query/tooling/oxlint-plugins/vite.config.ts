import { defineConfig } from "vite-plus";

export default defineConfig({
	pack: {
		entry: [
			"workspace.ts",
			"anti-slop/index.ts",
			"anti-slop/effect/index.ts",
			"nkzw/index.ts",
		],
		format: "esm",
		outExtensions: () => ({ js: ".js" }),
	},
	test: {
		include: ["**/*.test.ts"],
		exclude: ["dist", "node_modules"],
	},
});
