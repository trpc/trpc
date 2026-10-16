"use client";

import {
	applyStaleTime,
	DEFAULT_LATENCY_MS,
	DEFAULT_STALE_TIME,
	LATENCY_COOKIE,
	LoaderVerb,
	parseLatency,
	parseStaleTime,
	STALE_TIME_COOKIE,
} from "@examples/db/types";
import { NavigationProgress } from "@examples/kit/components/navigation-progress";
import { SettingsControls } from "@examples/kit/components/settings";
import { withLoaderVerb } from "@examples/kit/lib/loader-verb";
import { useQueryClient } from "@raf-query/react";
import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import {
	type ComponentProps,
	createContext,
	type ReactNode,
	use,
	useState,
	useTransition,
} from "react";

import { useStaleTimeDefaults } from "~/components/app-query-provider.tsx";
import {
	clearCookie,
	DEFAULT_PREFETCH,
	parsePrefetch,
	type Prefetch,
	PREFETCH_COOKIE,
	prefetchOptions,
	writeCookie,
} from "~/settings.ts";

const PrefetchContext = createContext<{
	readonly prefetch: Prefetch;
	readonly setPrefetch: (prefetch: Prefetch) => void;
}>({ prefetch: DEFAULT_PREFETCH, setPrefetch: () => {} });

/** Holds the prefetch setting, starting from the value in its cookie. */
export function SettingsProvider(props: {
	readonly children: ReactNode;
	readonly prefetch: Prefetch;
}) {
	const [prefetch, setPrefetch] = useState(props.prefetch);
	return (
		<PrefetchContext value={{ prefetch, setPrefetch }}>
			{props.children}
		</PrefetchContext>
	);
}

/** Settings for trying the app under different conditions. */
export function Settings(props: {
	readonly latency: number | undefined;
	readonly staleTime: number | undefined;
	readonly verb: LoaderVerb;
}) {
	const router = useRouter();
	const settings = use(PrefetchContext);
	const queryClient = useQueryClient();
	const defaults = useStaleTimeDefaults();
	const [latency, setLatency] = useState(props.latency);
	const [staleTime, setStaleTime] = useState(props.staleTime);
	const [switchingVerb, startSwitchingVerb] = useTransition();

	return (
		<>
			{switchingVerb ? <NavigationProgress /> : null}
			<SettingsControls
				latency={latency ?? DEFAULT_LATENCY_MS}
				onLatencyChange={(value) => {
					writeCookie(LATENCY_COOKIE, value);
					setLatency(parseLatency(value));
				}}
				onPrefetchChange={(value) => {
					const next = parsePrefetch(value);
					writeCookie(PREFETCH_COOKIE, next);
					settings.setPrefetch(next);
				}}
				onReset={() => {
					clearCookie(PREFETCH_COOKIE);
					clearCookie(LATENCY_COOKIE);
					clearCookie(STALE_TIME_COOKIE);
					applyStaleTime(defaults, DEFAULT_STALE_TIME);
					queryClient.clear();
					window.location.reload();
				}}
				onStaleTimeChange={(value) => {
					const next = parseStaleTime(value);
					if (next === undefined) {
						return;
					}
					writeCookie(STALE_TIME_COOKIE, value);
					applyStaleTime(defaults, next);
					setStaleTime(next);
				}}
				onVerbChange={(value) => {
					const verb = LoaderVerb.safeParse(value);
					if (verb.success) {
						startSwitchingVerb(() => {
							router.push(withLoaderVerb(location, verb.data));
						});
					}
				}}
				prefetch={settings.prefetch}
				prefetchOptions={prefetchOptions}
				staleTime={staleTime ?? DEFAULT_STALE_TIME}
				verb={props.verb}
			/>
		</>
	);
}

/**
 * `next/link`, prefetching as the settings say. Off passes `prefetch={false}`,
 * in the viewport passes `true`, and "On intent" passes `true` once the
 * pointer or focus reaches the link. Next.js only prefetches in production
 * builds.
 */
export function AppLink(props: ComponentProps<typeof Link>) {
	const { children, ...link } = props;
	const settings = use(PrefetchContext);
	const [intent, setIntent] = useState(false);

	if (settings.prefetch !== "intent") {
		return (
			<Link {...link} prefetch={settings.prefetch === "viewport"}>
				{children}
				<LinkProgress />
			</Link>
		);
	}
	const showIntent = () => {
		setIntent(true);
	};
	return (
		<Link
			{...link}
			onFocus={showIntent}
			onMouseEnter={showIntent}
			onTouchStart={showIntent}
			prefetch={intent}
		>
			{children}
			<LinkProgress />
		</Link>
	);
}

/**
 * Next.js has no app-wide navigation state, only `useLinkStatus` for the
 * `Link` it's rendered in, so every `AppLink` shows the bar while its own
 * navigation is pending.
 */
function LinkProgress() {
	const status = useLinkStatus();
	return status.pending ? <NavigationProgress /> : null;
}
