import {
	applyStaleTime,
	DEFAULT_LATENCY_MS,
	DEFAULT_STALE_TIME,
	LATENCY_COOKIE,
	LoaderVerb,
	parseLatency,
	parseStaleTime,
	type QueryTimeDefaults,
	STALE_TIME_COOKIE,
} from "@examples/db/types";
import { SettingsControls } from "@examples/kit/components/settings";
import { withLoaderVerb } from "@examples/kit/lib/loader-verb";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import {
	clearCookie,
	DEFAULT_PREFETCH,
	parsePrefetch,
	type Prefetch,
	PREFETCH_COOKIE,
	prefetchOptions,
	readLatency,
	readStaleTime,
	writeCookie,
} from "~/settings.ts";

/** Settings for trying the app under different conditions. */
export function Settings(props: {
	readonly onPrefetchChange: (prefetch: Prefetch) => void;
	readonly onReset: () => void;
	readonly prefetch: Prefetch;
	readonly queryDefaults: QueryTimeDefaults;
	readonly verb: LoaderVerb;
}) {
	const router = useRouter();
	const [latency, setLatency] = useState(readLatency);
	const [staleTime, setStaleTime] = useState(readStaleTime);

	return (
		<SettingsControls
			latency={latency ?? DEFAULT_LATENCY_MS}
			onLatencyChange={(value) => {
				writeCookie(LATENCY_COOKIE, value);
				setLatency(parseLatency(value));
			}}
			onPrefetchChange={(value) => {
				const prefetch = parsePrefetch(value);
				writeCookie(PREFETCH_COOKIE, prefetch);
				props.onPrefetchChange(prefetch);
			}}
			onReset={() => {
				clearCookie(PREFETCH_COOKIE);
				clearCookie(LATENCY_COOKIE);
				clearCookie(STALE_TIME_COOKIE);
				applyStaleTime(props.queryDefaults, DEFAULT_STALE_TIME);
				setLatency(undefined);
				setStaleTime(undefined);
				props.onPrefetchChange(DEFAULT_PREFETCH);
				props.onReset();
			}}
			onStaleTimeChange={(value) => {
				const next = parseStaleTime(value);
				if (next === undefined) {
					return;
				}
				writeCookie(STALE_TIME_COOKIE, value);
				applyStaleTime(props.queryDefaults, next);
				setStaleTime(next);
			}}
			onVerbChange={(value) => {
				const verb = LoaderVerb.safeParse(value);
				if (verb.success) {
					void router.navigate({ href: withLoaderVerb(location, verb.data) });
				}
			}}
			prefetch={props.prefetch}
			prefetchOptions={prefetchOptions}
			staleTime={staleTime ?? DEFAULT_STALE_TIME}
			verb={props.verb}
		/>
	);
}
