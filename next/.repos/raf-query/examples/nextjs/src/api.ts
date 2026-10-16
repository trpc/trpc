import { createApi } from "@examples/api/client";
import { forwardedHeaders } from "#forwarded-headers";

export { parseFound, parseResponse } from "@examples/api/client";

/**
 * The API client. Server components call the API in this process with the
 * page request's cookies; the browser calls it over HTTP and sends its own.
 */
export const api = createApi(forwardedHeaders);
