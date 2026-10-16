import { cn } from "@examples/ui/lib/utils";
import { useState } from "react";

import type { DocHeading } from "~/content/types.ts";

/** "On this page", highlighting the section being read. */
export function TableOfContents(props: {
	readonly headings: ReadonlyArray<DocHeading>;
}) {
	const [active, setActive] = useState<string | undefined>(undefined);
	const headings = props.headings;
	if (headings.length === 0) {
		return null;
	}
	return (
		<nav
			aria-label="On this page"
			className="text-sm"
			ref={() => {
				const visible = new Set<string>();
				const observer = new IntersectionObserver(
					(entries) => {
						for (const entry of entries) {
							if (entry.isIntersecting) {
								visible.add(entry.target.id);
							} else {
								visible.delete(entry.target.id);
							}
						}
						const first = headings.find((heading) => visible.has(heading.id));
						if (first) {
							setActive(first.id);
						}
					},
					{ rootMargin: "-56px 0px -60% 0px" },
				);
				for (const heading of headings) {
					const element = document.getElementById(heading.id);
					if (element) {
						observer.observe(element);
					}
				}
				return () => {
					observer.disconnect();
				};
			}}
		>
			<p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
				On this page
			</p>
			<ul className="grid gap-1.5 border-l">
				{headings.map((heading) => (
					<li key={heading.id}>
						<a
							aria-current={active === heading.id ? "location" : undefined}
							className={cn(
								"-ml-px block border-l border-transparent py-0.5 text-muted-foreground transition-colors hover:text-foreground",
								heading.depth === 2 ? "pl-3" : "pl-6 text-[13px]",
								active === heading.id && "border-foreground text-foreground",
							)}
							href={`#${heading.id}`}
						>
							{heading.text}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}
