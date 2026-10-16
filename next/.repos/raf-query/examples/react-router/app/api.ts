import { createApi } from "@examples/api/client";

import { forwardedHeaders } from "./settings.ts";

export { parseFound, parseResponse } from "@examples/api/client";

/**
 * The API client. Loaders call the API in this process with the page request's
 * cookies; the browser calls it over HTTP and sends its own.
 */
export const api = createApi(forwardedHeaders);
