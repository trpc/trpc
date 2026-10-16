import type { QueryClient } from "@raf-query/react";
import { createRootRouteWithContext } from "@tanstack/react-router";

import type { IssueApi } from "~/issues.ts";

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient<IssueApi>;
}>()({});
