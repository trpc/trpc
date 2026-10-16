import { expect, test } from "@effect/vitest";
import type { QueryClient, QueryHandle } from "@raf-query/react";
import { screen } from "@testing-library/react";
import { Suspense, type ReactNode } from "react";
import { postQuery } from "~/queries.ts";

declare let queryClient: QueryClient;

declare function renderWithClient(ui: ReactNode): Promise<unknown>;

declare function Post(props: {
	handle: QueryHandle<typeof postQuery>;
}): ReactNode;

// #region testing-a-component
test("shows the post", async () => {
	const handle = queryClient.prefetch(postQuery, { slug: "hello" });

	await renderWithClient(
		<Suspense fallback="Loading…">
			<Post handle={handle} />
		</Suspense>,
	);

	expect((await screen.findByRole("heading")).textContent).toBe("Hello");
});
// #endregion
