import { Link } from "@tanstack/react-router";

import { sections } from "~/content/docs.ts";

export function DocsNav(props: { readonly onNavigate?: () => void }) {
	return (
		<nav aria-label="Documentation" className="grid gap-6 text-sm">
			{sections.map((section) => (
				<div key={section.title}>
					<h2 className="mb-2 px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						{section.title}
					</h2>
					<ul className="grid gap-0.5">
						{section.docs.map((doc) => (
							<li key={doc.slug}>
								<Link
									activeProps={{
										"aria-current": "page",
										className: "bg-accent font-medium text-foreground",
									}}
									className="block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
									onClick={props.onNavigate}
									params={{ slug: doc.slug }}
									to="/docs/$slug"
								>
									{doc.title}
								</Link>
							</li>
						))}
					</ul>
				</div>
			))}
		</nav>
	);
}
