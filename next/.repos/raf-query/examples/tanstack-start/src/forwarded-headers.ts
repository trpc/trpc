import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * Headers for API calls. During SSR, the page request's cookies, so the API
 * reads the same session as when the browser calls it. The browser sends its
 * own cookies.
 */
export const forwardedHeaders = createIsomorphicFn()
	.server((): Record<string, string> => {
		const cookie = getRequestHeader("cookie");
		return cookie === undefined ? {} : { cookie };
	})
	.client((): Record<string, string> => ({}));
