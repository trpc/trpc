import type { NextConfig } from "next";

export default {
	// CodeSandbox serves the dev server at `<id>-<port>.csb.app`.
	allowedDevOrigins: ["*.csb.app"],
	reactCompiler: true,
	// `/issues…` without a verb: the same page under `/prefetch`.
	redirects: () =>
		Promise.resolve([
			{
				destination: "/prefetch/issues",
				permanent: false,
				source: "/issues",
			},
			{
				destination: "/prefetch/issues/:path+",
				permanent: false,
				source: "/issues/:path+",
			},
		]),
	transpilePackages: [
		"@examples/api",
		"@examples/db",
		"@examples/kit",
		"@examples/ui",
		"@raf-query/core",
		"@raf-query/react",
	],
} satisfies NextConfig;
