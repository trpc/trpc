import { buttonVariants } from "@examples/ui/components/button";
import { cn } from "@examples/ui/lib/utils";
import { Logo } from "@examples/kit/components/logo";
import { Link } from "@tanstack/react-router";

import { firstDoc } from "~/content/docs.ts";
import { site } from "~/site.ts";

import { GitHubIcon } from "./icons.tsx";
import { MobileNav } from "./mobile-nav.tsx";
import { SearchButton } from "./search.tsx";
import { ThemeToggle } from "./theme-toggle.tsx";

export function SiteHeader() {
	return (
		<header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
			<div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:px-6">
				<MobileNav />
				<Link
					aria-label={`${site.name} home`}
					className="mr-4 flex items-center gap-2 font-semibold tracking-tight"
					to="/"
				>
					<Logo alt="" />
					{site.name}
				</Link>
				<nav
					aria-label="Main"
					className="hidden items-center gap-1 text-sm md:flex"
				>
					<Link
						activeProps={{ className: "text-foreground" }}
						className={cn(
							buttonVariants({ size: "sm", variant: "ghost" }),
							"text-muted-foreground",
						)}
						params={{ slug: firstDoc }}
						to="/docs/$slug"
					>
						Docs
					</Link>
					<Link
						className={cn(
							buttonVariants({ size: "sm", variant: "ghost" }),
							"text-muted-foreground",
						)}
						params={{ slug: "examples" }}
						to="/docs/$slug"
					>
						Examples
					</Link>
					<Link
						className={cn(
							buttonVariants({ size: "sm", variant: "ghost" }),
							"text-muted-foreground",
						)}
						params={{ slug: "api-reference" }}
						to="/docs/$slug"
					>
						API
					</Link>
				</nav>
				<div className="ml-auto flex items-center gap-1">
					<SearchButton />
					<a
						aria-label="raf-query on GitHub"
						className={cn(
							buttonVariants({ size: "icon-sm", variant: "ghost" }),
						)}
						href={site.github}
						title="raf-query on GitHub"
					>
						<GitHubIcon />
					</a>
					<ThemeToggle />
				</div>
			</div>
		</header>
	);
}
