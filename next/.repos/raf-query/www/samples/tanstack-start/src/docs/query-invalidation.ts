import { QueryClient } from "@raf-query/react";
import { postQuery } from "~/queries.ts";

const qc = new QueryClient();

declare const slug: string;

// #region intro
// One query
await qc.invalidate(postQuery, { slug });

// Every query whose key starts with ["posts"]
await qc.invalidate({ queryKey: ["posts"] });
// #endregion
