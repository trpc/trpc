import {
	applyStaleTime,
	DEFAULT_STALE_TIME,
	type LoaderVerb,
	queryTimeDefaults,
	type QueryTimeDefaults,
} from "@examples/db/types";
import { AppHeader } from "@examples/kit/components/app-header";
import { Logo } from "@examples/kit/components/logo";
import { NavigationProgress } from "@examples/kit/components/navigation-progress";
import { loaderVerbOf } from "@examples/kit/lib/loader-verb";
import { ThemeProvider } from "@examples/kit/components/theme-provider";
import { Toaster } from "@examples/ui/components/sonner";
import { logoUrl } from "@examples/kit/lib/logo";
import {
	QueryClient,
	QueryClientProvider,
	useQueryClient,
} from "@raf-query/react";
import { QueryDevtools } from "@raf-query/react/devtools";
import { useState } from "react";
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useLocation,
	useNavigation,
} from "react-router";

import { AppLink, PrefetchContext } from "~/components/app-link.tsx";
import { Settings } from "~/components/settings.tsx";
import { createAppQueryClient, queryClientContext } from "~/query-client.ts";
import {
	DEFAULT_PREFETCH,
	type Prefetch,
	readPrefetch,
	readStaleTime,
	withRequest,
} from "~/settings.ts";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
	{ href: logoUrl, rel: "icon", type: "image/svg+xml" },
];

/** One query client per request, for every loader the request runs. */
export const middleware: Array<Route.MiddlewareFunction> = [
	(args) => {
		const client = withRequest(args.request, createAppQueryClient);
		args.context.set(queryClientContext, client.queryClient);
	},
];

export function loader(args: Route.LoaderArgs) {
	return withRequest(args.request, () => ({
		prefetch: readPrefetch(),
		staleTime: readStaleTime() ?? DEFAULT_STALE_TIME,
	}));
}

export function Layout(props: { readonly children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<meta charSet="utf-8" />
				<meta content="width=device-width, initial-scale=1" name="viewport" />
				<title>Issues · raf-query on React Router</title>
				<Meta />
				<Links />
			</head>
			<body className="min-h-screen antialiased">
				<ThemeProvider>{props.children}</ThemeProvider>
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App(props: Route.ComponentProps) {
	const [{ queryClient, queryDefaults }] = useState(() => {
		const defaults = queryTimeDefaults(props.loaderData.staleTime);
		const client = new QueryClient({ defaults });
		// The cache reads this object live. A server client leaves `gcTime` unset.
		if (!client.isServer) {
			applyStaleTime(defaults, props.loaderData.staleTime);
		}
		return { queryClient: client, queryDefaults: defaults };
	});
	const verb = loaderVerbOf(useLocation().pathname);
	const navigating = useNavigation().state !== "idle";
	const [prefetch, setPrefetch] = useState(
		() => props.loaderData.prefetch ?? DEFAULT_PREFETCH,
	);

	return (
		<QueryClientProvider client={queryClient}>
			<PrefetchContext value={prefetch}>
				{navigating ? <NavigationProgress /> : null}
				<AppHeader
					brand={
						<AppLink
							className="flex shrink-0 items-center gap-2.5 font-semibold"
							to={`/${verb}/issues`}
						>
							<Logo alt="" />
							Issues
						</AppLink>
					}
					framework="React Router"
					loaders="server"
					settings={
						<AppSettings
							onPrefetchChange={setPrefetch}
							prefetch={prefetch}
							queryDefaults={queryDefaults}
							verb={verb}
						/>
					}
					verb={verb}
				/>
				<main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
					<Outlet />
				</main>
			</PrefetchContext>
			<QueryDevtools />
			<Toaster closeButton position="bottom-right" richColors />
		</QueryClientProvider>
	);
}

function AppSettings(props: {
	readonly onPrefetchChange: (prefetch: Prefetch) => void;
	readonly prefetch: Prefetch;
	readonly queryDefaults: QueryTimeDefaults;
	readonly verb: LoaderVerb;
}) {
	const queryClient = useQueryClient();
	return (
		<Settings
			onPrefetchChange={props.onPrefetchChange}
			onReset={() => {
				queryClient.clear();
				window.location.reload();
			}}
			prefetch={props.prefetch}
			queryDefaults={props.queryDefaults}
			verb={props.verb}
		/>
	);
}

export function ErrorBoundary(props: Route.ErrorBoundaryProps) {
	let message = "Oops!";
	let details = "An unexpected error occurred.";
	let stack: string | undefined;

	if (isRouteErrorResponse(props.error)) {
		message = props.error.status === 404 ? "404" : "Error";
		details =
			props.error.status === 404
				? "The requested page could not be found."
				: props.error.statusText || details;
	} else if (
		import.meta.env.DEV &&
		props.error &&
		props.error instanceof Error
	) {
		details = props.error.message;
		stack = props.error.stack;
	}

	return (
		<main className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
			<h1 className="text-2xl font-semibold">{message}</h1>
			<p className="mt-2 text-muted-foreground">{details}</p>
			{stack ? (
				<pre className="mt-4 w-full overflow-x-auto rounded-lg border p-4 text-sm">
					<code>{stack}</code>
				</pre>
			) : null}
		</main>
	);
}
