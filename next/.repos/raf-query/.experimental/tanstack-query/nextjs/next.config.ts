import type { NextConfig } from "next";

export default {
	reactCompiler: true,
	transpilePackages: [
		"@examples/api",
		"@examples/db",
		"@examples/kit",
		"@examples/ui",
		"@raf-query/experimental-tanstack-react-query",
	],
} satisfies NextConfig;
