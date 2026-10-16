import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [tailwindcss(), reactRouter()],
	resolve: {
		tsconfigPaths: true,
	},
	server: {
		// CodeSandbox serves the dev server at `<id>-<port>.csb.app`.
		allowedHosts: [".csb.app"],
		port: 3006,
	},
});
