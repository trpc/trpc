import { Avatar, AvatarFallback } from "@examples/ui/components/avatar";
import { Card, CardContent } from "@examples/ui/components/card";
import { Skeleton } from "@examples/ui/components/skeleton";
import {
	type QueryHandle,
	useQuery,
} from "@raf-query/experimental-tanstack-react-query";
import { use } from "react";

import { assigneeQuery } from "~/queries.ts";

function initials(name: string) {
	return name
		.split(" ")
		.map((part) => part[0])
		.join("");
}

export function AssigneeCard(props: {
	readonly handle: QueryHandle<typeof assigneeQuery>;
}) {
	const [userPromise] = useQuery(assigneeQuery, props.handle);
	const user = use(userPromise);
	if (!user) {
		return null;
	}

	return (
		<Card className="py-4">
			<CardContent className="flex items-center gap-3 px-4">
				<Avatar>
					<AvatarFallback>{initials(user.name)}</AvatarFallback>
				</Avatar>
				<div className="grid">
					<span className="text-xs text-muted-foreground">Assignee</span>
					<span className="font-medium">{user.name}</span>
					<span className="text-xs text-muted-foreground">{user.title}</span>
				</div>
			</CardContent>
		</Card>
	);
}

export function AssigneeCardSkeleton() {
	return <Skeleton className="h-[74px]" />;
}
