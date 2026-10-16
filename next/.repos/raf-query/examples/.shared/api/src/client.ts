import {
	type ClientResponse,
	DetailedError,
	hc,
	parseResponse,
} from "hono/client";

import type { Api } from "./app.ts";

export { parseResponse } from "hono/client";
export type { Api } from "./app.ts";

/** Headers to send with every request, read when each request starts. */
export type RequestHeaders = () =>
	| Record<string, string>
	| Promise<Record<string, string>>;

/** A typed client for the API. Responses and inputs are inferred from `app.ts`. */
export function createClient(options: {
	readonly fetch?: typeof globalThis.fetch;
	readonly headers?: RequestHeaders | undefined;
}) {
	return hc<Api>("/api", options);
}

/** Like `parseResponse`, but resolves `null` for a 404. */
export async function parseFound<T extends ClientResponse<unknown>>(
	response: Promise<T>,
) {
	try {
		return await parseResponse(response);
	} catch (error) {
		if (error instanceof DetailedError && error.statusCode === 404) {
			return null;
		}
		throw error;
	}
}
