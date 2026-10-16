import { app } from "./app.ts";
import { createClient, type RequestHeaders } from "./client.ts";

export { parseFound, parseResponse } from "./client.ts";
export type { RequestHeaders } from "./client.ts";

/**
 * Calls the API in this process, without a network round trip. Server
 * rendering uses it: a request to the server's own origin would need to know
 * the origin, and would hold a second connection while the page renders.
 * `headers` should forward the page request's `cookie` header, which the
 * browser would have sent itself.
 */
export function createApi(headers?: RequestHeaders) {
	return createClient({
		fetch: (input, init) => Promise.resolve(app.request(input, init)),
		headers,
	});
}

export const api = createApi();
