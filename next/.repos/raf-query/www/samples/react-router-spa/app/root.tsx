import { QueryClientProvider } from "@raf-query/react";
import { QueryDevtools } from "@raf-query/react/devtools";
import type { ReactNode } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import { queryClient } from "~/query-client.ts";

export function Layout(props: { readonly children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<Meta />
				<Links />
			</head>
			<body>
				{props.children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

// #region app
export default function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<Outlet />
			{import.meta.env.DEV ? <QueryDevtools /> : null}
		</QueryClientProvider>
	);
}

// Rendered into index.html at build time, until the first clientLoader is done.
export function HydrateFallback() {
	return <p>Loading…</p>;
}
// #endregion app
