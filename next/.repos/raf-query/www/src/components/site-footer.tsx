import { Link } from "@tanstack/react-router";

import { site } from "~/site.ts";

export function SiteFooter() {
	return (
		<footer className="border-t">
			<div className="mx-auto grid max-w-7xl gap-2 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex md:items-center md:justify-between">
				<p>
					raf-query is MIT licensed. Its cache follows the design of{" "}
					<a
						className="font-medium text-foreground underline-offset-4 hover:underline"
						href="https://tanstack.com/query"
					>
						TanStack Query
					</a>{" "}
					by Tanner Linsley and the TanStack team.{" "}
					<Link
						className="font-medium text-foreground underline-offset-4 hover:underline"
						params={{ slug: "credits" }}
						to="/docs/$slug"
					>
						Credits
					</Link>
				</p>
				<nav aria-label="Footer" className="flex gap-4">
					<a className="hover:text-foreground" href={site.github}>
						GitHub
					</a>
					<a className="hover:text-foreground" href={site.npm}>
						npm
					</a>
					<a className="hover:text-foreground" href="/llms.txt">
						llms.txt
					</a>
				</nav>
			</div>
		</footer>
	);
}
