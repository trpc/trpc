import { describe, expectTypeOf, it } from "@effect/vitest";
import type { QueryMeta as CoreQueryMeta } from "@raf-query/core";

import {
	type DehydratedQuery,
	Query,
	type QueryClientConfig,
	type QueryMeta,
	queryOptions,
} from "./index.ts";

declare module "@raf-query/react" {
	interface Register {
		queryMeta: { readonly errorMessage?: string };
	}
}

describe("Register", () => {
	it("types meta everywhere when augmented through @raf-query/react", () => {
		expectTypeOf<QueryMeta>().toEqualTypeOf<{
			readonly errorMessage?: string;
		}>();
		expectTypeOf<CoreQueryMeta>().toEqualTypeOf<QueryMeta>();
		expectTypeOf(Query.metaUnsafe).returns.toEqualTypeOf<
			QueryMeta | undefined
		>();

		queryOptions({
			meta: { errorMessage: "Couldn't load issues" },
			queryFn: (context) => context.meta?.errorMessage,
			queryKey: ["issues"],
		});
		queryOptions({
			// @ts-expect-error errorMessage is a string
			meta: { errorMessage: 1 },
			queryFn: () => 1,
			queryKey: ["issues"],
		});
		expectTypeOf<DehydratedQuery["meta"]>().toEqualTypeOf<
			QueryMeta | undefined
		>();
		expectTypeOf<
			NonNullable<QueryClientConfig["defaults"]>["meta"]
		>().toEqualTypeOf<QueryMeta | undefined>();
	});
});
