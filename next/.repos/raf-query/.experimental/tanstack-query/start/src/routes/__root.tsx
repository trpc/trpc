/// <reference types="vite/client" />
import type { QueryClient } from "@raf-query/experimental-tanstack-react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "~/styles.css?url";

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	head: () => ({
		links: [{ href: appCss, rel: "stylesheet" }],
		meta: [
			{ charSet: "utf8" },
			{ content: "width=device-width, initial-scale=1", name: "viewport" },
			{ title: "Issues · raf-query on TanStack Query + Start" },
		],
	}),
	component: Outlet,
	notFoundComponent: () => (
		<p className="text-muted-foreground">Nothing here.</p>
	),
	shellComponent: RootDocument,
});

function RootDocument(props: { readonly children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body className="min-h-screen antialiased">
				<header className="border-b">
					<nav className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
						<Link className="font-semibold" to="/issues">
							Issues
						</Link>
						<span className="ml-auto text-sm text-muted-foreground">
							raf-query · TanStack Query · TanStack Start
						</span>
					</nav>
				</header>
				<main className="mx-auto max-w-5xl px-6 py-8">{props.children}</main>
				<Scripts />
			</body>
		</html>
	);
}
