import { headers } from "next/headers";

/**
 * The page request's cookies, for server components' API calls, so the API
 * reads the same session as when the browser calls it.
 */
export async function forwardedHeaders(): Promise<Record<string, string>> {
	const cookie = (await headers()).get("cookie");
	return cookie === null ? {} : { cookie };
}
