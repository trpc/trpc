/**
 * Writes the build as Vercel Build Output (https://vercel.com/docs/build-output-api/v3)
 * in `.vercel/output`, which Vercel deploys as is. `vercel.json` can't do
 * content negotiation: its rewrites run only when no file matches the URL,
 * and every page is a file. Routes here run before the files, so a page's URL
 * answers `Accept: text/markdown` with the page's markdown.
 */
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { site } from "../src/site.ts";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, ".vercel/output");
const staticDir = path.join(output, "static");

rmSync(output, { force: true, recursive: true });
mkdirSync(output, { recursive: true });
cpSync(path.join(root, "dist/client"), staticDir, { recursive: true });

const contentTypes = new Map([
	[".html", "text/html; charset=utf-8"],
	[".md", "text/markdown; charset=utf-8"],
	[".txt", "text/plain; charset=utf-8"],
]);

/**
 * Prerendering writes `/docs/caching` as `docs/caching/index.html`; serve it
 * at `/docs/caching`, without a trailing slash. Markdown and text files get a
 * `charset`, so non-ASCII characters survive.
 */
const overrides = Object.fromEntries(
	readdirSync(staticDir, { encoding: "utf8", recursive: true }).flatMap(
		(entry) => {
			const file = entry.split(path.sep).join("/");
			const contentType = contentTypes.get(path.extname(file));
			if (!contentType || file === "index.html" || file === "404.html") {
				return [];
			}
			return file.endsWith("/index.html")
				? [[file, { contentType, path: file.slice(0, -"/index.html".length) }]]
				: [[file, { contentType }]];
		},
	),
);

const acceptsMarkdown = [
	{ key: "accept", type: "header", value: "(.*)text/markdown(.*)" },
];

const routes = [
	{ headers: { Location: "/$1" }, src: "^/(.+)/$", status: 308 },
	{ headers: { Location: "/$1" }, src: "^/(.+)\\.html$", status: 308 },
	{ headers: { Location: "/docs/overview" }, src: "^/docs$", status: 307 },
	{
		headers: { Location: "/docs/react-server-components$1" },
		src: "^/docs/nextjs(\\.md)?$",
		status: 308,
	},
	{
		continue: true,
		headers: { "Cache-Control": "public, max-age=31536000, immutable" },
		src: "^/assets/.*$",
	},
	{
		continue: true,
		headers: {
			"Cache-Control":
				"public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
		},
		src: "^/(?!assets/).*$",
	},
	{
		continue: true,
		headers: {
			"Referrer-Policy": "strict-origin-when-cross-origin",
			"X-Content-Type-Options": "nosniff",
		},
		src: "^/.*$",
	},
	{
		continue: true,
		headers: {
			Link: '</llms.txt>; rel="alternate"; type="text/markdown"',
			Vary: "Accept",
		},
		src: "^/$",
	},
	{
		continue: true,
		headers: {
			Link: '</docs/$1.md>; rel="alternate"; type="text/markdown"',
			Vary: "Accept",
		},
		src: "^/docs/([\\w-]+)$",
	},
	{
		continue: true,
		headers: { Link: `<${site.url}/docs/$1>; rel="canonical"` },
		src: "^/docs/([\\w-]+)\\.md$",
	},
	{ dest: "/index.md", has: acceptsMarkdown, src: "^/$" },
	{ dest: "/docs/$1.md", has: acceptsMarkdown, src: "^/docs/([\\w-]+)$" },
	{ handle: "filesystem" },
	{ handle: "error" },
	{ dest: "/404.md", has: acceptsMarkdown, src: "^/.*$", status: 404 },
	{ dest: "/404.html", src: "^/.*$", status: 404 },
];

writeFileSync(
	path.join(output, "config.json"),
	`${JSON.stringify({ overrides, routes, version: 3 }, null, "\t")}\n`,
);
