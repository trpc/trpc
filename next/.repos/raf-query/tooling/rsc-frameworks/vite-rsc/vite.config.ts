import rsc from "@vitejs/plugin-rsc";
import { defineConfig } from "vite";

// `vite build && vite preview` in this directory serves the app.
export default defineConfig({
	plugins: [
		rsc({
			entries: {
				client: "./entry.browser.tsx",
				rsc: "./entry.rsc.tsx",
				ssr: "./entry.ssr.tsx",
			},
		}),
	],
});
