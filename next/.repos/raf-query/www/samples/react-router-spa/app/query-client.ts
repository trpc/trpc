import { QueryClient } from "@raf-query/react";

// #region query-client
// Only in a client-only app: with server rendering, a module's client would
// be shared by every request.
export const queryClient = new QueryClient({ defaults: { staleTime: 5000 } });
// #endregion query-client
