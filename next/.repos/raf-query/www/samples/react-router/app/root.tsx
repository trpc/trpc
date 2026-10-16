import { QueryClient, QueryClientProvider } from "@raf-query/react";
import { QueryDevtools } from "@raf-query/react/devtools";
import { type ReactNode, useState } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import { queryClientContext } from "~/query-client.ts";

import type { Route } from "./+types/root";

// #region middleware
export const middleware: Array<Route.MiddlewareFunction> = [
	({ context }) => {
		context.set(queryClientContext, new QueryClient());
	},
];
// #endregion middleware

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
	const [queryClient] = useState(
		() => new QueryClient({ defaults: { staleTime: 5000 } }),
	);
	return (
		<QueryClientProvider client={queryClient}>
			<Outlet />
			{import.meta.env.DEV ? <QueryDevtools /> : null}
		</QueryClientProvider>
	);
}
// #endregion app
