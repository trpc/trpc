import { expect, test } from "@effect/vitest";
import { QueryClient } from "@raf-query/react";

import { postQuery } from "~/queries.ts";

import { postLoader } from "./testing.post-loader.ts";

const queryClient = new QueryClient();

// #region testing-loaders
test("the post loader starts both queries", async () => {
	await postLoader({
		context: { queryClient },
		params: { slug: "hello" },
	});
	expect(queryClient.getData(postQuery, { slug: "hello" })).toBeDefined();
	expect(queryClient.isFetching({ queryKey: ["comments"] })).toBe(1);
});
// #endregion
