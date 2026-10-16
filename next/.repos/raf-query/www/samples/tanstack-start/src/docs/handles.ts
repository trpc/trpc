import type {
	InputOf,
	QueryHandle,
	QueryHandleWithData,
	QueryKey,
} from "@raf-query/react";
import { postQuery } from "~/queries.ts";

// #region intro
type Handle = QueryHandle<typeof postQuery>;
//   ^?
// { key: QueryKey; input: { slug: string } }

type WithData = QueryHandleWithData<typeof postQuery>;
//   ^?
// { key: QueryKey; input: { slug: string }; data: Post }

type PostInput = InputOf<typeof postQuery>; // { slug: string }
type PostKey = QueryKey; // readonly unknown[]
// #endregion
