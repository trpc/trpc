import { Skeleton } from "@examples/ui/components/skeleton";

/** The title, date, and description while the issue loads. The id is in the URL. */
export function IssueBodySkeleton(props: { readonly id: number }) {
	return (
		<div className="grid gap-6">
			<div className="flex items-baseline gap-2">
				<Skeleton className="h-9 min-w-0 flex-1" />
				<span className="shrink-0 text-lg text-muted-foreground">
					#{props.id}
				</span>
			</div>
			<Skeleton className="h-5 w-40" />
			<Skeleton className="h-28" />
		</div>
	);
}

export function StatusSkeleton() {
	return <Skeleton className="h-6 w-24 rounded-full" />;
}
