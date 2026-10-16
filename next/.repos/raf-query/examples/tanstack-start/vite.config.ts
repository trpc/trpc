import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig((env) => ({
	plugins: [
		tailwindcss(),
		tanstackStart(),
		nitro(),
		react(),
		babel({ presets: [reactCompilerPreset()] }),
	],
	resolve: {
		tsconfigPaths: true,
	},
	server: {
		// CodeSandbox serves the dev server at `<id>-<port>.csb.app`.
		allowedHosts: [".csb.app"],
	},
	// Bundle every dependency into the server build. Vite would keep the ones
	// it can resolve from here (`react`) external and inline the ones it can't
	// (Base UI's `use-sync-external-store`, CommonJS), leaving its
	// `require("react")` as `createRequire`, which Nitro's bundle can't follow:
	// on Vercel, with no `node_modules`, every request failed.
	ssr: env.command === "build" ? { noExternal: true } : {},
}));
