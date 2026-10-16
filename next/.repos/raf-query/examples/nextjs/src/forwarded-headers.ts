/**
 * Nothing to forward outside server components: the browser sends its
 * cookies with requests to the page's origin, and client components' server
 * render starts no request (`QueryProvider`).
 */
export function forwardedHeaders(): Record<string, string> {
	return {};
}
