import { buttonVariants } from "@examples/ui/components/button";
import { cn } from "@examples/ui/lib/utils";
import { Link } from "@tanstack/react-router";

import { firstDoc } from "~/content/docs.ts";

export function NotFound() {
	return (
		<main className="mx-auto grid max-w-xl place-items-center gap-4 px-6 py-24 text-center">
			<p className="font-mono text-sm text-muted-foreground">404</p>
			<h1 className="text-3xl font-semibold tracking-tight">
				This page isn’t in the cache
			</h1>
			<p className="text-muted-foreground">
				Or anywhere else. It may have moved; the docs are a search away.
			</p>
			<div className="flex gap-2">
				<Link
					className={cn(buttonVariants())}
					params={{ slug: firstDoc }}
					to="/docs/$slug"
				>
					Read the docs
				</Link>
				<Link className={cn(buttonVariants({ variant: "outline" }))} to="/">
					Home
				</Link>
			</div>
		</main>
	);
}
