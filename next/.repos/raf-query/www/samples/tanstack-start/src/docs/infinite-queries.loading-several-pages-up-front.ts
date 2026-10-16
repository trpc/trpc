import { QueryClient } from "@raf-query/react";
import { commentsQuery } from "~/queries.ts";

const qc = new QueryClient();

declare const slug: string;

// #region loading-several-pages-up-front
const comments = await qc.ensure(commentsQuery, { slug }, { pages: 2 });
// #endregion
