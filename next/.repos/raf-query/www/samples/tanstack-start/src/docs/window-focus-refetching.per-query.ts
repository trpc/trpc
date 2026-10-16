import { type QueryHandle, useQuery } from "@raf-query/react";
import { settingsQuery } from "~/queries.ts";

declare const loaderData: { settings: QueryHandle<typeof settingsQuery> };

// #region per-query
const [settings] = useQuery(settingsQuery, loaderData.settings, {
	refetchOnWindowFocus: false,
});
// #endregion
