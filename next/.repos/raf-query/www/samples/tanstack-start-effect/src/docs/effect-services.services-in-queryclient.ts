import { QueryClient } from "@raf-query/react";
import { IssueApiLive } from "~/issues.ts";
import { issueQuery } from "~/queries.ts";

// #region services-in-queryclient
const queryClient = new QueryClient({ layer: IssueApiLive }); // QueryClient<IssueApi>
const handle = queryClient.prefetch(issueQuery, { id: 1 });

await queryClient.dispose();
// #endregion
