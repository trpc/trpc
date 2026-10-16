import {
	LATENCY_COOKIE,
	parseLatency,
	parseStaleTime,
	STALE_TIME_COOKIE,
} from "@examples/db/types";
import type { AnyRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookies } from "@tanstack/react-start/server";

/** The settings menu's choices live in cookies, so the server renders them too. */
export const PREFETCH_COOKIE = "link-prefetch";

export const prefetchOptions = [
	{ label: "Off", value: "off" },
	{ label: "On intent", value: "intent" },
	{ label: "In viewport", value: "viewport" },
	{ label: "On render", value: "render" },
] as const;
export type Prefetch = (typeof prefetchOptions)[number]["value"];
export const DEFAULT_PREFETCH: Prefetch = "off";

/** The request's cookies on the server, the document's in the browser. */
const readCookies = createIsomorphicFn()
	.server(() => getCookies())
	.client(() =>
		Object.fromEntries(
			document.cookie
				.split("; ")
				.filter(Boolean)
				.map((cookie) => cookie.split("=", 2)),
		),
	);

export function writeCookie(name: string, value: string) {
	document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function clearCookie(name: string) {
	document.cookie = `${name}=; path=/; max-age=0`;
}

export function parsePrefetch(value: string | undefined): Prefetch {
	return (
		prefetchOptions.find((option) => option.value === value)?.value ??
		DEFAULT_PREFETCH
	);
}

export function readPrefetch() {
	return parsePrefetch(readCookies()[PREFETCH_COOKIE]);
}

/** The chosen latency, or `undefined` for the server's default. */
export function readLatency() {
	return parseLatency(readCookies()[LATENCY_COOKIE]);
}

/** The chosen stale time, or `undefined` for the app's default. */
export function readStaleTime() {
	return parseStaleTime(readCookies()[STALE_TIME_COOKIE]);
}

/** `Link` reads it while rendering, so links pick it up when they next render. */
export function toDefaultPreload(
	prefetch: Prefetch,
): AnyRouter["options"]["defaultPreload"] {
	return prefetch === "off" ? false : prefetch;
}
