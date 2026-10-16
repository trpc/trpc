import { createFileRoute, Outlet } from "@tanstack/react-router";

import { DocsNav } from "~/components/docs-nav.tsx";

export const Route = createFileRoute("/docs")({
	component: DocsLayout,
});

function DocsLayout() {
	return (
		<div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 md:grid-cols-[14rem_minmax(0,1fr)]">
			<aside className="hidden md:block">
				<div className="sticky top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto py-8 pr-2">
					<DocsNav />
				</div>
			</aside>
			<Outlet />
		</div>
	);
}
