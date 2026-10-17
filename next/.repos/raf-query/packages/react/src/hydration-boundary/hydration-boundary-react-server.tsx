import { dehydrate } from "@raf-query/core";
import { Hydrate } from "./hydrate.tsx";
import type { HydrationBoundaryProps } from "./hydration-boundary.tsx";
import { sentHashes } from "./sent.ts";

/**
 * `HydrationBoundary` in server components (the `react-server` export
 * condition). With `client`, sends the request client's entries to the
 * browser cache: pending entries cross as promises and stream in as they
 * settle, and entries an earlier boundary already sent in this request are
 * skipped. With `state`, writes that state, as the browser version does.
 */
export function HydrationBoundary(props: HydrationBoundaryProps) {
	if (props.client === undefined) {
		return (
			<Hydrate options={props.options} state={props.state}>
				{props.children}
			</Hydrate>
		);
	}
	const client = props.client;
	const state = dehydrate(client, {
		sent: sentHashes(client),
		...props.options,
	});
	return <Hydrate state={state}>{props.children}</Hydrate>;
}
