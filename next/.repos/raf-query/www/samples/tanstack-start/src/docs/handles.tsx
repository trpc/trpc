import { useQuery } from "@raf-query/react";
import { commentsQuery, postQuery } from "~/queries.ts";
import { Route } from "~/routes/posts.$slug.tsx";

// #region typed-by-what-the-loader-did
const loaderData = Route.useLoaderData();
const [post] = useQuery(postQuery, loaderData.post); // ensured
//     ^?
const [commentsPromise] = useQuery(commentsQuery, loaderData.comments); // prefetched
//     ^?
// #endregion
