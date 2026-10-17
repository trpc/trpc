import { useQuery } from "@raf-query/react";
import { queryOptions } from "@raf-query/react";
import { use, type ReactNode } from "react";

declare function detectPushState(channel: string): Promise<"on" | "off">;

function pushStateQuery(input: { channel: string }) {
	return queryOptions({
		queryKey: ["pushState", input.channel],
		queryFn: () => detectPushState(input.channel),
		enabled: typeof window !== "undefined",
	});
}

declare const loaderData: {
	push: import("@raf-query/react").QueryHandle<typeof pushStateQuery>;
};

declare function PushSwitch(props: {
	readonly state: "on" | "off" | "unknown";
}): ReactNode;

// #region push-state
function PushState() {
	const [pushPromise, push] = useQuery(pushStateQuery, loaderData.push);
	if (push.isPending) {
		return <PushSwitch state="unknown" />;
	}
	const state = use(pushPromise);
	return <PushSwitch state={state} />;
}
// #endregion
