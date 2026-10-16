import { createClient, type RequestHeaders } from "./client.ts";

export { parseFound, parseResponse } from "./client.ts";
export type { RequestHeaders } from "./client.ts";

/** Calls the API over HTTP, on the page's origin, which sends the page's cookies. */
export function createApi(headers?: RequestHeaders) {
	return createClient({ headers });
}

export const api = createApi();
