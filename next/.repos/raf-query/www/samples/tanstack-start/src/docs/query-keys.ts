import { infiniteQueryOptions, queryOptions } from "@raf-query/react";
import { listTodos } from "~/api.ts";
import { getTodo } from "~/api.ts";
import { QueryClient } from "@raf-query/react";

declare function getSpecial(): Promise<unknown>;

// #region simple-keys
// A list of todos
infiniteQueryOptions({
	queryKey: ["todos"],
	queryFn: async () => ({
		items: await listTodos(),
		nextCursor: null,
	}),
	initialPageParam: 0,
	getNextPageParam: (lastPage) => lastPage.nextCursor,
});

// Something else, whatever!
queryOptions({
	queryKey: ["something", "special"],
	queryFn: () => getSpecial(),
});
// #endregion

declare function queryFn(): Promise<unknown>;

// #region keys-with-variables
// An individual todo
queryOptions({ queryKey: ["todo", 5], queryFn: () => getTodo(5) });

// An individual todo in a "preview" format
queryOptions({ queryKey: ["todo", 5, { preview: true }], queryFn });

// A list of todos that are "done"
infiniteQueryOptions({
	queryKey: ["todos", { status: "done" }],
	queryFn: async () => ({
		items: await queryFn(),
		nextCursor: null,
	}),
	initialPageParam: 0,
	getNextPageParam: (lastPage) => lastPage.nextCursor,
});
// #endregion

declare const status: string;

declare const page: number;

// #region keys-are-hashed-deterministically
["todos", { status, page }];
["todos", { page, status }];
["todos", { page, status, other: undefined }];
// #endregion

// #region array-order-matters
["todos", status, page];
["todos", page, status];
["todos", undefined, page, status];
// #endregion

// #region put-the-input-in-the-key
export function todosQuery(input: { status: "open" | "done"; page: number }) {
	return queryOptions({
		queryKey: ["todos", "list", input],
		queryFn: () => listTodos(input),
	});
}
// #endregion

const qc = new QueryClient();

// #region design-keys-for-invalidation
["issues", "list", { projectId: 3, status: "open" }];
["issues", "detail", 42];
["issues", "comments", 42];

await qc.invalidate({ queryKey: ["issues"] }); // all three
await qc.invalidate({ queryKey: ["issues", "list", { projectId: 3 }] }); // every list in project 3
// #endregion
