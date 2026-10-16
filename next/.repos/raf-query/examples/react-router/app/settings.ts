import {
	LATENCY_COOKIE,
	parseLatency,
	parseStaleTime,
	STALE_TIME_COOKIE,
} from "@examples/db/types";

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

/** `<Link prefetch>` for a setting. React Router calls "off" `none`. */
export function toLinkPrefetch(prefetch: Prefetch) {
	return prefetch === "off" ? "none" : prefetch;
}

/**
 * The request in scope for the current loader. Nested withRequest calls stack.
 * Client navigations leave this unset and read document.cookie instead.
 */
const requestStack: Array<Request> = [];

/** Run a loader (and its queryFns) with the request's cookies in scope. */
export function withRequest<T>(request: Request, run: () => T): T {
	requestStack.push(request);
	try {
		return run();
	} finally {
		requestStack.pop();
	}
}

function parseCookieHeader(header: string | null) {
	return Object.fromEntries(
		(header ?? "")
			.split("; ")
			.filter(Boolean)
			.map((cookie) => cookie.split("=", 2)),
	);
}

/** The request's cookies on the server, the document's in the browser. */
function readCookies() {
	const request = requestStack.at(-1);
	if (request) {
		return parseCookieHeader(request.headers.get("cookie"));
	}
	if (import.meta.env.SSR) {
		return {};
	}
	return parseCookieHeader(document.cookie);
}

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

/**
 * Headers for API calls. During SSR, the page request's cookies (via
 * {@link withRequest}), so the API reads the same session as when the browser
 * calls it. The browser sends its own cookies.
 */
export function forwardedHeaders(): Record<string, string> {
	const request = requestStack.at(-1);
	const cookie = request?.headers.get("cookie");
	return cookie ? { cookie } : {};
}
