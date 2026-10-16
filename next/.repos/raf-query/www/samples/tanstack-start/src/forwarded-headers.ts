import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

export const forwardedHeaders = createIsomorphicFn()
	.server((): Record<string, string> => {
		const cookie = getRequestHeader("cookie");
		return cookie === undefined ? {} : { cookie };
	})
	.client((): Record<string, string> => ({}));
