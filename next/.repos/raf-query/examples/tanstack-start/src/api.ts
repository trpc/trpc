import { createApi } from "@examples/api/client";

import { forwardedHeaders } from "./forwarded-headers.ts";

export { parseFound, parseResponse } from "@examples/api/client";

/**
 * The API client. SSR calls the API in this process with the page request's
 * cookies; the browser calls it over HTTP and sends its own.
 */
export const api = createApi(forwardedHeaders);
