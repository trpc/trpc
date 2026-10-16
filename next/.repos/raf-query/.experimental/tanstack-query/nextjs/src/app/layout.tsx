import "./globals.css";

import { QueryProvider } from "@raf-query/experimental-tanstack-react-query/next";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { queryClientConfig } from "~/query-client.ts";

export const metadata = {
	title: "Issues · raf-query on TanStack Query + Next.js",
} satisfies Metadata;

export default function RootLayout(props: { readonly children: ReactNode }) {
	return (
		<html lang="en">
			<body className="min-h-screen antialiased">
				<header className="border-b">
					<nav className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
						<Link className="font-semibold" href="/issues">
							Issues
						</Link>
						<span className="ml-auto text-sm text-muted-foreground">
							raf-query · TanStack Query · Next.js
						</span>
					</nav>
				</header>
				<main className="mx-auto max-w-5xl px-6 py-8">
					<QueryProvider config={queryClientConfig}>
						{props.children}
					</QueryProvider>
				</main>
			</body>
		</html>
	);
}
