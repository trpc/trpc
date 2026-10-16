/// <reference types="vite/client" />
import { ThemeProvider } from "@examples/kit/components/theme-provider";
import type { QueryClient } from "@raf-query/react";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import {
	AnnouncementBar,
	announcementScript,
} from "~/components/announcement-bar.tsx";
import { SiteFooter } from "~/components/site-footer.tsx";
import { SiteHeader } from "~/components/site-header.tsx";
import { themeScript } from "~/components/theme-toggle.tsx";
import { frameworkModeScript } from "~/framework-mode.ts";
import { site } from "~/site.ts";
import appCss from "~/styles.css?url";

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	head: () => ({
		links: [
			{ href: appCss, rel: "stylesheet" },
			{ href: "/favicon.svg", rel: "icon", type: "image/svg+xml" },
			{ href: "/llms.txt", rel: "alternate", type: "text/plain" },
			{
				href: "/sitemap.xml",
				rel: "sitemap",
				title: "Sitemap",
				type: "application/xml",
			},
		],
		meta: [
			{ charSet: "utf8" },
			{ content: "width=device-width, initial-scale=1", name: "viewport" },
			{ content: "light dark", name: "color-scheme" },
			{
				content: "#ffffff",
				media: "(prefers-color-scheme: light)",
				name: "theme-color",
			},
			{
				content: "#0a0a0a",
				media: "(prefers-color-scheme: dark)",
				name: "theme-color",
			},
			{ content: site.name, name: "application-name" },
		],
		scripts: [
			{ children: themeScript },
			{ children: announcementScript },
			{ children: frameworkModeScript },
		],
	}),
	component: Outlet,
	shellComponent: RootDocument,
});

function RootDocument(props: { readonly children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body className="flex min-h-screen flex-col antialiased">
				<ThemeProvider storageKey="raf-query-docs:theme">
					<a
						className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
						href="#content"
					>
						Skip to content
					</a>
					<AnnouncementBar />
					<SiteHeader />
					<div className="flex-1" id="content">
						{props.children}
					</div>
					<SiteFooter />
				</ThemeProvider>
				<Scripts />
			</body>
		</html>
	);
}
