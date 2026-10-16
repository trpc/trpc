/** The settings menu's choices live in cookies, so the server renders them too. */
export const PREFETCH_COOKIE = "link-prefetch";

export const prefetchOptions = [
	{ label: "Off", value: "off" },
	{ label: "In viewport", value: "viewport" },
	{ label: "On intent", value: "intent" },
] as const;
export type Prefetch = (typeof prefetchOptions)[number]["value"];
export const DEFAULT_PREFETCH: Prefetch = "off";

export function parsePrefetch(value: string | undefined): Prefetch {
	return (
		prefetchOptions.find((option) => option.value === value)?.value ??
		DEFAULT_PREFETCH
	);
}

export function writeCookie(name: string, value: string) {
	document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function clearCookie(name: string) {
	document.cookie = `${name}=; path=/; max-age=0`;
}
