import { cleanup, screen } from "@testing-library/react";
import { Suspense, use } from "react";
import { describe, expect, it } from "vitest";

import {
	prefetch,
	QueryClient,
	QueryClientProvider,
	type QueryHandle,
	useQuery,
	useQueryClient,
} from "./index.ts";
import { HydrationBoundary } from "./rsc.tsx";
import { createBackend, mount } from "./test-utils.tsx";

describe("HydrationBoundary", () => {
	it("streams a pending server request into the browser cache without refetching", async () => {
		const backend = createBackend();
		const server = new QueryClient();
		const browser = new QueryClient();
		const handle = prefetch(server, backend.issueQuery, { id: 1 });
		function IssueTitle(props: {
			readonly handle: QueryHandle<typeof backend.issueQuery>;
		}) {
			const [issuePromise] = useQuery(backend.issueQuery, props.handle);
			const issue = use(issuePromise);
			return <p>{issue.title}</p>;
		}

		await mount(
			<QueryClientProvider client={browser}>
				<HydrationBoundary client={server}>
					<Suspense fallback={<p>Loading</p>}>
						<IssueTitle handle={handle} />
					</Suspense>
				</HydrationBoundary>
			</QueryClientProvider>,
		);
		expect(screen.getByText("Loading")).toBeDefined();
		await backend.respond();

		expect(screen.getByText("First")).toBeDefined();
		expect(backend.calls()).toBe(1);
		cleanup();
	});

	it("skips entries an earlier boundary in the same request already sent", async () => {
		const backend = createBackend();
		const server = new QueryClient();
		function Received() {
			const hashes = useQueryClient()
				.getQueryCache()
				.getAll()
				.map((query) => query.queryHash);
			return <p>{`Received ${hashes.join(" ")}`}</p>;
		}
		function boundary() {
			return (
				<QueryClientProvider client={new QueryClient()}>
					<HydrationBoundary client={server}>
						<Received />
					</HydrationBoundary>
				</QueryClientProvider>
			);
		}

		prefetch(server, backend.issueQuery, { id: 1 });
		await backend.respond();
		await mount(boundary());
		expect(screen.getByText('Received ["issue",1]')).toBeDefined();
		cleanup();

		prefetch(server, backend.issueQuery, { id: 2 });
		await backend.respond();
		await mount(boundary());
		expect(screen.getByText('Received ["issue",2]')).toBeDefined();
		cleanup();
	});
});
