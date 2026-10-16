/// <reference types="vite/client" />
import type { QueryTimeDefaults } from "@examples/db/types";
import { AppHeader } from "@examples/kit/components/app-header";
import { Logo } from "@examples/kit/components/logo";
import { NavigationProgress } from "@examples/kit/components/navigation-progress";
import { ThemeProvider } from "@examples/kit/components/theme-provider";
import { loaderVerbOf } from "@examples/kit/lib/loader-verb";
import { logoUrl } from "@examples/kit/lib/logo";
import { Toaster } from "@examples/ui/components/sonner";
import type { QueryClient } from "@raf-query/react";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	Scripts,
	useLocation,
	useRouter,
	useRouterState,
} from "@tanstack/react-router";
import { type ReactNode, useState } from "react";

import { Settings } from "~/components/settings.tsx";
import { readPrefetch, toDefaultPreload } from "~/settings.ts";
import appCss from "~/styles.css?url";

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
	queryDefaults: QueryTimeDefaults;
}>()({
	head: () => ({
		links: [
			{ href: appCss, rel: "stylesheet" },
			{ href: logoUrl, rel: "icon", type: "image/svg+xml" },
		],
		meta: [
			{ charSet: "utf8" },
			{ content: "width=device-width, initial-scale=1", name: "viewport" },
			{ title: "Issues · raf-query on TanStack Start" },
		],
	}),
	component: Outlet,
	notFoundComponent: () => (
		<p className="text-muted-foreground">Nothing here.</p>
	),
	shellComponent: RootDocument,
});

function RootDocument(props: { readonly children: ReactNode }) {
	const router = useRouter();
	const [prefetch, setPrefetch] = useState(readPrefetch);
	const verb = loaderVerbOf(
		useLocation({ select: (location) => location.pathname }),
	);
	const navigating = useRouterState({
		select: (state) => state.status === "pending",
	});

	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body className="min-h-screen antialiased">
				<ThemeProvider>
					{navigating ? <NavigationProgress /> : null}
					<AppHeader
						brand={
							<Link
								className="flex shrink-0 items-center gap-2.5 font-semibold"
								key={prefetch}
								to={`/${verb}/issues`}
							>
								<Logo alt="" />
								Issues
							</Link>
						}
						framework="TanStack Start"
						loaders="browser"
						settings={
							<Settings
								onPrefetchChange={(next) => {
									router.update({
										...router.options,
										defaultPreload: toDefaultPreload(next),
									});
									setPrefetch(next);
								}}
								onReset={() => {
									router.options.context.queryClient.clear();
									router.clearCache();
									window.location.reload();
								}}
								prefetch={prefetch}
								queryDefaults={router.options.context.queryDefaults}
								verb={verb}
							/>
						}
						verb={verb}
					/>
					{/* Remounts the page, so every `Link` picks up a new prefetch setting. */}
					<main
						className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8"
						key={prefetch}
					>
						{props.children}
					</main>
					<Toaster closeButton position="bottom-right" richColors />
				</ThemeProvider>
				<Scripts />
			</body>
		</html>
	);
}
